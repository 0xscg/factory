/**
 * Evidence vault integration tests against real Postgres.
 *
 * Same two-connection setup as src/records/records.test.ts:
 *  - admin (superuser `factory`): migrations, truncation, RLS-bypassing
 *    assertions.
 *  - app (`app_login` in factory_app): all flows run here under RLS.
 *
 * IMPORTANT: evidence, audit_log and record_versions are append-only for
 * EVERY role (triggers block UPDATE/DELETE/TRUNCATE even for the owner),
 * so rows accumulate across tests. Every test uses fresh orgs/records and
 * scopes assertions by id/orgId. Object storage is stubbed with
 * MemoryObjectStore (plus DirObjectStore on a temp dir) — no R2.
 */
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, runMigrations, type DbHandle } from "../db/index.js";
import { withOrg } from "../db/client.js";
import { auditLog, evidence } from "../db/schema/index.js";
import type { MutationContext } from "../audit/mutate.js";
import {
  createOrgWithOwner,
  requestMagicLink,
  verifyMagicLink,
} from "../identity/index.js";
import type { MailSender } from "../identity/mail.js";
import {
  createRecord,
  defineEntity,
  RecordNotFoundError,
} from "../records/index.js";
import {
  attachEvidence,
  downloadEvidence,
  getEvidence,
  listEvidenceForRecord,
  sha256Hex,
  DirObjectStore,
  EvidenceIntegrityError,
  MemoryObjectStore,
  ObjectExistsError,
  ObjectNotFoundError,
  type ObjectStore,
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

/** Trigger raises "evidence is append-only" (SQLSTATE P0001). */
function isAppendOnlyViolation(err: unknown): boolean {
  for (let e = err; e instanceof Error; e = e.cause as Error) {
    if (/append-only/i.test(e.message)) return true;
  }
  return false;
}

/** App role may instead be stopped by missing grants (42501). */
function isImmutabilityViolation(err: unknown): boolean {
  if (isAppendOnlyViolation(err)) return true;
  for (let e = err; e instanceof Error; e = e.cause as Error) {
    if (/permission denied/i.test(e.message)) return true;
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

const buildUrl = (token: string) => `https://app.example/verify?t=${token}`;

async function loginUser(email: string): Promise<string> {
  const req = await requestMagicLink(app.db, email, buildUrl, mail);
  const verified = await verifyMagicLink(app.db, req.token);
  if (!verified) throw new Error("test setup: magic link verify failed");
  return verified.userId;
}

let seedCounter = 0;
/** Fresh org + owner per test; returns a MutationContext for the org. */
async function seedOrg(product = "wasteduty"): Promise<MutationContext> {
  const userId = await loginUser(
    `owner-${Date.now()}-${seedCounter++}-${Math.random()}@example.com`,
  );
  const { orgId } = await createOrgWithOwner(app.db, "Evidence Co", userId);
  return { orgId, product, actorUserId: userId };
}

const receipt = defineEntity(
  "waste_receipt",
  z.object({ carrier: z.string().min(1), tonnes: z.number().positive() }),
);

/** Fresh org + one record to hang evidence off. */
async function seedOrgWithRecord() {
  const ctx = await seedOrg();
  const record = await createRecord(app.db, ctx, receipt, {
    carrier: "Evidence Haulage",
    tonnes: 2,
  });
  return { ctx, record };
}

/** Audit rows for one org, read as admin, newest first. */
async function adminTrail(orgId: string) {
  return admin.db
    .select()
    .from(auditLog)
    .where(eq(auditLog.orgId, orgId))
    .orderBy(sql`${auditLog.createdAt} desc`);
}

/** Evidence rows for one org, read as admin (bypasses RLS). */
async function adminEvidence(orgId: string) {
  return admin.db.select().from(evidence).where(eq(evidence.orgId, orgId));
}

const PDF_BYTES = new TextEncoder().encode("%PDF-1.4 fake consignment note");

beforeAll(async () => {
  admin = createDb(ADMIN_URL);
  try {
    await admin.db.execute(sql`select 1`);
  } catch (err) {
    throw new Error(
      `Evidence tests need a reachable Postgres at ${ADMIN_URL} ` +
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
  // evidence, audit_log and record_versions deliberately NOT truncated —
  // they can't be. Fresh orgs per test + id-scoped assertions keep isolation.
  await admin.db.execute(sql`TRUNCATE users, orgs, records CASCADE`);
  mail = new FakeMailSender();
});

describe("attachEvidence happy path", () => {
  it("writes the row, stores the object under <orgId>/<evidenceId>, and audits", async () => {
    const { ctx, record } = await seedOrgWithRecord();
    const store = new MemoryObjectStore();

    const row = await attachEvidence(app.db, store, ctx, {
      recordId: record.id,
      filename: "consignment.pdf",
      contentType: "application/pdf",
      bytes: PDF_BYTES,
    });

    const expectedSha = createHash("sha256").update(PDF_BYTES).digest("hex");
    expect(row).toMatchObject({
      orgId: ctx.orgId,
      product: ctx.product,
      recordId: record.id,
      filename: "consignment.pdf",
      contentType: "application/pdf",
      sizeBytes: PDF_BYTES.length,
      sha256: expectedSha,
      storageKey: `${ctx.orgId}/${row.id}`,
      uploadedBy: ctx.actorUserId,
    });

    // Object landed under the storage key and round-trips byte-identical.
    expect(await store.exists(row.storageKey)).toBe(true);
    expect(await store.get(row.storageKey)).toEqual(PDF_BYTES);

    // Row is really in the DB (not just the returned value).
    const persisted = (await adminEvidence(ctx.orgId)).find(
      (r) => r.id === row.id,
    );
    expect(persisted).toMatchObject({ sha256: expectedSha });

    // One evidence.attached audit event with the after payload.
    const events = (await adminTrail(ctx.orgId)).filter(
      (r) => r.action === "evidence.attached",
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      product: ctx.product,
      actorUserId: ctx.actorUserId,
      entityType: "evidence",
      entityId: row.id,
      after: {
        recordId: record.id,
        filename: "consignment.pdf",
        sha256: expectedSha,
        sizeBytes: PDF_BYTES.length,
      },
    });
    expect(events[0]?.before).toBeNull();

    // Readable through the tenant API.
    await withOrg(app.db, ctx.orgId, async (tx) => {
      expect((await getEvidence(tx, row.id))?.id).toBe(row.id);
      expect(
        (await listEvidenceForRecord(tx, record.id)).map((r) => r.id),
      ).toEqual([row.id]);
    });
  });

  it("rejects an empty file before any write", async () => {
    const { ctx, record } = await seedOrgWithRecord();
    const store = new MemoryObjectStore();
    const trailBefore = await adminTrail(ctx.orgId);

    await expect(
      attachEvidence(app.db, store, ctx, {
        recordId: record.id,
        filename: "empty.pdf",
        contentType: "application/pdf",
        bytes: new Uint8Array(0),
      }),
    ).rejects.toThrow(/empty/);

    expect(await adminEvidence(ctx.orgId)).toEqual([]);
    expect(await adminTrail(ctx.orgId)).toHaveLength(trailBefore.length);
  });
});

describe("download integrity", () => {
  it("returns bytes identical to the upload", async () => {
    const { ctx, record } = await seedOrgWithRecord();
    const store = new MemoryObjectStore();
    const row = await attachEvidence(app.db, store, ctx, {
      recordId: record.id,
      filename: "consignment.pdf",
      contentType: "application/pdf",
      bytes: PDF_BYTES,
    });
    expect(await downloadEvidence(store, row)).toEqual(PDF_BYTES);
  });

  it("tampered stored content → EvidenceIntegrityError", async () => {
    const { ctx, record } = await seedOrgWithRecord();
    // Wrap the store so we can tamper (MemoryObjectStore refuses overwrite).
    const inner = new MemoryObjectStore();
    const row = await attachEvidence(app.db, inner, ctx, {
      recordId: record.id,
      filename: "consignment.pdf",
      contentType: "application/pdf",
      bytes: PDF_BYTES,
    });
    const tampered: ObjectStore = {
      put: (k, b) => inner.put(k, b),
      exists: (k) => inner.exists(k),
      get: async () => new TextEncoder().encode("altered after the fact"),
    };
    await expect(downloadEvidence(tampered, row)).rejects.toBeInstanceOf(
      EvidenceIntegrityError,
    );
  });

  it("missing object → ObjectNotFoundError", async () => {
    const { ctx, record } = await seedOrgWithRecord();
    const store = new MemoryObjectStore();
    const row = await attachEvidence(app.db, store, ctx, {
      recordId: record.id,
      filename: "consignment.pdf",
      contentType: "application/pdf",
      bytes: PDF_BYTES,
    });
    // Simulate object loss with an empty store and the same row.
    await expect(
      downloadEvidence(new MemoryObjectStore(), row),
    ).rejects.toBeInstanceOf(ObjectNotFoundError);
  });
});

describe("immutability (append-only for every role)", () => {
  async function seedEvidenceRow() {
    const { ctx, record } = await seedOrgWithRecord();
    const store = new MemoryObjectStore();
    const row = await attachEvidence(app.db, store, ctx, {
      recordId: record.id,
      filename: "consignment.pdf",
      contentType: "application/pdf",
      bytes: PDF_BYTES,
    });
    return { ctx, row };
  }

  it("UPDATE is blocked for the app role", async () => {
    const { ctx, row } = await seedEvidenceRow();
    await expect(
      withOrg(app.db, ctx.orgId, (tx) =>
        tx
          .update(evidence)
          .set({ sha256: "0".repeat(64) })
          .where(eq(evidence.id, row.id)),
      ),
    ).rejects.toSatisfy(isImmutabilityViolation);
  });

  it("DELETE is blocked for the app role", async () => {
    const { ctx, row } = await seedEvidenceRow();
    await expect(
      withOrg(app.db, ctx.orgId, (tx) =>
        tx.delete(evidence).where(eq(evidence.id, row.id)),
      ),
    ).rejects.toSatisfy(isImmutabilityViolation);
  });

  it("UPDATE is blocked even for the admin/superuser with the trigger message", async () => {
    const { row } = await seedEvidenceRow();
    await expect(
      admin.db
        .update(evidence)
        .set({ filename: "renamed.pdf" })
        .where(eq(evidence.id, row.id)),
    ).rejects.toSatisfy(isAppendOnlyViolation);
  });

  it("DELETE is blocked even for the admin/superuser, and the row survives", async () => {
    const { row } = await seedEvidenceRow();
    await expect(
      admin.db.delete(evidence).where(eq(evidence.id, row.id)),
    ).rejects.toSatisfy(isAppendOnlyViolation);
    const [survivor] = await admin.db
      .select()
      .from(evidence)
      .where(eq(evidence.id, row.id));
    expect(survivor).toBeDefined();
  });

  it("MemoryObjectStore.put refuses to overwrite an existing key", async () => {
    const store = new MemoryObjectStore();
    await store.put("org/ev", PDF_BYTES);
    await expect(store.put("org/ev", PDF_BYTES)).rejects.toBeInstanceOf(
      ObjectExistsError,
    );
    // Original bytes untouched.
    expect(await store.get("org/ev")).toEqual(PDF_BYTES);
  });

  it("DirObjectStore.put refuses to overwrite an existing key", async () => {
    const root = await mkdtemp(join(tmpdir(), "evidence-store-"));
    try {
      const store = new DirObjectStore(root);
      await store.put("org/ev", PDF_BYTES);
      await expect(
        store.put("org/ev", new TextEncoder().encode("other")),
      ).rejects.toBeInstanceOf(ObjectExistsError);
      expect(await store.get("org/ev")).toEqual(PDF_BYTES);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("DirObjectStore", () => {
  it("round-trips put/get and reports existence", async () => {
    const root = await mkdtemp(join(tmpdir(), "evidence-store-"));
    try {
      const store = new DirObjectStore(root);
      expect(await store.exists("org/file")).toBe(false);
      await store.put("org/file", PDF_BYTES);
      expect(await store.exists("org/file")).toBe(true);
      expect(await store.get("org/file")).toEqual(PDF_BYTES);
      await expect(store.get("org/missing")).rejects.toBeInstanceOf(
        ObjectNotFoundError,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects path-traversal keys", async () => {
    const root = await mkdtemp(join(tmpdir(), "evidence-store-"));
    try {
      const store = new DirObjectStore(root);
      await expect(store.put("../escape", PDF_BYTES)).rejects.toThrow(
        /escapes store root/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("atomicity", () => {
  it("attach to a nonexistent record → RecordNotFoundError, nothing written", async () => {
    const ctx = await seedOrg();
    const store = new MemoryObjectStore();
    const trailBefore = await adminTrail(ctx.orgId);

    await expect(
      attachEvidence(app.db, store, ctx, {
        recordId: "00000000-0000-4000-8000-000000000000",
        filename: "ghost.pdf",
        contentType: "application/pdf",
        bytes: PDF_BYTES,
      }),
    ).rejects.toBeInstanceOf(RecordNotFoundError);

    expect(await adminEvidence(ctx.orgId)).toEqual([]);
    expect(await adminTrail(ctx.orgId)).toHaveLength(trailBefore.length);
    // Nothing landed in the store under this org's prefix.
    for (const key of [`${ctx.orgId}`]) {
      expect(await store.exists(key)).toBe(false);
    }
  });

  it("store.put failure rolls back the DB row and the audit event", async () => {
    const { ctx, record } = await seedOrgWithRecord();
    const failing: ObjectStore = {
      async put() {
        throw new Error("simulated R2 outage");
      },
      async get() {
        throw new ObjectNotFoundError("none");
      },
      async exists() {
        return false;
      },
    };
    const trailBefore = await adminTrail(ctx.orgId);

    await expect(
      attachEvidence(app.db, failing, ctx, {
        recordId: record.id,
        filename: "consignment.pdf",
        contentType: "application/pdf",
        bytes: PDF_BYTES,
      }),
    ).rejects.toThrow(/simulated R2 outage/);

    expect(await adminEvidence(ctx.orgId)).toEqual([]);
    expect(await adminTrail(ctx.orgId)).toHaveLength(trailBefore.length);
  });
});

describe("tenancy (RLS)", () => {
  it("org B cannot see org A's evidence", async () => {
    const { ctx: ctxA, record } = await seedOrgWithRecord();
    const ctxB = await seedOrg();
    const store = new MemoryObjectStore();
    const row = await attachEvidence(app.db, store, ctxA, {
      recordId: record.id,
      filename: "consignment.pdf",
      contentType: "application/pdf",
      bytes: PDF_BYTES,
    });

    await withOrg(app.db, ctxB.orgId, async (tx) => {
      expect(await getEvidence(tx, row.id)).toBeNull();
      expect(await listEvidenceForRecord(tx, record.id)).toEqual([]);
    });

    // Own org still sees it.
    await withOrg(app.db, ctxA.orgId, async (tx) => {
      expect((await getEvidence(tx, row.id))?.sha256).toBe(row.sha256);
    });
  });

  it("attach under org B's context against org A's record fails, nothing written", async () => {
    const { record } = await seedOrgWithRecord();
    const ctxB = await seedOrg();
    const store = new MemoryObjectStore();

    // RLS hides org A's record from org B, so the lookup misses.
    await expect(
      attachEvidence(app.db, store, ctxB, {
        recordId: record.id,
        filename: "steal.pdf",
        contentType: "application/pdf",
        bytes: PDF_BYTES,
      }),
    ).rejects.toBeInstanceOf(RecordNotFoundError);

    expect(await adminEvidence(ctxB.orgId)).toEqual([]);
    const bTrail = (await adminTrail(ctxB.orgId)).filter(
      (r) => r.action === "evidence.attached",
    );
    expect(bTrail).toEqual([]);
  });
});

describe("sha256Hex", () => {
  it("matches an independently computed digest", () => {
    expect(sha256Hex(PDF_BYTES)).toBe(
      createHash("sha256").update(PDF_BYTES).digest("hex"),
    );
  });
});
