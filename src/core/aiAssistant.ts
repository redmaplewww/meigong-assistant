import type {
  Layer,
  MaterialAsset,
  MaterialSelection,
  MaterialSlot,
  MaterialVariantCreation,
  Project,
  Sku,
  Template,
  TemplateKind,
} from "./types";
import { enforceTemplateSafety } from "./layoutSafety";
import {
  applyThemeToTemplate,
  buildThemeTemplatePatches,
  createPaletteFromPrimary,
  detectThemeFromPrompt,
  promptWantsRedBoard,
  type ThemePalette,
} from "./theme";

export type AssistantScope = "current-sku" | "all-skus";
export type AssistantProvider = "deepseek" | "local-rule";

export interface AssistantAction {
  id: string;
  title: string;
  detail: string;
}

export interface AssistantTemplateCreation {
  id: string;
  fromTemplateId: string;
  templateId: string;
  name: string;
  reason?: string;
  canvas?: Template["canvas"];
  background?: string;
  patches: Record<string, Partial<Layer>>;
  newLayers?: Layer[];
}

export interface AssistantDraft {
  id: string;
  name: string;
  prompt: string;
  scope: AssistantScope;
  summary: string;
  confidence: "high" | "medium" | "low";
  provider: AssistantProvider;
  model?: string;
  theme?: ThemePalette;
  materialCreations: MaterialVariantCreation[];
  materialSelection: MaterialSelection;
  templatePatches: Record<string, Record<string, Partial<Layer>>>;
  templateCreations: AssistantTemplateCreation[];
  actions: AssistantAction[];
  warnings: string[];
  createdAt: string;
}

export interface DraftContext {
  materials: MaterialAsset[];
  currentSelection: MaterialSelection;
  sku: Sku;
  scope: AssistantScope;
  templates?: Template[];
  catalog?: Sku[];
  project?: Project;
}

interface DeepSeekPlanResponse {
  plan: unknown;
  model?: string;
  provider?: AssistantProvider;
}

const materialSlots: MaterialSlot[] = [
  "bottom-board",
  "top-cap",
  "logo",
  "promo-badge",
  "content-card",
  "service-tile",
  "search-strip",
  "spec-pill",
];

const templateKinds: TemplateKind[] = ["hero", "specs", "drawing", "service", "white", "detail"];

const deepRedBoardReplacements = [
  { from: "#0b5f99", to: "#7f1420" },
  { from: "#0c75bd", to: "#b51e2c" },
  { from: "#12315a", to: "#4f0b15" },
  { from: "#0a4f82", to: "#6f101c" },
  { from: "#b8d4e8", to: "#e1aeb5" },
];

const slotNames: Record<MaterialSlot, string> = {
  "bottom-board": "底板",
  "top-cap": "顶板",
  logo: "LOGO",
  "promo-badge": "促销角标",
  "content-card": "详情卡片",
  "service-tile": "服务块",
  "search-strip": "搜索条",
  "spec-pill": "参数胶囊",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function safeText(value: unknown, fallback: string, maxLength = 160): string {
  const text = asString(value, fallback).replace(/\s+/g, " ").trim();
  return (text || fallback).slice(0, maxLength);
}

function clamp(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, value));
}

function safeColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (/^#[0-9a-f]{3,8}$/i.test(value)) return value;
  if (/^rgba?\([\d\s.,%]+\)$/i.test(value)) return value;
  return undefined;
}

const allowedFontFamilies = [
  '"Microsoft YaHei", "PingFang SC", Arial, sans-serif',
  '"Noto Sans SC", "Microsoft YaHei", sans-serif',
  '"SimHei", "Microsoft YaHei", sans-serif',
  '"SimSun", "Songti SC", serif',
  'Arial, Helvetica, sans-serif',
  'Georgia, "Times New Roman", serif',
];

function safeFontFamily(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > 96) return undefined;
  const matched = allowedFontFamilies.find((family) => family === normalized);
  return matched ?? undefined;
}

function maxZIndex(template: Template): number {
  return template.layers.reduce((max, layer) => Math.max(max, layer.zIndex), 0);
}

const explicitTemplateCreationPattern =
  /新模板|新版式|新图层|新增图层|创建图层|另做一版|多做一张|做一张|出一张|生成一张|新图|服务图|售后图|服务承诺|售后服务|创建模板|自己做模板|\bnew template\b|\btemplate variant\b|\badd layer\b|\bnew image\b|\bservice image\b|\bafter-sales\b/i;
const generatedDeliverablePattern =
  /((生成|做|出)(一张|一份|一个|新的?|全新)[^，。；\n]*(图|页面|页|模板|版式|主图|详情|参数|服务|售后|规则|政策|承诺)|(创建|新建)(一张|一份|一个)?[^，。；\n]*(图|页面|页|模板|版式|主图|详情|参数|服务|售后|规则|政策|承诺))/i;
const afterSalesRulesPattern =
  /(售后|退换|退货|换货|保修|质保)[^，。；\n]*(规则|政策|说明|条件|范围|可售后|不可售后|图|页面|页)|(规则|政策|说明|条件|范围)[^，。；\n]*(售后|退换|退货|换货|保修|质保)|(什么情况|哪些情况)[^，。；\n]*(售后|退换|退货|换货|保修|质保)/i;

function allowTemplateCreation(prompt: string): boolean {
  return (
    explicitTemplateCreationPattern.test(prompt) ||
    generatedDeliverablePattern.test(prompt) ||
    afterSalesRulesPattern.test(prompt)
  );
}

function promptRequestsMaterialCreation(prompt: string): boolean {
  return /(\u7d20\u6750\u5e93|\u7d20\u6750|\u521b\u5efa.*\u7d20\u6750|\u65b0\u5efa.*\u7d20\u6750|\u4fdd\u5b58.*\u7d20\u6750|\u52a0\u5165.*\u7d20\u6750|\bmaterial library\b|\bcreate material\b|\bsave material\b)/i.test(
    prompt,
  );
}

function isThemeVariantMaterialId(materialId: string): boolean {
  return /^(ai-|theme-).*(red|crimson|burgundy|theme|[0-9a-f]{6})/i.test(materialId);
}

