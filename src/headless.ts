import type { DisplayOptions, SearchParams } from './types';
import { fetchArticles } from './api';
import { buildHalWebUrl } from './query';
import { renderSvg } from './svg';

export interface FetchSvgOptions extends SearchParams, DisplayOptions {
  apiBase?: string;
  title?: string;
  width?: number;
  signal?: AbortSignal;
}

const DEFAULT_ROWS = 10;

/**
 * Fetches from HAL and returns the SVG string. Works in Node 18+, browsers and edge runtimes.
 * Fetch errors are thrown (use renderErrorSvg() to turn them into an image).
 */
export async function fetchSvg(options: FetchSvgOptions): Promise<string> {
  const lvl = options.lvl ?? 1;
  const rows = typeof options.rows === 'number' && options.rows > 0 ? Math.floor(options.rows) : DEFAULT_ROWS;
  const page = typeof options.page === 'number' && options.page >= 1 ? Math.floor(options.page) : 1;

  const fetchPage = (p: number) =>
    fetchArticles({
      query: options.query,
      filters: options.filters,
      sort: options.sort ?? 'date-desc',
      lvl,
      rows,
      start: (p - 1) * rows,
      apiBase: options.apiBase,
      signal: options.signal,
    });

  let response = await fetchPage(page);
  // A page beyond the last one renders the last page (like HalSearch and the SSR): one extra request at most.
  const found = response?.response?.numFound;
  if (page > 1 && typeof found === 'number' && found > 0 && (response?.response?.docs ?? []).length === 0) {
    const lastPage = Math.ceil(found / rows);
    if (lastPage < page) response = await fetchPage(lastPage);
  }

  // The footer link is best effort: a query that has no web page simply renders without it.
  let halUrl: string | undefined;
  try {
    halUrl = buildHalWebUrl(options.query, options.filters);
  } catch {
    halUrl = undefined;
  }

  const docs = response?.response?.docs ?? [];
  return renderSvg(docs, {
    lvl,
    theme: options.theme,
    groupBy: options.groupBy,
    highlightAuthors: options.highlightAuthors,
    maxAuthors: options.maxAuthors,
    labels: options.labels,
    showCredit: options.showCredit,
    backgroundColor: options.backgroundColor,
    textColor: options.textColor,
    mainColor: options.mainColor,
    totalFound: response?.response?.numFound ?? docs.length,
    title: options.title,
    halUrl,
    width: options.width,
  });
}
