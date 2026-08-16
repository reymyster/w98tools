# w98tools

A small collection of browser-based developer tools, dressed as Windows 98.
Each tool opens in a draggable, resizable window on a desktop with a working
Start menu and taskbar. Open more than one, and the taskbar's Arrange
Windows menu can tile or cascade them for you.

Live at [w98tools.vercel.app](https://w98tools.vercel.app).

The app remembers your open windows and what you typed into them, so a
reload picks up where you left off — window contents expire after a few
days so they don't linger forever. The one exception is the JWT Decoder: a
pasted token is deliberately never written to disk, so it's gone as soon as
you close the tab.

## Tools

- **Search & Replace** — literal (non-regex) find and replace, with character counts
- **Image OCR** — extract text from an uploaded or pasted image, via tesseract.js
- **Split & Join** — split text on a delimiter and rejoin it on another
- **Prettify JSON** — format JSON, with inline validation
- **Prettify SQL** — format SQL, via sql-formatter
- **Base64 & URL** — encode or decode Base64, Base64 (URL-safe) and URL text, UTF-8 safe
- **GUID Generator** — bulk-generate v4 GUIDs in D/N/B/P format, upper or lower case
- **JSON to Types** — generate C# or TypeScript types from pasted JSON
- **JWT Decoder** — decode a JWT's header and payload, entirely client-side
- **Timestamp** — convert between epoch (seconds or milliseconds) and human-readable date formats
- **PDF Exporter** — turn text, Markdown or HTML into a PDF sized for a reMarkable

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
