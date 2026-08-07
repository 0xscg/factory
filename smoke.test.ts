import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("monorepo bootstrap", () => {
  it("exposes the shared tsconfig package", () => {
    const pkg = JSON.parse(
      readFileSync(
        new URL("./tooling/tsconfig/package.json", import.meta.url),
        "utf8",
      ),
    ) as { name: string };
    expect(pkg.name).toBe("@factory/tsconfig");
  });
});
