import { describe, expect, it } from "vitest";
import { decodeJwt, isExpired, relativeFromNow } from "./jwt";

/** Builds a token the same way a real issuer would, so tests aren't circular. */
function makeToken(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  signature = "sig",
): string {
  const encode = (value: Record<string, unknown>) =>
    btoa(
      String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))),
    )
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
  return `${encode(header)}.${encode(payload)}.${signature}`;
}

describe("decodeJwt", () => {
  it("decodes a well-formed token", () => {
    const token = makeToken({ alg: "HS256", typ: "JWT" }, { sub: "123" });

    expect(decodeJwt(token)).toEqual({
      header: { alg: "HS256", typ: "JWT" },
      payload: { sub: "123" },
      signature: "sig",
    });
  });

  it("decodes segments whose length needs base64 padding", () => {
    // A one-key payload lands on a length that isn't a multiple of four.
    const token = makeToken({ alg: "none" }, { a: 1 });

    expect(decodeJwt(token)?.payload).toEqual({ a: 1 });
  });

  it("preserves non-ASCII claim values", () => {
    const token = makeToken({ alg: "HS256" }, { name: "José Müller 日本" });

    expect(decodeJwt(token)?.payload.name).toBe("José Müller 日本");
  });

  it("ignores surrounding whitespace", () => {
    const token = makeToken({ alg: "HS256" }, { sub: "1" });

    expect(decodeJwt(`  ${token}\n`)?.payload).toEqual({ sub: "1" });
  });

  it("rejects a token without three segments", () => {
    expect(decodeJwt("a.b")).toBeNull();
    expect(decodeJwt("a.b.c.d")).toBeNull();
    expect(decodeJwt("")).toBeNull();
  });

  it("rejects segments that are not base64url", () => {
    expect(decodeJwt("!!!.!!!.sig")).toBeNull();
  });

  it("rejects segments that decode to invalid JSON", () => {
    const notJson = btoa("hello").replaceAll("=", "");

    expect(decodeJwt(`${notJson}.${notJson}.sig`)).toBeNull();
  });

  it("rejects segments that decode to a JSON scalar rather than an object", () => {
    const scalar = btoa("42").replaceAll("=", "");

    expect(decodeJwt(`${scalar}.${scalar}.sig`)).toBeNull();
  });
});

describe("relativeFromNow", () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);

  it("describes a future time", () => {
    expect(relativeFromNow(now / 1000 + 720, now)).toBe("in 12 minutes");
  });

  it("describes a past time", () => {
    expect(relativeFromNow(now / 1000 - 10_800, now)).toBe("3 hours ago");
  });

  it("falls back to seconds for sub-minute differences", () => {
    expect(relativeFromNow(now / 1000 + 5, now)).toBe("in 5 seconds");
  });
});

describe("isExpired", () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);

  it("is true when exp is in the past", () => {
    expect(isExpired({ exp: now / 1000 - 1 }, now)).toBe(true);
  });

  it("is false when exp is in the future", () => {
    expect(isExpired({ exp: now / 1000 + 60 }, now)).toBe(false);
  });

  it("is false when there is no exp claim", () => {
    expect(isExpired({ sub: "1" }, now)).toBe(false);
  });

  it("is false when exp is not a number", () => {
    expect(isExpired({ exp: "soon" }, now)).toBe(false);
  });
});
