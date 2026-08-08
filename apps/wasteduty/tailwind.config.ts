import type { Config } from "tailwindcss";
import { factoryPreset } from "@factory/ui/tailwind-preset";

export default {
  presets: [factoryPreset as unknown as Partial<Config>],
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
} satisfies Config;
