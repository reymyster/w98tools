import { type KeyboardEvent, type MouseEvent, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { StartBarTime } from "./start-bar-time";
import { StartBarWindowList } from "./start-bar-window-list";
import { MENU_ITEMS, type MenuAction } from "./start-menu-items";
import {
  WindowLayoutMenu,
  type WindowLayoutMenuHandle,
} from "./window-layout-menu";
import { useWindowMangager } from "./window-store";

// Rows are divs with menu/menuitem roles rather than <button>, because 98.css
// styles buttons with a silver face, bevel shadow and min-width that would
// break the menu look. The roles already replace list semantics, so divs (not
// ul/li) are the correct host elements, and Enter/Space is handled here since
// divs have no native activation.
const ROW =
  "cursor-pointer h-16 px-2 flex items-center hover:bg-[#0c1b98] hover:text-white";
const ROW_SEPARATOR = "shadow-[0_2px_#808280,_0_4px_white]";
const ROW_LABEL =
  "!text-base !subpixel-antialiased !font-sans cursor-pointer inline-flex items-center";
const SUBMENU =
  "windows-box-shadow w-32 absolute top-2 left-[calc(100%_-_6px)] bg-[silver] m-0 p-0";
const SUBMENU_ROW =
  "cursor-pointer h-8 px-2 flex items-center text-black hover:bg-[#0c1b98] hover:text-white";

export function StartBar() {
  const [menuOpen, setMenuOpen] = useState(false);
  // Which submenu is expanded, by label. Driven by state rather than a
  // CSS :hover rule so it can also be opened from the keyboard — under
  // group-hover the flyout was display:none, which made its items
  // unfocusable and left Image OCR unreachable without a mouse.
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const reset = useWindowMangager((state) => state.reset);
  const addWindow = useWindowMangager((state) => state.addWindow);
  const layoutMenuRef = useRef<WindowLayoutMenuHandle>(null);

  const closeMenu = () => {
    setMenuOpen(false);
    setOpenSubmenu(null);
  };

  const runAction = (action: MenuAction) => {
    switch (action.kind) {
      case "open":
        addWindow(action.widget);
        break;
      case "reset":
        reset();
        break;
      case "logOff":
        window.location.href = "about:blank";
        break;
    }
    closeMenu();
  };

  // Takes the event rather than returning a handler: a curried factory reads
  // to static analysis like a setState updater callback closing over other
  // setState calls, which it isn't.
  const handleRowKey = (
    e: KeyboardEvent<HTMLDivElement>,
    activate: () => void,
  ) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate();
    } else if (e.key === "Escape") {
      closeMenu();
    }
  };

  // Only fires the layout popup on empty taskbar background -- right-
  // clicking a taskbar window button (or any other button in the bar, like
  // Arrange Windows itself) should still get its own behaviour, not have
  // this hijack it. Checking `e.target === e.currentTarget` isn't enough:
  // StartBarWindowList's wrapper carries `grow-1`, so it fills the bar's
  // empty middle space as far as hit-testing is concerned even when none of
  // its buttons do, and a plain identity check would then treat that mostly-
  // empty area as "a child" and swallow the right-click.
  const handleBarContextMenu = (e: MouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    layoutMenuRef.current?.open();
  };

  return (
    <aside
      id="start-bar"
      className="bg-[#c0c0c0] z-[999999999] shadow-[0_-2px_#fffdfc,_0_-4px_#cce9eb] p-2 items-center flex justify-between"
      onContextMenu={handleBarContextMenu}
    >
      <label id="start-button" htmlFor="start-button-input" className="grow-0">
        {/* The button face is drawn in CSS; this names it for screen readers
            without changing the visuals. */}
        <span className="sr-only">Start</span>
      </label>
      <input
        type="checkbox"
        id="start-button-input"
        name="start-button-input"
        className="hidden"
        checked={menuOpen}
        onChange={(e) => setMenuOpen(e.target.checked)}
      />
      <div id="start-menu" className="windows-box-shadow">
        <div id="start-menu-title">
          W<span>98</span> <span>Styled Tools</span>
        </div>
        {/* pl-10 replaces the browser's default ul padding-inline-start,
            which used to clear the rotated title strip on the left. */}
        <div className="my-0 pl-10" role="menu">
          {MENU_ITEMS.map((item) => {
            const expanded = openSubmenu === item.label;
            const activate = () => {
              if (item.submenu) {
                setOpenSubmenu(expanded ? null : item.label);
              } else if (item.action) {
                runAction(item.action);
              }
            };

            return (
              <div
                key={item.label}
                // #programs carries position:relative and the ▶ arrow
                // (#programs > span::after) from App.css.
                id={item.submenu ? "programs" : undefined}
                className={cn(ROW, item.separatorAfter && ROW_SEPARATOR)}
                role="menuitem"
                tabIndex={0}
                aria-haspopup={item.submenu ? "menu" : undefined}
                aria-expanded={item.submenu ? expanded : undefined}
                onClick={activate}
                onKeyDown={(e) => handleRowKey(e, activate)}
                onMouseEnter={
                  item.submenu ? () => setOpenSubmenu(item.label) : undefined
                }
                onMouseLeave={
                  item.submenu ? () => setOpenSubmenu(null) : undefined
                }
                onBlur={
                  item.submenu
                    ? (e) => {
                        // Only collapse once focus has left the row and its
                        // flyout entirely, not while tabbing between them.
                        if (!e.currentTarget.contains(e.relatedTarget)) {
                          setOpenSubmenu(null);
                        }
                      }
                    : undefined
                }
              >
                <span className={ROW_LABEL}>
                  <img alt="" className="mr-2 w-8" src={item.icon} />
                  {item.label}
                </span>
                {item.submenu && (
                  <div className={SUBMENU} role="menu" hidden={!expanded}>
                    {item.submenu.map((sub) => {
                      const openSub = () =>
                        runAction({ kind: "open", widget: sub.widget });
                      return (
                        <div
                          key={sub.label}
                          className={SUBMENU_ROW}
                          role="menuitem"
                          tabIndex={0}
                          onClick={(e) => {
                            // Otherwise this bubbles to the parent row and
                            // immediately toggles the submenu shut.
                            e.stopPropagation();
                            openSub();
                          }}
                          onKeyDown={(e) => handleRowKey(e, openSub)}
                        >
                          {sub.label}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <StartBarWindowList />
      <WindowLayoutMenu ref={layoutMenuRef} />
      <StartBarTime />
    </aside>
  );
}
