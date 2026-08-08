/**
 * RLS / tenancy integration tests against real Postgres.
 *
 * Requires the local dev database (docs/local-dev.md) or a CI postgres
 * service reachable at DATABASE_URL_TEST. These tests FAIL (never skip)
 * when the database is unreachable — tenancy proof must not silently
 * disappear from the suite.
 *
 * Two connections:
 *  - admin: the superuser (`factory`) — runs migrations, seeds/cleans data,
 *    and BYPASSES RLS (superusers always do).
 *  - app: LOGIN role `app_login` inheriting NOLOGIN `factory_app` — the
 *    role shape production must use; RLS is enforced here.
 */
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createDb,
  orgs,
  withOrg,
  type DbHandle,
} from "./index.js";
import { runMigrations } from "./migrate.js";

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
 * Drizzle wraps the pg error ("Failed query: ..."); the RLS violation
 * (SQLSTATE 42501, "violates row-level security policy") lives on the
 * cause chain. Walk it so we assert the *reason*, not just any failure.
 */
function isRlsViolation(err: unknown): boolean {
  for (let e = err; e instanceof Error; e = e.cause as Error) {
    if (/row-level security/i.test(e.message)) return true;
    if ((e as { code?: string }).code === "42501") return true;
  }
  return false;
}

let admin: DbHandle;
let app: DbHandle;

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";

beforeAll(async () => {
  admin = createDb(ADMIN_URL);
  try {
    await admin.db.execute(sql`select 1`);
  } catch (err) {
    throw new Error(
      `RLS tests need a reachable Postgres at ${ADMIN_URL} ` +
        `(start it: podman compose up -d — see docs/local-dev.md). ` +
        `Underlying error: ${String(err)}`,
    );
  }
  await runMigrations(admin.db);
  // Idempotently create the LOGIN role the app connects as, inheriting
  // the migration-created NOLOGIN factory_app grants.
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
  await admin.db.execute(sql`TRUNCATE orgs CASCADE`);
  await admin.db.insert(orgs).values([
    { id: ORG_A, name: "Org A" },
    { id: ORG_B, name: "Org B" },
  ]);
});

describe("RLS tenant isolation (app role)", () => {
  it("org A sees only its own row; org B only its own", async () => {
    const seenByA = await withOrg(app.db, ORG_A, (tx) =>
      tx.select().from(orgs),
    );
    expect(seenByA.map((o) => o.id)).toEqual([ORG_A]);

    const seenByB = await withOrg(app.db, ORG_B, (tx) =>
      tx.select().from(orgs),
    );
    expect(seenByB.map((o) => o.id)).toEqual([ORG_B]);
  });

  it("a session with no org context sees nothing", async () => {
    const rows = await app.db.select().from(orgs);
    expect(rows).toEqual([]);
  });

  it("a session with no org context cannot insert", async () => {
    await expect(
      app.db.insert(orgs).values({ name: "spoof" }),
    ).rejects.toSatisfy(isRlsViolation);
    // and nothing landed
    const count = await admin.db.select().from(orgs);
    expect(count).toHaveLength(2);
  });

  it("WITH CHECK blocks a spoofed insert (org A ctx inserting org B's id)", async () => {
    await expect(
      withOrg(app.db, ORG_A, (tx) =>
        tx.insert(orgs).values({ id: ORG_B, name: "spoofed B" }),
      ),
    ).rejects.toSatisfy(isRlsViolation);
    const count = await admin.db.select().from(orgs);
    expect(count).toHaveLength(2);
  });

  it("org A updating org B's row affects 0 rows (invisible under USING)", async () => {
    const updated = await withOrg(app.db, ORG_A, (tx) =>
      tx
        .update(orgs)
        .set({ name: "hijacked" })
        .where(sql`${orgs.id} = ${ORG_B}`)
        .returning(),
    );
    expect(updated).toEqual([]);
    // B's row untouched (verified as admin, which bypasses RLS)
    const [b] = await admin.db
      .select()
      .from(orgs)
      .where(sql`${orgs.id} = ${ORG_B}`);
    expect(b?.name).toBe("Org B");
  });

  it("empty-string org context behaves like no context (NULLIF reset case)", async () => {
    // withOrg rejects non-UUIDs up front, so set the empty string directly —
    // this is exactly the state a connection is in after a local set_config
    // resets at transaction end.
    const rows = await app.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.org_id', '', true)`);
      return tx.select().from(orgs);
    });
    expect(rows).toEqual([]);
  });

  it("withOrg rejects a non-UUID orgId before touching the DB", async () => {
    await expect(
      withOrg(app.db, "not-a-uuid", (tx) => tx.select().from(orgs)),
    ).rejects.toThrow(/not a UUID/);
  });

  it("sequential withOrg calls on the same pool do not leak context", async () => {
    const asA = await withOrg(app.db, ORG_A, (tx) => tx.select().from(orgs));
    expect(asA.map((o) => o.id)).toEqual([ORG_A]);

    // set_config(..., local=true) dies with the transaction: the same
    // pooled connection must now see nothing.
    const after = await app.db.select().from(orgs);
    expect(after).toEqual([]);

    const asB = await withOrg(app.db, ORG_B, (tx) => tx.select().from(orgs));
    expect(asB.map((o) => o.id)).toEqual([ORG_B]);
  });
});

describe("superuser vs app role", () => {
  it("documents that the admin/superuser connection BYPASSES RLS — deploys must connect as the app role", async () => {
    // Same query, no org context: admin sees everything, app sees nothing.
    const adminRows = await admin.db.select().from(orgs);
    expect(adminRows).toHaveLength(2);

    const appRows = await app.db.select().from(orgs);
    expect(appRows).toEqual([]);
  });
});
