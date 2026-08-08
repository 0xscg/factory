import { defineSkin } from "@factory/config";
import {
  newCarrierOnboarding,
  quarterlyReview,
  receiptChecklist,
} from "./src/checklists";
import {
  carrierRegistrationExpiry,
  dwtMandate2026,
  twoWorkingDayRule,
} from "./src/deadlines";
import { siteRecord, wasteCarrier, wasteReceipt } from "./src/entities";

/**
 * WasteDuty — digital waste tracking records for small waste operators.
 * Consumed from docs/wasteduty-brief.md (VERIFIED 2026-08-08).
 */
export default defineSkin({
  id: "wasteduty",
  brand: {
    name: "WasteDuty",
    domain: "wasteduty.co.uk",
    theme: "green",
    footerText: "WasteDuty is a trading name of [Ltd], Co. no. XXXX",
    tagline:
      "Inspection-ready waste movement records before digital waste tracking becomes mandatory",
  },
  entities: [wasteReceipt, wasteCarrier, siteRecord],
  checklists: [receiptChecklist, quarterlyReview, newCarrierOnboarding],
  deadlines: [dwtMandate2026, twoWorkingDayRule, carrierRegistrationExpiry],
  reports: [
    {
      key: "inspection-pack",
      title: "Inspection-ready pack",
      entityTypes: ["waste_receipt", "waste_carrier", "site_record"],
    },
    {
      key: "movement-register",
      title: "Waste movement register",
      entityTypes: ["waste_receipt"],
    },
  ],
  adapter: "dwt-defra",
  pricing: { starter: 49, pro: 149 },
});
