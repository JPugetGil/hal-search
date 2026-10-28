import type {
  ColorOptions,
  DetailLevel,
  GroupBy,
  HalApiResponse,
  HalFilters,
  HalQueryInput,
  HalSearchOptions,
  Labels,
  OutputFormat,
  PaginationState,
  SearchParams,
  SortOrder,
  ThemeName,
} from './types';
import type { Palette } from './theme';
import { fetchArticles } from './api';
import { buildHalWebUrl, buildSolrQuery, hasQueryCriterion } from './query';
import { resolveLabels } from './labels';
import { isSafeColor, paletteToCssVars, resolvePalette } from './theme';
import { renderError, renderLoading, renderMissingQuery, renderResults } from './renderer';
import { renderSvg } from './svg';
import { injectDefaultStyles } from './styles';

// ---------------------------------------------------------------------------
// Types and defaults
// ---------------------------------------------------------------------------

/** Read-only snapshot of a HalSearch instance, see `HalSearch.state`. */
export interface HalSearchState {
  /** Query of the current search (undefined before the first search()) */
  readonly query: HalQueryInput | undefined;
  /** Effective filters: the filters given to search() merged over the default filters */
  readonly filters: HalFilters;
  readonly sort: SortOrder;
  readonly lvl: DetailLevel;
  /** Current 1-based page */
  readonly page: number;
  /** Number of matching documents reported by the last response (0 until it arrives) */
  readonly totalFound: number;
}

/**
 * Default values of the HalSearch options.
 * @internal Shared with the web component, not part of the public API.
 */
export const HAL_SEARCH_DEFAULTS = {
  lvl: 1 as DetailLevel,
  rows: 10,
  sort: 'date-desc' as SortOrder,
  theme: 'light' as ThemeName,
  output: 'html' as OutputFormat,
  groupBy: 'none' as GroupBy,
  maxAuthors: 10,
  headingLevel: 3 as 2 | 3 | 4 | 5 | 6,
};

const COLOR_KEYS = ['backgroundColor', 'textColor', 'mainColor'] as const;

/** Palette entries set (directly or by derivation) by each color override, see Palette JSDoc. */
const OVERRIDE_TARGETS: Record<(typeof COLOR_KEYS)[number], (keyof Palette)[]> = {
  backgroundColor: ['cardBg'],
  textColor: ['text', 'muted'],
  mainColor: ['accent', 'accentHover', 'accentText'],
};

/** Attribute naming the `<style>` that holds the 'auto' color overrides of an instance. */
const COLORS_STYLE_ATTRIBUTE = 'data-hal-search-colors';

/** Instances created by this copy of the library (the scope id also has a random part: several copies may share a page). */
let instanceCount = 0;

// ---------------------------------------------------------------------------
// HalSearch
// ---------------------------------------------------------------------------

/**
 * Renders HAL publications into a DOM container (HTML cards or inline SVG).
 *
 * Every request aborts the previous one; responses of superseded requests are ignored.
 * For a DOM-free SVG string (Node, edge runtimes) use `fetchSvg()` instead.
 */
export class HalSearch {
  private readonly container: HTMLElement;
  private readonly output: OutputFormat;
  private readonly labels: Labels;
  private readonly labelOverrides?: Partial<Labels>;
  private readonly apiBase?: string;
  private readonly defaultFilters: HalFilters;
  private readonly defaultSort: SortOrder;
  private readonly headingLevel: 2 | 3 | 4 | 5 | 6;
  private readonly groupBy: GroupBy;
  private readonly maxAuthors: number;
  private readonly highlightAuthors: string[];
  private readonly showCredit: boolean;
  private readonly title?: string;
  private readonly onResults?: (response: HalApiResponse) => void;
  private readonly onError?: (err: Error) => void;
  private readonly addedClass: boolean;
  /** Document or ShadowRoot receiving the stylesheets */
  private readonly styleRoot: Document | ShadowRoot;
  /** Value of `data-hal-id`: scopes the 'auto' color overrides stylesheet to this container */
  private readonly instanceId: string;

