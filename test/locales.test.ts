import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LOCALE,
  LOCALES,
  SNIPPET_TITLES,
  domainLabelField,
  formatNumber,
  getDomainLabels,
  isSingular,
  matchLocale,
  resolveLocale,
} from '../src/locales';
import { DEFAULT_LABELS, resolveLabels } from '../src/labels';
import { DOC_TYPE_LABELS } from '../src/doctypes';
import { LEVEL_FIELDS, resolveFields } from '../src/levels';
import { buildHalUrl } from '../src/query';
import { measureText, renderSvg } from '../src/svg';
import { fetchSvg } from '../src/headless';
import * as lib from '../src/index';
import type { HalDoc, Labels, SvgRenderOptions } from '../src/types';
import { assertWellFormedXml } from './helpers/xml';

// Node environment: the locale data, the DOM-free SVG renderer and fetchSvg in French.

/** French number formatting of the runtime (narrow no-break space with current ICU data). */
const fr = (n: number) => new Intl.NumberFormat('fr').format(n);

const PLACEHOLDERS = /\{\w+\}/g;

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Locale data
// ---------------------------------------------------------------------------

describe('LOCALES', () => {
  it('has English (the default) and French, exported from the entry point', () => {
    expect(Object.keys(LOCALES).sort()).toEqual(['en', 'fr']);
    expect(DEFAULT_LOCALE).toBe('en');
    expect(LOCALES.en).toBe(DEFAULT_LABELS);
    expect(lib.LOCALES).toBe(LOCALES);
    expect(lib.DEFAULT_LOCALE).toBe('en');
    expect(lib.resolveLocale).toBe(resolveLocale);
    expect(Object.isFrozen(LOCALES)).toBe(true);
    expect(Object.isFrozen(LOCALES.fr)).toBe(true);
  });

  for (const [code, labels] of Object.entries(LOCALES)) {
    describe(code, () => {
      it('translates every key with the same placeholders as English', () => {
        expect(Object.keys(labels).sort()).toEqual(Object.keys(DEFAULT_LABELS).sort());
        for (const key of Object.keys(DEFAULT_LABELS) as (keyof Labels)[]) {
          if (key === 'docTypes') continue;
          const value = labels[key] as string;
          expect(typeof value, key).toBe('string');
          expect(value.trim(), key).not.toBe('');
          expect((value.match(PLACEHOLDERS) ?? []).sort(), key).toEqual(
            ((DEFAULT_LABELS[key] as string).match(PLACEHOLDERS) ?? []).sort(),
          );
        }
      });

      it('labels every HAL document type code', () => {
        for (const docType of Object.keys(DOC_TYPE_LABELS)) {
          const label = labels.docTypes[docType];
          expect(typeof label, docType).toBe('string');
          expect(label.trim(), docType).not.toBe('');
          // Never the raw code ('HDR' is HAL's own French label)
          if (!(code === 'fr' && docType === 'HDR')) expect(label, docType).not.toBe(docType);
        }
      });

      it('has a default snippet title', () => {
        expect(SNIPPET_TITLES[code]).toBeTruthy();
      });
    });
  }

  it('uses HAL’s French wording', () => {
    expect(LOCALES.fr).toMatchObject({
      loading: 'Chargement…',
      empty: 'Aucun résultat.',
      pageInfo: 'Page {page} sur {pages}',
      resultCount: '{count} résultats',
      resultCountOne: '{count} résultat',
      openAccess: 'Libre accès',
      abstract: 'Résumé',
      viewOnHal: 'Voir les {count} publications sur HAL',
      opensInNewTab: '(s’ouvre dans un nouvel onglet)',
      undated: 'Sans date',
    });
    expect(LOCALES.fr.docTypes).toMatchObject({
      ART: 'Article dans une revue',
      COMM: 'Communication dans un congrès',
      COUV: 'Chapitre d’ouvrage',
      THESE: 'Thèse',
      OUV: 'Ouvrage',
      POSTER: 'Poster de conférence',
      SOFTWARE: 'Logiciel',
    });
    // French typography: a no-break space before ':' and '!' (never a plain, breakable space)
    expect(LOCALES.fr.error).toMatch(/^Erreur[\u00a0\u202f]: \{message\}$/);
    expect(LOCALES.fr.copied).toMatch(/^Copié[\u00a0\u202f]!$/);
  });
});

