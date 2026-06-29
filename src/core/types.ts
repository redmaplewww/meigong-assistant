export type AssetType =
  | "product-transparent"
  | "product-photo"
  | "drawing"
  | "detail-slice"
  | "logo"
  | "icon";

export type TemplateKind = "hero" | "specs" | "drawing" | "service" | "white" | "detail";

export type LayerType = "image" | "text" | "shape" | "table" | "icon" | "group";

export type LayerSource = "template" | "uploaded" | "computed" | "ai-generated";

export type MaterialSlot =
  | "bottom-board"
  | "top-cap"
  | "logo"
  | "promo-badge"
  | "content-card"
  | "service-tile"
  | "search-strip"
  | "spec-pill";

export type MaterialKind = "board" | "cap" | "logo" | "badge" | "card" | "tile" | "strip";

export interface Asset {
  id: string;
  type: AssetType;
  name: string;
  path: string;
  url?: string;
  width?: number;
  height?: number;
}

export interface MaterialAsset {
  id: string;
  slot: MaterialSlot;
  kind: MaterialKind;
  name: string;
  url: string;
  thumbnailUrl?: string;
  width: number;
  height: number;
  tags: string[];
}

export type MaterialSelection = Partial<Record<MaterialSlot, string>>;

export interface MaterialColorReplacement {
  from: string;
  to: string;
}

export interface MaterialVariantCreation {
  id: string;
  slot: MaterialSlot;
  fromMaterialId: string;
  materialId: string;
  name: string;
  reason?: string;
  colorReplacements: MaterialColorReplacement[];
  tags?: string[];
}

export interface MaterialTemplateSet {
  id: string;
  name: string;
  createdAt: string;
  selection: MaterialSelection;
  theme?: {
    primaryColor: string;
    secondaryColor: string;
  };
  materialCreations?: MaterialVariantCreation[];
  templatePatches?: Record<string, Record<string, Partial<Layer>>>;
  templateCreations?: Array<{
    id: string;
    fromTemplateId: string;
    templateId: string;
    name: string;
    reason?: string;
    canvas?: CanvasSize;
    background?: string;
    patches: Record<string, Partial<Layer>>;
    newLayers?: Layer[];
  }>;
  templates?: Template[];
  sourcePrompt?: string;
}

export interface SkuAssets {
  productTransparent?: Asset;
  productPhotos: Asset[];
  drawing?: Asset;
  detailSlices: Asset[];
}

export interface ParameterRow {
  label: string;
  value: string;
}

export interface ServiceItem {
  icon: string;
  label: string;
}

export interface Sku {
  id: string;
  family: string;
  code: string;
  model: string;
  title: string;
  shortSpec: string;
  subtitle: string;
  frequency: string;
  vswr: string;
  parameters: ParameterRow[];
  serviceItems: ServiceItem[];
  assets: SkuAssets;
}

export interface Project {
  id: string;
  name: string;
  brand: {
    cnName: string;
    enName: string;
    primaryColor: string;
    secondaryColor: string;
  };
  typography: {
    headingFont: string;
    bodyFont: string;
  };
  aiPolicy: {
    wholeImageGeneration: false;
    allowedUses: string[];
  };
}

export interface ExportPreset {
  id: string;
  label: string;
  width: number;
  height?: number;
  format: "png" | "jpg" | "zip";
  safeMargin: number;
}

export interface CanvasSize {
  width: number;
  height: number;
}

export interface LayerBase {
  id: string;
  type: LayerType;
  name: string;
  source: LayerSource;
  visible: boolean;
  locked: boolean;
  editable: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  scale: number;
  rotation: number;
  zIndex: number;
}

export interface TextLayer extends LayerBase {
  type: "text";
  text: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  align: "left" | "center" | "right";
  lineHeight: number;
  fontFamily?: string;
}

export interface ImageLayer extends LayerBase {
  type: "image";
  assetRole?: keyof SkuAssets;
  assetId?: string;
  materialSlot?: MaterialSlot;
  materialId?: string;
  imageUrl?: string;
  fit: "contain" | "cover" | "stretch";
  shadow?: string;
  assetMissing?: boolean;
}

export interface ShapeLayer extends LayerBase {
  type: "shape";
  shape: "rect" | "pill" | "ellipse" | "line";
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
}

export interface TableLayer extends LayerBase {
  type: "table";
  columns: string[];
  rows: ParameterRow[];
  headerFill: string;
  stripeFill: string;
  borderColor: string;
  textColor: string;
  fontSize: number;
  fontFamily?: string;
}

export interface IconLayer extends LayerBase {
  type: "icon";
  icon: string;
  label?: string;
  color: string;
  fill?: string;
  fontSize?: number;
}

export interface GroupLayer extends LayerBase {
  type: "group";
  children: string[];
}

export type Layer = TextLayer | ImageLayer | ShapeLayer | TableLayer | IconLayer | GroupLayer;

export interface Template {
  id: string;
  kind: TemplateKind;
  name: string;
  canvas: CanvasSize;
  background: string;
  layers: Layer[];
}

export interface TemplateSuite {
  project: Project;
  sku: Sku;
  templates: Template[];
  exportPresets: ExportPreset[];
  materialSelection?: MaterialSelection;
}

export interface ValidationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  layerId?: string;
}
