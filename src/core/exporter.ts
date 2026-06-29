import JSZip from "jszip";
import { formatExportName, renderTemplateToBlob } from "./renderer";
import type { Sku, Template } from "./types";

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function exportTemplate(template: Template, sku: Sku, format: "png" | "jpg"): Promise<void> {
  const blob = await renderTemplateToBlob(template, format);
  downloadBlob(formatExportName(sku.model, template.kind, format), blob);
}

export async function exportSkuZip(sku: Sku, templates: Template[]): Promise<Blob> {
  const zip = new JSZip();

  for (const template of templates) {
    const format = template.kind === "detail" ? "jpg" : "png";
    const blob = await renderTemplateToBlob(template, format);
    zip.file(formatExportName(sku.model, template.kind, format), blob);
  }

  return zip.generateAsync({ type: "blob" });
}

export async function exportAllSkuZip(items: Array<{ sku: Sku; templates: Template[] }>): Promise<Blob> {
  const zip = new JSZip();

  for (const item of items) {
    const folder = zip.folder(item.sku.model.replace(/[\\/]+/g, "-"));
    if (!folder) continue;

    for (const template of item.templates) {
      const format = template.kind === "detail" ? "jpg" : "png";
      const blob = await renderTemplateToBlob(template, format);
      folder.file(formatExportName(item.sku.model, template.kind, format), blob);
    }
  }

  return zip.generateAsync({ type: "blob" });
}
