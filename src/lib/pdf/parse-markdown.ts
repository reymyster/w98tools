import type { DocNode, InlineRun } from "./types";

// `marked`'s own types (`Tokens.*` / `MarkedToken`) are the source of truth
// for shapes here -- verified against the installed v18.0.7 by inspecting
// node_modules/marked/lib/marked.d.ts and by running marked.lexer() directly
// rather than trusting a remembered API. A local structural type keeps this
// module decoupled from marked's exported type names (which we can't
// reference without a static import) while still describing exactly the
// fields each branch below reads.
type Token = {
  type: string;
  text?: string;
  lang?: string;
  tokens?: Token[];
  depth?: number;
  ordered?: boolean;
  items?: Token[];
  href?: string;
  header?: TableCell[];
  rows?: TableCell[][];
};

type TableCell = { text: string; tokens?: Token[] };

// `marked` hands raw markup back as `type: "html"` tokens (both inline, e.g.
// a lone `<span>` or `<img>` tag, and block, e.g. a whole `<div>...</div>`
// chunk) rather than parsing it -- confirmed by running marked.lexer() on
// samples of each. Left alone, that raw text falls through to the generic
// "keep the token's own text" fallback below and leaks literal angle
// brackets into the PDF. `htmlFragmentText` is the single place that turns
// such a fragment into safe, readable text: `<img>` tags contribute their
// `alt` attribute (the one exception, matching how the `image` case below
// treats real markdown images), everything else has its tags stripped and
// its entities decoded. Images are still out of scope as *content* -- only
// the alt text survives.
const IMG_TAG_RE = /<img\b[^>]{0,1024}>/gi;
const ALT_ATTR_RE = /\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

/**
 * Removes every HTML comment from `text`, in place of the lazy backtracking
 * regex `/<!--[\s\S]*?-->/g` that used to live here. That pattern is
 * quadratic on input containing many unterminated `<!--` openers: from every
 * opener that never finds its `-->`, the lazy `[\s\S]*?` re-walks the entire
 * remainder of the string looking for one. Measured on
 * `"<!--".repeat(n) + "END"` with the old regex: n=5,000 -> 33ms, n=10,000 ->
 * 128ms, n=20,000 -> 511ms (growth roughly quadrupling as n doubles) --
 * consistent with the reviewer's own, larger-scale measurements (up to 70+
 * seconds at n=100,000). This file runs synchronously on the main thread of a
 * client-side exporter, so that blocks the tab on a botched paste of HTML
 * source.
 *
 * `detect.ts` hit this exact class of bug first (see the comment above
 * `OPENING_BLOCK_TAG_SOURCE` there) and fixed it by replacing a single
 * backtracking pattern with independent linear passes. This is the same
 * discipline applied here: two `indexOf` calls per comment, each resuming
 * from where the previous one left off, so the total work across the whole
 * string is linear no matter how many `<!--` openers never close. Measured
 * with this implementation on the same inputs: n=5,000/10,000/20,000/40,000/
 * 50,000/100,000 all complete in 0-2ms.
 *
 * An unterminated `<!--` (no matching `-->` before the end of `text`) drops
 * everything from that `<!--` to the end of the string, rather than keeping
 * the trailing text verbatim. That mirrors how a browser parses an unclosed
 * HTML comment: it consumes everything after it, since nothing remains to
 * signal where the comment would have ended.
 */
function stripHtmlComments(text: string): string {
  let result = "";
  let searchFrom = 0;
  while (true) {
    const start = text.indexOf("<!--", searchFrom);
    if (start === -1) {
      result += text.slice(searchFrom);
      break;
    }
    result += text.slice(searchFrom, start);
    const end = text.indexOf("-->", start + 4);
    if (end === -1) break; // unterminated: drop the remainder, see above
    searchFrom = end + 3;
  }
  return result;
}

