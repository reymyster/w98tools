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
- **Each widget is wrapped in its own error boundary.** `window-manager.tsx`
  wraps every rendered widget in `ErrorBoundary`
  (`src/components/error-boundary.tsx`), so a throw during one widget's
  render only unmounts that window — its fallback, `WidgetCrashed`
  (`src/components/widget-crashed.tsx`), renders as a real `Widget` with a
  Retry button wired to the boundary's `reset`. `main.tsx` adds a second,
  app-level boundary around `<App/>` as a last resort for a throw in the
  shell itself (e.g. the start bar), showing a brief message and a reload
  button. This contains a crash; it doesn't replace guarding parsers.
  `Intl.RelativeTimeFormat` throwing on a `1e400` claim decoded from a
  pasted JWT, and `inferRoot` overflowing the call stack on deeply-nested
  pasted JSON, were both fixed at the source rather than left for the
  boundary to catch. Any widget that parses untrusted input (JWTs, JSON,
  SQL, …) should still catch its own errors — a malformed paste is expected
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
- **`@emnapi/core` and `@emnapi/runtime` are pinned to 1.11.2 in both
  `overrides` and `devDependencies`, and both entries are load-bearing.**
  Three wasm32-wasi fallback packages disagree about them:
  `@tailwindcss/oxide-wasm32-wasi` asks for `^1.11.1`, while
  `@oxc-parser/binding-wasm32-wasi` and `@oxc-resolver/binding-wasm32-wasi`
  pin exactly `1.11.2`. Resolving on macOS dedupes the floating range down
  onto 1.11.2; on Linux the optional-package set differs, nothing pins it,
  and it floats to 1.11.3 — so `npm ci` rejects the lock file and CI dies in
  under 10 seconds, before lint or a single test runs. The `overrides` entry
  makes the version deterministic across platforms; the `devDependencies`
  entry is separately required because resolving on macOS otherwise omits
  `node_modules/@emnapi/runtime` from the lock *entirely* (nothing on this
  platform needs it), and Linux does. Neither ships in the bundle — they are
  wasm fallbacks that never load when native bindings are present.
- **A local `npm ci` does NOT prove CI will install.** It passed on macOS
  while CI failed on Linux twice in a row, because the two platforms compute
  different ideal trees from the same `package.json`. Regenerating the lock
  (`npm install --package-lock-only`, with or without `--prefer-online`,
  `--os=linux`, or deleting the lock first) does not fix a genuine
  cross-platform resolution split either — it only cleared 6 of the 8
  mismatches, and the last two needed the pins above. If CI fails in
  `npm ci`, read which packages it names and compare their required ranges
  with `npm view <pkg>@<version> dependencies` before regenerating anything;
  this repo has burned four commits learning that.
- **Window geometry lives in the store, and record identity is
  load-bearing.** `widget.tsx` subscribes to its own record via
  `state.windows.find(...)`, never to `state.windows` itself, so every
  action in `window-store.ts` must reuse the object identity of any record
  it doesn't change (`updateWindow`'s early-return-when-unchanged, and the
  identical guard in `bringToTop`) — rebuild an untouched record and the
  window that didn't move re-renders anyway. Crucially, `Rnd` stays
  uncontrolled during a gesture: geometry is written on `onDragStop` /
  `onResizeStop`, and there is deliberately no `onDrag` or `onResize`
  handler, because writing to the store on every animation frame would
  reintroduce exactly the cascade the `bringToTop` comment warns about.
  `geometry` also starts `null` — the store can't compute a window's
  initial rectangle itself, since centring needs the viewport and the
  preferred size is a prop of the widget — so each widget registers its own
  on mount, and `registerGeometry` is deliberately idempotent (only writes
  while `geometry` is still `null`) so a remount, which the per-widget error
  boundary makes possible, can't yank a window the user has since moved.
- **`UNTILED_WIDGETS`** in `window-store.ts` is the set of window types a
  layout command skips — currently just `Welcome`, because it opens on
  every load and tiling would otherwise arrange a splash screen beside the
  user's first real tool. It's a set rather than an equality check so the
  next non-tool window added to the app inherits the exclusion for free.
- **`window-layout.ts`'s `EDGE = 7` and `SHRINK = 15` constants deliberately
  mirror the fudge factors already in `widget.tsx`'s `moveAndResize`**, so a
  window placed by a taskbar layout lands exactly where the existing
  title-bar context menu's Left Half / Quarters commands would put it.
  Change one without the other and the two features disagree about where,
  say, "top right" means.
- **Two `window-layout-menu.tsx` traps only turned up testing the taskbar
  menu in a real browser** — unit tests passed straight through both.
  `usehooks-ts`'s `useOnClickOutside` types its ref parameter as a
  non-nullable `RefObject<HTMLElement>`, which React 19's `useRef(null)` can
  no longer satisfy, so click-outside is hand-rolled with a `mousedown`
  listener instead. And in `start-bar.tsx`, detecting a right-click on empty
  taskbar space via `e.target === e.currentTarget` silently never matches,
  because `StartBarWindowList`'s `grow-1` wrapper covers that space for
  hit-testing even though none of its buttons live there; the check is
  `e.target.closest("button")` instead. Escape also needs a
  `document`-level `keydown` listener rather than a per-row `onKeyDown`:
  opening the popup via right-click never moves focus into it, so a
  focus-dependent handler would never fire for that path.

## Dev server

[portless](https://github.com/vercel-labs/portless) serves the app at
`https://w98tools.localhost` instead of a port number:

```bash
portless
```

It reads the app name from `package.json` and runs the `dev` script, assigning
a port in the 4000–4999 range automatically.
