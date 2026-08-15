import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ROADMAP } from "@/components/roadmap";
import { useWindowMangager } from "@/components/window-store";
import { RoadmapList, Welcome } from "./welcome";

beforeEach(() => {
  useWindowMangager.getState().reset();
});

describe("Welcome", () => {
  it("renders the label of every roadmap tool", () => {
    render(<Welcome id={1} />);

    for (const entry of ROADMAP.flatMap((g) => g.entries)) {
      expect(screen.getByText(entry.label)).toBeInTheDocument();
    }
  });

  it("opens the right widget when a tool is clicked", async () => {
    const user = userEvent.setup();
    render(<Welcome id={1} />);

    await user.click(screen.getByText("JWT Decoder"));

    const windows = useWindowMangager.getState().windows;
    expect(windows.some((w) => w.type === "JwtDecoder")).toBe(true);
  });

  it("opens the right widget on Enter", async () => {
    const user = userEvent.setup();
    render(<Welcome id={1} />);

    screen.getByText("JSON").focus();
    await user.keyboard("{Enter}");

    const windows = useWindowMangager.getState().windows;
    expect(windows.some((w) => w.type === "PrettifyJson")).toBe(true);
  });

  it("opens the right widget on Space", async () => {
    const user = userEvent.setup();
    render(<Welcome id={1} />);

    screen.getByText("SQL").focus();
    await user.keyboard(" ");

    const windows = useWindowMangager.getState().windows;
    expect(windows.some((w) => w.type === "PrettifySql")).toBe(true);
  });

  it("shows the tool count in the status bar", () => {
    render(<Welcome id={1} />);

    const entries = ROADMAP.flatMap((g) => g.entries);
    const shipped = entries.filter((e) => e.widget).length;
    const expected =
      shipped === entries.length
        ? `${entries.length} tools`
        : `${shipped} of ${entries.length} tools`;

    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});

describe("RoadmapList", () => {
  // The real ROADMAP has no planned (widget-less) entries right now, so this
  // exercises that branch with an injected fixture instead of contorting
  // Welcome's own props just to reach it from a test.
  const fixture = [
    {
      group: "Fixture Group",
      entries: [
        { label: "Shipped Tool", widget: "Help" as const },
        { label: "Planned Tool" },
      ],
    },
  ];

  it("renders a shipped entry as an activatable control", () => {
    render(<RoadmapList roadmap={fixture} />);

    const item = screen.getByText("Shipped Tool");
    expect(item).toHaveAttribute("role", "button");
    expect(item).toHaveAttribute("tabIndex", "0");
  });

  it("renders a planned entry as plain, non-interactive text", () => {
    render(<RoadmapList roadmap={fixture} />);

    const item = screen.getByText("Planned Tool");
    expect(item).not.toHaveAttribute("role");
    expect(item).not.toHaveAttribute("tabIndex");
  });

  it("opens the shipped entry's widget when clicked", async () => {
    const user = userEvent.setup();
    render(<RoadmapList roadmap={fixture} />);

    await user.click(screen.getByText("Shipped Tool"));

    const windows = useWindowMangager.getState().windows;
    expect(windows.some((w) => w.type === "Help")).toBe(true);
  });
});
