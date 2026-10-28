import type {
  DetailLevel,
  GroupBy,
  HalFilters,
  HalQuery,
  OutputFormat,
  SortOrder,
  ThemeName,
  UrlState,
} from './types';
import { isSafeColor } from './theme';
import { escapeSolrValue, normaliseOrcid } from './query';
import { matchLocale } from './locales';

export interface ParseLimits {
  /** Upper bound for `rows`. Default: 50 */
  maxRows?: number;
}

/** Default upper bound for `rows` */
export const DEFAULT_MAX_ROWS = 50;

/** Maximum length of the `title` param (longer titles are truncated) */
export const MAX_TITLE_LENGTH = 80;

/** Longest accepted free-text / raw Solr query (longer values are dropped) */
const MAX_QUERY_LENGTH = 1000;

/** Longest accepted highlighted author entry, and max number of entries */
const MAX_HIGHLIGHT_LENGTH = 100;
const MAX_HIGHLIGHTS = 20;

const ID_HAL_RE = /^[A-Za-z0-9._-]{1,100}$/;
const ORCID_RE = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;
const STRUCT_ID_RE = /^\d{1,15}$/;
const COLLECTION_RE = /^[A-Za-z0-9_-]{1,100}$/;
/** Same alphabet as buildFilterQueries (src/query.ts), bounded in length. */
const DOC_TYPE_RE = /^[A-Z0-9_]{1,30}$/;
const YEAR_RE = /^\d{4}$/;
const INT_RE = /^\d{1,9}$/;

const SORTS: readonly SortOrder[] = ['date-desc', 'date-asc', 'relevance'];
const THEMES: readonly ThemeName[] = ['light', 'dark', 'auto'];
const OUTPUTS: readonly OutputFormat[] = ['html', 'svg'];
const GROUP_BYS: readonly GroupBy[] = ['none', 'year', 'docType'];

/** Defaults omitted by toUrlParams (see DisplayOptions / UrlState). */
const DEFAULTS = {
  sort: 'date-desc',
  lvl: 1,
  page: 1,
  output: 'html',
  theme: 'light',
  groupBy: 'none',
  maxAuthors: 10,
  showCredit: true,
} as const;

// ---------------------------------------------------------------------------
// Value parsers (undefined = invalid or absent → dropped)
// ---------------------------------------------------------------------------

