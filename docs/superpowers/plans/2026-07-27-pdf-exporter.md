# PDF Exporter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A w98tools widget that turns pasted or uploaded plain text, Markdown or HTML into a PDF sized for a reMarkable Paper Pure, previewing the real PDF before download.

**Architecture:** Input is sniffed to a format, parsed to a shared `DocNode[]` model, mapped to a pdfmake document definition, and rendered to a Blob. Everything except the final Blob step is a pure function, so detection, parsing and mapping are unit-testable without a PDF engine or a browser. pdfmake is dynamically imported so the rest of the app does not pay for it.

**Tech Stack:** React 19, TypeScript 7, Vitest + Testing Library (jsdom), pdfmake 0.3.11, marked 18, browser `DOMParser`.

## Global Constraints

- Vector text output only. Never rasterise.
- pdfmake **must** use the standard-14 fonts via `pdfmake/build/standard-fonts/Times.js`. Do **not** import `pdfmake/build/vfs_fonts.js` — it embeds Roboto and costs 458 KB gzipped versus 48 KB for Times metrics.
- pdfmake and marked are imported **dynamically**, inside `generate.ts` only. No static import of either from widget or app code.
- Default page size is exactly `{ width: 447, height: 596 }` pt (1404×1872 px at 226 PPI).
- Default body font size is 11 pt.
- Tables degrade to text in v1: each row's cells joined with `" | "` and emitted as a paragraph. Never drop table content.
- Images are out of scope. `![alt](src)` and `<img alt>` contribute their alt text only.
- Formatting is owned by Biome. Run `npm run format`, never hand-format.
- Tests are colocated as `*.test.ts(x)` next to the code.
- Every task ends green on `npm run lint`, `npm test`, and `npm run build`.

## Verified facts

These were confirmed empirically before planning. Trust them.

- `pdfmake` 0.3.11 node generation with standard Times produces a valid PDF: 5,425 bytes, `%PDF-` header, for a heading + long paragraph + list at 447×596.
- `pdfmake/build/standard-fonts/Times.js` CommonJS-exports `{ vfs, fonts }` where `fonts` is `{ Times: { normal: 'Times-Roman', bold: 'Times-Bold', italics: 'Times-Italic', bolditalics: 'Times-BoldItalic' } }` and `vfs` has 4 AFM entries shaped `{ data, encoding }`.
- The **browser** build `pdfmake/build/pdfmake.js` exposes `createPdf`, `addFonts`, `setFonts`, `addVirtualFileSystem`, `addFontContainer`. `addVirtualFileSystem` and `addFontContainer` exist **only** in the browser build, not the node entry.
- `@types/pdfmake` covers `build/pdfmake` but **not** `build/standard-fonts/*`, so an ambient declaration is required.
- `marked.lexer()` emits block tokens `heading | paragraph | list | blockquote | code | table | space | hr` and inline tokens `text | strong | em | codespan | link`. List items carry `{ text, tokens }`; tables carry `{ header, align, rows }`.

## File structure

| File | Responsibility |
| --- | --- |
| `src/lib/pdf/types.ts` | `DocNode` / `InlineRun` model and `PdfOptions` |
| `src/lib/pdf/detect.ts` | Sniff `"text" \| "markdown" \| "html"` |
| `src/lib/pdf/parse-markdown.ts` | marked tokens → `DocNode[]` |
| `src/lib/pdf/parse-html.ts` | `DOMParser` DOM → `DocNode[]` |
| `src/lib/pdf/parse.ts` | Dispatch on format; plain-text path |
| `src/lib/pdf/doc-def.ts` | `DocNode[]` + `PdfOptions` → pdfmake definition |
| `src/lib/pdf/generate.ts` | Lazy pdfmake load, definition → `Blob` |
| `src/lib/pdf/pdfmake-standard-fonts.d.ts` | Ambient module declaration |
| `src/components/widgets/pdf-export.tsx` | Widget UI |
| `src/assets/start-menu/pdf-export.svg` | Menu icon |

Registration touches `window-store.ts`, `window-manager.tsx`, `start-menu-items.ts`, `roadmap.ts`.

---

### Task 1: Dependencies, ambient types, and a proven Blob

**Files:**
- Modify: `package.json` (dependencies)
- Create: `src/lib/pdf/pdfmake-standard-fonts.d.ts`
- Create: `src/lib/pdf/generate.ts`
- Test: `src/lib/pdf/generate.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `generatePdfBlob(docDefinition: TDocumentDefinitions): Promise<Blob>`

- [ ] **Step 1: Install dependencies**

```bash
npm i pdfmake@0.3 marked@18
npm i -D @types/pdfmake
```

- [ ] **Step 2: Add the ambient declaration**

`@types/pdfmake` has no types for the standard-font modules. Create `src/lib/pdf/pdfmake-standard-fonts.d.ts`:

```ts
declare module "pdfmake/build/standard-fonts/Times.js" {
  /** AFM metrics keyed by virtual path, e.g. "data/Times-Roman.afm". */
  const fontContainer: {
    vfs: Record<string, { data: string; encoding?: string }>;
    fonts: Record<
      string,
      { normal: string; bold: string; italics: string; bolditalics: string }
    >;
  };
  export default fontContainer;
}
```

- [ ] **Step 3: Write the failing test**

`src/lib/pdf/generate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { generatePdfBlob } from "./generate";

