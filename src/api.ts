import type { HalApiResponse, DetailLevel } from './types';
import { resolveFields } from './levels';

export const DEFAULT_BASE = 'https://api.archives-ouvertes.fr/search/';

/**
 * Builds a HAL API search URL from the given parameters.
 * Uses URLSearchParams to safely encode special characters in uid.
 */
export function buildUrl(
  uid: string,
  lvl: DetailLevel,
  rows: number,
  start: number,
  base = DEFAULT_BASE,
): string {
  const fl = resolveFields(lvl);
  const params = new URLSearchParams({
    q: `"${uid}"`,
    wt: 'json',
    fl,
    rows: String(rows),
    start: String(start),
  });
  return `${base}?${params.toString()}`;
}

/**
 * Fetches articles from the HAL API.
 * Throws on HTTP errors or non-zero API status codes.
 */
export async function fetchArticles(
  uid: string,
  lvl: DetailLevel,
  rows: number,
  start: number,
  base = DEFAULT_BASE,
): Promise<HalApiResponse> {
  const url = buildUrl(uid, lvl, rows, start, base);
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`HAL API error: ${res.status} ${res.statusText}`);
  }

  const data: HalApiResponse = await res.json();

  if (data.responseHeader?.status !== undefined && data.responseHeader.status !== 0) {
    throw new Error(`HAL API returned non-zero status: ${data.responseHeader.status}`);
  }

  return data;
}
