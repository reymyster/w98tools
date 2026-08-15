import React, { type ReactNode, useEffect } from "react";
import { Rnd } from "react-rnd";
import { useWindowSize } from "usehooks-ts";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Window, type WindowContainerProps } from "@/components/window";
import { useWindowMangager } from "@/components/window-store";

export interface WidgetProps extends WindowContainerProps {
  windowID: number;
  initialHeight?: number;
  initialWidth?: number;
}

export function Widget({
  windowID,
  children,
  initialHeight = 300,
  initialWidth = 300,
  ...props
}: WidgetProps) {
  const removeWindow = useWindowMangager((state) => state.removeWindow);
  const bringToTop = useWindowMangager((state) => state.bringToTop);
  const registerGeometry = useWindowMangager((state) => state.registerGeometry);
  const setGeometry = useWindowMangager((state) => state.setGeometry);
  const minimizeWindow = useWindowMangager((state) => state.minimizeWindow);
  const maximizeWindow = useWindowMangager((state) => state.maximizeWindow);
  const restoreWindow = useWindowMangager((state) => state.restoreWindow);

  // Subscribing to this window's record -- not to state.windows -- is what
  // keeps a drag from re-rendering every other open window. Actions preserve
  // the object identity of records they don't touch, so this selector
  // returns the same reference and bails out of re-rendering.
  const win = useWindowMangager((state) =>
    state.windows.find((w) => w.id === windowID),
  );

  const { width: windowWidth = 0, height: windowHeight = 0 } = useWindowSize();
  const bounds = { width: windowWidth, height: windowHeight - 48 };
  const initialX = Math.max((bounds.width - initialWidth) / 2, 0);
  const initialY = Math.max((bounds.height - initialHeight) / 2, 0);

  const bringMeToTop = () => bringToTop(windowID);

  // The store can't compute the initial rectangle itself: centring needs the
  // viewport, and the preferred size is a prop of this component. Register it
  // once; registerGeometry is a no-op once geometry is non-null, so a
  // remount (Fast Refresh, an error-boundary reset) can't yank a window the
  // user has since moved.
  useEffect(() => {
    if (win && win.geometry === null) {
      registerGeometry(windowID, {
        x: initialX,
        y: initialY,
        width: initialWidth,
        height: initialHeight,
      });
    }
  }, [
    win,
    windowID,
    registerGeometry,
    initialX,
    initialY,
    initialWidth,
    initialHeight,
  ]);

  const isMinimized = win?.isMinimized ?? false;
  const isMaximized = win?.isMaximized ?? false;
  const zIndex = win?.zIndex ?? 0;
  // Fall back to the locally computed initial rectangle while the store's
  // geometry is still null, so the first paint isn't at 0,0.
  const geometry = win?.geometry ?? {
    x: initialX,
    y: initialY,
    width: initialWidth,
    height: initialHeight,
  };

  // isMaximized overrides display to the full desktop regardless of what's
  // stored, the same way the old local state did -- so a drag gesture on a
  // maximized window's title bar stays visually pinned, matching prior
  // behaviour, even though it still writes through to the store below.
  const widgetWidth = isMaximized ? bounds.width : geometry.width;
  const widgetHeight = isMinimized
    ? 36
    : isMaximized
      ? bounds.height
      : geometry.height;
  const widgetX = isMaximized ? 0 : geometry.x;
  const widgetY = isMaximized ? 0 : geometry.y;

  const childArray = React.Children.toArray(children);

  const title = childArray.filter(
    (c): c is React.ReactElement =>
      React.isValidElement(c) && c.type === Widget.Title,
  );

  const body = childArray.filter(
    (c): c is React.ReactElement =>
      React.isValidElement(c) && c.type === Widget.Body,
  );

  const statuses = childArray.filter(
    (c): c is React.ReactElement =>
      React.isValidElement(c) && c.type === Widget.Status,
  );

  const minimize = () => minimizeWindow(windowID);

  const maximize = () => maximizeWindow(windowID, bounds);

  const restore = () => restoreWindow(windowID);

  const close = () => removeWindow(windowID);

  const moveAndResize = (
    to:
      | "LeftHalf"
      | "RightHalf"
      | "TopLeft"
      | "TopRight"
      | "BottomLeft"
      | "BottomRight",
  ) => {
    // A window mid-minimize or mid-maximize can still reach this via the
    // title-bar context menu, so clear both before applying the computed
    // rectangle -- restoreWindow is a no-op when neither flag is set.
    restoreWindow(windowID);
    setGeometry(windowID, {
      y:
        to.includes("Half") || to.includes("Top")
          ? 0
          : Math.round(bounds.height / 2) - 7,
      x: to.includes("Left") ? 0 : Math.round(bounds.width / 2) - 7,
      height: to.includes("Half")
        ? bounds.height - 15
        : Math.round(bounds.height / 2) - 15,
      width: Math.round(bounds.width / 2) - 15,
    });
  };

  return (
    <Rnd
      size={{ width: widgetWidth, height: widgetHeight }}
      position={{ x: widgetX, y: widgetY }}
      onDragStart={bringMeToTop}
      onDragStop={(_, data) => {
        setGeometry(windowID, { ...geometry, x: data.x, y: data.y });
      }}
      onResizeStart={bringMeToTop}
      onResizeStop={(_, __, ref, ___, pos) => {
        setGeometry(windowID, {
          width: ref.offsetWidth,
          height: ref.offsetHeight,
          x: pos.x,
          y: pos.y,
        });
      }}
      style={{ zIndex }}
      onClick={bringMeToTop}
      dragHandleClassName="title-bar"
      bounds={"parent"}
      enableResizing={!isMaximized && !isMinimized}
    >
      <Window.Container {...props}>
        <ContextMenu>
          <ContextMenuTrigger>
            <Window.TitleBar>
              {title}
              <Window.TitleBarControls>
                {!isMinimized && !isMaximized && (
                  <Window.TitleBarControlButton
                    buttonType="Minimize"
                    onClick={minimize}
                  />
                )}
                {(isMinimized || isMaximized) && (
                  <Window.TitleBarControlButton
                    buttonType="Restore"
                    onClick={restore}
                  />
                )}
                {!isMinimized && !isMaximized && (
                  <Window.TitleBarControlButton
                    buttonType="Maximize"
                    onClick={maximize}
                  />
                )}
                <Window.TitleBarControlButton
                  buttonType="Close"
                  onClick={close}
                />
              </Window.TitleBarControls>
            </Window.TitleBar>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                Move &amp; Resize
                <ContextMenuSubContent>
                  <ContextMenuItem onClick={() => moveAndResize("LeftHalf")}>
                    Left Half
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => moveAndResize("RightHalf")}>
                    Right Half
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => moveAndResize("TopLeft")}>
                    Top Left
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => moveAndResize("TopRight")}>
                    Top Right
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => moveAndResize("BottomLeft")}>
                    Bottom Left
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => moveAndResize("BottomRight")}>
                    Bottom Right
                  </ContextMenuItem>
                </ContextMenuSubContent>
              </ContextMenuSubTrigger>
            </ContextMenuSub>
          </ContextMenuContent>
        </ContextMenu>
        {!isMinimized && body}
        {!isMinimized && statuses.length > 0 && (
          <Window.StatusBar>
            {/* React.Children.toArray assigns each child a stable, unique
                key, so there's no need to fall back to the array index. */}
            {statuses.map((status) => (
              <Window.StatusBarField key={status.key}>
                {status}
              </Window.StatusBarField>
            ))}
          </Window.StatusBar>
        )}
      </Window.Container>
    </Rnd>
  );
}

Widget.Title = Window.TitleBarText;

Widget.Body = Window.Body;

Widget.Status = ({ children }: { children: ReactNode }) => <>{children}</>;
