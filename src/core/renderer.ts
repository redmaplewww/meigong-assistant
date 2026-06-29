import type { ImageLayer, Layer, ShapeLayer, TableLayer, Template, TextLayer } from "./types";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

const alphaBoundsCache = new Map<string, Rect | null>();

export function fitRect(source: Size, target: Rect, fit: ImageLayer["fit"]): Rect {
  if (fit === "stretch") return { ...target };

  const sourceRatio = source.width / source.height;
  const targetRatio = target.width / target.height;
  const shouldMatchWidth = fit === "contain" ? sourceRatio > targetRatio : sourceRatio < targetRatio;

  if (shouldMatchWidth) {
    const height = target.width / sourceRatio;
    return {
      x: target.x,
      y: target.y + (target.height - height) / 2,
      width: target.width,
      height,
    };
  }

  const width = target.height * sourceRatio;
  return {
    x: target.x + (target.width - width) / 2,
    y: target.y,
    width,
    height: target.height,
  };
}

export function formatExportName(model: string, templateKind: string, extension: "png" | "jpg"): string {
  const safeModel = model.trim().replace(/[\\/]+/g, "-").replace(/\s+/g, "");
  return `${safeModel}_${templateKind}.${extension}`;
}

function roundedRect(ctx: CanvasRenderingContext2D, rect: Rect, radius: number): void {
  const safeRadius = Math.min(radius, rect.width / 2, rect.height / 2);
  ctx.beginPath();
  ctx.moveTo(rect.x + safeRadius, rect.y);
  ctx.lineTo(rect.x + rect.width - safeRadius, rect.y);
  ctx.quadraticCurveTo(rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + safeRadius);
  ctx.lineTo(rect.x + rect.width, rect.y + rect.height - safeRadius);
  ctx.quadraticCurveTo(rect.x + rect.width, rect.y + rect.height, rect.x + rect.width - safeRadius, rect.y + rect.height);
  ctx.lineTo(rect.x + safeRadius, rect.y + rect.height);
  ctx.quadraticCurveTo(rect.x, rect.y + rect.height, rect.x, rect.y + rect.height - safeRadius);
  ctx.lineTo(rect.x, rect.y + safeRadius);
  ctx.quadraticCurveTo(rect.x, rect.y, rect.x + safeRadius, rect.y);
  ctx.closePath();
}

function withLayerTransform(ctx: CanvasRenderingContext2D, layer: Layer, draw: () => void): void {
  if (!layer.visible) return;

  ctx.save();
  ctx.globalAlpha *= layer.opacity;
  ctx.translate(layer.x + layer.width / 2, layer.y + layer.height / 2);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.scale(layer.scale, layer.scale);
  ctx.translate(-(layer.x + layer.width / 2), -(layer.y + layer.height / 2));
  draw();
  ctx.restore();
}

