import { StartBar } from "./start-bar";
import { Help as HelpWidget } from "@/components/widgets/help";
import { SearchReplace as SearchReplaceWidget } from "@/components/widgets/search-replace";
import { Welcome as WelcomeWidget } from "@/components/widgets/welcome";
import { create } from "zustand";

export const widgetRegistry = {
  Help: HelpWidget,
  SearchReplace: SearchReplaceWidget,
  Welcome: WelcomeWidget,
} as const;

export type WidgetType = keyof typeof widgetRegistry;

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

export const useWindowMangager = create<
  WindowManagerState & WindowManagerAction
>((set) => ({
  windows: [{ id: Date.now(), type: "Welcome", zIndex: 1 }],
  addWindow: (type) =>
    set((prev) => ({
      windows: [
        ...prev.windows,
        { id: Date.now(), type, zIndex: getHighestZIndex(prev) + 1 },
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
      windows: [{ id: Date.now(), type: "Welcome", zIndex: 1 }],
    }),
}));

export function WindowManager() {
  const windows = useWindowMangager((state) => state.windows);
  return (
    <div className="h-svh grid grid-rows-[auto_48px] bg-gradient-to-br from-slate-300 to-[#008080] overflow-hidden">
      <main className="mr-2.5 mb-2">
        {windows.map((w) => {
          const WidgetComponent = widgetRegistry[w.type];

          return <WidgetComponent key={w.id} id={w.id} />;
        })}
      </main>
      <StartBar />
    </div>
  );
}
