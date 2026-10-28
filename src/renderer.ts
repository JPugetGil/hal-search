import type { DetailLevel, GroupBy, HalDoc, Labels, PaginationState } from './types';
import {
  decodeEntities,
  dedupe,
  formatAuthors,
  getDocTypeLabel,
  getKeywords,
  getTitle,
  getVenue,
  getYear,
  groupDocs,
  normalizeSpace,
  stripHtml,
} from './format';
import { formatLabel } from './labels';
import { getDocLinks } from './links';
import type { DocLinks } from './links';
import { normalizeDomains } from './levels';
import { DEFAULT_LOCALE, formatNumber, getDomainLabels } from './locales';

// ---------------------------------------------------------------------------
// Render context
// ---------------------------------------------------------------------------

/**
 * Everything the HTML renderer needs besides the documents (built by HalSearch).
 *
 * Heading structure: article titles are `<h{headingLevel}>`. When `groupBy` is not
 * 'none', group headings sit one level above the titles: `<h{headingLevel - 1}>`,
 * never higher than `<h2>`. The default headingLevel 3 therefore gives `<h2>2024</h2>`
 * followed by `<h3>` titles. With headingLevel 2, group headings and titles are both
 * `<h2>`: prefer headingLevel ≥ 3 when grouping.
 */
export interface HtmlRenderContext {
  /** Detail level (see the display contract per level) */
  lvl: DetailLevel;
  /** User-facing strings, already resolved (resolveLabels) */
  labels: Labels;
  /** Current page, total and page size */
  pagination: PaginationState;
  /** Heading level of article titles */
  headingLevel: 2 | 3 | 4 | 5 | 6;
  /** Inserts group headings ('year' / 'docType'); incoming order is preserved */
  groupBy: GroupBy;
  /** Max authors shown before "et al." — 0 = no limit */
  maxAuthors: number;
  /** Author full names or idHal values to emphasise */
  highlightAuthors: string[];
  /** Show the "hal-search" credit link */
  showCredit: boolean;
  /**
   * Built-in locale of the labels: formats the result count, so that numbers and words agree.
   * Default: English (like the labels), whatever the page language.
   */
  locale?: string;
  /** Called with the 1-based page number when a pagination button is clicked */
  onPageChange: (page: number) => void;
  /** true when this render follows a pagination click: move focus to the start of the results */
  focusResults?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CREDIT_URL = 'https://github.com/JPugetGil/hal-search';

/** Abstracts longer than this (characters) are collapsed behind "Show more". */
const ABSTRACT_PREVIEW_LENGTH = 280;

/** How long the "Copied!" feedback stays on the copy button (ms). */
const COPIED_FEEDBACK_MS = 2000;

/** Numbered pagination: first, last, current ± PAGE_SIBLINGS and up to two gaps. */
const PAGE_SIBLINGS = 1;
const PAGE_SLOTS = 2 * PAGE_SIBLINGS + 5;

/**
 * Screen-reader-only text. Also applied inline so it stays hidden when the host
 * page disables the default stylesheet. Written with `style.setProperty` (CSSOM), which a
 * strict CSP allows, unlike `style="…"` markup or `setAttribute('style', …)`.
 */
const VISUALLY_HIDDEN_STYLE: Record<string, string> = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: '0',
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  'white-space': 'nowrap',
  border: '0',
};

/** Off-screen helper textarea of the legacy copy path. */
const COPY_AREA_STYLE: Record<string, string> = {
  position: 'fixed',
  top: '0',
  left: '0',
  width: '1px',
  height: '1px',
  opacity: '0',
  'pointer-events': 'none',
};

/** BCP 47-ish language tag as found in HAL's language_s ('en', 'fr', 'pt-BR'...). */
const LANG_RE = /^[a-z]{2,3}(?:-[a-z0-9]{1,8})*$/i;

let idCounter = 0;

/** Document-unique id (several widgets may share a page). */
function nextId(prefix: string): string {
  idCounter += 1;
  return `hal-${prefix}-${idCounter}`;
}

// ---------------------------------------------------------------------------
// DOM helpers (textContent only: data never goes through innerHTML)
// ---------------------------------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  content?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function text(content: string): Text {
  return document.createTextNode(content);
}

