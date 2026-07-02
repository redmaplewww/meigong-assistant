import { describe, expect, it } from "vitest";
import {
  discardTemplateCreationsUnlessRequested,
  ensureDeepRedBoardWhenRequested,
  ensureRedThemeWhenRequested,
  ensureTemplateCreationWhenRequested,
  extractJson,
  requestNeedsTemplateCreation,
} from "./deepseekProxy";

const heroTemplateContext = {
  id: "hero-main",
  kind: "hero",
  name: "主图",
  layers: [
    { id: "logo-top", materialSlot: "logo" },
    { id: "spec-pill", materialSlot: "spec-pill" },
    { id: "bottom-board", materialSlot: "bottom-board" },
    { id: "product-main" },
    { id: "hero-title" },
    { id: "shipping-text" },
    { id: "invoice-panel" },
    { id: "invoice-text" },
  ],
};

describe("DeepSeek plan proxy safeguards", () => {
  it("repairs common malformed JSON returned by the LLM before falling back", () => {
    const malformed = `\`\`\`json
    {
      "name": "红色套版",
      "actions": [
        { "id": "theme", "title": "统一红色", "detail": "应用到全部组件", }
        { "id": "spacing", "title": "调整间距", "detail": "商品名和产品图分开" }
      ],
      "warnings": ["检查产品图" "检查工程图"]
    }
    \`\`\``;

    expect(extractJson(malformed)).toMatchObject({
      name: "红色套版",
      actions: [
        { id: "theme" },
        { id: "spacing" },
      ],
      warnings: ["检查产品图", "检查工程图"],
    });
  });

  it("adds a deterministic template creation when the LLM omits it after a template request", () => {
    const requestBody = {
      prompt: "必须创建一个新模板，基于主图做一张极简深蓝新版式，同时产品放大标题醒目",
      templates: [heroTemplateContext],
    };
    const deepSeekPlan = {
      name: "深蓝极简套版",
      materialSelection: { "bottom-board": "bottom-board-deep" },
      templatePatches: {
        "hero-main": {
          "product-main": { x: 60, width: 1320 },
          "hero-title": { fontSize: 100 },
        },
      },
      templateCreations: [],
      actions: [{ id: "deepseek-layout", title: "放大主体", detail: "DeepSeek 调整主图层" }],
    };

    expect(requestNeedsTemplateCreation(requestBody)).toBe(true);

    const ensured = ensureTemplateCreationWhenRequested(requestBody, deepSeekPlan) as typeof deepSeekPlan & {
      templateCreations: Array<{
        fromTemplateId: string;
        templateId: string;
        name: string;
        patches: Record<string, Record<string, unknown>>;
      }>;
      actions: Array<{ id: string }>;
    };

    expect(ensured.materialSelection).toEqual({ "bottom-board": "bottom-board-deep" });
    expect(ensured.templateCreations).toHaveLength(1);
    expect(ensured.templateCreations[0]).toMatchObject({
      fromTemplateId: "hero-main",
      name: expect.stringContaining("AI"),
    });
    expect(ensured.templateCreations[0].templateId).toMatch(/^ai-hero-main-/);
    expect(ensured.templateCreations[0].patches["product-main"]).toMatchObject({
      x: 60,
      width: 1320,
    });
    expect(ensured.templateCreations[0].patches["hero-title"]).toMatchObject({
      fontSize: 100,
    });
    expect(ensured.actions.map((action) => action.id)).toContain("server-template-creation");
  });

  it("leaves normal layout plans unchanged when the prompt does not ask for a new template", () => {
    const requestBody = {
      prompt: "深蓝底板，产品放大，标题醒目",
      templates: [heroTemplateContext],
    };
    const deepSeekPlan = {
      materialSelection: { "bottom-board": "bottom-board-deep" },
      templatePatches: { "hero-main": { "product-main": { width: 1300 } } },
      actions: [],
    };

    expect(requestNeedsTemplateCreation(requestBody)).toBe(false);
    expect(ensureTemplateCreationWhenRequested(requestBody, deepSeekPlan)).toBe(deepSeekPlan);
  });

  it("does not create a deep red board material for a normal color request", () => {
    const requestBody = {
      prompt: "做深红底板，产品放大，标题醒目",
      materials: [
        { id: "bottom-board-classic", slot: "bottom-board", name: "经典蓝色底板", tags: ["blue"] },
        { id: "bottom-board-deep", slot: "bottom-board", name: "深蓝斜切底板", tags: ["blue", "deep", "斜切"] },
      ],
    };
    const deepSeekPlan = {
      materialSelection: { "bottom-board": "bottom-board-deep" },
      actions: [{ id: "model-picked-blue", title: "替换底板", detail: "模型选择了深蓝底板" }],
    };

    const ensured = ensureDeepRedBoardWhenRequested(requestBody, deepSeekPlan) as typeof deepSeekPlan & {
      materialCreations: Array<{
        slot: string;
        fromMaterialId: string;
        materialId: string;
        colorReplacements: Array<{ from: string; to: string }>;
      }>;
    };

    expect(ensured.materialSelection["bottom-board"]).toBe("bottom-board-deep");
    expect(ensured.materialCreations).toBeUndefined();
  });

  it("creates and selects a deep red board variant only when the user asks to save a material", () => {
    const requestBody = {
      prompt: "创建一个深红底板素材并放入素材库，产品放大",
      materials: [
        { id: "bottom-board-classic", slot: "bottom-board", name: "经典蓝色底板", tags: ["blue"] },
        { id: "bottom-board-deep", slot: "bottom-board", name: "深蓝斜切底板", tags: ["blue", "deep", "斜切"] },
      ],
    };
    const deepSeekPlan = {
      materialSelection: { "bottom-board": "bottom-board-deep" },
      actions: [{ id: "model-picked-blue", title: "替换底板", detail: "模型选择了深蓝底板" }],
    };

    const ensured = ensureDeepRedBoardWhenRequested(requestBody, deepSeekPlan) as typeof deepSeekPlan & {
      materialCreations: Array<{
        slot: string;
        fromMaterialId: string;
        materialId: string;
        colorReplacements: Array<{ from: string; to: string }>;
      }>;
    };

    expect(ensured.materialSelection["bottom-board"]).toBe("ai-bottom-board-deep-red");
    expect(ensured.materialCreations).toHaveLength(1);
    expect(ensured.materialCreations[0]).toMatchObject({
      slot: "bottom-board",
      fromMaterialId: "bottom-board-deep",
      materialId: "ai-bottom-board-deep-red",
    });
    expect(ensured.materialCreations[0].colorReplacements[0]).toEqual({ from: "#0b5f99", to: "#7f1420" });
  });

  it("augments partial LLM red recolor instructions with the complete palette", () => {
    const requestBody = {
      prompt: "创建深红底板素材，产品放大",
      materials: [
        { id: "bottom-board-deep", slot: "bottom-board", name: "深蓝斜切底板", tags: ["blue", "deep"] },
      ],
    };
    const deepSeekPlan = {
      materialSelection: { "bottom-board": "bottom-board-deep" },
      materialCreations: [
        {
          slot: "bottom-board",
          fromMaterialId: "bottom-board-deep",
          materialId: "ai-bottom-board-deep-red",
          name: "深红斜切底板",
          colorReplacements: [{ from: "#0b5f99", to: "#7f1420" }],
        },
      ],
    };

    const ensured = ensureDeepRedBoardWhenRequested(requestBody, deepSeekPlan) as typeof deepSeekPlan;

    expect(ensured.materialSelection["bottom-board"]).toBe("ai-bottom-board-deep-red");
    expect(ensured.materialCreations[0].colorReplacements).toEqual(
      expect.arrayContaining([
        { from: "#0b5f99", to: "#7f1420" },
        { from: "#0c75bd", to: "#b51e2c" },
        { from: "#12315a", to: "#4f0b15" },
      ]),
    );
  });

  it("expands a unified red theme request into color patches without material changes", () => {
    const requestBody = {
      prompt: "把配色统一改成红色，产品图不要盖字",
      materials: [
        { id: "bottom-board-deep", slot: "bottom-board", name: "深蓝斜切底板", tags: ["blue", "deep"] },
        { id: "spec-pill-blue", slot: "spec-pill", name: "蓝色参数胶囊", tags: ["blue"] },
        { id: "service-tile-blue", slot: "service-tile", name: "蓝色服务块", tags: ["blue"] },
        { id: "search-strip-blue", slot: "search-strip", name: "蓝色搜索条", tags: ["blue"] },
        { id: "logo-wayiii-classic", slot: "logo", name: "经典蓝色LOGO", tags: ["blue"] },
      ],
      templates: [
        heroTemplateContext,
        {
          id: "spec-table",
          kind: "specs",
          name: "材料及性能指标",
          layers: [{ id: "spec-title-pill" }, { id: "spec-title" }, { id: "specs-table" }],
        },
        {
          id: "service-promise",
          kind: "service",
          name: "服务承诺",
          layers: [{ id: "service-tile-0", materialSlot: "service-tile" }, { id: "service-title-cn" }],
        },
        {
          id: "detail-page",
          kind: "detail",
          name: "详情长图",
          layers: [{ id: "detail-search", materialSlot: "search-strip" }, { id: "detail-spec-pill", materialSlot: "spec-pill" }],
        },
      ],
    };
    const deepSeekPlan = {
      materialSelection: { "bottom-board": "bottom-board-deep" },
      templatePatches: {},
      templateCreations: [{ fromTemplateId: "hero-main", templateId: "ai-red-hero" }],
      actions: [],
    };

    const ensured = ensureRedThemeWhenRequested(requestBody, deepSeekPlan) as typeof deepSeekPlan & {
      theme: { id: string };
      materialCreations?: Array<{ slot: string; materialId: string; colorReplacements: Array<{ from: string; to: string }> }>;
      templatePatches: Record<string, Record<string, Record<string, unknown>>>;
    };

    expect(ensured.theme.id).toBe("red");
    expect(ensured.materialSelection).toEqual({ "bottom-board": "bottom-board-deep" });
    expect(ensured.materialCreations).toBeUndefined();
    expect(ensured.templatePatches["hero-main"]["spec-pill"]).toMatchObject({
      colorReplacements: expect.arrayContaining([{ from: "#0b70b7", to: "#b51e2c" }]),
    });
    expect(ensured.templatePatches["service-promise"]["service-tile-0"]).toMatchObject({
      colorReplacements: expect.arrayContaining([{ from: "#0b70b7", to: "#b51e2c" }]),
    });
    expect(ensured.templatePatches["detail-page"]["detail-search"]).toMatchObject({
      colorReplacements: expect.arrayContaining([{ from: "#0b70b7", to: "#b51e2c" }]),
    });
    expect(ensured.templatePatches["spec-table"]["specs-table"]).toMatchObject({
      headerFill: "#b51e2c",
      textColor: "#4f0b15",
    });
    expect(ensured.templateCreations).toHaveLength(0);
  });

  it("allows a new after-sales service image without explicit style words", () => {
    const requestBody = {
      prompt: "生成一张售后服务的新图，服务项先随便填",
      templates: [
        heroTemplateContext,
        {
          id: "service-promise",
          kind: "service",
          name: "服务承诺",
          layers: [{ id: "service-title-cn" }, { id: "service-tile-0" }],
        },
      ],
    };
    const deepSeekPlan = {
      templateCreations: [{ fromTemplateId: "service-promise", templateId: "ai-service-after-sale" }],
      warnings: [],
    };

    expect(requestNeedsTemplateCreation(requestBody)).toBe(true);
    expect(discardTemplateCreationsUnlessRequested(requestBody, deepSeekPlan)).toBe(deepSeekPlan);
  });

  it("allows a new after-sales rules image from policy-condition wording", () => {
    const requestBody = {
      prompt: "生成一份售后规则图，什么情况可以售后什么情况不可以售后",
      templates: [
        heroTemplateContext,
        {
          id: "service-promise",
          kind: "service",
          name: "服务承诺",
          layers: [{ id: "service-title-cn" }, { id: "service-tile-0" }],
        },
      ],
    };
    const deepSeekPlan = {
      templateCreations: [{ fromTemplateId: "service-promise", templateId: "ai-after-sales-rules" }],
      warnings: [],
    };

    expect(requestNeedsTemplateCreation(requestBody)).toBe(true);
    expect(discardTemplateCreationsUnlessRequested(requestBody, deepSeekPlan)).toBe(deepSeekPlan);
  });

  it("drops unexpected template creations for normal finished-image plans", () => {
    const requestBody = {
      prompt: "把主图和参数表配色改一下，批量出成品图",
      templates: [heroTemplateContext],
    };
    const deepSeekPlan = {
      templateCreations: [{ fromTemplateId: "hero-main", templateId: "ai-red-hero" }],
      warnings: [],
    };

    const ensured = discardTemplateCreationsUnlessRequested(requestBody, deepSeekPlan) as typeof deepSeekPlan;

    expect(ensured.templateCreations).toEqual([]);
    expect(ensured.warnings.length).toBeGreaterThan(0);
  });
});
