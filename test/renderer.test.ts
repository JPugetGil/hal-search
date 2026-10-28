// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HalDoc, Labels } from '../src/types';

// ---------------------------------------------------------------------------
// Mocks: the renderer is tested on its own, against the contract signatures.
// ---------------------------------------------------------------------------

vi.mock('../src/format', async (importOriginal) => {
  // The real doc type labels: the contract forbids raw codes, a fake could hide such a regression.
  const { getDocTypeLabel } = await importOriginal<typeof import('../src/format')>();
  const decode = (s: string): string =>
    s
      .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&');
  const space = (s: string): string => s.replace(/\s+/g, ' ').trim();
  const dedupe = (values: string[]): string[] =>
    values.filter((v, i) => v && values.findIndex((w) => w.toLowerCase() === v.toLowerCase()) === i);
  return {
    decodeEntities: decode,
    normalizeSpace: space,
    dedupe,
    escapeXml: (s: string) => s,
    stripHtml: (html: string) => space(decode(html.replace(/<[^>]*>/g, ''))),
    getVenue: (doc: HalDoc) => doc.journalTitle_s || doc.conferenceTitle_s || undefined,
    getKeywords: (doc: HalDoc) => dedupe((doc.keyword_s ?? []).map(space)),
    getDocTypeLabel,
    getTitle: (doc: HalDoc, labels: Labels) =>
      doc.title_s?.[0] ? decode(doc.title_s[0]) : doc.label_s ? decode(doc.label_s) : labels.untitled,
    getYear: (doc: HalDoc) => doc.producedDateY_i,
    formatAuthors: (doc: HalDoc, opts: { maxAuthors?: number; highlightAuthors?: string[] }) => {
      const names = doc.authFullName_s ?? [];
      const max = opts.maxAuthors ?? 10;
      const shown = max > 0 ? names.slice(0, max) : names;
      const hl = (opts.highlightAuthors ?? []).map((h) => h.toLowerCase());
      return {
        authors: shown.map((name) => ({ name, highlighted: hl.includes(name.toLowerCase()) })),
        hiddenCount: names.length - shown.length,
      };
    },
    groupDocs: (docs: HalDoc[], groupBy: string, labels: Labels) => {
      if (!groupBy || groupBy === 'none') return [{ key: 'all', label: '', docs }];
      const groups = new Map<string, { key: string; label: string; docs: HalDoc[] }>();
      for (const doc of docs) {
        const key = groupBy === 'year' ? String(doc.producedDateY_i ?? 'undated') : doc.docType_s ?? 'UNDEFINED';
        const label =
          groupBy === 'year'
            ? doc.producedDateY_i
              ? String(doc.producedDateY_i)
              : labels.undated
            : getDocTypeLabel(key, labels) ?? (getDocTypeLabel('OTHER', labels) as string);
        if (!groups.has(key)) groups.set(key, { key, label, docs: [] });
        groups.get(key)!.docs.push(doc);
      }
      return [...groups.values()];
    },
  };
});

vi.mock('../src/labels', () => ({
  formatLabel: (template: string, vars: Record<string, string | number>) =>
    template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)),
}));

// Deliberately naive (no URL filtering): proves the renderer re-checks every href itself.
vi.mock('../src/links', () => ({
  getDocLinks: (doc: HalDoc) => ({
    hal: doc.uri_s,
    pdf: doc.fileMain_s,
    doi: doc.doiId_s ? `https://doi.org/${doc.doiId_s}` : undefined,
    bibtex: doc.halId_s ? `https://api.archives-ouvertes.fr/search/?q=halId_s:${doc.halId_s}&wt=bibtex` : undefined,
  }),
}));

vi.mock('../src/levels', () => ({
  normalizeDomains: (domains: string[], labels?: string[]) =>
    labels?.length ? labels.map((l) => l.split('_FacetSep_')[1].split('/').pop()) : domains,
}));

