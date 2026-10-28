import { describe, expect, it } from 'vitest';
import { DOC_TYPE_LABELS, docTypeLabel } from '../src/doctypes';

/** Every docType_s code currently found in HAL (see CONTRACT). */
const HAL_CODES = [
  'ART', 'COMM', 'COUV', 'THESE', 'OUV', 'MEM', 'POSTER', 'OTHER', 'REPORT', 'IMG', 'ISSUE', 'BLOG',
  'NOTICE', 'PROCEEDINGS', 'HDR', 'PATENT', 'VIDEO', 'LECTURE', 'REPORT_LABO', 'TRAD', 'REPORT_MAST',
  'REPORT_LPRO', 'REPORT_LICE', 'SOFTWARE', 'PRESCONF', 'SON', 'CREPORT', 'MAP', 'REPORT_DOCT',
  'REPORT_ETAB', 'REPORT_FORM', 'REPORT_GMAST', 'NOTE', 'SYNTHESE', 'REPORT_FPROJ', 'ETABTHESE',
  'REPORT_GLICE', 'REPACT', 'MEMLIC',
];

describe('DOC_TYPE_LABELS', () => {
  it('has an English label for every HAL code (except UNDEFINED)', () => {
    for (const code of HAL_CODES) {
      expect(DOC_TYPE_LABELS[code], code).toBeTruthy();
      expect(DOC_TYPE_LABELS[code]).not.toBe(code);
    }
    expect(DOC_TYPE_LABELS.UNDEFINED).toBeUndefined();
  });

  it('uses the expected labels for the main types', () => {
    expect(DOC_TYPE_LABELS).toMatchObject({
      ART: 'Journal article',
      COMM: 'Conference paper',
      COUV: 'Book chapter',
      THESE: 'Thesis',
      HDR: 'Habilitation thesis',
      OUV: 'Book',
      POSTER: 'Poster',
    });
  });
});

describe('docTypeLabel', () => {
  it('returns the English label', () => {
    expect(docTypeLabel('ART')).toBe('Journal article');
    expect(docTypeLabel(' COMM ')).toBe('Conference paper');
  });

  it('returns undefined for empty and UNDEFINED codes', () => {
    expect(docTypeLabel(undefined)).toBeUndefined();
    expect(docTypeLabel('')).toBeUndefined();
    expect(docTypeLabel('UNDEFINED')).toBeUndefined();
  });

  it('humanises unknown codes instead of showing them raw', () => {
    expect(docTypeLabel('NEWTYPE')).toBe('Newtype');
    expect(docTypeLabel('REPORT_NEW_KIND')).toBe('Report new kind');
  });

  it('honours overrides', () => {
    expect(docTypeLabel('ART', { ART: 'Article de revue' })).toBe('Article de revue');
    expect(docTypeLabel('NEWTYPE', { NEWTYPE: 'New type' })).toBe('New type');
    expect(docTypeLabel('UNDEFINED', { UNDEFINED: 'Preprint' })).toBe('Preprint');
    expect(docTypeLabel('ART', { ART: '' })).toBe('Journal article');
    expect(docTypeLabel('ART', { COMM: 'x' })).toBe('Journal article');
  });

  it('ignores inherited object properties', () => {
    expect(docTypeLabel('toString')).toBe('Tostring');
    expect(docTypeLabel('constructor', {})).toBe('Constructor');
  });
});
