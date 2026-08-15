import type { WidgetType } from "./window-store";

/**
 * The tool list shown in the Welcome window, and the source of its
 * "Implemented" figure. Kept as data because the window used to hardcode both:
 * the list had already drifted (Image OCR shipped but was never added) and the
 * percentage was a literal that nobody would remember to update.
 */

export type RoadmapEntry = {
  label: string;
  /** Set once the tool ships. Absent means planned. */
  widget?: WidgetType;
};

export type RoadmapGroup = {
  group: string;
  entries: RoadmapEntry[];
};

export const ROADMAP: RoadmapGroup[] = [
  {
    group: "String Utilities",
    entries: [
      { label: "Search & Replace", widget: "SearchReplace" },
      { label: "Image OCR", widget: "OCR" },
      { label: "Split & Join", widget: "SplitJoin" },
    ],
  },
  {
    group: "Prettify",
    entries: [
      { label: "JSON", widget: "PrettifyJson" },
      { label: "SQL", widget: "PrettifySql" },
    ],
  },
  {
    group: "Developer",
    entries: [{ label: "JWT Decoder", widget: "JwtDecoder" }],
  },
  {
    group: "Export",
    entries: [{ label: "PDF Export", widget: "PdfExport" }],
  },
];

/** Whole-number percentage of roadmap entries that have shipped. */
export function implementedPercent(roadmap: RoadmapGroup[] = ROADMAP): number {
  const entries = roadmap.flatMap((g) => g.entries);
  if (entries.length === 0) return 0;
  const shipped = entries.filter((e) => e.widget !== undefined).length;
  return Math.round((shipped / entries.length) * 100);
}
