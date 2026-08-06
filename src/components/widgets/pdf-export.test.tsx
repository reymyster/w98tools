import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdfExport } from "./pdf-export";

vi.mock("@/lib/pdf/generate", () => ({
  generatePdfBlob: vi.fn(
    async () => new Blob(["%PDF-1.7"], { type: "application/pdf" }),
  ),
}));

beforeEach(() => {
  // Clears call history (including any left behind by a previous test) on
  // every mock, generatePdfBlob included -- without this, an assertion like
  // "toHaveBeenCalled()" can pass on a call a *different* test made.
  vi.clearAllMocks();
  globalThis.URL.createObjectURL = vi.fn(() => "blob:preview");
  globalThis.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  // jsdom doesn't implement these at all, so "restoring" means removing the
  // stubs entirely rather than reinstating an original -- otherwise the last
  // test's fake stays installed as a global for every test file that runs
  // after this one.
  // @ts-expect-error -- deleting to restore jsdom's true (unimplemented) baseline
  delete globalThis.URL.createObjectURL;
  // @ts-expect-error -- same as above
  delete globalThis.URL.revokeObjectURL;
});

describe("PdfExport", () => {
  it("disables download while there is no input", () => {
    render(<PdfExport id={1} />);
    expect(
      screen.getByRole("button", { name: /download pdf/i }),
    ).toBeDisabled();
  });

  it("defaults the page size to A4", () => {
    render(<PdfExport id={1} />);
    expect(screen.getByLabelText(/page/i)).toHaveValue("a4");
  });

  it("shows the detected format and enables download once there is content", async () => {
    const user = userEvent.setup();
    render(<PdfExport id={1} />);

    await user.type(screen.getByLabelText(/content/i), "# Hello");

    await waitFor(() => {
      expect(screen.getByLabelText(/format/i)).toHaveValue("markdown");
      expect(
        screen.getByRole("button", { name: /download pdf/i }),
      ).toBeEnabled();
    });
  });

  it("lets the user override the detected format", async () => {
    const user = userEvent.setup();
    render(<PdfExport id={1} />);

    await user.type(screen.getByLabelText(/content/i), "# Hello");
    await waitFor(() =>
      expect(screen.getByLabelText(/format/i)).toHaveValue("markdown"),
    );

    await user.selectOptions(screen.getByLabelText(/format/i), "text");
    expect(screen.getByLabelText(/format/i)).toHaveValue("text");

    // The override must survive further typing.
    await user.type(screen.getByLabelText(/content/i), "\n\nmore");
    await waitFor(() =>
      expect(screen.getByLabelText(/format/i)).toHaveValue("text"),
    );
  });

  it("generates a preview from the input", async () => {
    const { generatePdfBlob } = await import("@/lib/pdf/generate");
    const user = userEvent.setup();
    render(<PdfExport id={1} />);

    await user.type(screen.getByLabelText(/content/i), "hello");

    await waitFor(() => expect(generatePdfBlob).toHaveBeenCalled());
  });

  it("revokes the orphaned preview URL when the input is cleared", async () => {
    const user = userEvent.setup();
    render(<PdfExport id={1} />);

    const textarea = screen.getByLabelText(/content/i);
    await user.type(textarea, "hello");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /download pdf/i }),
      ).toBeEnabled(),
    );

    await user.clear(textarea);

    await waitFor(() =>
      expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith(
        "blob:preview",
      ),
    );
  });

  it("disables download after the input has been cleared, even though a preview was already generated", async () => {
    const user = userEvent.setup();
    render(<PdfExport id={1} />);

    const textarea = screen.getByLabelText(/content/i);
    await user.type(textarea, "hello");

    const downloadButton = screen.getByRole("button", {
      name: /download pdf/i,
    });
    await waitFor(() => expect(downloadButton).toBeEnabled());

    await user.clear(textarea);

    await waitFor(() => expect(downloadButton).toBeDisabled());
  });

  // Finding 1: a generation failure after a good preview left the old
  // iframe up with no visible error, and Download kept emitting the
  // superseded blob.
  it("clears the stale preview and disables download when a later generation fails, and shows the error", async () => {
    const { generatePdfBlob } = await import("@/lib/pdf/generate");
    const user = userEvent.setup();
    render(<PdfExport id={1} />);

    const textarea = screen.getByLabelText(/content/i);
    const downloadButton = screen.getByRole("button", {
      name: /download pdf/i,
    });

    await user.type(textarea, "hello");
    await waitFor(() => expect(downloadButton).toBeEnabled());

    vi.mocked(generatePdfBlob).mockRejectedValueOnce(new Error("boom"));
    await user.type(textarea, " world");

    await waitFor(() => expect(downloadButton).toBeDisabled());
    expect(screen.getByText("boom")).toBeInTheDocument();
    // The stale iframe must be gone, not just covered up -- Download has
    // nothing left to emit.
    expect(screen.queryByTitle("PDF preview")).not.toBeInTheDocument();
  });

  // Finding 3: clearing the textarea mid-debounce never reset `busy`,
  // leaving "Building PDF..." on screen forever with no generation pending.
  it("stops showing the busy indicator when the input is cleared before the debounce fires", async () => {
    const user = userEvent.setup();
    render(<PdfExport id={1} />);

    const textarea = screen.getByLabelText(/content/i);
    await user.type(textarea, "hello");
    expect(screen.getByText(/building pdf/i)).toBeInTheDocument();

    await user.clear(textarea);

    await waitFor(() =>
      expect(screen.queryByText(/building pdf/i)).not.toBeInTheDocument(),
    );
  });

  // Finding 4: pasting rich content replaced the whole textarea instead of
  // the selected range, and forced the format to HTML even when the
  // document wasn't empty beforehand.
  it("inserts pasted rich content at the caret instead of replacing the whole document, and leaves an existing format choice alone", async () => {
    const user = userEvent.setup();
    render(<PdfExport id={1} />);

    const textarea = screen.getByLabelText(/content/i) as HTMLTextAreaElement;
    const formatSelect = screen.getByLabelText(/format/i);

    await user.type(textarea, "My notes so far.");
    await waitFor(() => expect(formatSelect).toHaveValue("text"));

    // "<b>" isn't one of detectFormat's block tags, so any format change
    // below can only be the paste handler's override, not auto-detection.
    fireEvent.paste(textarea, {
      clipboardData: {
        getData: (type: string) => (type === "text/html" ? "<b>bold</b>" : ""),
      },
    });

    await waitFor(() =>
      expect(textarea.value).toBe("My notes so far.<b>bold</b>"),
    );
    expect(formatSelect).toHaveValue("text");
  });

  // Finding 6: the format override was meant to stick "until the input is
  // cleared" (design spec), but nothing ever reset it -- so it kept
  // overriding auto-detection even after the field went back to empty.
  it("resets a format override once the input is cleared", async () => {
    const user = userEvent.setup();
    render(<PdfExport id={1} />);

    const textarea = screen.getByLabelText(/content/i);
    const formatSelect = screen.getByLabelText(/format/i);

    await user.type(textarea, "# Hello");
    await waitFor(() => expect(formatSelect).toHaveValue("markdown"));

    await user.selectOptions(formatSelect, "text");
    expect(formatSelect).toHaveValue("text");

    await user.clear(textarea);
    // A fresh markdown-shaped input reverting to "markdown" (rather than
    // staying stuck on "text") is the only way to observe that the override
    // itself was cleared, since detectFormat("") is "text" either way.
    await user.type(textarea, "# New heading");

    await waitFor(() => expect(formatSelect).toHaveValue("markdown"));
  });

  // Finding 7: non-Latin-1 text (Japanese, Cyrillic, emoji, ...) silently
  // renders as the wrong glyph -- no throw, no warning. The standard-14
  // Times font isn't being swapped out, so the fix is a visible, non-
  // blocking warning instead.
  it("shows a non-blocking warning for characters outside the Latin-1 range", async () => {
    const user = userEvent.setup();
    render(<PdfExport id={1} />);

    const textarea = screen.getByLabelText(/content/i);
    await user.type(textarea, "日本語 text");

    await waitFor(() => expect(screen.getByText(/latin-1/i)).toBeVisible());
    // Generation and download must proceed regardless of the warning.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /download pdf/i }),
      ).toBeEnabled(),
    );
  });
});
