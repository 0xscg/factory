/**
 * Org export tests: full-org JSON snapshot + evidence file streaming
 * against real Postgres (same two-connection setup as
 * src/reporting/reporting.test.ts):
 *  - admin (superuser `factory`): migrations, truncation, RLS-bypassing
 *    assertions.
 *  - app (`app_login` in factory_app): all flows run here under RLS.
 *
 * audit_log / auth_attempts are append-only and never truncated;
 * per-test orgs isolate every assertion.
 */
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createDb, type DbHandle } from "../db/index.js";
import { runMigrations } from "../db/migrate.js";
import { auditLog, orgs } from "../db/schema/index.js";
import type { MutationContext } from "../audit/mutate.js";
import { defineChecklist, startChecklist } from "../checklists/index.js";
import { computeObligation, defineDeadline } from "../deadlines/index.js";
import {
  attachEvidence,
  EvidenceIntegrityError,
  MemoryObjectStore,
  sha256Hex,
  type ObjectStore,
} from "../evidence/index.js";
import { createRecord, defineEntity, updateRecord } from "../records/index.js";
import { exportEvidenceFiles, exportOrg } from "./index.js";

const ADMIN_URL =
  process.env.DATABASE_URL_TEST ??
  "postgres://factory:factory@localhost:5433/factory";

const APP_URL = (() => {
  const u = new URL(ADMIN_URL);
  u.username = "app_login";
  u.password = "app";
  return u.toString();
})();

let admin: DbHandle;
let app: DbHandle;

let seedCounter = 0;
/** Fresh org per test via admin insert (identity flow not needed here). */
async function seedOrg(): Promise<string> {
  const [row] = await admin.db
    .insert(orgs)
    .values({ name: `Export Co ${Date.now()}-${seedCounter++}` })
    .returning({ id: orgs.id });
  return row!.id;
}

const ctxFor = (orgId: string, product = "wasteduty"): MutationContext => ({
  orgId,
  product,
});

// ---- fixtures ----
const wasteReceipt = defineEntity(
  "waste_receipt",
  z.object({ carrier: z.string(), ewcCode: z.string() }),
);
const siteRecord = defineEntity("site_record", z.object({ site: z.string() }));

const receiptChecklist = defineChecklist({
  key: "receipt_check",
  name: "Receipt check",
  steps: [
    {
      key: "weigh",
      title: "Record weighbridge ticket",
      requiresEvidence: false,
    },
    { key: "classify", title: "Confirm EWC code", requiresEvidence: false },
  ],
});

const NOW = new Date("2026-08-08T12:00:00.000Z");
const GENERATED_AT = new Date("2026-08-08T13:00:00.000Z");
const DWT_DUE = new Date("2026-10-01T00:00:00.000Z");

const dwtMandate = defineDeadline({
  key: "dwt_mandate_2026",
  name: "Digital waste tracking mandate",
  citation: "Environment Act 2021, s.58",
  escalationDaysBefore: [30, 7, 1],
  due: () => DWT_DUE,
});

