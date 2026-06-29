import type { Connect } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { jsonrepair } from "jsonrepair";

export interface DeepSeekProxyOptions {
  apiKey?: string;
  model?: string;
  apiBase?: string;
}

interface DeepSeekMessage {
  role: "system" | "user";
  content: string;
}

const maxBodyBytes = 220_000;
const templateCreationPattern = /新模板|新版式|另做一版|多做一张|自己做模板|创建模板|模板能力/;
const redBoardPattern = /深红|酒红|暗红|红色底板|红底板|红色|red|crimson|burgundy/i;
const redThemePattern = /(配色|统一|整体|全局|全套|风格|颜色|色系).*(深红|酒红|暗红|红色|red|crimson|burgundy)|(深红|酒红|暗红|红色|red|crimson|burgundy).*(配色|统一|整体|全局|全套|风格|颜色|色系)/i;
const deepRedBoardReplacements = [
  { from: "#0b5f99", to: "#7f1420" },
  { from: "#0c75bd", to: "#b51e2c" },
  { from: "#12315a", to: "#4f0b15" },
  { from: "#0a4f82", to: "#6f101c" },
  { from: "#b8d4e8", to: "#e1aeb5" },
];
const redThemeReplacements = [
  ...deepRedBoardReplacements,
  { from: "#0b70b7", to: "#b51e2c" },
  { from: "#0a66a9", to: "#7f1420" },
  { from: "#18315f", to: "#4f0b15" },
  { from: "#063f68", to: "#4f0b15" },
  { from: "#0872b8", to: "#b51e2c" },
  { from: "#2f8ac4", to: "#c7434f" },
  { from: "#8bc2e8", to: "#e1aeb5" },
  { from: "#6aa1c7", to: "#d65a62" },
  { from: "#6098bf", to: "#c7434f" },
  { from: "#9db9cc", to: "#d8a3aa" },
  { from: "#9fb2c4", to: "#d8a3aa" },
  { from: "#d7dde6", to: "#f5d9de" },
  { from: "#eef3f8", to: "#f9eaec" },
  { from: "#eef6fb", to: "#f9eaec" },
  { from: "#e5eef5", to: "#f9eaec" },
  { from: "#e5eff7", to: "#f9eaec" },
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function safeSlug(value: unknown, fallback: string): string {
  const raw = asString(value, fallback).trim().toLowerCase();
  const slug = raw.replace(/[^a-z0-9\u4e00-\u9fa5-]+/gi, "-").replace(/^-+|-+$/g, "");
  return (slug || fallback).slice(0, 52);
}

function uniqueSlug(base: string, usedIds: Set<string>): string {
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);
  return id;
}

export function requestNeedsTemplateCreation(requestBody: unknown): boolean {
  const context = asRecord(requestBody);
  return /新模板|新版式|新图层|新增图层|创建图层|另做一版|多做一张|自己做模板|创建模板|模板能力|new template|template variant|add layer/i.test(asString(context.prompt));
}

function hasUsableTemplateCreations(plan: unknown): boolean {
  return asArray(asRecord(plan).templateCreations).some((item) => {
    const creation = asRecord(item);
    return Boolean(asString(creation.fromTemplateId) && asString(creation.templateId));
  });
}

function mergeObjects(base: unknown, override: unknown): Record<string, unknown> {
  return {
    ...asRecord(base),
    ...asRecord(override),
  };
}

function mergeNestedPatches(base: unknown, override: unknown): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...asRecord(base) };
  Object.entries(asRecord(override)).forEach(([templateId, rawLayerPatches]) => {
    merged[templateId] = {
      ...asRecord(merged[templateId]),
      ...asRecord(rawLayerPatches),
    };
  });
  return merged;
}

function mergeArrays(base: unknown, override: unknown): unknown[] {
  return [...asArray(base), ...asArray(override)];
}

function mergePlanWithRepair(basePlan: unknown, repairPlan: unknown): unknown {
  const base = asRecord(basePlan);
  const repair = asRecord(repairPlan);
  if (!Object.keys(base).length) return repairPlan;
  if (!Object.keys(repair).length) return basePlan;

  return {
    ...base,
    ...repair,
    materialSelection: mergeObjects(base.materialSelection, repair.materialSelection),
    templatePatches: mergeNestedPatches(base.templatePatches, repair.templatePatches),
    templateCreations: asArray(repair.templateCreations).length ? repair.templateCreations : base.templateCreations,
    actions: mergeArrays(base.actions, repair.actions),
    warnings: mergeArrays(base.warnings, repair.warnings),
  };
}

