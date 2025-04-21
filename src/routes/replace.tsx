import { useState, useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/replace")({
  component: SearchAndReplace,
});

function SearchAndReplace() {
  const navigate = useNavigate();
  const [txtSource, setSource] = useState("");
  const [txtFind, setFind] = useState("");
  const [txtReplace, setReplace] = useState("");
  let txtOutput: string = "";

  const getFormattedLength = useCallback(
    (s: string) => new Intl.NumberFormat().format(s.length),
    []
  );

  const process = () => {
    if (txtFind.length === 0) {
      txtOutput = txtSource;
      return;
    }

    const replaced = txtSource.replaceAll(txtFind, txtReplace);
    txtOutput = replaced;
  };

  process();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(txtOutput);
      alert("Copied to clipboard.");
    } catch (error) {
      alert(`Error copying to clipboard: ${error}`);
    }
  };

  const clear = () => {
    setSource("");
    setFind("");
    setReplace("");
  };

  return (
    <div className="p-4 lg:p-8 max-w-5xl h-full mx-auto flex flex-col justify-center gap-2 lg:gap-4">
      <div>
        <div className="window w-full">
          <div className="title-bar">
            <div className="title-bar-text">Search &amp; Replace</div>
            <div className="title-bar-controls">
              <button
                aria-label="Close"
                onClick={() => navigate({ to: "/" })}
              />
            </div>
          </div>

          <div className="window-body flex flex-col gap-1 lg:gap-4 pb-2 lg:pb-4">
            <div className="field-row-stacked">
              <label htmlFor="txt_source">Source Text</label>
              <textarea
                rows={8}
                id="txt_source"
                value={txtSource}
                onChange={(e) => setSource(e.target.value)}
              ></textarea>
            </div>
            <div className="field-row-stacked">
              <label htmlFor="txt_find">Find</label>
              <input
                id="txt_find"
                type="text"
                value={txtFind}
                onChange={(e) => setFind(e.target.value)}
              />
            </div>
            <div className="field-row-stacked">
              <label htmlFor="txt_replace">Replace</label>
              <input
                id="txt_replace"
                type="text"
                value={txtReplace}
                onChange={(e) => setReplace(e.target.value)}
              />
            </div>
            <div className="field-row-stacked">
              <label htmlFor="txt_output">Output Text</label>
              <textarea
                rows={8}
                id="txt_output"
                readOnly={true}
                value={txtOutput}
              ></textarea>
            </div>
            <div className="flex justify-end items-center gap-1 lg:gap-2">
              <button
                onClick={clear}
                disabled={
                  txtSource.length === 0 &&
                  txtFind.length === 0 &&
                  txtReplace.length === 0
                }
              >
                Reset
              </button>
              <button disabled={txtOutput.length === 0} onClick={copy}>
                Copy
              </button>
            </div>
          </div>

          <div className="status-bar">
            <p className="status-bar-field">
              Input Chars: {getFormattedLength(txtSource)}
            </p>
            <p className="status-bar-field">
              Find Chars: {getFormattedLength(txtFind)}
            </p>
            <p className="status-bar-field">
              Replace Chars: {getFormattedLength(txtReplace)}
            </p>
            <p className="status-bar-field">
              Output Chars: {getFormattedLength(txtOutput)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
