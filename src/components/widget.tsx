import React, { useState, type ReactNode } from "react";
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
import { useWindowMangager } from "@/components/window-manager";

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
  const zIndex = useWindowMangager(
    (state) => state.windows.find((w) => w.id === windowID)?.zIndex ?? 0
  );
  const { width: windowWidth = 0, height: windowHeight = 0 } = useWindowSize();
  const bounds = { width: windowWidth, height: windowHeight - 48 };
  const initialX = Math.max((bounds.width - initialWidth) / 2, 0);
  const initialY = Math.max((bounds.height - initialHeight) / 2, 0);

  const bringMeToTop = () => bringToTop(windowID);

  const [state, setState] = useState({
    x: initialX,
    y: initialY,
    prevX: 0,
    prevY: 0,
    height: initialHeight,
    width: initialWidth,
    isMinimized: false,
    isMaximized: false,
  });

  const widgetWidth = state.isMaximized ? bounds.width : state.width;
  const widgetHeight = state.isMinimized
    ? 36
    : state.isMaximized
    ? bounds.height
    : state.height;
  const widgetX = state.isMaximized ? 0 : state.x;
  const widgetY = state.isMaximized ? 0 : state.y;

  const childArray = React.Children.toArray(children);

  const title = childArray.filter(
    (c): c is React.ReactElement =>
      React.isValidElement(c) && c.type === Widget.Title
  );

  const body = childArray.filter(
    (c): c is React.ReactElement =>
      React.isValidElement(c) && c.type === Widget.Body
  );

  const statuses = childArray.filter(
    (c): c is React.ReactElement =>
      React.isValidElement(c) && c.type === Widget.Status
  );

  const minimize = () =>
    setState((prev) => ({ ...prev, isMinimized: true, isMaximized: false }));

  const maximize = () =>
    setState((prev) => ({
      ...prev,
      isMinimized: false,
      isMaximized: true,
      prevX: prev.x,
      prevY: prev.y,
    }));

  const restore = () =>
    setState((prev) => ({
      ...prev,
      isMinimized: false,
      isMaximized: false,
      x: Math.max(prev.x, prev.prevX),
      y: Math.max(prev.y, prev.prevY),
      prevX: 0,
      prevY: 0,
    }));

  const close = () => removeWindow(windowID);

  const moveAndResize = (
    to:
      | "LeftHalf"
      | "RightHalf"
      | "TopLeft"
      | "TopRight"
      | "BottomLeft"
      | "BottomRight"
  ) => {
    setState((prev) => ({
      ...prev,
      isMaximized: false,
      isMinimized: false,
      y:
        to.includes("Half") || to.includes("Top")
          ? 0
          : Math.round(bounds.height / 2) - 7,
      x: to.includes("Left") ? 0 : Math.round(bounds.width / 2) - 7,
      height: to.includes("Half")
        ? bounds.height - 15
        : Math.round(bounds.height / 2) - 15,
      width: Math.round(bounds.width / 2) - 15,
      prevX: 0,
      prevY: 0,
    }));
  };

  return (
    <Rnd
      size={{ width: widgetWidth, height: widgetHeight }}
      position={{ x: widgetX, y: widgetY }}
      onDragStart={bringMeToTop}
      onDragStop={(_, data) => {
        setState((prev) => ({ ...prev, x: data.x, y: data.y }));
      }}
      onResizeStart={bringMeToTop}
      onResizeStop={(_, __, ref, ___, pos) => {
        setState((prev) => ({
          ...prev,
          width: ref.offsetWidth,
          height: ref.offsetHeight,
          x: pos.x,
          y: pos.y,
        }));
      }}
      style={{ zIndex }}
      onClick={bringMeToTop}
      dragHandleClassName="title-bar"
      bounds={"parent"}
      enableResizing={!state.isMaximized && !state.isMinimized}
    >
      <Window.Container {...props}>
        <ContextMenu>
          <ContextMenuTrigger>
            <Window.TitleBar>
              {title}
              <Window.TitleBarControls>
                {!state.isMinimized && !state.isMaximized && (
                  <Window.TitleBarControlButton
                    buttonType="Minimize"
                    onClick={minimize}
                  />
                )}
                {(state.isMinimized || state.isMaximized) && (
                  <Window.TitleBarControlButton
                    buttonType="Restore"
                    onClick={restore}
                  />
                )}
                {!state.isMinimized && !state.isMaximized && (
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
        {!state.isMinimized && body}
        {!state.isMinimized && statuses.length > 0 && (
          <Window.StatusBar>
            {statuses.map((status, statusIndex) => (
              <Window.StatusBarField key={statusIndex}>
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