beforeAll(async () => {
  admin = createDb(ADMIN_URL);
  try {
    await admin.db.execute(sql`select 1`);
  } catch (err) {
    throw new Error(
      `Export tests need a reachable Postgres at ${ADMIN_URL} ` +
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
  // audit_log is append-only and never truncated; per-test orgs isolate it.
  await admin.db.execute(sql`TRUNCATE users, orgs, records CASCADE`);
});

/** Seed a fully-populated org: 2 records (one updated), evidence, checklist, obligation. */
async function seedFullOrg(store: ObjectStore) {
  const orgId = await seedOrg();
  const ctx = ctxFor(orgId);
  const receipt = await createRecord(app.db, ctx, wasteReceipt, {
    carrier: "Acme Carriers",
    ewcCode: "20 03 01",
  });
  await updateRecord(app.db, ctx, wasteReceipt, receipt.id, receipt.version, {
    carrier: "Acme Carriers Ltd",
    ewcCode: "20 03 01",
  });
  const site = await createRecord(app.db, ctx, siteRecord, { site: "Depot 9" });
  const bytes = new TextEncoder().encode("weighbridge ticket");
  const ev = await attachEvidence(app.db, store, ctx, {
    recordId: receipt.id,
    filename: "ticket.pdf",
    contentType: "application/pdf",
    bytes,
  });
  const checklist = await startChecklist(app.db, ctx, receiptChecklist, {
    recordId: receipt.id,
  });
  const obligation = await computeObligation(app.db, ctx, dwtMandate, {
    now: NOW,
  });
  return {
    orgId,
    ctx,
    receipt,
    site,
    ev,
    evBytes: bytes,
    checklist,
    obligation,
  };
}

describe("exportOrg", () => {
  it("returns every section for a seeded org; generatedAt injected → deterministic", async () => {
    const store = new MemoryObjectStore();
    const seeded = await seedFullOrg(store);

    const exp = await exportOrg(app.db, seeded.ctx, {
      generatedAt: GENERATED_AT,
    });

    expect(exp.exportVersion).toBe(1);
    expect(exp.orgId).toBe(seeded.orgId);
    expect(exp.product).toBe("wasteduty");
    expect(exp.generatedAt).toBe(GENERATED_AT.toISOString());

    expect(exp.records).toHaveLength(2);
    expect(exp.records[0]).toMatchObject({
      id: seeded.receipt.id,
      entityType: "waste_receipt",
      version: 2,
      data: { carrier: "Acme Carriers Ltd", ewcCode: "20 03 01" },
    });
    expect(exp.records[1]).toMatchObject({
      id: seeded.site.id,
      entityType: "site_record",
    });

    // v1 (create) + v2 (update) for the receipt, v1 for the site record.
    expect(exp.recordVersions).toHaveLength(3);
    expect(exp.recordVersions).toContainEqual(
      expect.objectContaining({
        recordId: seeded.receipt.id,
        version: 1,
        data: { carrier: "Acme Carriers", ewcCode: "20 03 01" },
      }),
    );
    expect(exp.recordVersions).toContainEqual(
      expect.objectContaining({ recordId: seeded.receipt.id, version: 2 }),
    );

    expect(exp.evidenceIndex).toHaveLength(1);
    expect(exp.evidenceIndex[0]).toMatchObject({
      id: seeded.ev.id,
      recordId: seeded.receipt.id,
      filename: "ticket.pdf",
      sha256: sha256Hex(seeded.evBytes),
    });

    expect(exp.checklists).toHaveLength(1);
    expect(exp.checklists[0]).toMatchObject({
      id: seeded.checklist.id,
      templateKey: "receipt_check",
      recordId: seeded.receipt.id,
    });
    expect(exp.checklistSteps).toHaveLength(2);
    expect(exp.checklistSteps[0]).toMatchObject({
      stepKey: "weigh",
      position: 0,
    });
    expect(exp.checklistSteps[1]).toMatchObject({
      stepKey: "classify",
      position: 1,
    });

    expect(exp.obligations).toHaveLength(1);
    expect(exp.obligations[0]).toMatchObject({
      id: seeded.obligation?.id,
      ruleKey: "dwt_mandate_2026",
    });

    // Every seeding mutation appears in the trail, oldest first.
    const actions = exp.auditLog.map((e) => (e as { action: string }).action);
    expect(actions).toEqual([
      "record.created",
      "record.updated",
      "record.created",
      "evidence.attached",
      "checklist.started",
      "obligation.created",
    ]);

    // Same inputs, same injected clock → identical snapshot (deterministic).
    const again = await exportOrg(app.db, seeded.ctx, {
      generatedAt: GENERATED_AT,
    });
    expect(again.generatedAt).toBe(exp.generatedAt);
    expect(again.records).toEqual(exp.records);
    expect(again.recordVersions).toEqual(exp.recordVersions);
    expect(again.evidenceIndex).toEqual(exp.evidenceIndex);
  });

  it("product scoping: same-org rows of another product excluded — except the audit trail", async () => {
    const orgId = await seedOrg();
    const waste = ctxFor(orgId, "wasteduty");
    const carbon = ctxFor(orgId, "carbonduty");

    await createRecord(app.db, waste, wasteReceipt, {
      carrier: "Acme",
      ewcCode: "20 03 01",
    });
    // Same org, different product: records, checklist, obligation.
    const shipment = defineEntity(
      "cbam_shipment",
      z.object({ commodity: z.string() }),
    );
    await createRecord(app.db, carbon, shipment, { commodity: "steel" });
    await startChecklist(app.db, carbon, receiptChecklist);
    await computeObligation(app.db, carbon, dwtMandate, { now: NOW });

    const exp = await exportOrg(app.db, waste, { generatedAt: GENERATED_AT });

    expect(exp.records).toHaveLength(1);
    expect(exp.records[0]).toMatchObject({ entityType: "waste_receipt" });
    expect(exp.checklists).toEqual([]);
    expect(exp.checklistSteps).toEqual([]);
    expect(exp.obligations).toEqual([]);

    // The trail is the FULL org history, not product-filtered.
    const trail = exp.auditLog as { product: string; action: string }[];
    expect(trail.some((e) => e.product === "carbonduty")).toBe(true);
    expect(trail.map((e) => e.action)).toEqual([
      "record.created",
      "record.created",
      "checklist.started",
      "obligation.created",
    ]);
  });

  it("RLS: org B's export contains nothing of org A", async () => {
    const store = new MemoryObjectStore();
    const seeded = await seedFullOrg(store); // org A, fully populated
    const orgB = await seedOrg();

    const exp = await exportOrg(app.db, ctxFor(orgB), {
      generatedAt: GENERATED_AT,
    });

    expect(exp.orgId).toBe(orgB);
    expect(exp.records).toEqual([]);
    expect(exp.recordVersions).toEqual([]);
    expect(exp.evidenceIndex).toEqual([]);
    expect(exp.checklists).toEqual([]);
    expect(exp.checklistSteps).toEqual([]);
    expect(exp.obligations).toEqual([]);
    expect(exp.auditLog).toEqual([]);

    // Belt and braces: nothing in the JSON mentions org A's ids.
    const json = JSON.stringify(exp);
    expect(json).not.toContain(seeded.orgId);
    expect(json).not.toContain(seeded.receipt.id);
    expect(json).not.toContain(sha256Hex(seeded.evBytes));
  });

  it('audits one "org.exported" event with counts; the event replays in a later export', async () => {
    const store = new MemoryObjectStore();
    const seeded = await seedFullOrg(store);

    await exportOrg(app.db, seeded.ctx, { generatedAt: GENERATED_AT });

    const events = await admin.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.orgId, seeded.orgId));
    const exported = events.filter((e) => e.action === "org.exported");
    expect(exported).toHaveLength(1);
    expect(exported[0]).toMatchObject({
      entityType: "org",
      entityId: seeded.orgId,
      after: {
        records: 2,
        evidence: 1,
        auditRows: 6, // the six seeding mutations
        generatedAt: GENERATED_AT.toISOString(),
      },
    });

    // Replayability: a subsequent export's trail contains the export event.
    const second = await exportOrg(app.db, seeded.ctx, {
      generatedAt: GENERATED_AT,
    });
    const trail = second.auditLog as { action: string }[];
    expect(trail.filter((e) => e.action === "org.exported")).toHaveLength(1);
  });

  it("empty org exports cleanly: all sections empty, still audits", async () => {
    const orgId = await seedOrg();

    const exp = await exportOrg(app.db, ctxFor(orgId), {
      generatedAt: GENERATED_AT,
    });

    expect(exp.records).toEqual([]);
    expect(exp.recordVersions).toEqual([]);
    expect(exp.evidenceIndex).toEqual([]);
    expect(exp.checklists).toEqual([]);
    expect(exp.checklistSteps).toEqual([]);
    expect(exp.obligations).toEqual([]);
    expect(exp.auditLog).toEqual([]);

    const events = await admin.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.orgId, orgId));
    expect(events.map((e) => e.action)).toEqual(["org.exported"]);
    expect(events[0]?.after).toMatchObject({
      records: 0,
      evidence: 0,
      auditRows: 0,
    });
  });
});

