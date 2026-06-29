import type { ImageLayer, Layer, Template, TextLayer } from "./types";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function estimateLineWidth(text: string, fontSize: number): number {
  return Array.from(text).reduce((total, char) => {
    if (/[\u3400-\u9fff]/.test(char)) return total + fontSize;
    if (/\s/.test(char)) return total + fontSize * 0.28;
    return total + fontSize * 0.56;
  }, 0);
}

function textHeight(layer: TextLayer, fontSize = layer.fontSize): number {
  return Math.max(1, layer.text.split("\n").length) * fontSize * layer.lineHeight;
}

function fitTextToBox(layer: TextLayer, minFontSize: number): TextLayer {
  let fontSize = layer.fontSize;
  const lines = layer.text.split("\n");
  while (
    fontSize > minFontSize &&
    (Math.max(...lines.map((line) => estimateLineWidth(line, fontSize))) > layer.width || textHeight(layer, fontSize) > layer.height)
  ) {
    fontSize -= 2;
  }

  const requiredHeight = Math.ceil(textHeight(layer, fontSize) + 8);
  return {
    ...layer,
    fontSize,
    height: Math.max(layer.height, requiredHeight),
  };
}

function layerRect(layer: Layer): Rect {
  return { x: layer.x, y: layer.y, width: layer.width * layer.scale, height: layer.height * layer.scale };
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function clampImageInsideCanvas(layer: ImageLayer, template: Template, margin: number): ImageLayer {
  const maxWidth = template.canvas.width - margin * 2;
  const width = Math.min(layer.width, maxWidth);
  const x = Math.max(margin, Math.min(template.canvas.width - margin - width, layer.x));
  return { ...layer, x: Math.round(x), width: Math.round(width) };
}

function updateLayer(layers: Layer[], nextLayer: Layer): Layer[] {
  return layers.map((layer) => (layer.id === nextLayer.id ? nextLayer : layer));
}

function enforceHeroSafety(template: Template): Template {
  let layers = [...template.layers];
  const title = layers.find((layer): layer is TextLayer => layer.id === "hero-title" && layer.type === "text");
  const product = layers.find((layer): layer is ImageLayer => layer.id === "product-main" && layer.type === "image");
  if (!title || !product) return template;

  const safeTitle = fitTextToBox(title, 48);
  layers = updateLayer(layers, safeTitle);

  const boardTop = layers.find((layer) => layer.id === "bottom-board")?.y ?? template.canvas.height;
  const minGap = 32;
  const titleBottom = safeTitle.y + Math.max(safeTitle.height, textHeight(safeTitle));
  const maxProductBottom = boardTop - minGap;
  let safeProduct = clampImageInsideCanvas(product, template, 48);
  safeProduct = {
    ...safeProduct,
    y: Math.max(safeProduct.y, Math.ceil(titleBottom + minGap)),
  };

  if (safeProduct.y + safeProduct.height > maxProductBottom) {
    const availableHeight = Math.max(260, maxProductBottom - safeProduct.y);
    const ratio = availableHeight / safeProduct.height;
    safeProduct = {
      ...safeProduct,
      height: Math.round(availableHeight),
      width: Math.round(Math.min(safeProduct.width * ratio, template.canvas.width - 96)),
    };
    safeProduct.x = Math.round((template.canvas.width - safeProduct.width) / 2);
  }

  layers = updateLayer(layers, safeProduct);
  return { ...template, layers };
}

function enforceDetailSafety(template: Template): Template {
  let layers = [...template.layers];
  const product = layers.find((layer): layer is ImageLayer => layer.id === "detail-product" && layer.type === "image");
  const specText = layers.find((layer) => layer.id === "detail-spec-text");
  const search = layers.find((layer) => layer.id === "detail-search");
  if (!product || !specText || !search) return template;

  let safeProduct = clampImageInsideCanvas(product, template, 40);
  const minY = specText.y + specText.height + 28;
  const maxBottom = search.y - 34;
  safeProduct = { ...safeProduct, y: Math.max(safeProduct.y, minY) };
  if (safeProduct.y + safeProduct.height > maxBottom) {
    const nextHeight = Math.max(260, maxBottom - safeProduct.y);
    const ratio = nextHeight / safeProduct.height;
    safeProduct = {
      ...safeProduct,
      height: Math.round(nextHeight),
      width: Math.round(Math.min(safeProduct.width * ratio, template.canvas.width - 80)),
      x: Math.round((template.canvas.width - Math.min(safeProduct.width * ratio, template.canvas.width - 80)) / 2),
    };
  }

  layers = updateLayer(layers, safeProduct);
  return { ...template, layers };
}

function enforceTextFits(template: Template): Template {
  return {
    ...template,
    layers: template.layers.map((layer) => {
      if (layer.type !== "text") return layer;
      const minFont = layer.id.includes("title") ? 42 : 24;
      return fitTextToBox(layer, minFont);
    }),
  };
}

export function enforceTemplateSafety(template: Template): Template {
  const textSafe = enforceTextFits(template);
  if (textSafe.id === "hero-main") return enforceHeroSafety(textSafe);
  if (textSafe.id === "detail-page") return enforceDetailSafety(textSafe);
  return textSafe;
}

export function hasProductTextOverlap(template: Template): boolean {
  const productLayers = template.layers.filter(
    (layer): layer is ImageLayer => layer.type === "image" && layer.assetRole === "productTransparent" && layer.visible,
  );
  const textLayers = template.layers.filter((layer): layer is TextLayer => layer.type === "text" && layer.visible);

  return productLayers.some((product) =>
    textLayers.some((text) => product.zIndex >= text.zIndex && intersects(layerRect(product), layerRect(text))),
  );
}
