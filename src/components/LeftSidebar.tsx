import { FileText, Image, Images, Layers, Plus, WandSparkles } from "lucide-react";
import type { Asset, Sku, Template, TemplateKind } from "../core/types";
import type { SpecDocumentProgress } from "../core/specDocument";

interface LeftSidebarProps {
  catalog: Sku[];
  selectedSkuId: string;
  templates: Template[];
  selectedTemplateId: string;
  onSelectSku: (skuId: string) => void;
  onSelectTemplate: (templateId: string) => void;
  singleImportProductName?: string;
  singleImportDetailName?: string;
  singleImportSpecName?: string;
  singleImportWarnings?: string[];
  specProgress?: SpecDocumentProgress;
  canCreateSku: boolean;
  createSkuBusy: boolean;
  onSelectProductImage: (file: File) => void | Promise<void>;
  onSelectDetailImage: (file: File) => void | Promise<void>;
  onSelectSpecDocument: (file: File) => void | Promise<void>;
  onCreateSku: () => void;
}

const templateLabels: Record<TemplateKind, string> = {
  hero: "主图",
  specs: "参数表",
  drawing: "工程图",
  service: "服务承诺",
  white: "白底图",
  detail: "详情长图",
};

function pickFirstFile(event: React.ChangeEvent<HTMLInputElement>, onPick: (file: File) => void | Promise<void>): void {
  const file = event.currentTarget.files?.[0];
  if (file) void onPick(file);
  event.currentTarget.value = "";
}

export function LeftSidebar({
  catalog,
  selectedSkuId,
  templates,
  selectedTemplateId,
  onSelectSku,
  onSelectTemplate,
  singleImportProductName,
  singleImportDetailName,
  singleImportSpecName,
  singleImportWarnings,
  specProgress,
  canCreateSku,
  createSkuBusy,
  onSelectProductImage,
  onSelectDetailImage,
  onSelectSpecDocument,
  onCreateSku,
}: LeftSidebarProps) {
  const selectedSku = catalog.find((sku) => sku.id === selectedSkuId) ?? catalog[0];
  const assets: Asset[] = selectedSku
    ? [
        selectedSku.assets.productTransparent,
        selectedSku.assets.drawing,
        ...selectedSku.assets.productPhotos.slice(0, 4),
        ...selectedSku.assets.detailSlices.slice(0, 3),
      ].filter((asset): asset is Asset => Boolean(asset))
    : [];

  return (
    <aside className="sidebar left-sidebar">
      <div className="brand-block">
        <div className="brand-mark">美工</div>
        <div>
          <h1>美工助手</h1>
          <p>Waiyii Blue Industrial</p>
        </div>
      </div>

      <div className="single-import-grid">
        <label className="icon-button wide single-import-button" title="选择一张商品图">
          <Image size={17} />
          <span>选择商品图</span>
          <input
            className="hidden-input"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => pickFirstFile(event, onSelectProductImage)}
          />
        </label>
        <label className="icon-button wide single-import-button" title="选择一张详情图">
          <Images size={17} />
          <span>选择详情图</span>
          <input
            className="hidden-input"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => pickFirstFile(event, onSelectDetailImage)}
          />
        </label>
        <label className="icon-button wide single-import-button" title="选择规格书 PDF 或图片">
          <FileText size={17} />
          <span>选择规格书</span>
          <input
            className="hidden-input"
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            onChange={(event) => pickFirstFile(event, onSelectSpecDocument)}
          />
        </label>
      </div>

      <div className="button-row compact">
        <button
          className="icon-button wide primary-action"
          type="button"
          title="根据已选择素材创建新 SKU"
          disabled={!canCreateSku || createSkuBusy}
          onClick={onCreateSku}
        >
          <Plus size={17} />
          <span>{createSkuBusy ? "处理中" : "创建 SKU"}</span>
        </button>
      </div>

      <div className="import-guide">
        <strong>单 SKU 导入</strong>
        <span>请提供商品图、详情图和规格书；规格书解析完成后点击“创建 SKU”。</span>
        <span>工程图不单独上传，会从规格书自动提取。</span>
        <span>商品图：{singleImportProductName ?? "未选择"}</span>
        <span>详情图：{singleImportDetailName ?? "未选择"}</span>
        <span>规格书：{singleImportSpecName ?? "未选择"}</span>
        {specProgress ? (
          <div className="ocr-progress">
            <div className="ocr-progress-row">
              <strong>OCR 进度</strong>
              <span>{typeof specProgress.percent === "number" ? `${specProgress.percent}%` : specProgress.stage}</span>
            </div>
            <div className="ocr-progress-track">
              <div className="ocr-progress-fill" style={{ width: `${specProgress.percent ?? 8}%` }} />
            </div>
            <span>{specProgress.message}</span>
          </div>
        ) : null}
        {singleImportWarnings?.map((warning) => <span key={warning}>提示：{warning}</span>)}
      </div>

      <section className="panel-section">
        <div className="section-title">
          <Layers size={16} />
          <span>SKU</span>
        </div>
        <div className="sku-list">
          {catalog.map((sku) => (
            <button
              key={sku.id}
              type="button"
              className={`sku-row ${sku.id === selectedSkuId ? "active" : ""}`}
              onClick={() => onSelectSku(sku.id)}
            >
              <strong>{sku.code}</strong>
              <span>{sku.title}</span>
              <small>{sku.assets.detailSlices.length} 详情片</small>
            </button>
          ))}
        </div>
      </section>

      <section className="panel-section">
        <div className="section-title">
          <WandSparkles size={16} />
          <span>模板</span>
        </div>
        <div className="template-grid">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              className={`template-tile ${template.id === selectedTemplateId ? "active" : ""}`}
              onClick={() => onSelectTemplate(template.id)}
            >
              <span>{template.name}</span>
              <small>
                {templateLabels[template.kind]} · {template.canvas.width}x{template.canvas.height}
              </small>
            </button>
          ))}
        </div>
      </section>

      <section className="panel-section asset-section">
        <div className="section-title">
          <Image size={16} />
          <span>素材</span>
        </div>
        <div className="asset-grid">
          {assets.map((asset) => (
            <figure key={asset.id}>
              {asset.url ? <img src={asset.url} alt={asset.name} /> : <div className="asset-empty" />}
              <figcaption>{asset.name}</figcaption>
            </figure>
          ))}
        </div>
      </section>
    </aside>
  );
}
