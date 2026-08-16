import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "./timestamp";

const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);

const input = () => screen.getByLabelText("Timestamp") as HTMLInputElement;
const nowButton = () => screen.getByRole("button", { name: "Now" });
const local = () => screen.getByLabelText("Local") as HTMLInputElement;
const utc = () => screen.getByLabelText("UTC") as HTMLInputElement;
const iso = () => screen.getByLabelText("ISO 8601") as HTMLInputElement;
const epochSeconds = () =>
  screen.getByLabelText("Epoch (seconds)") as HTMLInputElement;
const epochMs = () =>
  screen.getByLabelText("Epoch (milliseconds)") as HTMLInputElement;

// The widget reads Date.now() for both the Now button and the relative
// phrase, so the clock is pinned. Faking only Date (not setTimeout etc.)
// keeps React's scheduler and user-event's own timers running -- faking
// everything hangs userEvent indefinitely (see CLAUDE.md / jwt-decoder.test.tsx).
const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

describe("Timestamp", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows local, UTC, ISO and both epoch forms for a 10-digit input", async () => {
    const user = setup();
    render(<Timestamp id={1} />);

    await user.type(input(), "1700000000");

    expect(local().value).not.toBe("");
    expect(utc().value).toBe("Tue, 14 Nov 2023 22:13:20 GMT");
    expect(iso().value).toBe("2023-11-14T22:13:20.000Z");
    expect(epochSeconds().value).toBe("1700000000");
    expect(epochMs().value).toBe("1700000000000");
  });

  it("states that a 10-digit input was assumed to be seconds", async () => {
    const user = setup();
    render(<Timestamp id={1} />);

    await user.type(input(), "1700000000");

    expect(screen.getByText(/assumed.*seconds/i)).toBeInTheDocument();
  });

  it("states that a 13-digit input was assumed to be milliseconds", async () => {
    const user = setup();
    render(<Timestamp id={1} />);

    await user.type(input(), "1700000000000");

    expect(screen.getByText(/assumed.*milliseconds/i)).toBeInTheDocument();
  });

  it("shows the matching epoch values for an ISO 8601 string", async () => {
    const user = setup();
    render(<Timestamp id={1} />);

    await user.type(input(), "2026-01-01T00:00:00.000Z");

    expect(epochSeconds().value).toBe("1767225600");
    expect(epochMs().value).toBe("1767225600000");
    expect(screen.getByText(/assumed.*date string/i)).toBeInTheDocument();
  });

  it("shows an error and clears the outputs for invalid input", async () => {
    const user = setup();
    render(<Timestamp id={1} />);

    await user.type(input(), "not a date");

    expect(screen.getByText(/invalid/i)).toBeInTheDocument();
    expect(local().value).toBe("");
    expect(utc().value).toBe("");
    expect(iso().value).toBe("");
    expect(epochSeconds().value).toBe("");
    expect(epochMs().value).toBe("");
  });

  it("treats empty input as valid rather than an error", () => {
    render(<Timestamp id={1} />);

    expect(screen.queryByText(/invalid/i)).not.toBeInTheDocument();
  });

  it("fills in the current time when Now is clicked", async () => {
    const user = setup();
    render(<Timestamp id={1} />);

    await user.click(nowButton());

    expect(input().value).toBe(String(NOW));
    expect(epochMs().value).toBe(String(NOW));
  });

  it("does not crash on a 1e400 input", async () => {
    const user = setup();
    render(<Timestamp id={1} />);

    await user.type(input(), "1e400");

    // The app must still be rendering the widget, not a white page.
    expect(screen.getByLabelText("Timestamp")).toBeInTheDocument();
    expect(screen.getByText(/invalid/i)).toBeInTheDocument();
    expect(epochMs().value).toBe("");
  });
});
