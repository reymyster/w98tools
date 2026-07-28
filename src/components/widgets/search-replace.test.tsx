import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SearchReplace } from "./search-replace";

const output = () =>
  screen.getByLabelText("Output Text") as HTMLTextAreaElement;

describe("SearchReplace", () => {
  it("replaces every occurrence, not just the first", async () => {
    const user = userEvent.setup();
    render(<SearchReplace id={1} />);

    await user.type(screen.getByLabelText("Source Text"), "a b a b a");
    await user.type(screen.getByLabelText("Find"), "a");
    await user.type(screen.getByLabelText("Replace"), "X");

    expect(output().value).toBe("X b X b X");
  });

  it("passes the source through untouched while Find is empty", async () => {
    const user = userEvent.setup();
    render(<SearchReplace id={1} />);

    await user.type(screen.getByLabelText("Source Text"), "untouched");

    expect(output().value).toBe("untouched");
  });

  it("deletes matches when Replace is left empty", async () => {
    const user = userEvent.setup();
    render(<SearchReplace id={1} />);

    await user.type(screen.getByLabelText("Source Text"), "keep-drop-keep");
    await user.type(screen.getByLabelText("Find"), "drop");

    expect(output().value).toBe("keep--keep");
  });

  it("treats Find as a literal string rather than a regular expression", async () => {
    const user = userEvent.setup();
    render(<SearchReplace id={1} />);

    await user.type(screen.getByLabelText("Source Text"), "a.b axb");
    await user.type(screen.getByLabelText("Find"), ".");
    await user.type(screen.getByLabelText("Replace"), "!");

    // A regex "." would have replaced every character.
    expect(output().value).toBe("a!b axb");
  });
});
