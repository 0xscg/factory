import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // DB integration suites truncate shared tables — never parallelize files.
    fileParallelism: false,
  },
});
