// Post-processes the emitted declarations (dist/*.d.ts). Runs after `tsc -p tsconfig.build.json`.
//
// 1. Adds the `.js` extension to their relative imports. The sources import `./query`, which bundler resolution
//    accepts, and tsc keeps specifiers as written. The package is `"type": "module"`, so TypeScript projects using
//    `moduleResolution: node16 / nodenext` (plain Node) cannot resolve an extensionless `./query` inside
//    dist/index.d.ts and silently type the whole package as `any`. `./query.js` resolves to `./query.d.ts` under
//    every resolution mode.
// 2. Writes a CommonJS twin of each one, `*.d.cts` importing `./query.cjs` (which resolves to `./query.d.cts`):
//    the `types` of the `require` conditions in package.json. In a `"type": "module"` package a `.d.ts` describes an
//    ES module, so `import x = require('hal-search')` in a `.cts` file failed with TS1471 under `module: node16`,
//    although the `require` condition does load CommonJS code (dist/*.cjs). The declarations contain no
//    format-specific syntax (no default export, no `import.meta`): only the specifiers differ.
//
// Usage: node scripts/dts-extensions.mjs [dir]   (default: dist/; the argument is for tests)
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('../dist/', import.meta.url));
const SPECIFIER = /(\bfrom\s+|\bimport\s*\(\s*)(['"])(\.\.?\/[^'"]+)\2/g;

/** Rewrites every relative specifier of `source` with `rename(specifier)`. */
function rewriteSpecifiers(source, rename) {
  return source.replace(SPECIFIER, (match, lead, quote, specifier) => `${lead}${quote}${rename(specifier)}${quote}`);
}

/** `./query` → `./query.js`; specifiers that already have an extension are kept. */
const withJs = (specifier) => (/\.(?:[cm]?js|json)$/.test(specifier) ? specifier : `${specifier}.js`);

/** `./query.js` → `./query.cjs` (run on the output of withJs). */
const withCjs = (specifier) => specifier.replace(/\.js$/, '.cjs');

// Twins left by a previous build of a module that no longer exists would otherwise ship.
for (const file of readdirSync(DIST).filter((name) => name.endsWith('.d.cts'))) rmSync(join(DIST, file));

let changed = 0;
let twins = 0;
for (const file of readdirSync(DIST).filter((name) => name.endsWith('.d.ts'))) {
  const path = join(DIST, file);
  const source = readFileSync(path, 'utf8');
  const esm = rewriteSpecifiers(source, withJs);
  if (esm !== source) {
    writeFileSync(path, esm);
    changed++;
  }
  writeFileSync(join(DIST, file.replace(/\.d\.ts$/, '.d.cts')), rewriteSpecifiers(esm, withCjs));
  twins++;
}
console.log(`dts-extensions: ${changed} declaration file(s) updated, ${twins} .d.cts written`);
