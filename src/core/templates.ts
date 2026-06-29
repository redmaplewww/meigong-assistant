import type {
  ExportPreset,
  ImageLayer,
  Layer,
  Project,
  ShapeLayer,
  Sku,
  TableLayer,
  Template,
  TemplateSuite,
  TextLayer,
  ValidationIssue,
} from "./types";
import { createDefaultMaterialLibrary } from "./materials";
import { hasProductTextOverlap } from "./layoutSafety";

const blue = "#0b70b7";
const deepBlue = "#18315f";
const stripe = "#d7dde6";
const line = "#b9c4d2";
const defaultMaterials = createDefaultMaterialLibrary();

function materialUrl(id: string): string {
  const material = defaultMaterials.find((item) => item.id === id);
  if (!material) throw new Error(`Missing default material: ${id}`);
  return material.url;
}

export function createDefaultProject(): Project {
  return {
    id: "waiyii-local-project",
    name: "美工助手本地项目",
    brand: {
      cnName: "未艾互连",
      enName: "Wayiii INTERCONNECT",
      primaryColor: blue,
      secondaryColor: deepBlue,
    },
    typography: {
      headingFont: '"Microsoft YaHei", "PingFang SC", Arial, sans-serif',
      bodyFont: '"Microsoft YaHei", "PingFang SC", Arial, sans-serif',
    },
    aiPolicy: {
      wholeImageGeneration: false,
      allowedUses: ["素材分类", "抠图辅助", "摆位建议", "文案填充", "排版质检"],
    },
  };
}

export function createExportPresets(): ExportPreset[] {
  return [
    { id: "square-png", label: "1440方图 PNG", width: 1440, height: 1440, format: "png", safeMargin: 64 },
    { id: "square-jpg", label: "1440方图 JPG", width: 1440, height: 1440, format: "jpg", safeMargin: 64 },
    { id: "detail-jpg", label: "960详情 JPG", width: 960, format: "jpg", safeMargin: 40 },
    { id: "sku-zip", label: "整套SKU ZIP", width: 1440, format: "zip", safeMargin: 64 },
  ];
}

function baseLayer<T extends Layer>(layer: T): T {
  return layer;
}

function text(layer: Omit<TextLayer, "type" | "source" | "visible" | "locked" | "editable" | "opacity" | "scale" | "rotation">): TextLayer {
  return baseLayer({
    type: "text",
    source: "template",
    visible: true,
    locked: false,
    editable: true,
    opacity: 1,
    scale: 1,
    rotation: 0,
    ...layer,
  });
}

function image(layer: Omit<ImageLayer, "type" | "source" | "visible" | "locked" | "editable" | "opacity" | "scale" | "rotation">): ImageLayer {
  return baseLayer({
    type: "image",
    source: "uploaded",
    visible: true,
    locked: false,
    editable: true,
    opacity: 1,
    scale: 1,
    rotation: 0,
    ...layer,
  });
}

function shape(layer: Omit<ShapeLayer, "type" | "source" | "visible" | "locked" | "editable" | "opacity" | "scale" | "rotation">): ShapeLayer {
  return baseLayer({
    type: "shape",
    source: "template",
    visible: true,
    locked: false,
    editable: true,
    opacity: 1,
    scale: 1,
    rotation: 0,
    ...layer,
  });
}

function table(layer: Omit<TableLayer, "type" | "source" | "visible" | "locked" | "editable" | "opacity" | "scale" | "rotation">): TableLayer {
  return baseLayer({
    type: "table",
    source: "computed",
    visible: true,
    locked: false,
    editable: true,
    opacity: 1,
    scale: 1,
    rotation: 0,
    ...layer,
  });
}

