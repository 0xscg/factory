"use client";

import { useEffect, useState } from "react";

const MANDATE = Date.UTC(2026, 9, 1); // 1 October 2026

/**
 * Client-side so the day count is computed at view time — the page is
 * statically prerendered, and a build-time count goes stale (reviewer
 * blocker: a compliance vendor must not misstate the statutory
 * deadline). Renders nothing until mounted to avoid hydration drift.
 */
export function MandateCountdown() {
  const [days, setDays] = useState<number | null>(null);
  useEffect(() => {
    setDays(Math.max(0, Math.ceil((MANDATE - Date.now()) / 86_400_000)));
  }, []);

  return (
    <p className="mb-4 inline-block rounded bg-primary px-3 py-1 text-sm font-medium text-primary-foreground">
      {days !== null ? `${days} days until ` : ""}digital waste tracking
      {days !== null ? " is" : " becomes"} mandatory — 1 October 2026
    </p>
  );
}
