import { buildSkuCatalogFromPaths, normalizePath } from "./catalog";
import type { Asset, Sku, SkuAssets } from "./types";

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

export function buildCatalogFromFiles(files: File[]): ImportedCatalog {
  const urls = new Map<string, string>();
  const paths = files.map((file) => {
    const relativePath = normalizePath((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name);
    urls.set(relativePath, URL.createObjectURL(file));
    return relativePath;
  });

  return {
    catalog: attachAssetUrls(buildSkuCatalogFromPaths(paths), urls),
    revoke: () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    },
  };
}
