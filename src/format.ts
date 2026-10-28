import type { GroupBy, HalDoc, Labels } from './types';
import { docTypeLabel } from './doctypes';

// Pure, DOM-free helpers shared by the HTML and SVG renderers.

export interface FormattedAuthor {
  name: string;
  highlighted: boolean;
}

export interface FormattedAuthors {
  authors: FormattedAuthor[];
  /** Number of authors hidden behind "et al." */
  hiddenCount: number;
}

export interface DocGroup {
  /** Stable key: the year, the docType code, or 'all' */
  key: string;
  /** Heading to display (empty for groupBy 'none') */
  label: string;
  docs: HalDoc[];
}

/** Default number of authors shown before "et al." */
export const DEFAULT_MAX_AUTHORS = 10;

// ---------------------------------------------------------------------------
// Entities, escaping, markup
// ---------------------------------------------------------------------------

/** Named entities found in HAL metadata (XML core, Latin-1 letters, typography). */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', shy: '­',
  ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”',
  bdquo: '„', laquo: '«', raquo: '»', lsaquo: '‹', rsaquo: '›', bull: '•', middot: '·', prime: '′',
  Prime: '″', dagger: '†', Dagger: '‡', permil: '‰', copy: '©', reg: '®', trade: '™', deg: '°',
  plusmn: '±', times: '×', divide: '÷', micro: 'µ', para: '¶', sect: '§', euro: '€', pound: '£',
  yen: '¥', cent: '¢', iexcl: '¡', iquest: '¿', ordf: 'ª', ordm: 'º', sup1: '¹', sup2: '²', sup3: '³',
  frac14: '¼', frac12: '½', frac34: '¾', not: '¬', macr: '¯', acute: '´', uml: '¨', cedil: '¸',
  szlig: 'ß', AElig: 'Æ', aelig: 'æ', OElig: 'Œ', oelig: 'œ', Oslash: 'Ø', oslash: 'ø', ETH: 'Ð',
  eth: 'ð', THORN: 'Þ', thorn: 'þ', Aring: 'Å', aring: 'å', Ccedil: 'Ç', ccedil: 'ç', Ntilde: 'Ñ',
  ntilde: 'ñ', Scaron: 'Š', scaron: 'š', Yuml: 'Ÿ', yuml: 'ÿ', ensp: ' ', emsp: ' ',
  thinsp: ' ', zwnj: '‌', zwj: '‍', lang: '⟨', rang: '⟩', larr: '←', rarr: '→',
  harr: '↔', le: '≤', ge: '≥', ne: '≠', asymp: '≈', infin: '∞', minus: '−', alpha: 'α', beta: 'β',
  gamma: 'γ', delta: 'δ', epsilon: 'ε', lambda: 'λ', mu: 'μ', pi: 'π', sigma: 'σ', tau: 'τ',
  phi: 'φ', omega: 'ω', Delta: 'Δ', Sigma: 'Σ', Omega: 'Ω',
};

/** Accented Latin-1 letters: &eacute; &Agrave; &ocirc; &uuml; &atilde; … (base letter + combining mark). */
const ACCENTS: Record<string, string> = {
  grave: '̀', acute: '́', circ: '̂', tilde: '̃', uml: '̈',
};

function namedEntity(name: string): string | undefined {
  const direct = NAMED_ENTITIES[name];
  if (direct !== undefined) return direct;
  const m = /^([A-Za-z])(grave|acute|circ|tilde|uml)$/.exec(name);
  if (!m) return undefined;
  const composed = (m[1] + ACCENTS[m[2]]).normalize('NFC');
  // Only real precomposed letters (e.g. not "q" + grave).
  return composed.length === 1 ? composed : undefined;
}

function codePointToString(code: number): string {
  // NUL, surrogates and out-of-range values become U+FFFD like the HTML parser does.
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '�';
  return String.fromCodePoint(code);
}

/** Decodes HTML entities (named, decimal, hex) without touching the DOM. */
export function decodeEntities(raw: string): string {
  if (typeof raw !== 'string' || !raw.includes('&')) return typeof raw === 'string' ? raw : '';
  // Single pass: "&amp;lt;" decodes to "&lt;", never to "<".
  return raw.replace(/&(?:#(\d{1,8})|#[xX]([0-9a-fA-F]{1,7})|([A-Za-z][A-Za-z0-9]{1,31}));/g, (match, dec, hex, name) => {
    if (dec !== undefined) return codePointToString(parseInt(dec, 10));
    if (hex !== undefined) return codePointToString(parseInt(hex, 16));
    return namedEntity(name) ?? match;
  });
}

/**
 * A valid surrogate pair (kept), or a character that is not allowed in XML 1.0 documents (dropped:
 * control characters, U+FFFE/U+FFFF, lone surrogates; they would make the SVG unparseable).
 * Pairs are matched first instead of using a lookbehind: Safari < 16.4 cannot parse lookbehinds,
 * and one unparseable regex literal stops the whole bundle from loading.
 */
// eslint-disable-next-line no-control-regex
const XML_CHAR_SCAN = /[\ud800-\udbff][\udc00-\udfff]|[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿\ud800-\udfff]/g;

/** Removes the characters that are invalid in XML 1.0, keeping valid surrogate pairs. */
function dropInvalidXmlChars(text: string): string {
  return text.replace(XML_CHAR_SCAN, (match) => (match.length === 2 ? match : ''));
}

/**
 * Escapes &, <, >, " and ' for XML/HTML text and attributes.
 * Also drops characters that are invalid in XML 1.0 (control characters, lone surrogates).
 */
