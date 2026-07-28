import type { TDocumentDefinitions } from "pdfmake/interfaces";

type PdfMake = {
  createPdf: (def: TDocumentDefinitions) => { getBlob: () => Promise<Blob> };
  addVirtualFileSystem: (vfs: Record<string, unknown>) => void;
  addFonts: (fonts: Record<string, unknown>) => void;
};

let pdfMakePromise: Promise<PdfMake> | null = null;

/**
 * Loads pdfmake and the standard-14 Times metrics on first use. Times is used
 * rather than the bundled Roboto because standard-14 fonts are not embedded in
 * the output: 48 KB gzipped of metrics instead of 458 KB of font data.
 */
function loadPdfMake(): Promise<PdfMake> {
  if (!pdfMakePromise) {
    pdfMakePromise = (async () => {
      const [pdfMakeModule, timesModule] = await Promise.all([
        import("pdfmake/build/pdfmake"),
        import("pdfmake/build/standard-fonts/Times.js"),
      ]);
      const pdfMake = (pdfMakeModule.default ?? pdfMakeModule) as PdfMake;
      const times = timesModule.default ?? timesModule;

      pdfMake.addVirtualFileSystem(times.vfs);
      pdfMake.addFonts(times.fonts);
      return pdfMake;
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
