import type { Asset, AssetType, ParameterRow, ServiceItem, Sku, SkuAssets } from "./types";

export type AssetImportMode = "legacy-filenames" | "typed-folders";

export interface BuildSkuCatalogOptions {
  assetMode?: AssetImportMode;
}

const connectorLabels: Record<string, string> = {
  J: "公头",
  K: "母头",
};

const explicitFolderNames: Partial<Record<AssetType, string[]>> = {
  "product-transparent": [
    "商品图",
    "主商品图",
    "主图",
    "产品图",
    "透明图",
    "透明商品图",
    "抠图",
    "扣图",
    "去背图",
    "product",
    "products",
    "product-main",
    "main-product",
    "main",
    "transparent",
  ],
  "product-photo": ["实拍图", "商品照片", "产品照片", "照片", "photo", "photos", "product-photo", "product-photos"],
  drawing: ["工程图", "尺寸图", "图纸", "外形图", "drawing", "drawings", "dimension", "dimensions", "cad", "blueprint"],
  "detail-slice": ["详情图", "详情", "详情页", "长图", "images", "image", "detail", "details", "detail-slices"],
};

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

function fileBaseName(name: string): string {
  return name.replace(/\.[^.]+$/, "").trim().toLowerCase();
}

function isDetailFolder(name: string): boolean {
  return /^(images?|details?|detail-slices?|详情|详情图|长图)$/i.test(name.trim());
}

function explicitAssetTypeFromFolder(folderName: string): AssetType | undefined {
  const normalized = folderName.trim().toLowerCase();
  const match = Object.entries(explicitFolderNames).find(([, aliases]) => aliases.some((alias) => alias.toLowerCase() === normalized));
  return match?.[0] as AssetType | undefined;
}

function explicitAssetFolderIndex(path: string): number {
  const folders = normalizePath(path).split("/").filter(Boolean).slice(0, -1);
  for (let index = folders.length - 1; index >= 0; index -= 1) {
    if (explicitAssetTypeFromFolder(folders[index])) return index;
  }
  return -1;
}

export function classifyExplicitAssetPath(path: string): AssetType | undefined {
  const parts = normalizePath(path).split("/").filter(Boolean);
  const index = explicitAssetFolderIndex(path);
  if (index < 0 || index >= parts.length - 1) return undefined;
  return explicitAssetTypeFromFolder(parts[index]);
}

export function classifyAssetPath(path: string): AssetType {
  const normalized = normalizePath(path);
  const parts = normalized.split("/");
  const name = parts.pop()?.toLowerCase() ?? "";
  const baseName = fileBaseName(name);
  const directoryParts = parts.map((part) => part.toLowerCase());

  if (directoryParts.some(isDetailFolder)) return "detail-slice";
  if (baseName === "3" || /工程|尺寸|图纸|外形|drawing|dimension|size|cad|blueprint/i.test(baseName)) return "drawing";
  if (
    baseName === "t" ||
    /透明|抠图|扣图|去背|主商品|商品图|产品图|主图|transparent|cutout|cut-out|product-main|main-product|main|hero/i.test(baseName)
  ) {
    return "product-transparent";
  }
  return "product-photo";
}

function createAsset(path: string, type = classifyAssetPath(path)): Asset {
  const normalized = normalizePath(path);
  const name = normalized.split("/").pop() ?? normalized;

  return {
    id: normalized.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase(),
    type,
    name,
    path: normalized,
    url: `/${normalized.split("/").map(encodeURIComponent).join("/")}`,
  };
}

function connectorLabel(code: string, index: number): string {
  return connectorLabels[code[index]?.toUpperCase()] ?? code[index] ?? "";
}

function defaultParameters(model: string): ParameterRow[] {
  return [
    { label: "接头类型", value: model },
    { label: "工作频率", value: "DC~26.5GHz" },
    { label: "电压驻波比", value: "≤1.2" },
    { label: "绝缘电阻", value: "≥5000MΩ" },
    { label: "介质耐压", value: "500V" },
    { label: "插拔寿命", value: "500次" },
    { label: "内导体", value: "镀青铜/镀金" },
    { label: "外导体", value: "镀青铜/镀金,不锈钢/钝化" },
    { label: "绝缘体", value: "PEI" },
  ];
}

function defaultServiceItems(): ServiceItem[] {
  return [
    { icon: "settings", label: "工厂直营" },
    { icon: "cart", label: "现货速发" },
    { icon: "pencil", label: "支持定制" },
    { icon: "shield", label: "支持对公" },
    { icon: "receipt", label: "免费开票" },
    { icon: "warranty", label: "售后保障" },
  ];
}