export function escapeXml(text: string): string {
  return dropInvalidXmlChars(String(text ?? ''))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Collapses runs of whitespace (and control characters) into single spaces and trims. */
export function normalizeSpace(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\s\u0000-\u001f\u007f]+/g, ' ').trim();
}

/** Removes HTML tags and decodes entities (e.g. for citationFull_s). */
export function stripHtml(html: string): string {
  if (typeof html !== 'string') return '';
  const text = html
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?[A-Za-z][^<>]*>/g, '');
  return normalizeSpace(decodeEntities(text));
}

// ---------------------------------------------------------------------------
// Document fields
// ---------------------------------------------------------------------------

/** Title (decoded) or label_s, or labels.untitled. */
export function getTitle(doc: HalDoc, labels: Labels): string {
  const raw = Array.isArray(doc?.title_s) ? doc.title_s.find((t) => typeof t === 'string' && t.trim()) : undefined;
  const title = normalizeSpace(decodeEntities(raw ?? (typeof doc?.label_s === 'string' ? doc.label_s : '')));
  return title || labels.untitled;
}

/** Production/publication year, or undefined. */
export function getYear(doc: HalDoc): number | undefined {
  const y = doc?.producedDateY_i;
  if (typeof y === 'number' && Number.isInteger(y) && y > 0 && y < 10000) return y;
  // producedDateY_i is fetched at every level; the dates are fallbacks for other callers.
  for (const date of [doc?.producedDate_tdate, doc?.publicationDate_s]) {
    const m = typeof date === 'string' ? /^(\d{4})/.exec(date) : null;
    if (m) return Number(m[1]);
  }
  return undefined;
}

/**
 * Readable label for a docType_s code using labels.docTypes (see docTypeLabel): never the raw code,
 * undefined for empty and 'UNDEFINED' codes unless labels.docTypes defines UNDEFINED explicitly.
 */
export function getDocTypeLabel(code: string | undefined, labels: Labels): string | undefined {
  return docTypeLabel(code, labels?.docTypes);
}

/** Journal title, else conference title (decoded), or undefined. */
export function getVenue(doc: HalDoc): string | undefined {
  for (const v of [doc?.journalTitle_s, doc?.conferenceTitle_s]) {
    if (typeof v === 'string' && v.trim()) return normalizeSpace(decodeEntities(v));
  }
  return undefined;
}

/** Keywords decoded, trimmed and deduplicated case-insensitively (first spelling wins). */
export function getKeywords(doc: HalDoc): string[] {
  return dedupe((Array.isArray(doc?.keyword_s) ? doc.keyword_s : []).map((k) => normalizeSpace(decodeEntities(String(k)))));
}

/** Removes empty strings and case-insensitive duplicates, preserving order. */
export function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.toLowerCase();
    if (!v || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Authors
// ---------------------------------------------------------------------------

/** Case-, accent- and whitespace-insensitive comparison key for person names. */
export function normalizeName(name: string): string {
  return normalizeSpace(
    String(name)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[‐-―]/g, '-'),
  );
}

/** Truncates the author list and flags highlighted authors (by full name or idHal). */
export function formatAuthors(
  doc: HalDoc,
  options: { maxAuthors?: number; highlightAuthors?: string[] },
): FormattedAuthors {
  const names = (Array.isArray(doc?.authFullName_s) ? doc.authFullName_s : [])
    .map((n) => normalizeSpace(decodeEntities(String(n))))
    .filter(Boolean);

  // Highlight keys: the given names, plus the names attached to matching idHal values.
  const wanted = (options?.highlightAuthors ?? []).filter((h) => typeof h === 'string' && h.trim());
  const keys = new Set(wanted.map(normalizeName));
  const idHals = new Set(wanted.map((h) => h.trim().toLowerCase()));
  if (idHals.size > 0 && Array.isArray(doc?.authIdHalFullName_fs)) {
    for (const entry of doc.authIdHalFullName_fs) {
      const [id, fullName] = String(entry).split('_FacetSep_');
      if (id && fullName && idHals.has(id.trim().toLowerCase())) keys.add(normalizeName(decodeEntities(fullName)));
    }
  }

  const max = options?.maxAuthors;
  const limit = typeof max === 'number' && Number.isFinite(max) && max >= 0 ? Math.floor(max) : DEFAULT_MAX_AUTHORS;
  const shown = limit > 0 ? names.slice(0, limit) : names;
  return {
    authors: shown.map((name) => ({ name, highlighted: keys.size > 0 && keys.has(normalizeName(name)) })),
    hiddenCount: names.length - shown.length,
  };
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

/** Groups documents, preserving the incoming order inside and across groups. */
export function groupDocs(docs: HalDoc[], groupBy: GroupBy | undefined, labels: Labels): DocGroup[] {
  const list = Array.isArray(docs) ? docs : [];
  if (groupBy !== 'year' && groupBy !== 'docType') return [{ key: 'all', label: '', docs: list.slice() }];

  // Groups appear in the order of their first document.
  const groups = new Map<string, DocGroup>();
  for (const doc of list) {
    let key: string;
    let label: string;
    if (groupBy === 'year') {
      const year = getYear(doc);
      key = year === undefined ? 'undated' : String(year);
      label = year === undefined ? labels.undated : String(year);
    } else {
      const code = typeof doc?.docType_s === 'string' && doc.docType_s.trim() ? doc.docType_s.trim() : 'UNDEFINED';
      key = code;
      // UNDEFINED has no type label unless overridden: it falls under the "Other" heading.
      label = getDocTypeLabel(code, labels) ?? (getDocTypeLabel('OTHER', labels) as string);
    }
    let group = groups.get(key);
    if (!group) {
      group = { key, label, docs: [] };
      groups.set(key, group);
    }
    group.docs.push(doc);
  }
  return [...groups.values()];
}
