# Four developer widgets: Prettify SQL, Split & Join, JWT Decoder, JSON to Types

Date: 2026-08-15

## Why these four

The app ships four tools — Search & Replace, Image OCR, Prettify JSON, PDF
Export — and the Welcome window already promises two more, "Split" and "SQL".
This spec makes good on both promises and adds two tools aimed squarely at a
full-stack Angular/React/C#/SQL workflow: decoding a JWT to check its claims,
and turning an API response into C# records or TypeScript interfaces.

All four keep the app's defining property: everything runs in the browser, and
nothing is uploaded anywhere. That matters most for the JWT tool, where the
usual alternative is pasting a production token into a website.

## Shared architecture

Every widget follows the pattern `src/components/widgets/prettify-json.tsx`
established:

- Source text in `useState`; output derived in a `useMemo`. No effects, no
  state kept in sync with other state.
- On invalid input the output is cleared, not left stale. `prettify-json.test.tsx`
  documents this as a deliberate choice: leaving the last good result on screen
  beside an error reads as though the broken input parsed.
- Counts and error text live in `Widget.Status` rows.
- Labels are wired with `htmlFor`/`id` so component tests can select by label,
  as the existing tests do.

Pure logic lives in `src/lib/` with its own unit tests when it is substantial
enough to earn them — the precedent is `src/lib/pdf/` — and inline in the
widget when it is not. Every widget additionally gets a jsdom component test
next to it as `*.test.tsx`.

Each widget is registered through the five-step checklist in CLAUDE.md:
component, `WidgetType` union in `window-store.ts`, `widgetRegistry` in
`window-manager.tsx`, `MENU_ITEMS` in `start-menu-items.ts`, and `ROADMAP` in
`roadmap.ts`.

### Menu and roadmap restructure

Two structural changes, applied once before or alongside the first widget:

- The top-level "Prettify JSON" entry becomes a **Prettify** submenu holding
  "JSON" and "SQL". This mirrors the existing `ROADMAP` group of the same name.
- A new **Developer** group appears in both `MENU_ITEMS` and `ROADMAP`, holding
  "JWT Decoder" and "JSON to Types".

Split & Join joins the existing String Utilities submenu. In `ROADMAP`, the
existing `Split` and `SQL` entries gain their `widget` fields rather than being
added anew, which is what moves the Welcome window's "Implemented" figure; the
`Split` entry's label is updated to "Split & Join" to match the widget.

### Icons

Four new Start-menu icons are needed in `src/assets/start-menu/`. Author them
as small SVGs in the style of the existing `pdf-export.svg`.

## 1. Prettify SQL

**Widget:** `src/components/widgets/prettify-sql.tsx`, `WidgetType` `"PrettifySql"`.

Two-pane layout identical to Prettify JSON — "Original" and "Formatted"
textareas in a two-column grid. No formatting controls.

**Formatting:** `sql-formatter` (v15, the current major) with
`language: "transactsql"`, `keywordCase: "upper"`, `tabWidth: 4`, defaults
otherwise. T-SQL only; no dialect picker.

**Bundling.** `sql-formatter` is roughly 45 kB gzipped and `widgetRegistry`
imports every widget statically, so a plain import would put it in the main
bundle for every visitor who never opens the tool. Following how pdfmake and
mermaid are handled, load it with a dynamic `import()` fired when the widget
mounts, behind a module-level memoized promise so a second window does not
refetch:

```ts
let formatterPromise: Promise<typeof import("sql-formatter")> | undefined;
const loadFormatter = () => (formatterPromise ??= import("sql-formatter"));
```

This is the one widget that deviates from pure `useMemo` derivation. A small
hook returns `format | null`; while null the status bar reads
"Loading formatter…". The deviation is justified because this is genuine
asynchronous I/O, not state that could have been computed synchronously.

After implementing, confirm `dist/assets/` still splits `sql-formatter` into
its own chunk, as CLAUDE.md requires for the other dynamic imports.

**Errors:** input that `sql-formatter` refuses to parse produces "Invalid SQL."
in the status bar and an empty output pane. Empty input is not an error.

**Tests:** component test covering a formatted statement, the invalid case
clearing output, and empty input being treated as valid. The test awaits the
formatted output because loading is async.

## 2. Split & Join

**Widget:** `src/components/widgets/split-join.tsx`, `WidgetType` `"SplitJoin"`.

**Layout:** source textarea; a "Split by" select; a "Join with" select; a
"Quote each item" checkbox; output textarea. Both selects offer New line,
Comma, Tab, and Custom…, with a text input revealed for Custom. A custom
delimiter is taken literally — `\t` splits on a backslash followed by `t`, not
on a tab, which is why Tab is its own option. Splitting on New line accepts
both `\n` and `\r\n`.

**Behaviour.** Two rules are unconditional rather than checkboxes: items are
trimmed, and empty items are dropped. Pasting a column of IDs out of SSMS
otherwise yields a trailing empty item every time.

Quoting is T-SQL correct: wrap in single quotes and double any embedded single
quote, so `O'Brien` becomes `'O''Brien'`.

