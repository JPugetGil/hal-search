/** Numeric detail level: 0=minimal, 1=basic, 2=detailed, 3=full */
export type DetailLevel = 0 | 1 | 2 | 3;

export type LevelName = 'minimal' | 'basic' | 'detailed' | 'full';

/** Raw document returned by the HAL API. All fields are optional because
 *  the `fl` parameter controls which ones are actually returned. */
export interface HalDoc {
  docid?: string;
  halId_s?: string;
  uri_s?: string;
  label_s?: string;
  title_s?: string[];
  authFullName_s?: string[];
  authIdHal_s?: string[];
  /** "{idHal}_FacetSep_{Full Name}" for authors that have an idHal (not aligned with authFullName_s) */
  authIdHalFullName_fs?: string[];
  publicationDate_s?: string;
  producedDate_tdate?: string;
  producedDateY_i?: number;
  docType_s?: string;
  openAccess_bool?: boolean;
  keyword_s?: string[];
  domain_s?: string[];
  en_domainAllCodeLabel_fs?: string[];
  language_s?: string[];
  peerReviewing_s?: string;
  conferenceTitle_s?: string;
  journalTitle_s?: string;
  abstract_s?: string[];
  doiId_s?: string;
  fileMain_s?: string;
  /** Full citation as returned by HAL. Contains HTML markup: never inject it as-is. */
  citationFull_s?: string;
  [key: string]: unknown;
}

export interface HalResponseHeader {
  status: number;
  QTime: number;
  params?: Record<string, string>;
}

export interface HalResponseBody {
  numFound: number;
  start: number;
  numFoundExact?: boolean;
  maxScore?: number;
  docs: HalDoc[];
}

