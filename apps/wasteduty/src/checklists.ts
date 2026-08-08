import { defineChecklist } from "@factory/core/checklists";

/**
 * WasteDuty checklist templates (skin brief). Instances, evidence
 * gating, and sign-off are chassis behaviour.
 */

/** Per-movement checklist, started against a waste_receipt record. */
export const receiptChecklist = defineChecklist({
  key: "receipt_checklist",
  name: "Waste movement receipt checklist",
  steps: [
    {
      key: "carrier_verified",
      title: "Carrier registration verified against the EA public register",
      requiresEvidence: true,
    },
    { key: "ewc_assigned", title: "EWC code assigned to the movement" },
    { key: "quantities_recorded", title: "Quantities recorded (tonnes)" },
    {
      key: "ticket_photo_attached",
      title: "Transfer ticket photo attached as evidence",
      requiresEvidence: true,
    },
    {
      key: "dwt_recorded",
      title: "Movement recorded in the DWT service within two working days",
    },
  ],
});

export const quarterlyReview = defineChecklist({
  key: "quarterly_review",
  name: "Quarterly duty-of-care review",
  steps: [
    {
      key: "carrier_registrations_valid",
      title: "All carrier registrations still valid on the EA register",
      requiresEvidence: true,
    },
    { key: "permit_conditions_reviewed", title: "Permit conditions reviewed" },
    {
      key: "register_reconciled",
      title: "Movement register reconciled against site records",
    },
    {
      key: "evidence_complete",
      title: "Evidence complete for all movements in the quarter",
    },
  ],
});

export const newCarrierOnboarding = defineChecklist({
  key: "new_carrier_onboarding",
  name: "New carrier onboarding",
  steps: [
    {
      key: "registration_lookup",
      title: "EA registration lookup completed and saved as evidence",
      requiresEvidence: true,
    },
    {
      key: "insurance_checked",
      title: "Insurance certificate received and checked",
      requiresEvidence: true,
    },
    {
      key: "expiry_reminder_set",
      title: "Registration expiry reminder set",
    },
  ],
});