import { renderError, renderLoading, renderMissingQuery, renderResults } from '../src/renderer';
import type { HtmlRenderContext } from '../src/renderer';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LABELS: Labels = {
  loading: 'Loading…',
  empty: 'No results found.',
  error: 'Error: {message}',
  previous: 'Previous',
  next: 'Next',
  pageInfo: 'Page {page} of {pages}',
  resultCount: '{count} results',
  resultCountOne: '{count} result',
  pagination: 'Search results pages',
  openAccess: 'Open Access',
  abstract: 'Abstract',
  showMore: 'Show more',
  showLess: 'Show less',
  untitled: 'Untitled',
  etAl: 'et al.',
  pdf: 'PDF',
  doi: 'DOI',
  bibtex: 'BibTeX',
  copyCitation: 'Copy citation',
  copied: 'Copied!',
  viewOnHal: 'View all {count} publications on HAL',
  viewOnHalOne: 'View this publication on HAL',
  title: 'Publications',
  opensInNewTab: '(opens in a new tab)',
  undated: 'Undated',
  missingQuery: 'No search criterion given.',
  docTypes: { ART: 'Journal article', COMM: 'Conference paper' },
};

const LONG_ABSTRACT =
  'We present a condensed representation for snapshot-based RDF graphs that stores each version ' +
  'as a delta against its predecessor. '.repeat(6) +
  'The final sentence is only visible once expanded.';

const RICH: HalDoc = {
  docid: '123',
  halId_s: 'hal-01',
  uri_s: 'https://hal.science/hal-01',
  label_s: 'A. Martin. Graph versioning. 2024. &#x27E8;hal-01&#x27E9;',
  title_s: ['Graph versioning'],
  authFullName_s: ['Alice Martin', 'Bob Durand', 'Jey Puget Gil', 'Dan Brown'],
  producedDateY_i: 2024,
  docType_s: 'ART',
  journalTitle_s: 'Journal of Tests',
  openAccess_bool: true,
  keyword_s: ['graphs', 'versioning', 'Graphs'],
  domain_s: ['0.info'],
  en_domainAllCodeLabel_fs: ['info.info-db_FacetSep_Computer Science [cs]/Databases [cs.DB]'],
  language_s: ['en'],
  abstract_s: [LONG_ABSTRACT],
  doiId_s: '10.1000/xyz',
  fileMain_s: 'https://hal.science/hal-01/document',
  citationFull_s:
    'A. Martin. <i>Graph versioning</i>. 2024. <a target="_blank" href="https://hal.science/hal-01">&#x27E8;hal-01&#x27E9;</a>',
};

function makeCtx(overrides: Partial<HtmlRenderContext> = {}): HtmlRenderContext {
  return {
    lvl: 1,
    labels: LABELS,
    pagination: { currentPage: 1, totalFound: 1, rows: 10, start: 0 },
    headingLevel: 3,
    groupBy: 'none',
    maxAuthors: 10,
    highlightAuthors: [],
    showCredit: true,
    onPageChange: vi.fn(),
    ...overrides,
  };
}

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const $ = (sel: string): HTMLElement | null => container.querySelector<HTMLElement>(sel);
const $$ = (sel: string): HTMLElement[] => Array.from(container.querySelectorAll<HTMLElement>(sel));
/** Visible text of an element, without the screen-reader-only hints. */
function visibleText(node: Element | null): string {
  if (!node) return '';
  const clone = node.cloneNode(true) as Element;
  clone.querySelectorAll('.hal-visually-hidden').forEach((n) => n.remove());
  return (clone.textContent ?? '').trim();
}
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

// ---------------------------------------------------------------------------
// Detail levels
// ---------------------------------------------------------------------------