// Matches one opening or closing tag, capturing its name when the tag starts
// with a valid HTML name character (the group is `undefined` for things like
// `<!DOCTYPE ...>`, which are stripped the same as any other unrecognized
// tag). The attribute scan is `[^>]{0,1024}`, not `[^>]*`: a negated class
// has no backtracking ambiguity, but an *unbounded* one still re-scans to
// end-of-input from every "<" when no ">" ever appears ("<a ".repeat(n)
// arrives from marked as one giant html token), which is O(n^2) -- the same
// class of blowup `stripHtmlComments` above was rewritten to avoid, reached
// through a different door. The bound makes per-position work constant;
// IMG_TAG_RE above is bounded for the same reason, sized generously since
// real <img> tags carry long src/srcset attribute values.
const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)?[^>]{0,1024}>/g;

// Block-level elements create a text boundary when stripped (see
// `htmlFragmentText`); everything else -- inline elements (`span`, `em`,
// `strong`, `a`, `code`, `sup`, `sub`, ...) and unrecognized tags -- is
// removed with no boundary, same as before this fix.
const BLOCK_TAGS = new Set([
  "p",
  "div",
  "li",
  "tr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "section",
  "article",
  "ul",
  "ol",
  "table",
  "pre",
]);

// A sentinel for "a block tag used to be here" -- deliberately not a plain
// space or "\n", and not a character real pasted text would ever contain, so
// it stays distinguishable from actual whitespace content right up until the
// final collapse step below. That distinction is what lets
// `<div>text</div>` trim down to a bare "text" while a lone `<br>` (see
// `tagBoundary` and the collapse logic in `htmlFragmentText`) still produces
// a literal "\n" even though it, too, is the fragment's only content:
// collapsing both the same way from the start would make it impossible to
// tell "structural, drop if unpaired" from "this newline IS the content"
// once they're both just whitespace. Built with `String.fromCharCode` (U+0000
// NUL) rather than a literal control character in this file, so the source
// itself never contains an invisible byte; the boundary regexes below are
// likewise built with `RegExp(...)` from a template string instead of a
// regex literal, for the same reason.
const BLOCK_BOUNDARY = String.fromCharCode(0);
const LEADING_BOUNDARY_RE = new RegExp(`^[ \\t${BLOCK_BOUNDARY}]+`);
const TRAILING_BOUNDARY_RE = new RegExp(`[ \\t${BLOCK_BOUNDARY}]+$`);
const WHITESPACE_RUN_RE = new RegExp(`[ \\t\\n${BLOCK_BOUNDARY}]+`, "g");
const EDGE_SPACE_RE = /^[ \t]+|[ \t]+$/g;

function tagBoundary(tagName: string | undefined): string {
  if (!tagName) return "";
  const name = tagName.toLowerCase();
  if (name === "br") return "\n"; // a real line break: content, not structure
  return BLOCK_TAGS.has(name) ? BLOCK_BOUNDARY : "";
}

