import { withOrg } from "@factory/core/db";
import { downloadEvidence, getEvidence } from "@factory/core/evidence";
import { requireOrg } from "@/server/context";
import { getObjectStore } from "@/server/evidence";

/**
 * Evidence download — tenant-scoped via RLS (getEvidence runs inside
 * withOrg) and integrity-checked (hash recomputed before serving).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { db, ctx } = await requireOrg();
  const row = await withOrg(db, ctx.orgId, (tx) => getEvidence(tx, id));
  if (!row) return new Response("Not found", { status: 404 });
  const bytes = await downloadEvidence(getObjectStore(), row);
  // RFC 5987 encoding + nosniff: stored filenames/content types are
  // user input; attachment disposition alone must not be the only guard.
  const asciiName = row.filename
    .replace(/[^\x20-\x7e]/g, "_")
    .replaceAll('"', "");
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": row.contentType,
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
      "X-Content-Type-Options": "nosniff",
      "X-Content-SHA256": row.sha256,
    },
  });
}
