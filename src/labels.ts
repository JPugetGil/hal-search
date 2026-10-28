import type { Labels } from './types';
import { DOC_TYPE_LABELS } from './doctypes';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** English defaults for every user-facing string. */
export const DEFAULT_LABELS: Labels = Object.freeze({
  loading: 'Loading…',
  empty: 'No results found.',
  error: 'Error: {message}',
  previous: 'Previous',
  next: 'Next',
  pageInfo: 'Page {page} of {pages}',
  resultCount: '{count} results',
  resultCountOne: '{count} result',
  pagination: 'Search results pages',
  openAccess: 'Open Access',
  abstract: 'Abstract',
  showMore: 'Show more',
  showLess: 'Show less',
  untitled: 'Untitled',
  etAl: 'et al.',
  pdf: 'PDF',
  doi: 'DOI',
  bibtex: 'BibTeX',
  copyCitation: 'Copy citation',
  copied: 'Copied!',
  viewOnHal: 'View all {count} publications on HAL',
  viewOnHalOne: 'View this publication on HAL',
  title: 'Publications',
  opensInNewTab: '(opens in a new tab)',
  undated: 'Undated',
  missingQuery: 'No search criterion given.',
  docTypes: DOC_TYPE_LABELS,
});

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/** Merges overrides over the English defaults (docTypes merged key by key). */
export function resolveLabels(overrides?: Partial<Labels>): Labels {
  // Fresh docTypes object: callers may mutate the result without touching DOC_TYPE_LABELS.
  const labels: Labels = { ...DEFAULT_LABELS, docTypes: { ...DEFAULT_LABELS.docTypes } };
  if (!overrides || typeof overrides !== 'object') return labels;

  // Overrides may come from user JSON (web component `labels` attribute): copy known string keys only.
  for (const key of Object.keys(DEFAULT_LABELS) as (keyof Labels)[]) {
    if (key === 'docTypes') continue;
    const value = (overrides as Record<string, unknown>)[key];
    if (typeof value === 'string') (labels as unknown as Record<string, string>)[key] = value;
  }
  const docTypes = overrides.docTypes;
  if (docTypes && typeof docTypes === 'object') {
    for (const [code, value] of Object.entries(docTypes)) {
      if (typeof value === 'string' && code !== '__proto__') labels.docTypes[code] = value;
    }
  }
  return labels;
}

/** Replaces `{name}` placeholders. Unknown placeholders are left untouched. */
export function formatLabel(template: string, vars: Record<string, string | number>): string {
  return String(template).replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}
