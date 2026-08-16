import { describe, expect, it } from "vitest";
import { parseInstant } from "./timestamp";

describe("parseInstant", () => {
  it("reads a 10-digit number as epoch seconds", () => {
    const result = parseInstant("1700000000");

    expect(result).not.toBeNull();
    expect(result?.assumedUnit).toBe("seconds");
    expect(result?.ms).toBe(1_700_000_000_000);
  });

  it("reads a 13-digit number as epoch milliseconds", () => {
    const result = parseInstant("1700000000000");

    expect(result).not.toBeNull();
    expect(result?.assumedUnit).toBe("milliseconds");
    expect(result?.ms).toBe(1_700_000_000_000);
  });

  it("parses an ISO 8601 string, reported as date-string", () => {
    const result = parseInstant("2026-01-01T00:00:00.000Z");

    expect(result).toEqual({
      ms: Date.UTC(2026, 0, 1, 0, 0, 0),
      assumedUnit: "date-string",
    });
  });

  it("ignores surrounding whitespace", () => {
    const result = parseInstant("  1700000000  \n");

    expect(result?.assumedUnit).toBe("seconds");
    expect(result?.ms).toBe(1_700_000_000_000);
  });

  it("returns null, not an error, for empty input", () => {
    expect(parseInstant("")).toBeNull();
    expect(parseInstant("   ")).toBeNull();
  });

  it("returns null for garbage input rather than NaN or a throw", () => {
    expect(() => parseInstant("not a date")).not.toThrow();
    expect(parseInstant("not a date")).toBeNull();
  });

  it("returns null for non-finite or absurd numeric input", () => {
    // This repo has already shipped this exact bug once: a 1e400 JWT claim
    // parsed to Infinity and reached Intl.RelativeTimeFormat, which threw a
    // RangeError that escaped render and unmounted the whole app.
    expect(parseInstant("1e400")).toBeNull();
    expect(parseInstant("Infinity")).toBeNull();
    expect(parseInstant("-Infinity")).toBeNull();
    expect(parseInstant("NaN")).toBeNull();
  });

  it("returns null for a numeric string so long it overflows to Infinity", () => {
    expect(parseInstant("1".repeat(400))).toBeNull();
  });

  it("returns null for a value outside the range Date can represent", () => {
    // Finite, but too large in magnitude for a JS Date (max ~8.64e15ms).
    expect(parseInstant("8650000000000000")).toBeNull();
  });

  it("parses a negative epoch (pre-1970) rather than rejecting it", () => {
    const result = parseInstant("-100000");

    expect(result).not.toBeNull();
    expect(result?.assumedUnit).toBe("seconds");
    expect(result?.ms).toBe(-100_000_000);
  });

  it("parses a negative 13+ digit number as milliseconds", () => {
    const result = parseInstant("-1700000000000");

    expect(result?.assumedUnit).toBe("milliseconds");
    expect(result?.ms).toBe(-1_700_000_000_000);
  });
});