// Single combined pattern so decoding happens in one left-to-right pass over
// the original string. Chaining separate `.replace(/&amp;/g, "&")` calls
// (one per entity) would risk a second call re-scanning text a first call
// just produced -- e.g. decoding `&amp;` before `&lt;` would turn the inert
// literal sequence "&amp;lt;" into "&lt;" now sitting in the string, ready to
// be wrongly decoded again into "<" by a later `&lt;` pass. Doing every
// entity in the same regex pass avoids that entirely.
const NAMED_ENTITY_RE = /&(?:amp|lt|gt|quot|#39|nbsp);/g;
const NAMED_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

function decodeEntities(text: string): string {
  return text.replace(NAMED_ENTITY_RE, (entity) => NAMED_ENTITIES[entity]);
}

/**
 * Converts one raw HTML fragment (an `html` token's `text`) into plain,
 * readable text.
 *
 * - `<img>` tags contribute their `alt` attribute (single- or double-quoted;
 *   missing or empty contributes nothing).
 * - Any HTML comment is dropped entirely (see `stripHtmlComments`).
 * - Block-level tags (`p`, `div`, `li`, `tr`, `h1`-`h6`, `blockquote`,
 *   `section`, `article`, `ul`, `ol`, `table`, `pre`) create a text boundary
 *   when stripped, so `<p>one</p><p>two</p>` keeps "one" and "two" apart
 *   instead of gluing them into "onetwo". Inline tags (`span`, `em`,
 *   `strong`, `a`, `code`, `sup`, `sub`, ...) and unrecognized tags don't --
 *   `<span>a</span><span>b</span>` stays "ab".
 * - `<br>` becomes a literal "\n", matching how a markdown-native hard break
 *   is handled in `inlineRuns` below (`case "br"`).
 * - Runs of whitespace introduced by the boundaries above are collapsed to a
 *   single separator so stripping never produces ragged spacing.
 *
 * Returns `""` when nothing readable remains (a bare `<div>`, an empty
 * comment, an unrecognized void tag) so callers can treat that as
 * "contribute nothing" rather than pushing an empty run/node. A lone `<br>`
 * is the one exception -- it resolves to `"\n"`, never `""`, per above.
 */
function htmlFragmentText(raw: string): string {
  const withoutComments = stripHtmlComments(raw);
  const withAltsInlined = withoutComments.replace(IMG_TAG_RE, (tag) => {
    const match = ALT_ATTR_RE.exec(tag);
    return match ? (match[1] ?? match[2] ?? "") : "";
  });
  const withBoundaries = withAltsInlined.replace(
    TAG_RE,
    (_tag, name?: string) => tagBoundary(name),
  );
  // A block boundary with nothing meaningful on one side is just leftover
  // structure, not a separator worth keeping -- drop it (and any plain
  // space/tab glued to it) from both ends. A `<br>`'s real "\n" is left
  // completely alone here, even at an edge, matching how the markdown-native
  // `br` token always contributes literal "\n" regardless of position.
  const trimmedBoundaries = withBoundaries
    .replace(LEADING_BOUNDARY_RE, "")
    .replace(TRAILING_BOUNDARY_RE, "");
  const decoded = decodeEntities(trimmedBoundaries);
  // Collapse every remaining run of whitespace/boundary characters into one
  // separator: a newline if the run carries one (from a block boundary or a
  // `<br>`), otherwise a single space.
  const collapsed = decoded.replace(WHITESPACE_RUN_RE, (run) =>
    run.includes("\n") || run.includes(BLOCK_BOUNDARY) ? "\n" : " ",
  );
  return collapsed.replace(EDGE_SPACE_RE, "");
}

/**
 * Walks a run of inline tokens, threading `inherited` formatting down into
 * nested tokens. This is what lets `**bold with *nested em* inside**`
 * produce a run that is both bold and italic: `strong` adds `bold: true` to
 * `inherited` before recursing into its own `tokens`, and when that
 * recursion later hits the nested `em`, it spreads the *already-bold*
 * `inherited` plus `italic: true` -- so the mark accumulates instead of
 * being replaced. A naive implementation that recurses with a fresh
 * `{ italic: true }` (dropping `inherited`) would lose the outer bold.
 */
function inlineRuns(
  tokens: Token[] | undefined,
  inherited: Partial<InlineRun> = {},
): InlineRun[] {
  if (!tokens) return [];
  const runs: InlineRun[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case "strong":
        runs.push(...inlineRuns(token.tokens, { ...inherited, bold: true }));
        break;
      case "em":
        runs.push(...inlineRuns(token.tokens, { ...inherited, italic: true }));
        break;
      case "codespan":
        runs.push({ ...inherited, text: String(token.text ?? ""), code: true });
        break;
      case "link":
        runs.push(
          ...inlineRuns(token.tokens, {
            ...inherited,
            link: String(token.href),
          }),
        );
        break;
      case "image":
        // Images are out of scope for the document model; only the alt text
        // (marked's `text` field for an image token) carries meaning.
        runs.push({ ...inherited, text: String(token.text ?? "") });
        break;
      case "br":
        runs.push({ ...inherited, text: "\n" });
        break;
      case "html":
        // Raw markup (e.g. a lone `<img alt="...">` or `<span>` tag) -- see
        // `htmlFragmentText` for why this can't just fall through to the
        // default branch's "use the token's own text" behavior.
        runs.push({
          ...inherited,
          text: htmlFragmentText(String(token.text ?? "")),
        });
        break;
      default:
        // Covers "text", "escape", "del" and anything else marked (or a
        // future marked version) might hand back. If it has nested tokens,
        // recurse into them; otherwise fall back to its own text.
        if (token.tokens?.length) {
          runs.push(...inlineRuns(token.tokens, inherited));
        } else if (typeof token.text === "string") {
          runs.push({ ...inherited, text: token.text });
        }
    }
  }

  return runs.filter((run) => run.text !== "");
}

