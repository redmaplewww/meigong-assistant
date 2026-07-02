import { useEffect, useMemo, useRef, useState } from "react";
import { AIAssistantPanel } from "./components/AIAssistantPanel";
import { CanvasStage } from "./components/CanvasStage";
import { Inspector } from "./components/Inspector";
import { LeftSidebar } from "./components/LeftSidebar";
import { MaterialLibraryPanel } from "./components/MaterialLibraryPanel";
import { TopBar } from "./components/TopBar";
import { buildCatalogFromSingleAssets } from "./core/importer";
import { extractSpecDocument, type SpecDocumentProgress } from "./core/specDocument";
import {
  isSingleImportReady,
  markSpecDocumentExtracted,
  markSpecDocumentParsing,
  missingSingleImportItems,
  type SingleImportFiles,
} from "./core/singleImportState";
import { downloadBlob, exportAllSkuZip, exportSkuZip, exportTemplate } from "./core/exporter";
import {
  applyTemplateCreationsToTemplates,
  applyTemplatePatchesToTemplate,
  createAssistantDraft,
  requestDeepSeekAssistantDraft,
  type AssistantDraft,
  type AssistantScope,
} from "./core/aiAssistant";
import { enforceTemplateSafety } from "./core/layoutSafety";
import {
  applyMaterialSelectionToTemplate,
  applyMaterialCreationsToLibrary,
  applyTemplateSnapshotsToTemplates,
  createDefaultMaterialLibrary,
  createTemplateSet,
} from "./core/materials";
import { createDefaultProject, createTemplateSuite, mergeLayerPatch, validateTemplate } from "./core/templates";
import { applyThemeToTemplate, createPaletteFromPrimary } from "./core/theme";
import type { Layer, LayerType, MaterialAsset, MaterialSelection, MaterialSlot, MaterialTemplateSet, Project, Sku, Template } from "./core/types";
import {
  chooseNewestWorkspace,
  loadIndexedWorkspace,
  loadLocalWorkspace,
  parseWorkspaceBackup,
  saveIndexedWorkspace,
  saveLocalWorkspace,
  serializeWorkspaceBackup,
  type TemplateMap,
  type WorkspaceSnapshot,
} from "./core/workspacePersistence";
import { sampleCatalog } from "./data/sampleCatalog";
import { webSampleCatalog } from "./data/webSampleCatalog";
import "./styles.css";

type AddableLayerType = Extract<LayerType, "text" | "shape" | "table" | "icon">;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("素材读取失败"));
    reader.readAsDataURL(blob);
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return blobToDataUrl(file);
}

function buildTemplateMap(project: Project, catalog: Sku[]): TemplateMap {
  return Object.fromEntries(catalog.map((sku) => [sku.id, createTemplateSuite(project, sku).templates]));
}

function defaultMaterialSelection(materials: MaterialAsset[]): MaterialSelection {
  const selection: MaterialSelection = {};
  materials.forEach((material) => {
    if (!selection[material.slot]) selection[material.slot] = material.id;
  });
  return selection;
}

function applySelectionToTemplateMap(
  templateMap: TemplateMap,
  selection: MaterialSelection,
  materials: MaterialAsset[],
  skuId?: string,
): TemplateMap {
  return Object.fromEntries(
    Object.entries(templateMap).map(([id, templates]) => [
      id,
      skuId && id !== skuId ? templates : templates.map((template) => applyMaterialSelectionToTemplate(template, selection, materials)),
    ]),
  );
}

function applyTemplateSetToTemplateMap(
  templateMap: TemplateMap,
  templateSet: MaterialTemplateSet,
  materials: MaterialAsset[],
): TemplateMap {
  const nextMaterials = applyMaterialCreationsToLibrary(materials, templateSet.materialCreations);
  const materialApplied = applySelectionToTemplateMap(templateMap, templateSet.selection, nextMaterials);
  const snapshotApplied = Object.fromEntries(
    Object.entries(materialApplied).map(([skuId, templates]) => [
      skuId,
      applyTemplateSnapshotsToTemplates(templates, templateSet.templates),
    ]),
  );
  if (!templateSet.templatePatches && !templateSet.templateCreations?.length) return snapshotApplied;

  return Object.fromEntries(
    Object.entries(snapshotApplied).map(([skuId, templates]) => [
      skuId,
      applyTemplateCreationsToTemplates(
        templates.map((template) => applyTemplatePatchesToTemplate(template, templateSet.templatePatches ?? {})),
        templateSet.templateCreations,
      ),
    ]),
  );
}

