import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(".") } },
  test: { include: ["tests/**/*.test.ts"], testTimeout: 120_000 },
});
