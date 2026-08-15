import { Widget } from "@/components/widget";

export interface WidgetCrashedProps {
  windowID: number;
  error: Error;
  reset: () => void;
}

// Rendered by an ErrorBoundary's fallback in place of a widget that threw.
// It's a real Widget -- not a plain error message -- so the window keeps its
// title bar, stays draggable, and its Close button keeps working through the
// store exactly like any other window; no closing logic is reimplemented
// here.
export function WidgetCrashed({ windowID, error, reset }: WidgetCrashedProps) {
  return (
    <Widget windowID={windowID}>
      <Widget.Title>Application Error</Widget.Title>
      <Widget.Body>
        <p>This tool ran into a problem and couldn&apos;t continue.</p>
        <p>{error.message}</p>
        {/* A bare <button> is correct here: 98.css gives it the silver face
            and bevel, which is the look we want for this control. */}
        <button type="button" onClick={reset}>
          Retry
        </button>
      </Widget.Body>
      <Widget.Status>Crashed</Widget.Status>
    </Widget>
  );
}
