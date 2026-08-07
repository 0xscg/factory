import { defineConfig } from "vitest/config";

// Root Vitest config. Packages/apps add their own vitest.config.ts and run
// `vitest run` via the turbo `test` task; this root config covers repo-level
// tests and lets `pnpm test` pass while the workspace is still empty.
export default defineConfig({
  test: {
    passWithNoTests: true,
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
  },
});
