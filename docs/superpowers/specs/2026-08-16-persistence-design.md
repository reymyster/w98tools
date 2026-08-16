# Persistence — Design

**Status:** approved
**Date:** 2026-08-16
**Branch:** `feat/persistence`

## Problem

Nothing survives a reload. You arrange four windows exactly how you want them,
refresh, and you are back to a lone Welcome window. You paste an API response
into JSON to Types, hit refresh by habit, and it is gone.

This was impractical before: window geometry lived in each `Widget`'s local
state, so there was nothing serializable to save. The tiling work moved it into
the store, which is the shape `zustand/persist` wants. The expensive part is
already paid for.

## What we're building

Two storage layers, chosen per data type by how sensitive it is.

| Data | Where | Lifetime |
| --- | --- | --- |
| Which windows are open, their geometry, z-order, minimized/maximized | `localStorage` | Indefinite |
| Widget contents (pasted text, selected options) | `localStorage` | **3-day TTL** |
| The JWT decoder's token field | `sessionStorage` | Dies with the tab |

**localStorage has no native expiry.** TTL is implemented in app code: each
stored value carries a `savedAt` timestamp, and a read discards anything older
than the cutoff.

Be honest about what that buys. The check runs on *read*, so an expired value
sits on disk until the app is next opened — it is not erased at the moment it
expires. TTL is decluttering, not a privacy guarantee. That is precisely why the
JWT token does not use it.

## Why the JWT token is different

That widget's premise is that a production token can be inspected without
leaving the page. Writing it to disk does not violate that literally, but it
lets a credential outlive the tab. `sessionStorage` keeps the useful part —
surviving an accidental refresh, which is the case that actually bites — while
guaranteeing the token is gone when the tab closes and never touches disk.

## Clearing

The Start menu's existing **Reset Windows** entry gains the job of clearing
persisted state as well as resetting the layout, so there is an obvious escape
hatch when a restored session is not what you want. No new menu chrome.

## Things that will go wrong if we're not careful

- **Window ids collide after a restore.** `lastWindowId` is a module-level
  counter starting at 0. Restoring windows with ids 1–3 leaves it at 0, so the
  next `addWindow` mints id 1 — a duplicate, which is also a duplicate React
  key. After rehydration the counter must be advanced past the highest restored
  id. (The counter comment in `window-store.ts` already records that duplicate
  ids caused dropped and duplicated windows once before.)
- **Orphaned content keys.** Widget content is keyed by window id, so closing a
  window leaves its content behind forever. Content must be dropped when its
  window closes, and a sweep on load must purge both expired entries and any
  keyed to a window that no longer exists.
- **Corrupt or stale stored state must not white-page the app.** Anything read
  from storage is untrusted input: it may be malformed, truncated, or written by
  an older version of the app with a different shape. Parsing must be defensive
  and fall back to defaults. The per-widget error boundary is a net, not a
  substitute — the same reasoning already applied to pasted JWTs and JSON.
- **Storage can throw.** Safari in private mode and a full quota both make
  `setItem` throw. A failed save must never break the app; persistence is a
  convenience.
- **The shape will change.** A schema version is stored alongside the data, and
  a version mismatch discards rather than attempts a migration. Discarding costs
  the user one session's layout; guessing at a migration risks restoring
  nonsense.
- **Geometry restored into a smaller viewport.** A window saved at x=1500 on a
  wide monitor is off-screen on a laptop. Restored geometry must be clamped into
  the current desktop bounds.

## Non-goals

- Syncing across devices or browsers.
- Undo/history of previous sessions.
- Persisting OCR images or generated PDFs — large binary blobs, low value.
- A settings UI for the TTL. Three days is a reasonable default, not a
  preference.

## Testing

- TTL utilities as unit tests: a fresh value reads back, an expired one does
  not, a malformed one falls back to the default rather than throwing, and a
  `setItem` that throws is swallowed.
- Store rehydration: windows restore, the id counter advances past the highest
  restored id, a subsequent `addWindow` gets a genuinely unused id, and
  off-screen geometry is clamped.
- A version bump discards old state instead of restoring it.
- Content keys are dropped when their window closes and swept on load.
- The JWT token round-trips through `sessionStorage` and is absent from
  `localStorage`.
- Reset Windows clears both stores.
