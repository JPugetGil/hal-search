// The SVG checks of the health check (.github/scripts/health-check.mjs) against real answers of the SVG service
// (ssr-app/src/render.ts, HAL stubbed): error images and empty lists are detected structurally, in any language.
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { FALLBACK_ERROR_SVG, handleRequest, toSsrRequest } from '../ssr-app/src/render';
import type { HalDoc } from '../src/types';

type SvgProblems = (body: string, options?: { populated?: boolean }) => string[];

// A plain script (no declarations): imported by path, typed here.
const HEALTH_CHECK = fileURLToPath(new URL('../.github/scripts/health-check.mjs', import.meta.url));
const { svgProblems } = (await import(/* @vite-ignore */ HEALTH_CHECK)) as { svgProblems: SvgProblems };

const DOC: HalDoc = { docid: '1', uri_s: 'https://hal.science/hal-1', title_s: ['Graph versioning'], producedDateY_i: 2024 };

/** Body of the SVG service's answer to `path`, HAL answering `numFound` results (or failing). */
async function serve(path: string, numFound: number | 'fail'): Promise<string> {
  const fetch = vi.fn(async () =>
    numFound === 'fail'
      ? new Response('down', { status: 503 })
      : new Response(
          JSON.stringify({ responseHeader: { status: 0 }, response: { numFound, start: 0, docs: numFound > 0 ? [DOC] : [] } }),
        ),
  );
  const res = await handleRequest(toSsrRequest('GET', path), { fetch: fetch as unknown as typeof globalThis.fetch, log: () => {} });
  expect(res.headers['Content-Type']).toContain('image/svg+xml');
  return res.body;
}

describe('health check: svgProblems', () => {
  it('accepts a publication list', async () => {
    expect(svgProblems(await serve('/svg?idHal=jpugetgil&rows=1', 6), { populated: true })).toEqual([]);
    expect(svgProblems(await serve('/?uid=jpugetgil&output=svg&lang=fr', 1234), { populated: true })).toEqual([]);
  });

  it('flags an empty list for a query known to match publications, in any language', async () => {
    for (const lang of ['', '&lang=fr']) {
      const body = await serve(`/svg?idHal=jpugetgil&rows=1${lang}`, 0);
      expect(svgProblems(body, { populated: true }), lang).toEqual(['0 results for a query known to match publications']);
      // Not a problem for other queries
      expect(svgProblems(body), lang).toEqual([]);
    }
  });

  it('flags error images by their marker, whatever their message', async () => {
    const errors = [
      await serve('/svg?idHal=jpugetgil', 'fail'),
      await serve('/svg?idHal=jpugetgil&lang=fr', 'fail'),
      await serve('/svg?lang=fr', 6), // missing query
      FALLBACK_ERROR_SVG,
    ];
    for (const body of errors) {
      const problems = svgProblems(body, { populated: true });
      expect(problems, body.slice(0, 200)).toHaveLength(1);
      expect(problems[0]).toMatch(/^error image/);
    }
  });

  it('flags answers that are no publication list', () => {
    expect(svgProblems('<html><body>Oops</body></html>')).toEqual(['no <svg> element']);
    expect(svgProblems('<svg xmlns="http://www.w3.org/2000/svg"><title>x</title></svg>')).toEqual([
      'SVG without data-hal-count (not a publication list)',
    ]);
  });
});
