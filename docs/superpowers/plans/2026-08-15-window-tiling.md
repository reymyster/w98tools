# Window Tiling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Arrange every open tool window at once from a taskbar button and the taskbar right-click menu, with layouts that adapt to how many windows are open.

**Architecture:** Four tasks in dependency order. Task 1 is a pure geometry library with no React. Task 2 is a behaviour-preserving refactor lifting window geometry out of each `Widget`'s local state into the zustand store — the risky part, done alone so it can be verified in isolation. Task 3 adds the `applyLayout` store action and the eligibility rules on top of both. Task 4 builds the menu UI and its two triggers.

**Tech Stack:** React 19, TypeScript 7, zustand, react-rnd, 98.css, Vitest + jsdom + Testing Library, Biome.

## Global Constraints

- **Biome owns formatting.** Space indentation width 2, double quotes, 80 columns. Never hand-format; run `npm run format`. Lint with `npm run lint`.
- **No test globals.** `vite.config.ts` deliberately omits `globals: true`; every spec must explicitly import from `"vitest"`.
- **Tests live next to the code** as `*.test.ts` / `*.test.tsx`.
- **`src/components/window-manager.tsx` must export only its component** or Fast Refresh stops preserving window state.
- **98.css styles bare elements.** A `<button>` gets a silver face, bevel and `min-width: 75px`. That is *wanted* for a real taskbar button, and *not* wanted for menu rows — `start-bar.tsx` uses role-annotated divs for menu rows for exactly this reason, and `welcome.tsx` shows the other pattern: a real `<button>` flattened with `!`-prefixed Tailwind utilities. Pick per element and say why.
- **Record identity is load-bearing.** See Task 2; an action that rebuilds untouched window records re-renders every open widget.
- **`npm run build`** (`tsc -b && vite build`) is the type-check and must pass.
- **`npm run doctor` must stay at exactly 14 findings**, the accepted baseline catalogued in CLAUDE.md.
- **The desktop area is the viewport minus the 48px taskbar**, matching the `bounds` already computed in `widget.tsx`.
- **No new dependencies.** The menu is built from existing patterns.

---

### Task 1: Layout geometry library

Pure functions: how many of each layout to offer, and where each window goes. No React, no store.

