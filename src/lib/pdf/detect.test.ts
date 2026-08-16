import { describe, expect, it } from "vitest";
import { detectFormat } from "./detect";
import { PERF_BUDGET_MS } from "./perf-budget";

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

  it("stays fast on input with many unclosed block tags (no quadratic backtracking)", () => {
    const input = `${"<p>".repeat(50000)}text`;
    const start = performance.now();
    detectFormat(input);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(PERF_BUDGET_MS);
  });

  it("stays fast on tag-like floods that never close (bounded, not quadratic, scans)", () => {
    // "<br " repeated has no ">" anywhere, so an unbounded [^>]* re-scans to
    // end-of-input from every "<" -- O(n^2) even without backtracking
    // ambiguity. Same shape for "[a](" and an unbounded [^)]+. These inputs
    // took double-digit seconds each before the quantifiers were bounded.
    for (const flood of ["<br ".repeat(30000), "[a](".repeat(30000)]) {
      const start = performance.now();
      detectFormat(flood);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(PERF_BUDGET_MS);
    }
  });

  it("still detects **bold** and *em* on a single line as markdown", () => {
    expect(detectFormat("This is **bold** text.")).toBe("markdown");
    expect(detectFormat("This is *em* text.")).toBe("markdown");
  });

  it("still detects single-underscore emphasis on word boundaries as markdown", () => {
    expect(detectFormat("This is _emphasis_ in a sentence.")).toBe("markdown");
  });

  it("treats identifier-style underscores as plain text, not emphasis", () => {
    expect(
      detectFormat(
        "Set foo_bar to true and baz_qux to false in the settings panel.",
      ),
    ).toBe("text");
    expect(
      detectFormat(
        "Update the user_id column first. Then check the session_token cookie.",
      ),
    ).toBe("text");
    expect(
      detectFormat(
        "Open C:\\Users\\Test\\Documents\\report_v2_final.docx and review it.",
      ),
    ).toBe("text");
    expect(
      detectFormat(
        "The __init__ method differs from __name__ in Python modules.",
      ),
    ).toBe("text");
  });

  it("detects void HTML elements as html", () => {
    expect(detectFormat("Line one<br>Line two<br>Line three")).toBe("html");
    expect(detectFormat('<img src="pic.jpg">')).toBe("html");
  });

  it("leaves a lone unclosed block tag as plain text (out of scope)", () => {
    expect(detectFormat("<div>hello, this never closes")).toBe("text");
  });

  it("detects a GFM table as markdown", () => {
    expect(detectFormat("| a | b |\n|---|---|\n| 1 | 2 |")).toBe("markdown");
  });

  it("detects nested block tags of different names as html", () => {
    expect(detectFormat("<div><p>nested</p></div>")).toBe("html");
  });

  it("requires the same block-tag name to open and close before calling it html", () => {
    expect(
      detectFormat(
        "Use <li> as an example, but don't format like </table> either.",
      ),
    ).toBe("text");
    expect(
      detectFormat(
        "The <p> tag opens a paragraph and </div> closes a division.",
      ),
    ).toBe("text");
  });

  it("gives the same result on repeated calls with the same html input (no shared regex lastIndex state)", () => {
    const input = "<p>hello</p><p>world</p>";
    expect(detectFormat(input)).toBe("html");
    expect(detectFormat(input)).toBe("html");
  });

  it("finds a markdown signal beyond the old 4096-character sniff cap", () => {
    const input = `${"x".repeat(5000)}\n# Heading`;
    expect(detectFormat(input)).toBe("markdown");
  });

  it("stays fast on a large realistic document (~1MB of prose)", () => {
    const paragraph =
      "The quick brown fox jumps over the lazy dog near the riverbank. " +
      "It was a bright, calm morning and nothing much happened at all.\n\n";
    const input = paragraph.repeat(Math.ceil(1_000_000 / paragraph.length));
    const start = performance.now();
    detectFormat(input);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(PERF_BUDGET_MS);
  });
});