export function inferSkuMetadata(family: string, code: string): Omit<Sku, "assets"> {
  const normalizedFamily = family.replace(/_/g, "-");
  const left = connectorLabel(code, 0);
  const right = connectorLabel(code, 1);
  const shortSpec = `3.5${left}-SMP${right}`;
  const model = `3.5/SMP-${code.toUpperCase()}G`;

  return {
    id: `${normalizedFamily}-${code}`.toLowerCase(),
    family: normalizedFamily,
    code: code.toUpperCase(),
    model,
    title: `${shortSpec} 转接器`,
    shortSpec,
    subtitle: "Radio Frequency Coaxial Adapter",
    frequency: "DC~26.5GHz",
    vswr: "≤1.2",
    parameters: defaultParameters(model),
    serviceItems: defaultServiceItems(),
  };
}

function emptyAssets(): SkuAssets {
  return {
    productPhotos: [],
    detailSlices: [],
  };
}

function findSkuFolder(path: string, mode: AssetImportMode): { family: string; code: string } | undefined {
  const parts = normalizePath(path).split("/").filter(Boolean);
  if (parts.length < 2) return undefined;

  let codeIndex = parts.length - 2;
  if (mode === "typed-folders") {
    const typeIndex = explicitAssetFolderIndex(path);
    if (typeIndex < 1) return undefined;
    codeIndex = typeIndex - 1;
  } else if (isDetailFolder(parts[codeIndex])) {
    codeIndex -= 1;
  }
  if (codeIndex < 0) return undefined;

  return {
    family: parts[codeIndex - 1] ?? "Imported",
    code: parts[codeIndex],
  };
}

function productMainScore(asset: Asset): number {
  const baseName = fileBaseName(asset.name);
  if (baseName === "t") return 100;
  if (/透明|抠图|扣图|去背|transparent|cutout|cut-out/i.test(baseName)) return 90;
  if (/product-main|main-product|主商品|商品图|产品图|主图|main|hero/i.test(baseName)) return 80;
  return 10;
}

function assignProductTransparent(assets: SkuAssets, asset: Asset, mode: AssetImportMode): void {
  if (mode === "typed-folders") {
    if (!assets.productTransparent) {
      assets.productTransparent = asset;
    } else {
      assets.productPhotos.push({ ...asset, type: "product-photo" });
    }
    return;
  }

  if (!assets.productTransparent || productMainScore(asset) >= productMainScore(assets.productTransparent)) {
    assets.productTransparent = asset;
  }
}

function finalizeAssets(assets: SkuAssets, mode: AssetImportMode): SkuAssets {
  const productPhotos = assets.productPhotos.sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
  const detailSlices = assets.detailSlices.sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));

  if (assets.productTransparent || mode === "typed-folders") {
    return {
      ...assets,
      productPhotos,
      detailSlices,
    };
  }

  const [fallbackMain, ...remainingPhotos] = productPhotos;
  return {
    ...assets,
    productTransparent: fallbackMain ? { ...fallbackMain, type: "product-transparent" } : undefined,
    productPhotos: remainingPhotos,
    detailSlices,
  };
}

export function buildSkuCatalogFromPaths(paths: string[], options: BuildSkuCatalogOptions = {}): Sku[] {
  const mode = options.assetMode ?? "legacy-filenames";
  const grouped = new Map<string, { family: string; code: string; assets: SkuAssets }>();

  paths.map(normalizePath).forEach((path) => {
    const explicitType = mode === "typed-folders" ? classifyExplicitAssetPath(path) : undefined;
    if (mode === "typed-folders" && !explicitType) return;

    const skuFolder = findSkuFolder(path, mode);
    if (!skuFolder) return;

    const { family, code } = skuFolder;
    const groupKey = `${family}/${code}`;
    const asset = createAsset(path, explicitType ?? classifyAssetPath(path));

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, { family, code, assets: emptyAssets() });
    }

    const group = grouped.get(groupKey)!;
    if (asset.type === "product-transparent") {
      assignProductTransparent(group.assets, asset, mode);
    } else if (asset.type === "drawing") {
      group.assets.drawing = asset;
    } else if (asset.type === "detail-slice") {
      group.assets.detailSlices.push(asset);
    } else if (asset.type === "product-photo") {
      group.assets.productPhotos.push(asset);
    }
  });

  return Array.from(grouped.values())
    .map(({ family, code, assets }) => ({
      ...inferSkuMetadata(family, code),
      assets: finalizeAssets(assets, mode),
    }))
    .sort((a, b) => a.code.localeCompare(b.code, "zh-CN"));
}
