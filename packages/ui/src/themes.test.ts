import { describe, expect, it } from "vitest";
import { factoryPreset } from "./tailwind-preset.js";
import { themes, themeCss, type ThemeTokens } from "./themes.js";

const TOKEN_KEYS: (keyof ThemeTokens)[] = [
  "primary",
  "primaryForeground",
  "accent",
  "accentForeground",
  "background",
  "foreground",
  "muted",
  "mutedForeground",
  "border",
  "ring",
  "radius",
];

describe("themes", () => {
  it("defines the four skin themes", () => {
    expect(Object.keys(themes).sort()).toEqual([
      "amber",
      "blue",
      "green",
      "slate",
    ]);
  });

  it.each(Object.keys(themes))("theme %s has every token non-empty", (name) => {
    const tokens = themes[name]!;
    for (const key of TOKEN_KEYS) {
      expect(tokens[key], `${name}.${key}`).toBeTruthy();
      expect(tokens[key].trim()).not.toBe("");
    }
  });
});

describe("themeCss", () => {
  it("emits a :root block with kebab-cased vars and exact green values", () => {
    const css = themeCss("green");
    expect(css.startsWith(":root {")).toBe(true);
    expect(css.trimEnd().endsWith("}")).toBe(true);
    expect(css).toContain("--primary: 152 55% 28%;");
    expect(css).toContain("--primary-foreground: 0 0% 100%;");
    expect(css).toContain("--muted-foreground: 155 8% 40%;");
    expect(css).toContain("--radius: 0.5rem;");
  });

  it("emits one declaration per token", () => {
    const css = themeCss("slate");
    expect(css.match(/--[a-z-]+:/g)).toHaveLength(TOKEN_KEYS.length);
  });

  it("throws on unknown themes, listing available names", () => {
    expect(() => themeCss("magenta")).toThrow(
      'Unknown theme "magenta" — available: green, slate, amber, blue',
    );
  });
});

describe("factoryPreset", () => {
  it("maps colors onto the theme CSS variables", () => {
    const colors = factoryPreset.theme.extend.colors;
    expect(colors.primary.DEFAULT).toBe("hsl(var(--primary))");
    expect(colors.primary.foreground).toBe("hsl(var(--primary-foreground))");
    expect(colors.accent.DEFAULT).toBe("hsl(var(--accent))");
    expect(colors.accent.foreground).toBe("hsl(var(--accent-foreground))");
    expect(colors.background).toBe("hsl(var(--background))");
    expect(colors.foreground).toBe("hsl(var(--foreground))");
    expect(colors.muted.DEFAULT).toBe("hsl(var(--muted))");
    expect(colors.muted.foreground).toBe("hsl(var(--muted-foreground))");
    expect(colors.border).toBe("hsl(var(--border))");
    expect(colors.ring).toBe("hsl(var(--ring))");
    expect(factoryPreset.theme.extend.borderRadius.DEFAULT).toBe(
      "var(--radius)",
    );
  });
});
