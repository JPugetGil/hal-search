import { defineConfig } from 'vite';

// CDN bundle: minified IIFE exposing the global `HalSearch` namespace and registering <hal-search>.
// Runs after vite.config.ts (`npm run build`), so it must not empty dist/.
export default defineConfig({
  publicDir: false,
  build: {
    lib: {
      entry: 'src/cdn.ts',
      name: 'HalSearch',
      formats: ['iife'],
      fileName: () => 'hal-search.min.js',
    },
    emptyOutDir: false,
    sourcemap: true,
    minify: 'oxc',
  },
});
