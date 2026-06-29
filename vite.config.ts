import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { deepSeekProxyPlugin } from "./server/deepseekProxy";
import { deepSeekDefaults } from "./server/deepseekConfig";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
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
