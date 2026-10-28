import { describe, expect, it, vi } from 'vitest';

// theme.ts is owned by another agent: use a minimal, predictable color validator.
vi.mock('../src/theme', () => ({
  isSafeColor: (value: string) => /^#[0-9a-f]{3,8}$/i.test(value) || ['red', 'white', 'black'].includes(value),
}));

import { parseUrlParams, toUrlParams } from '../src/url-params';
import { buildFilterQueries } from '../src/query';
import type { UrlState } from '../src/types';

const parse = (search: string, maxRows?: number) =>
  parseUrlParams(new URLSearchParams(search), maxRows === undefined ? undefined : { maxRows });

// ---------------------------------------------------------------------------
// parseUrlParams
// ---------------------------------------------------------------------------

describe('parseUrlParams', () => {
  it('returns an empty query and filters for an empty URL', () => {
    expect(parse('')).toEqual({ query: {}, filters: {} });
  });

  it('parses every query param', () => {
    expect(
      parse('idHal=jpugetgil&orcid=0000-0002-1825-009x&structId=1088569&collection=LIRIS&search=knowledge+graph&q=title_s:rdf')
        .query,
    ).toEqual({
      idHal: 'jpugetgil',
      orcid: '0000-0002-1825-009X',
      structId: 1088569,
      collection: 'LIRIS',
      text: 'knowledge graph',
      solr: 'title_s:rdf',
    });
  });

  it('accepts an ORCID iD written as a URL, like the JS API', () => {
    expect(parse('orcid=https://orcid.org/0000-0002-1825-009x').query).toEqual({ orcid: '0000-0002-1825-009X' });
    expect(parse(`orcid=${encodeURIComponent('http://www.orcid.org/0000-0002-1825-0097')}`).query).toEqual({
      orcid: '0000-0002-1825-0097',
    });
    expect(parse('orcid=https://orcid.org/').query).toEqual({});
    expect(parse('orcid=https://evil.example/0000-0002-1825-0097').query).toEqual({});
  });

  it('maps the legacy uid param to query.solr (q wins)', () => {
    expect(parse('uid=authIdHal_s:jpugetgil').query).toEqual({ solr: 'authIdHal_s:jpugetgil' });
    expect(parse('uid=old&q=new').query).toEqual({ solr: 'new' });
  });

  it('keeps the 0.4 phrase search for a plain-text legacy uid', () => {
    expect(parse('uid=Jey%20Puget%20Gil').query).toEqual({ solr: '"Jey Puget Gil"' });
    expect(parse('uid=jpugetgil').query).toEqual({ solr: '"jpugetgil"' });
    // Field queries and explicit quotes are passed raw; only `uid` gets this treatment, not `q`.
    expect(parse('uid=%22exact%20phrase%22').query).toEqual({ solr: '"exact phrase"' });
    expect(parse('q=Jey%20Puget%20Gil').query).toEqual({ solr: 'Jey Puget Gil' });
  });

  it('drops invalid query values', () => {
    expect(
      parse('idHal=a"b&orcid=1234&structId=12a&collection=../x&search=%20%20&q=').query,
    ).toEqual({});
    expect(parse(`search=${'a'.repeat(1001)}`).query).toEqual({});
  });

  it('parses filters', () => {
    expect(parse('docTypes=ART,comm,,ART,bad-code&yearFrom=2020&yearTo=2024&oa=1').filters).toEqual({
      docTypes: ['ART', 'COMM'],
      yearFrom: 2020,
      yearTo: 2024,
      openAccess: true,
    });
    expect(parse('oa=true').filters).toEqual({ openAccess: true });
  });

  it('accepts doc type codes with the alphabet of buildFilterQueries (digits included)', () => {
    expect(parse('docTypes=REPORT_2,art,x9').filters).toEqual({ docTypes: ['REPORT_2', 'ART', 'X9'] });
    for (const code of ['REPORT_2', 'X9', 'ART']) {
      expect(buildFilterQueries(parse(`docTypes=${code}`).filters)).toEqual([`docType_s:(${code})`]);
    }
  });

  it('drops invalid filters', () => {
    expect(parse('docTypes=a-b,(ART),A%20B&yearFrom=20&yearTo=20245&oa=yes').filters).toEqual({});
    expect(parse('oa=0').filters).toEqual({});
  });

  it('parses display params', () => {
    expect(
      parse(
        'sort=date-asc&lvl=3&rows=20&page=2&output=svg&theme=dark&bg=%23fff&text=black&main=red&groupBy=docType' +
          '&highlight=Jey%20Puget%20Gil,%20jpugetgil&maxAuthors=0&title=%20My%20papers%20&credit=0',
      ),
    ).toEqual({
      query: {},
      filters: {},
      sort: 'date-asc',
      lvl: 3,
      rows: 20,
      page: 2,
      output: 'svg',
      theme: 'dark',
      backgroundColor: '#fff',
      textColor: 'black',
      mainColor: 'red',
      groupBy: 'docType',
      highlightAuthors: ['Jey Puget Gil', 'jpugetgil'],
      maxAuthors: 0,
      title: 'My papers',
      showCredit: false,
    });
  });

  it('maps the legacy type param to output (output wins)', () => {
    expect(parse('type=svg').output).toBe('svg');
    expect(parse('type=svg&output=html').output).toBe('html');
    expect(parse('type=pdf').output).toBeUndefined();
  });

  it('clamps rows to maxRows (default 50)', () => {
    expect(parse('rows=500').rows).toBe(50);
    expect(parse('rows=500', 20).rows).toBe(20);
    expect(parse('rows=10', 20).rows).toBe(10);
    expect(parse('rows=0').rows).toBeUndefined();
    expect(parse('rows=-3').rows).toBeUndefined();
    expect(parse('rows=1e3').rows).toBeUndefined();
  });

  it('drops invalid display values without echoing them', () => {
    const hostile = '<script>alert(1)</script>';
    const enc = encodeURIComponent(hostile);
    const state = parse(
      `sort=${enc}&lvl=4&page=0&output=${enc}&theme=${enc}&bg=${enc}&text=url(x)&main=expression(1)` +
        `&groupBy=${enc}&maxAuthors=-1&credit=${enc}`,
    );
    expect(state).toEqual({ query: {}, filters: {} });
    expect(JSON.stringify(state)).not.toContain('script');
    expect(parse('lvl=1.5').lvl).toBeUndefined();
    expect(parse('lvl=-0').lvl).toBeUndefined();
  });

  it('truncates long titles to 80 characters', () => {
    const title = parse(`title=${'é'.repeat(100)}`).title!;
    expect(Array.from(title)).toHaveLength(80);
    expect(parse('title=%20%20').title).toBeUndefined();
  });

  it('removes control characters from free text', () => {
    expect(parse('title=a%0Ab').title).toBe('a b');
  });

  it('accepts credit=1/true and credit=0/false', () => {
    expect(parse('credit=false').showCredit).toBe(false);
    expect(parse('credit=1').showCredit).toBe(true);
    expect(parse('credit=true').showCredit).toBe(true);
  });

  it('parses lang: built-in locales, region subtags normalised, others dropped', () => {
    expect(parse('lang=fr').locale).toBe('fr');
    expect(parse('lang=en').locale).toBe('en');
    expect(parse('lang=fr-FR').locale).toBe('fr');
    expect(parse('lang=FR_ca').locale).toBe('fr');
    expect(parse('lang=%20fr%20').locale).toBe('fr');
    for (const invalid of ['de', 'xx', 'french', 'f', 'fr-', '"><svg>', '']) {
      expect(parse(`lang=${encodeURIComponent(invalid)}`), invalid).not.toHaveProperty('locale');
    }
  });

  it('ignores unknown params', () => {
    expect(parse('foo=bar&idHal=x')).toEqual({ query: { idHal: 'x' }, filters: {} });
  });

  it('limits the highlight list', () => {
    const many = Array.from({ length: 30 }, (_, i) => `a${i}`).join(',');
    expect(parse(`highlight=${many}`).highlightAuthors).toHaveLength(20);
    expect(parse(`highlight=${'x'.repeat(101)}`).highlightAuthors).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// toUrlParams
// ---------------------------------------------------------------------------

describe('toUrlParams', () => {
  it('omits defaults and empty values', () => {
    expect(
      toUrlParams({
        query: { idHal: 'jpugetgil', text: ' ' },
        filters: { docTypes: [], openAccess: false },
        sort: 'date-desc',
        lvl: 1,
        page: 1,
        output: 'html',
        theme: 'light',
        groupBy: 'none',
        maxAuthors: 10,
        showCredit: true,
        highlightAuthors: [],
        title: '',
      }).toString(),
    ).toBe('idHal=jpugetgil');
    expect(toUrlParams({}).toString()).toBe('');
  });

  it('never emits legacy names', () => {
    const params = toUrlParams({ query: { solr: 'a:b' }, output: 'svg' });
    expect(params.get('q')).toBe('a:b');
    expect(params.get('output')).toBe('svg');
    expect(params.has('uid')).toBe(false);
    expect(params.has('type')).toBe(false);
  });

  it('serialises lists, booleans and numbers', () => {
    const params = toUrlParams({
      query: { structId: 1088569 },
      filters: { docTypes: ['ART', 'COMM'], yearFrom: 2020, openAccess: true },
      highlightAuthors: ['A B', 'c'],
      showCredit: false,
      maxAuthors: 0,
      lvl: 0,
    });
    expect(params.toString()).toBe(
      'structId=1088569&docTypes=ART%2CCOMM&yearFrom=2020&oa=1&lvl=0&highlight=A+B%2Cc&maxAuthors=0&credit=0',
    );
  });
});

// ---------------------------------------------------------------------------
// Round trip
// ---------------------------------------------------------------------------

describe('parseUrlParams(toUrlParams(x))', () => {
  it('round-trips a full state', () => {
    const state: UrlState = {
      query: {
        idHal: 'jpugetgil',
        orcid: '0000-0002-1825-0097',
        structId: 1088569,
        collection: 'LIRIS',
        text: 'knowledge graph & "RDF"',
        solr: 'title_s:(a OR b)',
      },
      filters: { docTypes: ['ART', 'COMM'], yearFrom: 2020, yearTo: 2024, openAccess: true },
      sort: 'relevance',
      lvl: 3,
      rows: 25,
      page: 3,
      output: 'svg',
      theme: 'auto',
      backgroundColor: '#ffffff',
      textColor: 'black',
      mainColor: '#c00',
      groupBy: 'year',
      highlightAuthors: ['Jey Puget Gil', 'jpugetgil'],
      maxAuthors: 5,
      title: 'Publications — équipe',
      showCredit: false,
      locale: 'fr',
    };
    expect(parseUrlParams(toUrlParams(state))).toEqual(state);
  });

  it('round-trips minimal states (defaults are implied)', () => {
    const state: UrlState = { query: { collection: 'LIRIS' }, filters: {} };
    expect(parseUrlParams(toUrlParams(state))).toEqual(state);
    const withDefaults: UrlState = { ...state, sort: 'date-desc', lvl: 1, theme: 'light' };
    const { sort, lvl, theme, ...rest } = withDefaults;
    expect([sort, lvl, theme]).toEqual(['date-desc', 1, 'light']);
    expect(parseUrlParams(toUrlParams(withDefaults))).toEqual(rest);
  });

  it('generates canonical ORCID iDs (no orcid.org prefix, upper-case X)', () => {
    const params = toUrlParams({ query: { orcid: 'https://orcid.org/0000-0002-1825-009x' } });
    expect(params.toString()).toBe('orcid=0000-0002-1825-009X');
    expect(parseUrlParams(params).query).toEqual({ orcid: '0000-0002-1825-009X' });
  });

  it('round-trips lang: built-in locales only', () => {
    expect(toUrlParams({ query: { idHal: 'a' }, locale: 'fr' }).toString()).toBe('idHal=a&lang=fr');
    expect(parseUrlParams(toUrlParams({ query: { idHal: 'a' }, locale: 'fr' })).locale).toBe('fr');
    // Canonical form: region subtags and case are normalised
    expect(toUrlParams({ query: {}, locale: 'FR-ca' }).toString()).toBe('lang=fr');
    // Unknown languages are dropped; no locale, no lang
    expect(toUrlParams({ query: {}, locale: 'de' }).toString()).toBe('');
    expect(toUrlParams({ query: {}, locale: '"><x' }).toString()).toBe('');
    expect(toUrlParams({ query: { idHal: 'a' } }).toString()).toBe('idHal=a');
  });

  it('keeps an explicit English (it is not lost on a round trip)', () => {
    expect(toUrlParams({ query: {}, locale: 'en' }).toString()).toBe('lang=en');
    expect(toUrlParams({ query: {}, locale: 'en-GB' }).toString()).toBe('lang=en');
    expect(parseUrlParams(toUrlParams(parse('idHal=a&lang=en'))).locale).toBe('en');
  });

  it('round-trips legacy URLs into the new scheme', () => {
    const legacy = parse('uid=jpugetgil&type=svg&lvl=2&bg=%23fff');
    expect(toUrlParams(legacy).toString()).toBe('q=%22jpugetgil%22&lvl=2&output=svg&bg=%23fff');
  });
});
