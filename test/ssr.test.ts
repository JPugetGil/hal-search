import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HalDoc } from '../src/types';
import {
  CACHE_ERROR,
  CACHE_SUCCESS,
  DEFAULT_ROWS,
  MAX_ROWS,
  SVG_CSP,
  handleRequest,
  handleSvgRequest,
  toSsrRequest,
} from '../ssr-app/src/render';
import type { HandlerDeps, SsrResponse } from '../ssr-app/src/render';
import { assertWellFormedXml } from './helpers/xml';

// ---------------------------------------------------------------------------
// Library under test
// ---------------------------------------------------------------------------

// The service runs against the real library (`hal-search/svg` → src/svg-entry.ts, also proving the entry point
// is importable in Node, as SSR dev mode requires). Only renderSvg can be replaced per test.
const lib = vi.hoisted(() => ({
  /** Per-test replacement of renderSvg (e.g. a deliberately unsafe renderer) */
  renderSvgOverride: undefined as undefined | ((...args: unknown[]) => string),
}));

vi.mock('hal-search/svg', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/svg-entry')>();
  return {
    ...actual,
    renderSvg: (...args: Parameters<typeof actual.renderSvg>) =>
      lib.renderSvgOverride ? lib.renderSvgOverride(...args) : actual.renderSvg(...args),
  };
});

