import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Widget } from "./widget";
import { useWindowMangager } from "./window-store";

beforeEach(() => {
  useWindowMangager.getState().reset();
});

function renderWidget(id: number) {
  return render(
    <Widget windowID={id} initialWidth={320} initialHeight={240}>
      <Widget.Title>Test Widget</Widget.Title>
      <Widget.Body>Body content</Widget.Body>
    </Widget>,
  );
}

const winFor = (id: number) =>
  useWindowMangager.getState().windows.find((w) => w.id === id);

describe("Widget", () => {
  it("registers its initial geometry once mounted", () => {
    const id = useWindowMangager.getState().windows[0].id;
    renderWidget(id);

    expect(winFor(id)?.geometry).toEqual({
      x: expect.any(Number),
      y: expect.any(Number),
      width: 320,
      height: 240,
    });
  });

  it("does not let a remount reset geometry the user has since moved", () => {
    const id = useWindowMangager.getState().windows[0].id;
    const { unmount } = renderWidget(id);

    useWindowMangager
      .getState()
      .setGeometry(id, { x: 42, y: 42, width: 100, height: 100 });
    unmount();

    // A fresh mount of the same window id -- what happens on a Fast Refresh
    // or an error-boundary reset -- must not yank the moved geometry back to
    // the initial centred rectangle.
    renderWidget(id);

    expect(winFor(id)?.geometry).toEqual({
      x: 42,
      y: 42,
      width: 100,
      height: 100,
    });
  });

  it("minimizes and restores via the title-bar controls", async () => {
    const user = userEvent.setup();
    const id = useWindowMangager.getState().windows[0].id;
    renderWidget(id);

    await user.click(screen.getByRole("button", { name: "Minimize" }));

    expect(winFor(id)?.isMinimized).toBe(true);
    expect(screen.queryByText("Body content")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Restore" }));

    expect(winFor(id)?.isMinimized).toBe(false);
    expect(screen.getByText("Body content")).toBeInTheDocument();
  });

  it("maximizes and restores to the pre-maximize geometry", async () => {
    const user = userEvent.setup();
    const id = useWindowMangager.getState().windows[0].id;
    renderWidget(id);
    const before = winFor(id)?.geometry;

    await user.click(screen.getByRole("button", { name: "Maximize" }));

    const maximized = winFor(id);
    expect(maximized?.isMaximized).toBe(true);
    expect(maximized?.restore).toEqual(before);
    expect(
      screen.queryByRole("button", { name: "Maximize" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Restore" }));

    const restored = winFor(id);
    expect(restored?.isMaximized).toBe(false);
    expect(restored?.geometry).toEqual(before);
  });

  it("closes by removing the window from the store", async () => {
    const user = userEvent.setup();
    const id = useWindowMangager.getState().windows[0].id;
    renderWidget(id);

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(useWindowMangager.getState().windows.some((w) => w.id === id)).toBe(
      false,
    );
  });

  it("brings itself to the top when clicked", async () => {
    const user = userEvent.setup();
    const first = useWindowMangager.getState().windows[0];
    useWindowMangager.getState().addWindow("PrettifyJson");
    const second = useWindowMangager.getState().windows[1];
    renderWidget(first.id);

    await user.click(screen.getByText("Body content"));

    expect(winFor(first.id)?.zIndex).toBeGreaterThan(second.zIndex);
  });
});

// Regression coverage for the destructive-clamp bug: a saved rectangle used
// to get clamped into whatever desktop was current at rehydration, and
// because the store persists itself, that clamped-down rectangle got written
// straight back to storage -- permanently. Clamping now happens only in the
// Rnd size/position this component computes for display; the store's
// geometry is never touched by the mere act of rendering on a small screen.
describe("Widget geometry clamping", () => {
  const rndStyle = () =>
    (
      screen
        .getByText("Body content")
        .closest(".react-draggable") as HTMLElement | null
    )?.style ?? null;

  let originalWidth: number;
  let originalHeight: number;

  beforeEach(() => {
    originalWidth = window.innerWidth;
    originalHeight = window.innerHeight;
  });

  afterEach(() => {
    window.innerWidth = originalWidth;
    window.innerHeight = originalHeight;
  });

  it("fits a saved window fully on screen on a smaller viewport without touching the stored geometry", () => {
    const id = useWindowMangager.getState().windows[0].id;
    const saved = { x: 40, y: 40, width: 640, height: 480 };
    useWindowMangager.getState().setGeometry(id, saved);

    // Too small for the saved 640x480 rectangle on either axis.
    window.innerWidth = 430;
    window.innerHeight = 369;
    renderWidget(id);

    const style = rndStyle();
    expect(style).not.toBeNull();
    expect(Number.parseFloat(style?.width ?? "")).toBeLessThanOrEqual(430);
    // -48px for the taskbar.
    expect(Number.parseFloat(style?.height ?? "")).toBeLessThanOrEqual(321);

    // Merely rendering on a small desktop must not mutate what's saved.
    expect(winFor(id)?.geometry).toEqual(saved);
  });

  it("restores the original size and position once the viewport grows back", () => {
    const id = useWindowMangager.getState().windows[0].id;
    const saved = { x: 40, y: 40, width: 640, height: 480 };
    useWindowMangager.getState().setGeometry(id, saved);

    window.innerWidth = 430;
    window.innerHeight = 369;
    renderWidget(id);

    const shrunk = rndStyle();
    expect(Number.parseFloat(shrunk?.width ?? "")).toBeLessThan(640);

    act(() => {
      window.innerWidth = 1280;
      window.innerHeight = 848; // -48px taskbar => an 800-tall desktop
      window.dispatchEvent(new Event("resize"));
    });

    const restored = rndStyle();
    expect(restored?.width).toBe("640px");
    expect(restored?.height).toBe("480px");
    expect(restored?.transform).toBe("translate(40px,40px)");

    // The round trip through a small viewport must not have left a mark on
    // the saved geometry either.
    expect(winFor(id)?.geometry).toEqual(saved);
  });

  it("still lets a real drag overwrite the saved geometry, even while the display is clamped", () => {
    const id = useWindowMangager.getState().windows[0].id;
    const saved = { x: 40, y: 40, width: 640, height: 480 };
    useWindowMangager.getState().setGeometry(id, saved);

    // Small enough that the saved rectangle is currently clamped for
    // display -- the drag below must still be a genuine, store-writing user
    // action, not something the clamp swallows.
    window.innerWidth = 430;
    window.innerHeight = 369;
    renderWidget(id);

    const handle = screen
      .getByText("Test Widget")
      .closest(".title-bar") as HTMLElement;
    fireEvent.mouseDown(handle, { clientX: 100, clientY: 100, button: 0 });
    fireEvent.mouseMove(document, { clientX: 150, clientY: 130 });
    fireEvent.mouseUp(document);

    const after = winFor(id)?.geometry;
    // onDragStop merges the drag's new x/y into the *saved* (unclamped)
    // width/height, so a real drag writes through at the saved 640x480 --
    // not the 430x321 the small viewport clamps it down to for display.
    expect(after?.width).toBe(640);
    expect(after?.height).toBe(480);
    expect(after).not.toEqual(saved);
  });
});
