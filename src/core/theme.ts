import type { Layer, MaterialAsset, MaterialSelection, MaterialSlot, MaterialVariantCreation, Template } from "./types";

export interface ThemePalette {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  soft: string;
  stripe: string;
  border: string;
  textOnPrimary: string;
}

export interface ThemeMaterialPlan {
  materialCreations: MaterialVariantCreation[];
  materialSelection: MaterialSelection;
}

const redIntentPattern = /(\u6df1\u7ea2|\u9152\u7ea2|\u6697\u7ea2|\u7ea2\u8272|\u7ea2\u8272\u7cfb|red|crimson|burgundy)/i;
const themeIntentPattern = /(\u914d\u8272|\u7edf\u4e00|\u6574\u4f53|\u5168\u5c40|\u5168\u5957|\u98ce\u683c|\u989c\u8272|\u8272\u7cfb)/i;
const redBoardPattern = /(\u6df1\u7ea2\u5e95\u677f|\u9152\u7ea2\u5e95\u677f|\u6697\u7ea2\u5e95\u677f|\u7ea2\u8272\u5e95\u677f|\u7ea2\u5e95\u677f|red board|crimson board|burgundy board)/i;

export const redTheme: ThemePalette = {
  id: "red",
  name: "红色",
  primary: "#b51e2c",
  secondary: "#4f0b15",
  accent: "#7f1420",
  soft: "#f9eaec",
  stripe: "#f5d9de",
  border: "#d8a3aa",
  textOnPrimary: "#ffffff",
};

function normalizeColor(value: string): string {
  return value.trim().toLowerCase();
}

function parseHex(value: string): [number, number, number] | undefined {
  const hex = value.replace("#", "").trim();
  if (!/^[0-9a-f]{6}$/i.test(hex)) return undefined;
  return [Number.parseInt(hex.slice(0, 2), 16), Number.parseInt(hex.slice(2, 4), 16), Number.parseInt(hex.slice(4, 6), 16)];
}

function toHex(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
}

function mix(from: string, to: string, amount: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  if (!a || !b) return from;
  return `#${toHex(a[0] + (b[0] - a[0]) * amount)}${toHex(a[1] + (b[1] - a[1]) * amount)}${toHex(
    a[2] + (b[2] - a[2]) * amount,
  )}`;
}

export function createPaletteFromPrimary(primary: string, name = "自定义配色"): ThemePalette {
  const safePrimary = /^#[0-9a-f]{6}$/i.test(primary) ? primary : "#0b70b7";
  const id = safePrimary.replace("#", "").toLowerCase();
  return {
    id,
    name,
    primary: safePrimary,
    secondary: mix(safePrimary, "#000000", 0.58),
    accent: mix(safePrimary, "#000000", 0.28),
    soft: mix(safePrimary, "#ffffff", 0.9),
    stripe: mix(safePrimary, "#ffffff", 0.84),
    border: mix(safePrimary, "#ffffff", 0.58),
    textOnPrimary: "#ffffff",
  };
}

export function detectThemeFromPrompt(prompt: string): ThemePalette | undefined {
  if (redIntentPattern.test(prompt) && themeIntentPattern.test(prompt)) return redTheme;
  return undefined;
}

export function promptWantsRedBoard(prompt: string): boolean {
  return redBoardPattern.test(prompt) || (redIntentPattern.test(prompt) && /\u5e95\u677f|board/i.test(prompt));
}

export function themeColorReplacements(palette: ThemePalette): Array<{ from: string; to: string }> {
  const replacements = [
    { from: "#0b70b7", to: palette.primary },
    { from: "#0a66a9", to: palette.accent },
    { from: "#0b5f99", to: palette.accent },
    { from: "#0c75bd", to: palette.primary },
    { from: "#12315a", to: palette.secondary },
    { from: "#0a4f82", to: palette.accent },
    { from: "#18315f", to: palette.secondary },
    { from: "#063f68", to: palette.secondary },
    { from: "#0872b8", to: palette.primary },
    { from: "#2f8ac4", to: mix(palette.primary, "#ffffff", 0.2) },
    { from: "#8bc2e8", to: mix(palette.primary, "#ffffff", 0.55) },
    { from: "#6aa1c7", to: mix(palette.primary, "#ffffff", 0.34) },
    { from: "#6098bf", to: mix(palette.primary, "#ffffff", 0.28) },
    { from: "#b8d4e8", to: palette.border },
    { from: "#9db9cc", to: palette.border },
    { from: "#9fb2c4", to: palette.border },
    { from: "#d7dde6", to: palette.stripe },
    { from: "#eef3f8", to: palette.soft },
    { from: "#eef6fb", to: palette.soft },
    { from: "#e5eef5", to: palette.soft },
    { from: "#e5eff7", to: palette.soft },
  ];
  const seen = new Set<string>();
  return replacements.filter((replacement) => {
    const key = replacement.from.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return normalizeColor(replacement.from) !== normalizeColor(replacement.to);
  });
}

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

const preferredMaterialIds: Partial<Record<MaterialSlot, string[]>> = {
  "bottom-board": ["bottom-board-deep", "bottom-board-classic"],
  "top-cap": ["top-cap-blue-panel"],
  logo: ["logo-wayiii-classic", "logo-wayiii-stamp"],
  "promo-badge": ["promo-badge-soft"],
  "service-tile": ["service-tile-blue"],
  "search-strip": ["search-strip-blue"],
  "spec-pill": ["spec-pill-blue"],
};