function materialText(material: Record<string, unknown>): string {
  return [
    asString(material.id),
    asString(material.name),
    ...asArray(material.tags).map((tag) => asString(tag)),
  ].join(" ").toLowerCase();
}

function requestNeedsDeepRedBoard(requestBody: unknown): boolean {
  return redBoardPattern.test(asString(asRecord(requestBody).prompt));
}

function findExistingDeepRedBoard(requestBody: unknown): Record<string, unknown> | undefined {
  return asArray(asRecord(requestBody).materials)
    .map(asRecord)
    .find((material) => {
      if (asString(material.slot) !== "bottom-board") return false;
      return /深红|酒红|暗红|red|crimson|burgundy/i.test(materialText(material));
    });
}

function chooseBaseBoardForRedVariant(requestBody: unknown): Record<string, unknown> | undefined {
  const boards = asArray(asRecord(requestBody).materials)
    .map(asRecord)
    .filter((material) => asString(material.slot) === "bottom-board" && asString(material.id));
  if (!boards.length) return undefined;

  return (
    boards.find((material) => asString(material.id) === "bottom-board-deep") ??
    boards.find((material) => /斜切|deep|slash/i.test(materialText(material))) ??
    boards[0]
  );
}

function hasUsableMaterialCreationForSlot(plan: unknown, slot: string): boolean {
  return asArray(asRecord(plan).materialCreations).some((item) => {
    const creation = asRecord(item);
    return (
      asString(creation.slot) === slot &&
      Boolean(asString(creation.fromMaterialId)) &&
      Boolean(asString(creation.materialId)) &&
      asArray(creation.colorReplacements).length > 0
    );
  });
}

function withDeepRedReplacementDefaults(creation: Record<string, unknown>): Record<string, unknown> {
  const replacements = asArray(creation.colorReplacements).map(asRecord);
  const existingFromColors = new Set(replacements.map((replacement) => asString(replacement.from).toLowerCase()));
  const mergedReplacements = [
    ...replacements,
    ...deepRedBoardReplacements.filter((replacement) => !existingFromColors.has(replacement.from.toLowerCase())),
  ];

  return {
    ...creation,
    name: asString(creation.name) || "深红斜切底板",
    colorReplacements: mergedReplacements,
    tags: Array.from(new Set([...asArray(creation.tags).map((tag) => asString(tag)).filter(Boolean), "red", "deep-red", "深红"])),
  };
}

export function ensureDeepRedBoardWhenRequested(requestBody: unknown, plan: unknown): unknown {
  if (!requestNeedsDeepRedBoard(requestBody)) return plan;

  const record = asRecord(plan);
  const existingRedBoard = findExistingDeepRedBoard(requestBody);
  if (existingRedBoard) {
    return {
      ...record,
      materialSelection: {
        ...asRecord(record.materialSelection),
        "bottom-board": asString(existingRedBoard.id),
      },
    };
  }

  if (hasUsableMaterialCreationForSlot(plan, "bottom-board")) {
    let selectedMaterialId = "";
    const materialCreations = asArray(record.materialCreations)
      .map(asRecord)
      .map((creation) => {
        if (asString(creation.slot) !== "bottom-board") return creation;
        const normalizedCreation = withDeepRedReplacementDefaults(creation);
        selectedMaterialId = asString(normalizedCreation.materialId);
        return normalizedCreation;
      });
    if (!selectedMaterialId) return plan;
    return {
      ...record,
      materialSelection: {
        ...asRecord(record.materialSelection),
        "bottom-board": selectedMaterialId,
      },
      materialCreations,
    };
  }

  const baseBoard = chooseBaseBoardForRedVariant(requestBody);
  if (!baseBoard) return plan;

  const materialId = "ai-bottom-board-deep-red";
  const creation = {
    id: "material-ai-bottom-board-deep-red",
    slot: "bottom-board",
    fromMaterialId: asString(baseBoard.id),
    materialId,
    name: "深红斜切底板",
    reason: "素材库没有深红底板，基于现有斜切底板做确定性改色变体。",
    colorReplacements: deepRedBoardReplacements,
    tags: ["red", "deep-red", "深红", "斜切"],
  };

  return {
    ...record,
    materialSelection: {
      ...asRecord(record.materialSelection),
      "bottom-board": materialId,
    },
    materialCreations: [...asArray(record.materialCreations), creation],
    actions: [
      ...asArray(record.actions),
      {
        id: "server-material-deep-red-board",
        title: "创建深红底板",
        detail: `素材库没有深红底板，已基于 ${asString(baseBoard.id)} 改色并加入素材库。`,
      },
    ],
  };
}

