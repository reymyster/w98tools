import { describe, expect, it } from "vitest";
import { detectFormat } from "./detect";

describe("detectFormat", () => {
  it("detects a full HTML document", () => {
    expect(
      detectFormat("<!DOCTYPE html><html><body><p>hi</p></body></html>"),
    ).toBe("html");
  });

  it("detects an HTML fragment by its block tags", () => {
    expect(detectFormat("<p>hello</p><p>world</p>")).toBe("html");
  });

  it("detects markdown headings", () => {
    expect(detectFormat("# Title\n\nSome prose.")).toBe("markdown");
  });

  it("detects markdown lists", () => {
    expect(detectFormat("Shopping:\n\n- milk\n- eggs")).toBe("markdown");
  });

  it("detects fenced code as markdown", () => {
    expect(detectFormat("Example:\n\n```js\nconst x = 1;\n```")).toBe(
      "markdown",
    );
  });

  it("treats prose containing a URL as plain text", () => {
    expect(detectFormat("See https://example.com for details.")).toBe("text");
  });

  it("treats a bare sentence with a dash as plain text", () => {
    expect(detectFormat("The meeting - which ran long - ended.")).toBe("text");
  });

  it("prefers markdown when HTML-looking text is inside a fence", () => {
    expect(detectFormat("```\n<p>not really html</p>\n```")).toBe("markdown");
  });

  it("treats empty input as plain text", () => {
    expect(detectFormat("   ")).toBe("text");
  });
});
