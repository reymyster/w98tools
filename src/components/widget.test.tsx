import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
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
