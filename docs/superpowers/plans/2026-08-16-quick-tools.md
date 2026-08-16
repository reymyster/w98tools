# Quick Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three small, high-frequency developer utilities — a GUID generator, a Base64/URL encoder-decoder, and an epoch↔human timestamp converter.

**Architecture:** One task per widget, each independent. No shared library is needed: the only reusable logic already exists (`relativeFromNow` in `src/lib/jwt.ts`). A fourth task updates the docs. These are deliberately small — the value is in having them one click away, not in depth.

**Tech Stack:** React 19, TypeScript 7, 98.css, zustand, Vitest + jsdom + Testing Library, Biome.

## Design decisions

No separate spec: the scope is small and the decisions are few, so they are recorded here instead.

- **All three go in the Developer submenu**, which becomes (alphabetically): Base64 & URL, GUID Generator, JSON to Types, JWT Decoder, Timestamp.
- **GUID formats mirror C#'s format specifiers** — `D` (hyphens, the default), `N` (no hyphens), `B` (braces), `P` (parentheses) — because the audience is a C# developer who will paste these next to `Guid.NewGuid().ToString("N")`. Uppercase is a separate toggle, since C# emits lowercase and SQL Server emits uppercase.
- **GUIDs come from `crypto.randomUUID()`**, not hand-rolled maths. It is a CSPRNG, it is in every browser this app targets, and it is available on `localhost` and `https` (both secure contexts). If it is ever unavailable the widget should say so rather than silently falling back to `Math.random()`, which would produce GUIDs that only look random.
- **Base64 must be UTF-8 safe.** `btoa` throws on any non-ASCII character, so encoding goes through `TextEncoder` and decoding through `TextDecoder`, the same approach `src/lib/jwt.ts` already uses. A tool that mangles `José` is worse than no tool.
- **Base64URL is offered alongside standard Base64** (`-`/`_`, no padding) because it is what JWTs and URL-safe tokens use, and this app already has a JWT decoder.
- **The timestamp widget reuses `relativeFromNow`** from `src/lib/jwt.ts` rather than reimplementing it.
- **Epoch seconds vs milliseconds is auto-detected by magnitude**, with the detection shown so the user can see what was assumed, and overridable. Guessing silently is worse than guessing visibly.
- **Persistence:** these use `usePersistentState` like the other widgets, so inputs survive a reload. Generated GUIDs are output, not input, so they are not persisted.

## Global Constraints

- **Biome owns formatting.** Space/2, double quotes, 80 cols. Never hand-format; run `npm run format`. Lint with `npm run lint`.
- **No test globals.** Every spec imports explicitly from `"vitest"`.
- **Tests live next to the code** and render real components in jsdom.
- **Each widget is registered in five places:** the component file, the `WidgetType` union in `src/components/window-store.ts`, `widgetRegistry` in `src/components/window-manager.tsx`, `MENU_ITEMS` in `src/components/start-menu-items.ts`, and `ROADMAP` in `src/components/roadmap.ts`.
- **`src/components/window-manager.tsx` must export only its component.**
- **98.css styles bare elements.** A `<button>` keeps its silver face where that is wanted (a real action button like "Generate"); menu-ish rows and inline links do not. See `welcome.tsx` for a `<button>` flattened with `!` utilities and `start-bar.tsx` for role-annotated divs.
- **Element ids must be scoped per window** (`txt_source_${id}`), or two windows of the same widget collide. Every existing widget does this.
- **Everything read from user input is untrusted.** Guard against non-finite numbers and malformed input; the app has error boundaries but CLAUDE.md's rule is that parsers handle their own errors.
- **`npm run build`** (`tsc -b && vite build`) is the type-check and must pass.
- **`npm run doctor` must stay at exactly 14 findings.** An export nothing uses trips `unused-export`.
- **Do not touch `package.json`.** CI broke for four commits over a lockfile split; CLAUDE.md documents pins that must not be disturbed.
- **No new dependencies.**

---

### Task 1: GUID Generator

**Files:**
- Create: `src/lib/guid.ts`, `src/lib/guid.test.ts`
- Create: `src/components/widgets/guid-generator.tsx`, `src/components/widgets/guid-generator.test.tsx`
- Modify: `window-store.ts`, `window-manager.tsx`, `start-menu-items.ts`, `roadmap.ts`

**Interfaces:**
- Produces: `type GuidFormat = "D" | "N" | "B" | "P"`, `formatGuid(guid: string, format: GuidFormat, upper: boolean): string`, `generateGuids(count: number, format: GuidFormat, upper: boolean): string[]`, and `GuidGenerator({ id }: { id: number })`.

- [ ] **Step 1: Write the failing library test**

