import { create } from "zustand";

/**
 * Window state lives here rather than in window-manager.tsx so that file can
 * export only its component, which is what lets Fast Refresh preserve state
 * across edits. Declaring WidgetType as a union (instead of deriving it from
 * the widget registry) also keeps this module free of component imports, so
 * there's no cycle between the store and the widgets that consume it.
 */
export type WidgetType =
  | "Help"
  | "JsonToTypes"
  | "JwtDecoder"
  | "PrettifyJson"
  | "PrettifySql"
  | "SearchReplace"
  | "SplitJoin"
  | "Welcome"
  | "OCR"
  | "PdfExport";

export type Geometry = {
  x: number;
  y: number;
  width: number;
  height: number;
};

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

type WindowManagerState = {
  windows: WindowState[];
};

type WindowManagerAction = {
  addWindow: (type: WidgetType) => void;
  removeWindow: (id: WindowState["id"]) => void;
  bringToTop: (id: WindowState["id"]) => void;
  registerGeometry: (id: WindowState["id"], geometry: Geometry) => void;
  setGeometry: (id: WindowState["id"], geometry: Geometry) => void;
  minimizeWindow: (id: WindowState["id"]) => void;
  maximizeWindow: (
    id: WindowState["id"],
    desktop: { width: number; height: number },
  ) => void;
  restoreWindow: (id: WindowState["id"]) => void;
  reset: () => void;
};

function getHighestZIndex(state: WindowManagerState): number {
  if (state.windows.length === 0) return 1;
  return state.windows.reduce((p, c) => (p > c.zIndex ? p : c.zIndex), 1);
}

// Ids were Date.now(), so two windows opened within the same millisecond got
// the same id. That id is the React key for the window list, which meant
// duplicate keys and windows that could be dropped or duplicated. A counter
// can't collide, and nothing persists ids across reloads.
let lastWindowId = 0;
const nextWindowId = () => ++lastWindowId;

function newWindow(type: WidgetType, zIndex: number): WindowState {
  return {
    id: nextWindowId(),
    type,
    zIndex,
    geometry: null,
    isMinimized: false,
    isMaximized: false,
    restore: null,
  };
}

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

/** Un-maximizes a window, returning it unchanged if it wasn't maximized. */
function clearMaximized(w: WindowState): WindowState {
  if (!w.isMaximized) return w;
  return {
    ...w,
    geometry: w.restore ?? w.geometry,
    restore: null,
    isMaximized: false,
  };
}

export const useWindowMangager = create<
  WindowManagerState & WindowManagerAction
>((set) => ({
  windows: [newWindow("Welcome", 1)],
  addWindow: (type) =>
    set((prev) => ({
      windows: [...prev.windows, newWindow(type, getHighestZIndex(prev) + 1)],
    })),
  removeWindow: (id) => {
    set((prev) => ({
      windows: prev.windows.filter((window) => window.id !== id),
    }));
  },
  bringToTop: (id) => {
    set((prev) => {
      // Return prev itself when nothing changes. This action fires on every
      // click in an already-focused window, and a fresh array reference --
      // even with identical items -- re-renders every state.windows
      // subscriber, which cascades into every open widget re-running.
      const target = prev.windows.find((w) => w.id === id);
      const highestCurrent = getHighestZIndex(prev);
      if (!target || target.zIndex === highestCurrent) return prev;
      return {
        windows: prev.windows.map((w) =>
          w.id === id ? { ...w, zIndex: highestCurrent + 1 } : w,
        ),
      };
    });
  },
  registerGeometry: (id, geometry) =>
    set((prev) =>
      updateWindow(prev, id, (w) =>
        w.geometry === null ? { ...w, geometry } : w,
      ),
    ),
  setGeometry: (id, geometry) =>
    set((prev) => updateWindow(prev, id, (w) => ({ ...w, geometry }))),
  minimizeWindow: (id) =>
    set((prev) =>
      updateWindow(prev, id, (w) => {
        const unmaximized = clearMaximized(w);
        if (unmaximized.isMinimized) return unmaximized;
        return { ...unmaximized, isMinimized: true };
      }),
    ),
  maximizeWindow: (id, desktop) =>
    set((prev) =>
      updateWindow(prev, id, (w) => ({
        ...w,
        isMinimized: false,
        isMaximized: true,
        restore: w.geometry,
        geometry: { x: 0, y: 0, width: desktop.width, height: desktop.height },
      })),
    ),
  restoreWindow: (id) =>
    set((prev) =>
      updateWindow(prev, id, (w) => {
        const unmaximized = clearMaximized(w);
        if (!unmaximized.isMinimized) return unmaximized;
        return { ...unmaximized, isMinimized: false };
      }),
    ),
  reset: () =>
    set({
      windows: [newWindow("Welcome", 1)],
    }),
}));
