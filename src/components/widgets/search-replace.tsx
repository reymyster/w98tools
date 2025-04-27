import { useState, useCallback } from "react";
import { Widget } from "@/components/widget";

export function SearchReplace({ id }: { id: number }) {
  const [txtSource, setSource] = useState("");
  const [txtFind, setFind] = useState("");
  const [txtReplace, setReplace] = useState("");
  let txtOutput: string = "";

  const getFormattedLength = useCallback(
    (s: string) => new Intl.NumberFormat().format(s.length),
    []
  );

  if (txtFind.length === 0) {
    txtOutput = txtSource;
  } else {
    txtOutput = txtSource.replaceAll(txtFind, txtReplace);
  }

  return (
    <Widget windowID={id} initialHeight={500} initialWidth={400}>
      <Widget.Title>Search &amp; Replace</Widget.Title>
      <Widget.Body className="flex flex-col gap-1 lg:gap-4 pb-2 lg:pb-4">
        <div className="field-row-stacked grow">
          <label htmlFor="txt_source">Source Text</label>
          <textarea
            className="h-full"
            id="txt_source"
            value={txtSource}
            onChange={(e) => setSource(e.target.value)}
          ></textarea>
        </div>
        <div className="field-row-stacked grow-0">
          <label htmlFor="txt_find">Find</label>
          <input
            id="txt_find"
            type="text"
            value={txtFind}
            onChange={(e) => setFind(e.target.value)}
          />
        </div>
        <div className="field-row-stacked grow-0">
          <label htmlFor="txt_replace">Replace</label>
          <input
            id="txt_replace"
            type="text"
            value={txtReplace}
            onChange={(e) => setReplace(e.target.value)}
          />
        </div>
        <div className="field-row-stacked grow">
          <label htmlFor="txt_output">Output Text</label>
          <textarea
            className="h-full"
            id="txt_output"
            readOnly={true}
            value={txtOutput}
          ></textarea>
        </div>
      </Widget.Body>
      <Widget.Status>
        Input Chars: {getFormattedLength(txtSource)}
      </Widget.Status>
      <Widget.Status>Find Chars: {getFormattedLength(txtFind)}</Widget.Status>
      <Widget.Status>
        Replace Chars: {getFormattedLength(txtReplace)}
      </Widget.Status>
      <Widget.Status>
        Output Chars: {getFormattedLength(txtOutput)}
      </Widget.Status>
    </Widget>
  );
}
