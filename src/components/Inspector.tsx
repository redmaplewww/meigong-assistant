import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  Lock,
  Palette,
  Plus,
  TableProperties,
  Type,
  Unlock,
} from "lucide-react";
import type { Layer, LayerType, ParameterRow, Project, TableLayer, Template } from "../core/types";

interface InspectorProps {
  project: Project;
  template: Template;
  selectedLayer?: Layer;
  issues: Array<{ code: string; message: string; severity: "error" | "warning"; layerId?: string }>;
  onSelectLayer: (layerId: string) => void;
  onPatchLayer: (layerId: string, patch: Partial<Layer>) => void;
  onMoveLayer: (layerId: string, direction: "up" | "down") => void;
  onProjectColor: (color: string) => void;
  onAddLayer: (type: Extract<LayerType, "text" | "shape" | "table" | "icon">) => void;
  onDuplicateTemplate: () => void;
}

const fontOptions = [
  { label: "微软雅黑 / 默认黑体", value: '"Microsoft YaHei", "PingFang SC", Arial, sans-serif' },
  { label: "Noto Sans SC", value: '"Noto Sans SC", "Microsoft YaHei", sans-serif' },
  { label: "黑体 SimHei", value: '"SimHei", "Microsoft YaHei", sans-serif' },
  { label: "宋体 SimSun", value: '"SimSun", "Songti SC", serif' },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Georgia", value: 'Georgia, "Times New Roman", serif' },
];

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value?: string; onChange: (value: string) => void }) {
  return (
    <label className="field color-field">
      <span>{label}</span>
      <input type="color" value={value?.startsWith("#") ? value : "#0b70b7"} onChange={(event) => onChange(event.currentTarget.value)} />
    </label>
  );
}

