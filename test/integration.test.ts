// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HalSearch } from '../src/HalSearch';
import { fetchSvg } from '../src/headless';
import { resolvePalette } from '../src/theme';
import type { HalDoc } from '../src/types';
import { assertWellFormedXml } from './helpers/xml';

// Unmocked integration: HalSearch → api → renderer / svg → format, links, doctypes, theme, styles.
// Only `fetch` is stubbed. HTML and SVG must show the same data (display contract).

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DOCS: HalDoc[] = [
  {
    docid: '1',
    halId_s: 'hal-00000001',
    uri_s: 'https://hal.science/hal-00000001',
    title_s: ['Graphs &amp; versions'],
    // authFullName_s and authIdHalFullName_fs differ in casing (real HAL data)
    authFullName_s: ['Ada Lovelace', 'Jey Puget Gil', 'Émile Zola'],
    authIdHalFullName_fs: ['jpugetgil_FacetSep_Jey PUGET GIL'],
    producedDateY_i: 2024,
    docType_s: 'ART',
    journalTitle_s: 'Journal of Tests',
    doiId_s: '10.1000/xyz',
  },
  {
    docid: '2',
    uri_s: 'https://hal.science/hal-00000002',
    title_s: ['Condensed snapshots'],
    authFullName_s: ['Jey PUGET GIL'],
    authIdHalFullName_fs: ['jpugetgil_FacetSep_Jey PUGET GIL'],
    producedDateY_i: 2025,
    docType_s: 'UNDEFINED',
    conferenceTitle_s: 'BDA',
  },
];

