import { describe, expect, it } from "vitest";
import { inferSkuMetadata } from "./catalog";
import { applyAssistantDraftToTemplate, createAssistantDraft } from "./aiAssistant";
import { createDefaultMaterialLibrary } from "./materials";
import { createDefaultProject, createTemplateSuite } from "./templates";
import type { Sku } from "./types";

const sku: Sku = {
  ...inferSkuMetadata("3.5-SMP", "KK"),
  assets: {
    productTransparent: {
      id: "product",
      type: "product-transparent",
      name: "T.png",
      path: "T.png",
      url: "/T.png",
    },
    productPhotos: [],
    drawing: {
      id: "drawing",
      type: "drawing",
      name: "drawing.png",
      path: "drawing.png",
      url: "/drawing.png",
    },
    detailSlices: [],
  },
};

describe("AI assistant draft planner", () => {
  it("turns natural language into deterministic material and layout changes", () => {
    const materials = createDefaultMaterialLibrary();
    const draft = createAssistantDraft("深蓝底板 产品放大 标题醒目 工程图更大 全部 SKU", {
      materials,
      currentSelection: { "bottom-board": "bottom-board-classic" },
      sku,
      scope: "all-skus",
    });

    expect(draft.materialSelection["bottom-board"]).toBe("bottom-board-deep");
    expect(draft.templatePatches["hero-main"]["product-main"]).toMatchObject({
      width: 1316,
      height: 650,
    });
    expect(draft.templatePatches["drawing-size"]["drawing-image"]).toMatchObject({
      width: 1268,
    });
    expect(draft.actions.length).toBeGreaterThan(2);
  });

  it("creates a deep red board variant instead of falling back to blue", () => {
    const materials = createDefaultMaterialLibrary();
    const draft = createAssistantDraft("深红底板 产品放大 标题醒目 全部 SKU", {
      materials,
      currentSelection: { "bottom-board": "bottom-board-classic" },
      sku,
      scope: "all-skus",
    });

    expect(draft.materialSelection["bottom-board"]).toBe("ai-bottom-board-deep-red");
    expect(draft.materialCreations).toHaveLength(1);
    expect(draft.materialCreations[0]).toMatchObject({
      slot: "bottom-board",
      fromMaterialId: "bottom-board-deep",
      name: "深红斜切底板",
    });
    expect(draft.materialSelection["bottom-board"]).not.toBe("bottom-board-deep");
  });

  it("applies assistant patches without replacing real product assets", () => {
    const suite = createTemplateSuite(createDefaultProject(), sku);
    const hero = suite.templates.find((template) => template.id === "hero-main")!;
    const draft = createAssistantDraft("产品放大 标题醒目", {
      materials: createDefaultMaterialLibrary(),
      currentSelection: {},
      sku,
      scope: "current-sku",
    });

    const changed = applyAssistantDraftToTemplate(hero, draft);
    const changedProduct = changed.layers.find((layer) => layer.id === "product-main");
    expect(changedProduct).toMatchObject({
      assetRole: "productTransparent",
    });
    expect(changedProduct?.width).toBeLessThanOrEqual(1316);
    expect(changedProduct?.width).toBeGreaterThan(1000);
    expect(hero.layers.find((layer) => layer.id === "product-main")).not.toMatchObject({
      width: 1316,
    });
  });

  it("turns a unified red color request into theme, material, and table color changes", () => {
    const materials = createDefaultMaterialLibrary();
    const suite = createTemplateSuite(createDefaultProject(), sku);
    const draft = createAssistantDraft("配色统一改成红色，商品名尺寸合适，产品图不要盖字", {
      materials,
      currentSelection: {
        "bottom-board": "bottom-board-classic",
        "spec-pill": "spec-pill-blue",
        "service-tile": "service-tile-blue",
        "search-strip": "search-strip-blue",
        logo: "logo-wayiii-classic",
      },
      sku,
      scope: "all-skus",
      templates: suite.templates,
    });

    expect(draft.theme?.id).toBe("red");
    expect(draft.materialSelection["spec-pill"]).toBe("ai-spec-pill-red");
    expect(draft.materialSelection["service-tile"]).toBe("ai-service-tile-red");
    expect(draft.materialSelection["search-strip"]).toBe("ai-search-strip-red");
    expect(draft.materialCreations.map((creation) => creation.slot)).toEqual(
      expect.arrayContaining(["bottom-board", "spec-pill", "service-tile", "search-strip", "logo"]),
    );
    expect(draft.templateCreations).toHaveLength(0);
    expect(draft.templatePatches["spec-table"]["specs-table"]).toMatchObject({
      headerFill: "#b51e2c",
      stripeFill: "#f5d9de",
      textColor: "#4f0b15",
    });
  });
});
