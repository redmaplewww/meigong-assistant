import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    exclude: ["**/node_modules/**", "**/dist/**", "**/build-electron/**", "**/release/**"],
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
});
