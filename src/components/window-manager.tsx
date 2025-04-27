import { StartBar } from "./start-bar";
import { Welcome as WelcomeWidget } from "@/components/widgets/welcome";
import { SearchReplace as SearchReplaceWidget } from "@/components/widgets/search-replace";
import { create } from "zustand";

export const widgetRegistry = {
  Welcome: WelcomeWidget,
  SearchReplace: SearchReplaceWidget,
} as const;

export type WidgetType = keyof typeof widgetRegistry;

export type WindowState = {
  id: number;
  type: WidgetType;
};

type WindowManagerState = {
  windows: WindowState[];
};

type WindowManagerAction = {
  addWindow: (type: WidgetType) => void;
  removeWindow: (id: WindowState["id"]) => void;
  reset: () => void;
};

export const useWindowMangager = create<
  WindowManagerState & WindowManagerAction
>((set) => ({
  windows: [{ id: Date.now(), type: "Welcome" }],
  addWindow: (type) =>
    set((prev) => ({ windows: [...prev.windows, { id: Date.now(), type }] })),
  removeWindow: (id) => {
    set((prev) => ({
      windows: prev.windows.filter((window) => window.id !== id),
    }));
  },
  reset: () =>
    set({
      windows: [{ id: Date.now(), type: "Welcome" }],
    }),
}));

export function WindowManager() {
  const windows = useWindowMangager((state) => state.windows);
  return (
    <div className="h-svh grid grid-rows-[auto_48px] bg-gradient-to-br from-slate-300 to-[#008080] overflow-hidden">
      <main className="mr-2.5 mb-2">
        {windows.map((w) => {
          const WidgetComponent = widgetRegistry[w.type];
          console.table({ inside: "WidgetComponent", id: w.id, type: w.type });

          return <WidgetComponent key={w.id} id={w.id} />;
        })}
      </main>
      <StartBar />
    </div>
  );
}
