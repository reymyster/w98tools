# Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Survive a reload — restore which windows were open and where, and what was typed into them — without leaving a JWT on disk.

**Architecture:** Four tasks. Task 1 is a storage library with no React: a versioned, TTL-aware, throw-proof wrapper over `localStorage`/`sessionStorage`. Task 2 persists the window store on top of it and fixes the id-counter collision. Task 3 adds the hook widgets use for their own content, plus orphan cleanup. Task 4 wires the JWT token to `sessionStorage`, extends Reset Windows, and documents everything.

**Tech Stack:** React 19, TypeScript 7, zustand (+ `persist` middleware), Vitest + jsdom + Testing Library, Biome.

## Global Constraints

- **Biome owns formatting.** Space/2, double quotes, 80 cols. Never hand-format; run `npm run format`. Lint with `npm run lint`.
- **No test globals.** Every spec imports explicitly from `"vitest"`.
- **Tests live next to the code.**
- **`src/components/window-manager.tsx` must export only its component.**
- **Anything read from storage is untrusted input.** It may be malformed, truncated, or written by an older version. Parse defensively and fall back to defaults — never let a throw escape into render. The per-widget error boundary is a net, not a substitute.
- **Storage writes can throw** (Safari private mode, quota exceeded). A failed save must never break the app.
- **`npm run build`** (`tsc -b && vite build`) is the type-check and must pass.
- **`npm run doctor` must stay at exactly 14 findings.**
- **`npm ci` must still work.** If you touch `package.json`, regenerate the lock and read CLAUDE.md's note on the `@emnapi` pins first — a local `npm ci` passing does not prove CI will.
- **No new dependencies.** `zustand/persist` ships with zustand, which is already a dependency.
- **Record identity in the store is load-bearing** — see CLAUDE.md. Actions must reuse the object identity of records they do not change.

---

### Task 1: Storage library

A versioned, TTL-aware wrapper over the Web Storage API. No React.

**Files:**
- Create: `src/lib/storage.ts`
- Create: `src/lib/storage.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `const SCHEMA_VERSION: number`
  - `type Envelope<T> = { version: number; savedAt: number; value: T }`
  - `loadValue<T>(storage: Storage, key: string, maxAgeMs: number | null, now?: number): T | undefined`
  - `saveValue<T>(storage: Storage, key: string, value: T, now?: number): void`
  - `removeValue(storage: Storage, key: string): void`
  - `listKeys(storage: Storage, prefix: string): string[]`
  - `purgeExpired(storage: Storage, prefix: string, maxAgeMs: number, now?: number): number` — returns how many were removed
  - `const CONTENT_TTL_MS: number` — 3 days
  - `const KEY_PREFIX: string` — `"w98:"`

`now` is a parameter (defaulting to `Date.now()`) so tests are deterministic without fake timers.

- [ ] **Step 1: Write the failing test**

Create `src/lib/storage.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONTENT_TTL_MS,
  listKeys,
  loadValue,
  purgeExpired,
  removeValue,
  saveValue,
  SCHEMA_VERSION,
} from "./storage";

const NOW = 1_700_000_000_000;

/** A real Storage implementation, so tests exercise the actual API surface. */
function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => {
      map.delete(k);
    },
    setItem: (k, v) => {
      map.set(k, v);
    },
  } as Storage;
}

