import { app, BrowserWindow, shell } from "electron";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { deepSeekDefaults } from "../server/deepseekConfig.js";
import { handleDeepSeekPlan } from "../server/deepseekProxy.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const appRoot = app.isPackaged ? app.getAppPath() : join(__dirname, "..", "..");
const distDir = join(appRoot, "dist");

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
};

let mainWindow: BrowserWindow | undefined;
let localServer: ReturnType<typeof createServer> | undefined;

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

function sendFile(res: ServerResponse, path: string): void {
  res.statusCode = 200;
  res.setHeader("Content-Type", contentTypes[extname(path).toLowerCase()] ?? "application/octet-stream");
  createReadStream(path).pipe(res);
}

function safeStaticPath(req: IncomingMessage): string {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const decodedPath = decodeURIComponent(url.pathname);
  const normalizedPath = normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
  const requestedPath = join(distDir, normalizedPath === "/" ? "index.html" : normalizedPath);
  return requestedPath.startsWith(distDir) ? requestedPath : join(distDir, "index.html");
}

function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  const requestedPath = safeStaticPath(req);
  if (existsSync(requestedPath)) {
    sendFile(res, requestedPath);
    return;
  }

  sendFile(res, join(distDir, "index.html"));
}

function startLocalServer(): Promise<number> {
  const deepSeekConfig = resolveDeepSeekConfig();

  localServer = createServer((req, res) => {
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

async function createMainWindow(): Promise<void> {
  const port = await startLocalServer();
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    title: "美工助手",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  await mainWindow.loadURL(`http://127.0.0.1:${port}/`);
}

app.whenReady().then(createMainWindow).catch((error) => {
  console.error(error);
  app.quit();
});

app.on("window-all-closed", () => {
  localServer?.close();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (!BrowserWindow.getAllWindows().length) void createMainWindow();
});
