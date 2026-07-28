import type { DocNode, InlineRun } from "./types";

// Content from these elements must never reach the output (per the plan):
// script/style/noscript bodies aren't visible text, template content isn't
// "live" DOM at all, and head metadata isn't document content.
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "HEAD"]);

// Genuine inline-level elements: they may carry formatting (or, for
// `<img>`/`<br>`, contribute a single run) but never introduce a paragraph
// break on their own.
const INLINE_TAGS = new Set([
  "A",
  "SPAN",
  "STRONG",
  "B",
  "EM",
  "I",
  "CODE",
  "KBD",
  "SAMP",
  "VAR",
  "SMALL",
  "SUP",
  "SUB",
  "MARK",
  "ABBR",
  "CITE",
  "Q",
  "TIME",
  "U",
  "S",
  "DEL",
  "INS",
  "BDI",
  "BDO",
  "WBR",
  "IMG",
  "BR",
  "LABEL",
  "OUTPUT",
  "BIG",
  "TT",
  "FONT",
]);

// Genuine block-level elements: `blocksFrom` always gives these a paragraph
// boundary. Enumerated generously and explicitly (rather than inferred from
// "not inline") so that a wrapper we've never heard of -- a custom element,
// `<svg>`, a future HTML addition -- doesn't get lumped in with them; see
// the three-way decision in `blocksFrom`'s doc comment below.
const BLOCK_TAGS = new Set([
  "P",
  "DIV",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "UL",
  "OL",
  "LI",
  "TABLE",
  "THEAD",
  "TBODY",
  "TFOOT",
  "TR",
  "TD",
  "TH",
  "BLOCKQUOTE",
  "PRE",
  "SECTION",
  "ARTICLE",
  "ASIDE",
  "HEADER",
  "FOOTER",
  "NAV",
  "MAIN",
  "FIGURE",
  "FIGCAPTION",
  "DL",
  "DT",
  "DD",
  "FORM",
  "FIELDSET",
  "ADDRESS",
  "HR",
  "DETAILS",
  "SUMMARY",
]);

// A CSS selector equivalent to BLOCK_TAGS, built once, for use with the
// native `querySelector` in `containsBlockLevelContent` below.
const BLOCK_SELECTOR = [...BLOCK_TAGS]
  .map((tag) => tag.toLowerCase())
  .join(",");

const HEADING_TAG_RE = /^H[1-6]$/;

/**
 * Given a mark-bearing element and the marks already inherited from its
 * ancestors, returns the marks with this element's own contribution folded
 * in: `bold` for `<strong>`/`<b>`, `italic` for `<em>`/`<i>`, `code` for
 * `<code>`/`<kbd>`, `link` for `<a>` (its `href`). An element with no mark of
 * its own -- `<span>`, `<del>`, `<ins>`, ... -- returns `inherited`
 * unchanged. Marks nest: since each case spreads `inherited` before adding
 * its own field, `<strong><em>x</em></strong>` accumulates both `bold` and
 * `italic` rather than one clobbering the other.
 *
 * Shared by `runsFrom` (applied on the way down while producing runs) and by
 * `blocksFrom`'s block-container recursion (applied once per transparent
 * wrapper, without producing any runs itself, since the wrapper's children
 * are recursed into as blocks instead) -- so both call sites agree on which
 * tags carry which mark, rather than duplicating the tag-to-mark mapping.
 */
function addMark(
  el: Element,
  inherited: Partial<InlineRun>,
): Partial<InlineRun> {
  switch (el.tagName) {
    case "STRONG":
    case "B":
      return { ...inherited, bold: true };
    case "EM":
    case "I":
      return { ...inherited, italic: true };
    case "CODE":
    case "KBD":
      return { ...inherited, code: true };
    case "A":
      return { ...inherited, link: el.getAttribute("href") ?? undefined };
    default:
      return inherited;
  }
}