function sanitizeTheme(rawTheme: unknown, prompt: string): ThemePalette | undefined {
  const raw = asRecord(rawTheme);
  const primary = safeColor(raw.primary) ?? safeColor(raw.primaryColor);
  if (primary?.startsWith("#")) {
    const palette = createPaletteFromPrimary(primary, safeText(raw.name, "AI 配色", 24));
    return {
      ...palette,
      secondary: safeColor(raw.secondary) ?? safeColor(raw.secondaryColor) ?? palette.secondary,
      accent: safeColor(raw.accent) ?? palette.accent,
      soft: safeColor(raw.soft) ?? palette.soft,
      stripe: safeColor(raw.stripe) ?? palette.stripe,
      border: safeColor(raw.border) ?? palette.border,
      textOnPrimary: safeColor(raw.textOnPrimary) ?? palette.textOnPrimary,
    };
  }
  return detectThemeFromPrompt(prompt);
}

function mergeTemplatePatches(
  base: AssistantDraft["templatePatches"],
  override: AssistantDraft["templatePatches"],
): AssistantDraft["templatePatches"] {
  const merged: AssistantDraft["templatePatches"] = { ...base };
  Object.entries(override).forEach(([templateId, layerPatches]) => {
    merged[templateId] = {
      ...(merged[templateId] ?? {}),
      ...layerPatches,
    };
  });
  return merged;
}

function safeSlug(value: unknown, fallback: string): string {
  const raw = asString(value, fallback).trim().toLowerCase();
  const slug = raw.replace(/[^a-z0-9\u4e00-\u9fa5-]+/gi, "-").replace(/^-+|-+$/g, "");
  return (slug || fallback).slice(0, 48);
}

function makeTitle(prompt: string): string {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  const shortName = cleaned ? cleaned.slice(0, 14) : "AI 套版方案";
  return `${shortName}${cleaned.length > 14 ? "..." : ""}`;
}

function hasAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word.toLowerCase()));
}

function patch(
  patches: AssistantDraft["templatePatches"],
  templateId: string,
  layerId: string,
  layerPatch: Partial<Layer>,
): void {
  patches[templateId] = patches[templateId] ?? {};
  patches[templateId][layerId] = {
    ...(patches[templateId][layerId] ?? {}),
    ...layerPatch,
  };
}

function selectMaterial(
  selection: MaterialSelection,
  materials: MaterialAsset[],
  slot: MaterialSlot,
  materialId: string,
  actions: AssistantAction[],
): void {
  const material = materials.find((item) => item.id === materialId && item.slot === slot);
  if (!material) return;
  selection[slot] = material.id;
  actions.push({
    id: `material-${slot}`,
    title: `替换${slotNames[slot]}`,
    detail: material.name,
  });
}

function materialMatchesText(material: MaterialAsset, words: string[]): boolean {
  const haystack = [material.id, material.name, ...material.tags].join(" ").toLowerCase();
  return words.some((word) => haystack.includes(word.toLowerCase()));
}

function chooseTemplateForPrompt(templates: Template[] | undefined, prompt: string): Template | undefined {
  const list = templates ?? [];
  if (!list.length) return undefined;
  const byId = (id: string) => list.find((template) => template.id === id);
  const byKind = (kind: TemplateKind) => list.find((template) => template.kind === kind);
  const pick = (ids: string[], kinds: TemplateKind[]) => ids.map(byId).find(Boolean) ?? kinds.map(byKind).find(Boolean);

  if (/工程|尺寸|图纸|外形/.test(prompt)) return pick(["drawing-size"], ["drawing"]) ?? list[0];
  if (/参数|表格|规格|性能/.test(prompt)) return pick(["spec-table"], ["specs"]) ?? list[0];
  if (/服务|承诺|售后|六宫格|after-sales|service/i.test(prompt)) return pick(["service-promise"], ["service"]) ?? list[0];
  if (/白底|纯白/.test(prompt)) return pick(["white-product"], ["white"]) ?? list[0];
  if (/详情|长图/.test(prompt)) return pick(["detail-page"], ["detail"]) ?? list[0];
  return byId("hero-main") ?? byKind("hero") ?? list[0];
}

function buildLocalTemplateCreationPatches(baseTemplate: Template, theme: ThemePalette | undefined): Record<string, Partial<Layer>> {
  const primary = theme?.primary ?? "#0b70b7";
  if (baseTemplate.kind === "service") {
    return {
      "service-title-cn": { y: 145, fontSize: 90, color: primary } as Partial<Layer>,
      "service-title-en": { y: 292, fontSize: 44, color: primary } as Partial<Layer>,
      "service-divider": { y: 388, fill: primary } as Partial<Layer>,
    };
  }
  if (baseTemplate.kind === "specs") {
    return {
      "spec-title-pill": { x: 280, y: 100, width: 880, fill: primary } as Partial<Layer>,
      "spec-title": { x: 380, y: 136, width: 680, fontSize: 66 } as Partial<Layer>,
      "specs-table": { x: 150, y: 335, width: 1140, height: 980, fontSize: 44 } as Partial<Layer>,
    };
  }
  if (baseTemplate.kind === "drawing") {
    return {
      "drawing-title": { y: 210, fontSize: 110, color: primary } as Partial<Layer>,
      "drawing-image": { x: 86, y: 410, width: 1268, height: 590 } as Partial<Layer>,
      "drawing-note": { y: 1060 } as Partial<Layer>,
    };
  }
  if (baseTemplate.kind === "white") {
    return {
      "white-product-image": { x: 48, y: 285, width: 1344, height: 850 } as Partial<Layer>,
    };
  }
  if (baseTemplate.kind === "detail") {
    return {
      "detail-title-cn": { fontSize: 84, color: primary } as Partial<Layer>,
      "detail-product": { x: 58, y: 500, width: 844, height: 455 } as Partial<Layer>,
      "detail-param-table": { fontSize: 28 } as Partial<Layer>,
    };
  }
  return {
    "hero-title": { y: 390, fontSize: 90, fontFamily: '"SimHei", "Microsoft YaHei", sans-serif' } as Partial<Layer>,
    "product-main": { x: 92, y: 500, width: 1256, height: 640 } as Partial<Layer>,
  };
}

