# w98tools

Windows 98–styled browser tools. React 19, Vite 8, TypeScript 7, Tailwind 4,
and [98.css](https://jdan.github.io/98.css/) for the chrome. Each tool is a
draggable "window" managed by a zustand store.

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Vite dev server (see portless below for a named URL) |
| `npm run lint` | Biome — lint, format check and import order in one pass |
| `npm run format` | Biome with `--write` |
| `npm test` | Vitest in jsdom (`npm run test:watch` to iterate) |
| `npm run build` | `tsc -b` then `vite build` — this is also the type-check |
| `npm run doctor` | react-doctor; worth running before opening a PR |

CI runs lint → test → build on pushes to `main` and on PRs.

## Conventions

- **Biome, not ESLint.** ESLint was removed; there is no `eslint.config.js`.
  Biome owns formatting too (space/2, double quotes, 80 cols) — don't
  hand-format, just run `npm run format`.
- **TypeScript 7**, the native Go compiler. `baseUrl` no longer exists; `paths`
  resolve relative to the tsconfig that declares them.
- **Tests live next to the code** as `*.test.ts(x)` and render real components
  in jsdom rather than testing extracted helpers.

## Adding a widget

1. `src/components/widgets/<name>.tsx` — export a component taking `{ id }`
   and render inside `<Widget windowID={id}>`.
2. Add the name to the `WidgetType` union in `src/components/window-store.ts`.
3. Register the component in `widgetRegistry` in
   `src/components/window-manager.tsx` (typed as `Record<WidgetType, …>`, so a
   missing entry is a compile error).
4. Add an entry to `MENU_ITEMS` in `src/components/start-menu-items.ts`, with
   its icon in `src/assets/start-menu/`.
5. Add it to `ROADMAP` in `src/components/roadmap.ts` with `widget` set. That
   drives both the Welcome window's list and its "Implemented" percentage.

## Gotchas worth knowing

- **98.css styles bare elements**, so changing a tag can change the look.
  `<button>` gets a silver face, bevel and `min-width: 75px`; `<label>` gets
  `display: inline-flex`. A `<label>` → `<span>` swap once silently stacked the
  Start menu icons on top of their text.
- **`vite.config.ts` defines `process.env.DRAGGABLE_DEBUG`.** react-draggable
  (inside react-rnd) reads it at runtime, and Vite 8's dep pre-bundler leaves
  `process` bare — without the define, dragging or maximizing a window throws
  and unmounts the whole app to a white page. Production builds were never
  affected.
- **There is no error boundary anywhere in `src/`.** `main.tsx` renders
  `<App/>` bare, so any throw during a widget's render — not just the
  `DRAGGABLE_DEBUG` case above — unmounts the *entire* window tree to a
  white page, losing every open window's state. `Intl.RelativeTimeFormat`
  throwing on a `1e400` claim decoded from a pasted JWT, and `inferRoot`
  overflowing the call stack on deeply-nested pasted JSON, both did this
  before they were guarded. Any widget that parses untrusted input (JWTs,
  JSON, SQL, …) must catch its own errors — a malformed paste is expected
  input for these tools, not an exotic case worth letting escape render.
- **`build.cssMinify` is pinned to `esbuild`.** Vite 8 defaults to lightningcss,
  which rejects the malformed `@media (not(hover))` rule shipped inside
  `98.css@0.1.21`. That rule is invalid CSS browsers already ignore, so don't
  "fix" it — correcting it would activate dead rules and change touch styling.
- **Blank page after editing `vite.config.ts`?** The server restarts and
  re-optimizes dependencies, which orphans the HMR-timestamped entry script.
  Stop the dev server, `rm -rf node_modules/.vite`, start it again.
- **`window-manager.tsx` must export only its component.** Exporting the store
  alongside it stops Fast Refresh preserving state; that's why the store lives
  in `window-store.ts`.
- **`window.tsx` is deliberately one compound component** (`Window.Container`,
  `.TitleBar`, `.Body`, …), which is where 7 of react-doctor's `no-multi-comp`
  warnings come from. Fourteen findings are known and accepted, so treat that
  as the clean baseline rather than zero:
  - 7 × `no-multi-comp` (the compound component above)
  - 2 × `no-create-object-url-without-revoke` in `image-ocr.tsx` and
    `pdf-export.tsx` — false positives; the revoke happens through a ref the
    rule can't trace, and both are covered by tests
  - 1 × `iframe-missing-sandbox` on the PDF preview — deliberate. Every
    `sandbox` value blocks `blob:` URLs in Chrome, and the parsers reduce input
    to structured text before pdfmake sees it.
  - 2 × `async-await-in-loop` in `diagrams.ts` — deliberate. Mermaid shares
    DOM scratch space across renders, so diagrams render sequentially.
  - 1 × `js-combine-iterations` in `parse-html.ts` — pre-existing; a
    `[...children].filter().map()` chain over a handful of list items,
    not worth churning.
  - 1 × `unused-dev-dependency` (`@tesseract.js-data/eng`) — false
    positive: consumed by filesystem path in `scripts/vendor-tesseract.mjs`,
    which the import graph can't see.
- **pdfmake uses only standard-14 fonts.** `src/lib/pdf/generate.ts` dynamically
  imports `pdfmake/build/standard-fonts/Times.js` (body text) and
  `pdfmake/build/standard-fonts/Courier.js` (code blocks) — 49.15 kB and
  11.86 kB gzipped. The alternative, `build/vfs_fonts.js`, embeds Roboto at
  458 kB gzipped — roughly 7x the two files combined. pdfmake itself is also a
  dynamic import so it stays out of the main bundle; check `dist/assets/` to
  verify after any changes. A lesson learned: Courier was referenced by the
  style layer but forgot to register, so every document with code crashed PDF
  generation until caught in review. If another font name is introduced in
  `doc-def.ts`, it must be registered in `generate.ts` too.
- **tesseract.js assets are vendored, never CDN-loaded.** Without explicit
  paths, tesseract.js pulls its worker, WASM core and traineddata from
  jsdelivr at runtime — third-party executable code in this origin.
  `scripts/vendor-tesseract.mjs` (run by `predev`/`prebuild`) copies them
  from node_modules into the gitignored `public/tesseract/`, and
  `image-ocr.tsx` points `workerPath`/`corePath`/`langPath` there. If OCR
  404s on `/tesseract/*`, the vendor script didn't run.
- **The production CSP lives in `vercel.json`.** It allowlists exactly what
  the app needs (blob workers + wasm for OCR, `blob:` frames for the PDF
  preview, `data:` images for mermaid rasterization). It is deliberately not
  a meta tag — that would apply in dev and break Vite's inline preamble.
  Anything new that loads from another origin will be blocked in production
  until the policy says otherwise, and that's the point.
- **A negated character class can still be quadratic.** `[^>]*` has no
  backtracking ambiguity, but unbounded it re-scans to end-of-input from
  every candidate start when the terminator never appears — `"<br "`
  repeated took whole minutes through `detectFormat` before the quantifiers
  were bounded (`[^>]{0,256}` etc. in `detect.ts` and `parse-markdown.ts`).
  New regexes over user input need a bound on every unbounded scan, and the
  flood tests in `detect.test.ts` / `parse-markdown.test.ts` show the shape.
- **PDF link annotations are scheme-allowlisted** in `doc-def.ts`
  (`safeLink`): pdfkit writes hrefs into `/URI` actions verbatim and marked
  stopped sanitizing in v5, so only http(s)/mailto/tel/anchor/relative
  survive; a dropped link keeps its text.
- **Any new code emitter must escape for its target language.**
  `emit-csharp.ts` once interpolated a JSON key straight into a
  `[JsonPropertyName("…")]` string literal: a key containing `"` or `\`
  produced C# that failed to compile (CS1003/CS1009), and a key with a
  newline broke the literal outright (CS1010). `csharpString()` now escapes
  `\`, `"`, maps `\n`/`\r`/`\t`, and emits `\uXXXX` for other control
  characters; `emit-typescript.ts` already gets this right via
  `JSON.stringify`. Same lesson as `safeLink` above, one layer over: text
  written into a generated program, not just a generated document, needs
  escaping for *that* target's syntax.
- **Mermaid fences export as raster images, on purpose.** ` ```mermaid `
  blocks in Markdown become PNGs: mermaid draws the SVG in the browser, a
  canvas rasterizes it at 3x, pdfmake gets an `image` node
  (`src/lib/pdf/diagrams.ts`). Don't "upgrade" this to pdfmake's `{svg}`
  node: its vendored svg-to-pdfkit ignores `<style>`-element CSS when handed
  a string (its CSS mode needs a live DOM element, which pdfmake can't pass)
  and can't draw `<foreignObject>` labels, so mermaid output loses its
  styling. mermaid@11 is dynamically imported only when a document actually
  contains a diagram — after touching this area, check `dist/assets/` still
  splits it out of the main bundle. jsdom can't run mermaid (no layout or
  canvas), so unit tests inject a fake renderer and `renderMermaidToPng`
  itself is verified against the dev server.
- **`sql-formatter` is dynamically imported**, like pdfmake and mermaid — a
  74.4 kB gzipped chunk (`prettify-sql.tsx`) that shouldn't ship to every
  visitor who never opens Prettify SQL. Its loader effect calls
  `setFormat(() => fn)`, not `setFormat(fn)`: a React state setter runs a
  function argument as a reducer over the previous state, so passing the
  loaded formatter directly would call it with the old state instead of
  storing it.
- **Keep README's tool list in sync with `ROADMAP`** in
  `src/components/roadmap.ts`. The README doesn't read from the roadmap
  data, so a widget that ships without a README update leaves the README
  still calling it "Planned" (or omitting it) even once the Welcome window
  reports the roadmap 100% implemented.

## Dev server

[portless](https://github.com/vercel-labs/portless) serves the app at
`https://w98tools.localhost` instead of a port number:

```bash
portless
```

It reads the app name from `package.json` and runs the `dev` script, assigning
a port in the 4000–4999 range automatically.
