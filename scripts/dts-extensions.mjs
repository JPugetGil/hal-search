// Adds the `.js` extension to the relative imports of the emitted declarations (dist/*.d.ts).
//
// The sources import `./query`, which bundler resolution accepts, and tsc keeps specifiers as written. The
// package is `"type": "module"`, so TypeScript projects using `moduleResolution: node16 / nodenext` (plain Node)
// cannot resolve an extensionless `./query` inside dist/index.d.ts and silently type the whole package as `any`.
// `./query.js` resolves to `./query.d.ts` under every resolution mode. Runs after `tsc -p tsconfig.build.json`.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const SPECIFIER = /(\bfrom\s+|\bimport\s*\(\s*)(['"])(\.\.?\/[^'"]+)\2/g;

let changed = 0;
for (const file of readdirSync(DIST).filter((name) => name.endsWith('.d.ts'))) {
  const path = join(DIST, file);
  const source = readFileSync(path, 'utf8');
  const output = source.replace(SPECIFIER, (match, lead, quote, specifier) =>
    /\.(?:[cm]?js|json)$/.test(specifier) ? match : `${lead}${quote}${specifier}.js${quote}`,
  );
  if (output !== source) {
    writeFileSync(path, output);
    changed++;
  }
}
console.log(`dts-extensions: ${changed} declaration file(s) updated`);
