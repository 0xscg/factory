/**
 * Shared Tailwind preset: maps utility colors onto the theme CSS
 * variables emitted by themeCss(). Apps do
 * `presets: [factoryPreset]` and get skin-correct colors for free.
 * Kept dependency-free (a plain config object) so the chassis doesn't
 * pin a Tailwind version on every skin.
 */
export const factoryPreset = {
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        border: "hsl(var(--border))",
        ring: "hsl(var(--ring))",
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
      },
    },
  },
} as const;
