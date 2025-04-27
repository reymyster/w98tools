import { Widget } from "@/components/widget";

export function Welcome({ id }: { id: number }) {
  return (
    <Widget initialHeight={230} initialWidth={250} windowID={id}>
      <Widget.Title>Welcome!</Widget.Title>
      <Widget.Body>
        <p>String Utilities</p>
        <ul>
          <li>Search & Replace</li>
          <li>Split</li>
        </ul>
        <p>Prettify</p>
        <ul>
          <li>JSON</li>
          <li>SQL</li>
        </ul>
      </Widget.Body>
      <Widget.Status>
        Press <span className="font-bold">Start</span> to begin.
      </Widget.Status>
      <Widget.Status>Implemented: 14%</Widget.Status>
    </Widget>
  );
}
