import { describe, expect, it } from "vitest";
import { parseSpecDocumentText } from "./specDocument";

describe("specification document progress", () => {
  it("uses caller supplied OCR and parsing percentages so the whole progress bar does not reset", async () => {
    const progressValues: number[] = [];

    await parseSpecDocumentText({
      textByPage: [""],
      sourceName: "scanned-spec.pdf",
      runOcr: async () => "Part Number: RF-18G",
      ocrStartPercent: 32,
      parsingPercent: 84,
      onProgress: (progress) => {
        if (typeof progress.percent === "number") progressValues.push(progress.percent);
      },
    });

    expect(progressValues).toEqual([32, 84]);
  });
});
