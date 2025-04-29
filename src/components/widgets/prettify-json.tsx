import { useState, useEffect } from "react";
import { Widget } from "@/components/widget";

export function PrettifyJson({ id }: { id: number }) {
  const [txtSource, setSource] = useState("");
  const [txtOutput, setOutput] = useState("");
  const [valid, setValid] = useState(true);

  useEffect(() => {
    if (!txtSource) {
      setOutput("");
      setValid(true);
      return;
    }

    try {
      const parsed = JSON.parse(txtSource);
      setOutput(JSON.stringify(parsed, null, 5));
      setValid(true);
    } catch (err) {
      setValid(false);
    }
  }, [txtSource, setOutput, setValid]);

  return (
    <Widget windowID={id} initialHeight={480} initialWidth={640}>
      <Widget.Title>Prettify JSON</Widget.Title>
      <Widget.Body className="grid grid-cols-2 gap-1 lg:gap-4 pb-2 lg:pb-4">
        <div className="field-row-stacked">
          <label htmlFor="txt_source">Original</label>
          <textarea
            className="h-full w-full"
            id="txt_source"
            value={txtSource}
            onChange={(e) => setSource(e.target.value)}
          ></textarea>
        </div>
        <div className="field-row-stacked">
          <label htmlFor="txt_output">Formatted</label>
          <textarea
            className="h-full w-full"
            id="txt_output"
            readOnly={true}
            value={txtOutput}
          ></textarea>
        </div>
      </Widget.Body>
      <Widget.Status>
        <span
          dangerouslySetInnerHTML={{
            __html: valid ? "&nbsp;" : "Invalid JSON.",
          }}
          className="text-red-500"
        ></span>
      </Widget.Status>
    </Widget>
  );
}
