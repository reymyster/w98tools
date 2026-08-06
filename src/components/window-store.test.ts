import { beforeEach, describe, expect, it } from "vitest";
import { useWindowMangager } from "./window-store";

const store = () => useWindowMangager.getState();

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
