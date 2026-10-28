import { describe, expect, it } from 'vitest';
import {
  HAL_API_BASE,
  buildFilterQueries,
  buildHalUrl,
  buildHalWebUrl,
  buildSolrQuery,
  buildTextQuery,
  escapeSolrValue,
  hasQueryCriterion,
  resolveSort,
} from '../src/query';
import { LEVEL_FIELDS } from '../src/levels';

/** Parses a generated API URL into its path and params. */
function parse(url: string): { path: string; params: URLSearchParams } {
  const u = new URL(url);
  return { path: `${u.origin}${u.pathname}`, params: u.searchParams };
}

// ---------------------------------------------------------------------------
// escapeSolrValue
// ---------------------------------------------------------------------------

describe('escapeSolrValue', () => {
  it('escapes quotes and backslashes only', () => {
    expect(escapeSolrValue('a"b\\c')).toBe('a\\"b\\\\c');
    expect(escapeSolrValue('jpugetgil')).toBe('jpugetgil');
    expect(escapeSolrValue('a:b (c)')).toBe('a:b (c)');
  });
});

// ---------------------------------------------------------------------------
// buildSolrQuery — regression: the whole query used to be wrapped in quotes
// ---------------------------------------------------------------------------

describe('buildSolrQuery', () => {
  it('quotes the idHal VALUE, never the whole query', () => {
    expect(buildSolrQuery({ idHal: 'jpugetgil' })).toBe('authIdHal_s:"jpugetgil"');
    expect(buildSolrQuery({ idHal: 'jpugetgil' })).not.toMatch(/^"/);
  });

  it('escapes quotes inside idHal / orcid values', () => {
    expect(buildSolrQuery({ idHal: 'x" OR *:* OR "' })).toBe('authIdHal_s:"x\\" OR *:* OR \\""');
  });

  it('builds ORCID queries and strips an orcid.org URL prefix', () => {
    expect(buildSolrQuery({ orcid: '0000-0002-1825-0097' })).toBe('authORCIDIdExt_s:"0000-0002-1825-0097"');
    expect(buildSolrQuery({ orcid: 'https://orcid.org/0000-0002-1825-0097' })).toBe(
      'authORCIDIdExt_s:"0000-0002-1825-0097"',
    );
    // Same canonical form as parseUrlParams (upper-case check digit)
    expect(buildSolrQuery({ orcid: '0000-0002-1825-009x' })).toBe('authORCIDIdExt_s:"0000-0002-1825-009X"');
  });

  it('builds structId queries from numbers and digit strings', () => {
    expect(buildSolrQuery({ structId: 1088569 })).toBe('structId_i:1088569');
    expect(buildSolrQuery({ structId: ' 1088569 ' })).toBe('structId_i:1088569');
  });

  it('rejects non-digit structIds with a clear error', () => {
    expect(() => buildSolrQuery({ structId: '12 OR *:*' })).toThrow(/structId/);
    expect(() => buildSolrQuery({ structId: -1 })).toThrow(/structId/);
    expect(() => buildSolrQuery({ structId: 1.5 })).toThrow(/structId/);
  });

  it('returns *:* without any criterion', () => {
    expect(buildSolrQuery({})).toBe('*:*');
    expect(buildSolrQuery('')).toBe('*:*');
    expect(buildSolrQuery('   ')).toBe('*:*');
    expect(buildSolrQuery({ idHal: '  ', text: '', solr: ' ' })).toBe('*:*');
    expect(buildSolrQuery({ collection: 'LIRIS' })).toBe('*:*');
    expect(buildSolrQuery({ text: '+++ ::: ()' })).toBe('*:*');
  });

  it('passes raw Solr strings through unchanged', () => {
    expect(buildSolrQuery('authIdHal_s:jpugetgil')).toBe('authIdHal_s:jpugetgil');
    expect(buildSolrQuery({ solr: 'title_s:(rdf OR sparql)' })).toBe('title_s:(rdf OR sparql)');
  });

  it('AND-s criteria and wraps text / raw Solr in parentheses', () => {
    expect(buildSolrQuery({ idHal: 'jpugetgil', structId: 1088569 })).toBe(
      'authIdHal_s:"jpugetgil" AND structId_i:1088569',
    );
    expect(buildSolrQuery({ idHal: 'jpugetgil', text: 'knowledge graph' })).toBe(
      'authIdHal_s:"jpugetgil" AND (knowledge graph)',
    );
    expect(buildSolrQuery({ structId: 1, solr: 'a:b OR c:d' })).toBe('structId_i:1 AND (a:b OR c:d)');
  });

  it('keeps free text alone without parentheses', () => {
    expect(buildSolrQuery({ text: 'knowledge graph' })).toBe('knowledge graph');
  });

  it('validates the collection even though it is not part of q', () => {
    expect(() => buildSolrQuery({ collection: 'LIRIS/../x' })).toThrow(/collection/);
  });
});

// ---------------------------------------------------------------------------
// Free text neutralisation
// ---------------------------------------------------------------------------

describe('buildTextQuery (free text)', () => {
  it('cannot become a field query', () => {
    expect(buildTextQuery('authIdHal_s:jpugetgil')).toBe('authIdHal_s jpugetgil');
    expect(buildSolrQuery({ text: 'title_s:*' })).toBe('title_s');
  });

  it('removes every Solr syntax character outside phrases', () => {
    const hostile = 'a+b -c && d || e !f (g) {h} [i TO j] ^k ~l *m ?n :o \\p /q';
    const out = buildTextQuery(hostile);
    expect(out).not.toMatch(/[+\-&|!(){}[\]^~*?:\\/]/);
    expect(out).toBe('a b c d e f g h i to j k l m n o p q');
  });

  it('lower-cases boolean operators so that they cannot break the query', () => {
    expect(buildTextQuery('rock AND')).toBe('rock and');
    expect(buildTextQuery('NOT')).toBe('not');
    expect(buildTextQuery('a OR b')).toBe('a or b');
  });

  it('keeps balanced quotes as escaped phrase searches', () => {
    expect(buildTextQuery('"knowledge graph" rdf')).toBe('"knowledge graph" rdf');
    expect(buildTextQuery('"10.1016/j.jtbi.2009.10.014"')).toBe('"10.1016/j.jtbi.2009.10.014"');
    expect(buildTextQuery('"a\\" b')).toBe('"a\\\\" b');
  });

  it('drops unbalanced quotes', () => {
    expect(buildTextQuery('"unbalanced phrase')).toBe('unbalanced phrase');
    expect(buildTextQuery('a "b" "c')).toBe('a "b" c');
  });

  it('cannot escape its parentheses when combined with other criteria', () => {
    const q = buildSolrQuery({ idHal: 'x', text: ') OR (*:*' });
    expect(q).toBe('authIdHal_s:"x" AND (or)');
  });

  it('keeps accents and unicode letters', () => {
    expect(buildTextQuery('Gesquière café')).toBe('Gesquière café');
  });
});

describe('hasQueryCriterion', () => {
  it.each([
    [{ idHal: 'jpugetgil' }],
    [{ orcid: 'https://orcid.org/0000-0002-1825-0097' }],
    [{ structId: 1088569 }],
    [{ structId: '42' }],
    [{ collection: 'liris' }],
    [{ text: 'graph' }],
    [{ text: '* graph ?' }],
    [{ text: '"knowledge graph"' }],
    [{ solr: 'title_s:rdf' }],
    ['authIdHal_s:"x"'],
  ] as const)('%j is a criterion', (query) => {
    expect(hasQueryCriterion(query)).toBe(true);
  });

  it.each([
    [{}],
    [{ idHal: '  ', orcid: '', solr: ' ' }],
    [{ orcid: 'https://orcid.org/' }],
    // Free text with nothing searchable: buildSolrQuery would fall back to *:* (the whole archive)
    [{ text: '*' }],
    [{ text: '??? -- ()' }],
    [{ text: '"" "  "' }],
    // Invalid values never throw here
    [{ structId: '12 OR *:*' }],
    [{ collection: '../x' }],
    [''],
    [undefined],
    [null],
  ] as const)('%j is not a criterion', (query) => {
    expect(hasQueryCriterion(query as never)).toBe(false);
  });

  it('agrees with buildSolrQuery: no criterion ⇔ *:* without a collection', () => {
    const queries = [{ text: '*' }, { text: '* a' }, { idHal: 'x', text: '?' }, { orcid: ' ' }, { structId: 1 }, {}];
    for (const query of queries) expect(hasQueryCriterion(query), JSON.stringify(query)).toBe(buildSolrQuery(query) !== '*:*');
  });
});

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

describe('buildFilterQueries', () => {
  it('returns no fq without filters', () => {
    expect(buildFilterQueries()).toEqual([]);
    expect(buildFilterQueries({})).toEqual([]);
    expect(buildFilterQueries({ docTypes: [], openAccess: false })).toEqual([]);
  });

  it('builds the doc type filter, dropping invalid codes', () => {
    expect(buildFilterQueries({ docTypes: ['ART', 'comm', 'ART'] })).toEqual(['docType_s:(ART OR COMM)']);
    expect(buildFilterQueries({ docTypes: ['ART) OR (*:*', 'X Y'] })).toEqual([]);
  });

  it('builds year ranges with open bounds', () => {
    expect(buildFilterQueries({ yearFrom: 2020, yearTo: 2024 })).toEqual(['producedDateY_i:[2020 TO 2024]']);
    expect(buildFilterQueries({ yearFrom: 2020 })).toEqual(['producedDateY_i:[2020 TO *]']);
    expect(buildFilterQueries({ yearTo: 2024 })).toEqual(['producedDateY_i:[* TO 2024]']);
    expect(buildFilterQueries({ yearFrom: NaN, yearTo: 20.5 })).toEqual([]);
  });

  it('builds the open access filter', () => {
    expect(buildFilterQueries({ openAccess: true })).toEqual(['openAccess_bool:true']);
  });

  it('returns one entry per active filter', () => {
    expect(buildFilterQueries({ docTypes: ['ART'], yearFrom: 2020, openAccess: true })).toEqual([
      'docType_s:(ART)',
      'producedDateY_i:[2020 TO *]',
      'openAccess_bool:true',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

describe('resolveSort', () => {
  it('sorts by date with a deterministic tie-breaker', () => {
    expect(resolveSort('date-desc')).toBe('producedDate_tdate desc,docid desc');
    expect(resolveSort('date-asc')).toBe('producedDate_tdate asc,docid asc');
  });

  it('returns undefined for relevance and undefined', () => {
    expect(resolveSort('relevance')).toBeUndefined();
    expect(resolveSort(undefined)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildHalUrl
// ---------------------------------------------------------------------------

describe('buildHalUrl', () => {
  const base = { lvl: 1 as const, rows: 10, start: 0 };

  it('builds an idHal query with quoted value, default date-desc sort and explicit fields', () => {
    const { path, params } = parse(buildHalUrl({ ...base, query: { idHal: 'jpugetgil' } }));
    expect(path).toBe(HAL_API_BASE);
    expect(params.get('q')).toBe('authIdHal_s:"jpugetgil"');
    expect(params.get('sort')).toBe('producedDate_tdate desc,docid desc');
    expect(params.get('fl')).toBe(LEVEL_FIELDS[1]);
    expect(params.get('fl')).not.toContain('*');
    expect(params.get('rows')).toBe('10');
    expect(params.get('start')).toBe('0');
    expect(params.get('wt')).toBe('json');
    expect(params.getAll('fq')).toEqual([]);
  });

  it('builds a structId query', () => {
    const { params } = parse(buildHalUrl({ ...base, query: { structId: 1088569 } }));
    expect(params.get('q')).toBe('structId_i:1088569');
  });

  it('uses the /search/{COLLECTION}/ endpoint with *:*', () => {
    const { path, params } = parse(buildHalUrl({ ...base, query: { collection: 'LIRIS' } }));
    expect(path).toBe(`${HAL_API_BASE}LIRIS/`);
    expect(params.get('q')).toBe('*:*');
  });

  it('upper-cases collection codes (the HAL API is case-sensitive)', () => {
    const { path } = parse(buildHalUrl({ ...base, query: { collection: 'liris' } }));
    expect(path).toBe(`${HAL_API_BASE}LIRIS/`);
  });

  it('throws a clear error for invalid collection codes', () => {
    expect(() => buildHalUrl({ ...base, query: { collection: '../admin' } })).toThrow(/Invalid HAL collection/);
    expect(() => buildHalUrl({ ...base, query: { collection: 'A B' } })).toThrow(/collection/);
  });

  it('passes raw string queries as q', () => {
    const { params } = parse(buildHalUrl({ ...base, query: 'authIdHal_s:jpugetgil' }));
    expect(params.get('q')).toBe('authIdHal_s:jpugetgil');
  });

  it('uses *:* for an empty query', () => {
    const { params } = parse(buildHalUrl({ ...base, query: {} }));
    expect(params.get('q')).toBe('*:*');
  });

  it('adds one fq per filter', () => {
    const { params } = parse(
      buildHalUrl({ ...base, query: {}, filters: { docTypes: ['ART', 'COMM'], yearFrom: 2020, yearTo: 2024, openAccess: true } }),
    );
    expect(params.getAll('fq')).toEqual([
      'docType_s:(ART OR COMM)',
      'producedDateY_i:[2020 TO 2024]',
      'openAccess_bool:true',
    ]);
  });

  it('omits sort for relevance and honours date-asc', () => {
    expect(parse(buildHalUrl({ ...base, query: {}, sort: 'relevance' })).params.has('sort')).toBe(false);
    expect(parse(buildHalUrl({ ...base, query: {}, sort: 'date-asc' })).params.get('sort')).toBe(
      'producedDate_tdate asc,docid asc',
    );
  });

  it('honours apiBase with or without trailing slash', () => {
    expect(buildHalUrl({ ...base, query: {}, apiBase: 'https://proxy.example/hal' })).toMatch(
      /^https:\/\/proxy\.example\/hal\/\?q=/,
    );
    expect(buildHalUrl({ ...base, query: { collection: 'LIRIS' }, apiBase: 'https://proxy.example/hal/' })).toMatch(
      /^https:\/\/proxy\.example\/hal\/LIRIS\/\?q=/,
    );
  });

  it('sanitises rows and start', () => {
    const { params } = parse(buildHalUrl({ lvl: 0, rows: 12.7, start: -5, query: {} }));
    expect(params.get('rows')).toBe('12');
    expect(params.get('start')).toBe('0');
  });

  it('selects the fields of the requested level', () => {
    for (const lvl of [0, 1, 2, 3] as const) {
      expect(parse(buildHalUrl({ ...base, lvl, query: {} })).params.get('fl')).toBe(LEVEL_FIELDS[lvl]);
    }
  });
});

// ---------------------------------------------------------------------------
// buildHalWebUrl
// ---------------------------------------------------------------------------

describe('buildHalWebUrl', () => {
  it('links an idHal to its CV page', () => {
    expect(buildHalWebUrl({ idHal: 'jpugetgil' })).toBe('https://cv.hal.science/jpugetgil');
  });

  it('links a collection to its portal page', () => {
    expect(buildHalWebUrl({ collection: 'LIRIS' })).toBe('https://hal.science/LIRIS');
  });

  it('falls back to the search page with the equivalent q', () => {
    const url = new URL(buildHalWebUrl({ structId: 1088569 }));
    expect(`${url.origin}${url.pathname}`).toBe('https://hal.science/search/index/');
    expect(url.searchParams.get('q')).toBe('structId_i:1088569');

    expect(new URL(buildHalWebUrl('authIdHal_s:x')).searchParams.get('q')).toBe('authIdHal_s:x');
    expect(new URL(buildHalWebUrl({})).searchParams.get('q')).toBe('*:*');
  });

  it('uses the search page when idHal is combined with other criteria', () => {
    const url = new URL(buildHalWebUrl({ idHal: 'jpugetgil', text: 'rdf' }));
    expect(url.hostname).toBe('hal.science');
    expect(url.searchParams.get('q')).toBe('authIdHal_s:"jpugetgil" AND (rdf)');
  });

  it('searches inside the collection when it is combined with other criteria', () => {
    const url = new URL(buildHalWebUrl({ collection: 'LIRIS', text: 'rdf' }));
    expect(url.pathname).toBe('/LIRIS/search/index/');
    expect(url.searchParams.get('q')).toBe('rdf');
  });

  it('encodes the idHal in the CV path', () => {
    expect(buildHalWebUrl({ idHal: 'a/b?c' })).toBe('https://cv.hal.science/a%2Fb%3Fc');
  });

  // The page must list what the widget counts (numFound is filtered). Verified 2026-10-28: the API gives the
  // same numFound for `(q) AND fq…` as for q + fq, and these hal.science search pages answer 200.
  it('AND-s active filters into q, on the search page (never the CV / portal page)', () => {
    const filters = { docTypes: ['ART', 'COMM'], yearFrom: 2020, yearTo: 2024, openAccess: true };
    const url = new URL(buildHalWebUrl({ idHal: 'jpugetgil' }, filters));
    expect(`${url.origin}${url.pathname}`).toBe('https://hal.science/search/index/');
    expect(url.searchParams.get('q')).toBe(
      '(authIdHal_s:"jpugetgil") AND docType_s:(ART OR COMM) AND producedDateY_i:[2020 TO 2024] AND openAccess_bool:true',
    );
    expect(url.searchParams.get('q')?.split(' AND ').slice(1)).toEqual(buildFilterQueries(filters));
  });

  it('scopes a filtered collection to its search page, without *:*', () => {
    const url = new URL(buildHalWebUrl({ collection: 'liris' }, { yearFrom: 2024 }));
    expect(url.pathname).toBe('/LIRIS/search/index/');
    expect(url.searchParams.get('q')).toBe('producedDateY_i:[2024 TO *]');
    const combined = new URL(buildHalWebUrl({ collection: 'LIRIS', text: 'rdf', solr: 'a:b' }, { openAccess: true }));
    expect(combined.pathname).toBe('/LIRIS/search/index/');
    expect(combined.searchParams.get('q')).toBe('((rdf) AND (a:b)) AND openAccess_bool:true');
  });

  it('ignores empty or inactive filters', () => {
    expect(buildHalWebUrl({ idHal: 'jpugetgil' }, {})).toBe('https://cv.hal.science/jpugetgil');
    expect(buildHalWebUrl({ collection: 'LIRIS' }, { docTypes: [], openAccess: false })).toBe('https://hal.science/LIRIS');
  });
});
