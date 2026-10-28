import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    // The SSR app imports the library by its package name; tests run it against the local sources.
    alias: { 'hal-search': fileURLToPath(new URL('./src/index.ts', import.meta.url)) },
  },
  test: {
    include: ['test/**/*.test.ts'],
    // Pure modules run in Node. DOM tests opt in with `// @vitest-environment happy-dom`.
    environment: 'node',
  },
});
