import type { HalDoc } from './types';

// Self-contained on purpose (no import from query.ts): renderers import this module.

/** HAL search API, used for the BibTeX export */
const HAL_API_BASE = 'https://api.archives-ouvertes.fr/search/';

export interface DocLinks {
  /** HAL landing page (uri_s), http(s) only */
  hal?: string;
  /** Main PDF file (fileMain_s), http(s) only */
  pdf?: string;
  /** https://doi.org/{doiId_s} */
  doi?: string;
  /** BibTeX export URL */
  bibtex?: string;
}

/** A DOI: "10." + registrant code + "/" + suffix, without whitespace. */
const DOI_RE = /^10\.\d{4,9}\/\S+$/;

/** A HAL identifier such as 'hal-03923934', 'tel-05695880' or 'halshs-01234567'. */
const HAL_ID_RE = /^[A-Za-z0-9_.-]+$/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the URL when it parses as an absolute http(s) URL, undefined otherwise. */
export function safeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const raw = value.trim();
  if (!/^https?:\/\//i.test(raw)) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** https://doi.org/ URL for a DOI (tolerates a 'doi:' or doi.org URL prefix), undefined when it is not a DOI. */
function doiUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const doi = value
    .trim()
    .replace(/^doi:\s*/i, '')
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  if (!DOI_RE.test(doi)) return undefined;
  // Keep '/' readable; encode everything that could break the URL (spaces, '#', '?', '%', ...).
  return `https://doi.org/${doi.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * BibTeX export through the search API (`wt=bibtex`, served as text/plain).
 * https://hal.science/{halId}/bibtex answers an HTML page, so it is not used.
 */
function bibtexUrl(halId: unknown): string | undefined {
  if (typeof halId !== 'string') return undefined;
  const id = halId.trim();
  if (!id || !HAL_ID_RE.test(id)) return undefined;
  // HAL_ID_RE excludes quotes and backslashes: the quoted value needs no escaping.
  const params = new URLSearchParams({ q: `halId_s:"${id}"`, wt: 'bibtex' });
  return `${HAL_API_BASE}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns the safe (http/https only) links available for a document. */
export function getDocLinks(doc: HalDoc): DocLinks {
  const links: DocLinks = {};
  if (!doc) return links;
  const hal = safeHttpUrl(doc.uri_s);
  if (hal) links.hal = hal;
  const pdf = safeHttpUrl(doc.fileMain_s);
  if (pdf) links.pdf = pdf;
  const doi = doiUrl(doc.doiId_s);
  if (doi) links.doi = doi;
  const bibtex = bibtexUrl(doc.halId_s);
  if (bibtex) links.bibtex = bibtex;
  return links;
}
