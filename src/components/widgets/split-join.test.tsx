import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SplitJoin } from "./split-join";

const source = () => screen.getByLabelText("Source Text");
const output = () =>
  screen.getByLabelText("Output Text") as HTMLTextAreaElement;
const splitBy = () => screen.getByLabelText("Split by");
const joinWith = () => screen.getByLabelText("Join with");
const quote = () => screen.getByLabelText("Quote each item");

describe("SplitJoin", () => {
  it("turns a column of ids into a comma-joined list", async () => {
    const user = userEvent.setup();
    render(<SplitJoin id={1} />);

    await user.type(source(), "1{enter}2{enter}3");
    await user.selectOptions(joinWith(), "comma");

    expect(output().value).toBe("1,2,3");
  });

  it("quotes items T-SQL style, doubling embedded quotes", async () => {
    const user = userEvent.setup();
    render(<SplitJoin id={1} />);

    await user.type(source(), "O'Brien{enter}Smith");
    await user.selectOptions(joinWith(), "comma");
    await user.click(quote());

    expect(output().value).toBe("'O''Brien','Smith'");
  });

  it("splits a comma list back into lines", async () => {
    const user = userEvent.setup();
    render(<SplitJoin id={1} />);

    await user.type(source(), "a, b, c");
    await user.selectOptions(splitBy(), "comma");

    expect(output().value).toBe("a\nb\nc");
  });

  it("trims items and drops empty ones", async () => {
    const user = userEvent.setup();
    render(<SplitJoin id={1} />);

    await user.type(source(), "  1  {enter}{enter}   {enter}2");
    await user.selectOptions(joinWith(), "comma");

    expect(output().value).toBe("1,2");
  });

  it("splits on a custom delimiter taken literally", async () => {
    const user = userEvent.setup();
    render(<SplitJoin id={1} />);

    await user.selectOptions(splitBy(), "custom");
    await user.type(screen.getByLabelText("Custom split delimiter"), "|");
    await user.type(source(), "a|b|c");
    await user.selectOptions(joinWith(), "comma");

    expect(output().value).toBe("a,b,c");
  });

  it("treats the whole input as one item when the custom delimiter is empty", async () => {
    const user = userEvent.setup();
    render(<SplitJoin id={1} />);

    await user.selectOptions(splitBy(), "custom");
    await user.type(source(), "a,b");

    expect(output().value).toBe("a,b");
  });

  it("counts the items it produced", async () => {
    const user = userEvent.setup();
    render(<SplitJoin id={1} />);

    await user.type(source(), "1{enter}2{enter}3");

    expect(screen.getByText("Items: 3")).toBeInTheDocument();
  });
});