/** `<h2>`…`<h6>` (clamped). */
function heading(level: number, className: string): HTMLHeadingElement {
  const lv = Math.min(6, Math.max(2, Math.round(level) || 3));
  const node = document.createElement(`h${lv}`) as HTMLHeadingElement;
  node.className = className;
  return node;
}

/** Inline styles through CSSOM only (allowed by a strict CSP). */
function setStyles(node: HTMLElement, styles: Record<string, string>): void {
  for (const [name, value] of Object.entries(styles)) node.style.setProperty(name, value);
}

function visuallyHidden<T extends HTMLElement>(node: T): T {
  node.classList.add('hal-visually-hidden');
  setStyles(node, VISUALLY_HIDDEN_STYLE);
  return node;
}

/** Defense in depth: getDocLinks already filters, the renderer re-checks every href. */
function isHttpUrl(url: unknown): url is string {
  return typeof url === 'string' && /^https?:\/\//i.test(url.trim());
}

/** External link opening in a new tab, with a screen-reader hint. */
function externalLink(href: string, content: Node | string, labels: Labels, className?: string): HTMLAnchorElement {
  const a = el('a', className);
  a.href = href.trim();
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.appendChild(typeof content === 'string' ? text(content) : content);
  a.appendChild(visuallyHidden(el('span', undefined, ` ${labels.opensInNewTab}`)));
  return a;
}

/** A link when `href` is a safe http(s) URL, plain text otherwise (never an `<a>` without href). */
function linkOrText(href: string | undefined, content: Node, labels: Labels, className?: string): HTMLElement {
  if (isHttpUrl(href)) return externalLink(href, content, labels, className);
  const span = el('span', className);
  span.appendChild(content);
  return span;
}

/** `lang` of the title/abstract, only when HAL gives a single, well-formed language. */
function docLang(doc: HalDoc): string | undefined {
  const langs = doc.language_s;
  if (!Array.isArray(langs) || langs.length !== 1 || typeof langs[0] !== 'string') return undefined;
  const code = langs[0].trim();
  return LANG_RE.test(code) && code.toLowerCase() !== 'und' ? code : undefined;
}

// ---------------------------------------------------------------------------
// Container, live region
// ---------------------------------------------------------------------------

/**
 * Returns the polite live region of the container, creating it when missing. It is
 * kept across renders: screen readers only announce changes to a region they already track.
 */
function ensureLiveRegion(container: HTMLElement): HTMLElement {
  for (const child of Array.from(container.children)) {
    if (child.classList.contains('hal-live')) return child as HTMLElement;
  }
  const live = visuallyHidden(el('div', 'hal-live'));
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');
  container.insertBefore(live, container.firstChild);
  return live;
}

/** Removes everything except the live region, which is returned. */
function resetContainer(container: HTMLElement): HTMLElement {
  container.classList.add('hal-search');
  const live = ensureLiveRegion(container);
  for (const child of Array.from(container.childNodes)) {
    if (child !== live) container.removeChild(child);
  }
  return live;
}

// ---------------------------------------------------------------------------
// State renderers
// ---------------------------------------------------------------------------

/** Renders the loading state: spinner, `aria-busy="true"` and a polite announcement. */
export function renderLoading(container: HTMLElement, labels: Labels): void {
  const live = resetContainer(container);
  container.setAttribute('aria-busy', 'true');

  const wrap = el('div', 'hal-loading');
  // Announced by the live region: hide the visual copy to avoid reading it twice.
  wrap.setAttribute('aria-hidden', 'true');
  const spinner = el('span', 'hal-spinner');
  wrap.appendChild(spinner);
  wrap.appendChild(el('span', 'hal-loading__text', labels.loading));
  container.appendChild(wrap);

  live.textContent = labels.loading;
}

/** Renders an error message (as text) and announces it. */
export function renderError(container: HTMLElement, err: Error, labels: Labels): void {
  const live = resetContainer(container);
  container.removeAttribute('aria-busy');

  const message = formatLabel(labels.error, { message: err?.message ?? String(err) });
  container.appendChild(el('p', 'hal-error', message));
  live.textContent = message;
}

/**
 * Renders the "no search criterion" notice (`labels.missingQuery`, class `hal-empty hal-empty--missing-query`)
 * and announces it. HalSearch shows it instead of requesting the whole archive.
 */
export function renderMissingQuery(container: HTMLElement, labels: Labels): void {
  const live = resetContainer(container);
  container.removeAttribute('aria-busy');

  container.appendChild(el('p', 'hal-empty hal-empty--missing-query', labels.missingQuery));
  live.textContent = labels.missingQuery;
}