/**
 * Collapses a text node's whitespace to single spaces (matching how a
 * browser renders runs of whitespace) and drops nodes that are pure
 * whitespace. Never applied to `<pre>` content -- see the `PRE` branch in
 * `blocksFrom`, which reads `textContent` directly instead of routing
 * through this function, so indentation and blank lines inside preformatted
 * text survive untouched.
 */
function runsFrom(node: Node, inherited: Partial<InlineRun> = {}): InlineRun[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent ?? "").replace(/\s+/g, " ");
    return text.trim() === "" ? [] : [{ ...inherited, text }];
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return [];

  const el = node as Element;
  if (SKIP_TAGS.has(el.tagName)) return [];

  if (el.tagName === "BR") return [{ ...inherited, text: "\n" }];
  if (el.tagName === "IMG") {
    // Images are out of scope; alt text carries the meaning (see plan).
    const alt = el.getAttribute("alt") ?? "";
    return alt === "" ? [] : [{ ...inherited, text: alt }];
  }

  const next = addMark(el, inherited);

  return [...el.childNodes].flatMap((child) => runsFrom(child, next));
}

/**
 * True if `el` contains, anywhere in its descendants, a recognized
 * block-level element (`BLOCK_TAGS`). Used to decide whether an element that
 * is inline by default -- any `INLINE_TAGS` member (`<a>`, `<del>`, `<ins>`,
 * `<span>`, ...), or an unrecognized tag such as a custom element or `<svg>`
 * -- should instead be treated as a transparent block container: HTML5
 * permits several inline elements to wrap block content (e.g.
 * `<a href="x"><p>one</p><p>two</p></a>`, or `<del><p>one</p><p>two</p></del>`
 * from revision-tracking markup), and if we buffered that as a single inline
 * run the paragraph boundary between "one" and "two" would be lost. The same
 * logic keeps an unknown wrapper that genuinely contains a `<p>` from
 * swallowing it into an inline run.
 *
 * Delegates to the native `querySelector` rather than a hand-rolled
 * recursive walk: a single native call against the comma-joined
 * `BLOCK_SELECTOR` is both simpler and, unlike a manual per-child recursion
 * re-entered from every ancestor `<a>`, doesn't degrade badly on deeply
 * nested markup (a 200-level-deep nested-anchor fixture took ~1.7s with the
 * manual walk; this is effectively instant).
 */
function containsBlockLevelContent(el: Element): boolean {
  return el.querySelector(BLOCK_SELECTOR) !== null;
}

/**
 * Renders one HTML table as plain-text paragraphs, one per row, cells
 * joined with " | ". There is no table variant in the document model (see
 * ./types) -- degrading is expected, dropping cell content is not.
 */
function tableRowsAsParagraphs(table: Element): DocNode[] {
  const nodes: DocNode[] = [];
  for (const row of [...table.querySelectorAll("tr")]) {
    const cells = [...row.querySelectorAll("th,td")].map((c) =>
      (c.textContent ?? "").replace(/\s+/g, " ").trim(),
    );
    if (cells.length) {
      nodes.push({ kind: "paragraph", runs: [{ text: cells.join(" | ") }] });
    }
  }
  return nodes;
}

