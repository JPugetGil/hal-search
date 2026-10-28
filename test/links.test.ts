import { describe, expect, it } from 'vitest';
import { getDocLinks, safeHttpUrl } from '../src/links';

describe('getDocLinks', () => {
  it('returns HAL, PDF, DOI and BibTeX links', () => {
    const links = getDocLinks({
      uri_s: 'https://hal.science/hal-05726064v1',
      fileMain_s: 'https://hal.science/hal-05726064/document',
      doiId_s: '10.21105/joss.10828',
      halId_s: 'hal-05726064',
    });
    expect(links.hal).toBe('https://hal.science/hal-05726064v1');
    expect(links.pdf).toBe('https://hal.science/hal-05726064/document');
    expect(links.doi).toBe('https://doi.org/10.21105/joss.10828');

    const bibtex = new URL(links.bibtex!);
    expect(`${bibtex.origin}${bibtex.pathname}`).toBe('https://api.archives-ouvertes.fr/search/');
    expect(bibtex.searchParams.get('q')).toBe('halId_s:"hal-05726064"');
    expect(bibtex.searchParams.get('wt')).toBe('bibtex');
  });

  it('returns no links for an empty document', () => {
    expect(getDocLinks({})).toEqual({});
  });

  it('only keeps http(s) URLs', () => {
    const links = getDocLinks({
      uri_s: 'javascript:alert(1)',
      fileMain_s: 'data:application/pdf;base64,AAAA',
    });
    expect(links).toEqual({});
    expect(getDocLinks({ uri_s: ' //evil.example/x' }).hal).toBeUndefined();
    expect(getDocLinks({ uri_s: 'http://hal.science/x' }).hal).toBe('http://hal.science/x');
  });

  it('only builds DOI links for values that look like DOIs', () => {
    expect(getDocLinks({ doiId_s: 'not a doi' }).doi).toBeUndefined();
    expect(getDocLinks({ doiId_s: '10.1/x' }).doi).toBeUndefined();
    expect(getDocLinks({ doiId_s: 'javascript:alert(1)' }).doi).toBeUndefined();
    expect(getDocLinks({ doiId_s: 'doi:10.1000/182' }).doi).toBe('https://doi.org/10.1000/182');
    expect(getDocLinks({ doiId_s: 'https://doi.org/10.1000/182' }).doi).toBe('https://doi.org/10.1000/182');
  });

  it('encodes characters that would break the DOI URL', () => {
    expect(getDocLinks({ doiId_s: '10.1000/a#b?c"<d>' }).doi).toBe('https://doi.org/10.1000/a%23b%3Fc%22%3Cd%3E');
    expect(getDocLinks({ doiId_s: '10.1002/(SICI)1097-4571' }).doi).toBe('https://doi.org/10.1002/(SICI)1097-4571');
  });

  it('skips BibTeX for malformed HAL ids', () => {
    expect(getDocLinks({ halId_s: 'hal-1" OR *:*' }).bibtex).toBeUndefined();
    expect(getDocLinks({ halId_s: '' }).bibtex).toBeUndefined();
    expect(getDocLinks({ halId_s: 'tel-05695880' }).bibtex).toContain('tel-05695880');
  });

  it('tolerates non-string values', () => {
    expect(getDocLinks({ uri_s: 42 as unknown as string, doiId_s: null as unknown as string })).toEqual({});
  });
});

describe('safeHttpUrl', () => {
  it('accepts absolute http(s) URLs only', () => {
    expect(safeHttpUrl('https://hal.science/')).toBe('https://hal.science/');
    expect(safeHttpUrl('HTTPS://hal.science/a')).toBe('https://hal.science/a');
    expect(safeHttpUrl('ftp://x')).toBeUndefined();
    expect(safeHttpUrl('https://')).toBeUndefined();
    expect(safeHttpUrl(undefined)).toBeUndefined();
  });
});
