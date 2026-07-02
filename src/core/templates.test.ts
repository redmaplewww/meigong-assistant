import { describe, expect, it } from "vitest";
import { inferSkuMetadata } from "./catalog";
import {
  createDefaultProject,
  createTemplateSuite,
  mergeLayerPatch,
  validateTemplate,
} from "./templates";

const sku = {
  ...inferSkuMetadata("3.5-SMP", "KK"),
  assets: {
    productTransparent: {
      id: "asset-product",
      type: "product-transparent" as const,
      name: "T.png",
      path: "3.5-SMP/KK/T.png",
      url: "/3.5-SMP/KK/T.png",
    },
    productPhotos: [],
    drawing: {
      id: "asset-drawing",
      type: "drawing" as const,
      name: "3.png",
      path: "3.5-SMP/KK/3.png",
      url: "/3.5-SMP/KK/3.png",
    },
    detailSlices: [],
  },
};

describe("Waiyii Blue Industrial templates", () => {
  it("creates the required editable template suite with deterministic export sizes", () => {
    const project = createDefaultProject();
    const suite = createTemplateSuite(project, sku);

    expect(suite.templates.map((template) => template.kind)).toEqual([
      "hero",
      "specs",
      "drawing",
      "service",
      "white",
      "detail",
    ]);
    expect(suite.exportPresets.map((preset) => preset.id)).toEqual([
      "square-png",
      "square-jpg",
      "detail-jpg",
      "sku-zip",
    ]);
    expect(suite.templates[0].canvas).toEqual({ width: 1440, height: 1440 });
    expect(suite.templates[5].canvas.width).toBe(960);
  });

  it("keeps AI generation out of renderable layers", () => {
    const hero = createTemplateSuite(createDefaultProject(), sku).templates[0];

    expect(hero.layers.some((layer) => layer.source === "ai-generated")).toBe(false);
    expect(hero.layers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "product-main",
          type: "image",
          assetRole: "productTransparent",
          editable: true,
        }),
        expect.objectContaining({
          id: "hero-title",
          type: "text",
          text: "3.5母头-SMP母头 转接器",
        }),
      ]),
    );
  });

  it("merges layer patches without mutating the template", () => {
    const hero = createTemplateSuite(createDefaultProject(), sku).templates[0];
    const changed = mergeLayerPatch(hero, "product-main", {
      x: 190,
      scale: 0.86,
      rotation: -3,
    });

    expect(changed.layers.find((layer) => layer.id === "product-main")).toMatchObject({
      x: 190,
      scale: 0.86,
      rotation: -3,
    });
    expect(hero.layers.find((layer) => layer.id === "product-main")).not.toMatchObject({
      x: 190,
    });
  });

  it("validates missing required assets and text overflow risk", () => {
    const suite = createTemplateSuite(createDefaultProject(), {
      ...sku,
      title: "超长产品标题超长产品标题超长产品标题超长产品标题超长产品标题超长产品标题",
      assets: { ...sku.assets, productTransparent: undefined },
    });

    const issues = validateTemplate(suite.templates[0]);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: "error", code: "missing-product-image" }),
        expect.objectContaining({ severity: "warning", code: "text-overflow-risk" }),
      ]),
    );
  });

  it("checks text overflow per line so manual line breaks do not create false warnings", () => {
    const hero = createTemplateSuite(createDefaultProject(), sku).templates[0];
    const issues = validateTemplate(hero);

    expect(issues).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "text-overflow-risk", layerId: "invoice-text" })]),
    );
  });

  it("uses the dedicated detail image in the detail template instead of the main product image", () => {
    const detailSku = {
      ...sku,
      assets: {
        ...sku.assets,
        detailSlices: [
          {
            id: "asset-detail",
            type: "detail-slice" as const,
            name: "detail.jpg",
            path: "3.5-SMP/KK/detail/detail.jpg",
            url: "/3.5-SMP/KK/detail/detail.jpg",
          },
        ],
      },
    };
    const detailTemplate = createTemplateSuite(createDefaultProject(), detailSku).templates.find((template) => template.kind === "detail");
    const detailProductLayer = detailTemplate?.layers.find((layer) => layer.id === "detail-product");

    expect(detailProductLayer).toMatchObject({
      type: "image",
      assetRole: "detailSlices",
      assetId: "asset-detail",
      imageUrl: "/3.5-SMP/KK/detail/detail.jpg",
    });
  });
});
