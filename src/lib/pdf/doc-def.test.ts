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
  it("maps the device page size to the reMarkable dimensions", () => {
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

  // Image sizing: natural size is CSS px x 0.75 = pt; images scale *down*
  // proportionally to fit the content box (page minus margins), never up.
  // Device page is 447x596 with normal margins of 40 all round, so the
  // content box is 367x516.
  it("places an image that fits at its natural size", () => {
    const image: DocNode = {
      kind: "image",
      dataUrl: "data:image/png;base64,x",
      width: 200,
      height: 100,
    };
    const def = buildDocDefinition([image], options);
    const [content] = def.content as { image?: string; width?: number }[];
    expect(content.image).toBe("data:image/png;base64,x");
    expect(content.width).toBeCloseTo(150);
  });

  it("scales a wide image down to the content width", () => {
    const image: DocNode = {
      kind: "image",
      dataUrl: "data:image/png;base64,x",
      width: 800,
      height: 400,
    };
    const def = buildDocDefinition([image], options);
    const [content] = def.content as { width?: number }[];
    expect(content.width).toBeCloseTo(367);
  });

  it("scales a tall image down to fit the content height", () => {
    const image: DocNode = {
      kind: "image",
      dataUrl: "data:image/png;base64,x",
      width: 100,
      height: 2000,
    };
    const def = buildDocDefinition([image], options);
    const [content] = def.content as { width?: number }[];
    // 75pt natural width x (516 content height / 1500pt natural height)
    expect(content.width).toBeCloseTo(25.8);
  });

  it("sizes images against the selected page, not a hardcoded one", () => {
    const image: DocNode = {
      kind: "image",
      dataUrl: "data:image/png;base64,x",
      width: 800,
      height: 400,
    };
    const def = buildDocDefinition([image], { ...options, pageSize: "a4" });
    const [content] = def.content as { width?: number }[];
    // A4 is 595.28 wide; normal margins leave 515.28.
    expect(content.width).toBeCloseTo(515.28);
  });

  it("renders an unrendered diagram as a code block", () => {
    const diagram: DocNode = { kind: "diagram", code: "flowchart LR" };
    const def = buildDocDefinition([diagram], options);
    const [content] = def.content as { text?: string; style?: string }[];
    expect(content).toMatchObject({ text: "flowchart LR", style: "code" });
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
