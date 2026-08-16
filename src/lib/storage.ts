/**
 * A versioned, TTL-aware wrapper over the Web Storage API. Everything read
 * back here is untrusted: it may have been written by an older version of
 * the app, truncated mid-write, or simply absent. A read must never throw —
 * the caller always has a sane default to fall back to — and neither may a
 * write, since `setItem` throws on quota exhaustion and in Safari private
 * mode, and `getItem` can throw a SecurityError when cookies are blocked.
 * Every call into the Storage API is therefore wrapped in try/catch.
 */

export const SCHEMA_VERSION = 1;

const DAY_MS = 24 * 60 * 60 * 1000;
/** How long persisted widget content stays valid before it's dead weight. */
export const CONTENT_TTL_MS = 3 * DAY_MS;

export const KEY_PREFIX = "w98:";

export type Envelope<T> = {
  version: number;
  savedAt: number;
  value: T;
};

/**
 * A type predicate rather than a cast: `parsed` came from JSON.parse on
 * whatever a previous session (or a previous version of this app) happened
 * to write, so nothing about its shape is guaranteed until checked.
 */
function isEnvelope(parsed: unknown): parsed is Envelope<unknown> {
  return (
    typeof parsed === "object" &&
    parsed !== null &&
    "version" in parsed &&
    "savedAt" in parsed &&
    "value" in parsed &&
    typeof (parsed as { version: unknown }).version === "number" &&
    typeof (parsed as { savedAt: unknown }).savedAt === "number"
  );
}

/** `undefined` on any failure — absent key, bad JSON, or a hostile Storage. */
function readRaw(storage: Storage, key: string): string | undefined {
  try {
    return storage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Reads and validates a value written by `saveValue`. Returns `undefined`
 * rather than throwing for every way stored data can fail to be usable: the
 * key is absent, the JSON is malformed, the parsed value isn't an envelope,
 * it was written by a different schema version, `savedAt` isn't a finite
 * number, or it's older than `maxAgeMs`. `maxAgeMs === null` means the value
 * never expires.
 */
export function loadValue<T>(
  storage: Storage,
  key: string,
  maxAgeMs: number | null,
  now: number = Date.now(),
): T | undefined {
  const raw = readRaw(storage, key);
  if (raw === undefined) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (!isEnvelope(parsed)) return undefined;
  if (parsed.version !== SCHEMA_VERSION) return undefined;
  if (!Number.isFinite(parsed.savedAt)) return undefined;
  if (maxAgeMs !== null && now - parsed.savedAt > maxAgeMs) return undefined;

  return parsed.value as T;
}

/** Wraps `value` in an envelope and writes it. Swallows any write failure. */
export function saveValue<T>(
  storage: Storage,
  key: string,
  value: T,
  now: number = Date.now(),
): void {
  const envelope: Envelope<T> = {
    version: SCHEMA_VERSION,
    savedAt: now,
    value,
  };
  try {
    storage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Quota exhaustion, Safari private mode, etc. Persistence is a
    // convenience; losing this write must never break the app.
  }
}

export function removeValue(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // As above — a failed remove shouldn't be fatal either.
  }
}

/**
 * All keys under `prefix`. Collected into an array up front rather than
 * walked live: `key(i)` is index-based, so deleting mid-iteration would
 * shift later indices and skip entries — the classic off-by-one this
 * function exists to avoid inflicting on its callers (notably
 * `purgeExpired`, which removes while iterating).
 */
export function listKeys(storage: Storage, prefix: string): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(prefix)) keys.push(key);
    }
  } catch {
    return keys;
  }
  return keys;
}

/**
 * Removes every entry under `prefix` that's either expired or unreadable —
 * an envelope `loadValue` can't parse is dead weight it would reject
 * forever, so it's swept up here too. Returns the number removed.
 */
export function purgeExpired(
  storage: Storage,
  prefix: string,
  maxAgeMs: number,
  now: number = Date.now(),
): number {
  let removed = 0;
  for (const key of listKeys(storage, prefix)) {
    if (loadValue(storage, key, maxAgeMs, now) === undefined) {
      removeValue(storage, key);
      removed++;
    }
  }
  return removed;
}