// ---------------------------------------------------------------------------
// Article card
// ---------------------------------------------------------------------------

interface CardEnv {
  ctx: HtmlRenderContext;
  announce: (message: string) => void;
}

function buildAuthors(doc: HalDoc, ctx: HtmlRenderContext): HTMLElement | null {
  const { authors, hiddenCount } = formatAuthors(doc, {
    maxAuthors: ctx.maxAuthors,
    highlightAuthors: ctx.highlightAuthors,
  });
  if (!authors.length) return null;

  const p = el('p', 'hal-article__authors');
  authors.forEach((author, i) => {
    if (i > 0) p.appendChild(text(', '));
    p.appendChild(
      author.highlighted
        ? el('strong', 'hal-author hal-author--highlight', author.name)
        : el('span', 'hal-author', author.name),
    );
  });
  if (hiddenCount > 0) {
    p.appendChild(text(' '));
    p.appendChild(el('span', 'hal-article__etal', ctx.labels.etAl));
  }
  return p;
}

function buildMeta(doc: HalDoc, ctx: HtmlRenderContext): HTMLElement | null {
  const meta = el('p', 'hal-article__meta');

  const year = getYear(doc);
  if (year !== undefined) meta.appendChild(el('span', 'hal-article__year', String(year)));

  // Same helpers as the SVG renderer, so both outputs agree.
  const venue = getVenue(doc);
  if (venue) meta.appendChild(el('span', 'hal-article__venue', venue));

  const typeLabel = getDocTypeLabel(doc.docType_s, ctx.labels);
  if (typeLabel) meta.appendChild(el('span', 'hal-badge hal-badge--doctype', typeLabel));

  if (ctx.lvl >= 2 && doc.openAccess_bool === true) {
    meta.appendChild(el('span', 'hal-badge hal-badge--oa', ctx.labels.openAccess));
  }

  return meta.childNodes.length ? meta : null;
}

/** Text copied by "Copy citation": citationFull_s without markup, else the plain label. */
function citationText(doc: HalDoc): string {
  if (typeof doc.citationFull_s === 'string' && doc.citationFull_s.trim()) return stripHtml(doc.citationFull_s);
  if (typeof doc.label_s === 'string') return normalizeSpace(decodeEntities(doc.label_s));
  return '';
}

/** Copies through the async Clipboard API, falling back to execCommand('copy'). */
async function copyText(value: string, returnFocus: HTMLElement): Promise<boolean> {
  try {
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (clipboard && typeof clipboard.writeText === 'function') {
      await clipboard.writeText(value);
      return true;
    }
  } catch {
    // Permission denied, insecure context...: try the legacy path.
  }
  return legacyCopy(value, returnFocus);
}

function legacyCopy(value: string, returnFocus: HTMLElement): boolean {
  if (typeof document.execCommand !== 'function' || !document.body) return false;
  const area = el('textarea');
  area.value = value;
  area.readOnly = true;
  area.setAttribute('aria-hidden', 'true');
  setStyles(area, COPY_AREA_STYLE);
  document.body.appendChild(area);
  let ok = false;
  try {
    area.select();
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  returnFocus.focus();
  return ok;
}

/** Last resort when copying is impossible: a selected, read-only textarea the user can copy from. */
function showCitationFallback(value: string, after: HTMLElement, labels: Labels): void {
  const parent = after.parentNode;
  if (!parent) return;
  let area = parent.querySelector<HTMLTextAreaElement>('.hal-citation');
  if (!area) {
    area = el('textarea', 'hal-citation');
    area.readOnly = true;
    area.rows = 3;
    area.value = value;
    area.setAttribute('aria-label', labels.copyCitation);
    parent.insertBefore(area, after.nextSibling);
  }
  area.focus();
  area.select();
}

function buildCopyButton(citation: string, row: HTMLElement, env: CardEnv): HTMLButtonElement {
  const { labels } = env.ctx;
  const button = el('button', 'hal-action hal-action--copy', labels.copyCitation);
  button.type = 'button';
  let timer: ReturnType<typeof setTimeout> | undefined;

  button.addEventListener('click', () => {
    void copyText(citation, button).then((ok) => {
      if (!ok) {
        showCitationFallback(citation, row, labels);
        return;
      }
      button.textContent = labels.copied;
      env.announce(labels.copied);
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        button.textContent = labels.copyCitation;
        timer = undefined;
      }, COPIED_FEEDBACK_MS);
    });
  });
  return button;
}

