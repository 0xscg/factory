import { z } from "zod";

/**
 * Receipt of Waste submission — mandatory fields per DEFRA's
 * receipt-data-definitions page (see docs/dwt-defra-api.md; snapshot
 * 2026-08-08). Field NAMES here are our normalized form; the exact wire
 * shapes must be re-pinned from the published Swagger spec during
 * provider onboarding — the transform in client.ts is the single place
 * that maps to the wire format.
 */

/** 6-digit EWC code with or without spaces: "17 09 04" / "170904". */
export const ewcCode = z
  .string()
  .regex(/^\d{2}\s?\d{2}\s?\d{2}$/, "EWC code must be 6 digits");

export const weightUnit = z.enum(["g", "kg", "t"]);

export const receiptSubmissionSchema = z.object({
  /** Receiver's 6-digit API code (issued by DEFRA at onboarding). */
  receiverApiCode: z.string().regex(/^\d{6}$/),
  /** ISO 8601 date-time the waste was received. */
  receivedAt: z.string().datetime(),
  ewcCode,
  wasteDescription: z.string().min(1),
  physicalForm: z.string().min(1),
  containerCount: z.number().int().positive(),
  containerType: z.string().min(1),
  weight: z.object({
    amount: z.number().positive(),
    unit: weightUnit,
    isEstimated: z.boolean(),
  }),
  hazardous: z.boolean(),
  /** Disposal/recovery code, e.g. "R13", "D15". */
  disposalOrRecoveryCode: z.string().regex(/^[DR]\d{1,2}$/i),
  carrierRegistrationNumber: z.string().min(1),
  meansOfTransport: z.string().min(1),
  /** Receiver's permit/exemption number. */
  receiverAuthorisationNumber: z.string().min(1),
  receiptAddress: z.object({
    address: z.string().min(1),
    postcode: z.string().min(1),
  }),
  /** Optional per the data definitions. */
  ownReference: z.string().optional(),
  vehicleRegistration: z.string().optional(),
  hazardousConsignmentNumber: z.string().optional(),
});

export type ReceiptSubmission = z.infer<typeof receiptSubmissionSchema>;

export const submissionResultSchema = z.object({
  /** DEFRA-issued waste tracking id for the movement. */
  wasteTrackingId: z.string().min(1),
});

export type SubmissionResult = z.infer<typeof submissionResultSchema>;
