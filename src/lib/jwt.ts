/**
 * Decoding only. There is deliberately no signature verification and no place
 * to paste a secret or key: the point of doing this in the browser is that the
 * token never leaves the page, and a secret field would undo that.
 */

export type DecodedJwt = {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
};

// Bounded rather than open-ended. The class is negated-free so there's no
// backtracking ambiguity, but an anchored full-string test on a huge paste
// still costs a linear scan per keystroke; 8192 is far longer than any real
// segment and keeps a pathological paste from mattering.
const BASE64URL = /^[A-Za-z0-9_-]{0,8192}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeSegment(segment: string): unknown {
  if (!BASE64URL.test(segment)) throw new Error("not base64url");

  const base64 = segment.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  // Decoding through TextDecoder rather than treating the bytes as Latin-1,
  // so claim values like a user's name survive intact.
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function decodeJwt(token: string): DecodedJwt | null {
  const parts = token.trim().split(".");
  if (parts.length !== 3) return null;

  try {
    const header = decodeSegment(parts[0]);
    const payload = decodeSegment(parts[1]);
    if (!isRecord(header) || !isRecord(payload)) return null;
    return { header, payload, signature: parts[2] };
  } catch {
    return null;
  }
}

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

const DIVISORS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000_000],
  ["month", 2_592_000_000],
  ["week", 604_800_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
  ["second", 1000],
];

/** "in 12 minutes" / "3 hours ago". `nowMs` is a parameter so tests are pure. */
export function relativeFromNow(epochSeconds: number, nowMs: number): string {
  // A claim of e.g. 1e400 parses to Infinity, and Intl.RelativeTimeFormat
  // throws a RangeError on a non-finite value rather than returning
  // anything -- uncaught, that unmounts the whole app (no error boundary
  // exists). Untrusted tokens are the entire premise of this widget, so a
  // malformed time claim must be treated as unrenderable, not fatal.
  if (!Number.isFinite(epochSeconds)) return "unknown time";

  const deltaMs = epochSeconds * 1000 - nowMs;

  for (const [unit, unitMs] of DIVISORS) {
    if (Math.abs(deltaMs) >= unitMs || unit === "second") {
      return RELATIVE.format(Math.round(deltaMs / unitMs), unit);
    }
  }

  return RELATIVE.format(0, "second");
}

export function isExpired(
  payload: Record<string, unknown>,
  nowMs: number,
): boolean {
  const exp = payload.exp;
  return typeof exp === "number" && exp * 1000 <= nowMs;
}
