import type { ParameterRow, Sku } from "./types";

export interface ParsedSpec {
  model?: string;
  title?: string;
  frequency?: string;
  vswr?: string;
  parameters: ParameterRow[];
  warnings: string[];
}

const parameterAliases: Array<{ label: string; patterns: RegExp[] }> = [
  { label: "阻抗", patterns: [/^impedance\b/i, /^characteristic impedance\b/i, /^阻抗/] },
  { label: "绝缘电阻", patterns: [/^insulation resistance\b/i, /^绝缘电阻/] },
  { label: "绝缘体", patterns: [/^insulator\b/i, /^insulation\b/i, /^dielectric\b/i, /^绝缘体/, /^绝缘/] },
  { label: "接触件材质", patterns: [/^contact material\b/i, /^center contact\b/i, /^inner conductor\b/i, /^内导体/, /^接触件/] },
  { label: "外壳材质", patterns: [/^body material\b/i, /^outer conductor\b/i, /^shell material\b/i, /^外导体/, /^壳体/] },
  { label: "表面处理", patterns: [/^finish\b/i, /^plating\b/i, /^surface\b/i, /^镀层/, /^表面处理/] },
  { label: "工作温度", patterns: [/^operating temperature\b/i, /^temperature range\b/i, /^工作温度/, /^温度范围/] },
  { label: "介质耐压", patterns: [/^dielectric withstanding voltage\b/i, /^withstand voltage\b/i, /^介质耐压/] },
  { label: "插拔寿命", patterns: [/^durability\b/i, /^mating cycles\b/i, /^插拔/] },
];

function joinCjkSpaces(text: string): string {
  let current = text;
  let next = current.replace(/([\u3400-\u9fff])[ \t]+(?=[\u3400-\u9fff])/g, "$1");
  while (next !== current) {
    current = next;
    next = current.replace(/([\u3400-\u9fff])[ \t]+(?=[\u3400-\u9fff])/g, "$1");
  }
  return current;
}

function cleanText(text: string): string {
  return joinCjkSpaces(text)
    .replace(/\r/g, "\n")
    .replace(/[：]/g, ":")
    .replace(/[；;]/g, ":")
    .replace(/[≤≦]/g, "≤")
    .replace(/[≥≧]/g, "≥")
    .replace(/[～—–－]/g, "~")
    .replace(/(\d)\.\s+(\d)/g, "$1.$2")
    .replace(/(\d)\s*[,，]\s*(\d)/g, "$1.$2")
    .replace(/(^|\n)\s*5\s*[.)、]?\s*(?:EAA|HAF|HRA|HitRA\s*Mm)\s*[:：,，]\s*(\d+)\s*[%K]/gi, "$1 5. 插拔寿命: $2次")
    .replace(/([A-Za-z\u3400-\u9fff]{2,30})\s*[，,]\s*([<>≤≥]?\s*\d)/g, "$1: $2")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanValue(value: string): string {
  return value
    .replace(/^[\s:：\-~]+/, "")
    .replace(/^之(?=\d)/, ">")
    .replace(/\s+/g, " ")
    .replace(/M[QO0Ω]/gi, "MΩ")
    .replace(/OQ|0Q|00Q/g, "MΩ")
    .replace(/(\d)Y\b/g, "$1V")
    .replace(/\bPFE\b/gi, "PTFE")
    .replace(/铁青[铀铜]|锌青铜/g, "铍青铜")
    .replace(/鲁金|镇金/g, "镀金")
    .replace(/僵化/g, "钝化")
    .replace(/\s*(Ω|ohm)\s*$/i, "Ω")
    .trim();
}

function stripRowPrefix(value: string): string {
  return value
    .replace(/^[\s•●○■□◆◇-]+/, "")
    .replace(/^[（(]?\d+\s*[）).、:：]\s*/, "")
    .trim();
}

function fileModel(sourceName?: string): string | undefined {
  if (!sourceName) return undefined;
  const base = sourceName.replace(/\.[^.]+$/, "").replace(/技术规格书|规格书|datasheet|specification/gi, "").trim();
  const match = /([A-Za-z0-9][A-Za-z0-9._/\-]*(?:\([A-Za-z0-9._/\-]+\))?)/.exec(base);
  return match?.[1];
}

function firstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) return cleanValue(match[1]);
  }
  return undefined;
}

function normalizeFrequency(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value
    .replace(/\s+/g, "")
    .replace(/-/g, "~")
    .replace(/^DC(?=\d)/i, "DC~")
    .replace(/^DC[~]?/i, "DC~")
    .replace(/Ghz/i, "GHz")
    .replace(/Mhz/i, "MHz");
  return cleaned || undefined;
}

function normalizeVswr(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const number = /([0-9]+(?:\.[0-9]+)?)/.exec(value)?.[1];
  if (!number) return undefined;
  return `≤${number}`;
}

function splitKeyValue(line: string): { key: string; value: string } | undefined {
  const normalizedLine = stripRowPrefix(line);
  const colon = /^(.{2,48}?):\s*(.+)$/.exec(normalizedLine);
  if (colon) return { key: colon[1].trim(), value: cleanValue(colon[2]) };
  const comma = /^(.{2,48}?)[,，]\s*(.+)$/.exec(normalizedLine);
  if (comma && labelForStandaloneKey(comma[1])) return { key: comma[1].trim(), value: cleanValue(comma[2]) };

  for (const alias of parameterAliases) {
    const pattern = new RegExp(`^(${alias.patterns.map((item) => item.source.replace(/^\^/, "")).join("|")})\\s+(.+)$`, "i");
    const match = pattern.exec(normalizedLine);
    if (match?.[2]) return { key: match[1].trim(), value: cleanValue(match[2]) };
  }
  return undefined;
}

