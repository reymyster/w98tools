import { useWindowMangager } from "./window-manager";

export function StartBarWindowList() {
  const windows = useWindowMangager((state) => state.windows);
  const bringToTop = useWindowMangager((state) => state.bringToTop);

  return (
    <div className="grow-1 flex flex-row gap-4 ml-4">
      {windows.map((w) => {
        return (
          <label
            key={w.id}
            className="shadow-neumorphic active:shadow-neumorphic-active cursor-pointer h-8 px-2"
            onClick={() => bringToTop(w.id)}
          >
            {w.type.toString()}
          </label>
        );
      })}
    </div>
  );
}
