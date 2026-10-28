import { describe, expect, it } from 'vitest';
import type { HalDoc } from '../src/types';
import { buildStructuredData, serializeJsonLd } from '../src/structured-data';
import { resolveLabels } from '../src/labels';

const labels = resolveLabels();

// Shapes taken from the HAL API (authIdHal_s:"jpugetgil", lvl 3 fields).
const ARTICLE: HalDoc = {
  docid: '5726064',
  halId_s: 'hal-05726064',
  uri_s: 'https://hal.science/hal-05726064v1',
  title_s: ['ConVer-G: A Suite for Versioning, Querying and Visualization of Dynamic Knowledge Graphs'],
  authFullName_s: ['Jey Puget Gil', 'Emmanuel Coquery', 'John Samuel', 'Gilles Gesquière'],
  journalTitle_s: 'Journal of Open Source Software',
  doiId_s: '10.21105/joss.10828',
  docType_s: 'ART',
  producedDateY_i: 2026,
  openAccess_bool: true,
  language_s: ['en'],
};

const THESIS: HalDoc = {
  docid: '5695880',
  uri_s: 'https://theses.hal.science/tel-05695880v1',
  title_s: ['Querying of Multi-Version RDF Knowledge Graphs through Condensed Representations', 'Interrogation…'],
  authFullName_s: ['Jey Puget Gil'],
  docType_s: 'THESE',
  producedDateY_i: 2026,
  openAccess_bool: false,
  language_s: ['en', 'fr'],
};

type Item = Record<string, unknown>;
const items = (data: Record<string, unknown>): Item[] =>
  (data.itemListElement as { item: Item }[]).map((element) => element.item);

describe('buildStructuredData', () => {
  it('describes the page as a schema.org ItemList of ScholarlyArticle', () => {
    const data = buildStructuredData([ARTICLE, THESIS], { labels, start: 20, totalFound: 42 });
    expect(data).toMatchObject({ '@context': 'https://schema.org', '@type': 'ItemList', numberOfItems: 42 });
    // Positions continue across pages
    expect((data.itemListElement as { position: number }[]).map((e) => e.position)).toEqual([21, 22]);
    expect(items(data)[0]).toEqual({
      '@type': 'ScholarlyArticle',
      name: 'ConVer-G: A Suite for Versioning, Querying and Visualization of Dynamic Knowledge Graphs',
      author: [
        { '@type': 'Person', name: 'Jey Puget Gil' },
        { '@type': 'Person', name: 'Emmanuel Coquery' },
        { '@type': 'Person', name: 'John Samuel' },
        { '@type': 'Person', name: 'Gilles Gesquière' },
      ],
      datePublished: '2026',
      url: 'https://hal.science/hal-05726064v1',
      identifier: { '@type': 'PropertyValue', propertyID: 'DOI', value: '10.21105/joss.10828' },
      sameAs: 'https://doi.org/10.21105/joss.10828',
      isAccessibleForFree: true,
      inLanguage: 'en',
      isPartOf: { '@type': 'Periodical', name: 'Journal of Open Source Software' },
    });
  });

  it('maps theses, books and chapters, and leaves out what is unknown', () => {
    const thesis = items(buildStructuredData([THESIS], { labels }))[0];
    expect(thesis['@type']).toBe('Thesis');
    expect(thesis.isAccessibleForFree).toBe(false);
    // Several languages: not guessed
    expect(thesis).not.toHaveProperty('inLanguage');
    expect(thesis).not.toHaveProperty('identifier');
    expect(thesis).not.toHaveProperty('isPartOf');

    const types = items(buildStructuredData(['OUV', 'COUV', 'COMM', undefined].map((docType_s) => ({ docType_s })), { labels }));
    expect(types.map((t) => t['@type'])).toEqual(['Book', 'Chapter', 'ScholarlyArticle', 'ScholarlyArticle']);

    // lvl 0: the citation is the name, nothing else is known
    const minimal = items(buildStructuredData([{ label_s: 'J. Doe. Paper &amp; co. 2024.' }], { labels }))[0];
    expect(minimal).toEqual({ '@type': 'ScholarlyArticle', name: 'J. Doe. Paper & co. 2024.' });
  });

  it('lists the authors like the display (maxAuthors)', () => {
    const [two] = items(buildStructuredData([ARTICLE], { labels, maxAuthors: 2 }));
    expect(two.author).toHaveLength(2);
    const [all] = items(buildStructuredData([ARTICLE], { labels, maxAuthors: 0 }));
    expect(all.author).toHaveLength(4);
  });

  it('keeps only http(s) URLs and valid DOIs', () => {
    const [item] = items(
      buildStructuredData([{ title_s: ['x'], uri_s: 'javascript:alert(1)', doiId_s: 'not a doi', language_s: ['<b>'] }], { labels }),
    );
    expect(item).toEqual({ '@type': 'ScholarlyArticle', name: 'x' });
    // A DOI with characters that need encoding in the URL keeps its value
    const [doi] = items(buildStructuredData([{ title_s: ['x'], doiId_s: '10.1000/a#b?c' }], { labels }));
    expect(doi.sameAs).toBe('https://doi.org/10.1000/a%23b%3Fc');
    expect(doi.identifier).toMatchObject({ value: '10.1000/a#b?c' });
  });
});

describe('serializeJsonLd', () => {
  it('can never close the script element, and parses back to the same data', () => {
    const data = {
      name: '</script><script>alert(1)</script><!-- & -->',
      sep: 'a\u2028b\u2029c',
      nested: [{ x: '<\u0000>' }],
    };
    const json = serializeJsonLd(data);
    expect(json).not.toMatch(/[<>&\u2028\u2029]/);
    expect(json).toContain('\\u003c/script\\u003e');
    expect(JSON.parse(json)).toEqual(data);
  });

  it('serializes a whole ItemList safely', () => {
    const hostile: HalDoc = { title_s: ['A </script> B'], authFullName_s: ['<img src=x onerror=alert(1)>'] };
    const json = serializeJsonLd(buildStructuredData([hostile], { labels }));
    expect(json).not.toContain('<');
    expect(items(JSON.parse(json))[0].name).toBe('A </script> B');
  });
});
