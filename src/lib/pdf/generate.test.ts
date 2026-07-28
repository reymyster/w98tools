import { describe, expect, it } from "vitest";
import { generatePdfBlob } from "./generate";

describe("generatePdfBlob", () => {
  it("produces bytes that begin with the PDF magic number", async () => {
    const blob = await generatePdfBlob({
      pageSize: { width: 447, height: 596 },
      defaultStyle: { font: "Times", fontSize: 11 },
      content: ["hello"],
    });

    expect(blob.size).toBeGreaterThan(0);
    const head = new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer());
    expect(head).toBe("%PDF-");
  });

  it("renders a parsed markdown document to a real PDF", async () => {
    const { parseInput } = await import("./parse");
    const { buildDocDefinition } = await import("./doc-def");

    const nodes = await parseInput(
      "# Title\n\nBody text with `inline code`.\n\n- one\n- two\n\n```\nconst x = 1;\n```",
      "markdown",
    );
    const blob = await generatePdfBlob(
      buildDocDefinition(nodes, {
        pageSize: "device",
        margin: "normal",
        title: "T",
      }),
    );

    expect(blob.size).toBeGreaterThan(500);
    const head = new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer());
    expect(head).toBe("%PDF-");
  });

  it("renders a code block without throwing (Courier must be registered)", async () => {
    const { buildDocDefinition } = await import("./doc-def");

    const blob = await generatePdfBlob(
      buildDocDefinition([{ kind: "code", text: "const x = 1;" }], {
        pageSize: "device",
        margin: "normal",
        title: "T",
      }),
    );

    expect(blob.size).toBeGreaterThan(0);
    const head = new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer());
    expect(head).toBe("%PDF-");
  });

  it("renders a paragraph with an inline code run without throwing", async () => {
    const { buildDocDefinition } = await import("./doc-def");

    const blob = await generatePdfBlob(
      buildDocDefinition(
        [{ kind: "paragraph", runs: [{ text: "x", code: true }] }],
        { pageSize: "device", margin: "normal", title: "T" },
      ),
    );

    expect(blob.size).toBeGreaterThan(0);
    const head = new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer());
    expect(head).toBe("%PDF-");
  });
});