function requestNeedsRedTheme(requestBody: unknown): boolean {
  return redThemePattern.test(asString(asRecord(requestBody).prompt));
}

function findExistingRedMaterialForSlot(requestBody: unknown, slot: string): Record<string, unknown> | undefined {
  return asArray(asRecord(requestBody).materials)
    .map(asRecord)
    .find((material) => asString(material.slot) === slot && /红|red|crimson|burgundy/i.test(materialText(material)));
}

function chooseBaseMaterialForSlot(requestBody: unknown, slot: string, preferredIds: string[]): Record<string, unknown> | undefined {
  const materials = asArray(asRecord(requestBody).materials)
    .map(asRecord)
    .filter((material) => asString(material.slot) === slot && asString(material.id));
  if (!materials.length) return undefined;
  return preferredIds.map((id) => materials.find((material) => asString(material.id) === id)).find(Boolean) ?? materials[0];
}

function withRedThemeReplacementDefaults(creation: Record<string, unknown>): Record<string, unknown> {
  const replacements = asArray(creation.colorReplacements).map(asRecord);
  const existingFromColors = new Set(replacements.map((replacement) => asString(replacement.from).toLowerCase()));
  const mergedReplacements = [
    ...replacements,
    ...redThemeReplacements.filter((replacement) => !existingFromColors.has(replacement.from.toLowerCase())),
  ];

  return {
    ...creation,
    colorReplacements: mergedReplacements,
    tags: Array.from(new Set([...asArray(creation.tags).map((tag) => asString(tag)).filter(Boolean), "red", "theme:red", "红色"])),
  };
}

function redThemeMaterialSpecs() {
  return [
    { slot: "bottom-board", preferredIds: ["bottom-board-deep", "bottom-board-classic"], materialId: "ai-bottom-board-deep-red", name: "红色底板" },
    { slot: "top-cap", preferredIds: ["top-cap-blue-panel"], materialId: "ai-top-cap-red", name: "红色顶板" },
    { slot: "logo", preferredIds: ["logo-wayiii-classic", "logo-wayiii-stamp"], materialId: "ai-logo-wayiii-classic-red", name: "红色LOGO" },
    { slot: "promo-badge", preferredIds: ["promo-badge-soft"], materialId: "ai-promo-badge-red", name: "红色促销角标" },
    { slot: "service-tile", preferredIds: ["service-tile-blue"], materialId: "ai-service-tile-red", name: "红色服务块" },
    { slot: "search-strip", preferredIds: ["search-strip-blue"], materialId: "ai-search-strip-red", name: "红色搜索条" },
    { slot: "spec-pill", preferredIds: ["spec-pill-blue"], materialId: "ai-spec-pill-red", name: "红色参数胶囊" },
  ];
}

function buildRedThemeTemplatePatches(requestBody: unknown): Record<string, unknown> {
  const patches: Record<string, unknown> = {};
  const templates = asArray(asRecord(requestBody).templates).map(asRecord).filter((template) => asString(template.id));
  const patchByKind: Record<string, Record<string, unknown>> = {
    hero: {
      "hero-title": { color: "#b51e2c" },
      "invoice-text": { color: "#b51e2c" },
    },
    specs: {
      "spec-title-pill": { fill: "#b51e2c" },
      "spec-title": { color: "#ffffff" },
      "specs-table": { headerFill: "#b51e2c", stripeFill: "#f5d9de", borderColor: "#d8a3aa", textColor: "#4f0b15" },
    },
    drawing: {
      "drawing-title": { color: "#b51e2c" },
    },
    service: {
      "service-title-cn": { color: "#b51e2c" },
      "service-title-en": { color: "#b51e2c" },
      "service-divider": { fill: "#b51e2c" },
    },
    detail: {
      "detail-title-cn": { color: "#b51e2c" },
      "detail-title-en": { color: "#b51e2c" },
      "detail-service-title": { color: "#b51e2c" },
      "detail-param-table": { headerFill: "#b51e2c", stripeFill: "#f9eaec", borderColor: "#d8a3aa", textColor: "#4f0b15" },
    },
  };

  templates.forEach((template) => {
    const templateId = asString(template.id);
    const kind = asString(template.kind);
    const layerPatches = pickExistingPatches(template, patchByKind[kind] ?? {});
    if (Object.keys(layerPatches).length) patches[templateId] = layerPatches;
  });

  return patches;
}