function FontField({ value, onChange }: { value?: string; onChange: (value: string) => void }) {
  return (
    <label className="field full">
      <span>字体</span>
      <select className="select" value={value ?? fontOptions[0].value} onChange={(event) => onChange(event.currentTarget.value)}>
        {fontOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function updateRows(rows: ParameterRow[], rowIndex: number, key: keyof ParameterRow, value: string): ParameterRow[] {
  return rows.map((row, index) => (index === rowIndex ? { ...row, [key]: value } : row));
}

export function Inspector({
  project,
  template,
  selectedLayer,
  issues,
  onSelectLayer,
  onPatchLayer,
  onMoveLayer,
  onProjectColor,
  onAddLayer,
  onDuplicateTemplate,
}: InspectorProps) {
  return (
    <aside className="sidebar inspector">
      <section className="panel-section">
        <div className="section-title">
          <Palette size={16} />
          <span>项目</span>
        </div>
        <ColorField label="统一主色" value={project.brand.primaryColor} onChange={onProjectColor} />
        <div className="policy-strip">
          <span>整图生成关闭</span>
          <span>拼接渲染</span>
        </div>
      </section>

      <section className="panel-section">
        <div className="section-title">
          <Plus size={16} />
          <span>模板设计</span>
        </div>
        <div className="button-row compact">
          <button type="button" className="icon-button wide" title="复制当前模板为新模板" onClick={onDuplicateTemplate}>
            <Copy size={15} />
            <span>复制模板</span>
          </button>
        </div>
        <div className="add-layer-grid">
          <button type="button" onClick={() => onAddLayer("text")}>
            文字
          </button>
          <button type="button" onClick={() => onAddLayer("shape")}>
            形状
          </button>
          <button type="button" onClick={() => onAddLayer("table")}>
            表格
          </button>
          <button type="button" onClick={() => onAddLayer("icon")}>
            图标
          </button>
        </div>
      </section>

      <section className="panel-section">
        <div className="section-title">
          <TableProperties size={16} />
          <span>图层</span>
        </div>
        <div className="layer-list">
          {[...template.layers]
            .sort((a, b) => b.zIndex - a.zIndex)
            .map((layer) => {
              const layerIssue = issues.find((issue) => issue.layerId === layer.id);
              return (
                <button
                  key={layer.id}
                  type="button"
                  className={`layer-row ${selectedLayer?.id === layer.id ? "active" : ""} ${layerIssue ? layerIssue.severity : ""}`}
                  onClick={() => onSelectLayer(layer.id)}
                >
                  <span>{layer.visible ? <Eye size={15} /> : <EyeOff size={15} />}</span>
                  <strong>{layer.name}</strong>
                  <small>{layer.type}</small>
                </button>
              );
            })}
        </div>
      </section>

      {selectedLayer ? (
        <section className="panel-section controls">
          <div className="section-title">
            <Type size={16} />
            <span>{selectedLayer.name}</span>
          </div>

          <div className="button-row compact">
            <button
              type="button"
              className="icon-button"
              title={selectedLayer.visible ? "隐藏" : "显示"}
              onClick={() => onPatchLayer(selectedLayer.id, { visible: !selectedLayer.visible } as Partial<Layer>)}
            >
              {selectedLayer.visible ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
            <button
              type="button"
              className="icon-button"
              title={selectedLayer.locked ? "解锁" : "锁定"}
              onClick={() => onPatchLayer(selectedLayer.id, { locked: !selectedLayer.locked } as Partial<Layer>)}
            >
              {selectedLayer.locked ? <Lock size={16} /> : <Unlock size={16} />}
            </button>
            <button type="button" className="icon-button" title="上移" onClick={() => onMoveLayer(selectedLayer.id, "up")}>
              <ArrowUp size={16} />
            </button>
            <button type="button" className="icon-button" title="下移" onClick={() => onMoveLayer(selectedLayer.id, "down")}>
              <ArrowDown size={16} />
            </button>
          </div>

          <div className="field-grid">
            <NumberField label="X" value={selectedLayer.x} onChange={(x) => onPatchLayer(selectedLayer.id, { x } as Partial<Layer>)} />
            <NumberField label="Y" value={selectedLayer.y} onChange={(y) => onPatchLayer(selectedLayer.id, { y } as Partial<Layer>)} />
            <NumberField label="宽" value={selectedLayer.width} min={1} onChange={(width) => onPatchLayer(selectedLayer.id, { width } as Partial<Layer>)} />
            <NumberField label="高" value={selectedLayer.height} min={1} onChange={(height) => onPatchLayer(selectedLayer.id, { height } as Partial<Layer>)} />
            <NumberField
              label="缩放"
              value={selectedLayer.scale}
              min={0.1}
              max={3}
              step={0.01}
              onChange={(scale) => onPatchLayer(selectedLayer.id, { scale } as Partial<Layer>)}
            />
            <NumberField
              label="旋转"
              value={selectedLayer.rotation}
              min={-180}
              max={180}
              onChange={(rotation) => onPatchLayer(selectedLayer.id, { rotation } as Partial<Layer>)}
            />
          </div>

          <label className="range-field">
            <span>透明度</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={selectedLayer.opacity}
              onChange={(event) => onPatchLayer(selectedLayer.id, { opacity: Number(event.currentTarget.value) } as Partial<Layer>)}
            />
          </label>

          {selectedLayer.type === "text" ? (
            <div className="control-group">
              <label className="field full">
                <span>文案</span>
                <textarea value={selectedLayer.text} onChange={(event) => onPatchLayer(selectedLayer.id, { text: event.currentTarget.value } as Partial<Layer>)} />
              </label>
              <div className="field-grid">
                <NumberField label="字号" value={selectedLayer.fontSize} min={8} max={160} onChange={(fontSize) => onPatchLayer(selectedLayer.id, { fontSize } as Partial<Layer>)} />
                <NumberField
                  label="字重"
                  value={selectedLayer.fontWeight}
                  min={300}
                  max={900}
                  step={100}
                  onChange={(fontWeight) => onPatchLayer(selectedLayer.id, { fontWeight } as Partial<Layer>)}
                />
              </div>
              <FontField value={selectedLayer.fontFamily} onChange={(fontFamily) => onPatchLayer(selectedLayer.id, { fontFamily } as Partial<Layer>)} />
              <ColorField label="文字色" value={selectedLayer.color} onChange={(color) => onPatchLayer(selectedLayer.id, { color } as Partial<Layer>)} />
              <select
                className="select"
                value={selectedLayer.align}
                onChange={(event) => onPatchLayer(selectedLayer.id, { align: event.currentTarget.value as "left" | "center" | "right" } as Partial<Layer>)}
              >
                <option value="left">左对齐</option>
                <option value="center">居中</option>
                <option value="right">右对齐</option>
              </select>
            </div>
          ) : null}

          {selectedLayer.type === "shape" ? (
            <div className="control-group">
              <label className="field full">
                <span>形状</span>
                <select
                  className="select"
                  value={selectedLayer.shape}
                  onChange={(event) => onPatchLayer(selectedLayer.id, { shape: event.currentTarget.value as "rect" | "pill" | "ellipse" | "line" } as Partial<Layer>)}
                >
                  <option value="pill">胶囊</option>
                  <option value="rect">矩形</option>
                  <option value="ellipse">椭圆</option>
                  <option value="line">线条</option>
                </select>
              </label>
              <ColorField label="填充" value={selectedLayer.fill} onChange={(fill) => onPatchLayer(selectedLayer.id, { fill } as Partial<Layer>)} />
              <ColorField label="描边" value={selectedLayer.stroke} onChange={(stroke) => onPatchLayer(selectedLayer.id, { stroke } as Partial<Layer>)} />
              <div className="field-grid">
                <NumberField label="圆角" value={selectedLayer.radius ?? 0} min={0} max={220} onChange={(radius) => onPatchLayer(selectedLayer.id, { radius } as Partial<Layer>)} />
                <NumberField
                  label="描边宽"
                  value={selectedLayer.strokeWidth ?? 0}
                  min={0}
                  max={24}
                  onChange={(strokeWidth) => onPatchLayer(selectedLayer.id, { strokeWidth } as Partial<Layer>)}
                />
              </div>
            </div>
          ) : null}

          {selectedLayer.type === "image" ? (
            <div className="control-group">
              <select
                className="select"
                value={selectedLayer.fit}
                onChange={(event) => onPatchLayer(selectedLayer.id, { fit: event.currentTarget.value as "contain" | "cover" | "stretch" } as Partial<Layer>)}
              >
                <option value="contain">Contain</option>
                <option value="cover">Cover</option>
                <option value="stretch">Stretch</option>
              </select>
              <label className="field full">
                <span>阴影</span>
                <input value={selectedLayer.shadow ?? ""} onChange={(event) => onPatchLayer(selectedLayer.id, { shadow: event.currentTarget.value } as Partial<Layer>)} />
              </label>
            </div>
          ) : null}

          {selectedLayer.type === "table" ? (
            <div className="control-group table-editor">
              <div className="field-grid">
                <NumberField label="字号" value={selectedLayer.fontSize} min={10} max={80} onChange={(fontSize) => onPatchLayer(selectedLayer.id, { fontSize } as Partial<Layer>)} />
              </div>
              <FontField value={selectedLayer.fontFamily} onChange={(fontFamily) => onPatchLayer(selectedLayer.id, { fontFamily } as Partial<Layer>)} />
              <ColorField label="表头色" value={selectedLayer.headerFill} onChange={(headerFill) => onPatchLayer(selectedLayer.id, { headerFill } as Partial<Layer>)} />
              <ColorField label="斑马纹" value={selectedLayer.stripeFill} onChange={(stripeFill) => onPatchLayer(selectedLayer.id, { stripeFill } as Partial<Layer>)} />
              <ColorField label="边框色" value={selectedLayer.borderColor} onChange={(borderColor) => onPatchLayer(selectedLayer.id, { borderColor } as Partial<Layer>)} />
              <ColorField label="文字色" value={selectedLayer.textColor} onChange={(textColor) => onPatchLayer(selectedLayer.id, { textColor } as Partial<Layer>)} />
              {(selectedLayer as TableLayer).rows.map((row, index) => (
                <div className="table-edit-row" key={`${row.label}-${index}`}>
                  <input
                    value={row.label}
                    onChange={(event) =>
                      onPatchLayer(selectedLayer.id, {
                        rows: updateRows((selectedLayer as TableLayer).rows, index, "label", event.currentTarget.value),
                      } as Partial<Layer>)
                    }
                  />
                  <input
                    value={row.value}
                    onChange={(event) =>
                      onPatchLayer(selectedLayer.id, {
                        rows: updateRows((selectedLayer as TableLayer).rows, index, "value", event.currentTarget.value),
                      } as Partial<Layer>)
                    }
                  />
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="panel-section issues">
        <div className="section-title">
          <span>质检</span>
        </div>
        {issues.length ? (
          issues.map((issue) => (
            <div key={`${issue.code}-${issue.layerId}`} className={`issue ${issue.severity}`}>
              <strong>{issue.severity === "error" ? "错误" : "提醒"}</strong>
              <span>{issue.message}</span>
            </div>
          ))
        ) : (
          <div className="issue ok">
            <strong>通过</strong>
            <span>当前模板无阻断项</span>
          </div>
        )}
      </section>
    </aside>
  );
}
