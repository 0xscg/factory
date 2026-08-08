import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import skin from "../skin.config";
import {
  newCarrierOnboarding,
  quarterlyReview,
  receiptChecklist,
} from "./checklists";
import {
  addWorkingDays,
  carrierRegistrationExpiry,
  dwtMandate2026,
  twoWorkingDayRule,
} from "./deadlines";
import {
  siteRecordSchema,
  wasteCarrierSchema,
  wasteReceiptSchema,
  type SiteRecord,
  type WasteCarrier,
  type WasteReceipt,
} from "./entities";

const BANNED_COPY = /(ensur|guarantee)\w*\s+(\w+\s+){0,3}compliance/i;
const appDir = dirname(dirname(fileURLToPath(import.meta.url)));

// Fixed clocks — deadline due() must never read the wall clock.
const NOW_A = new Date(Date.UTC(2026, 0, 15));
const NOW_B = new Date(Date.UTC(2027, 5, 30));

describe("skin.config", () => {
  // Importing the config already executed defineSkin's validation;
  // reaching this test proves it parsed.
  it("passes defineSkin validation with the briefed identity", () => {
    expect(skin.id).toBe("wasteduty");
    expect(skin.pricing).toEqual({ starter: 49, pro: 149 });
    expect(skin.brand.footerText).toBe(
      "WasteDuty is a trading name of [Ltd], Co. no. XXXX",
    );
  });

  it("every report references only declared entity types", () => {
    const declared = new Set(skin.entities.map((e) => e.type));
    expect(skin.reports.length).toBeGreaterThan(0);
    for (const report of skin.reports) {
      for (const entityType of report.entityTypes) {
        expect(declared).toContain(entityType);
      }
    }
  });

  it("tagline and landing copy avoid the banned ensure/guarantee-compliance claim", () => {
    expect(skin.brand.tagline).toBeTruthy();
    expect(skin.brand.tagline).not.toMatch(BANNED_COPY);
    const landing = readFileSync(join(appDir, "app", "page.tsx"), "utf8");
    expect(landing).not.toMatch(BANNED_COPY);
  });
});

describe("waste_receipt schema", () => {
  const valid: WasteReceipt = {
    ewcCode: "17 09 04",
    description: "Mixed construction and demolition waste",
    quantityTonnes: 3.2,
    carrierRef: "CBDU123456",
    origin: "Site A, Leeds",
    destination: "Transfer station, Bradford",
    transferDate: "2026-08-07",
  };

  it("accepts a valid receipt", () => {
    expect(wasteReceiptSchema.parse(valid)).toEqual(valid);
  });

  it('accepts EWC "17 09 04" but rejects unspaced and hyphenated forms', () => {
    expect(wasteReceiptSchema.safeParse(valid).success).toBe(true);
    for (const bad of ["170904", "17-09-04"]) {
      const result = wasteReceiptSchema.safeParse({ ...valid, ewcCode: bad });
      expect(result.success).toBe(false);
    }
  });

  it("rejects zero and negative tonnages", () => {
    for (const quantityTonnes of [0, -1.5]) {
      const result = wasteReceiptSchema.safeParse({ ...valid, quantityTonnes });
      expect(result.success).toBe(false);
    }
  });
});

describe("waste_carrier schema", () => {
  const valid: WasteCarrier = {
    name: "Acme Haulage Ltd",
    registrationNumber: "CBDU123456",
    expiryDate: "2027-03-31",
    verificationDate: "2026-08-01",
  };

  it("accepts CBDU and CBDL registrations", () => {
    expect(wasteCarrierSchema.safeParse(valid).success).toBe(true);
    expect(
      wasteCarrierSchema.safeParse({ ...valid, registrationNumber: "CBDL9876" })
        .success,
    ).toBe(true);
  });

  it("rejects bad prefixes and malformed registrations", () => {
    for (const registrationNumber of ["CBDX123456", "ABCU123456", "CBDU12"]) {
      expect(
        wasteCarrierSchema.safeParse({ ...valid, registrationNumber }).success,
      ).toBe(false);
    }
  });
});

