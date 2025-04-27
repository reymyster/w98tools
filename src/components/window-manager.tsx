import { StartBar } from "./start-bar";
import {
  Welcome as WelcomeWidget,
  TestWidget,
} from "@/components/widgets/welcome";
import { create } from "zustand";

export const widgetRegistry = {
  Welcome: WelcomeWidget,
  Test: TestWidget,
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
  addWindow: () => void;
  removeWindow: (id: WindowState["id"]) => void;
  reset: () => void;
};

export const useWindowMangager = create<
  WindowManagerState & WindowManagerAction
>((set) => ({
  windows: [{ id: Date.now(), type: "Welcome" }],
  addWindow: () => console.log("Add Window?"),
  removeWindow: (id) => {
    set((prev) => ({
      windows: prev.windows.filter((window) => window.id !== id),
    }));
    console.log(`remove window ${id}`);
  },
  reset: () =>
    set({
      windows: [
        { id: Date.now(), type: "Welcome" },
        { id: Date.now() + 1, type: "Test" },
      ],
    }),
}));

export function WindowManager() {
  const windows = useWindowMangager((state) => state.windows);
  console.table(windows);
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
