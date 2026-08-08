/**
 * Reporting module tests: pure HTML rendering, inspection-pack assembly
 * against real Postgres (same two-connection setup as
 * src/billing/subscriptions.test.ts / src/deadlines/deadlines.test.ts):
 *  - admin (superuser `factory`): migrations, truncation, RLS-bypassing
 *    assertions.
 *  - app (`app_login` in factory_app): all flows run here under RLS.
 *
 * PDF rendering is tested twice: through a fake PdfRenderer at the
 * boundary (injection contract), and one live Gotenberg round-trip
 * (container from compose.yaml) asserting the %PDF magic bytes.
 */
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createDb, runMigrations, type DbHandle } from "../db/index.js";
import { auditLog, orgs } from "../db/schema/index.js";
import type { MutationContext } from "../audit/mutate.js";
import {
  attachEvidence,
  MemoryObjectStore,
  sha256Hex,
} from "../evidence/index.js";
import {
  createRecord,
  defineEntity,
  softDeleteRecord,
} from "../records/index.js";
import {
  assembleInspectionPack,
  escapeHtml,
  generateInspectionPackPdf,
  GotenbergRenderer,
  renderInspectionPack,
  type InspectionPackData,
  type PdfRenderer,
} from "./index.js";

const ADMIN_URL =
  process.env.DATABASE_URL_TEST ??
  "postgres://factory:factory@localhost:5433/factory";

const APP_URL = (() => {
  const u = new URL(ADMIN_URL);
  u.username = "app_login";
  u.password = "app";
  return u.toString();
})();

const GOTENBERG_URL = process.env.GOTENBERG_URL ?? "http://localhost:3100";

let admin: DbHandle;
let app: DbHandle;

let seedCounter = 0;
/** Fresh org per test via admin insert (identity flow not needed here). */
async function seedOrg(): Promise<string> {
  const [row] = await admin.db
    .insert(orgs)
    .values({ name: `Reporting Co ${Date.now()}-${seedCounter++}` })
    .returning({ id: orgs.id });
  return row!.id;
}

const ctxFor = (orgId: string): MutationContext => ({
  orgId,
  product: "wasteduty",
});

// ---- entities & fixed instants ----
const wasteReceipt = defineEntity(
  "waste_receipt",
  z.object({ carrier: z.string(), ewcCode: z.string() }),
);
const siteRecord = defineEntity("site_record", z.object({ site: z.string() }));

const GENERATED_AT = new Date("2026-08-01T09:30:00.000Z");

const baseOpts = {
  title: "Inspection pack",
  orgName: "Acme Waste Ltd",
  entityTypes: [{ key: "waste_receipt", title: "Waste receipts" }],
  generatedAt: GENERATED_AT,
};

/** Minimal in-memory pack for pure-render tests (no DB). */
function fakePack(
  overrides: Partial<InspectionPackData> = {},
): InspectionPackData {
  return {
    title: "Inspection pack",
    orgName: "Acme Waste Ltd",
    footerText: undefined,
    generatedAt: GENERATED_AT,
    entityTypes: [{ key: "waste_receipt", title: "Waste receipts" }],
    records: [],
    evidence: [],
    audit: [],
    ...overrides,
  };
}

