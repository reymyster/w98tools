import logOffIcon from "@/assets/start-menu/log-off.png";
import pdfExportIcon from "@/assets/start-menu/pdf-export.svg";
import prettifyJsonIcon from "@/assets/start-menu/prettify-json.png";
import resetWindowsIcon from "@/assets/start-menu/reset-windows.png";
import searchReplaceIcon from "@/assets/start-menu/search-replace.png";
import stringUtilitiesIcon from "@/assets/start-menu/string-utilities.png";
import updateIcon from "@/assets/start-menu/update.png";
import type { WidgetType } from "./window-store";

/**
 * The Start menu as data. Adding a widget to the menu means adding an entry
 * here rather than hand-writing another block of markup with its own
 * accessibility wiring — that lives once, in StartBar.
 */

/** What activating a row does. `open` covers every widget; the rest are one-offs. */
export type MenuAction =
  | { kind: "open"; widget: WidgetType }
  | { kind: "logOff" }
  | { kind: "reset" };

export type SubMenuItem = {
  label: string;
  widget: WidgetType;
};

export type MenuItem = {
  label: string;
  icon: string;
  /** Omitted for rows that only reveal a submenu. */
  action?: MenuAction;
  submenu?: SubMenuItem[];
  /** Draws the raised divider beneath the row, as the original markup did. */
  separatorAfter?: boolean;
};

export const MENU_ITEMS: MenuItem[] = [
  {
    label: "Update",
    icon: updateIcon,
    action: { kind: "open", widget: "Help" },
    separatorAfter: true,
  },
  {
    label: "Search & Replace",
    icon: searchReplaceIcon,
    action: { kind: "open", widget: "SearchReplace" },
  },
  {
    label: "String Utilities",
    icon: stringUtilitiesIcon,
    submenu: [
      { label: "Image OCR", widget: "OCR" },
      { label: "Search & Replace", widget: "SearchReplace" },
    ],
  },
  {
    label: "Prettify",
    icon: prettifyJsonIcon,
    submenu: [
      { label: "JSON", widget: "PrettifyJson" },
      { label: "SQL", widget: "PrettifySql" },
    ],
  },
  {
    label: "PDF Exporter",
    icon: pdfExportIcon,
    action: { kind: "open", widget: "PdfExport" },
    separatorAfter: true,
  },
  {
    label: "Log Off",
    icon: logOffIcon,
    action: { kind: "logOff" },
  },
  {
    label: "Reset Windows",
    icon: resetWindowsIcon,
    action: { kind: "reset" },
  },
];
