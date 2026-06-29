import { describe, expect, it } from "vitest";
import { fitRect, formatExportName } from "./renderer";

describe("renderer helpers", () => {
  it("fits images inside a target frame without changing aspect ratio", () => {
    expect(fitRect({ width: 1200, height: 600 }, { x: 100, y: 200, width: 400, height: 400 }, "contain")).toEqual({
      x: 100,
      y: 300,
      width: 400,
      height: 200,
    });
  });

  it("covers a target frame while keeping aspect ratio", () => {
    expect(fitRect({ width: 1200, height: 600 }, { x: 100, y: 200, width: 400, height: 400 }, "cover")).toEqual({
      x: -100,
      y: 200,
      width: 800,
      height: 400,
    });
  });

  it("formats stable export names for SKU template output", () => {
    expect(formatExportName("3.5/SMP-KKG", "hero", "png")).toBe("3.5-SMP-KKG_hero.png");
    expect(formatExportName(" 3.5/SMP-KKG ", "detail", "jpg")).toBe("3.5-SMP-KKG_detail.jpg");
  });
});
