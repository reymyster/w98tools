import { render, screen } from "@testing-library/react";
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
});