function findExistingDeepRedBoard(materials: MaterialAsset[]): MaterialAsset | undefined {
  return materials.find((material) =>
    material.slot === "bottom-board" && materialMatchesText(material, ["深红", "酒红", "暗红", "red", "crimson", "burgundy"])
  );
}

function createDeepRedBottomBoardCreation(materials: MaterialAsset[]): MaterialVariantCreation | undefined {
  const existing = findExistingDeepRedBoard(materials);
  if (existing) return undefined;

  const base =
    materials.find((material) => material.id === "bottom-board-deep") ??
    materials.find((material) => material.slot === "bottom-board" && materialMatchesText(material, ["斜切", "deep"])) ??
    materials.find((material) => material.slot === "bottom-board");
  if (!base) return undefined;

  return {
    id: "material-ai-bottom-board-deep-red",
    slot: "bottom-board",
    fromMaterialId: base.id,
    materialId: "ai-bottom-board-deep-red",
    name: "深红斜切底板",
    reason: "素材库没有深红底板，基于现有斜切底板做确定性改色变体。",
    colorReplacements: deepRedBoardReplacements,
    tags: ["red", "deep-red", "深红", "斜切"],
  };
}

function summarizeTemplates(templates: Template[] | undefined) {
  return (templates ?? []).map((template) => ({
    id: template.id,
    kind: template.kind,
    name: template.name,
    canvas: template.canvas,
    background: template.background,
    layers: template.layers.map((layer) => ({
      id: layer.id,
      type: layer.type,
      name: layer.name,
      x: layer.x,
      y: layer.y,
      width: layer.width,
      height: layer.height,
      visible: layer.visible,
      zIndex: layer.zIndex,
      editable: layer.editable,
      locked: layer.locked,
      materialSlot: layer.type === "image" ? layer.materialSlot : undefined,
      assetRole: layer.type === "image" ? layer.assetRole : undefined,
      text: layer.type === "text" ? layer.text : undefined,
      shape: layer.type === "shape" ? layer.shape : undefined,
      color: layer.type === "text" || layer.type === "icon" ? layer.color : undefined,
      fill: layer.type === "shape" ? layer.fill : layer.type === "icon" ? layer.fill : undefined,
      stroke: layer.type === "shape" ? layer.stroke : undefined,
      headerFill: layer.type === "table" ? layer.headerFill : undefined,
      stripeFill: layer.type === "table" ? layer.stripeFill : undefined,
      borderColor: layer.type === "table" ? layer.borderColor : undefined,
      textColor: layer.type === "table" ? layer.textColor : undefined,
      fontSize: layer.type === "text" || layer.type === "table" ? layer.fontSize : undefined,
      fontFamily: layer.type === "text" || layer.type === "table" ? layer.fontFamily : undefined,
    })),
  }));
}

function summarizeSku(sku: Sku) {
  return {
    id: sku.id,
    code: sku.code,
    model: sku.model,
    title: sku.title,
    shortSpec: sku.shortSpec,
    subtitle: sku.subtitle,
    frequency: sku.frequency,
    vswr: sku.vswr,
    parameterCount: sku.parameters.length,
    hasProductTransparent: Boolean(sku.assets.productTransparent),
    hasDrawing: Boolean(sku.assets.drawing),
    detailSlices: sku.assets.detailSlices.length,
  };
}

function sanitizeMaterialSelection(
  rawSelection: unknown,
  currentSelection: MaterialSelection,
  materials: MaterialAsset[],
  materialCreations: MaterialVariantCreation[],
  warnings: string[],
): MaterialSelection {
  const selection: MaterialSelection = { ...currentSelection };
  const raw = asRecord(rawSelection);

  materialSlots.forEach((slot) => {
    const materialId = asString(raw[slot]);
    if (!materialId) return;
    const material = materials.find((item) => item.slot === slot && item.id === materialId);
    const createdMaterial = materialCreations.find((item) => item.slot === slot && item.materialId === materialId);
    if (material) selection[slot] = material.id;
    else if (createdMaterial) selection[slot] = createdMaterial.materialId;
    else warnings.push(`AI 请求了不存在的${slotNames[slot]}素材：${materialId}`);
  });

  return selection;
}

function stripThemeVariantMaterialSelection(rawSelection: unknown, materials: MaterialAsset[]): Record<string, unknown> {
  const raw = asRecord(rawSelection);
  return Object.fromEntries(
    Object.entries(raw).filter(([slot, materialId]) => {
      const id = asString(materialId);
      if (!id) return false;
      if (materials.some((material) => material.slot === slot && material.id === id)) return true;
      return !isThemeVariantMaterialId(id);
    }),
  );
}

function sanitizeMaterialCreations(
  rawCreations: unknown,
  materials: MaterialAsset[],
  warnings: string[],
): MaterialVariantCreation[] {
  const materialMap = new Map(materials.map((material) => [material.id, material]));
  const usedIds = new Set(materials.map((material) => material.id));

  return asArray(rawCreations)
    .slice(0, 6)
    .map((item, index) => {
      const raw = asRecord(item);
      const slot = asString(raw.slot) as MaterialSlot;
      if (!materialSlots.includes(slot)) {
        warnings.push(`AI 请求创建未知槽位素材：${slot || "(空)"}`);
        return undefined;
      }

      const fromMaterialId = asString(raw.fromMaterialId);
      const base = materialMap.get(fromMaterialId);
      if (!base || base.slot !== slot) {
        warnings.push(`AI 请求基于不存在或槽位不匹配的素材改色：${fromMaterialId || "(空)"}`);
        return undefined;
      }

      const colorReplacements = asArray(raw.colorReplacements)
        .map((replacement) => {
          const record = asRecord(replacement);
          const from = safeColor(record.from);
          const to = safeColor(record.to);
          return from && to ? { from, to } : undefined;
        })
        .filter(Boolean) as MaterialVariantCreation["colorReplacements"];

      if (!colorReplacements.length) {
        warnings.push(`AI 素材改色缺少有效颜色替换：${base.name}`);
        return undefined;
      }

      const requestedId = safeSlug(raw.materialId, `ai-${base.id}-${index + 1}`);
      let materialId = requestedId;
      let suffix = 2;
      while (usedIds.has(materialId)) {
        materialId = `${requestedId}-${suffix}`;
        suffix += 1;
      }
      usedIds.add(materialId);

      const tags = asArray(raw.tags)
        .map((tag) => asString(tag).trim())
        .filter(Boolean)
        .slice(0, 10);

      return {
        id: `material-${materialId}`,
        slot,
        fromMaterialId: base.id,
        materialId,
        name: safeText(raw.name, `AI ${base.name}`, 40),
        reason: safeText(raw.reason, "AI 创建的素材改色变体", 120),
        colorReplacements,
        tags,
      };
    })
    .filter(Boolean) as MaterialVariantCreation[];
}

