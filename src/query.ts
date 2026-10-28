import type { FetchParams, HalFilters, HalQuery, HalQueryInput, SortOrder } from './types';
import { resolveFields } from './levels';

/** HAL search API base URL (re-exported as DEFAULT_BASE by api.ts). */
export const HAL_API_BASE = 'https://api.archives-ouvertes.fr/search/';

/** HAL website (collections and search pages). */
export const HAL_WEB_BASE = 'https://hal.science/';

/** HAL CV pages, one per idHal. */
export const HAL_CV_BASE = 'https://cv.hal.science/';

/** Solr query matching every document. */
const MATCH_ALL = '*:*';

/** Valid HAL collection code (also the /search/{collection}/ path segment). */
const COLLECTION_RE = /^[A-Za-z0-9_-]+$/;

/** Valid HAL docType_s code. */
const DOC_TYPE_RE = /^[A-Z0-9_]+$/;

/** Characters with a meaning in the Lucene/Solr query syntax. */
const SOLR_SYNTAX_RE = /[+\-&|!(){}[\]^"~*?:\\/]/g;

/** Boolean operators of the Solr standard parser (only when written in upper case). */
const SOLR_OPERATORS = new Set(['AND', 'OR', 'NOT', 'TO']);

/** ORCID iD written as a URL, e.g. 'https://orcid.org/0000-...' */
const ORCID_URL_PREFIX_RE = /^https?:\/\/(www\.)?orcid\.org\//i;

// ---------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------

/** Escapes a value for use inside a quoted Solr term ("..."). */
export function escapeSolrValue(value: string): string {
  return String(value).replace(/[\\"]/g, '\\$&');
}

/** Quotes and escapes a value: `"value"`. */
function quote(value: string): string {
  return `"${escapeSolrValue(value)}"`;
}

/**
 * Turns user-typed text into a Solr query that can never become a field query,
 * a range, a wildcard or a syntax error:
 * - balanced double quotes are kept as phrase searches (contents escaped);
 * - every other Solr syntax character is replaced by a space;
 * - upper-case operators (AND, OR, NOT, TO) are lower-cased into plain words.
 * Returns '' when nothing searchable is left.
 */
export function buildTextQuery(text: string): string {
  const out: string[] = [];
  // A balanced "phrase", a run of non-quote characters, or a lone (unbalanced) quote.
  const re = /"([^"]*)"|([^"]+)|"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(String(text))) !== null) {
    if (match[1] !== undefined) {
      const phrase = match[1].replace(/\s+/g, ' ').trim();
      if (phrase) out.push(quote(phrase));
    } else if (match[2] !== undefined) {
      for (const word of match[2].replace(SOLR_SYNTAX_RE, ' ').split(/\s+/)) {
        if (word) out.push(SOLR_OPERATORS.has(word) ? word.toLowerCase() : word);
      }
    }
  }
  return out.join(' ');
}

// ---------------------------------------------------------------------------
// Query normalisation
// ---------------------------------------------------------------------------

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Validates and returns the structId as a digit string, or undefined when absent. */
function normaliseStructId(structId: HalQuery['structId']): string | undefined {
  if (structId === undefined || structId === null || structId === '') return undefined;
  if (typeof structId === 'number') {
    if (Number.isSafeInteger(structId) && structId >= 0) return String(structId);
  } else if (typeof structId === 'string' && /^\d+$/.test(structId.trim())) {
    return structId.trim();
  }
  throw new Error(`Invalid HAL structId "${String(structId)}": expected digits only.`);
}

/**
 * Validates a HAL collection code and returns it in upper case (HAL collection codes are
 * upper case and the API is case-sensitive). Returns undefined when absent.
 */
export function normaliseCollection(collection: string | undefined): string | undefined {
  const code = trimmed(collection);
  if (!code) return undefined;
  if (!COLLECTION_RE.test(code)) {
    throw new Error(
      `Invalid HAL collection code "${code.slice(0, 50)}": only letters, digits, "_" and "-" are allowed.`,
    );
  }
  return code.toUpperCase();
}

/** Returns the collection of a query input (string inputs never have one). */
function collectionOf(query: HalQueryInput): string | undefined {
  return query && typeof query === 'object' ? normaliseCollection(query.collection) : undefined;
}

/**
 * Canonical ORCID iD: without its optional URL prefix ('https://orcid.org/0000-...' → '0000-...') and
 * with an upper-case X check digit. '' when absent. Shared by buildSolrQuery and the public URL scheme.
 */
export function normaliseOrcid(orcid: string | undefined): string {
  return trimmed(orcid).replace(ORCID_URL_PREFIX_RE, '').trim().toUpperCase();
}

/**
 * True when the query has at least one search criterion, normalised like buildSolrQuery:
 * a free text made only of Solr syntax characters (e.g. `*` or `???`) is no criterion, a collection
 * alone is one (the whole collection). Use it to never list the whole archive (`q=*:*`) by accident.
 * Never throws: an invalid structId or collection counts as no criterion.
 */
