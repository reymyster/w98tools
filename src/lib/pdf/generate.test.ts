import { describe, expect, it, vi } from "vitest";
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

  // Finding 2: loadPdfMake() memoised a *rejected* promise. A single failed
  // chunk fetch (routine when a tab is left open across a deploy) used to
  // poison the loader for the whole page lifetime -- every later call kept
  // replaying the same rejection instead of retrying.
  it("retries after a rejected load instead of staying poisoned forever", async () => {
    // A fresh module instance is required: the top-of-file import already
    // has a real, successfully-resolved pdfMakePromise memoised from the
    // tests above, so reusing it would never re-invoke the mocked import
    // below at all.
    vi.resetModules();

    let attempt = 0;
    vi.doMock("pdfmake/build/pdfmake", async () => {
      attempt++;
      if (attempt === 1) {
        throw new Error("chunk load failed");
      }
      // Real module on retry, so the resulting PDF bytes are genuine.
      return vi.importActual("pdfmake/build/pdfmake");
    });

    try {
      const { generatePdfBlob: freshGeneratePdfBlob } = await import(
        "./generate"
      );
      const def = {
        pageSize: { width: 100, height: 100 },
        defaultStyle: { font: "Times" as const },
        content: ["x"],
      };

      // Vitest wraps whatever the factory throws in its own generic
      // "error when mocking a module" message, so the assertion can't pin
      // down the original text -- only that this first attempt does reject.
      await expect(freshGeneratePdfBlob(def)).rejects.toThrow();

      const blob = await freshGeneratePdfBlob(def);
      expect(blob.size).toBeGreaterThan(0);
      const head = new TextDecoder().decode(
        await blob.slice(0, 5).arrayBuffer(),
      );
      expect(head).toBe("%PDF-");
      expect(attempt).toBe(2);
    } finally {
      vi.doUnmock("pdfmake/build/pdfmake");
      vi.resetModules();
    }
  });
});
