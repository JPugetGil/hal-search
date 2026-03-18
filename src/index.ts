export { HalSearch } from './HalSearch';
export { buildUrl, fetchArticles, DEFAULT_BASE } from './api';
export { LEVEL_FIELDS, LEVEL_NAMES, resolveFields } from './levels';
export { DEFAULT_CSS, injectDefaultStyles } from './styles';
export { buildEmbedUrl, buildEmbedSnippet } from './embed';
export type {
  HalSearchOptions,
  HalDoc,
  HalApiResponse,
  HalResponseBody,
  HalResponseHeader,
  DetailLevel,
  LevelName,
  SearchParams,
  PaginationState,
} from './types';
export type { EmbedOptions } from './embed';
