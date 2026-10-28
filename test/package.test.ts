// Package metadata and the declaration post-processing (scripts/dts-extensions.mjs): how TypeScript projects
// resolve the types of `hal-search` and `hal-search/svg` (ESM, CommonJS). Node environment, no build needed.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

interface Condition {
  types: string;
  default: string;
}

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  types: string;
  typesVersions?: Record<string, Record<string, string[]>>;
  exports: Record<string, string | { import: Condition; require: Condition }>;
};

/** The JavaScript entries of the package (subpath → import/require conditions). */
const ENTRIES = Object.entries(pkg.exports).filter(
  (entry): entry is [string, { import: Condition; require: Condition }] => typeof entry[1] === 'object',
);

// ---------------------------------------------------------------------------
// package.json
// ---------------------------------------------------------------------------

describe('package.json exports', () => {
  it('lists the two JavaScript entries', () => {
    expect(ENTRIES.map(([subpath]) => subpath)).toEqual(['.', './svg']);
  });

  it('gives each condition its own declarations: .d.ts for import, .d.cts for require', () => {
    for (const [subpath, { import: esm, require: cjs }] of ENTRIES) {
      // TypeScript takes the first matching condition: `types` must come first.
      expect(Object.keys(esm), subpath).toEqual(['types', 'default']);
      expect(Object.keys(cjs), subpath).toEqual(['types', 'default']);
      expect(esm.types, subpath).toMatch(/^\.\/dist\/[\w-]+\.d\.ts$/);
      expect(esm.default, subpath).toMatch(/\.es\.js$/);
      expect(cjs.types, subpath).toBe(esm.types.replace(/\.d\.ts$/, '.d.cts'));
      expect(cjs.default, subpath).toMatch(/\.cjs$/);
    }
  });

  it('maps every subpath for TypeScript projects that ignore `exports` (moduleResolution node10)', () => {
    // `types` covers the root; typesVersions the subpaths ('hal-search/svg' → node_modules/hal-search/svg).
    const root = ENTRIES.find(([subpath]) => subpath === '.')?.[1];
    expect(pkg.types).toBe(root?.import.types);
    const subpaths = Object.fromEntries(
      ENTRIES.filter(([subpath]) => subpath !== '.').map(([subpath, { import: esm }]) => [subpath.slice(2), [esm.types]]),
    );
    expect(pkg.typesVersions).toEqual({ '*': subpaths });
  });
});

// ---------------------------------------------------------------------------
// scripts/dts-extensions.mjs
// ---------------------------------------------------------------------------

describe('dts-extensions', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  function run(files: Record<string, string>): (name: string) => string {
    const target = mkdtempSync(join(tmpdir(), 'hal-dts-'));
    dir = target;
    for (const [name, content] of Object.entries(files)) writeFileSync(join(target, name), content);
    execFileSync(process.execPath, [join(ROOT, 'scripts/dts-extensions.mjs'), target], { stdio: 'pipe' });
    return (name) => readFileSync(join(target, name), 'utf8');
  }

  it('adds .js to the relative specifiers of the .d.ts files', () => {
    const read = run({
      'index.d.ts': "export { a } from './a';\nexport type { B } from './b.js';\nexport declare const c: typeof import('./a').a;\n",
      'a.d.ts': 'export declare const a: number;\n',
      'b.d.ts': 'export interface B {}\n',
    });
    expect(read('index.d.ts')).toBe(
      "export { a } from './a.js';\nexport type { B } from './b.js';\nexport declare const c: typeof import('./a.js').a;\n",
    );
  });

  it('writes a CommonJS twin of each declaration file, importing the .cjs twins', () => {
    const read = run({
      'index.d.ts': "export { a } from './a';\nexport declare const c: typeof import('./a').a;\n",
      'a.d.ts': "import type { B } from './b';\nexport declare const a: B;\n",
      'b.d.ts': 'export interface B {}\n',
    });
    expect(read('index.d.cts')).toBe("export { a } from './a.cjs';\nexport declare const c: typeof import('./a.cjs').a;\n");
    expect(read('a.d.cts')).toBe("import type { B } from './b.cjs';\nexport declare const a: B;\n");
    expect(read('b.d.cts')).toBe('export interface B {}\n');
  });

  it('removes the twins of declarations that no longer exist', () => {
    run({ 'a.d.ts': 'export declare const a: number;\n', 'gone.d.cts': 'export {};\n' });
    expect(existsSync(join(dir as string, 'gone.d.cts'))).toBe(false);
    expect(existsSync(join(dir as string, 'a.d.cts'))).toBe(true);
  });
});