**Files:**
- Create: `src/lib/window-layout.ts`
- Create: `src/lib/window-layout.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Desktop = { width: number; height: number }`
  - `type Rect = { x: number; y: number; width: number; height: number }`
  - `type LayoutKind = "side-by-side" | "stacked" | "one-large-two" | "three-columns" | "quarters" | "cascade"`
  - `const LAYOUT_LABELS: Record<LayoutKind, string>`
  - `layoutsFor(count: number): LayoutKind[]`
  - `computeLayout(kind: LayoutKind, count: number, desktop: Desktop): Rect[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/window-layout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeLayout, type Desktop, layoutsFor } from "./window-layout";

const DESKTOP: Desktop = { width: 1000, height: 700 };

/** Two rectangles overlap if they intersect on both axes. */
function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

describe("layoutsFor", () => {
  it("offers nothing below two windows", () => {
    expect(layoutsFor(0)).toEqual([]);
    expect(layoutsFor(1)).toEqual([]);
  });

  it("offers side-by-side and stacked for two", () => {
    expect(layoutsFor(2)).toEqual(["side-by-side", "stacked", "cascade"]);
  });

  it("offers the three-window layouts for three", () => {
    expect(layoutsFor(3)).toEqual([
      "one-large-two",
      "three-columns",
      "cascade",
    ]);
  });

  it("offers quarters for four", () => {
    expect(layoutsFor(4)).toEqual(["quarters", "cascade"]);
  });

  it("offers only cascade above four", () => {
    expect(layoutsFor(5)).toEqual(["cascade"]);
    expect(layoutsFor(9)).toEqual(["cascade"]);
  });

  it("always includes cascade once there is anything to arrange", () => {
    for (const n of [2, 3, 4, 5, 12]) {
      expect(layoutsFor(n)).toContain("cascade");
    }
  });
});

describe("computeLayout", () => {
  it("returns one rectangle per window", () => {
    expect(computeLayout("quarters", 4, DESKTOP)).toHaveLength(4);
    expect(computeLayout("cascade", 7, DESKTOP)).toHaveLength(7);
  });

  it("splits side-by-side into left and right halves", () => {
    const [left, right] = computeLayout("side-by-side", 2, DESKTOP);

    expect(left.x).toBe(0);
    expect(left.y).toBe(0);
    expect(right.x).toBeGreaterThan(left.x + left.width / 2);
    expect(left.height).toBe(right.height);
  });

  it("splits stacked into top and bottom halves", () => {
    const [top, bottom] = computeLayout("stacked", 2, DESKTOP);

    expect(top.y).toBe(0);
    expect(bottom.y).toBeGreaterThan(top.y + top.height / 2);
    expect(top.width).toBe(bottom.width);
  });

  it("gives one-large-two a full-height left pane and two stacked right", () => {
    const [large, topRight, bottomRight] = computeLayout(
      "one-large-two",
      3,
      DESKTOP,
    );

    expect(large.height).toBeGreaterThan(topRight.height);
    expect(topRight.x).toBe(bottomRight.x);
    expect(bottomRight.y).toBeGreaterThan(topRight.y);
  });

  it("gives three-columns three equal-width panes", () => {
    const rects = computeLayout("three-columns", 3, DESKTOP);

    expect(rects[0].width).toBe(rects[1].width);
    expect(rects[1].width).toBe(rects[2].width);
    expect(rects[0].height).toBe(rects[2].height);
  });

  it("never overlaps tiles in a tiled layout", () => {
    const cases = [
      ["side-by-side", 2],
      ["stacked", 2],
      ["one-large-two", 3],
      ["three-columns", 3],
      ["quarters", 4],
    ] as const;

    for (const [kind, count] of cases) {
      const rects = computeLayout(kind, count, DESKTOP);
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          expect(
            overlaps(rects[i], rects[j]),
            `${kind}: tile ${i} overlaps tile ${j}`,
          ).toBe(false);
        }
      }
    }
  });

  it("keeps every tile inside the desktop", () => {
    const cases = [
      ["side-by-side", 2],
      ["quarters", 4],
      ["cascade", 8],
    ] as const;

    for (const [kind, count] of cases) {
      for (const rect of computeLayout(kind, count, DESKTOP)) {
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(DESKTOP.width);
        expect(rect.y + rect.height).toBeLessThanOrEqual(DESKTOP.height);
      }
    }
  });

  it("steps each cascaded window down and right of the last", () => {
    const [first, second] = computeLayout("cascade", 3, DESKTOP);

    expect(second.x).toBeGreaterThan(first.x);
    expect(second.y).toBeGreaterThan(first.y);
    expect(second.width).toBe(first.width);
  });

  it("wraps a long cascade back to the top rather than off-screen", () => {
    const rects = computeLayout("cascade", 40, DESKTOP);
    const maxY = Math.max(...rects.map((r) => r.y + r.height));

    expect(maxY).toBeLessThanOrEqual(DESKTOP.height);
  });

  it("tiles a count that does not fill the layout without overlapping", () => {
    // Three windows asked to use the four-pane layout: the fourth cell is
    // simply left empty rather than doubling two windows into one cell.
    const rects = computeLayout("quarters", 3, DESKTOP);

    expect(rects).toHaveLength(3);
    expect(overlaps(rects[0], rects[1])).toBe(false);
    expect(overlaps(rects[1], rects[2])).toBe(false);
  });

  it("survives a desktop too small to subdivide", () => {
    const tiny: Desktop = { width: 40, height: 30 };

    for (const rect of computeLayout("quarters", 4, tiny)) {
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/window-layout.test.ts`
Expected: FAIL — `Failed to resolve import "./window-layout"`.

- [ ] **Step 3: Write the library**

Create `src/lib/window-layout.ts`:

