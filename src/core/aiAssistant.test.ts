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

  it("treats a red board request as theme color instead of creating a material variant", () => {
    const materials = createDefaultMaterialLibrary();
    const suite = createTemplateSuite(createDefaultProject(), sku);
    const draft = createAssistantDraft("深红底板 产品放大 标题醒目 全部 SKU", {
      materials,
      currentSelection: { "bottom-board": "bottom-board-classic" },
      sku,
      scope: "all-skus",
      templates: suite.templates,
    });

    expect(draft.theme?.id).toBe("red");
    expect(draft.materialSelection["bottom-board"]).toBe("bottom-board-classic");
    expect(draft.materialCreations).toHaveLength(0);
    expect(draft.templatePatches["hero-main"]["bottom-board"]).toMatchObject({
      colorReplacements: expect.arrayContaining([{ from: "#0b70b7", to: "#b51e2c" }]),
    });
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

  it("turns a unified red color request into theme and color patches without touching materials", () => {
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
    expect(draft.materialSelection).toMatchObject({
      "bottom-board": "bottom-board-classic",
      "spec-pill": "spec-pill-blue",
      "service-tile": "service-tile-blue",
      "search-strip": "search-strip-blue",
      logo: "logo-wayiii-classic",
    });
    expect(draft.materialCreations).toHaveLength(0);
    expect(draft.templateCreations).toHaveLength(0);
    expect(draft.templatePatches["hero-main"]["spec-pill"]).toMatchObject({
      colorReplacements: expect.arrayContaining([{ from: "#0b70b7", to: "#b51e2c" }]),
    });
    expect(draft.templatePatches["service-promise"]["service-tile-0"]).toMatchObject({
      colorReplacements: expect.arrayContaining([{ from: "#0b70b7", to: "#b51e2c" }]),
    });
    expect(draft.templatePatches["detail-page"]["detail-search"]).toMatchObject({
      colorReplacements: expect.arrayContaining([{ from: "#0b70b7", to: "#b51e2c" }]),
    });
    expect(draft.templatePatches["spec-table"]["specs-table"]).toMatchObject({
      headerFill: "#b51e2c",
      stripeFill: "#f5d9de",
      textColor: "#4f0b15",
    });
  });

  it("creates a service deliverable from natural language without requiring style keywords", () => {
    const materials = createDefaultMaterialLibrary();
    const suite = createTemplateSuite(createDefaultProject(), sku);
    const draft = createAssistantDraft("生成一张售后服务的新图，服务项先随便填", {
      materials,
      currentSelection: {},
      sku,
      scope: "current-sku",
      templates: suite.templates,
    });

    expect(draft.templateCreations).toHaveLength(1);
    expect(draft.templateCreations[0]).toMatchObject({
      fromTemplateId: "service-promise",
    });
    expect(draft.warnings.join("\n")).not.toMatch(/明显样式指令|DeepSeek/);
  });

  it("creates an after-sales rules image when the user asks for policy conditions", () => {
    const materials = createDefaultMaterialLibrary();
    const suite = createTemplateSuite(createDefaultProject(), sku);
    const draft = createAssistantDraft("生成一份售后规则图，什么情况可以售后什么情况不可以售后", {
      materials,
      currentSelection: {},
      sku,
      scope: "current-sku",
      templates: suite.templates,
    });

    expect(draft.templateCreations).toHaveLength(1);
    expect(draft.templateCreations[0]).toMatchObject({
      fromTemplateId: "service-promise",
    });
  });

  it("does not create a new template for ordinary batch finished-image output", () => {
    const materials = createDefaultMaterialLibrary();
    const suite = createTemplateSuite(createDefaultProject(), sku);
    const draft = createAssistantDraft("把主图和参数表配色改一下，批量出成品图", {
      materials,
      currentSelection: {},
      sku,
      scope: "all-skus",
      templates: suite.templates,
    });

    expect(draft.templateCreations).toHaveLength(0);
  });
});
