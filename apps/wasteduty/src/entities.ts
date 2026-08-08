import { z } from "zod";
import { defineEntity } from "@factory/core/records";

/**
 * WasteDuty core record types (skin brief, docs/wasteduty-brief.md).
 * Pure Zod configuration — validation/versioning/audit all chassis.
 */

/** EWC code, List of Wastes format: "NN NN NN" (e.g. "17 01 01"). */
export const ewcCode = z
  .string()
  .regex(/^\d{2} \d{2} \d{2}$/, 'EWC code must be "NN NN NN", e.g. "17 01 01"');

/** ISO date (yyyy-mm-dd) — record data is stored as JSON. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be yyyy-mm-dd");

export const wasteReceiptSchema = z.object({
  ewcCode,
  description: z.string().min(1),
  // Cap catches kg-entered-as-tonnes fat fingers; largest UK bulk
  // movements are well under this.
  quantityTonnes: z.number().positive().max(1000),
  carrierRef: z.string().min(1),
  origin: z.string().min(1),
  destination: z.string().min(1),
  transferDate: isoDate,
  /** DWT service submission reference — set once recorded with DEFRA. */
  dwtSubmissionRef: z.string().min(1).optional(),
  // --- DWT Receipt-of-Waste submission fields (docs/dwt-defra-api.md).
  // Optional at record level so paper-era records stay importable; the
  // adapter requires them before submission.
  physicalForm: z.string().min(1).optional(),
  containerCount: z.number().int().positive().optional(),
  containerType: z.string().min(1).optional(),
  weightIsEstimated: z.boolean().optional(),
  hazardous: z.boolean().optional(),
  /** Disposal/recovery code, e.g. "R13", "D15". */
  disposalOrRecoveryCode: z
    .string()
    .regex(/^[DR]\d{1,2}$/i)
    .optional(),
  /** Receiver's permit/exemption number (DWT mandatory field). */
  receiverAuthorisationNumber: z.string().min(1).optional(),
});

export const wasteCarrierSchema = z.object({
  name: z.string().min(1),
  /** EA carrier/broker/dealer registration, e.g. "CBDU123456". */
  registrationNumber: z
    .string()
    .regex(
      /^CBD[UL]\d{4,8}$/,
      'registration must be CBDU/CBDL format, e.g. "CBDU123456"',
    ),
  expiryDate: isoDate,
  /** Last date the registration was checked against the EA public register. */
  verificationDate: isoDate,
});

export const siteRecordSchema = z.object({
  name: z.string().min(1),
  permitRef: z.string().min(1),
  permittedEwcCodes: z.array(ewcCode).min(1),
  tonnageLimit: z.number().positive(),
  returnCadence: z.enum(["quarterly", "annual"]),
});

export const wasteReceipt = defineEntity("waste_receipt", wasteReceiptSchema);
export const wasteCarrier = defineEntity("waste_carrier", wasteCarrierSchema);
export const siteRecord = defineEntity("site_record", siteRecordSchema);

export type WasteReceipt = z.infer<typeof wasteReceiptSchema>;
export type WasteCarrier = z.infer<typeof wasteCarrierSchema>;
export type SiteRecord = z.infer<typeof siteRecordSchema>;
