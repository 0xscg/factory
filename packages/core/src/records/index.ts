import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { z } from "zod";
import { mutate, type MutationContext } from "../audit/mutate.js";
import { withOrg, type Db, type TenantTx } from "../db/client.js";
import { records, recordVersions } from "../db/schema/index.js";

/**
 * A skin's record type: a stable type name plus the Zod schema its data
 * must satisfy. Skins declare these in skin.config.ts (entities: [...]).
 */
export interface EntityDef<S extends z.ZodTypeAny = z.ZodTypeAny> {
  type: string;
  schema: S;
}

export function defineEntity<S extends z.ZodTypeAny>(
  type: string,
  schema: S,
): EntityDef<S> {
  if (!/^[a-z][a-z0-9_]*$/.test(type)) {
    throw new Error(`entity type must be snake_case: ${type}`);
  }
  return { type, schema };
}

export type RecordRow = typeof records.$inferSelect;
export type RecordVersionRow = typeof recordVersions.$inferSelect;

export class VersionConflictError extends Error {
  constructor(recordId: string, expected: number) {
    super(
      `record ${recordId} was modified concurrently (expected version ${expected})`,
    );
    this.name = "VersionConflictError";
  }
}

export class RecordNotFoundError extends Error {
  constructor(recordId: string) {
    super(`record ${recordId} not found`);
    this.name = "RecordNotFoundError";
  }
}

export async function createRecord<S extends z.ZodTypeAny>(
  db: Db,
  ctx: MutationContext,
  entity: EntityDef<S>,
  input: z.input<S>,
): Promise<RecordRow> {
  const data = entity.schema.parse(input) as Record<string, unknown>;
  return mutate(db, ctx, async (tx) => {
    const [row] = await tx
      .insert(records)
      .values({
        orgId: ctx.orgId,
        product: ctx.product,
        entityType: entity.type,
        data,
        createdBy: ctx.actorUserId ?? null,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    await tx.insert(recordVersions).values({
      orgId: ctx.orgId,
      product: ctx.product,
      recordId: row.id,
      version: 1,
      data,
      createdBy: ctx.actorUserId ?? null,
    });
    return {
      result: row,
      action: "record.created",
      entityType: entity.type,
      entityId: row.id,
      after: data,
    };
  });
}

/**
 * Optimistic concurrency: callers pass the version they read; the UPDATE
 * only wins if it is still current, else VersionConflictError.
 */
export async function updateRecord<S extends z.ZodTypeAny>(
  db: Db,
  ctx: MutationContext,
  entity: EntityDef<S>,
  recordId: string,
  expectedVersion: number,
  input: z.input<S>,
): Promise<RecordRow> {
  const data = entity.schema.parse(input) as Record<string, unknown>;
  return mutate(db, ctx, async (tx) => {
    const [current] = await tx
      .select()
      .from(records)
      .where(
        and(
          eq(records.id, recordId),
          eq(records.entityType, entity.type),
          isNull(records.deletedAt),
        ),
      );
    if (!current) throw new RecordNotFoundError(recordId);

    // deletedAt IS NULL must be re-checked HERE, not only in the SELECT
    // above: under read committed, a soft-delete committing between the
    // two would otherwise not bump version and this UPDATE would write
    // onto a deleted record (review-reproduced race).
    const [updated] = await tx
      .update(records)
      .set({ data, version: expectedVersion + 1, updatedAt: sql`now()` })
      .where(
        and(
          eq(records.id, recordId),
          eq(records.version, expectedVersion),
          isNull(records.deletedAt),
        ),
      )
      .returning();
    if (!updated) throw new VersionConflictError(recordId, expectedVersion);

    await tx.insert(recordVersions).values({
      orgId: ctx.orgId,
      product: ctx.product,
      recordId,
      version: updated.version,
      data,
      createdBy: ctx.actorUserId ?? null,
    });
    return {
      result: updated,
      action: "record.updated",
      entityType: entity.type,
      entityId: recordId,
      before: current.data,
      after: data,
    };
  });
}

/** Soft delete: the row and its versions stay for inspection history. */
export async function softDeleteRecord(
  db: Db,
  ctx: MutationContext,
  entityType: string,
  recordId: string,
): Promise<void> {
  await mutate(db, ctx, async (tx) => {
    const [row] = await tx
      .update(records)
      .set({ deletedAt: sql`now()` })
      .where(
        and(
          eq(records.id, recordId),
          eq(records.entityType, entityType),
          isNull(records.deletedAt),
        ),
      )
      .returning();
    if (!row) throw new RecordNotFoundError(recordId);
    return {
      result: undefined,
      action: "record.deleted",
      entityType,
      entityId: recordId,
      before: row.data,
    };
  });
}

export async function getRecord(
  tx: TenantTx,
  entityType: string,
  recordId: string,
): Promise<RecordRow | null> {
  const [row] = await tx
    .select()
    .from(records)
    .where(
      and(
        eq(records.id, recordId),
        eq(records.entityType, entityType),
        isNull(records.deletedAt),
      ),
    );
  return row ?? null;
}

export async function listRecords(
  tx: TenantTx,
  entityType: string,
  opts: { limit?: number; offset?: number; includeDeleted?: boolean } = {},
): Promise<RecordRow[]> {
  const conditions = [eq(records.entityType, entityType)];
  if (!opts.includeDeleted) conditions.push(isNull(records.deletedAt));
  return tx
    .select()
    .from(records)
    .where(and(...conditions))
    .orderBy(desc(records.createdAt))
    .limit(opts.limit ?? 100)
    .offset(opts.offset ?? 0);
}

/** Full history, newest first — feeds the inspection pack. */
export async function listVersions(
  tx: TenantTx,
  recordId: string,
): Promise<RecordVersionRow[]> {
  return tx
    .select()
    .from(recordVersions)
    .where(eq(recordVersions.recordId, recordId))
    .orderBy(desc(recordVersions.version));
}

/** Convenience for read paths that don't already hold a tenant tx. */
export async function readRecords<T>(
  db: Db,
  orgId: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  return withOrg(db, orgId, fn);
}
