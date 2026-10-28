// Health check of the SVG image service, run by .github/workflows/health.yml (Node 18+, no dependency).
// Requests a few public URLs and exits with 1 when one of them is down, slow, an error image, an empty list where
// publications are expected, or not served by a function in the expected Vercel region.
//
// Usage: node .github/scripts/health-check.mjs [baseUrl]   (default: https://hal-search.vercel.app)

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.argv[2] ?? 'https://hal-search.vercel.app';

/** Region of the function (ssr-app/vercel.json "regions"), next to the HAL API. */
const REGION = 'cdg1';

/** Slower answers fail: GitHub's camo image proxy gives up on slow images. */
const MAX_MS = 5000;

/** One more try after this delay before reporting a failure (cold starts, network blips). */
const RETRY_DELAY_MS = 10_000;

/**
 * `populated`: the query is known to match publications (the HAL author jpugetgil), so an image counting
 * 0 results means the service is broken (wrong query, wrong field list...), not that HAL is empty.
 */
const CHECKS = [
  { name: 'SVG endpoint', path: '/svg?idHal=jpugetgil&rows=1', type: 'image/svg+xml', populated: true },
  { name: 'legacy SVG URL (0.4)', path: '/?uid=jpugetgil&output=svg', type: 'image/svg+xml', populated: true },
  { name: 'landing page', path: '/', type: 'text/html' },
];

// ---------------------------------------------------------------------------

/**
 * Problems of an SVG answer, read from its root element (src/svg.ts), never from its text, which depends on the
 * language and the labels: error images carry `data-hal-error`, publication lists `data-hal-count` (the number
 * of matching publications, a plain integer).
 */
export function svgProblems(body, { populated = false } = {}) {
  const root = /<svg\b[^>]*>/.exec(body)?.[0];
  if (!root) return ['no <svg> element'];
  if (/\sdata-hal-error=/.test(root)) {
    const title = /<title>([^<]*)<\/title>/.exec(body)?.[1];
    return [`error image${title ? `: "${title}"` : ''}`];
  }
  const count = /\sdata-hal-count="(\d+)"/.exec(root)?.[1];
  if (count === undefined) return ['SVG without data-hal-count (not a publication list)'];
  if (populated && Number(count) === 0) return ['0 results for a query known to match publications'];
  return [];
}

/** Requests one URL and returns the list of problems (empty when healthy). */
async function check({ path, type, populated }) {
  const url = new URL(path, BASE_URL);
  // Unknown parameters are ignored by the service; this one bypasses the CDN cache so that the function runs
  // (a cached answer has no function region in x-vercel-id).
  url.searchParams.set('health', String(Date.now()));

  const started = performance.now();
  const res = await fetch(url, {
    headers: { 'User-Agent': 'hal-search-health-check (+https://github.com/JPugetGil/hal-search)' },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.text();
  const ms = Math.round(performance.now() - started);

  const problems = [];
  if (res.status !== 200) problems.push(`HTTP ${res.status}`);
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.startsWith(type)) problems.push(`content-type "${contentType}", expected ${type}`);
  if (type === 'image/svg+xml') problems.push(...svgProblems(body, { populated }));
  // Format edge::function::request-id, e.g. cdg1::cdg1::abcde-1700000000000-0123456789ab.
  const vercelId = res.headers.get('x-vercel-id') ?? '';
  const hops = vercelId.split('::');
  if (hops.length < 3 || hops[hops.length - 2] !== REGION) {
    problems.push(`x-vercel-id "${vercelId}": function not in ${REGION}`);
  }
  if (ms > MAX_MS) problems.push(`answered in ${ms} ms (max ${MAX_MS})`);
  return { url, ms, vercelId, problems };
}

/** check() with one retry; network errors count as problems. */
async function checkWithRetry(target) {
  let result;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      result = await check(target);
    } catch (err) {
      result = { url: new URL(target.path, BASE_URL), ms: 0, vercelId: '', problems: [`request failed: ${err.message}`] };
    }
    if (result.problems.length === 0 || attempt === 2) return result;
    console.log(`  ${target.name}: ${result.problems.join('; ')}, retrying in ${RETRY_DELAY_MS / 1000} s`);
    await new Promise((done) => setTimeout(done, RETRY_DELAY_MS));
  }
  return result;
}

async function main() {
  let failed = 0;
  for (const target of CHECKS) {
    const { url, ms, vercelId, problems } = await checkWithRetry(target);
    if (problems.length === 0) {
      console.log(`OK    ${target.name}: ${ms} ms, ${vercelId} (${url})`);
    } else {
      failed++;
      // GitHub Actions annotation: shown on the run summary page.
      console.log(`::error title=${target.name}::${problems.join('; ')} (${url})`);
    }
  }
  if (failed > 0) {
    console.log(`${failed} of ${CHECKS.length} checks failed.`);
    process.exit(1);
  }
}

// Run when executed (`node health-check.mjs`), not when imported (test/health-check.test.ts).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
