export interface CropBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DominantDarkRegionOptions {
  cellSize?: number;
  darkThreshold?: number;
  footerCutoffRatio?: number;
  marginRatio?: number;
  minDarkPixelsPerCell?: number;
  paddingRatio?: number;
}

interface Component {
  minCol: number;
  minRow: number;
  maxCol: number;
  maxRow: number;
  cells: number;
  darkPixels: number;
}

function luminance(red: number, green: number, blue: number): number {
  return red * 0.299 + green * 0.587 + blue * 0.114;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function findDominantDarkRegion(image: ImageData, options: DominantDarkRegionOptions = {}): CropBounds | undefined {
  const { width, height, data } = image;
  const cellSize = options.cellSize ?? Math.max(8, Math.round(Math.min(width, height) / 180));
  const cols = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  const counts = new Uint16Array(cols * rows);
  const darkThreshold = options.darkThreshold ?? 145;
  const marginRatio = options.marginRatio ?? 0.08;
  const footerCutoffRatio = options.footerCutoffRatio ?? 0.88;
  const marginX = Math.round(width * marginRatio);
  const marginY = Math.round(height * marginRatio);
  const footerY = Math.round(height * footerCutoffRatio);

  for (let y = marginY; y < footerY; y += 1) {
    for (let x = marginX; x < width - marginX; x += 1) {
      const offset = (y * width + x) * 4;
      if (data[offset + 3] < 8) continue;
      if (luminance(data[offset], data[offset + 1], data[offset + 2]) > darkThreshold) continue;
      const col = Math.floor(x / cellSize);
      const row = Math.floor(y / cellSize);
      counts[row * cols + col] += 1;
    }
  }

  const minDarkPixelsPerCell = options.minDarkPixelsPerCell ?? Math.max(2, Math.floor(cellSize * 0.8));
  const active = new Uint8Array(cols * rows);
  counts.forEach((count, index) => {
    if (count >= minDarkPixelsPerCell) active[index] = 1;
  });

  const visited = new Uint8Array(cols * rows);
  const components: Component[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const startIndex = row * cols + col;
      if (!active[startIndex] || visited[startIndex]) continue;

      const queue = [startIndex];
      visited[startIndex] = 1;
      const component: Component = {
        minCol: col,
        minRow: row,
        maxCol: col,
        maxRow: row,
        cells: 0,
        darkPixels: 0,
      };

      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const index = queue[cursor];
        const currentRow = Math.floor(index / cols);
        const currentCol = index % cols;
        component.minCol = Math.min(component.minCol, currentCol);
        component.minRow = Math.min(component.minRow, currentRow);
        component.maxCol = Math.max(component.maxCol, currentCol);
        component.maxRow = Math.max(component.maxRow, currentRow);
        component.cells += 1;
        component.darkPixels += counts[index];

        for (let rowDelta = -1; rowDelta <= 1; rowDelta += 1) {
          for (let colDelta = -1; colDelta <= 1; colDelta += 1) {
            if (rowDelta === 0 && colDelta === 0) continue;
            const nextRow = currentRow + rowDelta;
            const nextCol = currentCol + colDelta;
            if (nextRow < 0 || nextRow >= rows || nextCol < 0 || nextCol >= cols) continue;
            const nextIndex = nextRow * cols + nextCol;
            if (!active[nextIndex] || visited[nextIndex]) continue;
            visited[nextIndex] = 1;
            queue.push(nextIndex);
          }
        }
      }

      if (component.cells >= 2) components.push(component);
    }
  }

  if (!components.length) return undefined;

  const best = components
    .map((component) => {
      const boundsCenterY = ((component.minRow + component.maxRow + 1) * cellSize) / 2;
      const centerPenalty = Math.abs(boundsCenterY - height * 0.46) / height;
      const score = component.darkPixels + component.cells * 8 - centerPenalty * 160;
      return { component, score };
    })
    .sort((a, b) => b.score - a.score)[0]?.component;
  if (!best) return undefined;

  const paddingRatio = options.paddingRatio ?? 0.035;
  const padding = paddingRatio === 0 ? 0 : Math.round(Math.max(cellSize, Math.max(width, height) * paddingRatio));
  const x = clamp(best.minCol * cellSize - padding, 0, width - 1);
  const y = clamp(best.minRow * cellSize - padding, 0, height - 1);
  const right = clamp((best.maxCol + 1) * cellSize + padding, x + 1, width);
  const bottom = clamp((best.maxRow + 1) * cellSize + padding, y + 1, height);

  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
  };
}

export function cropCanvasToDominantDarkRegion(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  const bounds = findDominantDarkRegion(context.getImageData(0, 0, canvas.width, canvas.height));
  if (!bounds) return canvas;

  const cropped = document.createElement("canvas");
  cropped.width = bounds.width;
  cropped.height = bounds.height;
  const croppedContext = cropped.getContext("2d");
  if (!croppedContext) return canvas;

  croppedContext.drawImage(canvas, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
  return cropped;
}
