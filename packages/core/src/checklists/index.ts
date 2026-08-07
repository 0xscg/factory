import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { mutate, type MutationContext } from "../audit/mutate.js";
import type { Db, TenantTx } from "../db/client.js";
import { checklistSteps, checklists, evidence } from "../db/schema/index.js";

/**
 * Checklist templates are code, not DB rows — skins declare them in
 * skin.config.ts (checklists: [...]) and instances reference them by key.
 */
const stepDefSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  title: z.string().min(1),
  requiresEvidence: z.boolean().default(false),
});

const checklistDefSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  name: z.string().min(1),
  steps: z.array(stepDefSchema).min(1),
});

export type ChecklistDef = z.infer<typeof checklistDefSchema>;

export function defineChecklist(
  def: z.input<typeof checklistDefSchema>,
): ChecklistDef {
  const parsed = checklistDefSchema.parse(def);
  const keys = new Set(parsed.steps.map((s) => s.key));
  if (keys.size !== parsed.steps.length) {
    throw new Error(`checklist ${parsed.key} has duplicate step keys`);
  }
  return parsed;
}

export type ChecklistRow = typeof checklists.$inferSelect;
export type ChecklistStepRow = typeof checklistSteps.$inferSelect;

export class ChecklistStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChecklistStateError";
  }
}

