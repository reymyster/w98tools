# Window Tiling — Design

**Status:** approved
**Date:** 2026-08-15
**Branch:** `feat/window-tiling`

## Problem

Opening three or four tools means dragging and resizing each one by hand. The
geometry to place a window in a half or a quadrant already exists — `moveAndResize`
in `src/components/widget.tsx`, reachable by right-clicking a title bar — but it
acts on one window at a time and only from that window's own menu.

There is no way to say "arrange everything that's open".

## What we're building

A layout menu that arranges every open window at once, offered from two places:

- a **button on the right of the taskbar**, left of the clock, for discoverability;
- the **taskbar right-click menu**, which is where Windows 98 actually put this.

Both open the same menu. The menu's contents adapt to how many windows are open.

## Layouts

Offered by count of eligible windows (see *Which windows participate* below):

| Open | Offered |
| --- | --- |
| 0–1 | Menu is disabled — nothing to arrange |
| 2 | **Side by Side** (left/right halves), **Stacked** (top/bottom halves) |
| 3 | **One Large + Two** (left half, plus right side split top/bottom), **Three Columns** |
| 4 | **Quarters** |
| 5+ | **Cascade** |

**Cascade** is always offered regardless of count, at every count ≥ 2. It is the
universal fallback and the only sensible answer above four: a 3×3 grid of nine
windows gives each one a pane too small to use, whereas cascade keeps every title
bar visible and clickable, which is exactly what Windows 98 did.

Ordering within a layout follows the windows' current z-order, lowest first, so
the window you most recently used lands in the last slot rather than jumping
unpredictably.

## Which windows participate

- **Minimized windows are excluded** and stay minimized. They were minimized
  deliberately; a layout command should not undo that. They also do not count
  toward choosing the layout set — two open windows and three minimized ones
  offers the 2-window layouts.
- **Maximized windows are restored first**, then positioned. A maximized window
  is by definition occupying the whole screen, so it has to give that up to be
  tiled.
- If fewer than two windows are eligible, the menu is disabled with a tooltip
  explaining why, rather than hidden — a control that vanishes is more confusing
  than one that is visibly unavailable.

## Geometry

Tiling divides the desktop area — the viewport minus the 48px taskbar, matching
the `bounds` already computed in `widget.tsx`. The existing `moveAndResize`
already accounts for this and subtracts a small gutter; the new code reuses that
convention so a tiled window looks the same as one placed by the existing
context menu.

## The architectural problem this exposes

**Window geometry currently lives in the wrong place.** `window-store.ts` holds
only `{ id, type, zIndex }`. Position, size, `isMinimized` and `isMaximized` are
all local `useState` inside each `Widget`. Nothing outside a window can move it,
so a taskbar command has no way to reach any window but its own.

Geometry has to move into the store. That is the real work of this feature; the
menu itself is small.

### The trap to avoid

`bringToTop` in `window-store.ts` carries a comment explaining that returning a
fresh `windows` array re-renders every subscriber, which cascades into every open
widget re-running. That lesson applies directly here: if `x`/`y`/`width`/`height`
live in the store and each widget subscribes to `state.windows`, **every frame of
every drag re-renders every open window**.

The refactor must therefore:

- have each `Widget` subscribe to **its own** window record, not the array, so a
  drag re-renders only the window being dragged;
- keep the existing `bringToTop` identity-preserving behaviour intact;
- write drag/resize geometry to the store on **stop**, not on every move, keeping
  the in-flight drag local to `Rnd` exactly as it is today.

That last point matters: `Rnd` is already uncontrolled during a drag and only
reports on `onDragStop`/`onResizeStop`. Preserving that means the refactor
changes where the resting geometry lives without changing drag performance at
all.

## Non-goals

- Persisting layouts across reloads. Nothing in this app persists today.
- Drag-to-edge snapping (Aero Snap). Not a Windows 98 behaviour.
- Per-window "always on top".
- Animating windows into position. Windows 98 moved them instantly.

## Testing

- Pure layout maths (`n` windows + desktop bounds → `n` rectangles) as unit tests
  covering every layout: no overlaps for tiled layouts, full coverage of the
  desktop area, correct offsets for cascade, and correct handling of odd counts.
- Store actions tested directly: applying a layout updates every eligible
  window's geometry, leaves minimized ones alone, and clears `isMaximized`.
- Component tests for the menu: correct items per window count, disabled below
  two eligible windows, and both entry points opening the same menu.
- A regression test that dragging one window does not re-render others, since
  that is the specific failure this design is built to avoid.
