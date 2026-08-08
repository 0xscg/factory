import type { Metadata } from "next";
import type { ReactNode } from "react";
import { themeCss } from "@factory/ui/themes";
import skin from "../skin.config";
import "./globals.css";

export const metadata: Metadata = {
  title: `${skin.brand.name} — ${skin.brand.tagline ?? ""}`,
  description:
    "Audit-ready waste movement records, carrier checks and evidence for the digital waste tracking mandate (1 October 2026).",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB">
      <head>
        {/* Skin theme tokens (green) — see packages/ui/src/themes.ts */}
        <style
          dangerouslySetInnerHTML={{ __html: themeCss(skin.brand.theme) }}
        />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
