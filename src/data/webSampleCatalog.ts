import type { Sku } from "../core/types";

const productUrl =
  "/sample-web/sma-connector-product.jpg";
const engineeringUrl = "/sample-web/sma-connector-drawing.png";

export const webSampleCatalog: Sku[] = [
  {
    id: "web-sma-demo",
    family: "Web-SMA",
    code: "WEB",
    model: "SMA-KK-18G",
    title: "SMA母头-SMA母头 射频转接器",
    shortSpec: "SMA母头-SMA母头",
    subtitle: "SMA Coaxial Adapter",
    frequency: "DC~18GHz",
    vswr: "≤1.3",
    parameters: [
      { label: "接头类型", value: "SMA-KK-18G" },
      { label: "工作频率", value: "DC~18GHz" },
      { label: "电压驻波比", value: "≤1.3" },
      { label: "绝缘电阻", value: "≥5000MΩ" },
      { label: "介质耐压", value: "750V" },
      { label: "插拔寿命", value: "500次" },
      { label: "内导体", value: "铍青铜/镀金" },
      { label: "外导体", value: "黄铜/镀金" },
      { label: "绝缘体", value: "PTFE" },
    ],
    serviceItems: [
      { icon: "settings", label: "工厂直营" },
      { icon: "cart", label: "现货速发" },
      { icon: "pencil", label: "支持定制" },
      { icon: "shield", label: "支持对公" },
      { icon: "receipt", label: "免费开票" },
      { icon: "warranty", label: "售后保障" },
    ],
    assets: {
      productTransparent: {
        id: "web-sma-product",
        type: "product-transparent",
        name: "SMA_connector.jpg",
        path: productUrl,
        url: productUrl,
      },
      productPhotos: [
        {
          id: "web-sma-product-photo",
          type: "product-photo",
          name: "SMA_connector.jpg",
          path: productUrl,
          url: productUrl,
        },
      ],
      drawing: {
        id: "web-sma-engineering",
        type: "drawing",
        name: "SMA_connector.png",
        path: engineeringUrl,
        url: engineeringUrl,
      },
      detailSlices: [],
    },
  },
];
