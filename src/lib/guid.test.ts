import { afterEach, describe, expect, it, vi } from "vitest";
import { formatGuid, generateGuids } from "./guid";

// version nibble 4, variant nibble one of 8/9/a/b -- the shape RFC 4122
// requires of a v4 UUID, not just "looks like hex with dashes".
const V4_HYPHENATED =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const SAMPLE = "12345678-1234-4234-8234-123456789abc";

describe("formatGuid", () => {
  it("returns the canonical hyphenated form unchanged for D", () => {
    expect(formatGuid(SAMPLE, "D", false)).toBe(SAMPLE);
  });

  it("strips hyphens and returns 32 hex characters for N", () => {
    const result = formatGuid(SAMPLE, "N", false);
    expect(result).toBe(SAMPLE.replaceAll("-", ""));
    expect(result).not.toContain("-");
    expect(result).toHaveLength(32);
  });

  it("wraps in braces for B, keeping hyphens", () => {
    expect(formatGuid(SAMPLE, "B", false)).toBe(`{${SAMPLE}}`);
  });

  it("wraps in parentheses for P, keeping hyphens", () => {
    expect(formatGuid(SAMPLE, "P", false)).toBe(`(${SAMPLE})`);
  });

  it("uppercases the hex but not braces or hyphens", () => {
    expect(formatGuid(SAMPLE, "D", true)).toBe(SAMPLE.toUpperCase());
    expect(formatGuid(SAMPLE, "B", true)).toBe(`{${SAMPLE.toUpperCase()}}`);
    expect(formatGuid(SAMPLE, "P", true)).toBe(`(${SAMPLE.toUpperCase()})`);
    expect(formatGuid(SAMPLE, "N", true)).toBe(
      SAMPLE.replaceAll("-", "").toUpperCase(),
    );
  });
});

describe("generateGuids", () => {
  it("returns the requested count of distinct values", () => {
    const guids = generateGuids(5, "D", false);
    expect(guids).toHaveLength(5);
    expect(new Set(guids).size).toBe(5);
  });

  it("produces real v4 GUIDs -- version and variant nibbles match RFC 4122", () => {
    const guids = generateGuids(20, "D", false);
    for (const guid of guids) {
      expect(guid).toMatch(V4_HYPHENATED);
    }
  });

  it("caps count at 100 so a pasted number can't lock the UI", () => {
    expect(generateGuids(10_000, "D", false)).toHaveLength(100);
  });

  it("applies format and case to every generated value", () => {
    const guids = generateGuids(3, "N", true);
    for (const guid of guids) {
      expect(guid).not.toContain("-");
      expect(guid).toBe(guid.toUpperCase());
      expect(guid).toHaveLength(32);
    }
  });

  describe("when crypto.randomUUID is unavailable", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("throws rather than falling back to a non-cryptographic source", () => {
      // Stubs the whole global rather than mutating the real crypto object,
      // which may not have a writable randomUUID property -- and restores it
      // in afterEach so no other test in this file (or file order) is
      // affected.
      vi.stubGlobal("crypto", {});

      expect(() => generateGuids(1, "D", false)).toThrow(/randomUUID/i);
    });
  });
});