function ensureTemplateMapForCatalog(
  project: Project,
  catalog: Sku[],
  templateMap: TemplateMap,
  selection: MaterialSelection,
  materials: MaterialAsset[],
): TemplateMap {
  const generated = applySelectionToTemplateMap(buildTemplateMap(project, catalog), selection, materials);
  return Object.fromEntries(
    catalog.map((sku) => {
      const savedTemplates = templateMap[sku.id];
      return [sku.id, savedTemplates?.length ? savedTemplates : generated[sku.id] ?? []];
    }),
  );
}

function applyAssistantDraftToTemplateMap(
  templateMap: TemplateMap,
  draft: AssistantDraft,
  materials: MaterialAsset[],
  skuId?: string,
): TemplateMap {
  return Object.fromEntries(
    Object.entries(templateMap).map(([id, templates]) => [
      id,
      skuId && id !== skuId
        ? templates
        : applyTemplateCreationsToTemplates(
            templates.map((template) =>
              enforceTemplateSafety(
                draft.theme
                  ? applyThemeToTemplate(
                      applyTemplatePatchesToTemplate(
                        applyMaterialSelectionToTemplate(template, draft.materialSelection, materials),
                        draft.templatePatches,
                      ),
                      draft.theme,
                    )
                  : applyTemplatePatchesToTemplate(
                      applyMaterialSelectionToTemplate(template, draft.materialSelection, materials),
                      draft.templatePatches,
                    ),
              ),
            ),
            draft.templateCreations,
          ),
    ]),
  );
}

function moveLayer(template: Template, layerId: string, direction: "up" | "down"): Template {
  const sorted = [...template.layers].sort((a, b) => a.zIndex - b.zIndex);
  const index = sorted.findIndex((layer) => layer.id === layerId);
  const targetIndex = direction === "up" ? index + 1 : index - 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= sorted.length) return template;

  const current = sorted[index];
  const target = sorted[targetIndex];

  return {
    ...template,
    layers: template.layers.map((layer) => {
      if (layer.id === current.id) return { ...layer, zIndex: target.zIndex };
      if (layer.id === target.id) return { ...layer, zIndex: current.zIndex };
      return layer;
    }),
  };
}