export function hasQueryCriterion(query: HalQueryInput): boolean {
  if (typeof query === 'string') return query.trim() !== '';
  if (!query || typeof query !== 'object') return false;
  if (trimmed(query.idHal) || normaliseOrcid(query.orcid) || trimmed(query.solr)) return true;
  if (buildTextQuery(trimmed(query.text))) return true;
  try {
    return normaliseStructId(query.structId) !== undefined || collectionOf(query) !== undefined;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Solr parameters
// ---------------------------------------------------------------------------

/** Builds the Solr `q` parameter. Returns '*:*' when the query has no criterion. */
export function buildSolrQuery(query: HalQueryInput): string {
  if (typeof query === 'string') return query.trim() || MATCH_ALL;
  if (!query || typeof query !== 'object') return MATCH_ALL;

  // Field criteria are atomic; free text and raw Solr need parentheses once AND-ed.
  const atoms: string[] = [];
  const groups: string[] = [];

  const idHal = trimmed(query.idHal);
  if (idHal) atoms.push(`authIdHal_s:${quote(idHal)}`);

  const orcid = normaliseOrcid(query.orcid);
  if (orcid) atoms.push(`authORCIDIdExt_s:${quote(orcid)}`);

  const structId = normaliseStructId(query.structId);
  if (structId) atoms.push(`structId_i:${structId}`);

  const text = buildTextQuery(trimmed(query.text));
  if (text) groups.push(text);

  const solr = trimmed(query.solr);
  if (solr) groups.push(solr);

  // Validated here too so that an invalid collection fails as early as possible.
  collectionOf(query);

  const total = atoms.length + groups.length;
  if (total === 0) return MATCH_ALL;
  if (total === 1) return atoms[0] ?? groups[0];
  return [...atoms, ...groups.map(g => `(${g})`)].join(' AND ');
}

/** Builds the Solr `fq` parameters (one entry per active filter). */
export function buildFilterQueries(filters?: HalFilters): string[] {
  if (!filters) return [];
  const fq: string[] = [];

  if (Array.isArray(filters.docTypes)) {
    const codes = [
      ...new Set(
        filters.docTypes
          .map(code => trimmed(code).toUpperCase())
          .filter(code => DOC_TYPE_RE.test(code)),
      ),
    ];
    if (codes.length > 0) fq.push(`docType_s:(${codes.join(' OR ')})`);
  }

  const from = Number.isInteger(filters.yearFrom) ? filters.yearFrom : undefined;
  const to = Number.isInteger(filters.yearTo) ? filters.yearTo : undefined;
  if (from !== undefined || to !== undefined) {
    fq.push(`producedDateY_i:[${from ?? '*'} TO ${to ?? '*'}]`);
  }

  if (filters.openAccess === true) fq.push('openAccess_bool:true');

  return fq;
}

/**
 * Maps a SortOrder to the Solr `sort` parameter (undefined = relevance).
 * Date sorts add `docid` as a tie-breaker so that pagination is deterministic.
 */
export function resolveSort(sort?: SortOrder): string | undefined {
  switch (sort) {
    case 'date-desc':
      return 'producedDate_tdate desc,docid desc';
    case 'date-asc':
      return 'producedDate_tdate asc,docid asc';
    default:
      return undefined;
  }
}

function nonNegativeInt(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

/** Builds the full HAL API search URL (handles the /search/{collection}/ endpoint). */
export function buildHalUrl(params: Omit<FetchParams, 'signal'>): string {
  const rawBase = trimmed(params.apiBase) || HAL_API_BASE;
  const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
  const collection = collectionOf(params.query);

  const search = new URLSearchParams();
  search.set('q', buildSolrQuery(params.query));
  for (const fq of buildFilterQueries(params.filters)) search.append('fq', fq);
  search.set('fl', resolveFields(params.lvl, params.locale));
  const sort = resolveSort(params.sort ?? 'date-desc');
  if (sort) search.set('sort', sort);
  search.set('rows', String(nonNegativeInt(params.rows, 10)));
  search.set('start', String(nonNegativeInt(params.start, 0)));
  search.set('wt', 'json');

  return `${base}${collection ? `${collection}/` : ''}?${search.toString()}`;
}

/**
 * Best-effort link to the same list on the HAL website (CV page, collection or search page).
 * With active `filters`, always the search page (scoped to the collection when there is one) with the
 * filter clauses of buildFilterQueries AND-ed into `q`: the page lists what the widget counts.
 */
export function buildHalWebUrl(query: HalQueryInput, filters?: HalFilters): string {
  const collection = collectionOf(query);
  const fq = buildFilterQueries(filters);

  if (fq.length === 0 && query && typeof query === 'object') {
    const idHal = trimmed(query.idHal);
    const others = [query.orcid, query.structId, query.text, query.solr].filter(
      value => value !== undefined && value !== null && String(value).trim() !== '',
    );
    // The CV / collection pages only match when they are the sole criterion.
    if (others.length === 0 && idHal && !collection) {
      return `${HAL_CV_BASE}${encodeURIComponent(idHal)}`;
    }
    if (others.length === 0 && !idHal && collection) return `${HAL_WEB_BASE}${collection}`;
  }

  // The web search page has no fq: `(q) AND fq1 AND fq2` is equivalent (same numFound on the API).
  const solr = buildSolrQuery(query);
  const clauses = solr === MATCH_ALL && fq.length > 0 ? fq : fq.length > 0 ? [`(${solr})`, ...fq] : [solr];
  const q = new URLSearchParams({ q: clauses.join(' AND ') });
  return `${HAL_WEB_BASE}${collection ? `${collection}/` : ''}search/index/?${q.toString()}`;
}
