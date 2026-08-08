import type { InspectionPackData } from "./inspection-pack.js";

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const e = escapeHtml;

function dataRows(data: unknown): string {
  if (data === null || typeof data !== "object") return e(JSON.stringify(data));
  return Object.entries(data as Record<string, unknown>)
    .map(
      ([k, v]) =>
        `<div class="kv"><span class="k">${e(k)}</span><span class="v">${e(
          typeof v === "object" ? JSON.stringify(v) : v,
        )}</span></div>`,
    )
    .join("");
}

/**
 * The one-click "inspection-ready pack": records + evidence index +
 * audit extract (architecture §3.2). Self-contained HTML — Gotenberg
 * renders it without network access. Copy vocabulary: records /
 * evidence / audit-ready only; never claims about compliance itself.
 */
export function renderInspectionPack(pack: InspectionPackData): string {
  const recordSections = pack.entityTypes
    .map((et) => {
      const rows = pack.records
        .filter((r) => r.entityType === et.key)
        .map(
          (r) => `<tr>
  <td class="mono">${e(r.id.slice(0, 8))}</td>
  <td>${e(r.createdAt.toISOString().slice(0, 10))}</td>
  <td>${e(r.version)}</td>
  <td>${dataRows(r.data)}</td>
</tr>`,
        )
        .join("");
      return `<section>
<h2>${e(et.title)}</h2>
<table>
<thead><tr><th>Ref</th><th>Created</th><th>Ver</th><th>Record</th></tr></thead>
<tbody>${rows || `<tr><td colspan="4" class="empty">No records</td></tr>`}</tbody>
</table>
</section>`;
    })
    .join("");

  const evidenceRows = pack.evidence
    .map(
      (ev) => `<tr>
  <td class="mono">${e(ev.recordId?.slice(0, 8))}</td>
  <td>${e(ev.filename)}</td>
  <td>${e(ev.createdAt.toISOString().slice(0, 10))}</td>
  <td class="mono hash">${e(ev.sha256)}</td>
</tr>`,
    )
    .join("");

  const auditRows = pack.audit
    .map(
      (a) => `<tr>
  <td>${e(a.createdAt.toISOString().replace("T", " ").slice(0, 19))}</td>
  <td>${e(a.action)}</td>
  <td>${e(a.entityType)}</td>
  <td class="mono">${e(String(a.entityId).slice(0, 8))}</td>
</tr>`,
    )
    .join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${e(pack.title)}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; font-size: 11px; color: #1a1a1a; margin: 24px; }
  h1 { font-size: 18px; margin-bottom: 2px; }
  h2 { font-size: 13px; border-bottom: 1px solid #ccc; padding-bottom: 3px; margin-top: 20px; }
  .meta { color: #555; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th { text-align: left; background: #f2f2f2; padding: 4px 6px; font-size: 10px; text-transform: uppercase; letter-spacing: .03em; }
  td { padding: 4px 6px; border-bottom: 1px solid #eee; vertical-align: top; }
  .mono { font-family: ui-monospace, Menlo, monospace; font-size: 10px; }
  .hash { word-break: break-all; }
  .kv { display: flex; gap: 6px; }
  .kv .k { color: #666; min-width: 90px; }
  .empty { color: #999; font-style: italic; }
  footer { margin-top: 28px; padding-top: 8px; border-top: 1px solid #ccc; color: #666; font-size: 9px; }
</style>
</head>
<body>
<h1>${e(pack.title)}</h1>
<p class="meta">${e(pack.orgName)} — generated ${e(
    pack.generatedAt.toISOString().replace("T", " ").slice(0, 16),
  )} UTC.
This pack contains the organisation's records, evidence index (SHA-256 file hashes), and audit extract.</p>
${recordSections}
<section>
<h2>Evidence index</h2>
<table>
<thead><tr><th>Record</th><th>File</th><th>Attached</th><th>SHA-256</th></tr></thead>
<tbody>${evidenceRows || `<tr><td colspan="4" class="empty">No evidence attached</td></tr>`}</tbody>
</table>
</section>
<section>
<h2>Audit extract</h2>
<table>
<thead><tr><th>When (UTC)</th><th>Action</th><th>Entity</th><th>Ref</th></tr></thead>
<tbody>${auditRows || `<tr><td colspan="4" class="empty">No events</td></tr>`}</tbody>
</table>
</section>
<footer>${e(pack.footerText ?? "")}</footer>
</body>
</html>`;
}
