import type { KeyboardEvent } from "react";
import { ROADMAP, type RoadmapGroup, toolCounts } from "@/components/roadmap";
import { Widget } from "@/components/widget";
import { useWindowMangager } from "@/components/window-store";

// Each activatable entry is a role="button" div nested in its <li>, rather
// than a <button> or the <li> itself carrying the role: 98.css styles
// <button> with a silver face, bevel shadow and min-width that would turn
// the tool list into a column of chunky grey buttons -- start-bar.tsx hit
// the same problem for its menu rows and uses role-annotated divs instead.
// A neutral div (not the semantically non-interactive <li>) is what keeps
// that pattern lint-clean here. Enter and Space are handled here since a
// non-button element has no native activation; Space is prevented so it
// doesn't also scroll the body.
const LINK =
  "cursor-pointer text-blue-800 underline hover:text-blue-600 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-black";
const PLANNED = "text-[#808080]";

function handleKeyDown(e: KeyboardEvent<HTMLDivElement>, activate: () => void) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    activate();
  }
}

// Split out from Welcome so it can be exercised directly with a roadmap
// fixture in tests -- the real ROADMAP has no planned (widget-less) entries
// today, so that branch needs an injected list rather than Welcome's own
// (deliberately test-free) `{ id }` prop.
export function RoadmapList({ roadmap }: { roadmap: RoadmapGroup[] }) {
  const addWindow = useWindowMangager((state) => state.addWindow);

  return (
    <>
      {roadmap.map((group) => (
        <div key={group.group}>
          <p>{group.group}</p>
          <ul>
            {group.entries.map((entry) => {
              const widget = entry.widget;
              if (!widget) {
                return (
                  <li key={entry.label} className={PLANNED}>
                    {entry.label}
                  </li>
                );
              }

              const activate = () => addWindow(widget);
              return (
                <li key={entry.label}>
                  {/* biome-ignore lint/a11y/useSemanticElements: a <button>
                      here gets 98.css's silver face, bevel and min-width,
                      turning the list into a column of chunky grey buttons
                      -- see the comment above and start-bar.tsx. */}
                  <div
                    role="button"
                    tabIndex={0}
                    className={LINK}
                    onClick={activate}
                    onKeyDown={(e) => handleKeyDown(e, activate)}
                  >
                    {entry.label}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}

export function Welcome({ id }: { id: number }) {
  const { shipped, total } = toolCounts();
  const status =
    shipped === total ? `${total} tools` : `${shipped} of ${total} tools`;

  return (
    // Sized to fit the current roadmap (4 group headings, 8 entries) without
    // scrolling. Window.Body still scrolls if the list outgrows this, so
    // there's no ceiling on how far the roadmap can keep growing.
    <Widget initialHeight={352} initialWidth={280} windowID={id}>
      <Widget.Title>Welcome!</Widget.Title>
      <Widget.Body>
        <RoadmapList roadmap={ROADMAP} />
      </Widget.Body>
      <Widget.Status>
        Press <span className="font-bold">Start</span> to begin.
      </Widget.Status>
      <Widget.Status>{status}</Widget.Status>
    </Widget>
  );
}
