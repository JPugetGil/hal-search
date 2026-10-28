import { describe, expect, it } from 'vitest';
import {
  decodeEntities,
  escapeXml,
  formatAuthors,
  getDocTypeLabel,
  getKeywords,
  getTitle,
  getVenue,
  getYear,
  groupDocs,
  normalizeName,
  stripHtml,
} from '../src/format';
import { resolveLabels } from '../src/labels';
import type { HalDoc } from '../src/types';

const labels = resolveLabels({ docTypes: { ART: 'Journal article', COMM: 'Conference paper', OTHER: 'Other' } });

// ---------------------------------------------------------------------------
// Entities and markup
// ---------------------------------------------------------------------------

describe('decodeEntities', () => {
  it('decodes hex entities used by HAL', () => {
    expect(decodeEntities('&#x27E8;10.21105/joss.10828&#x27E9;')).toBe('⟨10.21105/joss.10828⟩');
  });

  it('decodes decimal and named entities', () => {
    expect(decodeEntities('Gesqui&#232;re &amp; Co &lt;b&gt; &quot;x&quot; &apos;y&apos;')).toBe('Gesquière & Co <b> "x" \'y\'');
    expect(decodeEntities('&eacute;t&eacute; &Agrave; &ccedil;a &oelig;uvre &ndash; &hellip;')).toBe('été À ça œuvre – …');
    expect(decodeEntities('a&nbsp;b')).toBe('a b');
  });

  it('decodes a single level only', () => {
    expect(decodeEntities('&amp;lt;script&amp;gt;')).toBe('&lt;script&gt;');
  });

  it('leaves unknown entities and bare ampersands alone', () => {
    expect(decodeEntities('AT&T &unknown; &qgrave; & ;')).toBe('AT&T &unknown; &qgrave; & ;');
  });

  it('replaces invalid code points with U+FFFD', () => {
    expect(decodeEntities('&#0;&#xD800;&#x110000;')).toBe('���');
  });

  it('handles astral code points', () => {
    expect(decodeEntities('&#x1F4D6;')).toBe('📖');
  });

  it('returns an empty string for non-strings', () => {
    expect(decodeEntities(undefined as unknown as string)).toBe('');
  });
});

