import type { InputFormat } from "./types";

const DOCTYPE_OR_HTML = /^\s*<(!doctype\s+html|html[\s>])/i;
const BLOCK_TAG_PAIR =
  /<(p|div|h[1-6]|ul|ol|li|table|blockquote|pre|article|section)\b[^>]*>[\s\S]*<\/\1>/i;

const FENCED_CODE = /^```|\n```/;
const ATX_HEADING = /^#{1,6}\s+\S/m;
const LIST_MARKER = /^\s*(?:[-*+]\s+\S|\d+\.\s+\S)/m;
const EMPHASIS = /(\*\*|__)\S[\s\S]*?\1|(\*|_)\S[\s\S]*?\2/;
const MD_LINK = /\[[^\]]+\]\([^)]+\)/;
const BLOCKQUOTE = /^>\s+\S/m;

/**
 * Best-effort sniffing. Always advisory — the widget shows the result and lets
 * the user override it.
 */
export function detectFormat(input: string): InputFormat {
  const trimmed = input.trim();
  if (trimmed === "") return "text";

  // Checked first: a fenced block may legitimately contain HTML as a sample.
  if (FENCED_CODE.test(trimmed)) return "markdown";

  if (DOCTYPE_OR_HTML.test(trimmed)) return "html";
  if (BLOCK_TAG_PAIR.test(trimmed)) return "html";

  if (
    ATX_HEADING.test(trimmed) ||
    LIST_MARKER.test(trimmed) ||
    BLOCKQUOTE.test(trimmed) ||
    MD_LINK.test(trimmed) ||
    EMPHASIS.test(trimmed)
  ) {
    return "markdown";
  }

  return "text";
}
