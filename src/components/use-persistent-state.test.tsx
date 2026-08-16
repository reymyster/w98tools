import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONTENT_TTL_MS, KEY_PREFIX, saveValue } from "@/lib/storage";
import {
  contentKey,
  dropWindowContent,
  sweepContent,
  usePersistentState,
} from "./use-persistent-state";

/** A real component using the hook, matching this repo's convention of
 * rendering real components in jsdom rather than testing hooks in
 * isolation. */
function TestField({
  windowID,
  field,
  initial = "",
}: {
  windowID: number;
  field: string;
  initial?: string;
}) {
  const [value, setValue] = usePersistentState(windowID, field, initial);
  return (
    <input
      aria-label={`${windowID}:${field}`}
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}

const fieldInput = (windowID: number, field: string) =>
  screen.getByLabelText(`${windowID}:${field}`);

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("contentKey", () => {
  it("namespaces by window id and field name", () => {
    expect(contentKey(3, "source")).toBe(`${KEY_PREFIX}content:3:source`);
  });
});

describe("usePersistentState", () => {
  it("is readable by a fresh mount after the debounced write settles", () => {
    const first = render(<TestField windowID={1} field="source" />);

    fireEvent.change(fieldInput(1, "source"), {
      target: { value: "hello" },
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    first.unmount();

    render(<TestField windowID={1} field="source" />);

    expect(fieldInput(1, "source")).toHaveValue("hello");
  });

  it("does not share a value between two windows with the same field name", () => {
    render(<TestField windowID={1} field="source" />);
    fireEvent.change(fieldInput(1, "source"), {
      target: { value: "window one" },
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    render(<TestField windowID={2} field="source" initial="untouched" />);

    expect(fieldInput(2, "source")).toHaveValue("untouched");
  });

  it("does not share a value between two fields in the same window", () => {
    render(<TestField windowID={1} field="find" />);
    fireEvent.change(fieldInput(1, "find"), {
      target: { value: "needle" },
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    render(<TestField windowID={1} field="replace" initial="untouched" />);

    expect(fieldInput(1, "replace")).toHaveValue("untouched");
  });

  it("ignores a value older than CONTENT_TTL_MS in favour of the initial value", () => {
    // Written directly with an old savedAt, not via mocking the clock.
    saveValue(
      localStorage,
      contentKey(1, "source"),
      "stale",
      Date.now() - CONTENT_TTL_MS - 1000,
    );

    render(<TestField windowID={1} field="source" initial="fresh default" />);

    expect(fieldInput(1, "source")).toHaveValue("fresh default");
  });

  it("falls back to the initial value when stored content is malformed", () => {
    localStorage.setItem(contentKey(1, "source"), "{not valid json");

    render(<TestField windowID={1} field="source" initial="fallback" />);

    expect(fieldInput(1, "source")).toHaveValue("fallback");
  });
});

describe("dropWindowContent", () => {
  it("removes every field for that window and leaves other windows alone", () => {
    saveValue(localStorage, contentKey(1, "source"), "a");
    saveValue(localStorage, contentKey(1, "find"), "b");
    saveValue(localStorage, contentKey(2, "source"), "c");

    dropWindowContent(1);

    expect(localStorage.getItem(contentKey(1, "source"))).toBeNull();
    expect(localStorage.getItem(contentKey(1, "find"))).toBeNull();
    expect(localStorage.getItem(contentKey(2, "source"))).not.toBeNull();
  });

  // Regression guard: window 3's content once shared the numeric prefix
  // "w98:content:3" with window 30's, so a naive startsWith check without a
  // trailing separator would have deleted window 30's content too.
  it("does not touch a window whose id shares a numeric prefix", () => {
    saveValue(localStorage, contentKey(3, "source"), "three");
    saveValue(localStorage, contentKey(30, "source"), "thirty");

    dropWindowContent(3);

    expect(localStorage.getItem(contentKey(3, "source"))).toBeNull();
    expect(localStorage.getItem(contentKey(30, "source"))).not.toBeNull();
  });
});

describe("sweepContent", () => {
  it("removes content for window ids that are not in the live list", () => {
    saveValue(localStorage, contentKey(1, "source"), "a");
    saveValue(localStorage, contentKey(2, "source"), "b");
    saveValue(localStorage, contentKey(3, "source"), "c");

    sweepContent([2]);

    expect(localStorage.getItem(contentKey(1, "source"))).toBeNull();
    expect(localStorage.getItem(contentKey(2, "source"))).not.toBeNull();
    expect(localStorage.getItem(contentKey(3, "source"))).toBeNull();
  });

  it("also purges expired content for a window id that is still live", () => {
    saveValue(
      localStorage,
      contentKey(1, "source"),
      "old",
      Date.now() - CONTENT_TTL_MS - 1000,
    );

    sweepContent([1]);

    expect(localStorage.getItem(contentKey(1, "source"))).toBeNull();
  });

  it("clears every content key when the live list is empty", () => {
    saveValue(localStorage, contentKey(1, "source"), "a");
    saveValue(localStorage, contentKey(2, "source"), "b");

    sweepContent([]);

    expect(localStorage.getItem(contentKey(1, "source"))).toBeNull();
    expect(localStorage.getItem(contentKey(2, "source"))).toBeNull();
  });
});
