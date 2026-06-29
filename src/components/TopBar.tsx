import { Download, FileArchive, ImageDown, Package, ZoomIn, ZoomOut } from "lucide-react";
import type { Sku, Template } from "../core/types";

interface TopBarProps {
  sku: Sku;
  template: Template;
  zoom: number;
  busy: boolean;
  onZoom: (zoom: number) => void;
  onExportCurrent: (format: "png" | "jpg") => void;
  onExportSku: () => void;
  onExportAll: () => void;
}

export function TopBar({ sku, template, zoom, busy, onZoom, onExportCurrent, onExportSku, onExportAll }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="document-title">
        <strong>{sku.model}</strong>
        <span>{template.name}</span>
        <small>
          {template.canvas.width}×{template.canvas.height}
        </small>
      </div>
      <div className="toolbar-group">
        <button className="icon-button" type="button" title="缩小" onClick={() => onZoom(Math.max(0.18, zoom - 0.05))}>
          <ZoomOut size={17} />
        </button>
        <span className="zoom-value">{Math.round(zoom * 100)}%</span>
        <button className="icon-button" type="button" title="放大" onClick={() => onZoom(Math.min(0.9, zoom + 0.05))}>
          <ZoomIn size={17} />
        </button>
      </div>
      <div className="toolbar-group export-group">
        <button className="icon-button wide" type="button" title="导出当前 PNG" disabled={busy} onClick={() => onExportCurrent("png")}>
          <ImageDown size={17} />
          <span>PNG</span>
        </button>
        <button className="icon-button wide" type="button" title="导出当前 JPG" disabled={busy} onClick={() => onExportCurrent("jpg")}>
          <Download size={17} />
          <span>JPG</span>
        </button>
        <button className="icon-button wide" type="button" title="导出当前 SKU" disabled={busy} onClick={onExportSku}>
          <FileArchive size={17} />
          <span>SKU</span>
        </button>
        <button className="icon-button wide" type="button" title="批量导出全部 SKU" disabled={busy} onClick={onExportAll}>
          <Package size={17} />
          <span>全部</span>
        </button>
      </div>
    </header>
  );
}