function sanitizeLayerPatch(layer: Layer, rawPatch: unknown): Partial<Layer> {
  const raw = asRecord(rawPatch);
  const next: Record<string, unknown> = {};

  const visible = asBoolean(raw.visible);
  if (visible !== undefined) next.visible = visible;
  const editable = asBoolean(raw.editable);
  if (editable !== undefined) next.editable = editable;

  const x = clamp(raw.x, -300, 2000);
  const y = clamp(raw.y, -300, 3000);
  const width = clamp(raw.width, 1, 2600);
  const height = clamp(raw.height, 1, 4000);
  const opacity = clamp(raw.opacity, 0, 1);
  const scale = clamp(raw.scale, 0.2, 3);
  const rotation = clamp(raw.rotation, -45, 45);
  const zIndex = clamp(raw.zIndex, 0, 300);

  if (x !== undefined) next.x = Math.round(x);
  if (y !== undefined) next.y = Math.round(y);
  if (width !== undefined) next.width = Math.round(width);
  if (height !== undefined) next.height = Math.round(height);
  if (opacity !== undefined) next.opacity = Number(opacity.toFixed(2));
  if (scale !== undefined) next.scale = Number(scale.toFixed(2));
  if (rotation !== undefined) next.rotation = Number(rotation.toFixed(1));
  if (zIndex !== undefined) next.zIndex = Math.round(zIndex);

  if (layer.type === "text") {
    if (typeof raw.text === "string") next.text = raw.text.slice(0, 220);
    const fontSize = clamp(raw.fontSize, 10, 140);
    const fontWeight = clamp(raw.fontWeight, 100, 900);
    const lineHeight = clamp(raw.lineHeight, 0.8, 2);
    const color = safeColor(raw.color);
    const fontFamily = safeFontFamily(raw.fontFamily);
    if (fontSize !== undefined) next.fontSize = Math.round(fontSize);
    if (fontWeight !== undefined) next.fontWeight = Math.round(fontWeight / 100) * 100;
    if (lineHeight !== undefined) next.lineHeight = Number(lineHeight.toFixed(2));
    if (color) next.color = color;
    if (fontFamily) next.fontFamily = fontFamily;
    if (raw.align === "left" || raw.align === "center" || raw.align === "right") next.align = raw.align;
  }

  if (layer.type === "image") {
    if (raw.fit === "contain" || raw.fit === "cover" || raw.fit === "stretch") next.fit = raw.fit;
    if (typeof raw.shadow === "string" && raw.shadow.length < 120) next.shadow = raw.shadow;
  }

  if (layer.type === "shape") {
    const fill = safeColor(raw.fill);
    const stroke = safeColor(raw.stroke);
    const strokeWidth = clamp(raw.strokeWidth, 0, 24);
    const radius = clamp(raw.radius, 0, 220);
    if (raw.shape === "rect" || raw.shape === "pill" || raw.shape === "ellipse" || raw.shape === "line") next.shape = raw.shape;
    if (fill) next.fill = fill;
    if (stroke) next.stroke = stroke;
    if (strokeWidth !== undefined) next.strokeWidth = Math.round(strokeWidth);
    if (radius !== undefined) next.radius = Math.round(radius);
  }

  if (layer.type === "table") {
    const fontSize = clamp(raw.fontSize, 10, 70);
    const headerFill = safeColor(raw.headerFill);
    const stripeFill = safeColor(raw.stripeFill);
    const borderColor = safeColor(raw.borderColor);
    const textColor = safeColor(raw.textColor);
    const fontFamily = safeFontFamily(raw.fontFamily);
    if (fontSize !== undefined) next.fontSize = Math.round(fontSize);
    if (headerFill) next.headerFill = headerFill;
    if (stripeFill) next.stripeFill = stripeFill;
    if (borderColor) next.borderColor = borderColor;
    if (textColor) next.textColor = textColor;
    if (fontFamily) next.fontFamily = fontFamily;
  }

  if (layer.type === "icon") {
    const color = safeColor(raw.color);
    const fill = safeColor(raw.fill);
    const fontSize = clamp(raw.fontSize, 20, 120);
    if (color) next.color = color;
    if (fill) next.fill = fill;
    if (fontSize !== undefined) next.fontSize = Math.round(fontSize);
  }

  return next as Partial<Layer>;
}

function commonLayerFields(raw: Record<string, unknown>, template: Template, usedIds: Set<string>, fallbackId: string, zIndex: number) {
  const id = uniqueLayerId(safeSlug(raw.id, fallbackId), usedIds);
  return {
    id,
    name: safeText(raw.name, id, 40),
    source: "ai-generated" as const,
    visible: asBoolean(raw.visible) ?? true,
    locked: false,
    editable: true,
    x: Math.round(clamp(raw.x, -200, template.canvas.width + 200) ?? Math.round(template.canvas.width * 0.12)),
    y: Math.round(clamp(raw.y, -200, template.canvas.height + 200) ?? Math.round(template.canvas.height * 0.12)),
    width: Math.round(clamp(raw.width, 1, template.canvas.width * 1.5) ?? Math.round(template.canvas.width * 0.4)),
    height: Math.round(clamp(raw.height, 1, template.canvas.height * 1.5) ?? 120),
    opacity: Number((clamp(raw.opacity, 0, 1) ?? 1).toFixed(2)),
    scale: Number((clamp(raw.scale, 0.2, 3) ?? 1).toFixed(2)),
    rotation: Number((clamp(raw.rotation, -45, 45) ?? 0).toFixed(1)),
    zIndex: Math.round(clamp(raw.zIndex, 0, 300) ?? zIndex),
  };
}

