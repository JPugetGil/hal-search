import { DetailLevel, HalSearch } from '../../src/index.ts';
import { JSDOM } from 'jsdom';

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function render(url, query) {
  // Create a minimal DOM environment
  const dom = new JSDOM(`<!DOCTYPE html><div id="app"></div>`, {
    url: "http://localhost/",
    resources: "usable", 
  });
  
  // Polyfill globals needed by HalSearch
  global.window = dom.window;
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  global.SVGElement = dom.window.SVGElement;
  global.Node = dom.window.Node;
  
  // HalSearch relies on URLSearchParams and other globals being present
  // Node environments have URLSearchParams globally since v10
  
  // Ensure fetch is available on window if library uses window.fetch
  if (typeof fetch !== 'undefined') {
    global.window.fetch = fetch;
  }

  const params = query instanceof URLSearchParams ? query : new URLSearchParams(query);
  const uid = params.get('uid') || 'jpugetgil';
  const lvl = parseInt(params.get('lvl') || '1', 3);
  const rows = parseInt(params.get('rows') || '10', 10);
  const output = params.get('output') === 'svg' ? 'svg' : 'html';

  const level: DetailLevel = [0, 1, 2, 3].includes(lvl) ? (lvl as DetailLevel) : 1;
  
  // HalSearch constructor resolves container. If container string selector is used, it looks in document.
  // We need to make sure 'document' is globally available at instantiation time.
  
  const hs = new HalSearch({
    lvl: level,
    rows,
    output,
    // Provide container selector for HTML mode
    container: output === 'html' ? '#app' : undefined,
  });

  try {
    const result = await hs.search({ uid });
    
    if (output === 'svg') {
       // result is the SVG element when output='svg' and no container provided
       if (result && typeof result.outerHTML === 'string') {
          return result.outerHTML;
       }
       // If result is somehow not the element (e.g. void if container was used, but we didn't pass one)
       return '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="50"><rect width="100%" height="100%" fill="#eee"/><text x="10" y="30" fill="red">Error generating SVG</text></svg>';
    } else {
      // Return HTML string from container
      const app = dom.window.document.getElementById('app');
      return app ? app.innerHTML : '';
    }
  } catch (err) {
    console.error("SSR Error:", err);
    return `<div class="error">SSR Error: ${err.message}</div>`;
  }
}
