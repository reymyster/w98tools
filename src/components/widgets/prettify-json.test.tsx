import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PrettifyJson } from "./prettify-json";

const source = () => screen.getByLabelText("Original");
const output = () => screen.getByLabelText("Formatted") as HTMLTextAreaElement;

describe("PrettifyJson", () => {
  it("formats valid JSON", async () => {
    const user = userEvent.setup();
    render(<PrettifyJson id={1} />);

    await user.type(source(), '{{"a":1}');

    expect(JSON.parse(output().value)).toEqual({ a: 1 });
    expect(screen.queryByText("Invalid JSON.")).not.toBeInTheDocument();
  });

  it("reports invalid JSON and clears the output", async () => {
    // This is a deliberate behaviour choice, not an accident: the widget used
    // to leave the last successful result on screen next to an error, which
    // read as though the broken input had parsed.
    const user = userEvent.setup();
    render(<PrettifyJson id={1} />);

    await user.type(source(), '{{"a":1}');
    expect(output().value).not.toBe("");

    await user.type(source(), "!");

    expect(screen.getByText("Invalid JSON.")).toBeInTheDocument();
    expect(output().value).toBe("");
  });

  it("treats empty input as valid rather than an error", () => {
    render(<PrettifyJson id={1} />);

    expect(output().value).toBe("");
    expect(screen.queryByText("Invalid JSON.")).not.toBeInTheDocument();
  });
});