function uniqueLayerId(baseId: string, usedIds: Set<string>): string {
  let id = baseId;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);
  return id;
}

function sanitizeNewLayer(rawLayer: unknown, template: Template, usedIds: Set<string>, index: number): Layer | undefined {
  const raw = asRecord(rawLayer);
  const type = asString(raw.type);
  const common = commonLayerFields(raw, template, usedIds, `ai-${type || "layer"}-${index + 1}`, maxZIndex(template) + index + 1);

  if (type === "text") {
    return {
      ...common,
      type: "text",
      text: asString(raw.text, "AI 新文字").slice(0, 260),
      fontSize: Math.round(clamp(raw.fontSize, 10, 160) ?? 56),
      fontWeight: Math.round((clamp(raw.fontWeight, 100, 900) ?? 700) / 100) * 100,
      color: safeColor(raw.color) ?? "#172033",
      align: raw.align === "left" || raw.align === "center" || raw.align === "right" ? raw.align : "center",
      lineHeight: Number((clamp(raw.lineHeight, 0.8, 2) ?? 1.16).toFixed(2)),
      fontFamily: safeFontFamily(raw.fontFamily) ?? allowedFontFamilies[0],
    };
  }

  if (type === "shape") {
    const shape = raw.shape === "rect" || raw.shape === "pill" || raw.shape === "ellipse" || raw.shape === "line" ? raw.shape : "rect";
    return {
      ...common,
      type: "shape",
      shape,
      fill: safeColor(raw.fill) ?? "#0b70b7",
      stroke: safeColor(raw.stroke),
      strokeWidth: Math.round(clamp(raw.strokeWidth, 0, 24) ?? 0),
      radius: Math.round(clamp(raw.radius, 0, 220) ?? (shape === "pill" ? common.height / 2 : 0)),
    };
  }

  if (type === "table") {
    const columns = asArray(raw.columns)
      .map((item) => safeText(item, "", 20))
      .filter(Boolean)
      .slice(0, 4);
    const rows = asArray(raw.rows)
      .map((item) => {
        const row = asRecord(item);
        return {
          label: safeText(row.label, "项目", 28),
          value: safeText(row.value, "参数", 40),
        };
      })
      .slice(0, 12);
    return {
      ...common,
      type: "table",
      columns: columns.length ? columns : ["项目", "参数"],
      rows: rows.length ? rows : [{ label: "接口类型", value: "SMA" }],
      headerFill: safeColor(raw.headerFill) ?? "#0b70b7",
      stripeFill: safeColor(raw.stripeFill) ?? "#eef6fb",
      borderColor: safeColor(raw.borderColor) ?? "#8bc2e8",
      textColor: safeColor(raw.textColor) ?? "#172033",
      fontSize: Math.round(clamp(raw.fontSize, 10, 80) ?? 36),
      fontFamily: safeFontFamily(raw.fontFamily) ?? allowedFontFamilies[0],
    };
  }

  if (type === "icon") {
    return {
      ...common,
      type: "icon",
      icon: safeText(raw.icon, "shield", 24),
      label: typeof raw.label === "string" ? raw.label.slice(0, 40) : undefined,
      color: safeColor(raw.color) ?? "#0b70b7",
      fill: safeColor(raw.fill),
      fontSize: Math.round(clamp(raw.fontSize, 20, 120) ?? 56),
    };
  }

  return undefined;
}

function sanitizeTemplatePatches(
  rawPatches: unknown,
  templates: Template[],
  warnings: string[],
): AssistantDraft["templatePatches"] {
  const patches: AssistantDraft["templatePatches"] = {};
  const raw = asRecord(rawPatches);
  const templateMap = new Map(templates.map((template) => [template.id, template]));

  Object.entries(raw).forEach(([templateId, rawLayerPatches]) => {
    const template = templateMap.get(templateId);
    if (!template) {
      warnings.push(`AI 请求修改不存在的模板：${templateId}`);
      return;
    }

    const layerMap = new Map(template.layers.map((layer) => [layer.id, layer]));
    Object.entries(asRecord(rawLayerPatches)).forEach(([layerId, rawPatch]) => {
      if (layerId === "background") return;
      const layer = layerMap.get(layerId);
      if (!layer) {
        warnings.push(`AI 请求修改不存在的图层：${template.name}/${layerId}`);
        return;
      }
      const safePatch = sanitizeLayerPatch(layer, rawPatch);
      if (Object.keys(safePatch).length) patch(patches, templateId, layerId, safePatch);
    });
  });

  return patches;
}

function sanitizeTemplateCreations(
  rawCreations: unknown,
  templates: Template[],
  warnings: string[],
): AssistantTemplateCreation[] {
  const templateMap = new Map(templates.map((template) => [template.id, template]));
  const usedIds = new Set(templates.map((template) => template.id));

  return asArray(rawCreations)
    .slice(0, 3)
    .map((item, index) => {
      const raw = asRecord(item);
      const fromTemplateId = asString(raw.fromTemplateId);
      const base = templateMap.get(fromTemplateId);
      if (!base) {
        warnings.push(`AI 请求基于不存在的模板创建新版式：${fromTemplateId || "(空)"}`);
        return undefined;
      }

      const requestedId = safeSlug(raw.templateId, `ai-template-${index + 1}`);
      let templateId = requestedId;
      let suffix = 2;
      while (usedIds.has(templateId)) {
        templateId = `${requestedId}-${suffix}`;
        suffix += 1;
      }
      usedIds.add(templateId);

      const layerPatches: Record<string, Partial<Layer>> = {};
      const layerMap = new Map(base.layers.map((layer) => [layer.id, layer]));
      Object.entries(asRecord(raw.patches)).forEach(([layerId, rawPatch]) => {
        const layer = layerMap.get(layerId);
        if (!layer) {
          warnings.push(`AI 新模板请求修改不存在的图层：${base.name}/${layerId}`);
          return;
        }
        const safePatch = sanitizeLayerPatch(layer, rawPatch);
        if (Object.keys(safePatch).length) layerPatches[layerId] = safePatch;
      });

      const usedLayerIds = new Set(base.layers.map((layer) => layer.id));
      const newLayers = asArray(raw.newLayers)
        .slice(0, 12)
        .map((rawLayer, layerIndex) => sanitizeNewLayer(rawLayer, base, usedLayerIds, layerIndex))
        .filter(Boolean) as Layer[];
      const rawCanvas = asRecord(raw.canvas);
      const canvasWidth = clamp(rawCanvas.width, 320, 2600);
      const canvasHeight = clamp(rawCanvas.height, 320, 6000);
      const canvas = canvasWidth && canvasHeight ? { width: Math.round(canvasWidth), height: Math.round(canvasHeight) } : undefined;

      return {
        id: `create-${templateId}`,
        fromTemplateId: base.id,
        templateId,
        name: safeText(raw.name, `AI ${base.name}`, 40),
        reason: safeText(raw.reason, "AI 创建的新模板", 120),
        canvas,
        background: safeColor(raw.background),
        patches: layerPatches,
        newLayers,
      };
    })
    .filter(Boolean) as AssistantTemplateCreation[];
}