export function discardTemplateCreationsUnlessRequested(requestBody: unknown, plan: unknown): unknown {
  if (requestNeedsTemplateCreation(requestBody)) return plan;
  const record = asRecord(plan);
  if (!asArray(record.templateCreations).length) return plan;
  return {
    ...record,
    templateCreations: [],
    warnings: [
      ...asArray(record.warnings),
      "AI 返回了新模板创建指令，但当前请求是固定成品图套版，已改为修改现有成品图。",
    ],
  };
}

export function ensureRedThemeWhenRequested(requestBody: unknown, plan: unknown): unknown {
  if (!requestNeedsRedTheme(requestBody)) return plan;

  const record = asRecord(plan);
  const materialSelection: Record<string, unknown> = { ...asRecord(record.materialSelection) };
  const materialCreations = asArray(record.materialCreations).map(asRecord);

  redThemeMaterialSpecs().forEach((spec) => {
    const existingRed = findExistingRedMaterialForSlot(requestBody, spec.slot);
    if (existingRed) {
      materialSelection[spec.slot] = asString(existingRed.id);
      return;
    }

    const existingCreationIndex = materialCreations.findIndex((creation) => asString(creation.slot) === spec.slot);
    if (existingCreationIndex >= 0) {
      const normalized = withRedThemeReplacementDefaults(materialCreations[existingCreationIndex]);
      materialCreations[existingCreationIndex] = normalized;
      materialSelection[spec.slot] = asString(normalized.materialId);
      return;
    }

    const base = chooseBaseMaterialForSlot(requestBody, spec.slot, spec.preferredIds);
    if (!base) return;
    const materialId = spec.slot === "logo" && asString(base.id) !== "logo-wayiii-classic" ? `ai-${asString(base.id)}-red` : spec.materialId;
    materialSelection[spec.slot] = materialId;
    materialCreations.push({
      id: `material-${materialId}`,
      slot: spec.slot,
      fromMaterialId: asString(base.id),
      materialId,
      name: spec.name,
      reason: "用户要求统一红色配色，基于现有 SVG 素材确定性改色。",
      colorReplacements: redThemeReplacements,
      tags: ["red", "theme:red", "红色"],
    });
  });

  return discardTemplateCreationsUnlessRequested(requestBody, {
    ...record,
    theme: {
      id: "red",
      name: "红色",
      primary: "#b51e2c",
      secondary: "#4f0b15",
      accent: "#7f1420",
      soft: "#f9eaec",
      stripe: "#f5d9de",
      border: "#d8a3aa",
      textOnPrimary: "#ffffff",
    },
    materialSelection,
    materialCreations,
    templatePatches: mergeNestedPatches(record.templatePatches, buildRedThemeTemplatePatches(requestBody)),
    actions: [
      ...asArray(record.actions),
      {
        id: "server-red-theme",
        title: "统一红色配色",
        detail: "服务端已补齐参数胶囊、字体、表格和可改色 SVG 素材，避免蓝色残留。",
      },
    ],
  });
}

function chooseBaseTemplate(requestBody: unknown): Record<string, unknown> | undefined {
  const context = asRecord(requestBody);
  const prompt = asString(context.prompt);
  const templates = asArray(context.templates).map(asRecord).filter((template) => asString(template.id));
  if (!templates.length) return undefined;

  const byId = (id: string) => templates.find((template) => template.id === id);
  const byKind = (kind: string) => templates.find((template) => template.kind === kind);
  const pick = (ids: string[], kinds: string[]) => ids.map(byId).find(Boolean) ?? kinds.map(byKind).find(Boolean);

  if (/工程|尺寸|图纸|外形/.test(prompt)) return pick(["drawing-size"], ["drawing"]) ?? templates[0];
  if (/参数|表格|规格|性能/.test(prompt)) return pick(["spec-table"], ["specs"]) ?? templates[0];
  if (/服务|承诺|售后|六宫格/.test(prompt)) return pick(["service-promise"], ["service"]) ?? templates[0];
  if (/白底|纯白/.test(prompt)) return pick(["white-product"], ["white"]) ?? templates[0];
  if (/详情|长图/.test(prompt)) return pick(["detail-page"], ["detail"]) ?? templates[0];
  return byId("hero-main") ?? byKind("hero") ?? templates[0];
}

function layerIds(template: Record<string, unknown>): Set<string> {
  return new Set(asArray(template.layers).map((layer) => asString(asRecord(layer).id)).filter(Boolean));
}

function pickExistingPatches(template: Record<string, unknown>, candidates: Record<string, unknown>): Record<string, unknown> {
  const ids = layerIds(template);
  return Object.fromEntries(Object.entries(candidates).filter(([layerId]) => ids.has(layerId)));
}

