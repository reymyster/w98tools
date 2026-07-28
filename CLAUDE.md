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
  `.TitleBar`, `.Body`, …). react-doctor reports 7 `no-multi-comp` warnings
  there and one `no-create-object-url-without-revoke` in `image-ocr.tsx` that
  it can't trace through a ref. Both are known and expected — 8 findings is the
  clean baseline.

## Dev server

[portless](https://github.com/vercel-labs/portless) serves the app at
`https://w98tools.localhost` instead of a port number:

```bash
portless
```

It reads the app name from `package.json` and runs the `dev` script, assigning
a port in the 4000–4999 range automatically.
