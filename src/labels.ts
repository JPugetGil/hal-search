import type { Labels } from './types';
import { DEFAULT_LOCALE, LOCALES, resolveLocale } from './locales';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** English defaults for every user-facing string (other languages: LOCALES in locales.ts). */
export const DEFAULT_LABELS: Labels = LOCALES[DEFAULT_LOCALE];

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Merges overrides over the labels of a built-in locale (docTypes merged key by key).
 * `locale` is a language tag ('fr', 'fr-FR'...); unknown or missing locales use English.
 */
export function resolveLabels(overrides?: Partial<Labels>, locale?: string): Labels {
  const base = LOCALES[resolveLocale(locale)];
  // Fresh docTypes object: callers may mutate the result without touching the built-in labels.
  const labels: Labels = { ...base, docTypes: { ...base.docTypes } };
  if (!overrides || typeof overrides !== 'object') return labels;

  // Overrides may come from user JSON (web component `labels` attribute): copy known string keys only.
  for (const key of Object.keys(base) as (keyof Labels)[]) {
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
