import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { WindowLayoutMenu } from "./window-layout-menu";
import { useWindowMangager } from "./window-store";

const store = () => useWindowMangager.getState();
const trigger = () => screen.getByRole("button", { name: "Arrange Windows" });

describe("WindowLayoutMenu", () => {
  beforeEach(() => {
    store().reset();
  });

  it("is disabled while there is nothing to arrange", () => {
    render(<WindowLayoutMenu />);

    // reset() leaves only the Welcome window, which never tiles.
    expect(trigger()).toBeDisabled();
  });

  it("stays disabled with a single tileable window", async () => {
    store().addWindow("PrettifyJson");
    render(<WindowLayoutMenu />);

    expect(trigger()).toBeDisabled();
  });

  it("offers the two-window layouts for two windows", async () => {
    const user = userEvent.setup();
    store().addWindow("PrettifyJson");
    store().addWindow("SearchReplace");
    render(<WindowLayoutMenu />);

    await user.click(trigger());

    expect(screen.getByText("Side by Side")).toBeInTheDocument();
    expect(screen.getByText("Stacked")).toBeInTheDocument();
    expect(screen.getByText("Cascade")).toBeInTheDocument();
    expect(screen.queryByText("Quarters")).not.toBeInTheDocument();
  });

  it("offers Quarters for four windows", async () => {
    const user = userEvent.setup();
    for (const type of [
      "PrettifyJson",
      "SearchReplace",
      "PrettifySql",
      "SplitJoin",
    ] as const) {
      store().addWindow(type);
    }
    render(<WindowLayoutMenu />);

    await user.click(trigger());

    expect(screen.getByText("Quarters")).toBeInTheDocument();
  });

  it("applies the chosen layout to the open windows", async () => {
    const user = userEvent.setup();
    store().addWindow("PrettifyJson");
    store().addWindow("SearchReplace");
    render(<WindowLayoutMenu />);

    await user.click(trigger());
    await user.click(screen.getByText("Side by Side"));

    const tiled = store().windows.filter((w) => w.type !== "Welcome");
    expect(tiled[0].geometry).not.toBeNull();
    expect(tiled[1].geometry).not.toBeNull();
  });

  it("closes after a layout is chosen", async () => {
    const user = userEvent.setup();
    store().addWindow("PrettifyJson");
    store().addWindow("SearchReplace");
    render(<WindowLayoutMenu />);

    await user.click(trigger());
    await user.click(screen.getByText("Side by Side"));

    expect(screen.queryByText("Side by Side")).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    store().addWindow("PrettifyJson");
    store().addWindow("SearchReplace");
    render(<WindowLayoutMenu />);

    await user.click(trigger());
    await user.keyboard("{Escape}");

    expect(screen.queryByText("Side by Side")).not.toBeInTheDocument();
  });
});
