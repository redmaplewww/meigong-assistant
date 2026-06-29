import { FileUp, FolderOpen, Image, Layers, WandSparkles } from "lucide-react";
import type { Sku, Template, TemplateKind } from "../core/types";

interface LeftSidebarProps {
  catalog: Sku[];
  selectedSkuId: string;
  templates: Template[];
  selectedTemplateId: string;
  onSelectSku: (skuId: string) => void;
  onSelectTemplate: (templateId: string) => void;
  onImportFiles: (files: File[]) => void;
  onRestoreSample: () => void;
}

const templateLabels: Record<TemplateKind, string> = {
  hero: "主图",
  specs: "参数表",
  drawing: "工程图",
  service: "服务承诺",
  white: "白底图",
  detail: "详情长图",
};

export function LeftSidebar({
  catalog,
  selectedSkuId,
  templates,
  selectedTemplateId,
  onSelectSku,
  onSelectTemplate,
  onImportFiles,
  onRestoreSample,
}: LeftSidebarProps) {
  const selectedSku = catalog.find((sku) => sku.id === selectedSkuId) ?? catalog[0];
  const assets = selectedSku
    ? [
        selectedSku.assets.productTransparent,
        selectedSku.assets.drawing,
        ...selectedSku.assets.productPhotos.slice(0, 4),
        ...selectedSku.assets.detailSlices.slice(0, 3),
      ].filter(Boolean)
    : [];

  return (
    <aside className="sidebar left-sidebar">
      <div className="brand-block">
        <div className="brand-mark">未艾</div>
        <div>
          <h1>美工助手</h1>
          <p>Waiyii Blue Industrial</p>
        </div>
      </div>

      <div className="button-row">
        <label className="icon-button wide" title="导入 SKU 文件夹">
          <FolderOpen size={17} />
          <span>导入文件夹</span>
          <input
            className="hidden-input"
            type="file"
            multiple
            accept="image/png,image/jpeg"
            onChange={(event) => {
              onImportFiles(Array.from(event.currentTarget.files ?? []));
              event.currentTarget.value = "";
            }}
            {...({ webkitdirectory: "true", directory: "true" } as Record<string, string>)}
          />
        </label>
        <button className="icon-button" type="button" title="载入样例素材" onClick={onRestoreSample}>
          <FileUp size={17} />
        </button>
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
                {templateLabels[template.kind]} · {template.canvas.width}×{template.canvas.height}
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
            <figure key={asset!.id}>
              {asset!.url ? <img src={asset!.url} alt={asset!.name} /> : <div className="asset-empty" />}
              <figcaption>{asset!.name}</figcaption>
            </figure>
          ))}
        </div>
      </section>
    </aside>
  );
}
