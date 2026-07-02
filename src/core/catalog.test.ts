import { describe, expect, it } from "vitest";
import {
  buildSkuCatalogFromPaths,
  classifyExplicitAssetPath,
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

  it("uses explicit type folders for uploaded SKU assets", () => {
    expect(classifyExplicitAssetPath("客户资料/3.5-SMP/KK/商品图/随便命名.png")).toBe("product-transparent");
    expect(classifyExplicitAssetPath("客户资料/3.5-SMP/KK/工程图/随便命名.png")).toBe("drawing");
    expect(classifyExplicitAssetPath("客户资料/3.5-SMP/KK/详情图/01.jpg")).toBe("detail-slice");
    expect(classifyExplicitAssetPath("客户资料/3.5-SMP/KK/实拍图/角度1.jpg")).toBe("product-photo");
    expect(classifyExplicitAssetPath("客户资料/3.5-SMP/KK/T.png")).toBeUndefined();

    const catalog = buildSkuCatalogFromPaths([
      "客户资料/3.5-SMP/KK/商品图/随便命名.png",
      "客户资料/3.5-SMP/KK/工程图/尺寸.png",
      "客户资料/3.5-SMP/KK/详情图/01.jpg",
      "客户资料/3.5-SMP/KK/实拍图/角度1.jpg",
      "客户资料/3.5-SMP/JJ/商品图/主图.png",
    ], { assetMode: "typed-folders" });

    expect(catalog.map((sku) => sku.code)).toEqual(["JJ", "KK"]);
    expect(catalog.find((sku) => sku.code === "KK")?.family).toBe("3.5-SMP");
    expect(catalog.find((sku) => sku.code === "KK")?.assets.productTransparent?.path).toBe("客户资料/3.5-SMP/KK/商品图/随便命名.png");
    expect(catalog.find((sku) => sku.code === "KK")?.assets.drawing?.path).toBe("客户资料/3.5-SMP/KK/工程图/尺寸.png");
    expect(catalog.find((sku) => sku.code === "KK")?.assets.detailSlices.map((asset) => asset.path)).toEqual([
      "客户资料/3.5-SMP/KK/详情图/01.jpg",
    ]);
    expect(catalog.find((sku) => sku.code === "KK")?.assets.productPhotos.map((asset) => asset.path)).toEqual([
      "客户资料/3.5-SMP/KK/实拍图/角度1.jpg",
    ]);
  });

  it("does not infer uploaded asset roles from filenames in explicit folder mode", () => {
    const catalog = buildSkuCatalogFromPaths([
      "客户资料/3.5-SMP/KK/T.png",
      "客户资料/3.5-SMP/KK/3.png",
      "客户资料/3.5-SMP/KK/1.png",
    ], { assetMode: "typed-folders" });

    expect(catalog).toHaveLength(0);
  });

  it("keeps legacy filename support for bundled sample assets", () => {
    expect(classifyAssetPath("3.5-SMP/KK/透明商品图.png")).toBe("product-transparent");
    expect(classifyAssetPath("3.5-SMP/KK/product-main.png")).toBe("product-transparent");
    expect(classifyAssetPath("3.5-SMP/KK/工程图.png")).toBe("drawing");
    expect(classifyAssetPath("3.5-SMP/KK/详情/01.jpg")).toBe("detail-slice");
  });

  it("uses the first product photo as the main product image when no transparent image exists", () => {
    const catalog = buildSkuCatalogFromPaths([
      "3.5-SMP/KK/1.png",
      "3.5-SMP/KK/2.png",
      "3.5-SMP/KK/3.png",
    ]);

    expect(catalog[0].assets.productTransparent?.path).toBe("3.5-SMP/KK/1.png");
    expect(catalog[0].assets.drawing?.path).toBe("3.5-SMP/KK/3.png");
    expect(catalog[0].assets.productPhotos.map((asset) => asset.path)).toEqual(["3.5-SMP/KK/2.png"]);
  });
});
