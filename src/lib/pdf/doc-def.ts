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
 * The named sizes above resolve to numbers only inside pdfmake, so image
 * sizing needs its own copy of the point dimensions (A4/LETTER values match
 * pdfmake's standardPageSizes).
 */
const PAGE_DIMENSIONS: Record<PageSizeName, { width: number; height: number }> =
  {
    device: DEVICE_PAGE,
    a4: { width: 595.28, height: 841.89 },
    letter: { width: 612, height: 792 },
  };

/** CSS px (an SVG's natural size) to PDF points: 96 px/in over 72 pt/in. */
const PX_TO_PT = 0.75;

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

// pdfkit copies a link's href into the PDF's /URI action verbatim, with no
// scheme validation of its own, and `marked` stopped sanitizing hrefs in v5
// -- so this is the one choke point (both the markdown and HTML parsers
// funnel through here) where javascript:/data:/file: schemes are kept out
// of the exported document. Allowlist, not blocklist: web links, mail/tel,
// same-document anchors and relative paths survive; anything else loses its
// annotation but keeps its text.
const SAFE_LINK_RE = /^(?:https?:|mailto:|tel:|#|\/|\.{0,2}\/)/i;

function safeLink(href: string | undefined): string | undefined {
  if (!href) return undefined;
  return SAFE_LINK_RE.test(href.trim()) ? href : undefined;
}

function runsToContent(runs: InlineRun[]): ContentText {
  return {
    text: runs.map((run) => {
      const link = safeLink(run.link);
      return {
        text: run.text,
        bold: run.bold,
        italics: run.italic,
        ...(run.code ? { font: "Courier" } : {}),
        ...(link ? { link, decoration: "underline" as const } : {}),
      };
    }),
  };
}

/** The area between the margins, in points -- what an image may fill. */
type ContentBox = { width: number; height: number };

function nodeToContent(node: DocNode, box: ContentBox): Content[] {
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
          stack: node.children.flatMap((child) => nodeToContent(child, box)),
          margin: [16, 0, 0, 8],
          italics: true,
        },
      ];
    case "list": {
      const items = node.items.map((blocks) => ({
        stack: blocks.flatMap((block) => nodeToContent(block, box)),
      }));
      return [
        node.ordered
          ? { ol: items, style: "body" }
          : { ul: items, style: "body" },
      ];
    }
    case "diagram":
      // Still unrendered (diagrams.ts wasn't run, or its render failed and
      // it chose to keep the node) -- degrade to the pre-diagram behavior.
      return [{ text: node.code, style: "code" }];
    case "image": {
      const naturalWidth = node.width * PX_TO_PT;
      const naturalHeight = node.height * PX_TO_PT;
      // Fit inside the content box, preserving aspect ratio (pdfmake keeps
      // it when only `width` is given) and never scaling up: a small
      // diagram at full-page size would just be a blurry diagram.
      const scale = Math.min(
        1,
        box.width / naturalWidth,
        box.height / naturalHeight,
      );
      return [
        {
          image: node.dataUrl,
          width: naturalWidth * scale,
          margin: [0, 4, 0, 8],
        },
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
  const page = PAGE_DIMENSIONS[options.pageSize];
  const box: ContentBox = {
    width: page.width - margins[0] - margins[2],
    height: page.height - margins[1] - margins[3],
  };

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
    content: nodes.flatMap((node) => nodeToContent(node, box)),
  };
}
