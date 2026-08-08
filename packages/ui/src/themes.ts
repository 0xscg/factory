/**
 * Per-skin theme tokens (architecture §3.1: "Design system … themed per
 * skin via tokens"). A skin picks a theme by name in skin.config.ts
 * (brand.theme); apps emit these as CSS custom properties, and every
 * shadcn/Tailwind component reads only the variables — so a new skin's
 * look is one token set, never a component fork.
 */
export interface ThemeTokens {
  /** hsl() triplets, shadcn convention: "H S% L%". */
  primary: string;
  primaryForeground: string;
  accent: string;
  accentForeground: string;
  background: string;
  foreground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  ring: string;
  radius: string;
}

export const themes: Record<string, ThemeTokens> = {
  /** WasteDuty */
  green: {
    primary: "152 55% 28%",
    primaryForeground: "0 0% 100%",
    accent: "152 45% 92%",
    accentForeground: "152 55% 18%",
    background: "0 0% 100%",
    foreground: "160 10% 12%",
    muted: "150 15% 95%",
    mutedForeground: "155 8% 40%",
    border: "150 12% 88%",
    ring: "152 55% 28%",
    radius: "0.5rem",
  },
  /** CarbonDuty */
  slate: {
    primary: "215 25% 27%",
    primaryForeground: "0 0% 100%",
    accent: "215 25% 93%",
    accentForeground: "215 25% 17%",
    background: "0 0% 100%",
    foreground: "220 15% 12%",
    muted: "220 14% 96%",
    mutedForeground: "220 9% 45%",
    border: "220 13% 89%",
    ring: "215 25% 27%",
    radius: "0.5rem",
  },
  /** LotCheck */
  amber: {
    primary: "32 85% 40%",
    primaryForeground: "0 0% 100%",
    accent: "38 90% 93%",
    accentForeground: "30 80% 22%",
    background: "0 0% 100%",
    foreground: "28 15% 12%",
    muted: "35 25% 95%",
    mutedForeground: "30 10% 42%",
    border: "35 20% 87%",
    ring: "32 85% 40%",
    radius: "0.5rem",
  },
  /** ProtectDuty */
  blue: {
    primary: "217 70% 38%",
    primaryForeground: "0 0% 100%",
    accent: "217 60% 93%",
    accentForeground: "217 70% 22%",
    background: "0 0% 100%",
    foreground: "222 15% 12%",
    muted: "218 20% 96%",
    mutedForeground: "220 10% 44%",
    border: "218 16% 88%",
    ring: "217 70% 38%",
    radius: "0.5rem",
  },
};

/** Kebab-cases a token key for its CSS variable name. */
function cssVarName(key: string): string {
  return `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/**
 * Emits the theme as a `:root { … }` block for the app's global CSS.
 * Throws on unknown theme names — a typo in skin.config.ts must fail
 * the build, not silently render unstyled.
 * Token values are interpolated raw: they are build-time constants from
 * this file only. If themes ever become org-customisable (white-label),
 * values MUST be validated first or they can inject arbitrary CSS.
 */
export function themeCss(themeName: string): string {
  const tokens = themes[themeName];
  if (!tokens) {
    throw new Error(
      `Unknown theme "${themeName}" — available: ${Object.keys(themes).join(", ")}`,
    );
  }
  const lines = Object.entries(tokens)
    .map(([k, v]) => `  ${cssVarName(k)}: ${v};`)
    .join("\n");
  return `:root {\n${lines}\n}`;
}
