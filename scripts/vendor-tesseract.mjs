// Copies tesseract.js's runtime assets out of node_modules into
// public/tesseract (gitignored; rebuilt by predev/prebuild) so OCR never
// loads executable code from a CDN. Without explicit workerPath/corePath/
// langPath, tesseract.js v7 importScripts() its worker, WASM core and
// traineddata from cdn.jsdelivr.net at runtime -- third-party script
// execution inside this origin, in an app whose premise is "fully
// client-side". The widget points at these copies instead
// (see image-ocr.tsx).
//
// Only the -lstm core variants are copied: createWorker() is called with
// the default OEM, which is LSTM-only, so the legacy variants are
// unreachable. The traineddata comes from @tesseract.js-data/eng's
// 4.0.0_best_int directory for the same reason (matches the lstmOnly
// default the CDN fallback would have used).
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "tesseract");

const COPIES = [
  ["node_modules/tesseract.js/dist/worker.min.js", "worker.min.js"],
  [
    "node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js",
    "core/tesseract-core-lstm.wasm.js",
  ],
  [
    "node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js",
    "core/tesseract-core-simd-lstm.wasm.js",
  ],
  [
    "node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js",
    "core/tesseract-core-relaxedsimd-lstm.wasm.js",
  ],
  [
    "node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
    "lang/eng.traineddata.gz",
  ],
];

for (const [from, to] of COPIES) {
  const target = join(out, to);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(root, from), target);
}
console.log(`vendored ${COPIES.length} tesseract assets into public/tesseract`);
