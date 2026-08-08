import { defineDeadline } from "@factory/core/deadlines";

/**
 * WasteDuty deadline rules (skin brief). Obligation computation,
 * escalation, and notification are chassis behaviour.
 *
 * The brief's recurring quarterly_review deadline is deferred to Phase 3
 * (operator has not chosen the dates yet — "[operator choice of dates]").
 */

/**
 * Adds working days to a date, skipping Saturday/Sunday.
 * TODO(Phase 3): England bank holidays (gov.uk bank-holidays.json) —
 * weekends only for now; a movement landing before a bank holiday will
 * currently show a slightly earlier due date than legally required
 * (conservative, never late).
 */
export function addWorkingDays(start: Date, workingDays: number): Date {
  const d = new Date(start.getTime());
  let remaining = workingDays;
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) remaining -= 1;
  }
  return d;
}

/** Fixed statutory readiness deadline: DWT service mandatory 1 Oct 2026. */
export const dwtMandate2026 = defineDeadline({
  key: "dwt_mandate_2026",
  name: "Digital waste tracking becomes mandatory",
  citation:
    "Environment Act 2021 s.58; Waste (Miscellaneous Amendments) Regulations — DWT mandatory 1 October 2026",
  escalationDaysBefore: [90, 30, 7, 1],
  due: () => new Date(Date.UTC(2026, 9, 1)),
});

/** Relative: movement must be recorded in DWT within 2 working days. */
export const twoWorkingDayRule = defineDeadline({
  key: "two_working_day_rule",
  name: "Record waste movement in DWT service",
  citation:
    "Waste (Miscellaneous Amendments) Regulations — movement to be recorded within two working days; Duty of Care, EPA 1990 s.34",
  escalationDaysBefore: [1, 0],
  due: ({ record }) => {
    const transferDate = (record as { transferDate?: string } | undefined)
      ?.transferDate;
    if (!transferDate) return null;
    const start = new Date(`${transferDate}T00:00:00Z`);
    if (Number.isNaN(start.getTime())) return null;
    return addWorkingDays(start, 2);
  },
});

/** Relative: carrier registration expiry. */
export const carrierRegistrationExpiry = defineDeadline({
  key: "carrier_registration_expiry",
  name: "Waste carrier registration expires",
  citation:
    "Waste (England and Wales) Regulations 2011 — carrier/broker/dealer registration; Duty of Care, EPA 1990 s.34",
  escalationDaysBefore: [30, 7, 1],
  due: ({ record }) => {
    const expiryDate = (record as { expiryDate?: string } | undefined)
      ?.expiryDate;
    if (!expiryDate) return null;
    const due = new Date(`${expiryDate}T00:00:00Z`);
    return Number.isNaN(due.getTime()) ? null : due;
  },
});
