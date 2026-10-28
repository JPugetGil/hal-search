import { defineConfig } from 'vite';

// Library build: ES module, UMD (main / legacy <script>) and CommonJS (exports "require").
// The CDN bundle (dist/hal-search.min.js) has its own config: vite.config.cdn.ts.
// Type declarations are emitted by `tsc -p tsconfig.build.json` (last step of `npm run build`).
export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'HalSearch',
      formats: ['es', 'umd', 'cjs'],
      fileName: (format) => (format === 'cjs' ? 'hal-search.cjs' : `hal-search.${format}.js`),
    },
    rollupOptions: {
      external: [],
    },
    // Maps stay in dist/ for local debugging but are not published (package.json "files"): no sourceMappingURL.
    sourcemap: 'hidden',
    minify: 'oxc',
  },
});
