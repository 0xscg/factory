import { and, asc, eq, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { mutate, type MutationContext } from "../audit/mutate.js";
import { withOrg, type Db, type TenantTx } from "../db/client.js";
import { obligations } from "../db/schema/index.js";
import type { MailSender } from "../identity/mail.js";

/**
 * Deadline rules are code, declared per skin (deadlines: [...] in
 * skin.config.ts). due() computes the obligation instant for an org —
 * fixed statutory dates return a constant; relative rules (e.g. "two
 * working days after receipt") derive from the record they attach to.
 */
const deadlineDefSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  name: z.string().min(1),
  citation: z.string().min(1),
  /**
   * Escalation schedule: days before due to notify, descending, each once.
   * Capped at 365 — the scan window looks 366 days ahead, so a larger
   * stage would silently never fire on time.
   */
  escalationDaysBefore: z.array(z.number().int().nonnegative().max(365)).min(1),
});

export type DeadlineDef = z.infer<typeof deadlineDefSchema> & {
  due: (input: { now: Date; record?: unknown }) => Date | null;
};

export function defineDeadline(
  def: z.input<typeof deadlineDefSchema> & DeadlineDefDue,
): DeadlineDef {
  const parsed = deadlineDefSchema.parse(def);
  const sorted = [...parsed.escalationDaysBefore].sort((a, b) => b - a);
  return { ...parsed, escalationDaysBefore: sorted, due: def.due };
}

interface DeadlineDefDue {
  due: (input: { now: Date; record?: unknown }) => Date | null;
}

export type ObligationRow = typeof obligations.$inferSelect;

/**
 * Upsert the org's obligation for a rule (idempotent on org+rule+dueAt,
 * so recomputation never duplicates). Null due dates (rule not
 * applicable) are skipped.
 */
export async function computeObligation(
  db: Db,
  ctx: MutationContext,
  rule: DeadlineDef,
  input: { now: Date; record?: { id: string; data?: unknown } },
): Promise<ObligationRow | null> {
  const dueAt = rule.due({ now: input.now, record: input.record?.data });
  if (!dueAt) return null;

  return mutate(db, ctx, async (tx) => {
    const [row] = await tx
      .insert(obligations)
      .values({
        orgId: ctx.orgId,
        product: ctx.product,
        ruleKey: rule.key,
        name: rule.name,
        citation: rule.citation,
        dueAt,
        recordId: input.record?.id ?? null,
      })
      .onConflictDoNothing()
      .returning();
    if (!row) {
      // Already computed for this org+rule+dueAt — return the existing row.
      const [existing] = await tx
        .select()
        .from(obligations)
        .where(
          and(
            eq(obligations.orgId, ctx.orgId),
            eq(obligations.product, ctx.product),
            eq(obligations.ruleKey, rule.key),
            eq(obligations.dueAt, dueAt),
          ),
        );
      return {
        result: existing ?? null,
        action: "obligation.recomputed",
        entityType: "obligation",
        entityId: existing?.id ?? "unknown",
        after: {
          ruleKey: rule.key,
          dueAt: dueAt.toISOString(),
          duplicate: true,
        },
      };
    }
    return {
      result: row,
      action: "obligation.created",
      entityType: "obligation",
      entityId: row.id,
      after: {
        ruleKey: rule.key,
        citation: rule.citation,
        dueAt: dueAt.toISOString(),
      },
    };
  });
}

export async function markObligationMet(
  db: Db,
  ctx: MutationContext,
  obligationId: string,
): Promise<ObligationRow> {
  return mutate(db, ctx, async (tx) => {
    const [updated] = await tx
      .update(obligations)
      .set({ status: "met", metAt: sql`now()`, metBy: ctx.actorUserId ?? null })
      .where(
        and(
          eq(obligations.id, obligationId),
          eq(obligations.status, "pending"),
        ),
      )
      .returning();
    if (!updated)
      throw new Error(`obligation ${obligationId} not found or already met`);
    return {
      result: updated,
      action: "obligation.met",
      entityType: "obligation",
      entityId: obligationId,
      after: { metBy: ctx.actorUserId ?? null },
    };
  });
}

export async function listObligations(
  tx: TenantTx,
  product: string,
  opts: { status?: "pending" | "met"; limit?: number } = {},
): Promise<ObligationRow[]> {
  const conditions = [eq(obligations.product, product)];
  if (opts.status) conditions.push(eq(obligations.status, opts.status));
  return tx
    .select()
    .from(obligations)
    .where(and(...conditions))
    .orderBy(asc(obligations.dueAt))
    .limit(opts.limit ?? 100);
}

