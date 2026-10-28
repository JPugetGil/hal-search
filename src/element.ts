import type { ColorOptions, HalApiResponse, Labels, SearchParams } from './types';
import { HalSearch, HAL_SEARCH_DEFAULTS } from './HalSearch';
import type { HalSearchOptions } from './HalSearch';
import { parseUrlParams } from './url-params';
import { injectElementStyles } from './styles';

// Node safety: this module is imported by index.ts, which the SSR imports in Node.
// Nothing at module level may touch HTMLElement, customElements, window or document:
// the element class is created lazily by defineHalSearchElement().

// ---------------------------------------------------------------------------
// Attributes
// ---------------------------------------------------------------------------

/** Element attribute → public URL param (single parsing logic: parseUrlParams). */
const URL_ATTRIBUTES: Readonly<Record<string, string>> = {
  'id-hal': 'idHal',
  orcid: 'orcid',
  'struct-id': 'structId',
  collection: 'collection',
  search: 'search',
  q: 'q',
  'doc-types': 'docTypes',
  'year-from': 'yearFrom',
  'year-to': 'yearTo',
  oa: 'oa',
  sort: 'sort',
  lvl: 'lvl',
  rows: 'rows',
  page: 'page',
  output: 'output',
  theme: 'theme',
  bg: 'bg',
  text: 'text',
  main: 'main',
  'group-by': 'groupBy',
  highlight: 'highlight',
  'max-authors': 'maxAuthors',
  credit: 'credit',
  // The global `title` attribute would show a tooltip.
  'svg-title': 'title',
  // The global `lang` attribute: language of the labels ('en', 'fr'), also right for assistive tech.
  lang: 'lang',
};

const COLOR_KEYS = ['backgroundColor', 'textColor', 'mainColor'] as const;

/** Boolean attributes: a bare attribute (`<hal-search oa>`) means true. */
const BOOLEAN_ATTRIBUTES = new Set(['oa', 'credit']);

/** Attributes only understood by the web component. */
const WIDGET_ATTRIBUTES = ['heading-level', 'labels', 'api-base', 'structured-data'];

/** Every attribute observed by `<hal-search>`. Annotated pure: bundlers drop it from apps that never use it. */
export const HAL_SEARCH_ATTRIBUTES: readonly string[] = /* @__PURE__ */ Object.keys(URL_ATTRIBUTES).concat(WIDGET_ATTRIBUTES);

/** Converts the element attributes to the public URL scheme, the input of parseUrlParams. */
export function attributesToUrlParams(el: Pick<Element, 'getAttribute'>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [attr, param] of Object.entries(URL_ATTRIBUTES)) {
    const value = el.getAttribute(attr);
    if (value === null) continue;
    params.set(param, value === '' && BOOLEAN_ATTRIBUTES.has(attr) ? 'true' : value);
  }
  return params;
}

/** Parses the `labels` attribute (JSON object, Partial<Labels>). Invalid JSON and non-string values are ignored. */
export function parseLabelsAttribute(json: string | null): Partial<Labels> | undefined {
  if (!json) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (!isPlainObject(value)) return undefined;
  const labels: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') {
      labels[key] = entry;
    } else if (key === 'docTypes' && isPlainObject(entry)) {
      const docTypes: Record<string, string> = {};
      for (const [code, label] of Object.entries(entry)) {
        if (typeof label === 'string') docTypes[code] = label;
      }
      labels.docTypes = docTypes;
    }
  }
  return Object.keys(labels).length > 0 ? (labels as Partial<Labels>) : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseHeadingLevel(value: string | null): 2 | 3 | 4 | 5 | 6 | undefined {
  const n = value === null ? NaN : Number(value);
  return n === 2 || n === 3 || n === 4 || n === 5 || n === 6 ? n : undefined;
}

/**
 * Widget-only boolean attribute: present means true (`<hal-search structured-data>`), except the values
 * `false` and `0` (frameworks such as React 18 write `structured-data="false"`). Absent: undefined.
 */
function parseBooleanAttribute(value: string | null): true | undefined {
  if (value === null) return undefined;
  const v = value.trim().toLowerCase();
  return v === 'false' || v === '0' ? undefined : true;
}

// ---------------------------------------------------------------------------
// Element
// ---------------------------------------------------------------------------

/** Snapshot of the attributes, split by how a change is applied. */
interface ElementSnapshot {
  /** Changes require a new HalSearch instance */
  config: Omit<HalSearchOptions, 'container' | 'styleRoot' | 'onResults' | 'onError'>;
  /** Applied in place with setTheme / setColors */
  appearance: Required<Pick<HalSearchOptions, 'theme'>> & ColorOptions;
  /** Changes trigger a new search */
  search: SearchParams;
}

/**
 * Reads the attributes. A query without criterion (no attribute, `search="*"`) is kept: HalSearch renders
 * `labels.missingQuery` for it without sending any request (same rule as the SSR: never list the whole archive).
 */
