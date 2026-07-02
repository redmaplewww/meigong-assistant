import { describe, expect, it } from "vitest";
import { getParameterOcrRegion } from "./specOcr";

describe("specification OCR regions", () => {
  it("targets the lower-left parameter block on a portrait specification page", () => {
    const region = getParameterOcrRegion({ width: 1191, height: 1684 });

    expect(region.x).toBeGreaterThan(150);
    expect(region.y).toBeGreaterThan(820);
    expect(region.x + region.width).toBeLessThan(760);
    expect(region.y + region.height).toBeLessThan(1360);
    expect(region.width).toBeGreaterThan(450);
    expect(region.height).toBeGreaterThan(350);
  });
});
