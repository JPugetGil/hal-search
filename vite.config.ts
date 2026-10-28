import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

// Library build: ES module, UMD (main / legacy <script>) and CommonJS (exports "require").
// The CDN bundle (dist/hal-search.min.js) has its own config: vite.config.cdn.ts.
export default defineConfig({
  plugins: [
    dts({
      include: ['src'],
      exclude: ['src/cdn.ts'],
      insertTypesEntry: true,
    }),
  ],
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
    sourcemap: true,
    minify: 'oxc',
  },
});
