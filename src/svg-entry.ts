// Entry of the `hal-search/svg` subpath (dist/hal-search-svg.es.js, dist/hal-search-svg.cjs): the DOM-free part
// of the API — query building, HAL API, URL scheme, SVG rendering, headless fetchSvg, palettes, labels, links,
// doc types and embed snippets — for Node, edge runtimes and SSR (the SVG service imports it).
// It never imports the HTML widget, its stylesheet or the web component (HalSearch.ts, renderer.ts, styles.ts,
// element.ts), so it stays small without a bundler. Every export is also exported by the main entry (src/index.ts),
// as the same binding: test/svg-entry.test.ts keeps both lists in sync.

export { fetchArticles, isAbortError, DEFAULT_BASE } from './api';
export {
  buildHalUrl,
  buildHalWebUrl,
  buildSolrQuery,
  hasQueryCriterion,
  buildFilterQueries,
  resolveSort,
  escapeSolrValue,
} from './query';
export { parseUrlParams, toUrlParams } from './url-params';
export { getDocLinks } from './links';
export { DOC_TYPE_LABELS, docTypeLabel } from './doctypes';
export { LEVEL_FIELDS, LEVEL_NAMES, resolveFields, normalizeDomains } from './levels';
export { DEFAULT_LABELS, resolveLabels, formatLabel } from './labels';
export { LIGHT_PALETTE, DARK_PALETTE, isSafeColor, resolvePalette, paletteToCssVars } from './theme';
export { renderSvg, renderErrorSvg } from './svg';
export { fetchSvg } from './headless';
export {
  buildEmbedUrl,
  buildEmbedSnippet,
  buildSvgUrl,
  buildMarkdownSnippet,
  buildWebComponentSnippet,
} from './embed';
export type {
  HalSearchOptions,
  HalDoc,
  HalApiResponse,
  HalResponseBody,
  HalResponseHeader,
  HalQuery,
  HalQueryInput,
  HalFilters,
  SortOrder,
  GroupBy,
  ThemeName,
  OutputFormat,
  ColorOptions,
  DisplayOptions,
  Labels,
  DetailLevel,
  LevelName,
  SearchParams,
  FetchParams,
  SvgRenderOptions,
  PaginationState,
  UrlState,
} from './types';
export type { Palette } from './theme';
export type { DocLinks } from './links';
export type { ParseLimits } from './url-params';
export type { FetchSvgOptions } from './headless';
export type { EmbedOptions, MarkdownSnippetOptions } from './embed';
