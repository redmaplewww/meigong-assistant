import { describe, expect, it } from "vitest";
import { applySpecToSku, parseSpecText } from "./specParser";
import { inferSkuMetadata } from "./catalog";

describe("specification parser", () => {
  it("extracts model, frequency, VSWR and parameter rows from specification text", () => {
    const spec = parseSpecText(
      `
      Technical Specification
      Part Number: 2210-MM1-18-1(SMA-SSMP-JJG)
      Description: SMA to SSMP RF Adapter
      Frequency Range: DC-18GHz
      VSWR: ≤ 1.25
      Impedance: 50Ω
      Insulator: PEI
      Contact Material: BeCu, Gold Plated
      Operating Temperature: -55°C ~ +125°C
      `,
      "2210-MM1-18-1(SMA-SSMP-JJG)技术规格书.pdf",
    );

    expect(spec.model).toBe("2210-MM1-18-1(SMA-SSMP-JJG)");
    expect(spec.frequency).toBe("DC~18GHz");
    expect(spec.vswr).toBe("≤1.25");
    expect(spec.parameters).toEqual(
      expect.arrayContaining([
        { label: "型号", value: "2210-MM1-18-1(SMA-SSMP-JJG)" },
        { label: "工作频率", value: "DC~18GHz" },
        { label: "电压驻波比", value: "≤1.25" },
        { label: "阻抗", value: "50Ω" },
        { label: "绝缘体", value: "PEI" },
      ]),
    );
  });

  it("applies extracted specification fields to an imported SKU", () => {
    const sku = {
      ...inferSkuMetadata("SingleImport", "AUTO-SKU"),
      assets: { productPhotos: [], detailSlices: [] },
    };
    const spec = parseSpecText("Part Number: RF-18G\nFrequency Range DC-18GHz\nVSWR 1.30 Max\nImpedance 50 Ohm");

    const updated = applySpecToSku(sku, spec);

    expect(updated.model).toBe("RF-18G");
    expect(updated.code).toBe("RF-18G");
    expect(updated.frequency).toBe("DC~18GHz");
    expect(updated.vswr).toBe("≤1.30");
    expect(updated.parameters[0]).toEqual({ label: "型号", value: "RF-18G" });
  });

  it("extracts numbered Chinese parameter rows from OCR text", () => {
    const spec = parseSpecText(
      [
        "主要性能指标",
        "1. 工作频率：DC~18GHz",
        "2. 电压驻波比：≤1.2",
        "3. 绝缘电阻：>5000MΩ",
        "4. 介质耐压：500V",
        "5. 插拔寿命：500次",
        "材料和镀层",
        "1. 内导体：铍青铜/镀金",
        "2. 外导体：不锈钢/钝化",
        "3. 绝缘体：PTFE, PEI",
      ].join("\n"),
      "2210-MM1-18-1(SMA-SSMP-JJG)技术规格书.pdf",
    );

    expect(spec.frequency).toBe("DC~18GHz");
    expect(spec.vswr).toBe("≤1.2");
    expect(spec.parameters).toEqual(
      expect.arrayContaining([
        { label: "绝缘电阻", value: ">5000MΩ" },
        { label: "介质耐压", value: "500V" },
        { label: "插拔寿命", value: "500次" },
        { label: "接触件材质", value: "铍青铜/镀金" },
        { label: "外壳材质", value: "不锈钢/钝化" },
        { label: "绝缘体", value: "PTFE, PEI" },
      ]),
    );
  });

  it("normalizes noisy OCR spacing and separators in Chinese specs", () => {
    const spec = parseSpecText(
      [
        "@ 主要 性 能 指标",
        "1. 工 作 频率 : DC~18GHz",
        "2 电压 驻 波 比 ， <1. 2",
        "3. 绝缘 电阻 : >5000MQ",
        "全 介质 耐 压 ，500Y",
        "3 .绝缘体 PFE, PEI",
      ].join("\n"),
    );

    expect(spec.frequency).toBe("DC~18GHz");
    expect(spec.vswr).toBe("≤1.2");
    expect(spec.parameters).toEqual(
      expect.arrayContaining([
        { label: "绝缘电阻", value: ">5000MΩ" },
        { label: "介质耐压", value: "500V" },
        { label: "绝缘体", value: "PTFE, PEI" },
      ]),
    );
  });

  it("recovers key rows from blurred enhanced parameter-region OCR", () => {
    const spec = parseSpecText(
      [
        "设计参考标准:6JB680A-2009",
        "@ 主要性能指标",
        "1.工作频率: DC~18GHz",
        "2.电压驻波比: <1, 2",
        "3.绝缘电阻; >5000OQ",
        "全介质耐压，500Y",
        "5. EAA: 500%",
        "@ itHMER",
        "1. 内导体: 铁青铀/鲁金",
        "2. 外导体， 不锈钢/钝化",
        "3. 绝缘体，PTFE,PEI",
        "@ 材料和徐层",
        "1. 内导体，铁青铜/镇金",
        "2. 外时体， 不锈钢/僵化",
        "5. 插拔寿命，500次",
      ].join("\n"),
      "2210-MM1-18-1(SMA-SSMP-JJG)技术规格书.png",
    );

    expect(spec.frequency).toBe("DC~18GHz");
    expect(spec.vswr).toBe("≤1.2");
    expect(spec.parameters).toEqual(
      expect.arrayContaining([
        { label: "绝缘电阻", value: ">5000MΩ" },
        { label: "介质耐压", value: "500V" },
        { label: "插拔寿命", value: "500次" },
        { label: "接触件材质", value: "铍青铜/镀金" },
        { label: "外壳材质", value: "不锈钢/钝化" },
        { label: "绝缘体", value: "PTFE,PEI" },
      ]),
    );
  });
});
