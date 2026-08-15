import { ROADMAP, type RoadmapGroup, toolCounts } from "@/components/roadmap";
import { Widget } from "@/components/widget";
import { useWindowMangager } from "@/components/window-store";

// Each activatable entry is a real <button>, which is what a plain
// activatable list item should be -- it gets Enter/Space activation, focus
// behaviour and screen-reader semantics for free. 98.css styles <button>
// with a silver face, bevel shadow and min-width that would turn the tool
// list into a column of chunky grey buttons, so every property it sets is
// neutralised with `!`-prefixed Tailwind utilities (see ROW_LABEL in
// start-bar.tsx for the same established pattern). The `:active` bevel-flip
// and dotted `:focus` outline both come from the same unlayered 98.css
// rules, so `!shadow-none` beats the bevel unconditionally rather than only
// in the default state -- 98.css is a plain unlayered stylesheet, so its
// declarations otherwise beat Tailwind's layered utilities regardless of
// selector specificity. The focus outline is trickier: Tailwind's
// `outline-none` utility also clears the shared `--tw-outline-style`
// variable, which the `focus-visible:outline*` utilities below read via
// `var(...)` -- clearing it on plain `:focus` poisons that variable for the
// simultaneously-matching `:focus-visible` state too, leaving no outline at
// all. `focus:![outline:none]` sets the outline shorthand directly instead,
// leaving `--tw-outline-style` alone so it falls back to its registered
// "solid" default when `:focus-visible` reads it. The visible focus ring is
// restored on :focus-visible only, same as everywhere else in the app.
const LINK =
  "cursor-pointer text-left underline !border-0 !bg-transparent !min-h-0 !min-w-0 !p-0 !shadow-none ![font:inherit] ![-webkit-font-smoothing:inherit] ![text-shadow:none] !text-blue-800 hover:!text-blue-600 focus:![outline:none] focus-visible:!outline focus-visible:!outline-1 focus-visible:!outline-offset-1 focus-visible:!outline-black";
const PLANNED = "text-[#808080]";

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
                  <button type="button" className={LINK} onClick={activate}>
                    {entry.label}
                  </button>
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
