import type { HalDoc, DetailLevel, PaginationState } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function text(content: string): Text {
  return document.createTextNode(content);
}

/** Decodes HTML entities (e.g. &#x27E8;) into their actual characters. */
function decodeEntities(raw: string): string {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = raw;
  return textarea.value;
}

/** Creates an <a> element with href validated to start with https:// */
function safeLink(href: string | undefined, label: string, className?: string): HTMLAnchorElement {
  const a = el('a', className);
  if (href && (href.startsWith('https://') || href.startsWith('http://'))) {
    a.href = href;
  }
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = label;
  return a;
}

// ---------------------------------------------------------------------------
// State renderers
// ---------------------------------------------------------------------------

export function renderLoading(container: HTMLElement): void {
  container.innerHTML = '';
  const wrap = el('div', 'hal-loading');
  const spinner = el('div', 'hal-spinner');
  wrap.appendChild(spinner);
  wrap.appendChild(text('Loading…'));
  container.appendChild(wrap);
}

export function renderError(container: HTMLElement, err: Error): void {
  container.innerHTML = '';
  const wrap = el('div', 'hal-error');
  wrap.textContent = `Error: ${err.message}`;
  container.appendChild(wrap);
}

export function renderEmpty(container: HTMLElement): void {
  container.innerHTML = '';
  const wrap = el('div', 'hal-empty');
  wrap.textContent = 'No results found.';
  container.appendChild(wrap);
}

// ---------------------------------------------------------------------------
// Article card
// ---------------------------------------------------------------------------

function buildArticleCard(doc: HalDoc, lvl: DetailLevel): HTMLElement {
  const article = el('article', 'hal-article');
  if (doc.docid) article.dataset.docid = doc.docid;
  if (doc.docType_s) article.dataset.doctype = doc.docType_s;

  // --- Header ---
  const header = el('header');

  if (lvl >= 1) {
    // Title + link
    const h3 = el('h3', 'hal-article__title');
    const titleText = doc.title_s?.[0] ?? doc.label_s ?? 'Untitled';
    h3.appendChild(safeLink(doc.uri_s, titleText));
    header.appendChild(h3);

    // Meta row
    const meta = el('div', 'hal-article__meta');

    if (doc.authFullName_s?.length) {
      const authors = el('span', 'hal-article__authors');
      authors.textContent = doc.authFullName_s.join(', ');
      meta.appendChild(authors);
    }

    if (doc.publicationDate_s) {
      const date = el('span', 'hal-article__date');
      // Show only the year if it's a full date string
      date.textContent = doc.publicationDate_s.slice(0, 4);
      meta.appendChild(date);
    }

    if (doc.docType_s && doc.docType_s.toUpperCase() !== 'UNDEFINED') {
      const badge = el('span', 'hal-badge');
      badge.textContent = doc.docType_s;
      meta.appendChild(badge);
    }

    if (doc.openAccess_bool === true) {
      const oaBadge = el('span', 'hal-badge hal-badge--oa');
      oaBadge.textContent = 'Open Access';
      meta.appendChild(oaBadge);
    }

    header.appendChild(meta);
  } else {
    // lvl 0: just the full citation
    const div = el('div', 'hal-article__label');
    div.appendChild(safeLink(doc.uri_s, decodeEntities(doc.label_s ?? doc.docid ?? ''), 'hal-article__link'));
    header.appendChild(div);
  }

  article.appendChild(header);

  // --- Details (lvl >= 2) ---
  if (lvl >= 2) {
    const hasKeywords = doc.keyword_s && doc.keyword_s.length > 0;
    const hasDomains = doc.domain_s && doc.domain_s.length > 0;
    const hasConference = Boolean(doc.conferenceTitle_s);

    if (hasKeywords || hasDomains || hasConference) {
      const details = el('section', 'hal-article__details');

      if (hasKeywords) {
        const tagsWrap = el('div', 'hal-article__tags');
        for (const kw of doc.keyword_s!) {
          const tag = el('span', 'hal-tag');
          tag.textContent = kw;
          tagsWrap.appendChild(tag);
        }
        details.appendChild(tagsWrap);
      }

      if (hasDomains) {
        const domainsWrap = el('div', 'hal-article__tags');
        for (const domain of doc.domain_s!) {
          const tag = el('span', 'hal-tag hal-tag--domain');
          tag.textContent = domain;
          domainsWrap.appendChild(tag);
        }
        details.appendChild(domainsWrap);
      }

      if (hasConference) {
        const conf = el('div', 'hal-article__conference');
        conf.textContent = doc.conferenceTitle_s!;
        details.appendChild(conf);
      }

      article.appendChild(details);
    }
  }

  return article;
}

// ---------------------------------------------------------------------------
// Pagination bar
// ---------------------------------------------------------------------------

function buildPagination(
  pagination: PaginationState,
  onPageChange: (page: number) => void,
): HTMLElement {
  const totalPages = Math.max(1, Math.ceil(pagination.totalFound / pagination.rows));
  const { currentPage } = pagination;

  const nav = el('nav', 'hal-pagination');
  nav.setAttribute('aria-label', 'Search results pages');

  const prevBtn = el('button', 'hal-pagination__btn');
  prevBtn.textContent = '← Previous';
  prevBtn.disabled = currentPage <= 1;
  prevBtn.addEventListener('click', () => onPageChange(currentPage - 1));
  nav.appendChild(prevBtn);

  const info = el('span', 'hal-pagination__info');
  info.textContent = `Page ${currentPage} of ${totalPages} (${pagination.totalFound.toLocaleString()} results)`;
  nav.appendChild(info);

  const nextBtn = el('button', 'hal-pagination__btn');
  nextBtn.textContent = 'Next →';
  nextBtn.disabled = currentPage >= totalPages;
  nextBtn.addEventListener('click', () => onPageChange(currentPage + 1));
  nav.appendChild(nextBtn);

  return nav;
}

// ---------------------------------------------------------------------------
// Main results renderer
// ---------------------------------------------------------------------------

export function renderResults(
  container: HTMLElement,
  docs: HalDoc[],
  lvl: DetailLevel,
  pagination: PaginationState,
  onPageChange: (page: number) => void,
): void {
  container.innerHTML = '';

  if (docs.length === 0) {
    renderEmpty(container);
    return;
  }

  const wrapper = el('div', 'hal-results');

  for (const doc of docs) {
    wrapper.appendChild(buildArticleCard(doc, lvl));
  }

  if (pagination.totalFound > pagination.rows) {
    wrapper.appendChild(buildPagination(pagination, onPageChange));
  }

  container.appendChild(wrapper);
}
