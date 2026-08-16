import { useMemo } from "react";
import { usePersistentState } from "@/components/use-persistent-state";
import { Widget } from "@/components/widget";
import { decode, encode, type Scheme } from "@/lib/encoding";

type Direction = "encode" | "decode";

const SCHEME_OPTIONS: { value: Scheme; label: string }[] = [
  { value: "base64", label: "Base64" },
  { value: "base64url", label: "Base64 (URL-safe)" },
  { value: "url-component", label: "URL Component" },
  { value: "url-full", label: "URL (full)" },
];

export function EncodeDecode({ id }: { id: number }) {
  const [txtSource, setSource] = usePersistentState(id, "source", "");
  const [scheme, setScheme] = usePersistentState<Scheme>(
    id,
    "scheme",
    "base64",
  );
  const [direction, setDirection] = usePersistentState<Direction>(
    id,
    "direction",
    "encode",
  );

  // Derived from the source rather than synced via an effect, so there's no
  // extra render pass and no chance of output going stale -- mirrors
  // PrettifyJson.
  const { txtOutput, error } = useMemo(() => {
    if (txtSource === "") return { txtOutput: "", error: null };

    try {
      const convert = direction === "encode" ? encode : decode;
      return { txtOutput: convert(txtSource, scheme), error: null };
    } catch {
      // encodeURI/encodeURIComponent can throw on a lone surrogate too, not
      // just decode on malformed input -- so this covers both directions.
      return { txtOutput: "", error: "Invalid input." };
    }
  }, [txtSource, scheme, direction]);

  return (
    <Widget windowID={id} initialHeight={480} initialWidth={640}>
      <Widget.Title>Base64 &amp; URL</Widget.Title>
      <Widget.Body className="flex flex-col gap-1 lg:gap-4 pb-2 lg:pb-4">
        <div className="flex flex-wrap items-end gap-4 grow-0">
          <div className="field-row-stacked">
            <label htmlFor={`sel_scheme_${id}`}>Scheme</label>
            <select
              id={`sel_scheme_${id}`}
              value={scheme}
              onChange={(e) => setScheme(e.target.value as Scheme)}
            >
              {SCHEME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {/* The radio `name` is scoped to this window's id: `name` is
              document-global, so two windows sharing one literal name would
              put both pairs of radios in one group. */}
          <div className="field-row">
            <input
              id={`rad_encode_${id}`}
              type="radio"
              name={`direction_${id}`}
              checked={direction === "encode"}
              onChange={() => setDirection("encode")}
            />
            <label htmlFor={`rad_encode_${id}`}>Encode</label>
            <input
              id={`rad_decode_${id}`}
              type="radio"
              name={`direction_${id}`}
              checked={direction === "decode"}
              onChange={() => setDirection("decode")}
            />
            <label htmlFor={`rad_decode_${id}`}>Decode</label>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1 lg:gap-4 grow min-h-0">
          <div className="field-row-stacked">
            <label htmlFor={`txt_source_${id}`}>Input</label>
            <textarea
              className="h-full w-full"
              id={`txt_source_${id}`}
              value={txtSource}
              onChange={(e) => setSource(e.target.value)}
            ></textarea>
          </div>
          <div className="field-row-stacked">
            <label htmlFor={`txt_output_${id}`}>Output</label>
            <textarea
              className="h-full w-full"
              id={`txt_output_${id}`}
              readOnly={true}
              value={txtOutput}
            ></textarea>
          </div>
        </div>
      </Widget.Body>
      <Widget.Status>
        {/* U+00A0 is a non-breaking space, holding the row's height when
            there's nothing to report. */}
        <span className="text-red-500">{error ?? " "}</span>
      </Widget.Status>
    </Widget>
  );
}
