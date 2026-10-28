import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSvg } from '../src/headless';
import type { HalDoc } from '../src/types';

// Node environment: fetchSvg must not need any DOM. fetch is stubbed (no network in tests).

const DOCS: HalDoc[] = [
  {
    docid: '1',
    uri_s: 'https://hal.science/hal-00000001v1',
    title_s: ['A first paper'],
    authFullName_s: ['Jey Puget Gil', 'Jane Doe'],
    authIdHalFullName_fs: ['jpugetgil_FacetSep_Jey PUGET GIL'],
    producedDateY_i: 2025,
    docType_s: 'ART',
    journalTitle_s: 'Some Journal',
  },
  {
    docid: '2',
    uri_s: 'https://hal.science/hal-00000002v1',
    title_s: ['A second paper'],
    authFullName_s: ['Jane Doe'],
    producedDateY_i: 2023,
    docType_s: 'COMM',
  },
];

function stubFetch(body: unknown, init: { status?: number } = {}) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status: init.status ?? 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function okBody(docs: HalDoc[], numFound = docs.length) {
  return { responseHeader: { status: 0, QTime: 1 }, response: { numFound, start: 0, docs } };
}

function requestedUrl(fetchMock: ReturnType<typeof stubFetch>): URL {
  return new URL(String(fetchMock.mock.calls[0][0]));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchSvg', () => {
  it('runs without a DOM', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
  });

  it('fetches HAL and renders the SVG', async () => {
    const fetchMock = stubFetch(okBody(DOCS, 42));
    const svg = await fetchSvg({ query: { idHal: 'jpugetgil' }, highlightAuthors: ['jpugetgil'] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('A first paper');
    expect(svg).toContain('A second paper');
    expect(svg).toContain('42 results');
    expect(svg).toContain('<tspan font-weight="700">Jey Puget Gil</tspan>');
  });

  it('links the footer to the HAL web page of the query', async () => {
    stubFetch(okBody(DOCS, 42));
    const svg = await fetchSvg({ query: { idHal: 'jpugetgil' } });
    expect(svg).toMatch(/<a href="https:\/\/cv\.hal\.science\/jpugetgil"[^>]*><text[^>]*>View all 42 publications on HAL<\/text><\/a>/);
  });

  it('links the footer to the filtered list when filters are active (same list as the count)', async () => {
    stubFetch(okBody(DOCS, 2));
    const svg = await fetchSvg({ query: { idHal: 'jpugetgil' }, filters: { docTypes: ['ART'], yearFrom: 2020 } });
    const href = /<a href="([^"]*)"[^>]*><text[^>]*>View all 2 publications on HAL/.exec(svg)?.[1] ?? '';
    const url = new URL(href.replace(/&amp;/g, '&'));
    expect(`${url.origin}${url.pathname}`).toBe('https://hal.science/search/index/');
    expect(url.searchParams.get('q')).toBe('(authIdHal_s:"jpugetgil") AND docType_s:(ART) AND producedDateY_i:[2020 TO *]');
  });

  it('renders the last page for a page beyond it (one extra request)', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const start = new URL(url).searchParams.get('start');
      return new Response(JSON.stringify(start === '10' ? okBody([DOCS[0]], 11) : okBody([], 11)));
    });
    vi.stubGlobal('fetch', fetchMock);
    const svg = await fetchSvg({ query: { idHal: 'x' }, page: 4 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get('start')).toBe('10');
    expect(svg).toContain('A first paper');
    expect(svg).not.toContain('No results found.');
  });

  it('uses the defaults: lvl 1, 10 rows, page 1, newest first', async () => {
    const fetchMock = stubFetch(okBody(DOCS));
    await fetchSvg({ query: { idHal: 'jpugetgil' } });
    const url = requestedUrl(fetchMock);
    expect(url.searchParams.get('rows')).toBe('10');
    expect(url.searchParams.get('start')).toBe('0');
    expect(url.searchParams.get('sort')).toMatch(/^producedDate_tdate desc/);
    expect(url.searchParams.get('fl')).toContain('title_s');
    expect(url.searchParams.get('fl')).not.toContain('abstract_s');
  });

  it('forwards rows, page, sort, filters, lvl and apiBase', async () => {
    const fetchMock = stubFetch(okBody(DOCS));
    await fetchSvg({
      query: { collection: 'LIRIS' },
      rows: 5,
      page: 3,
      sort: 'date-asc',
      lvl: 3,
      filters: { docTypes: ['ART'], openAccess: true },
      apiBase: 'https://proxy.example/search/',
    });
    const url = requestedUrl(fetchMock);
    expect(url.origin).toBe('https://proxy.example');
    expect(url.pathname).toContain('LIRIS');
    expect(url.searchParams.get('rows')).toBe('5');
    expect(url.searchParams.get('start')).toBe('10');
    expect(url.searchParams.get('sort')).toMatch(/^producedDate_tdate asc/);
    expect(url.searchParams.get('fl')).toContain('abstract_s');
    expect(url.searchParams.getAll('fq').join(' ')).toContain('docType_s');
  });

  it('passes the display options to the renderer', async () => {
    stubFetch(okBody(DOCS, 2));
    const svg = await fetchSvg({
      query: 'authIdHal_s:jpugetgil',
      theme: 'auto',
      title: 'My <papers>',
      width: 500,
      groupBy: 'year',
      maxAuthors: 1,
      mainColor: '#b45309',
      showCredit: false,
      labels: { etAl: 'et coll.' },
    });
    expect(svg).toContain('@media (prefers-color-scheme:dark)');
    expect(svg).toContain('My &lt;papers&gt;');
    expect(svg).toMatch(/width="500"/);
    expect(svg).toContain('>2025</text>');
    expect(svg).toContain('et coll.');
    expect(svg).toContain('fill:#b45309');
    expect(svg).not.toContain('github.com');
  });

  it('passes the abort signal to fetch', async () => {
    const fetchMock = stubFetch(okBody(DOCS));
    const controller = new AbortController();
    await fetchSvg({ query: { idHal: 'x' }, signal: controller.signal });
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal);
  });

  it('propagates fetch errors', async () => {
    stubFetch({ error: { msg: 'boom' } }, { status: 500 });
    await expect(fetchSvg({ query: { idHal: 'x' } })).rejects.toThrow(/HAL API error 500/);
  });

  it('renders the empty state', async () => {
    stubFetch(okBody([], 0));
    const svg = await fetchSvg({ query: { idHal: 'nobody' } });
    expect(svg).toContain('No results found.');
  });
});
