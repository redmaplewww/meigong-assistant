import { describe, expect, it } from "vitest";
import { inferSkuMetadata } from "./catalog";
import { createDefaultProject, createTemplateSuite } from "./templates";
import {
  applyMaterialCreationsToLibrary,
  applyMaterialSelectionToTemplate,
  createMaterialVariant,
  createDefaultMaterialLibrary,
  createTemplateSet,
  applyTemplateSetToSuite,
} from "./materials";
import type { MaterialVariantCreation } from "./types";
import type { Sku } from "./types";

const sku: Sku = {
  ...inferSkuMetadata("3.5-SMP", "KK"),
  assets: {
    productTransparent: {
      id: "product",
      type: "product-transparent",
      name: "T.png",
      path: "T.png",
      url: "/T.png",
    },
    productPhotos: [],
    drawing: {
      id: "drawing",
      type: "drawing",
      name: "drawing.png",
      path: "drawing.png",
      url: "/drawing.png",
    },
    detailSlices: [],
  },
};

describe("material library and template sets", () => {
  it("provides designed assets for board, cap, logo, badge, and card slots", () => {
    const library = createDefaultMaterialLibrary();

    expect(library.some((material) => material.slot === "bottom-board")).toBe(true);
    expect(library.some((material) => material.slot === "top-cap")).toBe(true);
    expect(library.some((material) => material.slot === "logo")).toBe(true);
    expect(library.some((material) => material.slot === "promo-badge")).toBe(true);
    expect(library.every((material) => material.url.startsWith("data:image/svg+xml"))).toBe(true);
  });

  it("replaces material-backed image layers without touching product assets", () => {
    const suite = createTemplateSuite(createDefaultProject(), sku);
    const hero = suite.templates.find((template) => template.kind === "hero")!;
    const library = createDefaultMaterialLibrary();
    const darkBoard = library.find((material) => material.id === "bottom-board-deep")!;

    const changed = applyMaterialSelectionToTemplate(hero, {
      "bottom-board": darkBoard.id,
    }, library);

    expect(changed.layers.find((layer) => layer.id === "bottom-board")?.type).toBe("image");
    expect(changed.layers.find((layer) => layer.id === "bottom-board")).toMatchObject({
      imageUrl: darkBoard.url,
      materialId: darkBoard.id,
    });
    expect(changed.layers.find((layer) => layer.id === "product-main")).toMatchObject({
      assetRole: "productTransparent",
    });
  });

  it("saves material selection as a reusable template set and applies it to every template in a suite", () => {
    const suite = createTemplateSuite(createDefaultProject(), sku);
    const templateSet = createTemplateSet("深蓝工厂套装", {
      "bottom-board": "bottom-board-deep",
      "top-cap": "top-cap-blue-panel",
      logo: "logo-wayiii-stamp",
    });

    const changedSuite = applyTemplateSetToSuite(suite, templateSet, createDefaultMaterialLibrary());

    expect(templateSet.name).toBe("深蓝工厂套装");
    expect(changedSuite.templates[0].layers.find((layer) => layer.id === "bottom-board")).toMatchObject({
      materialId: "bottom-board-deep",
    });
    expect(changedSuite.templates[2].layers.find((layer) => layer.id === "logo-top")).toMatchObject({
      materialId: "logo-wayiii-stamp",
    });
  });

  it("creates a recolored SVG material variant and adds it to the library", () => {
    const library = createDefaultMaterialLibrary();
    const creation: MaterialVariantCreation = {
      id: "material-ai-bottom-board-deep-red",
      slot: "bottom-board",
      fromMaterialId: "bottom-board-deep",
      materialId: "ai-bottom-board-deep-red",
      name: "深红斜切底板",
      colorReplacements: [
        { from: "#0b5f99", to: "#7f1420" },
        { from: "#0c75bd", to: "#b51e2c" },
      ],
      tags: ["red", "深红"],
    };

    const variant = createMaterialVariant(library, creation)!;
    const nextLibrary = applyMaterialCreationsToLibrary(library, [creation]);

    expect(variant).toMatchObject({
      id: "ai-bottom-board-deep-red",
      slot: "bottom-board",
      name: "深红斜切底板",
    });
    expect(decodeURIComponent(variant.url)).toContain("#7f1420");
    expect(nextLibrary.some((material) => material.id === "ai-bottom-board-deep-red")).toBe(true);
  });

  it("stores the project theme inside template sets and reapplies it with the suite", () => {
    const suite = createTemplateSuite(createDefaultProject(), sku);
    const templateSet = createTemplateSet(
      "红色工业套装",
      { "bottom-board": "ai-bottom-board-deep-red" },
      undefined,
      undefined,
      undefined,
      undefined,
      suite.templates,
      { primaryColor: "#b51e2c", secondaryColor: "#4f0b15" },
    );

    const changedSuite = applyTemplateSetToSuite(suite, templateSet, createDefaultMaterialLibrary());

    expect(templateSet.theme).toEqual({
      primaryColor: "#b51e2c",
      secondaryColor: "#4f0b15",
    });
    expect(changedSuite.project.brand.primaryColor).toBe("#b51e2c");
    expect(changedSuite.project.brand.secondaryColor).toBe("#4f0b15");
  });
});