/**
 * Plain-text content of a table cell. Deliberately walks `cell.tokens`
 * instead of reading `cell.text` directly: marked's `TableCell.text` is the
 * *raw* markdown source of the cell (e.g. `"**1**"`, asterisks and all), not
 * rendered text -- confirmed by running marked.lexer() on a table with a
 * formatted cell. Since table rows degrade to plain-text paragraphs here,
 * using `.text` verbatim would leak markdown syntax into the output; walking
 * the tokens strips the syntax while still keeping every character of the
 * user's data.
 */
function cellText(cell: TableCell): string {
  return inlineRuns(cell.tokens)
    .map((run) => run.text)
    .join("");
}

function blockNodes(tokens: Token[]): DocNode[] {
  const nodes: DocNode[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case "heading":
        nodes.push({
          kind: "heading",
          level: Math.min(Math.max(Number(token.depth), 1), 6) as
            | 1
            | 2
            | 3
            | 4
            | 5
            | 6,
          runs: inlineRuns(token.tokens),
        });
        break;

      case "paragraph":
        nodes.push({ kind: "paragraph", runs: inlineRuns(token.tokens) });
        break;

      case "text":
        // Block-level "text" tokens show up inside list items (a list item's
        // own tokens wrap its inline content in one of these) rather than at
        // the document root.
        nodes.push({
          kind: "paragraph",
          runs: token.tokens
            ? inlineRuns(token.tokens)
            : [{ text: String(token.text ?? "") }],
        });
        break;

      case "list": {
        const items = (token.items ?? []).map((item) =>
          blockNodes(item.tokens ?? []),
        );
        nodes.push({ kind: "list", ordered: Boolean(token.ordered), items });
        break;
      }

      case "code":
        // A mermaid fence carries a diagram, not code -- kept as its own
        // node kind so diagrams.ts can render it later without re-parsing.
        // marked's `lang` is the full info string (e.g. "mermaid theme=x"),
        // so match on its first word only.
        if (String(token.lang ?? "").split(/\s/, 1)[0] === "mermaid") {
          nodes.push({ kind: "diagram", code: String(token.text ?? "") });
        } else {
          nodes.push({ kind: "code", text: String(token.text ?? "") });
        }
        break;

      case "blockquote":
        nodes.push({
          kind: "quote",
          children: blockNodes(token.tokens ?? []),
        });
        break;

      case "hr":
        nodes.push({ kind: "rule" });
        break;

      case "table": {
        // No table variant in the document model (see ./types) -- degrade to
        // one bold paragraph for the header row and one plain paragraph per
        // body row, cells joined by " | ". Losing the grid layout is
        // acceptable; losing the user's cell data is not.
        const header = token.header ?? [];
        const rows = token.rows ?? [];
        nodes.push({
          kind: "paragraph",
          runs: [{ text: header.map(cellText).join(" | "), bold: true }],
        });
        for (const row of rows) {
          nodes.push({
            kind: "paragraph",
            runs: [{ text: row.map(cellText).join(" | ") }],
          });
        }
        break;
      }

      case "space":
        // Blank-line separators between blocks carry no content.
        break;

      case "html": {
        // A whole raw-HTML block (e.g. `<div>...</div>` or a standalone
        // `<img alt="...">`) rather than a parsed node -- see
        // `htmlFragmentText`. Degrades to a plain paragraph, or nothing at
        // all if no readable text survives stripping the markup.
        const text = htmlFragmentText(String(token.text ?? ""));
        if (text) {
          nodes.push({ kind: "paragraph", runs: [{ text }] });
        }
        break;
      }

      default:
        if (typeof token.text === "string" && token.text.trim() !== "") {
          nodes.push({ kind: "paragraph", runs: [{ text: token.text }] });
        }
    }
  }

  return nodes;
}

/**
 * Converts Markdown into the shared `DocNode[]` document model consumed by
 * the PDF builder. `marked` is imported dynamically so it stays out of the
 * main bundle -- this is the only reason the function is async.
 */
export async function parseMarkdown(input: string): Promise<DocNode[]> {
  const { marked } = await import("marked");
  return blockNodes(marked.lexer(input) as unknown as Token[]);
}