/**
 * Walks the block-level children of `el`, producing one `DocNode` per block
 * and recursing into list items / block quotes / transparent containers.
 *
 * `inherited` carries the accumulated marks of any mark-bearing ancestor
 * (`<strong>`, `<em>`, `<code>`, `<a>`, ...) down through a block container
 * recursion -- see the transparent-container branch below -- so that every
 * run produced from inside e.g. `<strong><p>one</p></strong>` still carries
 * `bold: true`, even though `<strong>` itself is being treated as
 * transparent rather than as an inline mark. Marks accumulate via the same
 * `addMark` helper `runsFrom` uses, so `<strong><a href="x"><p>one</p></a>
 * </strong>` carries both `bold` and `link` on its run.
 *
 * Content that is *not* itself a recognized block (bare text, or a genuine
 * inline element such as `<strong>`/`<a>`/`<img>` sitting directly under
 * `el` without a wrapping `<p>`) is buffered as inline runs via `runsFrom`
 * and flushed into a single paragraph the moment a real block boundary is
 * hit (or at the end of `el`'s children). Two things this buffering fixes
 * relative to reprocessing each non-block child independently:
 *
 * - `<strong>bold</strong> plain` directly under `<body>` (no wrapping
 *   `<p>`) keeps the "bold: true" mark. Recursing into `<strong>` as if it
 *   were its own block would re-enter this function fresh, losing the
 *   "inherited" formatting `runsFrom` is threading down -- marks only
 *   survive when `runsFrom` itself walks the element.
 * - A bare `<img alt="...">` not wrapped in a block element still
 *   contributes its alt text, instead of being silently dropped (an element
 *   with no block-level case and no children produces nothing if merely
 *   recursed into).
 *
 * `<p>one</p><p>two</p>` still does not glue into "onetwo": both `<p>`s are
 * recognized blocks, so each flushes the (empty) buffer, then pushes its own
 * paragraph independently.
 *
 * Which elements count as "inline" (buffered) vs. "block" (a boundary) is a
 * three-way decision, not a binary one -- enumerating only known inline tags
 * (defaulting everything else to block) glues `<figcaption>`/`<dt>`/`<dd>`
 * text to their neighbours; enumerating only known block tags (defaulting
 * everything else to inline) forces a boundary mid-sentence for any tag
 * outside that list, including a custom element or `<svg>` (see
 * `parse-html.test.ts` for both regressions):
 *
 * - Known inline tags (`INLINE_TAGS`) never get a boundary *unless* they
 *   contain a known block-level descendant (`containsBlockLevelContent`),
 *   in which case they're treated as a transparent block container instead
 *   and recursed into as blocks. HTML5's transparent content model permits
 *   several inline tags -- `<a>`, `<del>`, `<ins>`, `<span>`, `<label>`, ...
 *   -- to wrap whole paragraphs (revision-tracking and suggested-edit HTML
 *   commonly wraps a `<p>` in `<del>`/`<ins>`), and without this check the
 *   boundary between e.g. `<del><p>one</p><p>two</p></del>`'s two `<p>`s
 *   would be silently lost to the run buffer. A plain inline tag with no
 *   block-level descendant -- the common case, e.g. `<strong>bold</strong>`
 *   -- still just buffers via `runsFrom` as before. When the wrapper does
 *   carry a mark of its own -- `<strong>`, `<em>`, `<code>`, `<a>` -- that
 *   mark is folded into `inherited` (via `addMark`) before recursing, so it
 *   isn't lost just because the wrapper is being treated as transparent.
 * - Known block tags (`BLOCK_TAGS`) -- `<figcaption>`, `<dt>`/`<dd>`,
 *   `<div>`, etc. -- always get one. That is what keeps
 *   `<figure><img alt="a photo"><figcaption>Caption text</figcaption></figure>`
 *   from gluing into "a photoCaption text": `<figcaption>` is a known block
 *   tag, so it flushes the image's alt text into its own paragraph before
 *   recursing into the caption for a second one.
 * - Anything else -- a custom element, `<svg>`, a future HTML addition --
 *   defaults to inline (so `<custom-tag>` or an inline `<svg>` mid-sentence
 *   doesn't split it into three paragraphs), *unless* it contains a known
 *   block-level descendant, in which case it's treated as a transparent
 *   block container too -- the same check as above, applied to unrecognized
 *   wrappers instead of known inline tags.
 */
