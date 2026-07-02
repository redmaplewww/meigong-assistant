import { describe, expect, it } from "vitest";
import { findDominantDarkRegion } from "./imageCrop";

function makeImage(width: number, height: number, darkRects: Array<[number, number, number, number]>): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data[index * 4] = 255;
    data[index * 4 + 1] = 255;
    data[index * 4 + 2] = 255;
    data[index * 4 + 3] = 255;
  }
  darkRects.forEach(([x, y, rectWidth, rectHeight]) => {
    for (let row = y; row < y + rectHeight; row += 1) {
      for (let col = x; col < x + rectWidth; col += 1) {
        const offset = (row * width + col) * 4;
        data[offset] = 0;
        data[offset + 1] = 0;
        data[offset + 2] = 0;
      }
    }
  });
  return { width, height, data, colorSpace: "srgb" };
}

describe("engineering drawing crop detection", () => {
  it("finds the dominant central line-art region instead of page furniture", () => {
    const image = makeImage(120, 160, [
      [2, 2, 116, 2],
      [2, 156, 116, 2],
      [2, 2, 2, 156],
      [116, 2, 2, 156],
      [48, 44, 34, 34],
      [45, 42, 40, 2],
      [28, 138, 68, 8],
    ]);

    const bounds = findDominantDarkRegion(image, { cellSize: 4, footerCutoffRatio: 0.82, paddingRatio: 0 });

    expect(bounds).toEqual({ x: 44, y: 40, width: 40, height: 40 });
  });
});
