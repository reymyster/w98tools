import { describe, expect, it } from "vitest";
import { computeLayout, type Desktop, layoutsFor } from "./window-layout";

const DESKTOP: Desktop = { width: 1000, height: 700 };

/** Two rectangles overlap if they intersect on both axes. */
function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

describe("layoutsFor", () => {
  it("offers nothing below two windows", () => {
    expect(layoutsFor(0)).toEqual([]);
    expect(layoutsFor(1)).toEqual([]);
  });

  it("offers side-by-side and stacked for two", () => {
    expect(layoutsFor(2)).toEqual(["side-by-side", "stacked", "cascade"]);
  });

  it("offers the three-window layouts for three", () => {
    expect(layoutsFor(3)).toEqual([
      "one-large-two",
      "three-columns",
      "cascade",
    ]);
  });

  it("offers quarters for four", () => {
    expect(layoutsFor(4)).toEqual(["quarters", "cascade"]);
  });

  it("offers only cascade above four", () => {
    expect(layoutsFor(5)).toEqual(["cascade"]);
    expect(layoutsFor(9)).toEqual(["cascade"]);
  });

  it("always includes cascade once there is anything to arrange", () => {
    for (const n of [2, 3, 4, 5, 12]) {
      expect(layoutsFor(n)).toContain("cascade");
    }
  });
});

describe("computeLayout", () => {
  it("returns one rectangle per window", () => {
    expect(computeLayout("quarters", 4, DESKTOP)).toHaveLength(4);
    expect(computeLayout("cascade", 7, DESKTOP)).toHaveLength(7);
  });

  it("splits side-by-side into left and right halves", () => {
    const [left, right] = computeLayout("side-by-side", 2, DESKTOP);

    expect(left.x).toBe(0);
    expect(left.y).toBe(0);
    expect(right.x).toBeGreaterThan(left.x + left.width / 2);
    expect(left.height).toBe(right.height);
  });

  it("splits stacked into top and bottom halves", () => {
    const [top, bottom] = computeLayout("stacked", 2, DESKTOP);

    expect(top.y).toBe(0);
    expect(bottom.y).toBeGreaterThan(top.y + top.height / 2);
    expect(top.width).toBe(bottom.width);
  });

  it("gives one-large-two a full-height left pane and two stacked right", () => {
    const [large, topRight, bottomRight] = computeLayout(
      "one-large-two",
      3,
      DESKTOP,
    );

    expect(large.height).toBeGreaterThan(topRight.height);
    expect(topRight.x).toBe(bottomRight.x);
    expect(bottomRight.y).toBeGreaterThan(topRight.y);
  });

  it("gives three-columns three equal-width panes", () => {
    const rects = computeLayout("three-columns", 3, DESKTOP);

    expect(rects[0].width).toBe(rects[1].width);
    expect(rects[1].width).toBe(rects[2].width);
    expect(rects[0].height).toBe(rects[2].height);
  });

  it("never overlaps tiles in a tiled layout", () => {
    const cases = [
      ["side-by-side", 2],
      ["stacked", 2],
      ["one-large-two", 3],
      ["three-columns", 3],
      ["quarters", 4],
    ] as const;

    for (const [kind, count] of cases) {
      const rects = computeLayout(kind, count, DESKTOP);
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          expect(
            overlaps(rects[i], rects[j]),
            `${kind}: tile ${i} overlaps tile ${j}`,
          ).toBe(false);
        }
      }
    }
  });

  it("keeps every tile inside the desktop", () => {
    const cases = [
      ["side-by-side", 2],
      ["quarters", 4],
      ["cascade", 8],
    ] as const;

    for (const [kind, count] of cases) {
      for (const rect of computeLayout(kind, count, DESKTOP)) {
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(DESKTOP.width);
        expect(rect.y + rect.height).toBeLessThanOrEqual(DESKTOP.height);
      }
    }
  });

  it("steps each cascaded window down and right of the last", () => {
    const [first, second] = computeLayout("cascade", 3, DESKTOP);

    expect(second.x).toBeGreaterThan(first.x);
    expect(second.y).toBeGreaterThan(first.y);
    expect(second.width).toBe(first.width);
  });

  it("wraps a long cascade back to the top rather than off-screen", () => {
    const rects = computeLayout("cascade", 40, DESKTOP);
    const maxY = Math.max(...rects.map((r) => r.y + r.height));

    expect(maxY).toBeLessThanOrEqual(DESKTOP.height);
  });

  it("tiles a count that does not fill the layout without overlapping", () => {
    // Three windows asked to use the four-pane layout: the fourth cell is
    // simply left empty rather than doubling two windows into one cell.
    const rects = computeLayout("quarters", 3, DESKTOP);

    expect(rects).toHaveLength(3);
    expect(overlaps(rects[0], rects[1])).toBe(false);
    expect(overlaps(rects[1], rects[2])).toBe(false);
  });

  it("survives a desktop too small to subdivide", () => {
    const tiny: Desktop = { width: 40, height: 30 };

    for (const rect of computeLayout("quarters", 4, tiny)) {
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(0);
    }
  });
});
