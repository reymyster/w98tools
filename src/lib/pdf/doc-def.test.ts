import { describe, expect, it } from "vitest";
import { buildDocDefinition, resolveTitle } from "./doc-def";
import type { DocNode, PdfOptions } from "./types";

const options: PdfOptions = {
  pageSize: "device",
  margin: "normal",
  title: "Doc",
};
const heading: DocNode = {
  kind: "heading",
  level: 1,
  runs: [{ text: "Title" }],
};

describe("buildDocDefinition", () => {
  it("uses the device page size by default", () => {
    const def = buildDocDefinition([heading], options);
    expect(def.pageSize).toEqual({ width: 447, height: 596 });
  });

  it("supports A4 and Letter", () => {
    expect(
      buildDocDefinition([], { ...options, pageSize: "a4" }).pageSize,
    ).toBe("A4");
    expect(
      buildDocDefinition([], { ...options, pageSize: "letter" }).pageSize,
    ).toBe("LETTER");
  });

  it("gives the wideOuter margin a roomy right column", () => {
    const def = buildDocDefinition([], { ...options, margin: "wideOuter" });
    const [left, , right] = def.pageMargins as [number, number, number, number];
    expect(right).toBeGreaterThan(left * 2);
  });

  it("sets Times at 11pt as the default style", () => {
    const def = buildDocDefinition([heading], options);
    expect(def.defaultStyle).toMatchObject({ font: "Times", fontSize: 11 });
  });

  it("emits a header and a footer when a title is present", () => {
    const def = buildDocDefinition([heading], options);
    expect(typeof def.header).toBe("function");
    expect(typeof def.footer).toBe("function");
  });

  it("omits the header when the title is empty", () => {
    const def = buildDocDefinition([heading], { ...options, title: "" });
    expect(def.header).toBeUndefined();
    expect(typeof def.footer).toBe("function");
  });

  it("numbers pages in the footer", () => {
    const def = buildDocDefinition([heading], options);
    const footer = def.footer as (c: number, t: number) => { text: string };
    expect(footer(2, 5).text).toContain("2");
    expect(footer(2, 5).text).toContain("5");
  });

  it("renders headings larger and bolder than body text", () => {
    const def = buildDocDefinition([heading], options);
    const content = def.content as { style?: string }[];
    expect(content[0].style).toBe("h1");
    expect(def.styles?.h1).toMatchObject({ bold: true });
  });
});

describe("resolveTitle", () => {
  it("prefers the first heading", () => {
    expect(resolveTitle([heading], "file.md")).toBe("Title");
  });

  it("falls back to the supplied name", () => {
    expect(
      resolveTitle([{ kind: "paragraph", runs: [{ text: "x" }] }], "file.md"),
    ).toBe("file.md");
  });
});
