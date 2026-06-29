import { describe, expect, it } from "vitest";
import { createDefaultProject } from "./templates";
import {
  chooseNewestWorkspace,
  normalizeWorkspaceSnapshot,
  parseWorkspaceBackup,
  serializeWorkspaceBackup,
  workspaceBackupKind,
  type WorkspaceSnapshot,
} from "./workspacePersistence";

function makeSnapshot(updatedAt: string): WorkspaceSnapshot {
  return {
    version: 2,
    updatedAt,
    project: createDefaultProject(),
    materials: [],
    materialSelection: {},
    templateSets: [],
    templatesBySku: {},
    selectedSkuId: "sku-a",
    selectedTemplateId: "hero-main",
    selectedLayerId: "product-main",
  };
}

describe("workspace persistence", () => {
  it("normalizes older v2 workspace data so previously saved libraries still restore", () => {
    const legacy = makeSnapshot("2026-01-01T00:00:00.000Z") as Partial<WorkspaceSnapshot>;
    delete legacy.updatedAt;

    const normalized = normalizeWorkspaceSnapshot(legacy);

    expect(normalized).toMatchObject({
      version: 2,
      updatedAt: "1970-01-01T00:00:00.000Z",
      selectedSkuId: "sku-a",
    });
  });

  it("chooses the newest workspace when localStorage and IndexedDB disagree", () => {
    const older = makeSnapshot("2026-01-01T00:00:00.000Z");
    const newer = makeSnapshot("2026-02-01T00:00:00.000Z");
    newer.selectedSkuId = "sku-new";

    expect(chooseNewestWorkspace(older, newer)?.selectedSkuId).toBe("sku-new");
    expect(chooseNewestWorkspace(newer, older)?.selectedSkuId).toBe("sku-new");
  });

  it("round-trips an exported workspace backup and rejects unrelated json", () => {
    const snapshot = makeSnapshot("2026-03-01T00:00:00.000Z");
    const backup = serializeWorkspaceBackup(snapshot);

    expect(JSON.parse(backup)).toMatchObject({ kind: workspaceBackupKind, workspace: { version: 2 } });
    expect(parseWorkspaceBackup(backup)).toMatchObject({ updatedAt: snapshot.updatedAt });
    expect(() => parseWorkspaceBackup(JSON.stringify({ kind: "other-app" }))).toThrow(/workspace backup/i);
  });
});
