import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PdfExport } from "./pdf-export";

vi.mock("@/lib/pdf/generate", () => ({
  generatePdfBlob: vi.fn(
    async () => new Blob(["%PDF-1.7"], { type: "application/pdf" }),
  ),
}));

beforeEach(() => {
  globalThis.URL.createObjectURL = vi.fn(() => "blob:preview");
  globalThis.URL.revokeObjectURL = vi.fn();
});

describe("PdfExport", () => {
  it("disables download while there is no input", () => {
    render(<PdfExport id={1} />);
    expect(
      screen.getByRole("button", { name: /download pdf/i }),
    ).toBeDisabled();
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
});