```ts
/**
 * Where windows go when the user picks a layout. Pure geometry: no React, no
 * store, no DOM — which is what makes the overlap and in-bounds properties
 * cheap to assert exhaustively in tests.
 */

export type Desktop = { width: number; height: number };

export type Rect = { x: number; y: number; width: number; height: number };

export type LayoutKind =
  | "side-by-side"
  | "stacked"
  | "one-large-two"
  | "three-columns"
  | "quarters"
  | "cascade";

export const LAYOUT_LABELS: Record<LayoutKind, string> = {
  "side-by-side": "Side by Side",
  stacked: "Stacked",
  "one-large-two": "One Large + Two",
  "three-columns": "Three Columns",
  quarters: "Quarters",
  cascade: "Cascade",
};

// Mirrors the fudge factors already in widget.tsx's moveAndResize, so a tiled
// window sits exactly where the existing title-bar context menu would put it:
// tiles past the first are pulled back by EDGE, and every tile is SHRINK
// narrower and shorter than its cell to leave a visible gutter.
const EDGE = 7;
const SHRINK = 15;

const CASCADE_STEP = 28;
/** A cascaded window covers this much of each axis. */
const CASCADE_SCALE = 0.6;

/** Never hand back a zero or negative box, however small the desktop gets. */
function atLeast1(value: number): number {
  return Math.max(1, value);
}

/**
 * `count` cells of a `cols` x `rows` grid, row-major. A count smaller than the
 * grid leaves the trailing cells empty rather than stretching anything.
 */
function gridRects(
  cols: number,
  rows: number,
  count: number,
  desktop: Desktop,
): Rect[] {
  const cellWidth = Math.round(desktop.width / cols);
  const cellHeight = Math.round(desktop.height / rows);

  return Array.from({ length: count }, (_, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    return {
      x: col * cellWidth + (col === 0 ? 0 : -EDGE),
      y: row * cellHeight + (row === 0 ? 0 : -EDGE),
      width: atLeast1(cellWidth - SHRINK),
      height: atLeast1(cellHeight - SHRINK),
    };
  });
}

function cascadeRects(count: number, desktop: Desktop): Rect[] {
  const width = atLeast1(Math.round(desktop.width * CASCADE_SCALE));
  const height = atLeast1(Math.round(desktop.height * CASCADE_SCALE));

  // How many steps fit before a window would hang off the desktop. Wrapping
  // back to the origin keeps every title bar reachable no matter how many
  // windows are open, which is the whole reason cascade is the fallback.
  const stepsDown = Math.max(
    1,
    Math.floor((desktop.height - height) / CASCADE_STEP),
  );
  const stepsAcross = Math.max(
    1,
    Math.floor((desktop.width - width) / CASCADE_STEP),
  );
  const steps = Math.max(1, Math.min(stepsDown, stepsAcross));

  return Array.from({ length: count }, (_, index) => {
    const step = index % steps;
    return { x: step * CASCADE_STEP, y: step * CASCADE_STEP, width, height };
  });
}

/** Layouts worth offering for this many windows, best fit first. */
export function layoutsFor(count: number): LayoutKind[] {
  if (count < 2) return [];
  if (count === 2) return ["side-by-side", "stacked", "cascade"];
  if (count === 3) return ["one-large-two", "three-columns", "cascade"];
  if (count === 4) return ["quarters", "cascade"];
  // Above four, a grid gives each window a pane too small to use. Cascade
  // keeps every title bar visible and clickable instead.
  return ["cascade"];
}

export function computeLayout(
  kind: LayoutKind,
  count: number,
  desktop: Desktop,
): Rect[] {
  if (count <= 0) return [];

  switch (kind) {
    case "side-by-side":
      return gridRects(2, 1, count, desktop);
    case "stacked":
      return gridRects(1, 2, count, desktop);
    case "three-columns":
      return gridRects(3, 1, count, desktop);
    case "quarters":
      return gridRects(2, 2, count, desktop);
    case "cascade":
      return cascadeRects(count, desktop);
    case "one-large-two": {
      const halfWidth = Math.round(desktop.width / 2);
      const halfHeight = Math.round(desktop.height / 2);
      const large: Rect = {
        x: 0,
        y: 0,
        width: atLeast1(halfWidth - SHRINK),
        height: atLeast1(desktop.height - SHRINK),
      };
      const right = Array.from({ length: Math.max(0, count - 1) }, (_, i) => ({
        x: halfWidth - EDGE,
        y: i * halfHeight + (i === 0 ? 0 : -EDGE),
        width: atLeast1(halfWidth - SHRINK),
        height: atLeast1(halfHeight - SHRINK),
      }));
      return [large, ...right].slice(0, count);
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/window-layout.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Lint, build, commit**

```bash
npm run format && npm run lint && npm test && npm run build
```

```bash
git add src/lib/window-layout.ts src/lib/window-layout.test.ts
git commit -m "feat: compute window layout geometry"
```

---

### Task 2: Lift window geometry into the store

A behaviour-preserving refactor. Nothing the user can see changes; afterwards, code outside a window can move it. **Do not add the layout action or any UI in this task** — the point of doing it alone is that "everything still behaves exactly as before" is the whole acceptance criterion.

**Files:**
- Modify: `src/components/window-store.ts`
- Modify: `src/components/widget.tsx`
- Create: `src/components/window-store.test.ts`
- Modify: `src/components/widget.test.tsx` if one exists; otherwise create it

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces, from `src/components/window-store.ts`:
  - `type Geometry = { x: number; y: number; width: number; height: number }`
  - `WindowState` gains `geometry: Geometry | null`, `isMinimized: boolean`, `isMaximized: boolean`, `restore: Geometry | null`
  - actions `registerGeometry(id, geometry)`, `setGeometry(id, geometry)`, `minimizeWindow(id)`, `maximizeWindow(id, desktop)`, `restoreWindow(id)`

- [ ] **Step 1: Understand what must not regress**

Read `src/components/widget.tsx` in full first. Its local `useState` currently holds `x`, `y`, `prevX`, `prevY`, `height`, `width`, `isMinimized`, `isMaximized`, and drives: initial centring from `useWindowSize`, drag, resize, minimize, maximize, restore, and the `moveAndResize` context-menu actions. Every one of those must still work identically at the end of this task.

- [ ] **Step 2: Write the failing store test**

Create `src/components/window-store.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { useWindowMangager } from "./window-store";

