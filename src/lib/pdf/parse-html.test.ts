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

  it("does not glue figcaption text to a preceding image's alt text", () => {
    // Regression: figcaption is a genuine block element, not an inline run,
    // so it must land in its own paragraph rather than being appended to
    // the same run buffer as the image's alt text (which would render as
    // the glued "a photoCaption text").
    const nodes = parseHtml(
      '<figure><img alt="a photo"><figcaption>Caption text</figcaption></figure>',
    );
    expect(nodes).toEqual([
      { kind: "paragraph", runs: [{ text: "a photo" }] },
      { kind: "paragraph", runs: [{ text: "Caption text" }] },
    ]);
  });

  it("keeps dl term and definition text distinguishable", () => {
    // Regression: dt/dd are block elements; without a boundary between them
    // the term and definition glue into a single run-buffer paragraph
    // ("HTMLHyperText Markup Language").
    const nodes = parseHtml(
      "<dl><dt>HTML</dt><dd>HyperText Markup Language</dd></dl>",
    );
    expect(nodes).toEqual([
      { kind: "paragraph", runs: [{ text: "HTML" }] },
      { kind: "paragraph", runs: [{ text: "HyperText Markup Language" }] },
    ]);
  });

  it("treats an anchor wrapping block content as a block container and preserves the link", () => {
    const nodes = parseHtml('<a href="https://e.com"><p>one</p><p>two</p></a>');
    expect(nodes).toEqual([
      { kind: "paragraph", runs: [{ text: "one", link: "https://e.com" }] },
      { kind: "paragraph", runs: [{ text: "two", link: "https://e.com" }] },
    ]);
  });

  it("treats a <del> wrapping block content as a block container", () => {
    // Regression: <del> is a transparent inline element just like <a>, and
    // routinely wraps whole paragraphs in revision-tracking HTML exports.
    // Before the fix, only <a> got this treatment, so the boundary between
    // the two <p>s was silently lost.
    const nodes = parseHtml("<del><p>one</p><p>two</p></del>");
    expect(nodes).toEqual([
      { kind: "paragraph", runs: [{ text: "one" }] },
      { kind: "paragraph", runs: [{ text: "two" }] },
    ]);
  });

  it("treats an <ins> wrapping block content as a block container", () => {
    const nodes = parseHtml("<ins><p>one</p><p>two</p></ins>");
    expect(nodes).toEqual([
      { kind: "paragraph", runs: [{ text: "one" }] },
      { kind: "paragraph", runs: [{ text: "two" }] },
    ]);
  });

  it("treats a <span> wrapping block content as a block container", () => {
    const nodes = parseHtml("<span><p>one</p><p>two</p></span>");
    expect(nodes).toEqual([
      { kind: "paragraph", runs: [{ text: "one" }] },
      { kind: "paragraph", runs: [{ text: "two" }] },
    ]);
  });

  it("keeps a boundary between a <del> wrapping a block and trailing text", () => {
    const nodes = parseHtml("<del><p>x</p></del> trailing text.");
    expect(nodes).toEqual([
      { kind: "paragraph", runs: [{ text: "x" }] },
      { kind: "paragraph", runs: [{ text: " trailing text." }] },
    ]);
  });

  it("keeps a <span> containing only inline content inline", () => {
    // Guards against the fix over-triggering: a <span> that does not
    // contain any block-level descendant must still buffer as inline runs
    // rather than being treated as a block container.
    const nodes = parseHtml("<span>a</span><span>b</span>");
    expect(nodes).toEqual([
      { kind: "paragraph", runs: [{ text: "a" }, { text: "b" }] },
    ]);
  });

  it("keeps a bare inline anchor's link when it wraps only inline content", () => {
    const nodes = parseHtml('<a href="https://e.com">bare link</a>');
    expect(nodes).toEqual([
      {
        kind: "paragraph",
        runs: [{ text: "bare link", link: "https://e.com" }],
      },
    ]);
  });

  it("ignores noscript and template content alongside script and style", () => {
    const nodes = parseHtml(
      "<p>keep</p><noscript>hidden</noscript><template><p>tmpl</p></template>",
    );
    const text = nodes
      .flatMap((n) => (n.kind === "paragraph" ? n.runs.map((r) => r.text) : []))
      .join("");
    expect(text).toBe("keep");
  });

  it("keeps head metadata out of the document", () => {
    const nodes = parseHtml(
      "<html><head><title>Ignored</title></head><body><p>keep</p></body></html>",
    );
    const text = nodes
      .flatMap((n) => (n.kind === "paragraph" ? n.runs.map((r) => r.text) : []))
      .join("");
    expect(text).toBe("keep");
  });

  it("returns no nodes for comment-only content", () => {
    expect(parseHtml("<div><!-- comment only --></div>")).toEqual([]);
  });

  it("keeps an unrecognized custom element inline mid-sentence", () => {
    // Regression: a tag that is neither a known inline tag nor a known
    // block tag (a custom element, here) must not force a paragraph
    // boundary on its own -- only a recognized block tag, or an unknown
    // wrapper that itself contains one, should do that.
    const nodes = parseHtml("Hello <custom-tag>world</custom-tag> today.");
    expect(nodes).toHaveLength(1);
    const runs = nodes[0].kind === "paragraph" ? nodes[0].runs : [];
    expect(runs.map((r) => r.text).join("")).toBe("Hello world today.");
  });

  it("keeps an inline <svg> mid-sentence from splitting the paragraph", () => {
    const nodes = parseHtml(
      'before <svg viewBox="0 0 10 10"><circle r="5"/></svg> after',
    );
    expect(nodes).toHaveLength(1);
    const runs = nodes[0].kind === "paragraph" ? nodes[0].runs : [];
    const text = runs.map((r) => r.text).join("");
    expect(text).toContain("before");
    expect(text).toContain("after");
  });

  it("treats <button> as inline formatting mid-sentence", () => {
    // button/video/audio/picture/select/... aren't in BLOCK_TAGS or
    // INLINE_TAGS; they must default to inline like any other unrecognized
    // element without block-level descendants.
    const nodes = parseHtml("Click <button>here</button> to continue.");
    expect(nodes).toHaveLength(1);
    const runs = nodes[0].kind === "paragraph" ? nodes[0].runs : [];
    expect(runs.map((r) => r.text).join("")).toBe("Click here to continue.");
  });

  it("treats an unrecognized wrapper as a block boundary when it contains a real block element", () => {
    // The inline default for unknown elements is overridden the moment the
    // wrapper genuinely contains a recognized block-level descendant.
    const nodes = parseHtml("<random-widget><p>inside</p></random-widget>");
    expect(nodes).toEqual([{ kind: "paragraph", runs: [{ text: "inside" }] }]);
  });

  it("treats a <strong> wrapping block content as a block container and preserves bold on both", () => {
    // Regression: before the fix, blocksFrom's block-container recursion
    // only threaded an inherited link down, so wrapping mark-bearing tags
    // like <strong> lost their mark entirely when they wrapped <p>s.
    const nodes = parseHtml("<strong><p>one</p><p>two</p></strong>");
    expect(nodes).toEqual([
      { kind: "paragraph", runs: [{ text: "one", bold: true }] },
      { kind: "paragraph", runs: [{ text: "two", bold: true }] },
    ]);
  });

  it("treats an <em> wrapping a block as a block container and preserves italic", () => {
    const nodes = parseHtml("<em><p>one</p></em>");
    expect(nodes).toEqual([
      { kind: "paragraph", runs: [{ text: "one", italic: true }] },
    ]);
  });

  it("accumulates both marks for nested mark-bearing wrappers around a block", () => {
    const nodes = parseHtml("<strong><em><p>x</p></em></strong>");
    expect(nodes).toEqual([
      { kind: "paragraph", runs: [{ text: "x", bold: true, italic: true }] },
    ]);
  });

  it("keeps both bold and link when a <strong> wraps an <a> wrapping a block", () => {
    const nodes = parseHtml(
      '<strong><a href="https://e.com"><p>one</p></a></strong>',
    );
    expect(nodes).toEqual([
      {
        kind: "paragraph",
        runs: [{ text: "one", bold: true, link: "https://e.com" }],
      },
    ]);
  });

  it("keeps containsBlockLevelContent fast on deeply nested anchors", () => {
    // Regression for the manual recursive walk that used to back
    // containsBlockLevelContent: a 200-deep <div><a><span>...</span></a>
    // </div> chain used to take ~1.7s because the walk was re-entered for
    // every ancestor <a>. The querySelector-based implementation should
    // make this effectively instant.
    const depth = 200;
    let html = "";
    for (let i = 0; i < depth; i++) html += "<div><a><span>";
    html += "leaf text";
    for (let i = 0; i < depth; i++) html += "</span></a></div>";

    const start = performance.now();
    const nodes = parseHtml(html);
    const elapsed = performance.now() - start;

    expect(nodes.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(500);
  });
});
