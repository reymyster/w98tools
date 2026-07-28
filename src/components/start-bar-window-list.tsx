import { useWindowMangager } from "./window-store";

export function StartBarWindowList() {
  const windows = useWindowMangager((state) => state.windows);
  const bringToTop = useWindowMangager((state) => state.bringToTop);

  return (
    <div className="grow-1 flex flex-row gap-4 ml-4">
      {windows.map((w) => {
        return (
          // A real button: keyboard-operable for free. The extra utilities
          // undo 98.css's default button chrome (silver face, bevel, min
          // sizes, the transparent-text/text-shadow trick) so the existing
          // neumorphic styling still shows through.
          <button
            type="button"
            key={w.id}
            className="shadow-neumorphic active:shadow-neumorphic-active cursor-pointer h-8 px-2 min-w-0 min-h-0 bg-transparent text-inherit [text-shadow:none]"
            onClick={() => bringToTop(w.id)}
          >
            {w.type.toString()}
          </button>
        );
      })}
    </div>
  );
}
