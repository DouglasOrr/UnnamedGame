import { defineConfig } from "vite";

export default defineConfig({
  root: "src",
  publicDir: "static",
  build: {
    outDir: "../dist",
    chunkSizeWarningLimit: 2000,
  },
});