function buildFallbackTemplatePatches(
  requestBody: unknown,
  plan: unknown,
  baseTemplate: Record<string, unknown>,
): Record<string, unknown> {
  const prompt = asString(asRecord(requestBody).prompt);
  const templateId = asString(baseTemplate.id);
  const modelPatches = asRecord(asRecord(plan).templatePatches);
  const existing = asRecord(modelPatches[templateId]);
  const kind = asString(baseTemplate.kind);
  const clean = /极简|干净|少字|留白|简洁/.test(prompt);
  const titleLarge = /标题|大字|醒目|突出/.test(prompt);

  const fallbackByKind: Record<string, Record<string, unknown>> = {
    hero: {
      "product-main": { x: 72, y: 500, width: 1296, height: 650 },
      "hero-title": { y: 390, fontSize: titleLarge ? 96 : 88 },
      "shipping-text": { x: 382, width: 930, fontSize: 64 },
      "invoice-panel": { visible: !clean },
      "invoice-text": { visible: !clean },
    },
    specs: {
      "spec-title-pill": { x: 280, y: 100, width: 880 },
      "spec-title": { x: 380, y: 136, width: 680, fontSize: titleLarge ? 68 : 62 },
      "specs-table": { x: 150, y: 335, width: 1140, height: 980, fontSize: 44 },
    },
    drawing: {
      "drawing-title": { y: 210, fontSize: titleLarge ? 112 : 104 },
      "drawing-image": { x: 86, y: 410, width: 1268, height: 590 },
      "drawing-note": { y: 1060 },
    },
    service: {
      "service-title-cn": { y: 145, fontSize: titleLarge ? 92 : 86 },
      "service-title-en": { y: 292, fontSize: 44 },
      "service-divider": { y: 388 },
    },
    white: {
      "white-product-image": { x: 48, y: 285, width: 1344, height: 850 },
    },
    detail: {
      "detail-title-cn": { fontSize: titleLarge ? 84 : 76 },
      "detail-product": { x: 58, y: 500, width: 844, height: 455 },
      "detail-param-table": { fontSize: 28 },
    },
  };

  return {
    ...pickExistingPatches(baseTemplate, fallbackByKind[kind] ?? fallbackByKind.hero),
    ...existing,
  };
}

function buildFallbackTemplateCreation(requestBody: unknown, plan: unknown): Record<string, unknown> | undefined {
  const baseTemplate = chooseBaseTemplate(requestBody);
  if (!baseTemplate) return undefined;

  const prompt = asString(asRecord(requestBody).prompt);
  const baseId = asString(baseTemplate.id, "hero-main");
  const baseName = asString(baseTemplate.name, baseId);
  const usedIds = new Set([
    ...asArray(asRecord(requestBody).templates).map((template) => asString(asRecord(template).id)).filter(Boolean),
    ...asArray(asRecord(plan).templateCreations).map((creation) => asString(asRecord(creation).templateId)).filter(Boolean),
  ]);
  const suffix = safeSlug(prompt, "ai-template").slice(0, 24);
  const templateId = uniqueSlug(`ai-${baseId}-${suffix}`, usedIds);
  const styleName = /深蓝|高级|科技|斜切/.test(prompt) ? "深蓝科技" : /极简|留白|干净/.test(prompt) ? "极简" : "新版式";

  return {
    fromTemplateId: baseId,
    templateId,
    name: `AI ${styleName}${baseName}`,
    reason: "用户明确要求创建模板；DeepSeek 已给出套版意图，服务端安全执行器补齐可执行模板克隆指令。",
    patches: buildFallbackTemplatePatches(requestBody, plan, baseTemplate),
    newLayers: [
      {
        id: "ai-accent-pill",
        type: "shape",
        name: "AI 装饰胶囊",
        shape: "pill",
        x: 940,
        y: 132,
        width: 300,
        height: 72,
        fill: "#0b70b7",
        stroke: "#ffffff",
        strokeWidth: 0,
      },
      {
        id: "ai-accent-text",
        type: "text",
        name: "AI 新模板副标题",
        text: "CUSTOM LAYOUT",
        x: 955,
        y: 150,
        width: 270,
        height: 42,
        fontSize: 30,
        fontWeight: 800,
        fontFamily: "Arial, Helvetica, sans-serif",
        color: "#ffffff",
        align: "center",
      },
    ],
  };
}