describe("site_record schema", () => {
  const valid: SiteRecord = {
    name: "Bradford transfer station",
    permitRef: "EPR/AB1234CD",
    permittedEwcCodes: ["17 09 04", "17 01 01"],
    tonnageLimit: 5000,
    returnCadence: "quarterly",
  };

  it("accepts both cadence values and rejects others", () => {
    expect(siteRecordSchema.safeParse(valid).success).toBe(true);
    expect(
      siteRecordSchema.safeParse({ ...valid, returnCadence: "annual" }).success,
    ).toBe(true);
    expect(
      siteRecordSchema.safeParse({ ...valid, returnCadence: "monthly" })
        .success,
    ).toBe(false);
  });

  it("validates every permitted EWC code and requires at least one", () => {
    expect(
      siteRecordSchema.safeParse({
        ...valid,
        permittedEwcCodes: ["17 09 04", "170101"],
      }).success,
    ).toBe(false);
    expect(
      siteRecordSchema.safeParse({ ...valid, permittedEwcCodes: [] }).success,
    ).toBe(false);
  });
});

describe("dwt_mandate_2026", () => {
  it("is due 1 October 2026 regardless of now", () => {
    const expected = Date.UTC(2026, 9, 1);
    expect(dwtMandate2026.due({ now: NOW_A })?.getTime()).toBe(expected);
    expect(dwtMandate2026.due({ now: NOW_B })?.getTime()).toBe(expected);
  });

  it("escalates at 90, 30, 7, 1 days before, in that order", () => {
    expect(dwtMandate2026.escalationDaysBefore).toEqual([90, 30, 7, 1]);
  });
});

describe("addWorkingDays", () => {
  const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

  it("Friday + 2 working days lands on Tuesday", () => {
    // Fri 7 Aug 2026 → Tue 11 Aug 2026
    expect(addWorkingDays(utc(2026, 7, 7), 2)).toEqual(utc(2026, 7, 11));
  });

  it("Saturday and Sunday starts both land on Tuesday", () => {
    expect(addWorkingDays(utc(2026, 7, 8), 2)).toEqual(utc(2026, 7, 11));
    expect(addWorkingDays(utc(2026, 7, 9), 2)).toEqual(utc(2026, 7, 11));
  });

  it("Monday + 2 working days lands on Wednesday", () => {
    expect(addWorkingDays(utc(2026, 7, 10), 2)).toEqual(utc(2026, 7, 12));
  });

  it("skips a weekend falling mid-window", () => {
    // Thu 6 Aug 2026 + 2 → Mon 10 Aug 2026
    expect(addWorkingDays(utc(2026, 7, 6), 2)).toEqual(utc(2026, 7, 10));
  });
});

describe("two_working_day_rule", () => {
  it("due is two working days after the transfer date", () => {
    const due = twoWorkingDayRule.due({
      now: NOW_A,
      record: { transferDate: "2026-08-07" }, // Friday
    });
    expect(due).toEqual(new Date(Date.UTC(2026, 7, 11))); // Tuesday
  });

  it("returns null when the record lacks a transferDate", () => {
    expect(twoWorkingDayRule.due({ now: NOW_A, record: {} })).toBeNull();
    expect(twoWorkingDayRule.due({ now: NOW_A })).toBeNull();
  });
});

describe("carrier_registration_expiry", () => {
  it("due equals the registration expiry date", () => {
    const due = carrierRegistrationExpiry.due({
      now: NOW_A,
      record: { expiryDate: "2027-03-31" },
    });
    expect(due).toEqual(new Date(Date.UTC(2027, 2, 31)));
  });

  it("returns null without an expiry date", () => {
    expect(
      carrierRegistrationExpiry.due({ now: NOW_A, record: {} }),
    ).toBeNull();
    expect(carrierRegistrationExpiry.due({ now: NOW_A })).toBeNull();
  });
});

describe("checklists", () => {
  // Importing the module already executed defineChecklist's parsing.
  const templates = [receiptChecklist, quarterlyReview, newCarrierOnboarding];

  it("all three templates parsed via defineChecklist", () => {
    expect(templates.map((t) => t.key)).toEqual([
      "receipt_checklist",
      "quarterly_review",
      "new_carrier_onboarding",
    ]);
    for (const template of templates) {
      expect(template.steps.length).toBeGreaterThan(0);
    }
  });

  it("receipt checklist gates carrier verification and ticket photo on evidence", () => {
    const step = (key: string) =>
      receiptChecklist.steps.find((s) => s.key === key);
    expect(step("carrier_verified")?.requiresEvidence).toBe(true);
    expect(step("ticket_photo_attached")?.requiresEvidence).toBe(true);
  });

  it("step keys are unique within each template", () => {
    for (const template of templates) {
      const keys = template.steps.map((s) => s.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
