import { describe, expect, it } from "vitest";
import { parseMarkdown } from "./parse-markdown";

describe("parseMarkdown", () => {
  it("maps headings with their level", async () => {
    const nodes = await parseMarkdown("## Sub heading");
    expect(nodes).toEqual([
      { kind: "heading", level: 2, runs: [{ text: "Sub heading" }] },
    ]);
  });

  it("maps inline emphasis, code and links", async () => {
    const [node] = await parseMarkdown(
      "A **bold** and *em* and `code` and [x](https://e.com).",
    );
    expect(node.kind).toBe("paragraph");
    const runs = node.kind === "paragraph" ? node.runs : [];
    expect(runs).toContainEqual({ text: "bold", bold: true });
    expect(runs).toContainEqual({ text: "em", italic: true });
    expect(runs).toContainEqual({ text: "code", code: true });
    expect(runs).toContainEqual({ text: "x", link: "https://e.com" });
  });

  it("propagates inherited formatting to nested marks", async () => {
    const [node] = await parseMarkdown("**bold with *nested em* inside**");
    expect(node.kind).toBe("paragraph");
    const runs = node.kind === "paragraph" ? node.runs : [];
    expect(runs).toContainEqual({
      text: "nested em",
      bold: true,
      italic: true,
    });
  });

  it("maps unordered and ordered lists", async () => {
    const [unordered] = await parseMarkdown("- one\n- two");
    expect(unordered).toMatchObject({ kind: "list", ordered: false });

    const [ordered] = await parseMarkdown("1. one\n2. two");
    expect(ordered).toMatchObject({ kind: "list", ordered: true });
  });

  it("keeps code blocks verbatim", async () => {
    const [node] = await parseMarkdown("```js\nconst x = 1;\n```");
    expect(node).toEqual({ kind: "code", text: "const x = 1;" });
  });

  it("maps blockquotes to a quote node", async () => {
    const [node] = await parseMarkdown("> quoted");
    expect(node.kind).toBe("quote");
  });

  it("degrades tables to paragraphs without losing cells", async () => {
    const nodes = await parseMarkdown("| a | b |\n|---|---|\n| 1 | 2 |");
    const text = nodes
      .flatMap((n) => (n.kind === "paragraph" ? n.runs.map((r) => r.text) : []))
      .join("");
    expect(text).toContain("a | b");
    expect(text).toContain("1 | 2");
  });

  it("bolds the table header row but not the body rows", async () => {
    const nodes = await parseMarkdown("| a | b |\n|---|---|\n| 1 | 2 |");
    const paragraphs = nodes.filter((n) => n.kind === "paragraph");
    expect(paragraphs[0].runs.every((r) => r.bold)).toBe(true);
    expect(paragraphs[1].runs.some((r) => r.bold)).toBe(false);
  });

  it("keeps image alt text and drops the image", async () => {
    const [node] = await parseMarkdown("![a diagram](x.png)");
    expect(node).toMatchObject({ kind: "paragraph" });
    const runs = node.kind === "paragraph" ? node.runs : [];
    expect(runs.map((r) => r.text).join("")).toBe("a diagram");
  });

  it("keeps an inline <img> tag's alt text alongside surrounding text", async () => {
    const [node] = await parseMarkdown('before <img alt="html alt"> after');
    expect(node.kind).toBe("paragraph");
    const runs = node.kind === "paragraph" ? node.runs : [];
    expect(runs.map((r) => r.text)).toEqual(["before ", "html alt", " after"]);
  });

  it("keeps a standalone block <img> tag's alt text", async () => {
    const [node] = await parseMarkdown('<img alt="standalone">');
    expect(node).toMatchObject({ kind: "paragraph" });
    const runs = node.kind === "paragraph" ? node.runs : [];
    expect(runs.map((r) => r.text).join("")).toBe("standalone");
  });

  it("contributes nothing for an <img> tag with no alt attribute", async () => {
    const nodes = await parseMarkdown("<img>");
    expect(nodes).toEqual([]);
  });

  it("reads a single-quoted alt attribute", async () => {
    const [node] = await parseMarkdown(
      "before <img alt='single quoted'> after",
    );
    expect(node.kind).toBe("paragraph");
    const runs = node.kind === "paragraph" ? node.runs : [];
    expect(runs.map((r) => r.text)).toEqual([
      "before ",
      "single quoted",
      " after",
    ]);
  });

  it("strips a raw <div> tag but keeps its text content", async () => {
    const [node] = await parseMarkdown("<div>text</div>");
    expect(node).toMatchObject({ kind: "paragraph" });
    const runs = node.kind === "paragraph" ? node.runs : [];
    expect(runs.map((r) => r.text).join("")).toBe("text");
  });

  it("contributes nothing for an HTML comment", async () => {
    const nodes = await parseMarkdown("<!-- a comment -->");
    expect(nodes).toEqual([]);
  });

  it("decodes named entities in raw HTML", async () => {
    const [node] = await parseMarkdown("<div>A &amp; B</div>");
    expect(node).toMatchObject({ kind: "paragraph" });
    const runs = node.kind === "paragraph" ? node.runs : [];
    expect(runs.map((r) => r.text).join("")).toBe("A & B");
  });
});