describe('matchLocale / resolveLocale', () => {
  it('matches built-in languages on the primary subtag, case-insensitively', () => {
    expect(matchLocale('fr')).toBe('fr');
    expect(matchLocale('FR')).toBe('fr');
    expect(matchLocale('fr-FR')).toBe('fr');
    expect(matchLocale('fr_CA')).toBe('fr');
    expect(matchLocale(' en-GB ')).toBe('en');
    expect(matchLocale('fr-Latn-FR')).toBe('fr');
  });

  it('returns undefined for unknown or malformed tags', () => {
    for (const tag of ['de', 'xx-FR', 'french', 'f', 'fr-', '', '__proto__', 'constructor', 'fr fr', '"><x', null, 42, undefined]) {
      expect(matchLocale(tag), String(tag)).toBeUndefined();
    }
  });

  it('resolves unknown or missing tags to English', () => {
    expect(resolveLocale('fr-BE')).toBe('fr');
    expect(resolveLocale('de')).toBe('en');
    expect(resolveLocale('')).toBe('en');
    expect(resolveLocale()).toBe('en');
  });
});

describe('formatNumber', () => {
  it('groups thousands for the locale', () => {
    expect(formatNumber(9183)).toBe('9,183');
    expect(formatNumber(9183, 'en')).toBe('9,183');
    expect(formatNumber(1234567, 'fr')).toBe(fr(1234567));
    expect(fr(9183)).toMatch(/^9[\u00a0\u202f]183$/);
    expect(formatNumber(9183, 'fr')).toBe(fr(9183));
    expect(formatNumber(42, 'fr')).toBe('42');
  });

  it('clamps and rounds like a count', () => {
    expect(formatNumber(-5, 'fr')).toBe('0');
    expect(formatNumber(Number.NaN)).toBe('0');
    expect(formatNumber(Infinity)).toBe('0');
    expect(formatNumber(1234.6)).toBe('1,235');
  });

  it('falls back to English grouping for an invalid tag', () => {
    expect(formatNumber(9183, 'not a tag!')).toBe('9,183');
  });
});

