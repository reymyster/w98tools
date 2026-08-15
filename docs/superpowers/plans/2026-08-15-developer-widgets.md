# Developer Widgets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four browser-only developer tools to w98tools — Prettify SQL, Split & Join, JWT Decoder, and JSON to Types — following the spec at `docs/superpowers/specs/2026-08-15-developer-widgets-design.md`.

**Architecture:** Each widget is a self-contained React component under `src/components/widgets/` that renders inside the existing `<Widget>` compound component and derives its output from source state with `useMemo` rather than effects. Substantial pure logic (JWT decoding, type inference and emission) lives in `src/lib/` with its own unit tests; trivial logic stays inline in the widget and is covered by its jsdom component test. Nothing makes a network request.

**Tech Stack:** React 19, TypeScript 7, Vite 8, Tailwind 4, 98.css, zustand, Vitest + jsdom + Testing Library, Biome. One new runtime dependency: `sql-formatter` v15.

## Global Constraints

- **Biome owns formatting.** Space indentation width 2, double quotes, 80 columns. Never hand-format; run `npm run format`. Lint with `npm run lint`.
- **No test globals.** `vite.config.ts` deliberately omits `globals: true`, so every spec must explicitly `import { describe, expect, it } from "vitest"`.
- **Tests live next to the code** as `*.test.ts` / `*.test.tsx`.
- **Every widget is registered in five places** (CLAUDE.md): the component file, the `WidgetType` union in `src/components/window-store.ts`, `widgetRegistry` in `src/components/window-manager.tsx`, `MENU_ITEMS` in `src/components/start-menu-items.ts`, and `ROADMAP` in `src/components/roadmap.ts`. `widgetRegistry` is typed `Record<WidgetType, …>`, so a missing entry is a compile error.
- **98.css styles bare elements.** A `<button>` gets a silver face, bevel and `min-width: 75px`; a `<label>` gets `display: inline-flex`. Do not swap tags to change appearance.
- **`window-manager.tsx` must export only its component** so Fast Refresh preserves state. Do not add exports there.
- **Everything runs client-side.** No `fetch`, no CDN assets. Anything loading from another origin is blocked by the CSP in `vercel.json`.
- **`npm run build` (`tsc -b && vite build`) is the type-check.** It must pass before any commit.
- **Regexes over user input need a bound on every unbounded scan** (see the `[^>]{0,256}` note in CLAUDE.md).
- **Accepted react-doctor baseline is 14 findings**, not zero. Do not "fix" the known ones.

---

### Task 1: Prettify SQL

Adds the Prettify SQL widget and restructures the top-level "Prettify JSON" menu row into a "Prettify" submenu holding JSON and SQL.

**Files:**
- Create: `src/components/widgets/prettify-sql.tsx`
- Create: `src/components/widgets/prettify-sql.test.tsx`
- Modify: `package.json` (add `sql-formatter` dependency)
- Modify: `src/components/window-store.ts:10-17` (`WidgetType` union)
- Modify: `src/components/window-manager.tsx:1-25` (imports and `widgetRegistry`)
- Modify: `src/components/start-menu-items.ts:38-72` (`MENU_ITEMS`)
- Modify: `src/components/roadmap.ts:31` (`Prettify` group)

**Interfaces:**
- Consumes: `Widget` from `@/components/widget` — a compound component with `Widget.Title`, `Widget.Body`, `Widget.Status`, and props `{ windowID: number; initialHeight?: number; initialWidth?: number }`.
- Produces: `PrettifySql({ id }: { id: number })` exported from `src/components/widgets/prettify-sql.tsx`; `WidgetType` gains the member `"PrettifySql"`.

- [ ] **Step 1: Install the formatter**

```bash
npm install sql-formatter@^15.6.0
```

- [ ] **Step 2: Write the failing test**

Create `src/components/widgets/prettify-sql.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PrettifySql } from "./prettify-sql";

const source = () => screen.getByLabelText("Original");
const output = () => screen.getByLabelText("Formatted") as HTMLTextAreaElement;

describe("PrettifySql", () => {
  it("formats a statement and uppercases keywords", async () => {
    const user = userEvent.setup();
    render(<PrettifySql id={1} />);

    await user.type(source(), "select a, b from t where a = 1");

    await waitFor(() => expect(output().value).toContain("SELECT"));
    expect(output().value).toContain("FROM");
    expect(output().value).toContain("WHERE");
  });

  it("indents with four spaces", async () => {
    const user = userEvent.setup();
    render(<PrettifySql id={1} />);

    await user.type(source(), "select a, b from t");

    await waitFor(() => expect(output().value).toContain("SELECT"));
    expect(output().value).toMatch(/\n {4}\S/);
  });

  it("reports the formatter is loading before it arrives", () => {
    render(<PrettifySql id={1} />);

    expect(screen.getByText("Loading formatter…")).toBeInTheDocument();
  });

  it("treats empty input as valid rather than an error", async () => {
    render(<PrettifySql id={1} />);

    await waitFor(() =>
      expect(screen.queryByText("Loading formatter…")).not.toBeInTheDocument(),
    );
    expect(output().value).toBe("");
    expect(screen.queryByText("Invalid SQL.")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/components/widgets/prettify-sql.test.tsx`
Expected: FAIL — `Failed to resolve import "./prettify-sql"`.

- [ ] **Step 4: Write the widget**

Create `src/components/widgets/prettify-sql.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { Widget } from "@/components/widget";

type FormatFn = (sql: string) => string;

// sql-formatter is ~45 kB gzipped and widgetRegistry imports every widget
// statically, so a plain import would ship it to everyone who never opens
// this tool. Loading it dynamically keeps it in its own chunk, the way
// pdfmake and mermaid are handled. The promise is module-level so a second
// Prettify SQL window reuses the first window's download.
let formatterPromise: Promise<FormatFn> | undefined;

function loadFormatter(): Promise<FormatFn> {
  formatterPromise ??= import("sql-formatter").then(
    ({ format }) =>
      (sql: string) =>
        format(sql, {
          language: "transactsql",
          keywordCase: "upper",
          tabWidth: 4,
        }),
  );
  return formatterPromise;
}

// The one place this app uses an effect to produce state, because loading a
// chunk is genuine I/O rather than something derivable from other state.
function useSqlFormatter(): FormatFn | null {
  const [format, setFormat] = useState<FormatFn | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadFormatter().then((fn) => {
      // The updater form is required: setFormat(fn) would run fn as a
      // reducer over the previous state instead of storing it.
      if (!cancelled) setFormat(() => fn);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return format;
}

export function PrettifySql({ id }: { id: number }) {
  const [txtSource, setSource] = useState("");
  const format = useSqlFormatter();

  const { txtOutput, valid } = useMemo(() => {
    if (!txtSource || !format) return { txtOutput: "", valid: true };

    try {
      return { txtOutput: format(txtSource), valid: true };
    } catch {
      // Clearing the output matters: leaving the last good result beside an
      // error reads as though the broken input parsed.
      return { txtOutput: "", valid: false };
    }
  }, [txtSource, format]);

  return (
    <Widget windowID={id} initialHeight={480} initialWidth={640}>
      <Widget.Title>Prettify SQL</Widget.Title>
      <Widget.Body className="grid grid-cols-2 gap-1 lg:gap-4 pb-2 lg:pb-4">
        <div className="field-row-stacked">
          <label htmlFor="txt_sql_source">Original</label>
          <textarea
            className="h-full w-full"
            id="txt_sql_source"
            value={txtSource}
            onChange={(e) => setSource(e.target.value)}
          ></textarea>
        </div>
        <div className="field-row-stacked">
          <label htmlFor="txt_sql_output">Formatted</label>
          <textarea
            className="h-full w-full"
            id="txt_sql_output"
            readOnly={true}
            value={txtOutput}
          ></textarea>
        </div>
      </Widget.Body>
      <Widget.Status>
        {/* U+00A0 holds the row's height when there's nothing to report. */}
        {format === null ? (
          "Loading formatter…"
        ) : (
          <span className="text-red-500">
            {valid ? "\u00A0" : "Invalid SQL."}
          </span>
        )}
      </Widget.Status>
    </Widget>
  );
}
```

- [ ] **Step 5: Add `"PrettifySql"` to the `WidgetType` union**

In `src/components/window-store.ts`, replace the union:

```ts
export type WidgetType =
  | "Help"
  | "PrettifyJson"
  | "PrettifySql"
  | "SearchReplace"
  | "Welcome"
  | "OCR"
  | "PdfExport";
```

- [ ] **Step 6: Register the component**

In `src/components/window-manager.tsx`, add the import beside the existing `PrettifyJson` import:

```tsx
import { PrettifyJson as PrettifyJSONWidget } from "./widgets/prettify-json";
import { PrettifySql as PrettifySQLWidget } from "./widgets/prettify-sql";
```

and add the registry entry:

```tsx
  PrettifyJson: memo(PrettifyJSONWidget),
  PrettifySql: memo(PrettifySQLWidget),
```

- [ ] **Step 7: Turn the Prettify row into a submenu**

In `src/components/start-menu-items.ts`, replace the `Prettify JSON` entry:

