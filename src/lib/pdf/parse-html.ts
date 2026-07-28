import type { DocNode, InlineRun } from "./types";

// Content from these elements must never reach the output (per the plan):
// script/style/noscript bodies aren't visible text, template content isn't
// "live" DOM at all, and head metadata isn't document content.
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "HEAD"]);

// Genuine inline-level elements: they may carry formatting (or, for
// `<img>`/`<br>`, contribute a single run) but never introduce a paragraph
// break on their own. `blocksFrom` treats everything NOT in this set as a
// block boundary -- deliberately inverted from enumerating block tags, so
// that any element we haven't specifically thought about (a new block tag,
// a typo, a future HTML addition) degrades safely by getting a boundary
// instead of silently gluing its text to a neighbour's.
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

const HEADING_TAG_RE = /^H[1-6]$/;

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

  let next = inherited;
  switch (el.tagName) {
    case "STRONG":
    case "B":
      next = { ...inherited, bold: true };
      break;
    case "EM":
    case "I":
      next = { ...inherited, italic: true };
      break;
    case "CODE":
    case "KBD":
      next = { ...inherited, code: true };
      break;
    case "A":
      next = { ...inherited, link: el.getAttribute("href") ?? undefined };
      break;
    case "BR":
      return [{ ...inherited, text: "\n" }];
    case "IMG": {
      // Images are out of scope; alt text carries the meaning (see plan).
      const alt = el.getAttribute("alt") ?? "";
      return alt === "" ? [] : [{ ...inherited, text: alt }];
    }
  }

  return [...el.childNodes].flatMap((child) => runsFrom(child, next));
}

/**
 * True if `el` contains, directly or through further descendants, any
 * element that `blocksFrom` would treat as a block boundary (i.e. anything
 * not in `INLINE_TAGS`). Used to decide whether an `<a>` -- inline by
 * default -- should instead be treated as a transparent block container:
 * HTML5 permits an anchor to wrap block content (e.g.
 * `<a href="x"><p>one</p><p>two</p></a>`), and if we buffered that as a
 * single inline run the paragraph boundary between "one" and "two" would be
 * lost.
 */
function containsBlockLevelContent(el: Element): boolean {
  for (const child of [...el.children]) {
    if (SKIP_TAGS.has(child.tagName)) continue;
    if (!INLINE_TAGS.has(child.tagName)) return true;
    if (containsBlockLevelContent(child)) return true;
  }
  return false;
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
 * `inheritedLink` carries an ancestor `<a>`'s href down through a block
 * container recursion -- see the `A` branch below -- so that every run
 * produced from inside an anchor wrapping block content still carries the
 * link, even though the anchor itself is being treated as transparent
 * rather than as an inline mark.
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
 * Which elements count as "inline" (buffered) vs. "block" (a boundary) is
 * inverted from a naive approach: rather than enumerating known block tags
 * and treating everything else as inline, `INLINE_TAGS` enumerates known
 * inline tags and everything else -- including tags we've never heard of,
 * like `<figcaption>`, `<dt>`/`<dd>`, or a future HTML addition -- falls
 * through to the final `else` and gets a boundary. That is what keeps
 * `<figure><img alt="a photo"><figcaption>Caption text</figcaption></figure>`
 * from gluing into "a photoCaption text": `<figcaption>` isn't inline, so it
 * flushes the image's alt text into its own paragraph before recursing into
 * the caption for a second one.
 */
function blocksFrom(el: Element, inheritedLink?: string): DocNode[] {
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
      runBuffer.push(...runsFrom(child, { link: inheritedLink }));
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
        runs: runsFrom(element, { link: inheritedLink }),
      });
    } else if (tag === "P") {
      flush();
      const runs = runsFrom(element, { link: inheritedLink });
      if (runs.length) nodes.push({ kind: "paragraph", runs });
    } else if (tag === "UL" || tag === "OL") {
      flush();
      const items = [...element.children]
        .filter((li) => li.tagName === "LI")
        .map((li) => {
          const nested = blocksFrom(li, inheritedLink);
          return nested.length
            ? nested
            : ([
                {
                  kind: "paragraph",
                  runs: runsFrom(li, { link: inheritedLink }),
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
        children: blocksFrom(element, inheritedLink),
      });
    } else if (tag === "HR") {
      flush();
      nodes.push({ kind: "rule" });
    } else if (tag === "TABLE") {
      flush();
      nodes.push(...tableRowsAsParagraphs(element));
    } else if (tag === "A" && containsBlockLevelContent(element)) {
      // <a> is inline by default, but HTML5 permits it to wrap block
      // content (e.g. `<a href="x"><p>one</p><p>two</p></a>`). Treat it as
      // a transparent block container in that case -- recursing into its
      // children as blocks -- while threading its href down so every run
      // produced inside still carries the link.
      flush();
      nodes.push(
        ...blocksFrom(element, element.getAttribute("href") ?? inheritedLink),
      );
    } else if (INLINE_TAGS.has(tag)) {
      // Genuine inline formatting sitting directly among block-level
      // content: buffer its runs rather than recursing, so marks and alt
      // text survive even without a wrapping <p>.
      runBuffer.push(...runsFrom(element, { link: inheritedLink }));
    } else {
      // Anything else -- a block container we recognize (div/section/
      // figure/...), or an element we don't specifically recognize at all
      // -- is treated as a block boundary: flush the inline buffer, then
      // recurse into its children as blocks. This is what makes an unknown
      // or newly-encountered element degrade safely instead of silently
      // gluing to its neighbour.
      flush();
      nodes.push(...blocksFrom(element, inheritedLink));
    }
  }

  flush();
  return nodes;
}

export function parseHtml(input: string): DocNode[] {
  const doc = new DOMParser().parseFromString(input, "text/html");
  return blocksFrom(doc.body);
}