function makeHeroTemplate(project: Project, sku: Sku): Template {
  return {
    id: "hero-main",
    kind: "hero",
    name: "主图",
    canvas: { width: 1440, height: 1440 },
    background: "#ffffff",
    layers: [
      image({
        id: "logo-top",
        name: "未艾互连经典 LOGO",
        materialSlot: "logo",
        materialId: "logo-wayiii-classic",
        imageUrl: materialUrl("logo-wayiii-classic"),
        x: 48,
        y: 46,
        width: 365,
        height: 132,
        fit: "contain",
        zIndex: 1,
      }),
      shape({
        id: "logo-safe-area",
        name: "LOGO 安全区",
        x: 48,
        y: 40,
        width: 380,
        height: 150,
        shape: "rect",
        fill: "rgba(255,255,255,0)",
        stroke: "rgba(11,112,183,0.05)",
        strokeWidth: 1,
        zIndex: 0,
      }),
      image({
        id: "spec-pill",
        name: "蓝色参数胶囊",
        materialSlot: "spec-pill",
        materialId: "spec-pill-blue",
        imageUrl: materialUrl("spec-pill-blue"),
        x: 270,
        y: 258,
        width: 874,
        height: 100,
        fit: "stretch",
        zIndex: 2,
      }),
      text({
        id: "spec-pill-text",
        name: "频率驻波文字",
        text: `频率:${sku.frequency}   驻波:${sku.vswr}`,
        x: 310,
        y: 282,
        width: 800,
        height: 62,
        fontSize: 48,
        fontWeight: 500,
        color: "#ffffff",
        align: "center",
        lineHeight: 1,
        zIndex: 3,
      }),
      text({
        id: "hero-title",
        name: "产品标题",
        text: sku.title,
        x: 146,
        y: 420,
        width: 1120,
        height: 105,
        fontSize: 88,
        fontWeight: 800,
        color: blue,
        align: "center",
        lineHeight: 1,
        zIndex: 2,
      }),
      image({
        id: "product-main",
        name: "主产品图",
        assetRole: "productTransparent",
        assetId: sku.assets.productTransparent?.id,
        imageUrl: sku.assets.productTransparent?.url,
        assetMissing: !sku.assets.productTransparent,
        x: 112,
        y: 548,
        width: 1214,
        height: 590,
        fit: "contain",
        shadow: "0 28px 30px rgba(0,0,0,0.12)",
        zIndex: 4,
      }),
      image({
        id: "bottom-board",
        name: "经典蓝色底板",
        materialSlot: "bottom-board",
        materialId: "bottom-board-classic",
        imageUrl: materialUrl("bottom-board-classic"),
        x: 0,
        y: 1180,
        width: 1440,
        height: 260,
        fit: "stretch",
        zIndex: 1,
      }),
      image({
        id: "invoice-panel",
        name: "浅蓝促销角标",
        materialSlot: "promo-badge",
        materialId: "promo-badge-soft",
        imageUrl: materialUrl("promo-badge-soft"),
        x: 0,
        y: 1178,
        width: 420,
        height: 262,
        fit: "stretch",
        zIndex: 2,
      }),
      text({
        id: "invoice-text",
        name: "免费开票",
        text: "免费\n开票",
        x: 42,
        y: 1200,
        width: 300,
        height: 210,
        fontSize: 78,
        fontWeight: 800,
        color: blue,
        align: "center",
        lineHeight: 1.32,
        zIndex: 3,
      }),
      text({
        id: "shipping-text",
        name: "底部承诺",
        text: "工厂直发 顺丰速达",
        x: 480,
        y: 1290,
        width: 850,
        height: 100,
        fontSize: 72,
        fontWeight: 500,
        color: "#ffffff",
        align: "center",
        lineHeight: 1,
        zIndex: 3,
      }),
    ],
  };
}

function makeSpecsTemplate(sku: Sku): Template {
  return {
    id: "spec-table",
    kind: "specs",
    name: "材料及性能指标",
    canvas: { width: 1440, height: 1440 },
    background: "#ffffff",
    layers: [
      shape({
        id: "spec-title-pill",
        name: "标题胶囊",
        shape: "pill",
        x: 310,
        y: 108,
        width: 830,
        height: 138,
        fill: blue,
        radius: 70,
        zIndex: 1,
      }),
      text({
        id: "spec-title",
        name: "参数标题",
        text: "材料及性能指标",
        x: 412,
        y: 142,
        width: 630,
        height: 86,
        fontSize: 62,
        fontWeight: 700,
        color: "#ffffff",
        align: "center",
        lineHeight: 1,
        zIndex: 2,
      }),
      table({
        id: "specs-table",
        name: "参数表",
        x: 176,
        y: 360,
        width: 1100,
        height: 950,
        columns: ["项目", "参数"],
        rows: sku.parameters,
        headerFill: blue,
        stripeFill: stripe,
        borderColor: line,
        textColor: deepBlue,
        fontSize: 48,
        zIndex: 3,
      }),
    ],
  };
}