export function ensureTemplateCreationWhenRequested(requestBody: unknown, plan: unknown): unknown {
  if (!requestNeedsTemplateCreation(requestBody) || hasUsableTemplateCreations(plan)) return plan;
  const creation = buildFallbackTemplateCreation(requestBody, plan);
  if (!creation) return plan;

  const record = asRecord(plan);
  return {
    ...record,
    name: record.name ?? creation.name,
    summary: record.summary ?? "DeepSeek 已生成套版草稿，并创建一个可确认、可批量复用的新模板。",
    templateCreations: [creation],
    actions: [
      ...asArray(record.actions),
      {
        id: "server-template-creation",
        title: "创建新模板",
        detail: `基于 ${asString(creation.fromTemplateId)} 克隆为 ${asString(creation.name)}，确认后保存为模板套装。`,
      },
    ],
  };
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
      if (body.length > maxBodyBytes) {
        reject(new Error("请求上下文过大，请减少素材或 SKU 数量后重试。"));
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("请求不是有效 JSON。"));
      }
    });

    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function stripJsonFences(content: string): string {
  return content
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
}

function parseJsonWithRepair(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return JSON.parse(jsonrepair(content));
  }
}

export function extractJson(content: string): unknown {
  const cleaned = content
    ? stripJsonFences(content)
    : "";

  try {
    return parseJsonWithRepair(cleaned);
  } catch {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return parseJsonWithRepair(cleaned.slice(first, last + 1));
      } catch {
        throw new Error("DeepSeek 返回的 JSON 有结构错误，已切换到本地后备草稿。");
      }
    }
    throw new Error("DeepSeek 没有返回有效 JSON。");
  }
}

function needsTemplateCreation(requestBody: unknown, plan: unknown): boolean {
  return requestNeedsTemplateCreation(requestBody) && !hasUsableTemplateCreations(plan);
}

