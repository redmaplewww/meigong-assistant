import { buildSkuCatalogFromPaths } from "../core/catalog";
import { attachAssetUrls } from "../core/importer";
import type { Sku } from "../core/types";

const modules = import.meta.glob("../../3.5-SMP/**/*.{png,jpg,jpeg}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

function normalizeGlobPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\.\/\.\.\//, "");
}

const urlMap = new Map<string, string>(
  Object.entries(modules).map(([path, url]) => [normalizeGlobPath(path), url]),
);

export const sampleCatalog: Sku[] = attachAssetUrls(
  buildSkuCatalogFromPaths(Array.from(urlMap.keys())),
  urlMap,
);
