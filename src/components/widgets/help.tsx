import { Widget } from "@/components/widget";

export function Help({ id }: { id: number }) {
  return (
    <Widget initialHeight={500} initialWidth={500} windowID={id}>
      <Widget.Title>Help</Widget.Title>
      <Widget.Body>TO DO</Widget.Body>
      <Widget.Status>TODO</Widget.Status>
    </Widget>
  );
}
