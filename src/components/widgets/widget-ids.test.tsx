import { render } from "@testing-library/react";
import type { ComponentType } from "react";
import { describe, expect, it } from "vitest";
import type { WidgetType } from "@/components/window-store";
import { EncodeDecode } from "./encode-decode";
import { GuidGenerator } from "./guid-generator";
import { Help } from "./help";
import { ImageOCR } from "./image-ocr";
import { JsonToTypes } from "./json-to-types";
import { JwtDecoder } from "./jwt-decoder";
import { PdfExport } from "./pdf-export";
import { PrettifyJson } from "./prettify-json";
import { PrettifySql } from "./prettify-sql";
import { SearchReplace } from "./search-replace";
import { SplitJoin } from "./split-join";
import { Welcome } from "./welcome";

// Mirrors widgetRegistry in window-manager.tsx, which can't be imported here
// directly -- that file must export only its component, or Fast Refresh
// stops preserving state across edits (see CLAUDE.md). Typing this map as
// Record<WidgetType, ...> means a widget added to the WidgetType union
// without a matching entry here fails to compile, so a future widget can't
// slip through this coverage the way these six once did.
const ALL_WIDGETS: Record<WidgetType, ComponentType<{ id: number }>> = {
  EncodeDecode,
  GuidGenerator,
  Help,
  JsonToTypes,
  JwtDecoder,
  PrettifyJson,
  PrettifySql,
  SearchReplace,
  SplitJoin,
  Welcome,
  OCR: ImageOCR,
  PdfExport,
};

// Every widget can be open in more than one window at once, and each window
// is rendered into the same document -- so any element id a widget hardcodes
// collides with itself the moment a second window opens, and `<label
// htmlFor>` then resolves to whichever window's field the browser saw first.
// These assertions deliberately check "no id appears twice" rather than any
// specific id string: a future widget that reintroduces a hardcoded id fails
// this without needing this file updated at all (beyond the compile-time
// registration above).
function idsIn(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("[id]")).map((el) => el.id);
}

describe("widget element ids stay unique across windows", () => {
  it.each(Object.entries(ALL_WIDGETS))(
    "%s: two open windows of the same widget share no DOM id",
    (_type, WidgetComponent) => {
      const { container } = render(
        <>
          <WidgetComponent id={1} />
          <WidgetComponent id={2} />
        </>,
      );

      const ids = idsIn(container);
      expect(new Set(ids).size).toBe(ids.length);
    },
  );

  it("a Prettify JSON window and a Search & Replace window share no DOM id", () => {
    // These two widgets used to hardcode the identical base ids
    // (txt_source / txt_output), so opening them together collided just as
    // reliably as opening two windows of the same tool.
    const { container } = render(
      <>
        <PrettifyJson id={1} />
        <SearchReplace id={2} />
      </>,
    );

    const ids = idsIn(container);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
