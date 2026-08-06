import { describe, expect, it, vi } from "vitest";
import { renderDocDiagrams } from "./diagrams";
import type { DocNode } from "./types";

// jsdom can't run mermaid (no layout) or canvas, so these tests inject a
// fake renderer; renderMermaidToPng itself is exercised in the real browser.
const fakeRender = async (code: string) => ({
  dataUrl: `data:image/png;base64,${code}`,
  width: 100,
  height: 50,
});

describe("renderDocDiagrams", () => {
  it("replaces a diagram node with the rendered image", async () => {
    const nodes: DocNode[] = [
      { kind: "paragraph", runs: [{ text: "before" }] },
      { kind: "diagram", code: "flowchart" },
    ];
    const result = await renderDocDiagrams(nodes, fakeRender);
    expect(result[0]).toEqual(nodes[0]);
    expect(result[1]).toEqual({
      kind: "image",
      dataUrl: "data:image/png;base64,flowchart",
      width: 100,
      height: 50,
    });
  });

  it("renders diagrams nested inside quotes and list items", async () => {
    const nodes: DocNode[] = [
      {
        kind: "quote",
        children: [{ kind: "diagram", code: "in-quote" }],
      },
      {
        kind: "list",
        ordered: false,
        items: [[{ kind: "diagram", code: "in-list" }]],
      },
    ];
    const [quote, list] = await renderDocDiagrams(nodes, fakeRender);
    expect(quote).toMatchObject({
      kind: "quote",
      children: [{ kind: "image" }],
    });
    expect(list).toMatchObject({
      kind: "list",
      items: [[{ kind: "image" }]],
    });
  });

  it("falls back to a code node when rendering fails", async () => {
    const failing = vi.fn(async () => {
      throw new Error("parse error");
    });
    const result = await renderDocDiagrams(
      [{ kind: "diagram", code: "not a diagram" }],
      failing,
    );
    expect(result[0]).toEqual({ kind: "code", text: "not a diagram" });
  });

  it("returns the input untouched when there is nothing to render", async () => {
    const untouched = vi.fn(fakeRender);
    const nodes: DocNode[] = [{ kind: "paragraph", runs: [{ text: "x" }] }];
    const result = await renderDocDiagrams(nodes, untouched);
    // Same array, not a copy: the caller can rely on referential equality,
    // and the default renderer (and its mermaid import) was never invoked.
    expect(result).toBe(nodes);
    expect(untouched).not.toHaveBeenCalled();
  });
});
