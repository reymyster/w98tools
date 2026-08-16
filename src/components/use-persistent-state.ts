import { useEffect, useRef, useState } from "react";
import {
  CONTENT_TTL_MS,
  KEY_PREFIX,
  listKeys,
  loadValue,
  purgeExpired,
  removeValue,
  saveValue,
} from "@/lib/storage";

/**
 * This module depends only on `@/lib/storage`, never on `window-store.ts` --
 * deliberately, since `window-store.ts` imports `dropWindowContent` and
 * `sweepContent` from here to clean up after closed windows. If this module
 * ever needed something from the store (a `WindowState`, a selector), that
 * import would run the other way and the two files would form a cycle.
 * Keeping `sweepContent`'s parameter a plain `number[]` rather than
 * `WindowState[]` is what avoids that.
 */

const CONTENT_KEY_PREFIX = `${KEY_PREFIX}content:`;

/** Where one widget field's persisted value lives in storage. */
export function contentKey(windowID: number, field: string): string {
  return `${CONTENT_KEY_PREFIX}${windowID}:${field}`;
}

/** windowID out of a content key, or null if the key isn't shaped like one
 * (e.g. it's from a schema this module no longer writes). */
function parseWindowID(key: string): number | null {
  const rest = key.slice(CONTENT_KEY_PREFIX.length);
  const separator = rest.indexOf(":");
  if (separator === -1) return null;
  const id = Number(rest.slice(0, separator));
  return Number.isFinite(id) ? id : null;
}

// How long to let a burst of keystrokes settle before writing. Persisting on
// every keystroke would serialize a whole textarea's contents to
// localStorage on every character typed, which is wasted work while the user
// is still mid-sentence.
const DEBOUNCE_MS = 400;

/**
 * Persists `initial` (and every value it's later set to) under
 * `contentKey(windowID, field)`, with a 3-day TTL (`CONTENT_TTL_MS`).
 *
 * The initial value is read once, synchronously, via a lazy `useState`
 * initialiser rather than an effect -- an effect runs after the first paint,
 * so it would flash `initial` on screen for a frame before the restored
 * value replaced it.
 *
 * Writes are debounced (see `DEBOUNCE_MS` above), which alone would lose the
 * most recent burst of typing if the tab reloads or closes before the timer
 * fires -- exactly the "type something, then immediately reload" case a user
 * actually hits. `pagehide` fires on reload, navigation and tab close
 * (including bfcache cases `beforeunload` can miss), so it flushes the
 * latest value synchronously as a backstop to the debounce timer.
 */
export function usePersistentState<T>(
  windowID: number,
  field: string,
  initial: T,
): [T, (value: T) => void] {
  const key = contentKey(windowID, field);

  const [value, setValue] = useState<T>(() => {
    const restored = loadValue<T>(localStorage, key, CONTENT_TTL_MS);
    return restored === undefined ? initial : restored;
  });

  // Read by the pagehide flush below, so it always has the latest value and
  // key without needing to tear down and re-add that listener on every
  // keystroke the way depending on `value` directly would. Updated from an
  // effect rather than assigned during render: render can run more than
  // once before committing, and mutating a ref's `.current` there is exactly
  // what React's rules of refs warn against.
  const latest = useRef({ key, value });

  useEffect(() => {
    latest.current = { key, value };

    const timer = setTimeout(() => {
      saveValue(localStorage, key, value);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [key, value]);

  useEffect(() => {
    const flush = () => {
      saveValue(localStorage, latest.current.key, latest.current.value);
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  return [value, setValue];
}

/** Removes every field persisted for `windowID`. Called when its window
 * closes, so a closed window's content doesn't linger in storage forever. */
export function dropWindowContent(windowID: number): void {
  const prefix = `${CONTENT_KEY_PREFIX}${windowID}:`;
  for (const key of listKeys(localStorage, prefix)) {
    removeValue(localStorage, key);
  }
}

/**
 * Reconciles persisted content with the windows that are actually open:
 * purges anything past its TTL, then removes any remaining content key whose
 * window id isn't in `liveWindowIDs`. Content is keyed by window id with no
 * back-reference from the window record to its content, so without this
 * sweep every closed window (or one closed while the app wasn't running to
 * catch it in `removeWindow`) leaks its content into storage indefinitely.
 * Meant to run once, on rehydration, with the freshly restored window ids.
 */
export function sweepContent(liveWindowIDs: number[]): void {
  purgeExpired(localStorage, CONTENT_KEY_PREFIX, CONTENT_TTL_MS);

  const live = new Set(liveWindowIDs);
  for (const key of listKeys(localStorage, CONTENT_KEY_PREFIX)) {
    const id = parseWindowID(key);
    if (id === null || !live.has(id)) {
      removeValue(localStorage, key);
    }
  }
}
