import { defineConfig } from "vite";

export default defineConfig({
  build: {
    // Three.js is deliberately loaded on demand; its engine chunk is about 231 KiB gzipped.
    chunkSizeWarningLimit: 950,
  },
});
