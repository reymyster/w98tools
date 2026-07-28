import { describe, expect, it } from "vitest";
import { implementedPercent, ROADMAP } from "./roadmap";

describe("roadmap", () => {
  it("counts only entries that have shipped", () => {
    const percent = implementedPercent([
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

    expect(percent).toBe(50);
  });

  it("returns 0 rather than NaN for an empty roadmap", () => {
    expect(implementedPercent([])).toBe(0);
  });

  it("keeps every label unique so they are safe as React keys", () => {
    const labels = ROADMAP.flatMap((g) => g.entries).map((e) => e.label);
    expect(new Set(labels).size).toBe(labels.length);

    const groups = ROADMAP.map((g) => g.group);
    expect(new Set(groups).size).toBe(groups.length);
  });

  it("reports a percentage derived from the real roadmap", () => {
    // Guards the drift this replaced: the figure was a hardcoded 14% that
    // nobody updated as tools shipped.
    const entries = ROADMAP.flatMap((g) => g.entries);
    const shipped = entries.filter((e) => e.widget).length;

    expect(implementedPercent()).toBe(
      Math.round((shipped / entries.length) * 100),
    );
  });
});