function normalizeDeepSeekPlan(
  rawPlan: unknown,
  prompt: string,
  context: DraftContext,
  model?: string,
): AssistantDraft {
  const raw = asRecord(rawPlan);
  const warnings = asArray(raw.warnings)
    .map((item) => asString(item))
    .filter(Boolean)
    .slice(0, 8);
  const templates = context.templates ?? [];
  const theme = sanitizeTheme(raw.theme, prompt);
  const allowMaterialCreation = promptRequestsMaterialCreation(prompt);
  const materialCreations = sanitizeMaterialCreations(
    theme && !allowMaterialCreation ? [] : raw.materialCreations,
    context.materials,
    warnings,
  );
  const rawMaterialSelection = theme && !allowMaterialCreation
    ? stripThemeVariantMaterialSelection(raw.materialSelection, context.materials)
    : raw.materialSelection;
  const materialSelection = sanitizeMaterialSelection(
    rawMaterialSelection,
    context.currentSelection,
    context.materials,
    materialCreations,
    warnings,
  );
  const rawTemplatePatches = sanitizeTemplatePatches(raw.templatePatches, templates, warnings);
  const templatePatches = theme ? mergeTemplatePatches(rawTemplatePatches, buildThemeTemplatePatches(templates, theme)) : rawTemplatePatches;
  const rawTemplateCreations = asArray(raw.templateCreations);
  const templateCreations = allowTemplateCreation(prompt)
    ? sanitizeTemplateCreations(raw.templateCreations, templates, warnings)
    : [];
  if (!allowTemplateCreation(prompt) && rawTemplateCreations.length) {
    warnings.push("AI 返回了新模板创建指令，但当前请求是成品图套版，已改为应用到固定成品图。");
  }
  const actions = asArray(raw.actions)
    .slice(0, 12)
    .map((item, index) => {
      const action = asRecord(item);
      return {
        id: safeSlug(action.id, `action-${index + 1}`),
        title: safeText(action.title, "AI 调整"),
        detail: safeText(action.detail, "DeepSeek 生成的套版调整", 180),
      };
    });

  if (theme) {
    actions.push({
      id: `theme-${theme.id}`,
      title: `统一${theme.name}配色`,
      detail: "已同步文字、形状、表格和可改色 SVG 素材，避免蓝色组件残留。",
    });
  }

  if (materialCreations.length) {
    materialCreations.forEach((creation) => {
      actions.push({
        id: `new-material-${creation.materialId}`,
        title: "创建素材变体",
        detail: `${creation.name}：基于 ${creation.fromMaterialId} 改色并放入素材库`,
      });
    });
  }

  if (templateCreations.length) {
    templateCreations.forEach((creation) => {
      actions.push({
        id: `new-template-${creation.templateId}`,
        title: "创建新模板",
        detail: `${creation.name}：${creation.reason ?? "基于现有模板克隆并调整"}`,
      });
    });
  }

  const usefulActions = actions.length
    ? actions
    : [
        {
          id: "deepseek-plan",
          title: "DeepSeek 套版方案",
          detail: "DeepSeek 返回了结构化方案，已通过本地校验。",
        },
      ];

  const confidence = raw.confidence === "high" || raw.confidence === "medium" || raw.confidence === "low"
    ? raw.confidence
    : warnings.length
      ? "medium"
      : "high";

  return {
    id: `assistant-${Date.now()}`,
    name: safeText(raw.name, makeTitle(prompt), 40),
    prompt,
    scope: context.scope,
    summary: safeText(
      raw.summary,
      `${context.scope === "all-skus" ? "全部 SKU" : "当前 SKU"} 将应用 DeepSeek 生成的结构化套版方案。`,
      220,
    ),
    confidence,
    provider: "deepseek",
    model,
    theme,
    materialCreations,
    materialSelection,
    templatePatches,
    templateCreations,
    actions: usefulActions,
    warnings,
    createdAt: new Date().toISOString(),
  };
}

export async function requestDeepSeekAssistantDraft(prompt: string, context: DraftContext): Promise<AssistantDraft> {
  const response = await fetch("/api/deepseek-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      scope: context.scope,
      project: context.project
        ? {
            name: context.project.name,
            brand: context.project.brand,
            typography: context.project.typography,
            aiPolicy: context.project.aiPolicy,
          }
        : undefined,
      currentSku: summarizeSku(context.sku),
      catalog: (context.catalog ?? [context.sku]).slice(0, 40).map(summarizeSku),
      materials: context.materials.map((material) => ({
        id: material.id,
        slot: material.slot,
        kind: material.kind,
        name: material.name,
        tags: material.tags,
      })),
      currentSelection: context.currentSelection,
      templates: summarizeTemplates(context.templates),
    }),
  });

  const data = (await response.json().catch(() => ({}))) as DeepSeekPlanResponse & { error?: string };
  if (!response.ok) throw new Error(data.error || `DeepSeek 请求失败：HTTP ${response.status}`);
  return normalizeDeepSeekPlan(data.plan, prompt, context, data.model);
}

