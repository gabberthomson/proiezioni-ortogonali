import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  base: "/proiezioni-ortogonali/",
  root: "github-pages",
  publicDir: "../public",
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  build: {
    outDir: "../pages-dist",
    emptyOutDir: true,
  },
});
