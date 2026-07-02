import { app, BrowserWindow, dialog, shell } from "electron";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { handleSaveCaseWorkspace } from "../server/caseWorkspace.js";
import { deepSeekDefaults } from "../server/deepseekConfig.js";
import { handleDeepSeekPlan } from "../server/deepseekProxy.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const appRoot = app.isPackaged ? app.getAppPath() : join(__dirname, "..", "..");
const unpackedDistDir = join(process.resourcesPath, "app.asar.unpacked", "dist");
const distDir = app.isPackaged && existsSync(unpackedDistDir) ? unpackedDistDir : join(appRoot, "dist");

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
};

let launcherWindow: BrowserWindow | undefined;
let localServer: ReturnType<typeof createServer> | undefined;
let appUrl = "";

type DeepSeekConfig = typeof deepSeekDefaults;

function readDeepSeekConfigFile(path: string): Partial<DeepSeekConfig> {
  if (!existsSync(path)) return {};

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<DeepSeekConfig>;
    return {
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : undefined,
      model: typeof parsed.model === "string" ? parsed.model : undefined,
      apiBase: typeof parsed.apiBase === "string" ? parsed.apiBase : undefined,
    };
  } catch (error) {
    console.warn(`Cannot read DeepSeek config: ${path}`, error);
    return {};
  }
}

function resolveDeepSeekConfig(): DeepSeekConfig {
  const externalConfig = {
    ...readDeepSeekConfigFile(join(app.getPath("userData"), "deepseek.config.json")),
    ...readDeepSeekConfigFile(join(dirname(process.execPath), "deepseek.config.json")),
  };

  return {
    apiKey: process.env.DEEPSEEK_API_KEY ?? externalConfig.apiKey ?? deepSeekDefaults.apiKey,
    model: process.env.DEEPSEEK_MODEL ?? externalConfig.model ?? deepSeekDefaults.model,
    apiBase: process.env.DEEPSEEK_API_BASE ?? externalConfig.apiBase ?? deepSeekDefaults.apiBase,
  };
}

function sendText(res: ServerResponse, statusCode: number, text: string): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(text);
}

function sendFile(res: ServerResponse, path: string): void {
  res.statusCode = 200;
  res.setHeader("Content-Type", contentTypes[extname(path).toLowerCase()] ?? "application/octet-stream");

  const stream = createReadStream(path);
  stream.on("error", () => sendText(res, 404, "File not found"));
  stream.pipe(res);
}

function safeStaticPath(req: IncomingMessage): string {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const decodedPath = decodeURIComponent(url.pathname);
  const normalizedPath = normalize(decodedPath).replace(/^[/\\]+/, "");
  const safeRelativePath = !normalizedPath || normalizedPath === "." || normalizedPath.startsWith("..")
    ? "index.html"
    : normalizedPath;
  const requestedPath = join(distDir, safeRelativePath);
  return requestedPath.startsWith(distDir) ? requestedPath : join(distDir, "index.html");
}

function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  const requestedPath = safeStaticPath(req);
  if (existsSync(requestedPath)) {
    sendFile(res, requestedPath);
    return;
  }

  const fallbackPath = join(distDir, "index.html");
  if (existsSync(fallbackPath)) {
    sendFile(res, fallbackPath);
    return;
  }

  sendText(res, 500, "美工助手网页资源缺失，请重新下载完整安装包。");
}

function startLocalServer(): Promise<number> {
  const deepSeekConfig = resolveDeepSeekConfig();

  localServer = createServer((req, res) => {
    if (req.url?.startsWith("/api/save-case-workspace")) {
      handleSaveCaseWorkspace(req, res, {
        outputRoot: join(app.getPath("documents"), "美工助手案例输出"),
        openFolder: async (folderPath) => {
          await shell.openPath(folderPath);
        },
      }).catch((error) => {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : "案例文件夹保存失败。" }));
      });
      return;
    }

    if (req.url?.startsWith("/api/deepseek-plan")) {
      handleDeepSeekPlan(req, res, deepSeekConfig).catch((error) => {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : "DeepSeek 调用失败。" }));
      });
      return;
    }

    serveStatic(req, res);
  });

  return new Promise((resolve, reject) => {
    localServer?.once("error", reject);
    localServer?.listen(0, "127.0.0.1", () => {
      const address = localServer?.address();
      if (typeof address === "object" && address) resolve(address.port);
      else reject(new Error("本地服务启动失败。"));
    });
  });
}

function launcherHtml(url: string): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>美工助手启动器</title>
    <style>
      body {
        margin: 0;
        font-family: "Microsoft YaHei", "Segoe UI", sans-serif;
        background: #f5f7fb;
        color: #1f2937;
      }
      main {
        padding: 28px;
      }
      h1 {
        margin: 0 0 12px;
        font-size: 22px;
      }
      p {
        margin: 8px 0;
        line-height: 1.6;
        color: #4b5563;
      }
      a {
        display: inline-block;
        margin-top: 18px;
        padding: 10px 16px;
        border-radius: 8px;
        background: #0b70b7;
        color: white;
        text-decoration: none;
        font-weight: 600;
      }
      code {
        display: block;
        margin-top: 14px;
        padding: 8px;
        border-radius: 6px;
        background: #e5e7eb;
        word-break: break-all;
        color: #374151;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>美工助手已启动</h1>
      <p>已在系统默认浏览器中打开网页。关闭这个小窗口会停止本地服务。</p>
      <a href="${url}" target="_blank" rel="noreferrer">重新打开网页</a>
      <code>${url}</code>
    </main>
  </body>
</html>`;
}

function createLauncherWindow(url: string): void {
  launcherWindow = new BrowserWindow({
    width: 520,
    height: 300,
    resizable: false,
    maximizable: false,
    title: "美工助手启动器",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  launcherWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (/^https?:\/\//i.test(targetUrl)) void shell.openExternal(targetUrl);
    return { action: "deny" };
  });

  launcherWindow.webContents.on("will-navigate", (event, targetUrl) => {
    if (/^https?:\/\//i.test(targetUrl)) {
      event.preventDefault();
      void shell.openExternal(targetUrl);
    }
  });

  launcherWindow.on("closed", () => {
    launcherWindow = undefined;
    localServer?.close();
    app.quit();
  });

  void launcherWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(launcherHtml(url))}`);
}

async function launchWebApp(): Promise<void> {
  const port = await startLocalServer();
  appUrl = `http://127.0.0.1:${port}/`;
  await shell.openExternal(appUrl);
  createLauncherWindow(appUrl);
}

function showStartupError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  dialog.showErrorBox("美工助手启动失败", `本地网页服务没有启动成功。\n\n${message}`);
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (appUrl) void shell.openExternal(appUrl);
    if (launcherWindow) {
      if (launcherWindow.isMinimized()) launcherWindow.restore();
      launcherWindow.focus();
    }
  });
}

process.on("uncaughtException", (error) => {
  showStartupError(error);
  app.quit();
});

process.on("unhandledRejection", (error) => {
  showStartupError(error);
  app.quit();
});

app.whenReady().then(launchWebApp).catch((error) => {
  showStartupError(error);
  app.quit();
});

app.on("window-all-closed", () => {
  localServer?.close();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (appUrl) {
    void shell.openExternal(appUrl);
    if (launcherWindow) launcherWindow.focus();
  } else {
    void launchWebApp();
  }
});
