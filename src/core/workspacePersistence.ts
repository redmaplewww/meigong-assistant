import type { MaterialAsset, MaterialSelection, MaterialTemplateSet, Project, Template } from "./types";

export type TemplateMap = Record<string, Template[]>;

export interface WorkspaceSnapshot {
  version: 2;
  updatedAt: string;
  project: Project;
  materials: MaterialAsset[];
  materialSelection: MaterialSelection;
  templateSets: MaterialTemplateSet[];
  templatesBySku: TemplateMap;
  selectedSkuId?: string;
  selectedTemplateId?: string;
  selectedLayerId?: string;
}

export const workspaceStorageKey = "meigong-assistant.workspace.v2";
export const workspaceBackupKind = "meigong-assistant-workspace";

const legacyTimestamp = "1970-01-01T00:00:00.000Z";
const workspaceDbName = "meigong-assistant-workspace";
const workspaceDbVersion = 1;
const workspaceStoreName = "snapshots";
const workspaceRecordId = "current-v2";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function normalizeWorkspaceSnapshot(value: unknown): WorkspaceSnapshot | undefined {
  if (!isRecord(value) || value.version !== 2 || !isRecord(value.project)) return undefined;

  return {
    version: 2,
    updatedAt: optionalString(value.updatedAt) ?? legacyTimestamp,
    project: value.project as unknown as Project,
    materials: Array.isArray(value.materials) ? (value.materials as MaterialAsset[]) : [],
    materialSelection: isRecord(value.materialSelection) ? (value.materialSelection as MaterialSelection) : {},
    templateSets: Array.isArray(value.templateSets) ? (value.templateSets as MaterialTemplateSet[]) : [],
    templatesBySku: isRecord(value.templatesBySku) ? (value.templatesBySku as TemplateMap) : {},
    selectedSkuId: optionalString(value.selectedSkuId),
    selectedTemplateId: optionalString(value.selectedTemplateId),
    selectedLayerId: optionalString(value.selectedLayerId),
  };
}

function timestampValue(snapshot: WorkspaceSnapshot): number {
  const parsed = Date.parse(snapshot.updatedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function chooseNewestWorkspace(
  first: WorkspaceSnapshot | undefined,
  second: WorkspaceSnapshot | undefined,
): WorkspaceSnapshot | undefined {
  if (!first) return second;
  if (!second) return first;
  return timestampValue(second) > timestampValue(first) ? second : first;
}

export function loadLocalWorkspace(storage: Storage | undefined = typeof window === "undefined" ? undefined : window.localStorage): WorkspaceSnapshot | undefined {
  if (!storage) return undefined;

  try {
    return normalizeWorkspaceSnapshot(JSON.parse(storage.getItem(workspaceStorageKey) ?? "null"));
  } catch {
    return undefined;
  }
}

export function saveLocalWorkspace(
  snapshot: WorkspaceSnapshot,
  storage: Storage | undefined = typeof window === "undefined" ? undefined : window.localStorage,
): boolean {
  if (!storage) return false;

  try {
    storage.setItem(workspaceStorageKey, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

function openWorkspaceDatabase(): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === "undefined") return Promise.resolve(undefined);

  return new Promise((resolve) => {
    const request = indexedDB.open(workspaceDbName, workspaceDbVersion);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(workspaceStoreName)) {
        database.createObjectStore(workspaceStoreName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(undefined);
    request.onblocked = () => resolve(undefined);
  });
}

export async function loadIndexedWorkspace(): Promise<WorkspaceSnapshot | undefined> {
  const database = await openWorkspaceDatabase();
  if (!database) return undefined;

  return new Promise((resolve) => {
    const transaction = database.transaction(workspaceStoreName, "readonly");
    const store = transaction.objectStore(workspaceStoreName);
    const request = store.get(workspaceRecordId);

    request.onsuccess = () => resolve(normalizeWorkspaceSnapshot(request.result));
    request.onerror = () => resolve(undefined);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => database.close();
    transaction.onabort = () => database.close();
  });
}

export async function saveIndexedWorkspace(snapshot: WorkspaceSnapshot): Promise<boolean> {
  const database = await openWorkspaceDatabase();
  if (!database) return false;

  return new Promise((resolve) => {
    const transaction = database.transaction(workspaceStoreName, "readwrite");
    const store = transaction.objectStore(workspaceStoreName);
    const request = store.put(snapshot, workspaceRecordId);

    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => database.close();
    transaction.onabort = () => database.close();
  });
}

export function serializeWorkspaceBackup(snapshot: WorkspaceSnapshot): string {
  return JSON.stringify(
    {
      kind: workspaceBackupKind,
      exportedAt: new Date().toISOString(),
      workspace: snapshot,
    },
    null,
    2,
  );
}

export function parseWorkspaceBackup(text: string): WorkspaceSnapshot {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed) || parsed.kind !== workspaceBackupKind) {
      throw new Error("Not a Meigong Assistant workspace backup");
    }
    const workspace = normalizeWorkspaceSnapshot(parsed.workspace);
    if (!workspace) throw new Error("Invalid Meigong Assistant workspace backup");
    return workspace;
  } catch (error) {
    if (error instanceof Error && /workspace backup/i.test(error.message)) throw error;
    throw new Error("Invalid Meigong Assistant workspace backup");
  }
}