describe("generatePdfBlob", () => {
  it("produces bytes that begin with the PDF magic number", async () => {
    const blob = await generatePdfBlob({
      pageSize: { width: 447, height: 596 },
      defaultStyle: { font: "Times", fontSize: 11 },
      content: ["hello"],
    });

    expect(blob.size).toBeGreaterThan(0);
    const head = new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer());
    expect(head).toBe("%PDF-");
  });
});
```

- [ ] **Step 4: Run it and watch it fail**

Run: `npx vitest run src/lib/pdf/generate.test.ts`
Expected: FAIL — cannot resolve `./generate`.

- [ ] **Step 5: Implement `generate.ts`**

`loadPdfMake` is memoised so the 346 KB chunk is fetched once per session. Registering the vfs and fonts is idempotent but only worth doing on first load.

```ts
import type { TDocumentDefinitions } from "pdfmake/interfaces";

type PdfMake = {
  createPdf: (def: TDocumentDefinitions) => { getBlob: (cb: (b: Blob) => void) => void };
  addVirtualFileSystem: (vfs: Record<string, unknown>) => void;
  addFonts: (fonts: Record<string, unknown>) => void;
};

let pdfMakePromise: Promise<PdfMake> | null = null;

/**
 * Loads pdfmake and the standard-14 Times metrics on first use. Times is used
 * rather than the bundled Roboto because standard-14 fonts are not embedded in
 * the output: 48 KB gzipped of metrics instead of 458 KB of font data.
 */
function loadPdfMake(): Promise<PdfMake> {
  if (!pdfMakePromise) {
    pdfMakePromise = (async () => {
      const [pdfMakeModule, timesModule] = await Promise.all([
        import("pdfmake/build/pdfmake"),
        import("pdfmake/build/standard-fonts/Times.js"),
      ]);
      const pdfMake = (pdfMakeModule.default ?? pdfMakeModule) as PdfMake;
      const times = timesModule.default ?? timesModule;

      pdfMake.addVirtualFileSystem(times.vfs);
      pdfMake.addFonts(times.fonts);
      return pdfMake;
    })();
  }
  return pdfMakePromise;
}

export async function generatePdfBlob(
  docDefinition: TDocumentDefinitions,
): Promise<Blob> {
  const pdfMake = await loadPdfMake();
  return new Promise<Blob>((resolve) => {
    pdfMake.createPdf(docDefinition).getBlob(resolve);
  });
}
```

- [ ] **Step 6: Run the test**

Run: `npx vitest run src/lib/pdf/generate.test.ts`
Expected: PASS.

If it fails resolving `pdfmake/build/pdfmake` under jsdom, add to `vite.config.ts` `test`:

```ts
server: { deps: { inline: ["pdfmake"] } },
```

- [ ] **Step 7: Verify the lazy boundary holds**

Run: `npm run build`
Expected: PASS, and pdfmake appears in a **separate chunk**, not `index-*.js`. Confirm with:

```bash
ls -la dist/assets/ | grep -v index
```

Expected: a chunk of roughly 1 MB uncompressed containing pdfmake. If pdfmake landed inside the main bundle, a static import crept in — find and remove it.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/lib/pdf/
git commit -m "feat: lazy pdfmake loader using standard-14 Times fonts"
```

---

### Task 2: Document model and format detection

**Files:**
- Create: `src/lib/pdf/types.ts`
- Create: `src/lib/pdf/detect.ts`
- Test: `src/lib/pdf/detect.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `InputFormat`, `DocNode`, `InlineRun`, `PdfOptions`, `detectFormat(input: string): InputFormat`

- [ ] **Step 1: Write `types.ts`**

No test — these are type declarations with no runtime behaviour.

```ts
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
```

- [ ] **Step 2: Write the failing detection test**

`src/lib/pdf/detect.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { detectFormat } from "./detect";

