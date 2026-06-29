import { describe, expect, it } from "vitest";
import {
  buildSkuCatalogFromPaths,
  classifyAssetPath,
  inferSkuMetadata,
} from "./catalog";

const samplePaths = [
  "3.5-SMP/KK/T.png",
  "3.5-SMP/KK/1.png",
  "3.5-SMP/KK/2.png",
  "3.5-SMP/KK/3.png",
  "3.5-SMP/KK/4.png",
  "3.5-SMP/KK/5.png",
  "3.5-SMP/KK/images/3_01.jpg",
  "3.5-SMP/KK/images/3_02.jpg",
  "3.5-SMP/KK/images/3_07.jpg",
  "3.5-SMP/JK/T.png",
  "3.5-SMP/JK/3.png",
  "3.5-SMP/JK/images/3_01.jpg",
];

describe("SKU catalog import", () => {
  it("classifies product, drawing, page, and detail assets by path", () => {
    expect(classifyAssetPath("3.5-SMP/KK/T.png")).toBe("product-transparent");
    expect(classifyAssetPath("3.5-SMP/KK/3.png")).toBe("drawing");
    expect(classifyAssetPath("3.5-SMP/KK/5.png")).toBe("product-photo");
    expect(classifyAssetPath("3.5-SMP/KK/images/3_02.jpg")).toBe("detail-slice");
  });

  it("infers connector metadata from the family and variant folder", () => {
    expect(inferSkuMetadata("3.5-SMP", "KK")).toMatchObject({
      code: "KK",
      model: "3.5/SMP-KKG",
      title: "3.5母头-SMP母头 转接器",
      subtitle: "Radio Frequency Coaxial Adapter",
      frequency: "DC~26.5GHz",
      vswr: "≤1.2",
    });

    expect(inferSkuMetadata("3.5-SMP", "JJ").shortSpec).toBe("3.5公头-SMP公头");
  });

  it("builds sorted SKU records with stable asset roles", () => {
    const catalog = buildSkuCatalogFromPaths(samplePaths);

    expect(catalog.map((sku) => sku.code)).toEqual(["JK", "KK"]);
    expect(catalog[1].assets.productTransparent?.path).toBe("3.5-SMP/KK/T.png");
    expect(catalog[1].assets.drawing?.path).toBe("3.5-SMP/KK/3.png");
    expect(catalog[1].assets.detailSlices.map((asset) => asset.path)).toEqual([
      "3.5-SMP/KK/images/3_01.jpg",
      "3.5-SMP/KK/images/3_02.jpg",
      "3.5-SMP/KK/images/3_07.jpg",
    ]);
  });
});