/** Instantiate a template (optionally against a record). */
export async function startChecklist(
  db: Db,
  ctx: MutationContext,
  def: ChecklistDef,
  opts: { recordId?: string } = {},
): Promise<ChecklistRow> {
  return mutate(db, ctx, async (tx) => {
    const [row] = await tx
      .insert(checklists)
      .values({
        orgId: ctx.orgId,
        product: ctx.product,
        templateKey: def.key,
        name: def.name,
        recordId: opts.recordId ?? null,
        createdBy: ctx.actorUserId ?? null,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    await tx.insert(checklistSteps).values(
      def.steps.map((s, position) => ({
        orgId: ctx.orgId,
        product: ctx.product,
        checklistId: row.id,
        stepKey: s.key,
        position,
        title: s.title,
        requiresEvidence: s.requiresEvidence,
      })),
    );
    return {
      result: row,
      action: "checklist.started",
      entityType: "checklist",
      entityId: row.id,
      after: {
        templateKey: def.key,
        recordId: opts.recordId ?? null,
        steps: def.steps.length,
      },
    };
  });
}

/**
 * Complete (or re-complete, while still open) a step. Steps whose
 * definition requires evidence demand an evidenceId that exists in this
 * org. Blocked once the checklist is signed off.
 */
export async function completeStep(
  db: Db,
  ctx: MutationContext,
  checklistId: string,
  stepKey: string,
  opts: { evidenceId?: string; notes?: string } = {},
): Promise<ChecklistStepRow> {
  const actor = ctx.actorUserId ?? null;
  return mutate(db, ctx, async (tx) => {
    const checklist = await requireOpenChecklist(tx, checklistId);
    const [step] = await tx
      .select()
      .from(checklistSteps)
      .where(
        and(
          eq(checklistSteps.checklistId, checklistId),
          eq(checklistSteps.stepKey, stepKey),
        ),
      );
    if (!step)
      throw new ChecklistStateError(
        `no step ${stepKey} on checklist ${checklistId}`,
      );

    if (step.requiresEvidence && !opts.evidenceId) {
      throw new ChecklistStateError(`step ${stepKey} requires evidence`);
    }
    // Any provided evidenceId is validated — same org (via RLS) AND same
    // product; a dangling or cross-product id must never become a pointer.
    if (opts.evidenceId) {
      const [ev] = await tx
        .select({ id: evidence.id })
        .from(evidence)
        .where(
          and(
            eq(evidence.id, opts.evidenceId),
            eq(evidence.product, ctx.product),
          ),
        );
      if (!ev)
        throw new ChecklistStateError(`evidence ${opts.evidenceId} not found`);
    }

    const [updated] = await tx
      .update(checklistSteps)
      .set({
        completedAt: sql`now()`,
        completedBy: actor,
        evidenceId: opts.evidenceId ?? null,
        notes: opts.notes ?? null,
      })
      .where(eq(checklistSteps.id, step.id))
      .returning();
    if (!updated) throw new Error("step update failed");
    return {
      result: updated,
      action: "checklist.step_completed",
      entityType: "checklist_step",
      entityId: step.id,
      before: {
        completedAt: step.completedAt,
        completedBy: step.completedBy,
        evidenceId: step.evidenceId,
        notes: step.notes,
      },
      after: {
        stepKey,
        evidenceId: opts.evidenceId ?? null,
        notes: opts.notes ?? null,
        checklistId: checklist.id,
      },
    };
  });
}

/** Sign-off requires every step completed; freezes the checklist. */
export async function signOffChecklist(
  db: Db,
  ctx: MutationContext,
  checklistId: string,
): Promise<ChecklistRow> {
  const actor = ctx.actorUserId ?? null;
  if (!actor) throw new ChecklistStateError("sign-off requires a user actor");
  return mutate(db, ctx, async (tx) => {
    await requireOpenChecklist(tx, checklistId);
    const incomplete = await tx
      .select({ stepKey: checklistSteps.stepKey })
      .from(checklistSteps)
      .where(
        and(
          eq(checklistSteps.checklistId, checklistId),
          isNull(checklistSteps.completedAt),
        ),
      );
    if (incomplete.length > 0) {
      throw new ChecklistStateError(
        `cannot sign off: incomplete steps ${incomplete.map((s) => s.stepKey).join(", ")}`,
      );
    }
    const [updated] = await tx
      .update(checklists)
      .set({
        status: "signed_off",
        signedOffBy: actor,
        signedOffAt: sql`now()`,
      })
      .where(and(eq(checklists.id, checklistId), eq(checklists.status, "open")))
      .returning();
    if (!updated)
      throw new ChecklistStateError(`checklist ${checklistId} is not open`);
    return {
      result: updated,
      action: "checklist.signed_off",
      entityType: "checklist",
      entityId: checklistId,
      after: { signedOffBy: actor },
    };
  });
}

/**
 * Reads the checklist FOR UPDATE: completeStep and signOffChecklist both
 * lock the parent row, serializing them — without the lock, a step
 * completion racing a sign-off could mutate a frozen checklist's steps
 * (same read-committed class as the records zombie-update bug). The DB
 * freeze triggers in 0005 are the backstop; this lock is the fix.
 */
async function requireOpenChecklist(
  tx: TenantTx,
  checklistId: string,
): Promise<ChecklistRow> {
  const [row] = await tx
    .select()
    .from(checklists)
    .where(eq(checklists.id, checklistId))
    .for("update");
  if (!row) throw new ChecklistStateError(`checklist ${checklistId} not found`);
  if (row.status !== "open")
    throw new ChecklistStateError(`checklist ${checklistId} is signed off`);
  return row;
}

export async function getChecklist(
  tx: TenantTx,
  checklistId: string,
): Promise<{ checklist: ChecklistRow; steps: ChecklistStepRow[] } | null> {
  const [checklist] = await tx
    .select()
    .from(checklists)
    .where(eq(checklists.id, checklistId));
  if (!checklist) return null;
  const steps = await tx
    .select()
    .from(checklistSteps)
    .where(eq(checklistSteps.checklistId, checklistId))
    .orderBy(checklistSteps.position);
  return { checklist, steps };
}

export async function listChecklists(
  tx: TenantTx,
  opts: { templateKey?: string; recordId?: string; limit?: number } = {},
): Promise<ChecklistRow[]> {
  const conditions = [];
  if (opts.templateKey)
    conditions.push(eq(checklists.templateKey, opts.templateKey));
  if (opts.recordId) conditions.push(eq(checklists.recordId, opts.recordId));
  return tx
    .select()
    .from(checklists)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(checklists.createdAt))
    .limit(opts.limit ?? 100);
}
