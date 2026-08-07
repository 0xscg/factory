import { defineConfig } from "vitest/config";

// Root Vitest config: repo-level tests ONLY. Workspace packages run their
// own vitest via the turbo `test` task — including them here would execute
// their suites twice in parallel, and the DB integration tests truncate
// shared tables (proven flaky). Keep packages/apps excluded.
export default defineConfig({
  test: {
    passWithNoTests: true,
    include: ["*.test.ts", "tooling/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "packages/**",
      "apps/**",
    ],
  },
});
