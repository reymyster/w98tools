import { describe, expect, it } from "vitest";
import { parseHtml } from "./parse-html";
import type { DocNode } from "./types";

describe("parseHtml", () => {
  it("maps headings and paragraphs", () => {
    expect(parseHtml("<h2>Title</h2><p>Body</p>")).toEqual([
      { kind: "heading", level: 2, runs: [{ text: "Title" }] },
      { kind: "paragraph", runs: [{ text: "Body" }] },
    ]);
  });

  it("maps strong, em, code and anchors to runs", () => {
    const [node] = parseHtml(
      "<p><strong>b</strong><em>i</em><code>c</code><a href='https://e.com'>l</a></p>",
    );
    const runs = node.kind === "paragraph" ? node.runs : [];
    expect(runs).toContainEqual({ text: "b", bold: true });
    expect(runs).toContainEqual({ text: "i", italic: true });
    expect(runs).toContainEqual({ text: "c", code: true });
    expect(runs).toContainEqual({ text: "l", link: "https://e.com" });
  });

  it("maps ul and ol", () => {
    expect(parseHtml("<ul><li>a</li></ul>")[0]).toMatchObject({
      kind: "list",
      ordered: false,
    });
    expect(parseHtml("<ol><li>a</li></ol>")[0]).toMatchObject({
      kind: "list",
      ordered: true,
    });
  });

  it("degrades tables to paragraphs without losing cells", () => {
    const nodes = parseHtml("<table><tr><td>1</td><td>2</td></tr></table>");
    const text = nodes
      .flatMap((n) => (n.kind === "paragraph" ? n.runs.map((r) => r.text) : []))
      .join("");
    expect(text).toContain("1 | 2");
  });

  it("ignores script and style content", () => {
    const nodes = parseHtml(
      "<p>keep</p><script>var evil=1</script><style>.a{}</style>",
    );
    const text = nodes
      .flatMap((n) => (n.kind === "paragraph" ? n.runs.map((r) => r.text) : []))
      .join("");
    expect(text).toBe("keep");
    expect(text).not.toContain("evil");
  });

  it("keeps bare text not wrapped in a block element", () => {
    const nodes = parseHtml("loose text");
    expect(nodes).toEqual([
      { kind: "paragraph", runs: [{ text: "loose text" }] },
    ]);
  });

  it("keeps image alt text", () => {
    const nodes = parseHtml("<p><img alt='a chart' src='x.png'></p>");
    const text = nodes
      .flatMap((n) => (n.kind === "paragraph" ? n.runs.map((r) => r.text) : []))
      .join("");
    expect(text).toBe("a chart");
  });

  it("does not glue text across paragraph boundaries", () => {
    const nodes = parseHtml("<p>one</p><p>two</p>");
    expect(nodes).toEqual([
      { kind: "paragraph", runs: [{ text: "one" }] },
      { kind: "paragraph", runs: [{ text: "two" }] },
    ]);
  });

  it("preserves whitespace and indentation inside pre", () => {
    const nodes = parseHtml("<pre>  line one\n    line two</pre>");
    expect(nodes).toEqual([{ kind: "code", text: "  line one\n    line two" }]);
  });

  it("nests a list inside a list item rather than flattening it", () => {
    const [node] = parseHtml("<ul><li>a<ul><li>b</li></ul></li></ul>");
    expect(node.kind).toBe("list");
    const items = node.kind === "list" ? node.items : [];
    expect(items).toHaveLength(1);

    // The outer item's own node array contains both its own text and the
    // nested list -- the nested list must NOT be hoisted into a second,
    // sibling top-level list item.
    const outerItem = items[0];
    const nestedList = outerItem.find(
      (n): n is Extract<DocNode, { kind: "list" }> => n.kind === "list",
    );
    expect(nestedList).toBeDefined();
    expect(nestedList).toMatchObject({ ordered: false });
    expect(nestedList?.items).toEqual([
      [{ kind: "paragraph", runs: [{ text: "b" }] }],
    ]);
  });

  it("preserves inline formatting for marks not wrapped in a block element", () => {
    const nodes = parseHtml("<strong>bold</strong> plain");
    expect(nodes).toHaveLength(1);
    const runs = nodes[0].kind === "paragraph" ? nodes[0].runs : [];
    expect(runs).toContainEqual({ text: "bold", bold: true });
    expect(runs.some((r) => r.text.includes("plain"))).toBe(true);
  });

  it("treats div as a transparent block container", () => {
    const nodes = parseHtml("<div><p>inside</p></div>");
    expect(nodes).toEqual([{ kind: "paragraph", runs: [{ text: "inside" }] }]);
  });
});
