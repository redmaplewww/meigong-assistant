import { describe, expect, it } from "vitest";
import { parseSpecDocumentText } from "./specDocument";

describe("specification document extraction", () => {
  it("uses OCR text when the PDF text layer is empty", async () => {
    const result = await parseSpecDocumentText({
      textByPage: [""],
      sourceName: "2210-MM1-18-1(SMA-SSMP-JJG)技术规格书.pdf",
      runOcr: async () =>
        [
          "Part Number: 2210-MM1-18-1(SMA-SSMP-JJG)",
          "Frequency Range: DC-18GHz",
          "VSWR: 1.25 Max",
          "Impedance: 50 Ohm",
        ].join("\n"),
    });

    expect(result.spec.model).toBe("2210-MM1-18-1(SMA-SSMP-JJG)");
    expect(result.spec.frequency).toBe("DC~18GHz");
    expect(result.spec.vswr).toBe("≤1.25");
    expect(result.spec.parameters).toContainEqual({ label: "阻抗", value: "50Ω" });
    expect(result.textSource).toBe("ocr");
    expect(result.warnings).toContain("PDF 无可读取文本层，已使用 OCR 识别参数。");
  });

  it("reports progress when OCR fallback is used", async () => {
    const messages: string[] = [];

    await parseSpecDocumentText({
      textByPage: [""],
      sourceName: "blurred-spec.pdf",
      runOcr: async () => "Part Number: RF-18G",
      onProgress: (progress) => messages.push(progress.message),
    });

    expect(messages).toContain("未发现可读取文本层，开始 OCR 识别");
    expect(messages).toContain("OCR 识别完成，正在解析参数");
  });
});