function str(params: URLSearchParams, name: string): string | undefined {
  const value = params.get(name);
  if (value === null) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function matching(value: string | undefined, re: RegExp): string | undefined {
  return value !== undefined && re.test(value) ? value : undefined;
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return value !== undefined && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

function int(value: string | undefined, min: number, max = Number.MAX_SAFE_INTEGER): number | undefined {
  if (value === undefined || !INT_RE.test(value)) return undefined;
  const n = Number(value);
  return n >= min && n <= max ? n : undefined;
}

function bool(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const v = value.toLowerCase();
  if (v === '1' || v === 'true') return true;
  if (v === '0' || v === 'false') return false;
  return undefined;
}

function list(value: string | undefined): string[] {
  return value === undefined
    ? []
    : value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
}

function color(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  try {
    return isSafeColor(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Free text without control characters, dropped when empty or too long. */
function freeText(value: string | undefined, maxLength: number): string | undefined {
  if (value === undefined) return undefined;
  const clean = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  return clean && clean.length <= maxLength ? clean : undefined;
}

/** Truncates to `max` code points (never splits a surrogate pair). */
function truncate(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length > max ? chars.slice(0, max).join('').trimEnd() : value;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function parseQuery(params: URLSearchParams): HalQuery {
  const query: HalQuery = {};
  const idHal = matching(str(params, 'idHal'), ID_HAL_RE);
  if (idHal) query.idHal = idHal;
  // The URL form (https://orcid.org/0000-...) is accepted like in the JS API.
  const orcid = matching(normaliseOrcid(str(params, 'orcid')), ORCID_RE);
  if (orcid) query.orcid = orcid;
  const structId = matching(str(params, 'structId'), STRUCT_ID_RE);
  if (structId) query.structId = Number(structId);
  const collection = matching(str(params, 'collection'), COLLECTION_RE);
  if (collection) query.collection = collection;
  const text = freeText(str(params, 'search'), MAX_QUERY_LENGTH);
  if (text) query.text = text;
  const solr = freeText(str(params, 'q'), MAX_QUERY_LENGTH) ?? legacyUid(str(params, 'uid'));
  if (solr) query.solr = solr;
  return query;
}

/**
 * `uid` is the ≤0.4 name of the raw query. 0.4 always sent it as a quoted phrase: plain text keeps that
 * meaning (`uid=Jey Puget Gil` → `"Jey Puget Gil"`), field queries such as `authIdHal_s:x` are passed raw
 * (quoting them made 0.4 return no result).
 */
function legacyUid(value: string | undefined): string | undefined {
  const uid = freeText(value, MAX_QUERY_LENGTH);
  if (!uid) return undefined;
  return /[:"]/.test(uid) ? uid : `"${escapeSolrValue(uid)}"`;
}

function parseFilters(params: URLSearchParams): HalFilters {
  const filters: HalFilters = {};
  const docTypes = [
    ...new Set(
      list(str(params, 'docTypes'))
        .map(code => code.toUpperCase())
        .filter(code => DOC_TYPE_RE.test(code)),
    ),
  ];
  if (docTypes.length > 0) filters.docTypes = docTypes;
  const yearFrom = matching(str(params, 'yearFrom'), YEAR_RE);
  if (yearFrom) filters.yearFrom = Number(yearFrom);
  const yearTo = matching(str(params, 'yearTo'), YEAR_RE);
  if (yearTo) filters.yearTo = Number(yearTo);
  if (bool(str(params, 'oa')) === true) filters.openAccess = true;
  return filters;
}

/** Parses the public URL scheme, including legacy params (uid, type). Invalid values are dropped. */
export function parseUrlParams(params: URLSearchParams, limits?: ParseLimits): UrlState {
  const maxRows =
    limits?.maxRows !== undefined && Number.isFinite(limits.maxRows) && limits.maxRows >= 1
      ? Math.floor(limits.maxRows)
      : DEFAULT_MAX_ROWS;

  const state: UrlState = { query: parseQuery(params), filters: parseFilters(params) };

  const sort = oneOf(str(params, 'sort'), SORTS);
  if (sort) state.sort = sort;

  const lvl = int(str(params, 'lvl'), 0, 3);
  if (lvl !== undefined) state.lvl = lvl as DetailLevel;

  const rows = int(str(params, 'rows'), 1);
  if (rows !== undefined) state.rows = Math.min(rows, maxRows);

  const page = int(str(params, 'page'), 1);
  if (page !== undefined) state.page = page;

  // `type` is the ≤0.4 name of `output`.
  const output = oneOf(str(params, 'output'), OUTPUTS) ?? oneOf(str(params, 'type'), OUTPUTS);
  if (output) state.output = output;

  const theme = oneOf(str(params, 'theme'), THEMES);
  if (theme) state.theme = theme;

  const backgroundColor = color(str(params, 'bg'));
  if (backgroundColor) state.backgroundColor = backgroundColor;
  const textColor = color(str(params, 'text'));
  if (textColor) state.textColor = textColor;
  const mainColor = color(str(params, 'main'));
  if (mainColor) state.mainColor = mainColor;

  const groupBy = oneOf(str(params, 'groupBy'), GROUP_BYS);
  if (groupBy) state.groupBy = groupBy;

  const highlight = list(str(params, 'highlight'))
    .filter(name => name.length <= MAX_HIGHLIGHT_LENGTH)
    .slice(0, MAX_HIGHLIGHTS);
  if (highlight.length > 0) state.highlightAuthors = highlight;

  const maxAuthors = int(str(params, 'maxAuthors'), 0);
  if (maxAuthors !== undefined) state.maxAuthors = maxAuthors;

  const title = freeText(str(params, 'title'), Infinity);
  if (title) state.title = truncate(title, MAX_TITLE_LENGTH);

  const credit = bool(str(params, 'credit'));
  if (credit !== undefined) state.showCredit = credit;

  // Built-in languages only ('fr-FR' → 'fr'); others are dropped, i.e. English.
  const locale = matchLocale(str(params, 'lang'));
  if (locale) state.locale = locale;

  return state;
}

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

function setString(params: URLSearchParams, name: string, value: unknown): void {
  if (value === undefined || value === null) return;
  const s = String(value).trim();
  if (s !== '') params.set(name, s);
}

function setNumber(params: URLSearchParams, name: string, value: unknown, defaultValue?: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value === defaultValue) return;
  params.set(name, String(value));
}

function setList(params: URLSearchParams, name: string, values: unknown): void {
  if (!Array.isArray(values)) return;
  const items = values.map(v => String(v).trim()).filter(Boolean);
  if (items.length > 0) params.set(name, items.join(','));
}

/**
 * Serialises a state to the public URL scheme (omits defaults and empty values).
 * `lang` is the exception: it is written whenever `locale` is a built-in language, English included, so
 * an explicit choice survives (`<hal-search lang="en">` also tells assistive technologies the widget is in
 * English on a page in another language). Without `locale`, no `lang`; unsupported languages are dropped.
 */
export function toUrlParams(state: Partial<UrlState>): URLSearchParams {
  const params = new URLSearchParams();
  const query = state.query ?? {};
  const filters = state.filters ?? {};

  setString(params, 'idHal', query.idHal);
  // Canonical form (no orcid.org prefix): shorter README URLs that parseUrlParams reads back.
  setString(params, 'orcid', typeof query.orcid === 'string' ? normaliseOrcid(query.orcid) : query.orcid);
  setString(params, 'structId', query.structId);
  setString(params, 'collection', query.collection);
  setString(params, 'search', query.text);
  setString(params, 'q', query.solr);

  setList(params, 'docTypes', filters.docTypes);
  setNumber(params, 'yearFrom', filters.yearFrom);
  setNumber(params, 'yearTo', filters.yearTo);
  if (filters.openAccess === true) params.set('oa', '1');

  if (state.sort !== DEFAULTS.sort) setString(params, 'sort', state.sort);
  setNumber(params, 'lvl', state.lvl, DEFAULTS.lvl);
  setNumber(params, 'rows', state.rows);
  setNumber(params, 'page', state.page, DEFAULTS.page);
  if (state.output !== DEFAULTS.output) setString(params, 'output', state.output);
  if (state.theme !== DEFAULTS.theme) setString(params, 'theme', state.theme);
  setString(params, 'bg', state.backgroundColor);
  setString(params, 'text', state.textColor);
  setString(params, 'main', state.mainColor);
  if (state.groupBy !== DEFAULTS.groupBy) setString(params, 'groupBy', state.groupBy);
  setList(params, 'highlight', state.highlightAuthors);
  setNumber(params, 'maxAuthors', state.maxAuthors, DEFAULTS.maxAuthors);
  setString(params, 'title', state.title);
  if (state.showCredit === false) params.set('credit', '0');
  const locale = matchLocale(state.locale);
  if (locale) params.set('lang', locale);

  return params;
}
