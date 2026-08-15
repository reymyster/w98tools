import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { JsonToTypes } from "./json-to-types";

const source = () => screen.getByLabelText("JSON");
const output = () => screen.getByLabelText("Generated") as HTMLTextAreaElement;
const language = () => screen.getByLabelText("Language");
const rootName = () => screen.getByLabelText("Root type name");

describe("JsonToTypes", () => {
  it("generates a C# record by default", async () => {
    const user = userEvent.setup();
    render(<JsonToTypes id={1} />);

    await user.click(source());
    await user.paste('{"name":"x"}');

    expect(output().value).toContain("public record Root");
    expect(output().value).toContain("{ get; init; }");
  });

  it("switches to classes when the class radio is chosen", async () => {
    const user = userEvent.setup();
    render(<JsonToTypes id={1} />);

    await user.click(source());
    await user.paste('{"name":"x"}');
    await user.click(screen.getByLabelText("class"));

    expect(output().value).toContain("public class Root");
    expect(output().value).toContain("{ get; set; }");
  });

  it("generates TypeScript interfaces", async () => {
    const user = userEvent.setup();
    render(<JsonToTypes id={1} />);

    await user.click(source());
    await user.paste('{"name":"x"}');
    await user.selectOptions(language(), "typescript");

    expect(output().value).toContain("export interface Root {");
    expect(output().value).toContain("name: string;");
  });

  it("disables the record and class radios for TypeScript", async () => {
    const user = userEvent.setup();
    render(<JsonToTypes id={1} />);

    await user.selectOptions(language(), "typescript");

    expect(screen.getByLabelText("record")).toBeDisabled();
    expect(screen.getByLabelText("class")).toBeDisabled();
  });

  it("names the root type from the root name field", async () => {
    const user = userEvent.setup();
    render(<JsonToTypes id={1} />);

    await user.click(source());
    await user.paste('{"name":"x"}');
    await user.clear(rootName());
    await user.type(rootName(), "Person");

    expect(output().value).toContain("public record Person");
  });

  it("reports invalid JSON and clears the output", async () => {
    const user = userEvent.setup();
    render(<JsonToTypes id={1} />);

    await user.click(source());
    await user.paste('{"name":"x"}');
    expect(output().value).not.toBe("");

    await user.paste("!");

    expect(screen.getByText("Invalid JSON.")).toBeInTheDocument();
    expect(output().value).toBe("");
  });

  it("reports a scalar root", async () => {
    const user = userEvent.setup();
    render(<JsonToTypes id={1} />);

    await user.click(source());
    await user.paste("42");

    expect(
      screen.getByText("Root must be an object or array of objects."),
    ).toBeInTheDocument();
    expect(output().value).toBe("");
  });

  it("treats empty input as valid rather than an error", () => {
    render(<JsonToTypes id={1} />);

    expect(output().value).toBe("");
    expect(screen.queryByText("Invalid JSON.")).not.toBeInTheDocument();
  });

  it("reports an error instead of crashing on deeply nested JSON", async () => {
    // inferValue recurses per level of nesting; deep enough input blows the
    // call stack (RangeError). JSON.parse itself handles this depth fine, so
    // only the inference/emission step throws -- there is no error boundary
    // anywhere in the app, so an uncaught throw here unmounts the whole tree.
    const depth = 5000;
    const deeplyNested = `${'{"a":'.repeat(depth)}1${"}".repeat(depth)}`;

    const user = userEvent.setup();
    render(<JsonToTypes id={1} />);

    await user.click(source());
    await user.paste(deeplyNested);

    // The widget must still be on screen, with the output cleared and a
    // status message shown -- not a white page.
    expect(screen.getByLabelText("JSON")).toBeInTheDocument();
    expect(output().value).toBe("");
    expect(
      screen.getByText("JSON is too deeply nested to convert."),
    ).toBeInTheDocument();
  });

  it("keeps radio groups and element ids independent across two open windows", async () => {
    // `name` on a radio input is document-global, so two windows hardcoding
    // the same name put all four radios in ONE group -- at most one radio
    // can be checked across the whole document.
    const user = userEvent.setup();
    const { container } = render(
      <>
        <JsonToTypes id={1} />
        <JsonToTypes id={2} />
      </>,
    );

    const windows = container.querySelectorAll(".window");
    expect(windows).toHaveLength(2);
    const [first, second] = Array.from(windows) as HTMLElement[];

    await user.click(within(second).getByLabelText("JSON"));
    await user.paste('{"name":"x"}');
    await user.click(within(second).getByLabelText("class"));

    // The second window's own radio reflects the click...
    expect(within(second).getByLabelText("class")).toBeChecked();
    expect(within(second).getByLabelText("record")).not.toBeChecked();
    // ...and its output actually matches what shows as selected.
    expect(
      (within(second).getByLabelText("Generated") as HTMLTextAreaElement).value,
    ).toContain("public class Root");

    // The first window is untouched, still on the default "record" radio.
    expect(within(first).getByLabelText("record")).toBeChecked();
    expect(within(first).getByLabelText("class")).not.toBeChecked();

    // No duplicate element ids anywhere in the document.
    const ids = Array.from(container.querySelectorAll("[id]")).map(
      (el) => el.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});