```ts
  {
    label: "Prettify",
    icon: prettifyJsonIcon,
    submenu: [
      { label: "JSON", widget: "PrettifyJson" },
      { label: "SQL", widget: "PrettifySql" },
    ],
  },
```

- [ ] **Step 8: Mark the roadmap entry as shipped**

In `src/components/roadmap.ts`, replace the Prettify group:

```ts
  {
    group: "Prettify",
    entries: [
      { label: "JSON", widget: "PrettifyJson" },
      { label: "SQL", widget: "PrettifySql" },
    ],
  },
```

- [ ] **Step 9: Run the tests**

Run: `npx vitest run src/components/widgets/prettify-sql.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 10: Run the full suite, lint and build**

```bash
npm run format && npm run lint && npm test && npm run build
```

Expected: all pass. `npm run build` is the type-check and will fail if the registry is missing an entry.

- [ ] **Step 11: Verify sql-formatter stayed out of the main bundle**

```bash
grep -l transactsql dist/assets/*.js
```

Expected: exactly one file, and it is **not** the main `index-*.js` entry chunk. If it is, the dynamic import collapsed and Step 4's `loadFormatter` needs revisiting.

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json src/components/widgets/prettify-sql.tsx src/components/widgets/prettify-sql.test.tsx src/components/window-store.ts src/components/window-manager.tsx src/components/start-menu-items.ts src/components/roadmap.ts
git commit -m "feat: add Prettify SQL widget"
```

---

### Task 2: Split & Join

**Files:**
- Create: `src/components/widgets/split-join.tsx`
- Create: `src/components/widgets/split-join.test.tsx`
- Modify: `src/components/window-store.ts` (`WidgetType` union)
- Modify: `src/components/window-manager.tsx` (imports and `widgetRegistry`)
- Modify: `src/components/start-menu-items.ts` (String Utilities submenu)
- Modify: `src/components/roadmap.ts` (String Utilities group)

**Interfaces:**
- Consumes: `Widget` from `@/components/widget`.
- Produces: `SplitJoin({ id }: { id: number })` exported from `src/components/widgets/split-join.tsx`; `WidgetType` gains `"SplitJoin"`. The split/quote helpers stay module-private — the component test covers them.

- [ ] **Step 1: Write the failing test**

Create `src/components/widgets/split-join.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SplitJoin } from "./split-join";

const source = () => screen.getByLabelText("Source Text");
const output = () => screen.getByLabelText("Output Text") as HTMLTextAreaElement;
const splitBy = () => screen.getByLabelText("Split by");
const joinWith = () => screen.getByLabelText("Join with");
const quote = () => screen.getByLabelText("Quote each item");

describe("SplitJoin", () => {
  it("turns a column of ids into a comma-joined list", async () => {
    const user = userEvent.setup();
    render(<SplitJoin id={1} />);

    await user.type(source(), "1{enter}2{enter}3");
    await user.selectOptions(joinWith(), "comma");

    expect(output().value).toBe("1,2,3");
  });

  it("quotes items T-SQL style, doubling embedded quotes", async () => {
    const user = userEvent.setup();
    render(<SplitJoin id={1} />);

    await user.type(source(), "O'Brien{enter}Smith");
    await user.selectOptions(joinWith(), "comma");
    await user.click(quote());

    expect(output().value).toBe("'O''Brien','Smith'");
  });

  it("splits a comma list back into lines", async () => {
    const user = userEvent.setup();
    render(<SplitJoin id={1} />);

    await user.type(source(), "a, b, c");
    await user.selectOptions(splitBy(), "comma");

    expect(output().value).toBe("a\nb\nc");
  });

  it("trims items and drops empty ones", async () => {
    const user = userEvent.setup();
    render(<SplitJoin id={1} />);

    await user.type(source(), "  1  {enter}{enter}   {enter}2");
    await user.selectOptions(joinWith(), "comma");

    expect(output().value).toBe("1,2");
  });

  it("splits on a custom delimiter taken literally", async () => {
    const user = userEvent.setup();
    render(<SplitJoin id={1} />);

    await user.selectOptions(splitBy(), "custom");
    await user.type(screen.getByLabelText("Custom split delimiter"), "|");
    await user.type(source(), "a|b|c");
    await user.selectOptions(joinWith(), "comma");

    expect(output().value).toBe("a,b,c");
  });

  it("treats the whole input as one item when the custom delimiter is empty", async () => {
    const user = userEvent.setup();
    render(<SplitJoin id={1} />);

    await user.selectOptions(splitBy(), "custom");
    await user.type(source(), "a,b");

    expect(output().value).toBe("a,b");
  });

  it("counts the items it produced", async () => {
    const user = userEvent.setup();
    render(<SplitJoin id={1} />);

    await user.type(source(), "1{enter}2{enter}3");

    expect(screen.getByText("Items: 3")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/widgets/split-join.test.tsx`
Expected: FAIL — `Failed to resolve import "./split-join"`.

- [ ] **Step 3: Write the widget**

Create `src/components/widgets/split-join.tsx`:

```tsx
import { useMemo, useState } from "react";
import { Widget } from "@/components/widget";

type DelimiterChoice = "newline" | "comma" | "tab" | "custom";

const PRESETS: Record<Exclude<DelimiterChoice, "custom">, RegExp> = {
  newline: /\r?\n/,
  comma: /,/,
  tab: /\t/,
};

const JOINERS: Record<Exclude<DelimiterChoice, "custom">, string> = {
  newline: "\n",
  comma: ",",
  tab: "\t",
};

// Trimming and dropping empties are unconditional rather than checkboxes:
// a column pasted out of SSMS otherwise yields a trailing empty item every
// single time, and nobody wants '' in their IN list.
function splitItems(
  source: string,
  choice: DelimiterChoice,
  custom: string,
): string[] {
  if (source.trim() === "") return [];

  // An empty custom delimiter would make String.split return every
  // character; treating the input as a single item is the useful answer.
  if (choice === "custom" && custom === "") return [source.trim()];

  const separator = choice === "custom" ? custom : PRESETS[choice];
  return source
    .split(separator)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** T-SQL quoting: wrap in single quotes, double any embedded single quote. */
function quoteItem(item: string): string {
  return `'${item.replaceAll("'", "''")}'`;
}

export function SplitJoin({ id }: { id: number }) {
  const [txtSource, setSource] = useState("");
  const [splitBy, setSplitBy] = useState<DelimiterChoice>("newline");
  const [joinWith, setJoinWith] = useState<DelimiterChoice>("newline");
  const [customSplit, setCustomSplit] = useState("");
  const [customJoin, setCustomJoin] = useState("");
  const [shouldQuote, setShouldQuote] = useState(false);

  const { txtOutput, count } = useMemo(() => {
    const items = splitItems(txtSource, splitBy, customSplit);
    const joiner = joinWith === "custom" ? customJoin : JOINERS[joinWith];
    const rendered = shouldQuote ? items.map(quoteItem) : items;
    return { txtOutput: rendered.join(joiner), count: items.length };
  }, [txtSource, splitBy, customSplit, joinWith, customJoin, shouldQuote]);

  return (
    <Widget windowID={id} initialHeight={520} initialWidth={420}>
      <Widget.Title>Split &amp; Join</Widget.Title>
      <Widget.Body className="flex flex-col gap-1 lg:gap-4 pb-2 lg:pb-4">
        <div className="field-row-stacked grow">
          <label htmlFor="txt_split_source">Source Text</label>
          <textarea
            className="h-full"
            id="txt_split_source"
            value={txtSource}
            onChange={(e) => setSource(e.target.value)}
          ></textarea>
        </div>
        <div className="field-row-stacked grow-0">
          <label htmlFor="sel_split_by">Split by</label>
          <select
            id="sel_split_by"
            value={splitBy}
            onChange={(e) => setSplitBy(e.target.value as DelimiterChoice)}
          >
            <option value="newline">New line</option>
            <option value="comma">Comma</option>
            <option value="tab">Tab</option>
            <option value="custom">Custom…</option>
          </select>
        </div>
        {splitBy === "custom" && (
          <div className="field-row-stacked grow-0">
            <label htmlFor="txt_custom_split">Custom split delimiter</label>
            <input
              id="txt_custom_split"
              type="text"
              value={customSplit}
              onChange={(e) => setCustomSplit(e.target.value)}
            />
          </div>
        )}
        <div className="field-row-stacked grow-0">
          <label htmlFor="sel_join_with">Join with</label>
          <select
            id="sel_join_with"
            value={joinWith}
            onChange={(e) => setJoinWith(e.target.value as DelimiterChoice)}
          >
            <option value="newline">New line</option>
            <option value="comma">Comma</option>
            <option value="tab">Tab</option>
            <option value="custom">Custom…</option>
          </select>
        </div>
        {joinWith === "custom" && (
          <div className="field-row-stacked grow-0">
            <label htmlFor="txt_custom_join">Custom join delimiter</label>
            <input
              id="txt_custom_join"
              type="text"
              value={customJoin}
              onChange={(e) => setCustomJoin(e.target.value)}
            />
          </div>
        )}
        <div className="field-row grow-0">
          <input
            id="chk_quote"
            type="checkbox"
            checked={shouldQuote}
            onChange={(e) => setShouldQuote(e.target.checked)}
          />
          <label htmlFor="chk_quote">Quote each item</label>
        </div>
        <div className="field-row-stacked grow">
          <label htmlFor="txt_split_output">Output Text</label>
          <textarea
            className="h-full"
            id="txt_split_output"
            readOnly={true}
            value={txtOutput}
          ></textarea>
        </div>
      </Widget.Body>
      {/* A template literal, not `Items: {count}`: the latter renders two
          text nodes, which getByText("Items: 3") can't match. */}
      <Widget.Status>{`Items: ${count}`}</Widget.Status>
      <Widget.Status>
        Output Chars: {new Intl.NumberFormat().format(txtOutput.length)}
      </Widget.Status>
    </Widget>
  );
}
```

- [ ] **Step 4: Register the widget**

In `src/components/window-store.ts`, add `| "SplitJoin"` to the `WidgetType` union.

In `src/components/window-manager.tsx`, add the import and registry entry:

```tsx
import { SplitJoin as SplitJoinWidget } from "./widgets/split-join";
```

```tsx
  SplitJoin: memo(SplitJoinWidget),