function readSnapshot(el: Element): ElementSnapshot {
  const state = parseUrlParams(attributesToUrlParams(el));
  const apiBase = el.getAttribute('api-base')?.trim();
  return {
    config: {
      output: state.output,
      groupBy: state.groupBy,
      highlightAuthors: state.highlightAuthors,
      maxAuthors: state.maxAuthors,
      showCredit: state.showCredit,
      title: state.title,
      locale: state.locale,
      headingLevel: parseHeadingLevel(el.getAttribute('heading-level')),
      labels: parseLabelsAttribute(el.getAttribute('labels')),
      apiBase: apiBase || undefined,
      structuredData: parseBooleanAttribute(el.getAttribute('structured-data')),
    },
    appearance: {
      theme: state.theme ?? HAL_SEARCH_DEFAULTS.theme,
      backgroundColor: state.backgroundColor,
      textColor: state.textColor,
      mainColor: state.mainColor,
    },
    search: {
      query: state.query,
      filters: state.filters,
      sort: state.sort,
      // Explicit defaults: HalSearch keeps lvl/rows across searches, a removed attribute must reset them.
      lvl: state.lvl ?? HAL_SEARCH_DEFAULTS.lvl,
      rows: state.rows ?? HAL_SEARCH_DEFAULTS.rows,
      page: state.page,
    },
  };
}

/** Creates the element class. Only called when the DOM is available. */
function createElementClass(): CustomElementConstructor {
  return class HalSearchElement extends HTMLElement {
    static get observedAttributes(): string[] {
      return [...HAL_SEARCH_ATTRIBUTES];
    }

    private readonly mount: HTMLElement;
    private instance: HalSearch | undefined;
    private configKey = '';
    private appearanceKey = '';
    private appearance: ElementSnapshot['appearance'] | undefined;
    private searchKey = '';
    private scheduled = false;

    constructor() {
      super();
      const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
      this.mount = document.createElement('div');
      // Lets the host page adjust the layout: hal-search::part(container) { max-width: 40rem }
      this.mount.setAttribute('part', 'container');
      root.replaceChildren(this.mount);
      // Theme defaults on :host, so `hal-search { --hal-accent: … }` in the page wins over them.
      injectElementStyles(root);
    }

    connectedCallback(): void {
      this._schedule();
    }

    disconnectedCallback(): void {
      // Deferred: a synchronous move (disconnect + connect) keeps the current results.
      this._schedule();
    }

    attributeChangedCallback(_name: string, oldValue: string | null, newValue: string | null): void {
      if (oldValue !== newValue) this._schedule();
    }

    /** Coalesces several attribute changes made in the same task into one update. */
    private _schedule(): void {
      if (this.scheduled) return;
      this.scheduled = true;
      queueMicrotask(() => {
        this.scheduled = false;
        this._update();
      });
    }

    private _update(): void {
      if (!this.isConnected) {
        this._teardown();
        return;
      }
      const snapshot = readSnapshot(this);
      const configKey = JSON.stringify(snapshot.config);
      const appearanceKey = JSON.stringify(snapshot.appearance);
      const searchKey = JSON.stringify(snapshot.search);

      // Selects the theme defaults declared on :host (see elementCss).
      if (this.getAttribute('data-hal-theme') !== snapshot.appearance.theme) {
        this.setAttribute('data-hal-theme', snapshot.appearance.theme);
      }

      if (!this.instance || configKey !== this.configKey) {
        this.instance?.destroy();
        this.instance = new HalSearch({
          ...snapshot.config,
          ...snapshot.appearance,
          container: this.mount,
          // The element's own stylesheet is injected by the constructor; the style root receives the
          // per-instance color overrides of the 'auto' theme.
          injectStyles: false,
          styleRoot: this.shadowRoot ?? undefined,
          onResults: (response: HalApiResponse) => this._emit('hal-results', { response }),
          onError: (error: Error) => this._emit('hal-error', { error }),
        });
        this.configKey = configKey;
        this.appearanceKey = appearanceKey;
        this.searchKey = '';
      } else if (appearanceKey !== this.appearanceKey) {
        // Theme and colors are applied in place (SVG re-rendered from the last response, no request).
        const previous = this.appearance;
        const next = snapshot.appearance;
        if (next.theme !== previous?.theme) this.instance.setTheme(next.theme);
        if (COLOR_KEYS.some((key) => next[key] !== previous?.[key])) {
          this.instance.setColors({
            backgroundColor: next.backgroundColor,
            textColor: next.textColor,
            mainColor: next.mainColor,
          });
        }
        this.appearanceKey = appearanceKey;
      }
      this.appearance = snapshot.appearance;

      if (searchKey !== this.searchKey) {
        this.searchKey = searchKey;
        void this.instance.search(snapshot.search);
      }
    }

    private _teardown(): void {
      this.instance?.destroy();
      this.instance = undefined;
      this.removeAttribute('data-hal-theme');
      this.configKey = '';
      this.appearanceKey = '';
      this.appearance = undefined;
      this.searchKey = '';
    }

    private _emit(type: 'hal-results' | 'hal-error', detail: object): void {
      this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
    }
  };
}

/**
 * Registers the `<hal-search>` custom element (open Shadow DOM, attributes = public URL scheme in kebab-case).
 * No-op outside the browser (no `customElements`) and when the tag is already defined.
 * Without a query criterion (no `id-hal`, `orcid`, `struct-id`, `collection`, `search` or `q`, or only Solr syntax
 * such as `search="*"`) it shows `labels.missingQuery` and sends no request, like HalSearch and the SVG service.
 * Dispatches `hal-results` (`detail.response`) and `hal-error` (`detail.error`), both bubbling and composed.
 */
export function defineHalSearchElement(tagName = 'hal-search'): void {
  if (typeof customElements === 'undefined' || typeof HTMLElement === 'undefined') return;
  if (customElements.get(tagName)) return;
  customElements.define(tagName, createElementClass());
}