function drawShape(ctx: CanvasRenderingContext2D, layer: ShapeLayer): void {
  withLayerTransform(ctx, layer, () => {
    ctx.fillStyle = layer.fill;
    ctx.strokeStyle = layer.stroke ?? layer.fill;
    ctx.lineWidth = layer.strokeWidth ?? 0;

    if (layer.shape === "line") {
      ctx.fillRect(layer.x, layer.y, layer.width, Math.max(1, layer.height));
      return;
    }

    if (layer.shape === "ellipse") {
      ctx.beginPath();
      ctx.ellipse(layer.x + layer.width / 2, layer.y + layer.height / 2, layer.width / 2, layer.height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      if (layer.stroke && layer.strokeWidth) ctx.stroke();
      return;
    }

    roundedRect(ctx, layer, layer.shape === "pill" ? layer.height / 2 : layer.radius ?? 0);
    ctx.fill();
    if (layer.stroke && layer.strokeWidth) ctx.stroke();
  });
}

function drawText(ctx: CanvasRenderingContext2D, layer: TextLayer): void {
  withLayerTransform(ctx, layer, () => {
    const fontFamily = layer.fontFamily ?? '"Microsoft YaHei", "PingFang SC", Arial, sans-serif';
    const lineHeight = layer.fontSize * layer.lineHeight;
    const lines = layer.text.split("\n");

    ctx.fillStyle = layer.color;
    ctx.font = `${layer.fontWeight} ${layer.fontSize}px ${fontFamily}`;
    ctx.textAlign = layer.align;
    ctx.textBaseline = "top";

    const anchorX =
      layer.align === "center" ? layer.x + layer.width / 2 : layer.align === "right" ? layer.x + layer.width : layer.x;

    lines.forEach((line, index) => {
      ctx.fillText(line, anchorX, layer.y + index * lineHeight);
    });
  });
}

function drawTable(ctx: CanvasRenderingContext2D, layer: TableLayer): void {
  withLayerTransform(ctx, layer, () => {
    const totalRows = layer.rows.length + 1;
    const rowHeight = layer.height / totalRows;
    const colWidth = layer.width / layer.columns.length;
    const fontSize = Math.min(layer.fontSize, rowHeight * 0.46);

    ctx.lineWidth = 2;
    ctx.strokeStyle = layer.borderColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fontFamily = layer.fontFamily ?? '"Microsoft YaHei", "PingFang SC", Arial, sans-serif';
    ctx.font = `500 ${fontSize}px ${fontFamily}`;

    layer.columns.forEach((column, colIndex) => {
      ctx.fillStyle = layer.headerFill;
      ctx.fillRect(layer.x + colIndex * colWidth, layer.y, colWidth, rowHeight);
      ctx.strokeRect(layer.x + colIndex * colWidth, layer.y, colWidth, rowHeight);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(column, layer.x + colIndex * colWidth + colWidth / 2, layer.y + rowHeight / 2);
    });

    layer.rows.forEach((row, rowIndex) => {
      const y = layer.y + (rowIndex + 1) * rowHeight;
      ctx.fillStyle = rowIndex % 2 === 1 ? layer.stripeFill : "#ffffff";
      ctx.fillRect(layer.x, y, layer.width, rowHeight);

      [row.label, row.value].forEach((value, colIndex) => {
        ctx.strokeRect(layer.x + colIndex * colWidth, y, colWidth, rowHeight);
        ctx.fillStyle = layer.textColor;
        ctx.fillText(value, layer.x + colIndex * colWidth + colWidth / 2, y + rowHeight / 2);
      });
    });

    roundedRect(ctx, layer, 38);
    ctx.stroke();
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:\/\//.test(url)) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Image failed to load: ${url}`));
    img.src = url;
  });
}

function getAlphaBounds(img: HTMLImageElement, cacheKey: string): Rect | null {
  if (alphaBoundsCache.has(cacheKey)) return alphaBoundsCache.get(cacheKey) ?? null;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (alpha > 8) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    const bounds = maxX >= 0 ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : null;
    alphaBoundsCache.set(cacheKey, bounds);
    return bounds;
  } catch {
    alphaBoundsCache.set(cacheKey, null);
    return null;
  }
}

async function drawImageLayer(ctx: CanvasRenderingContext2D, layer: ImageLayer): Promise<void> {
  if (!layer.imageUrl || layer.assetMissing) return;
  const img = await loadImage(layer.imageUrl);

  withLayerTransform(ctx, layer, () => {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const alphaBounds = layer.assetRole === "productTransparent" ? getAlphaBounds(img, layer.imageUrl ?? layer.id) : null;
    const source = alphaBounds ?? { x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight };
    const rect = fitRect({ width: source.width, height: source.height }, layer, layer.fit);
    if (layer.shadow) {
      ctx.shadowColor = "rgba(0,0,0,0.2)";
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 20;
    }
    ctx.drawImage(img, source.x, source.y, source.width, source.height, rect.x, rect.y, rect.width, rect.height);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  });
}