export interface HalApiResponse {
  responseHeader: HalResponseHeader;
  response: HalResponseBody;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/** Structured HAL query. Every provided criterion is combined with AND. */
export interface HalQuery {
  /** HAL author identifier (authIdHal_s), e.g. 'jdupont' */
  idHal?: string;
  /** ORCID iD (authORCIDIdExt_s), e.g. '0000-0002-1825-0097' */
  orcid?: string;
  /** HAL structure id of a lab or team (structId_i) */
  structId?: number | string;
  /** HAL collection code, e.g. 'LIRIS'. Uses the /search/{collection}/ endpoint. */
  collection?: string;
  /** Free-text search */
  text?: string;
  /** Raw Solr query, AND-ed as-is with the other criteria (advanced use) */
  solr?: string;
}

/** A structured query, or a raw Solr query string such as 'authIdHal_s:jdupont'. */
export type HalQueryInput = HalQuery | string;

export interface HalFilters {
  /** HAL docType_s codes, e.g. ['ART', 'COMM'] */
  docTypes?: string[];
  /** Inclusive lower bound on the production year (producedDateY_i) */
  yearFrom?: number;
  /** Inclusive upper bound on the production year (producedDateY_i) */
  yearTo?: number;
  /** Keep only open-access documents */
  openAccess?: boolean;
}

export type SortOrder = 'date-desc' | 'date-asc' | 'relevance';

export type GroupBy = 'none' | 'year' | 'docType';

/** 'auto' follows prefers-color-scheme (HTML via CSS, SVG via an embedded media query). */
export type ThemeName = 'light' | 'dark' | 'auto';

export type OutputFormat = 'html' | 'svg';

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

export interface ColorOptions {
  /** Article card background. Invalid CSS colors are ignored. */
  backgroundColor?: string;
  /** Main text color. Muted text is derived from it. */
  textColor?: string;
  /** Accent color: links, buttons, SVG header bar. Hover color is derived from it. */
  mainColor?: string;
}

/** User-facing strings. Templates use `{name}` placeholders. Default: English. */
export interface Labels {
  /** 'Loading…' */
  loading: string;
  /** 'No results found.' */
  empty: string;
  /** 'Error: {message}' */
  error: string;
  /** 'Previous' */
  previous: string;
  /** 'Next' */
  next: string;
  /** 'Page {page} of {pages}' */
  pageInfo: string;
  /** '{count} results' — count is already locale-formatted */
  resultCount: string;
  /** Singular form of resultCount: '{count} result' */
  resultCountOne: string;
  /** aria-label of the pagination nav: 'Search results pages' */
  pagination: string;
  /** 'Open Access' */
  openAccess: string;
  /** 'Abstract' */
  abstract: string;
  /** 'Show more' */
  showMore: string;
  /** 'Show less' */
  showLess: string;
  /** 'Untitled' */
  untitled: string;
  /** 'et al.' */
  etAl: string;
  /** 'PDF' */
  pdf: string;
  /** 'DOI' */
  doi: string;
  /** 'BibTeX' */
  bibtex: string;
  /** 'Copy citation' */
  copyCitation: string;
  /** 'Copied!' */
  copied: string;
  /** 'View all {count} publications on HAL' */
  viewOnHal: string;
  /** Singular form of viewOnHal: 'View this publication on HAL' */
  viewOnHalOne: string;
  /** Default SVG header title: 'Publications' */
  title: string;
  /** Screen-reader hint appended to external links: '(opens in a new tab)' */
  opensInNewTab: string;
  /** Group heading for documents without a year: 'Undated' */
  undated: string;
  /** Human-readable labels for HAL docType_s codes, e.g. { ART: 'Journal article' } */
  docTypes: Record<string, string>;
}

/** Presentation options shared by HTML, SVG, the web component and the SSR. */
export interface DisplayOptions extends ColorOptions {
  /** Level of detail. Default: 1 */
  lvl?: DetailLevel;
  /** Default: 'light' */
  theme?: ThemeName;
  /** Default: 'none' */
  groupBy?: GroupBy;
  /** Author full names or idHal values to emphasise (names compared case- and accent-insensitively) */
  highlightAuthors?: string[];
  /** Max authors shown before "et al.". Default: 10. 0 = no limit */
  maxAuthors?: number;
  /** Override any user-facing string */
  labels?: Partial<Labels>;
  /** Show the "hal-search" credit link. Default: true */
  showCredit?: boolean;
}

/** Parameters for a new search */
export interface SearchParams {
  query: HalQueryInput;
  filters?: HalFilters;
  sort?: SortOrder;
  rows?: number;
  /** 1-based page. Default: 1 */
  page?: number;
  lvl?: DetailLevel;
}

/** Options passed to the HalSearch constructor */
export interface HalSearchOptions extends DisplayOptions {
  /** DOM element or CSS selector for the render target */
  container: HTMLElement | string;
  /** HAL API base URL — override for proxies/testing. Default: HAL production */
  apiBase?: string;
  /** Number of results per page. Default: 10 */
  rows?: number;
  /** Default: 'date-desc' */
  sort?: SortOrder;
  /** Default filters, merged under the filters given to search() */
  filters?: HalFilters;
  /** Render the article list as HTML cards or as an inline SVG. Default: 'html' */
  output?: OutputFormat;
  /** Inject default CSS. Default: true */
  injectStyles?: boolean;
  /** Where default CSS is injected. Default: document (head). The web component passes its ShadowRoot. */
  styleRoot?: Document | ShadowRoot;
  /** Heading level of article titles in HTML output. Default: 3 */
  headingLevel?: 2 | 3 | 4 | 5 | 6;
  /** SVG header title (output 'svg'). Default: labels.title */
  title?: string;
  /** Called after each successful fetch. Exceptions thrown here never replace the rendered results. */
  onResults?: (response: HalApiResponse) => void;
  /** Called on fetch error (aborted requests are not errors) */
  onError?: (err: Error) => void;
}

/** Parameters of a single HAL API request */
export interface FetchParams {
  query: HalQueryInput;
  filters?: HalFilters;
  sort?: SortOrder;
  lvl: DetailLevel;
  rows: number;
  start: number;
  apiBase?: string;
  signal?: AbortSignal;
}

/** Options for the DOM-free SVG renderer */
export interface SvgRenderOptions extends DisplayOptions {
  /** Total number of matching documents (header / footer) */
  totalFound: number;
  /** Header title. Default: labels.title */
  title?: string;
  /** URL of the full list on HAL, shown in the footer text when known */
  halUrl?: string;
  /** Intrinsic width in px (the SVG scales via viewBox). Default: 800 */
  width?: number;
}

/** Internal pagination state */
export interface PaginationState {
  currentPage: number;
  totalFound: number;
  rows: number;
  start: number;
}

/**
 * Everything the public URL scheme (embed page, SSR SVG endpoint, web component
 * attributes) can express. See url-params.ts for the parameter names.
 */
export interface UrlState extends DisplayOptions {
  query: HalQuery;
  filters: HalFilters;
  sort?: SortOrder;
  rows?: number;
  page?: number;
  output?: OutputFormat;
  /** SVG header title */
  title?: string;
}
