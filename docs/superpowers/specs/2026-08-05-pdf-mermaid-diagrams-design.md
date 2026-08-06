# PDF Exporter: Mermaid diagrams in Markdown

**Date:** 2026-08-05
**Status:** Approved (option B — raster) by Rey in session; supersedes nothing.

## Goal

A ` ```mermaid ` fenced block in Markdown input renders as the drawn diagram
in the exported PDF instead of as a Courier code block, so flowcharts survive
the trip to the reMarkable. Invalid diagram source degrades to today's
behavior (a code block) rather than failing the export.

Also shipped alongside (already done, separate concern): the Page dropdown
defaults to A4 instead of reMarkable.

## Approach — raster, not vector

Mermaid renders SVG in the browser; the browser rasterizes that SVG onto a
canvas at 3x scale; the PNG data URL becomes a pdfmake `{ image }` node.

Vector (`{ svg }` into pdfmake) was rejected: pdfmake's vendored
svg-to-pdfkit ignores `<style>`-element CSS when handed a string (its
`useCSS` mode requires a live DOM element, which pdfmake's API cannot pass),
and Mermaid styles nearly everything through a `<style>` block. Flowchart
labels also default to `<foreignObject>`, which svg-to-pdfkit cannot draw.
Rasterizing in the browser sidesteps both: what the browser renders is what
prints. At 3x (≈288 DPI at the placed size) the raster out-resolves the
reMarkable's 226 PPI grayscale panel.

Mermaid config: `startOnLoad: false`, theme `neutral` (grayscale-friendly for
e-ink), `htmlLabels: false` so flowchart labels are SVG text — removes the
one foreignObject risk in SVG-as-image rasterization (Safari quirks).

## Pipeline

```
source ─ parseInput ─▶ DocNode[] (may contain {kind:"diagram", code})
        ─ renderDocDiagrams ─▶ DocNode[] ({kind:"image", dataUrl, width, height})
        ─ buildDocDefinition ─▶ pdfmake def ({ image, width })
```

- **types.ts** — two new `DocNode` kinds:
  - `{ kind: "diagram"; code: string }` — parsed but not yet rendered
  - `{ kind: "image"; dataUrl: string; width: number; height: number }` —
    rendered; width/height are the SVG's natural CSS-px size
- **parse-markdown.ts** — a `code` token with `lang === "mermaid"` becomes a
  `diagram` node; every other fence stays a `code` node. Parsing stays pure
  and jsdom-testable.
- **diagrams.ts** (new) — `renderDocDiagrams(nodes, render?)` walks the tree
  (diagrams can sit inside quotes/list items), replacing each `diagram` node
  via the injected `render` function (defaults to `renderMermaidToPng`); a
  render failure falls back to `{ kind: "code" }`. Returns the same array
  untouched when no diagram nodes exist, so mermaid is never imported for
  diagram-free documents. `renderMermaidToPng` dynamically imports mermaid
  (same lazy pattern as pdfmake/marked/tesseract), renders, sizes the SVG
  from its viewBox, rasterizes via `<img>` + canvas at 3x on a white fill,
  and returns the PNG data URL plus natural size.
- **doc-def.ts** — needs numeric page dimensions (A4 595.28x841.89, LETTER
  612x792, device 447x596) to compute the content box. An `image` node is
  placed at natural size (CSS px x 0.75 = pt), scaled down proportionally to
  fit content width and height, never scaled up. A raw `diagram` node that
  somehow reaches doc-def renders as a code block (total over the union).
- **pdf-export.tsx** — one added await between parse and build:
  `renderDocDiagrams(nodes)`.

## Error handling

`mermaid.render` rejects on invalid source → that node falls back to a code
block; the rest of the document still exports. Mermaid can leave an orphan
element in `document.body` after a failed render — cleaned up best-effort by
id. A failed dynamic import of mermaid (offline after deploy) also falls back
to code blocks rather than failing the export.

## Testing

jsdom cannot run mermaid (no getBBox/layout) nor canvas, so:
- `renderDocDiagrams` unit tests inject a fake render function (replacement,
  nesting, fallback-on-throw, no-op passthrough).
- parse and doc-def tests are pure as today.
- The widget test mocks `@/lib/pdf/diagrams` to prove the wiring.
- `renderMermaidToPng` itself is verified end-to-end in the real browser
  (dev-server preview), not in jsdom.

## Bundle

mermaid@11 is a large new dependency; it must stay out of the main bundle.
Verified by checking `dist/assets/` after build: mermaid lands in its own
lazy chunks, main bundle unchanged. Documented in CLAUDE.md next to the
pdfmake font note.

## Out of scope

- Vector output (revisit only if raster quality disappoints).
- Diagrams in HTML input (mermaid fences are a Markdown feature).
- Scoping the non-Latin-1 warning to exclude diagram text (the warning may
  over-warn for unicode that only appears inside a diagram; diagram text
  itself renders fine since the browser draws it).
