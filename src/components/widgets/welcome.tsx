import { implementedPercent, ROADMAP } from "@/components/roadmap";
import { Widget } from "@/components/widget";

export function Welcome({ id }: { id: number }) {
  return (
    <Widget initialHeight={230} initialWidth={250} windowID={id}>
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
