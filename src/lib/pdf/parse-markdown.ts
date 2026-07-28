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
  tokens?: Token[];
  depth?: number;
  ordered?: boolean;
  items?: Token[];
  href?: string;
  header?: TableCell[];
  rows?: TableCell[][];
};

type TableCell = { text: string; tokens?: Token[] };

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
      default:
        // Covers "text", "escape", "del", "html" and anything else marked
        // (or a future marked version) might hand back. If it has nested
        // tokens, recurse into them; otherwise fall back to its own text.
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
        nodes.push({ kind: "code", text: String(token.text ?? "") });
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
