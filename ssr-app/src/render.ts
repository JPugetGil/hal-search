import {
  buildHalUrl,
  buildHalWebUrl,
  hasQueryCriterion,
  parseUrlParams,
  renderErrorSvg,
  renderSvg,
} from 'hal-search/svg';
import type { HalApiResponse, HalFilters, HalQuery, SvgRenderOptions, UrlState } from 'hal-search/svg';

// DOM-free request handlers of the SVG image service (GitHub README / Markdown).
// No global state: every request builds its own values, so concurrent requests never interfere.
// server.js is a thin Express adapter around `handleRequest`.

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Upper bound for `rows`: README images must stay small and fast. */
export const MAX_ROWS = 20;

/** Number of publications when `rows` is absent or invalid. */
export const DEFAULT_ROWS = 10;

/** HAL request timeout (ms). GitHub's camo proxy gives up on slow images. */
export const HAL_TIMEOUT_MS = 4000;

/** Public URL of the service, used in the landing page snippets (never taken from the request). */
const SERVICE_URL = 'https://hal-search.vercel.app';

const REPO_URL = 'https://github.com/JPugetGil/hal-search';

/** Successful images: 1 h in browsers/camo and on the Vercel CDN, then served stale while revalidating. */
export const CACHE_SUCCESS = 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400';

/** Error images are cached briefly so a transient HAL outage heals quickly. */
export const CACHE_ERROR = 'public, max-age=60, s-maxage=60';

const CACHE_STATIC = 'public, max-age=3600, s-maxage=86400';

/** SVG documents only need inline styles; scripts, fonts, images and requests are all blocked. */
export const SVG_CSP = "default-src 'none'; style-src 'unsafe-inline'";

const HTML_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const USER_AGENT = `hal-search-ssr (+${REPO_URL})`;

/** Markup that must never reach a client. Text content is XML-escaped, so a literal match is real markup. */
const UNSAFE_MARKUP = /<\s*\/?\s*(script|foreignObject|iframe|object|embed)\b/i;

/** Static last-resort image (no dynamic content) when even the error renderer fails. */
const FALLBACK_ERROR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="48" viewBox="0 0 400 48" role="img" aria-label="Error">' +
  '<rect width="400" height="48" rx="6" fill="#fdecea" stroke="#f5c2c0"/>' +
  '<text x="16" y="29" font-family="sans-serif" font-size="14" fill="#8a1c1c">Could not render the publication list.</text>' +
  '</svg>';

