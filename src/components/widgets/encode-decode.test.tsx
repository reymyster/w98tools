import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { EncodeDecode } from "./encode-decode";

const source = () => screen.getByLabelText("Input");
const output = () => screen.getByLabelText("Output") as HTMLTextAreaElement;
const scheme = () => screen.getByLabelText("Scheme");
const encodeRadio = () => screen.getByLabelText("Encode");
const decodeRadio = () => screen.getByLabelText("Decode");

describe("EncodeDecode", () => {
  it("encodes typed text with Encode selected", async () => {
    const user = userEvent.setup();
    render(<EncodeDecode id={1} />);

    await user.type(source(), "hello");

    expect(output().value).toBe("aGVsbG8=");
  });

  it("reverses the conversion when switching to Decode", async () => {
    const user = userEvent.setup();
    render(<EncodeDecode id={1} />);

    await user.type(source(), "aGVsbG8=");
    await user.click(decodeRadio());

    expect(output().value).toBe("hello");
  });

  it("re-runs the conversion on the existing input when the scheme changes", async () => {
    const user = userEvent.setup();
    render(<EncodeDecode id={1} />);

    await user.type(source(), "hello world");
    expect(output().value).toBe("aGVsbG8gd29ybGQ=");

    await user.selectOptions(scheme(), "url-component");

    expect(output().value).toBe("hello%20world");
  });

  it("shows an error and clears the output for malformed input in Decode mode", async () => {
    const user = userEvent.setup();
    render(<EncodeDecode id={1} />);

    await user.click(decodeRadio());
    await user.type(source(), "!!!");

    expect(screen.getByText(/invalid/i)).toBeInTheDocument();
    expect(output().value).toBe("");
  });

  it("treats empty input as valid rather than an error", () => {
    render(<EncodeDecode id={1} />);

    expect(output().value).toBe("");
    expect(screen.queryByText(/invalid/i)).not.toBeInTheDocument();
  });

  it("defaults to Encode selected", () => {
    render(<EncodeDecode id={1} />);

    expect(encodeRadio()).toBeChecked();
    expect(decodeRadio()).not.toBeChecked();
  });
});
