import type {
  HalSearchOptions,
  SearchParams,
  PaginationState,
  HalApiResponse,
  DetailLevel,
} from './types';
import { fetchArticles, DEFAULT_BASE } from './api';
import { renderResults, renderLoading, renderError } from './renderer';
import { renderResultsSvg, buildArticlesSvg } from './svg-renderer';
import { injectDefaultStyles } from './styles';

const DEFAULTS = {
  lvl: 1 as DetailLevel,
  rows: 10,
  apiBase: DEFAULT_BASE,
  injectStyles: true,
  output: 'html' as 'html' | 'svg',
};

export class HalSearch {
  private readonly container?: HTMLElement;
  private options: Required<Omit<HalSearchOptions, 'container' | 'onResults' | 'onError'>> & {
    onResults?: HalSearchOptions['onResults'];
    onError?: HalSearchOptions['onError'];
  };
  private pagination: PaginationState;
  private currentUid: string = '';

  constructor(options: HalSearchOptions) {
    if (options.container) {
      this.container = this._resolveContainer(options.container);
    }

    this.options = {
      lvl: options.lvl ?? DEFAULTS.lvl,
      rows: options.rows ?? DEFAULTS.rows,
      apiBase: options.apiBase ?? DEFAULTS.apiBase,
      injectStyles: options.injectStyles ?? DEFAULTS.injectStyles,
      output: options.output ?? DEFAULTS.output,
      onResults: options.onResults,
      onError: options.onError,
    };

    this.pagination = {
      currentPage: 1,
      totalFound: 0,
      rows: this.options.rows,
      start: 0,
    };

    if (this.options.injectStyles) {
      injectDefaultStyles();
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Start a new search, resetting to page 1. */
  async search(params: SearchParams): Promise<SVGSVGElement | void> {
    this.currentUid = params.uid;
    if (params.rows !== undefined) this.options.rows = params.rows;
    this.pagination = {
      currentPage: 1,
      totalFound: 0,
      rows: this.options.rows,
      start: params.start ?? 0,
    };
    return this._fetch(this.currentUid, this.pagination.start);
  }

  /** Navigate to a specific page number (1-based). */
  async goToPage(page: number): Promise<SVGSVGElement | void> {
    const totalPages = Math.max(1, Math.ceil(this.pagination.totalFound / this.options.rows));
    const clampedPage = Math.min(Math.max(1, page), totalPages);
    const start = (clampedPage - 1) * this.options.rows;
    return this._fetch(this.currentUid, start);
  }

  /** Navigate to the next page. */
  async nextPage(): Promise<SVGSVGElement | void> {
    return this.goToPage(this.pagination.currentPage + 1);
  }

  /** Navigate to the previous page. */
  async prevPage(): Promise<SVGSVGElement | void> {
    return this.goToPage(this.pagination.currentPage - 1);
  }

  /** Change the detail level and re-fetch the current results. */
  async setLevel(lvl: DetailLevel): Promise<SVGSVGElement | void> {
    this.options.lvl = lvl;
    return this._fetch(this.currentUid, this.pagination.start);
  }

  /** Clear the container and remove rendered content. */
  destroy(): void {
    if (this.container) {
      this.container.innerHTML = '';
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async _fetch(uid: string, start: number): Promise<SVGSVGElement | void> {
    if (!uid) return;

    if (this.container) {
      renderLoading(this.container);
    }

    try {
      const response: HalApiResponse = await fetchArticles(
        uid,
        this.options.lvl,
        this.options.rows,
        start,
        this.options.apiBase,
      );

      this._updatePagination(response, start);

      if (this.options.output === 'svg') {
        if (this.container) {
          renderResultsSvg(
            this.container,
            response.response.docs,
            this.options.lvl,
            this.pagination,
          );
        } else {
          const svg = buildArticlesSvg(
            response.response.docs,
            this.options.lvl,
            this.pagination,
          );
          this.options.onResults?.(response);
          return svg;
        }
      } else {
        if (this.container) {
          renderResults(
            this.container,
            response.response.docs,
            this.options.lvl,
            this.pagination,
            (page) => { void this.goToPage(page); },
          );
        } else {
          throw new Error('HalSearch: container is required for HTML output');
        }
      }

      this.options.onResults?.(response);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (this.container) {
        renderError(this.container, error);
      }
      this.options.onError?.(error);
      if (!this.container && !this.options.onError) {
        throw error;
      }
    }
  }

  private _resolveContainer(target: HTMLElement | string): HTMLElement {
    if (typeof target === 'string') {
      const found = document.querySelector<HTMLElement>(target);
      if (!found) {
        throw new Error(`HalSearch: container not found for selector "${target}"`);
      }
      return found;
    }
    return target;
  }

  private _updatePagination(response: HalApiResponse, start: number): void {
    const { numFound } = response.response;
    this.pagination = {
      currentPage: Math.floor(start / this.options.rows) + 1,
      totalFound: numFound,
      rows: this.options.rows,
      start,
    };
  }
}