  private query: HalQueryInput | undefined;
  private filters: HalFilters;
  private sort: SortOrder;
  private lvl: DetailLevel;
  private rows: number;
  private theme: ThemeName;
  private colors: ColorOptions;
  private pagination: PaginationState;
  /** True once a response arrived for the current query (enables page clamping) */
  private totalKnown = false;
  /** Response currently rendered in the container (undefined while loading or on error) */
  private displayed: HalApiResponse | undefined;
  private controller: AbortController | undefined;
  /** Incremented by every request and by destroy(): stale responses are ignored */
  private token = 0;
  private destroyed = false;
  /** Inline custom properties set for the 'light' and 'dark' themes */
  private appliedVars: string[] = [];
  /** Scoped `<style>` of the color overrides for the 'auto' theme (light and dark sets) */
  private colorsStyle: HTMLStyleElement | undefined;

  constructor(options: HalSearchOptions) {
    if (!options || !options.container) {
      throw new Error('HalSearch: `container` is required (use fetchSvg() for a headless SVG)');
    }
    this.container = resolveContainer(options.container);
    this.output = options.output === 'svg' ? 'svg' : HAL_SEARCH_DEFAULTS.output;
    this.labelOverrides = options.labels;
    this.labels = resolveLabels(options.labels);
    this.apiBase = options.apiBase;
    this.defaultFilters = mergeFilters({}, options.filters);
    this.defaultSort = options.sort ?? HAL_SEARCH_DEFAULTS.sort;
    this.headingLevel = options.headingLevel ?? HAL_SEARCH_DEFAULTS.headingLevel;
    this.groupBy = options.groupBy ?? HAL_SEARCH_DEFAULTS.groupBy;
    this.maxAuthors = options.maxAuthors ?? HAL_SEARCH_DEFAULTS.maxAuthors;
    this.highlightAuthors = options.highlightAuthors ? [...options.highlightAuthors] : [];
    this.showCredit = options.showCredit ?? true;
    this.title = options.title;
    this.onResults = options.onResults;
    this.onError = options.onError;

    this.filters = { ...this.defaultFilters };
    this.sort = this.defaultSort;
    this.lvl = options.lvl ?? HAL_SEARCH_DEFAULTS.lvl;
    this.rows = toRows(options.rows) ?? HAL_SEARCH_DEFAULTS.rows;
    this.theme = options.theme ?? HAL_SEARCH_DEFAULTS.theme;
    this.colors = pickColors(options);
    this.pagination = { currentPage: 1, totalFound: 0, rows: this.rows, start: 0 };

    this.styleRoot = options.styleRoot ?? defaultStyleRoot(this.container);
    this.instanceId = `${(++instanceCount).toString(36)}${Math.random().toString(36).slice(2, 8)}`;

    this.addedClass = !this.container.classList.contains('hal-search');
    this.container.classList.add('hal-search');
    this._applyAppearance();

    if (options.injectStyles !== false) {
      injectDefaultStyles(this.styleRoot);
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Read-only snapshot of the current search (a fresh copy on every access). */
  get state(): HalSearchState {
    const query = this.query;
    return Object.freeze({
      query: query && typeof query === 'object' ? { ...query } : query,
      filters: cloneFilters(this.filters),
      sort: this.sort,
      lvl: this.lvl,
      page: this.pagination.currentPage,
      totalFound: this.pagination.totalFound,
    });
  }

  /**
   * Starts a new search with a single request.
   * `filters` are merged over the default filters and `sort` falls back to the default sort;
   * `lvl` and `rows`, when given, are kept for the following requests (like setLevel()).
   *
   * A query without any criterion (`{}`, `{ idHal: '' }`, `{ text: '***' }`, `''`: see `hasQueryCriterion`)
   * would list the whole HAL archive, so no request is sent: any request in flight is aborted, the container
   * shows `labels.missingQuery`, neither `onResults` nor `onError` is called and the promise resolves
   * `undefined` (the same applies to the page and level methods). A raw Solr string such as `'*:*'` is
   * explicit and is sent.
   *
   * Resolves with the response, or `undefined` when the request failed, was superseded or aborted,
   * or when the query has no criterion.
   */
  search(params: SearchParams): Promise<HalApiResponse | undefined> {
    if (this.destroyed) return Promise.resolve(undefined);
    // `?? {}`: a JS caller omitting the query gets the "no criterion" state, not a silent no-op.
    this.query = params.query ?? {};
    this.filters = mergeFilters(this.defaultFilters, params.filters);
    this.sort = params.sort ?? this.defaultSort;
    if (params.lvl !== undefined) this.lvl = params.lvl;
    const rows = toRows(params.rows);
    if (rows !== undefined) this.rows = rows;
    this.totalKnown = false;
    this.pagination = { ...this.pagination, totalFound: 0 };
    return this._request(toPage(params.page), false);
  }

  /** Loads a 1-based page of the current search (clamped to the known page count). */
  goToPage(page: number): Promise<HalApiResponse | undefined> {
    return this._goTo(page, false);
  }

  /** Loads the next page of the current search. */
  nextPage(): Promise<HalApiResponse | undefined> {
    return this._goTo(this.pagination.currentPage + 1, false);
  }

  /** Loads the previous page of the current search. */
  prevPage(): Promise<HalApiResponse | undefined> {
    return this._goTo(this.pagination.currentPage - 1, false);
  }

  /** Changes the detail level and re-fetches the current page (no request before the first search()). */
  setLevel(lvl: DetailLevel): Promise<HalApiResponse | undefined> {
    if (this.destroyed) return Promise.resolve(undefined);
    this.lvl = lvl;
    return this._request(this.pagination.currentPage, false);
  }

  /**
   * Updates the color overrides immediately, in HTML and SVG output (no request).
   * Only the given keys change; a key given as `undefined` removes that override.
   */
  setColors(colors: ColorOptions): void {
    if (this.destroyed) return;
    const next: ColorOptions = { ...this.colors };
    for (const key of COLOR_KEYS) {
      if (key in colors) next[key] = colors[key];
    }
    this.colors = next;
    this._applyAppearance();
    this._rerenderSvg();
  }

  /** Switches the theme immediately, in HTML and SVG output (no request). */
  setTheme(theme: ThemeName): void {
    if (this.destroyed) return;
    this.theme = theme;
    this._applyAppearance();
    this._rerenderSvg();
  }

  /** Aborts any in-flight request, clears the container and ignores late responses. Further calls are no-ops. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.token++;
    this.controller?.abort();
    this.controller = undefined;
    this.displayed = undefined;
    this.container.textContent = '';
    this.container.removeAttribute('aria-busy');
    for (const name of this.appliedVars) this.container.style.removeProperty(name);
    this.appliedVars = [];
    this._setColorsStyle({}, {});
    this.container.removeAttribute('data-hal-theme');
    if (this.addedClass) this.container.classList.remove('hal-search');
    if (this.container.classList.length === 0) this.container.removeAttribute('class');
  }

  // ---------------------------------------------------------------------------
  // Requests
  // ---------------------------------------------------------------------------

  private _goTo(page: number, focusResults: boolean): Promise<HalApiResponse | undefined> {
    if (this.destroyed || this.query === undefined) return Promise.resolve(undefined);
    let target = toPage(page);
    if (this.totalKnown) {
      const pages = Math.max(1, Math.ceil(this.pagination.totalFound / this.rows));
      target = Math.min(target, pages);
    }
    return this._request(target, focusResults);
  }

  /**
   * Fetches and renders a page. A page beyond the last one (e.g. `page` given to search() or a stale
   * URL) answers with no documents but a non-zero count: the last page is requested instead, once.
   */
  private async _request(page: number, focusResults: boolean, retryPastEnd = true): Promise<HalApiResponse | undefined> {
    const query = this.query;
    if (this.destroyed || query === undefined) return undefined;

    // Supersede the previous request: abort it and invalidate its token.
    this.controller?.abort();
    this.controller = undefined;
    const token = ++this.token;
    this.displayed = undefined;

    // Same rule as the element and the SSR: never request the whole archive (q=*:*) by accident.
    if (isMissingQuery(query)) {
      this.pagination = { currentPage: 1, totalFound: 0, rows: this.rows, start: 0 };
      renderMissingQuery(this.container, this.labels);
      return undefined;
    }

    const controller = new AbortController();
    this.controller = controller;
    const start = (page - 1) * this.rows;
    this.pagination = { currentPage: page, totalFound: this.pagination.totalFound, rows: this.rows, start };
    renderLoading(this.container, this.labels);

    let response: HalApiResponse;
    let lastPage: number | undefined;
    try {
      response = await fetchArticles({
        query,
        filters: this.filters,
        sort: this.sort,
        lvl: this.lvl,
        rows: this.rows,
        start,
        apiBase: this.apiBase,
        signal: controller.signal,
      });
      if (token !== this.token) return undefined;
      const totalFound = response.response?.numFound ?? 0;
      this.pagination = { ...this.pagination, totalFound };
      this.totalKnown = true;
      const pages = Math.max(1, Math.ceil(totalFound / this.rows));
      if (retryPastEnd && page > pages && totalFound > 0 && (response.response?.docs ?? []).length === 0) {
        lastPage = pages;
      } else {
        this.displayed = response;
        this._render(focusResults);
      }
    } catch (err) {
      // Superseded, destroyed or aborted: not an error, nothing to render.
      if (token !== this.token || controller.signal.aborted) return undefined;
      this.controller = undefined;
      const error = err instanceof Error ? err : new Error(String(err));
      this.displayed = undefined;
      renderError(this.container, error, this.labels);
      // Called outside the try block: a throwing callback cannot replace the rendered state.
      notify(this.onError, error, 'onError');
      return undefined;
    }
    this.controller = undefined;
    if (lastPage !== undefined) return this._request(lastPage, focusResults, false);
    notify(this.onResults, response, 'onResults');
    return response;
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  /** Renders the displayed response (HTML cards or inline SVG). */
  private _render(focusResults: boolean): void {
    const response = this.displayed;
    if (!response || this.query === undefined) return;
    const docs = response.response?.docs ?? [];

    if (this.output === 'svg') {
      // renderSvg returns trusted markup: every dynamic value is XML-escaped by the renderer.
      this.container.innerHTML = renderSvg(docs, {
        lvl: this.lvl,
        theme: this.theme,
        groupBy: this.groupBy,
        highlightAuthors: this.highlightAuthors,
        maxAuthors: this.maxAuthors,
        labels: this.labelOverrides,
        showCredit: this.showCredit,
        ...this.colors,
        totalFound: this.pagination.totalFound,
        title: this.title,
        // Same filters as the count shown next to the link.
        halUrl: buildHalWebUrl(this.query, this.filters),
      });
      // Set by renderLoading (renderResults and renderError clear it themselves).
      this.container.removeAttribute('aria-busy');
      return;
    }

    renderResults(this.container, docs, {
      lvl: this.lvl,
      labels: this.labels,
      pagination: this.pagination,
      headingLevel: this.headingLevel,
      groupBy: this.groupBy,
      maxAuthors: this.maxAuthors,
      highlightAuthors: this.highlightAuthors,
      showCredit: this.showCredit,
      onPageChange: (target: number) => {
        void this._goTo(target, true);
      },
      focusResults,
    });
  }

  /** SVG colors are baked into the markup: re-render from the last response, without fetching. */
  private _rerenderSvg(): void {
    if (this.output === 'svg' && this.displayed) this._render(false);
  }

  /**
   * Sets data-hal-theme and the --hal-* color overrides: inline custom properties for the
   * 'light' and 'dark' themes; for 'auto', a stylesheet scoped to the container with one set per
   * color scheme (derived colors differ between schemes, like in the SVG output).
   */
  private _applyAppearance(): void {
    const el = this.container;
    el.setAttribute('data-hal-theme', this.theme);
    for (const name of this.appliedVars) el.style.removeProperty(name);
    this.appliedVars = [];
    if (this.theme === 'auto') {
      this._setColorsStyle(this._colorVars('light'), this._colorVars('dark'));
      return;
    }
    this._setColorsStyle({}, {});
    const vars = this._colorVars(this.theme === 'dark' ? 'dark' : 'light');
    for (const [name, value] of Object.entries(vars)) el.style.setProperty(name, value);
    this.appliedVars = Object.keys(vars);
  }

  /**
   * CSS variables of the color overrides for one color scheme: every palette entry they change
   * (including derived tints) plus their direct targets. The rest of the palette comes from the stylesheet.
   * Values only come from paletteToCssVars(resolvePalette(...)), i.e. they passed isSafeColor.
   */
  private _colorVars(theme: 'light' | 'dark'): Record<string, string> {
    const overrides: ColorOptions = {};
    for (const key of COLOR_KEYS) {
      const value = this.colors[key];
      if (typeof value === 'string' && isSafeColor(value)) overrides[key] = value;
    }
    const keys = Object.keys(overrides) as (typeof COLOR_KEYS)[number][];
    if (keys.length === 0) return {};

    const resolved = resolvePalette({ ...overrides, theme });
    const base = resolvePalette({ theme });
    const partial: Partial<Palette> = {};
    for (const name of Object.keys(resolved) as (keyof Palette)[]) {
      if (resolved[name] !== base[name]) partial[name] = resolved[name];
    }
    for (const key of keys) {
      for (const name of OVERRIDE_TARGETS[key]) {
        if (resolved[name] !== undefined) partial[name] = resolved[name];
      }
    }
    return paletteToCssVars(partial);
  }

  /**
   * Creates, updates or removes (both sets empty) the `<style>` of the 'auto' color overrides, in the style root.
   * Its selector matches this container only (`data-hal-id`) and outranks the default theme rules.
   */
  private _setColorsStyle(light: Record<string, string>, dark: Record<string, string>): void {
    const el = this.container;
    if (Object.keys(light).length === 0 && Object.keys(dark).length === 0) {
      this.colorsStyle?.remove();
      this.colorsStyle = undefined;
      el.removeAttribute('data-hal-id');
      return;
    }
    el.setAttribute('data-hal-id', this.instanceId);
    const selector = `.hal-search[data-hal-theme="auto"][data-hal-id="${this.instanceId}"]`;
    const css =
      `${selector} {\n${declarations(light, '  ')}\n}\n` +
      `@media (prefers-color-scheme: dark) {\n  ${selector} {\n${declarations(dark, '    ')}\n  }\n}\n`;

    if (!this.colorsStyle || !this.colorsStyle.parentNode) {
      const root = this.styleRoot;
      const isDocument = root.nodeType === 9; // Node.DOCUMENT_NODE
      const doc = isDocument ? (root as Document) : (root.ownerDocument ?? document);
      const style = doc.createElement('style');
      style.setAttribute(COLORS_STYLE_ATTRIBUTE, this.instanceId);
      // After the default stylesheet (inserted first in <head>); the selector specificity wins anyway.
      const parent = isDocument ? ((root as Document).head ?? (root as Document).documentElement) : root;
      parent.appendChild(style);
      this.colorsStyle = style;
    }
    if (this.colorsStyle.textContent !== css) this.colorsStyle.textContent = css;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveContainer(target: HTMLElement | string): HTMLElement {
  if (typeof target !== 'string') return target;
  const found = document.querySelector<HTMLElement>(target);
  if (!found) throw new Error(`HalSearch: container not found for selector "${target}"`);
  return found;
}

/** Styles go into the container's shadow root when it lives in one, else into the document. */
function defaultStyleRoot(container: HTMLElement): Document | ShadowRoot {
  const root = typeof container.getRootNode === 'function' ? container.getRootNode() : undefined;
  if (typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot) return root;
  return container.ownerDocument ?? document;
}

/**
 * True when the query is well-formed but has no criterion: requesting it would list the whole archive.
 * An invalid query (bad structId or collection code) is not "missing": the request reports its validation error.
 */
function isMissingQuery(query: HalQueryInput): boolean {
  if (hasQueryCriterion(query)) return false;
  try {
    buildSolrQuery(query);
    return true;
  } catch {
    return false;
  }
}

/** CSS declarations, one per line: `--hal-accent: #0052cc;` */
function declarations(vars: Record<string, string>, indent: string): string {
  return Object.entries(vars)
    .map(([name, value]) => `${indent}${name}: ${value};`)
    .join('\n');
}

/** Runs a user callback; its exceptions are reported, never propagated. */
function notify<T>(callback: ((arg: T) => void) | undefined, arg: T, name: string): void {
  if (!callback) return;
  try {
    callback(arg);
  } catch (err) {
    console.error(`HalSearch: the ${name} callback threw`, err);
  }
}

/** Merges `overrides` over `base`, ignoring undefined values. */
function mergeFilters(base: HalFilters, overrides?: HalFilters): HalFilters {
  const merged: HalFilters = cloneFilters(base);
  if (overrides) {
    if (overrides.docTypes !== undefined) merged.docTypes = [...overrides.docTypes];
    if (overrides.yearFrom !== undefined) merged.yearFrom = overrides.yearFrom;
    if (overrides.yearTo !== undefined) merged.yearTo = overrides.yearTo;
    if (overrides.openAccess !== undefined) merged.openAccess = overrides.openAccess;
  }
  return merged;
}

function cloneFilters(filters: HalFilters): HalFilters {
  const copy: HalFilters = { ...filters };
  if (filters.docTypes) copy.docTypes = [...filters.docTypes];
  return copy;
}

function pickColors(options: ColorOptions): ColorOptions {
  const colors: ColorOptions = {};
  for (const key of COLOR_KEYS) {
    if (options[key] !== undefined) colors[key] = options[key];
  }
  return colors;
}

function toPage(page: number | undefined): number {
  return typeof page === 'number' && Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
}

function toRows(rows: number | undefined): number | undefined {
  return typeof rows === 'number' && Number.isFinite(rows) && rows >= 1 ? Math.floor(rows) : undefined;
}
