import { useEffect, useRef, useState } from "react";
import type { Worker as TesseractWorker } from "tesseract.js";
import { Widget } from "@/components/widget";

export function ImageOCR({ id }: { id: number }) {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);
  // Tracked in a ref as well as state so cleanup can reach the current URL
  // without re-subscribing an effect on every change.
  const imageUrlRef = useRef<string | null>(null);

  // Show a new image, revoking the previous object URL so it doesn't leak.
  const showImage = (file: File) => {
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    const url = URL.createObjectURL(file);
    imageUrlRef.current = url;
    setImageFile(file);
    setImageUrl(url);
    setOcrText("");
    setProgress(0);
    runOCR(file);
  };

  // handle file uploads
  const handleFiles = (files: FileList) => {
    const file = files[0];
    if (file?.type.startsWith("image/")) {
      showImage(file);
    }
  };

  const handleClipboard = async () => {
    try {
      const items = await navigator.clipboard.read();

      // Locate the first image synchronously, then read it once. Awaiting
      // inside the loop serialised reads for entries we end up discarding.
      let match: { item: ClipboardItem; type: string } | undefined;
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) {
          match = { item, type };
          break;
        }
      }
      if (!match) return;

      const blob = await match.item.getType(match.type);
      showImage(new File([blob], "clipboard-image", { type: blob.type }));
    } catch (error) {
      console.error("Failed to read clipboard contents:", error);
    }
  };

  // Revoke the last object URL and shut the OCR worker down when the widget
  // unmounts. Empty deps are what make this correct: the previous version had
  // no dependency array at all, so the cleanup ran after every render and
  // revoked the URL of the image still on screen. Empty deps are also
  // StrictMode-safe, since both refs are still null during the simulated
  // unmount/remount on mount.
  useEffect(() => {
    return () => {
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
      workerPromiseRef.current?.then((worker) => worker.terminate());
    };
  }, []);

  // One worker for the widget's lifetime, created on first use: spawning the
  // Web Worker and instantiating the WASM core costs seconds per image when
  // done per run. tesseract.js is also dynamically imported here so it stays
  // out of the main bundle (same discipline as pdfmake/marked/mermaid).
  // Memoising the *promise* (not the worker) keeps two quick successive
  // images from racing two workers into existence; clearing it on failure
  // lets a later attempt retry instead of replaying the same rejection.
  const workerPromiseRef = useRef<Promise<TesseractWorker> | null>(null);

  const getWorker = () => {
    if (!workerPromiseRef.current) {
      workerPromiseRef.current = (async () => {
        try {
          const { createWorker } = await import("tesseract.js");
          return await createWorker("eng", undefined, {
            logger: (m) => {
              if (m.status === "recognizing text") {
                setProgress(m.progress);
              }
            },
          });
        } catch (error) {
          workerPromiseRef.current = null;
          throw error;
        }
      })();
    }
    return workerPromiseRef.current;
  };

  const runOCR = async (img: File) => {
    try {
      const worker = await getWorker();
      const {
        data: { text },
      } = await worker.recognize(img);
      setOcrText(text);
    } catch (error) {
      console.error("OCR failed:", error);
    } finally {
      // On success this completes the progress bar; on failure it clears the
      // bar instead of leaving it stuck mid-way forever. The worker is kept
      // for the next attempt either way -- unmount is what terminates it.
      setProgress(1);
    }
  };

  return (
    <Widget windowID={id} initialHeight={600} initialWidth={600}>
      <Widget.Title>Image OCR</Widget.Title>
      <Widget.Body className="flex flex-col gap-1 lg:gap-4 pb-2 lg:pb-4 overflow-auto">
        <div className="flex justify-between items-center">
          <label
            htmlFor="ocr-file-upload"
            className="shadow-neumorphic active:shadow-neumorphic-active cursor-pointer h-4 px-2 mx-1"
          >
            Choose File
          </label>
          <input
            type="file"
            id="ocr-file-upload"
            accept="image/*"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
            className="hidden"
          />
          <button type="button" onClick={handleClipboard}>
            Paste Image from Clipboard
          </button>
        </div>
        {imageUrl && (
          <div className="m-1 max-h-48 overflow-y-auto">
            <img
              src={imageUrl}
              alt="Uploaded"
              className="max-w-full border border-gray-600"
            />
          </div>
        )}
        {ocrText && (
          <div className="mt-2">
            {/* The heading already names this field visually; pointing the
                textarea at it gives screen readers the same name without
                duplicating the text. The widget id keeps it unique when
                several OCR windows are open. */}
            <h3 id={`ocr-extracted-${id}`} className="font-mono !text-lg">
              Extracted Text
            </h3>
            <textarea
              aria-labelledby={`ocr-extracted-${id}`}
              value={ocrText}
              readOnly
              rows={10}
              className="w-full p-2 !font-mono"
            />
          </div>
        )}
      </Widget.Body>
      {imageFile && progress < 1 && (
        <Widget.Status>
          <div className="progress-indicator segmented">
            <span
              className="progress-indicator-bar"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </Widget.Status>
      )}
    </Widget>
  );
}
