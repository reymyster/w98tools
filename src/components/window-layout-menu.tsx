import {
  forwardRef,
  type KeyboardEvent,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useWindowSize } from "usehooks-ts";
import {
  LAYOUT_LABELS,
  type LayoutKind,
  layoutsFor,
} from "@/lib/window-layout";
import { tileableWindows, useWindowMangager } from "./window-store";

// Same reasoning as start-bar.tsx's SUBMENU / SUBMENU_ROW: rows are
// role-annotated divs, not <button>s, because 98.css gives every <button> a
// silver face, bevel shadow and 75px min-width, which would turn this popup
// into a column of chunky grey blocks instead of a menu.
const SUBMENU =
  "windows-box-shadow w-40 absolute bottom-full right-0 mb-1 bg-[silver] m-0 p-0";
const SUBMENU_ROW =
  "cursor-pointer h-8 px-2 flex items-center text-black hover:bg-[#0c1b98] hover:text-white";

export interface WindowLayoutMenuHandle {
  /**
   * Opens the popup imperatively -- used by the taskbar's right-click
   * handler, which lives outside this component. A no-op while the trigger
   * would be disabled, so right-clicking empty taskbar space with fewer than
   * two tileable windows does nothing.
   */
  open: () => void;
}

/**
 * The taskbar's "Arrange Windows" button and its layout popup, bundled as
 * one self-contained unit: start-bar.tsx renders it once for the visible
 * button, and reaches it via `ref` to open the same popup when the user
 * right-clicks empty taskbar space instead.
 */
export const WindowLayoutMenu = forwardRef<WindowLayoutMenuHandle>(
  function WindowLayoutMenu(_props, ref) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const windows = useWindowMangager((state) => state.windows);
    const applyLayout = useWindowMangager((state) => state.applyLayout);
    const { width = 0, height = 0 } = useWindowSize();

    const count = tileableWindows(windows).length;
    const disabled = count < 2;
    const layouts = layoutsFor(count);

    // usehooks-ts's useOnClickOutside types its ref parameter as
    // RefObject<HTMLElement> (non-nullable), which React 19's useRef(null)
    // can no longer satisfy -- so click-outside is hand-rolled instead.
    // Escape is handled at the document level too, rather than via onKeyDown
    // on the trigger/rows: the popup can also open from the taskbar's
    // right-click handler (see start-bar.tsx), which doesn't move focus
    // anywhere inside this component, so a focus-dependent onKeyDown would
    // never fire for that path. Both listeners are scoped to while the
    // popup is actually open.
    useEffect(() => {
      if (!isOpen) return;
      const handlePointerDown = (event: MouseEvent) => {
        if (
          containerRef.current &&
          !containerRef.current.contains(event.target as Node)
        ) {
          setIsOpen(false);
        }
      };
      const handleKeyDown = (event: globalThis.KeyboardEvent) => {
        if (event.key === "Escape") setIsOpen(false);
      };
      document.addEventListener("mousedown", handlePointerDown);
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("mousedown", handlePointerDown);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }, [isOpen]);

    useImperativeHandle(ref, () => ({
      open: () => {
        if (!disabled) setIsOpen(true);
      },
    }));

    const choose = (kind: LayoutKind) => {
      // Matches widget.tsx's `bounds`: the taskbar itself takes 48px, so the
      // desktop a layout can use is the viewport minus that strip.
      applyLayout(kind, { width, height: height - 48 });
      setIsOpen(false);
    };

    const handleRowKey = (
      e: KeyboardEvent<HTMLDivElement>,
      kind: LayoutKind,
    ) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        choose(kind);
      }
    };

    return (
      <div
        ref={containerRef}
        className="relative h-full flex items-center grow-0"
      >
        <button
          type="button"
          disabled={disabled}
          title={
            disabled
              ? "Open at least two windows to arrange them"
              : "Arrange the open windows"
          }
          aria-haspopup="menu"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
        >
          Arrange Windows
        </button>
        {isOpen && (
          <div className={SUBMENU} role="menu" aria-label="Window layouts">
            {layouts.map((kind) => (
              <div
                key={kind}
                role="menuitem"
                tabIndex={0}
                className={SUBMENU_ROW}
                onClick={() => choose(kind)}
                onKeyDown={(e) => handleRowKey(e, kind)}
              >
                {LAYOUT_LABELS[kind]}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  },
);
