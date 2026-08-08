import { describe, expect, it } from "vitest";
import {
  DwtApiError,
  DwtDefraClient,
  toWireFormat,
  type DwtDefraConfig,
} from "./client.js";
import { receiptSubmissionSchema, type ReceiptSubmission } from "./schema.js";

/**
 * Contract tests pinned to committed fixtures — no live API. The wire
 * shape asserted here is the adapter's contract with the chassis; when
 * onboarding pins the real Swagger spec, changes surface as diffs in
 * EXPECTED_WIRE, not silent drift.
 */

const FIXTURE: ReceiptSubmission = {
  receiverApiCode: "123456",
  receivedAt: "2026-10-02T09:30:00.000Z",
  ewcCode: "17 09 04",
  wasteDescription: "Mixed construction and demolition waste",
  physicalForm: "Solid",
  containerCount: 2,
  containerType: "Skip",
  weight: { amount: 4.2, unit: "t", isEstimated: true },
  hazardous: false,
  disposalOrRecoveryCode: "r13",
  carrierRegistrationNumber: "CBDU123456",
  meansOfTransport: "Road",
  receiverAuthorisationNumber: "EPR/AB1234CD",
  receiptAddress: { address: "1 Transfer Way, Leeds", postcode: "LS1 1AA" },
  ownReference: "WD-0001",
};

const EXPECTED_WIRE = {
  receiverApiCode: "123456",
  dateTimeReceived: "2026-10-02T09:30:00.000Z",
  ewcCode: "170904",
  wasteDescription: "Mixed construction and demolition waste",
  physicalForm: "Solid",
  containers: { number: 2, type: "Skip" },
  weight: { amount: 4.2, unit: "t", isEstimate: true },
  hazardous: false,
  disposalOrRecoveryCode: "R13",
  carrierRegistrationNumber: "CBDU123456",
  meansOfTransport: "Road",
  receiverAuthorisationNumber: "EPR/AB1234CD",
  receiptAddress: { address: "1 Transfer Way, Leeds", postcode: "LS1 1AA" },
  ownReference: "WD-0001",
};

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(responses: Array<{ status: number; body: unknown }>): {
  fetch: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  let i = 0;
  const impl = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const r = responses[Math.min(i++, responses.length - 1)]!;
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as typeof fetch;
  return { fetch: impl, calls };
}

function config(fetchImpl: typeof fetch): DwtDefraConfig {
  return {
    authBaseUrl: "https://auth.example",
    apiBaseUrl: "https://api.example",
    clientId: "client-id",
    clientSecret: "client-secret",
    fetchImpl,
  };
}

const TOKEN_OK = {
  status: 200,
  body: { access_token: "tok-1", expires_in: 3600 },
};
const SUBMIT_OK = { status: 200, body: { wasteTrackingId: "WT-2026-0001" } };

describe("schema", () => {
  it("accepts the fixture and both EWC spacings", () => {
    expect(receiptSubmissionSchema.parse(FIXTURE).ewcCode).toBe("17 09 04");
    expect(
      receiptSubmissionSchema.parse({ ...FIXTURE, ewcCode: "170904" }).ewcCode,
    ).toBe("170904");
  });

  it.each([
    ["receiverApiCode", "12345"],
    ["ewcCode", "17-09-04"],
    ["disposalOrRecoveryCode", "X13"],
    ["receivedAt", "yesterday"],
  ])("rejects bad %s", (field, value) => {
    expect(() =>
      receiptSubmissionSchema.parse({ ...FIXTURE, [field]: value }),
    ).toThrow();
  });

  it("rejects non-positive weight and container count", () => {
    expect(() =>
      receiptSubmissionSchema.parse({
        ...FIXTURE,
        weight: { ...FIXTURE.weight, amount: 0 },
      }),
    ).toThrow();
    expect(() =>
      receiptSubmissionSchema.parse({ ...FIXTURE, containerCount: 0 }),
    ).toThrow();
  });
});

