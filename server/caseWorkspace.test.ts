import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { saveCaseWorkspace } from "./caseWorkspace";

const tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "meigong-case-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function textDataUrl(text: string, mimeType = "text/plain"): string {
  return `data:${mimeType};base64,${Buffer.from(text, "utf8").toString("base64")}`;
}

describe("case workspace saving", () => {
  it("creates a SKU case folder with source assets and generated deliverables", async () => {
    const outputRoot = await createTempRoot();

    const result = await saveCaseWorkspace({
      outputRoot,
      skuModel: "2210-MM1-18-1(SMA-SSMP-JJG)",
      inputs: [
        { role: "product", fileName: "product.png", mimeType: "image/png", dataUrl: textDataUrl("product", "image/png") },
        { role: "spec-document", fileName: "spec.pdf", mimeType: "application/pdf", dataUrl: textDataUrl("pdf", "application/pdf") },
      ],
      outputs: [
        { kind: "hero", fileName: "2210_hero.png", mimeType: "image/png", dataUrl: textDataUrl("hero", "image/png") },
        { kind: "detail", fileName: "2210_detail.jpg", mimeType: "image/jpeg", dataUrl: textDataUrl("detail", "image/jpeg") },
      ],
      metadata: { skuTitle: "射频转接器" },
    });

    expect(result.caseFolderPath).toContain("2210-MM1-18-1-SMA-SSMP-JJG");
    await expect(readFile(join(result.caseFolderPath, "输入素材", "商品图", "product.png"), "utf8")).resolves.toBe("product");
    await expect(readFile(join(result.caseFolderPath, "输入素材", "规格书", "spec.pdf"), "utf8")).resolves.toBe("pdf");
    await expect(readFile(join(result.caseFolderPath, "成品图", "2210_hero.png"), "utf8")).resolves.toBe("hero");
    await expect(readFile(join(result.caseFolderPath, "成品图", "2210_detail.jpg"), "utf8")).resolves.toBe("detail");
    await expect(readFile(join(result.caseFolderPath, "case.json"), "utf8")).resolves.toContain("射频转接器");
  });
});
