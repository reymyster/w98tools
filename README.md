# w98tools

A small collection of browser-based developer tools, dressed as Windows 98.
Each tool opens in a draggable, resizable window on a desktop with a working
Start menu and taskbar.

Live at [w98tools.vercel.app](https://w98tools.vercel.app).

## Tools

- **Search & Replace** — literal (non-regex) find and replace, with character counts
- **Prettify JSON** — format JSON, with inline validation
- **Image OCR** — extract text from an uploaded or pasted image, via tesseract.js
- **PDF Exporter** — turn text, Markdown or HTML into a PDF sized for a reMarkable

Planned: Split, Prettify SQL.

## Built with

React 19 · Vite 8 · TypeScript 7 · Tailwind CSS 4 ·
[98.css](https://jdan.github.io/98.css/) · zustand · react-rnd · Biome · Vitest

## Getting started

```bash
npm install
npm run dev
```

| Command | Does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run lint` | Lint and format check (Biome) |
| `npm run format` | Apply formatting and safe fixes |
| `npm test` | Run the test suite (Vitest) |
| `npm run build` | Type-check and build for production |

Contributor notes — conventions, how to add a widget, and the handful of
Vite/98.css gotchas — live in [CLAUDE.md](./CLAUDE.md).
