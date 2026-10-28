// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FetchParams, HalApiResponse, HalDoc, UrlState } from '../src/types';

// ---------------------------------------------------------------------------
// Mocks: the element is tested against the contract signatures of the other modules
// ---------------------------------------------------------------------------

vi.mock('../src/api', () => ({
  DEFAULT_BASE: 'https://api.example/search/',
  fetchArticles: vi.fn(),
  isAbortError: (err: unknown) => (err as Error | undefined)?.name === 'AbortError',
}));

vi.mock('../src/renderer', () => ({
  renderLoading: vi.fn((c: HTMLElement) => {
    c.textContent = 'loading';
  }),
  renderError: vi.fn((c: HTMLElement, err: Error) => {
    c.textContent = `error:${err.message}`;
  }),
  renderResults: vi.fn((c: HTMLElement, docs: HalDoc[]) => {
    c.textContent = `results:${docs.map((d) => d.docid).join(',')}`;
  }),
  renderMissingQuery: vi.fn((c: HTMLElement) => {
    c.textContent = 'missing';
  }),
}));

vi.mock('../src/styles', () => ({ injectDefaultStyles: vi.fn() }));

vi.mock('../src/svg', () => ({
  renderSvg: vi.fn((docs: HalDoc[], o: { mainColor?: string }) => `<svg data-main="${o.mainColor ?? ''}" data-count="${docs.length}"></svg>`),
}));

vi.mock('../src/query', async (importOriginal) => ({
  // The real criterion rule (shared with the SSR), a fake web URL.
  hasQueryCriterion: (await importOriginal<typeof import('../src/query')>()).hasQueryCriterion,
  buildHalWebUrl: vi.fn(() => 'https://hal.science/'),
}));

vi.mock('../src/labels', () => ({
  resolveLabels: (o?: Record<string, unknown>) => ({ loading: 'Loading…', ...o }),
}));

vi.mock('../src/theme', () => ({
  isSafeColor: (v: string) => /^#[0-9a-f]{3,8}$/i.test(v),
  resolvePalette: (o: { mainColor?: string }) => ({ accent: o.mainColor ?? '#0052cc', border: '#e0e0e0' }),
  paletteToCssVars: (p: Record<string, string>) =>
    Object.fromEntries(Object.entries(p).map(([k, v]) => [`--hal-${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`, v])),
}));

// Minimal stand-in for the data-api parser (same param names as the public URL scheme).
vi.mock('../src/url-params', () => ({
  parseUrlParams: vi.fn((p: URLSearchParams): UrlState => {
    const state: UrlState = { query: {}, filters: {} };
    const get = (k: string) => p.get(k) ?? undefined;
    if (get('idHal')) state.query.idHal = get('idHal');
    if (get('collection')) state.query.collection = get('collection');
    if (get('search')) state.query.text = get('search');
    if (get('docTypes')) state.filters.docTypes = get('docTypes')!.split(',');
    if (get('yearFrom')) state.filters.yearFrom = Number(get('yearFrom'));
    if (get('oa') === 'true' || get('oa') === '1') state.filters.openAccess = true;
    if (get('lvl')) state.lvl = Number(get('lvl')) as UrlState['lvl'];
    if (get('rows')) state.rows = Number(get('rows'));
    if (get('page')) state.page = Number(get('page'));
    if (get('sort')) state.sort = get('sort') as UrlState['sort'];
    if (get('output')) state.output = get('output') as UrlState['output'];
    if (get('theme')) state.theme = get('theme') as UrlState['theme'];
    if (get('main')) state.mainColor = get('main');
    if (get('title')) state.title = get('title');
    return state;
  }),
}));

import { attributesToUrlParams, defineHalSearchElement, HAL_SEARCH_ATTRIBUTES, parseLabelsAttribute } from '../src/element';
import { fetchArticles } from '../src/api';
import { parseUrlParams } from '../src/url-params';
import { renderResults } from '../src/renderer';
import { renderSvg } from '../src/svg';
import { injectDefaultStyles } from '../src/styles';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface PendingCall {
  params: FetchParams;
  resolve: (r: HalApiResponse) => void;
  reject: (e: unknown) => void;
}

let calls: PendingCall[] = [];

function reply(ids: string[]): HalApiResponse {
  return { responseHeader: { status: 0, QTime: 1 }, response: { numFound: ids.length, start: 0, docs: ids.map((docid) => ({ docid })) } };
}

/** Lets microtasks (attribute coalescing) and settled promises run. */
const flush = () => new Promise((r) => setTimeout(r, 0));

function create(attrs: Record<string, string>, tag = 'hal-search'): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  return el;
}

function mountOf(el: HTMLElement): HTMLElement {
  return el.shadowRoot!.querySelector('[part="container"]') as HTMLElement;
}

