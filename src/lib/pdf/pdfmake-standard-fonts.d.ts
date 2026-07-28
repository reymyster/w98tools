declare module "pdfmake/build/standard-fonts/Times.js" {
  /** AFM metrics keyed by virtual path, e.g. "data/Times-Roman.afm". */
  const fontContainer: {
    vfs: Record<string, { data: string; encoding?: string }>;
    fonts: Record<
      string,
      { normal: string; bold: string; italics: string; bolditalics: string }
    >;
  };
  export default fontContainer;
}