describe("detectFormat", () => {
  it("detects a full HTML document", () => {
    expect(detectFormat("<!DOCTYPE html><html><body><p>hi</p></body></html>"))
      .toBe("html");
  });

  it("detects an HTML fragment by its block tags", () => {
    expect(detectFormat("<p>hello</p><p>world</p>")).toBe("html");
  });

  it("detects markdown headings", () => {
    expect(detectFormat("# Title\n\nSome prose.")).toBe("markdown");
  });

  it("detects markdown lists", () => {
    expect(detectFormat("Shopping:\n\n- milk\n- eggs")).toBe("markdown");
  });

  it("detects fenced code as markdown", () => {
    expect(detectFormat("Example:\n\n```js\nconst x = 1;\n```")).toBe("markdown");
  });

  it("treats prose containing a URL as plain text", () => {
    expect(detectFormat("See https://example.com for details.")).toBe("text");
  });

  it("treats a bare sentence with a dash as plain text", () => {
    expect(detectFormat("The meeting - which ran long - ended.")).toBe("text");
  });

  it("prefers markdown when HTML-looking text is inside a fence", () => {
    expect(detectFormat("```\n<p>not really html</p>\n```")).toBe("markdown");
  });

  it("treats empty input as plain text", () => {
    expect(detectFormat("   ")).toBe("text");
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run src/lib/pdf/detect.test.ts`
Expected: FAIL — cannot resolve `./detect`.

- [ ] **Step 4: Implement `detect.ts`**

Order matters: the fence check runs before the HTML check so a fenced `<p>` does not read as HTML.

```ts
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
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/pdf/detect.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pdf/types.ts src/lib/pdf/detect.ts src/lib/pdf/detect.test.ts
git commit -m "feat: document model and input format detection"
```

---

### Task 3: Markdown parser

**Files:**
- Create: `src/lib/pdf/parse-markdown.ts`
- Test: `src/lib/pdf/parse-markdown.test.ts`

**Interfaces:**
- Consumes: `DocNode`, `InlineRun` from `./types`
- Produces: `parseMarkdown(input: string): Promise<DocNode[]>` — async because marked is dynamically imported

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { parseMarkdown } from "./parse-markdown";

describe("parseMarkdown", () => {
  it("maps headings with their level", async () => {
    const nodes = await parseMarkdown("## Sub heading");
    expect(nodes).toEqual([
      { kind: "heading", level: 2, runs: [{ text: "Sub heading" }] },
    ]);
  });

  it("maps inline emphasis, code and links", async () => {
    const [node] = await parseMarkdown("A **bold** and *em* and `code` and [x](https://e.com).");
    expect(node.kind).toBe("paragraph");
    const runs = node.kind === "paragraph" ? node.runs : [];
    expect(runs).toContainEqual({ text: "bold", bold: true });
    expect(runs).toContainEqual({ text: "em", italic: true });
    expect(runs).toContainEqual({ text: "code", code: true });
    expect(runs).toContainEqual({ text: "x", link: "https://e.com" });
  });

  it("maps unordered and ordered lists", async () => {
    const [unordered] = await parseMarkdown("- one\n- two");
    expect(unordered).toMatchObject({ kind: "list", ordered: false });

    const [ordered] = await parseMarkdown("1. one\n2. two");
    expect(ordered).toMatchObject({ kind: "list", ordered: true });
  });

  it("keeps code blocks verbatim", async () => {
    const [node] = await parseMarkdown("```js\nconst x = 1;\n```");
    expect(node).toEqual({ kind: "code", text: "const x = 1;" });
  });

  it("maps blockquotes to a quote node", async () => {
    const [node] = await parseMarkdown("> quoted");
    expect(node.kind).toBe("quote");
  });

  it("degrades tables to paragraphs without losing cells", async () => {
    const nodes = await parseMarkdown("| a | b |\n|---|---|\n| 1 | 2 |");
    const text = nodes
      .flatMap((n) => (n.kind === "paragraph" ? n.runs.map((r) => r.text) : []))
      .join("");
    expect(text).toContain("a | b");
    expect(text).toContain("1 | 2");
  });

  it("keeps image alt text and drops the image", async () => {
    const [node] = await parseMarkdown("![a diagram](x.png)");
    expect(node).toMatchObject({ kind: "paragraph" });
    const runs = node.kind === "paragraph" ? node.runs : [];
    expect(runs.map((r) => r.text).join("")).toBe("a diagram");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/pdf/parse-markdown.test.ts`
Expected: FAIL — cannot resolve `./parse-markdown`.

- [ ] **Step 3: Implement `parse-markdown.ts`**

```ts
import type { DocNode, InlineRun } from "./types";

type Token = { type: string; [key: string]: unknown };

function inlineRuns(tokens: Token[] | undefined, inherited: Partial<InlineRun> = {}): InlineRun[] {
  if (!tokens) return [];
  const runs: InlineRun[] = [];

  for (const token of tokens) {
    const nested = token.tokens as Token[] | undefined;
    switch (token.type) {
      case "strong":
        runs.push(...inlineRuns(nested, { ...inherited, bold: true }));
        break;
      case "em":
        runs.push(...inlineRuns(nested, { ...inherited, italic: true }));
        break;
      case "codespan":
        runs.push({ ...inherited, text: String(token.text), code: true });
        break;
      case "link":
        runs.push(...inlineRuns(nested, { ...inherited, link: String(token.href) }));
        break;
      case "image":
        // Images are out of scope; the alt text carries the meaning.
        runs.push({ ...inherited, text: String(token.text ?? "") });
        break;
      case "br":
        runs.push({ ...inherited, text: "\n" });
        break;
      default:
        if (nested?.length) {
          runs.push(...inlineRuns(nested, inherited));
        } else if (typeof token.text === "string") {
          runs.push({ ...inherited, text: token.text });
        }
    }
  }

  return runs.filter((r) => r.text !== "");
}

function blockNodes(tokens: Token[]): DocNode[] {
  const nodes: DocNode[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case "heading":
        nodes.push({
          kind: "heading",
          level: Math.min(Math.max(Number(token.depth), 1), 6) as 1 | 2 | 3 | 4 | 5 | 6,
          runs: inlineRuns(token.tokens as Token[]),
        });
        break;

      case "paragraph":
        nodes.push({ kind: "paragraph", runs: inlineRuns(token.tokens as Token[]) });
        break;

      case "text":
        nodes.push({
          kind: "paragraph",
          runs: (token.tokens as Token[] | undefined)
            ? inlineRuns(token.tokens as Token[])
            : [{ text: String(token.text ?? "") }],
        });
        break;

      case "list": {
        const items = (token.items as Token[]).map((item) =>
          blockNodes((item.tokens as Token[]) ?? []),
        );
        nodes.push({ kind: "list", ordered: Boolean(token.ordered), items });
        break;
      }

      case "code":
        nodes.push({ kind: "code", text: String(token.text ?? "") });
        break;

      case "blockquote":
        nodes.push({ kind: "quote", children: blockNodes((token.tokens as Token[]) ?? []) });
        break;

      case "hr":
        nodes.push({ kind: "rule" });
        break;

      case "table": {
        // v1 has no table rendering. Emit each row as a paragraph so the
        // content survives even though the grid does not.
        const header = token.header as { text: string }[];
        const rows = token.rows as { text: string }[][];
        nodes.push({
          kind: "paragraph",
          runs: [{ text: header.map((c) => c.text).join(" | "), bold: true }],
        });
        for (const row of rows) {
          nodes.push({ kind: "paragraph", runs: [{ text: row.map((c) => c.text).join(" | ") }] });
        }
        break;
      }

      case "space":
        break;

      default:
        if (typeof token.text === "string" && token.text.trim() !== "") {
          nodes.push({ kind: "paragraph", runs: [{ text: token.text }] });
        }
    }
  }

  return nodes;
}

export async function parseMarkdown(input: string): Promise<DocNode[]> {
  const { marked } = await import("marked");
  return blockNodes(marked.lexer(input) as unknown as Token[]);
}
```


- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/pdf/parse-markdown.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/parse-markdown.ts src/lib/pdf/parse-markdown.test.ts
git commit -m "feat: markdown to document model parser"
```

---

### Task 4: HTML parser and format dispatch

**Files:**
- Create: `src/lib/pdf/parse-html.ts`
- Create: `src/lib/pdf/parse.ts`
- Test: `src/lib/pdf/parse-html.test.ts`
- Test: `src/lib/pdf/parse.test.ts`

**Interfaces:**
- Consumes: `DocNode`, `InlineRun`, `InputFormat`
- Produces: `parseHtml(input: string): DocNode[]`, `parseInput(input: string, format: InputFormat): Promise<DocNode[]>`

- [ ] **Step 1: Write the failing HTML test**

```ts
import { describe, expect, it } from "vitest";
import { parseHtml } from "./parse-html";

describe("parseHtml", () => {
  it("maps headings and paragraphs", () => {
    expect(parseHtml("<h2>Title</h2><p>Body</p>")).toEqual([
      { kind: "heading", level: 2, runs: [{ text: "Title" }] },
      { kind: "paragraph", runs: [{ text: "Body" }] },
    ]);
  });

  it("maps strong, em, code and anchors to runs", () => {
    const [node] = parseHtml("<p><strong>b</strong><em>i</em><code>c</code><a href='https://e.com'>l</a></p>");
    const runs = node.kind === "paragraph" ? node.runs : [];
    expect(runs).toContainEqual({ text: "b", bold: true });
    expect(runs).toContainEqual({ text: "i", italic: true });
    expect(runs).toContainEqual({ text: "c", code: true });
    expect(runs).toContainEqual({ text: "l", link: "https://e.com" });
  });

  it("maps ul and ol", () => {
    expect(parseHtml("<ul><li>a</li></ul>")[0]).toMatchObject({ kind: "list", ordered: false });
    expect(parseHtml("<ol><li>a</li></ol>")[0]).toMatchObject({ kind: "list", ordered: true });
  });

  it("degrades tables to paragraphs without losing cells", () => {
    const nodes = parseHtml("<table><tr><td>1</td><td>2</td></tr></table>");
    const text = nodes.flatMap((n) => (n.kind === "paragraph" ? n.runs.map((r) => r.text) : [])).join("");
    expect(text).toContain("1 | 2");
  });

  it("ignores script and style content", () => {
    const nodes = parseHtml("<p>keep</p><script>var evil=1</script><style>.a{}</style>");
    const text = nodes.flatMap((n) => (n.kind === "paragraph" ? n.runs.map((r) => r.text) : [])).join("");
    expect(text).toBe("keep");
    expect(text).not.toContain("evil");
  });

  it("keeps bare text not wrapped in a block element", () => {
    const nodes = parseHtml("loose text");
    expect(nodes).toEqual([{ kind: "paragraph", runs: [{ text: "loose text" }] }]);
  });

  it("keeps image alt text", () => {
    const nodes = parseHtml("<p><img alt='a chart' src='x.png'></p>");
    const text = nodes.flatMap((n) => (n.kind === "paragraph" ? n.runs.map((r) => r.text) : [])).join("");
    expect(text).toBe("a chart");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/pdf/parse-html.test.ts`
Expected: FAIL — cannot resolve `./parse-html`.

- [ ] **Step 3: Implement `parse-html.ts`**

```ts
import type { DocNode, InlineRun } from "./types";

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "HEAD"]);

function runsFrom(node: Node, inherited: Partial<InlineRun> = {}): InlineRun[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent ?? "").replace(/\s+/g, " ");
    return text.trim() === "" ? [] : [{ ...inherited, text }];
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return [];

  const el = node as HTMLElement;
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
    case "IMG":
      // Images are out of scope; alt text carries the meaning.
      return [{ ...inherited, text: el.getAttribute("alt") ?? "" }].filter((r) => r.text !== "");
  }

  return [...el.childNodes].flatMap((child) => runsFrom(child, next));
}

function blocksFrom(el: Element): DocNode[] {
  const nodes: DocNode[] = [];

  for (const child of [...el.childNodes]) {
    if (child.nodeType === Node.TEXT_NODE) {
      const runs = runsFrom(child);
      if (runs.length) nodes.push({ kind: "paragraph", runs });
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const element = child as HTMLElement;
    if (SKIP_TAGS.has(element.tagName)) continue;

    const tag = element.tagName;

    if (/^H[1-6]$/.test(tag)) {
      nodes.push({
        kind: "heading",
        level: Number(tag[1]) as 1 | 2 | 3 | 4 | 5 | 6,
        runs: runsFrom(element),
      });
    } else if (tag === "P") {
      const runs = runsFrom(element);
      if (runs.length) nodes.push({ kind: "paragraph", runs });
    } else if (tag === "UL" || tag === "OL") {
      const items = [...element.children]
        .filter((li) => li.tagName === "LI")
        .map((li) => {
          const nested = blocksFrom(li);
          return nested.length ? nested : [{ kind: "paragraph", runs: runsFrom(li) } as DocNode];
        });
      nodes.push({ kind: "list", ordered: tag === "OL", items });
    } else if (tag === "PRE") {
      nodes.push({ kind: "code", text: element.textContent ?? "" });
    } else if (tag === "BLOCKQUOTE") {
      nodes.push({ kind: "quote", children: blocksFrom(element) });
    } else if (tag === "HR") {
      nodes.push({ kind: "rule" });
    } else if (tag === "TABLE") {
      // v1 has no table rendering; keep the cell text.
      for (const row of [...element.querySelectorAll("tr")]) {
        const cells = [...row.querySelectorAll("th,td")].map(
          (c) => (c.textContent ?? "").replace(/\s+/g, " ").trim(),
        );
        if (cells.length) {
          nodes.push({ kind: "paragraph", runs: [{ text: cells.join(" | ") }] });
        }
      }
    } else {
      nodes.push(...blocksFrom(element));
    }
  }

  return nodes;
}

export function parseHtml(input: string): DocNode[] {
  const doc = new DOMParser().parseFromString(input, "text/html");
  return blocksFrom(doc.body);
}
```


- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/pdf/parse-html.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Write the failing dispatch test**

`src/lib/pdf/parse.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseInput } from "./parse";

describe("parseInput", () => {
  it("splits plain text into paragraphs on blank lines", async () => {
    const nodes = await parseInput("one\n\ntwo", "text");
    expect(nodes).toEqual([
      { kind: "paragraph", runs: [{ text: "one" }] },
      { kind: "paragraph", runs: [{ text: "two" }] },
    ]);
  });

  it("does not interpret markdown syntax in plain text mode", async () => {
    const nodes = await parseInput("# not a heading", "text");
    expect(nodes).toEqual([{ kind: "paragraph", runs: [{ text: "# not a heading" }] }]);
  });

  it("routes markdown and html to their parsers", async () => {
    expect((await parseInput("# H", "markdown"))[0]).toMatchObject({ kind: "heading" });
    expect((await parseInput("<h1>H</h1>", "html"))[0]).toMatchObject({ kind: "heading" });
  });

  it("falls back to plain text when html yields nothing", async () => {
    const nodes = await parseInput("<<<", "html");
    expect(nodes.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 6: Implement `parse.ts`**

```ts
import { parseHtml } from "./parse-html";
import { parseMarkdown } from "./parse-markdown";
import type { DocNode, InputFormat } from "./types";

function parseText(input: string): DocNode[] {
  return input
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block !== "")
    .map((block) => ({ kind: "paragraph", runs: [{ text: block }] }) as DocNode);
}

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
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run src/lib/pdf/`
Expected: PASS, all files.

- [ ] **Step 8: Commit**

```bash
git add src/lib/pdf/parse-html.ts src/lib/pdf/parse-html.test.ts src/lib/pdf/parse.ts src/lib/pdf/parse.test.ts
git commit -m "feat: html parser and format dispatch"
```

---

### Task 5: Document definition builder

**Files:**
- Create: `src/lib/pdf/doc-def.ts`
- Test: `src/lib/pdf/doc-def.test.ts`

**Interfaces:**
- Consumes: `DocNode`, `PdfOptions`
- Produces: `buildDocDefinition(nodes: DocNode[], options: PdfOptions): TDocumentDefinitions`, `PAGE_SIZES`, `MARGINS`, `resolveTitle(nodes: DocNode[], fallback: string): string`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildDocDefinition, resolveTitle } from "./doc-def";
import type { DocNode, PdfOptions } from "./types";

const options: PdfOptions = { pageSize: "device", margin: "normal", title: "Doc" };
const heading: DocNode = { kind: "heading", level: 1, runs: [{ text: "Title" }] };

describe("buildDocDefinition", () => {
  it("uses the device page size by default", () => {
    const def = buildDocDefinition([heading], options);
    expect(def.pageSize).toEqual({ width: 447, height: 596 });
  });

  it("supports A4 and Letter", () => {
    expect(buildDocDefinition([], { ...options, pageSize: "a4" }).pageSize).toBe("A4");
    expect(buildDocDefinition([], { ...options, pageSize: "letter" }).pageSize).toBe("LETTER");
  });

  it("gives the wideOuter margin a roomy right column", () => {
    const def = buildDocDefinition([], { ...options, margin: "wideOuter" });
    const [left, , right] = def.pageMargins as [number, number, number, number];
    expect(right).toBeGreaterThan(left * 2);
  });

  it("sets Times at 11pt as the default style", () => {
    const def = buildDocDefinition([heading], options);
    expect(def.defaultStyle).toMatchObject({ font: "Times", fontSize: 11 });
  });

  it("emits a header and a footer when a title is present", () => {
    const def = buildDocDefinition([heading], options);
    expect(typeof def.header).toBe("function");
    expect(typeof def.footer).toBe("function");
  });

  it("omits the header when the title is empty", () => {
    const def = buildDocDefinition([heading], { ...options, title: "" });
    expect(def.header).toBeUndefined();
    expect(typeof def.footer).toBe("function");
  });

  it("numbers pages in the footer", () => {
    const def = buildDocDefinition([heading], options);
    const footer = def.footer as (c: number, t: number) => { text: string };
    expect(footer(2, 5).text).toContain("2");
    expect(footer(2, 5).text).toContain("5");
  });

  it("renders headings larger and bolder than body text", () => {
    const def = buildDocDefinition([heading], options);
    const content = def.content as { style?: string }[];
    expect(content[0].style).toBe("h1");
    expect(def.styles?.h1).toMatchObject({ bold: true });
  });
});

describe("resolveTitle", () => {
  it("prefers the first heading", () => {
    expect(resolveTitle([heading], "file.md")).toBe("Title");
  });

  it("falls back to the supplied name", () => {
    expect(resolveTitle([{ kind: "paragraph", runs: [{ text: "x" }] }], "file.md"))
      .toBe("file.md");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/pdf/doc-def.test.ts`
Expected: FAIL — cannot resolve `./doc-def`.

- [ ] **Step 3: Implement `doc-def.ts`**

```ts
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import type { DocNode, InlineRun, MarginName, PageSizeName, PdfOptions } from "./types";

/** 1404x1872 px at 226 PPI = 6.21 x 8.28 in = 447 x 596 pt. */
export const DEVICE_PAGE = { width: 447, height: 596 } as const;

export const PAGE_SIZES: Record<PageSizeName, TDocumentDefinitions["pageSize"]> = {
  device: DEVICE_PAGE,
  a4: "A4",
  letter: "LETTER",
};

/** [left, top, right, bottom], matching pdfmake's pageMargins order. */
export const MARGINS: Record<MarginName, [number, number, number, number]> = {
  narrow: [28, 28, 28, 28],
  normal: [40, 40, 40, 40],
  wide: [56, 56, 56, 56],
  wideOuter: [40, 40, 110, 40],
};

function runsToContent(runs: InlineRun[]): Content {
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
          canvas: [{ type: "line", x1: 0, y1: 0, x2: 320, y2: 0, lineWidth: 0.5 }],
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
      const items = node.items.map((blocks) => ({ stack: blocks.flatMap(nodeToContent) }));
      return [node.ordered ? { ol: items, style: "body" } : { ul: items, style: "body" }];
    }
  }
}

export function resolveTitle(nodes: DocNode[], fallback: string): string {
  const heading = nodes.find((n) => n.kind === "heading");
  if (heading && heading.kind === "heading") {
    const text = heading.runs.map((r) => r.text).join("").trim();
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
            margin: [margins[0], 14, margins[2], 0],
          }),
        }
      : {}),
    footer: (currentPage: number, pageCount: number) => ({
      text: `${currentPage} / ${pageCount}`,
      alignment: "center" as const,
      fontSize: 8,
      color: "#666666",
      margin: [0, 6, 0, 0],
    }),
    content: nodes.flatMap(nodeToContent),
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/pdf/doc-def.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Verify a real PDF still renders through the whole chain**

Add to `src/lib/pdf/generate.test.ts`:

```ts
it("renders a parsed markdown document to a real PDF", async () => {
  const { parseInput } = await import("./parse");
  const { buildDocDefinition } = await import("./doc-def");

  const nodes = await parseInput("# Title\n\nBody text.\n\n- one\n- two", "markdown");
  const blob = await generatePdfBlob(
    buildDocDefinition(nodes, { pageSize: "device", margin: "normal", title: "T" }),
  );

  expect(blob.size).toBeGreaterThan(500);
  const head = new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer());
  expect(head).toBe("%PDF-");
});
```

Run: `npx vitest run src/lib/pdf/generate.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pdf/doc-def.ts src/lib/pdf/doc-def.test.ts src/lib/pdf/generate.test.ts
git commit -m "feat: pdfmake document definition builder"
```

---

### Task 6: Widget UI with live preview

**Files:**
- Create: `src/components/widgets/pdf-export.tsx`
- Test: `src/components/widgets/pdf-export.test.tsx`

**Interfaces:**
- Consumes: `detectFormat`, `parseInput`, `buildDocDefinition`, `resolveTitle`, `generatePdfBlob`
- Produces: `PdfExport({ id }: { id: number })`

**Note on effects:** the preview genuinely synchronises with an external system (the PDF generator) on a debounced input change, so it belongs in an effect. react-doctor may flag `no-set-state-after-await-in-effect`. Unlike the OCR case — which was triggered by a user action and belonged in a handler — this one is correct. Guard it with a cancellation flag and leave it.

- [ ] **Step 1: Write the failing test**

pdfmake is mocked so tests stay fast and jsdom never touches the real engine.

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PdfExport } from "./pdf-export";

vi.mock("@/lib/pdf/generate", () => ({
  generatePdfBlob: vi.fn(async () => new Blob(["%PDF-1.7"], { type: "application/pdf" })),
}));

beforeEach(() => {
  globalThis.URL.createObjectURL = vi.fn(() => "blob:preview");
  globalThis.URL.revokeObjectURL = vi.fn();
});

describe("PdfExport", () => {
  it("disables download while there is no input", () => {
    render(<PdfExport id={1} />);
    expect(screen.getByRole("button", { name: /download pdf/i })).toBeDisabled();
  });

  it("shows the detected format and enables download once there is content", async () => {
    const user = userEvent.setup();
    render(<PdfExport id={1} />);

    await user.type(screen.getByLabelText(/content/i), "# Hello");

    await waitFor(() => {
      expect(screen.getByLabelText(/format/i)).toHaveValue("markdown");
      expect(screen.getByRole("button", { name: /download pdf/i })).toBeEnabled();
    });
  });

  it("lets the user override the detected format", async () => {
    const user = userEvent.setup();
    render(<PdfExport id={1} />);

    await user.type(screen.getByLabelText(/content/i), "# Hello");
    await waitFor(() => expect(screen.getByLabelText(/format/i)).toHaveValue("markdown"));

    await user.selectOptions(screen.getByLabelText(/format/i), "text");
    expect(screen.getByLabelText(/format/i)).toHaveValue("text");

    // The override must survive further typing.
    await user.type(screen.getByLabelText(/content/i), "\n\nmore");
    await waitFor(() => expect(screen.getByLabelText(/format/i)).toHaveValue("text"));
  });

  it("generates a preview from the input", async () => {
    const { generatePdfBlob } = await import("@/lib/pdf/generate");
    const user = userEvent.setup();
    render(<PdfExport id={1} />);

    await user.type(screen.getByLabelText(/content/i), "hello");

    await waitFor(() => expect(generatePdfBlob).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/components/widgets/pdf-export.test.tsx`
Expected: FAIL — cannot resolve `./pdf-export`.

- [ ] **Step 3: Implement the widget**

```tsx
import { useEffect, useRef, useState } from "react";
import { Widget } from "@/components/widget";
import { detectFormat } from "@/lib/pdf/detect";
import { buildDocDefinition, resolveTitle } from "@/lib/pdf/doc-def";
import { generatePdfBlob } from "@/lib/pdf/generate";
import { parseInput } from "@/lib/pdf/parse";
import type { InputFormat, MarginName, PageSizeName } from "@/lib/pdf/types";

const DEBOUNCE_MS = 400;

export function PdfExport({ id }: { id: number }) {
  const [source, setSource] = useState("");
  const [formatOverride, setFormatOverride] = useState<InputFormat | null>(null);
  const [pageSize, setPageSize] = useState<PageSizeName>("device");
  const [margin, setMargin] = useState<MarginName>("normal");
  const [title, setTitle] = useState("");
  const [fileName, setFileName] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const previewUrlRef = useRef<string | null>(null);
  const blobRef = useRef<Blob | null>(null);

  const format = formatOverride ?? detectFormat(source);
  const hasContent = source.trim() !== "";

  // Synchronising with an external system (the PDF engine) on a debounced
  // change is what effects are for. `cancelled` keeps a slow run from
  // overwriting the result of a newer one.
  useEffect(() => {
    if (!hasContent) {
      setPreviewUrl(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setBusy(true);

    const timer = window.setTimeout(async () => {
      try {
        const nodes = await parseInput(source, format);
        const resolved = title.trim() || resolveTitle(nodes, fileName);
        const blob = await generatePdfBlob(
          buildDocDefinition(nodes, { pageSize, margin, title: resolved }),
        );
        if (cancelled) return;

        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        blobRef.current = blob;
        setPreviewUrl(url);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not build the PDF.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [source, format, pageSize, margin, title, fileName, hasContent]);

  // Release the last preview URL on unmount. Empty deps keep this
  // StrictMode-safe: the ref is null during the simulated remount.
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const handleFile = async (file: File) => {
    setFileName(file.name.replace(/\.[^.]+$/, ""));
    setSource(await file.text());
    setFormatOverride(null);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const html = e.clipboardData.getData("text/html");
    if (html) {
      e.preventDefault();
      setSource(html);
      setFormatOverride("html");
    }
  };

  const download = () => {
    if (!blobRef.current) return;
    const name = (title.trim() || fileName || "document").replace(/[^\w-]+/g, "-");
    const url = URL.createObjectURL(blobRef.current);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${name}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Widget windowID={id} initialHeight={560} initialWidth={760}>
      <Widget.Title>PDF Exporter</Widget.Title>
      <Widget.Body className="grid grid-cols-2 gap-1 lg:gap-4 pb-2 lg:pb-4">
        <div className="field-row-stacked h-full">
          <div className="field-row">
            <label htmlFor={`pdf-format-${id}`}>Format</label>
            <select
              id={`pdf-format-${id}`}
              value={format}
              onChange={(e) => setFormatOverride(e.target.value as InputFormat)}
            >
              <option value="text">Plain text</option>
              <option value="markdown">Markdown</option>
              <option value="html">HTML</option>
            </select>
            <label htmlFor={`pdf-file-${id}`} className="shadow-neumorphic cursor-pointer px-2">
              Choose File
            </label>
            <input
              id={`pdf-file-${id}`}
              type="file"
              accept=".txt,.md,.markdown,.html,.htm"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>
          <label htmlFor={`pdf-source-${id}`}>Content</label>
          <textarea
            id={`pdf-source-${id}`}
            className="h-full w-full"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            onPaste={handlePaste}
          />
        </div>

        <div className="field-row-stacked h-full">
          <label htmlFor={`pdf-preview-${id}`}>Preview</label>
          {previewUrl ? (
            <iframe
              id={`pdf-preview-${id}`}
              title="PDF preview"
              src={previewUrl}
              className="h-full w-full border border-gray-600 bg-white"
            />
          ) : (
            <div className="h-full w-full border border-gray-600 bg-white flex items-center justify-center text-center p-4">
              {error ?? "Paste or upload something to see it here."}
            </div>
          )}
        </div>
      </Widget.Body>

      <Widget.Status>
        <div className="field-row">
          <label htmlFor={`pdf-page-${id}`}>Page</label>
          <select
            id={`pdf-page-${id}`}
            value={pageSize}
            onChange={(e) => setPageSize(e.target.value as PageSizeName)}
          >
            <option value="device">reMarkable</option>
            <option value="a4">A4</option>
            <option value="letter">Letter</option>
          </select>
          <label htmlFor={`pdf-margin-${id}`}>Margin</label>
          <select
            id={`pdf-margin-${id}`}
            value={margin}
            onChange={(e) => setMargin(e.target.value as MarginName)}
          >
            <option value="narrow">Narrow</option>
            <option value="normal">Normal</option>
            <option value="wide">Wide</option>
            <option value="wideOuter">Wide outer</option>
          </select>
          <label htmlFor={`pdf-title-${id}`}>Title</label>
          <input
            id={`pdf-title-${id}`}
            type="text"
            value={title}
            placeholder="from first heading"
            onChange={(e) => setTitle(e.target.value)}
          />
          <button type="button" onClick={download} disabled={!hasContent || !previewUrl}>
            Download PDF
          </button>
        </div>
      </Widget.Status>
      {busy && <Widget.Status>Building PDF…</Widget.Status>}
    </Widget>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/widgets/pdf-export.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/widgets/pdf-export.tsx src/components/widgets/pdf-export.test.tsx
git commit -m "feat: PDF Exporter widget with live preview"
```

---

### Task 7: Register the widget

**Files:**
- Create: `src/assets/start-menu/pdf-export.svg`
- Modify: `src/components/window-store.ts` (`WidgetType` union)
- Modify: `src/components/window-manager.tsx` (`widgetRegistry`)
- Modify: `src/components/start-menu-items.ts` (`MENU_ITEMS`)
- Modify: `src/components/roadmap.ts` (`ROADMAP`)
- Test: `src/components/roadmap.test.ts` (existing — percentage assertion still holds)

**Interfaces:**
- Consumes: `PdfExport` from Task 6
- Produces: a `"PdfExport"` member of `WidgetType`

- [ ] **Step 1: Create the icon**

`src/assets/start-menu/pdf-export.svg` — a 32×32 document with a folded corner, matching the flat pixel style of the other menu icons:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges">
  <path d="M6 2h14l6 6v22H6z" fill="#fff" stroke="#0a0a0a" stroke-width="1" />
  <path d="M20 2v6h6" fill="#c0c0c0" stroke="#0a0a0a" stroke-width="1" />
  <rect x="9" y="13" width="14" height="2" fill="#0a0a0a" />
  <rect x="9" y="17" width="14" height="2" fill="#0a0a0a" />
  <rect x="9" y="21" width="9" height="2" fill="#0a0a0a" />
  <rect x="14" y="24" width="14" height="7" fill="#000080" />
  <text x="21" y="30" font-family="Arial, sans-serif" font-size="6" font-weight="bold"
        fill="#fff" text-anchor="middle">PDF</text>
</svg>
```

- [ ] **Step 2: Add to the `WidgetType` union**

In `src/components/window-store.ts`:

```ts
export type WidgetType =
  | "Help"
  | "PrettifyJson"
  | "SearchReplace"
  | "Welcome"
  | "OCR"
  | "PdfExport";
```

- [ ] **Step 3: Run the build to see the registry break**

Run: `npm run build`
Expected: FAIL — `widgetRegistry` is missing the `PdfExport` key. This is the `Record<WidgetType, …>` type doing its job.

- [ ] **Step 4: Register the component**

In `src/components/window-manager.tsx`, add the import and the entry:

```ts
import { PdfExport as PdfExportWidget } from "@/components/widgets/pdf-export";
```

```ts
const widgetRegistry: Record<WidgetType, ComponentType<{ id: number }>> = {
  Help: HelpWidget,
  PrettifyJson: PrettifyJSONWidget,
  SearchReplace: SearchReplaceWidget,
  Welcome: WelcomeWidget,
  OCR: OCRWidget,
  PdfExport: PdfExportWidget,
};
```

- [ ] **Step 5: Add the menu entry**

In `src/components/start-menu-items.ts`, add the import and an entry after Prettify JSON:

```ts
import pdfExportIcon from "@/assets/start-menu/pdf-export.svg";
```

```ts
  {
    label: "PDF Exporter",
    icon: pdfExportIcon,
    action: { kind: "open", widget: "PdfExport" },
    separatorAfter: true,
  },
```

Move `separatorAfter: true` off the Prettify JSON entry so the divider stays below the last tool rather than mid-group.

- [ ] **Step 6: Add to the roadmap**

In `src/components/roadmap.ts`, add to the `Prettify` group's sibling — a new entry under a group that fits. Add to the first group:

```ts
      { label: "PDF Export", widget: "PdfExport" },
```

- [ ] **Step 7: Run everything**

```bash
npm run lint && npm test && npm run build
```

Expected: all PASS. The roadmap percentage test recalculates from the data, so it stays green with the new entry.

- [ ] **Step 8: Verify in the browser**

Start the dev server, open the Start menu, and confirm:
- "PDF Exporter" appears with its icon
- Clicking it opens the widget
- Tabbing to it and pressing Enter opens it
- Typing `# Hello` shows a PDF in the preview pane within a second
- "Download PDF" saves a file that opens in a PDF reader

- [ ] **Step 9: Commit**

```bash
git add src/assets/start-menu/pdf-export.svg src/components/
git commit -m "feat: register the PDF Exporter widget"
```

---

### Task 8: Documentation

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the tool to the README**

Under "Tools", add:

```markdown
- **PDF Exporter** — turn text, Markdown or HTML into a PDF sized for a reMarkable
```

And remove "Split, Prettify SQL" from Planned only if those shipped — they have not, so leave that line alone.

- [ ] **Step 2: Note the pdfmake constraint in CLAUDE.md**

Under "Gotchas worth knowing", add:

```markdown
- **pdfmake must use the standard-14 fonts.** `src/lib/pdf/generate.ts` imports
  `pdfmake/build/standard-fonts/Times.js`, not `build/vfs_fonts.js`. The latter
  embeds Roboto and costs 458 KB gzipped against 48 KB for Times metrics.
  pdfmake is also dynamically imported so it stays out of the main bundle —
  keep it that way, and check `dist/assets/` after changes.
```

- [ ] **Step 3: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: document the PDF Exporter and its pdfmake constraints"
```

---

## Self-review notes

- **Spec coverage.** Vector output → Task 1. Three formats + detection → Tasks 2–4. Clipboard HTML → Task 6 `handlePaste`. Preview-is-the-export → Task 6. Page sizes and margin presets → Task 5. Page numbers and title header → Task 5. Images to alt text → Tasks 3, 4. Tables degrade to text → Tasks 3, 4. Lazy pdfmake → Task 1 step 7. Filename resolution → Task 6 `download`.
- **Type consistency.** `PdfOptions` fields (`pageSize`, `margin`, `title`) are used identically in Tasks 5 and 6. `parseInput(input, format)` and `generatePdfBlob(def)` signatures match across Tasks 1, 4, 5 and 6.
