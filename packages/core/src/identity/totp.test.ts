/**
 * RFC 6238 TOTP correctness — pure, no DB.
 *
 * Vectors from RFC 6238 Appendix B (SHA-1, secret "12345678901234567890").
 * The RFC publishes 8-digit codes; our 6-digit codes are the same values
 * mod 10^6, i.e. the RFC codes with the leading digits dropped.
 */
import { describe, expect, it } from "vitest";
import {
  base32Decode,
  generateTotpSecret,
  TOTP_DIGITS,
  TOTP_STEP_SECONDS,
  totpCode,
  totpEnrolmentUri,
  verifyTotp,
} from "./totp.js";

// "12345678901234567890" in base32
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

const RFC_VECTORS: [seconds: number, code: string][] = [
  [59, "287082"],
  [1111111109, "081804"],
  [1111111111, "050471"],
  [1234567890, "005924"],
  [2000000000, "279037"],
];

describe("totpCode — RFC 6238 test vectors", () => {
  for (const [seconds, code] of RFC_VECTORS) {
    it(`time ${seconds}s → ${code}`, () => {
      expect(totpCode(RFC_SECRET, seconds * 1000)).toBe(code);
    });
  }
});

describe("verifyTotp — skew window", () => {
  // t = 1111111111s is in step N; steps are 30s wide.
  const AT = 1111111111 * 1000;
  const codeAt = (stepOffset: number) =>
    totpCode(RFC_SECRET, AT + stepOffset * TOTP_STEP_SECONDS * 1000);

  it("accepts the current step's code", () => {
    expect(verifyTotp(RFC_SECRET, codeAt(0), AT)).toBe(true);
  });

  it("accepts the previous step's code (-1 skew)", () => {
    expect(verifyTotp(RFC_SECRET, codeAt(-1), AT)).toBe(true);
  });

  it("accepts the next step's code (+1 skew)", () => {
    expect(verifyTotp(RFC_SECRET, codeAt(1), AT)).toBe(true);
  });

  it("rejects codes two steps away (±2)", () => {
    expect(verifyTotp(RFC_SECRET, codeAt(-2), AT)).toBe(false);
    expect(verifyTotp(RFC_SECRET, codeAt(2), AT)).toBe(false);
  });
});

describe("verifyTotp — malformed tokens", () => {
  const AT = 59 * 1000;
  it.each(["", "12345", "1234567", "28708a", "287 082", "287082\n", "-28708"])(
    "rejects %j",
    (bad) => {
      expect(verifyTotp(RFC_SECRET, bad, AT)).toBe(false);
    },
  );

  it("rejects a wrong-but-well-formed code", () => {
    // 287083 differs from the valid 287082 at t=59
    expect(verifyTotp(RFC_SECRET, "287083", AT)).toBe(false);
  });
});

describe("base32", () => {
  it("decodes the RFC secret to its ASCII bytes", () => {
    expect(base32Decode(RFC_SECRET).toString("ascii")).toBe(
      "12345678901234567890",
    );
  });

  it("is case-insensitive and strips padding", () => {
    expect(base32Decode(RFC_SECRET.toLowerCase() + "==")).toEqual(
      base32Decode(RFC_SECRET),
    );
  });

  it("throws on invalid characters", () => {
    expect(() => base32Decode("ABC$DEF")).toThrow(/base32/i);
  });

  it("round-trips generated secrets", () => {
    for (let i = 0; i < 20; i++) {
      const secret = generateTotpSecret();
      // 20 random bytes → 32 base32 chars, decoding back to 20 bytes
      expect(secret).toMatch(/^[A-Z2-7]{32}$/);
      expect(base32Decode(secret)).toHaveLength(20);
      // and both parties derive the same codes from it
      expect(verifyTotp(secret, totpCode(secret, 0), 0)).toBe(true);
    }
  });
});

describe("totpEnrolmentUri", () => {
  it("produces a well-formed otpauth URI", () => {
    const uri = totpEnrolmentUri(RFC_SECRET, "a@example.com", "Ghatta Factory");
    const parsed = new URL(uri);
    expect(parsed.protocol).toBe("otpauth:");
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(decodeURIComponent(uri.split("?")[0]!)).toContain(
      "Ghatta Factory:a@example.com",
    );
    expect(parsed.searchParams.get("secret")).toBe(RFC_SECRET);
    expect(parsed.searchParams.get("issuer")).toBe("Ghatta Factory");
    expect(parsed.searchParams.get("digits")).toBe(String(TOTP_DIGITS));
    expect(parsed.searchParams.get("period")).toBe(String(TOTP_STEP_SECONDS));
  });
});