describe('isSingular', () => {
  it('follows the plural rules of the locale', () => {
    expect([0, 1, 2, 10].map((n) => isSingular(n, 'en'))).toEqual([false, true, false, false]);
    expect([0, 1, 2, 10].map((n) => isSingular(n, 'fr'))).toEqual([true, true, false, false]);
    expect(isSingular(1)).toBe(true);
    expect(isSingular(1, 'not a tag!')).toBe(true);
    expect(isSingular(2, 'not a tag!')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Domain labels
// ---------------------------------------------------------------------------

const FR_DOMAINS = ['info_FacetSep_Informatique [cs]', 'info.info-db_FacetSep_Informatique [cs]/Base de données [cs.DB]'];
const EN_DOMAINS = ['info_FacetSep_Computer Science [cs]', 'info.info-db_FacetSep_Computer Science [cs]/Databases [cs.DB]'];

describe('domain labels in the language of the locale', () => {
  it('fetches HAL’s French domain labels instead of the English ones from lvl 2', () => {
    expect(domainLabelField()).toBe('en_domainAllCodeLabel_fs');
    expect(domainLabelField('fr-FR')).toBe('fr_domainAllCodeLabel_fs');
    expect(domainLabelField('xx')).toBe('en_domainAllCodeLabel_fs');

    const fields = resolveFields(2, 'fr').split(',');
    expect(fields).toContain('fr_domainAllCodeLabel_fs');
    expect(fields).not.toContain('en_domainAllCodeLabel_fs');
    expect(resolveFields(3, 'fr').split(',')).toContain('fr_domainAllCodeLabel_fs');
    // Unchanged otherwise
    expect(resolveFields(2)).toBe(LEVEL_FIELDS[2]);
    expect(resolveFields(2, 'de')).toBe(LEVEL_FIELDS[2]);
    expect(resolveFields(1, 'fr')).toBe(LEVEL_FIELDS[1]);

    const url = new URL(buildHalUrl({ query: { idHal: 'x' }, lvl: 2, rows: 5, start: 0, locale: 'fr' }));
    expect(url.searchParams.get('fl')?.split(',')).toContain('fr_domainAllCodeLabel_fs');
  });

  it('reads the locale’s labels, else the English ones', () => {
    const doc: HalDoc = { domain_s: ['0.info'], fr_domainAllCodeLabel_fs: FR_DOMAINS, en_domainAllCodeLabel_fs: EN_DOMAINS };
    expect(getDomainLabels(doc, 'fr')).toEqual(FR_DOMAINS);
    expect(getDomainLabels(doc)).toEqual(EN_DOMAINS);
    expect(getDomainLabels({ en_domainAllCodeLabel_fs: EN_DOMAINS }, 'fr')).toEqual(EN_DOMAINS);
    expect(getDomainLabels({ fr_domainAllCodeLabel_fs: [] }, 'fr')).toBeUndefined();
    expect(getDomainLabels({ fr_domainAllCodeLabel_fs: [1, 'a_FacetSep_A'] as unknown as string[] }, 'fr')).toEqual(['a_FacetSep_A']);
  });
});

// ---------------------------------------------------------------------------
// resolveLabels
// ---------------------------------------------------------------------------

describe('resolveLabels with a locale', () => {
  it('starts from the French labels (fresh docTypes copy)', () => {
    const labels = resolveLabels(undefined, 'fr');
    expect(labels).toEqual(LOCALES.fr);
    expect(labels.docTypes).not.toBe(LOCALES.fr.docTypes);
    labels.docTypes.ART = 'changed';
    expect(LOCALES.fr.docTypes.ART).toBe('Article dans une revue');
  });

  it('applies overrides on top of French', () => {
    const labels = resolveLabels({ title: 'Mes travaux', docTypes: { ART: 'Article' } }, 'fr-FR');
    expect(labels.title).toBe('Mes travaux');
    expect(labels.docTypes.ART).toBe('Article');
    expect(labels.docTypes.COMM).toBe('Communication dans un congrès');
    expect(labels.loading).toBe('Chargement…');
  });

  it('uses English for unknown locales', () => {
    expect(resolveLabels(undefined, 'de')).toEqual(DEFAULT_LABELS);
    expect(resolveLabels({ loading: 'Laden…' }, 'de').empty).toBe('No results found.');
  });
});

// ---------------------------------------------------------------------------
// SVG
// ---------------------------------------------------------------------------

const DOCS: HalDoc[] = [
  {
    docid: '1',
    uri_s: 'https://hal.science/hal-00000001v1',
    title_s: ['Représentation condensée de graphes RDF'],
    authFullName_s: ['Jey Puget Gil', 'Emmanuel Coquery'],
    producedDateY_i: 2025,
    docType_s: 'ART',
    journalTitle_s: 'Revue des Sciences et Technologies de l’Information',
    openAccess_bool: true,
    keyword_s: ['RDF'],
    abstract_s: ['Les phénomènes évolutifs peuvent être représentés à l’aide de graphes de connaissances.'],
  },
  {
    docid: '2',
    uri_s: 'https://hal.science/hal-00000002v1',
    title_s: ['A conference paper'],
    authFullName_s: ['Jane Doe'],
    producedDateY_i: 2023,
    docType_s: 'COMM',
  },
  {
    docid: '3',
    uri_s: 'https://hal.science/hal-00000003v1',
    title_s: ['An undated report'],
    docType_s: 'REPORT_LABO',
  },
];

function svg(options: Partial<SvgRenderOptions>, docs: HalDoc[] = DOCS): string {
  const out = renderSvg(docs, { totalFound: 9183, ...options });
  assertWellFormedXml(out);
  return out;
}

/** Text nodes of the SVG, as rendered (entities decoded, no whitespace collapsing). */
function texts(out: string): string[] {
  return [...out.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) =>
    m[1].replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'),
  );
}

describe('renderSvg in French', () => {
  it('translates the header, footer, document types and badges, with French numbers', () => {
    const out = svg({ locale: 'fr', lvl: 3, halUrl: 'https://hal.science/LIRIS' });
    const t = texts(out);
    expect(out).toMatch(/^<svg [^>]* lang="fr">/);
    expect(out).toContain(`<title>Publications – ${fr(9183)} résultats</title>`);
    expect(t).toContain(`${fr(9183)} résultats`);
    expect(t).toContain(`Voir les ${fr(9183)} publications sur HAL`);
    expect(t).toEqual(expect.arrayContaining(['Article dans une revue', 'Communication dans un congrès', 'Libre accès', 'Résumé']));
    expect(t.some((s) => s.startsWith('Rapport d’évaluation'))).toBe(true);
    expect(t.join('\n')).not.toMatch(/results|Journal article|Conference paper|Open Access|Abstract/);
    // Data keeps its own language
    expect(t).toContain('Représentation condensée de graphes RDF');
  });

  it('uses the French singular for 0 and 1, and the plural above', () => {
    expect(texts(svg({ locale: 'fr', totalFound: 1 }, DOCS.slice(0, 1)))).toEqual(
      expect.arrayContaining(['1 résultat', 'Voir cette publication sur HAL']),
    );
    const empty = texts(svg({ locale: 'fr', totalFound: 0 }, []));
    expect(empty).toEqual(expect.arrayContaining(['0 résultat', 'Aucun résultat.']));
    expect(empty.join('\n')).not.toContain('Voir');
    expect(texts(svg({ locale: 'fr', totalFound: 2 }, DOCS.slice(0, 2)))).toContain('2 résultats');
    // English keeps "0 results"
    expect(texts(svg({ totalFound: 0 }, []))).toContain('0 results');
  });

  it('groups by year with a French "undated" heading, and by document type in French', () => {
    expect(texts(svg({ locale: 'fr', groupBy: 'year' }))).toEqual(expect.arrayContaining(['2025', '2023', 'Sans date']));
    expect(texts(svg({ locale: 'fr', groupBy: 'docType' }))).toEqual(
      expect.arrayContaining(['Article dans une revue', 'Communication dans un congrès', 'Rapport d’évaluation d’une entité de recherche']),
    );
  });

  it('shows HAL’s French domain labels', () => {
    const doc: HalDoc = { ...DOCS[0], domain_s: ['0.info', '1.info.info-db'], fr_domainAllCodeLabel_fs: FR_DOMAINS };
    expect(texts(svg({ locale: 'fr', lvl: 2 }, [doc]))).toContain('Base de données [cs.DB]');
    expect(texts(svg({ lvl: 2 }, [{ ...doc, en_domainAllCodeLabel_fs: EN_DOMAINS }]))).toContain('Databases [cs.DB]');
  });

  it('applies labels overrides on top of French', () => {
    const t = texts(svg({ locale: 'fr', labels: { resultCount: '{count} travaux', docTypes: { ART: 'Article' } } }));
    expect(t).toContain(`${fr(9183)} travaux`);
    expect(t).toContain('Article');
    expect(t).not.toContain('Article dans une revue');
    expect(t).toContain('Communication dans un congrès');
  });

  it('falls back to English for an unknown locale, and marks it', () => {
    const out = svg({ locale: 'xx' });
    expect(out).toMatch(/^<svg [^>]* lang="en">/);
    expect(texts(out)).toContain('9,183 results');
  });

  it('leaves the default output unchanged (no lang attribute, English)', () => {
    const out = svg({});
    expect(out).not.toMatch(/^<svg [^>]*lang=/);
    expect(out).toBe(svg({ locale: undefined }));
    expect(texts(out)).toEqual(expect.arrayContaining(['9,183 results', 'View all 9,183 publications on HAL', 'Journal article']));
  });

  it('measures the narrow no-break space like a space (no overflow from the French count)', () => {
    expect(measureText(fr(9183), 13)).toBeCloseTo(measureText('9 183', 13), 5);
    expect(measureText('Erreur\u00a0: x', 13)).toBeCloseTo(measureText('Erreur : x', 13), 5);
  });
});

describe('fetchSvg in French', () => {
  it('passes the locale to the renderer', async () => {
    const body = { responseHeader: { status: 0, QTime: 1 }, response: { numFound: 1234, start: 0, docs: DOCS.slice(0, 1) } };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body))));
    const fetchMock = vi.mocked(fetch);
    const out = await fetchSvg({ query: { idHal: 'jpugetgil' }, locale: 'fr', lvl: 2 });
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('fl')).toContain('fr_domainAllCodeLabel_fs');
    assertWellFormedXml(out);
    expect(out).toMatch(/^<svg [^>]* lang="fr">/);
    expect(texts(out)).toEqual(expect.arrayContaining([`${fr(1234)} résultats`, 'Article dans une revue']));
  });
});