`src/lib/guid.test.ts` must cover:
- `formatGuid` with `"D"` returns the canonical hyphenated form unchanged.
- `"N"` strips hyphens and returns 32 hex characters.
- `"B"` wraps in `{}` and `"P"` wraps in `()`, both keeping hyphens.
- `upper` uppercases the hex but does not affect braces or hyphens.
- `generateGuids(5, …)` returns 5 distinct values.
- Every generated value matches the RFC 4122 v4 shape: version nibble `4`, and variant nibble one of `8`, `9`, `a`, `b`.

Assert the v4 shape with an explicit regex rather than a loose "looks like a guid" check — the point is that these are real v4 GUIDs, not arbitrary hex.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/lib/guid.test.ts` — expect a module-resolution failure.

- [ ] **Step 3: Write `src/lib/guid.ts`**

`generateGuids` calls `crypto.randomUUID()`. Do **not** hand-roll randomness. If `crypto.randomUUID` is unavailable, throw a clear error rather than falling back to `Math.random()` — a GUID that only looks random is worse than an error, because collisions would surface much later as data bugs.

Cap `count` at a sane maximum (100) so a pasted number cannot lock the UI.

- [ ] **Step 4: Confirm the library test passes, then write the widget test**

`src/components/widgets/guid-generator.test.tsx` must cover:
- A GUID is generated on mount, so the window is useful immediately without a click.
- Clicking Generate produces a different value.
- Changing the count produces that many lines.
- Switching format to `N` removes hyphens from the output.
- The uppercase toggle uppercases the output.
- A count of 0 or a non-numeric count does not crash and does not produce garbage.

jsdom provides `crypto.randomUUID` in recent Node; if it is missing in this environment, stub it in the test rather than weakening the assertion — and say so in your report.

- [ ] **Step 5: Write the widget**

Layout: a count input, a format select (`D`/`N`/`B`/`P` labelled so their meaning is obvious, e.g. `D — 8-4-4-4-12`), an uppercase checkbox, a real `<button>` labelled Generate (98.css chrome is wanted here), and a read-only output textarea, one GUID per line. Status bar shows how many were generated.

Persist the count, format and uppercase choices with `usePersistentState`; do not persist the generated output.

- [ ] **Step 6: Register in all five places**

Add `"GuidGenerator"` to `WidgetType`, the registry, the Developer submenu, and `ROADMAP`'s Developer group — keeping each list alphabetical.

- [ ] **Step 7: Verify and commit**

```bash
npm run format && npm run lint && npm test && npm run build && npm run doctor
```

```bash
git add -A && git commit -m "feat: add GUID generator widget"
```

---

### Task 2: Base64 & URL encoder-decoder

**Files:**
- Create: `src/lib/encoding.ts`, `src/lib/encoding.test.ts`
- Create: `src/components/widgets/encode-decode.tsx`, `src/components/widgets/encode-decode.test.tsx`
- Modify: the same four registration files

**Interfaces:**
- Produces: `type Scheme = "base64" | "base64url" | "url-component" | "url-full"`, `encode(text: string, scheme: Scheme): string`, `decode(text: string, scheme: Scheme): string` (throws on malformed input), and `EncodeDecode({ id }: { id: number })`.

- [ ] **Step 1: Write the failing library test**

`src/lib/encoding.test.ts` must cover, for each scheme:
- Round-trip: `decode(encode(x)) === x` for plain ASCII.
- **Round-trip for non-ASCII** — `"José Müller 日本 🎉"` must survive both directions. This is the whole reason the library exists: `btoa` throws on non-ASCII, so a naive implementation fails here.
- `base64url` output contains no `+`, `/` or `=`, and decodes correctly with padding absent.
- `decode` throws on malformed Base64 (e.g. `"!!!"`).
- `url-component` encodes `&`, `=`, `?` and `/`, while `url-full` leaves the structural characters of a URL intact — assert against a real URL so the difference between the two is meaningful rather than incidental.
- Empty string round-trips to empty for every scheme.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/lib/encoding.test.ts`.

- [ ] **Step 3: Write `src/lib/encoding.ts`**

Base64 encoding goes text → `TextEncoder` → bytes → binary string → `btoa`; decoding reverses it through `atob` → bytes → `TextDecoder`. Read the equivalent code in `src/lib/jwt.ts` first and match its approach, including how it pads base64url before `atob`.

`url-component` uses `encodeURIComponent`/`decodeURIComponent`; `url-full` uses `encodeURI`/`decodeURI`. `decodeURIComponent` throws `URIError` on a malformed `%` sequence — let it throw here and let the widget catch it.

- [ ] **Step 4: Confirm the library test passes, then write the widget test**

`src/components/widgets/encode-decode.test.tsx` must cover:
- Typing text with Encode selected produces the encoded form in the output.
- Switching to Decode reverses it.
- Switching scheme re-runs the conversion on the existing input.
- Malformed input in Decode mode shows an error in the status bar and clears the output — matching how every other widget in this app reports a parse failure.
- Empty input is not an error.

- [ ] **Step 5: Write the widget**

Layout mirrors Prettify JSON: an input textarea and a read-only output textarea side by side, plus a scheme select and Encode/Decode radios. Status bar reports errors in red, following the existing widgets' pattern, with a U+00A0 placeholder so the row keeps its height.