The canonical use is a column of IDs split by New line and joined by Comma to
build an `IN (...)` list, and the reverse.

**Errors:** an empty custom delimiter falls back to treating the input as a
single item rather than erroring; there is no invalid input for this widget.

**Status:** item count and output character count.

**Logic placement:** roughly twenty lines, so it stays inline in the widget and
is covered by the component test rather than extracted to `src/lib/`.

**Tests:** component test covering newline→comma with quoting, comma→newline,
a custom delimiter, and that whitespace-only items are dropped.

## 3. JWT Decoder

**Widget:** `src/components/widgets/jwt-decoder.tsx`, `WidgetType` `"JwtDecoder"`.

Decode only. No signature verification, no secret or key input, no network
access of any kind.

**Layout:** token textarea on top; "Header" and "Payload" read-only panes
below, pretty-printed with two-space indent; a claims summary; the signature
segment displayed verbatim and explicitly labelled as not verified.

**Claims summary:** `exp`, `nbf`, and `iat` are rendered as local time plus a
relative phrase — "expired 3 hours ago", "expires in 12 minutes" — using
`Intl.RelativeTimeFormat`. Claims that are absent are simply omitted. The
status bar shows the header's `alg` value and, when `exp` is in the past, an
expired warning.

**Library:** `src/lib/jwt.ts` exporting `decodeJwt(token)`, which returns the
decoded header, payload, and raw signature, or an error.

- Exactly three dot-separated segments are required.
- Base64url is normalised (`-` → `+`, `_` → `/`) and padded before `atob`.
- Bytes are decoded through `TextDecoder` rather than treated as Latin-1, so
  non-ASCII claim values survive.
- Each of the first two segments must parse as JSON.

**Errors:** anything failing the above yields "Not a valid JWT." and clears both
panes.

**Tests:** unit tests in `src/lib/jwt.test.ts` for segment count, base64url
padding, non-ASCII payloads, and malformed JSON; component test for a decoded
token, an expired token's warning, and the invalid case.

## 4. JSON to Types

**Widget:** `src/components/widgets/json-to-types.tsx`, `WidgetType` `"JsonToTypes"`.

**Layout:** JSON input textarea; generated code output textarea; a "Language"
select (C# / TypeScript); a records-vs-classes radio pair, disabled rather than
hidden when TypeScript is selected so the layout does not shift; a root type
name input defaulting to `Root`.

**Library:** `src/lib/codegen/` — `types.ts` (the intermediate representation),
`infer.ts` (JSON → IR), `emit-csharp.ts`, `emit-typescript.ts`.

**Inference rules:**

- Numbers satisfying `Number.isInteger` become `int`, or `long` when outside
  signed 32-bit range; everything else becomes `double`. TypeScript uses
  `number` throughout.
- `null` makes the property nullable: `string?` in C#, `| null` in TypeScript.
- Arrays unify their element types. Conflicting elements or an empty array fall
  back to `object` in C# and `unknown` in TypeScript.
- Nested objects become named types from the PascalCased key, singularised
  best-effort for array elements (`items` → `Item`; trailing `ies` → `y`,
  trailing `s` dropped). Singularisation is explicitly heuristic.
- Structurally identical nested types are deduplicated by shape signature, so a
  payload with shipping and billing addresses produces one `Address` rather
  than `Address` and `Address2`.
- Remaining name collisions are resolved by appending `2`, `3`, and so on.

**C# emission:**

- Records emit `{ get; init; }`; classes emit `{ get; set; }`. The choice is the
  radio pair; both are otherwise identical.
- `[JsonPropertyName("...")]` (System.Text.Json) is emitted only where the JSON
  key does not already match the generated PascalCase name.
- A property whose generated name equals its enclosing type name is renamed —
  C# rejects a member with the same name as its type.

**TypeScript emission:** interfaces with the original keys preserved, quoted
when they are not valid identifiers.

**Root handling:** an object root generates a type named by the root-name input.
An array-of-objects root generates the unified element type. A scalar root is an
error: "Root must be an object or array of objects."

**Errors:** invalid JSON behaves exactly as Prettify JSON does — "Invalid JSON."
in the status bar, output cleared.

**Tests:** unit tests per `src/lib/codegen/` module covering each inference rule,
structural dedup, the enclosing-type-name collision, and attribute emission;
component test covering C# records, C# classes, TypeScript, and invalid JSON.

## Build order

Ascending in complexity, each independently shippable:

1. Prettify SQL
2. Split & Join
3. JWT Decoder
4. JSON to Types

The menu and roadmap restructure lands with or before Prettify SQL, since that
widget is what creates the Prettify submenu.

The four widgets share no code with one another, only the conventions described
above, so each is a self-contained phase: the implementation plan can be
executed one widget at a time, with the app shippable in between.

## Out of scope

- SQL dialects other than T-SQL, and any SQL formatting options.
- JWT signature verification of any kind, including HS256 with a pasted secret.
- Any tool requiring a network request.
- Other candidates discussed and deferred: regex tester, text diff, Unix
  timestamp converter, Markdown previewer.