beforeAll(() => {
  defineHalSearchElement();
});

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  calls = [];
  vi.mocked(fetchArticles).mockImplementation(
    (params: FetchParams) =>
      new Promise<HalApiResponse>((resolve, reject) => {
        calls.push({ params, resolve, reject });
        params.signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      }),
  );
});

// ---------------------------------------------------------------------------
// Attribute mapping
// ---------------------------------------------------------------------------

describe('attribute mapping', () => {
  it('maps every kebab-case attribute to its public URL param', () => {
    const el = document.createElement('div');
    const attrs: Record<string, string> = {
      'id-hal': 'jdupont',
      orcid: '0000-0002-1825-0097',
      'struct-id': '1234',
      collection: 'LIRIS',
      search: 'graphs',
      q: 'title_t:x',
      'doc-types': 'ART,COMM',
      'year-from': '2020',
      'year-to': '2024',
      oa: '1',
      sort: 'date-asc',
      lvl: '2',
      rows: '5',
      page: '3',
      output: 'svg',
      theme: 'dark',
      bg: '#ffffff',
      text: '#111111',
      main: '#0052cc',
      'group-by': 'year',
      highlight: 'jdupont,Jane Doe',
      'max-authors': '4',
      credit: '0',
      'svg-title': 'My papers',
      // Not part of the URL scheme
      title: 'tooltip',
      uid: 'legacy',
      'heading-level': '4',
      class: 'x',
    };
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);

    expect(Object.fromEntries(attributesToUrlParams(el))).toEqual({
      idHal: 'jdupont',
      orcid: '0000-0002-1825-0097',
      structId: '1234',
      collection: 'LIRIS',
      search: 'graphs',
      q: 'title_t:x',
      docTypes: 'ART,COMM',
      yearFrom: '2020',
      yearTo: '2024',
      oa: '1',
      sort: 'date-asc',
      lvl: '2',
      rows: '5',
      page: '3',
      output: 'svg',
      theme: 'dark',
      bg: '#ffffff',
      text: '#111111',
      main: '#0052cc',
      groupBy: 'year',
      highlight: 'jdupont,Jane Doe',
      maxAuthors: '4',
      credit: '0',
      title: 'My papers',
    });
  });

  it('treats bare boolean attributes as true', () => {
    const el = document.createElement('div');
    el.setAttribute('oa', '');
    expect(attributesToUrlParams(el).get('oa')).toBe('true');
  });

  it('observes the contract attributes, not the global title', () => {
    expect(HAL_SEARCH_ATTRIBUTES).toEqual(
      expect.arrayContaining(['id-hal', 'svg-title', 'group-by', 'max-authors', 'heading-level', 'labels', 'api-base']),
    );
    expect(HAL_SEARCH_ATTRIBUTES).not.toContain('title');
  });

  it('parses the labels attribute and ignores invalid JSON', () => {
    expect(parseLabelsAttribute('{"loading":"Chargement…","docTypes":{"ART":"Article","X":1},"n":2}')).toEqual({
      loading: 'Chargement…',
      docTypes: { ART: 'Article' },
    });
    expect(parseLabelsAttribute('{oops')).toBeUndefined();
    expect(parseLabelsAttribute('[1,2]')).toBeUndefined();
    expect(parseLabelsAttribute(null)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Element
// ---------------------------------------------------------------------------

describe('<hal-search>', () => {
  it('is registered once; defining again or another tag is safe', () => {
    const ctor = customElements.get('hal-search');
    expect(ctor).toBeDefined();
    defineHalSearchElement();
    expect(customElements.get('hal-search')).toBe(ctor);
    defineHalSearchElement('my-publications');
    expect(customElements.get('my-publications')).toBeDefined();
  });

  it('renders into an open shadow root and searches from its attributes', async () => {
    const el = create({ 'id-hal': 'jdupont', lvl: '2', 'doc-types': 'ART', 'heading-level': '4' });
    await flush();

    expect(parseUrlParams).toHaveBeenCalledWith(expect.any(URLSearchParams));
    expect(fetchArticles).toHaveBeenCalledTimes(1);
    expect(calls[0].params).toMatchObject({ query: { idHal: 'jdupont' }, lvl: 2, rows: 10, start: 0, filters: { docTypes: ['ART'] } });

    const mount = mountOf(el);
    expect(el.shadowRoot?.mode).toBe('open');
    expect(mount.classList.contains('hal-search')).toBe(true);
    expect(injectDefaultStyles).toHaveBeenCalledWith(el.shadowRoot);

    calls[0].resolve(reply(['a']));
    await flush();
    expect(mount.textContent).toBe('results:a');
    expect(vi.mocked(renderResults).mock.calls[0][2].headingLevel).toBe(4);
  });

  it('coalesces several attribute changes into one request', async () => {
    const el = create({ 'id-hal': 'jdupont' });
    await flush();
    expect(fetchArticles).toHaveBeenCalledTimes(1);

    el.setAttribute('lvl', '3');
    el.setAttribute('sort', 'relevance');
    el.setAttribute('year-from', '2020');
    await flush();
    expect(fetchArticles).toHaveBeenCalledTimes(2);
    expect(calls[1].params).toMatchObject({ lvl: 3, sort: 'relevance', filters: { yearFrom: 2020 } });
    expect(calls[0].params.signal?.aborted).toBe(true);

    // Removing lvl goes back to the default level
    el.removeAttribute('lvl');
    await flush();
    expect(calls[2].params.lvl).toBe(1);
  });

  it('applies color and theme changes without a new request', async () => {
    const el = create({ 'id-hal': 'jdupont', output: 'svg', main: '#111111' });
    await flush();
    calls[0].resolve(reply(['a', 'b']));
    await flush();
    const mount = mountOf(el);
    expect(mount.querySelector('svg')?.getAttribute('data-main')).toBe('#111111');

    el.setAttribute('main', '#222222');
    el.setAttribute('theme', 'dark');
    await flush();
    expect(fetchArticles).toHaveBeenCalledTimes(1);
    expect(mount.querySelector('svg')?.getAttribute('data-main')).toBe('#222222');
    expect(mount.getAttribute('data-hal-theme')).toBe('dark');
    expect(mount.style.getPropertyValue('--hal-accent')).toBe('#222222');
    expect(renderSvg).toHaveBeenLastCalledWith(expect.any(Array), expect.objectContaining({ theme: 'dark', mainColor: '#222222' }));
  });

  it('re-creates the widget when a constructor-level attribute changes', async () => {
    const el = create({ 'id-hal': 'jdupont' });
    await flush();
    el.setAttribute('labels', '{"loading":"Chargement…"}');
    await flush();
    expect(fetchArticles).toHaveBeenCalledTimes(2);
    calls[1].resolve(reply(['a']));
    await flush();
    expect(vi.mocked(renderResults).mock.calls[0][2].labels).toMatchObject({ loading: 'Chargement…' });

    // Invalid JSON is ignored (same config as no labels)
    el.setAttribute('labels', '{not json');
    await flush();
    expect(fetchArticles).toHaveBeenCalledTimes(3);
    expect(mountOf(el).textContent).toBe('loading');
  });

  it('dispatches bubbling, composed hal-results and hal-error events', async () => {
    const results = vi.fn();
    const errors = vi.fn();
    document.addEventListener('hal-results', results);
    document.addEventListener('hal-error', errors);
    try {
      const el = create({ 'id-hal': 'jdupont' });
      await flush();
      calls[0].resolve(reply(['a']));
      await flush();
      expect(results).toHaveBeenCalledTimes(1);
      const event = results.mock.calls[0][0] as CustomEvent;
      expect(event.bubbles).toBe(true);
      expect(event.composed).toBe(true);
      expect(event.target).toBe(el);
      expect(event.detail.response.response.docs).toHaveLength(1);

      el.setAttribute('id-hal', 'other');
      await flush();
      calls[1].reject(new Error('HTTP 503'));
      await flush();
      expect(errors).toHaveBeenCalledTimes(1);
      expect((errors.mock.calls[0][0] as CustomEvent).detail.error.message).toBe('HTTP 503');
    } finally {
      document.removeEventListener('hal-results', results);
      document.removeEventListener('hal-error', errors);
    }
  });

  it('does not search without a criterion', async () => {
    create({ lvl: '2' });
    await flush();
    expect(fetchArticles).not.toHaveBeenCalled();
  });

  it('does not list the whole archive for a search made only of Solr syntax', async () => {
    const el = create({ search: '*' });
    create({ search: '"" ??? -' });
    await flush();
    expect(fetchArticles).not.toHaveBeenCalled();
    expect(mountOf(el).textContent).toBe('');

    el.setAttribute('search', '* graph');
    await flush();
    expect(fetchArticles).toHaveBeenCalledTimes(1);
    expect(calls[0].params.query).toEqual({ text: '* graph' });
  });

  it('aborts and clears when removed, and survives a synchronous move', async () => {
    const el = create({ 'id-hal': 'jdupont' });
    await flush();
    calls[0].resolve(reply(['a']));
    await flush();

    // Move: disconnect + connect in the same task keeps the results
    const other = document.createElement('section');
    document.body.appendChild(other);
    other.appendChild(el);
    await flush();
    expect(fetchArticles).toHaveBeenCalledTimes(1);
    expect(mountOf(el).textContent).toBe('results:a');

    el.setAttribute('id-hal', 'other');
    await flush();
    el.remove();
    await flush();
    expect(calls[1].params.signal?.aborted).toBe(true);
    expect(mountOf(el).innerHTML).toBe('');
  });
});