function drawIconSymbol(ctx: CanvasRenderingContext2D, layer: Extract<Layer, { type: "icon" }>): void {
  withLayerTransform(ctx, layer, () => {
    if (layer.fill) {
      const gradient = ctx.createLinearGradient(layer.x, layer.y, layer.x + layer.width, layer.y + layer.height);
      gradient.addColorStop(0, "#6098bf");
      gradient.addColorStop(1, layer.fill);
      ctx.fillStyle = gradient;
      ctx.fillRect(layer.x, layer.y, layer.width, layer.height);
    }

    const cx = layer.x + layer.width / 2;
    const cy = layer.y + layer.height * 0.38;
    const size = Math.min(layer.width, layer.height) * 0.23;
    ctx.strokeStyle = layer.color;
    ctx.fillStyle = layer.color;
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (layer.icon === "cart") {
      ctx.beginPath();
      ctx.moveTo(cx - size, cy - size * 0.55);
      ctx.lineTo(cx + size * 0.9, cy - size * 0.35);
      ctx.lineTo(cx + size * 0.58, cy + size * 0.62);
      ctx.lineTo(cx - size * 0.68, cy + size * 0.62);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx - size * 0.45, cy + size * 0.94, 12, 0, Math.PI * 2);
      ctx.arc(cx + size * 0.45, cy + size * 0.94, 12, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }

    if (layer.icon === "shield" || layer.icon === "warranty") {
      ctx.beginPath();
      ctx.moveTo(cx, cy - size);
      ctx.lineTo(cx + size * 0.76, cy - size * 0.58);
      ctx.lineTo(cx + size * 0.6, cy + size * 0.58);
      ctx.lineTo(cx, cy + size);
      ctx.lineTo(cx - size * 0.6, cy + size * 0.58);
      ctx.lineTo(cx - size * 0.76, cy - size * 0.58);
      ctx.closePath();
      ctx.stroke();
      if (layer.icon === "shield") {
        ctx.beginPath();
        ctx.moveTo(cx - size * 0.38, cy);
        ctx.lineTo(cx - size * 0.1, cy + size * 0.28);
        ctx.lineTo(cx + size * 0.45, cy - size * 0.36);
        ctx.stroke();
      } else {
        ctx.font = `800 ${size}px "Microsoft YaHei", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("售", cx, cy + 2);
      }
      return;
    }

    if (layer.icon === "pencil") {
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.62, cy + size * 0.74);
      ctx.lineTo(cx + size * 0.68, cy - size * 0.56);
      ctx.lineTo(cx + size * 0.96, cy - size * 0.28);
      ctx.lineTo(cx - size * 0.34, cy + size);
      ctx.closePath();
      ctx.stroke();
      return;
    }

    if (layer.icon === "receipt") {
      ctx.strokeRect(cx - size * 0.58, cy - size, size * 1.16, size * 1.7);
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.moveTo(cx - size * 0.32, cy - size * 0.55 + i * size * 0.42);
        ctx.lineTo(cx + size * 0.32, cy - size * 0.55 + i * size * 0.42);
        ctx.stroke();
      }
      return;
    }

    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.78, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.45, cy + size * 0.45);
    ctx.lineTo(cx + size * 0.45, cy - size * 0.45);
    ctx.stroke();
  });
}

async function drawLayer(ctx: CanvasRenderingContext2D, layer: Layer): Promise<void> {
  if (!layer.visible) return;

  if (layer.type === "shape") drawShape(ctx, layer);
  if (layer.type === "text") drawText(ctx, layer);
  if (layer.type === "table") drawTable(ctx, layer);
  if (layer.type === "image") await drawImageLayer(ctx, layer);
  if (layer.type === "icon") drawIconSymbol(ctx, layer);
}

export async function renderTemplateToCanvas(canvas: HTMLCanvasElement, template: Template): Promise<void> {
  canvas.width = template.canvas.width;
  canvas.height = template.canvas.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = template.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const sortedLayers = [...template.layers].sort((a, b) => a.zIndex - b.zIndex);
  for (const layer of sortedLayers) {
    await drawLayer(ctx, layer);
  }
}

export async function renderTemplateToBlob(template: Template, format: "png" | "jpg"): Promise<Blob> {
  const canvas = document.createElement("canvas");
  await renderTemplateToCanvas(canvas, template);
  const mimeType = format === "png" ? "image/png" : "image/jpeg";

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas export failed"));
      },
      mimeType,
      format === "jpg" ? 0.94 : undefined,
    );
  });
}