describe('escapeXml', () => {
  it('escapes the five XML special characters', () => {
    expect(escapeXml(`<a href="x">Tom & 'Jerry'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;');
  });

  it('removes characters that are invalid in XML 1.0', () => {
    expect(escapeXml('a\u0000b\u0008c\u000bd\u001fe￾')).toBe('abcde');
    expect(escapeXml('tab\tnew\nline')).toBe('tab\tnew\nline');
  });

  it('removes lone surrogates but keeps pairs', () => {
    expect(escapeXml('x\ud800y\udc00z')).toBe('xyz');
    expect(escapeXml('📖')).toBe('📖');
    // Reversed pair, high surrogate before a pair, trailing high surrogate, U+FFFF.
    expect(escapeXml('a\udc00\ud800b')).toBe('ab');
    expect(escapeXml('\ud800📖\ud800')).toBe('📖');
    expect(escapeXml('􏿿￿&')).toBe('􏿿&amp;');
  });

  it('stringifies nullish values', () => {
    expect(escapeXml(undefined as unknown as string)).toBe('');
  });
});

describe('stripHtml', () => {
  it('turns citationFull_s into plain text', () => {
    const citation =
      'Jey Puget Gil, Emmanuel Coquery. ConVer-G. <i>Journal of Open Source Software</i>, 2026, 11 (124), pp.10828. ' +
      '<a target="_blank" href="https://dx.doi.org/10.21105/joss.10828">&#x27E8;10.21105/joss.10828&#x27E9;</a>. ' +
      '<a target="_blank" href="https://hal.science/hal-05726064v1">&#x27E8;hal-05726064&#x27E9;</a>';
    expect(stripHtml(citation)).toBe(
      'Jey Puget Gil, Emmanuel Coquery. ConVer-G. Journal of Open Source Software, 2026, 11 (124), pp.10828. ⟨10.21105/joss.10828⟩. ⟨hal-05726064⟩',
    );
  });

  it('drops script/style content and comments', () => {
    expect(stripHtml('a<script>alert(1)</script>b<style>*{}</style>c<!-- x -->d')).toBe('abcd');
  });

  it('keeps comparison operators that are not tags', () => {
    expect(stripHtml('x < y and y > z')).toBe('x < y and y > z');
  });

  it('does not create tags from decoded entities', () => {
    expect(stripHtml('&lt;img src=x onerror=alert(1)&gt;')).toBe('<img src=x onerror=alert(1)>');
  });

  it('collapses whitespace, line breaks and control characters', () => {
    expect(stripHtml(' a<br/>b \n\t c\u0001d ')).toBe('a b c d');
  });
});

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

describe('document fields', () => {
  it('getTitle prefers title_s, then label_s, then labels.untitled', () => {
    expect(getTitle({ title_s: ['  A &amp; B  ', 'Other'] }, labels)).toBe('A & B');
    expect(getTitle({ title_s: [''], label_s: 'Label &#x27E8;x&#x27E9;' }, labels)).toBe('Label ⟨x⟩');
    expect(getTitle({}, labels)).toBe('Untitled');
  });

  it('getYear reads producedDateY_i first, then the dates', () => {
    expect(getYear({ producedDateY_i: 2024, publicationDate_s: '2020-01-01' })).toBe(2024);
    expect(getYear({ producedDate_tdate: '2023-10-21T00:00:00Z', publicationDate_s: '2020' })).toBe(2023);
    expect(getYear({ publicationDate_s: '2021-03' })).toBe(2021);
    expect(getYear({ producedDateY_i: Number.NaN })).toBeUndefined();
    expect(getYear({})).toBeUndefined();
  });

  it('getDocTypeLabel never returns raw codes', () => {
    expect(getDocTypeLabel('ART', labels)).toBe('Journal article');
    expect(getDocTypeLabel(' COMM ', labels)).toBe('Conference paper');
    expect(getDocTypeLabel('REPORT_XYZ', labels)).toBe('Report xyz');
    expect(getDocTypeLabel('UNDEFINED', labels)).toBeUndefined();
    expect(getDocTypeLabel('', labels)).toBeUndefined();
    expect(getDocTypeLabel(undefined, labels)).toBeUndefined();
  });

  it('getDocTypeLabel shows UNDEFINED only when explicitly labelled', () => {
    expect(getDocTypeLabel('UNDEFINED', resolveLabels({ docTypes: { UNDEFINED: 'Preprint' } }))).toBe('Preprint');
  });

  it('getDocTypeLabel ignores inherited properties', () => {
    expect(getDocTypeLabel('constructor', labels)).toBe('Constructor');
    expect(getDocTypeLabel('__proto__', labels)).toBe('Proto');
    expect(getDocTypeLabel('___', labels)).toBeUndefined();
  });

  it('getVenue prefers the journal', () => {
    expect(getVenue({ journalTitle_s: 'J. &amp; Co', conferenceTitle_s: 'Conf' })).toBe('J. & Co');
    expect(getVenue({ conferenceTitle_s: ' BDA  2023 ' })).toBe('BDA 2023');
    expect(getVenue({})).toBeUndefined();
  });

  it('getKeywords dedupes case-insensitively', () => {
    expect(getKeywords({ keyword_s: ['RDF', 'Graph', 'rdf', ' ', 'Graph &amp; Co'] })).toEqual(['RDF', 'Graph', 'Graph & Co']);
  });
});

// ---------------------------------------------------------------------------
// Authors
// ---------------------------------------------------------------------------

const authorsDoc: HalDoc = {
  authFullName_s: ['Jey Puget Gil', 'Emmanuel Coquery', 'John Samuel', 'Gilles Gesquière'],
  authIdHalFullName_fs: [
    'jpugetgil_FacetSep_Jey PUGET GIL',
    '_FacetSep_Emmanuel Coquery',
    'john-samuel_FacetSep_John Samuel',
    'gilles-gesquiere_FacetSep_Gilles Gesquière',
  ],
};

describe('formatAuthors', () => {
  it('shows up to 10 authors by default', () => {
    const doc = { authFullName_s: Array.from({ length: 12 }, (_, i) => `Author ${i}`) };
    const out = formatAuthors(doc, {});
    expect(out.authors).toHaveLength(10);
    expect(out.hiddenCount).toBe(2);
  });

  it('honours maxAuthors, 0 meaning no limit', () => {
    expect(formatAuthors(authorsDoc, { maxAuthors: 2 })).toMatchObject({ hiddenCount: 2, authors: [{ name: 'Jey Puget Gil' }, { name: 'Emmanuel Coquery' }] });
    expect(formatAuthors(authorsDoc, { maxAuthors: 0 }).authors).toHaveLength(4);
    expect(formatAuthors(authorsDoc, { maxAuthors: -1 }).hiddenCount).toBe(0);
  });

  it('highlights by full name, case- and accent-insensitively', () => {
    const out = formatAuthors(authorsDoc, { highlightAuthors: ['gilles GESQUIERE'] });
    expect(out.authors.map((a) => a.highlighted)).toEqual([false, false, false, true]);
  });

  it('highlights by idHal even when the casing of the name differs', () => {
    const out = formatAuthors(authorsDoc, { highlightAuthors: ['JPugetGil'] });
    expect(out.authors.map((a) => a.highlighted)).toEqual([true, false, false, false]);
  });

  it('matches the idHal name against differently-cased authFullName_s', () => {
    const doc = { ...authorsDoc, authFullName_s: ['Jey PUGET GIL', 'Emmanuel Coquery'] };
    expect(formatAuthors(doc, { highlightAuthors: ['jpugetgil'] }).authors[0].highlighted).toBe(true);
  });

  it('does not highlight authors without an idHal through an empty id', () => {
    const out = formatAuthors(authorsDoc, { highlightAuthors: [''] });
    expect(out.authors.some((a) => a.highlighted)).toBe(false);
  });

  it('decodes names and handles missing authors', () => {
    expect(formatAuthors({ authFullName_s: ['Ren&eacute;  Dupont'] }, {}).authors[0].name).toBe('René Dupont');
    expect(formatAuthors({}, {})).toEqual({ authors: [], hiddenCount: 0 });
  });

  it('normalizeName ignores case, accents and spacing', () => {
    expect(normalizeName('  Gilles   GESQUIÈRE ')).toBe(normalizeName('gilles gesquiere'));
  });
});

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

describe('groupDocs', () => {
  const docs: HalDoc[] = [
    { docid: '1', producedDateY_i: 2026, docType_s: 'ART' },
    { docid: '2', producedDateY_i: 2026, docType_s: 'COMM' },
    { docid: '3', docType_s: 'UNDEFINED' },
    { docid: '4', producedDateY_i: 2024, docType_s: 'ART' },
    { docid: '5', producedDateY_i: 2026 },
  ];
  const ids = (g: { docs: HalDoc[] }) => g.docs.map((d) => d.docid);

  it('returns a single unlabeled group for none', () => {
    for (const groupBy of [undefined, 'none'] as const) {
      const groups = groupDocs(docs, groupBy, labels);
      expect(groups).toHaveLength(1);
      expect(groups[0]).toMatchObject({ key: 'all', label: '' });
      expect(ids(groups[0])).toEqual(['1', '2', '3', '4', '5']);
    }
  });

  it('groups by year in order of first appearance', () => {
    const groups = groupDocs(docs, 'year', labels);
    expect(groups.map((g) => [g.key, g.label])).toEqual([
      ['2026', '2026'],
      ['undated', 'Undated'],
      ['2024', '2024'],
    ]);
    expect(ids(groups[0])).toEqual(['1', '2', '5']);
  });

  it('groups by document type with readable labels', () => {
    const groups = groupDocs(docs, 'docType', labels);
    expect(groups.map((g) => [g.key, g.label])).toEqual([
      ['ART', 'Journal article'],
      ['COMM', 'Conference paper'],
      ['UNDEFINED', 'Other'],
    ]);
    expect(ids(groups[0])).toEqual(['1', '4']);
    expect(ids(groups[2])).toEqual(['3', '5']);
  });

  it('uses the localized undated label', () => {
    const groups = groupDocs([{ docid: 'x' }], 'year', resolveLabels({ undated: 'Sans date' }));
    expect(groups[0].label).toBe('Sans date');
  });

  it('handles empty input', () => {
    expect(groupDocs([], 'year', labels)).toEqual([]);
    expect(groupDocs([], 'none', labels)).toEqual([{ key: 'all', label: '', docs: [] }]);
  });
});