afterEach(() => {
  lib.renderSvgOverride = undefined;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A HAL API JSON response */
function halResponse(docs: HalDoc[], numFound = docs.length, init: ResponseInit = {}): Response {
  return new Response(
    JSON.stringify({ responseHeader: { status: 0, QTime: 1 }, response: { numFound, start: 0, docs } }),
    { status: 200, headers: { 'Content-Type': 'application/json' }, ...init },
  );
}

function doc(title: string, extra: Partial<HalDoc> = {}): HalDoc {
  return {
    docid: title,
    halId_s: 'hal-00000001',
    uri_s: 'https://hal.science/hal-00000001',
    label_s: `${title}. 2024`,
    title_s: [title],
    authFullName_s: ['Ada Lovelace'],
    producedDateY_i: 2024,
    docType_s: 'ART',
    journalTitle_s: 'Journal of Tests',
    ...extra,
  };
}

/** Deps with a mocked fetch and a silent logger */
function deps(fetchImpl: (url: string, init?: RequestInit) => Promise<Response>, extra: Partial<HandlerDeps> = {}) {
  const fetchMock = vi.fn(fetchImpl);
  const log = vi.fn();
  return { fetchMock, log, deps: { fetch: fetchMock as unknown as typeof fetch, log, ...extra } };
}

function params(input: Record<string, string> | string): URLSearchParams {
  return new URLSearchParams(input);
}

/** Search params of the n-th HAL request */
function halRequest(fetchMock: ReturnType<typeof vi.fn>, n = 0): URL {
  return new URL(String(fetchMock.mock.calls[n][0]));
}

/** Visible text of an SVG (tags removed, whitespace collapsed) */
function textOf(svg: string): string {
  return svg.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
}

function expectSafeSvg(res: SsrResponse): void {
  expect(res.status).toBe(200);
  expect(res.headers['Content-Type']).toBe('image/svg+xml; charset=utf-8');
  expect(res.body).toMatch(/<svg[\s>]/);
  // An ill-formed SVG is a broken image (cached for an hour by GitHub's camo proxy).
  assertWellFormedXml(res.body);
  expect(res.body).not.toMatch(/<\s*script/i);
  expect(res.body).not.toMatch(/<\s*foreignObject/i);
  expect(res.body).not.toMatch(/<\s*(img|iframe|object|embed)\b/i);
  expect(res.body).not.toContain('javascript:');
}

const XSS = '<script>alert(1)</script>';

// ---------------------------------------------------------------------------
// XSS regressions
// ---------------------------------------------------------------------------

describe('SVG endpoint: injection', () => {
  it('drops a color payload that closes the <style> element (B2)', async () => {
    const payload = 'red}</style><script>alert(1)</script>';
    const { deps: d } = deps(async () => halResponse([doc('A paper')]));
    const res = await handleSvgRequest(params({ idHal: 'jdoe', bg: payload, text: payload, main: payload }), d);
    expectSafeSvg(res);
    expect(res.body).not.toContain('</style><');
    expect(res.body).not.toContain('alert(1)');
    expect(res.headers['Cache-Control']).toBe(CACHE_SUCCESS);
  });

  it('drops colors with XML-invalid whitespace (U+000B / U+000C) and stays well-formed', async () => {
    const { deps: d } = deps(async () => halResponse([doc('A paper')]));
    const res = await handleSvgRequest(params('idHal=x&bg=rgb(1%0B2%0B3)&main=hsl(1%0C2%25%0C3%25)&text=rgb(1%0B2%0B3)'), d);
    expectSafeSvg(res);
    expect(res.body).not.toMatch(/[\u000b\u000c]/);
    expect(res.body).toContain('A paper');
    expect(res.headers['Cache-Control']).toBe(CACHE_SUCCESS);
  });

  it('escapes a hostile title', async () => {
    const { deps: d } = deps(async () => halResponse([doc('A paper')]));
    const res = await handleSvgRequest(params({ idHal: 'jdoe', title: `${XSS}<foreignObject>` }), d);
    expectSafeSvg(res);
    expect(res.body).toContain('&lt;script');
  });

  it('escapes hostile HAL data at every level', async () => {
    const hostile = doc(`${XSS}</text><foreignObject><script>alert(2)</script></foreignObject>`, {
      uri_s: 'javascript:alert(3)',
      fileMain_s: 'javascript:alert(4)',
      doiId_s: `"><script>alert(5)</script>`,
      label_s: '<img src=x onerror=alert(6)>',
      authFullName_s: [`<script>alert(7)</script>`, 'Ada Lovelace'],
      authIdHalFullName_fs: [`x_FacetSep_<script>alert(8)</script>`],
      journalTitle_s: `]]><script>alert(9)</script>`,
      conferenceTitle_s: `<iframe src=x></iframe>`,
      keyword_s: [`<script>alert(11)</script>`],
      en_domainAllCodeLabel_fs: [`info_FacetSep_<script>alert(12)</script>`],
      abstract_s: [`</text></svg><script>alert(13)</script>`],
      citationFull_s: `<a href="javascript:alert(14)">x</a>`,
      docType_s: '<script>',
    });
    for (const lvl of ['0', '1', '2', '3']) {
      const { deps: d } = deps(async () => halResponse([hostile]));
      const res = await handleSvgRequest(params({ idHal: 'jdoe', lvl, groupBy: 'docType' }), d);
      expectSafeSvg(res);
      expect(res.headers['Cache-Control']).toBe(CACHE_SUCCESS);
    }
  });

  it('never echoes upstream error details or stack traces', async () => {
    const { deps: d, log } = deps(async () => {
      throw new Error(`${XSS} at /var/task/node_modules/secret.js:1:1`);
    });
    const res = await handleSvgRequest(params({ idHal: 'jdoe' }), d);
    expectSafeSvg(res);
    expect(res.body).not.toContain('node_modules');
    expect(res.body).not.toContain('secret');
    expect(res.body).not.toContain('alert(1)');
    expect(log).toHaveBeenCalled();
  });

  it('blocks unsafe markup even if the renderer produced some (defence in depth)', async () => {
    lib.renderSvgOverride = () => `<svg xmlns="http://www.w3.org/2000/svg">${XSS}</svg>`;
    const { deps: d, log } = deps(async () => halResponse([doc('A paper')]));
    const res = await handleSvgRequest(params({ idHal: 'jdoe' }), d);
    expectSafeSvg(res);
    expect(textOf(res.body)).toContain('Could not render the publication list');
    expect(res.headers['Cache-Control']).toBe(CACHE_ERROR);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('unsafe'), expect.anything());
  });
});

// ---------------------------------------------------------------------------
// Headers and caching
// ---------------------------------------------------------------------------

describe('SVG endpoint: headers', () => {
  it('serves a cacheable SVG with a restrictive CSP', async () => {
    const { deps: d, fetchMock } = deps(async () => halResponse([doc('A paper')], 42));
    const res = await handleSvgRequest(params({ idHal: 'jdoe', lvl: '1', rows: '5' }), d);
    expect(res.status).toBe(200);
    expect(res.headers).toEqual({
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
      'X-Content-Type-Options': 'nosniff',
    });
    expect(res.body).toContain('A paper');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('queries HAL with the parsed criteria, sorted by date by default', async () => {
    const { deps: d, fetchMock } = deps(async () => halResponse([]));
    await handleSvgRequest(params({ idHal: 'jdoe' }), d);
    const url = halRequest(fetchMock);
    expect(url.origin).toBe('https://api.archives-ouvertes.fr');
    expect(url.searchParams.get('q')).toContain('jdoe');
    expect(url.searchParams.get('sort')).toMatch(/^producedDate_tdate desc/);
    expect(url.searchParams.get('rows')).toBe(String(DEFAULT_ROWS));
    expect(url.searchParams.get('fl')).not.toBe('*');
  });

  it('links the footer to the filtered list on HAL (the count is filtered too)', async () => {
    const { deps: d } = deps(async () => halResponse([doc('A paper')], 7));
    const res = await handleSvgRequest(params('idHal=jdoe&docTypes=ART,COMM&yearFrom=2020&oa=1'), d);
    expectSafeSvg(res);
    const href = /<a href="([^"]*)"[^>]*><text[^>]*>View all 7 publications on HAL/.exec(res.body)?.[1] ?? '';
    const url = new URL(href.replace(/&amp;/g, '&'));
    expect(`${url.origin}${url.pathname}`).toBe('https://hal.science/search/index/');
    expect(url.searchParams.get('q')).toBe(
      '(authIdHal_s:"jdoe") AND docType_s:(ART OR COMM) AND producedDateY_i:[2020 TO *] AND openAccess_bool:true',
    );
  });

  it('renders an empty result list as a normal (cached) image', async () => {
    const { deps: d } = deps(async () => halResponse([]));
    const res = await handleSvgRequest(params({ idHal: 'nobody' }), d);
    expectSafeSvg(res);
    expect(res.headers['Cache-Control']).toBe(CACHE_SUCCESS);
  });
});

// ---------------------------------------------------------------------------
// rows / page
// ---------------------------------------------------------------------------

describe('SVG endpoint: rows and paging', () => {
  it.each([
    ['1000', MAX_ROWS],
    ['20', 20],
    ['7', 7],
    ['abc', DEFAULT_ROWS],
    ['NaN', DEFAULT_ROWS],
  ])('rows=%s → %i', async (rows, expected) => {
    const { deps: d, fetchMock } = deps(async () => halResponse([]));
    await handleSvgRequest(params({ idHal: 'jdoe', rows }), d);
    expect(Number(halRequest(fetchMock).searchParams.get('rows'))).toBe(expected);
  });

  it.each(['0', '-3', '', '2.5', '1e9', '99999999999999999999'])('rows=%s stays within 1..MAX_ROWS', async (rows) => {
    const { deps: d, fetchMock } = deps(async () => halResponse([]));
    await handleSvgRequest(params({ idHal: 'jdoe', rows }), d);
    const value = Number(halRequest(fetchMock).searchParams.get('rows'));
    expect(value).toBeGreaterThanOrEqual(1);
    expect(value).toBeLessThanOrEqual(MAX_ROWS);
  });

  it('never renders more documents than requested', async () => {
    const many = Array.from({ length: 30 }, (_, i) => doc(`Paper number ${i + 1}`));
    const { deps: d } = deps(async () => halResponse(many, 30));
    const res = await handleSvgRequest(params({ idHal: 'jdoe', rows: '3' }), d);
    expect(res.body).toContain('Paper number 3');
    expect(res.body).not.toContain('Paper number 4');
  });

  it('maps page to start', async () => {
    const { deps: d, fetchMock } = deps(async () => halResponse([]));
    await handleSvgRequest(params({ idHal: 'jdoe', rows: '5', page: '3' }), d);
    expect(halRequest(fetchMock).searchParams.get('start')).toBe('10');
  });

  it('renders the last page for a page beyond it (one extra request)', async () => {
    const { deps: d, fetchMock } = deps(async (url) =>
      new URL(url).searchParams.get('start') === '4' ? halResponse([doc('Last paper')], 6) : halResponse([], 6),
    );
    const res = await handleSvgRequest(params({ idHal: 'jdoe', rows: '4', page: '5' }), d);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(halRequest(fetchMock, 0).searchParams.get('start')).toBe('16');
    expect(halRequest(fetchMock, 1).searchParams.get('start')).toBe('4');
    expectSafeSvg(res);
    expect(res.body).toContain('Last paper');
    expect(textOf(res.body)).not.toContain('No results');
    expect(res.headers['Cache-Control']).toBe(CACHE_SUCCESS);
  });

  it('does not retry for an empty result, page 1, or twice', async () => {
    for (const [query, numFound] of [['page=3', 0], ['page=1', 6], ['', 6]] as const) {
      const { deps: d, fetchMock } = deps(async () => halResponse([], numFound));
      await handleSvgRequest(params(`idHal=jdoe&rows=4&${query}`), d);
      expect(fetchMock, query).toHaveBeenCalledTimes(1);
    }
    // The last page is empty too (HAL changed in between): no loop.
    const { deps: d, fetchMock } = deps(async () => halResponse([], 6));
    const res = await handleSvgRequest(params('idHal=jdoe&rows=4&page=9'), d);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expectSafeSvg(res);
  });

  it('accepts an ORCID iD written as a URL', async () => {
    const { deps: d, fetchMock } = deps(async () => halResponse([doc('A paper')]));
    const res = await handleSvgRequest(params({ orcid: 'https://orcid.org/0000-0002-1825-009x' }), d);
    expectSafeSvg(res);
    expect(textOf(res.body)).not.toContain('Missing query');
    expect(halRequest(fetchMock).searchParams.get('q')).toBe('authORCIDIdExt_s:"0000-0002-1825-009X"');
  });
});

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

describe('SVG endpoint: errors', () => {
  it.each([
    ['no parameter', ''],
    ['presentation parameters only', 'lvl=2&rows=5&theme=dark'],
    ['empty or invalid criteria', 'idHal=&orcid=not-an-orcid&collection=a%20b'],
    // buildTextQuery leaves nothing of these: they would become q=*:* (the whole archive, cached 1 h)
    ['search=*', 'search=*'],
    ['search made of Solr syntax only', 'search=%22%22+%3F%3F%3F+-+(+)'],
  ])('asks for a query criterion instead of listing the whole archive (%s)', async (_label, query) => {
    const { deps: d, fetchMock } = deps(async () => halResponse([]));
    const res = await handleSvgRequest(params(query), d);
    expectSafeSvg(res);
    expect(textOf(res.body)).toContain('Missing query');
    expect(textOf(res.body)).toContain('idHal');
    expect(res.headers['Cache-Control']).toBe(CACHE_ERROR);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['HTTP 500', async () => new Response('<html>oops</html>', { status: 500 }), 'Could not load publications from HAL'],
    ['HTTP 503', async () => new Response('', { status: 503 }), 'Could not load publications from HAL'],
    ['HTTP 400 (bad Solr query)', async () => new Response('{}', { status: 400 }), 'HAL rejected this query'],
    // What HAL really answers to `q=title_s:(` (verified 2026-10-28)
    ['error body (bad Solr query)', async () => new Response('{"error":{"msg":"Error. See help : \\/docs"}}'), 'HAL rejected this query'],
    ['network failure', async () => Promise.reject(new TypeError('fetch failed')), 'Could not load publications from HAL'],
    ['invalid JSON', async () => new Response('not json', { status: 200 }), 'Could not load publications from HAL'],
    ['non-zero HAL status', async () => new Response(JSON.stringify({ responseHeader: { status: 1 } })), 'Could not load publications from HAL'],
    ['unexpected shape', async () => new Response(JSON.stringify({ response: { docs: 'x' } })), 'Could not load publications from HAL'],
  ])('upstream %s → 200 error image with a short cache', async (_label, impl, message) => {
    const { deps: d, log } = deps(impl as () => Promise<Response>);
    const res = await handleSvgRequest(params({ idHal: 'jdoe' }), d);
    expectSafeSvg(res);
    expect(textOf(res.body)).toContain(message);
    expect(res.headers['Cache-Control']).toBe(CACHE_ERROR);
    expect(res.headers['Content-Security-Policy']).toBe(SVG_CSP);
    expect(log).toHaveBeenCalled();
  });

  it('aborts a slow HAL request and answers with a timeout image', async () => {
    const { deps: d, fetchMock } = deps(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
      { timeoutMs: 50 },
    );
    const started = Date.now();
    const res = await handleSvgRequest(params({ idHal: 'jdoe' }), d);
    expect(Date.now() - started).toBeLessThan(2000);
    expectSafeSvg(res);
    expect(textOf(res.body)).toContain('did not answer in time');
    expect(res.headers['Cache-Control']).toBe(CACHE_ERROR);
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
  });

  it('reports a renderer crash as a generic error image', async () => {
    lib.renderSvgOverride = () => {
      throw new Error('internal detail /srv/app');
    };
    const { deps: d } = deps(async () => halResponse([doc('A paper')]));
    const res = await handleSvgRequest(params({ idHal: 'jdoe' }), d);
    expectSafeSvg(res);
    expect(res.body).not.toContain('/srv/app');
    expect(textOf(res.body)).toContain('Could not render the publication list');
  });
});

// ---------------------------------------------------------------------------
// Routing and legacy URLs
// ---------------------------------------------------------------------------

describe('routing', () => {
  // Same conversion as server.js (Express req.method / req.originalUrl).
  const request = (url: string, method = 'GET') => toSsrRequest(method, url);

  it('reads a leading // as a path, never as a host', async () => {
    expect(toSsrRequest('GET', '//svg?idHal=x')).toMatchObject({ pathname: '//svg' });
    expect(toSsrRequest('GET', '//:@/').pathname).toBe('//:@/');
    expect(toSsrRequest('GET', '/@evil.example/svg').pathname).toBe('/@evil.example/svg');
    expect(toSsrRequest('GET', '/svg?idHal=x&bg=%23fff').searchParams.get('bg')).toBe('#fff');

    const { deps: d, fetchMock } = deps(async () => halResponse([doc('A paper')]));
    // `GET //` used to throw (500) and `GET //svg?…` to hit the legacy route with the host "svg".
    const root = await handleRequest(request('//'), d);
    expect(root.status).toBe(200);
    expect(root.headers['Content-Type']).toBe('text/html; charset=utf-8');
    for (const url of ['//svg?idHal=x', '///svg?idHal=x', '//:@/', '//evil.example/?idHal=x']) {
      const res = await handleRequest(request(url), d);
      expect(res.status, url).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('server.js converts requests with toSsrRequest', () => {
    const server = readFileSync(fileURLToPath(new URL('../ssr-app/server.js', import.meta.url)), 'utf8');
    expect(server).toContain('toSsrRequest(req.method, req.originalUrl)');
    expect(server).not.toMatch(/new URL\(req\./);
  });

  it('keeps README URLs of hal-search ≤ 0.4 working', async () => {
    const { deps: d, fetchMock } = deps(async () => halResponse([doc('Legacy paper')]));
    const res = await handleRequest(
      request('/?uid=jpugetgil&output=svg&bg=%231a1a2e&text=%23e0e0e0&main=%23e63946'),
      d,
    );
    expectSafeSvg(res);
    expect(res.headers['Cache-Control']).toBe(CACHE_SUCCESS);
    expect(res.body).toContain('Legacy paper');
    expect(res.body.toLowerCase()).toContain('#1a1a2e');
    expect(halRequest(fetchMock).searchParams.get('q')).toContain('jpugetgil');
  });

  it.each(['/?uid=jpugetgil&type=svg', '/?uid=jpugetgil', '/?idHal=jpugetgil&lvl=2', '/svg?idHal=jpugetgil', '/svg/?idHal=jpugetgil'])(
    '%s → SVG',
    async (url) => {
      const { deps: d, fetchMock } = deps(async () => halResponse([doc('A paper')]));
      const res = await handleRequest(request(url), d);
      expectSafeSvg(res);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('answers /?output=svg (old default author) with the missing-query image', async () => {
    const { deps: d, fetchMock } = deps(async () => halResponse([]));
    const res = await handleRequest(request('/?output=svg'), d);
    expectSafeSvg(res);
    expect(textOf(res.body)).toContain('Missing query');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('serves a static landing page on / that never reflects the request', async () => {
    const { deps: d, fetchMock } = deps(async () => halResponse([]));
    const plain = await handleRequest(request('/'), d);
    const tracked = await handleRequest(request(`/?fbclid=${encodeURIComponent(XSS)}&utm_source=x`), d);
    expect(plain.status).toBe(200);
    expect(plain.headers['Content-Type']).toBe('text/html; charset=utf-8');
    expect(plain.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(plain.headers['Content-Security-Policy']).toContain("default-src 'none'");
    expect(plain.headers['Content-Security-Policy']).not.toContain('script-src');
    expect(plain.body).toContain('https://github.com/JPugetGil/hal-search');
    expect(plain.body).toContain('/svg?idHal=');
    expect(plain.body).not.toMatch(/<script/i);
    expect(tracked).toEqual(plain);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('serves the landing page for /?search=* (no criterion, not a legacy image URL)', async () => {
    const { deps: d, fetchMock } = deps(async () => halResponse([]));
    const res = await handleRequest(request('/?search=*'), d);
    expect(res.headers['Content-Type']).toBe('text/html; charset=utf-8');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers HEAD like GET', async () => {
    const { deps: d } = deps(async () => halResponse([doc('A paper')]));
    const res = await handleRequest(request('/svg?idHal=jdoe', 'HEAD'), d);
    expect(res.headers['Content-Type']).toBe('image/svg+xml; charset=utf-8');
  });

  it('returns 404 for unknown paths without reflecting them', async () => {
    const res = await handleRequest(request(`/${encodeURIComponent(XSS)}`), {});
    expect(res.status).toBe(404);
    expect(res.headers['Content-Type']).toBe('text/plain; charset=utf-8');
    expect(res.body).toBe('Not found');
  });

  it('returns 405 for other methods', async () => {
    const res = await handleRequest(request('/svg?idHal=jdoe', 'POST'), {});
    expect(res.status).toBe(405);
    expect(res.headers.Allow).toBe('GET, HEAD');
  });
});

// ---------------------------------------------------------------------------
// Concurrency (B3)
// ---------------------------------------------------------------------------

describe('concurrency', () => {
  it('concurrent requests never see each other’s data or options', async () => {
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const { deps: d } = deps(async (url) => {
      const q = new URL(url).searchParams.get('q') ?? '';
      const who = /author(\d+)/.exec(q)?.[1] ?? '?';
      // Later requests answer first, so every request awaits while others complete.
      await delay(5 * (20 - Number(who)));
      return halResponse([doc(`Paper of author${who}`)]);
    });

    const ids = Array.from({ length: 12 }, (_, i) => i + 1);
    const responses = await Promise.all(
      ids.map((i) =>
        handleSvgRequest(params({ idHal: `author${i}`, title: `Title of author${i}`, bg: i % 2 ? '#111111' : '#eeeeee' }), d),
      ),
    );

    responses.forEach((res, index) => {
      const i = ids[index];
      expectSafeSvg(res);
      expect(res.body).toContain(`Paper of author${i}<`);
      expect(res.body).toContain(`Title of author${i}`);
      for (const other of ids.filter((j) => j !== i)) {
        expect(res.body).not.toContain(`author${other}<`);
      }
    });
    expect('window' in globalThis).toBe(false);
    expect('document' in globalThis).toBe(false);
  });
});