function makeUniqueLayerId(template: Template, base: string): string {
  const existing = new Set(template.layers.map((layer) => layer.id));
  let id = base;
  let suffix = 2;
  while (existing.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  return id;
}

function nextZIndex(template: Template): number {
  return template.layers.reduce((max, layer) => Math.max(max, layer.zIndex), 0) + 1;
}

function createEditableLayer(template: Template, type: AddableLayerType): Layer {
  const common = {
    source: "template" as const,
    visible: true,
    locked: false,
    editable: true,
    x: Math.round(template.canvas.width * 0.18),
    y: Math.round(template.canvas.height * 0.18),
    width: Math.round(template.canvas.width * 0.42),
    height: 120,
    opacity: 1,
    scale: 1,
    rotation: 0,
    zIndex: nextZIndex(template),
  };

  if (type === "text") {
    return {
      ...common,
      id: makeUniqueLayerId(template, "custom-text"),
      type: "text",
      name: "自定义文字",
      text: "新品卖点",
      fontSize: 56,
      fontWeight: 800,
      color: "#172033",
      align: "center",
      lineHeight: 1.16,
      fontFamily: '"Microsoft YaHei", "PingFang SC", Arial, sans-serif',
    };
  }

  if (type === "shape") {
    return {
      ...common,
      id: makeUniqueLayerId(template, "custom-shape"),
      type: "shape",
      name: "自定义形状",
      shape: "pill",
      fill: projectColorFallback(template.background),
      stroke: "#ffffff",
      strokeWidth: 0,
      radius: 60,
    };
  }

  if (type === "table") {
    return {
      ...common,
      id: makeUniqueLayerId(template, "custom-table"),
      type: "table",
      name: "自定义参数表",
      width: Math.round(template.canvas.width * 0.54),
      height: 360,
      columns: ["项目", "参数"],
      rows: [
        { label: "接口类型", value: "SMA" },
        { label: "工作频率", value: "DC~18GHz" },
        { label: "驻波比", value: "≤1.3" },
      ],
      headerFill: "#0b70b7",
      stripeFill: "#eef6fb",
      borderColor: "#8bc2e8",
      textColor: "#172033",
      fontSize: 34,
      fontFamily: '"Microsoft YaHei", "PingFang SC", Arial, sans-serif',
    };
  }

  return {
    ...common,
    id: makeUniqueLayerId(template, "custom-icon"),
    type: "icon",
    name: "自定义图标",
    icon: "shield",
    label: "质保",
    color: "#0b70b7",
    fill: "#eef6fb",
    fontSize: 56,
  };
}

function projectColorFallback(background: string): string {
  return background === "#ffffff" ? "#0b70b7" : "#b51e2c";
}

function makeSkuId(model: string): string {
  return `sku-${model.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-").replace(/^-+|-+$/g, "") || "imported"}-${Date.now()}`;
}

export default function App() {
  const initialCatalog = useMemo(() => [...webSampleCatalog, ...sampleCatalog], []);
  const defaultProject = useMemo(() => createDefaultProject(), []);
  const initialMaterials = useMemo(() => createDefaultMaterialLibrary(), []);
  const initialSelection = useMemo(() => defaultMaterialSelection(initialMaterials), [initialMaterials]);
  const persistedWorkspace = useMemo(() => loadLocalWorkspace(), []);
  const [project, setProject] = useState<Project>(() => persistedWorkspace?.project ?? defaultProject);
  const [catalog, setCatalog] = useState<Sku[]>(initialCatalog);
  const [materials, setMaterials] = useState<MaterialAsset[]>(() => persistedWorkspace?.materials?.length ? persistedWorkspace.materials : initialMaterials);
  const [materialSelection, setMaterialSelection] = useState<MaterialSelection>(() => persistedWorkspace?.materialSelection ?? initialSelection);
  const [templateSets, setTemplateSets] = useState<MaterialTemplateSet[]>(() =>
    persistedWorkspace?.templateSets?.length
      ? persistedWorkspace.templateSets
      : [
          createTemplateSet("蓝白工业套装", initialSelection, undefined, undefined, undefined, undefined, undefined, {
            primaryColor: defaultProject.brand.primaryColor,
            secondaryColor: defaultProject.brand.secondaryColor,
          }),
        ],
  );
  const [assistantDraft, setAssistantDraft] = useState<AssistantDraft | undefined>();
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantError, setAssistantError] = useState<string | undefined>();
  const [templatesBySku, setTemplatesBySku] = useState<TemplateMap>(() => {
    const nextProject = persistedWorkspace?.project ?? defaultProject;
    const nextMaterials = persistedWorkspace?.materials?.length ? persistedWorkspace.materials : initialMaterials;
    const nextSelection = persistedWorkspace?.materialSelection ?? initialSelection;
    return ensureTemplateMapForCatalog(nextProject, initialCatalog, persistedWorkspace?.templatesBySku ?? {}, nextSelection, nextMaterials);
  });
  const [selectedSkuId, setSelectedSkuId] = useState(persistedWorkspace?.selectedSkuId ?? initialCatalog[0]?.id ?? "");
  const [selectedTemplateId, setSelectedTemplateId] = useState(persistedWorkspace?.selectedTemplateId ?? "hero-main");
  const [selectedLayerId, setSelectedLayerId] = useState(persistedWorkspace?.selectedLayerId ?? "product-main");
  const [zoom, setZoom] = useState(0.42);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("请选择商品图、详情图和规格书，然后点击创建 SKU");
  const [singleImportFiles, setSingleImportFiles] = useState<SingleImportFiles>({});
  const [specProgress, setSpecProgress] = useState<SpecDocumentProgress | undefined>();

  const singleImportFilesRef = useRef<SingleImportFiles>({});
  const specImportRequestIdRef = useRef(0);
  const persistenceReady = useRef(false);

  const selectedSku = useMemo(() => catalog.find((sku) => sku.id === selectedSkuId) ?? catalog[0], [catalog, selectedSkuId]);
  const templates = templatesBySku[selectedSku?.id] ?? [];
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? templates[0];
  const selectedLayer = selectedTemplate?.layers.find((layer) => layer.id === selectedLayerId);
  const issues = selectedTemplate ? validateTemplate(selectedTemplate) : [];
  const canCreateSku = isSingleImportReady(singleImportFiles) && !busy;

  function createWorkspaceSnapshot(): WorkspaceSnapshot {
    return {
      version: 2,
      updatedAt: new Date().toISOString(),
      project,
      materials,
      materialSelection,
      templateSets,
      templatesBySku,
      selectedSkuId,
      selectedTemplateId,
      selectedLayerId,
    };
  }

  function applyWorkspaceSnapshot(snapshot: WorkspaceSnapshot): void {
    const nextMaterials = snapshot.materials.length ? snapshot.materials : initialMaterials;
    const nextSelection = Object.keys(snapshot.materialSelection).length ? snapshot.materialSelection : defaultMaterialSelection(nextMaterials);
    const nextTemplates = ensureTemplateMapForCatalog(snapshot.project, initialCatalog, snapshot.templatesBySku, nextSelection, nextMaterials);

    setProject(snapshot.project);
    setMaterials(nextMaterials);
    setMaterialSelection(nextSelection);
    setTemplateSets(
      snapshot.templateSets.length
        ? snapshot.templateSets
        : [
            createTemplateSet("蓝白工业套装", nextSelection, undefined, undefined, undefined, undefined, undefined, {
              primaryColor: snapshot.project.brand.primaryColor,
              secondaryColor: snapshot.project.brand.secondaryColor,
            }),
          ],
    );
    setTemplatesBySku(nextTemplates);
    setSelectedSkuId(snapshot.selectedSkuId ?? initialCatalog[0]?.id ?? "");
    setSelectedTemplateId(snapshot.selectedTemplateId ?? "hero-main");
    setSelectedLayerId(snapshot.selectedLayerId ?? "product-main");
  }

  useEffect(() => {
    let cancelled = false;

    void loadIndexedWorkspace().then((indexedWorkspace) => {
      if (cancelled) return;
      const newestWorkspace = chooseNewestWorkspace(persistedWorkspace, indexedWorkspace);
      if (newestWorkspace) {
        applyWorkspaceSnapshot(newestWorkspace);
        setStatus(`已恢复本地素材库：${newestWorkspace.materials.length} 个素材，${newestWorkspace.templateSets.length} 个模板套装`);
      }
      persistenceReady.current = true;
    });

    return () => {
      cancelled = true;
    };
  }, [persistedWorkspace]);

  useEffect(() => {
    if (!persistenceReady.current) return;
    const snapshot = createWorkspaceSnapshot();
    saveLocalWorkspace(snapshot);
    void saveIndexedWorkspace(snapshot);
  }, [project, materials, materialSelection, templateSets, templatesBySku, selectedSkuId, selectedTemplateId, selectedLayerId]);

  function updateSingleImportFiles(nextFiles: SingleImportFiles): void {
    singleImportFilesRef.current = nextFiles;
    setSingleImportFiles(nextFiles);
  }

  function updateTemplate(skuId: string, templateId: string, updater: (template: Template) => Template): void {
    setTemplatesBySku((current) => ({
      ...current,
      [skuId]: (current[skuId] ?? []).map((template) => (template.id === templateId ? updater(template) : template)),
    }));
  }

  function patchLayer(layerId: string, patch: Partial<Layer>): void {
    if (!selectedSku || !selectedTemplate) return;
    updateTemplate(selectedSku.id, selectedTemplate.id, (template) => mergeLayerPatch(template, layerId, patch));
  }

  function duplicateSelectedTemplate(): void {
    if (!selectedTemplate) return;
    const templateId = `custom-${selectedTemplate.kind}-${Date.now()}`;
    setTemplatesBySku((current) =>
      Object.fromEntries(
        Object.entries(current).map(([skuId, skuTemplates]) => {
          const base = skuTemplates.find((template) => template.id === selectedTemplate.id) ?? selectedTemplate;
          const duplicated: Template = {
            ...base,
            id: templateId,
            name: `${base.name} 自定义`,
            layers: base.layers.map((layer) => ({ ...layer })),
          };
          return [skuId, [...skuTemplates, duplicated]];
        }),
      ),
    );
    setSelectedTemplateId(templateId);
    setSelectedLayerId(selectedTemplate.layers[0]?.id ?? "");
    setStatus(`已创建新模板：${selectedTemplate.name} 自定义`);
  }

  function addLayerToSelectedTemplate(type: AddableLayerType): void {
    if (!selectedTemplate || !selectedSku) return;
    const layerForSelection = createEditableLayer(selectedTemplate, type);
    setTemplatesBySku((current) =>
      Object.fromEntries(
        Object.entries(current).map(([skuId, skuTemplates]) => [
          skuId,
          skuTemplates.map((template) =>
            template.id === selectedTemplate.id
              ? {
                  ...template,
                  layers: [...template.layers, skuId === selectedSku.id ? layerForSelection : createEditableLayer(template, type)],
                }
              : template,
          ),
        ]),
      ),
    );
    setSelectedLayerId(layerForSelection.id);
    setStatus(`已新增${type}图层：${layerForSelection.name}`);
  }

  function deleteMaterial(materialId: string): void {
    const material = materials.find((item) => item.id === materialId);
    if (!material) return;
    const nextMaterials = materials.filter((item) => item.id !== materialId);
    const nextSelection = { ...materialSelection };
    if (nextSelection[material.slot] === materialId) {
      nextSelection[material.slot] = nextMaterials.find((item) => item.slot === material.slot)?.id;
    }
    setMaterials(nextMaterials);
    setMaterialSelection(nextSelection);
    setTemplatesBySku((current) => applySelectionToTemplateMap(current, nextSelection, nextMaterials));
    setStatus(`已删除素材：${material.name}`);
  }

  function deleteTemplateSet(templateSetId: string): void {
    const templateSet = templateSets.find((item) => item.id === templateSetId);
    setTemplateSets((current) => current.filter((item) => item.id !== templateSetId));
    if (templateSet) setStatus(`已删除模板套装：${templateSet.name}`);
  }

  function createSkuFromSelectedAssets(): void {
    const files = singleImportFilesRef.current;
    if (!isSingleImportReady(files)) {
      setStatus(`还不能创建 SKU：请继续选择${missingSingleImportItems(files).join("、")}`);
      return;
    }
    const imported = buildCatalogFromSingleAssets({
      productFile: files.product,
      detailFile: files.detail,
      drawingFile: files.drawing,
      spec: files.parsedSpec,
    });
    if (!imported.catalog.length) {
      setStatus("未导入素材：请重新选择 1 张商品图、1 张详情图和 1 份规格书");
      imported.revoke();
      return;
    }

    const importedSku: Sku = {
      ...imported.catalog[0],
      id: makeSkuId(imported.catalog[0].model),
      family: "Imported",
    };
    const nextTemplates = applySelectionToTemplateMap(buildTemplateMap(project, [importedSku]), materialSelection, materials)[importedSku.id] ?? [];
    setCatalog((current) => [importedSku, ...current]);
    setTemplatesBySku((current) => ({
      ...current,
      [importedSku.id]: nextTemplates,
    }));
    setSelectedSkuId(importedSku.id);
    setSelectedTemplateId("hero-main");
    setSelectedLayerId("product-main");
    setAssistantDraft(undefined);
    setAssistantError(undefined);
    updateSingleImportFiles({});
    setSpecProgress(undefined);
    const warningText = files.warnings?.length ? `；提示：${files.warnings.join("；")}` : "";
    setStatus(`已创建 SKU：${importedSku.model}。现在可以在此 SKU 上调整模板、素材和 AI 套版${warningText}`);
  }

  async function selectProductImage(file: File): Promise<void> {
    const nextFiles = { ...singleImportFilesRef.current, product: file };
    updateSingleImportFiles(nextFiles);
    const missing = missingSingleImportItems(nextFiles);
    setStatus(
      missing.length
        ? `已选择商品图：${file.name}，请继续选择${missing.join("、")}`
        : `素材已齐全：${file.name}。请点击“创建 SKU”`,
    );
  }

  async function selectDetailImage(file: File): Promise<void> {
    const nextFiles = { ...singleImportFilesRef.current, detail: file };
    updateSingleImportFiles(nextFiles);
    const missing = missingSingleImportItems(nextFiles);
    setStatus(
      missing.length
        ? `已选择详情图：${file.name}，请继续选择${missing.join("、")}`
        : `素材已齐全：${file.name}。请点击“创建 SKU”`,
    );
  }

  async function selectSpecDocument(file: File): Promise<void> {
    const requestId = specImportRequestIdRef.current + 1;
    specImportRequestIdRef.current = requestId;
    const parsingFiles = markSpecDocumentParsing(singleImportFilesRef.current, file);
    updateSingleImportFiles(parsingFiles);
    setBusy(true);
    setSpecProgress({ stage: "loading", message: `已选择规格书：${file.name}，准备解析`, percent: 0 });
    setStatus(`已选择规格书：${file.name}，准备解析`);
    try {
      const extracted = await extractSpecDocument(file, {
        onProgress: (progress) => {
          if (specImportRequestIdRef.current !== requestId) return;
          setSpecProgress(progress);
          setStatus(progress.message);
        },
      });
      if (specImportRequestIdRef.current !== requestId || singleImportFilesRef.current.specFile !== file) return;
      const nextFiles = markSpecDocumentExtracted(singleImportFilesRef.current, file, extracted);
      updateSingleImportFiles(nextFiles);
      const warningText = extracted.warnings.length ? `；提示：${extracted.warnings.join("；")}` : "";
      const missing = missingSingleImportItems(nextFiles);
      setStatus(
        missing.length
          ? `已解析规格书并提取工程图：${file.name}，请继续选择${missing.join("、")}${warningText}`
          : `素材已齐全，规格书已解析：${file.name}。请点击“创建 SKU”${warningText}`,
      );
    } catch (error) {
      if (specImportRequestIdRef.current === requestId) setStatus(error instanceof Error ? error.message : "规格书解析失败");
    } finally {
      if (specImportRequestIdRef.current === requestId) setBusy(false);
    }
  }

  function exportWorkspaceBackup(): void {
    const snapshot = createWorkspaceSnapshot();
    const safeDate = snapshot.updatedAt.slice(0, 10).replace(/-/g, "");
    const blob = new Blob([serializeWorkspaceBackup(snapshot)], { type: "application/json;charset=utf-8" });
    downloadBlob(`meigong-assistant-workspace-${safeDate}.json`, blob);
    setStatus(`已导出素材库和模板库备份：${snapshot.materials.length} 个素材，${snapshot.templateSets.length} 个模板套装`);
  }

  async function importWorkspaceBackup(file: File): Promise<void> {
    try {
      const snapshot = {
        ...parseWorkspaceBackup(await file.text()),
        updatedAt: new Date().toISOString(),
      };
      applyWorkspaceSnapshot(snapshot);
      saveLocalWorkspace(snapshot);
      void saveIndexedWorkspace(snapshot);
      setStatus(`已导入素材库和模板库备份：${snapshot.materials.length} 个素材，${snapshot.templateSets.length} 个模板套装`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "素材库备份导入失败");
    }
  }

  async function runExport(task: () => Promise<void>, done: string): Promise<void> {
    setBusy(true);
    setStatus("正在导出");
    try {
      await task();
      setStatus(done);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "导出失败");
    } finally {
      setBusy(false);
    }
  }

  if (!selectedSku || !selectedTemplate) {
    return <main className="empty-app">没有可用 SKU</main>;
  }

  return (
    <main className="app-shell">
      <LeftSidebar
        catalog={catalog}
        selectedSkuId={selectedSku.id}
        templates={templates}
        selectedTemplateId={selectedTemplate.id}
        onSelectSku={(skuId) => {
          setSelectedSkuId(skuId);
          setSelectedTemplateId((templatesBySku[skuId] ?? [])[0]?.id ?? "hero-main");
          setSelectedLayerId((templatesBySku[skuId] ?? [])[0]?.layers[0]?.id ?? "");
        }}
        onSelectTemplate={(templateId) => {
          const nextTemplate = templates.find((template) => template.id === templateId);
          setSelectedTemplateId(templateId);
          setSelectedLayerId(nextTemplate?.layers[0]?.id ?? "");
        }}
        singleImportProductName={singleImportFiles.product?.name}
        singleImportDetailName={singleImportFiles.detail?.name}
        singleImportSpecName={singleImportFiles.specFile?.name}
        singleImportWarnings={singleImportFiles.warnings}
        specProgress={specProgress}
        canCreateSku={canCreateSku}
        createSkuBusy={busy}
        onSelectProductImage={selectProductImage}
        onSelectDetailImage={selectDetailImage}
        onSelectSpecDocument={selectSpecDocument}
        onCreateSku={createSkuFromSelectedAssets}
      />

      <div className="material-pane">
        <AIAssistantPanel
          draft={assistantDraft}
          busy={assistantBusy}
          error={assistantError}
          selectedSkuCode={selectedSku.code}
          skuCount={catalog.length}
          onGenerate={async (prompt: string, scope: AssistantScope) => {
            setAssistantBusy(true);
            setAssistantError(undefined);
            setStatus("正在调用 DeepSeek 生成套版方案");
            const context = {
              materials,
              currentSelection: materialSelection,
              sku: selectedSku,
              scope,
              templates,
              catalog,
              project,
            };
            try {
              const draft = await requestDeepSeekAssistantDraft(prompt, context);
              setAssistantDraft(draft);
              setStatus(`DeepSeek 已生成套版方案：${draft.name}`);
            } catch (error) {
              const message = error instanceof Error ? error.message : "DeepSeek 调用失败";
              const fallbackDraft = createAssistantDraft(prompt, context);
              setAssistantDraft(fallbackDraft);
              setAssistantError(`${message}。已生成本地后备草稿，确认前请仔细检查。`);
              setStatus("DeepSeek 调用失败，已生成本地后备草稿");
            } finally {
              setAssistantBusy(false);
            }
          }}
          onApplyDraft={() => {
            if (!assistantDraft) return;
            const skuId = assistantDraft.scope === "current-sku" ? selectedSku.id : undefined;
            const nextMaterials = applyMaterialCreationsToLibrary(materials, assistantDraft.materialCreations);
            setMaterials(nextMaterials);
            setMaterialSelection(assistantDraft.materialSelection);
            if (assistantDraft.theme) {
              const theme = assistantDraft.theme;
              setProject((current) => ({
                ...current,
                brand: {
                  ...current.brand,
                  primaryColor: theme.primary,
                  secondaryColor: theme.secondary,
                },
              }));
            }
            setTemplatesBySku((current) => applyAssistantDraftToTemplateMap(current, assistantDraft, nextMaterials, skuId));
            const firstCreation = assistantDraft.templateCreations[0];
            if (firstCreation) {
              const baseTemplate = templates.find((template) => template.id === firstCreation.fromTemplateId);
              setSelectedTemplateId(firstCreation.templateId);
              setSelectedLayerId(Object.keys(firstCreation.patches)[0] ?? baseTemplate?.layers[0]?.id ?? "");
            }
            const createdMaterialText = assistantDraft.materialCreations.length
              ? `，并创建${assistantDraft.materialCreations.length}个素材`
              : "";
            setStatus(
              assistantDraft.scope === "all-skus"
                ? `AI 已应用到全部 SKU：${assistantDraft.name}${firstCreation ? "，并创建新模板" : ""}${createdMaterialText}`
                : `AI 已应用到当前 SKU：${selectedSku.code}${firstCreation ? "，并创建新模板" : ""}${createdMaterialText}`,
            );
          }}
        />

        <MaterialLibraryPanel
          materials={materials}
          selection={materialSelection}
          templateSets={templateSets}
          onSelectMaterial={(slot, materialId) => {
            const nextSelection = { ...materialSelection, [slot]: materialId };
            setMaterialSelection(nextSelection);
            setTemplatesBySku((current) => applySelectionToTemplateMap(current, nextSelection, materials, selectedSku.id));
            setStatus(`已替换${slot}`);
          }}
          onUploadMaterial={async (slot: MaterialSlot, file: File) => {
            const url = await fileToDataUrl(file);
            const customMaterial: MaterialAsset = {
              id: `custom-${slot}-${Date.now()}`,
              slot,
              kind: "card",
              name: file.name,
              url,
              thumbnailUrl: url,
              width: 1000,
              height: 600,
              tags: ["custom", slot],
            };
            const nextMaterials = [...materials, customMaterial];
            const nextSelection = { ...materialSelection, [slot]: customMaterial.id };
            setMaterials(nextMaterials);
            setMaterialSelection(nextSelection);
            setTemplatesBySku((current) => applySelectionToTemplateMap(current, nextSelection, nextMaterials, selectedSku.id));
            setStatus(`已上传并应用 ${file.name}`);
          }}
          onDeleteMaterial={deleteMaterial}
          onExportWorkspace={exportWorkspaceBackup}
          onImportWorkspace={importWorkspaceBackup}
          onSaveTemplateSet={(name) => {
            const templateSet = createTemplateSet(name, materialSelection, undefined, undefined, undefined, undefined, templates, {
              primaryColor: project.brand.primaryColor,
              secondaryColor: project.brand.secondaryColor,
            });
            setTemplateSets((current) => [templateSet, ...current]);
            setStatus(`已保存模板套装：${name}`);
          }}
          onApplyTemplateSet={(templateSetId) => {
            const templateSet = templateSets.find((item) => item.id === templateSetId);
            if (!templateSet) return;
            const nextMaterials = applyMaterialCreationsToLibrary(materials, templateSet.materialCreations);
            setMaterials(nextMaterials);
            setMaterialSelection(templateSet.selection);
            const templateTheme = templateSet.theme;
            if (templateTheme) {
              setProject((current) => ({
                ...current,
                brand: {
                  ...current.brand,
                  primaryColor: templateTheme.primaryColor,
                  secondaryColor: templateTheme.secondaryColor,
                },
              }));
            }
            setTemplatesBySku((current) => applyTemplateSetToTemplateMap(current, templateSet, nextMaterials));
            setStatus(`已将模板套装应用到全部 SKU：${templateSet.name}`);
          }}
          onDeleteTemplateSet={deleteTemplateSet}
        />
      </div>

      <section className="workspace">
        <TopBar
          sku={selectedSku}
          template={selectedTemplate}
          zoom={zoom}
          busy={busy}
          onZoom={setZoom}
          onExportCurrent={(format) =>
            runExport(() => exportTemplate(selectedTemplate, selectedSku, format), `已导出 ${selectedTemplate.name}`)
          }
          onExportSku={() =>
            runExport(async () => {
              const blob = await exportSkuZip(selectedSku, templates);
              downloadBlob(`${selectedSku.model.replace(/[\\/]+/g, "-")}.zip`, blob);
            }, `已导出 ${selectedSku.model}`)
          }
          onExportAll={() =>
            runExport(async () => {
              const blob = await exportAllSkuZip(catalog.map((sku) => ({ sku, templates: templatesBySku[sku.id] ?? [] })));
              downloadBlob("meigong-assistant-all-skus.zip", blob);
            }, "全部 SKU 已导出")
          }
        />

        <div className="statusbar">
          <span>{status}</span>
          <span>{issues.length ? `${issues.length} 个质检提醒` : "质检通过"}</span>
        </div>

        <CanvasStage
          template={selectedTemplate}
          selectedLayerId={selectedLayerId}
          zoom={zoom}
          onSelectLayer={setSelectedLayerId}
          onPatchLayer={patchLayer}
        />
      </section>

      <Inspector
        project={project}
        template={selectedTemplate}
        selectedLayer={selectedLayer}
        issues={issues}
        onSelectLayer={setSelectedLayerId}
        onPatchLayer={patchLayer}
        onMoveLayer={(layerId, direction) => {
          updateTemplate(selectedSku.id, selectedTemplate.id, (template) => moveLayer(template, layerId, direction));
        }}
        onAddLayer={addLayerToSelectedTemplate}
        onDuplicateTemplate={duplicateSelectedTemplate}
        onProjectColor={(color) => {
          const palette = createPaletteFromPrimary(color, "手动配色");
          const previousPalette = createPaletteFromPrimary(project.brand.primaryColor, "当前配色");
          setProject((current) => ({
            ...current,
            brand: {
              ...current.brand,
              primaryColor: palette.primary,
              secondaryColor: palette.secondary,
            },
          }));
          setTemplatesBySku((current) =>
            Object.fromEntries(
              Object.entries(current).map(([skuId, skuTemplates]) => [
                skuId,
                skuTemplates.map((template) => enforceTemplateSafety(applyThemeToTemplate(template, palette, previousPalette))),
              ]),
            ),
          );
          setStatus(`已统一配色：${palette.primary}`);
        }}
      />
    </main>
  );
}
