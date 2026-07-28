import type { ComponentType } from "react";
import { Help as HelpWidget } from "@/components/widgets/help";
import { ImageOCR as OCRWidget } from "@/components/widgets/image-ocr";
import { SearchReplace as SearchReplaceWidget } from "@/components/widgets/search-replace";
import { Welcome as WelcomeWidget } from "@/components/widgets/welcome";
import { StartBar } from "./start-bar";
import { PrettifyJson as PrettifyJSONWidget } from "./widgets/prettify-json";
import { useWindowMangager, type WidgetType } from "./window-store";

// Deliberately not exported: this module exports only its component so Fast
// Refresh can preserve state across edits. Typing it as Record<WidgetType, …>
// keeps the compiler enforcing that every widget type has a component.
const widgetRegistry: Record<WidgetType, ComponentType<{ id: number }>> = {
  Help: HelpWidget,
  PrettifyJson: PrettifyJSONWidget,
  SearchReplace: SearchReplaceWidget,
  Welcome: WelcomeWidget,
  OCR: OCRWidget,
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
