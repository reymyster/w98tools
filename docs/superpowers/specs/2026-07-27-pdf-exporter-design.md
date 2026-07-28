# PDF Exporter widget — design

**Date:** 2026-07-27
**Status:** approved, ready for implementation planning

## Purpose

Get text from a computer onto a reMarkable Paper Pure for annotation. Paste or
upload plain text, Markdown or HTML; see exactly how it will render; download a
PDF sized for the device.

Everything runs client-side. No content leaves the browser.

## Target device

reMarkable Paper Pure: 10.3", 4:3, 1872×1404 at 226 PPI.

That is 6.21" × 8.28", so the default page is **447 × 596 pt** — almost exactly
A5 height (595 pt) but ~27 pt wider. It is a compact page, so body text is
sized like a paperback (~11 pt), not like an A4 report.

A4 and US Letter are also offered for printing or sharing.

## Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| PDF output | Vector text | Sharp at any zoom on e-ink, ~50 KB files, selectable and searchable on device. Rasterising produces soft text and multi-MB files. |
| Inputs | Plain text, Markdown, HTML | Covers both writing notes and pasting an article. |
| Format choice | Auto-detect, overridable | Selector shows what detection chose. |
| Clipboard | Read `text/html` when present | Copying from a browser keeps structure without picking a format. |
| Preview | Render the real PDF | Preview *is* the export, so they cannot diverge. One rendering path. |
| Page size | Device default, plus A4 / Letter | Matches the screen with no letterboxing. |
| Margins | Adjustable: Narrow / Normal / Wide / Wide outer | Room for margin notes is a personal preference. |
| Page furniture | Page numbers + document title header | Title comes from the first heading or filename, editable before export. |
| Images | Out of scope for v1 | Alt text retained. Needs fetching, CORS, sizing. |
| Tables | Out of scope for v1, degrade to text | See "Deferred" below. |
| Library | pdfmake, dynamically imported | Pagination, wrapping and header/footer callbacks for free. |

## Architecture

Everything except byte generation is a pure function over an intermediate
document model, so the interesting logic is testable without a PDF engine or a
browser.

```
input ──▶ detect() ──▶ parse() ──▶ DocNode[] ──▶ buildDocDef() ──▶ pdfmake ──▶ Blob
           format      per-format   common       + page options    (lazy)      │
                                    model                                      ├─▶ preview iframe
                                                                               └─▶ download
```

| Module | Responsibility | Tested as |
| --- | --- | --- |
| `src/lib/pdf/detect.ts` | Sniff text / markdown / html | Pure |
| `src/lib/pdf/parse.ts` | Each format → `DocNode[]` | Pure |
| `src/lib/pdf/doc-def.ts` | `DocNode[]` + options → pdfmake definition | Pure |
| `src/components/widgets/pdf-export.tsx` | UI, debounce, blob lifecycle | jsdom |

### Document model

`DocNode` is a small union: heading (level 1–6), paragraph, list (ordered or
unordered, with nesting), code block, blockquote, horizontal rule. Inline
content is a list of runs carrying bold / italic / code / link.

Both Markdown and HTML collapse into this model, so the pdfmake mapping is
written once and neither parser knows anything about PDFs.

### Format detection

Heuristics, in order:

1. HTML if the text starts with `<!DOCTYPE` or `<html`, or contains a
   recognised block-level tag pair.
2. Markdown if it contains ATX headings, fenced code, list markers, emphasis
   pairs, or link syntax.
3. Plain text otherwise.

Detection is advisory. The selector always shows the resolved format and the
user can override it, and an override sticks until the input is cleared.

### Bundle cost

pdfmake plus its embedded font is roughly 400 KB gzipped. It is imported
dynamically when the widget first opens, so the rest of the app stays at its
current ~137 KB. This is the single largest dependency in the project and the
lazy boundary is deliberate.

## UI

Two panes, following the existing Prettify JSON layout: input left, PDF preview
right.

- Above the input: format selector (`Auto` / `Plain text` / `Markdown` /
  `HTML`) displaying the detected format.
- A **Choose File** control accepting `.txt`, `.md`, `.markdown`, `.html`,
  `.htm`.
- Below: page size, margin and document title controls.
- **Download PDF** button.

Margin presets, applied to the 447 × 596 pt default page:

| Preset | Top / bottom | Left | Right |
| --- | --- | --- | --- |
| Narrow | 28 pt | 28 pt | 28 pt |
| Normal | 40 pt | 40 pt | 40 pt |
| Wide | 56 pt | 56 pt | 56 pt |
| Wide outer | 40 pt | 40 pt | 110 pt |

"Wide outer" is the annotation-friendly option: a deliberately roomy right-hand
column for margin notes. Presets scale proportionally for A4 and Letter.

The title header and page-number footer appear on every page, including the
first.

## Behaviour

- Preview regenerates debounced at ~400 ms; stale runs are discarded so a fast
  typist never sees an older render land after a newer one.
- Blob URLs are revoked when replaced and on unmount, following the pattern
  already established in the OCR widget.
- HTML that fails to parse falls back to plain text rather than erroring.
- Empty input shows an empty state and disables Download.
- A failure to load pdfmake surfaces as an error in the preview pane, not a
  blank screen.
- Download filename derives from the title, else the uploaded filename, else
  `document.pdf`.

## Testing

- **detect** — unambiguous samples of each format, plus the ambiguous ones: a
  plain sentence containing a URL, HTML-looking text inside a fenced code
  block, Markdown with a stray `<br>`.
- **parse** — Markdown and HTML producing the expected `DocNode[]`, including
  nested lists, inline emphasis and the table-to-text degradation.
- **doc-def** — page dimensions per preset, margin application, presence of
  header and footer, title resolution order.
- **widget** — jsdom: paste updates the preview, format override sticks, empty
  input disables Download. pdfmake is mocked.
- **integration** — one test asserting real generated bytes begin with `%PDF-`.

Not tested: pdfmake's own layout correctness. That is the library's job.

## Deferred

**v2 — Markdown tables.** GFM tables are rectangular by definition, so parsing
gives a clean grid and the mapping is mechanical. The real work is the column
width strategy on a 447 pt page: measure content, set minimums, and decide what
happens when a table still does not fit.

**v2.1 — HTML tables.** Adds `colspan`/`rowspan` (which require padding the
pdfmake grid with placeholder cells to keep row lengths aligned), nested
tables, and tables used for layout. Worth doing only once the width strategy
has proven itself on the simpler Markdown case.

**Until then, v1 degrades tables to text** — each row's cells joined and
emitted as a paragraph. Losing the grid is acceptable; silently losing content
is not.

**Later — images.** Embed from data URIs and CORS-permitted URLs, scaled to fit.

**Later — the reverse direction.** Parsing annotated pages exported from the
device back into something useful. Explicitly out of scope here.