const store = () => useWindowMangager.getState();

const DESKTOP = { width: 1000, height: 700 };
const RECT = { x: 10, y: 20, width: 300, height: 200 };

/** The id of the nth window currently open. */
const idAt = (index: number) => store().windows[index].id;

describe("window-store geometry", () => {
  beforeEach(() => {
    store().reset();
  });

  it("starts a new window with no geometry until its widget registers one", () => {
    store().addWindow("PrettifyJson");
    const win = store().windows.at(-1);

    expect(win?.geometry).toBeNull();
    expect(win?.isMinimized).toBe(false);
    expect(win?.isMaximized).toBe(false);
  });

  it("registers initial geometry", () => {
    store().addWindow("PrettifyJson");
    const id = idAt(1);

    store().registerGeometry(id, RECT);

    expect(store().windows.find((w) => w.id === id)?.geometry).toEqual(RECT);
  });

  it("ignores a second registration so a remount cannot reset a moved window", () => {
    store().addWindow("PrettifyJson");
    const id = idAt(1);
    store().registerGeometry(id, RECT);

    store().registerGeometry(id, { x: 999, y: 999, width: 50, height: 50 });

    expect(store().windows.find((w) => w.id === id)?.geometry).toEqual(RECT);
  });

  it("updates geometry on drag or resize stop", () => {
    store().addWindow("PrettifyJson");
    const id = idAt(1);
    store().registerGeometry(id, RECT);

    const moved = { x: 500, y: 400, width: 320, height: 240 };
    store().setGeometry(id, moved);

    expect(store().windows.find((w) => w.id === id)?.geometry).toEqual(moved);
  });

  it("maximizing remembers the geometry to restore to", () => {
    store().addWindow("PrettifyJson");
    const id = idAt(1);
    store().registerGeometry(id, RECT);

    store().maximizeWindow(id, DESKTOP);
    const maximized = store().windows.find((w) => w.id === id);

    expect(maximized?.isMaximized).toBe(true);
    expect(maximized?.restore).toEqual(RECT);

    store().restoreWindow(id);
    const restored = store().windows.find((w) => w.id === id);

    expect(restored?.isMaximized).toBe(false);
    expect(restored?.geometry).toEqual(RECT);
  });

  it("minimizing clears maximized, and restoring clears both", () => {
    store().addWindow("PrettifyJson");
    const id = idAt(1);
    store().registerGeometry(id, RECT);
    store().maximizeWindow(id, DESKTOP);

    store().minimizeWindow(id);
    const minimized = store().windows.find((w) => w.id === id);

    expect(minimized?.isMinimized).toBe(true);
    expect(minimized?.isMaximized).toBe(false);

    store().restoreWindow(id);

    expect(store().windows.find((w) => w.id === id)?.isMinimized).toBe(false);
  });
});

