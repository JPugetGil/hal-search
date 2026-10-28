// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FetchParams, HalApiResponse, HalDoc } from '../src/types';

// ---------------------------------------------------------------------------
// Mocks: the widget is tested against the contract signatures of the other modules
// ---------------------------------------------------------------------------

vi.mock('../src/api', () => ({
  DEFAULT_BASE: 'https://api.example/search/',
  fetchArticles: vi.fn(),
  isAbortError: (err: unknown) => (err as Error | undefined)?.name === 'AbortError',
}));

// Same aria-busy contract as the real renderer: set while loading, cleared by results and errors.
vi.mock('../src/renderer', () => ({
  renderLoading: vi.fn((c: HTMLElement) => {
    c.textContent = 'loading';
    c.setAttribute('aria-busy', 'true');
  }),
  renderError: vi.fn((c: HTMLElement, err: Error) => {
    c.textContent = `error:${err.message}`;
    c.removeAttribute('aria-busy');
  }),
  renderResults: vi.fn((c: HTMLElement, docs: HalDoc[]) => {
    c.textContent = `results:${docs.map((d) => d.docid).join(',')}`;
    c.removeAttribute('aria-busy');
  }),
  renderMissingQuery: vi.fn((c: HTMLElement, labels: { missingQuery: string }) => {
    c.textContent = `missing:${labels.missingQuery}`;
    c.removeAttribute('aria-busy');
  }),
}));

vi.mock('../src/styles', () => ({
  injectDefaultStyles: vi.fn(),
  // Same contract as the real one (tested in styles.test.ts), observable in the DOM: a <style> with the attributes.
  attachStyleSheet: vi.fn((root: Document | ShadowRoot, css: string, attributes: Record<string, string> = {}) => {
    const style = document.createElement('style');
    for (const [name, value] of Object.entries(attributes)) style.setAttribute(name, value);
    style.textContent = css;
    (root.nodeType === 9 ? (root as Document).head : root).appendChild(style);
    return {
      update: (next: string) => {
        style.textContent = next;
      },
      remove: () => style.remove(),
    };
  }),
}));

vi.mock('../src/svg', () => ({
  renderSvgParts: vi.fn((docs: HalDoc[], o: { mainColor?: string; theme?: string; totalFound: number }) => ({
    markup: `<svg data-main="${o.mainColor ?? ''}" data-theme="${o.theme}" data-count="${docs.length}" data-total="${o.totalFound}"></svg>`,
    css: `.hal-svg-test{--main:${o.mainColor ?? 'none'};--theme:${o.theme}}`,
  })),
}));

vi.mock('../src/query', async (importOriginal) => {
  // The real criterion rule (shared with the element and the SSR), a fake web URL.
  const { buildSolrQuery, hasQueryCriterion } = await importOriginal<typeof import('../src/query')>();
  return { buildSolrQuery, hasQueryCriterion, buildHalWebUrl: vi.fn(() => 'https://hal.science/search/index/?q=x') };
});

vi.mock('../src/labels', () => ({
  resolveLabels: (o?: Record<string, unknown>) => ({
    loading: 'Loading…',
    error: 'Error: {message}',
    missingQuery: 'No search criterion given.',
    ...o,
  }),
}));

vi.mock('../src/theme', () => {
  const light = { cardBg: '#ffffff', text: '#111111', muted: '#666666', accent: '#0052cc', accentHover: '#003d99', accentText: '#ffffff', border: '#e0e0e0' };
  const dark = { cardBg: '#1e1e1e', text: '#eeeeee', muted: '#aaaaaa', accent: '#4c9aff', accentHover: '#79b4ff', accentText: '#000000', border: '#333333' };
  return {
    isSafeColor: (v: string) => /^#[0-9a-f]{3,8}$/i.test(v),
    resolvePalette: (o: { theme?: string; backgroundColor?: string; textColor?: string; mainColor?: string }) => {
      const p: Record<string, string> = { ...(o.theme === 'dark' ? dark : light) };
      if (o.backgroundColor) p.cardBg = o.backgroundColor;
      if (o.textColor) p.text = o.textColor;
      if (o.mainColor) Object.assign(p, { accent: o.mainColor, accentHover: `${o.mainColor}cc`, domainBg: `tint(${o.mainColor},${o.theme})` });
      return p;
    },
    paletteToCssVars: (p: Record<string, string>) =>
      Object.fromEntries(Object.entries(p).map(([k, v]) => [`--hal-${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`, v])),
  };
});

