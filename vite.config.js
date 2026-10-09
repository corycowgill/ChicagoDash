import { defineConfig } from 'vite';

// Relative base so the production build works from any static host or sub-path
// (GitHub Pages, S3, itch.io, a plain folder served by `npx serve dist`, ...).
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
});
