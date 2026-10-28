import type { ThemeName, UrlState } from './types';
import { toUrlParams } from './url-params';
import { buildHalWebUrl } from './query';
import { SNIPPET_TITLES, resolveLocale } from './locales';

// All URLs use the public scheme of url-params.ts.

export interface EmbedOptions extends Partial<UrlState> {
  /** Base URL where embed.html is hosted */
  embedBase: string;
  /** iframe width (CSS value). Default: '100%' */
  width?: string;
  /** iframe height (CSS value). Default: '600' */
  height?: string;
  /** iframe title (accessibility). Default: 'Publications from HAL', in the language of `locale` */
  iframeTitle?: string;
}

export interface MarkdownSnippetOptions extends Partial<UrlState> {
  /** Base URL of the SSR SVG service, e.g. 'https://hal-search.vercel.app' */
  svgBase: string;
  /** Image alt text. Default: 'Publications from HAL', in the language of `locale` */
  alt?: string;
  /** Emit a <picture> with light and dark sources (GitHub dark mode). Default: false */
  darkMode?: boolean;
}

/**
 * `<hal-search>` attribute name of each URL param (kebab-case, `title` → `svg-title`
 * because the global `title` attribute would show a tooltip; `lang` is the global attribute).
 */
export const WEB_COMPONENT_ATTRIBUTES: Readonly<Record<string, string>> = {
  idHal: 'id-hal',
  orcid: 'orcid',
  structId: 'struct-id',
  collection: 'collection',
  search: 'search',
  q: 'q',
  docTypes: 'doc-types',
  yearFrom: 'year-from',
  yearTo: 'year-to',
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
  groupBy: 'group-by',
  highlight: 'highlight',
  maxAuthors: 'max-authors',
  title: 'svg-title',
  credit: 'credit',
  lang: 'lang',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escapes a value for a double- or single-quoted HTML attribute. */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Default iframe title / image alt in the snippet's language ('Publications from HAL'). */
function defaultTitle(locale: string | undefined): string {
  return SNIPPET_TITLES[resolveLocale(locale)] ?? SNIPPET_TITLES.en;
}

/** Base URL without trailing slashes. */
function trimBase(base: string): string {
  return String(base ?? '').trim().replace(/\/+$/, '');
}

/** Only the UrlState part of an options object (drops snippet-only options). */
function stateOf<T extends Partial<UrlState>>(options: T, omit: readonly string[]): Partial<UrlState> {
  const state: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(options)) {
    if (!omit.includes(key)) state[key] = value;
  }
  return state as Partial<UrlState>;
}

function withQuery(url: string, params: URLSearchParams): string {
  const search = params.toString();
  return search ? `${url}?${search}` : url;
}

/** SVG URL with an explicit theme (kept even when it is the default). */
function svgUrlWithTheme(svgBase: string, state: Partial<UrlState>, theme: ThemeName): string {
  const params = svgParams(state);
  params.set('theme', theme);
  return withQuery(`${trimBase(svgBase)}/svg`, params);
}

/** URL params of the SVG endpoint (`output` is meaningless there). */
function svgParams(state: Partial<UrlState>): URLSearchParams {
  const params = toUrlParams(state);
  params.delete('output');
  return params;
}

/** Makes a URL safe inside Markdown `(...)`: no spaces, parentheses or angle brackets. */
function markdownUrl(url: string): string {
  return url.replace(/[\s()<>]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
}

/** Escapes Markdown link text (alt) so that it cannot close the brackets. */
function markdownText(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').replace(/[\\[\]]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** URL of the embeddable page (embed.html) with query parameters. */
export function buildEmbedUrl(options: EmbedOptions): string {
  const state = stateOf(options, ['embedBase', 'width', 'height', 'iframeTitle']);
  return withQuery(`${trimBase(options.embedBase)}/embed.html`, toUrlParams(state));
}

/** Ready-to-paste, attribute-escaped `<iframe>` snippet. */
export function buildEmbedSnippet(options: EmbedOptions): string {
  const src = buildEmbedUrl(options);
  const title = options.iframeTitle?.trim() || defaultTitle(options.locale);
  const width = options.width?.trim() || '100%';
  const height = options.height?.trim() || '600';
  return (
    `<iframe src="${escapeAttr(src)}" title="${escapeAttr(title)}" ` +
    `width="${escapeAttr(width)}" height="${escapeAttr(height)}" loading="lazy" style="border:0"></iframe>`
  );
}

/** URL of the SSR SVG endpoint: `${svgBase}/svg?...` */
export function buildSvgUrl(svgBase: string, state: Partial<UrlState>): string {
  return withQuery(`${trimBase(svgBase)}/svg`, svgParams(state));
}

/** Markdown (or <picture> HTML when darkMode) for a README, wrapped in a link to the list on HAL. */
export function buildMarkdownSnippet(options: MarkdownSnippetOptions): string {
  const state = stateOf(options, ['svgBase', 'alt', 'darkMode']);
  const alt = options.alt?.trim() || defaultTitle(options.locale);
  // Same filters as the image, so the link lists what the image counts.
  const halUrl = buildHalWebUrl(state.query ?? {}, state.filters);

  if (!options.darkMode) {
    const svgUrl = buildSvgUrl(options.svgBase, state);
    return `[![${markdownText(alt)}](${markdownUrl(svgUrl)})](${markdownUrl(halUrl)})`;
  }

  const dark = svgUrlWithTheme(options.svgBase, state, 'dark');
  const light = svgUrlWithTheme(options.svgBase, state, 'light');
  return [
    `<a href="${escapeAttr(halUrl)}">`,
    '  <picture>',
    `    <source media="(prefers-color-scheme: dark)" srcset="${escapeAttr(dark)}">`,
    `    <img src="${escapeAttr(light)}" alt="${escapeAttr(alt)}">`,
    '  </picture>',
    '</a>',
  ].join('\n');
}

/** `<hal-search ...>` snippet with attribute-escaped values. */
export function buildWebComponentSnippet(state: Partial<UrlState>): string {
  const attributes: string[] = [];
  toUrlParams(state).forEach((value, name) => {
    const attribute = WEB_COMPONENT_ATTRIBUTES[name];
    if (attribute) attributes.push(`${attribute}="${escapeAttr(value)}"`);
  });
  return `<hal-search${attributes.map(a => ` ${a}`).join('')}></hal-search>`;
}
