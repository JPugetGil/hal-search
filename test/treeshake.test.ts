import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import type { Plugin } from 'vite';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Tree-shaking of the published ES bundle
// ---------------------------------------------------------------------------

// dist/hal-search.es.js is one file: a bundler can only drop the parts an app does not use when every
// top-level statement of the widget, its stylesheet and the web component is side-effect free.
// Builds the bundle with the real vite.config.ts, then an app importing a few functions from it.

const ROOT = fileURLToPath(new URL('..', import.meta.url));

type BuildOutput = { output: { code: string }[] }[];

/** dist/hal-search.es.js as `npm run build` writes it (in memory). */
async function buildLibrary(): Promise<string> {
  const result = (await build({
    root: ROOT,
    configFile: `${ROOT}vite.config.ts`,
    logLevel: 'silent',
    build: { write: false, sourcemap: false, lib: { entry: `${ROOT}src/index.ts`, formats: ['es'] } },
  })) as BuildOutput;
  return result[0].output[0].code;
}

/** Bundles `app` (which imports from 'hal-search') against `library`, minified. */
async function buildApp(library: string, app: string): Promise<string> {
  const files: Record<string, string> = { '\0app.js': app, '\0hal-search.js': library };
  const virtual: Plugin = {
    name: 'virtual-files',
    enforce: 'pre',
    // Vite resolves the lib entry against the root: `…/app`.
    resolveId: (id) => (/(^|[\\/])app$/.test(id) ? '\0app.js' : id === 'hal-search' ? '\0hal-search.js' : undefined),
    load: (id) => files[id],
  };
  const result = (await build({
    root: ROOT,
    configFile: false,
    logLevel: 'silent',
    plugins: [virtual],
    build: {
      write: false,
      lib: { entry: 'app', formats: ['es'], fileName: 'app' },
      rolldownOptions: { output: { minify: true } },
    },
  })) as BuildOutput;
  return result[0].output[0].code;
}

/** Strings that only exist in the DOM-only modules. */
const DOM_MARKERS = {
  stylesheet: '.hal-pagination__list', // DEFAULT_CSS text (styles.ts)
  stylesheetHelpers: '--hal-shadow', // the calls building DEFAULT_CSS (styles.ts)
  styleInjection: 'hal-search-styles', // injectDefaultStyles (styles.ts)
  webComponent: 'customElements', // element.ts
  webComponentAttributes: 'heading-level', // HAL_SEARCH_ATTRIBUTES (element.ts)
  htmlRenderer: 'createElement', // renderer.ts / HalSearch.ts
};

function domParts(code: string): string[] {
  return Object.entries(DOM_MARKERS)
    .filter(([, marker]) => code.includes(marker))
    .map(([name]) => name);
}

describe('ES bundle tree-shaking', () => {
  it('lets an app importing only renderSvg / fetchSvg / buildHalUrl drop the HTML widget', async () => {
    const library = await buildLibrary();
    // The markers are really in the bundle: the test would catch them.
    expect(domParts(library)).toEqual(Object.keys(DOM_MARKERS));

    for (const name of ['renderSvg', 'fetchSvg', 'buildHalUrl']) {
      const app = await buildApp(library, `import { ${name} } from 'hal-search';\nexport default ${name};\n`);
      expect(domParts(app), name).toEqual([]);
      expect(app.length, name).toBeLessThan(library.length / 2);
    }

    const widget = await buildApp(library, `import { HalSearch } from 'hal-search';\nexport default HalSearch;\n`);
    expect(domParts(widget)).toEqual(expect.arrayContaining(['stylesheet', 'styleInjection', 'htmlRenderer']));
  }, 30_000);
});