export function createAssistantDraft(prompt: string, context: DraftContext): AssistantDraft {
  const normalized = prompt.trim().toLowerCase();
  const selection: MaterialSelection = { ...context.currentSelection };
  const templatePatches: AssistantDraft["templatePatches"] = {};
  const materialCreations: MaterialVariantCreation[] = [];
  const actions: AssistantAction[] = [];
  const warnings: string[] = [];
  const templateCreations: AssistantTemplateCreation[] = [];
  const theme = detectThemeFromPrompt(prompt);

  if (theme) {
    Object.assign(templatePatches, mergeTemplatePatches(templatePatches, buildThemeTemplatePatches(context.templates ?? [], theme)));
    actions.push({
      id: `theme-${theme.id}`,
      title: `统一${theme.name}配色`,
      detail: "同步底板、参数胶囊、服务块、搜索条、LOGO、文字和参数表颜色，不改变素材库形状选择",
    });
    if (promptRequestsMaterialCreation(prompt) && promptWantsRedBoard(prompt)) {
      const existingRedBoard = findExistingDeepRedBoard(context.materials);
      if (existingRedBoard) {
        selectMaterial(selection, context.materials, "bottom-board", existingRedBoard.id, actions);
      } else {
        const creation = createDeepRedBottomBoardCreation(context.materials);
        if (creation) {
          materialCreations.push(creation);
          selection["bottom-board"] = creation.materialId;
          actions.push({
            id: "material-create-deep-red-board",
            title: "创建深红底板素材",
            detail: `用户明确要求保存素材，基于 ${creation.fromMaterialId} 改色并加入素材库`,
          });
        }
      }
    }
  } else if (promptRequestsMaterialCreation(prompt) && (promptWantsRedBoard(prompt) || hasAny(normalized, ["深红", "酒红", "暗红", "红色底板", "红底板", "红色"]))) {
    const existingRedBoard = findExistingDeepRedBoard(context.materials);
    if (existingRedBoard) {
      selectMaterial(selection, context.materials, "bottom-board", existingRedBoard.id, actions);
    } else {
      const creation = createDeepRedBottomBoardCreation(context.materials);
      if (creation) {
        materialCreations.push(creation);
        selection["bottom-board"] = creation.materialId;
        actions.push({
          id: "material-create-deep-red-board",
          title: "创建深红底板",
          detail: `素材库没有深红底板，基于 ${creation.fromMaterialId} 改色并加入素材库`,
        });
      } else {
        warnings.push("素材库里没有可用于改色的底板，无法自动创建深红底板。");
      }
    }
  } else if (hasAny(normalized, ["深蓝", "高级", "稳重", "商务", "斜切", "科技"])) {
    selectMaterial(selection, context.materials, "bottom-board", "bottom-board-deep", actions);
  } else if (hasAny(normalized, ["经典", "蓝白", "默认", "清爽"])) {
    selectMaterial(selection, context.materials, "bottom-board", "bottom-board-classic", actions);
  }

  if (hasAny(normalized, ["方章", "印章", "小标", "图标logo"])) {
    selectMaterial(selection, context.materials, "logo", "logo-wayiii-stamp", actions);
  } else if (hasAny(normalized, ["完整logo", "品牌名", "经典logo"])) {
    selectMaterial(selection, context.materials, "logo", "logo-wayiii-classic", actions);
  }

  if (hasAny(normalized, ["产品放大", "主体放大", "产品更大", "突出产品", "产品突出", "主图突出"])) {
    patch(templatePatches, "hero-main", "product-main", { x: 62, y: 510, width: 1316, height: 650, scale: 1 } as Partial<Layer>);
    patch(templatePatches, "white-product", "white-product-image", { x: 48, y: 300, width: 1344, height: 840, scale: 1 } as Partial<Layer>);
    patch(templatePatches, "detail-page", "detail-product", { x: 58, y: 500, width: 844, height: 455, scale: 1 } as Partial<Layer>);
    actions.push({
      id: "layout-product-large",
      title: "放大产品主体",
      detail: "主图、白底图和详情首屏同步放大产品层",
    });
  }

  if (hasAny(normalized, ["留白", "极简", "干净", "少字", "简洁"])) {
    patch(templatePatches, "hero-main", "hero-title", { y: 402, fontSize: 80 } as Partial<Layer>);
    patch(templatePatches, "hero-main", "invoice-panel", { visible: false } as Partial<Layer>);
    patch(templatePatches, "hero-main", "invoice-text", { visible: false } as Partial<Layer>);
    patch(templatePatches, "hero-main", "shipping-text", { x: 370, width: 980, fontSize: 64 } as Partial<Layer>);
    actions.push({
      id: "layout-clean",
      title: "简化主图信息",
      detail: "隐藏促销角标并收紧标题/底部承诺",
    });
  }

  if (hasAny(normalized, ["开票", "促销", "发票", "卖点", "免费"])) {
    patch(templatePatches, "hero-main", "invoice-panel", { visible: true } as Partial<Layer>);
    patch(templatePatches, "hero-main", "invoice-text", { visible: true, text: "免费\n开票" } as Partial<Layer>);
    patch(templatePatches, "hero-main", "shipping-text", { text: "工厂直发 顺丰速达" } as Partial<Layer>);
    actions.push({
      id: "promo-visible",
      title: "保留促销角标",
      detail: "主图保留免费开票和底部承诺",
    });
  }

  if (hasAny(normalized, ["标题大", "大字", "醒目", "标题突出"])) {
    patch(templatePatches, "hero-main", "hero-title", { fontSize: 94, y: 405 } as Partial<Layer>);
    patch(templatePatches, "detail-page", "detail-title-cn", { fontSize: 82 } as Partial<Layer>);
    actions.push({
      id: "text-title-large",
      title: "增强标题",
      detail: "主图和详情标题使用更大的字号",
    });
  }

  if (hasAny(normalized, ["标题小", "长标题", "文字多", "不溢出"])) {
    patch(templatePatches, "hero-main", "hero-title", { fontSize: 74, y: 420, height: 120 } as Partial<Layer>);
    patch(templatePatches, "spec-table", "specs-table", { fontSize: 42 } as Partial<Layer>);
    actions.push({
      id: "text-fit",
      title: "降低溢出风险",
      detail: "长标题和参数表降低字号",
    });
  }

  if (hasAny(normalized, ["工程图", "尺寸图", "尺寸", "图纸"])) {
    patch(templatePatches, "drawing-size", "drawing-image", { x: 86, y: 420, width: 1268, height: 560 } as Partial<Layer>);
    patch(templatePatches, "drawing-size", "drawing-note", { y: 1062, text: "尺寸(mm),一般公差(±0.1)" } as Partial<Layer>);
    actions.push({
      id: "drawing-focus",
      title: "强化工程图",
      detail: "工程图页扩大尺寸图区域",
    });
  }

  if (hasAny(normalized, ["参数", "表格", "规格", "性能"])) {
    patch(templatePatches, "spec-table", "specs-table", { fontSize: 44 } as Partial<Layer>);
    patch(templatePatches, "detail-page", "detail-param-table", { fontSize: 28 } as Partial<Layer>);
    actions.push({
      id: "table-fit",
      title: "优化参数表",
      detail: "参数表字号适配批量规格字段",
    });
  }

  if (hasAny(normalized, ["新模板", "新版式", "另做一版", "多做一张"])) {
    actions.push({
      id: "new-template-local",
      title: "创建新模板",
      detail: "本地规则助手不创建新模板；DeepSeek 模式会基于现有模板克隆新版式。",
    });
    warnings.push("当前是本地后备方案，新模板能力需要 DeepSeek 接口返回结构化模板创建指令。");
  }

  if (allowTemplateCreation(prompt) && !templateCreations.length) {
    const baseTemplate = chooseTemplateForPrompt(context.templates, prompt);
    if (baseTemplate) {
      const templateId = `ai-${baseTemplate.id}-${Date.now()}`;
      templateCreations.push({
        id: `create-${templateId}`,
        fromTemplateId: baseTemplate.id,
        templateId,
        name: `AI 新版式 ${baseTemplate.name}`,
        reason: "用户要求生成新的成品图/模板，本地后备基于最匹配的现有模板克隆并保留可编辑图层。",
        patches: buildLocalTemplateCreationPatches(baseTemplate, theme),
        newLayers: [
          {
            id: "ai-accent-pill",
            type: "shape",
            name: "AI 装饰胶囊",
            source: "ai-generated",
            visible: true,
            locked: false,
            editable: true,
            x: 940,
            y: 132,
            width: 300,
            height: 72,
            opacity: 1,
            scale: 1,
            rotation: 0,
            zIndex: 70,
            shape: "pill",
            fill: theme?.primary ?? "#b51e2c",
            stroke: "#ffffff",
            strokeWidth: 0,
            radius: 36,
          },
          {
            id: "ai-accent-text",
            type: "text",
            name: "AI 新模板副标题",
            source: "ai-generated",
            visible: true,
            locked: false,
            editable: true,
            x: 955,
            y: 150,
            width: 270,
            height: 42,
            opacity: 1,
            scale: 1,
            rotation: 0,
            zIndex: 71,
            text: "CUSTOM LAYOUT",
            fontSize: 30,
            fontWeight: 800,
            color: "#ffffff",
            align: "center",
            lineHeight: 1.1,
            fontFamily: "Arial, Helvetica, sans-serif",
          },
        ],
      });
      actions.push({
        id: "new-template-local-ready",
        title: "创建新模板",
        detail: `基于 ${baseTemplate.name} 克隆新版式，并新增装饰胶囊和副标题文字图层。`,
      });
    }
  }

  if (!actions.length) {
    actions.push({
      id: "task-inferred",
      title: "按任务类型生成方案",
      detail: "保留当前模板套装并按现有 SKU、素材和图层配置进行批量套版",
    });
  }

  if (!context.sku.assets.productTransparent) warnings.push("当前 SKU 缺少透明产品图，AI 方案会保留质检提醒。");

  return {
    id: `assistant-${Date.now()}`,
    name: makeTitle(prompt),
    prompt,
    scope: context.scope,
    summary: `${context.scope === "all-skus" ? "全部 SKU" : "当前 SKU"} 将应用 ${actions.length} 项套版调整，结果仍由真实素材、模板图层和文字渲染合成。`,
    confidence: warnings.length ? "medium" : "high",
    provider: "local-rule",
    theme,
    materialCreations,
    materialSelection: selection,
    templatePatches,
    templateCreations,
    actions: templateCreations.length ? actions.filter((action) => action.id !== "new-template-local") : actions,
    warnings: templateCreations.length ? warnings.filter((warning) => !/DeepSeek|本地后备/.test(warning)) : warnings,
    createdAt: new Date().toISOString(),
  };
}

