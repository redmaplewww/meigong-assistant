import type { Layer, MaterialSlot, Template } from "./types";

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
  if (redIntentPattern.test(prompt) && (themeIntentPattern.test(prompt) || promptWantsRedBoard(prompt))) return redTheme;
  return undefined;
}

export function promptWantsRedBoard(prompt: string): boolean {
  return redBoardPattern.test(prompt) || (redIntentPattern.test(prompt) && /\u5e95\u677f|board/i.test(prompt));
}

export function themeColorReplacements(palette: ThemePalette, previousPalette?: ThemePalette): Array<{ from: string; to: string }> {
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
    ...(previousPalette
      ? [
          { from: previousPalette.primary, to: palette.primary },
          { from: previousPalette.secondary, to: palette.secondary },
          { from: previousPalette.accent, to: palette.accent },
          { from: previousPalette.soft, to: palette.soft },
          { from: previousPalette.stripe, to: palette.stripe },
          { from: previousPalette.border, to: palette.border },
        ]
      : []),
  ];
  const seen = new Set<string>();
  return replacements.filter((replacement) => {
    const key = replacement.from.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return normalizeColor(replacement.from) !== normalizeColor(replacement.to);
  });
}

const primaryColors = new Set(["#0b70b7", "#0a66a9", "#0b5f99", "#0c75bd", "#0872b8", "#2f8ac4"].map(normalizeColor));
const secondaryColors = new Set(["#18315f", "#12315a", "#063f68", "#0a4f82"].map(normalizeColor));
const softColors = new Set(["#eef3f8", "#eef6fb", "#e5eef5", "#e5eff7"].map(normalizeColor));
const stripeColors = new Set(["#d7dde6"].map(normalizeColor));
const borderColors = new Set(["#b9c4d2", "#9fb2c4", "#9db9cc", "#b8d4e8"].map(normalizeColor));
const themeableImageSlots = new Set<MaterialSlot>(["bottom-board", "top-cap", "logo", "promo-badge", "service-tile", "search-strip", "spec-pill"]);

function themedColor(value: string | undefined, palette: ThemePalette, previousPalette?: ThemePalette): string | undefined {
  if (!value) return value;
  const normalized = normalizeColor(value);
  if (previousPalette) {
    if (normalized === normalizeColor(previousPalette.primary)) return palette.primary;
    if (normalized === normalizeColor(previousPalette.secondary)) return palette.secondary;
    if (normalized === normalizeColor(previousPalette.accent)) return palette.accent;
    if (normalized === normalizeColor(previousPalette.soft)) return palette.soft;
    if (normalized === normalizeColor(previousPalette.stripe)) return palette.stripe;
    if (normalized === normalizeColor(previousPalette.border)) return palette.border;
  }
  if (primaryColors.has(normalized)) return palette.primary;
  if (secondaryColors.has(normalized)) return palette.secondary;
  if (softColors.has(normalized)) return palette.soft;
  if (stripeColors.has(normalized)) return palette.stripe;
  if (borderColors.has(normalized)) return palette.border;
  return value;
}

function applyThemeToLayer(layer: Layer, palette: ThemePalette, previousPalette?: ThemePalette): Layer {
  if (layer.type === "image") {
    if (!layer.materialSlot || !themeableImageSlots.has(layer.materialSlot)) return layer;
    return { ...layer, colorReplacements: themeColorReplacements(palette, previousPalette) };
  }
  if (layer.type === "text") return { ...layer, color: themedColor(layer.color, palette, previousPalette) ?? layer.color };
  if (layer.type === "shape") {
    return {
      ...layer,
      fill: themedColor(layer.fill, palette, previousPalette) ?? layer.fill,
      stroke: themedColor(layer.stroke, palette, previousPalette) ?? layer.stroke,
    };
  }
  if (layer.type === "table") {
    return {
      ...layer,
      headerFill: themedColor(layer.headerFill, palette, previousPalette) ?? layer.headerFill,
      stripeFill: themedColor(layer.stripeFill, palette, previousPalette) ?? layer.stripeFill,
      borderColor: themedColor(layer.borderColor, palette, previousPalette) ?? layer.borderColor,
      textColor: themedColor(layer.textColor, palette, previousPalette) ?? layer.textColor,
    };
  }
  if (layer.type === "icon") {
    return {
      ...layer,
      color: themedColor(layer.color, palette, previousPalette) ?? layer.color,
      fill: themedColor(layer.fill, palette, previousPalette) ?? layer.fill,
    };
  }
  return layer;
}

export function applyThemeToTemplate(template: Template, palette: ThemePalette, previousPalette?: ThemePalette): Template {
  return {
    ...template,
    background: themedColor(template.background, palette, previousPalette) ?? template.background,
    layers: template.layers.map((layer) => applyThemeToLayer(layer, palette, previousPalette)),
  };
}

function diffLayer(before: Layer, after: Layer): Partial<Layer> {
  const patch: Record<string, unknown> = {};
  Object.entries(after).forEach(([key, value]) => {
    if ((before as unknown as Record<string, unknown>)[key] !== value) patch[key] = value;
  });
  return patch as Partial<Layer>;
}

export function buildThemeTemplatePatches(
  templates: Template[],
  palette: ThemePalette,
  previousPalette?: ThemePalette,
): Record<string, Record<string, Partial<Layer>>> {
  const patches: Record<string, Record<string, Partial<Layer>>> = {};
  templates.forEach((template) => {
    const themed = applyThemeToTemplate(template, palette, previousPalette);
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
