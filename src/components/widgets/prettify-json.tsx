import { useMemo, useState } from "react";
import { Widget } from "@/components/widget";

export function PrettifyJson({ id }: { id: number }) {
  const [txtSource, setSource] = useState("");

  // Derived from the source rather than synced via an effect, so there's no
  // extra render pass and no chance of output going stale.
  const { txtOutput, valid } = useMemo(() => {
    if (!txtSource) return { txtOutput: "", valid: true };

    try {
      return {
        txtOutput: JSON.stringify(JSON.parse(txtSource), null, 5),
        valid: true,
      };
    } catch {
      return { txtOutput: "", valid: false };
    }
  }, [txtSource]);

  return (
    <Widget windowID={id} initialHeight={480} initialWidth={640}>
      <Widget.Title>Prettify JSON</Widget.Title>
      <Widget.Body className="grid grid-cols-2 gap-1 lg:gap-4 pb-2 lg:pb-4">
        <div className="field-row-stacked">
          <label htmlFor={`txt_source_${id}`}>Original</label>
          <textarea
            className="h-full w-full"
            id={`txt_source_${id}`}
            value={txtSource}
            onChange={(e) => setSource(e.target.value)}
          ></textarea>
        </div>
        <div className="field-row-stacked">
          <label htmlFor={`txt_output_${id}`}>Formatted</label>
          <textarea
            className="h-full w-full"
            id={`txt_output_${id}`}
            readOnly={true}
            value={txtOutput}
          ></textarea>
        </div>
      </Widget.Body>
      <Widget.Status>
        {/* U+00A0 is a non-breaking space, holding the row's height when
            there's nothing to report. */}
        <span className="text-red-500">
          {valid ? "\u00A0" : "Invalid JSON."}
        </span>
      </Widget.Status>
    </Widget>
  );
}
