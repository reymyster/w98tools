import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "@/lib/storage";
import {
  clampToDesktop,
  LAYOUT_STORAGE_KEY,
  tileableWindows,
  useWindowMangager,
  type WindowState,
} from "./window-store";

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

  it("refuses to maximize a window with no registered geometry", () => {
    // Regression guard: maximizing before geometry is registered would store
    // `restore: null`. clearMaximized's `w.restore ?? w.geometry` fallback
    // would then read back the *maximized* full-desktop rectangle, stranding
    // the window at desktop size with no way to restore its original bounds.
    store().addWindow("PrettifyJson");
    const id = idAt(1);

    store().maximizeWindow(id, DESKTOP);
    const win = store().windows.find((w) => w.id === id);

    expect(win?.isMaximized).toBe(false);
    expect(win?.geometry).toBeNull();
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

describe("clampToDesktop", () => {
  it("leaves in-bounds geometry untouched", () => {
    expect(clampToDesktop(RECT, DESKTOP)).toEqual(RECT);
  });

  it("never returns a width or height larger than the desktop", () => {
    const oversized = { x: 0, y: 0, width: 5000, height: 5000 };

    const clamped = clampToDesktop(oversized, DESKTOP);

    expect(clamped.width).toBeLessThanOrEqual(DESKTOP.width);
    expect(clamped.height).toBeLessThanOrEqual(DESKTOP.height);
  });

  it("never returns a negative x or y", () => {
    const offscreen = { x: -500, y: -500, width: 300, height: 200 };

    const clamped = clampToDesktop(offscreen, DESKTOP);

    expect(clamped.x).toBeGreaterThanOrEqual(0);
    expect(clamped.y).toBeGreaterThanOrEqual(0);
  });

  it("pulls a window that hangs off the right/bottom edge back on screen", () => {
    // A window saved at x: 1500 on a wider desktop, restored on this 1000
    // wide one -- it must still land fully visible, not merely non-negative.
    const geometry = { x: 1500, y: 650, width: 300, height: 200 };

    const clamped = clampToDesktop(geometry, DESKTOP);

    expect(clamped.x + clamped.width).toBeLessThanOrEqual(DESKTOP.width);
    expect(clamped.y + clamped.height).toBeLessThanOrEqual(DESKTOP.height);
  });
});

describe("persistence", () => {
  /** Builds a raw, storage-shaped window record -- not run through
   * newWindow, since these simulate what a *previous* session wrote. */
  const persistedWindow = (
    id: number,
    overrides: Partial<WindowState> = {},
  ): WindowState => ({
    id,
    type: "Help",
    zIndex: id,
    geometry: null,
    isMinimized: false,
    isMaximized: false,
    restore: null,
    ...overrides,
  });

  const writePersisted = (
    windows: unknown,
    version: number = SCHEMA_VERSION,
  ) => {
    localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({ state: { windows }, version }),
    );
  };

  afterEach(() => {
    localStorage.removeItem(LAYOUT_STORAGE_KEY);
  });

  it("advances the id counter past every restored id, so new windows never collide", async () => {
    writePersisted([persistedWindow(4), persistedWindow(7)]);

    await useWindowMangager.persist.rehydrate();
    store().addWindow("PrettifyJson");

    const ids = store().windows.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Math.max(...ids)).toBeGreaterThan(7);
  });

  it("clamps restored geometry back inside the current desktop", async () => {
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;
    window.innerWidth = 1000;
    window.innerHeight = 748; // -48px taskbar => a 700-tall desktop

    try {
      writePersisted([
        persistedWindow(9, {
          geometry: { x: 1500, y: 20, width: 300, height: 200 },
        }),
      ]);

      await useWindowMangager.persist.rehydrate();

      const win = store().windows.find((w) => w.id === 9);
      expect(win?.geometry).not.toBeNull();
      expect(
        (win?.geometry?.x ?? 0) + (win?.geometry?.width ?? 0),
      ).toBeLessThanOrEqual(1000);
      expect(win?.geometry?.x).toBeGreaterThanOrEqual(0);
    } finally {
      window.innerWidth = originalWidth;
      window.innerHeight = originalHeight;
    }
  });

  it("discards a persisted payload from a different schema version", async () => {
    writePersisted([persistedWindow(4)], SCHEMA_VERSION + 1);

    await useWindowMangager.persist.rehydrate();

    expect(store().windows).toHaveLength(1);
    expect(store().windows[0].type).toBe("Welcome");
  });

  it("discards an unparsable persisted payload instead of throwing", async () => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, "{not valid json");

    await useWindowMangager.persist.rehydrate();

    expect(store().windows).toHaveLength(1);
    expect(store().windows[0].type).toBe("Welcome");
  });

  it("discards a structurally invalid persisted payload instead of throwing", async () => {
    writePersisted("not-an-array");

    await useWindowMangager.persist.rehydrate();

    expect(store().windows).toHaveLength(1);
    expect(store().windows[0].type).toBe("Welcome");
  });

  it("persists window records only, no widget content", () => {
    store().addWindow("PrettifyJson");

    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    expect(raw).toBeTruthy();

    const parsed = JSON.parse(raw ?? "{}");
    expect(Object.keys(parsed.state)).toEqual(["windows"]);

    const knownKeys = [
      "id",
      "type",
      "zIndex",
      "geometry",
      "isMinimized",
      "isMaximized",
      "restore",
    ].sort();
    for (const w of parsed.state.windows) {
      expect(Object.keys(w).sort()).toEqual(knownKeys);
    }
  });
});
