import type { MaterialAsset, MaterialSelection, MaterialTemplateSet, MaterialVariantCreation, Template, TemplateSuite } from "./types";

export function svgData(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function svgFromDataUrl(url: string): string | undefined {
  const match = /^data:image\/svg\+xml(?:;charset=[^,]+)?,(.+)$/i.exec(url);
  if (!match) return undefined;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function createMaterialVariant(
  library: MaterialAsset[],
  creation: MaterialVariantCreation,
): MaterialAsset | undefined {
  const base = findMaterial(library, creation.fromMaterialId);
  if (!base || base.slot !== creation.slot) return undefined;

  const svg = svgFromDataUrl(base.url);
  if (!svg) return undefined;

  const recoloredSvg = creation.colorReplacements.reduce((current, replacement) => {
    const pattern = new RegExp(escapeRegExp(replacement.from), "gi");
    return current.replace(pattern, replacement.to);
  }, svg);
  const url = svgData(recoloredSvg);
  const tags = Array.from(new Set([...base.tags, ...(creation.tags ?? []), "ai-variant"]));

  return {
    ...base,
    id: creation.materialId,
    name: creation.name,
    url,
    thumbnailUrl: url,
    tags,
  };
}

export function applyMaterialCreationsToLibrary(
  library: MaterialAsset[],
  creations: MaterialVariantCreation[] | undefined,
): MaterialAsset[] {
  if (!creations?.length) return library;

  return creations.reduce<MaterialAsset[]>((current, creation) => {
    if (current.some((material) => material.id === creation.materialId)) return current;
    const variant = createMaterialVariant(current, creation);
    return variant ? [...current, variant] : current;
  }, library);
}

function makeMaterial(
  id: string,
  slot: MaterialAsset["slot"],
  kind: MaterialAsset["kind"],
  name: string,
  width: number,
  height: number,
  svg: string,
  tags: string[],
): MaterialAsset {
  const url = svgData(svg);
  return {
    id,
    slot,
    kind,
    name,
    width,
    height,
    url,
    thumbnailUrl: url,
    tags,
  };
}

export function createDefaultMaterialLibrary(): MaterialAsset[] {
  return [
    makeMaterial(
      "bottom-board-classic",
      "bottom-board",
      "board",
      "经典蓝色底板",
      1440,
      260,
      `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="260" viewBox="0 0 1440 260">
        <defs>
          <linearGradient id="b" x1="0" x2="1">
            <stop stop-color="#0b70b7"/>
            <stop offset="1" stop-color="#0a66a9"/>
          </linearGradient>
          <filter id="s" x="-20%" y="-30%" width="140%" height="170%">
            <feDropShadow dx="-10" dy="-10" stdDeviation="8" flood-color="#1b3b54" flood-opacity=".3"/>
          </filter>
        </defs>
        <path d="M0 70h1440v190H0z" fill="url(#b)"/>
        <path d="M0 0h300c50 0 88 26 105 72l69 188H0z" fill="#e5eef5" filter="url(#s)"/>
        <path d="M390 70l84 190" fill="none" stroke="#063f68" stroke-width="8" opacity=".55"/>
      </svg>`,
      ["blue", "factory", "bottom"],
    ),
    makeMaterial(
      "bottom-board-deep",
      "bottom-board",
      "board",
      "深蓝斜切底板",
      1440,
      260,
      `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="260" viewBox="0 0 1440 260">
        <defs>
          <linearGradient id="b" x1="0" y1="0" x2="1" y2="1">
            <stop stop-color="#0b5f99"/>
            <stop offset=".55" stop-color="#0c75bd"/>
            <stop offset="1" stop-color="#12315a"/>
          </linearGradient>
        </defs>
        <path d="M0 54h1440v206H0z" fill="url(#b)"/>
        <path d="M0 0h420l-96 260H0z" fill="#eef6fb"/>
        <path d="M350 0h64l-96 260h-64z" fill="#b8d4e8" opacity=".7"/>
        <path d="M995 54h445v206H850c70-54 114-118 145-206z" fill="#0a4f82" opacity=".3"/>
      </svg>`,
      ["blue", "deep", "bottom"],
    ),
    makeMaterial(
      "top-cap-blue-panel",
      "top-cap",
      "cap",
      "蓝色圆角顶板",
      960,
      520,
      `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="520" viewBox="0 0 960 520">
        <defs>
          <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
            <stop stop-color="#2f8ac4"/>
            <stop offset="1" stop-color="#0872b8"/>
          </linearGradient>
          <radialGradient id="glow" cx=".25" cy=".15" r=".9">
            <stop stop-color="#8bc2e8" stop-opacity=".55"/>
            <stop offset=".7" stop-color="#0b70b7" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <rect width="960" height="520" rx="0" fill="url(#bg)"/>
        <rect width="960" height="520" rx="0" fill="url(#glow)"/>
        <path d="M40 0h880v410c0 52-42 94-94 94H134c-52 0-94-42-94-94z" fill="#fff" opacity=".96"/>
      </svg>`,
      ["detail", "top", "blue"],
    ),
    makeMaterial(
      "logo-wayiii-classic",
      "logo",
      "logo",
      "未艾互连经典 LOGO",
      420,
      160,
      `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="160" viewBox="0 0 420 160">
        <text x="0" y="82" font-family="Microsoft YaHei, Arial, sans-serif" font-size="78" font-weight="800" fill="#0b70b7">未艾互连</text>
        <text x="4" y="128" font-family="Arial, sans-serif" font-size="28" font-weight="800" fill="#0b70b7">Wayiii INTERCONNECT</text>
      </svg>`,
      ["brand", "logo", "blue"],
    ),
    makeMaterial(
      "logo-wayiii-stamp",
      "logo",
      "logo",
      "未艾方章 LOGO",
      420,
      160,
      `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="160" viewBox="0 0 420 160">
        <rect x="0" y="8" width="132" height="132" rx="24" fill="#0b70b7"/>
        <text x="66" y="90" text-anchor="middle" font-family="Microsoft YaHei, Arial, sans-serif" font-size="42" font-weight="800" fill="#fff">未艾</text>
        <text x="156" y="70" font-family="Microsoft YaHei, Arial, sans-serif" font-size="44" font-weight="800" fill="#0b70b7">互连</text>
        <text x="156" y="112" font-family="Arial, sans-serif" font-size="22" font-weight="800" fill="#0b70b7">INTERCONNECT</text>
      </svg>`,
      ["brand", "stamp", "logo"],
    ),
    makeMaterial(
      "promo-badge-soft",
      "promo-badge",
      "badge",
      "浅蓝促销角标",
      420,
      300,
      `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="300" viewBox="0 0 420 300">
        <defs>
          <filter id="ds"><feDropShadow dx="8" dy="-8" stdDeviation="8" flood-color="#0b3150" flood-opacity=".2"/></filter>
        </defs>
        <path d="M0 0h292c48 0 86 27 101 73l27 82v145H0z" fill="#e5eff7" filter="url(#ds)"/>
        <path d="M318 48l83 252" fill="none" stroke="#9db9cc" stroke-width="3"/>
      </svg>`,
      ["badge", "invoice", "soft"],
    ),
    makeMaterial(
      "content-card-rounded",
      "content-card",
      "card",
      "白色圆角内容板",
      960,
      900,
      `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="900" viewBox="0 0 960 900">
        <rect x="40" y="30" width="880" height="840" rx="90" fill="#fff"/>
        <path d="M86 54h790" stroke="#eef4f8" stroke-width="2"/>
      </svg>`,
      ["card", "detail", "white"],
    ),
    makeMaterial(
      "service-tile-blue",
      "service-tile",
      "tile",
      "蓝色服务宫格",
      360,
      310,
      `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="310" viewBox="0 0 360 310">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop stop-color="#6aa1c7"/>
            <stop offset="1" stop-color="#0b70b7"/>
          </linearGradient>
        </defs>
        <rect width="360" height="310" rx="0" fill="url(#g)"/>
      </svg>`,
      ["service", "tile", "blue"],
    ),
    makeMaterial(
      "spec-pill-blue",
      "spec-pill",
      "strip",
      "蓝色参数胶囊",
      900,
      110,
      `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="110" viewBox="0 0 900 110">
        <rect width="900" height="110" rx="55" fill="#0b70b7"/>
      </svg>`,
      ["pill", "spec", "blue"],
    ),
    makeMaterial(
      "search-strip-blue",
      "search-strip",
      "strip",
      "搜索条素材",
      500,
      74,
      `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="74" viewBox="0 0 500 74">
        <rect x="1.5" y="1.5" width="497" height="71" rx="10" fill="rgba(255,255,255,.18)" stroke="#fff" stroke-width="3"/>
        <rect x="410" y="1.5" width="88" height="71" rx="10" fill="#fff"/>
        <circle cx="449" cy="32" r="18" fill="none" stroke="#0b70b7" stroke-width="4"/>
        <path d="M462 45l22 22" stroke="#0b70b7" stroke-width="4" stroke-linecap="round"/>
      </svg>`,
      ["search", "detail", "strip"],
    ),
  ];
}

export function findMaterial(library: MaterialAsset[], id: string | undefined): MaterialAsset | undefined {
  if (!id) return undefined;
  return library.find((material) => material.id === id);
}

export function applyMaterialSelectionToTemplate(
  template: Template,
  selection: MaterialSelection,
  library: MaterialAsset[],
): Template {
  return {
    ...template,
    layers: template.layers.map((layer) => {
      if (layer.type !== "image" || !layer.materialSlot) return layer;
      const selectedMaterial = findMaterial(library, selection[layer.materialSlot]);
      if (!selectedMaterial) return layer;
      return {
        ...layer,
        name: selectedMaterial.name,
        materialId: selectedMaterial.id,
        imageUrl: selectedMaterial.url,
        assetMissing: false,
      };
    }),
  };
}

export function createTemplateSet(
  name: string,
  selection: MaterialSelection,
  templatePatches?: MaterialTemplateSet["templatePatches"],
  templateCreations?: MaterialTemplateSet["templateCreations"],
  sourcePrompt?: string,
  materialCreations?: MaterialTemplateSet["materialCreations"],
  templates?: MaterialTemplateSet["templates"],
  theme?: MaterialTemplateSet["theme"],
): MaterialTemplateSet {
  return {
    id: `${name}-${Date.now()}`.replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-").replace(/^-|-$/g, ""),
    name,
    createdAt: new Date().toISOString(),
    selection,
    theme,
    materialCreations,
    templatePatches,
    templateCreations,
    templates,
    sourcePrompt,
  };
}

function shouldPreserveText(layerId: string): boolean {
  return /title|frequency|vswr|spec|note|shipping|invoice|service|detail|drawing/i.test(layerId);
}

function mergeSnapshotLayer(targetLayer: Template["layers"][number], snapshotLayer: Template["layers"][number]): Template["layers"][number] {
  if (targetLayer.type === "image" && snapshotLayer.type === "image") {
    return {
      ...targetLayer,
      ...snapshotLayer,
      assetRole: targetLayer.assetRole,
      assetId: targetLayer.assetId,
      imageUrl: targetLayer.imageUrl,
      assetMissing: targetLayer.assetMissing,
      materialSlot: targetLayer.materialSlot,
      materialId: targetLayer.materialId,
    };
  }

  if (targetLayer.type === "text" && snapshotLayer.type === "text" && shouldPreserveText(targetLayer.id)) {
    return {
      ...targetLayer,
      ...snapshotLayer,
      text: targetLayer.text,
    };
  }

  if (targetLayer.type !== snapshotLayer.type) return targetLayer;
  return { ...targetLayer, ...snapshotLayer } as Template["layers"][number];
}

export function applyTemplateSnapshotsToTemplates(templates: Template[], snapshots: Template[] | undefined): Template[] {
  if (!snapshots?.length) return templates;

  const current = [...templates];
  snapshots.forEach((snapshot) => {
    const existingIndex = current.findIndex((template) => template.id === snapshot.id);
    const baseIndex = existingIndex >= 0 ? existingIndex : current.findIndex((template) => template.kind === snapshot.kind);
    const base = baseIndex >= 0 ? current[baseIndex] : undefined;

    if (!base) {
      current.push(snapshot);
      return;
    }

    const snapshotLayerMap = new Map(snapshot.layers.map((layer) => [layer.id, layer]));
    const baseLayerIds = new Set(base.layers.map((layer) => layer.id));
    const mergedLayers = [
      ...base.layers.map((layer) => {
        const snapshotLayer = snapshotLayerMap.get(layer.id);
        return snapshotLayer ? mergeSnapshotLayer(layer, snapshotLayer) : layer;
      }),
      ...snapshot.layers.filter((layer) => !baseLayerIds.has(layer.id)).map((layer) => ({ ...layer })),
    ];

    const merged: Template = {
      ...base,
      id: snapshot.id,
      name: snapshot.name,
      canvas: snapshot.canvas,
      background: snapshot.background,
      layers: mergedLayers,
    };

    if (existingIndex >= 0) current[existingIndex] = merged;
    else current.push(merged);
  });

  return current;
}

export function applyTemplateSetToSuite(
  suite: TemplateSuite,
  templateSet: MaterialTemplateSet,
  library: MaterialAsset[],
): TemplateSuite {
  const nextLibrary = applyMaterialCreationsToLibrary(library, templateSet.materialCreations);

  return {
    ...suite,
    project: templateSet.theme
      ? {
          ...suite.project,
          brand: {
            ...suite.project.brand,
            primaryColor: templateSet.theme.primaryColor,
            secondaryColor: templateSet.theme.secondaryColor,
          },
        }
      : suite.project,
    materialSelection: templateSet.selection,
    templates: applyTemplateSnapshotsToTemplates(suite.templates, templateSet.templates).map((template) =>
      applyMaterialSelectionToTemplate(template, templateSet.selection, nextLibrary),
    ),
  };
}
