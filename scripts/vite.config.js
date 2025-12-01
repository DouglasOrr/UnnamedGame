import { defineConfig } from "vite";

export default defineConfig({
  root: "src",
  publicDir: "static",
  base: "./",
  build: {
    outDir: "../dist",
    chunkSizeWarningLimit: 2000,
  },
});
