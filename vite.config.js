import { defineConfig } from 'vite';
import { cpSync } from 'node:fs';

// The repo root is also a no-build static site (see index.html's import map),
// so the production build has two extra jobs: drop the import map, since the
// bundle carries Three.js itself, and copy the vendored studio intro, which is a
// classic script Vite leaves alone.
const staticSite = () => ({
  name: 'chicago-dash-static',
  apply: 'build',
  transformIndexHtml: (html) => html.replace(/\s*<script type="importmap">[\s\S]*?<\/script>/, ''),
  closeBundle() {
    cpSync('intro', 'dist/intro', { recursive: true });
  },
});

// Relative base so the build works from any static host or sub-path.
export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [staticSite()],
  build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
});
