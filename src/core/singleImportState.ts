import type { ParsedSpec } from "./specParser";

export interface SingleImportFiles {
  product?: File;
  detail?: File;
  specFile?: File;
  drawing?: File;
  parsedSpec?: ParsedSpec;
  warnings?: string[];
}

export interface ExtractedSpecDocumentLike {
  drawingFile?: File;
  spec: ParsedSpec;
  warnings: string[];
}

export function missingSingleImportItems(files: SingleImportFiles): string[] {
  const missing: string[] = [];
  if (!files.product) missing.push("商品图");
  if (!files.detail) missing.push("详情图");
  if (!files.specFile) missing.push("规格书");
  else if (!files.drawing) missing.push("规格书工程图");
  return missing;
}

export function isSingleImportReady(
  files: SingleImportFiles,
): files is SingleImportFiles & { product: File; detail: File; specFile: File; drawing: File } {
  return missingSingleImportItems(files).length === 0;
}

export function markSpecDocumentParsing(files: SingleImportFiles, specFile: File): SingleImportFiles {
  return {
    ...files,
    specFile,
    drawing: undefined,
    parsedSpec: undefined,
    warnings: ["规格书已选择，正在提取工程图和 OCR，请稍候。"],
  };
}

export function markSpecDocumentExtracted(
  files: SingleImportFiles,
  specFile: File,
  extracted: ExtractedSpecDocumentLike,
): SingleImportFiles {
  return {
    ...files,
    specFile,
    drawing: extracted.drawingFile,
    parsedSpec: extracted.spec,
    warnings: extracted.warnings,
  };
}
