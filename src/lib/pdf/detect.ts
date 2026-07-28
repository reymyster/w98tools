import type { InputFormat } from "./types";

// Detection is a cheap heuristic, not a parser, so it never needs the whole
// document: a format is evident from its opening content. Sniffing a bounded
// leading slice (rather than the full input) keeps every check below roughly
// O(1) regardless of paste size -- important since this runs on every
// (debounced) keystroke.
const SNIFF_LENGTH = 4096;

const DOCTYPE_OR_HTML = /^\s*<(!doctype\s+html|html[\s>])/i;

const BLOCK_TAG_NAMES =
  "p|div|h[1-6]|ul|ol|li|table|blockquote|pre|article|section";
// Two flat regexes -- an opening-tag test and a closing-tag test -- instead of
// one regex spanning `open ... [\s\S]* ... close` with a backreference. The
// combined form is quadratic on input with many unclosed tags (e.g.
// "<p>".repeat(50000)): from every "<p>" the engine re-scans the remaining
// text looking for a "</p>" that never comes. Neither regex here contains a
// scan across arbitrary content, so each is a single linear pass.
const OPENING_BLOCK_TAG = new RegExp(`<(?:${BLOCK_TAG_NAMES})\\b[^>]*>`, "i");
const CLOSING_BLOCK_TAG = new RegExp(`</(?:${BLOCK_TAG_NAMES})\\s*>`, "i");

// Void / unpaired elements are unambiguously HTML on their own -- they never
// have a closing tag, so the pair check above would never catch them.
const VOID_ELEMENT = /<(?:br|img|hr)\b[^>]*>/i;

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

const MD_LINK = /\[[^\]]+\]\([^)]+\)/;
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
  if (OPENING_BLOCK_TAG.test(sniff) && CLOSING_BLOCK_TAG.test(sniff)) {
    return "html";
  }

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