function labelForKey(key: string): string | undefined {
  const cleaned = stripRowPrefix(key).replace(/\s+/g, "");
  if (/绝缘电阻/.test(cleaned)) return "绝缘电阻";
  if (/介质耐压/.test(cleaned)) return "介质耐压";
  if (/插拔/.test(cleaned)) return "插拔寿命";
  if (/内[导寻]体|接触件/.test(cleaned)) return "接触件材质";
  if (/外[导寻时]体|壳体/.test(cleaned)) return "外壳材质";
  if (/绝缘体/.test(cleaned)) return "绝缘体";
  return parameterAliases.find((alias) => alias.patterns.some((pattern) => pattern.test(cleaned)))?.label;
}

function labelForStandaloneKey(key: string): string | undefined {
  const cleaned = stripRowPrefix(key).replace(/\s+/g, "");
  if (/^绝缘电阻$/.test(cleaned)) return "绝缘电阻";
  if (/^(?:全)?介质耐压$/.test(cleaned)) return "介质耐压";
  if (/^插拔寿命$/.test(cleaned)) return "插拔寿命";
  if (/^内[导寻]体$|^接触件$/.test(cleaned)) return "接触件材质";
  if (/^外[导寻时]体$|^壳体$/.test(cleaned)) return "外壳材质";
  if (/^绝缘体$/.test(cleaned)) return "绝缘体";
  return undefined;
}

function addUnique(rows: ParameterRow[], row: ParameterRow): void {
  if (!row.value || rows.some((item) => item.label === row.label)) return;
  rows.push(row);
}

export function parseSpecText(text: string, sourceName?: string): ParsedSpec {
  const cleaned = cleanText(text);
  const model =
    firstMatch(cleaned, [
      /(?:Part\s*(?:Number|No\.?)|P\/N|Model|型号|产品型号)\s*:\s*([A-Za-z0-9][A-Za-z0-9._/\-]*(?:\([A-Za-z0-9._/\-]+\))?)/i,
      /(?:Part\s*(?:Number|No\.?)|P\/N|Model|型号|产品型号)\s+([A-Za-z0-9][A-Za-z0-9._/\-]*(?:\([A-Za-z0-9._/\-]+\))?)/i,
    ]) ?? fileModel(sourceName);
  const frequency = normalizeFrequency(
    firstMatch(cleaned, [
      /(?:Frequency\s*Range|Frequency|工作频率|频率范围)\s*:?\s*([A-Za-z]*\s*[-~]?\s*\d+(?:\.\d+)?\s*(?:GHz|MHz))/i,
      /(DC\s*[-~]\s*\d+(?:\.\d+)?\s*(?:GHz|MHz))/i,
    ]),
  );
  const vswr = normalizeVswr(
    firstMatch(cleaned, [
      /(?:VSWR|Voltage Standing Wave Ratio|电压驻波比|驻波比|驻波)\s*:?\s*(?:≤|<=|<|Max\.?|MAX)?\s*([0-9]+(?:\.[0-9]+)?)/i,
      /(?:VSWR|Voltage Standing Wave Ratio|电压驻波比|驻波比|驻波)\s*:?\s*([0-9]+(?:\.[0-9]+)?\s*(?:Max\.?|MAX)?)/i,
    ]),
  );
  const title = firstMatch(cleaned, [/(?:Description|Product Name|品名|名称)\s*:?\s*(.{3,80})/i]);
  const parameters: ParameterRow[] = [];

  addUnique(parameters, { label: "型号", value: model ?? "" });
  addUnique(parameters, { label: "工作频率", value: frequency ?? "" });
  addUnique(parameters, { label: "电压驻波比", value: vswr ?? "" });

  cleaned.split("\n").forEach((line) => {
    const pair = splitKeyValue(line.trim());
    if (!pair) return;
    const label = labelForKey(pair.key);
    if (label) addUnique(parameters, { label, value: pair.value });
  });

  const warnings: string[] = [];
  if (!cleaned) warnings.push("规格书没有可读取文本层，已仅提取页面图作为工程图。");
  if (!parameters.length) warnings.push("未识别到可填充参数，请检查规格书是否为扫描图或手动补充参数。");

  return { model, title, frequency, vswr, parameters, warnings };
}

export function applySpecToSku(sku: Sku, spec: ParsedSpec): Sku {
  const model = spec.model?.trim() || sku.model;
  const parameters: ParameterRow[] = [];
  addUnique(parameters, { label: "型号", value: model });
  addUnique(parameters, { label: "工作频率", value: spec.frequency ?? sku.frequency });
  addUnique(parameters, { label: "电压驻波比", value: spec.vswr ?? sku.vswr });
  (spec.parameters.length ? spec.parameters : sku.parameters).forEach((row) => addUnique(parameters, row));

  return {
    ...sku,
    code: model,
    model,
    title: spec.title?.trim() || `${model} 转接器`,
    shortSpec: model,
    frequency: spec.frequency ?? sku.frequency,
    vswr: spec.vswr ?? sku.vswr,
    parameters,
  };
}