/** User-facing error messages: informative, never internal details. */
export const ERROR_MESSAGES = {
  missingQuery: 'Missing query: add idHal, orcid, collection, structId, search or q to the image URL.',
  badQuery: 'HAL rejected this query: check the URL parameters.',
  timeout: 'HAL did not answer in time. Please try again later.',
  upstream: 'Could not load publications from HAL. Please try again later.',
  internal: 'Could not render the publication list.',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Framework-agnostic HTTP response. */
export interface SsrResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** Framework-agnostic HTTP request (only what the service needs). */
export interface SsrRequest {
  /** Default: 'GET' */
  method?: string;
  pathname: string;
  searchParams: URLSearchParams;
}

/** Injectable dependencies (tests, other runtimes). */
export interface HandlerDeps {
  /** Default: the global fetch */
  fetch?: typeof fetch;
  /** HAL request timeout in ms. Default: HAL_TIMEOUT_MS */
  timeoutMs?: number;
  /** Server-side error logger. Default: console.error */
  log?: (message: string, detail?: unknown) => void;
}

/** Failure of the HAL request, mapped to a user-facing message. */
class UpstreamError extends Error {
  constructor(
    message: string,
    /** Safe to show in the image */
    readonly userMessage: string,
    /** Underlying error, logged server-side only */
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

/**
 * Builds an SsrRequest from a raw request target (Express `req.originalUrl`, e.g. `/svg?idHal=x`).
 * The target is always read as a path appended to a fixed origin: `new URL('//svg?…', base)` would
 * read `svg` as a host (`GET //` threw, `GET //svg?…` hit the legacy route). Never throws.
 */
export function toSsrRequest(method: string | undefined, target: string): SsrRequest {
  const raw = typeof target === 'string' ? target : '';
  const url = new URL(`http://localhost${raw.startsWith('/') ? raw : `/${raw}`}`);
  return { method, pathname: url.pathname, searchParams: url.searchParams };
}

/**
 * Routes a request:
 * - `GET /svg?…` → SVG image;
 * - `GET /?…` with a query criterion or `output`/`type` (README URLs of hal-search ≤ 0.4) → SVG image;
 * - `GET /` otherwise → static landing page (never reflects the request);
 * - other paths → 404, other methods → 405.
 */
export async function handleRequest(req: SsrRequest, deps: HandlerDeps = {}): Promise<SsrResponse> {
  const method = (req.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return textResponse(405, 'Method not allowed', { Allow: 'GET, HEAD' });
  }

  const pathname = req.pathname.replace(/\/+$/, '') || '/';
  if (pathname === '/svg') return handleSvgRequest(req.searchParams, deps);
  if (pathname === '/') {
    return isLegacySvgRequest(req.searchParams)
      ? handleSvgRequest(req.searchParams, deps)
      : landingResponse();
  }
  return textResponse(404, 'Not found');
}

/** True when `/?…` carries something meant for the SVG endpoint (and not, say, a tracking parameter). */
function isLegacySvgRequest(searchParams: URLSearchParams): boolean {
  if (searchParams.keys().next().done) return false;
  try {
    const state = parseUrlParams(searchParams, { maxRows: MAX_ROWS });
    return hasQueryCriterion(state.query) || state.output !== undefined;
  } catch {
    // Let the SVG handler report the problem as an image.
    return true;
  }
}

// ---------------------------------------------------------------------------
// SVG endpoint
// ---------------------------------------------------------------------------

/**
 * Renders the publication list described by the public URL scheme as a standalone SVG.
 * Always answers 200 with an SVG (a non-2xx shows a broken image on GitHub): failures produce an
 * error image with a short cache and are logged server-side, without internal details.
 */
export async function handleSvgRequest(
  searchParams: URLSearchParams,
  deps: HandlerDeps = {},
): Promise<SsrResponse> {
  const log = deps.log ?? defaultLog;
  let errorTheme: 'light' | 'dark' = 'light';

  try {
    const state = parseUrlParams(searchParams, { maxRows: MAX_ROWS });
    if (state.theme === 'dark') errorTheme = 'dark';

    if (!hasQueryCriterion(state.query)) {
      return errorResponse(ERROR_MESSAGES.missingQuery, errorTheme, log);
    }

    const rows = clampRows(state.rows);
    const page = state.page !== undefined && Number.isFinite(state.page) && state.page >= 1
      ? Math.floor(state.page)
      : 1;
    const lvl = state.lvl ?? 1;

    const fetchPage = (p: number) =>
      fetchHal(
        buildHalUrl({
          query: state.query,
          filters: state.filters,
          sort: state.sort ?? 'date-desc',
          lvl,
          rows,
          start: (p - 1) * rows,
        }),
        deps,
      );

    let data = await fetchPage(page);
    // A page beyond the last one (the list shrank since the README was written) renders the last page
    // instead of "No results" under a non-zero count. One extra request at most.
    const found = data.response.numFound;
    if (data.response.docs.length === 0 && typeof found === 'number' && found > 0 && page > 1) {
      const lastPage = Math.ceil(found / rows);
      if (lastPage < page) data = await fetchPage(lastPage);
    }

    const docs = data.response.docs.slice(0, rows);
    const totalFound = typeof data.response.numFound === 'number' ? data.response.numFound : docs.length;
    const svg = renderSvg(docs, {
      ...toDisplayOptions(state),
      lvl,
      totalFound,
      halUrl: safeHalWebUrl(state.query, state.filters),
    });

    if (UNSAFE_MARKUP.test(svg)) {
      // Defence in depth: the renderer escapes everything, this should never happen.
      log('renderSvg produced unsafe markup, response blocked', { query: searchParams.toString() });
      return errorResponse(ERROR_MESSAGES.internal, errorTheme, log);
    }
    return svgResponse(svg, CACHE_SUCCESS);
  } catch (err) {
    if (err instanceof UpstreamError) {
      log(err.message, { query: searchParams.toString(), detail: err.detail });
      return errorResponse(err.userMessage, errorTheme, log);
    }
    log('SVG rendering failed', { query: searchParams.toString(), error: err });
    return errorResponse(ERROR_MESSAGES.internal, errorTheme, log);
  }
}

/** Fetches and validates a HAL API response, with a timeout. Throws UpstreamError. */
async function fetchHal(url: string, deps: HandlerDeps): Promise<HalApiResponse> {
  const doFetch = deps.fetch ?? globalThis.fetch;
  const signal = AbortSignal.timeout(deps.timeoutMs ?? HAL_TIMEOUT_MS);
  // Logged with every upstream failure: tells a slow HAL apart from a network problem.
  const startedAt = Date.now();

  let data: unknown;
  try {
    const res = await doFetch(url, {
      signal,
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    });
    if (!res.ok) {
      // 400 = invalid Solr syntax or parameter: the URL must be fixed, retrying won't help.
      const userMessage = res.status === 400 ? ERROR_MESSAGES.badQuery : ERROR_MESSAGES.upstream;
      throw new UpstreamError(`HAL API HTTP ${res.status} after ${Date.now() - startedAt} ms for ${url}`, userMessage);
    }
    data = await res.json();
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
    const timedOut = signal.aborted;
    throw new UpstreamError(
      `HAL API ${timedOut ? 'timeout' : 'request failed'} after ${Date.now() - startedAt} ms for ${url}`,
      timedOut ? ERROR_MESSAGES.timeout : ERROR_MESSAGES.upstream,
      err,
    );
  }

  const response = data as (Partial<HalApiResponse> & { error?: unknown }) | null;
  if (response?.error !== undefined && !response.response) {
    // HAL answers a malformed query (e.g. `q=title_s:(`) with HTTP 200 and `{"error": {...}}`.
    throw new UpstreamError(`HAL API error ${JSON.stringify(response.error)} for ${url}`, ERROR_MESSAGES.badQuery);
  }
  const status = response?.responseHeader?.status;
  if (status !== undefined && status !== 0) {
    throw new UpstreamError(`HAL API status ${status} for ${url}`, ERROR_MESSAGES.upstream);
  }
  if (!response?.response || !Array.isArray(response.response.docs)) {
    throw new UpstreamError(`Unexpected HAL API response for ${url}`, ERROR_MESSAGES.upstream);
  }
  return response as HalApiResponse;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Bounds `rows` to 1..MAX_ROWS, DEFAULT_ROWS when absent or invalid. */
function clampRows(rows: number | undefined): number {
  if (rows === undefined || !Number.isFinite(rows)) return DEFAULT_ROWS;
  return Math.min(MAX_ROWS, Math.max(1, Math.floor(rows)));
}

/** Presentation options of the URL state (query, filters and paging are not SVG options). */
function toDisplayOptions(state: UrlState): Omit<SvgRenderOptions, 'totalFound'> {
  return {
    theme: state.theme,
    groupBy: state.groupBy,
    highlightAuthors: state.highlightAuthors,
    maxAuthors: state.maxAuthors,
    showCredit: state.showCredit,
    backgroundColor: state.backgroundColor,
    textColor: state.textColor,
    mainColor: state.mainColor,
    title: state.title,
  };
}

/** Footer link to the list on the HAL website (with the filters of the shown count), http(s) only. */
function safeHalWebUrl(query: HalQuery, filters: HalFilters): string | undefined {
  try {
    const url = buildHalWebUrl(query, filters);
    return /^https?:\/\//i.test(url) ? url : undefined;
  } catch {
    return undefined;
  }
}

function defaultLog(message: string, detail?: unknown): void {
  console.error(`[hal-search-ssr] ${message}`, detail ?? '');
}

function svgResponse(body: string, cacheControl: string): SsrResponse {
  return {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': cacheControl,
      'Content-Security-Policy': SVG_CSP,
      'X-Content-Type-Options': 'nosniff',
    },
    body,
  };
}

function errorResponse(
  message: string,
  theme: 'light' | 'dark',
  log: NonNullable<HandlerDeps['log']>,
): SsrResponse {
  let svg: string;
  try {
    svg = renderErrorSvg(message, { theme });
    if (UNSAFE_MARKUP.test(svg)) svg = FALLBACK_ERROR_SVG;
  } catch (err) {
    log('renderErrorSvg failed', err);
    svg = FALLBACK_ERROR_SVG;
  }
  return svgResponse(svg, CACHE_ERROR);
}

function textResponse(status: number, body: string, extraHeaders: Record<string, string> = {}): SsrResponse {
  return {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': CACHE_ERROR,
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
    body,
  };
}

// ---------------------------------------------------------------------------
// Landing page (static: nothing from the request is ever reflected)
// ---------------------------------------------------------------------------

const EXAMPLE_IMAGE = `${SERVICE_URL}/svg?idHal=YOUR_IDHAL&amp;lvl=1&amp;rows=5`;

const LANDING_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>hal-search SVG service</title>
<meta name="description" content="Publication lists from the HAL open archive as an SVG image for Markdown and GitHub READMEs.">
<style>
  :root { color-scheme: light dark; --bg: #ffffff; --text: #1f2328; --muted: #59636e; --accent: #0052cc; --code: #f6f8fa; --border: #d1d9e0; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0d1117; --text: #e6edf3; --muted: #9198a1; --accent: #4493f8; --code: #161b22; --border: #3d444d; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 860px; margin: 0 auto; padding: 32px 16px 48px; }
  h1 { font-size: 1.6rem; line-height: 1.3; margin: 0 0 8px; }
  h2 { font-size: 1.15rem; margin: 32px 0 8px; }
  p { margin: 8px 0; }
  a { color: var(--accent); }
  .lead { color: var(--muted); margin-bottom: 24px; }
  pre { background: var(--code); border: 1px solid var(--border); border-radius: 6px; padding: 12px 16px; overflow-x: auto; font-size: 0.85rem; line-height: 1.5; }
  code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
  table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
  th, td { text-align: left; vertical-align: top; padding: 6px 8px; border-bottom: 1px solid var(--border); }
  th { font-weight: 600; }
  td:first-child { white-space: nowrap; }
  .example { margin-top: 12px; border: 1px solid var(--border); border-radius: 6px; padding: 8px; }
  .example img { display: block; width: 100%; height: auto; }
  footer { margin-top: 40px; color: var(--muted); font-size: 0.9rem; }
</style>
</head>
<body>
<main>
<h1>hal-search SVG service</h1>
<p class="lead">Publication lists from the <a href="https://hal.science">HAL</a> open archive, rendered as an SVG image you can paste in Markdown, such as a GitHub profile README.</p>

<h2>Markdown</h2>
<p>Replace <code>YOUR_IDHAL</code> with your HAL author identifier. Links inside an image are not clickable on GitHub, so wrap the image in a link to your HAL page.</p>
<pre><code>[![Publications](${EXAMPLE_IMAGE})](https://cv.hal.science/YOUR_IDHAL)</code></pre>

<h2>Light and dark mode on GitHub</h2>
<pre><code>&lt;picture&gt;
  &lt;source media="(prefers-color-scheme: dark)" srcset="${SERVICE_URL}/svg?idHal=YOUR_IDHAL&amp;theme=dark"&gt;
  &lt;img alt="Publications" src="${SERVICE_URL}/svg?idHal=YOUR_IDHAL"&gt;
&lt;/picture&gt;</code></pre>

<h2>Parameters</h2>
<table>
<thead><tr><th>Parameter</th><th>Meaning</th></tr></thead>
<tbody>
<tr><td><code>idHal</code>, <code>orcid</code>, <code>collection</code>, <code>structId</code>, <code>search</code>, <code>q</code></td><td>What to list (at least one is required): HAL author id, ORCID iD, collection code, structure id, free text, raw Solr query.</td></tr>
<tr><td><code>docTypes</code>, <code>yearFrom</code>, <code>yearTo</code>, <code>oa</code></td><td>Filters: comma-separated HAL document types (e.g. <code>ART,COMM</code>), year range, open access only (<code>oa=1</code>).</td></tr>
<tr><td><code>lvl</code></td><td>Detail level: <code>0</code> citation, <code>1</code> title, authors and venue (default), <code>2</code> + keywords and domains, <code>3</code> + abstract.</td></tr>
<tr><td><code>rows</code>, <code>page</code></td><td>Number of publications (1 to ${MAX_ROWS}, default ${DEFAULT_ROWS}) and page.</td></tr>
<tr><td><code>sort</code>, <code>groupBy</code></td><td><code>date-desc</code> (default), <code>date-asc</code> or <code>relevance</code>; group by <code>year</code> or <code>docType</code>.</td></tr>
<tr><td><code>theme</code>, <code>bg</code>, <code>text</code>, <code>main</code></td><td><code>light</code>, <code>dark</code> or <code>auto</code>; card background, text and accent colors (URL-encode <code>#</code> as <code>%23</code>).</td></tr>
<tr><td><code>title</code>, <code>highlight</code>, <code>maxAuthors</code>, <code>credit</code></td><td>Header title, authors to emphasise (comma-separated names or idHal), authors shown before "et al.", <code>credit=0</code> hides the credit line.</td></tr>
</tbody>
</table>

<h2>Example</h2>
<div class="example"><img src="/svg?idHal=jpugetgil&amp;lvl=1&amp;rows=3" alt="Example: publications of the HAL author jpugetgil" width="800"></div>
<p>Images are cached for one hour. Errors are shown as an image too, so a README never displays a broken image.</p>

<footer>Source code, the JavaScript library and the web component: <a href="${REPO_URL}">${REPO_URL.replace('https://', '')}</a> (MIT).</footer>
</main>
</body>
</html>
`;

function landingResponse(): SsrResponse {
  return {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': CACHE_STATIC,
      'Content-Security-Policy': HTML_CSP,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
    body: LANDING_HTML,
  };
}