describe('detail levels', () => {
  it('lvl 0: decoded citation linking to HAL, nothing else', () => {
    renderResults(container, [RICH], makeCtx({ lvl: 0 }));
    const link = $('.hal-article__label a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('https://hal.science/hal-01');
    expect(visibleText(link)).toBe('A. Martin. Graph versioning. 2024. ⟨hal-01⟩');
    expect($('h3')).toBeNull();
    expect($('.hal-article__authors')).toBeNull();
    expect($('.hal-article__links')).toBeNull();
    expect($('.hal-badge')).toBeNull();
  });

  it('lvl 1: title, authors, year, venue, doc type label, PDF + DOI', () => {
    renderResults(container, [RICH], makeCtx({ lvl: 1 }));
    const title = $('h3.hal-article__title a') as HTMLAnchorElement;
    expect(title.getAttribute('href')).toBe('https://hal.science/hal-01');
    expect(visibleText(title)).toBe('Graph versioning');
    expect(visibleText($('.hal-article__authors'))).toBe('Alice Martin, Bob Durand, Jey Puget Gil, Dan Brown');
    expect($('.hal-article__year')?.textContent).toBe('2024');
    expect($('.hal-article__venue')?.textContent).toBe('Journal of Tests');
    expect($('.hal-badge--doctype')?.textContent).toBe('Journal article');
    expect($('.hal-action--pdf')?.getAttribute('href')).toBe('https://hal.science/hal-01/document');
    expect($('.hal-action--doi')?.getAttribute('href')).toBe('https://doi.org/10.1000/xyz');
    // lvl >= 2 only
    expect($('.hal-action--bibtex')).toBeNull();
    expect($('.hal-action--copy')).toBeNull();
    expect($('.hal-badge--oa')).toBeNull();
    expect($('.hal-tag')).toBeNull();
    expect($('.hal-abstract')).toBeNull();
  });

  it('uses the conference title as venue and hides UNDEFINED doc types', () => {
    const doc: HalDoc = { title_s: ['T'], conferenceTitle_s: 'BDA 2023', docType_s: 'UNDEFINED' };
    renderResults(container, [doc], makeCtx());
    expect($('.hal-article__venue')?.textContent).toBe('BDA 2023');
    expect($('.hal-badge--doctype')).toBeNull();
    expect(container.textContent).not.toContain('UNDEFINED');
  });

  it('never shows a raw doc type code', () => {
    const docs: HalDoc[] = [
      { title_s: ['A'], docType_s: 'THESE' },
      { title_s: ['B'], docType_s: 'REPORT_NEWKIND' },
    ];
    renderResults(container, docs, makeCtx({ groupBy: 'docType' }));
    expect($$('.hal-badge--doctype').map((b) => b.textContent)).toEqual(['Thesis', 'Report newkind']);
    expect($$('.hal-group__title').map((h) => h.textContent)).toEqual(['Thesis', 'Report newkind']);
    expect(container.textContent).not.toMatch(/THESE|REPORT_NEWKIND|these\b/);
  });

  it('lvl 2: + OA badge, keywords (deduplicated), domains, BibTeX and copy button', () => {
    renderResults(container, [RICH], makeCtx({ lvl: 2 }));
    expect($('.hal-badge--oa')?.textContent).toBe('Open Access');
    expect($$('.hal-article__keywords .hal-tag').map((n) => n.textContent)).toEqual(['graphs', 'versioning']);
    expect($$('.hal-article__domains .hal-tag--domain').map((n) => n.textContent)).toEqual(['Databases [cs.DB]']);
    expect($('.hal-action--bibtex')?.getAttribute('href')).toContain('wt=bibtex');
    const copy = $('.hal-action--copy') as HTMLButtonElement;
    expect(copy.tagName).toBe('BUTTON');
    expect(copy.type).toBe('button');
    expect(copy.textContent).toBe('Copy citation');
    expect($('.hal-abstract')).toBeNull();
  });

  it('lvl 3: + collapsible abstract', () => {
    renderResults(container, [RICH], makeCtx({ lvl: 3 }));
    expect($('.hal-abstract__label')?.textContent).toBe('Abstract');
    expect($('.hal-abstract__text')?.textContent?.replace('…', '')).toBe(LONG_ABSTRACT);
  });

  it('renders a placeholder title when the document has none', () => {
    renderResults(container, [{ uri_s: 'https://hal.science/x' }], makeCtx());
    expect(visibleText($('.hal-article__title'))).toBe('Untitled');
  });
});

// ---------------------------------------------------------------------------
// Authors
// ---------------------------------------------------------------------------

describe('authors', () => {
  it('truncates with "et al." after maxAuthors', () => {
    renderResults(container, [RICH], makeCtx({ maxAuthors: 2 }));
    expect($$('.hal-author').map((n) => n.textContent)).toEqual(['Alice Martin', 'Bob Durand']);
    expect(visibleText($('.hal-article__authors'))).toBe('Alice Martin, Bob Durand et al.');
  });

  it('shows every author when maxAuthors is 0', () => {
    renderResults(container, [RICH], makeCtx({ maxAuthors: 0 }));
    expect($$('.hal-author')).toHaveLength(4);
    expect($('.hal-article__etal')).toBeNull();
  });

  it('emphasises highlighted authors in <strong>', () => {
    renderResults(container, [RICH], makeCtx({ highlightAuthors: ['jey puget gil'] }));
    const strong = $$('.hal-article__authors strong');
    expect(strong.map((n) => n.textContent)).toEqual(['Jey Puget Gil']);
    expect(strong[0].classList.contains('hal-author--highlight')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Grouping and headings
// ---------------------------------------------------------------------------

describe('grouping and heading levels', () => {
  const docs: HalDoc[] = [
    { title_s: ['A'], producedDateY_i: 2024, docType_s: 'ART' },
    { title_s: ['B'], producedDateY_i: 2024, docType_s: 'COMM' },
    { title_s: ['C'], producedDateY_i: 2022, docType_s: 'ART' },
    { title_s: ['D'], docType_s: 'COMM' },
  ];

  it('no group headings for groupBy none', () => {
    renderResults(container, docs, makeCtx());
    expect($('.hal-group')).toBeNull();
    expect($$('.hal-list > li')).toHaveLength(4);
  });

  it('groupBy year: headings one level above the titles, order preserved', () => {
    renderResults(container, docs, makeCtx({ groupBy: 'year' }));
    const headings = $$('h2.hal-group__title');
    expect(headings.map((h) => h.textContent)).toEqual(['2024', '2022', 'Undated']);
    expect($$('.hal-group').map((g) => $$('.hal-group').indexOf(g) >= 0 && g.querySelectorAll('h3').length)).toEqual([2, 1, 1]);
    expect($$('h3 .hal-article__title-text').map((n) => n.textContent)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('groupBy docType uses readable labels', () => {
    renderResults(container, docs, makeCtx({ groupBy: 'docType' }));
    expect($$('.hal-group__title').map((h) => h.textContent)).toEqual(['Journal article', 'Conference paper']);
  });

  it('honours headingLevel for titles and groups', () => {
    renderResults(container, docs, makeCtx({ groupBy: 'year', headingLevel: 5 }));
    expect($$('h5.hal-article__title')).toHaveLength(4);
    expect($$('h4.hal-group__title')).toHaveLength(3);
  });

  it('never emits an h1: with headingLevel 2 groups stay h2', () => {
    renderResults(container, docs, makeCtx({ groupBy: 'year', headingLevel: 2 }));
    expect($('h1')).toBeNull();
    expect($$('h2.hal-group__title')).toHaveLength(3);
    expect($$('h2.hal-article__title')).toHaveLength(4);
  });

  it('works at lvl 0 too', () => {
    renderResults(container, docs, makeCtx({ lvl: 0, groupBy: 'year' }));
    expect($$('.hal-group__title')).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Links and security
// ---------------------------------------------------------------------------

describe('links and hostile data', () => {
  it('external links open in a new tab with a screen-reader hint', () => {
    renderResults(container, [RICH], makeCtx({ lvl: 2 }));
    const anchors = $$('a');
    expect(anchors.length).toBeGreaterThanOrEqual(5);
    for (const a of anchors) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
      expect(a.querySelector('.hal-visually-hidden')?.textContent).toBe(' (opens in a new tab)');
    }
  });

  it('only http(s) URLs become hrefs (javascript:, data: are dropped)', () => {
    const doc: HalDoc = {
      title_s: ['Evil'],
      label_s: 'Evil citation',
      uri_s: 'javascript:alert(1)',
      fileMain_s: ' data:text/html,<script>alert(2)</script>',
    };
    for (const lvl of [0, 1, 2, 3] as const) {
      renderResults(container, [doc], makeCtx({ lvl }));
      expect($('[href^="javascript"]')).toBeNull();
      for (const a of $$('[href]')) expect(a.getAttribute('href')).toMatch(/^https?:\/\//);
      expect($('.hal-action--pdf')).toBeNull();
    }
    renderResults(container, [doc], makeCtx({ lvl: 1 }));
    // The title is plain text, not an <a> without href
    expect($('.hal-article__title a')).toBeNull();
    expect(visibleText($('.hal-article__title'))).toBe('Evil');
  });

  it('renders hostile strings as text', () => {
    const evil = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const doc: HalDoc = {
      uri_s: 'https://hal.science/x',
      title_s: [evil],
      authFullName_s: [evil],
      journalTitle_s: evil,
      keyword_s: [evil],
      domain_s: [evil],
      docType_s: '"><svg onload=alert(3)>',
      abstract_s: [evil],
      language_s: ['"><b>'],
      citationFull_s: evil,
    };
    renderResults(container, [doc], makeCtx({ lvl: 3, highlightAuthors: [evil] }));
    expect($('img, script, svg, iframe, b')).toBeNull();
    expect(visibleText($('.hal-article__title'))).toBe(evil);
    expect($('.hal-article__venue')?.textContent).toBe(evil);
    expect($('.hal-tag')?.textContent).toBe(evil);
    // Unknown codes are humanised (never shown raw) and inserted as text.
    expect($('.hal-badge--doctype')?.textContent).toBe('"><svg onload=alert(3)>');
    expect($('[lang]')).toBeNull();

    renderError(container, new Error(evil), LABELS);
    expect($('img, script')).toBeNull();
    expect($('.hal-error')?.textContent).toBe(`Error: ${evil}`);
  });

  it('sets lang on title and abstract only for a single language', () => {
    renderResults(container, [RICH], makeCtx({ lvl: 3 }));
    expect($('.hal-article__title-text')?.getAttribute('lang')).toBe('en');
    expect($('.hal-abstract__text')?.getAttribute('lang')).toBe('en');
    // the screen-reader hint is not in the document language
    expect($('.hal-article__title .hal-visually-hidden')?.closest('[lang]')).toBeNull();

    renderResults(container, [{ ...RICH, language_s: ['en', 'fr'] }], makeCtx({ lvl: 3 }));
    expect($('[lang]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Abstract disclosure
// ---------------------------------------------------------------------------

describe('abstract toggle', () => {
  it('collapses long abstracts behind an aria-expanded button', () => {
    renderResults(container, [RICH], makeCtx({ lvl: 3 }));
    const toggle = $('.hal-abstract__toggle') as HTMLButtonElement;
    const more = $('.hal-abstract__more') as HTMLElement;
    expect(toggle.type).toBe('button');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe(more.id);
    expect(toggle.textContent).toBe('Show more');
    expect(more.hidden).toBe(true);
    expect(more.textContent).toContain('The final sentence');
    expect(document.getElementById(toggle.getAttribute('aria-describedby')!)?.textContent).toBe('Abstract');

    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent).toBe('Show less');
    expect(more.hidden).toBe(false);
    expect(($('.hal-abstract__ellipsis') as HTMLElement).hidden).toBe(true);

    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent).toBe('Show more');
    expect(more.hidden).toBe(true);
  });

  it('cuts on a word boundary', () => {
    renderResults(container, [RICH], makeCtx({ lvl: 3 }));
    const more = $('.hal-abstract__more') as HTMLElement;
    expect(more.textContent?.startsWith(' ')).toBe(true);
  });

  it('shows short abstracts in full, without toggle', () => {
    renderResults(container, [{ ...RICH, abstract_s: ['', 'Short &amp; <i>sweet</i>.'] }], makeCtx({ lvl: 3 }));
    expect($('.hal-abstract__toggle')).toBeNull();
    expect($('.hal-abstract__text')?.textContent).toBe('Short & sweet.');
  });

  it('gives each disclosure a unique id', () => {
    renderResults(container, [RICH, { ...RICH, docid: '456' }], makeCtx({ lvl: 3 }));
    const ids = $$('.hal-abstract__more').map((n) => n.id);
    expect(new Set(ids).size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Copy citation
// ---------------------------------------------------------------------------

describe('copy citation', () => {
  function setClipboard(value: unknown): void {
    Object.defineProperty(window.navigator, 'clipboard', { value, configurable: true });
  }

  it('copies the stripped citation and shows "Copied!" feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    renderResults(container, [RICH], makeCtx({ lvl: 2 }));
    vi.useFakeTimers();
    const button = $('.hal-action--copy') as HTMLButtonElement;
    button.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(writeText).toHaveBeenCalledWith('A. Martin. Graph versioning. 2024. ⟨hal-01⟩');
    expect(button.textContent).toBe('Copied!');
    expect($('.hal-live')?.textContent).toBe('Copied!');
    await vi.advanceTimersByTimeAsync(2000);
    expect(button.textContent).toBe('Copy citation');
  });

  it('falls back to the plain label when citationFull_s is missing', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    renderResults(container, [{ ...RICH, citationFull_s: undefined }], makeCtx({ lvl: 2 }));
    ($('.hal-action--copy') as HTMLButtonElement).click();
    await flush();
    expect(writeText).toHaveBeenCalledWith('A. Martin. Graph versioning. 2024. ⟨hal-01⟩');
  });

  it('uses execCommand when the Clipboard API rejects', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    const exec = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true });
    renderResults(container, [RICH], makeCtx({ lvl: 2 }));
    const button = $('.hal-action--copy') as HTMLButtonElement;
    button.click();
    await flush();
    expect(exec).toHaveBeenCalledWith('copy');
    expect(button.textContent).toBe('Copied!');
    expect(document.activeElement).toBe(button);
    // the temporary textarea is gone
    expect(document.body.querySelectorAll('textarea')).toHaveLength(0);
  });

  it('shows a selectable citation when copying is impossible', async () => {
    setClipboard(undefined);
    Object.defineProperty(document, 'execCommand', { value: vi.fn().mockReturnValue(false), configurable: true });
    renderResults(container, [RICH], makeCtx({ lvl: 2 }));
    const button = $('.hal-action--copy') as HTMLButtonElement;
    button.click();
    await flush();
    const area = $('.hal-citation') as HTMLTextAreaElement;
    expect(area).not.toBeNull();
    expect(area.readOnly).toBe(true);
    expect(area.value).toBe('A. Martin. Graph versioning. 2024. ⟨hal-01⟩');
    expect(document.activeElement).toBe(area);
    expect(button.textContent).toBe('Copy citation');
    // a second click reuses the same textarea
    button.click();
    await flush();
    expect($$('.hal-citation')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

describe('pagination', () => {
  const pageItems = (): string[] =>
    $$('.hal-pagination__list > li').map((li) => (li.querySelector('button')?.textContent ?? li.textContent ?? '').trim());

  function renderPage(currentPage: number, totalFound: number, onPageChange = vi.fn()) {
    renderResults(
      container,
      [RICH],
      makeCtx({ pagination: { currentPage, totalFound, rows: 10, start: (currentPage - 1) * 10 }, onPageChange }),
    );
    return onPageChange;
  }

  it('is a labelled nav of real buttons', () => {
    renderPage(1, 30);
    const nav = $('nav.hal-pagination') as HTMLElement;
    expect(nav.getAttribute('aria-label')).toBe('Search results pages');
    for (const b of Array.from(nav.querySelectorAll('button'))) expect(b.type).toBe('button');
  });

  it('is omitted when everything fits on one page', () => {
    renderPage(1, 10);
    expect($('.hal-pagination')).toBeNull();
  });

  it('numbers pages as 1 … 4 5 6 … 20 in the middle', () => {
    renderPage(5, 200);
    expect(pageItems()).toEqual(['1', '…', '4', '5', '6', '…', '20']);
    const current = $$('[aria-current]');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toBe('5');
    expect(current[0].getAttribute('aria-current')).toBe('page');
    expect(current[0].getAttribute('aria-label')).toBe('Page 5 of 20');
  });

  it('keeps a stable width near the edges', () => {
    renderPage(1, 200);
    expect(pageItems()).toEqual(['1', '2', '3', '4', '5', '…', '20']);
    renderPage(4, 200);
    expect(pageItems()).toEqual(['1', '2', '3', '4', '5', '…', '20']);
    renderPage(17, 200);
    expect(pageItems()).toEqual(['1', '…', '16', '17', '18', '19', '20']);
    renderPage(20, 200);
    expect(pageItems()).toEqual(['1', '…', '16', '17', '18', '19', '20']);
  });

  it('lists every page when there are few', () => {
    renderPage(3, 70);
    expect(pageItems()).toEqual(['1', '2', '3', '4', '5', '6', '7']);
  });

  it('hides gaps from assistive technologies', () => {
    renderPage(10, 200);
    const gaps = $$('.hal-pagination__gap');
    expect(gaps).toHaveLength(2);
    for (const gap of gaps) expect(gap.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('calls onPageChange from page, previous and next buttons', () => {
    const onPageChange = renderPage(5, 200);
    ($$('.hal-pagination__page').find((b) => b.textContent === '6') as HTMLButtonElement).click();
    ($('.hal-pagination__btn--prev') as HTMLButtonElement).click();
    ($('.hal-pagination__btn--next') as HTMLButtonElement).click();
    ($('[aria-current="page"]') as HTMLButtonElement).click(); // current page: no-op
    expect(onPageChange.mock.calls).toEqual([[6], [4], [6]]);
  });

  it('disables previous on the first page and next on the last page', () => {
    renderPage(1, 30);
    expect(($('.hal-pagination__btn--prev') as HTMLButtonElement).disabled).toBe(true);
    expect(($('.hal-pagination__btn--next') as HTMLButtonElement).disabled).toBe(false);
    expect(visibleText($('.hal-pagination__btn--prev'))).toContain('Previous');
    renderPage(3, 30);
    expect(($('.hal-pagination__btn--next') as HTMLButtonElement).disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// States, live region, focus, credit
// ---------------------------------------------------------------------------

describe('states and accessibility', () => {
  it('loading sets aria-busy and announces through a persistent polite live region', () => {
    renderLoading(container, LABELS);
    expect(container.getAttribute('aria-busy')).toBe('true');
    expect(container.classList.contains('hal-search')).toBe(true);
    const live = $('.hal-live') as HTMLElement;
    expect(live.getAttribute('role')).toBe('status');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toBe('Loading…');
    expect($('.hal-spinner')).not.toBeNull();

    renderResults(container, [RICH], makeCtx({ pagination: { currentPage: 2, totalFound: 1234, rows: 10, start: 10 } }));
    expect(container.hasAttribute('aria-busy')).toBe(false);
    expect($('.hal-live')).toBe(live);
    expect($$('.hal-live')).toHaveLength(1);
    expect(live.textContent).toMatch(/^1[,.\s  ]?234 results, Page 2 of 124$/);
    expect($('.hal-spinner')).toBeNull();
  });

  it('announces the count without page info on a single page', () => {
    renderResults(container, [RICH], makeCtx({ pagination: { currentPage: 1, totalFound: 3, rows: 10, start: 0 } }));
    expect($('.hal-live')?.textContent).toBe('3 results');
  });

  it('uses the singular form for exactly one result', () => {
    renderResults(container, [RICH], makeCtx({ pagination: { currentPage: 1, totalFound: 1, rows: 10, start: 0 } }));
    expect($('.hal-live')?.textContent).toBe('1 result');
  });

  it('error clears aria-busy and announces the message', () => {
    renderLoading(container, LABELS);
    renderError(container, new Error('HAL API error: 503'), LABELS);
    expect(container.hasAttribute('aria-busy')).toBe(false);
    expect($('.hal-error')?.textContent).toBe('Error: HAL API error: 503');
    expect($('.hal-live')?.textContent).toBe('Error: HAL API error: 503');
  });

  it('missing query: labels.missingQuery as an empty state, announced, aria-busy cleared', () => {
    renderResults(container, [RICH], makeCtx());
    renderLoading(container, LABELS);
    renderMissingQuery(container, LABELS);
    expect(container.hasAttribute('aria-busy')).toBe(false);
    expect($('.hal-empty.hal-empty--missing-query')?.textContent).toBe('No search criterion given.');
    expect($('.hal-live')?.textContent).toBe('No search criterion given.');
    expect($('.hal-article')).toBeNull();
    expect($('.hal-spinner')).toBeNull();
  });

  it('empty state uses labels.empty', () => {
    renderResults(container, [], makeCtx({ pagination: { currentPage: 1, totalFound: 0, rows: 10, start: 0 } }));
    expect($('.hal-empty')?.textContent).toBe('No results found.');
    expect($('.hal-live')?.textContent).toBe('No results found.');
    expect($('.hal-pagination')).toBeNull();
  });

  it('replaces previous content (e.g. an SVG) but keeps the live region', () => {
    container.appendChild(document.createElement('svg'));
    renderResults(container, [RICH], makeCtx());
    expect(container.children[0].classList.contains('hal-live')).toBe(true);
    expect(container.children).toHaveLength(2);
    expect(container.children[1].classList.contains('hal-results')).toBe(true);
  });

  it('moves focus to the start of the results only when focusResults is set', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    renderResults(container, [RICH], makeCtx());
    expect(document.activeElement).toBe(outside);

    renderResults(container, [RICH], makeCtx({ focusResults: true }));
    const results = $('.hal-results') as HTMLElement;
    expect(document.activeElement).toBe(results);
    expect(results.getAttribute('tabindex')).toBe('-1');
    outside.remove();
  });

  it('renders the credit footer only when showCredit is true', () => {
    renderResults(container, [RICH], makeCtx({ showCredit: true }));
    expect($('.hal-footer a')?.getAttribute('href')).toBe('https://github.com/JPugetGil/hal-search');
    renderResults(container, [RICH], makeCtx({ showCredit: false }));
    expect($('.hal-footer')).toBeNull();
  });

  it('keeps screen-reader-only text hidden even without the default stylesheet', () => {
    renderResults(container, [RICH], makeCtx());
    for (const node of $$('.hal-visually-hidden')) {
      expect(node.style.position).toBe('absolute');
      expect(node.style.width).toBe('1px');
    }
  });

  it('uses custom labels everywhere', () => {
    const fr: Labels = { ...LABELS, previous: 'Précédent', next: 'Suivant', pageInfo: 'Page {page} sur {pages}', copyCitation: 'Copier' };
    renderResults(container, [RICH], makeCtx({ lvl: 2, labels: fr, pagination: { currentPage: 1, totalFound: 30, rows: 10, start: 0 } }));
    expect($('.hal-pagination__btn--next .hal-pagination__label')?.textContent).toBe('Suivant');
    expect($('[aria-current="page"]')?.getAttribute('aria-label')).toBe('Page 1 sur 3');
    expect($('.hal-action--copy')?.textContent).toBe('Copier');
  });
});
