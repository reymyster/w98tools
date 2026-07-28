import { useEffect, useRef, useState } from "react";
import { Widget } from "@/components/widget";
import { detectFormat } from "@/lib/pdf/detect";
import { buildDocDefinition, resolveTitle } from "@/lib/pdf/doc-def";
import { generatePdfBlob } from "@/lib/pdf/generate";
import { parseInput } from "@/lib/pdf/parse";
import type { InputFormat, MarginName, PageSizeName } from "@/lib/pdf/types";

const DEBOUNCE_MS = 400;

export function PdfExport({ id }: { id: number }) {
  const [source, setSource] = useState("");
  const [formatOverride, setFormatOverride] = useState<InputFormat | null>(
    null,
  );
  const [pageSize, setPageSize] = useState<PageSizeName>("device");
  const [margin, setMargin] = useState<MarginName>("normal");
  const [title, setTitle] = useState("");
  const [fileName, setFileName] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const previewUrlRef = useRef<string | null>(null);
  const blobRef = useRef<Blob | null>(null);

  const format = formatOverride ?? detectFormat(source);
  const hasContent = source.trim() !== "";

  // Synchronising with an external system (the PDF engine) on a debounced
  // change is what effects are for. `cancelled` keeps a slow run from
  // overwriting the result of a newer one.
  useEffect(() => {
    if (!hasContent) {
      setPreviewUrl(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setBusy(true);

    const timer = window.setTimeout(async () => {
      try {
        const nodes = await parseInput(source, format);
        const resolved = title.trim() || resolveTitle(nodes, fileName);
        const blob = await generatePdfBlob(
          buildDocDefinition(nodes, { pageSize, margin, title: resolved }),
        );
        if (cancelled) return;

        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        blobRef.current = blob;
        setPreviewUrl(url);
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not build the PDF.");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [source, format, pageSize, margin, title, fileName, hasContent]);

  // Release the last preview URL on unmount. Empty deps keep this
  // StrictMode-safe: the ref is null during the simulated remount.
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const handleFile = async (file: File) => {
    setFileName(file.name.replace(/\.[^.]+$/, ""));
    setSource(await file.text());
    setFormatOverride(null);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const html = e.clipboardData.getData("text/html");
    if (html) {
      e.preventDefault();
      setSource(html);
      setFormatOverride("html");
    }
  };

  const download = () => {
    if (!blobRef.current) return;
    const name = (title.trim() || fileName || "document").replace(
      /[^\w-]+/g,
      "-",
    );
    const url = URL.createObjectURL(blobRef.current);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${name}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Widget windowID={id} initialHeight={560} initialWidth={760}>
      <Widget.Title>PDF Exporter</Widget.Title>
      <Widget.Body className="grid grid-cols-2 gap-1 lg:gap-4 pb-2 lg:pb-4">
        <div className="field-row-stacked h-full">
          <div className="field-row">
            <label htmlFor={`pdf-format-${id}`}>Format</label>
            <select
              id={`pdf-format-${id}`}
              value={format}
              onChange={(e) => setFormatOverride(e.target.value as InputFormat)}
            >
              <option value="text">Plain text</option>
              <option value="markdown">Markdown</option>
              <option value="html">HTML</option>
            </select>
            <label
              htmlFor={`pdf-file-${id}`}
              className="shadow-neumorphic cursor-pointer px-2"
            >
              Choose File
            </label>
            <input
              id={`pdf-file-${id}`}
              type="file"
              accept=".txt,.md,.markdown,.html,.htm"
              className="hidden"
              onChange={(e) =>
                e.target.files?.[0] && handleFile(e.target.files[0])
              }
            />
          </div>
          <label htmlFor={`pdf-source-${id}`}>Content</label>
          <textarea
            id={`pdf-source-${id}`}
            className="h-full w-full"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            onPaste={handlePaste}
          />
        </div>

        <div className="field-row-stacked h-full">
          <label htmlFor={`pdf-preview-${id}`}>Preview</label>
          {previewUrl ? (
            // No `sandbox` attribute: verified in Chrome that ANY sandbox
            // value (including "allow-same-origin") makes the browser block
            // the blob: URL outright (net::ERR_BLOCKED_BY_CLIENT), so a
            // sandboxed frame can never render this preview. This is safe
            // without one anyway -- the src is always a blob: URL this
            // widget just created from pdfmake's own output, never
            // third-party or user-supplied markup, so there's no untrusted
            // origin for a sandbox to contain.
            <iframe
              id={`pdf-preview-${id}`}
              title="PDF preview"
              src={previewUrl}
              className="h-full w-full border border-gray-600 bg-white"
            />
          ) : (
            <div
              id={`pdf-preview-${id}`}
              className="h-full w-full border border-gray-600 bg-white flex items-center justify-center text-center p-4"
            >
              {error ?? "Paste or upload something to see it here."}
            </div>
          )}
        </div>
      </Widget.Body>

      <Widget.Status>
        <div className="field-row">
          <label htmlFor={`pdf-page-${id}`}>Page</label>
          <select
            id={`pdf-page-${id}`}
            value={pageSize}
            onChange={(e) => setPageSize(e.target.value as PageSizeName)}
          >
            <option value="device">reMarkable</option>
            <option value="a4">A4</option>
            <option value="letter">Letter</option>
          </select>
          <label htmlFor={`pdf-margin-${id}`}>Margin</label>
          <select
            id={`pdf-margin-${id}`}
            value={margin}
            onChange={(e) => setMargin(e.target.value as MarginName)}
          >
            <option value="narrow">Narrow</option>
            <option value="normal">Normal</option>
            <option value="wide">Wide</option>
            <option value="wideOuter">Wide outer</option>
          </select>
          <label htmlFor={`pdf-title-${id}`}>Title</label>
          <input
            id={`pdf-title-${id}`}
            type="text"
            value={title}
            placeholder="from first heading"
            onChange={(e) => setTitle(e.target.value)}
          />
          <button
            type="button"
            onClick={download}
            disabled={!hasContent || !previewUrl}
          >
            Download PDF
          </button>
        </div>
      </Widget.Status>
      {busy && <Widget.Status>Building PDF…</Widget.Status>}
    </Widget>
  );
}
