import type { InputFormat } from "./types";

// Detection is a cheap heuristic, not a parser. Every check below does a
// bounded amount of work per input position (see the quantifier-bound
// comments below for how that was made true), so the only reason to cap
// input length at all is to bound the *constant* factor -- roughly a dozen
// linear passes -- on pathological multi-megabyte pastes, not to protect
// against quadratic blowup. 2,000,000 characters is far beyond any real
// document a user would paste into this tool (a full megabyte of prose
// still finishes in a few milliseconds -- see the performance tests), so
// this is set high enough that truncation should never be the reason a real
// document misclassifies, while still keeping a single keystroke on an
// absurdly large paste from blocking the UI thread.
const SNIFF_LENGTH = 2_000_000;

const DOCTYPE_OR_HTML = /^\s*<(!doctype\s+html|html[\s>])/i;

const BLOCK_TAG_NAMES =
  "p|div|h[1-6]|ul|ol|li|table|blockquote|pre|article|section";
// Two flat regex *sources* -- an opening-tag pattern and a closing-tag
// pattern -- instead of one regex spanning `open ... [\s\S]* ... close` with
// a backreference. The combined form is quadratic on input with many
// unclosed tags (e.g. "<p>".repeat(50000)): from every "<p>" the engine
// re-scans the remaining text looking for a "</p>" that never comes.
//
// The attribute scan is `[^>]{0,256}`, not `[^>]*`. A negated class has no
// backtracking ambiguity, but an *unbounded* one still re-scans to
// end-of-input from every candidate "<" when the closing ">" never appears
// ("<p ".repeat(n) with no ">" anywhere) -- O(n) starts x O(n) scan =
// O(n^2), measured in whole seconds from ~100 KB. The bound makes the
// per-position work constant; no realistic tag carries 256+ characters of
// attributes, so detection behavior is unchanged.
//
// Splitting into independent open/close tests dropped the original
// backreference's "same tag" requirement -- any open block tag plus any
// *different* closing block tag anywhere in the document used to qualify as
// HTML. hasMatchingBlockTagPair() below restores that requirement by
// collecting tag *names* from two linear matchAll() passes and checking for
// a name common to both, which never backtracks across content.
const OPENING_BLOCK_TAG_SOURCE = `<(${BLOCK_TAG_NAMES})\\b[^>]{0,256}>`;
const CLOSING_BLOCK_TAG_SOURCE = `</(${BLOCK_TAG_NAMES})\\s{0,64}>`;

/**
 * True only when some block-tag name appears as both an opening tag and a
 * closing tag somewhere in `text` (e.g. an opening `<p>` and a closing
 * `</p>`, not necessarily the same pair). A fresh RegExp is constructed on
 * each call rather than reused from module scope: matchAll() requires the
 * `g` flag, and a shared `/g` regex carries `lastIndex` across calls, which
 * would make a second call on the same input see stale (or no) matches.
 * Constructing locally sidesteps that class of bug entirely.
 */
function hasMatchingBlockTagPair(text: string): boolean {
  const openingNames = new Set<string>();
  for (const match of text.matchAll(
    new RegExp(OPENING_BLOCK_TAG_SOURCE, "gi"),
  )) {
    openingNames.add(match[1].toLowerCase());
  }
  if (openingNames.size === 0) return false;

  for (const match of text.matchAll(
    new RegExp(CLOSING_BLOCK_TAG_SOURCE, "gi"),
  )) {
    if (openingNames.has(match[1].toLowerCase())) return true;
  }
  return false;
}

// Void / unpaired elements are unambiguously HTML on their own -- they never
// have a closing tag, so the pair check above would never catch them.
// Bounded quantifier for the same reason as OPENING_BLOCK_TAG_SOURCE above.
const VOID_ELEMENT = /<(?:br|img|hr)\b[^>]{0,256}>/i;

const FENCED_CODE = /^```|\n```/;
const ATX_HEADING = /^#{1,6}\s+\S/m;
const LIST_MARKER = /^\s*(?:[-*+]\s+\S|\d+\.\s+\S)/m;

// Emphasis is deliberately narrow:
// - Matching is confined to a single line (`[^\n]` instead of `[\s\S]`) so two
//   unrelated `*`/`_` characters anywhere in a whole document no longer pair
//   up across paragraphs into one giant "match".
// - Underscore emphasis requires a word boundary around the delimiter *and*
//   forbids underscores inside the content. That excludes identifier-style
//   text (`foo_bar`, `session_token`) where the underscore never reaches a
//   boundary, and also excludes doubled-underscore identifiers like Python's
//   `__init__` / `__name__`, which otherwise sit at word boundaries just like
//   real emphasis does.
// - Only single-underscore emphasis is recognised, not `__strong__`: that is
//   exactly the shape of a dunder, so it's dropped in favor of the
//   unambiguous `**strong**` spelling.
const EMPHASIS = /(\*\*|\*)\S[^\n]*?\1|\b_[^\s_](?:[^\n_]*[^\s_])?_\b/;

// Bounded for the same reason as the tag patterns above: "[a](" repeated
// with no ")" anywhere would otherwise re-scan to end-of-input from every
// "[". 512 characters comfortably covers real link text and URLs.
const MD_LINK = /\[[^\]]{1,512}\]\([^)]{1,512}\)/;
const BLOCKQUOTE = /^>\s+\S/m;

// A GFM delimiter row: only "-", ":", "|" and whitespace, with at least one
// dash (e.g. "|---|---|", "---|---", ":--|--:").
const TABLE_DELIMITER_ROW = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

/** A row containing "|" immediately followed by a delimiter row, e.g. `| a | b |` then `|---|---|`. */
function hasMarkdownTable(text: string): boolean {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].includes("|") && TABLE_DELIMITER_ROW.test(lines[i + 1])) {
      return true;
    }
  }
  return false;
}

/**
 * Best-effort sniffing. Always advisory — the widget shows the result and lets
 * the user override it.
 */
export function detectFormat(input: string): InputFormat {
  const trimmed = input.trim();
  if (trimmed === "") return "text";

  const sniff =
    trimmed.length > SNIFF_LENGTH ? trimmed.slice(0, SNIFF_LENGTH) : trimmed;

  // Checked first: a fenced block may legitimately contain HTML as a sample.
  if (FENCED_CODE.test(sniff)) return "markdown";

  if (DOCTYPE_OR_HTML.test(sniff)) return "html";
  if (VOID_ELEMENT.test(sniff)) return "html";
  if (hasMatchingBlockTagPair(sniff)) return "html";

  if (
    ATX_HEADING.test(sniff) ||
    LIST_MARKER.test(sniff) ||
    BLOCKQUOTE.test(sniff) ||
    MD_LINK.test(sniff) ||
    EMPHASIS.test(sniff) ||
    hasMarkdownTable(sniff)
  ) {
    return "markdown";
  }

  return "text";
}