export function applyTemplatePatchesToTemplate(
  template: Template,
  templatePatches: AssistantDraft["templatePatches"],
): Template {
  const patches = templatePatches[template.id];
  if (!patches) return template;

  return {
    ...template,
    layers: template.layers.map((layer) => {
      const layerPatch = patches[layer.id];
      return layerPatch ? ({ ...layer, ...layerPatch } as Layer) : layer;
    }),
  };
}

export function applyTemplateCreationsToTemplates(
  templates: Template[],
  creations: AssistantTemplateCreation[] | undefined,
): Template[] {
  if (!creations?.length) return templates;
  const existingIds = new Set(templates.map((template) => template.id));
  const created = creations
    .filter((creation) => !existingIds.has(creation.templateId))
    .map((creation) => {
      const base = templates.find((template) => template.id === creation.fromTemplateId);
      if (!base) return undefined;
      existingIds.add(creation.templateId);
      const patchedLayers = base.layers.map((layer) => {
        const layerPatch = creation.patches[layer.id];
        return layerPatch ? ({ ...layer, ...layerPatch } as Layer) : layer;
      });
      return {
        ...base,
        id: creation.templateId,
        name: creation.name,
        canvas: creation.canvas ?? base.canvas,
        background: creation.background ?? base.background,
        layers: [...patchedLayers, ...(creation.newLayers ?? [])],
      };
    })
    .filter(Boolean) as Template[];

  return [...templates, ...created];
}

export function applyAssistantDraftToTemplate(template: Template, draft: AssistantDraft): Template {
  const patched = applyTemplatePatchesToTemplate(template, draft.templatePatches);
  const themed = draft.theme ? applyThemeToTemplate(patched, draft.theme) : patched;
  return enforceTemplateSafety(themed);
}