import { HalSearch } from '../src/HalSearch';
import { fetchArticles } from '../src/api';
import { renderError, renderLoading, renderMissingQuery, renderResults } from '../src/renderer';
import { renderSvgParts } from '../src/svg';
import { injectDefaultStyles } from '../src/styles';
import { buildHalWebUrl } from '../src/query';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface PendingCall {
  params: FetchParams;
  resolve: (r: HalApiResponse) => void;
  reject: (e: unknown) => void;
}

/** Makes fetchArticles return controllable promises. `honorAbort: false` simulates a late response. */
function controlFetch({ honorAbort = true } = {}): PendingCall[] {
  const calls: PendingCall[] = [];
  vi.mocked(fetchArticles).mockImplementation(
    (params: FetchParams) =>
      new Promise<HalApiResponse>((resolve, reject) => {
        calls.push({ params, resolve, reject });
        if (honorAbort) {
          params.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      }),
  );
  return calls;
}

function reply(ids: string[], numFound = ids.length): HalApiResponse {
  return {
    responseHeader: { status: 0, QTime: 1 },
    response: { numFound, start: 0, docs: ids.map((docid) => ({ docid })) },
  };
}

/** Lets pending promise callbacks run. */
const flush = () => new Promise((r) => setTimeout(r, 0));

/** Scoped stylesheets of the 'auto' color overrides, in the document. */
const colorsStyles = () => [...document.querySelectorAll<HTMLStyleElement>('style[data-hal-search-colors]')];

let container: HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  for (const style of colorsStyles()) style.remove();
  document.body.innerHTML = '<div id="target"></div>';
  container = document.getElementById('target')!;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

describe('HalSearch construction', () => {
  it('requires a container', () => {
    expect(() => new HalSearch({} as never)).toThrow(/container/);
    expect(() => new HalSearch({ container: '#missing' })).toThrow(/not found/);
  });

  it('resolves a selector and sets up the container', () => {
    new HalSearch({ container: '#target', theme: 'dark' });
    expect(container.classList.contains('hal-search')).toBe(true);
    expect(container.getAttribute('data-hal-theme')).toBe('dark');
    expect(container.getAttribute('style') ?? '').toBe('');
    expect(injectDefaultStyles).toHaveBeenCalledWith(document);
  });

  it('injects styles into the given root, or not at all', () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    new HalSearch({ container, styleRoot: shadow });
    expect(injectDefaultStyles).toHaveBeenLastCalledWith(shadow);

    // Container inside a shadow root: styles default to that root.
    const inner = document.createElement('div');
    shadow.appendChild(inner);
    new HalSearch({ container: inner });
    expect(injectDefaultStyles).toHaveBeenLastCalledWith(shadow);

    vi.mocked(injectDefaultStyles).mockClear();
    new HalSearch({ container, injectStyles: false });
    expect(injectDefaultStyles).not.toHaveBeenCalled();
  });

  it('applies only the safe color overrides as inline custom properties', () => {
    new HalSearch({ container, mainColor: '#ff0000', backgroundColor: 'url(javascript:alert(1))' });
    expect(container.style.getPropertyValue('--hal-accent')).toBe('#ff0000');
    expect(container.style.getPropertyValue('--hal-accent-hover')).toBe('#ff0000cc');
    expect(container.style.getPropertyValue('--hal-card-bg')).toBe('');
    // Untouched palette entries come from the stylesheet (themes keep working)
    expect(container.style.getPropertyValue('--hal-border')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Searching
// ---------------------------------------------------------------------------

describe('HalSearch.search', () => {
  it('issues exactly one request with lvl, sort, filters, page and rows', async () => {
    const calls = controlFetch();
    const hs = new HalSearch({ container, filters: { openAccess: true, yearFrom: 2010 }, apiBase: 'https://proxy/' });
    const promise = hs.search({ query: { idHal: 'jdupont' }, lvl: 3, filters: { yearFrom: 2020 }, page: 2, rows: 5 });

    expect(fetchArticles).toHaveBeenCalledTimes(1);
    expect(calls[0].params).toMatchObject({
      query: { idHal: 'jdupont' },
      lvl: 3,
      sort: 'date-desc',
      rows: 5,
      start: 5,
      apiBase: 'https://proxy/',
      filters: { openAccess: true, yearFrom: 2020 },
    });
    expect(renderLoading).toHaveBeenCalledTimes(1);

    calls[0].resolve(reply(['a', 'b'], 12));
    await expect(promise).resolves.toMatchObject({ response: { numFound: 12 } });
    expect(container.textContent).toBe('results:a,b');
    expect(hs.state).toMatchObject({ lvl: 3, page: 2, totalFound: 12, sort: 'date-desc' });
    expect(fetchArticles).toHaveBeenCalledTimes(1);
  });

  it('passes the render context; only pagination clicks focus the results', async () => {
    const calls = controlFetch();
    const hs = new HalSearch({ container, rows: 10, headingLevel: 2, groupBy: 'year', maxAuthors: 3, highlightAuthors: ['jdupont'], showCredit: false });
    const p = hs.search({ query: 'authIdHal_s:x' });
    calls[0].resolve(reply(['a'], 35));
    await p;

    const ctx = vi.mocked(renderResults).mock.calls[0][2];
    expect(ctx).toMatchObject({
      lvl: 1,
      headingLevel: 2,
      groupBy: 'year',
      maxAuthors: 3,
      highlightAuthors: ['jdupont'],
      showCredit: false,
      focusResults: false,
      pagination: { currentPage: 1, totalFound: 35, rows: 10, start: 0 },
    });
    expect(ctx.labels).toMatchObject({ loading: 'Loading…' });

    ctx.onPageChange(3);
    expect(calls[1].params.start).toBe(20);
    calls[1].resolve(reply(['c'], 35));
    await flush();
    expect(vi.mocked(renderResults).mock.calls[1][2].focusResults).toBe(true);

    // Programmatic navigation does not move the focus, and pages are clamped to the page count.
    const next = hs.goToPage(99);
    expect(calls[2].params.start).toBe(30);
    calls[2].resolve(reply(['d'], 35));
    await next;
    expect(vi.mocked(renderResults).mock.calls[2][2].focusResults).toBe(false);
    expect(hs.state.page).toBe(4);

    const prev = hs.prevPage();
    expect(calls[3].params.start).toBe(20);
    calls[3].resolve(reply(['c'], 35));
    await prev;
    const nxt = hs.nextPage();
    expect(calls[4].params.start).toBe(30);
    calls[4].resolve(reply(['d'], 35));
    await nxt;
  });

  it('two quick searches: only the last one renders (B5)', async () => {
    const calls = controlFetch();
    const onResults = vi.fn();
    const onError = vi.fn();
    const hs = new HalSearch({ container, onResults, onError });

    const first = hs.search({ query: 'first' });
    const second = hs.search({ query: 'second' });
    expect(calls[0].params.signal?.aborted).toBe(true);
    expect(calls[1].params.signal?.aborted).toBe(false);

    calls[1].resolve(reply(['s']));
    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeDefined();

    expect(renderResults).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe('results:s');
    expect(onResults).toHaveBeenCalledTimes(1);
    // Aborts are not errors
    expect(onError).not.toHaveBeenCalled();
    expect(renderError).not.toHaveBeenCalled();
  });

  it('ignores a late response of a superseded request (request token)', async () => {
    const calls = controlFetch({ honorAbort: false });
    const hs = new HalSearch({ container });
    const first = hs.search({ query: 'first' });
    const second = hs.search({ query: 'second' });

    calls[1].resolve(reply(['s']));
    await second;
    calls[0].resolve(reply(['late']));
    await expect(first).resolves.toBeUndefined();

    expect(renderResults).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe('results:s');
  });

  it('clears aria-busy once the SVG (or its error) is rendered', async () => {
    const calls = controlFetch();
    const hs = new HalSearch({ container, output: 'svg' });
    const p = hs.search({ query: { idHal: 'x' } });
    expect(container.getAttribute('aria-busy')).toBe('true');
    calls[0].resolve(reply(['a']));
    await p;
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.hasAttribute('aria-busy')).toBe(false);

    // setColors re-renders the SVG without a loading state
    hs.setColors({ mainColor: '#123456' });
    expect(container.hasAttribute('aria-busy')).toBe(false);

    const q = hs.search({ query: { idHal: 'y' } });
    expect(container.getAttribute('aria-busy')).toBe('true');
    calls[1].reject(new Error('HTTP 500'));
    await q;
    expect(container.textContent).toBe('error:HTTP 500');
    expect(container.hasAttribute('aria-busy')).toBe(false);
  });

  it('a first page beyond the last one shows the last page instead (one extra request)', async () => {
    const calls = controlFetch();
    const onResults = vi.fn();
    const hs = new HalSearch({ container, rows: 10, onResults });
    const p = hs.search({ query: 'x', page: 9 });
    expect(calls[0].params.start).toBe(80);
    calls[0].resolve(reply([], 25));
    await flush();

    expect(calls).toHaveLength(2);
    expect(calls[1].params.start).toBe(20);
    expect(renderResults).not.toHaveBeenCalled();
    calls[1].resolve(reply(['u'], 25));
    await expect(p).resolves.toMatchObject({ response: { numFound: 25 } });
    expect(container.textContent).toBe('results:u');
    expect(hs.state).toMatchObject({ page: 3, totalFound: 25 });
    expect(onResults).toHaveBeenCalledTimes(1);
    expect(vi.mocked(renderResults).mock.calls[0][2].pagination).toMatchObject({ currentPage: 3, totalFound: 25, start: 20 });
  });

  it('retries a page beyond the last one only once, and never for an empty result', async () => {
    const calls = controlFetch();
    const hs = new HalSearch({ container, rows: 10 });
    const p = hs.search({ query: 'x', page: 9 });
    calls[0].resolve(reply([], 25));
    await flush();
    // The results shrank again in between: render what HAL answered, no loop.
    calls[1].resolve(reply([], 5));
    await p;
    expect(calls).toHaveLength(2);
    expect(container.textContent).toBe('results:');

    const q = hs.search({ query: 'nothing', page: 4 });
    calls[2].resolve(reply([], 0));
    await q;
    expect(calls).toHaveLength(3);

    // Page 1 is never retried
    const r = hs.search({ query: 'x' });
    calls[3].resolve(reply([], 3));
    await r;
    expect(calls).toHaveLength(4);
  });

  it('renders errors, calls onError and resolves undefined', async () => {
    const calls = controlFetch();
    const onError = vi.fn();
    const hs = new HalSearch({ container, onError });
    const p = hs.search({ query: 'x' });
    calls[0].reject(new Error('HTTP 500'));
    await expect(p).resolves.toBeUndefined();
    expect(container.textContent).toBe('error:HTTP 500');
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'HTTP 500' }));
  });
});

// ---------------------------------------------------------------------------
// Query without criterion (never q=*:*)
// ---------------------------------------------------------------------------

describe('HalSearch without a search criterion', () => {
  it.each([
    ['an empty object', {}],
    ['blank fields', { idHal: '  ', text: '', orcid: ' ' }],
    ['a text made only of Solr syntax', { text: '***' }],
    ['an empty string', '  '],
  ])('sends no request for %s and renders labels.missingQuery', async (_name, query) => {
    controlFetch();
    const onResults = vi.fn();
    const onError = vi.fn();
    const hs = new HalSearch({ container, onResults, onError, labels: { missingQuery: 'Nothing to show' } });
    await expect(hs.search({ query })).resolves.toBeUndefined();

    expect(fetchArticles).not.toHaveBeenCalled();
    expect(renderLoading).not.toHaveBeenCalled();
    expect(renderMissingQuery).toHaveBeenCalledTimes(1);
    expect(vi.mocked(renderMissingQuery).mock.calls[0][0]).toBe(container);
    expect(container.textContent).toBe('missing:Nothing to show');
    expect(container.hasAttribute('aria-busy')).toBe(false);
    expect(onResults).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(hs.state).toMatchObject({ query, page: 1, totalFound: 0 });
  });

  it('also covers a JS caller that omits the query', async () => {
    controlFetch();
    const hs = new HalSearch({ container });
    await expect(hs.search({} as never)).resolves.toBeUndefined();
    expect(fetchArticles).not.toHaveBeenCalled();
    expect(container.textContent).toBe('missing:No search criterion given.');
    expect(hs.state.query).toEqual({});
  });

  it('aborts the request in flight and ignores its late response', async () => {
    const calls = controlFetch({ honorAbort: false });
    const hs = new HalSearch({ container });
    const first = hs.search({ query: { idHal: 'x' } });
    const second = hs.search({ query: { text: '?' } });
    expect(calls).toHaveLength(1);
    expect(calls[0].params.signal?.aborted).toBe(true);

    calls[0].resolve(reply(['late'], 1));
    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
    expect(renderResults).not.toHaveBeenCalled();
    expect(container.textContent).toBe('missing:No search criterion given.');
  });

  it('page and level changes stay without a request', async () => {
    controlFetch();
    const hs = new HalSearch({ container, output: 'svg' });
    await hs.search({ query: {}, page: 3 });
    await expect(hs.nextPage()).resolves.toBeUndefined();
    await expect(hs.goToPage(5)).resolves.toBeUndefined();
    await expect(hs.setLevel(2)).resolves.toBeUndefined();
    hs.setColors({ mainColor: '#123456' });
    expect(fetchArticles).not.toHaveBeenCalled();
    expect(renderSvgParts).not.toHaveBeenCalled();
    expect(renderMissingQuery).toHaveBeenCalledTimes(4);
    expect(hs.state.page).toBe(1);
  });

  it('still sends an explicit raw Solr query, and a query with any criterion', async () => {
    const calls = controlFetch();
    const hs = new HalSearch({ container });
    void hs.search({ query: '*:*' });
    void hs.search({ query: { text: '* graph' } });
    void hs.search({ query: { collection: 'LIRIS' } });
    expect(calls.map((c) => c.params.query)).toEqual(['*:*', { text: '* graph' }, { collection: 'LIRIS' }]);
    expect(renderMissingQuery).not.toHaveBeenCalled();
  });

  it('an invalid query is reported by the request, not shown as missing', async () => {
    const calls = controlFetch();
    const onError = vi.fn();
    const hs = new HalSearch({ container, onError });
    const p = hs.search({ query: { structId: 'abc' } });
    expect(calls).toHaveLength(1);
    calls[0].reject(new Error('Invalid HAL structId "abc": expected digits only.'));
    await p;
    expect(renderMissingQuery).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Structured data (JSON-LD)
// ---------------------------------------------------------------------------

describe('HalSearch structuredData', () => {
  const ldScripts = (root: ParentNode = document) =>
    [...root.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')];
  const titled = (ids: string[], numFound = ids.length): HalApiResponse => {
    const response = reply(ids, numFound);
    response.response.docs = ids.map((docid) => ({ docid, title_s: [`Paper ${docid}`], uri_s: `https://hal.science/hal-${docid}` }));
    return response;
  };

  it('is off by default', async () => {
    const calls = controlFetch();
    const hs = new HalSearch({ container });
    const p = hs.search({ query: 'x' });
    calls[0].resolve(titled(['a']));
    await p;
    expect(ldScripts()).toHaveLength(0);
  });

  it('describes the displayed page, replaces it on each render and removes it while loading and on destroy', async () => {
    const calls = controlFetch();
    const hs = new HalSearch({ container, rows: 2, structuredData: true });
    const p = hs.search({ query: 'x' });
    calls[0].resolve(titled(['a', 'b'], 5));
    await p;

    const [first] = ldScripts();
    expect(first.parentNode).toBe(container);
    expect(first.getAttribute('data-hal-search-ld')).toMatch(/^[a-z0-9]+$/);
    const data = JSON.parse(first.textContent ?? '');
    expect(data).toMatchObject({ '@type': 'ItemList', numberOfItems: 5 });
    expect(data.itemListElement.map((e: { position: number; item: { name: string } }) => [e.position, e.item.name])).toEqual([
      [1, 'Paper a'],
      [2, 'Paper b'],
    ]);

    const next = hs.nextPage();
    expect(ldScripts()).toHaveLength(0);
    calls[1].resolve(titled(['c', 'd'], 5));
    await next;
    expect(ldScripts()).toHaveLength(1);
    expect(JSON.parse(ldScripts()[0].textContent ?? '').itemListElement[0].position).toBe(3);

    hs.destroy();
    expect(ldScripts()).toHaveLength(0);
  });

  it('is absent for empty results, errors and queries without criterion', async () => {
    const calls = controlFetch();
    const hs = new HalSearch({ container, structuredData: true });
    const p = hs.search({ query: 'x' });
    calls[0].resolve(titled(['a']));
    await p;
    expect(ldScripts()).toHaveLength(1);

    const empty = hs.search({ query: 'nothing' });
    calls[1].resolve(titled([]));
    await empty;
    expect(ldScripts()).toHaveLength(0);

    const failing = hs.search({ query: 'y' });
    calls[2].reject(new Error('HTTP 500'));
    await failing;
    expect(ldScripts()).toHaveLength(0);

    await hs.search({ query: {} });
    expect(ldScripts()).toHaveLength(0);
  });

  it('goes to the shadow host (light DOM) when the container lives in a shadow root, SVG output included', async () => {
    const calls = controlFetch();
    const host = document.createElement('section');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const inner = document.createElement('div');
    shadow.appendChild(inner);
    const hs = new HalSearch({ container: inner, output: 'svg', structuredData: true });
    const p = hs.search({ query: 'x' });
    calls[0].resolve(titled(['a']));
    await p;

    expect(ldScripts(shadow)).toHaveLength(0);
    expect(ldScripts(host)).toHaveLength(1);
    expect(ldScripts()[0].parentNode).toBe(host);

    // Re-rendering the SVG (new colors) keeps a single, up-to-date description.
    hs.setColors({ mainColor: '#123456' });
    expect(ldScripts(host)).toHaveLength(1);
    hs.destroy();
    expect(ldScripts(host)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Callbacks (B4)
// ---------------------------------------------------------------------------

describe('HalSearch callbacks', () => {
  it('an onResults exception does not replace the rendered results', async () => {
    const calls = controlFetch();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn();
    const hs = new HalSearch({
      container,
      onResults: () => {
        throw new Error('user bug');
      },
      onError,
    });
    const p = hs.search({ query: 'x' });
    calls[0].resolve(reply(['a']));
    await expect(p).resolves.toBeDefined();

    expect(container.textContent).toBe('results:a');
    expect(renderError).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  it('an onError exception is reported and the error stays rendered', async () => {
    const calls = controlFetch();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const hs = new HalSearch({
      container,
      onError: () => {
        throw new Error('user bug');
      },
    });
    const p = hs.search({ query: 'x' });
    calls[0].reject(new Error('boom'));
    await expect(p).resolves.toBeUndefined();
    expect(container.textContent).toBe('error:boom');
    expect(consoleError).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Level, colors, theme
// ---------------------------------------------------------------------------

describe('HalSearch display updates', () => {
  it('setLevel re-fetches the current page, and does nothing before a search', async () => {
    const calls = controlFetch();
    const hs = new HalSearch({ container, rows: 10 });
    await expect(hs.setLevel(2)).resolves.toBeUndefined();
    expect(fetchArticles).not.toHaveBeenCalled();

    const p = hs.search({ query: 'x', page: 3 });
    calls[0].resolve(reply(['a'], 50));
    await p;
    const q = hs.setLevel(0);
    expect(calls[1].params).toMatchObject({ lvl: 0, start: 20 });
    calls[1].resolve(reply(['a'], 50));
    await q;
    expect(hs.state.lvl).toBe(0);
  });

  it('setColors re-renders the SVG from the last response without fetching (B6)', async () => {
    const calls = controlFetch();
    const hs = new HalSearch({ container, output: 'svg', mainColor: '#111111', title: 'My papers', filters: { openAccess: true } });
    const p = hs.search({ query: { idHal: 'x' }, filters: { yearFrom: 2020 } });
    calls[0].resolve(reply(['a', 'b'], 7));
    await p;
    expect(container.querySelector('svg')?.getAttribute('data-main')).toBe('#111111');
    expect(vi.mocked(renderSvgParts).mock.calls[0][1]).toMatchObject({
      totalFound: 7,
      title: 'My papers',
      halUrl: 'https://hal.science/search/index/?q=x',
      lvl: 1,
    });
    // The footer link lists what the (filtered) count counts.
    expect(buildHalWebUrl).toHaveBeenLastCalledWith({ idHal: 'x' }, { openAccess: true, yearFrom: 2020 });

    hs.setColors({ mainColor: '#222222' });
    expect(fetchArticles).toHaveBeenCalledTimes(1);
    expect(renderSvgParts).toHaveBeenCalledTimes(2);
    expect(container.querySelector('svg')?.getAttribute('data-main')).toBe('#222222');
    expect(container.querySelector('svg')?.getAttribute('data-count')).toBe('2');
    expect(container.style.getPropertyValue('--hal-accent')).toBe('#222222');

    // `undefined` removes the override
    hs.setColors({ mainColor: undefined });
    expect(container.querySelector('svg')?.getAttribute('data-main')).toBe('');
    expect(container.style.getPropertyValue('--hal-accent')).toBe('');

    hs.setTheme('dark');
    expect(container.querySelector('svg')?.getAttribute('data-theme')).toBe('dark');
    expect(container.getAttribute('data-hal-theme')).toBe('dark');
    expect(fetchArticles).toHaveBeenCalledTimes(1);
  });

  it('setColors / setTheme update the HTML output immediately without re-rendering', async () => {
    const calls = controlFetch();
    const hs = new HalSearch({ container, theme: 'light' });
    const p = hs.search({ query: 'x' });
    calls[0].resolve(reply(['a']));
    await p;

    hs.setColors({ backgroundColor: '#fafafa' });
    expect(container.style.getPropertyValue('--hal-card-bg')).toBe('#fafafa');
    hs.setColors({ mainColor: '#ff0000' });
    expect(container.style.getPropertyValue('--hal-domain-bg')).toBe('tint(#ff0000,light)');
    hs.setTheme('dark');
    expect(container.style.getPropertyValue('--hal-domain-bg')).toBe('tint(#ff0000,dark)');
    // 'auto': no inline values (they would apply to both schemes), a scoped stylesheet instead
    hs.setTheme('auto');
    expect(container.getAttribute('data-hal-theme')).toBe('auto');
    expect(container.style.getPropertyValue('--hal-card-bg')).toBe('');
    expect(container.style.getPropertyValue('--hal-accent')).toBe('');
    expect(colorsStyles()).toHaveLength(1);
    expect(renderResults).toHaveBeenCalledTimes(1);
    expect(fetchArticles).toHaveBeenCalledTimes(1);

    // Back to an explicit theme: inline values again, the stylesheet is removed
    hs.setTheme('light');
    expect(container.style.getPropertyValue('--hal-accent')).toBe('#ff0000');
    expect(colorsStyles()).toHaveLength(0);
    expect(container.hasAttribute('data-hal-id')).toBe(false);
  });

  it("'auto' + overrides: one scoped stylesheet with a light and a dark set (HTML agrees with the SVG)", () => {
    const hs = new HalSearch({ container, theme: 'auto', mainColor: '#ff0000', backgroundColor: '#ffffff' });
    const id = container.getAttribute('data-hal-id');
    expect(id).toMatch(/^[a-z0-9]+$/);
    const [style] = colorsStyles();
    expect(style.parentNode).toBe(document.head);
    expect(style.getAttribute('data-hal-search-colors')).toBe(id);

    const selector = `.hal-search[data-hal-theme="auto"][data-hal-id="${id}"] {`;
    const [light, dark] = (style.textContent ?? '').split('@media (prefers-color-scheme: dark) {');
    expect(light).toContain(selector);
    expect(dark).toContain(selector);
    // Each scheme gets the colors resolved for it, derived ones included.
    expect(light).toContain('--hal-domain-bg: tint(#ff0000,light);');
    expect(dark).toContain('--hal-domain-bg: tint(#ff0000,dark);');
    expect(light).toContain('--hal-card-bg: #ffffff;');
    expect(dark).toContain('--hal-card-bg: #ffffff;');
    expect(container.getAttribute('style') ?? '').toBe('');

    // A second instance gets its own scope; setColors updates in place; destroy removes it.
    const other = document.createElement('div');
    document.body.appendChild(other);
    const hs2 = new HalSearch({ container: other, theme: 'auto', mainColor: '#00ff00' });
    expect(other.getAttribute('data-hal-id')).not.toBe(id);
    expect(colorsStyles()).toHaveLength(2);

    hs.setColors({ mainColor: '#0000ff' });
    expect(colorsStyles()[0]).toBe(style);
    expect(style.textContent).toContain('--hal-accent: #0000ff;');
    expect(style.textContent).not.toContain('#ff0000');

    hs.setColors({ mainColor: undefined, backgroundColor: undefined });
    expect(colorsStyles()).toHaveLength(1);
    expect(container.hasAttribute('data-hal-id')).toBe(false);

    hs2.destroy();
    hs.destroy();
    expect(colorsStyles()).toHaveLength(0);
    expect(other.hasAttribute('data-hal-id')).toBe(false);
  });

  it("'auto' + overrides inside a shadow root: the stylesheet goes into the style root", () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const inner = document.createElement('div');
    shadow.appendChild(inner);
    const hs = new HalSearch({ container: inner, theme: 'auto', textColor: '#333333' });
    expect(colorsStyles()).toHaveLength(0);
    const style = shadow.querySelector('style[data-hal-search-colors]');
    expect(style?.textContent).toContain(`[data-hal-id="${inner.getAttribute('data-hal-id')}"]`);
    expect(style?.textContent).toContain('--hal-text: #333333;');
    hs.destroy();
    expect(shadow.querySelector('style[data-hal-search-colors]')).toBeNull();
  });

  it('setColors while loading does not bring back stale SVG results', async () => {
    const calls = controlFetch();
    const hs = new HalSearch({ container, output: 'svg' });
    const p = hs.search({ query: 'x' });
    calls[0].resolve(reply(['a']));
    await p;
    void hs.search({ query: 'y' });
    hs.setColors({ mainColor: '#333333' });
    expect(container.textContent).toBe('loading');
  });
});

// ---------------------------------------------------------------------------
// destroy (T7)
// ---------------------------------------------------------------------------

describe('HalSearch.destroy', () => {
  it('aborts the in-flight request, clears the container and ignores the late response', async () => {
    const calls = controlFetch({ honorAbort: false });
    const onResults = vi.fn();
    const hs = new HalSearch({ container, mainColor: '#ff0000', onResults });
    const p = hs.search({ query: 'x' });
    hs.destroy();

    expect(calls[0].params.signal?.aborted).toBe(true);
    expect(container.innerHTML).toBe('');
    expect(container.classList.contains('hal-search')).toBe(false);
    expect(container.style.getPropertyValue('--hal-accent')).toBe('');

    calls[0].resolve(reply(['late']));
    await expect(p).resolves.toBeUndefined();
    expect(container.innerHTML).toBe('');
    expect(renderResults).not.toHaveBeenCalled();
    expect(onResults).not.toHaveBeenCalled();

    // Every method is a no-op afterwards
    await expect(hs.search({ query: 'y' })).resolves.toBeUndefined();
    hs.setColors({ mainColor: '#00ff00' });
    expect(fetchArticles).toHaveBeenCalledTimes(1);
    expect(container.innerHTML).toBe('');
  });

  it('keeps a hal-search class the container already had', () => {
    container.className = 'hal-search mine';
    const hs = new HalSearch({ container });
    hs.destroy();
    expect(container.className).toBe('hal-search mine');

    const plain = document.createElement('div');
    new HalSearch({ container: plain }).destroy();
    expect(plain.hasAttribute('class')).toBe(false);
    expect(plain.hasAttribute('data-hal-theme')).toBe(false);
  });
});

describe('HalSearch.state', () => {
  it('is a read-only snapshot', async () => {
    const calls = controlFetch();
    const hs = new HalSearch({ container, filters: { docTypes: ['ART'] } });
    expect(hs.state).toMatchObject({ query: undefined, page: 1, totalFound: 0, sort: 'date-desc', lvl: 1 });
    const p = hs.search({ query: { idHal: 'x' }, sort: 'relevance' });
    calls[0].resolve(reply([], 0));
    await p;
    const s = hs.state;
    expect(Object.isFrozen(s)).toBe(true);
    (s.filters.docTypes as string[]).push('COMM');
    expect(hs.state.filters.docTypes).toEqual(['ART']);
    expect(hs.state.sort).toBe('relevance');
  });
});
