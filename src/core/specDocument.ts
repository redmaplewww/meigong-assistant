import { GlobalWorkerOptions, getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { cropCanvasToDominantDarkRegion } from "./imageCrop";
import { createSpecOcrCanvases } from "./specOcr";
import { parseSpecText, type ParsedSpec } from "./specParser";

GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString();

const PDF_RENDER_SCALE = 3;
const MAX_OCR_PAGES = 3;

export interface SpecDocumentExtraction {
  spec: ParsedSpec;
  drawingFile?: File;
  text: string;
  warnings: string[];
  textSource: SpecDocumentTextSource;
}

export type SpecDocumentTextSource = "pdf-text" | "ocr" | "empty";

export interface SpecDocumentProgress {
  stage: "loading" | "text-layer" | "rendering" | "ocr" | "drawing" | "parsing" | "done";
  message: string;
  percent?: number;
  currentPage?: number;
  totalPages?: number;
}

export type SpecDocumentProgressCallback = (progress: SpecDocumentProgress) => void;

export interface SpecDocumentTextInput {
  textByPage: string[];
  sourceName?: string;
  runOcr?: () => Promise<string>;
  ocrSuccessWarning?: string;
  ocrEmptyWarning?: string;
  ocrStartPercent?: number;
  parsingPercent?: number;
  onProgress?: SpecDocumentProgressCallback;
}

export interface SpecDocumentTextResult {
  spec: ParsedSpec;
  text: string;
  textSource: SpecDocumentTextSource;
  warnings: string[];
}

function fileStem(file: File): string {
  return file.name.replace(/\.[^.]+$/, "") || "specification";
}

function blobFromCanvas(canvas: HTMLCanvasElement, type = "image/png"): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("规格书页面渲染失败"))), type);
  });
}

type PdfDocument = Awaited<ReturnType<typeof getDocument>["promise"]>;

async function renderPdfPageToCanvas(pdf: PdfDocument, pageNumber: number): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context unavailable");

  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
}

async function imageFileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context unavailable");
  context.drawImage(bitmap, 0, 0);
  return canvas;
}

async function renderPdfPageToFile(pdf: PdfDocument, pageNumber: number, sourceFile: File): Promise<File> {
  const canvas = cropCanvasToDominantDarkRegion(await renderPdfPageToCanvas(pdf, pageNumber));
  const blob = await blobFromCanvas(canvas);
  return new File([blob], `${fileStem(sourceFile)}-工程图.png`, { type: "image/png" });
}

function chooseDrawingPage(textByPage: string[]): number {
  const scored = textByPage.map((text, index) => {
    const score = [/drawing/i, /dimension/i, /outline/i, /工程图/, /尺寸/, /外形/].reduce(
      (sum, pattern) => sum + (pattern.test(text) ? 1 : 0),
      0,
    );
    return { index, score };
  });
  return scored.sort((a, b) => b.score - a.score)[0]?.index ?? 0;
}

interface TesseractProgressPacket {
  status?: string;
  progress?: number;
}

async function runTesseractOcr(
  images: HTMLCanvasElement | File | Blob | Array<HTMLCanvasElement | File | Blob>,
  onProgress?: SpecDocumentProgressCallback,
  pageInfo?: { currentPage: number; totalPages: number; startPercent?: number; endPercent?: number },
): Promise<string> {
  const tesseractModule = (await import("tesseract.js")) as typeof import("tesseract.js") & {
    default?: typeof import("tesseract.js");
  };
  const createWorker = tesseractModule.createWorker ?? tesseractModule.default?.createWorker;
  const psm = tesseractModule.PSM ?? tesseractModule.default?.PSM;
  if (!createWorker) throw new Error("OCR 引擎加载失败");

  const worker = await createWorker("eng+chi_sim", undefined, {
    logger: (packet: TesseractProgressPacket) => {
      if (typeof packet.progress !== "number") return;
      const mappedPercent =
        pageInfo?.startPercent != null && pageInfo.endPercent != null
          ? Math.round(
              pageInfo.startPercent +
                ((pageInfo.currentPage - 1 + packet.progress) / pageInfo.totalPages) * (pageInfo.endPercent - pageInfo.startPercent),
            )
          : Math.round(packet.progress * 100);
      onProgress?.({
        stage: "ocr",
        message: pageInfo
          ? `OCR 识别第 ${pageInfo.currentPage}/${pageInfo.totalPages} 页：${Math.round(packet.progress * 100)}%`
          : `OCR 识别中：${Math.round(packet.progress * 100)}%`,
        percent: mappedPercent,
        currentPage: pageInfo?.currentPage,
        totalPages: pageInfo?.totalPages,
      });
    },
  });
  try {
    await worker.setParameters({
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: (psm?.SPARSE_TEXT ?? "11") as import("tesseract.js").PSM,
    });
    const imageList = Array.isArray(images) ? images : [images];
    const textByImage: string[] = [];
    for (const image of imageList) {
      const result = await worker.recognize(image);
      const text = result.data.text.trim();
      if (text) textByImage.push(text);
    }
    return textByImage.join("\n");
  } finally {
    await worker.terminate();
  }
}

