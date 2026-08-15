/**
 * Where windows go when the user picks a layout. Pure geometry: no React, no
 * store, no DOM — which is what makes the overlap and in-bounds properties
 * cheap to assert exhaustively in tests.
 */

export type Desktop = { width: number; height: number };

export type Rect = { x: number; y: number; width: number; height: number };

export type LayoutKind =
  | "side-by-side"
  | "stacked"
  | "one-large-two"
  | "three-columns"
  | "quarters"
  | "cascade";

export const LAYOUT_LABELS: Record<LayoutKind, string> = {
  "side-by-side": "Side by Side",
  stacked: "Stacked",
  "one-large-two": "One Large + Two",
  "three-columns": "Three Columns",
  quarters: "Quarters",
  cascade: "Cascade",
};

// Mirrors the fudge factors already in widget.tsx's moveAndResize, so a tiled
// window sits exactly where the existing title-bar context menu would put it:
// tiles past the first are pulled back by EDGE, and every tile is SHRINK
// narrower and shorter than its cell to leave a visible gutter.
const EDGE = 7;
const SHRINK = 15;

const CASCADE_STEP = 28;
/** A cascaded window covers this much of each axis. */
const CASCADE_SCALE = 0.6;

/** Never hand back a zero or negative box, however small the desktop gets. */
function atLeast1(value: number): number {
  return Math.max(1, value);
}

/**
 * `count` cells of a `cols` x `rows` grid, row-major. A count smaller than the
 * grid leaves the trailing cells empty rather than stretching anything.
 */
function gridRects(
  cols: number,
  rows: number,
  count: number,
  desktop: Desktop,
): Rect[] {
  const cellWidth = Math.round(desktop.width / cols);
  const cellHeight = Math.round(desktop.height / rows);

  return Array.from({ length: count }, (_, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    return {
      x: col * cellWidth + (col === 0 ? 0 : -EDGE),
      y: row * cellHeight + (row === 0 ? 0 : -EDGE),
      width: atLeast1(cellWidth - SHRINK),
      height: atLeast1(cellHeight - SHRINK),
    };
  });
}

function cascadeRects(count: number, desktop: Desktop): Rect[] {
  const width = atLeast1(Math.round(desktop.width * CASCADE_SCALE));
  const height = atLeast1(Math.round(desktop.height * CASCADE_SCALE));

  // How many steps fit before a window would hang off the desktop. Wrapping
  // back to the origin keeps every title bar reachable no matter how many
  // windows are open, which is the whole reason cascade is the fallback.
  const stepsDown = Math.max(
    1,
    Math.floor((desktop.height - height) / CASCADE_STEP),
  );
  const stepsAcross = Math.max(
    1,
    Math.floor((desktop.width - width) / CASCADE_STEP),
  );
  const steps = Math.max(1, Math.min(stepsDown, stepsAcross));

  return Array.from({ length: count }, (_, index) => {
    const step = index % steps;
    return { x: step * CASCADE_STEP, y: step * CASCADE_STEP, width, height };
  });
}

/** Layouts worth offering for this many windows, best fit first. */
export function layoutsFor(count: number): LayoutKind[] {
  if (count < 2) return [];
  if (count === 2) return ["side-by-side", "stacked", "cascade"];
  if (count === 3) return ["one-large-two", "three-columns", "cascade"];
  if (count === 4) return ["quarters", "cascade"];
  // Above four, a grid gives each window a pane too small to use. Cascade
  // keeps every title bar visible and clickable instead.
  return ["cascade"];
}

export function computeLayout(
  kind: LayoutKind,
  count: number,
  desktop: Desktop,
): Rect[] {
  if (count <= 0) return [];

  switch (kind) {
    case "side-by-side":
      return gridRects(2, 1, count, desktop);
    case "stacked":
      return gridRects(1, 2, count, desktop);
    case "three-columns":
      return gridRects(3, 1, count, desktop);
    case "quarters":
      return gridRects(2, 2, count, desktop);
    case "cascade":
      return cascadeRects(count, desktop);
    case "one-large-two": {
      const halfWidth = Math.round(desktop.width / 2);
      const halfHeight = Math.round(desktop.height / 2);
      const large: Rect = {
        x: 0,
        y: 0,
        width: atLeast1(halfWidth - SHRINK),
        height: atLeast1(desktop.height - SHRINK),
      };
      const right = Array.from({ length: Math.max(0, count - 1) }, (_, i) => ({
        x: halfWidth - EDGE,
        y: i * halfHeight + (i === 0 ? 0 : -EDGE),
        width: atLeast1(halfWidth - SHRINK),
        height: atLeast1(halfHeight - SHRINK),
      }));
      return [large, ...right].slice(0, count);
    }
  }
}
