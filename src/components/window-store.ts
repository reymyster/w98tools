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
  | "PrettifyJson"
  | "SearchReplace"
  | "Welcome"
  | "OCR";

export type WindowState = {
  id: number;
  type: WidgetType;
  zIndex: number;
};

type WindowManagerState = {
  windows: WindowState[];
};

type WindowManagerAction = {
  addWindow: (type: WidgetType) => void;
  removeWindow: (id: WindowState["id"]) => void;
  bringToTop: (id: WindowState["id"]) => void;
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

export const useWindowMangager = create<
  WindowManagerState & WindowManagerAction
>((set) => ({
  windows: [{ id: nextWindowId(), type: "Welcome", zIndex: 1 }],
  addWindow: (type) =>
    set((prev) => ({
      windows: [
        ...prev.windows,
        { id: nextWindowId(), type, zIndex: getHighestZIndex(prev) + 1 },
      ],
    })),
  removeWindow: (id) => {
    set((prev) => ({
      windows: prev.windows.filter((window) => window.id !== id),
    }));
  },
  bringToTop: (id) => {
    set((prev) => ({
      windows: prev.windows.map((w) => {
        if (w.id !== id) return w;
        const highestCurrent = getHighestZIndex(prev);
        if (w.zIndex === highestCurrent) return w;
        return {
          ...w,
          zIndex: highestCurrent + 1,
        };
      }),
    }));
  },
  reset: () =>
    set({
      windows: [{ id: nextWindowId(), type: "Welcome", zIndex: 1 }],
    }),
}));
