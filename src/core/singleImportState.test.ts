import { describe, expect, it } from "vitest";
import { isSingleImportReady, markSpecDocumentExtracted, markSpecDocumentParsing, missingSingleImportItems } from "./singleImportState";

describe("single import state", () => {
  it("shows the specification file immediately while OCR is still running", () => {
    const specFile = new File(["pdf"], "spec.pdf", { type: "application/pdf" });
    const next = markSpecDocumentParsing({}, specFile);

    expect(next.specFile?.name).toBe("spec.pdf");
    expect(next.warnings).toContain("规格书已选择，正在提取工程图和 OCR，请稍候。");
    expect(missingSingleImportItems(next)).toEqual(["商品图", "详情图", "规格书工程图"]);
  });

  it("keeps product and detail selections when a slow specification OCR finishes later", () => {
    const product = new File(["product"], "product.png", { type: "image/png" });
    const detail = new File(["detail"], "detail.jpg", { type: "image/jpeg" });
    const specFile = new File(["pdf"], "spec.pdf", { type: "application/pdf" });
    const drawing = new File(["drawing"], "spec-drawing.png", { type: "image/png" });

    const latestUserSelection = { product, detail, specFile };
    const next = markSpecDocumentExtracted(latestUserSelection, specFile, {
      drawingFile: drawing,
      spec: { model: "RF-18G", parameters: [], warnings: [] },
      warnings: [],
    });

    expect(next.product).toBe(product);
    expect(next.detail).toBe(detail);
    expect(next.drawing).toBe(drawing);
    expect(isSingleImportReady(next)).toBe(true);
  });
});