async function ocrPdfPages(pdf: PdfDocument, onProgress?: SpecDocumentProgressCallback): Promise<string> {
  const pageCount = Math.min(pdf.numPages, MAX_OCR_PAGES);
  const pageTexts: string[] = [];
  const ocrStartPercent = 34;
  const ocrEndPercent = 82;

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const pageStartPercent = Math.round(32 + ((pageNumber - 1) / pageCount) * (ocrEndPercent - 32));
    onProgress?.({
      stage: "rendering",
      message: `正在渲染第 ${pageNumber}/${pageCount} 页用于 OCR`,
      percent: pageStartPercent,
      currentPage: pageNumber,
      totalPages: pageCount,
    });
    const canvas = await renderPdfPageToCanvas(pdf, pageNumber);
    onProgress?.({
      stage: "ocr",
      message: `开始 OCR 识别第 ${pageNumber}/${pageCount} 页`,
      percent: Math.round(ocrStartPercent + ((pageNumber - 1) / pageCount) * (ocrEndPercent - ocrStartPercent)),
      currentPage: pageNumber,
      totalPages: pageCount,
    });
    const text = await runTesseractOcr(createSpecOcrCanvases(canvas), onProgress, {
      currentPage: pageNumber,
      totalPages: pageCount,
      startPercent: ocrStartPercent,
      endPercent: ocrEndPercent,
    });
    if (text) pageTexts.push(text);
  }

  return pageTexts.join("\n");
}

export async function parseSpecDocumentText(input: SpecDocumentTextInput): Promise<SpecDocumentTextResult> {
  let text = input.textByPage.join("\n").trim();
  let textSource: SpecDocumentTextSource = text ? "pdf-text" : "empty";
  const warnings: string[] = [];

  if (!text && input.runOcr) {
    try {
      input.onProgress?.({ stage: "ocr", message: "未发现可读取文本层，开始 OCR 识别", percent: input.ocrStartPercent ?? 0 });
      text = (await input.runOcr()).trim();
      input.onProgress?.({ stage: "parsing", message: "OCR 识别完成，正在解析参数", percent: input.parsingPercent ?? 100 });
      if (text) {
        textSource = "ocr";
        warnings.push(input.ocrSuccessWarning ?? "PDF 无可读取文本层，已使用 OCR 识别参数。");
      } else {
        warnings.push(input.ocrEmptyWarning ?? "OCR 未识别到可填充文字，请手动补充参数。");
      }
    } catch (error) {
      warnings.push(`OCR 识别失败：${error instanceof Error ? error.message : "未知错误"}。`);
    }
  }

  const spec = parseSpecText(text, input.sourceName);
  const specWarnings = textSource === "ocr" ? spec.warnings.filter((warning) => !warning.includes("没有可读取文本层")) : spec.warnings;

  return {
    spec,
    text,
    textSource,
    warnings: [...warnings, ...specWarnings],
  };
}

export interface ExtractSpecDocumentOptions {
  onProgress?: SpecDocumentProgressCallback;
}

async function extractPdfSpec(file: File, options: ExtractSpecDocumentOptions = {}): Promise<SpecDocumentExtraction> {
  options.onProgress?.({ stage: "loading", message: "正在读取 PDF 文件", percent: 2 });
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocument({ data }).promise;
  options.onProgress?.({ stage: "text-layer", message: `PDF 共 ${pdf.numPages} 页，正在检查文本层`, percent: 8, totalPages: pdf.numPages });
  const textByPage: string[] = [];

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    options.onProgress?.({
      stage: "text-layer",
      message: `正在读取第 ${pageIndex}/${pdf.numPages} 页文本层`,
      percent: Math.round(8 + (pageIndex / pdf.numPages) * 22),
      currentPage: pageIndex,
      totalPages: pdf.numPages,
    });
    const page = await pdf.getPage(pageIndex);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
      .filter(Boolean)
      .join("\n");
    textByPage.push(pageText);
  }

  const parsed = await parseSpecDocumentText({
    textByPage,
    sourceName: file.name,
    runOcr: textByPage.join("\n").trim() ? undefined : () => ocrPdfPages(pdf, options.onProgress),
    ocrStartPercent: 32,
    parsingPercent: 84,
    onProgress: options.onProgress,
  });
  options.onProgress?.({ stage: "drawing", message: "正在提取工程图页面", percent: 88 });
  const drawingFile = await renderPdfPageToFile(pdf, chooseDrawingPage(textByPage) + 1, file);
  const warnings = [...parsed.warnings];
  if (pdf.numPages > MAX_OCR_PAGES && parsed.textSource === "ocr") warnings.push(`OCR 已优先识别前 ${MAX_OCR_PAGES} 页。`);

  options.onProgress?.({ stage: "done", message: "规格书解析完成", percent: 100 });
  return { spec: parsed.spec, drawingFile, text: parsed.text, warnings, textSource: parsed.textSource };
}

export async function extractSpecDocument(file: File, options: ExtractSpecDocumentOptions = {}): Promise<SpecDocumentExtraction> {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    return extractPdfSpec(file, options);
  }

  if (/^image\//i.test(file.type)) {
    options.onProgress?.({ stage: "loading", message: "正在读取图片规格书", percent: 5 });
    const parsed = await parseSpecDocumentText({
      textByPage: [""],
      sourceName: file.name,
      runOcr: async () =>
        runTesseractOcr(createSpecOcrCanvases(await imageFileToCanvas(file)), options.onProgress, {
          currentPage: 1,
          totalPages: 1,
          startPercent: 20,
          endPercent: 82,
        }),
      ocrStartPercent: 12,
      parsingPercent: 88,
      ocrSuccessWarning: "图片规格书已使用 OCR 识别参数。",
      ocrEmptyWarning: "图片规格书已作为工程图导入，但 OCR 未识别到可填充文字，请手动补充参数。",
      onProgress: options.onProgress,
    });
    options.onProgress?.({ stage: "done", message: "图片规格书解析完成", percent: 100 });
    return { spec: parsed.spec, drawingFile: file, text: parsed.text, warnings: parsed.warnings, textSource: parsed.textSource };
  }

  throw new Error("仅支持 PDF、PNG、JPG、WEBP 规格书。");
}
