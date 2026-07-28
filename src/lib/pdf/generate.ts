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
