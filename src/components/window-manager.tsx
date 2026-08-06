import { type ComponentType, memo } from "react";
import { Help as HelpWidget } from "@/components/widgets/help";
import { ImageOCR as OCRWidget } from "@/components/widgets/image-ocr";
import { PdfExport as PdfExportWidget } from "@/components/widgets/pdf-export";
import { SearchReplace as SearchReplaceWidget } from "@/components/widgets/search-replace";
import { Welcome as WelcomeWidget } from "@/components/widgets/welcome";
import { StartBar } from "./start-bar";
import { PrettifyJson as PrettifyJSONWidget } from "./widgets/prettify-json";
import { useWindowMangager, type WidgetType } from "./window-store";

// Deliberately not exported: this module exports only its component so Fast
// Refresh can preserve state across edits. Typing it as Record<WidgetType, …>
// keeps the compiler enforcing that every widget type has a component.
// memo() because the only prop is the stable numeric id: when the windows
// array genuinely changes (open/close/raise), unchanged widgets skip
// re-executing their whole body -- widgets track their own z-order and
// content through the store and their own state.
const widgetRegistry: Record<WidgetType, ComponentType<{ id: number }>> = {
  Help: memo(HelpWidget),
  PrettifyJson: memo(PrettifyJSONWidget),
  SearchReplace: memo(SearchReplaceWidget),
  Welcome: memo(WelcomeWidget),
  OCR: memo(OCRWidget),
  PdfExport: memo(PdfExportWidget),
};

export function WindowManager() {
  const windows = useWindowMangager((state) => state.windows);
  return (
    <div className="h-svh grid grid-rows-[auto_48px] bg-gradient-to-br from-slate-300 to-[#008080] overflow-hidden">
      <main className="mr-2.5 mb-2">
        {windows.map((w) => {
          const WidgetComponent = widgetRegistry[w.type];

          return <WidgetComponent key={w.id} id={w.id} />;
        })}
      </main>
      <StartBar />
    </div>
  );
}
