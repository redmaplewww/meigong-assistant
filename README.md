# 美工助手

可控式 AI 套版拼接工具，面向电商主图、参数图、工程图和详情图生产。软件以真实素材、模板图层和文本渲染为核心，AI 负责理解自然语言、生成套版计划、建议素材变体和批量应用，不生成整张成品图。

## 功能

- SKU 素材导入与样例素材载入
- 素材库、模板库、模板套装保存与恢复
- AI 对话生成批量套版方案
- 图层、文字、形状、表格、图标、素材槽位可编辑
- 统一主色、参数胶囊、表格配色和模板套装主题绑定
- PNG、JPG、SKU、整套导出
- Windows 网页启动器 exe 打包

## 本地开发

```bash
npm install
npm run dev
```

打开 `http://127.0.0.1:5173/`。

## DeepSeek 配置

公开仓库和公开 exe 不包含 API key。开发模式可复制 `.env.example` 为 `.env.local`，填入：

```bash
DEEPSEEK_API_KEY=your-key
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_API_BASE=https://api.deepseek.com
```

Windows portable exe 可复制 `deepseek.config.example.json` 为 `deepseek.config.json`，放在 exe 同目录：

```json
{
  "apiKey": "your-key",
  "model": "deepseek-v4-flash",
  "apiBase": "https://api.deepseek.com"
}
```

也可以通过系统环境变量 `DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL`、`DEEPSEEK_API_BASE` 配置。

## 构建和打包

```bash
npm test
npm run build
npm run build:electron
npm run dist:win
```

打包后的网页启动器位于 `release/meigong-web-launcher-0.1.1.exe`。双击后会启动本地服务，并自动用系统默认浏览器打开美工助手网页。公开分发时建议作为 GitHub Release 附件上传，避免把大体积二进制文件直接放进源码提交。
