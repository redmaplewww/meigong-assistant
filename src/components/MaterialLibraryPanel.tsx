import { BookmarkPlus, Box, Download, Layers3, PackageCheck, Trash2, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import type { MaterialAsset, MaterialSelection, MaterialSlot, MaterialTemplateSet } from "../core/types";

interface MaterialLibraryPanelProps {
  materials: MaterialAsset[];
  selection: MaterialSelection;
  templateSets: MaterialTemplateSet[];
  onSelectMaterial: (slot: MaterialSlot, materialId: string) => void;
  onUploadMaterial: (slot: MaterialSlot, file: File) => void;
  onDeleteMaterial: (materialId: string) => void;
  onSaveTemplateSet: (name: string) => void;
  onApplyTemplateSet: (templateSetId: string) => void;
  onDeleteTemplateSet: (templateSetId: string) => void;
  onExportWorkspace: () => void;
  onImportWorkspace: (file: File) => void;
}

const slotLabels: Record<MaterialSlot, string> = {
  "bottom-board": "底板",
  "top-cap": "顶板",
  logo: "LOGO",
  "promo-badge": "促销角标",
  "content-card": "详情卡片",
  "service-tile": "服务块",
  "search-strip": "搜索条",
  "spec-pill": "参数胶囊",
};

const slots: MaterialSlot[] = [
  "bottom-board",
  "top-cap",
  "logo",
  "promo-badge",
  "content-card",
  "service-tile",
  "search-strip",
  "spec-pill",
];

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未记录";
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function canDeleteMaterial(material: MaterialAsset): boolean {
  return material.id.startsWith("custom-") || material.id.startsWith("ai-") || material.tags.includes("ai-variant") || material.tags.includes("custom");
}

export function MaterialLibraryPanel({
  materials,
  selection,
  templateSets,
  onSelectMaterial,
  onUploadMaterial,
  onDeleteMaterial,
  onSaveTemplateSet,
  onApplyTemplateSet,
  onDeleteTemplateSet,
  onExportWorkspace,
  onImportWorkspace,
}: MaterialLibraryPanelProps) {
  const [mode, setMode] = useState<"materials" | "templates">("materials");
  const [activeSlot, setActiveSlot] = useState<MaterialSlot>("bottom-board");
  const [query, setQuery] = useState("");
  const [setName, setSetName] = useState("我的工业套装");

  const activeMaterials = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return materials
      .filter((material) => material.slot === activeSlot)
      .filter((material) => {
        if (!keyword) return true;
        return [material.name, material.id, ...material.tags].join(" ").toLowerCase().includes(keyword);
      });
  }, [activeSlot, materials, query]);

  const selectedCount = slots.filter((slot) => selection[slot]).length;

  return (
    <section className="panel-section material-library">
      <div className="section-title">
        <Layers3 size={16} />
        <span>素材与模板库</span>
      </div>

      <div className="library-mode">
        <button type="button" className={mode === "materials" ? "active" : ""} onClick={() => setMode("materials")}>
          <Box size={14} />
          <span>素材</span>
        </button>
        <button type="button" className={mode === "templates" ? "active" : ""} onClick={() => setMode("templates")}>
          <PackageCheck size={14} />
          <span>模板套装</span>
        </button>
      </div>

      <div className="library-actions">
        <button type="button" className="icon-button wide" title="导出素材库和模板库备份" onClick={onExportWorkspace}>
          <Download size={15} />
          <span>导出备份</span>
        </button>
        <label className="icon-button wide" title="导入素材库和模板库备份">
          <Upload size={15} />
          <span>导入备份</span>
          <input
            className="hidden-input"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) onImportWorkspace(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>

      {mode === "materials" ? (
        <>
          <div className="library-summary">
            <strong>{materials.length}</strong>
            <span>个素材，已选 {selectedCount}/{slots.length} 个槽位</span>
          </div>

          <div className="slot-tabs">
            {slots.map((slot) => (
              <button key={slot} type="button" className={slot === activeSlot ? "active" : ""} onClick={() => setActiveSlot(slot)}>
                {slotLabels[slot]}
                <small>{materials.filter((material) => material.slot === slot).length}</small>
              </button>
            ))}
          </div>

          <input className="library-search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder={`搜索${slotLabels[activeSlot]}素材`} />

          <div className="material-grid">
            {activeMaterials.map((material) => (
              <div key={material.id} className={`material-card-wrap ${selection[material.slot] === material.id ? "active" : ""}`}>
                <button type="button" className="material-card" onClick={() => onSelectMaterial(material.slot, material.id)} title={material.name}>
                  <img src={material.thumbnailUrl ?? material.url} alt={material.name} />
                  <span>{material.name}</span>
                </button>
                <div className="material-meta">
                  <small>{material.tags.slice(0, 2).join(" / ") || "素材"}</small>
                  {canDeleteMaterial(material) ? (
                    <button type="button" title="删除素材" onClick={() => onDeleteMaterial(material.id)}>
                      <Trash2 size={13} />
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
            {!activeMaterials.length ? <div className="library-empty">当前槽位还没有匹配素材，可以上传一张作为可复用素材。</div> : null}
          </div>

          <label className="icon-button wide upload-material" title={`上传${slotLabels[activeSlot]}`}>
            <Upload size={15} />
            <span>上传{slotLabels[activeSlot]}</span>
            <input
              className="hidden-input"
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) onUploadMaterial(activeSlot, file);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </>
      ) : (
        <>
          <div className="template-set-save">
            <input value={setName} onChange={(event) => setSetName(event.currentTarget.value)} placeholder="套装名称" />
            <button
              type="button"
              className="icon-button"
              title="保存当前素材和模板布局"
              onClick={() => {
                const trimmed = setName.trim();
                if (trimmed) onSaveTemplateSet(trimmed);
              }}
            >
              <BookmarkPlus size={16} />
            </button>
          </div>

          <div className="template-set-list">
            {templateSets.map((templateSet) => (
              <article key={templateSet.id} className="template-set-card">
                <button type="button" className="template-set-main" onClick={() => onApplyTemplateSet(templateSet.id)}>
                  <PackageCheck size={15} />
                  <span>
                    <strong>{templateSet.name}</strong>
                    <small>
                      {formatDate(templateSet.createdAt)} · {Object.keys(templateSet.selection).length} 个素材槽 · {templateSet.templates?.length ?? 0} 张模板
                    </small>
                  </span>
                  {templateSet.theme ? (
                    <i
                      className="template-set-swatch"
                      style={{ backgroundColor: templateSet.theme.primaryColor }}
                      title={`主色 ${templateSet.theme.primaryColor}`}
                    />
                  ) : null}
                </button>
                <button type="button" className="template-set-delete" title="删除模板套装" onClick={() => onDeleteTemplateSet(templateSet.id)}>
                  <Trash2 size={14} />
                </button>
              </article>
            ))}
            {!templateSets.length ? <div className="library-empty">还没有模板套装，保存当前素材和图层布局后可批量复用。</div> : null}
          </div>
        </>
      )}
    </section>
  );
}