function buildLinksRow(doc: HalDoc, links: DocLinks, env: CardEnv): HTMLElement | null {
  const { labels, lvl } = env.ctx;
  const row = el('div', 'hal-article__links');

  if (isHttpUrl(links.pdf)) row.appendChild(externalLink(links.pdf, labels.pdf, labels, 'hal-action hal-action--pdf'));
  if (isHttpUrl(links.doi)) row.appendChild(externalLink(links.doi, labels.doi, labels, 'hal-action hal-action--doi'));

  if (lvl >= 2) {
    if (isHttpUrl(links.bibtex)) {
      row.appendChild(externalLink(links.bibtex, labels.bibtex, labels, 'hal-action hal-action--bibtex'));
    }
    const citation = citationText(doc);
    if (citation) row.appendChild(buildCopyButton(citation, row, env));
  }

  return row.childNodes.length ? row : null;
}

function buildTagList(values: string[], listClass: string, tagClass: string): HTMLElement {
  const list = el('ul', `hal-article__tags ${listClass}`);
  list.setAttribute('role', 'list');
  for (const value of values) list.appendChild(el('li', tagClass, value));
  return list;
}

/** Cut position for the abstract preview (on a word boundary), or -1 when it is short enough. */
function abstractCut(value: string): number {
  // Do not collapse when it would only hide a few words.
  if (value.length <= ABSTRACT_PREVIEW_LENGTH * 1.25) return -1;
  const head = value.slice(0, ABSTRACT_PREVIEW_LENGTH + 1);
  const space = head.search(/\s\S*$/);
  let cut = space >= ABSTRACT_PREVIEW_LENGTH * 0.6 ? space : ABSTRACT_PREVIEW_LENGTH;
  // Never split a surrogate pair.
  const code = value.charCodeAt(cut - 1);
  if (code >= 0xd800 && code <= 0xdbff) cut -= 1;
  return cut;
}

/**
 * Abstract with a "Show more / Show less" disclosure. The hidden part is really
 * hidden (`hidden`), so screen readers and sighted users get the same content.
 */
function buildAbstract(value: string, lang: string | undefined, labels: Labels): HTMLElement {
  const wrap = el('div', 'hal-abstract');

  const caption = el('span', 'hal-abstract__label', labels.abstract);
  caption.id = nextId('abstract-label');
  wrap.appendChild(caption);

  const body = el('p', 'hal-abstract__text');
  if (lang) body.lang = lang;
  wrap.appendChild(body);

  const cut = abstractCut(value);
  if (cut < 0) {
    body.textContent = value;
    return wrap;
  }

  body.appendChild(text(value.slice(0, cut)));
  const ellipsis = el('span', 'hal-abstract__ellipsis', '…');
  ellipsis.setAttribute('aria-hidden', 'true');
  const more = el('span', 'hal-abstract__more', value.slice(cut));
  more.id = nextId('abstract');
  more.hidden = true;
  body.appendChild(ellipsis);
  body.appendChild(more);

  const toggle = el('button', 'hal-abstract__toggle', labels.showMore);
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', more.id);
  toggle.setAttribute('aria-describedby', caption.id);
  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.textContent = expanded ? labels.showLess : labels.showMore;
    more.hidden = !expanded;
    ellipsis.hidden = expanded;
    wrap.classList.toggle('is-expanded', expanded);
  });
  wrap.appendChild(toggle);
  return wrap;
}

function buildDetails(doc: HalDoc, lang: string | undefined, ctx: HtmlRenderContext): HTMLElement | null {
  const details = el('div', 'hal-article__details');

  const keywords = getKeywords(doc);
  if (keywords.length) details.appendChild(buildTagList(keywords, 'hal-article__keywords', 'hal-tag'));

  const rawDomains = Array.isArray(doc.domain_s) ? doc.domain_s : [];
  const domainLabels = getDomainLabels(doc, ctx.locale);
  if (rawDomains.length || domainLabels?.length) {
    const domains = dedupe(
      normalizeDomains(rawDomains, domainLabels).map((d) => normalizeSpace(decodeEntities(String(d)))),
    );
    if (domains.length) {
      details.appendChild(buildTagList(domains, 'hal-article__domains', 'hal-tag hal-tag--domain'));
    }
  }

  if (ctx.lvl >= 3 && Array.isArray(doc.abstract_s)) {
    const raw = doc.abstract_s.find((a) => typeof a === 'string' && a.trim());
    // Abstracts occasionally carry markup: cleaned like the SVG renderer does.
    const abstract = raw ? stripHtml(raw) : '';
    if (abstract) details.appendChild(buildAbstract(abstract, lang, ctx.labels));
  }

  return details.childNodes.length ? details : null;
}