function makeDrawingTemplate(project: Project, sku: Sku): Template {
  return {
    id: "drawing-size",
    kind: "drawing",
    name: "外形规格",
    canvas: { width: 1440, height: 1440 },
    background: "#ffffff",
    layers: [
      image({
        id: "logo-top",
        name: "未艾互连经典 LOGO",
        materialSlot: "logo",
        materialId: "logo-wayiii-classic",
        imageUrl: materialUrl("logo-wayiii-classic"),
        x: 48,
        y: 48,
        width: 430,
        height: 140,
        fit: "contain",
        zIndex: 1,
      }),
      text({
        id: "drawing-title",
        name: "工程图标题",
        text: "外形规格",
        x: 470,
        y: 232,
        width: 500,
        height: 120,
        fontSize: 108,
        fontWeight: 800,
        color: blue,
        align: "center",
        lineHeight: 1,
        zIndex: 2,
      }),
      image({
        id: "drawing-image",
        name: "工程图",
        assetRole: "drawing",
        assetId: sku.assets.drawing?.id,
        imageUrl: sku.assets.drawing?.url,
        assetMissing: !sku.assets.drawing,
        x: 110,
        y: 450,
        width: 1220,
        height: 520,
        fit: "contain",
        zIndex: 3,
      }),
      text({
        id: "drawing-note",
        name: "工程图备注",
        text: "尺寸(mm),一般公差(±0.1)",
        x: 505,
        y: 1088,
        width: 430,
        height: 48,
        fontSize: 36,
        fontWeight: 400,
        color: "#111111",
        align: "center",
        lineHeight: 1,
        zIndex: 3,
      }),
      image({
        id: "drawing-model-pill",
        name: "蓝色参数胶囊",
        materialSlot: "spec-pill",
        materialId: "spec-pill-blue",
        imageUrl: materialUrl("spec-pill-blue"),
        x: 500,
        y: 1214,
        width: 442,
        height: 84,
        fit: "stretch",
        zIndex: 2,
      }),
      text({
        id: "drawing-model",
        name: "型号",
        text: sku.model,
        x: 554,
        y: 1232,
        width: 336,
        height: 54,
        fontSize: 48,
        fontWeight: 500,
        color: "#ffffff",
        align: "center",
        lineHeight: 1,
        zIndex: 3,
      }),
    ],
  };
}

function makeServiceTemplate(project: Project, sku: Sku): Template {
  const iconLayers = sku.serviceItems.map((item, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const tileX = 86 + col * 452;
    const tileY = 535 + row * 392;
    return {
      tile: image({
        id: `service-tile-${index}`,
        name: "蓝色服务宫格",
        materialSlot: "service-tile",
        materialId: "service-tile-blue",
        imageUrl: materialUrl("service-tile-blue"),
        x: tileX,
        y: tileY,
        width: 360,
        height: 310,
        fit: "stretch",
        zIndex: 1,
      }),
      icon: {
        id: `service-icon-${index}`,
        name: `${item.label}图标`,
        type: "icon" as const,
        icon: item.icon,
        color: "#ffffff",
        x: tileX,
        y: tileY,
        width: 360,
        height: 310,
        fontSize: 76,
        visible: true,
        locked: false,
        editable: true,
        source: "template" as const,
        opacity: 1,
        scale: 1,
        rotation: 0,
        zIndex: 2,
      },
      label: text({
        id: `service-label-${index}`,
        name: `${item.label}文字`,
        text: item.label,
        x: 130 + col * 452,
        y: 765 + row * 392,
        width: 270,
        height: 70,
        fontSize: 48,
        fontWeight: 500,
        color: "#ffffff",
        align: "center",
        lineHeight: 1,
        zIndex: 3,
      }),
    };
  });

  return {
    id: "service-promise",
    kind: "service",
    name: "服务承诺",
    canvas: { width: 1440, height: 1440 },
    background: "#ffffff",
    layers: [
      text({
        id: "service-title-cn",
        name: "服务承诺标题",
        text: `${project.brand.cnName} 服务承诺`,
        x: 184,
        y: 164,
        width: 1080,
        height: 110,
        fontSize: 88,
        fontWeight: 800,
        color: blue,
        align: "center",
        lineHeight: 1,
        zIndex: 2,
      }),
      text({
        id: "service-title-en",
        name: "服务承诺英文",
        text: "Wayiii Interconnect Service Commitment",
        x: 210,
        y: 310,
        width: 1020,
        height: 62,
        fontSize: 48,
        fontWeight: 700,
        color: blue,
        align: "center",
        lineHeight: 1,
        zIndex: 2,
      }),
      shape({
        id: "service-divider",
        name: "分割线",
        shape: "line",
        x: 58,
        y: 406,
        width: 1322,
        height: 4,
        fill: blue,
        zIndex: 1,
      }),
      ...iconLayers.flatMap((item) => [item.tile, item.icon, item.label]),
    ],
  };
}

