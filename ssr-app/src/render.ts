import { DetailLevel, HalSearch } from 'hal-search';
import { JSDOM } from 'jsdom';

export interface RenderParams {
  uid: string;
  lvl: DetailLevel;
  rows: number;
  output: 'html' | 'svg';
}

export function parseParams(searchParams: URLSearchParams): RenderParams {
  const lvl = parseInt(searchParams.get('lvl') || '1', 10);
  return {
    uid: searchParams.get('uid') || 'jpugetgil',
    lvl: ([0, 1, 2, 3].includes(lvl) ? lvl : 1) as DetailLevel,
    rows: parseInt(searchParams.get('rows') || '10', 10),
    output: searchParams.get('output') === 'svg' ? 'svg' : 'html',
  };
}

export async function renderHalSearch(
  params: RenderParams,
): Promise<{ html: string; head: string } | string> {
  const dom = new JSDOM(
    `<!DOCTYPE html><html><head></head><body><div id="app"></div></body></html>`,
    { url: 'http://localhost/' },
  );

  const g = global as Record<string, unknown>;
  const prevWindow = g.window;
  const prevDocument = g.document;
  const prevHTMLElement = g.HTMLElement;
  const prevSVGElement = g.SVGElement;
  const prevNode = g.Node;

  g.window = dom.window;
  g.document = dom.window.document;
  g.HTMLElement = dom.window.HTMLElement;
  g.SVGElement = dom.window.SVGElement;
  g.Node = dom.window.Node;

  if (typeof fetch !== 'undefined') {
    (global as any).window.fetch = fetch;
  }

  try {
    const hs = new HalSearch({
      lvl: params.lvl,
      rows: params.rows,
      output: params.output,
      container: params.output === 'html' ? '#app' : undefined,
    });

    const result = await hs.search({ uid: params.uid });

    if (params.output === 'svg') {
      if (result && typeof result.outerHTML === 'string') {
        return result.outerHTML;
      }
      return '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="50"><rect width="100%" height="100%" fill="#eee"/><text x="10" y="30" fill="red">Error generating SVG</text></svg>';
    }

    const app = dom.window.document.getElementById('app');
    const head = dom.window.document.head?.innerHTML ?? '';
    return { html: app ? app.innerHTML : '', head };
  } catch (err) {
    console.error('SSR Error:', err);
    const message = err instanceof Error ? err.message : String(err);
    if (params.output === 'svg') {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="50"><rect width="100%" height="100%" fill="#eee"/><text x="10" y="30" fill="red">SSR Error: ${message}</text></svg>`;
    }
    return { html: `<div class="error">SSR Error: ${message}</div>`, head: '' };
  } finally {
    g.window = prevWindow;
    g.document = prevDocument;
    g.HTMLElement = prevHTMLElement;
    g.SVGElement = prevSVGElement;
    g.Node = prevNode;
    dom.window.close();
  }
}