function buildArticle(doc: HalDoc, env: CardEnv): HTMLElement {
  const { ctx } = env;
  const { labels, lvl } = ctx;
  const links = getDocLinks(doc);

  const article = el('article', `hal-article hal-article--lvl${lvl}`);
  if (doc.docid) article.dataset.docid = String(doc.docid);
  if (typeof doc.docType_s === 'string' && doc.docType_s) article.dataset.doctype = doc.docType_s;

  // lvl 0: the HAL citation only
  if (lvl === 0) {
    const citation = typeof doc.label_s === 'string' && doc.label_s.trim()
      ? decodeEntities(doc.label_s)
      : getTitle(doc, labels);
    const p = el('p', 'hal-article__label');
    p.appendChild(linkOrText(links.hal, text(citation), labels, 'hal-article__link'));
    article.appendChild(p);
    return article;
  }

  const lang = docLang(doc);
  const title = heading(ctx.headingLevel, 'hal-article__title');
  const titleText = el('span', 'hal-article__title-text', getTitle(doc, labels));
  if (lang) titleText.lang = lang;
  title.appendChild(linkOrText(links.hal, titleText, labels));
  article.appendChild(title);

  const authors = buildAuthors(doc, ctx);
  if (authors) article.appendChild(authors);

  const meta = buildMeta(doc, ctx);
  if (meta) article.appendChild(meta);

  const row = buildLinksRow(doc, links, env);
  if (row) article.appendChild(row);

  if (lvl >= 2) {
    const details = buildDetails(doc, lang, ctx);
    if (details) article.appendChild(details);
  }

  return article;
}

function buildList(docs: HalDoc[], env: CardEnv): HTMLElement {
  const list = el('ul', 'hal-list');
  // Keeps list semantics in Safari despite `list-style: none`.
  list.setAttribute('role', 'list');
  for (const doc of docs) {
    const item = el('li', 'hal-item');
    item.appendChild(buildArticle(doc, env));
    list.appendChild(item);
  }
  return list;
}

function buildGroups(docs: HalDoc[], env: CardEnv): Node {
  const { ctx } = env;
  if (ctx.groupBy !== 'year' && ctx.groupBy !== 'docType') return buildList(docs, env);

  const groupLevel = Math.max(2, ctx.headingLevel - 1);
  const fragment = document.createDocumentFragment();
  for (const group of groupDocs(docs, ctx.groupBy, ctx.labels)) {
    const section = el('section', 'hal-group');
    section.dataset.group = group.key;
    if (group.label) {
      const title = heading(groupLevel, 'hal-group__title');
      title.textContent = group.label;
      section.appendChild(title);
    }
    section.appendChild(buildList(group.docs, env));
    fragment.appendChild(section);
  }
  return fragment;
}

// ---------------------------------------------------------------------------
// Pagination bar
// ---------------------------------------------------------------------------

