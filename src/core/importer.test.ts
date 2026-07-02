import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSkuCatalogFromPaths } from "./catalog";
import { attachAssetUrls, buildCatalogFromSingleAssets } from "./importer";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("asset URL import helpers", () => {
  it("attaches browser URLs to matching assets without mutating the catalog", () => {
    const catalog = buildSkuCatalogFromPaths(["3.5-SMP/KK/T.png", "3.5-SMP/KK/3.png"]);
    const updated = attachAssetUrls(
      catalog,
      new Map([
        ["3.5-SMP/KK/T.png", "blob:product"],
        ["3.5-SMP/KK/3.png", "blob:drawing"],
      ]),
    );

    expect(updated[0].assets.productTransparent?.url).toBe("blob:product");
    expect(updated[0].assets.drawing?.url).toBe("blob:drawing");
    expect(catalog[0].assets.productTransparent?.url).toBe("/3.5-SMP/KK/T.png");
  });

  it("imports product and detail only without inventing a drawing asset", () => {
    const createObjectURL = vi.fn((file: File) => `blob:${file.name}`);
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    const product = new File(["product"], "sma-product.png", { type: "image/png" });
    const detail = new File(["detail"], "sma-detail.jpg", { type: "image/jpeg" });
    const imported = buildCatalogFromSingleAssets({ productFile: product, detailFile: detail });

    expect(imported.catalog).toHaveLength(1);
    expect(imported.catalog[0].code).toBe("AUTO-SKU");
    expect(imported.catalog[0].assets.productTransparent?.type).toBe("product-transparent");
    expect(imported.catalog[0].assets.productTransparent?.path).toContain("/product/");
    expect(imported.catalog[0].assets.productTransparent?.url).toBe("blob:sma-product.png");
    expect(imported.catalog[0].assets.detailSlices[0].type).toBe("detail-slice");
    expect(imported.catalog[0].assets.detailSlices[0].path).toContain("/detail/");
    expect(imported.catalog[0].assets.detailSlices[0].url).toBe("blob:sma-detail.jpg");
    expect(imported.catalog[0].assets.drawing).toBeUndefined();

    imported.revoke();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:sma-product.png");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:sma-detail.jpg");
  });

  it("imports product, detail and OCR drawing as separate typed assets", () => {
    const createObjectURL = vi.fn((file: File) => `blob:${file.name}`);
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    const product = new File(["product"], "main-product.png", { type: "image/png" });
    const detail = new File(["detail"], "detail-product.jpg", { type: "image/jpeg" });
    const drawing = new File(["drawing"], "spec-drawing.png", { type: "image/png" });
    const imported = buildCatalogFromSingleAssets({
      productFile: product,
      detailFile: detail,
      drawingFile: drawing,
      spec: {
        model: "2210-MM1-18-1(SMA-SSMP-JJG)",
        frequency: "DC~18GHz",
        vswr: "≤1.25",
        parameters: [{ label: "阻抗", value: "50Ω" }],
        warnings: [],
      },
    });

    expect(imported.catalog).toHaveLength(1);
    expect(imported.catalog[0]).toMatchObject({
      code: "2210-MM1-18-1(SMA-SSMP-JJG)",
      model: "2210-MM1-18-1(SMA-SSMP-JJG)",
      frequency: "DC~18GHz",
      vswr: "≤1.25",
    });
    expect(imported.catalog[0].assets.productTransparent?.path).toContain("/product/");
    expect(imported.catalog[0].assets.productTransparent?.url).toBe("blob:main-product.png");
    expect(imported.catalog[0].assets.detailSlices).toHaveLength(1);
    expect(imported.catalog[0].assets.detailSlices[0].path).toContain("/detail/");
    expect(imported.catalog[0].assets.detailSlices[0].url).toBe("blob:detail-product.jpg");
    expect(imported.catalog[0].assets.drawing?.path).toContain("/drawing/");
    expect(imported.catalog[0].assets.drawing?.url).toBe("blob:spec-drawing.png");
    expect(imported.catalog[0].parameters[0]).toEqual({ label: "型号", value: "2210-MM1-18-1(SMA-SSMP-JJG)" });
    expect(imported.catalog[0].parameters).toContainEqual({ label: "阻抗", value: "50Ω" });

    imported.revoke();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:main-product.png");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:detail-product.jpg");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:spec-drawing.png");
  });
});
