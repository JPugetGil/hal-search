import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// The service always runs the library sources of this repository (../src): in dev (ssrLoadModule) and in
// the production SSR bundle (dist/server/render.js), so a deployment matches the repo without an npm publish.
// hal-search has no runtime dependency, so the bundle is self-contained.
export default defineConfig({
  resolve: {
    alias: {
      'hal-search': fileURLToPath(new URL('../src/index.ts', import.meta.url)),
    },
  },
  build: {
    target: 'node20',
    minify: false,
    emptyOutDir: true,
  },
});
