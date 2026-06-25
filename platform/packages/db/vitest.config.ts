import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // DB tests share a single Postgres instance; run serially to avoid races.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
