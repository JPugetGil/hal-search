import { describe, expect, it } from 'vitest';
import { DEFAULT_LABELS, formatLabel, resolveLabels } from '../src/labels';
import { DOC_TYPE_LABELS } from '../src/doctypes';
import type { Labels } from '../src/types';

describe('DEFAULT_LABELS', () => {
  it('provides the documented English defaults', () => {
    expect(DEFAULT_LABELS).toMatchObject({
      loading: 'Loading…',
      empty: 'No results found.',
      error: 'Error: {message}',
      previous: 'Previous',
      next: 'Next',
      pageInfo: 'Page {page} of {pages}',
      resultCount: '{count} results',
      resultCountOne: '{count} result',
      pagination: 'Search results pages',
      openAccess: 'Open Access',
      abstract: 'Abstract',
      showMore: 'Show more',
      showLess: 'Show less',
      untitled: 'Untitled',
      etAl: 'et al.',
      pdf: 'PDF',
      doi: 'DOI',
      bibtex: 'BibTeX',
      copyCitation: 'Copy citation',
      copied: 'Copied!',
      viewOnHal: 'View all {count} publications on HAL',
      viewOnHalOne: 'View this publication on HAL',
      title: 'Publications',
      opensInNewTab: '(opens in a new tab)',
      undated: 'Undated',
    });
  });

  it('has a non-empty string for every key', () => {
    for (const [key, value] of Object.entries(DEFAULT_LABELS)) {
      if (key === 'docTypes') continue;
      expect(typeof value, key).toBe('string');
      expect(value, key).not.toBe('');
    }
  });

  it('uses DOC_TYPE_LABELS for document types', () => {
    expect(DEFAULT_LABELS.docTypes).toBe(DOC_TYPE_LABELS);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(DEFAULT_LABELS)).toBe(true);
  });
});

describe('resolveLabels', () => {
  it('returns the defaults without overrides', () => {
    const labels = resolveLabels();
    expect(labels).toEqual(DEFAULT_LABELS);
    expect(labels).not.toBe(DEFAULT_LABELS);
    expect(labels.docTypes).not.toBe(DOC_TYPE_LABELS);
  });

  it('applies string overrides', () => {
    const labels = resolveLabels({ title: 'Publications récentes', etAl: 'et coll.' });
    expect(labels.title).toBe('Publications récentes');
    expect(labels.etAl).toBe('et coll.');
    expect(labels.empty).toBe(DEFAULT_LABELS.empty);
  });

  it('merges docTypes key by key', () => {
    const labels = resolveLabels({ docTypes: { ART: 'Article de revue', UNDEFINED: 'Preprint' } });
    expect(labels.docTypes.ART).toBe('Article de revue');
    expect(labels.docTypes.UNDEFINED).toBe('Preprint');
    for (const [code, label] of Object.entries(DOC_TYPE_LABELS)) {
      if (code !== 'ART') expect(labels.docTypes[code]).toBe(label);
    }
  });

  it('never mutates the defaults', () => {
    const before = JSON.stringify(DEFAULT_LABELS);
    const labels = resolveLabels({ docTypes: { ART: 'x' } });
    labels.docTypes.COMM = 'y';
    expect(JSON.stringify(DEFAULT_LABELS)).toBe(before);
  });

  it('ignores unknown keys, undefined and non-string values (user JSON)', () => {
    const labels = resolveLabels({
      title: undefined,
      empty: 42,
      evil: 'x',
      docTypes: { ART: 7, COMM: 'Talk' },
    } as unknown as Partial<Labels>);
    expect(labels.title).toBe(DEFAULT_LABELS.title);
    expect(labels.empty).toBe(DEFAULT_LABELS.empty);
    expect('evil' in labels).toBe(false);
    expect(labels.docTypes.ART).toBe(DEFAULT_LABELS.docTypes.ART);
    expect(labels.docTypes.COMM).toBe('Talk');
  });

  it('cannot pollute prototypes through docTypes', () => {
    const labels = resolveLabels(JSON.parse('{"docTypes":{"__proto__":"x","ART":"A"}}'));
    expect(Object.getPrototypeOf(labels.docTypes)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  it('ignores non-object overrides', () => {
    expect(resolveLabels('nope' as unknown as Partial<Labels>)).toEqual(DEFAULT_LABELS);
  });
});

describe('formatLabel', () => {
  it('replaces placeholders', () => {
    expect(formatLabel('Page {page} of {pages}', { page: 2, pages: 10 })).toBe('Page 2 of 10');
    expect(formatLabel('{count} results', { count: '1,234' })).toBe('1,234 results');
  });

  it('replaces repeated placeholders', () => {
    expect(formatLabel('{a}-{a}', { a: 'x' })).toBe('x-x');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(formatLabel('Error: {message} ({code})', { message: 'boom' })).toBe('Error: boom ({code})');
  });

  it('does not read inherited properties', () => {
    expect(formatLabel('{constructor}', {})).toBe('{constructor}');
  });

  it('does not re-expand placeholders found in values', () => {
    expect(formatLabel('{a} {b}', { a: '{b}', b: 'x' })).toBe('{b} x');
  });
});
