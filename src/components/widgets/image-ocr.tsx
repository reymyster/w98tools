import { useState, useEffect } from "react";
import { createWorker } from "tesseract.js";
import { Widget } from "@/components/widget";

export function ImageOCR({ id }: { id: number }) {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);

  // handle file uploads
  const handleFiles = (files: FileList) => {
    const file = files[0];
    if (file && file.type.startsWith("image/")) {
      setImageFile(file);
      const url = URL.createObjectURL(file);
      setImageUrl(url);
      setOcrText("");
      setProgress(0);
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
            setImageFile(file);
            const url = URL.createObjectURL(file);
            setImageUrl(url);
            setOcrText("");
            setProgress(0);
            return;
          }
        }
      }
    } catch (error) {
      console.error("Failed to read clipboard contents:", error);
    }
  };

  // clean up if Widget unmounted
  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  });

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

  // run OCR when imageFile changes
  useEffect(() => {
    runOCR(imageFile);
  }, [imageFile]);

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
          <button onClick={handleClipboard}>Paste Image from Clipboard</button>
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
            <h3>Extracted Text</h3>
            <textarea
              value={ocrText}
              readOnly
              rows={10}
              className="w-full p-2"
            />
          </div>
        )}
      </Widget.Body>
      {imageFile && (
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
