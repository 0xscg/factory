import { createHash, randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { mutate, type MutationContext } from "../audit/mutate.js";
import type { Db, TenantTx } from "../db/client.js";
import { evidence, records } from "../db/schema/index.js";
import { RecordNotFoundError } from "../records/index.js";
import type { ObjectStore } from "./store.js";

export type EvidenceRow = typeof evidence.$inferSelect;

export class EvidenceIntegrityError extends Error {
  constructor(evidenceId: string) {
    super(
      `evidence ${evidenceId} failed SHA-256 verification — stored object was altered`,
    );
    this.name = "EvidenceIntegrityError";
  }
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export interface AttachEvidenceInput {
  recordId: string;
  filename: string;
  contentType: string;
  bytes: Uint8Array;
}

/**
 * Attach a file to a record: hash server-side, write the object under
 * <orgId>/<evidenceId>, and commit the row + audit event atomically.
 * The object is written BEFORE the DB transaction commits — if the
 * store write fails, the row never lands; if the commit fails, the
 * orphan object is unreferenced and harmless (store keys are unique
 * per evidence id, so it can never collide with a later attach).
 */
export async function attachEvidence(
  db: Db,
  store: ObjectStore,
  ctx: MutationContext,
  input: AttachEvidenceInput,
): Promise<EvidenceRow> {
  if (input.bytes.length === 0) throw new Error("evidence file is empty");
  const sha256 = sha256Hex(input.bytes);

  // Id generated up front: evidence is append-only (no UPDATE grant), so
  // the row must be inserted with its final storage key in one statement.
  const evidenceId = randomUUID();
  const storageKey = `${ctx.orgId}/${evidenceId}`;

  return mutate(db, ctx, async (tx) => {
    const [record] = await tx
      .select({ id: records.id })
      .from(records)
      .where(eq(records.id, input.recordId));
    if (!record) throw new RecordNotFoundError(input.recordId);

    const [row] = await tx
      .insert(evidence)
      .values({
        id: evidenceId,
        orgId: ctx.orgId,
        product: ctx.product,
        recordId: input.recordId,
        filename: input.filename,
        contentType: input.contentType,
        sizeBytes: input.bytes.length,
        sha256,
        storageKey,
        uploadedBy: ctx.actorUserId ?? null,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");

    await store.put(storageKey, input.bytes);

    return {
      result: row,
      action: "evidence.attached",
      entityType: "evidence",
      entityId: evidenceId,
      after: {
        recordId: input.recordId,
        filename: input.filename,
        sha256,
        sizeBytes: input.bytes.length,
      },
    };
  });
}

/** Download + integrity check: recompute the hash, refuse a mismatch. */
export async function downloadEvidence(
  store: ObjectStore,
  row: EvidenceRow,
): Promise<Uint8Array> {
  const bytes = await store.get(row.storageKey);
  if (sha256Hex(bytes) !== row.sha256) throw new EvidenceIntegrityError(row.id);
  return bytes;
}

export async function getEvidence(
  tx: TenantTx,
  evidenceId: string,
): Promise<EvidenceRow | null> {
  const [row] = await tx
    .select()
    .from(evidence)
    .where(eq(evidence.id, evidenceId));
  return row ?? null;
}

export async function listEvidenceForRecord(
  tx: TenantTx,
  recordId: string,
): Promise<EvidenceRow[]> {
  return tx
    .select()
    .from(evidence)
    .where(eq(evidence.recordId, recordId))
    .orderBy(desc(evidence.createdAt));
}

export {
  ObjectExistsError,
  ObjectNotFoundError,
  MemoryObjectStore,
  DirObjectStore,
} from "./store.js";
export type { ObjectStore } from "./store.js";
