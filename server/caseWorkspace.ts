import type { Connect } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface CaseWorkspaceFilePayload {
  role?: string;
  kind?: string;
  fileName: string;
  mimeType: string;
  dataUrl: string;
}

export interface SaveCaseWorkspaceRequest {
  skuModel: string;
  inputs: CaseWorkspaceFilePayload[];
  outputs: CaseWorkspaceFilePayload[];
  metadata?: Record<string, unknown>;
}

export interface SaveCaseWorkspaceOptions extends SaveCaseWorkspaceRequest {
  outputRoot: string;
  openFolder?: (folderPath: string) => Promise<void> | void;
}

export interface SaveCaseWorkspaceResult {
  caseFolderPath: string;
  outputCount: number;
  inputCount: number;
}

export interface CaseWorkspacePluginOptions {
  outputRoot: string;
  openFolder?: (folderPath: string) => Promise<void> | void;
}

const inputRoleFolders: Record<string, string> = {
  product: "商品图",
  detail: "详情图",
  "spec-document": "规格书",
  drawing: "工程图",
};

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function readJsonBody(req: IncomingMessage, maxBytes = 80_000_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
      if (body.length > maxBytes) {
        reject(new Error("案例文件过大，请减少图片数量或降低导出尺寸后重试。"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("案例保存请求不是有效 JSON。"));
      }
    });
    req.on("error", reject);
  });
}

function safePathSegment(value: string, fallback: string): string {
  const cleaned = value
    .trim()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5._-]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (cleaned || fallback).slice(0, 90);
}

function safeFileName(value: string, fallback: string): string {
  const cleaned = value
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (cleaned || fallback).slice(0, 120);
}

function decodeDataUrl(dataUrl: string): Buffer {
  const match = /^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/i.exec(dataUrl);
  if (!match) throw new Error("文件内容不是有效 data URL。");
  return Buffer.from(match[2], "base64");
}

function inputFolderFor(file: CaseWorkspaceFilePayload): string {
  const role = file.role ?? "other";
  return inputRoleFolders[role] ?? "其他素材";
}

async function writePayloadFile(baseFolder: string, file: CaseWorkspaceFilePayload, fallbackName: string): Promise<string> {
  const filePath = join(baseFolder, safeFileName(file.fileName, fallbackName));
  await writeFile(filePath, decodeDataUrl(file.dataUrl));
  return filePath;
}

export async function saveCaseWorkspace(options: SaveCaseWorkspaceOptions): Promise<SaveCaseWorkspaceResult> {
  const skuSegment = safePathSegment(options.skuModel, "AUTO-SKU");
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  const caseFolderPath = join(options.outputRoot, `${skuSegment}-${timestamp}`);
  const inputRoot = join(caseFolderPath, "输入素材");
  const outputFolder = join(caseFolderPath, "成品图");

  await mkdir(inputRoot, { recursive: true });
  await mkdir(outputFolder, { recursive: true });

  for (const [index, file] of options.inputs.entries()) {
    const folder = join(inputRoot, inputFolderFor(file));
    await mkdir(folder, { recursive: true });
    await writePayloadFile(folder, file, `input-${index + 1}`);
  }

  for (const [index, file] of options.outputs.entries()) {
    await writePayloadFile(outputFolder, file, `output-${index + 1}`);
  }

  await writeFile(
    join(caseFolderPath, "case.json"),
    JSON.stringify(
      {
        skuModel: options.skuModel,
        createdAt: new Date().toISOString(),
        inputs: options.inputs.map(({ role, fileName, mimeType }) => ({ role, fileName, mimeType })),
        outputs: options.outputs.map(({ kind, fileName, mimeType }) => ({ kind, fileName, mimeType })),
        metadata: options.metadata ?? {},
      },
      null,
      2,
    ),
    "utf8",
  );

  await options.openFolder?.(caseFolderPath);
  return { caseFolderPath, inputCount: options.inputs.length, outputCount: options.outputs.length };
}

export async function handleSaveCaseWorkspace(
  req: IncomingMessage,
  res: ServerResponse,
  options: CaseWorkspacePluginOptions,
): Promise<void> {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "仅支持 POST。" });
    return;
  }

  try {
    const body = await readJsonBody(req) as Partial<SaveCaseWorkspaceRequest>;
    if (!body.skuModel || !Array.isArray(body.outputs)) {
      sendJson(res, 400, { error: "缺少 SKU 型号或成品图数据。" });
      return;
    }
    const result = await saveCaseWorkspace({
      outputRoot: options.outputRoot,
      openFolder: options.openFolder,
      skuModel: body.skuModel,
      inputs: Array.isArray(body.inputs) ? body.inputs : [],
      outputs: body.outputs,
      metadata: body.metadata,
    });
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : "案例文件夹保存失败。" });
  }
}

export function caseWorkspacePlugin(options: CaseWorkspacePluginOptions) {
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    if (!req.url?.startsWith("/api/save-case-workspace")) {
      next();
      return;
    }

    handleSaveCaseWorkspace(req, res, options).catch((error) => {
      sendJson(res, 500, { error: error instanceof Error ? error.message : "案例文件夹保存失败。" });
    });
  };

  return {
    name: "case-workspace",
    configureServer(server: { middlewares: Connect.Server }) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server: { middlewares: Connect.Server }) {
      server.middlewares.use(handler);
    },
  };
}
