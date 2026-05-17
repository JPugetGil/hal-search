import type { DetailLevel, LevelName } from './types';

const MINIMAL_FIELDS = ['docid', 'label_s', 'uri_s'] as const;

const BASIC_FIELDS = [
  ...MINIMAL_FIELDS,
  'title_s',
  'authFullName_s',
  'publicationDate_s',
  'docType_s',
] as const;

const DETAILED_FIELDS = [
  ...BASIC_FIELDS,
  'keyword_s',
  'domain_s',
  'en_domainAllCodeLabel_fs',
  'openAccess_bool',
  'language_s',
  'peerReviewing_s',
  'conferenceTitle_s',
] as const;

/** Maps a DetailLevel to its comma-joined `fl` parameter string */
export const LEVEL_FIELDS: Record<DetailLevel, string> = {
  0: MINIMAL_FIELDS.join(','),
  1: BASIC_FIELDS.join(','),
  2: DETAILED_FIELDS.join(','),
  3: '*',
};

export const LEVEL_NAMES: Record<DetailLevel, LevelName> = {
  0: 'minimal',
  1: 'basic',
  2: 'detailed',
  3: 'full',
};

/** Returns the `fl` field string for the given detail level */
export function resolveFields(lvl: DetailLevel): string {
  return LEVEL_FIELDS[lvl] ?? LEVEL_FIELDS[1];
}

/**
 * Normalizes HAL domain values into readable, deduplicated labels.
 *
 * When `labelEntries` (en_domainAllCodeLabel_fs) is provided, uses the API's
 * own human-readable labels — format: "{code}_FacetSep_{label}" where label
 * can be "Life Sciences [q-bio]/Vegetal Biology".
 * Prefers subdomain entries (code contains "."); falls back to top-level if none.
 * The last path segment of each label is used to keep tags compact.
 *
 * Falls back to parsing raw `domain_s` codes when labels are unavailable:
 *   deduplicates, drops parent codes that have children, formats as "parent > sub".
 *
 * Example with labels: ["sdv_FacetSep_Life Sciences [q-bio]",
 *                        "sdv.bv_FacetSep_Life Sciences [q-bio]/Vegetal Biology"]
 *                    → ["Vegetal Biology"]
 *
 * Example without labels: ["0.info","0.info","1.info.info-db","0.spi"]
 *                       → ["info > info-db", "spi"]
 */
export function normalizeDomains(domains: string[], labelEntries?: string[]): string[] {
  if (labelEntries && labelEntries.length > 0) {
    const subdomains = labelEntries.filter(e => e.split('_FacetSep_')[0].includes('.'));
    const toDisplay = subdomains.length > 0 ? subdomains : labelEntries;
    return toDisplay.map(e => {
      const label = e.split('_FacetSep_')[1] ?? e;
      const parts = label.split('/');
      return parts[parts.length - 1];
    });
  }

  const unique = [...new Set(domains)];
  const parentsWithChildren = new Set<string>();
  for (const d of unique) {
    const parts = d.split('.');
    if (parts[0] === '1') parentsWithChildren.add(parts[1]);
  }
  return unique
    .filter(d => {
      const parts = d.split('.');
      return parts[0] !== '0' || !parentsWithChildren.has(parts[1]);
    })
    .map(d => d.split('.').slice(1).join(' > '));
}
