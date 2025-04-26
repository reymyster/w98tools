import React, { useState } from "react";
import { Rnd } from "react-rnd";
import { useWindowSize } from "usehooks-ts";
import { cn } from "@/lib/utils";

export interface WindowContainerProps
  extends React.HTMLAttributes<HTMLDivElement> {
  initialHeight?: number;
  initialWidth?: number;
}

const Container = React.forwardRef<HTMLDivElement, WindowContainerProps>(
  ({ className, initialHeight = 300, initialWidth = 300, ...props }, ref) => {
    const { width: windowWidth = 0, height: windowHeight = 0 } =
      useWindowSize();
    const initialX = Math.max((windowWidth - initialWidth) / 2, 0);
    const initialY = Math.max((windowHeight - 48 - initialHeight) / 2, 0);

    console.table({
      windowWidth,
      windowHeight,
      initialWidth,
      initialHeight,
      initialX,
      initialY,
    });

    const [state, setState] = useState({ x: initialX, y: initialY });

    return (
      <Rnd
        size={{ width: initialWidth, height: initialHeight }}
        position={{ x: state.x, y: state.y }}
        onDragStop={(_, data) => setState({ x: data.x, y: data.y })}
        dragHandleClassName="title-bar"
        bounds={"parent"}
      >
        <div
          ref={ref}
          className={cn("window h-full flex flex-col", className)}
          {...props}
        />
      </Rnd>
    );
  }
);
Container.displayName = "WindowContainer";

const TitleBar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("title-bar grow-0 cursor-move", className)}
    {...props}
  />
));
TitleBar.displayName = "WindowTitleBar";

const TitleBarText = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("title-bar-text", className)} {...props} />
));
TitleBarText.displayName = "WindowTitleBarText";

const TitleBarControls = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("title-bar-controls", className)} {...props} />
));
TitleBarControls.displayName = "WindowTitleBarControls";

export interface WindowTitleBarControlButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  buttonType: "Help" | "Close" | "Minimize" | "Maximize" | "Restore";
}
const TitleBarControlButton = React.forwardRef<
  HTMLButtonElement,
  WindowTitleBarControlButtonProps
>(({ buttonType, ...props }, ref) => (
  <button ref={ref} aria-label={buttonType} {...props} />
));
TitleBarControlButton.displayName = "WindowTitleBarControlButton";

const Body = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("window-body grow", className)} {...props} />
));
Body.displayName = "WindowBody";

const StatusBar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("status-bar grow-0", className)} {...props} />
));
StatusBar.displayName = "WindowStatusBar";

const StatusBarField = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("status-bar-field", className)} {...props}></p>
));
StatusBarField.displayName = "WindowStatusBarField";

const Window = {
  Container,
  TitleBar,
  TitleBarText,
  TitleBarControls,
  TitleBarControlButton,
  Body,
  StatusBar,
  StatusBarField,
};

export { Window };
