// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { HalSearch } from '../src/HalSearch';
import { defineHalSearchElement } from '../src/element';
import { renderResults } from '../src/renderer';
import type { HtmlRenderContext } from '../src/renderer';
import { resolveLabels } from '../src/labels';
import type { HalDoc } from '../src/types';

// The HTML widget, HalSearch and <hal-search> in French, against the real modules (fetch is stubbed).

const fr = (n: number) => new Intl.NumberFormat('fr').format(n);

const DOCS: HalDoc[] = [
  {
    docid: '1',
    uri_s: 'https://hal.science/hal-00000001v1',
    title_s: ['Condensed Representation for Snapshot-Based RDF Graphs'],
    authFullName_s: ['Jey Puget Gil'],
    producedDateY_i: 2025,
    docType_s: 'ART',
    journalTitle_s: 'Some Journal',
    openAccess_bool: true,
    language_s: ['en'],
    abstract_s: ['An abstract.'],
  },
  {
    docid: '2',
    uri_s: 'https://hal.science/hal-00000002v1',
    title_s: ['Un article sans date'],
    docType_s: 'COMM',
  },
];

function halBody(docs: HalDoc[], numFound = docs.length) {
  return { responseHeader: { status: 0, QTime: 1 }, response: { numFound, start: 0, docs } };
}

let fetchMock: ReturnType<typeof vi.fn>;

function replyWith(docs: HalDoc[], numFound = docs.length): void {
  fetchMock.mockImplementation(async () => new Response(JSON.stringify(halBody(docs, numFound))));
}

/** Lets microtasks (attribute coalescing) and settled promises run. */
const flush = () => new Promise((r) => setTimeout(r, 0));

const liveText = (root: ParentNode) => root.querySelector('.hal-live')?.textContent ?? '';

beforeAll(() => {
  defineHalSearchElement();
});

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('lang');
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  replyWith(DOCS, 9183);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

describe('renderResults in French', () => {
  function ctx(overrides: Partial<HtmlRenderContext> = {}): HtmlRenderContext {
    return {
      lvl: 3,
      labels: resolveLabels(undefined, 'fr'),
      pagination: { currentPage: 1, totalFound: 9183, rows: 10, start: 0 },
      headingLevel: 3,
      groupBy: 'none',
      maxAuthors: 10,
      highlightAuthors: [],
      showCredit: true,
      locale: 'fr',
      onPageChange: vi.fn(),
      ...overrides,
    };
  }

  it('formats the announced count for the locale, whatever the page language', () => {
    document.documentElement.lang = 'en';
    const container = document.createElement('div');
    document.body.appendChild(container);
    renderResults(container, DOCS, ctx());
    expect(liveText(container)).toBe(`${fr(9183)} résultats, Page 1 sur 919`);
  });

  it('renders French labels and document types', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    renderResults(container, DOCS, ctx({ groupBy: 'year' }));
    const text = container.textContent ?? '';
    expect(text).toContain('Article dans une revue');
    expect(text).toContain('Communication dans un congrès');
    expect(text).toContain('Libre accès');
    expect(text).toContain('Résumé');
    expect(text).toContain('(s’ouvre dans un nouvel onglet)');
    expect([...container.querySelectorAll('.hal-group__title')].map((h) => h.textContent)).toEqual(['2025', 'Sans date']);
    expect(container.querySelector('nav')?.getAttribute('aria-label')).toBe('Pages de résultats');
    expect(container.querySelector('.hal-pagination__btn--prev')?.textContent).toContain('Précédent');
    expect(container.querySelector('.hal-pagination__page')?.getAttribute('aria-label')).toBe('Page 1 sur 919');
  });

  it('keeps following the closest lang without an explicit locale', () => {
    const wrapper = document.createElement('div');
    wrapper.lang = 'fr';
    const container = document.createElement('div');
    wrapper.appendChild(container);
    document.body.appendChild(wrapper);
    renderResults(container, DOCS, ctx({ locale: undefined, labels: resolveLabels() }));
    expect(liveText(container)).toBe(`${fr(9183)} results, Page 1 of 919`);
  });
});

// ---------------------------------------------------------------------------
// HalSearch
// ---------------------------------------------------------------------------

