import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Window } from "./window";

describe("Window.Body", () => {
  // jsdom does not lay out, so this asserts the classes rather than the
  // geometry. They are load-bearing: without min-h-0 a flex child keeps
  // min-height:auto, refuses to shrink below its content, and pushes the
  // status bar out through the bottom of the window instead of scrolling.
  it("can shrink below its content and scroll", () => {
    render(<Window.Body data-testid="body">content</Window.Body>);

    const body = screen.getByTestId("body");
    expect(body).toHaveClass("min-h-0");
    expect(body).toHaveClass("overflow-auto");
    expect(body).toHaveClass("grow");
  });

  it("keeps a caller's own classes alongside the defaults", () => {
    render(
      <Window.Body data-testid="body" className="grid grid-cols-2">
        content
      </Window.Body>,
    );

    const body = screen.getByTestId("body");
    expect(body).toHaveClass("grid");
    expect(body).toHaveClass("grid-cols-2");
    expect(body).toHaveClass("min-h-0");
  });
});
