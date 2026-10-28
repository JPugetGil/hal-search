import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BASE, fetchArticles, isAbortError } from '../src/api';
import { HAL_API_BASE } from '../src/query';
import type { FetchParams, HalApiResponse } from '../src/types';

const OK_BODY: HalApiResponse = {
  responseHeader: { status: 0, QTime: 1 },
  response: { numFound: 1, start: 0, docs: [{ docid: '1', label_s: 'A paper' }] },
};

const PARAMS: FetchParams = { query: { idHal: 'jpugetgil' }, lvl: 1, rows: 10, start: 0 };

function respond(body: string, init: ResponseInit = {}) {
  const fetchMock = vi.fn(async () => new Response(body, { status: 200, ...init }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// fetchArticles
// ---------------------------------------------------------------------------

describe('fetchArticles', () => {
  it('keeps DEFAULT_BASE in sync with the query builder', () => {
    expect(DEFAULT_BASE).toBe('https://api.archives-ouvertes.fr/search/');
    expect(DEFAULT_BASE).toBe(HAL_API_BASE);
  });

  it('requests the URL built by buildHalUrl and returns the parsed body', async () => {
    const fetchMock = respond(JSON.stringify(OK_BODY));
    const data = await fetchArticles(PARAMS);
    expect(data).toEqual(OK_BODY);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const u = new URL(url);
    expect(`${u.origin}${u.pathname}`).toBe(DEFAULT_BASE);
    expect(u.searchParams.get('q')).toBe('authIdHal_s:"jpugetgil"');
    expect(u.searchParams.get('sort')).toBe('producedDate_tdate desc,docid desc');
    expect((init.headers as Record<string, string>).Accept).toBe('application/json');
  });

  it('accepts responses without responseHeader (HAL default)', async () => {
    const body = { response: { numFound: 0, start: 0, docs: [] } };
    respond(JSON.stringify(body));
    await expect(fetchArticles(PARAMS)).resolves.toEqual(body);
  });

  it('forwards the AbortSignal to fetch', async () => {
    const fetchMock = respond(JSON.stringify(OK_BODY));
    const controller = new AbortController();
    await fetchArticles({ ...PARAMS, signal: controller.signal });
    const init = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init[1].signal).toBe(controller.signal);
  });

  it('rejects with an AbortError when the signal aborts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('The operation was aborted.', 'AbortError')),
            );
          }),
      ),
    );
    const controller = new AbortController();
    const promise = fetchArticles({ ...PARAMS, signal: controller.signal });
    controller.abort();
    const err = await promise.catch(e => e);
    expect(isAbortError(err)).toBe(true);
  });

  it("surfaces HAL/Solr's own message on HTTP errors", async () => {
    respond(JSON.stringify({ error: { msg: 'undefined field foo_s', code: 400 } }), {
      status: 400,
      statusText: 'Bad Request',
    });
    await expect(fetchArticles(PARAMS)).rejects.toThrow('HAL API error 400: undefined field foo_s');
  });

  it('falls back to the status text when the error body is not JSON', async () => {
    respond('<html>Internal error</html>', { status: 503, statusText: 'Service Unavailable' });
    await expect(fetchArticles(PARAMS)).rejects.toThrow('HAL API error 503: Service Unavailable');
  });

  it('truncates huge error messages and strips control characters', async () => {
    respond(JSON.stringify({ error: { msg: `bad\nquery ${'x'.repeat(10_000)}` } }), { status: 400 });
    const err: Error = await fetchArticles(PARAMS).catch(e => e);
    expect(err.message.length).toBeLessThan(300);
    expect(err.message).not.toContain('\n');
    expect(err.message).toMatch(/^HAL API error 400: bad query x+…$/);
  });

  it('throws on HTTP 200 responses carrying an error object (HAL syntax errors)', async () => {
    respond(JSON.stringify({ error: { msg: 'Error. See help : /docs' } }));
    await expect(fetchArticles(PARAMS)).rejects.toThrow('HAL API error: Error. See help : /docs');
  });

  it('throws on non-zero responseHeader status', async () => {
    respond(JSON.stringify({ ...OK_BODY, responseHeader: { status: 1, QTime: 0 } }));
    await expect(fetchArticles(PARAMS)).rejects.toThrow(/non-zero status: 1/);
  });

  it('hints at the collection code when HAL answers HTML (unknown collection redirect)', async () => {
    respond('<!DOCTYPE html><html></html>', { headers: { 'content-type': 'text/html' } });
    await expect(fetchArticles({ ...PARAMS, query: { collection: 'NOPE' } })).rejects.toThrow(
      /unexpected response.*"NOPE".*collection/,
    );
  });

  it('throws on JSON that is not a search response', async () => {
    respond(JSON.stringify({ foo: 1 }));
    await expect(fetchArticles(PARAMS)).rejects.toThrow(/unexpected response/);
  });

  it('rejects invalid collections before any request', async () => {
    const fetchMock = respond(JSON.stringify(OK_BODY));
    await expect(fetchArticles({ ...PARAMS, query: { collection: 'a/b' } })).rejects.toThrow(/collection/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('propagates network errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    const err = await fetchArticles(PARAMS).catch(e => e);
    expect(err).toBeInstanceOf(TypeError);
    expect(isAbortError(err)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isAbortError
// ---------------------------------------------------------------------------

describe('isAbortError', () => {
  it('recognises AbortError DOMExceptions and errors', () => {
    expect(isAbortError(new DOMException('aborted', 'AbortError'))).toBe(true);
    const err = new Error('aborted');
    err.name = 'AbortError';
    expect(isAbortError(err)).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isAbortError(new Error('boom'))).toBe(false);
    expect(isAbortError(new DOMException('timeout', 'TimeoutError'))).toBe(false);
    expect(isAbortError('AbortError')).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
  });
});