```

In `src/components/start-menu-items.ts`, add to the String Utilities submenu, keeping it alphabetical:

```ts
    submenu: [
      { label: "Image OCR", widget: "OCR" },
      { label: "Search & Replace", widget: "SearchReplace" },
      { label: "Split & Join", widget: "SplitJoin" },
    ],
```

In `src/components/roadmap.ts`, replace the planned `Split` entry with the shipped one:

```ts
      { label: "Split & Join", widget: "SplitJoin" },
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/components/widgets/split-join.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 6: Run the full suite, lint and build**

```bash
npm run format && npm run lint && npm test && npm run build
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/widgets/split-join.tsx src/components/widgets/split-join.test.tsx src/components/window-store.ts src/components/window-manager.tsx src/components/start-menu-items.ts src/components/roadmap.ts
git commit -m "feat: add Split & Join widget"
```

---

### Task 3: JWT Decoder

Also creates the Developer menu group and its icon, which Task 4 then joins.

**Files:**
- Create: `src/lib/jwt.ts`
- Create: `src/lib/jwt.test.ts`
- Create: `src/components/widgets/jwt-decoder.tsx`
- Create: `src/components/widgets/jwt-decoder.test.tsx`
- Create: `src/assets/start-menu/developer.svg`
- Modify: `src/components/window-store.ts` (`WidgetType` union)
- Modify: `src/components/window-manager.tsx` (imports and `widgetRegistry`)
- Modify: `src/components/start-menu-items.ts` (new Developer group)
- Modify: `src/components/roadmap.ts` (new Developer group)

**Interfaces:**
- Consumes: `Widget` from `@/components/widget`.
- Produces:
  - `src/lib/jwt.ts` exports `type DecodedJwt = { header: Record<string, unknown>; payload: Record<string, unknown>; signature: string }`, `decodeJwt(token: string): DecodedJwt | null`, `relativeFromNow(epochSeconds: number, nowMs: number): string`, and `isExpired(payload: Record<string, unknown>, nowMs: number): boolean`.
  - `JwtDecoder({ id }: { id: number })` from `src/components/widgets/jwt-decoder.tsx`; `WidgetType` gains `"JwtDecoder"`.

- [ ] **Step 1: Write the failing library test**

Create `src/lib/jwt.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decodeJwt, isExpired, relativeFromNow } from "./jwt";

/** Builds a token the same way a real issuer would, so tests aren't circular. */
function makeToken(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  signature = "sig",
): string {
  const encode = (value: Record<string, unknown>) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
  return `${encode(header)}.${encode(payload)}.${signature}`;
}

describe("decodeJwt", () => {
  it("decodes a well-formed token", () => {
    const token = makeToken({ alg: "HS256", typ: "JWT" }, { sub: "123" });

    expect(decodeJwt(token)).toEqual({
      header: { alg: "HS256", typ: "JWT" },
      payload: { sub: "123" },
      signature: "sig",
    });
  });

  it("decodes segments whose length needs base64 padding", () => {
    // A one-key payload lands on a length that isn't a multiple of four.
    const token = makeToken({ alg: "none" }, { a: 1 });

    expect(decodeJwt(token)?.payload).toEqual({ a: 1 });
  });

  it("preserves non-ASCII claim values", () => {
    const token = makeToken({ alg: "HS256" }, { name: "José Müller 日本" });

    expect(decodeJwt(token)?.payload.name).toBe("José Müller 日本");
  });

  it("ignores surrounding whitespace", () => {
    const token = makeToken({ alg: "HS256" }, { sub: "1" });

    expect(decodeJwt(`  ${token}\n`)?.payload).toEqual({ sub: "1" });
  });

  it("rejects a token without three segments", () => {
    expect(decodeJwt("a.b")).toBeNull();
    expect(decodeJwt("a.b.c.d")).toBeNull();
    expect(decodeJwt("")).toBeNull();
  });

  it("rejects segments that are not base64url", () => {
    expect(decodeJwt("!!!.!!!.sig")).toBeNull();
  });

  it("rejects segments that decode to invalid JSON", () => {
    const notJson = btoa("hello").replaceAll("=", "");

    expect(decodeJwt(`${notJson}.${notJson}.sig`)).toBeNull();
  });

  it("rejects segments that decode to a JSON scalar rather than an object", () => {
    const scalar = btoa("42").replaceAll("=", "");

    expect(decodeJwt(`${scalar}.${scalar}.sig`)).toBeNull();
  });
});

describe("relativeFromNow", () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);

  it("describes a future time", () => {
    expect(relativeFromNow(now / 1000 + 720, now)).toBe("in 12 minutes");
  });

  it("describes a past time", () => {
    expect(relativeFromNow(now / 1000 - 10_800, now)).toBe("3 hours ago");
  });

  it("falls back to seconds for sub-minute differences", () => {
    expect(relativeFromNow(now / 1000 + 5, now)).toBe("in 5 seconds");
  });
});

describe("isExpired", () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);

  it("is true when exp is in the past", () => {
    expect(isExpired({ exp: now / 1000 - 1 }, now)).toBe(true);
  });

  it("is false when exp is in the future", () => {
    expect(isExpired({ exp: now / 1000 + 60 }, now)).toBe(false);
  });

  it("is false when there is no exp claim", () => {
    expect(isExpired({ sub: "1" }, now)).toBe(false);
  });

  it("is false when exp is not a number", () => {
    expect(isExpired({ exp: "soon" }, now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/jwt.test.ts`
Expected: FAIL — `Failed to resolve import "./jwt"`.

- [ ] **Step 3: Write the library**

Create `src/lib/jwt.ts`:

```ts
/**
 * Decoding only. There is deliberately no signature verification and no place
 * to paste a secret or key: the point of doing this in the browser is that the
 * token never leaves the page, and a secret field would undo that.
 */

export type DecodedJwt = {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
};

// Bounded rather than open-ended. The class is negated-free so there's no
// backtracking ambiguity, but an anchored full-string test on a huge paste
// still costs a linear scan per keystroke; 8192 is far longer than any real
// segment and keeps a pathological paste from mattering.
const BASE64URL = /^[A-Za-z0-9_-]{0,8192}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeSegment(segment: string): unknown {
  if (!BASE64URL.test(segment)) throw new Error("not base64url");

  const base64 = segment.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  // Decoding through TextDecoder rather than treating the bytes as Latin-1,
  // so claim values like a user's name survive intact.
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function decodeJwt(token: string): DecodedJwt | null {
  const parts = token.trim().split(".");
  if (parts.length !== 3) return null;

  try {
    const header = decodeSegment(parts[0]);
    const payload = decodeSegment(parts[1]);
    if (!isRecord(header) || !isRecord(payload)) return null;
    return { header, payload, signature: parts[2] };
  } catch {
    return null;
  }
}

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

const DIVISORS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000_000],
  ["month", 2_592_000_000],
  ["week", 604_800_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
  ["second", 1000],
];

/** "in 12 minutes" / "3 hours ago". `nowMs` is a parameter so tests are pure. */
export function relativeFromNow(epochSeconds: number, nowMs: number): string {
  const deltaMs = epochSeconds * 1000 - nowMs;

  for (const [unit, unitMs] of DIVISORS) {
    if (Math.abs(deltaMs) >= unitMs || unit === "second") {
      return RELATIVE.format(Math.round(deltaMs / unitMs), unit);
    }
  }

  return RELATIVE.format(0, "second");
}

export function isExpired(
  payload: Record<string, unknown>,
  nowMs: number,
): boolean {
  const exp = payload.exp;
  return typeof exp === "number" && exp * 1000 <= nowMs;
}
```

- [ ] **Step 4: Run the library test to verify it passes**

Run: `npx vitest run src/lib/jwt.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Write the failing widget test**

Create `src/components/widgets/jwt-decoder.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JwtDecoder } from "./jwt-decoder";

const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);

function makeToken(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
): string {
  const encode = (value: Record<string, unknown>) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
  return `${encode(header)}.${encode(payload)}.signature-bytes`;
}