describe("saveValue / loadValue", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = makeStorage();
  });

  it("round-trips a value", () => {
    saveValue(storage, "w98:a", { hello: "world" }, NOW);

    expect(loadValue(storage, "w98:a", null, NOW)).toEqual({ hello: "world" });
  });

  it("round-trips values that JSON preserves exactly", () => {
    saveValue(storage, "w98:a", [1, "two", true, null], NOW);

    expect(loadValue(storage, "w98:a", null, NOW)).toEqual([1, "two", true, null]);
  });

  it("returns undefined for a key that was never written", () => {
    expect(loadValue(storage, "w98:missing", null, NOW)).toBeUndefined();
  });

  it("returns the value while it is within its TTL", () => {
    saveValue(storage, "w98:a", "fresh", NOW);

    expect(loadValue(storage, "w98:a", CONTENT_TTL_MS, NOW + 1000)).toBe("fresh");
  });

  it("returns undefined once the TTL has passed", () => {
    saveValue(storage, "w98:a", "stale", NOW);

    expect(
      loadValue(storage, "w98:a", CONTENT_TTL_MS, NOW + CONTENT_TTL_MS + 1),
    ).toBeUndefined();
  });

  it("ignores the TTL entirely when it is null", () => {
    saveValue(storage, "w98:a", "kept", NOW);

    expect(loadValue(storage, "w98:a", null, NOW + CONTENT_TTL_MS * 100)).toBe(
      "kept",
    );
  });

  it("discards a value written by a different schema version", () => {
    storage.setItem(
      "w98:a",
      JSON.stringify({ version: SCHEMA_VERSION + 1, savedAt: NOW, value: "x" }),
    );

    expect(loadValue(storage, "w98:a", null, NOW)).toBeUndefined();
  });

  it("discards malformed JSON rather than throwing", () => {
    storage.setItem("w98:a", "{not json");

    expect(() => loadValue(storage, "w98:a", null, NOW)).not.toThrow();
    expect(loadValue(storage, "w98:a", null, NOW)).toBeUndefined();
  });

  it("discards JSON that is not an envelope", () => {
    storage.setItem("w98:a", JSON.stringify({ nope: true }));

    expect(loadValue(storage, "w98:a", null, NOW)).toBeUndefined();
  });

  it("discards an envelope whose savedAt is not a finite number", () => {
    storage.setItem(
      "w98:a",
      JSON.stringify({ version: SCHEMA_VERSION, savedAt: "soon", value: "x" }),
    );

    expect(loadValue(storage, "w98:a", CONTENT_TTL_MS, NOW)).toBeUndefined();
  });

  it("swallows a storage that throws on write", () => {
    const hostile = {
      ...makeStorage(),
      setItem: () => {
        throw new DOMException("QuotaExceededError");
      },
    } as Storage;

    expect(() => saveValue(hostile, "w98:a", "x", NOW)).not.toThrow();
  });

  it("swallows a storage that throws on read", () => {
    const hostile = {
      ...makeStorage(),
      getItem: () => {
        throw new DOMException("SecurityError");
      },
    } as Storage;

    expect(() => loadValue(hostile, "w98:a", null, NOW)).not.toThrow();
    expect(loadValue(hostile, "w98:a", null, NOW)).toBeUndefined();
  });
});

describe("listKeys / removeValue", () => {
  it("lists only keys carrying the prefix", () => {
    const storage = makeStorage();
    saveValue(storage, "w98:one", 1, NOW);
    saveValue(storage, "w98:two", 2, NOW);
    storage.setItem("other", "x");

    expect(listKeys(storage, "w98:").sort()).toEqual(["w98:one", "w98:two"]);
  });

  it("removes a value", () => {
    const storage = makeStorage();
    saveValue(storage, "w98:a", 1, NOW);

    removeValue(storage, "w98:a");

    expect(loadValue(storage, "w98:a", null, NOW)).toBeUndefined();
  });
});

