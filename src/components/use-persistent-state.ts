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
// every keystroke would serialize a whole textarea's contents to storage on
// every character typed, which is wasted work while the user is still
// mid-sentence.
const DEBOUNCE_MS = 400;

/**
 * Shared implementation behind `usePersistentState` and `useSessionState`.
 * They differ only in which `Storage` backs them and whether the value ever
 * expires -- everything else (the lazy initial read, the debounced write,
 * the `pagehide` flush) is identical, so it lives here once.
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
function usePersistedField<T>(
  storage: Storage,
  maxAgeMs: number | null,
  windowID: number,
  field: string,
  initial: T,
): [T, (value: T) => void] {
  const key = contentKey(windowID, field);

  const [value, setValue] = useState<T>(() => {
    const restored = loadValue<T>(storage, key, maxAgeMs);
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
      saveValue(storage, key, value);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [storage, key, value]);

  useEffect(() => {
    const flush = () => {
      saveValue(storage, latest.current.key, latest.current.value);
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [storage]);

  return [value, setValue];
}

/**
 * Persists `initial` (and every value it's later set to) under
 * `contentKey(windowID, field)` in `localStorage`, with a 3-day TTL
 * (`CONTENT_TTL_MS`). This is the default for widget content: it survives a
 * closed tab or a restarted browser, which is what makes it convenient, and
 * exactly why it must never hold anything a user wouldn't want sitting on
 * disk indefinitely (see `useSessionState` below for that case).
 */
export function usePersistentState<T>(
  windowID: number,
  field: string,
  initial: T,
): [T, (value: T) => void] {
  return usePersistedField(
    localStorage,
    CONTENT_TTL_MS,
    windowID,
    field,
    initial,
  );
}

/**
 * Session-scoped counterpart to `usePersistentState`: same envelope, same
 * debounce-then-flush-on-pagehide behaviour, but backed by `sessionStorage`
 * and with no TTL at all -- `maxAgeMs: null`, since the tab closing is the
 * expiry. Reserved for the JWT decoder's token field, which must survive an
 * accidental reload (the case a user actually hits) but must never touch
 * disk the way `localStorage` would.
 */
export function useSessionState<T>(
  windowID: number,
  field: string,
  initial: T,
): [T, (value: T) => void] {
  return usePersistedField(sessionStorage, null, windowID, field, initial);
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

/**
 * Removes every key under `KEY_PREFIX` from both `localStorage` and
 * `sessionStorage` -- widget content, the window layout, and the JWT
 * decoder's session-only token alike. Reset Windows calls this rather than
 * `localStorage.clear()`, which would also erase whatever unrelated data
 * another app on the same origin has stored; scoping the removal to this
 * app's prefix is what keeps that safe.
 */
export function clearPersistedState(): void {
  for (const storage of [localStorage, sessionStorage]) {
    for (const key of listKeys(storage, KEY_PREFIX)) {
      removeValue(storage, key);
    }
  }
}
