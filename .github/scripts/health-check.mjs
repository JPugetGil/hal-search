// Health check of the SVG image service, run by .github/workflows/health.yml (Node 18+, no dependency).
// Requests a few public URLs and exits with 1 when one of them is down, slow, an error image, or not served
// by a function in the expected Vercel region.
//
// Usage: node .github/scripts/health-check.mjs [baseUrl]   (default: https://hal-search.vercel.app)

const BASE_URL = process.argv[2] ?? 'https://hal-search.vercel.app';

/** Region of the function (ssr-app/vercel.json "regions"), next to the HAL API. */
const REGION = 'cdg1';

/** Slower answers fail: GitHub's camo image proxy gives up on slow images. */
const MAX_MS = 5000;

/** One more try after this delay before reporting a failure (cold starts, network blips). */
const RETRY_DELAY_MS = 10_000;

/**
 * Error images answer 200 with the message as <title>: ERROR_MESSAGES in ssr-app/src/render.ts.
 * (The last-resort FALLBACK_ERROR_SVG has no <title> at all.)
 */
const ERROR_TITLES = [
  'Missing query',
  'HAL rejected this query',
  'HAL did not answer in time',
  'Could not load publications from HAL',
  'Could not render the publication list',
];

const CHECKS = [
  { name: 'SVG endpoint', path: '/svg?idHal=jpugetgil&rows=1', type: 'image/svg+xml' },
  { name: 'legacy SVG URL (0.4)', path: '/?uid=jpugetgil&output=svg', type: 'image/svg+xml' },
  { name: 'landing page', path: '/', type: 'text/html' },
];

// ---------------------------------------------------------------------------

/** Requests one URL and returns the list of problems (empty when healthy). */
async function check({ path, type }) {
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
  if (type === 'image/svg+xml') {
    const title = /<title>([^<]*)<\/title>/.exec(body)?.[1];
    if (title === undefined) problems.push('SVG without <title> (fallback error image?)');
    else if (ERROR_TITLES.some((error) => title.startsWith(error))) problems.push(`error image: "${title}"`);
  }
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
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }
  return result;
}

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
