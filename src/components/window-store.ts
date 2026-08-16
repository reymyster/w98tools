import { create, type StoreApi } from "zustand";
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from "zustand/middleware";
import { KEY_PREFIX, SCHEMA_VERSION } from "@/lib/storage";
import type { Desktop, LayoutKind } from "@/lib/window-layout";
import { computeLayout } from "@/lib/window-layout";

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
  applyLayout: (kind: LayoutKind, desktop: Desktop) => void;
  reset: () => void;
};

/** The only slice of the store worth writing to storage: actions and
 * anything derived don't belong there, and widget content is Task 3's job,
 * persisted separately. */
type PersistedState = { windows: WindowState[] };

/** Where the layout lives in localStorage. */
export const LAYOUT_STORAGE_KEY = `${KEY_PREFIX}layout`;

function getHighestZIndex(state: WindowManagerState): number {
  if (state.windows.length === 0) return 1;
  return state.windows.reduce((p, c) => (p > c.zIndex ? p : c.zIndex), 1);
}

// Ids were Date.now(), so two windows opened within the same millisecond got
// the same id. That id is the React key for the window list, which meant
// duplicate keys and windows that could be dropped or duplicated. A counter
// can't collide on its own, but restoring persisted windows can still hand
// out a duplicate unless the counter is advanced past every restored id --
// see advancePastRestoredIds below.
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

/** The lone Welcome window a fresh session -- or a discarded restore --
 * starts with. */
function defaultWindows(): WindowState[] {
  return [newWindow("Welcome", 1)];
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

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isGeometry(value: unknown): value is Geometry {
  if (typeof value !== "object" || value === null) return false;
  const g = value as Record<string, unknown>;
  return (
    isFiniteNumber(g.x) &&
    isFiniteNumber(g.y) &&
    isFiniteNumber(g.width) &&
    isFiniteNumber(g.height)
  );
}

/**
 * A type predicate rather than a cast, mirroring storage.ts's isEnvelope:
 * `value` came from JSON.parse on whatever a previous session -- or a
 * previous version of this app, or a hand-edited localStorage entry --
 * happened to leave behind, so nothing about its shape is guaranteed until
 * checked.
 */
function isWindowState(value: unknown): value is WindowState {
  if (typeof value !== "object" || value === null) return false;
  const w = value as Record<string, unknown>;
  return (
    isFiniteNumber(w.id) &&
    typeof w.type === "string" &&
    isFiniteNumber(w.zIndex) &&
    (w.geometry === null || isGeometry(w.geometry)) &&
    typeof w.isMinimized === "boolean" &&
    typeof w.isMaximized === "boolean" &&
    (w.restore === null || isGeometry(w.restore))
  );
}

/**
 * Clamps a rectangle to fit inside `desktop`: width and height first (never
 * larger than the desktop), then x and y so the window stays fully on
 * screen (never negative). Exported so a window saved on a wide monitor and
 * restored on a shrunk-down browser can't end up stranded off-screen.
 */
export function clampToDesktop(geometry: Geometry, desktop: Desktop): Geometry {
  const width = Math.max(0, Math.min(geometry.width, desktop.width));
  const height = Math.max(0, Math.min(geometry.height, desktop.height));
  const x = Math.min(
    Math.max(geometry.x, 0),
    Math.max(desktop.width - width, 0),
  );
  const y = Math.min(
    Math.max(geometry.y, 0),
    Math.max(desktop.height - height, 0),
  );
  return { x, y, width, height };
}

/**
 * Mirrors widget.tsx's `bounds`: the viewport minus the 48px taskbar. Can
 * read as 0x0 -- observed in practice right at rehydration, which runs
 * during this module's own evaluation, earlier than any component mounts
 * and possibly before the browser has attached a real viewport to the
 * document. `null` in that case rather than a bogus reading, so a
 * degenerate desktop can't be mistaken for a genuinely tiny one.
 */
function currentDesktop(): Desktop | null {
  const width = window.innerWidth;
  const height = window.innerHeight - 48;
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

/** Advances the id counter past every restored id, so the very next
 * addWindow can't mint a duplicate of a window just brought back from
 * storage. This is the one thing this whole persistence feature exists to
 * get right -- see the lastWindowId comment above. */
function advancePastRestoredIds(windows: WindowState[]): void {
  const highest = windows.reduce((max, w) => Math.max(max, w.id), 0);
  if (highest > lastWindowId) lastWindowId = highest;
}

/**
 * Validates and repairs a just-rehydrated windows value: anything that isn't
 * a well-formed WindowState is dropped, and every surviving geometry/restore
 * rectangle is clamped into the desktop the browser actually has right now,
 * which may be smaller than it was when the layout was saved. Falls back to
 * the default lone Welcome window when nothing survives -- an empty or
 * garbage payload is functionally the same "start fresh" case as a schema
 * mismatch. Skips clamping entirely when the desktop reading itself is
 * degenerate (currentDesktop's null case): trusting the saved geometry as-is
 * is far safer than clamping every window down to a bogus 0x0 desktop.
 */
function sanitizeRestoredWindows(value: unknown): WindowState[] {
  const valid = Array.isArray(value) ? value.filter(isWindowState) : [];
  if (valid.length === 0) return defaultWindows();

  const desktop = currentDesktop();
  if (!desktop) return valid;

  return valid.map((w) => ({
    ...w,
    geometry: w.geometry && clampToDesktop(w.geometry, desktop),
    restore: w.restore && clampToDesktop(w.restore, desktop),
  }));
}

/**
 * Captured while the store is constructed below, before hydration ever runs
 * -- so it's already set by the time onRehydrateStorage's callback needs it,
 * including during the very first, automatic hydration at module load.
 * Referencing the exported `useWindowMangager` binding there instead would
 * throw: hydration off a synchronous storage like localStorage completes
 * before `create()` returns, while that binding is still being assigned.
 */
let storeApi: StoreApi<WindowManagerState & WindowManagerAction> | null = null;

/**
 * localStorage wrapped so every call is defensive, the same way storage.ts's
 * helpers are: setItem throws on quota exhaustion and in Safari private
 * mode, and getItem can throw a SecurityError when cookies are blocked.
 * Losing a layout read or write must never break the app.
 */
const safeLocalStorage: StateStorage = {
  getItem: (name) => {
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(name, value);
    } catch {
      // Quota exhaustion, Safari private mode, etc. Losing this write must
      // never break the app.
    }
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name);
    } catch {
      // As above.
    }
  },
};