function blocksFrom(
  el: Element,
  inherited: Partial<InlineRun> = {},
): DocNode[] {
  const nodes: DocNode[] = [];
  let runBuffer: InlineRun[] = [];

  const flush = () => {
    if (runBuffer.length > 0) {
      nodes.push({ kind: "paragraph", runs: runBuffer });
      runBuffer = [];
    }
  };

  for (const child of [...el.childNodes]) {
    if (child.nodeType === Node.TEXT_NODE) {
      runBuffer.push(...runsFrom(child, inherited));
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const element = child as Element;
    if (SKIP_TAGS.has(element.tagName)) continue;

    const tag = element.tagName;

    if (HEADING_TAG_RE.test(tag)) {
      flush();
      nodes.push({
        kind: "heading",
        level: Number(tag[1]) as 1 | 2 | 3 | 4 | 5 | 6,
        runs: runsFrom(element, inherited),
      });
    } else if (tag === "P") {
      flush();
      const runs = runsFrom(element, inherited);
      if (runs.length) nodes.push({ kind: "paragraph", runs });
    } else if (tag === "UL" || tag === "OL") {
      flush();
      const items = [...element.children]
        .filter((li) => li.tagName === "LI")
        .map((li) => {
          const nested = blocksFrom(li, inherited);
          return nested.length
            ? nested
            : ([
                {
                  kind: "paragraph",
                  runs: runsFrom(li, inherited),
                },
              ] as DocNode[]);
        });
      nodes.push({ kind: "list", ordered: tag === "OL", items });
    } else if (tag === "PRE") {
      flush();
      // Read textContent directly -- not runsFrom -- so whitespace and
      // indentation inside preformatted content survive untouched.
      nodes.push({ kind: "code", text: element.textContent ?? "" });
    } else if (tag === "BLOCKQUOTE") {
      flush();
      nodes.push({
        kind: "quote",
        children: blocksFrom(element, inherited),
      });
    } else if (tag === "HR") {
      flush();
      nodes.push({ kind: "rule" });
    } else if (tag === "TABLE") {
      flush();
      nodes.push(...tableRowsAsParagraphs(element));
    } else if (INLINE_TAGS.has(tag) && containsBlockLevelContent(element)) {
      // Every INLINE_TAGS member is inline by default, but HTML5 permits
      // several of them -- <a>, <del>, <ins>, <span>, <label>, ... -- to
      // wrap block content (e.g. `<a href="x"><p>one</p><p>two</p></a>`, or
      // `<del><p>one</p><p>two</p></del>` from revision-tracking markup).
      // Treat any such element as a transparent block container in that
      // case -- recursing into its children as blocks -- rather than only
      // special-casing <a>. Fold this element's own mark (if any) into the
      // inherited set via `addMark` -- the same helper `runsFrom` uses --
      // before recursing, so e.g. `<strong><p>one</p></strong>` still
      // carries `bold: true` on its run even though `<strong>` itself is
      // being treated as transparent rather than as an inline mark; a
      // wrapper with no mark of its own (`<del>`, `<span>`, ...) just
      // recurses with the marks it already inherited, unchanged.
      flush();
      nodes.push(...blocksFrom(element, addMark(element, inherited)));
    } else if (INLINE_TAGS.has(tag)) {
      // Genuine inline formatting sitting directly among block-level
      // content: buffer its runs rather than recursing, so marks and alt
      // text survive even without a wrapping <p>.
      runBuffer.push(...runsFrom(element, inherited));
    } else if (!BLOCK_TAGS.has(tag) && !containsBlockLevelContent(element)) {
      // An element that is neither a known inline tag nor a known block
      // tag -- a custom element, `<svg>`, a future HTML addition -- and
      // that doesn't itself wrap any known block-level content: default to
      // inline, the same way a bare `<a>` does, so it doesn't force a
      // boundary mid-sentence (e.g. `Hello <custom-tag>world</custom-tag>
      // today.` stays one paragraph).
      runBuffer.push(...runsFrom(element, inherited));
    } else {
      // A known block tag (div/section/figure/dl/dt/dd/...), or an unknown
      // wrapper that genuinely contains block-level content: flush the
      // inline buffer, then recurse into its children as blocks.
      flush();
      nodes.push(...blocksFrom(element, inherited));
    }
  }

  flush();
  return nodes;
}

export function parseHtml(input: string): DocNode[] {
  const doc = new DOMParser().parseFromString(input, "text/html");
  return blocksFrom(doc.body);
}