function buildMessages(requestBody: unknown): DeepSeekMessage[] {
  const context = requestBody && typeof requestBody === "object" ? requestBody as Record<string, unknown> : {};
  const userPrompt = typeof context.prompt === "string" ? context.prompt : "";
  const materials = Array.isArray(context.materials) ? context.materials : [];
  const templates = Array.isArray(context.templates) ? context.templates : [];

  const system = [
    "你是电商产品图套版软件的控制型设计助手。",
    "你不能生成整张图片，不能要求用 AI 生图覆盖真实商品。",
    "你只能输出结构化 JSON，用于选择素材、移动/缩放/隐藏图层、改文字/字号/颜色、调整表格样式，或基于现有模板克隆一个新模板。",
    "你要优先复用真实商品图、工程图、模板素材库和现有图层。",
    "返回必须是 JSON object，不能包含 Markdown。",
    "",
    "JSON schema:",
    "{",
    '  "name": "短方案名",',
    '  "summary": "给用户看的套版摘要",',
    '  "confidence": "high|medium|low",',
    '  "theme": { "id": "red", "name": "红色", "primary": "#b51e2c", "secondary": "#4f0b15", "accent": "#7f1420", "soft": "#f9eaec", "stripe": "#f5d9de", "border": "#d8a3aa", "textOnPrimary": "#ffffff" },',
    '  "materialCreations": [',
    '    { "slot": "bottom-board", "fromMaterialId": "bottom-board-deep", "materialId": "ai-bottom-board-deep-red", "name": "深红斜切底板", "reason": "缺少深红底板，基于现有底板改色", "colorReplacements": [ { "from": "#0b5f99", "to": "#7f1420" } ], "tags": ["red", "深红"] }',
    "  ],",
    '  "materialSelection": { "bottom-board": "material-id", "logo": "material-id" },',
    '  "templatePatches": { "template-id": { "layer-id": { "x": 0, "y": 0, "width": 100, "height": 100, "fontSize": 48, "visible": true } } },',
    '  "templateCreations": [',
    '    { "fromTemplateId": "hero-main", "templateId": "ai-hero-alt", "name": "AI 新主图", "reason": "为什么创建", "patches": { "layer-id": { "x": 0, "fontFamily": "\\"SimHei\\", \\"Microsoft YaHei\\", sans-serif", "shape": "pill" } }, "newLayers": [ { "id": "ai-badge", "type": "shape", "name": "AI 胶囊", "shape": "pill", "x": 900, "y": 120, "width": 320, "height": 72, "fill": "#b51e2c" }, { "id": "ai-badge-text", "type": "text", "name": "AI 文案", "text": "NEW STYLE", "x": 930, "y": 140, "width": 260, "height": 36, "fontSize": 30, "fontFamily": "Arial, Helvetica, sans-serif", "color": "#ffffff" } ] }',
    "  ],",
    '  "actions": [ { "id": "short-id", "title": "动作名", "detail": "动作说明" } ],',
    '  "warnings": [ "需要用户确认的风险" ]',
    "}",
    "",
    "重要限制：",
    "- materialSelection 只能使用上下文 materials 中存在的 id。",
    "- 例外：materialSelection 可以引用本次 materialCreations 中新建的 materialId。",
    "- materialCreations 只能基于 fromMaterialId 克隆现有素材并替换颜色，不能生成整张图或引用外部图片。",
    "- 如果用户要求某种颜色底板但素材库没有，比如深红/酒红/暗红，必须用 materialCreations 基于最接近的底板创建颜色变体，再在 materialSelection 里选中新 materialId。",
    "- templatePatches 只能修改上下文 templates 中存在的 template id 和 layer id。",
    "- templateCreations 必须基于 fromTemplateId 克隆现有模板；patches 修改已有图层，newLayers 可新增 text/shape/table/icon 图层。",
    "- newLayers 不允许新增外部 imageUrl 或整张 AI 图片；新增形状可用 shape=rect|pill|ellipse|line，文字和表格可指定 fontFamily。",
    "- 参数胶囊属于 shape 图层，允许通过 patches 修改 shape、radius、fill、stroke、strokeWidth、x/y/width/height。",
    "- 如果用户只是要求配色、布局、字体、内容、批量套版或出一组成品图，不要创建 templateCreations；应修改固定成品图类型里的现有图层。",
    "- 只有用户明确说“新模板/新版式/另做一版/多做一张/创建模板”时才允许 templateCreations。",
    "- 如果用户要求“配色统一改成红色/整体红色/红色系”，必须返回 theme，并同步 materialCreations/materialSelection/templatePatches，覆盖参数胶囊、服务块、搜索条、LOGO、表格、标题文字和详情页颜色。",
    "- 配色统一时不能只改底板；蓝色参数胶囊、蓝色文字、蓝色表头和详情参数表都必须改成同一色系。",
    "- 商品名必须在图层宽度内，产品图和标题、参数胶囊、底部卖点之间必须保留至少 24px 间距，产品图不能覆盖文字。",
    "- 不要输出 imageUrl、assetId、assetRole、source、children。",
    "- 如果用户要求新风格模板，请用 templateCreations 基于最接近的现有模板创建。",
    "- 如果用户说“深红/酒红/暗红”，不能用深蓝底板替代；没有现成红色底板时必须创建红色底板变体。",
    "- 如果用户说“深蓝/高级/科技/斜切”，必须优先在 bottom-board 槽位选择名称或 id 含 deep/深蓝/斜切的素材。",
    "- 如果用户说“经典/蓝白/默认”，才选择经典底板。",
    "- 如果用户说“新模板/新版式/另做一版/多做一张/自己做模板”，必须返回至少 1 个 templateCreations。",
    "- 如果用户说“产品放大/主体突出”，必须修改 product-main 或 white-product-image 的 x/y/width/height。",
    "- 如果用户说“标题醒目/大字”，必须修改相关 text 图层 fontSize。",
    "- 如果用户要求批量套版，保持 SKU 的真实商品图、标题、参数由原模板数据承载。",
    "- 必须严格输出 JSON object。",
  ].join("\n");

  const user = [
    "请根据用户自然语言和当前软件上下文生成可执行套版计划。",
    `用户原文：${userPrompt}`,
    "",
    "可用素材 materials：",
    JSON.stringify(materials),
    "",
    "可用模板 templates：",
    JSON.stringify(templates),
    "",
    "完整上下文：",
    JSON.stringify(requestBody),
    "",
    "再次提醒：只返回 JSON object。",
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function buildTemplateCreationRepairMessages(requestBody: unknown, previousPlan: unknown): DeepSeekMessage[] {
  const context = requestBody && typeof requestBody === "object" ? requestBody as Record<string, unknown> : {};
  const templates = Array.isArray(context.templates) ? context.templates as Array<Record<string, unknown>> : [];
  const baseTemplateId = typeof templates[0]?.id === "string" ? templates[0].id : "hero-main";

  return [
    {
      role: "system",
      content: [
        "你是电商产品图套版软件的控制型设计助手。",
        "你上一次返回的 JSON 漏掉了用户明确要求的新模板，这是错误。",
        "现在必须返回完整 JSON object，并且 templateCreations 至少包含 1 项，绝对不能是空数组。",
        `如果不确定，就基于 fromTemplateId="${baseTemplateId}" 创建 templateId="ai-hero-minimal-deep"。`,
        "templateCreations.patches 只能修改已有 layer id，优先复用上一轮 templatePatches 里的布局调整；如需要新元素，请在 newLayers 中新增 text/shape/table/icon。",
        "不要生成整张图，不要输出 Markdown。",
        "合法示例：",
        JSON.stringify({
          templateCreations: [
            {
              fromTemplateId: baseTemplateId,
              templateId: "ai-hero-minimal-deep",
              name: "AI 极简深蓝主图",
              reason: "用户明确要求创建一个新模板",
              patches: {
                "product-main": { x: 72, y: 500, width: 1296, height: 650 },
                "hero-title": { y: 390, fontSize: 96 },
                "invoice-panel": { visible: false },
                "invoice-text": { visible: false },
              },
              newLayers: [
                {
                  id: "ai-accent-pill",
                  type: "shape",
                  name: "AI 装饰胶囊",
                  shape: "pill",
                  x: 940,
                  y: 132,
                  width: 300,
                  height: 72,
                  fill: "#0b70b7",
                },
                {
                  id: "ai-accent-text",
                  type: "text",
                  name: "AI 新模板副标题",
                  text: "CUSTOM LAYOUT",
                  x: 955,
                  y: 150,
                  width: 270,
                  height: 42,
                  fontSize: 30,
                  fontFamily: "Arial, Helvetica, sans-serif",
                  color: "#ffffff",
                },
              ],
            },
          ],
        }),
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        "用户和上下文：",
        JSON.stringify(requestBody),
        "",
        "上一次计划：",
        JSON.stringify(previousPlan),
        "",
        "请保留上一次合理的 materialSelection/templatePatches/actions，同时补齐 templateCreations。只返回 JSON object。",
      ].join("\n"),
    },
  ];
}

async function callDeepSeek(
  options: Required<Pick<DeepSeekProxyOptions, "apiKey" | "model" | "apiBase">>,
  messages: DeepSeekMessage[],
): Promise<unknown> {
  const response = await fetch(`${options.apiBase.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model,
      messages,
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 3000,
      thinking: { type: "disabled" },
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof payload.error === "object" && payload.error && "message" in payload.error
      ? String((payload.error as { message?: unknown }).message)
      : `DeepSeek HTTP ${response.status}`;
    const error = new Error(message);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = choices[0] as { message?: { content?: string } } | undefined;
  const content = first?.message?.content ?? "";
  return extractJson(content);
}

export async function handleDeepSeekPlan(req: IncomingMessage, res: ServerResponse, options: DeepSeekProxyOptions) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "仅支持 POST。" });
    return;
  }

  if (!options.apiKey) {
    sendJson(res, 500, { error: "DEEPSEEK_API_KEY 未配置，无法调用真实 LLM。" });
    return;
  }

  const requestBody = await readJsonBody(req);
  const apiBase = options.apiBase ?? "https://api.deepseek.com";
  const model = options.model ?? "deepseek-v4-flash";
  const callOptions = { apiKey: options.apiKey, apiBase, model };

  let plan: unknown;
  try {
    plan = await callDeepSeek(callOptions, buildMessages(requestBody));
    if (needsTemplateCreation(requestBody, plan)) {
      const repairedPlan = await callDeepSeek(callOptions, buildTemplateCreationRepairMessages(requestBody, plan));
      plan = mergePlanWithRepair(plan, repairedPlan);
    }
    plan = ensureTemplateCreationWhenRequested(requestBody, plan);
    plan = discardTemplateCreationsUnlessRequested(requestBody, plan);
    plan = ensureRedThemeWhenRequested(requestBody, plan);
    plan = ensureDeepRedBoardWhenRequested(requestBody, plan);
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    sendJson(res, status, { error: error instanceof Error ? error.message : "DeepSeek 调用失败。" });
    return;
  }

  sendJson(res, 200, { provider: "deepseek", model, plan });
}

export function deepSeekProxyPlugin(options: DeepSeekProxyOptions) {
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    if (!req.url?.startsWith("/api/deepseek-plan")) {
      next();
      return;
    }

    handleDeepSeekPlan(req, res, options).catch((error) => {
      sendJson(res, 500, { error: error instanceof Error ? error.message : "DeepSeek 调用失败。" });
    });
  };

  return {
    name: "deepseek-plan-proxy",
    configureServer(server: { middlewares: Connect.Server }) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server: { middlewares: Connect.Server }) {
      server.middlewares.use(handler);
    },
  };
}
