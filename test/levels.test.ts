import { describe, expect, it } from 'vitest';
import { LEVEL_FIELDS, LEVEL_NAMES, normalizeDomains, resolveFields } from '../src/levels';
import type { DetailLevel } from '../src/types';

const fields = (lvl: DetailLevel) => LEVEL_FIELDS[lvl].split(',');

// ---------------------------------------------------------------------------
// Field lists
// ---------------------------------------------------------------------------

describe('LEVEL_FIELDS', () => {
  it('never uses fl=*', () => {
    for (const lvl of [0, 1, 2, 3] as const) expect(fields(lvl)).not.toContain('*');
  });

  it('fetches what groupBy needs at every level', () => {
    for (const lvl of [0, 1, 2, 3] as const) {
      expect(fields(lvl)).toEqual(expect.arrayContaining(['producedDateY_i', 'docType_s', 'label_s', 'uri_s']));
    }
  });

  it('fetches title, authors (with idHal), venue and links from level 1', () => {
    for (const lvl of [1, 2, 3] as const) {
      expect(fields(lvl)).toEqual(
        expect.arrayContaining([
          'title_s',
          'authFullName_s',
          'authIdHalFullName_fs',
          'halId_s',
          'doiId_s',
          'fileMain_s',
          'journalTitle_s',
          'conferenceTitle_s',
        ]),
      );
    }
    expect(fields(0)).not.toContain('title_s');
  });

  it('fetches citation, keywords, domains and open access from level 2', () => {
    for (const lvl of [2, 3] as const) {
      expect(fields(lvl)).toEqual(
        expect.arrayContaining(['citationFull_s', 'keyword_s', 'domain_s', 'en_domainAllCodeLabel_fs', 'openAccess_bool']),
      );
    }
    expect(fields(1)).not.toContain('keyword_s');
  });

  it('fetches the abstract and language only at level 3', () => {
    expect(fields(3)).toEqual(expect.arrayContaining(['abstract_s', 'language_s']));
    expect(fields(2)).not.toContain('abstract_s');
  });

  it('nests levels and has no duplicates', () => {
    for (const lvl of [1, 2, 3] as const) {
      expect(fields(lvl)).toEqual(expect.arrayContaining(fields((lvl - 1) as DetailLevel)));
      expect(new Set(fields(lvl)).size).toBe(fields(lvl).length);
    }
  });

  it('drops fields nobody displays', () => {
    const all = fields(3);
    expect(all).not.toContain('peerReviewing_s');
    expect(all).not.toContain('publicationDate_s');
  });
});

describe('resolveFields / LEVEL_NAMES', () => {
  it('resolves fields and falls back to level 1', () => {
    expect(resolveFields(2)).toBe(LEVEL_FIELDS[2]);
    expect(resolveFields(7 as DetailLevel)).toBe(LEVEL_FIELDS[1]);
  });

  it('names every level', () => {
    expect(LEVEL_NAMES).toEqual({ 0: 'minimal', 1: 'basic', 2: 'detailed', 3: 'full' });
  });
});

// ---------------------------------------------------------------------------
// normalizeDomains
// ---------------------------------------------------------------------------

describe('normalizeDomains', () => {
  it('prefers API labels and their sub-domains', () => {
    expect(
      normalizeDomains(
        ['0.sdv', '1.sdv.bv'],
        ['sdv_FacetSep_Life Sciences [q-bio]', 'sdv.bv_FacetSep_Life Sciences [q-bio]/Vegetal Biology'],
      ),
    ).toEqual(['Vegetal Biology']);
  });

  it('falls back to top-level labels and deduplicates', () => {
    expect(normalizeDomains([], ['info_FacetSep_Computer Science [cs]', 'info_FacetSep_Computer Science [cs]'])).toEqual([
      'Computer Science [cs]',
    ]);
  });

  it('parses raw codes without labels', () => {
    expect(normalizeDomains(['0.info', '0.info', '1.info.info-db', '0.spi'])).toEqual(['info > info-db', 'spi']);
    expect(normalizeDomains(['0.info', '1.info.info-db'], [])).toEqual(['info > info-db']);
  });

  it('tolerates missing input', () => {
    expect(normalizeDomains(undefined as unknown as string[])).toEqual([]);
  });
});