function makeWhiteTemplate(sku: Sku): Template {
  return {
    id: "white-product",
    kind: "white",
    name: "白底产品",
    canvas: { width: 1440, height: 1440 },
    background: "#ffffff",
    layers: [
      image({
        id: "white-product-image",
        name: "白底产品图",
        assetRole: "productTransparent",
        assetId: sku.assets.productTransparent?.id,
        imageUrl: sku.assets.productTransparent?.url,
        assetMissing: !sku.assets.productTransparent,
        x: 72,
        y: 340,
        width: 1290,
        height: 760,
        fit: "contain",
        shadow: "0 18px 26px rgba(0,0,0,0.08)",
        zIndex: 1,
      }),
    ],
  };
}

function makeDetailTemplate(project: Project, sku: Sku): Template {
  return {
    id: "detail-page",
    kind: "detail",
    name: "详情长图",
    canvas: { width: 960, height: 2600 },
    background: blue,
    layers: [
      image({
        id: "detail-card-top",
        name: "白色圆角内容板",
        materialSlot: "content-card",
        materialId: "content-card-rounded",
        imageUrl: materialUrl("content-card-rounded"),
        x: 40,
        y: 56,
        width: 880,
        height: 920,
        fit: "stretch",
        zIndex: 1,
      }),
      text({
        id: "detail-title-cn",
        name: "详情中文标题",
        text: "射频同轴转接器",
        x: 105,
        y: 170,
        width: 750,
        height: 86,
        fontSize: 76,
        fontWeight: 800,
        color: blue,
        align: "center",
        lineHeight: 1,
        zIndex: 3,
      }),
      text({
        id: "detail-title-en",
        name: "详情英文标题",
        text: sku.subtitle,
        x: 142,
        y: 300,
        width: 676,
        height: 48,
        fontSize: 42,
        fontWeight: 400,
        color: blue,
        align: "center",
        lineHeight: 1,
        zIndex: 3,
      }),
      image({
        id: "detail-spec-pill",
        name: "蓝色参数胶囊",
        materialSlot: "spec-pill",
        materialId: "spec-pill-blue",
        imageUrl: materialUrl("spec-pill-blue"),
        x: 150,
        y: 418,
        width: 660,
        height: 62,
        fit: "stretch",
        zIndex: 3,
      }),
      text({
        id: "detail-spec-text",
        name: "详情规格文字",
        text: `${sku.shortSpec}   频率${sku.frequency.replace("DC~", "")}`,
        x: 174,
        y: 431,
        width: 612,
        height: 38,
        fontSize: 32,
        fontWeight: 700,
        color: "#ffffff",
        align: "center",
        lineHeight: 1,
        zIndex: 4,
      }),
      image({
        id: "detail-product",
        name: "详情产品图",
        assetRole: "productTransparent",
        assetId: sku.assets.productTransparent?.id,
        imageUrl: sku.assets.productTransparent?.url,
        assetMissing: !sku.assets.productTransparent,
        x: 78,
        y: 515,
        width: 810,
        height: 420,
        fit: "contain",
        zIndex: 4,
      }),
      image({
        id: "detail-search",
        name: "搜索条素材",
        materialSlot: "search-strip",
        materialId: "search-strip-blue",
        imageUrl: materialUrl("search-strip-blue"),
        x: 98,
        y: 1098,
        width: 452,
        height: 66,
        fit: "stretch",
        zIndex: 2,
      }),
      text({
        id: "detail-search-text",
        name: "搜索条文字",
        text: project.brand.cnName,
        x: 155,
        y: 1114,
        width: 300,
        height: 34,
        fontSize: 32,
        fontWeight: 600,
        color: "#ffffff",
        align: "center",
        lineHeight: 1,
        zIndex: 3,
      }),
      image({
        id: "detail-card-service",
        name: "白色圆角内容板",
        materialSlot: "content-card",
        materialId: "content-card-rounded",
        imageUrl: materialUrl("content-card-rounded"),
        x: 40,
        y: 1240,
        width: 880,
        height: 900,
        fit: "stretch",
        zIndex: 1,
      }),
      text({
        id: "detail-service-title",
        name: "详情服务标题",
        text: `${project.brand.cnName} 服务承诺`,
        x: 130,
        y: 1340,
        width: 700,
        height: 72,
        fontSize: 64,
        fontWeight: 800,
        color: blue,
        align: "center",
        lineHeight: 1,
        zIndex: 3,
      }),
      table({
        id: "detail-param-table",
        name: "详情参数表",
        x: 90,
        y: 2230,
        width: 780,
        height: 300,
        columns: ["项目", "参数"],
        rows: sku.parameters.slice(0, 4),
        headerFill: blue,
        stripeFill: "#eef3f8",
        borderColor: "#9fb2c4",
        textColor: deepBlue,
        fontSize: 30,
        zIndex: 2,
      }),
    ],
  };
}

