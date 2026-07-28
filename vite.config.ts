/// <reference types="vitest/config" />
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: "jsdom",
    // No `globals: true` — specs import describe/it/expect explicitly, so TS
    // sees them without needing vitest's ambient types in tsconfig.
    setupFiles: ["./src/test/setup.ts"],
    // Only our own specs; without this the widgets' own node_modules copies
    // of test files would be picked up too.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  define: {
    // react-draggable (bundled inside react-rnd) reads
    // process.env.DRAGGABLE_DEBUG in its log() helper, which runs on drag and
    // on Rnd's reposition path. The production build already rewrites
    // process.env to ({}), but Vite 8's dep pre-bundler leaves it bare, so the
    // dev server threw "process is not defined" and unmounted the whole app
    // (white screen) the moment you dragged or maximized a window.
    "process.env.DRAGGABLE_DEBUG": "false",
  },
  build: {
    // Vite 8 defaults to lightningcss, which rejects the malformed
    // `@media (not(hover))` rule shipped inside 98.css@0.1.21 (missing a
    // space). esbuild is lenient. Revisit if 98.css ever fixes it upstream.
    cssMinify: "esbuild",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
