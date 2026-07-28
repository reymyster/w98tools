import { describe, expect, it } from "vitest";
import { parseInput } from "./parse";

describe("parseInput", () => {
  it("splits plain text into paragraphs on blank lines", async () => {
    const nodes = await parseInput("one\n\ntwo", "text");
    expect(nodes).toEqual([
      { kind: "paragraph", runs: [{ text: "one" }] },
      { kind: "paragraph", runs: [{ text: "two" }] },
    ]);
  });

  it("does not interpret markdown syntax in plain text mode", async () => {
    const nodes = await parseInput("# not a heading", "text");
    expect(nodes).toEqual([
      { kind: "paragraph", runs: [{ text: "# not a heading" }] },
    ]);
  });

  it("routes markdown and html to their parsers", async () => {
    expect((await parseInput("# H", "markdown"))[0]).toMatchObject({
      kind: "heading",
    });
    expect((await parseInput("<h1>H</h1>", "html"))[0]).toMatchObject({
      kind: "heading",
    });
  });

  it("falls back to plain text when html yields nothing", async () => {
    const nodes = await parseInput("<<<", "html");
    expect(nodes.length).toBeGreaterThan(0);
  });

  it("falls back to plain text when html parses to no visible content (comment-only)", async () => {
    // parseHtml("<div><!-- comment only --></div>") returns [] since a
    // comment carries no visible text -- this is the real path that
    // exercises the `nodes.length > 0 ? nodes : parseText(input)` fallback
    // in parseInput; "<<<" (the previous test) actually parses to a
    // paragraph containing the literal text and never touches the
    // fallback branch at all.
    const input = "<div><!-- comment only --></div>";
    const nodes = await parseInput(input, "html");
    expect(nodes).toEqual([{ kind: "paragraph", runs: [{ text: input }] }]);
  });
});
