import { defineConfig } from 'vite';

// DOM-free subpath `hal-search/svg` (src/svg-entry.ts): ES module and CommonJS, self-contained like the main
// entry (no shared chunk), for Node, edge runtimes and SSR. Runs after vite.config.ts, so it must not empty dist/.
export default defineConfig({
  publicDir: false,
  build: {
    lib: {
      entry: 'src/svg-entry.ts',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'cjs' ? 'hal-search-svg.cjs' : 'hal-search-svg.es.js'),
    },
    rolldownOptions: {
      // Whitespace too: annotations such as /* @__PURE__ */ are kept (see vite.config.ts).
      output: { minify: true },
    },
    emptyOutDir: false,
    // Maps stay in dist/ for local debugging but are not published (package.json "files"): no sourceMappingURL.
    sourcemap: 'hidden',
    minify: 'oxc',
  },
});
