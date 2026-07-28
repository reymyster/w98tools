export type InputFormat = "text" | "markdown" | "html";

export type InlineRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  /** Absolute or relative href; rendered as a link. */
  link?: string;
};

export type DocNode =
  | { kind: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; runs: InlineRun[] }
  | { kind: "paragraph"; runs: InlineRun[] }
  | { kind: "list"; ordered: boolean; items: DocNode[][] }
  | { kind: "code"; text: string }
  | { kind: "quote"; children: DocNode[] }
  | { kind: "rule" };

export type PageSizeName = "device" | "a4" | "letter";
export type MarginName = "narrow" | "normal" | "wide" | "wideOuter";

export type PdfOptions = {
  pageSize: PageSizeName;
  margin: MarginName;
  /** Shown in the header on every page. Empty string hides the header. */
  title: string;
};
