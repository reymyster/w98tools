import { useMemo } from "react";
import { usePersistentState } from "@/components/use-persistent-state";
import { Widget } from "@/components/widget";
import { relativeFromNow } from "@/lib/jwt";
import { type ParsedInstant, parseInstant } from "@/lib/timestamp";

const UNIT_LABELS: Record<ParsedInstant["assumedUnit"], string> = {
  seconds: "seconds",
  milliseconds: "milliseconds",
  "date-string": "date string",
};

export function Timestamp({ id }: { id: number }) {
  const [txtInput, setInput] = usePersistentState(id, "input", "");

  const parsed = useMemo(() => parseInstant(txtInput), [txtInput]);
  const invalid = txtInput.trim() !== "" && parsed === null;

  // Read once per render rather than per output, so every field (the Now
  // button's fill and the relative phrase) agrees -- mirrors jwt-decoder.
  const nowMs = Date.now();

  const date = parsed ? new Date(parsed.ms) : null;
  // Floored rather than rounded: an epoch-seconds reading is exact already,
  // and a date-string with sub-second precision (e.g. ".500Z") should
  // truncate towards the second it falls within, not round past it.
  const epochSeconds = parsed ? Math.floor(parsed.ms / 1000) : null;
  // Passed as ms/1000 (not the floored epochSeconds above) so the relative
  // phrase isn't off by up to a second for sub-second input.
  const relative = parsed ? relativeFromNow(parsed.ms / 1000, nowMs) : "";

  const handleNow = () => setInput(String(Date.now()));

  return (
    <Widget windowID={id} initialHeight={480} initialWidth={420}>
      <Widget.Title>Timestamp</Widget.Title>
      <Widget.Body className="flex flex-col gap-1 lg:gap-4 pb-2 lg:pb-4">
        <div className="field-row-stacked grow-0">
          <label htmlFor={`txt_timestamp_${id}`}>Timestamp</label>
          <input
            id={`txt_timestamp_${id}`}
            type="text"
            value={txtInput}
            onChange={(e) => setInput(e.target.value)}
          />
        </div>
        <div className="field-row grow-0">
          <button type="button" onClick={handleNow}>
            Now
          </button>
        </div>
        <div className="field-row-stacked grow-0">
          <label htmlFor={`txt_local_${id}`}>Local</label>
          <input
            id={`txt_local_${id}`}
            type="text"
            readOnly={true}
            value={date ? date.toLocaleString() : ""}
          />
        </div>
        <div className="field-row-stacked grow-0">
          <label htmlFor={`txt_utc_${id}`}>UTC</label>
          <input
            id={`txt_utc_${id}`}
            type="text"
            readOnly={true}
            value={date ? date.toUTCString() : ""}
          />
        </div>
        <div className="field-row-stacked grow-0">
          <label htmlFor={`txt_iso_${id}`}>ISO 8601</label>
          <input
            id={`txt_iso_${id}`}
            type="text"
            readOnly={true}
            value={date ? date.toISOString() : ""}
          />
        </div>
        <div className="field-row-stacked grow-0">
          <label htmlFor={`txt_epoch_seconds_${id}`}>Epoch (seconds)</label>
          <input
            id={`txt_epoch_seconds_${id}`}
            type="text"
            readOnly={true}
            value={epochSeconds !== null ? String(epochSeconds) : ""}
          />
        </div>
        <div className="field-row-stacked grow-0">
          <label htmlFor={`txt_epoch_ms_${id}`}>Epoch (milliseconds)</label>
          <input
            id={`txt_epoch_ms_${id}`}
            type="text"
            readOnly={true}
            value={parsed ? String(parsed.ms) : ""}
          />
        </div>
        <div className="field-row-stacked grow-0">
          <label htmlFor={`txt_relative_${id}`}>Relative</label>
          <input
            id={`txt_relative_${id}`}
            type="text"
            readOnly={true}
            value={relative}
          />
        </div>
      </Widget.Body>
      {/* U+00A0 holds each row's height when there's nothing to report. */}
      <Widget.Status>
        {parsed ? `Assumed: ${UNIT_LABELS[parsed.assumedUnit]}` : " "}
      </Widget.Status>
      <Widget.Status>
        <span className="text-red-500">
          {invalid ? "Invalid timestamp." : " "}
        </span>
      </Widget.Status>
    </Widget>
  );
}
