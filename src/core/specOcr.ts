export interface SizeLike {
  width: number;
  height: number;
}

export interface OcrRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getParameterOcrRegion(size: SizeLike): OcrRegion {
  const portrait = size.height >= size.width;
  const left = portrait ? 0.17 : 0.08;
  const top = portrait ? 0.52 : 0.42;
  const right = portrait ? 0.58 : 0.66;
  const bottom = portrait ? 0.75 : 0.82;

  const x = Math.round(size.width * left);
  const y = Math.round(size.height * top);
  const width = Math.round(size.width * (right - left));
  const height = Math.round(size.height * (bottom - top));

  return {
    x: clamp(x, 0, size.width - 1),
    y: clamp(y, 0, size.height - 1),
    width: clamp(width, 1, size.width - x),
    height: clamp(height, 1, size.height - y),
  };
}

export function createEnhancedParameterOcrCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const region = getParameterOcrRegion(source);
  const scale = 4;
  const canvas = document.createElement("canvas");
  canvas.width = region.width * scale;
  canvas.height = region.height * scale;
  const context = canvas.getContext("2d");
  if (!context) return source;

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, region.x, region.y, region.width, region.height, 0, 0, canvas.width, canvas.height);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  for (let index = 0; index < data.length; index += 4) {
    const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    const contrasted = clamp((gray - 128) * 1.8 + 128, 0, 255);
    const value = contrasted < 185 ? 0 : 255;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }
  context.putImageData(imageData, 0, 0);

  return canvas;
}

export function createSpecOcrCanvases(source: HTMLCanvasElement): HTMLCanvasElement[] {
  return [source, createEnhancedParameterOcrCanvas(source)];
}
