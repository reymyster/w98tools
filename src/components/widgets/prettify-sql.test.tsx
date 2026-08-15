import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PrettifySql } from "./prettify-sql";

const source = () => screen.getByLabelText("Original");
const output = () => screen.getByLabelText("Formatted") as HTMLTextAreaElement;

describe("PrettifySql", () => {
  it("formats a statement and uppercases keywords", async () => {
    const user = userEvent.setup();
    render(<PrettifySql id={1} />);

    await user.type(source(), "select a, b from t where a = 1");

    await waitFor(() => expect(output().value).toContain("SELECT"));
    expect(output().value).toContain("FROM");
    expect(output().value).toContain("WHERE");
  });

  it("indents with four spaces", async () => {
    const user = userEvent.setup();
    render(<PrettifySql id={1} />);

    await user.type(source(), "select a, b from t");

    await waitFor(() => expect(output().value).toContain("SELECT"));
    expect(output().value).toMatch(/\n {4}\S/);
  });

  it("reports the formatter is loading before it arrives", () => {
    render(<PrettifySql id={1} />);

    expect(screen.getByText("Loading formatter…")).toBeInTheDocument();
  });

  it("treats empty input as valid rather than an error", async () => {
    render(<PrettifySql id={1} />);

    await waitFor(() =>
      expect(screen.queryByText("Loading formatter…")).not.toBeInTheDocument(),
    );
    expect(output().value).toBe("");
    expect(screen.queryByText("Invalid SQL.")).not.toBeInTheDocument();
  });
});
