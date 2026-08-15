import { describe, expect, it } from "vitest";
import { ROADMAP, toolCounts } from "./roadmap";

describe("roadmap", () => {
  it("counts only entries that have shipped", () => {
    const counts = toolCounts([
      {
        group: "Example",
        entries: [
          { label: "Shipped", widget: "Help" },
          { label: "Planned" },
          { label: "Also planned" },
          { label: "Also shipped", widget: "Welcome" },
        ],
      },
    ]);

    expect(counts).toEqual({ shipped: 2, total: 4 });
  });

  it("returns zero counts rather than throwing for an empty roadmap", () => {
    expect(toolCounts([])).toEqual({ shipped: 0, total: 0 });
  });

  it("keeps every label unique so they are safe as React keys", () => {
    const labels = ROADMAP.flatMap((g) => g.entries).map((e) => e.label);
    expect(new Set(labels).size).toBe(labels.length);

    const groups = ROADMAP.map((g) => g.group);
    expect(new Set(groups).size).toBe(groups.length);
  });

  it("reports counts derived from the real roadmap", () => {
    // Guards the drift this replaced: the figure was a hardcoded 14% that
    // nobody updated as tools shipped.
    const entries = ROADMAP.flatMap((g) => g.entries);
    const shipped = entries.filter((e) => e.widget).length;

    expect(toolCounts()).toEqual({ shipped, total: entries.length });
  });
});
