import type { TDocumentDefinitions } from "pdfmake/interfaces";

type PdfMake = {
  createPdf: (def: TDocumentDefinitions) => { getBlob: () => Promise<Blob> };
  addVirtualFileSystem: (vfs: Record<string, unknown>) => void;
  addFonts: (fonts: Record<string, unknown>) => void;
};

let pdfMakePromise: Promise<PdfMake> | null = null;

/**
 * Loads pdfmake and the standard-14 Times and Courier metrics on first use.
 * These are used rather than the bundled Roboto because standard-14 fonts are
 * not embedded in the output: ~15 KB gzipped of metrics apiece instead of
 * 458 KB of font data. Times backs body text (`defaultStyle`); Courier backs
 * the `code` style and `code: true` inline runs in doc-def.ts.
 */
function loadPdfMake(): Promise<PdfMake> {
  if (!pdfMakePromise) {
    pdfMakePromise = (async () => {
      try {
        const [pdfMakeModule, timesModule, courierModule] = await Promise.all([
          import("pdfmake/build/pdfmake"),
          import("pdfmake/build/standard-fonts/Times.js"),
          import("pdfmake/build/standard-fonts/Courier.js"),
        ]);
        const pdfMake = (pdfMakeModule.default ?? pdfMakeModule) as PdfMake;
        const times = timesModule.default ?? timesModule;
        const courier = courierModule.default ?? courierModule;

        pdfMake.addVirtualFileSystem({ ...times.vfs, ...courier.vfs });
        pdfMake.addFonts({ ...times.fonts, ...courier.fonts });
        return pdfMake;
      } catch (e) {
        // A rejected promise memoised forever would poison the loader for the
        // whole page lifetime after a single transient chunk-load failure
        // (routine when a tab is left open across a deploy). Clearing it here
        // lets the next call retry from scratch instead of replaying the same
        // rejection endlessly. The success path above never resets this, so
        // a load that does succeed is still cached for the page's lifetime.
        pdfMakePromise = null;
        throw e;
      }
    })();
  }
  return pdfMakePromise;
}

export async function generatePdfBlob(
  docDefinition: TDocumentDefinitions,
): Promise<Blob> {
  const pdfMake = await loadPdfMake();
  return pdfMake.createPdf(docDefinition).getBlob();
}