export const useWindowMangager = create<
  WindowManagerState & WindowManagerAction
>()(
  persist(
    (set, _get, api) => {
      storeApi = api;
      return {
        windows: defaultWindows(),
        addWindow: (type) =>
          set((prev) => ({
            windows: [
              ...prev.windows,
              newWindow(type, getHighestZIndex(prev) + 1),
            ],
          })),
        removeWindow: (id) => {
          set((prev) => ({
            windows: prev.windows.filter((window) => window.id !== id),
          }));
        },
        bringToTop: (id) => {
          set((prev) => {
            // Return prev itself when nothing changes. This action fires on
            // every click in an already-focused window, and a fresh array
            // reference -- even with identical items -- re-renders every
            // state.windows subscriber, which cascades into every open
            // widget re-running.
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
            updateWindow(prev, id, (w) => {
              // No registered geometry means no restore point. Maximizing
              // anyway would store `restore: null`, and clearMaximized's
              // `w.restore ?? w.geometry` fallback would then read the
              // *maximized* full-desktop rectangle back out, stranding the
              // window at desktop size with no way back to its original
              // bounds.
              if (w.geometry === null) return w;
              return {
                ...w,
                isMinimized: false,
                isMaximized: true,
                restore: w.geometry,
                geometry: {
                  x: 0,
                  y: 0,
                  width: desktop.width,
                  height: desktop.height,
                },
              };
            }),
          ),
        restoreWindow: (id) =>
          set((prev) =>
            updateWindow(prev, id, (w) => {
              const unmaximized = clearMaximized(w);
              if (!unmaximized.isMinimized) return unmaximized;
              return { ...unmaximized, isMinimized: false };
            }),
          ),
        applyLayout: (kind, desktop) =>
          set((prev) => {
            const targets = tileableWindows(prev.windows);
            if (targets.length < 2) return prev;

            const rects = computeLayout(kind, targets.length, desktop);
            const rectById = new Map(targets.map((w, i) => [w.id, rects[i]]));

            return {
              windows: prev.windows.map((w) => {
                const rect = rectById.get(w.id);
                if (!rect) return w;
                return {
                  ...w,
                  geometry: rect,
                  isMaximized: false,
                  restore: null,
                };
              }),
            };
          }),
        reset: () =>
          set({
            windows: defaultWindows(),
          }),
      };
    },
    {
      name: LAYOUT_STORAGE_KEY,
      version: SCHEMA_VERSION,
      storage: createJSONStorage<PersistedState>(() => safeLocalStorage),
      // Only the window records are worth restoring. Actions and anything
      // derived don't belong in storage, and widget content is Task 3's job.
      partialize: (state) => ({ windows: state.windows }),
      // A version bump means the persisted shape changed underneath us.
      // Guessing at a migration risks restoring nonsense the rest of the app
      // can't make sense of; discarding costs one session's layout, which is
      // cheap.
      migrate: () => ({ windows: defaultWindows() }),
      // No maxAge here, unlike storage.ts's content TTL: layout isn't
      // sensitive, and it's the main day-to-day benefit of persisting at
      // all.
      onRehydrateStorage: () => (state, error) => {
        if (error || !state) return;
        const windows = sanitizeRestoredWindows(state.windows);
        advancePastRestoredIds(windows);
        storeApi?.setState({ windows });
      },
    },
  ),
);