describe('HalSearch with a locale', () => {
  function container(lang?: string): HTMLElement {
    const el = document.createElement('div');
    if (lang) el.setAttribute('lang', lang);
    document.body.appendChild(el);
    return el;
  }

  it('sets lang on the container, renders French and keeps per-title lang', async () => {
    const el = container();
    const hs = new HalSearch({ container: el, locale: 'fr', lvl: 3, injectStyles: false });
    expect(el.getAttribute('lang')).toBe('fr');
    await hs.search({ query: { idHal: 'jpugetgil' } });
    expect(liveText(el)).toBe(`${fr(9183)} résultats, Page 1 sur 919`);
    expect(el.textContent).toContain('Article dans une revue');
    expect(el.querySelector('.hal-article__title-text')?.getAttribute('lang')).toBe('en');
    hs.destroy();
    expect(el.hasAttribute('lang')).toBe(false);
  });

  it('fetches and shows HAL’s French domain labels', async () => {
    replyWith([
      {
        ...DOCS[0],
        domain_s: ['0.info', '1.info.info-db'],
        fr_domainAllCodeLabel_fs: ['info_FacetSep_Informatique [cs]', 'info.info-db_FacetSep_Informatique [cs]/Base de données [cs.DB]'],
      },
    ]);
    const el = container();
    const hs = new HalSearch({ container: el, locale: 'fr', lvl: 2, injectStyles: false });
    await hs.search({ query: { idHal: 'jpugetgil' } });
    const fl = new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('fl')?.split(',');
    expect(fl).toContain('fr_domainAllCodeLabel_fs');
    expect(el.querySelector('.hal-tag--domain')?.textContent).toBe('Base de données [cs.DB]');
  });

  it('restores the previous lang of the container on destroy', () => {
    const el = container('de');
    const hs = new HalSearch({ container: el, locale: 'fr-FR', injectStyles: false });
    expect(el.getAttribute('lang')).toBe('fr');
    hs.destroy();
    expect(el.getAttribute('lang')).toBe('de');
  });

  it('does not touch lang without a locale (page language, English labels)', async () => {
    const el = container('es');
    const hs = new HalSearch({ container: el, injectStyles: false });
    await hs.search({ query: { idHal: 'jpugetgil' } });
    expect(el.getAttribute('lang')).toBe('es');
    expect(el.textContent).toContain('Journal article');
    hs.destroy();
    expect(el.getAttribute('lang')).toBe('es');
  });

  it('falls back to English for an unknown locale, and says so', async () => {
    const el = container();
    const hs = new HalSearch({ container: el, locale: 'xx', injectStyles: false });
    expect(el.getAttribute('lang')).toBe('en');
    await hs.search({ query: { idHal: 'jpugetgil' } });
    expect(liveText(el)).toBe('9,183 results, Page 1 of 919');
  });

  it('applies labels overrides on top of French', async () => {
    const el = container();
    const hs = new HalSearch({
      container: el,
      locale: 'fr',
      labels: { resultCount: '{count} travaux', docTypes: { ART: 'Article' } },
      injectStyles: false,
    });
    await hs.search({ query: { idHal: 'jpugetgil' } });
    expect(liveText(el)).toBe(`${fr(9183)} travaux, Page 1 sur 919`);
    expect(el.querySelector('.hal-badge--doctype')?.textContent).toBe('Article');
    expect(el.textContent).toContain('Communication dans un congrès');
  });

  it('renders the inline SVG in French', async () => {
    const el = container();
    const hs = new HalSearch({ container: el, locale: 'fr', output: 'svg', injectStyles: false });
    await hs.search({ query: { idHal: 'jpugetgil' } });
    const svg = el.querySelector('svg');
    expect(svg?.getAttribute('lang')).toBe('fr');
    // happy-dom drops what follows the SVG <style>: the body is covered by the renderSvg tests.
    expect(svg?.querySelector('title')?.textContent).toBe(`Publications – ${fr(9183)} résultats`);
    expect(el.getAttribute('lang')).toBe('fr');
  });
});

// ---------------------------------------------------------------------------
// <hal-search lang>
// ---------------------------------------------------------------------------

describe('<hal-search lang>', () => {
  function create(attrs: Record<string, string>): HTMLElement {
    const el = document.createElement('hal-search');
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    return el;
  }

  const mountOf = (el: HTMLElement) => el.shadowRoot!.querySelector('[part="container"]') as HTMLElement;

  it('renders in French and marks the widget root', async () => {
    const el = create({ 'id-hal': 'jpugetgil', lang: 'fr', lvl: '2' });
    await flush();
    await flush();
    const mount = mountOf(el);
    expect(mount.getAttribute('lang')).toBe('fr');
    expect(liveText(mount)).toBe(`${fr(9183)} résultats, Page 1 sur 919`);
    expect(mount.textContent).toContain('Libre accès');
  });

  it('accepts region subtags and switches language when the attribute changes', async () => {
    const el = create({ 'id-hal': 'jpugetgil', lang: 'fr-CA' });
    await flush();
    await flush();
    expect(mountOf(el).getAttribute('lang')).toBe('fr');

    el.setAttribute('lang', 'en');
    await flush();
    await flush();
    expect(mountOf(el).getAttribute('lang')).toBe('en');
    expect(liveText(mountOf(el))).toBe('9,183 results, Page 1 of 919');
  });

  it('keeps English without lang or with an unsupported language', async () => {
    const el = create({ 'id-hal': 'jpugetgil', lang: 'de' });
    await flush();
    await flush();
    const mount = mountOf(el);
    // The host keeps its own lang; the widget does not claim another one.
    expect(mount.hasAttribute('lang')).toBe(false);
    expect(mount.textContent).toContain('Journal article');
  });

  it('applies the labels attribute on top of French', async () => {
    const el = create({ 'id-hal': 'jpugetgil', lang: 'fr', labels: '{"docTypes":{"ART":"Article"}}' });
    await flush();
    await flush();
    const mount = mountOf(el);
    expect(mount.querySelector('.hal-badge--doctype')?.textContent).toBe('Article');
    expect(mount.textContent).toContain('Communication dans un congrès');
  });
});