describe("toWireFormat contract", () => {
  it("maps the fixture to the pinned wire shape exactly", () => {
    expect(toWireFormat(FIXTURE)).toEqual(EXPECTED_WIRE);
  });

  it("omits absent optional fields instead of sending null", () => {
    const rest = { ...FIXTURE };
    delete rest.ownReference;
    const wire = toWireFormat(rest);
    expect("ownReference" in wire).toBe(false);
    expect("vehicleRegistration" in wire).toBe(false);
  });
});

describe("DwtDefraClient", () => {
  it("fetches a token with Basic auth then submits with Bearer", async () => {
    const { fetch, calls } = fakeFetch([TOKEN_OK, SUBMIT_OK]);
    const client = new DwtDefraClient(config(fetch));
    const result = await client.submitReceipt(FIXTURE, 1_000_000);

    expect(result).toEqual({ wasteTrackingId: "WT-2026-0001" });
    expect(calls[0]!.url).toBe("https://auth.example/oauth2/token");
    const authHeader = (calls[0]!.init.headers as Record<string, string>)
      .Authorization;
    expect(authHeader).toBe(
      `Basic ${Buffer.from("client-id:client-secret").toString("base64")}`,
    );
    expect(calls[1]!.url).toBe("https://api.example/movements/receive");
    expect(
      (calls[1]!.init.headers as Record<string, string>).Authorization,
    ).toBe("Bearer tok-1");
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual(EXPECTED_WIRE);
  });

  it("caches the token until near expiry, then refreshes", async () => {
    const { fetch, calls } = fakeFetch([
      TOKEN_OK,
      SUBMIT_OK,
      SUBMIT_OK,
      { status: 200, body: { access_token: "tok-2", expires_in: 3600 } },
      SUBMIT_OK,
    ]);
    const client = new DwtDefraClient(config(fetch));
    const t0 = 1_000_000;
    await client.submitReceipt(FIXTURE, t0);
    await client.submitReceipt(FIXTURE, t0 + 1000);
    // Two submits, ONE token call so far.
    expect(calls.filter((c) => c.url.includes("oauth2")).length).toBe(1);

    // Inside the 60s-before-expiry refresh window → new token fetched.
    await client.submitReceipt(FIXTURE, t0 + 3600 * 1000 - 30_000);
    expect(calls.filter((c) => c.url.includes("oauth2")).length).toBe(2);
    const lastSubmit = calls[calls.length - 1]!;
    expect(
      (lastSubmit.init.headers as Record<string, string>).Authorization,
    ).toBe("Bearer tok-2");
  });

  it("throws DwtApiError with status on auth failure", async () => {
    const { fetch } = fakeFetch([{ status: 401, body: { error: "denied" } }]);
    const client = new DwtDefraClient(config(fetch));
    await expect(client.submitReceipt(FIXTURE, 0)).rejects.toMatchObject({
      name: "DwtApiError",
      status: 401,
    });
  });

  it("throws DwtApiError on submission failure and truncates huge bodies", async () => {
    const { fetch } = fakeFetch([
      TOKEN_OK,
      { status: 422, body: { detail: "x".repeat(2000) } },
    ]);
    const client = new DwtDefraClient(config(fetch));
    const err = await client.submitReceipt(FIXTURE, 0).catch((e) => e);
    expect(err).toBeInstanceOf(DwtApiError);
    expect(err.status).toBe(422);
    expect(err.message.length).toBeLessThan(600);
  });

  it("validates input before any network call", async () => {
    const { fetch, calls } = fakeFetch([TOKEN_OK, SUBMIT_OK]);
    const client = new DwtDefraClient(config(fetch));
    await expect(
      client.submitReceipt({ ...FIXTURE, ewcCode: "bad" }, 0),
    ).rejects.toThrow();
    expect(calls.length).toBe(0);
  });
});
