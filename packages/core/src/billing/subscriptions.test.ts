/**
 * Billing DB slice integration tests against real Postgres.
 *
 * Same two-connection setup as src/deadlines/deadlines.test.ts:
 *  - admin (superuser `factory`): migrations, truncation, RLS-bypassing
 *    assertions.
 *  - app (`app_login` in factory_app): all flows run here under RLS.
 *
 * Stripe objects are plain `as any` fixtures — no network, no Stripe SDK
 * calls. Mail: recording FakeMailSender. stripe_events is append-only
 * system infrastructure and is never truncated between tests; fresh
 * unique event ids per run keep the ledger tests independent.
 */
import { eq, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, runMigrations, type DbHandle } from "../db/index.js";
import { withOrg } from "../db/client.js";
import {
  auditLog,
  orgs,
  stripeEvents,
  subscriptions,
} from "../db/schema/index.js";
import type { MailSender } from "../identity/mail.js";
import { DbProcessedEventStore } from "./store.js";
import {
  defaultBillingHandlers,
  getSubscription,
  handlePaymentFailed,
  isSubscriptionActive,
  syncSubscription,
  type SubscriptionRow,
} from "./subscriptions.js";
import { handleWebhookEvent } from "./webhooks.js";

const ADMIN_URL =
  process.env.DATABASE_URL_TEST ??
  "postgres://factory:factory@localhost:5433/factory";

const APP_URL = (() => {
  const u = new URL(ADMIN_URL);
  u.username = "app_login";
  u.password = "app";
  return u.toString();
})();

/**
 * Drizzle wraps the pg error; the RLS/grant violation (SQLSTATE 42501)
 * lives on the cause chain. Walk it so we assert the *reason*, not just
 * any failure — same pattern as rls.test.ts's isRlsViolation.
 */
function isImmutabilityViolation(err: unknown): boolean {
  for (let e = err; e instanceof Error; e = e.cause as Error) {
    if (/permission denied/i.test(e.message)) return true;
    if (/row-level security/i.test(e.message)) return true;
    if ((e as { code?: string }).code === "42501") return true;
  }
  return false;
}

class FakeMailSender implements MailSender {
  messages: { to: string; subject: string; text: string }[] = [];
  async send(message: { to: string; subject: string; text: string }) {
    this.messages.push(message);
  }
}

let admin: DbHandle;
let app: DbHandle;
let mail: FakeMailSender;

let seedCounter = 0;
/** Fresh org per test via admin insert (identity flow not needed here). */
async function seedOrg(): Promise<string> {
  const [row] = await admin.db
    .insert(orgs)
    .values({ name: `Billing Co ${Date.now()}-${seedCounter++}` })
    .returning({ id: orgs.id });
  return row!.id;
}

const uniq = () =>
  `${Date.now()}-${seedCounter++}-${Math.floor(Math.random() * 1e6)}`;

// ---- fixed instants ----
const PERIOD_END_EPOCH = 1_790_812_800; // 2026-10-01T00:00:00Z
const PERIOD_END = new Date(PERIOD_END_EPOCH * 1000);

// Base epoch for Stripe event `created` timestamps; nextEpoch() hands
// out strictly increasing values so fixture events arrive "in order"
// unless a test deliberately replays an older epoch.
const EVENT_EPOCH = 1_770_000_000; // 2026-02-02T02:40:00Z
let epochCounter = 0;
const nextEpoch = () => EVENT_EPOCH + ++epochCounter;

/** Fake Stripe subscription — plain literal, `as any` at the boundary. */
function fakeSub(overrides: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: `sub_${uniq()}`,
    object: "subscription",
    customer: "cus_123",
    status: "trialing",
    metadata: {},
    canceled_at: null,
    items: {
      data: [
        {
          current_period_end: PERIOD_END_EPOCH,
          price: { lookup_key: "wasteduty_starter" },
        },
      ],
    },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

function subFor(
  orgId: string,
  overrides: Record<string, unknown> = {},
): Stripe.Subscription {
  return fakeSub({
    metadata: { org_id: orgId, product: "wasteduty" },
    ...overrides,
  });
}

function fakeEvent(
  type: string,
  object: unknown,
  created = nextEpoch(),
  id = `evt_${uniq()}`,
): Stripe.Event {
  return {
    id,
    object: "event",
    type,
    created,
    data: { object },
  } as unknown as Stripe.Event;
}

function fakeInvoice(
  metadata: Record<string, string> | undefined,
): Stripe.Invoice {
  return {
    id: `in_${uniq()}`,
    object: "invoice",
    parent: metadata
      ? { subscription_details: { metadata } }
      : { subscription_details: {} },
  } as unknown as Stripe.Invoice;
}

async function adminSub(stripeSubscriptionId: string) {
  const [row] = await admin.db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId));
  return row;
}