describe("exportEvidenceFiles", () => {
  it("streams every file to the sink with correct bytes and sha256", async () => {
    const store = new MemoryObjectStore();
    const orgId = await seedOrg();
    const ctx = ctxFor(orgId);
    const receipt = await createRecord(app.db, ctx, wasteReceipt, {
      carrier: "Acme",
      ewcCode: "20 03 01",
    });
    const first = new TextEncoder().encode("weighbridge ticket");
    const second = new TextEncoder().encode("transfer note");
    const evA = await attachEvidence(app.db, store, ctx, {
      recordId: receipt.id,
      filename: "ticket.pdf",
      contentType: "application/pdf",
      bytes: first,
    });
    const evB = await attachEvidence(app.db, store, ctx, {
      recordId: receipt.id,
      filename: "note.pdf",
      contentType: "application/pdf",
      bytes: second,
    });

    const received: {
      evidenceId: string;
      filename: string;
      sha256: string;
      bytes: Uint8Array;
    }[] = [];
    const out = await exportEvidenceFiles(app.db, ctx, store, async (file) => {
      received.push(file);
    });

    expect(out).toEqual({ exported: 2 });
    expect(received.map((f) => f.evidenceId)).toEqual([evA.id, evB.id]);
    expect(received[0]).toMatchObject({
      filename: "ticket.pdf",
      sha256: sha256Hex(first),
    });
    expect(received[0]?.bytes).toEqual(first);
    expect(received[1]).toMatchObject({
      filename: "note.pdf",
      sha256: sha256Hex(second),
    });
    expect(received[1]?.bytes).toEqual(second);
    // Sink bytes actually verify against the recorded hash.
    for (const f of received) expect(sha256Hex(f.bytes)).toBe(f.sha256);
  });

  it("RLS: org B's export streams none of org A's files", async () => {
    const store = new MemoryObjectStore();
    const seeded = await seedFullOrg(store);
    const orgB = await seedOrg();

    const received: string[] = [];
    const out = await exportEvidenceFiles(
      app.db,
      ctxFor(orgB),
      store,
      async (file) => {
        received.push(file.evidenceId);
      },
    );
    expect(out).toEqual({ exported: 0 });
    expect(received).toEqual([]);
    expect(seeded.ev.id).toBeTruthy(); // org A's file exists, just invisible
  });

  it("tampered store bytes → hash mismatch error propagates, sink never sees them", async () => {
    const inner = new MemoryObjectStore();
    const orgId = await seedOrg();
    const ctx = ctxFor(orgId);
    const receipt = await createRecord(app.db, ctx, wasteReceipt, {
      carrier: "Acme",
      ewcCode: "20 03 01",
    });
    await attachEvidence(app.db, inner, ctx, {
      recordId: receipt.id,
      filename: "ticket.pdf",
      contentType: "application/pdf",
      bytes: new TextEncoder().encode("original bytes"),
    });

    // MemoryObjectStore refuses overwrite (immutable), so tamper via a
    // wrapper that returns wrong bytes on read.
    const tampered: ObjectStore = {
      put: (key, bytes) => inner.put(key, bytes),
      exists: (key) => inner.exists(key),
      get: async () => new TextEncoder().encode("swapped-in forgery"),
    };

    const received: string[] = [];
    await expect(
      exportEvidenceFiles(app.db, ctx, tampered, async (file) => {
        received.push(file.evidenceId);
      }),
    ).rejects.toThrow(EvidenceIntegrityError);
    expect(received).toEqual([]);
  });
});