export function createTemplateSuite(project: Project, sku: Sku): TemplateSuite {
  return {
    project,
    sku,
    templates: [
      makeHeroTemplate(project, sku),
      makeSpecsTemplate(sku),
      makeDrawingTemplate(project, sku),
      makeServiceTemplate(project, sku),
      makeWhiteTemplate(sku),
      makeDetailTemplate(project, sku),
    ],
    exportPresets: createExportPresets(),
  };
}

export function mergeLayerPatch<T extends Layer>(template: Template, layerId: string, patch: Partial<T>): Template {
  return {
    ...template,
    layers: template.layers.map((layer) => (layer.id === layerId ? ({ ...layer, ...patch } as Layer) : layer)),
  };
}

function textOverflowRisk(layer: TextLayer): boolean {
  const estimatedWidth = Math.max(
    ...layer.text.split("\n").map((line) => {
      const cjkChars = Array.from(line).filter((char) => /[\u3400-\u9fff]/.test(char)).length;
      const otherChars = Array.from(line).length - cjkChars;
      return (cjkChars * layer.fontSize + otherChars * layer.fontSize * 0.56) * layer.scale;
    }),
  );
  return estimatedWidth > layer.width * 1.08;
}

export function validateTemplate(template: Template): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  template.layers.forEach((layer) => {
    if (layer.type === "image" && layer.assetRole === "productTransparent" && layer.assetMissing) {
      issues.push({
        severity: "error",
        code: "missing-product-image",
        message: "缺少透明产品图，无法保证真实产品拼接质量。",
        layerId: layer.id,
      });
    }

    if (layer.type === "image" && layer.assetRole === "drawing" && layer.assetMissing) {
      issues.push({
        severity: "warning",
        code: "missing-drawing-image",
        message: "缺少工程图，工程尺寸页需要人工补充。",
        layerId: layer.id,
      });
    }

    if (layer.type === "text" && textOverflowRisk(layer)) {
      issues.push({
        severity: "warning",
        code: "text-overflow-risk",
        message: "文本可能超出图层宽度，建议缩小字号或调整换行。",
        layerId: layer.id,
      });
    }
  });

  if (hasProductTextOverlap(template)) {
    issues.push({
      severity: "warning",
      code: "product-text-overlap",
      message: "商品图与文字区域发生重叠，建议缩小商品图或调整文字位置。",
    });
  }

  return issues;
}