export interface NotificationTarget {
  orgId: string;
  product: string;
  /** Recipients for this org's deadline emails (owner/admin emails). */
  emails: string[];
}

/**
 * One scan pass for one org: find pending obligations whose next
 * escalation stage has arrived, email each once, record the stage.
 * Deterministic: the caller supplies `now` (workers pass the wall
 * clock; tests pass fixed instants). Stage recording and the audit
 * event commit atomically; the email is sent AFTER commit (a crashed
 * send loses at most one reminder — the next stage still fires; an
 * email must never block or roll back the stage bookkeeping... it is
 * sent post-commit precisely so a mail-vendor outage can't wedge the
 * scan in a retry loop that re-sends earlier stages).
 */
export const DEFAULT_ESCALATION_STAGES = [30, 7, 1, 0];

export async function scanAndNotify(
  db: Db,
  target: NotificationTarget,
  /** The skin's rules, keyed by rule key — source of escalation schedules. */
  rules: Record<string, DeadlineDef>,
  mail: MailSender,
  now: Date,
): Promise<{ notified: { obligationId: string; stage: number }[] }> {
  const ctx: MutationContext = {
    orgId: target.orgId,
    product: target.product,
    actorUserId: null,
  };
  const pendingWhere = and(
    eq(obligations.product, target.product),
    eq(obligations.status, "pending"),
    lte(obligations.dueAt, addDays(now, 366)),
  );

  // Cheap unlocked pre-check: an hourly scan almost always has nothing
  // to send, and writing a `deadline.notified` audit event per idle scan
  // would bloat the append-only log (~9k no-op rows/org/yr). The locked
  // re-check inside mutate() below stays authoritative.
  const precheck = await withOrg(db, target.orgId, (tx) =>
    tx.select().from(obligations).where(pendingWhere),
  );
  if (pickStages(precheck, rules, now).length === 0) return { notified: [] };

  const due = await mutate(db, ctx, async (tx) => {
    const pending = await tx
      .select()
      .from(obligations)
      .where(pendingWhere)
      .orderBy(asc(obligations.dueAt))
      .for("update");

    const toNotify = pickStages(pending, rules, now);

    for (const { row, stage } of toNotify) {
      const updatedStages = [
        ...((row.notifiedStages as number[]) ?? []),
        stage,
      ];
      await tx
        .update(obligations)
        .set({ notifiedStages: updatedStages })
        .where(eq(obligations.id, row.id));
    }

    return {
      result: toNotify,
      action: "deadline.notified",
      entityType: "obligation_scan",
      entityId: target.orgId,
      after: {
        notified: toNotify.map(({ row, stage }) => ({
          obligationId: row.id,
          stage,
        })),
        at: now.toISOString(),
      },
    };
  });

  for (const { row, stage } of due) {
    const daysText =
      stage === 0 ? "due today" : `due in ${stage} days or fewer`;
    for (const email of target.emails) {
      await mail.send({
        to: email,
        subject: `Deadline: ${row.name} — ${daysText}`,
        text: `${row.name} (${row.citation}) is ${daysText}: ${row.dueAt.toISOString().slice(0, 10)}.\n\nRecords for this obligation should be completed and evidence attached before the due date.`,
      });
    }
  }

  return {
    notified: due.map(({ row, stage }) => ({ obligationId: row.id, stage })),
  };
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/**
 * For each pending obligation, pick the furthest-out escalation stage
 * whose window has arrived and hasn't been sent — one stage per scan
 * per obligation; later stages catch up on subsequent scans.
 */
function pickStages(
  pending: ObligationRow[],
  rules: Record<string, DeadlineDef>,
  now: Date,
): { row: ObligationRow; stage: number }[] {
  const toNotify: { row: ObligationRow; stage: number }[] = [];
  for (const row of pending) {
    const already = new Set((row.notifiedStages as number[]) ?? []);
    const daysLeft = (row.dueAt.getTime() - now.getTime()) / 86_400_000;
    const stages =
      rules[row.ruleKey]?.escalationDaysBefore ?? DEFAULT_ESCALATION_STAGES;
    for (const stage of stages) {
      if (!already.has(stage) && daysLeft <= stage) {
        toNotify.push({ row, stage });
        break;
      }
    }
  }
  return toNotify;
}