/** Audit rows for one org, read as admin, newest first. */
async function adminTrail(orgId: string) {
  return admin.db
    .select()
    .from(auditLog)
    .where(eq(auditLog.orgId, orgId))
    .orderBy(sql`${auditLog.createdAt} desc`);
}

beforeAll(async () => {
  admin = createDb(ADMIN_URL);
  try {
    await admin.db.execute(sql`select 1`);
  } catch (err) {
    throw new Error(
      `Billing tests need a reachable Postgres at ${ADMIN_URL} ` +
        `(start it: podman compose up -d — see docs/local-dev.md). ` +
        `Underlying error: ${String(err)}`,
    );
  }
  await runMigrations(admin.db);
  await admin.db.execute(sql`
    DO $$ BEGIN
      CREATE ROLE app_login LOGIN PASSWORD 'app' IN ROLE factory_app;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  app = createDb(APP_URL);
});

afterAll(async () => {
  await app?.client.end();
  await admin?.client.end();
});

beforeEach(async () => {
  // audit_log and stripe_events are append-only and never truncated;
  // subscriptions is a mutable mirror.
  await admin.db.execute(sql`TRUNCATE users, orgs, subscriptions CASCADE`);
  mail = new FakeMailSender();
});

describe("syncSubscription", () => {
  it("creates the mirror row with mapped fields (customer as string)", async () => {
    const orgId = await seedOrg();
    const sub = subFor(orgId);
    const row = await syncSubscription(app.db, sub, nextEpoch());
    expect(row).toMatchObject({
      orgId,
      product: "wasteduty",
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: sub.id,
      status: "trialing",
      priceLookupKey: "wasteduty_starter",
      canceledAt: null,
    });
    expect(row?.currentPeriodEnd?.getTime()).toBe(PERIOD_END.getTime());
  });

  it("unwraps an expanded customer object to its id", async () => {
    const orgId = await seedOrg();
    const sub = subFor(orgId, { customer: { id: "cus_expanded" } });
    const row = await syncSubscription(app.db, sub, nextEpoch());
    expect(row?.stripeCustomerId).toBe("cus_expanded");
  });

  it("redelivery/update upserts in place: same row id, status updated, updatedAt advanced", async () => {
    const orgId = await seedOrg();
    const sub = subFor(orgId);
    const first = await syncSubscription(app.db, sub, nextEpoch());
    const second = await syncSubscription(
      app.db,
      subFor(orgId, { id: sub.id, status: "past_due" }),
      nextEpoch(),
    );
    expect(second?.id).toBe(first?.id);
    expect(second?.status).toBe("past_due");
    expect(second!.updatedAt.getTime()).toBeGreaterThan(
      first!.updatedAt.getTime(),
    );

    const rows = await admin.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.orgId, orgId));
    expect(rows).toHaveLength(1);
  });

  it("missing metadata → returns null, writes nothing, no audit row", async () => {
    const orgId = await seedOrg();
    for (const metadata of [
      {},
      { org_id: orgId }, // product missing
      { product: "wasteduty" }, // org_id missing
      undefined,
    ]) {
      const row = await syncSubscription(
        app.db,
        fakeSub({ metadata }),
        nextEpoch(),
      );
      expect(row).toBeNull();
    }
    const rows = await admin.db.select().from(subscriptions);
    expect(rows).toEqual([]);
    expect(await adminTrail(orgId)).toEqual([]);
  });

  it('audits "subscription.synced" with entityId = stripe sub id, actorUserId null', async () => {
    const orgId = await seedOrg();
    const sub = subFor(orgId);
    await syncSubscription(app.db, sub, nextEpoch());
    const events = (await adminTrail(orgId)).filter(
      (r) => r.action === "subscription.synced",
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      entityType: "subscription",
      entityId: sub.id,
      actorUserId: null,
      after: {
        status: "trialing",
        priceLookupKey: "wasteduty_starter",
        currentPeriodEnd: PERIOD_END.toISOString(),
      },
    });
  });

  it("re-subscribe: a NEW subscription id for the same org+product replaces the canceled row", async () => {
    const orgId = await seedOrg();
    const subOld = subFor(orgId, { status: "canceled" });
    await syncSubscription(app.db, subOld, nextEpoch());

    const subNew = subFor(orgId, { status: "active", customer: "cus_new" });
    const row = await syncSubscription(app.db, subNew, nextEpoch());
    expect(row).toMatchObject({
      stripeSubscriptionId: subNew.id,
      stripeCustomerId: "cus_new",
      status: "active",
    });

    const rows = await admin.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.orgId, orgId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.stripeSubscriptionId).toBe(subNew.id);
  });

  it("out-of-order delivery: a delayed older event never resurrects a canceled subscription", async () => {
    const orgId = await seedOrg();
    const sub = subFor(orgId);
    const t1 = nextEpoch();
    const t2 = nextEpoch(); // t1 < t2
    await syncSubscription(
      app.db,
      subFor(orgId, { id: sub.id, status: "canceled" }),
      t2,
    );

    // The stale "active" update arrives late with the older epoch.
    const returned = await syncSubscription(
      app.db,
      subFor(orgId, { id: sub.id, status: "active" }),
      t1,
    );
    expect(returned?.status).toBe("canceled"); // current row, untouched
    expect((await adminSub(sub.id))?.status).toBe("canceled");

    const stale = (await adminTrail(orgId)).filter(
      (r) =>
        r.action === "subscription.synced" &&
        (r.after as { stale?: boolean })?.stale === true,
    );
    expect(stale).toHaveLength(1);
    expect(stale[0]?.after).toMatchObject({
      stale: true,
      ignoredStatus: "active",
    });
  });
});

describe("tenancy (RLS)", () => {
  it("org B cannot read org A's subscription", async () => {
    const orgA = await seedOrg();
    const orgB = await seedOrg();
    const sub = subFor(orgA);
    await syncSubscription(app.db, sub, nextEpoch());

    // B's org context sees nothing — enforced by RLS, not app filters.
    await withOrg(app.db, orgB, async (tx) => {
      const rows = await tx.select().from(subscriptions);
      expect(rows).toEqual([]);
    });
    expect(await getSubscription(app.db, orgB, "wasteduty")).toBeNull();

    // A still sees its own row.
    const own = await getSubscription(app.db, orgA, "wasteduty");
    expect(own?.stripeSubscriptionId).toBe(sub.id);
  });

  it("org B cannot mutate org A's subscription (update affects 0 rows)", async () => {
    const orgA = await seedOrg();
    const orgB = await seedOrg();
    const sub = subFor(orgA);
    await syncSubscription(app.db, sub, nextEpoch());

    await withOrg(app.db, orgB, (tx) =>
      tx
        .update(subscriptions)
        .set({ status: "canceled" })
        .where(eq(subscriptions.stripeSubscriptionId, sub.id)),
    );
    expect((await adminSub(sub.id))?.status).toBe("trialing");
  });
});

describe("isSubscriptionActive", () => {
  const truthTable: [SubscriptionRow["status"], boolean][] = [
    ["trialing", true],
    ["active", true],
    ["past_due", false],
    ["unpaid", false],
    ["canceled", false],
    ["incomplete", false],
    ["incomplete_expired", false],
    ["paused", false],
  ];
  for (const [status, expected] of truthTable) {
    it(`${status} → ${expected}`, () => {
      expect(isSubscriptionActive({ status } as SubscriptionRow)).toBe(
        expected,
      );
    });
  }
  it("null (no subscription) → false", () => {
    expect(isSubscriptionActive(null)).toBe(false);
  });
});

describe("webhook replay with DbProcessedEventStore", () => {
  it("same event id delivered twice: handler runs once, second is duplicate", async () => {
    const orgId = await seedOrg();
    const store = new DbProcessedEventStore(app.db);
    let handled = 0;
    const handlers = {
      "customer.subscription.created": async () => {
        handled += 1;
      },
    };
    const event = fakeEvent("customer.subscription.created", subFor(orgId));

    const first = await handleWebhookEvent(event, handlers, store);
    expect(first).toEqual({ received: true, handled: true, duplicate: false });
    const second = await handleWebhookEvent(event, handlers, store);
    expect(second).toEqual({ received: true, handled: false, duplicate: true });
    expect(handled).toBe(1);

    // Exactly one ledger row for the id, recording the real event type.
    const rows = await admin.db
      .select()
      .from(stripeEvents)
      .where(eq(stripeEvents.id, event.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.type).toBe("customer.subscription.created");
  });

  it("handler failure leaves the event unmarked; redelivery retries and marks (at-least-once)", async () => {
    const orgId = await seedOrg();
    const store = new DbProcessedEventStore(app.db);
    let calls = 0;
    const handlers = {
      "customer.subscription.created": async () => {
        calls += 1;
        if (calls === 1) throw new Error("transient handler failure");
      },
    };
    const event = fakeEvent("customer.subscription.created", subFor(orgId));

    await expect(handleWebhookEvent(event, handlers, store)).rejects.toThrow(
      /transient handler failure/,
    );
    expect(await store.wasProcessed(event.id)).toBe(false);

    // Stripe redelivers: handler runs again and the event is marked.
    const retry = await handleWebhookEvent(event, handlers, store);
    expect(retry).toEqual({ received: true, handled: true, duplicate: false });
    expect(calls).toBe(2);
    expect(await store.wasProcessed(event.id)).toBe(true);
  });
});

describe("handlePaymentFailed", () => {
  const deps = (recipients: string[]) => ({
    db: app.db,
    mail,
    recipients: async () => recipients,
  });

  it("sends one email per recipient; copy avoids compliance claims", async () => {
    const orgId = await seedOrg();
    const emails = ["owner@example.com", "admin@example.com"];
    await handlePaymentFailed(
      deps(emails),
      fakeInvoice({ org_id: orgId, product: "wasteduty" }),
    );
    expect(mail.messages).toHaveLength(2);
    expect(mail.messages.map((m) => m.to)).toEqual(emails);
    for (const m of mail.messages) {
      const copy = `${m.subject} ${m.text}`;
      expect(copy).not.toMatch(/ensures/i);
      expect(copy).not.toMatch(/guarantees compliance/i);
    }
  });

  it("missing metadata → returns silently, no emails", async () => {
    await handlePaymentFailed(
      deps(["owner@example.com"]),
      fakeInvoice(undefined),
    );
    await handlePaymentFailed(deps(["owner@example.com"]), fakeInvoice({}));
    expect(mail.messages).toEqual([]);
  });
});

describe("defaultBillingHandlers", () => {
  const makeDeps = () => ({
    db: app.db,
    mail,
    recipients: async () => ["owner@example.com"],
  });

  it("subscription.updated routes to sync: mirror status changes", async () => {
    const orgId = await seedOrg();
    const sub = subFor(orgId);
    await syncSubscription(app.db, sub, nextEpoch());

    const handlers = defaultBillingHandlers(makeDeps());
    await handlers["customer.subscription.updated"]!(
      fakeEvent(
        "customer.subscription.updated",
        subFor(orgId, { id: sub.id, status: "active" }),
      ),
    );
    expect((await adminSub(sub.id))?.status).toBe("active");
  });

  it("subscription.deleted with status canceled lands canceled", async () => {
    const orgId = await seedOrg();
    const sub = subFor(orgId);
    await syncSubscription(app.db, sub, nextEpoch());

    const canceledEpoch = PERIOD_END_EPOCH - 86_400;
    const handlers = defaultBillingHandlers(makeDeps());
    await handlers["customer.subscription.deleted"]!(
      fakeEvent(
        "customer.subscription.deleted",
        subFor(orgId, {
          id: sub.id,
          status: "canceled",
          canceled_at: canceledEpoch,
        }),
      ),
    );
    const row = await adminSub(sub.id);
    expect(row?.status).toBe("canceled");
    expect(row?.canceledAt?.getTime()).toBe(canceledEpoch * 1000);
  });
});

describe("stripe_events immutability", () => {
  it("app role UPDATE/DELETE is rejected or affects 0 rows", async () => {
    const store = new DbProcessedEventStore(app.db);
    const eventId = `evt_immutable_${uniq()}`;
    expect(await store.markProcessed(eventId, "test.event")).toBe(true);

    // UPDATE: either an outright grant/RLS rejection, or zero rows touched.
    try {
      await app.db
        .update(stripeEvents)
        .set({ type: "tampered" })
        .where(eq(stripeEvents.id, eventId));
    } catch (err) {
      expect(err).toSatisfy(isImmutabilityViolation);
    }
    // DELETE: same contract.
    try {
      await app.db.delete(stripeEvents).where(eq(stripeEvents.id, eventId));
    } catch (err) {
      expect(err).toSatisfy(isImmutabilityViolation);
    }

    // Whichever path fired, the row is intact under admin.
    const [row] = await admin.db
      .select()
      .from(stripeEvents)
      .where(eq(stripeEvents.id, eventId));
    expect(row).toMatchObject({ id: eventId, type: "test.event" });
  });
});