Persist the input, scheme and direction.

- [ ] **Step 6: Register in all five places**

`"EncodeDecode"`, labelled "Base64 & URL" in the menu and roadmap.

- [ ] **Step 7: Verify and commit**

```bash
npm run format && npm run lint && npm test && npm run build && npm run doctor
```

```bash
git add -A && git commit -m "feat: add Base64 and URL encoder-decoder widget"
```

---

### Task 3: Timestamp converter

**Files:**
- Create: `src/lib/timestamp.ts`, `src/lib/timestamp.test.ts`
- Create: `src/components/widgets/timestamp.tsx`, `src/components/widgets/timestamp.test.tsx`
- Modify: the same four registration files

**Interfaces:**
- Produces: `type ParsedInstant = { ms: number; assumedUnit: "seconds" | "milliseconds" | "date-string" }`, `parseInstant(input: string): ParsedInstant | null`, and `Timestamp({ id }: { id: number })`.

- [ ] **Step 1: Write the failing library test**

`src/lib/timestamp.test.ts` must cover:
- A 10-digit number is read as **seconds**, and `assumedUnit` says so.
- A 13-digit number is read as **milliseconds**.
- An ISO 8601 string parses, with `assumedUnit` `"date-string"`.
- Surrounding whitespace is ignored.
- Empty input returns `null`.
- Garbage (`"not a date"`) returns `null` rather than `NaN` or a throw.
- **Non-finite and absurd input returns `null`** — `"1e400"`, `"Infinity"`, `"NaN"`. This repo has already been bitten once: a `1e400` JWT claim reached `Intl.RelativeTimeFormat` and threw a `RangeError` that unmounted the whole app. Do not repeat it.
- A negative epoch (pre-1970) parses rather than being rejected.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/lib/timestamp.test.ts`.

- [ ] **Step 3: Write `src/lib/timestamp.ts`**

Distinguish seconds from milliseconds by magnitude, and document the cutoff in a comment with the reasoning. Validate with `Number.isFinite` before doing anything else, and reject any value that would produce an invalid `Date`.

- [ ] **Step 4: Confirm the library test passes, then write the widget test**

`src/components/widgets/timestamp.test.tsx` must cover:
- Entering `1700000000` shows a local time, a UTC time, an ISO string, and both epoch forms.
- The widget states which unit it assumed.
- Entering an ISO string shows the matching epoch values.
- Invalid input shows an error and clears the outputs.
- The Now button fills in the current time.
- A `1e400` input does not crash the widget.

Pin the clock with `vi.useFakeTimers({ toFake: ["Date"] })` — CLAUDE.md records that faking all timers starves React's scheduler and hangs `userEvent`.

- [ ] **Step 5: Write the widget**

Layout: an input field, a Now button, and a read-only list of conversions — local, UTC, ISO 8601, epoch seconds, epoch milliseconds, and a relative phrase. **Reuse `relativeFromNow` from `src/lib/jwt.ts`**; do not reimplement it. Status bar shows the assumed unit, or an error in red.

Persist the input.

- [ ] **Step 6: Register in all five places**

`"Timestamp"`, labelled "Timestamp".

- [ ] **Step 7: Verify and commit**

```bash
npm run format && npm run lint && npm test && npm run build && npm run doctor
```

```bash
git add -A && git commit -m "feat: add timestamp converter widget"
```

---

### Task 4: Icons check and documentation

- [ ] **Step 1: Confirm no new icons are needed**

All three widgets live inside the existing Developer submenu, and `SubMenuItem` in `start-menu-items.ts` has no icon field — only top-level groups carry icons. Verify this is still true before assuming it; if the type has changed, add icons in the style of `src/assets/start-menu/developer.svg`.

- [ ] **Step 2: Update `README.md`**

Add the three tools to its list, matching the file's existing voice. CLAUDE.md records that the README does not read from `ROADMAP`, so it goes stale silently — this is that step.

- [ ] **Step 3: Update `CLAUDE.md` only if something non-obvious was learned**

Do not add a bullet per widget; that file is for traps, not an inventory. Add something only if one of these widgets hit a real gotcha worth recording — for example a `crypto.randomUUID` availability constraint, or a jsdom limitation you had to work around. If nothing surprising happened, change nothing and say so.

- [ ] **Step 4: Verify the whole set in a browser**

The dev server runs via portless at `https://w98tools.localhost`. Start it from the project's launch config, not a bare `npm run dev`. Open all three from Start → Developer and confirm: each renders correctly inside its window, generates/converts correctly, the Welcome window's launcher opens them, their contents survive a reload, and there are no console errors. Report what you observed.

- [ ] **Step 5: Commit**

```bash
npm run format && npm run lint && npm test && npm run build && npm run doctor
```

```bash
git add -A && git commit -m "docs: add the quick tools to the README"
```
