import { StartBar } from "./start-bar";
import { Welcome as WelcomeWidget } from "@/components/widgets/welcome";
import { create } from "zustand";

export type WindowState = {
  id: number;
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
  windows: [{ id: Date.now() }],
  addWindow: () => console.log("Add Window?"),
  removeWindow: (id) => {
    set((prev) => ({
      windows: prev.windows.filter((window) => window.id !== id),
    }));
    console.log(`remove window ${id}`);
  },
  reset: () => set({ windows: [{ id: Date.now() }] }),
}));

export function WindowManager() {
  const windows = useWindowMangager((state) => state.windows);
  return (
    <div className="h-svh grid grid-rows-[auto_48px] bg-gradient-to-br from-slate-300 to-[#008080] overflow-hidden">
      <main className="mr-2.5 mb-2">
        {windows.map((w) => (
          <WelcomeWidget key={w.id} id={w.id} />
        ))}
        {/* <Widget initialHeight={230} initialWidth={250} windowID={15}>
          <Widget.Title>Welcome!</Widget.Title>
          <Widget.Body>
            <p>String Utilities</p>
            <ul>
              <li>Search & Replace</li>
              <li>Split</li>
            </ul>
            <p>Prettify</p>
            <ul>
              <li>JSON</li>
              <li>SQL</li>
            </ul>
          </Widget.Body>
          <Widget.Status>
            Press <span className="font-bold">Start</span> to begin.
          </Widget.Status>
          <Widget.Status>Implemented: 14%</Widget.Status>
        </Widget> */}
      </main>
      <StartBar />
    </div>
  );
}