beforeAll(async () => {
  admin = createDb(ADMIN_URL);
  try {
    await admin.db.execute(sql`select 1`);
  } catch (err) {
    throw new Error(
      `Reporting tests need a reachable Postgres at ${ADMIN_URL} ` +
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

describe("escapeHtml", () => {
  it("escapes &, <, >, double and single quotes", () => {
    expect(escapeHtml(`Tom & Jerry <b>"bold"</b> 'q'`)).toBe(
      "Tom &amp; Jerry &lt;b&gt;&quot;bold&quot;&lt;/b&gt; &#39;q&#39;",
    );
  });

  it("null/undefined render as empty string", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
});

describe("renderInspectionPack (pure)", () => {
  const recordWith = (data: unknown) =>
    ({
      id: "11111111-2222-3333-4444-555555555555",
      orgId: "org",
      product: "wasteduty",
      entityType: "waste_receipt",
      version: 1,
      data,
      createdAt: GENERATED_AT,
      updatedAt: GENERATED_AT,
      createdBy: null,
      deletedAt: null,
    }) as InspectionPackData["records"][number];

  it("escapes record data values — an XSS attempt never appears raw", () => {
    const html = renderInspectionPack(
      fakePack({
        records: [recordWith({ carrier: `<script>alert(1)</script>` })],
      }),
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("renders the evidence SHA-256 in the evidence index", () => {
    const hash = sha256Hex(new TextEncoder().encode("evidence bytes"));
    const html = renderInspectionPack(
      fakePack({
        evidence: [
          {
            id: "ev-1",
            orgId: "org",
            product: "wasteduty",
            recordId: "11111111-2222-3333-4444-555555555555",
            filename: "receipt.pdf",
            contentType: "application/pdf",
            sizeBytes: 14,
            sha256: hash,
            storageKey: "org/ev-1",
            uploadedBy: null,
            createdAt: GENERATED_AT,
          } as InspectionPackData["evidence"][number],
        ],
      }),
    );
    expect(html).toContain(hash);
    expect(html).toContain("receipt.pdf");
  });

  it("empty sections render placeholders", () => {
    const html = renderInspectionPack(fakePack());
    expect(html).toContain("No records");
    expect(html).toContain("No evidence attached");
    expect(html).toContain("No events");
  });

  it("renders footerText", () => {
    const html = renderInspectionPack(
      fakePack({
        footerText:
          "WasteDuty is a trading name of Example Ltd, Co. no. 01234567",
      }),
    );
    expect(html).toContain(
      "WasteDuty is a trading name of Example Ltd, Co. no. 01234567",
    );
  });

  it("copy ban: never claims to ensure or guarantee compliance", () => {
    const html = renderInspectionPack(
      fakePack({ records: [recordWith({ carrier: "Acme" })] }),
    );
    expect(html).not.toMatch(/ensures compliance/i);
    expect(html).not.toMatch(/guarantees compliance/i);
  });
});

describe("assembleInspectionPack", () => {
  it("gathers only the requested entityTypes; deterministic generatedAt", async () => {
    const orgId = await seedOrg();
    const ctx = ctxFor(orgId);
    await createRecord(app.db, ctx, wasteReceipt, {
      carrier: "Acme Carriers",
      ewcCode: "20 03 01",
    });
    await createRecord(app.db, ctx, siteRecord, { site: "Depot 9" });

    const { data, html } = await assembleInspectionPack(app.db, ctx, baseOpts);
    expect(data.generatedAt).toEqual(GENERATED_AT);
    expect(data.records).toHaveLength(1);
    expect(data.records[0]?.entityType).toBe("waste_receipt");
    expect(html).toContain("Acme Carriers");
    expect(html).not.toContain("Depot 9"); // site_record not requested
  });

  it("excludes soft-deleted records", async () => {
    const orgId = await seedOrg();
    const ctx = ctxFor(orgId);
    const kept = await createRecord(app.db, ctx, wasteReceipt, {
      carrier: "Keep Ltd",
      ewcCode: "20 03 01",
    });
    const gone = await createRecord(app.db, ctx, wasteReceipt, {
      carrier: "Deleted Ltd",
      ewcCode: "20 03 07",
    });
    await softDeleteRecord(app.db, ctx, "waste_receipt", gone.id);

    const { data, html } = await assembleInspectionPack(app.db, ctx, baseOpts);
    expect(data.records.map((r) => r.id)).toEqual([kept.id]);
    expect(html).toContain("Keep Ltd");
    expect(html).not.toContain("Deleted Ltd");
  });

  it("evidence index covers only included records; audit extract present", async () => {
    const orgId = await seedOrg();
    const ctx = ctxFor(orgId);
    const store = new MemoryObjectStore();
    const receipt = await createRecord(app.db, ctx, wasteReceipt, {
      carrier: "Acme",
      ewcCode: "20 03 01",
    });
    const site = await createRecord(app.db, ctx, siteRecord, {
      site: "Depot 9",
    });

    const onPack = new TextEncoder().encode("weighbridge ticket");
    const offPack = new TextEncoder().encode("site plan");
    await attachEvidence(app.db, store, ctx, {
      recordId: receipt.id,
      filename: "ticket.pdf",
      contentType: "application/pdf",
      bytes: onPack,
    });
    await attachEvidence(app.db, store, ctx, {
      recordId: site.id,
      filename: "site-plan.pdf",
      contentType: "application/pdf",
      bytes: offPack,
    });

    const { data, html } = await assembleInspectionPack(app.db, ctx, baseOpts);
    expect(data.evidence).toHaveLength(1);
    expect(data.evidence[0]?.recordId).toBe(receipt.id);
    expect(html).toContain(sha256Hex(onPack));
    expect(html).not.toContain(sha256Hex(offPack));

    // Audit extract shows the mutations that produced the pack's contents.
    expect(data.audit.length).toBeGreaterThan(0);
    expect(data.audit.map((a) => a.action)).toContain("record.created");
    expect(html).toContain("Audit extract");
  });

  it('audits one "report.generated" event with counts in after', async () => {
    const orgId = await seedOrg();
    const ctx = ctxFor(orgId);
    await createRecord(app.db, ctx, wasteReceipt, {
      carrier: "Acme",
      ewcCode: "20 03 01",
    });

    await assembleInspectionPack(app.db, ctx, baseOpts);

    const events = await admin.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.orgId, orgId));
    const generated = events.filter((e) => e.action === "report.generated");
    expect(generated).toHaveLength(1);
    expect(generated[0]).toMatchObject({
      entityType: "report",
      entityId: "inspection-pack",
      after: {
        title: "Inspection pack",
        records: 1,
        evidence: 0,
        auditRows: 1, // the record.created event
        generatedAt: GENERATED_AT.toISOString(),
      },
    });
  });

  it("RLS: org B's pack contains none of org A's records or evidence", async () => {
    const orgA = await seedOrg();
    const orgB = await seedOrg();
    const store = new MemoryObjectStore();
    const ctxA = ctxFor(orgA);
    const secretBytes = new TextEncoder().encode("org A confidential manifest");
    const receiptA = await createRecord(app.db, ctxA, wasteReceipt, {
      carrier: "Org A Secret Carrier",
      ewcCode: "20 03 01",
    });
    await attachEvidence(app.db, store, ctxA, {
      recordId: receiptA.id,
      filename: "org-a-manifest.pdf",
      contentType: "application/pdf",
      bytes: secretBytes,
    });

    const { data, html } = await assembleInspectionPack(
      app.db,
      ctxFor(orgB),
      baseOpts,
    );
    expect(data.records).toEqual([]);
    expect(data.evidence).toEqual([]);
    expect(data.audit).toEqual([]);
    expect(html).not.toContain("Org A Secret Carrier");
    expect(html).not.toContain("org-a-manifest.pdf");
    expect(html).not.toContain(sha256Hex(secretBytes));
    expect(html).toContain("No records");
  });
});

describe("generateInspectionPackPdf", () => {
  it("passes the assembled HTML to the injected renderer and returns its bytes", async () => {
    const orgId = await seedOrg();
    const ctx = ctxFor(orgId);
    await createRecord(app.db, ctx, wasteReceipt, {
      carrier: "Acme",
      ewcCode: "20 03 01",
    });

    const rendered: string[] = [];
    const fakeBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const fake: PdfRenderer = {
      async render(html) {
        rendered.push(html);
        return fakeBytes;
      },
    };

    const out = await generateInspectionPackPdf(app.db, ctx, baseOpts, fake);
    expect(rendered).toEqual([out.html]);
    expect(out.pdf).toBe(fakeBytes);
    expect(out.html).toContain("Acme");
  });
});

describe("GotenbergRenderer (live container)", () => {
  beforeAll(async () => {
    try {
      await fetch(`${GOTENBERG_URL}/health`);
    } catch (err) {
      throw new Error(
        `GotenbergRenderer tests need a reachable Gotenberg at ${GOTENBERG_URL} ` +
          `(start it: podman compose up -d — see docs/local-dev.md). ` +
          `Underlying error: ${String(err)}`,
      );
    }
  });

  it("renders HTML to a real PDF (%PDF magic bytes)", async () => {
    const renderer = new GotenbergRenderer(GOTENBERG_URL);
    const pdf = await renderer.render(
      renderInspectionPack(fakePack({ footerText: "Test footer" })),
    );
    expect(pdf.length).toBeGreaterThan(4);
    expect(new TextDecoder().decode(pdf.slice(0, 4))).toBe("%PDF");
  });

  it("throws with the status on a non-ok response", async () => {
    // Point at a real server but a route Gotenberg 404s.
    const renderer = new GotenbergRenderer(
      `${GOTENBERG_URL}/nonexistent-route`,
    );
    await expect(renderer.render("<p>x</p>")).rejects.toThrow(
      /Gotenberg render failed \(404\)/,
    );
  });
});
