import { useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/prettifyjson")({
  component: PrettifyJSON,
});

function PrettifyJSON() {
  const navigate = useNavigate();
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

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(txtOutput);
      alert("Copied to clipboard.");
    } catch (error) {
      alert(`Error copying to clipboard: ${error}`);
    }
  };

  const clear = () => {
    setOutput("");
    setSource("");
  };

  return (
    <div className="p-4 lg:p-8 max-w-5xl h-full mx-auto flex flex-col justify-center gap-2 lg:gap-4">
      <div className="window w-full">
        <div className="title-bar">
          <div className="title-bar-text">Prettify JSON</div>
          <div className="title-bar-controls">
            <button aria-label="Close" onClick={() => navigate({ to: "/" })} />
          </div>
        </div>

        <div className="window-body flex flex-col gap-1 lg:gap-4 pb-2 lg:pb-4">
          <div className="field-row-stacked">
            <label htmlFor="txt_source">Original</label>
            <textarea
              rows={8}
              id="txt_source"
              value={txtSource}
              onChange={(e) => setSource(e.target.value)}
            ></textarea>
          </div>
          <div className="field-row-stacked">
            <label htmlFor="txt_output">Formatted</label>
            <textarea
              rows={8}
              id="txt_output"
              readOnly={true}
              value={txtOutput}
            ></textarea>
          </div>
          <div className="flex justify-end items-center gap-1 lg:gap-2">
            <button onClick={clear} disabled={txtSource.length === 0}>
              Reset
            </button>
            <button disabled={txtOutput.length === 0} onClick={copy}>
              Copy
            </button>
          </div>
        </div>

        <div className="status-bar">
          <p className="status-bar-field text-red-500">
            <span
              dangerouslySetInnerHTML={{
                __html: valid ? "&nbsp;" : "Invalid JSON.",
              }}
            ></span>
          </p>
        </div>
      </div>
    </div>
  );
}
