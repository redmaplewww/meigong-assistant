import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { join } from "node:path";
import { caseWorkspacePlugin } from "./server/caseWorkspace";
import { deepSeekProxyPlugin } from "./server/deepseekProxy";
import { deepSeekDefaults } from "./server/deepseekConfig";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      caseWorkspacePlugin({
        outputRoot: join(process.cwd(), "案例输出"),
      }),
      deepSeekProxyPlugin({
        apiKey: env.DEEPSEEK_API_KEY || deepSeekDefaults.apiKey,
        model: env.DEEPSEEK_MODEL || deepSeekDefaults.model,
        apiBase: env.DEEPSEEK_API_BASE || deepSeekDefaults.apiBase,
      }),
    ],
    server: {
      port: 5173,
    },
  };
});
