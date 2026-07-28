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
});
