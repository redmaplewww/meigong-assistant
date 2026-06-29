import type { Asset, AssetType, ParameterRow, ServiceItem, Sku, SkuAssets } from "./types";

const connectorLabels: Record<string, string> = {
  J: "公头",
  K: "母头",
};

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function classifyAssetPath(path: string): AssetType {
  const normalized = normalizePath(path);
  const name = normalized.split("/").pop()?.toLowerCase() ?? "";

  if (name === "t.png") return "product-transparent";
  if (normalized.includes("/images/")) return "detail-slice";
  if (name === "3.png") return "drawing";
  return "product-photo";
}

function createAsset(path: string): Asset {
  const normalized = normalizePath(path);
  const name = normalized.split("/").pop() ?? normalized;

  return {
    id: normalized.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase(),
    type: classifyAssetPath(normalized),
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

export function buildSkuCatalogFromPaths(paths: string[]): Sku[] {
  const grouped = new Map<string, { family: string; code: string; assets: SkuAssets }>();

  paths.map(normalizePath).forEach((path) => {
    const parts = path.split("/");
    if (parts.length < 3) return;

    const family = parts[0];
    const code = parts[1];
    const groupKey = `${family}/${code}`;
    const asset = createAsset(path);

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, { family, code, assets: emptyAssets() });
    }

    const group = grouped.get(groupKey)!;
    if (asset.type === "product-transparent") {
      group.assets.productTransparent = asset;
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
      assets: {
        ...assets,
        productPhotos: assets.productPhotos.sort((a, b) => a.path.localeCompare(b.path, "zh-CN")),
        detailSlices: assets.detailSlices.sort((a, b) => a.path.localeCompare(b.path, "zh-CN")),
      },
    }))
    .sort((a, b) => a.code.localeCompare(b.code, "zh-CN"));
}
