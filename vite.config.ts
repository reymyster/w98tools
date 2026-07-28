import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
