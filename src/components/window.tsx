import React from "react";
import { cn } from "@/lib/utils";

export interface WindowContainerProps
  extends React.HTMLAttributes<HTMLDivElement> {}

const Container = React.forwardRef<HTMLDivElement, WindowContainerProps>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("window", className)} {...props} />;
  }
);
Container.displayName = "WindowContainer";

const TitleBar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("title-bar", className)} {...props} />
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
  <div ref={ref} className={cn("window-body", className)} {...props} />
));
Body.displayName = "WindowBody";

const StatusBar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("status-bar", className)} {...props} />
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
