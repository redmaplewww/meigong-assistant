# 美工助手

美工助手是一个本地网页工具，用来制作电商产品图。它的核心不是 AI 生成整张图，而是把真实商品图、详情图、规格书、工程图、文字和模板图层进行可控拼接。

适合测试的主要场景：导入一个产品 SKU，让软件自动从规格书里 OCR 提取参数和工程图，再基于模板、素材库和 AI 指令生成主图、参数图、工程图、服务图、白底图和详情图。

## 主要功能

- 导入单个 SKU：选择商品图、详情图和规格书。
- OCR 规格书：从 PDF 或图片规格书中提取产品参数和工程图。
- 创建 SKU：OCR 完成后手动点击“创建 SKU”，再开始套版。
- 模板编辑：调整文字、字体、颜色、图层、参数胶囊、表格、底板和 LOGO。
- 素材库：管理底板、顶板、LOGO、图标等素材，并保存为模板套装。
- AI 助手：用自然语言描述想要的图，AI 给出套版方案并应用到当前 SKU 或全部 SKU。
- 导出图片：支持导出当前图、单个 SKU 图包和全部 SKU 图包。

## 测试流程

1. 启动软件，打开首页。
2. 在左侧导入区分别选择：
   - 商品图：用于主图里的产品主体。
   - 详情图：用于详情长图里的产品展示。
   - 规格书：PDF、PNG、JPG、WEBP 均可。
3. 等待 OCR 进度完成。界面会显示读取 PDF、检查文本层、OCR 识别、解析参数、提取工程图等阶段。
4. OCR 完成后点击“创建 SKU”。
5. 在左侧 SKU 列表中确认新 SKU 已创建，并检查素材区是否出现商品图、详情图和工程图。
6. 切换不同模板页，检查主图、参数图、工程图、服务图、白底图和详情图是否正常生成。
7. 在右侧属性面板调整：
   - 文字内容、字体、字号、颜色。
   - 参数胶囊形状和颜色。
   - 表格内容、表头颜色、条纹颜色。
   - 商品图位置、缩放、旋转。
   - 模板统一主色。
8. 在素材库中替换底板、顶板、LOGO 或图标，保存为模板套装，再应用到 SKU。
9. 在 AI 助手中输入自然语言指令，例如：
   - “把整套图改成红色工业风，标题更醒目，参数表保持清晰。”
   - “新建一张售后服务规则图，说明哪些情况支持售后，哪些情况不支持。”
   - “把当前 SKU 的主图改成更适合 18GHz 射频连接器的电商主图。”
10. 确认 AI 草稿后应用，检查模板和图层是否真的变化。
11. 使用顶部导出按钮导出当前图片、当前 SKU 或全部 SKU。

## 本地启动

```bash
npm install
npm run dev
```

打开：

```text
http://127.0.0.1:5173/
```

## DeepSeek 配置

公开仓库不包含真实 API key。开发时复制 `.env.example` 为 `.env.local`，填写：

```bash
DEEPSEEK_API_KEY=your-key
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_API_BASE=https://api.deepseek.com
```

Windows portable exe 也可以把 `deepseek.config.example.json` 复制为 `deepseek.config.json`，放在 exe 同目录：

```json
{
  "apiKey": "your-key",
  "model": "deepseek-v4-flash",
  "apiBase": "https://api.deepseek.com"
}
```

## 构建和打包

```bash
npm test
npm run build
npm run build:electron
npm run dist:win
```

打包后的文件在：

```text
release/meigong-web-launcher-0.1.1.exe
```

双击 exe 后会启动本地网页服务，并自动用默认浏览器打开美工助手。
