import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contentKey } from "@/components/use-persistent-state";
import { loadValue } from "@/lib/storage";
import { JwtDecoder } from "./jwt-decoder";

const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);

function makeToken(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
): string {
  const encode = (value: Record<string, unknown>) =>
    btoa(
      String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))),
    )
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
  return `${encode(header)}.${encode(payload)}.signature-bytes`;
}

const token = () => screen.getByLabelText("Token");
const header = () => screen.getByLabelText("Header") as HTMLTextAreaElement;
const payload = () => screen.getByLabelText("Payload") as HTMLTextAreaElement;

// The widget reads Date.now() to age its claims, so the clock is pinned.
// userEvent needs `advanceTimers` to make progress under fake timers —
// without it, setup() awaits a timeout that will never fire and every test
// in this file hangs.
const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

describe("JwtDecoder", () => {
  beforeEach(() => {
    // Faking only Date (not setTimeout/setInterval/etc.) pins Date.now()
    // for the relative-time assertions without also faking the timers
    // React's scheduler and user-event rely on internally — faking those
    // too makes every click/paste in this suite hang forever, timing out
    // at the test's default 5s even with `advanceTimers` wired up.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    // The token field now persists to sessionStorage (see below); starting
    // each test from an empty storage keeps them from reading a token a
    // previous test left behind.
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("decodes the header and payload", async () => {
    const user = setup();
    render(<JwtDecoder id={1} />);

    await user.click(token());
    await user.paste(makeToken({ alg: "HS256", typ: "JWT" }, { sub: "123" }));

    expect(JSON.parse(header().value)).toEqual({ alg: "HS256", typ: "JWT" });
    expect(JSON.parse(payload().value)).toEqual({ sub: "123" });
  });

  it("shows the algorithm in the status bar", async () => {
    const user = setup();
    render(<JwtDecoder id={1} />);

    await user.click(token());
    await user.paste(makeToken({ alg: "RS256" }, { sub: "1" }));

    expect(screen.getByText("alg: RS256")).toBeInTheDocument();
  });

  it("warns when the token has expired", async () => {
    const user = setup();
    render(<JwtDecoder id={1} />);

    await user.click(token());
    await user.paste(makeToken({ alg: "HS256" }, { exp: NOW / 1000 - 10_800 }));

    expect(screen.getByText("Token has expired.")).toBeInTheDocument();
    expect(screen.getByText(/3 hours ago/)).toBeInTheDocument();
  });

  it("does not warn when the token is still valid", async () => {
    const user = setup();
    render(<JwtDecoder id={1} />);

    await user.click(token());
    await user.paste(makeToken({ alg: "HS256" }, { exp: NOW / 1000 + 720 }));

    expect(screen.queryByText("Token has expired.")).not.toBeInTheDocument();
    expect(screen.getByText(/in 12 minutes/)).toBeInTheDocument();
  });

  it("shows the signature without claiming it was verified", async () => {
    const user = setup();
    render(<JwtDecoder id={1} />);

    await user.click(token());
    await user.paste(makeToken({ alg: "HS256" }, { sub: "1" }));

    expect(screen.getByText("Signature (not verified)")).toBeInTheDocument();
    expect(screen.getByDisplayValue("signature-bytes")).toBeInTheDocument();
  });

  it("reports an invalid token and clears both panes", async () => {
    const user = setup();
    render(<JwtDecoder id={1} />);

    await user.click(token());
    await user.paste(makeToken({ alg: "HS256" }, { sub: "1" }));
    expect(header().value).not.toBe("");

    await user.clear(token());
    await user.paste("not-a-token");

    expect(screen.getByText("Not a valid JWT.")).toBeInTheDocument();
    expect(header().value).toBe("");
    expect(payload().value).toBe("");
  });

  it("treats empty input as valid rather than an error", () => {
    render(<JwtDecoder id={1} />);

    expect(screen.queryByText("Not a valid JWT.")).not.toBeInTheDocument();
  });

  it("does not white-page on a non-finite time claim like exp:1e400", async () => {
    // JSON.stringify(Infinity) collapses to "null", which wouldn't reproduce
    // the bug, so the payload segment is base64url-encoded from raw JSON
    // text instead -- exactly how JSON.parse('{"exp":1e400}') produces
    // Infinity from a real (malformed) token.
    const encodeRaw = (json: string) =>
      btoa(String.fromCharCode(...new TextEncoder().encode(json)))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");
    const rawToken = `${encodeRaw('{"alg":"HS256"}')}.${encodeRaw('{"exp":1e400}')}.sig`;

    const user = setup();
    render(<JwtDecoder id={1} />);

    await user.click(token());
    await user.paste(rawToken);

    // The app must still be rendering the widget, not a white page.
    expect(screen.getByLabelText("Token")).toBeInTheDocument();
    expect(JSON.parse(payload().value)).toEqual({ exp: null });
  });
});

describe("JwtDecoder token persistence", () => {
  const secretToken = () =>
    makeToken({ alg: "HS256" }, { sub: "very-secret-subject" });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the token in sessionStorage and restores it after a remount", async () => {
    const user = setup();
    const secret = secretToken();
    const first = render(<JwtDecoder id={11} />);

    await user.click(token());
    await user.paste(secret);

    // pagehide is the same event a real reload fires; the hook's flush
    // handler saves synchronously on it instead of waiting out the
    // debounce, so there's no need to advance real time in this test.
    window.dispatchEvent(new Event("pagehide"));
    first.unmount();

    expect(loadValue(sessionStorage, contentKey(11, "token"), null)).toBe(
      secret,
    );

    render(<JwtDecoder id={11} />);
    expect(token()).toHaveValue(secret);
  });

  it("never writes the token into localStorage, under any key", async () => {
    const user = setup();
    const secret = secretToken();
    render(<JwtDecoder id={12} />);

    await user.click(token());
    await user.paste(secret);
    window.dispatchEvent(new Event("pagehide"));

    // Every key, not just contentKey(12, "token"): the point of this test
    // is to catch the token leaking under a *different* key, which a
    // narrower assertion would miss entirely.
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) ?? "";
      expect(localStorage.getItem(key)).not.toContain(secret);
    }
  });
});
