import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { GuidGenerator } from "./guid-generator";

const count = () => screen.getByLabelText("Count");
const format = () => screen.getByLabelText("Format");
const uppercase = () => screen.getByLabelText("Uppercase");
const generateButton = () => screen.getByRole("button", { name: "Generate" });
const output = () => screen.getByLabelText("Output") as HTMLTextAreaElement;

const lines = (value: string) => (value === "" ? [] : value.split("\n"));

describe("GuidGenerator", () => {
  it("generates a GUID on mount, with no click required", () => {
    render(<GuidGenerator id={1} />);

    expect(lines(output().value).length).toBeGreaterThan(0);
  });

  it("produces a different value when Generate is clicked", async () => {
    const user = userEvent.setup();
    render(<GuidGenerator id={1} />);

    const before = output().value;
    await user.click(generateButton());

    expect(output().value).not.toBe(before);
  });

  it("produces as many lines as the count field asks for", async () => {
    const user = userEvent.setup();
    render(<GuidGenerator id={1} />);

    await user.clear(count());
    await user.type(count(), "5");
    await user.click(generateButton());

    expect(lines(output().value)).toHaveLength(5);
  });

  it("removes hyphens from the output when the format is switched to N", async () => {
    const user = userEvent.setup();
    render(<GuidGenerator id={1} />);

    await user.selectOptions(format(), "N");

    const rows = lines(output().value);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).not.toContain("-");
    }
  });

  it("uppercases the output when the uppercase toggle is checked", async () => {
    const user = userEvent.setup();
    render(<GuidGenerator id={1} />);

    await user.click(uppercase());

    const rows = lines(output().value);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).toBe(row.toUpperCase());
    }
  });

  it("does not crash and produces no output for a count of 0", async () => {
    const user = userEvent.setup();
    render(<GuidGenerator id={1} />);

    await user.clear(count());
    await user.type(count(), "0");
    await user.click(generateButton());

    expect(output().value).toBe("");
  });

  it("does not crash and produces no output for a non-numeric count", async () => {
    const user = userEvent.setup();
    render(<GuidGenerator id={1} />);

    await user.clear(count());
    await user.type(count(), "abc");
    await user.click(generateButton());

    expect(output().value).toBe("");
  });
});