// The reason this whole refactor is delicate: widgets subscribe per-window, so
// an action that rebuilds untouched records would re-render every open widget.
describe("window-store record identity", () => {
  beforeEach(() => {
    store().reset();
  });

  it("leaves other windows' record objects untouched when one moves", () => {
    store().addWindow("PrettifyJson");
    store().addWindow("SearchReplace");
    const [first, second, third] = store().windows;

    store().setGeometry(second.id, RECT);
    const after = store().windows;

    expect(after[0]).toBe(first);
    expect(after[2]).toBe(third);
    expect(after[1]).not.toBe(second);
  });

  it("leaves every record untouched when bringToTop is a no-op", () => {
    store().addWindow("PrettifyJson");
    const before = store().windows;
    const topId = before.at(-1)?.id ?? 0;

    store().bringToTop(topId);

    expect(store().windows).toBe(before);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/components/window-store.test.ts`
Expected: FAIL — `registerGeometry is not a function`.

- [ ] **Step 4: Extend the store**

In `src/components/window-store.ts`, add the geometry types and actions. Keep the existing `getHighestZIndex`, `nextWindowId`, `addWindow`, `removeWindow`, `bringToTop` and `reset` behaviour as-is, including `bringToTop`'s early return.

```ts
export type Geometry = { x: number; y: number; width: number; height: number };

export type WindowState = {
  id: number;
  type: WidgetType;
  zIndex: number;
  /**
   * Null until the widget mounts and reports the size it wants. The store
   * can't compute this itself: the centring maths needs the viewport, and the
   * preferred size is a prop of each widget component.
   */
  geometry: Geometry | null;
  isMinimized: boolean;
  isMaximized: boolean;
  /** Geometry to return to when un-maximizing. */
  restore: Geometry | null;
};
```

Every new action must update only the target record and return `prev` untouched when nothing changes, exactly as `bringToTop` does. Use this shape:

```ts
/**
 * Replaces exactly one window's record and reuses every other record's object
 * identity. Widgets subscribe per-window, so rebuilding an untouched record
 * would re-render a window that did not change -- the same cascade the
 * bringToTop comment above describes.
 */
function updateWindow(
  state: WindowManagerState,
  id: number,
  change: (window: WindowState) => WindowState,
): WindowManagerState {
  const target = state.windows.find((w) => w.id === id);
  if (!target) return state;

  const updated = change(target);
  if (updated === target) return state;

  return {
    windows: state.windows.map((w) => (w.id === id ? updated : w)),
  };
}
```

`addWindow` must initialise the new fields: `geometry: null`, `isMinimized: false`, `isMaximized: false`, `restore: null`.

`registerGeometry` sets `geometry` only when it is currently `null`, so a remount cannot yank a window the user has since moved. `maximizeWindow(id, desktop)` stores the current `geometry` into `restore` and sets `geometry` to the full desktop. `restoreWindow(id)` puts `restore` back and clears both flags.

- [ ] **Step 5: Make `Widget` read from the store**

In `src/components/widget.tsx`, delete the local `useState` geometry object and subscribe to this window's own record:

```tsx
// Subscribing to this window's record -- not to state.windows -- is what keeps
// a drag from re-rendering every other open window. Actions preserve the
// object identity of records they don't touch, so this selector returns the
// same reference and bails out of re-rendering.
const win = useWindowMangager((state) =>
  state.windows.find((w) => w.id === windowID),
);
```

Then:

- Keep computing `bounds` from `useWindowSize` and keep the existing centring maths, but use it once, in an effect that calls `registerGeometry(windowID, ...)` when `win?.geometry` is `null`. Nothing else should write initial position.
- Feed `Rnd`'s `size` and `position` from the store record (falling back to the computed initial values while `geometry` is still `null`, so the first paint is not at 0,0).
- `onDragStop` and `onResizeStop` call `setGeometry`. **Do not add `onDrag` or `onResize` handlers** — `Rnd` stays uncontrolled during the gesture, which is what keeps dragging as cheap as it is today.
- Minimize, maximize, restore and close call the store actions.
- `moveAndResize` now calls `setGeometry` with the rectangle it already computes; leave its geometry maths alone.

- [ ] **Step 6: Run the tests**

```bash
npx vitest run src/components/window-store.test.ts
npm test
```

Expected: the store spec passes and the whole suite stays green. Existing widget specs exercise these windows, so a regression here shows up as failures elsewhere.

- [ ] **Step 7: Verify by hand in the browser**

The dev server runs via portless at `https://w98tools.localhost` (also `http://localhost:4098`). Open several windows and confirm every one of these still works exactly as before: dragging, resizing from each edge, minimize, restore, maximize, restore, close, the title-bar right-click Move & Resize items, and clicking a background window to raise it. Watch the console for errors throughout.

This step is the acceptance criterion for the task. Say in your report what you exercised and what you saw.

- [ ] **Step 8: Lint, build, doctor, commit**

```bash
npm run format && npm run lint && npm test && npm run build && npm run doctor
```

```bash
git add src/components/window-store.ts src/components/window-store.test.ts src/components/widget.tsx
git commit -m "refactor: move window geometry into the store"
```

---

### Task 3: The applyLayout action

**Files:**
- Modify: `src/components/window-store.ts`
- Modify: `src/components/window-store.test.ts`

**Interfaces:**
- Consumes: `LayoutKind`, `computeLayout`, `Desktop` from `src/lib/window-layout.ts` (Task 1); the store shape from Task 2.
- Produces:
  - `const UNTILED_WIDGETS: ReadonlySet<WidgetType>`
  - `tileableWindows(windows: WindowState[]): WindowState[]`
  - store action `applyLayout(kind: LayoutKind, desktop: Desktop)`

- [ ] **Step 1: Write the failing test**

Append to `src/components/window-store.test.ts`:

```ts
describe("applyLayout", () => {
  beforeEach(() => {
    store().reset();
  });

  it("excludes the Welcome window", () => {
    // reset() leaves a Welcome window open.
    store().addWindow("PrettifyJson");
    store().addWindow("SearchReplace");

    expect(tileableWindows(store().windows).map((w) => w.type)).toEqual([
      "PrettifyJson",
      "SearchReplace",
    ]);
  });

  it("excludes minimized windows", () => {
    store().addWindow("PrettifyJson");
    store().addWindow("SearchReplace");
    store().minimizeWindow(idAt(1));

    expect(tileableWindows(store().windows).map((w) => w.type)).toEqual([
      "SearchReplace",
    ]);
  });

  it("positions every tileable window and leaves the rest alone", () => {
    store().addWindow("PrettifyJson");
    store().addWindow("SearchReplace");
    const welcome = store().windows[0];

    store().applyLayout("side-by-side", DESKTOP);
    const after = store().windows;

    expect(after[0]).toBe(welcome);
    expect(after[1].geometry).not.toBeNull();
    expect(after[2].geometry).not.toBeNull();
    expect(after[1].geometry?.x).toBe(0);
    expect(after[2].geometry?.x).toBeGreaterThan(0);
  });

  it("un-maximizes a window it tiles", () => {
    store().addWindow("PrettifyJson");
    store().addWindow("SearchReplace");
    const id = idAt(1);
    store().registerGeometry(id, RECT);
    store().maximizeWindow(id, DESKTOP);

    store().applyLayout("side-by-side", DESKTOP);

    expect(store().windows.find((w) => w.id === id)?.isMaximized).toBe(false);
  });

  it("leaves a minimized window minimized and unmoved", () => {
    store().addWindow("PrettifyJson");
    store().addWindow("SearchReplace");
    store().addWindow("PrettifySql");
    const id = idAt(1);
    store().registerGeometry(id, RECT);
    store().minimizeWindow(id);

    store().applyLayout("side-by-side", DESKTOP);
    const win = store().windows.find((w) => w.id === id);

    expect(win?.isMinimized).toBe(true);
    expect(win?.geometry).toEqual(RECT);
  });

  it("orders tiles by z-order so the active window lands last", () => {
    store().addWindow("PrettifyJson");
    store().addWindow("SearchReplace");
    const lower = idAt(1);
    store().bringToTop(lower);

    store().applyLayout("side-by-side", DESKTOP);
    const raised = store().windows.find((w) => w.id === lower);

    expect(raised?.geometry?.x).toBeGreaterThan(0);
  });

  it("does nothing when fewer than two windows are tileable", () => {
    store().addWindow("PrettifyJson");
    const before = store().windows;

    store().applyLayout("side-by-side", DESKTOP);

    expect(store().windows).toBe(before);
  });
});
```

Add `tileableWindows` to the existing import from `./window-store`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/window-store.test.ts`
Expected: FAIL — `tileableWindows is not exported`.

- [ ] **Step 3: Implement**

In `src/components/window-store.ts`:

```ts
/**
 * Window types a layout command ignores. Welcome opens on every load, so
 * tiling would otherwise arrange a splash screen beside the user's first real
 * tool. A set rather than an equality check so the next non-tool window
 * inherits this for free.
 */
export const UNTILED_WIDGETS: ReadonlySet<WidgetType> = new Set(["Welcome"]);

/** Windows a layout applies to, in z-order so the active one lands last. */
export function tileableWindows(windows: WindowState[]): WindowState[] {
  return windows
    .filter((w) => !w.isMinimized && !UNTILED_WIDGETS.has(w.type))
    .sort((a, b) => a.zIndex - b.zIndex);
}
```

`applyLayout(kind, desktop)` computes `tileableWindows`, returns `prev` unchanged when there are fewer than two, otherwise calls `computeLayout(kind, targets.length, desktop)` and writes each rectangle to its window — setting `geometry`, clearing `isMaximized`, and clearing `restore`. Windows not in the target list keep their exact record objects.

- [ ] **Step 4: Run the tests**

```bash
npx vitest run src/components/window-store.test.ts
npm test
```

Expected: PASS.

- [ ] **Step 5: Lint, build, commit**

```bash
npm run format && npm run lint && npm run build
```

```bash
git add src/components/window-store.ts src/components/window-store.test.ts
git commit -m "feat: add the applyLayout store action"
```

---

### Task 4: The taskbar layout menu

**Files:**
- Create: `src/components/window-layout-menu.tsx`
- Create: `src/components/window-layout-menu.test.tsx`
- Modify: `src/components/start-bar.tsx`

**Interfaces:**
- Consumes: `layoutsFor`, `LAYOUT_LABELS`, `LayoutKind` from `src/lib/window-layout.ts`; `applyLayout`, `tileableWindows` from the store.
- Produces: `WindowLayoutMenu` — the taskbar button plus its popup, self-contained so `start-bar.tsx` only has to render it.

- [ ] **Step 1: Write the failing test**

Create `src/components/window-layout-menu.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { WindowLayoutMenu } from "./window-layout-menu";
import { useWindowMangager } from "./window-store";

const store = () => useWindowMangager.getState();
const trigger = () => screen.getByRole("button", { name: "Arrange Windows" });

describe("WindowLayoutMenu", () => {
  beforeEach(() => {
    store().reset();
  });

  it("is disabled while there is nothing to arrange", () => {
    render(<WindowLayoutMenu />);

    // reset() leaves only the Welcome window, which never tiles.
    expect(trigger()).toBeDisabled();
  });

  it("stays disabled with a single tileable window", async () => {
    store().addWindow("PrettifyJson");
    render(<WindowLayoutMenu />);

    expect(trigger()).toBeDisabled();
  });

  it("offers the two-window layouts for two windows", async () => {
    const user = userEvent.setup();
    store().addWindow("PrettifyJson");
    store().addWindow("SearchReplace");
    render(<WindowLayoutMenu />);

    await user.click(trigger());

    expect(screen.getByText("Side by Side")).toBeInTheDocument();
    expect(screen.getByText("Stacked")).toBeInTheDocument();
    expect(screen.getByText("Cascade")).toBeInTheDocument();
    expect(screen.queryByText("Quarters")).not.toBeInTheDocument();
  });

  it("offers Quarters for four windows", async () => {
    const user = userEvent.setup();
    for (const type of [
      "PrettifyJson",
      "SearchReplace",
      "PrettifySql",
      "SplitJoin",
    ] as const) {
      store().addWindow(type);
    }
    render(<WindowLayoutMenu />);

    await user.click(trigger());

    expect(screen.getByText("Quarters")).toBeInTheDocument();
  });

  it("applies the chosen layout to the open windows", async () => {
    const user = userEvent.setup();
    store().addWindow("PrettifyJson");
    store().addWindow("SearchReplace");
    render(<WindowLayoutMenu />);

    await user.click(trigger());
    await user.click(screen.getByText("Side by Side"));

    const tiled = store().windows.filter((w) => w.type !== "Welcome");
    expect(tiled[0].geometry).not.toBeNull();
    expect(tiled[1].geometry).not.toBeNull();
  });

  it("closes after a layout is chosen", async () => {
    const user = userEvent.setup();
    store().addWindow("PrettifyJson");
    store().addWindow("SearchReplace");
    render(<WindowLayoutMenu />);

    await user.click(trigger());
    await user.click(screen.getByText("Side by Side"));

    expect(screen.queryByText("Side by Side")).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    store().addWindow("PrettifyJson");
    store().addWindow("SearchReplace");
    render(<WindowLayoutMenu />);

    await user.click(trigger());
    await user.keyboard("{Escape}");

    expect(screen.queryByText("Side by Side")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/window-layout-menu.test.tsx`
Expected: FAIL — `Failed to resolve import "./window-layout-menu"`.

- [ ] **Step 3: Build the menu**

Create `src/components/window-layout-menu.tsx`. Requirements:

- A real `<button type="button">` labelled for screen readers as `Arrange Windows`, sitting in the taskbar. A bare `<button>` is **correct** here — 98.css's silver face and bevel is exactly what a taskbar button should look like. Do not flatten it.
- `disabled` whenever `tileableWindows(...).length < 2`, with a `title` explaining why so the disabled state is not a mystery.
- Clicking toggles a popup listing `layoutsFor(count)` mapped through `LAYOUT_LABELS`.
- Popup rows follow `start-bar.tsx`'s menu-row pattern — role-annotated divs, not `<button>`s, because 98.css would give each row a silver face and a 75px minimum width. Reuse that file's `SUBMENU` / `SUBMENU_ROW` class strings as the visual reference and handle Enter, Space and Escape explicitly, since divs have no native activation.
- Choosing a row calls `applyLayout(kind, desktop)` and closes the popup. Compute `desktop` from `useWindowSize` as `{ width, height: height - 48 }`, matching `widget.tsx`'s `bounds`.
- Clicking outside closes the popup.

- [ ] **Step 4: Mount it in the taskbar**

In `src/components/start-bar.tsx`, render `<WindowLayoutMenu />` in the taskbar's right-hand area, immediately before `<StartBarTime />` so it sits left of the clock.

Then wire the second trigger: right-clicking empty taskbar space opens the same popup. Add an `onContextMenu` on the taskbar `<aside>` that calls `preventDefault()` and opens the menu — but only when the target is the bar itself and not one of its children, so right-clicking a window button in the taskbar is not hijacked.

- [ ] **Step 5: Run the tests**

```bash
npx vitest run src/components/window-layout-menu.test.tsx
npm test
```

Expected: PASS.

- [ ] **Step 6: Verify in the browser**

At `https://w98tools.localhost`, with the dev server running:

- With only Welcome open, the button is visibly disabled and its tooltip explains why.
- Open two tools: the button enables and offers Side by Side, Stacked, Cascade. Pick each and confirm the windows actually move and do not overlap.
- Open a third and a fourth: confirm the offered layouts change, and that Quarters gives four non-overlapping panes.
- Open five: confirm only Cascade is offered and every title bar stays reachable.
- Confirm the Welcome window never moves.
- Minimize one window, tile, and confirm it stays minimized and untouched.
- Maximize one window, tile, and confirm it un-maximizes into its tile.
- Right-click empty taskbar space and confirm the same menu opens; right-click a taskbar window button and confirm it does not.
- Check the console for errors.

Report exactly what you exercised and what you saw, with a screenshot of a Quarters layout.

- [ ] **Step 7: Lint, build, doctor, commit**

```bash
npm run format && npm run lint && npm test && npm run build && npm run doctor
```

Doctor must report exactly 14.

```bash
git add src/components/window-layout-menu.tsx src/components/window-layout-menu.test.tsx src/components/start-bar.tsx
git commit -m "feat: arrange open windows from the taskbar"
```

---

### Task 5: Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`

- [ ] **Step 1: Record what changed**

`CLAUDE.md` needs two things a future contributor cannot infer:

1. **Window geometry lives in the store, and records are identity-stable on purpose.** Explain that widgets subscribe to their own record via `state.windows.find(...)`, that store actions must reuse the object identity of records they do not change, and that rebuilding an untouched record re-renders a window that did not move. Note that `Rnd` stays uncontrolled during a gesture — geometry is written on drag/resize *stop*, never on every move — and that adding an `onDrag` handler would reintroduce exactly the cascade the `bringToTop` comment warns about.
2. **`UNTILED_WIDGETS`** — what it is and why Welcome is in it.

`README.md` should mention that windows can be arranged from the taskbar, in whatever form matches how the rest of that file describes features.

- [ ] **Step 2: Lint and commit**

```bash
npm run format && npm run lint
```

```bash
git add CLAUDE.md README.md
git commit -m "docs: record the window geometry refactor and tiling"
```
