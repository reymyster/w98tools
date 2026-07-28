import type {
  Content,
  ContentText,
  TDocumentDefinitions,
} from "pdfmake/interfaces";
import type {
  DocNode,
  InlineRun,
  MarginName,
  PageSizeName,
  PdfOptions,
} from "./types";

/** 1404x1872 px at 226 PPI = 6.21 x 8.28 in = 447 x 596 pt. */
export const DEVICE_PAGE = { width: 447, height: 596 } as const;

export const PAGE_SIZES: Record<
  PageSizeName,
  TDocumentDefinitions["pageSize"]
> = {
  device: DEVICE_PAGE,
  a4: "A4",
  letter: "LETTER",
};

/**
 * [left, top, right, bottom], matching pdfmake's 4-tuple pageMargins order
 * (verified against pdfmake's normalizePageMargin, which maps a 4-element
 * array to { left: [0], top: [1], right: [2], bottom: [3] }).
 *
 * wideOuter leaves a roomy right margin for handwritten notes on the
 * target e-ink tablet; left/top/bottom stay at the "normal" width.
 */
export const MARGINS: Record<MarginName, [number, number, number, number]> = {
  narrow: [28, 28, 28, 28],
  normal: [40, 40, 40, 40],
  wide: [56, 56, 56, 56],
  wideOuter: [40, 40, 110, 40],
};

function runsToContent(runs: InlineRun[]): ContentText {
  return {
    text: runs.map((run) => ({
      text: run.text,
      bold: run.bold,
      italics: run.italic,
      ...(run.code ? { font: "Courier" } : {}),
      ...(run.link ? { link: run.link, decoration: "underline" as const } : {}),
    })),
  };
}

function nodeToContent(node: DocNode): Content[] {
  switch (node.kind) {
    case "heading":
      return [{ ...runsToContent(node.runs), style: `h${node.level}` }];
    case "paragraph":
      return [{ ...runsToContent(node.runs), style: "body" }];
    case "code":
      return [{ text: node.text, style: "code" }];
    case "rule":
      return [
        {
          canvas: [
            { type: "line", x1: 0, y1: 0, x2: 320, y2: 0, lineWidth: 0.5 },
          ],
          margin: [0, 8, 0, 8],
        },
      ];
    case "quote":
      return [
        {
          stack: node.children.flatMap(nodeToContent),
          margin: [16, 0, 0, 8],
          italics: true,
        },
      ];
    case "list": {
      const items = node.items.map((blocks) => ({
        stack: blocks.flatMap(nodeToContent),
      }));
      return [
        node.ordered
          ? { ol: items, style: "body" }
          : { ul: items, style: "body" },
      ];
    }
  }
}

/** Uses the first heading's text as the title, falling back when there is none. */
export function resolveTitle(nodes: DocNode[], fallback: string): string {
  const heading = nodes.find((n) => n.kind === "heading");
  if (heading && heading.kind === "heading") {
    const text = heading.runs
      .map((r) => r.text)
      .join("")
      .trim();
    if (text !== "") return text;
  }
  return fallback;
}

export function buildDocDefinition(
  nodes: DocNode[],
  options: PdfOptions,
): TDocumentDefinitions {
  const margins = MARGINS[options.margin];
  const hasTitle = options.title.trim() !== "";

  return {
    pageSize: PAGE_SIZES[options.pageSize],
    pageMargins: margins,
    defaultStyle: { font: "Times", fontSize: 11, lineHeight: 1.25 },
    styles: {
      h1: { fontSize: 20, bold: true, margin: [0, 0, 0, 8] },
      h2: { fontSize: 16, bold: true, margin: [0, 10, 0, 6] },
      h3: { fontSize: 13, bold: true, margin: [0, 8, 0, 4] },
      h4: { fontSize: 12, bold: true, margin: [0, 8, 0, 4] },
      h5: { fontSize: 11, bold: true, margin: [0, 8, 0, 4] },
      h6: { fontSize: 11, bold: true, italics: true, margin: [0, 8, 0, 4] },
      body: { margin: [0, 0, 0, 6] },
      code: { font: "Courier", fontSize: 9, margin: [0, 4, 0, 8] },
    },
    ...(hasTitle
      ? {
          header: () => ({
            text: options.title,
            fontSize: 8,
            color: "#666666",
            margin: [margins[0], 14, margins[2], 0] as [
              number,
              number,
              number,
              number,
            ],
          }),
        }
      : {}),
    footer: (currentPage: number, pageCount: number) => ({
      text: `${currentPage} / ${pageCount}`,
      alignment: "center" as const,
      fontSize: 8,
      color: "#666666",
      margin: [0, 6, 0, 0] as [number, number, number, number],
    }),
    content: nodes.flatMap(nodeToContent),
  };
}
