import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Browser compatibility of the shipped sources
// ---------------------------------------------------------------------------

const SRC = fileURLToPath(new URL('../src', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

describe('browser compatibility', () => {
  const files = sourceFiles(SRC);

  it('finds the library sources', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  // Safari < 16.4 throws a SyntaxError on regex lookbehinds when the script is parsed:
  // a single one makes the whole bundle fail to load.
  it.each(files.map((file) => [relative(SRC, file), file]))('%s has no regex lookbehind', (_name, file) => {
    const lines = readFileSync(file, 'utf8').split('\n');
    const offending = lines
      .map((line, index) => ({ line: index + 1, text: line.trim() }))
      .filter(({ text }) => text.includes('(?<=') || text.includes('(?<!'));
    expect(offending).toEqual([]);
  });
});