function stubHal(docs: HalDoc[], numFound = docs.length) {
  const fetchMock = vi.fn(
    async (_url: string) =>
      new Response(JSON.stringify({ responseHeader: { status: 0, QTime: 1 }, response: { numFound, start: 0, docs } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

interface Shown {
  title: string;
  authors: string[];
  highlighted: string[];
  docType: string | undefined;
  year: string | undefined;
  venue: string | undefined;
}

/** What the HTML cards show. */
function fromHtml(container: HTMLElement): Shown[] {
  return [...container.querySelectorAll('.hal-article')].map((card) => ({
    title: card.querySelector('.hal-article__title-text')?.textContent ?? '',
    authors: [...card.querySelectorAll('.hal-author')].map((a) => a.textContent ?? ''),
    highlighted: [...card.querySelectorAll('.hal-author--highlight')].map((a) => a.textContent ?? ''),
    docType: card.querySelector('.hal-badge--doctype')?.textContent ?? undefined,
    year: card.querySelector('.hal-article__year')?.textContent ?? undefined,
    venue: card.querySelector('.hal-article__venue')?.textContent ?? undefined,
  }));
}

/** Decodes the escapes produced by escapeXml. */
function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Every text line and bold name of each SVG card (nested `<svg overflow="hidden">`).
 * Parsed from the string: happy-dom's HTML parser drops everything after an SVG `<style>`.
 */
function svgCards(svg: string): { texts: string[]; bold: string[] }[] {
  return [...svg.matchAll(/<svg x="[^"]*" y="[^"]*" width="[^"]*" height="[^"]*" overflow="hidden">([\s\S]*?)<\/svg>/g)].map(
    ([, card]) => ({
      texts: [...card.matchAll(/<text\b[^>]*>(.*?)<\/text>/g)].map((m) => unescapeXml(m[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()),
      bold: [...card.matchAll(/<tspan font-weight="700">(.*?)<\/tspan>/g)].map((m) => unescapeXml(m[1])),
    }),
  );
}

let container: HTMLElement;

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// HTML ⇔ SVG
// ---------------------------------------------------------------------------

describe('HTML and SVG outputs agree', () => {
  it('same title, authors, highlight (by idHal), doc type label, year and venue', async () => {
    const fetchMock = stubHal(DOCS);
    const options = { lvl: 1 as const, highlightAuthors: ['jpugetgil'] };
    await new HalSearch({ container, ...options, injectStyles: false }).search({ query: { idHal: 'jpugetgil' } });
    // The SVG of the SSR / headless path.
    const svgString = await fetchSvg({ ...options, query: { idHal: 'jpugetgil' } });

    // Levels ≥ 1 fetch the field that aligns idHal and names.
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('fl')).toContain('authIdHalFullName_fs');

    const html = fromHtml(container);
    expect(html).toEqual([
      {
        title: 'Graphs & versions',
        authors: ['Ada Lovelace', 'Jey Puget Gil', 'Émile Zola'],
        highlighted: ['Jey Puget Gil'],
        docType: 'Journal article',
        year: '2024',
        venue: 'Journal of Tests',
      },
      // UNDEFINED is never shown; the name matches case-insensitively
      { title: 'Condensed snapshots', authors: ['Jey PUGET GIL'], highlighted: ['Jey PUGET GIL'], docType: undefined, year: '2025', venue: 'BDA' },
    ]);

    assertWellFormedXml(svgString);
    const svg = svgCards(svgString);
    expect(svg).toHaveLength(html.length);
    html.forEach((card, i) => {
      const { texts, bold } = svg[i];
      expect(texts[0]).toBe(card.title);
      expect(texts).toContain(card.authors.join(', '));
      expect(bold).toEqual(card.highlighted);
      expect(texts).toContain([card.year, card.venue].filter(Boolean).join(' · '));
      if (card.docType) expect(texts).toContain(card.docType);
      else expect(texts.join(' ')).not.toMatch(/UNDEFINED|Undefined|Other/);
    });
    expect(container.hasAttribute('aria-busy')).toBe(false);
  });

  it('HalSearch inline SVG output is rendered and not left busy', async () => {
    stubHal(DOCS);
    await new HalSearch({ container, output: 'svg', injectStyles: false }).search({ query: { idHal: 'jpugetgil' } });
    // (happy-dom drops what follows the SVG <style>: the cards are checked on the fetchSvg string above.)
    expect(container.querySelector('svg > title')?.textContent).toBe('Publications – 2 results');
    expect(container.querySelector('svg > desc')?.textContent).toContain('Graphs & versions');
    expect(container.hasAttribute('aria-busy')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Theme 'auto' with color overrides: the real cascade
// ---------------------------------------------------------------------------

describe("theme 'auto' + color overrides", () => {
  const device = () => (window as unknown as { happyDOM: { settings: { device: { prefersColorScheme: string } } } }).happyDOM.settings.device;

  afterEach(() => {
    device().prefersColorScheme = 'light';
  });

  it.each(['light', 'dark'] as const)('HTML uses the %s palette the SVG uses for that scheme', async (scheme) => {
    device().prefersColorScheme = scheme;
    stubHal(DOCS);
    const colors = { backgroundColor: '#ffffff', mainColor: '#b45309' };
    const hs = new HalSearch({ container, theme: 'auto', ...colors });
    await hs.search({ query: { idHal: 'jpugetgil' } });

    const expected = resolvePalette({ ...colors, theme: scheme });
    const css = getComputedStyle(container);
    expect(css.getPropertyValue('--hal-card-bg').trim()).toBe('#ffffff');
    // In dark mode the default dark text (#e6edf3) would be unreadable on the white card.
    expect(css.getPropertyValue('--hal-text').trim()).toBe(expected.text);
    expect(css.getPropertyValue('--hal-accent').trim()).toBe('#b45309');
    expect(css.getPropertyValue('--hal-accent-text').trim()).toBe(expected.accentText);
    expect(css.getPropertyValue('--hal-domain-bg').trim()).toBe(expected.domainBg);
    expect(container.getAttribute('style') ?? '').toBe('');

    // Same colors as the SVG for that scheme.
    const svg = await fetchSvg({ query: { idHal: 'x' }, theme: 'auto', ...colors });
    const sheet = /<style>([\s\S]*?)<\/style>/.exec(svg)?.[1] ?? '';
    const [light, dark] = sheet.split('@media (prefers-color-scheme:dark){');
    expect(scheme === 'dark' ? dark : light).toContain(`.hal-text{fill:${expected.text}}`);
    expect(scheme === 'dark' ? dark : light).toContain(`.hal-card{fill:#ffffff;`);

    hs.destroy();
    expect(document.querySelector('style[data-hal-search-colors]')).toBeNull();
  });
});
