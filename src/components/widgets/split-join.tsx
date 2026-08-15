import { useMemo, useState } from "react";
import { Widget } from "@/components/widget";

type DelimiterChoice = "newline" | "comma" | "tab" | "custom";

const PRESETS: Record<Exclude<DelimiterChoice, "custom">, RegExp> = {
  newline: /\r?\n/,
  comma: /,/,
  tab: /\t/,
};

const JOINERS: Record<Exclude<DelimiterChoice, "custom">, string> = {
  newline: "\n",
  comma: ",",
  tab: "\t",
};

const CHAR_FORMATTER = new Intl.NumberFormat();

// Trimming and dropping empties are unconditional rather than checkboxes:
// a column pasted out of SSMS otherwise yields a trailing empty item every
// single time, and nobody wants '' in their IN list.
function splitItems(
  source: string,
  choice: DelimiterChoice,
  custom: string,
): string[] {
  if (source.trim() === "") return [];

  // An empty custom delimiter would make String.split return every
  // character; treating the input as a single item is the useful answer.
  if (choice === "custom" && custom === "") return [source.trim()];

  const separator = choice === "custom" ? custom : PRESETS[choice];
  return source
    .split(separator)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** T-SQL quoting: wrap in single quotes, double any embedded single quote. */
function quoteItem(item: string): string {
  return `'${item.replaceAll("'", "''")}'`;
}

export function SplitJoin({ id }: { id: number }) {
  const [txtSource, setSource] = useState("");
  const [splitBy, setSplitBy] = useState<DelimiterChoice>("newline");
  const [joinWith, setJoinWith] = useState<DelimiterChoice>("newline");
  const [customSplit, setCustomSplit] = useState("");
  const [customJoin, setCustomJoin] = useState("");
  const [shouldQuote, setShouldQuote] = useState(false);

  const { txtOutput, count } = useMemo(() => {
    const items = splitItems(txtSource, splitBy, customSplit);
    const joiner = joinWith === "custom" ? customJoin : JOINERS[joinWith];
    const rendered = shouldQuote ? items.map(quoteItem) : items;
    return { txtOutput: rendered.join(joiner), count: items.length };
  }, [txtSource, splitBy, customSplit, joinWith, customJoin, shouldQuote]);

  return (
    <Widget windowID={id} initialHeight={520} initialWidth={420}>
      <Widget.Title>Split &amp; Join</Widget.Title>
      <Widget.Body className="flex flex-col gap-1 lg:gap-4 pb-2 lg:pb-4">
        <div className="field-row-stacked grow">
          <label htmlFor="txt_split_source">Source Text</label>
          <textarea
            className="h-full"
            id="txt_split_source"
            value={txtSource}
            onChange={(e) => setSource(e.target.value)}
          ></textarea>
        </div>
        <div className="field-row-stacked grow-0">
          <label htmlFor="sel_split_by">Split by</label>
          <select
            id="sel_split_by"
            value={splitBy}
            onChange={(e) => setSplitBy(e.target.value as DelimiterChoice)}
          >
            <option value="newline">New line</option>
            <option value="comma">Comma</option>
            <option value="tab">Tab</option>
            <option value="custom">Custom…</option>
          </select>
        </div>
        {splitBy === "custom" && (
          <div className="field-row-stacked grow-0">
            <label htmlFor="txt_custom_split">Custom split delimiter</label>
            <input
              id="txt_custom_split"
              type="text"
              value={customSplit}
              onChange={(e) => setCustomSplit(e.target.value)}
            />
          </div>
        )}
        <div className="field-row-stacked grow-0">
          <label htmlFor="sel_join_with">Join with</label>
          <select
            id="sel_join_with"
            value={joinWith}
            onChange={(e) => setJoinWith(e.target.value as DelimiterChoice)}
          >
            <option value="newline">New line</option>
            <option value="comma">Comma</option>
            <option value="tab">Tab</option>
            <option value="custom">Custom…</option>
          </select>
        </div>
        {joinWith === "custom" && (
          <div className="field-row-stacked grow-0">
            <label htmlFor="txt_custom_join">Custom join delimiter</label>
            <input
              id="txt_custom_join"
              type="text"
              value={customJoin}
              onChange={(e) => setCustomJoin(e.target.value)}
            />
          </div>
        )}
        <div className="field-row grow-0">
          <input
            id="chk_quote"
            type="checkbox"
            checked={shouldQuote}
            onChange={(e) => setShouldQuote(e.target.checked)}
          />
          <label htmlFor="chk_quote">Quote each item</label>
        </div>
        <div className="field-row-stacked grow">
          <label htmlFor="txt_split_output">Output Text</label>
          <textarea
            className="h-full"
            id="txt_split_output"
            readOnly={true}
            value={txtOutput}
          ></textarea>
        </div>
      </Widget.Body>
      {/* A template literal, not `Items: {count}`: the latter renders two
          text nodes, which getByText("Items: 3") can't match. */}
      <Widget.Status>{`Items: ${count}`}</Widget.Status>
      <Widget.Status>
        Output Chars: {CHAR_FORMATTER.format(txtOutput.length)}
      </Widget.Status>
    </Widget>
  );
}