const token = () => screen.getByLabelText("Token");
const header = () => screen.getByLabelText("Header") as HTMLTextAreaElement;
const payload = () => screen.getByLabelText("Payload") as HTMLTextAreaElement;

// The widget reads Date.now() to age its claims, so the clock is pinned.
// userEvent needs `advanceTimers` to make progress under fake timers —
// without it, setup() awaits a timeout that will never fire and every test
// in this file hangs.
const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

describe("JwtDecoder", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("decodes the header and payload", async () => {
    const user = setup();
    render(<JwtDecoder id={1} />);

    await user.click(token());
    await user.paste(makeToken({ alg: "HS256", typ: "JWT" }, { sub: "123" }));

    expect(JSON.parse(header().value)).toEqual({ alg: "HS256", typ: "JWT" });
    expect(JSON.parse(payload().value)).toEqual({ sub: "123" });
  });

  it("shows the algorithm in the status bar", async () => {
    const user = setup();
    render(<JwtDecoder id={1} />);

    await user.click(token());
    await user.paste(makeToken({ alg: "RS256" }, { sub: "1" }));

    expect(screen.getByText("alg: RS256")).toBeInTheDocument();
  });

  it("warns when the token has expired", async () => {
    const user = setup();
    render(<JwtDecoder id={1} />);

    await user.click(token());
    await user.paste(makeToken({ alg: "HS256" }, { exp: NOW / 1000 - 10_800 }));

    expect(screen.getByText("Token has expired.")).toBeInTheDocument();
    expect(screen.getByText(/3 hours ago/)).toBeInTheDocument();
  });

  it("does not warn when the token is still valid", async () => {
    const user = setup();
    render(<JwtDecoder id={1} />);

    await user.click(token());
    await user.paste(makeToken({ alg: "HS256" }, { exp: NOW / 1000 + 720 }));

    expect(screen.queryByText("Token has expired.")).not.toBeInTheDocument();
    expect(screen.getByText(/in 12 minutes/)).toBeInTheDocument();
  });

  it("shows the signature without claiming it was verified", async () => {
    const user = setup();
    render(<JwtDecoder id={1} />);

    await user.click(token());
    await user.paste(makeToken({ alg: "HS256" }, { sub: "1" }));

    expect(screen.getByText("Signature (not verified)")).toBeInTheDocument();
    expect(screen.getByDisplayValue("signature-bytes")).toBeInTheDocument();
  });

  it("reports an invalid token and clears both panes", async () => {
    const user = setup();
    render(<JwtDecoder id={1} />);

    await user.click(token());
    await user.paste(makeToken({ alg: "HS256" }, { sub: "1" }));
    expect(header().value).not.toBe("");

    await user.clear(token());
    await user.paste("not-a-token");

    expect(screen.getByText("Not a valid JWT.")).toBeInTheDocument();
    expect(header().value).toBe("");
    expect(payload().value).toBe("");
  });

  it("treats empty input as valid rather than an error", () => {
    render(<JwtDecoder id={1} />);

    expect(screen.queryByText("Not a valid JWT.")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run the widget test to verify it fails**

Run: `npx vitest run src/components/widgets/jwt-decoder.test.tsx`
Expected: FAIL — `Failed to resolve import "./jwt-decoder"`.

- [ ] **Step 7: Write the widget**

Create `src/components/widgets/jwt-decoder.tsx`:

```tsx
import { useMemo, useState } from "react";
import { Widget } from "@/components/widget";
import { decodeJwt, isExpired, relativeFromNow } from "@/lib/jwt";

const TIME_CLAIMS = [
  ["exp", "Expires"],
  ["nbf", "Not before"],
  ["iat", "Issued at"],
] as const;

export function JwtDecoder({ id }: { id: number }) {
  const [txtToken, setToken] = useState("");

  const decoded = useMemo(
    () => (txtToken.trim() === "" ? null : decodeJwt(txtToken)),
    [txtToken],
  );

  const invalid = txtToken.trim() !== "" && decoded === null;
  // Read once per render rather than per claim, so every row agrees.
  const nowMs = Date.now();
  const alg = typeof decoded?.header.alg === "string" ? decoded.header.alg : null;
  const expired = decoded !== null && isExpired(decoded.payload, nowMs);

  const claims = TIME_CLAIMS.flatMap(([claim, label]) => {
    const value = decoded?.payload[claim];
    if (typeof value !== "number") return [];
    return [
      {
        claim,
        label,
        absolute: new Date(value * 1000).toLocaleString(),
        relative: relativeFromNow(value, nowMs),
      },
    ];
  });

  return (
    <Widget windowID={id} initialHeight={560} initialWidth={640}>
      <Widget.Title>JWT Decoder</Widget.Title>
      <Widget.Body className="flex flex-col gap-1 lg:gap-4 pb-2 lg:pb-4">
        <div className="field-row-stacked grow-0">
          <label htmlFor="txt_jwt">Token</label>
          <textarea
            className="h-24 font-mono text-xs"
            id="txt_jwt"
            value={txtToken}
            onChange={(e) => setToken(e.target.value)}
          ></textarea>
        </div>
        <div className="grid grid-cols-2 gap-1 lg:gap-4 grow min-h-0">
          <div className="field-row-stacked">
            <label htmlFor="txt_jwt_header">Header</label>
            <textarea
              className="h-full w-full"
              id="txt_jwt_header"
              readOnly={true}
              value={decoded ? JSON.stringify(decoded.header, null, 2) : ""}
            ></textarea>
          </div>
          <div className="field-row-stacked">
            <label htmlFor="txt_jwt_payload">Payload</label>
            <textarea
              className="h-full w-full"
              id="txt_jwt_payload"
              readOnly={true}
              value={decoded ? JSON.stringify(decoded.payload, null, 2) : ""}
            ></textarea>
          </div>
        </div>
        {claims.length > 0 && (
          <ul className="grow-0 m-0 pl-5">
            {claims.map((c) => (
              <li key={c.claim}>
                {c.label}: {c.absolute} ({c.relative})
              </li>
            ))}
          </ul>
        )}
        {decoded && (
          <div className="field-row-stacked grow-0">
            <label htmlFor="txt_jwt_signature">Signature (not verified)</label>
            <input
              id="txt_jwt_signature"
              type="text"
              readOnly={true}
              value={decoded.signature}
            />
          </div>
        )}
      </Widget.Body>
      {/* U+00A0 holds each row's height when there's nothing to report. */}
      <Widget.Status>{alg ? `alg: ${alg}` : "\u00A0"}</Widget.Status>
      <Widget.Status>
        <span className="text-red-500">
          {invalid
            ? "Not a valid JWT."
            : expired
              ? "Token has expired."
              : "\u00A0"}
        </span>
      </Widget.Status>
    </Widget>
  );
}
```

- [ ] **Step 8: Run the widget test to verify it passes**

Run: `npx vitest run src/components/widgets/jwt-decoder.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 9: Create the Developer menu icon**

Create `src/assets/start-menu/developer.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges">
  <title>Developer</title>
  <rect x="2" y="4" width="28" height="24" fill="#c0c0c0" stroke="#0a0a0a" stroke-width="1" />
  <rect x="3" y="5" width="26" height="4" fill="#000080" />
  <rect x="3" y="9" width="26" height="18" fill="#fff" />
  <text x="16" y="23" font-family="Courier New, monospace" font-size="12" font-weight="bold"
        fill="#000080" text-anchor="middle">&lt;/&gt;</text>
</svg>
```

- [ ] **Step 10: Register the widget and create the Developer group**

In `src/components/window-store.ts`, add `| "JwtDecoder"` to the `WidgetType` union.

In `src/components/window-manager.tsx`, add the import and registry entry:

```tsx
import { JwtDecoder as JwtDecoderWidget } from "@/components/widgets/jwt-decoder";
```

```tsx
  JwtDecoder: memo(JwtDecoderWidget),
```

In `src/components/start-menu-items.ts`, add the icon import (Biome sorts imports by path, so `developer.svg` comes first):

```ts
import developerIcon from "@/assets/start-menu/developer.svg";
```

and add the Developer group immediately after the Prettify group:

```ts
  {
    label: "Developer",
    icon: developerIcon,
    submenu: [{ label: "JWT Decoder", widget: "JwtDecoder" }],
  },
```

In `src/components/roadmap.ts`, add a Developer group after the Prettify group:

```ts
  {
    group: "Developer",
    entries: [{ label: "JWT Decoder", widget: "JwtDecoder" }],
  },
```

- [ ] **Step 11: Run the full suite, lint and build**

```bash
npm run format && npm run lint && npm test && npm run build
```

Expected: all pass.

- [ ] **Step 12: Commit**

```bash
git add src/lib/jwt.ts src/lib/jwt.test.ts src/components/widgets/jwt-decoder.tsx src/components/widgets/jwt-decoder.test.tsx src/assets/start-menu/developer.svg src/components/window-store.ts src/components/window-manager.tsx src/components/start-menu-items.ts src/components/roadmap.ts
git commit -m "feat: add JWT decoder widget"
```

---

### Task 4: JSON to Types — inference

Splits the type generator across two tasks: this one builds the JSON-to-IR inference with no UI, the next emits code and wires up the widget. The split is worth a reviewer's gate because the inference rules (numeric widening, unification, structural dedup, naming) are where the subtle bugs live.

**Files:**
- Create: `src/lib/codegen/types.ts`
- Create: `src/lib/codegen/infer.ts`
- Create: `src/lib/codegen/infer.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `src/lib/codegen/types.ts` exports `PrimitiveKind`, `TypeNode`, `Property`, `ObjectType`, `InferResult`, and `declarationOrder(result: InferResult): ObjectType[]`.
  - `src/lib/codegen/infer.ts` exports `pascalCase(key: string): string`, `singularize(word: string): string`, and `inferRoot(value: unknown, rootName: string): { ok: true; result: InferResult } | { ok: false; error: string }`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/codegen/infer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { inferRoot, pascalCase, singularize } from "./infer";
import { declarationOrder } from "./types";

/** Unwraps a successful inference, failing loudly if it wasn't one. */
function infer(json: string, rootName = "Root") {
  const outcome = inferRoot(JSON.parse(json), rootName);
  if (!outcome.ok) throw new Error(`expected success, got: ${outcome.error}`);
  return outcome.result;
}

describe("pascalCase", () => {
  it("converts snake_case", () => {
    expect(pascalCase("first_name")).toBe("FirstName");
  });

  it("converts kebab-case", () => {
    expect(pascalCase("first-name")).toBe("FirstName");
  });

  it("converts camelCase", () => {
    expect(pascalCase("firstName")).toBe("FirstName");
  });

  it("leaves PascalCase alone", () => {
    expect(pascalCase("FirstName")).toBe("FirstName");
  });

  it("prefixes a leading digit, which no identifier may start with", () => {
    expect(pascalCase("2fa_enabled")).toBe("_2faEnabled");
  });

  it("falls back to Item for a key with no usable characters", () => {
    expect(pascalCase("---")).toBe("Item");
  });
});

describe("singularize", () => {
  it("turns ies into y", () => {
    expect(singularize("Categories")).toBe("Category");
  });

  it("strips es after a sibilant", () => {
    expect(singularize("Boxes")).toBe("Box");
  });

  it("strips a trailing s", () => {
    expect(singularize("Items")).toBe("Item");
  });

  it("leaves a double s alone", () => {
    expect(singularize("Address")).toBe("Address");
  });

  it("leaves an already-singular word alone", () => {
    expect(singularize("Person")).toBe("Person");
  });
});

describe("inferRoot", () => {
  it("infers primitives", () => {
    const result = infer('{"a":"x","b":true}');
    const root = result.objects[0];

    expect(root.properties).toEqual([
      { jsonKey: "a", type: { kind: "primitive", primitive: "string", nullable: false } },
      { jsonKey: "b", type: { kind: "primitive", primitive: "bool", nullable: false } },
    ]);
  });

  it("infers int for whole numbers and double for fractional ones", () => {
    const result = infer('{"a":1,"b":1.5}');

    expect(result.objects[0].properties[0].type).toMatchObject({ primitive: "int" });
    expect(result.objects[0].properties[1].type).toMatchObject({ primitive: "double" });
  });

  it("infers long for whole numbers outside signed 32-bit range", () => {
    const result = infer('{"a":3000000000}');

    expect(result.objects[0].properties[0].type).toMatchObject({ primitive: "long" });
  });

  it("marks a null value nullable and unknown", () => {
    const result = infer('{"a":null}');

    expect(result.objects[0].properties[0].type).toEqual({
      kind: "primitive",
      primitive: "unknown",
      nullable: true,
    });
  });

  it("names the root type from the supplied name", () => {
    const result = infer('{"a":1}', "Person");

    expect(result.objects[0].name).toBe("Person");
  });

  it("names a nested object from its key", () => {
    const result = infer('{"home_address":{"city":"x"}}');

    expect(result.objects.map((o) => o.name)).toContain("HomeAddress");
  });

  it("names an array element type from the singularized key", () => {
    const result = infer('{"categories":[{"id":1}]}');

    expect(result.objects.map((o) => o.name)).toContain("Category");
  });

  it("declares the root type first even though children infer first", () => {
    const result = infer('{"address":{"city":"x"}}', "Person");

    expect(declarationOrder(result).map((o) => o.name)).toEqual([
      "Person",
      "Address",
    ]);
  });

  it("deduplicates structurally identical nested types", () => {
    const result = infer(
      '{"shipping":{"city":"x","zip":"y"},"billing":{"city":"a","zip":"b"}}',
    );

    // Two properties, one shared shape: Shipping is reused rather than a
    // near-identical Billing being minted alongside it.
    expect(result.objects).toHaveLength(2);
    const root = declarationOrder(result)[0];
    expect(root.properties[0].type).toEqual(root.properties[1].type);
  });

  it("resolves a name collision between different shapes", () => {
    const result = infer(
      '{"a":{"item":{"x":1}},"b":{"item":{"y":1}}}',
    );
    const names = result.objects.map((o) => o.name);

    expect(names).toContain("Item");
    expect(names).toContain("Item2");
  });

  it("unifies array elements, widening int to double", () => {
    const result = infer('{"nums":[1,2.5]}');

    expect(result.objects[0].properties[0].type).toEqual({
      kind: "array",
      nullable: false,
      element: { kind: "primitive", primitive: "double", nullable: false },
    });
  });

  it("unifies a null element into a nullable element type", () => {
    const result = infer('{"names":["a",null]}');

    expect(result.objects[0].properties[0].type).toMatchObject({
      element: { kind: "primitive", primitive: "string", nullable: true },
    });
  });

  it("falls back to unknown for conflicting array elements", () => {
    const result = infer('{"mixed":[1,"a"]}');

    expect(result.objects[0].properties[0].type).toMatchObject({
      element: { kind: "primitive", primitive: "unknown" },
    });
  });

  it("falls back to unknown for an empty array", () => {
    const result = infer('{"empty":[]}');

    expect(result.objects[0].properties[0].type).toMatchObject({
      element: { kind: "primitive", primitive: "unknown" },
    });
  });

  it("handles nested arrays", () => {
    const result = infer('{"grid":[[1,2],[3]]}');

    expect(result.objects[0].properties[0].type).toMatchObject({
      kind: "array",
      element: { kind: "array", element: { primitive: "int" } },
    });
  });

  it("generates the element type for an array-of-objects root", () => {
    const result = infer('[{"id":1}]', "Person");

    expect(result.root).toMatchObject({ kind: "array" });
    expect(result.objects[0].name).toBe("Person");
  });

  it("rejects a scalar root", () => {
    expect(inferRoot(42, "Root")).toEqual({
      ok: false,
      error: "Root must be an object or array of objects.",
    });
  });

  it("rejects an array of scalars at the root", () => {
    expect(inferRoot([1, 2], "Root")).toEqual({
      ok: false,
      error: "Root must be an object or array of objects.",
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/codegen/infer.test.ts`
Expected: FAIL — `Failed to resolve import "./infer"`.

- [ ] **Step 3: Write the IR types**

Create `src/lib/codegen/types.ts`:

```ts
/**
 * The intermediate representation between JSON inference and code emission.
 * Both emitters read this and neither knows about JSON, which is what keeps
 * "what shape is this data" separate from "how does C# spell it".
 */

export type PrimitiveKind =
  | "string"
  | "int"
  | "long"
  | "double"
  | "bool"
  /** A null-only value, an empty array, or elements that couldn't unify. */
  | "unknown";

export type TypeNode = { nullable: boolean } & (
  | { kind: "primitive"; primitive: PrimitiveKind }
  | { kind: "array"; element: TypeNode }
  | { kind: "object"; ref: string }
);

export type Property = { jsonKey: string; type: TypeNode };

export type ObjectType = { name: string; properties: Property[] };

export type InferResult = {
  root: TypeNode;
  /** Every named object type, deduplicated by shape, in inference order. */
  objects: ObjectType[];
};

function rootObjectRef(node: TypeNode): string | null {
  if (node.kind === "object") return node.ref;
  if (node.kind === "array") return rootObjectRef(node.element);
  return null;
}

/**
 * Objects in the order they should be declared. Inference registers children
 * before parents, so the root would otherwise be emitted last — readable code
 * leads with the type the caller actually named.
 */
export function declarationOrder(result: InferResult): ObjectType[] {
  const ref = rootObjectRef(result.root);
  const root = result.objects.find((object) => object.name === ref);
  if (!root) return result.objects;
  return [root, ...result.objects.filter((object) => object !== root)];
}
```

- [ ] **Step 4: Write the inference**

Create `src/lib/codegen/infer.ts`:

```ts
import type {
  InferResult,
  ObjectType,
  PrimitiveKind,
  Property,
  TypeNode,
} from "./types";

const INT_MIN = -2_147_483_648;
const INT_MAX = 2_147_483_647;

const UNKNOWN: TypeNode = {
  kind: "primitive",
  primitive: "unknown",
  nullable: false,
};

export function pascalCase(key: string): string {
  const words = key
    // Bounded quantifiers throughout: these run per key on pasted input.
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]{1,64}/)
    .filter(Boolean);

  const joined = words
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join("");

  if (joined === "") return "Item";
  // No identifier in C# or TypeScript may start with a digit.
  return /^[0-9]/.test(joined) ? `_${joined}` : joined;
}

/** Best-effort English singularization, used only to name array element types. */
export function singularize(word: string): string {
  if (/ss$/i.test(word)) return word;
  if (/ies$/i.test(word) && word.length > 3) return `${word.slice(0, -3)}y`;
  if (/(s|x|z|ch|sh)es$/i.test(word)) return word.slice(0, -2);
  if (/s$/i.test(word) && word.length > 1) return word.slice(0, -1);
  return word;
}

type Context = {
  objects: ObjectType[];
  /** Shape signature to the name already minted for it. */
  bySignature: Map<string, string>;
  usedNames: Set<string>;
};

function signatureOf(node: TypeNode): string {
  const nullable = node.nullable ? "?" : "";
  if (node.kind === "primitive") return `${node.primitive}${nullable}`;
  if (node.kind === "array") return `[${signatureOf(node.element)}]${nullable}`;
  // Children are deduplicated before their parents, so identical child shapes
  // already share a name and the parent signatures compare equal.
  return `{${node.ref}}${nullable}`;
}

function propertiesSignature(properties: Property[]): string {
  return properties
    .map((property) => `${property.jsonKey}:${signatureOf(property.type)}`)
    .join(",");
}

function allocateName(hint: string, ctx: Context): string {
  const base = pascalCase(hint);
  if (!ctx.usedNames.has(base)) {
    ctx.usedNames.add(base);
    return base;
  }

  let suffix = 2;
  while (ctx.usedNames.has(`${base}${suffix}`)) suffix += 1;
  const name = `${base}${suffix}`;
  ctx.usedNames.add(name);
  return name;
}

function widenNumeric(a: PrimitiveKind, b: PrimitiveKind): PrimitiveKind {
  if (a === "double" || b === "double") return "double";
  if (a === "long" || b === "long") return "long";
  return "int";
}

const NUMERIC = new Set<PrimitiveKind>(["int", "long", "double"]);

/** The type that describes both inputs, or unknown when they disagree. */
function unify(a: TypeNode, b: TypeNode): TypeNode {
  const nullable = a.nullable || b.nullable;

  // A null-only value carries no shape, so the other side wins outright.
  if (a.kind === "primitive" && a.primitive === "unknown") {
    return { ...b, nullable };
  }
  if (b.kind === "primitive" && b.primitive === "unknown") {
    return { ...a, nullable };
  }

  if (a.kind === "primitive" && b.kind === "primitive") {
    if (a.primitive === b.primitive) return { ...a, nullable };
    if (NUMERIC.has(a.primitive) && NUMERIC.has(b.primitive)) {
      return {
        kind: "primitive",
        primitive: widenNumeric(a.primitive, b.primitive),
        nullable,
      };
    }
    return { ...UNKNOWN, nullable };
  }

  if (a.kind === "array" && b.kind === "array") {
    return { kind: "array", element: unify(a.element, b.element), nullable };
  }

  if (a.kind === "object" && b.kind === "object" && a.ref === b.ref) {
    return { ...a, nullable };
  }

  return { ...UNKNOWN, nullable };
}

function inferValue(value: unknown, hint: string, ctx: Context): TypeNode {
  if (value === null) return { ...UNKNOWN, nullable: true };

  if (typeof value === "string") {
    return { kind: "primitive", primitive: "string", nullable: false };
  }

  if (typeof value === "boolean") {
    return { kind: "primitive", primitive: "bool", nullable: false };
  }

  if (typeof value === "number") {
    const primitive: PrimitiveKind = !Number.isInteger(value)
      ? "double"
      : value < INT_MIN || value > INT_MAX
        ? "long"
        : "int";
    return { kind: "primitive", primitive, nullable: false };
  }

  if (Array.isArray(value)) {
    const elementHint = singularize(hint);
    const element = value
      .map((item) => inferValue(item, elementHint, ctx))
      .reduce<TypeNode | null>(
        (acc, item) => (acc === null ? item : unify(acc, item)),
        null,
      );
    return { kind: "array", element: element ?? UNKNOWN, nullable: false };
  }

  if (typeof value === "object") {
    const properties: Property[] = Object.entries(
      value as Record<string, unknown>,
    ).map(([jsonKey, child]) => ({
      jsonKey,
      type: inferValue(child, jsonKey, ctx),
    }));

    const signature = propertiesSignature(properties);
    const existing = ctx.bySignature.get(signature);
    if (existing !== undefined) {
      return { kind: "object", ref: existing, nullable: false };
    }

    const name = allocateName(hint, ctx);
    ctx.bySignature.set(signature, name);
    ctx.objects.push({ name, properties });
    return { kind: "object", ref: name, nullable: false };
  }

  return UNKNOWN;
}

function isPlainObject(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type InferOutcome =
  | { ok: true; result: InferResult }
  | { ok: false; error: string };

const ROOT_ERROR = "Root must be an object or array of objects.";

export function inferRoot(value: unknown, rootName: string): InferOutcome {
  const rootIsObject = isPlainObject(value);
  const rootIsObjectArray =
    Array.isArray(value) && value.length > 0 && value.every(isPlainObject);

  if (!rootIsObject && !rootIsObjectArray) {
    return { ok: false, error: ROOT_ERROR };
  }

  const ctx: Context = {
    objects: [],
    bySignature: new Map(),
    usedNames: new Set(),
  };

  const root = inferValue(value, rootName, ctx);
  return { ok: true, result: { root, objects: ctx.objects } };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/codegen/infer.test.ts`
Expected: PASS, 29 tests.

- [ ] **Step 6: Run lint and build**

```bash
npm run format && npm run lint && npm run build
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/codegen/types.ts src/lib/codegen/infer.ts src/lib/codegen/infer.test.ts
git commit -m "feat: infer a type graph from parsed JSON"
```

---

### Task 5: JSON to Types — emitters and widget

**Files:**
- Create: `src/lib/codegen/emit-csharp.ts`
- Create: `src/lib/codegen/emit-csharp.test.ts`
- Create: `src/lib/codegen/emit-typescript.ts`
- Create: `src/lib/codegen/emit-typescript.test.ts`
- Create: `src/components/widgets/json-to-types.tsx`
- Create: `src/components/widgets/json-to-types.test.tsx`
- Modify: `src/components/window-store.ts` (`WidgetType` union)
- Modify: `src/components/window-manager.tsx` (imports and `widgetRegistry`)
- Modify: `src/components/start-menu-items.ts` (Developer submenu)
- Modify: `src/components/roadmap.ts` (Developer group)

**Interfaces:**
- Consumes: `InferResult`, `ObjectType`, `TypeNode`, `declarationOrder` from `src/lib/codegen/types.ts`; `inferRoot` from `src/lib/codegen/infer.ts`; `pascalCase` from `src/lib/codegen/infer.ts`; `Widget` from `@/components/widget`.
- Produces:
  - `emitCsharp(result: InferResult, style: CsharpStyle): string` and `type CsharpStyle = "record" | "class"` from `src/lib/codegen/emit-csharp.ts`.
  - `emitTypeScript(result: InferResult): string` from `src/lib/codegen/emit-typescript.ts`.
  - `JsonToTypes({ id }: { id: number })` from `src/components/widgets/json-to-types.tsx`; `WidgetType` gains `"JsonToTypes"`.

- [ ] **Step 1: Write the failing C# emitter test**

Create `src/lib/codegen/emit-csharp.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { emitCsharp } from "./emit-csharp";
import { inferRoot } from "./infer";
import type { InferResult } from "./types";

function ir(json: string, rootName = "Root"): InferResult {
  const outcome = inferRoot(JSON.parse(json), rootName);
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome.result;
}

describe("emitCsharp", () => {
  it("emits a record with init-only properties", () => {
    const code = emitCsharp(ir('{"Name":"x"}'), "record");

    expect(code).toContain("public record Root");
    expect(code).toContain("public string Name { get; init; }");
  });

  it("emits a class with settable properties", () => {
    const code = emitCsharp(ir('{"Name":"x"}'), "class");

    expect(code).toContain("public class Root");
    expect(code).toContain("public string Name { get; set; }");
  });

  it("adds JsonPropertyName only when the key differs from the property name", () => {
    const code = emitCsharp(ir('{"first_name":"x","Name":"y"}'), "record");

    expect(code).toContain('[JsonPropertyName("first_name")]');
    expect(code).not.toContain('[JsonPropertyName("Name")]');
  });

  it("includes the serialization using only when an attribute is emitted", () => {
    expect(emitCsharp(ir('{"first_name":"x"}'), "record")).toContain(
      "using System.Text.Json.Serialization;",
    );
    expect(emitCsharp(ir('{"Name":"x"}'), "record")).not.toContain("using ");
  });

  it("maps primitives to C# types", () => {
    const code = emitCsharp(
      ir('{"S":"x","I":1,"L":3000000000,"D":1.5,"B":true}'),
      "record",
    );

    expect(code).toContain("public string S");
    expect(code).toContain("public int I");
    expect(code).toContain("public long L");
    expect(code).toContain("public double D");
    expect(code).toContain("public bool B");
  });

  it("marks nullable values with a question mark", () => {
    const code = emitCsharp(ir('{"Maybe":null}'), "record");

    expect(code).toContain("public object? Maybe");
  });

  it("emits arrays with brackets", () => {
    const code = emitCsharp(ir('{"Tags":["a"]}'), "record");

    expect(code).toContain("public string[] Tags");
  });

  it("emits nested types after the root", () => {
    const code = emitCsharp(ir('{"Address":{"City":"x"}}', "Person"), "record");

    expect(code.indexOf("public record Person")).toBeLessThan(
      code.indexOf("public record Address"),
    );
    expect(code).toContain("public Address Address");
  });

  it("renames a property that would collide with its enclosing type", () => {
    // C# rejects a member with the same name as the type that contains it.
    const code = emitCsharp(ir('{"person":{"person":"x"}}', "Root"), "record");

    expect(code).toContain("public record Person");
    expect(code).toContain("public string PersonValue { get; init; }");
    expect(code).toContain('[JsonPropertyName("person")]');
  });

  it("disambiguates two keys that pascal-case to the same name", () => {
    const code = emitCsharp(ir('{"first_name":"a","firstName":"b"}'), "record");

    expect(code).toContain("public string FirstName");
    expect(code).toContain("public string FirstName2");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/codegen/emit-csharp.test.ts`
Expected: FAIL — `Failed to resolve import "./emit-csharp"`.

- [ ] **Step 3: Write the C# emitter**

Create `src/lib/codegen/emit-csharp.ts`:

```ts
import { pascalCase } from "./infer";
import {
  declarationOrder,
  type InferResult,
  type ObjectType,
  type TypeNode,
} from "./types";

export type CsharpStyle = "record" | "class";

const PRIMITIVES: Record<string, string> = {
  string: "string",
  int: "int",
  long: "long",
  double: "double",
  bool: "bool",
  unknown: "object",
};

function renderType(node: TypeNode): string {
  const suffix = node.nullable ? "?" : "";
  if (node.kind === "primitive") return `${PRIMITIVES[node.primitive]}${suffix}`;
  if (node.kind === "array") return `${renderType(node.element)}[]${suffix}`;
  return `${node.ref}${suffix}`;
}

/**
 * Property names for one type. Two keys can pascal-case to the same name, and
 * C# additionally rejects a member named after its own enclosing type, so both
 * are resolved here rather than at the call site.
 */
function propertyNames(object: ObjectType): string[] {
  const used = new Set<string>();

  return object.properties.map((property) => {
    let name = pascalCase(property.jsonKey);
    if (name === object.name) name = `${name}Value`;

    if (used.has(name)) {
      let suffix = 2;
      while (used.has(`${name}${suffix}`)) suffix += 1;
      name = `${name}${suffix}`;
    }

    used.add(name);
    return name;
  });
}

export function emitCsharp(result: InferResult, style: CsharpStyle): string {
  const accessor = style === "record" ? "init" : "set";
  const keyword = style === "record" ? "record" : "class";

  let needsUsing = false;
  const declarations = declarationOrder(result).map((object) => {
    const names = propertyNames(object);

    const members = object.properties.map((property, index) => {
      const name = names[index];
      const lines: string[] = [];

      if (name !== property.jsonKey) {
        needsUsing = true;
        lines.push(`    [JsonPropertyName("${property.jsonKey}")]`);
      }

      lines.push(
        `    public ${renderType(property.type)} ${name} { get; ${accessor}; }`,
      );
      return lines.join("\n");
    });

    return `public ${keyword} ${object.name}\n{\n${members.join("\n\n")}\n}`;
  });

  const body = declarations.join("\n\n");
  return needsUsing
    ? `using System.Text.Json.Serialization;\n\n${body}\n`
    : `${body}\n`;
}
```

- [ ] **Step 4: Run the C# test to verify it passes**

Run: `npx vitest run src/lib/codegen/emit-csharp.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Write the failing TypeScript emitter test**

Create `src/lib/codegen/emit-typescript.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { emitTypeScript } from "./emit-typescript";
import { inferRoot } from "./infer";
import type { InferResult } from "./types";

function ir(json: string, rootName = "Root"): InferResult {
  const outcome = inferRoot(JSON.parse(json), rootName);
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome.result;
}

describe("emitTypeScript", () => {
  it("emits an exported interface", () => {
    const code = emitTypeScript(ir('{"name":"x"}'));

    expect(code).toContain("export interface Root {");
    expect(code).toContain("  name: string;");
  });

  it("keeps the original JSON keys rather than renaming them", () => {
    const code = emitTypeScript(ir('{"first_name":"x"}'));

    expect(code).toContain("  first_name: string;");
  });

  it("quotes keys that are not valid identifiers", () => {
    const code = emitTypeScript(ir('{"content-type":"x"}'));

    expect(code).toContain('  "content-type": string;');
  });

  it("maps every numeric primitive to number", () => {
    const code = emitTypeScript(ir('{"i":1,"l":3000000000,"d":1.5}'));

    expect(code).toContain("  i: number;");
    expect(code).toContain("  l: number;");
    expect(code).toContain("  d: number;");
  });

  it("maps bool to boolean and an unresolved value to unknown", () => {
    const code = emitTypeScript(ir('{"b":true,"mixed":[1,"a"]}'));

    expect(code).toContain("  b: boolean;");
    expect(code).toContain("  mixed: unknown[];");
  });

  it("unions null onto a nullable property", () => {
    const code = emitTypeScript(ir('{"maybe":null}'));

    expect(code).toContain("  maybe: unknown | null;");
  });

  it("parenthesizes a nullable array element", () => {
    const code = emitTypeScript(ir('{"names":["a",null]}'));

    expect(code).toContain("  names: (string | null)[];");
  });

  it("emits nested interfaces after the root", () => {
    const code = emitTypeScript(ir('{"address":{"city":"x"}}', "Person"));

    expect(code.indexOf("interface Person")).toBeLessThan(
      code.indexOf("interface Address"),
    );
    expect(code).toContain("  address: Address;");
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run src/lib/codegen/emit-typescript.test.ts`
Expected: FAIL — `Failed to resolve import "./emit-typescript"`.

- [ ] **Step 7: Write the TypeScript emitter**

Create `src/lib/codegen/emit-typescript.ts`:

```ts
import { declarationOrder, type InferResult, type TypeNode } from "./types";

const PRIMITIVES: Record<string, string> = {
  string: "string",
  int: "number",
  long: "number",
  double: "number",
  bool: "boolean",
  unknown: "unknown",
};

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]{0,255}$/;

function renderType(node: TypeNode): string {
  let base: string;

  if (node.kind === "primitive") {
    base = PRIMITIVES[node.primitive];
  } else if (node.kind === "array") {
    const element = renderType(node.element);
    // A union inside an array needs parentheses or the [] binds to null alone.
    base = node.element.nullable ? `(${element})[]` : `${element}[]`;
  } else {
    base = node.ref;
  }

  return node.nullable ? `${base} | null` : base;
}

export function emitTypeScript(result: InferResult): string {
  const declarations = declarationOrder(result).map((object) => {
    const members = object.properties.map((property) => {
      const key = IDENTIFIER.test(property.jsonKey)
        ? property.jsonKey
        : JSON.stringify(property.jsonKey);
      return `  ${key}: ${renderType(property.type)};`;
    });

    return `export interface ${object.name} {\n${members.join("\n")}\n}`;
  });

  return `${declarations.join("\n\n")}\n`;
}
```

- [ ] **Step 8: Run the TypeScript test to verify it passes**

Run: `npx vitest run src/lib/codegen/emit-typescript.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 9: Write the failing widget test**

Create `src/components/widgets/json-to-types.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { JsonToTypes } from "./json-to-types";

const source = () => screen.getByLabelText("JSON");
const output = () => screen.getByLabelText("Generated") as HTMLTextAreaElement;
const language = () => screen.getByLabelText("Language");
const rootName = () => screen.getByLabelText("Root type name");

describe("JsonToTypes", () => {
  it("generates a C# record by default", async () => {
    const user = userEvent.setup();
    render(<JsonToTypes id={1} />);

    await user.click(source());
    await user.paste('{"name":"x"}');

    expect(output().value).toContain("public record Root");
    expect(output().value).toContain("{ get; init; }");
  });

  it("switches to classes when the class radio is chosen", async () => {
    const user = userEvent.setup();
    render(<JsonToTypes id={1} />);

    await user.click(source());
    await user.paste('{"name":"x"}');
    await user.click(screen.getByLabelText("class"));

    expect(output().value).toContain("public class Root");
    expect(output().value).toContain("{ get; set; }");
  });

  it("generates TypeScript interfaces", async () => {
    const user = userEvent.setup();
    render(<JsonToTypes id={1} />);

    await user.click(source());
    await user.paste('{"name":"x"}');
    await user.selectOptions(language(), "typescript");

    expect(output().value).toContain("export interface Root {");
    expect(output().value).toContain("name: string;");
  });

  it("disables the record and class radios for TypeScript", async () => {
    const user = userEvent.setup();
    render(<JsonToTypes id={1} />);

    await user.selectOptions(language(), "typescript");

    expect(screen.getByLabelText("record")).toBeDisabled();
    expect(screen.getByLabelText("class")).toBeDisabled();
  });

  it("names the root type from the root name field", async () => {
    const user = userEvent.setup();
    render(<JsonToTypes id={1} />);

    await user.click(source());
    await user.paste('{"name":"x"}');
    await user.clear(rootName());
    await user.type(rootName(), "Person");

    expect(output().value).toContain("public record Person");
  });

  it("reports invalid JSON and clears the output", async () => {
    const user = userEvent.setup();
    render(<JsonToTypes id={1} />);

    await user.click(source());
    await user.paste('{"name":"x"}');
    expect(output().value).not.toBe("");

    await user.paste("!");

    expect(screen.getByText("Invalid JSON.")).toBeInTheDocument();
    expect(output().value).toBe("");
  });

  it("reports a scalar root", async () => {
    const user = userEvent.setup();
    render(<JsonToTypes id={1} />);

    await user.click(source());
    await user.paste("42");

    expect(
      screen.getByText("Root must be an object or array of objects."),
    ).toBeInTheDocument();
    expect(output().value).toBe("");
  });

  it("treats empty input as valid rather than an error", () => {
    render(<JsonToTypes id={1} />);

    expect(output().value).toBe("");
    expect(screen.queryByText("Invalid JSON.")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 10: Run the test to verify it fails**

Run: `npx vitest run src/components/widgets/json-to-types.test.tsx`
Expected: FAIL — `Failed to resolve import "./json-to-types"`.

- [ ] **Step 11: Write the widget**

Create `src/components/widgets/json-to-types.tsx`:

```tsx
import { useMemo, useState } from "react";
import { Widget } from "@/components/widget";
import { type CsharpStyle, emitCsharp } from "@/lib/codegen/emit-csharp";
import { emitTypeScript } from "@/lib/codegen/emit-typescript";
import { inferRoot } from "@/lib/codegen/infer";

type Language = "csharp" | "typescript";

export function JsonToTypes({ id }: { id: number }) {
  const [txtSource, setSource] = useState("");
  const [language, setLanguage] = useState<Language>("csharp");
  const [style, setStyle] = useState<CsharpStyle>("record");
  const [rootName, setRootName] = useState("Root");

  const { txtOutput, error } = useMemo(() => {
    if (txtSource.trim() === "") return { txtOutput: "", error: null };

    let parsed: unknown;
    try {
      parsed = JSON.parse(txtSource);
    } catch {
      return { txtOutput: "", error: "Invalid JSON." };
    }

    const outcome = inferRoot(parsed, rootName.trim() || "Root");
    if (!outcome.ok) return { txtOutput: "", error: outcome.error };

    return {
      txtOutput:
        language === "csharp"
          ? emitCsharp(outcome.result, style)
          : emitTypeScript(outcome.result),
      error: null,
    };
  }, [txtSource, language, style, rootName]);

  return (
    <Widget windowID={id} initialHeight={560} initialWidth={720}>
      <Widget.Title>JSON to Types</Widget.Title>
      <Widget.Body className="flex flex-col gap-1 lg:gap-4 pb-2 lg:pb-4">
        <div className="flex flex-wrap items-end gap-4 grow-0">
          <div className="field-row-stacked">
            <label htmlFor="sel_language">Language</label>
            <select
              id="sel_language"
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
            >
              <option value="csharp">C#</option>
              <option value="typescript">TypeScript</option>
            </select>
          </div>
          {/* Disabled rather than hidden for TypeScript, so the row of
              controls doesn't reflow when the language changes. */}
          <div className="field-row">
            <input
              id="rad_record"
              type="radio"
              name="csharp_style"
              checked={style === "record"}
              disabled={language !== "csharp"}
              onChange={() => setStyle("record")}
            />
            <label htmlFor="rad_record">record</label>
            <input
              id="rad_class"
              type="radio"
              name="csharp_style"
              checked={style === "class"}
              disabled={language !== "csharp"}
              onChange={() => setStyle("class")}
            />
            <label htmlFor="rad_class">class</label>
          </div>
          <div className="field-row-stacked">
            <label htmlFor="txt_root_name">Root type name</label>
            <input
              id="txt_root_name"
              type="text"
              value={rootName}
              onChange={(e) => setRootName(e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1 lg:gap-4 grow min-h-0">
          <div className="field-row-stacked">
            <label htmlFor="txt_json_source">JSON</label>
            <textarea
              className="h-full w-full"
              id="txt_json_source"
              value={txtSource}
              onChange={(e) => setSource(e.target.value)}
            ></textarea>
          </div>
          <div className="field-row-stacked">
            <label htmlFor="txt_types_output">Generated</label>
            <textarea
              className="h-full w-full"
              id="txt_types_output"
              readOnly={true}
              value={txtOutput}
            ></textarea>
          </div>
        </div>
      </Widget.Body>
      <Widget.Status>
        <span className="text-red-500">{error ?? "\u00A0"}</span>
      </Widget.Status>
    </Widget>
  );
}
```

- [ ] **Step 12: Register the widget**

In `src/components/window-store.ts`, add `| "JsonToTypes"` to the `WidgetType` union.

In `src/components/window-manager.tsx`, add the import and registry entry:

```tsx
import { JsonToTypes as JsonToTypesWidget } from "@/components/widgets/json-to-types";
```

```tsx
  JsonToTypes: memo(JsonToTypesWidget),
```

In `src/components/start-menu-items.ts`, extend the Developer submenu:

```ts
    submenu: [
      { label: "JSON to Types", widget: "JsonToTypes" },
      { label: "JWT Decoder", widget: "JwtDecoder" },
    ],
```

In `src/components/roadmap.ts`, extend the Developer group:

```ts
  {
    group: "Developer",
    entries: [
      { label: "JSON to Types", widget: "JsonToTypes" },
      { label: "JWT Decoder", widget: "JwtDecoder" },
    ],
  },
```

- [ ] **Step 13: Run the widget test to verify it passes**

Run: `npx vitest run src/components/widgets/json-to-types.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 14: Run the full suite, lint and build**

```bash
npm run format && npm run lint && npm test && npm run build
```

Expected: all pass.

- [ ] **Step 15: Confirm react-doctor is still at its accepted baseline**

```bash
npm run doctor
```

Expected: 14 findings, all of them the ones catalogued in CLAUDE.md. Any new finding needs fixing or documenting before commit.

- [ ] **Step 16: Commit**

```bash
git add src/lib/codegen/emit-csharp.ts src/lib/codegen/emit-csharp.test.ts src/lib/codegen/emit-typescript.ts src/lib/codegen/emit-typescript.test.ts src/components/widgets/json-to-types.tsx src/components/widgets/json-to-types.test.tsx src/components/window-store.ts src/components/window-manager.tsx src/components/start-menu-items.ts src/components/roadmap.ts
git commit -m "feat: add JSON to Types widget"
```

---

### Task 6: Verify the widgets in a real browser

jsdom proves the logic; it does not prove the windows lay out correctly inside 98.css, and CLAUDE.md notes that swapping a tag can silently change the look. This task is manual verification against the dev server.

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Start it through the agent's preview tooling rather than a bare `npm run dev` in a background shell. If `.claude/launch.json` does not already exist, create it:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "w98tools",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "port": 5173
    }
  ]
}
```

Humans running this by hand use portless instead, which serves the app at `https://w98tools.localhost`:

```bash
portless
```

If the page comes up blank, stop the server, `rm -rf node_modules/.vite`, and start it again — that is the known symptom of an orphaned HMR entry script.

- [ ] **Step 2: Open each new widget from the Start menu**

Confirm, for each of Prettify SQL, Split & Join, JWT Decoder, and JSON to Types:

- The Start menu row opens the window (Prettify → SQL; String Utilities → Split & Join; Developer → JWT Decoder and JSON to Types).
- The window drags, minimizes, maximizes and closes.
- Labels sit beside their controls rather than stacking oddly — the `<label>`/`<span>` hazard in CLAUDE.md.
- The status bar stays inside the window frame rather than being pushed through the bottom.

- [ ] **Step 3: Check the console and the Welcome window**

Confirm there are no console errors, and that the Welcome window's "Implemented" percentage rose to 100% (every roadmap entry now has a `widget`).

- [ ] **Step 4: Commit any fixes**

If nothing needed fixing, there is nothing to commit and the plan is complete.

---

## Notes for the implementer

- **Do not add exports to `window-manager.tsx`.** It exports only its component so Fast Refresh preserves window state.
- **`setFormat(fn)` is a trap.** React treats a function argument to a setter as an updater. Task 1 uses `setFormat(() => fn)` for that reason.
- **Blank page after touching `vite.config.ts`?** Stop the dev server, `rm -rf node_modules/.vite`, start it again. None of these tasks should need to touch that file.
- **`npm test` runs the whole suite**; `npx vitest run <path>` runs one file while iterating.