describe("purgeExpired", () => {
  it("removes expired entries and keeps fresh ones", () => {
    const storage = makeStorage();
    saveValue(storage, "w98:old", "gone", NOW);
    saveValue(storage, "w98:new", "kept", NOW + CONTENT_TTL_MS);

    const removed = purgeExpired(
      storage,
      "w98:",
      CONTENT_TTL_MS,
      NOW + CONTENT_TTL_MS + 1,
    );

    expect(removed).toBe(1);
    expect(loadValue(storage, "w98:new", null, NOW)).toBe("kept");
    expect(storage.getItem("w98:old")).toBeNull();
  });

  it("removes entries it cannot parse, since they can never be read anyway", () => {
    const storage = makeStorage();
    storage.setItem("w98:junk", "{not json");

    expect(purgeExpired(storage, "w98:", CONTENT_TTL_MS, NOW)).toBe(1);
    expect(storage.getItem("w98:junk")).toBeNull();
  });

  it("leaves keys outside the prefix alone", () => {
    const storage = makeStorage();
    storage.setItem("other", "{not json");

    purgeExpired(storage, "w98:", CONTENT_TTL_MS, NOW);

    expect(storage.getItem("other")).toBe("{not json");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/storage.test.ts`
Expected: FAIL — `Failed to resolve import "./storage"`.

- [ ] **Step 3: Write the library**

Create `src/lib/storage.ts`. Requirements the tests pin down:

- Every write is wrapped in an envelope `{ version, savedAt, value }` and JSON-stringified.
- **Every** call into the Storage API is wrapped in `try`/`catch`. `setItem` throws on quota exhaustion and in Safari private mode; `getItem` can throw a `SecurityError` when cookies are blocked. Persistence is a convenience and must never break the app.
- A read returns `undefined` — never throws — when the key is absent, the JSON is malformed, the parsed value is not an envelope, `version` does not match `SCHEMA_VERSION`, `savedAt` is not a finite number, or the entry is older than `maxAgeMs`.
- `maxAgeMs === null` means never expires.
- `purgeExpired` also removes entries it cannot parse: an unreadable entry is dead weight that `loadValue` would reject forever.
- `SCHEMA_VERSION` starts at `1`. `CONTENT_TTL_MS` is 3 days in milliseconds, written as a readable expression rather than a magic number. `KEY_PREFIX` is `"w98:"`.

Guard the envelope with a type predicate rather than a cast — the whole point is that this input is untrusted.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/storage.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 5: Lint, build, commit**

```bash
npm run format && npm run lint && npm test && npm run build
```

```bash
git add src/lib/storage.ts src/lib/storage.test.ts
git commit -m "feat: add versioned, TTL-aware storage helpers"
```

---

### Task 2: Persist the window layout

**Files:**
- Modify: `src/components/window-store.ts`
- Modify: `src/components/window-store.test.ts`

**Interfaces:**
- Consumes: `SCHEMA_VERSION`, `KEY_PREFIX` from `src/lib/storage.ts`.
- Produces: the store persists itself; exports `LAYOUT_STORAGE_KEY` and `clampToDesktop(geometry, desktop)`.

- [ ] **Step 1: Understand the collision this must avoid**

Read `src/components/window-store.ts`. `lastWindowId` is a module-level counter starting at 0, and its comment records that duplicate ids previously caused windows to be dropped and duplicated, because the id is the React key. Restoring windows with ids 1–3 leaves the counter at 0, so the next `addWindow` mints id 1 — a duplicate. **After rehydration the counter must be advanced past the highest restored id.**

- [ ] **Step 2: Write the failing tests**

Append to `src/components/window-store.test.ts` a `describe("persistence")` block covering:

- After rehydrating a persisted state containing windows with ids 4 and 7, a subsequent `addWindow` produces an id greater than 7, and no two windows share an id.
- Restored geometry lying outside the current desktop is clamped back inside it — a window saved at `x: 1500` restores visible on a 1000-wide desktop.
- `clampToDesktop` never returns a negative `x`/`y`, and never returns a width or height larger than the desktop.
- A persisted payload with a different schema version is discarded, leaving the default lone Welcome window.
- A malformed persisted payload is discarded rather than throwing.
- The persisted shape contains no widget content — only window records.

Drive rehydration through the store's real rehydrate path rather than reaching into internals, so the test exercises what actually runs on load.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/components/window-store.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement**

Wrap the store in zustand's `persist` middleware:

- `name: LAYOUT_STORAGE_KEY` (`` `${KEY_PREFIX}layout` ``).
- `version: SCHEMA_VERSION`, and a `migrate` that **discards** by returning the default state rather than attempting to transform — guessing at a migration risks restoring nonsense, and the cost of discarding is one session's layout.
- `partialize` to persist only `windows`. Nothing else in the store is worth restoring.
- `onRehydrateStorage` returns the handler that advances `lastWindowId` past the highest restored id, and clamps each restored `geometry` into the current desktop bounds.
- Layout has no TTL — it is not sensitive and it is the main daily benefit.
- A `Storage` that throws must not break startup.

Add `clampToDesktop(geometry, desktop)`: clamp `width`/`height` to the desktop, then `x`/`y` so the window stays fully inside, never returning negatives. Desktop bounds are the viewport minus the 48px taskbar, matching `widget.tsx`.

Do not change `addWindow`'s zIndex behaviour, `removeWindow`, `bringToTop`'s early return, or `applyLayout`. Keep record identity intact.

- [ ] **Step 5: Run the tests, then verify by hand**

```bash
npx vitest run src/components/window-store.test.ts
npm test
```

Then in a browser at `https://w98tools.localhost` (start from the project's launch config, not a bare `npm run dev`): open three tools, arrange them with the taskbar's Quarters, reload, and confirm the same three windows come back in the same places. Then shrink the browser window a lot and reload again, confirming nothing is stranded off-screen. Report what you saw.

- [ ] **Step 6: Lint, build, doctor, commit**

```bash
npm run format && npm run lint && npm test && npm run build && npm run doctor
```

```bash
git add src/components/window-store.ts src/components/window-store.test.ts
git commit -m "feat: restore the window layout across reloads"
```

---

### Task 3: Persist widget contents

**Files:**
- Create: `src/components/use-persistent-state.ts`
- Create: `src/components/use-persistent-state.test.tsx`
- Modify: `src/components/widgets/prettify-json.tsx`, `prettify-sql.tsx`, `search-replace.tsx`, `split-join.tsx`, `json-to-types.tsx`
- Modify: `src/components/window-store.ts` (drop content when a window closes)

**Interfaces:**
- Consumes: `loadValue`, `saveValue`, `removeValue`, `listKeys`, `purgeExpired`, `CONTENT_TTL_MS`, `KEY_PREFIX` from `src/lib/storage.ts`.
- Produces:
  - `usePersistentState<T>(windowID: number, field: string, initial: T): [T, (value: T) => void]`
  - `contentKey(windowID: number, field: string): string`
  - `dropWindowContent(windowID: number): void`
  - `sweepContent(liveWindowIDs: number[]): void`

- [ ] **Step 1: Write the failing test**

Create `src/components/use-persistent-state.test.tsx`. Cover:

- A value written through the hook is readable by a fresh mount with the same window id and field.
- Two windows with different ids do not share a value for the same field name.
- Two different fields in the same window do not collide.
- A value older than `CONTENT_TTL_MS` is ignored and the initial value is used instead — drive this by writing an envelope with an old `savedAt` directly, not by mocking the clock.
- Malformed stored content falls back to the initial value rather than throwing.
- `dropWindowContent` removes every field for that window and leaves other windows' content alone.
- `sweepContent` removes content belonging to window ids not in the live list.

Render a real component using the hook rather than testing the hook in isolation, matching the repo's convention of rendering real components in jsdom. Clear `localStorage` between tests.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/use-persistent-state.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

Create `src/components/use-persistent-state.ts`:

- `contentKey(windowID, field)` returns `` `${KEY_PREFIX}content:${windowID}:${field}` ``.
- `usePersistentState` reads once on first render via a lazy `useState` initialiser (not an effect, so there is no flash of the default value), and writes on every change.
- Writes must not run on every keystroke — debounce them, or write in an effect keyed to the value. Whichever you choose, say why in a comment, and make sure a value typed and then immediately reloaded is not lost.
- `dropWindowContent(windowID)` removes every key with that window's content prefix.
- `sweepContent(liveWindowIDs)` calls `purgeExpired`, then removes any content key whose window id is not in the live list.

- [ ] **Step 4: Adopt it in the widgets**

Replace the content `useState` calls with `usePersistentState` in the five widgets listed above. Persist the user's *inputs* and option choices — source text, find/replace terms, delimiter selections, the quote checkbox, language and style choices, the root type name. Do **not** persist derived output; it is recomputed from the input on render.

**Do not touch `jwt-decoder.tsx`** — that is Task 4, and its token must never reach `localStorage`.

**Do not persist `image-ocr.tsx`'s image or `pdf-export.tsx`'s generated document** — large binary blobs, low value, and a quota risk.

- [ ] **Step 5: Drop content when a window closes**

In `window-store.ts`, have `removeWindow` call `dropWindowContent(id)`, and `reset` clear all content. Call `sweepContent` once on rehydration with the restored window ids.

Watch for an import cycle: `window-store.ts` importing from `use-persistent-state.ts` which imports the store would be circular. If that arises, put the content-key helpers in `src/lib/storage.ts` or a separate module that neither imports the other — say which you did and why.

- [ ] **Step 6: Run the tests, then verify by hand**

```bash
npm test
```

Then in a browser: type into Prettify SQL, Split & Join and JSON to Types, reload, and confirm the text comes back. Close a window, reload, and confirm its content is gone from `localStorage` (check via devtools). Report what you saw.

- [ ] **Step 7: Lint, build, doctor, commit**

```bash
npm run format && npm run lint && npm test && npm run build && npm run doctor
```

```bash
git add -A
git commit -m "feat: remember what was typed into each widget"
```

---

### Task 4: The JWT token, Reset Windows, and docs

**Files:**
- Modify: `src/components/use-persistent-state.ts` (session-scoped variant)
- Modify: `src/components/widgets/jwt-decoder.tsx`
- Modify: `src/components/widgets/jwt-decoder.test.tsx`
- Modify: `src/components/start-bar.tsx` or `src/components/window-store.ts` (whichever owns the reset action)
- Modify: `CLAUDE.md`, `README.md`

- [ ] **Step 1: Write the failing tests**

In `src/components/widgets/jwt-decoder.test.tsx`, add tests asserting:

- A token typed into the widget is readable from `sessionStorage` after a remount.
- **The token does not appear anywhere in `localStorage`** — assert across every `localStorage` key, not just the one you expect, so the test would catch it leaking under a different key.

In the store tests, assert that Reset Windows clears both `localStorage` and `sessionStorage` of this app's keys, and leaves unrelated keys alone.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/widgets/jwt-decoder.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

- Add a session-scoped variant of the hook (a `storage` parameter, or a `useSessionState` wrapper) that targets `sessionStorage`. Reuse the same envelope and defensive parsing; a session value needs no TTL, since the tab closing is the expiry.
- Use it for the JWT token field only.
- Extend the reset action to clear every key under `KEY_PREFIX` from both storages. It must remove only this app's keys — a blanket `localStorage.clear()` would wipe unrelated data on the same origin.

- [ ] **Step 4: Document**

`CLAUDE.md` gains, in its gotchas voice:
- What is persisted where and why — layout in `localStorage` indefinitely, content with a 3-day TTL, the JWT token in `sessionStorage` so a credential never touches disk.
- That TTL is checked on *read*, so an expired value survives on disk until the app is next opened. It is decluttering, not a privacy guarantee — and that is exactly why the token is session-scoped.
- The id-counter trap: restoring windows without advancing `lastWindowId` mints duplicate ids, which are also duplicate React keys.
- That a version mismatch discards rather than migrates, and how to bump `SCHEMA_VERSION` when the shape changes.
- That everything read from storage is untrusted input and must be parsed defensively.

`README.md` gains a brief note that the app remembers your windows and what you typed, that contents expire after a few days, and that JWTs are deliberately never written to disk.

- [ ] **Step 5: Verify the whole feature by hand**

At `https://w98tools.localhost`: paste a token into the JWT decoder, reload (it should come back), then close the tab, reopen, and confirm the token is gone while the other windows and their contents return. Inspect `localStorage` in devtools and confirm no token is present under any key. Then use Reset Windows and confirm both storages are cleared and the app returns to a lone Welcome window. Report exactly what you observed.

- [ ] **Step 6: Lint, build, doctor, commit**

```bash
npm run format && npm run lint && npm test && npm run build && npm run doctor
```

```bash
git add -A
git commit -m "feat: keep JWTs out of disk storage, clear saved state from Reset Windows"
```
