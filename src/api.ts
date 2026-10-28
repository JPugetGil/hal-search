import type { FetchParams, HalApiResponse } from './types';
import { buildHalUrl } from './query';

/** HAL search API base URL (same value as HAL_API_BASE in query.ts) */
export const DEFAULT_BASE = 'https://api.archives-ouvertes.fr/search/';

/** Longest API error message surfaced to callers (HAL/Solr messages can echo whole queries). */
const MAX_MESSAGE_LENGTH = 200;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Single-line, control-character-free, length-capped version of an API message. */
function cleanMessage(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const text = raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  return text.length > MAX_MESSAGE_LENGTH ? `${text.slice(0, MAX_MESSAGE_LENGTH - 1)}…` : text;
}

/** Extracts HAL/Solr's own message from an error body: `{ "error": { "msg": "..." } }`. */
function apiErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const error = (body as { error?: unknown }).error;
  if (typeof error === 'string') return cleanMessage(error);
  if (error && typeof error === 'object') {
    const { msg, message } = error as { msg?: unknown; message?: unknown };
    return cleanMessage(msg) ?? cleanMessage(message) ?? '';
  }
  return undefined;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function hasDocs(body: unknown): body is HalApiResponse {
  const response = (body as { response?: { docs?: unknown } } | undefined)?.response;
  return !!response && typeof response === 'object' && Array.isArray(response.docs);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches articles from the HAL API.
 * Throws on HTTP errors or non-zero API status codes. Rejects with an AbortError when `signal` aborts.
 */
export async function fetchArticles(params: FetchParams): Promise<HalApiResponse> {
  const { signal, ...rest } = params;
  const url = buildHalUrl(rest);
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal });
  const text = await res.text();
  const body = parseJson(text);
  const apiMessage = apiErrorMessage(body);

  if (!res.ok) {
    const detail = apiMessage || cleanMessage(res.statusText);
    throw new Error(`HAL API error ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  // HAL reports query errors with HTTP 200 and an { error } body.
  if (apiMessage !== undefined) {
    throw new Error(`HAL API error: ${apiMessage || 'invalid request'}`);
  }

  if (!hasDocs(body)) {
    // Unknown collections are redirected to the HTML documentation page.
    const collection = typeof rest.query === 'object' && rest.query ? rest.query.collection : undefined;
    throw new Error(
      collection
        ? `HAL API returned an unexpected response. Is "${cleanMessage(collection)}" a valid HAL collection code?`
        : 'HAL API returned an unexpected response.',
    );
  }

  const status = body.responseHeader?.status;
  if (status !== undefined && status !== 0) {
    throw new Error(`HAL API returned non-zero status: ${status}`);
  }

  return body;
}

/** True when `err` comes from an aborted request. */
export function isAbortError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { name?: unknown }).name === 'AbortError'
  );
}
