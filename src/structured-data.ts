import type { HalDoc, Labels } from './types';
import { decodeEntities, formatAuthors, getTitle, getYear, normalizeSpace } from './format';
import { getDocLinks } from './links';

// schema.org JSON-LD describing the displayed page of results (SEO of lab and personal pages).
// Built from the fields fetched by the detail level: richer from lvl 1 (title, authors), open access
// from lvl 2, language at lvl 3.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** schema.org type per HAL docType_s code; every other document is a ScholarlyArticle. */
const SCHEMA_TYPES: Readonly<Record<string, string>> = {
  THESE: 'Thesis',
  HDR: 'Thesis',
  OUV: 'Book',
  COUV: 'Chapter',
};

const DOI_URL_PREFIX = 'https://doi.org/';

/** BCP 47-ish language tag as found in HAL's language_s ('en', 'fr', 'pt-BR'...). */
const LANG_RE = /^[a-z]{2,3}(?:-[a-z0-9]{1,8})*$/i;

/** Attribute marking the JSON-LD `<script>` of a HalSearch instance (value: the instance id). */
export const STRUCTURED_DATA_ATTRIBUTE = 'data-hal-search-ld';

export interface StructuredDataOptions {
  /** Resolved labels (title fallback, as displayed) */
  labels: Labels;
  /** 0-based index of the first document in the whole list: positions continue across pages. Default: 0 */
  start?: number;
  /** Number of matching documents, all pages included (`numberOfItems`). Default: docs.length */
  totalFound?: number;
  /** Authors listed per document, like the display (0 = all). Default: 10 */
  maxAuthors?: number;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/** The only language when HAL gives a single, well-formed one. */
function language(doc: HalDoc): string | undefined {
  const langs = doc.language_s;
  if (!Array.isArray(langs) || langs.length !== 1 || typeof langs[0] !== 'string') return undefined;
  const code = langs[0].trim();
  return LANG_RE.test(code) && code.toLowerCase() !== 'und' ? code : undefined;
}

/** The DOI itself, from the validated https://doi.org/ link (its path segments are URI-encoded). */
function doiValue(doiUrl: string): string | undefined {
  try {
    return decodeURIComponent(doiUrl.slice(DOI_URL_PREFIX.length));
  } catch {
    return undefined;
  }
}

/** One document as a schema.org CreativeWork. Absent fields are left out, never empty. */
function describe(doc: HalDoc, options: StructuredDataOptions): Record<string, unknown> {
  const links = getDocLinks(doc);
  const code = typeof doc.docType_s === 'string' ? doc.docType_s.trim() : '';
  const work: Record<string, unknown> = {
    '@type': SCHEMA_TYPES[code] ?? 'ScholarlyArticle',
    name: getTitle(doc, options.labels),
  };

  const { authors } = formatAuthors(doc, { maxAuthors: options.maxAuthors });
  if (authors.length > 0) work.author = authors.map(({ name }) => ({ '@type': 'Person', name }));

  const year = getYear(doc);
  if (year !== undefined) work.datePublished = String(year);

  if (links.hal) work.url = links.hal;

  const doi = links.doi ? doiValue(links.doi) : undefined;
  if (links.doi && doi) {
    work.identifier = { '@type': 'PropertyValue', propertyID: 'DOI', value: doi };
    work.sameAs = links.doi;
  }

  if (typeof doc.openAccess_bool === 'boolean') work.isAccessibleForFree = doc.openAccess_bool;

  const lang = language(doc);
  if (lang) work.inLanguage = lang;

  const journal = typeof doc.journalTitle_s === 'string' ? normalizeSpace(decodeEntities(doc.journalTitle_s)) : '';
  if (journal) work.isPartOf = { '@type': 'Periodical', name: journal };

  return work;
}

/**
 * schema.org `ItemList` of the displayed documents: one `ListItem` per document, holding a `ScholarlyArticle`
 * (`Thesis`, `Book` or `Chapter` for those HAL types) with its name, authors (`Person`), year, HAL page, DOI,
 * open access and language when they were fetched. Only http(s) URLs (validated by getDocLinks) are used.
 */
export function buildStructuredData(docs: HalDoc[], options: StructuredDataOptions): Record<string, unknown> {
  const list = Array.isArray(docs) ? docs : [];
  const start = Number.isFinite(options.start) && (options.start as number) > 0 ? Math.floor(options.start as number) : 0;
  const total = Number.isFinite(options.totalFound) ? Math.max(options.totalFound as number, list.length) : list.length;
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    numberOfItems: total,
    itemListElement: list.map((doc, i) => ({
      '@type': 'ListItem',
      position: start + i + 1,
      item: describe(doc, options),
    })),
  };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/**
 * JSON for a `<script type="application/ld+json">`. `<`, `>`, `&`, U+2028 and U+2029 are written as
 * `\uXXXX` escapes (they only occur inside JSON strings, where escapes are equivalent): no data can close
 * the script element, start a comment or break a JavaScript parser, even once the page is serialized.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(
    /[<>&\u2028\u2029]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

/**
 * A `<script type="application/ld+json">` holding `data` (as a text node: no HTML parsing).
 * JSON-LD is a data block: browsers never execute it, so a Content-Security-Policy does not block it.
 */
export function createStructuredDataScript(doc: Document, data: unknown): HTMLScriptElement {
  const script = doc.createElement('script');
  script.type = 'application/ld+json';
  script.appendChild(doc.createTextNode(serializeJsonLd(data)));
  return script;
}
