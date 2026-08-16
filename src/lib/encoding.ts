/**
 * Base64 / URL encoding and decoding for the Base64 & URL widget.
 *
 * `btoa`/`atob` operate on a "binary string" (one code unit per byte, 0-255)
 * and throw on anything above U+00FF, so a naive `btoa(text)` breaks on any
 * non-ASCII character. Every scheme here instead round-trips through
 * `TextEncoder`/`TextDecoder` so text stays UTF-8 safe -- the same approach
 * `src/lib/jwt.ts`'s `decodeSegment` already uses, including padding
 * base64url back out before handing it to `atob`.
 */

export type Scheme = "base64" | "base64url" | "url-component" | "url-full";

/** text -> UTF-8 bytes -> binary string -> btoa. */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** atob -> bytes -> TextDecoder, rather than treating the decoded bytes as
 * Latin-1, so multi-byte UTF-8 characters survive intact. */
function fromBase64(base64: string): string {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function toBase64Url(text: string): string {
  return toBase64(text)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

/** Re-pads to a multiple of 4 before delegating to fromBase64 -- base64url
 * output carries no padding, but atob requires it. */
function fromBase64Url(base64url: string): string {
  const base64 = base64url.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return fromBase64(padded);
}

export function encode(text: string, scheme: Scheme): string {
  switch (scheme) {
    case "base64":
      return toBase64(text);
    case "base64url":
      return toBase64Url(text);
    case "url-component":
      return encodeURIComponent(text);
    case "url-full":
      return encodeURI(text);
  }
}

/**
 * Throws on malformed input: `atob` throws a DOMException on invalid
 * base64, and `decodeURIComponent`/`decodeURI` throw a URIError on a
 * malformed `%` escape. Left uncaught deliberately -- the caller (the
 * widget) is the one that knows how to report a bad paste.
 */
export function decode(text: string, scheme: Scheme): string {
  switch (scheme) {
    case "base64":
      return fromBase64(text);
    case "base64url":
      return fromBase64Url(text);
    case "url-component":
      return decodeURIComponent(text);
    case "url-full":
      return decodeURI(text);
  }
}
