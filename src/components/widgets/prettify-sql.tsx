import { useEffect, useMemo, useState } from "react";
import { Widget } from "@/components/widget";

type FormatFn = (sql: string) => string;

// sql-formatter is 74.4 kB gzipped and widgetRegistry imports every widget
// statically, so a plain import would ship it to everyone who never opens
// this tool. Loading it dynamically keeps it in its own chunk, the way
// pdfmake and mermaid are handled. The promise is module-level so a second
// Prettify SQL window reuses the first window's download.
let formatterPromise: Promise<FormatFn> | undefined;

function loadFormatter(): Promise<FormatFn> {
  formatterPromise ??= import("sql-formatter").then(
    ({ format }) =>
      (sql: string) =>
        format(sql, {
          language: "transactsql",
          keywordCase: "upper",
          tabWidth: 4,
        }),
  );
  return formatterPromise;
}

// The one place this app uses an effect to produce state, because loading a
// chunk is genuine I/O rather than something derivable from other state.
function useSqlFormatter(): FormatFn | null {
  const [format, setFormat] = useState<FormatFn | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadFormatter().then((fn) => {
      // The updater form is required: setFormat(fn) would run fn as a
      // reducer over the previous state instead of storing it.
      if (!cancelled) setFormat(() => fn);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return format;
}

export function PrettifySql({ id }: { id: number }) {
  const [txtSource, setSource] = useState("");
  const format = useSqlFormatter();

  const { txtOutput, valid } = useMemo(() => {
    if (!txtSource || !format) return { txtOutput: "", valid: true };

    try {
      return { txtOutput: format(txtSource), valid: true };
    } catch {
      // Clearing the output matters: leaving the last good result beside an
      // error reads as though the broken input parsed.
      return { txtOutput: "", valid: false };
    }
  }, [txtSource, format]);

  return (
    <Widget windowID={id} initialHeight={480} initialWidth={640}>
      <Widget.Title>Prettify SQL</Widget.Title>
      <Widget.Body className="grid grid-cols-2 gap-1 lg:gap-4 pb-2 lg:pb-4">
        <div className="field-row-stacked">
          <label htmlFor="txt_sql_source">Original</label>
          <textarea
            className="h-full w-full"
            id="txt_sql_source"
            value={txtSource}
            onChange={(e) => setSource(e.target.value)}
          ></textarea>
        </div>
        <div className="field-row-stacked">
          <label htmlFor="txt_sql_output">Formatted</label>
          <textarea
            className="h-full w-full"
            id="txt_sql_output"
            readOnly={true}
            value={txtOutput}
          ></textarea>
        </div>
      </Widget.Body>
      <Widget.Status>
        {/* U+00A0 holds the row's height when there's nothing to report. */}
        {format === null ? (
          "Loading formatter…"
        ) : (
          <span className="text-red-500">{valid ? " " : "Invalid SQL."}</span>
        )}
      </Widget.Status>
    </Widget>
  );
}