function pickThemeBaseMaterial(materials: MaterialAsset[], selection: MaterialSelection, slot: MaterialSlot): MaterialAsset | undefined {
  const preferred = preferredMaterialIds[slot] ?? [];
  return (
    preferred.map((id) => materials.find((material) => material.id === id && material.slot === slot)).find(Boolean) ??
    materials.find((material) => material.id === selection[slot] && material.slot === slot) ??
    materials.find((material) => material.slot === slot)
  );
}

function themedMaterialId(base: MaterialAsset, palette: ThemePalette): string {
  if (palette.id === "red" && base.id === "bottom-board-deep") return "ai-bottom-board-deep-red";
  if (palette.id === "red" && base.id === "spec-pill-blue") return "ai-spec-pill-red";
  if (palette.id === "red" && base.id === "service-tile-blue") return "ai-service-tile-red";
  if (palette.id === "red" && base.id === "search-strip-blue") return "ai-search-strip-red";
  if (palette.id === "red" && base.id === "promo-badge-soft") return "ai-promo-badge-red";
  if (palette.id === "red" && base.id === "top-cap-blue-panel") return "ai-top-cap-red";
  if (palette.id === "red" && base.slot === "logo") return `ai-${base.id}-red`;
  return `theme-${base.id}-${palette.id}-${palette.primary.replace("#", "").toLowerCase()}`.slice(0, 52);
}

export function createThemeMaterialPlan(
  materials: MaterialAsset[],
  currentSelection: MaterialSelection,
  palette: ThemePalette,
): ThemeMaterialPlan {
  const selection: MaterialSelection = { ...currentSelection };
  const materialCreations: MaterialVariantCreation[] = [];
  const targetSlots: MaterialSlot[] = ["bottom-board", "top-cap", "logo", "promo-badge", "service-tile", "search-strip", "spec-pill"];

  targetSlots.forEach((slot) => {
    const base = pickThemeBaseMaterial(materials, selection, slot);
    if (!base) return;
    const materialId = themedMaterialId(base, palette);
    selection[slot] = materialId;
    if (materials.some((material) => material.id === materialId)) return;
    materialCreations.push({
      id: `material-${materialId}`,
      slot,
      fromMaterialId: base.id,
      materialId,
      name: `${palette.name}${slotNames[slot]}`,
      reason: `基于 ${base.name} 生成${palette.name}配色变体`,
      colorReplacements: themeColorReplacements(palette),
      tags: ["theme", `theme:${palette.id}`, palette.id, palette.name],
    });
  });

  return { materialCreations, materialSelection: selection };
}

const primaryColors = new Set(["#0b70b7", "#0a66a9", "#0b5f99", "#0c75bd", "#0872b8", "#2f8ac4"].map(normalizeColor));
const secondaryColors = new Set(["#18315f", "#12315a", "#063f68", "#0a4f82"].map(normalizeColor));
const softColors = new Set(["#eef3f8", "#eef6fb", "#e5eef5", "#e5eff7"].map(normalizeColor));
const stripeColors = new Set(["#d7dde6"].map(normalizeColor));
const borderColors = new Set(["#b9c4d2", "#9fb2c4", "#9db9cc", "#b8d4e8"].map(normalizeColor));

function themedColor(value: string | undefined, palette: ThemePalette): string | undefined {
  if (!value) return value;
  const normalized = normalizeColor(value);
  if (primaryColors.has(normalized)) return palette.primary;
  if (secondaryColors.has(normalized)) return palette.secondary;
  if (softColors.has(normalized)) return palette.soft;
  if (stripeColors.has(normalized)) return palette.stripe;
  if (borderColors.has(normalized)) return palette.border;
  return value;
}

function applyThemeToLayer(layer: Layer, palette: ThemePalette): Layer {
  if (layer.type === "text") return { ...layer, color: themedColor(layer.color, palette) ?? layer.color };
  if (layer.type === "shape") {
    return {
      ...layer,
      fill: themedColor(layer.fill, palette) ?? layer.fill,
      stroke: themedColor(layer.stroke, palette) ?? layer.stroke,
    };
  }
  if (layer.type === "table") {
    return {
      ...layer,
      headerFill: themedColor(layer.headerFill, palette) ?? layer.headerFill,
      stripeFill: themedColor(layer.stripeFill, palette) ?? layer.stripeFill,
      borderColor: themedColor(layer.borderColor, palette) ?? layer.borderColor,
      textColor: themedColor(layer.textColor, palette) ?? layer.textColor,
    };
  }
  if (layer.type === "icon") {
    return {
      ...layer,
      color: themedColor(layer.color, palette) ?? layer.color,
      fill: themedColor(layer.fill, palette) ?? layer.fill,
    };
  }
  return layer;
}

export function applyThemeToTemplate(template: Template, palette: ThemePalette): Template {
  return {
    ...template,
    background: themedColor(template.background, palette) ?? template.background,
    layers: template.layers.map((layer) => applyThemeToLayer(layer, palette)),
  };
}

function diffLayer(before: Layer, after: Layer): Partial<Layer> {
  const patch: Record<string, unknown> = {};
  Object.entries(after).forEach(([key, value]) => {
    if ((before as unknown as Record<string, unknown>)[key] !== value) patch[key] = value;
  });
  return patch as Partial<Layer>;
}

export function buildThemeTemplatePatches(templates: Template[], palette: ThemePalette): Record<string, Record<string, Partial<Layer>>> {
  const patches: Record<string, Record<string, Partial<Layer>>> = {};
  templates.forEach((template) => {
    const themed = applyThemeToTemplate(template, palette);
    themed.layers.forEach((layer, index) => {
      const before = template.layers[index];
      const patch = diffLayer(before, layer);
      if (Object.keys(patch).length) {
        patches[template.id] = patches[template.id] ?? {};
        patches[template.id][layer.id] = patch;
      }
    });
  });
  return patches;
}
