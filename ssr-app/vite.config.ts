import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// The service always runs the library sources of this repository (../src): in dev (ssrLoadModule) and in
// the production SSR bundle (dist/server/render.js), so a deployment matches the repo without an npm publish.
// It imports the DOM-free subpath `hal-search/svg` (../src/svg-entry.ts). hal-search has no runtime
// dependency, so the bundle is self-contained.
const src = (file: string): string => fileURLToPath(new URL(`../src/${file}`, import.meta.url));

export default defineConfig({
  resolve: {
    // Exact matches: a string alias 'hal-search' would also rewrite 'hal-search/svg' to '…/index.ts/svg'.
    alias: [
      { find: /^hal-search\/svg$/, replacement: src('svg-entry.ts') },
      { find: /^hal-search$/, replacement: src('index.ts') },
    ],
  },
  build: {
    target: 'node20',
    minify: false,
    emptyOutDir: true,
  },
});
