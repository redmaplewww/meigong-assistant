import { describe, expect, it } from "vitest";
import { buildSkuCatalogFromPaths } from "./catalog";
import { attachAssetUrls } from "./importer";

describe("asset URL import helpers", () => {
  it("attaches browser URLs to matching assets without mutating the catalog", () => {
    const catalog = buildSkuCatalogFromPaths(["3.5-SMP/KK/T.png", "3.5-SMP/KK/3.png"]);
    const updated = attachAssetUrls(
      catalog,
      new Map([
        ["3.5-SMP/KK/T.png", "blob:product"],
        ["3.5-SMP/KK/3.png", "blob:drawing"],
      ]),
    );

    expect(updated[0].assets.productTransparent?.url).toBe("blob:product");
    expect(updated[0].assets.drawing?.url).toBe("blob:drawing");
    expect(catalog[0].assets.productTransparent?.url).toBe("/3.5-SMP/KK/T.png");
  });
});
