/**
 * Parses a pasted timestamp: a bare signed integer, read as an epoch value,
 * or any other non-empty string, handed to the platform's own Date parser
 * (ISO 8601, RFC 2822, "Jan 1, 2026 12:00 PM", ...).
 */
export type ParsedInstant = {
  ms: number;
  assumedUnit: "seconds" | "milliseconds" | "date-string";
};

// A bare, signed integer -- no decimal point, no exponent -- is read as an
// epoch value rather than handed to the Date parser. Date.parse happily
// accepts some all-digit strings too (e.g. "20260101" as a compact ISO
// date), but a developer pasting a raw integer overwhelmingly means "epoch
// seconds or milliseconds", not "compact calendar date", so integers take
// this branch first.
const INTEGER = /^-?\d+$/;

// Where "seconds" ends and "milliseconds" begins. "Now" in epoch seconds is
// ~1.7e9 (10 digits); in epoch milliseconds it's ~1.7e12 (13 digits) -- the
// two are three orders of magnitude apart, and nothing a real system
// produces falls in between. So anything under 10^12 in magnitude is read
// as seconds, and anything at or above it as milliseconds. This is a
// heuristic, not a detector, and it has known limits: an epoch-*seconds*
// value more than ~31,000 years from 1970 (>= 10^12) would misread as
// milliseconds, and an epoch-*milliseconds* value under ~13 days from 1970
// (< 10^12) would misread as seconds. Neither is a timestamp any real
// system emits, so the tradeoff is deliberate.
const SECONDS_MS_CUTOFF = 1e12;

function isValidDate(date: Date): boolean {
  return Number.isFinite(date.getTime());
}

export function parseInstant(input: string): ParsedInstant | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;

  if (INTEGER.test(trimmed)) {
    const value = Number(trimmed);
    // A long enough run of digits overflows to Infinity before it ever
    // reaches a magnitude comparison or a Date -- this is exactly the
    // 1e400 shape of bug this widget exists to guard against, just spelled
    // as a plain integer instead of scientific notation. Must be checked
    // before anything below, which would otherwise happily propagate the
    // Infinity (or, downstream in relativeFromNow, throw on it).
    if (!Number.isFinite(value)) return null;

    const assumedUnit =
      Math.abs(value) < SECONDS_MS_CUTOFF ? "seconds" : "milliseconds";
    const ms = assumedUnit === "seconds" ? value * 1000 : value;

    const date = new Date(ms);
    if (!isValidDate(date)) return null;
    return { ms: date.getTime(), assumedUnit };
  }

  // Not a bare integer: "1e400", "Infinity", "NaN" and ordinary garbage all
  // land here too, and Date rejects every one of them as an Invalid Date
  // rather than throwing or coercing to NaN.
  const date = new Date(trimmed);
  if (!isValidDate(date)) return null;
  return { ms: date.getTime(), assumedUnit: "date-string" };
}
