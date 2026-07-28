import { implementedPercent, ROADMAP } from "@/components/roadmap";
import { Widget } from "@/components/widget";

export function Welcome({ id }: { id: number }) {
  // Sized to fit the current roadmap without scrolling. Window.Body scrolls if
  // it outgrows this, so the list can keep expanding either way.
  return (
    <Widget initialHeight={320} initialWidth={280} windowID={id}>
      <Widget.Title>Welcome!</Widget.Title>
      <Widget.Body>
        {ROADMAP.map((group) => (
          <div key={group.group}>
            <p>{group.group}</p>
            <ul>
              {group.entries.map((entry) => (
                <li key={entry.label}>{entry.label}</li>
              ))}
            </ul>
          </div>
        ))}
      </Widget.Body>
      <Widget.Status>
        Press <span className="font-bold">Start</span> to begin.
      </Widget.Status>
      <Widget.Status>Implemented: {implementedPercent()}%</Widget.Status>
    </Widget>
  );
}
