import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./error-boundary";

// Module-level flag so a single component can be made to throw, then
// "recover" without unmounting -- the reset test flips this before calling
// the boundary's reset callback so the re-render actually succeeds.
let shouldThrow = true;

function Bomb(): ReactElement {
  if (shouldThrow) {
    throw new Error("boom");
  }
  return <p>recovered</p>;
}

describe("ErrorBoundary", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    shouldThrow = true;
    // React (and this boundary's own componentDidCatch) logs caught errors
    // to console.error by design. Silencing it here keeps test output clean
    // without touching the shared setup file.
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("renders children normally when nothing throws", () => {
    render(
      <ErrorBoundary label="Test" fallback={() => <p>fallback</p>}>
        <p>all good</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText("all good")).toBeInTheDocument();
    expect(screen.queryByText("fallback")).not.toBeInTheDocument();
  });

  it("renders the fallback with the thrown error when a child throws", () => {
    render(
      <ErrorBoundary
        label="Test"
        fallback={(error) => <p>Fallback: {error.message}</p>}
      >
        <Bomb />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Fallback: boom")).toBeInTheDocument();
    // componentDidCatch should log with the caller-supplied label so it's
    // obvious which widget crashed.
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Test"),
      expect.any(Error),
      expect.anything(),
    );
  });

  it("keeps a sibling subtree rendering when its neighbour throws", () => {
    render(
      <>
        <ErrorBoundary label="Crasher" fallback={() => <p>crasher fell</p>}>
          <Bomb />
        </ErrorBoundary>
        <ErrorBoundary label="Survivor" fallback={() => <p>survivor fell</p>}>
          <p>survivor is fine</p>
        </ErrorBoundary>
      </>,
    );

    expect(screen.getByText("crasher fell")).toBeInTheDocument();
    expect(screen.getByText("survivor is fine")).toBeInTheDocument();
    expect(screen.queryByText("survivor fell")).not.toBeInTheDocument();
  });

  it("clears the error and re-renders children when reset is called", () => {
    render(
      <ErrorBoundary
        label="Test"
        fallback={(error, reset) => (
          <button
            type="button"
            onClick={() => {
              // The widget itself is what stops throwing in real usage (e.g.
              // the user edits the input that crashed it); flipping the flag
              // here stands in for that before asking the boundary to retry.
              shouldThrow = false;
              reset();
            }}
          >
            Retry: {error.message}
          </button>
        )}
      >
        <Bomb />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Retry: boom")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry: boom" }));

    expect(screen.getByText("recovered")).toBeInTheDocument();
    expect(screen.queryByText("Retry: boom")).not.toBeInTheDocument();
  });
});
