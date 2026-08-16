/**
 * Formats mirror C#'s Guid.ToString() specifiers, since the audience for
 * this tool is a C# developer pasting output next to
 * Guid.NewGuid().ToString("N"): D is the canonical hyphenated form (also
 * the default), N strips hyphens, B wraps in braces, P wraps in
 * parentheses.
 */
export type GuidFormat = "D" | "N" | "B" | "P";

// A pasted count with a stray extra zero (or a hostile one) must not lock up
// the UI generating thousands of rows.
const MAX_COUNT = 100;

export function formatGuid(
  guid: string,
  format: GuidFormat,
  upper: boolean,
): string {
  const hyphenated = upper ? guid.toUpperCase() : guid;

  switch (format) {
    case "D":
      return hyphenated;
    case "N":
      return hyphenated.replaceAll("-", "");
    case "B":
      return `{${hyphenated}}`;
    case "P":
      return `(${hyphenated})`;
    default:
      return hyphenated;
  }
}

/**
 * Generates up to MAX_COUNT RFC 4122 v4 GUIDs via crypto.randomUUID(), a
 * CSPRNG available in every browser this app targets (both localhost and
 * https are secure contexts). Deliberately does not fall back to
 * Math.random(): a GUID that only *looks* random is worse than an error
 * here, since collisions from a weak PRNG would surface much later as data
 * bugs rather than immediately as a loud failure.
 */
export function generateGuids(
  count: number,
  format: GuidFormat,
  upper: boolean,
): string[] {
  if (
    typeof crypto === "undefined" ||
    typeof crypto.randomUUID !== "function"
  ) {
    throw new Error(
      "crypto.randomUUID is unavailable -- refusing to fall back to a non-cryptographic random source for GUIDs.",
    );
  }

  const clamped = Math.min(Math.max(count, 0), MAX_COUNT);
  return Array.from({ length: clamped }, () =>
    formatGuid(crypto.randomUUID(), format, upper),
  );
}
