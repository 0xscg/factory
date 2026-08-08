import {
  receiptSubmissionSchema,
  submissionResultSchema,
  type ReceiptSubmission,
  type SubmissionResult,
} from "./schema.js";

/**
 * OAuth 2.0 client-credentials via AWS Cognito (api-authentication-guide;
 * docs/dwt-defra-api.md). Tokens are short-lived — cached until 60s
 * before expiry. No API keys exist for this service.
 */
export interface DwtDefraConfig {
  /** Cognito domain, e.g. https://waste-movement-external-api-….amazoncognito.com */
  authBaseUrl: string;
  /** Receipt of Waste API base URL (from the pinned Swagger spec). */
  apiBaseUrl: string;
  clientId: string;
  clientSecret: string;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

export class DwtApiError extends Error {
  constructor(
    readonly status: number,
    body: string,
  ) {
    super(`DWT API error ${status}: ${body.slice(0, 500)}`);
    this.name = "DwtApiError";
  }
}

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

export class DwtDefraClient {
  private token: CachedToken | null = null;
  private readonly fetch: typeof fetch;

  constructor(private readonly config: DwtDefraConfig) {
    this.fetch = config.fetchImpl ?? globalThis.fetch;
  }

  private async getAccessToken(nowMs: number): Promise<string> {
    if (this.token && nowMs < this.token.expiresAtMs - 60_000) {
      return this.token.accessToken;
    }
    const basic = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
    ).toString("base64");
    const res = await this.fetch(`${this.config.authBaseUrl}/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) throw new DwtApiError(res.status, await res.text());
    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.token = {
      accessToken: data.access_token,
      expiresAtMs: nowMs + data.expires_in * 1000,
    };
    return this.token.accessToken;
  }

  /**
   * Submits one receipt record. Input is validated against our
   * normalized schema, then mapped to the wire shape in one place
   * (re-pin against the published Swagger during onboarding).
   * Deterministic `nowMs` injection keeps token-cache tests clock-free.
   */
  async submitReceipt(
    submission: ReceiptSubmission,
    nowMs: number = Date.now(),
  ): Promise<SubmissionResult> {
    const valid = receiptSubmissionSchema.parse(submission);
    const token = await this.getAccessToken(nowMs);
    const res = await this.fetch(
      `${this.config.apiBaseUrl}/movements/receive`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(toWireFormat(valid)),
      },
    );
    if (!res.ok) throw new DwtApiError(res.status, await res.text());
    return submissionResultSchema.parse(await res.json());
  }
}

/**
 * The ONE place our normalized fields map to DEFRA's wire names. The
 * current mapping is a best-effort reading of receipt-data-definitions;
 * the contract tests pin it, and onboarding against the real Swagger
 * spec updates it here only.
 */
export function toWireFormat(s: ReceiptSubmission): Record<string, unknown> {
  return {
    receiverApiCode: s.receiverApiCode,
    dateTimeReceived: s.receivedAt,
    ewcCode: s.ewcCode.replaceAll(" ", ""),
    wasteDescription: s.wasteDescription,
    physicalForm: s.physicalForm,
    containers: { number: s.containerCount, type: s.containerType },
    weight: {
      amount: s.weight.amount,
      unit: s.weight.unit,
      isEstimate: s.weight.isEstimated,
    },
    hazardous: s.hazardous,
    disposalOrRecoveryCode: s.disposalOrRecoveryCode.toUpperCase(),
    carrierRegistrationNumber: s.carrierRegistrationNumber,
    meansOfTransport: s.meansOfTransport,
    receiverAuthorisationNumber: s.receiverAuthorisationNumber,
    receiptAddress: s.receiptAddress,
    ...(s.ownReference ? { ownReference: s.ownReference } : {}),
    ...(s.vehicleRegistration
      ? { vehicleRegistration: s.vehicleRegistration }
      : {}),
    ...(s.hazardousConsignmentNumber
      ? { hazardousConsignmentNumber: s.hazardousConsignmentNumber }
      : {}),
  };
}

export const DWT_AUTH_TEST =
  "https://waste-movement-external-api-8ec5c.auth.eu-west-2.amazoncognito.com";
export const DWT_AUTH_PROD =
  "https://waste-movement-external-api-75ee2.auth.eu-west-2.amazoncognito.com";
