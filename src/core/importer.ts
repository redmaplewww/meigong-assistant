import { buildSkuCatalogFromPaths, normalizePath } from "./catalog";
import type { Asset, Sku, SkuAssets } from "./types";
import { applySpecToSku, type ParsedSpec } from "./specParser";

function attachUrlToAsset(asset: Asset | undefined, urls: Map<string, string>): Asset | undefined {
  if (!asset) return undefined;
  return {
    ...asset,
    url: urls.get(asset.path) ?? asset.url,
  };
}

function attachUrlsToList(assets: Asset[], urls: Map<string, string>): Asset[] {
  return assets.map((asset) => ({ ...asset, url: urls.get(asset.path) ?? asset.url }));
}

function attachUrlsToAssets(assets: SkuAssets, urls: Map<string, string>): SkuAssets {
  return {
    productTransparent: attachUrlToAsset(assets.productTransparent, urls),
    productPhotos: attachUrlsToList(assets.productPhotos, urls),
    drawing: attachUrlToAsset(assets.drawing, urls),
    detailSlices: attachUrlsToList(assets.detailSlices, urls),
  };
}

export function attachAssetUrls(catalog: Sku[], urls: Map<string, string>): Sku[] {
  return catalog.map((sku) => ({
    ...sku,
    assets: attachUrlsToAssets(sku.assets, urls),
  }));
}

export interface ImportedCatalog {
  catalog: Sku[];
  revoke: () => void;
}

export interface SingleAssetImportInput {
  productFile: File;
  detailFile: File;
  drawingFile?: File;
  spec?: ParsedSpec;
}

function safeFileName(file: File, fallback: string): string {
  const normalized = normalizePath(file.name);
  return normalized.split("/").filter(Boolean).pop() || fallback;
}

export function buildCatalogFromSingleAssets(input: SingleAssetImportInput): ImportedCatalog {
  const urls = new Map<string, string>();
  const paths: string[] = [];
  const productPath = normalizePath(`single-import/SingleImport/AUTO-SKU/product/${safeFileName(input.productFile, "product.png")}`);
  const detailPath = normalizePath(`single-import/SingleImport/AUTO-SKU/detail/${safeFileName(input.detailFile, "detail.png")}`);

  urls.set(productPath, URL.createObjectURL(input.productFile));
  urls.set(detailPath, URL.createObjectURL(input.detailFile));
  paths.push(productPath, detailPath);

  if (input.drawingFile) {
    const drawingPath = normalizePath(`single-import/SingleImport/AUTO-SKU/drawing/${safeFileName(input.drawingFile, "drawing.png")}`);
    urls.set(drawingPath, URL.createObjectURL(input.drawingFile));
    paths.push(drawingPath);
  }

  return {
    catalog: attachAssetUrls(buildSkuCatalogFromPaths(paths, { assetMode: "typed-folders" }), urls).map((sku) =>
      input.spec ? applySpecToSku(sku, input.spec) : sku,
    ),
    revoke: () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    },
  };
}
