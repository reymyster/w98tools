import { useMemo, useState } from "react";
import { Widget } from "@/components/widget";
import { type CsharpStyle, emitCsharp } from "@/lib/codegen/emit-csharp";
import { emitTypeScript } from "@/lib/codegen/emit-typescript";
import { inferRoot } from "@/lib/codegen/infer";

type Language = "csharp" | "typescript";

export function JsonToTypes({ id }: { id: number }) {
  const [txtSource, setSource] = useState("");
  const [language, setLanguage] = useState<Language>("csharp");
  const [style, setStyle] = useState<CsharpStyle>("record");
  const [rootName, setRootName] = useState("Root");

  const { txtOutput, error } = useMemo(() => {
    if (txtSource.trim() === "") return { txtOutput: "", error: null };

    let parsed: unknown;
    try {
      parsed = JSON.parse(txtSource);
    } catch {
      return { txtOutput: "", error: "Invalid JSON." };
    }

    const outcome = inferRoot(parsed, rootName.trim() || "Root");
    if (!outcome.ok) return { txtOutput: "", error: outcome.error };

    return {
      txtOutput:
        language === "csharp"
          ? emitCsharp(outcome.result, style)
          : emitTypeScript(outcome.result),
      error: null,
    };
  }, [txtSource, language, style, rootName]);

  return (
    <Widget windowID={id} initialHeight={560} initialWidth={720}>
      <Widget.Title>JSON to Types</Widget.Title>
      <Widget.Body className="flex flex-col gap-1 lg:gap-4 pb-2 lg:pb-4">
        <div className="flex flex-wrap items-end gap-4 grow-0">
          <div className="field-row-stacked">
            <label htmlFor="sel_language">Language</label>
            <select
              id="sel_language"
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
            >
              <option value="csharp">C#</option>
              <option value="typescript">TypeScript</option>
            </select>
          </div>
          {/* Disabled rather than hidden for TypeScript, so the row of
              controls doesn't reflow when the language changes. */}
          <div className="field-row">
            <input
              id="rad_record"
              type="radio"
              name="csharp_style"
              checked={style === "record"}
              disabled={language !== "csharp"}
              onChange={() => setStyle("record")}
            />
            <label htmlFor="rad_record">record</label>
            <input
              id="rad_class"
              type="radio"
              name="csharp_style"
              checked={style === "class"}
              disabled={language !== "csharp"}
              onChange={() => setStyle("class")}
            />
            <label htmlFor="rad_class">class</label>
          </div>
          <div className="field-row-stacked">
            <label htmlFor="txt_root_name">Root type name</label>
            <input
              id="txt_root_name"
              type="text"
              value={rootName}
              onChange={(e) => setRootName(e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1 lg:gap-4 grow min-h-0">
          <div className="field-row-stacked">
            <label htmlFor="txt_json_source">JSON</label>
            <textarea
              className="h-full w-full"
              id="txt_json_source"
              value={txtSource}
              onChange={(e) => setSource(e.target.value)}
            ></textarea>
          </div>
          <div className="field-row-stacked">
            <label htmlFor="txt_types_output">Generated</label>
            <textarea
              className="h-full w-full"
              id="txt_types_output"
              readOnly={true}
              value={txtOutput}
            ></textarea>
          </div>
        </div>
      </Widget.Body>
      <Widget.Status>
        <span className="text-red-500">{error ?? " "}</span>
      </Widget.Status>
    </Widget>
  );
}
