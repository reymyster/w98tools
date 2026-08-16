import { describe, expect, it } from "vitest";
import { decode, encode, type Scheme } from "./encoding";

const SCHEMES: Scheme[] = ["base64", "base64url", "url-component", "url-full"];

const NON_ASCII = "José Müller 日本 🎉";

// A real URL, not a bare word, so the url-component/url-full assertions
// below are testing a meaningful difference rather than passing vacuously.
const REAL_URL = "https://example.com/search?q=a&b=c/d";

describe("encode/decode round-trip", () => {
  it.each(SCHEMES)("round-trips plain ASCII through %s", (scheme) => {
    const text = "Hello, world! 123";
    expect(decode(encode(text, scheme), scheme)).toBe(text);
  });

  it.each(SCHEMES)("round-trips non-ASCII text through %s", (scheme) => {
    expect(decode(encode(NON_ASCII, scheme), scheme)).toBe(NON_ASCII);
  });

  it.each(SCHEMES)("round-trips an empty string through %s", (scheme) => {
    expect(encode("", scheme)).toBe("");
    expect(decode("", scheme)).toBe("");
  });
});

describe("base64url", () => {
  it("produces output with no +, / or = padding", () => {
    // Verified (via a one-off Node check) that the standard-base64 form of
    // this text contains both '+' and '/', so this actually exercises the
    // substitution rather than passing because neither character showed up.
    const text = "λωςν ÿþýüûú";
    const encoded = encode(text, "base64url");

    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("=");
    expect(decode(encoded, "base64url")).toBe(text);
  });

  it("decodes correctly even though padding is absent", () => {
    // "a" -> base64 "YQ==" -- a length that needs two '=' of padding, to
    // prove decode re-pads before atob rather than relying on the input
    // happening to already be a multiple of four.
    const encoded = encode("a", "base64url");
    expect(encoded).toBe("YQ");
    expect(decode(encoded, "base64url")).toBe("a");
  });
});

describe("decode error handling", () => {
  it("throws on malformed base64", () => {
    expect(() => decode("!!!", "base64")).toThrow();
  });

  it("throws on a malformed percent-escape for url-component", () => {
    expect(() => decode("%", "url-component")).toThrow();
  });

  it("throws on a malformed percent-escape for url-full", () => {
    expect(() => decode("%", "url-full")).toThrow();
  });
});

describe("url-component vs url-full", () => {
  it("url-component escapes URL structural characters", () => {
    const encoded = encode(REAL_URL, "url-component");
    expect(encoded).not.toContain("&");
    expect(encoded).not.toContain("=");
    expect(encoded).not.toContain("?");
    expect(encoded).not.toContain("/");
    expect(decode(encoded, "url-component")).toBe(REAL_URL);
  });

  it("url-full leaves the URL's structural characters intact", () => {
    const encoded = encode(REAL_URL, "url-full");
    expect(encoded).toContain("&");
    expect(encoded).toContain("=");
    expect(encoded).toContain("?");
    expect(encoded).toContain("/");
    expect(decode(encoded, "url-full")).toBe(REAL_URL);
  });
});
