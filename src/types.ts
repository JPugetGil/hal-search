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
  publicationDate_s?: string;
  docType_s?: string;
  openAccess_bool?: boolean;
  keyword_s?: string[];
  domain_s?: string[];
  language_s?: string[];
  peerReviewing_s?: string;
  conferenceTitle_s?: string;
  version_i?: number;
  structName_s?: string[];
  submittedDate_s?: string;
  modifiedDate_s?: string;
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

/** Options passed to the HalSearch constructor */
export interface HalSearchOptions {
  /** DOM element or CSS selector for the render target */
  container: HTMLElement | string;
  /** HAL API base URL — override for proxies/testing. Default: HAL production */
  apiBase?: string;
  /** Level of detail: 0=minimal, 1=basic, 2=detailed, 3=full. Default: 1 */
  lvl?: DetailLevel;
  /** Number of results per page. Default: 10 */
  rows?: number;
  /** Inject default CSS into <head>. Default: true */
  injectStyles?: boolean;
  /** Render the article list as HTML cards or as an inline SVG. Default: 'html' */
  output?: 'html' | 'svg';
  /** Called after each successful fetch */
  onResults?: (response: HalApiResponse) => void;
  /** Called on fetch error */
  onError?: (err: Error) => void;
}

/** Parameters for a new search */
export interface SearchParams {
  uid: string;
  rows?: number;
  start?: number;
}

/** Internal pagination state */
export interface PaginationState {
  currentPage: number;
  totalFound: number;
  rows: number;
  start: number;
}
