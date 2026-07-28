import { parseHtml } from "./parse-html";
import { parseMarkdown } from "./parse-markdown";
import type { DocNode, InputFormat } from "./types";

function parseText(input: string): DocNode[] {
  return input
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block !== "")
    .map(
      (block) => ({ kind: "paragraph", runs: [{ text: block }] }) as DocNode,
    );
}

/**
 * Routes `input` to the parser for `format`, returning the shared
 * `DocNode[]` document model consumed by the PDF builder.
 */
export async function parseInput(
  input: string,
  format: InputFormat,
): Promise<DocNode[]> {
  if (format === "markdown") return parseMarkdown(input);

  if (format === "html") {
    const nodes = parseHtml(input);
    // Malformed markup can parse to nothing; showing the raw text beats
    // showing an empty document.
    return nodes.length > 0 ? nodes : parseText(input);
  }

  return parseText(input);
}
