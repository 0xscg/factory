import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineChecklist } from "@factory/core/checklists";
import { defineDeadline } from "@factory/core/deadlines";
import { defineEntity } from "@factory/core/records";
import { defineSkin, deadlineRules, type SkinConfigInput } from "./index.js";

const wasteReceipt = defineEntity(
  "waste_receipt",
  z.object({ reference: z.string(), tonnage: z.number().positive() }),
);
const siteRecord = defineEntity(
  "site_record",
  z.object({ address: z.string() }),
);

const receiptChecklist = defineChecklist({
  key: "receipt_checklist",
  name: "Receipt checklist",
  steps: [
    { key: "carrier_licence", title: "Check carrier licence" },
    {
      key: "attach_ticket",
      title: "Attach weighbridge ticket",
      requiresEvidence: true,
    },
  ],
});

const dwtMandate = defineDeadline({
  key: "dwt_mandate_2026",
  name: "Digital waste tracking mandate",
  citation: "Environment Act 2021, s.58",
  escalationDaysBefore: [30, 7, 1, 0],
  due: () => new Date("2026-10-01T00:00:00Z"),
});

function validInput(): SkinConfigInput {
  return {
    id: "wasteduty",
    brand: {
      name: "WasteDuty",
      domain: "wasteduty.co.uk",
      theme: "green",
      footerText: "WasteDuty is a trading name of Example Ltd, Co. no. 1234567",
      tagline: "Audit-ready waste records",
    },
    entities: [wasteReceipt, siteRecord],
    checklists: [receiptChecklist],
    deadlines: [dwtMandate],
    reports: [
      {
        key: "inspection-pack",
        title: "Inspection pack",
        entityTypes: ["waste_receipt", "site_record"],
      },
    ],
    adapter: "dwt-defra",
    pricing: { starter: 49, pro: 149 },
  };
}

describe("defineSkin", () => {
  it("accepts a valid skin and freezes the result", () => {
    const skin = defineSkin(validInput());
    expect(skin.id).toBe("wasteduty");
    expect(skin.brand.domain).toBe("wasteduty.co.uk");
    expect(skin.entities.map((e) => e.type)).toEqual([
      "waste_receipt",
      "site_record",
    ]);
    expect(Object.isFrozen(skin)).toBe(true);
  });

  it.each(["WasteDuty", "waste-duty"])("rejects skin id %j", (id) => {
    expect(() => defineSkin({ ...validInput(), id })).toThrow();
  });

  it.each(["https://wasteduty.co.uk", "wasteduty.co.uk/app", "wasteduty"])(
    "rejects non-bare-hostname domain %j",
    (domain) => {
      const input = validInput();
      input.brand = { ...input.brand, domain };
      expect(() => defineSkin(input)).toThrow();
    },
  );

  it("requires the trading-name line in footerText", () => {
    const input = validInput();
    input.brand = { ...input.brand, footerText: "© 2026 WasteDuty" };
    expect(() => defineSkin(input)).toThrow(/trading name/i);
  });

  describe("copy ban", () => {
    it.each([
      "WasteDuty ensures compliance",
      "Ensures Compliance for waste sites",
      "guarantees compliance with EA rules",
    ])("rejects brand.name %j", (name) => {
      const input = validInput();
      input.brand = { ...input.brand, name };
      expect(() => defineSkin(input)).toThrow(/copy ban/i);
    });

    it("rejects a banned tagline (any case)", () => {
      const input = validInput();
      input.brand = {
        ...input.brand,
        tagline: "GUARANTEES COMPLIANCE overnight",
      };
      expect(() => defineSkin(input)).toThrow(/copy ban/i);
    });

    it("rejects a banned report title", () => {
      const input = validInput();
      input.reports = [
        {
          key: "pack",
          title: "Ensures compliance pack",
          entityTypes: ["waste_receipt"],
        },
      ];
      expect(() => defineSkin(input)).toThrow(/copy ban/i);
    });

    it("allows the approved vocabulary", () => {
      const input = validInput();
      input.brand = {
        ...input.brand,
        tagline: "Inspection-ready evidence and records",
      };
      expect(() => defineSkin(input)).not.toThrow();
    });
  });

  it.each([
    { starter: 0, pro: 149 },
    { starter: -49, pro: 149 },
    { starter: 49.5, pro: 149 },
    { starter: 49, pro: 0 },
  ])("rejects pricing %j", (pricing) => {
    expect(() => defineSkin({ ...validInput(), pricing })).toThrow();
  });

  it("rejects duplicate entity types, naming the skin", () => {
    const input = validInput();
    input.entities = [
      wasteReceipt,
      defineEntity("waste_receipt", z.object({})),
    ];
    expect(() => defineSkin(input)).toThrow(
      "skin wasteduty: duplicate entity type waste_receipt",
    );
  });

  it("rejects duplicate checklist keys, naming the skin", () => {
    const input = validInput();
    input.checklists = [
      receiptChecklist,
      defineChecklist({
        key: "receipt_checklist",
        name: "Other",
        steps: [{ key: "s1", title: "Step" }],
      }),
    ];
    expect(() => defineSkin(input)).toThrow(
      "skin wasteduty: duplicate checklist key receipt_checklist",
    );
  });

  it("rejects duplicate deadline keys, naming the skin", () => {
    const input = validInput();
    input.deadlines = [
      dwtMandate,
      defineDeadline({
        key: "dwt_mandate_2026",
        name: "Copy",
        citation: "n/a",
        escalationDaysBefore: [7],
        due: () => null,
      }),
    ];
    expect(() => defineSkin(input)).toThrow(
      "skin wasteduty: duplicate deadline key dwt_mandate_2026",
    );
  });

  it("rejects a report referencing an unknown entity type", () => {
    const input = validInput();
    input.reports = [
      {
        key: "register",
        title: "Movement register",
        entityTypes: ["carrier_record"],
      },
    ];
    expect(() => defineSkin(input)).toThrow(
      "skin wasteduty: report register references unknown entity type carrier_record",
    );
  });
});

describe("deadlineRules", () => {
  it("returns the skin's deadline defs keyed by key", () => {
    const skin = defineSkin(validInput());
    const rules = deadlineRules(skin);
    expect(Object.keys(rules)).toEqual(["dwt_mandate_2026"]);
    expect(rules.dwt_mandate_2026).toBe(dwtMandate);
    expect(
      rules.dwt_mandate_2026?.due({ now: new Date("2026-08-08T00:00:00Z") }),
    ).toEqual(new Date("2026-10-01T00:00:00Z"));
  });
});
