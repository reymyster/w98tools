import { useEffect, useRef, useState } from "react";
import { createWorker } from "tesseract.js";
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
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith("image/")) {
            const blob = await item.getType(type);
            const file = new File([blob], "clipboard-image", {
              type: blob.type,
            });
            showImage(file);
            return;
          }
        }
      }
    } catch (error) {
      console.error("Failed to read clipboard contents:", error);
    }
  };

  // Revoke the last object URL when the widget unmounts. Empty deps are what
  // make this correct: the previous version had no dependency array at all, so
  // the cleanup ran after every render and revoked the URL of the image still
  // on screen. Empty deps are also StrictMode-safe, since the ref is still
  // null during the simulated unmount/remount on mount.
  useEffect(() => {
    return () => {
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    };
  }, []);

  const runOCR = async (img: File | null) => {
    if (!img) return;
    const worker = await createWorker("eng", undefined, {
      logger: (m) => {
        console.log("m.status", m.status);
        if (m.status === "recognizing text") {
          setProgress(m.progress);
        }
      },
    });
    const {
      data: { text },
    } = await worker.recognize(img);
    console.log({ text });
    setOcrText(text);
    setProgress(1);
    await worker.terminate();
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
            <h3 className="font-mono !text-lg">Extracted Text</h3>
            <textarea
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