function totalPagesOf(pagination: PaginationState): number {
  const rows = Math.max(1, Math.floor(pagination.rows) || 1);
  return Math.max(1, Math.ceil(Math.max(0, pagination.totalFound) / rows));
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

/**
 * Page numbers to display, `null` standing for a gap. Always PAGE_SLOTS items when
 * there are more pages than slots, so the bar keeps its width: 1 … 4 5 6 … 20.
 */
function pageItems(current: number, total: number): (number | null)[] {
  if (total <= PAGE_SLOTS) return range(1, total);
  const edge = PAGE_SLOTS - 2;
  if (current + PAGE_SIBLINGS <= edge) return [...range(1, edge), null, total];
  if (current - PAGE_SIBLINGS >= total - edge + 1) return [1, null, ...range(total - edge + 1, total)];
  return [1, null, ...range(current - PAGE_SIBLINGS, current + PAGE_SIBLINGS), null, total];
}

function stepButton(
  kind: 'prev' | 'next',
  label: string,
  disabled: boolean,
  onClick: () => void,
): HTMLButtonElement {
  const button = el('button', `hal-pagination__btn hal-pagination__btn--${kind}`);
  button.type = 'button';
  button.disabled = disabled;
  const arrow = el('span', 'hal-pagination__arrow', kind === 'prev' ? '←' : '→');
  arrow.setAttribute('aria-hidden', 'true');
  const name = el('span', 'hal-pagination__label', label);
  if (kind === 'prev') button.append(arrow, name);
  else button.append(name, arrow);
  if (!disabled) button.addEventListener('click', onClick);
  return button;
}

function buildPagination(pagination: PaginationState, totalPages: number, ctx: HtmlRenderContext): HTMLElement {
  const { labels, onPageChange } = ctx;
  const current = Math.min(totalPages, Math.max(1, Math.floor(pagination.currentPage) || 1));

  const nav = el('nav', 'hal-pagination');
  nav.setAttribute('aria-label', labels.pagination);

  const list = el('ul', 'hal-pagination__list');
  list.setAttribute('role', 'list');
  for (const page of pageItems(current, totalPages)) {
    const item = el('li', 'hal-pagination__item');
    if (page === null) {
      item.setAttribute('aria-hidden', 'true');
      item.appendChild(el('span', 'hal-pagination__gap', '…'));
    } else {
      const button = el('button', 'hal-pagination__btn hal-pagination__page', String(page));
      button.type = 'button';
      // "Page 5 of 20" contains the visible "5" (WCAG 2.5.3 label in name).
      button.setAttribute('aria-label', formatLabel(labels.pageInfo, { page, pages: totalPages }));
      if (page === current) button.setAttribute('aria-current', 'page');
      else button.addEventListener('click', () => onPageChange(page));
      item.appendChild(button);
    }
    list.appendChild(item);
  }

  nav.appendChild(stepButton('prev', labels.previous, current <= 1, () => onPageChange(current - 1)));
  nav.appendChild(list);
  nav.appendChild(stepButton('next', labels.next, current >= totalPages, () => onPageChange(current + 1)));
  return nav;
}

// ---------------------------------------------------------------------------
// Main results renderer
// ---------------------------------------------------------------------------

/**
 * Renders the result cards, group headings, pagination and credit into `container`,
 * replacing its content. Announces the result count through the polite live region
 * and moves focus to the start of the results when `ctx.focusResults` is set.
 */
export function renderResults(container: HTMLElement, docs: HalDoc[], ctx: HtmlRenderContext): void {
  const live = resetContainer(container);
  container.removeAttribute('aria-busy');

  const env: CardEnv = {
    ctx,
    announce: (message) => {
      ensureLiveRegion(container).textContent = message;
    },
  };

  const results = el('div', 'hal-results');
  // Programmatic focus target after a pagination click (not in the tab order).
  results.tabIndex = -1;

  if (docs.length === 0) results.appendChild(el('p', 'hal-empty', ctx.labels.empty));
  else results.appendChild(buildGroups(docs, env));

  const totalPages = totalPagesOf(ctx.pagination);
  if (totalPages > 1) results.appendChild(buildPagination(ctx.pagination, totalPages, ctx));

  if (ctx.showCredit) {
    const footer = el('p', 'hal-footer');
    footer.appendChild(externalLink(CREDIT_URL, 'hal-search', ctx.labels, 'hal-footer__link'));
    results.appendChild(footer);
  }

  container.appendChild(results);

  if (docs.length === 0) {
    live.textContent = ctx.labels.empty;
  } else {
    const total = Math.max(ctx.pagination.totalFound, docs.length);
    const template = total === 1 ? ctx.labels.resultCountOne : ctx.labels.resultCount;
    // In the language of the labels ('1,234 results'), not of the page: '1 234 results' would mix two languages.
    let summary = formatLabel(template, { count: formatNumber(total, ctx.locale || DEFAULT_LOCALE) });
    if (totalPages > 1) {
      const page = Math.min(totalPages, Math.max(1, Math.floor(ctx.pagination.currentPage) || 1));
      summary += `, ${formatLabel(ctx.labels.pageInfo, { page, pages: totalPages })}`;
    }
    live.textContent = summary;
  }

  if (ctx.focusResults) results.focus();
}
