// Node environment on purpose (no DOM globals): `hal-search/svg` (src/svg-entry.ts) is the DOM-free entry
// for Node, edge runtimes and the SVG service.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as index from '../src/index';
import * as svgEntry from '../src/svg-entry';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Runtime exports of the main entry that need a DOM: the HTML widget, its stylesheet, the web component. */
const DOM_ONLY_EXPORTS = ['DEFAULT_CSS', 'HalSearch', 'defineHalSearchElement', 'injectDefaultStyles'];

/**
 * Type exports of the main entry that name DOM types (HTMLElement, Document, ShadowRoot...): a Node project
 * without the DOM lib could not compile the svg entry's declarations with them (`skipLibCheck: false`).
 */
const DOM_ONLY_TYPES = ['HalSearchOptions', 'HalSearchState'];

/** Modules the DOM-free entry must never load. */
const DOM_MODULES = ['HalSearch', 'element', 'renderer', 'styles'];

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

function sourceOf(module: string): string {
  return readFileSync(`${SRC}${module}.ts`, 'utf8');
}

/** Imports and re-exports of a src/ module; type-only ones (erased at runtime) only when `withTypes`. */
function dependencies(module: string, withTypes = false): string[] {
  const deps: string[] = [];
  for (const match of sourceOf(module).matchAll(/^(?:import|export)\s+(type\s+)?[^;'"]*?from\s+'\.\/([\w-]+)'/gm)) {
    if (withTypes || !match[1]) deps.push(match[2]);
  }
  return deps;
}

/** Value imports and re-exports (`import type` / `export type` are erased) of a src/ module. */
function valueDependencies(module: string): string[] {
  return dependencies(module);
}

/** Every src/ module loaded at runtime from `entry` (or whose declarations it references, `withTypes`). */
function moduleGraph(entry: string, withTypes = false): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const module = queue.pop() as string;
    if (seen.has(module)) continue;
    seen.add(module);
    queue.push(...dependencies(module, withTypes));
  }
  return seen;
}

/** Names re-exported by the `export type { … }` statements of a src/ module. */
function typeExports(module: string): string[] {
  const names: string[] = [];
  for (const match of sourceOf(module).matchAll(/^export\s+type\s*\{([^}]*)\}/gm)) {
    names.push(...match[1].split(',').map((name) => name.trim()).filter(Boolean));
  }
  return names;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('hal-search/svg entry', () => {
  it('re-exports the bindings of the main entry', () => {
    const main = index as Record<string, unknown>;
    for (const [name, value] of Object.entries(svgEntry)) {
      expect(name in main, `${name} is missing from src/index.ts`).toBe(true);
      expect(main[name], name).toBe(value);
    }
  });

  it('exports everything of the main entry except the DOM-only API', () => {
    // A failure here usually means a new export was added to src/index.ts only: add it to src/svg-entry.ts
    // too when it works without a DOM, or to DOM_ONLY_EXPORTS otherwise.
    const missing = Object.keys(index).filter((name) => !(name in svgEntry));
    expect(missing.sort()).toEqual(DOM_ONLY_EXPORTS);
  });

  it('never loads the DOM modules', () => {
    const graph = moduleGraph('svg-entry');
    expect(graph.has('svg')).toBe(true);
    expect(graph.has('headless')).toBe(true);
    expect(DOM_MODULES.filter((module) => graph.has(module))).toEqual([]);
  });

  it('exports the types of the main entry except the DOM-only ones', () => {
    // Type exports are erased at runtime: compared on the sources. A failure here usually means a type was
    // added to src/index.ts only (add it to src/svg-entry.ts when it compiles without the DOM lib), or a
    // DOM-only type to the svg entry (`npm run typecheck` also checks the entry without the DOM lib).
    const main = typeExports('index');
    const svg = typeExports('svg-entry');
    expect(svg.filter((name) => !main.includes(name))).toEqual([]);
    expect(main.filter((name) => !svg.includes(name)).sort()).toEqual(DOM_ONLY_TYPES);
  });

  it('never references the declarations of the DOM modules, even type-only', () => {
    const graph = moduleGraph('svg-entry', true);
    expect(graph.has('types')).toBe(true);
    expect(DOM_MODULES.filter((module) => graph.has(module))).toEqual([]);
  });

  it('follows multi-line and type-only imports correctly', () => {
    // Sanity check of the scanner itself: the main entry does reach the DOM modules.
    const graph = moduleGraph('index');
    expect(DOM_MODULES.filter((module) => graph.has(module))).toEqual(DOM_MODULES);
    expect(valueDependencies('svg')).toContain('format'); // multi-line `import { … } from './format'`
    expect(valueDependencies('svg')).not.toContain('types'); // `import type`
  });

  it('renders SVG without DOM globals', () => {
    expect(typeof document).toBe('undefined');
    const svg = svgEntry.renderSvg(
      [{ docid: '1', label_s: 'A. Author. A title. 2024', uri_s: 'https://hal.science/hal-00000001', producedDateY_i: 2024 }],
      { totalFound: 1, lvl: 0 },
    );
    expect(svg.startsWith('<svg ')).toBe(true);
    expect(svg).toContain('A title');
    expect(svgEntry.renderErrorSvg('Oops')).toContain('<title>Oops</title>');
  });
});
