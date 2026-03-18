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
