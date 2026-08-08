/**
 * Local-dev seed for WasteDuty: one demo org, a carrier, a site, three
 * receipts, one receipt checklist instance, and computed obligations.
 * Run with `pnpm --filter @factory/wasteduty seed` against local DB
 * (DATABASE_URL). Uses only chassis APIs — no direct SQL.
 */
import { createDb } from "@factory/core/db";
import { createOrgWithOwner, upsertUserByEmail } from "@factory/core/identity";
import { createRecord } from "@factory/core/records";
import { startChecklist } from "@factory/core/checklists";
import { computeObligation } from "@factory/core/deadlines";
import { receiptChecklist } from "./checklists";
import {
  carrierRegistrationExpiry,
  dwtMandate2026,
  twoWorkingDayRule,
} from "./deadlines";
import { siteRecord, wasteCarrier, wasteReceipt } from "./entities";

const PRODUCT = "wasteduty";

async function main() {
  const { db, client } = createDb();
  try {
    const owner = await upsertUserByEmail(db, "demo@wasteduty.local");
    const { orgId } = await createOrgWithOwner(
      db,
      "Demo Skip Hire Ltd",
      owner.id,
      PRODUCT,
    );
    const ctx = { orgId, product: PRODUCT, actorUserId: owner.id };
    const now = new Date();

    const carrier = await createRecord(db, ctx, wasteCarrier, {
      name: "Greenway Haulage",
      registrationNumber: "CBDU123456",
      expiryDate: "2027-03-31",
      verificationDate: "2026-08-01",
    });

    await createRecord(db, ctx, siteRecord, {
      name: "Demo Transfer Station",
      permitRef: "EPR/AB1234CD",
      permittedEwcCodes: ["17 01 01", "17 05 04", "20 03 01"],
      tonnageLimit: 5000,
      returnCadence: "quarterly",
    });

    const receipts = [
      {
        ewcCode: "17 01 01",
        description: "Concrete from demolition",
        quantityTonnes: 8.4,
        carrierRef: "CBDU123456",
        origin: "Site A, Leeds",
        destination: "Demo Transfer Station",
        transferDate: "2026-08-05",
      },
      {
        ewcCode: "17 05 04",
        description: "Soil and stones",
        quantityTonnes: 12.1,
        carrierRef: "CBDU123456",
        origin: "Site B, Bradford",
        destination: "Demo Transfer Station",
        transferDate: "2026-08-06",
        dwtSubmissionRef: "DWT-2026-000123",
      },
      {
        ewcCode: "20 03 01",
        description: "Mixed municipal waste",
        quantityTonnes: 3.2,
        carrierRef: "CBDU123456",
        origin: "Site C, Wakefield",
        destination: "Demo Transfer Station",
        transferDate: "2026-08-07",
      },
    ];

    const receiptRows = [];
    for (const r of receipts) {
      receiptRows.push(await createRecord(db, ctx, wasteReceipt, r));
    }

    // Checklist instance against the first (not-yet-submitted) receipt.
    const firstReceipt = receiptRows[0];
    if (firstReceipt) {
      await startChecklist(db, ctx, receiptChecklist, {
        recordId: firstReceipt.id,
      });
    }

    // Obligations: fixed mandate + per-record relative deadlines.
    await computeObligation(db, ctx, dwtMandate2026, { now });
    for (const row of receiptRows) {
      await computeObligation(db, ctx, twoWorkingDayRule, {
        now,
        record: { id: row.id, data: row.data },
      });
    }
    await computeObligation(db, ctx, carrierRegistrationExpiry, {
      now,
      record: { id: carrier.id, data: carrier.data },
    });

    console.log(`Seeded WasteDuty demo org ${orgId} (owner ${owner.email})`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
