import type { DocNode, InlineRun } from "./types";

// Content from these elements must never reach the output (per the plan):
// script/style/noscript bodies aren't visible text, template content isn't
// "live" DOM at all, and head metadata isn't document content.
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "HEAD"]);

// Block-level containers that are transparent for our purposes: they never
// carry their own formatting, they just group other block content (which may
// itself include further nested blocks). `blocksFrom` recurses straight into
// them instead of treating their text as inline runs.
const BLOCK_CONTAINER_TAGS = new Set([
  "DIV",
  "SECTION",
  "ARTICLE",
  "MAIN",
  "ASIDE",
  "HEADER",
  "FOOTER",
  "NAV",
  "FIGURE",
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
 * Content that is *not* itself a recognized block (bare text, or an inline
 * element such as `<strong>`/`<a>`/`<img>` sitting directly under `el`
 * without a wrapping `<p>`) is buffered as inline runs via `runsFrom` and
 * flushed into a single paragraph the moment a real block boundary is hit
 * (or at the end of `el`'s children). Two things this buffering fixes
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
 */
function blocksFrom(el: Element): DocNode[] {
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
      runBuffer.push(...runsFrom(child));
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
        runs: runsFrom(element),
      });
    } else if (tag === "P") {
      flush();
      const runs = runsFrom(element);
      if (runs.length) nodes.push({ kind: "paragraph", runs });
    } else if (tag === "UL" || tag === "OL") {
      flush();
      const items = [...element.children]
        .filter((li) => li.tagName === "LI")
        .map((li) => {
          const nested = blocksFrom(li);
          return nested.length
            ? nested
            : ([{ kind: "paragraph", runs: runsFrom(li) }] as DocNode[]);
        });
      nodes.push({ kind: "list", ordered: tag === "OL", items });
    } else if (tag === "PRE") {
      flush();
      // Read textContent directly -- not runsFrom -- so whitespace and
      // indentation inside preformatted content survive untouched.
      nodes.push({ kind: "code", text: element.textContent ?? "" });
    } else if (tag === "BLOCKQUOTE") {
      flush();
      nodes.push({ kind: "quote", children: blocksFrom(element) });
    } else if (tag === "HR") {
      flush();
      nodes.push({ kind: "rule" });
    } else if (tag === "TABLE") {
      flush();
      nodes.push(...tableRowsAsParagraphs(element));
    } else if (BLOCK_CONTAINER_TAGS.has(tag)) {
      flush();
      nodes.push(...blocksFrom(element));
    } else {
      // Inline formatting (or an unrecognized element) sitting directly
      // among block-level content: buffer its runs rather than recursing,
      // so marks and alt text survive even without a wrapping <p>.
      runBuffer.push(...runsFrom(element));
    }
  }

  flush();
  return nodes;
}

export function parseHtml(input: string): DocNode[] {
  const doc = new DOMParser().parseFromString(input, "text/html");
  return blocksFrom(doc.body);
}
