import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({
      include: ['src'],
      insertTypesEntry: true,
    }),
  ],
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'HalSearch',
      formats: ['es', 'umd'],
      fileName: (format) => `hal-search.${format}.js`,
    },
    rollupOptions: {
      external: [],
    },
    sourcemap: true,
    minify: 'esbuild',
  },
});
