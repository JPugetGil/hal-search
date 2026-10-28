import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const src = (file: string): string => fileURLToPath(new URL(`./src/${file}`, import.meta.url));

export default defineConfig({
  resolve: {
    // The SSR app imports the library by its package name; tests run it against the local sources.
    // Exact matches: a string alias 'hal-search' would also rewrite 'hal-search/svg'.
    alias: [
      { find: /^hal-search\/svg$/, replacement: src('svg-entry.ts') },
      { find: /^hal-search$/, replacement: src('index.ts') },
    ],
  },
  test: {
    include: ['test/**/*.test.ts'],
    // Pure modules run in Node. DOM tests opt in with `// @vitest-environment happy-dom`.
    environment: 'node',
  },
});
