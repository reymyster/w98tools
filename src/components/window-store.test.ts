import { beforeEach, describe, expect, it } from "vitest";
import { useWindowMangager } from "./window-store";

const store = () => useWindowMangager.getState();

const DESKTOP = { width: 1000, height: 700 };
const RECT = { x: 10, y: 20, width: 300, height: 200 };

/** The id of the nth window currently open. */
const idAt = (index: number) => store().windows[index].id;

beforeEach(() => {
  store().reset();
});

describe("window store", () => {
  it("starts with a single Welcome window", () => {
    expect(store().windows).toHaveLength(1);
    expect(store().windows[0].type).toBe("Welcome");
  });

  it("gives every window a unique id", () => {
    // Regression test: ids used to come from Date.now(), so windows opened
    // within the same millisecond collided. The id is the React key for the
    // window list, so duplicates could drop or duplicate a window. This loop
    // runs far faster than a millisecond.
    for (let i = 0; i < 200; i++) {
      store().addWindow("Help");
    }

    const ids = store().windows.map((w) => w.id);
    expect(ids).toHaveLength(201);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("stacks each new window above the previous one", () => {
    store().addWindow("Help");
    store().addWindow("PrettifyJson");

    const zIndexes = store().windows.map((w) => w.zIndex);
    expect(zIndexes).toEqual([...zIndexes].sort((a, b) => a - b));
    expect(new Set(zIndexes).size).toBe(zIndexes.length);
  });

  it("raises a window above all others with bringToTop", () => {
    store().addWindow("Help");
    store().addWindow("PrettifyJson");
    const [oldest] = store().windows;

    store().bringToTop(oldest.id);

    const raised = store().windows.find((w) => w.id === oldest.id);
    const others = store().windows.filter((w) => w.id !== oldest.id);
    expect(raised).toBeDefined();
    for (const other of others) {
      expect(raised?.zIndex).toBeGreaterThan(other.zIndex);
    }
  });

  it("leaves the stack alone when raising the window already on top", () => {
    store().addWindow("Help");
    const before = store().windows.map((w) => w.zIndex);
    const top = store().windows.at(-1);

    if (!top) throw new Error("expected a window on top");
    store().bringToTop(top.id);

    expect(store().windows.map((w) => w.zIndex)).toEqual(before);
  });

  it("keeps the same windows array when bringToTop is a no-op", () => {
    // Referential, not just structural, equality: every subscriber to
    // state.windows re-renders on a new array reference, and bringToTop
    // fires on every click in an already-focused window.
    store().addWindow("Help");
    const before = store().windows;
    const top = store().windows.at(-1);

    if (!top) throw new Error("expected a window on top");
    store().bringToTop(top.id);

    expect(store().windows).toBe(before);
  });

  it("removes only the window asked for", () => {
    store().addWindow("Help");
    store().addWindow("PrettifyJson");
    const target = store().windows[1];

    store().removeWindow(target.id);

    const ids = store().windows.map((w) => w.id);
    expect(ids).toHaveLength(2);
    expect(ids).not.toContain(target.id);
  });

  it("reset returns to a lone Welcome window with a fresh id", () => {
    store().addWindow("Help");
    const idsBefore = store().windows.map((w) => w.id);

    store().reset();

    expect(store().windows).toHaveLength(1);
    expect(store().windows[0].type).toBe("Welcome");
    expect(idsBefore).not.toContain(store().windows[0].id);
  });
});

describe("window-store geometry", () => {
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
