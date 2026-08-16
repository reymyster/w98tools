import { useMemo, useState } from "react";
import { usePersistentState } from "@/components/use-persistent-state";
import { Widget } from "@/components/widget";
import { formatGuid, type GuidFormat, generateGuids } from "@/lib/guid";

// Labels spell out what each C# format specifier does, since the audience
// is a developer who knows Guid.ToString("N") but not which letter is
// which.
const FORMAT_OPTIONS: { value: GuidFormat; label: string }[] = [
  { value: "D", label: "D — 8-4-4-4-12" },
  { value: "N", label: "N — no hyphens" },
  { value: "B", label: "B — {8-4-4-4-12}" },
  { value: "P", label: "P — (8-4-4-4-12)" },
];

export function GuidGenerator({ id }: { id: number }) {
  const [txtCount, setCount] = usePersistentState(id, "count", "10");
  const [format, setFormat] = usePersistentState<GuidFormat>(id, "format", "D");
  const [upper, setUpper] = usePersistentState(id, "upper", false);

  // Raw v4 GUIDs, always in canonical lowercase D form -- never persisted,
  // since this is output, not input, and every window is free to draw its
  // own fresh values. Format and case are applied at render time (see
  // txtOutput below), so flipping either doesn't burn a new crypto draw or
  // change values the user may have already copied. The lazy initialiser
  // runs during the same render as the usePersistentState calls above, so
  // it already sees the restored (or default) count -- that's what makes
  // the window useful immediately, with no click required.
  const [guids, setGuids] = useState<string[]>(() =>
    generateGuids(Number(txtCount), "D", false),
  );

  const handleGenerate = () => {
    setGuids(generateGuids(Number(txtCount), "D", false));
  };

  const txtOutput = useMemo(
    () => guids.map((guid) => formatGuid(guid, format, upper)).join("\n"),
    [guids, format, upper],
  );

  return (
    <Widget windowID={id} initialHeight={420} initialWidth={420}>
      <Widget.Title>GUID Generator</Widget.Title>
      <Widget.Body className="flex flex-col gap-1 lg:gap-4 pb-2 lg:pb-4">
        <div className="field-row-stacked grow-0">
          <label htmlFor={`txt_guid_count_${id}`}>Count</label>
          <input
            id={`txt_guid_count_${id}`}
            type="text"
            inputMode="numeric"
            value={txtCount}
            onChange={(e) => setCount(e.target.value)}
          />
        </div>
        <div className="field-row-stacked grow-0">
          <label htmlFor={`sel_guid_format_${id}`}>Format</label>
          <select
            id={`sel_guid_format_${id}`}
            value={format}
            onChange={(e) => setFormat(e.target.value as GuidFormat)}
          >
            {FORMAT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field-row grow-0">
          <input
            id={`chk_guid_upper_${id}`}
            type="checkbox"
            checked={upper}
            onChange={(e) => setUpper(e.target.checked)}
          />
          <label htmlFor={`chk_guid_upper_${id}`}>Uppercase</label>
        </div>
        <div className="field-row grow-0">
          <button type="button" onClick={handleGenerate}>
            Generate
          </button>
        </div>
        <div className="field-row-stacked grow">
          <label htmlFor={`txt_guid_output_${id}`}>Output</label>
          <textarea
            className="h-full font-mono text-xs"
            id={`txt_guid_output_${id}`}
            readOnly={true}
            value={txtOutput}
          ></textarea>
        </div>
      </Widget.Body>
      {/* A template literal, not `Generated: {guids.length}`: the latter
          renders two text nodes, which getByText can't match as one string. */}
      <Widget.Status>{`Generated: ${guids.length}`}</Widget.Status>
    </Widget>
  );
}
