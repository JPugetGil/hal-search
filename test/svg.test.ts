import { describe, expect, it, vi } from 'vitest';

// Fixed document type labels: snapshots must not change when DOC_TYPE_LABELS is reworded.
vi.mock('../src/doctypes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/doctypes')>()),
  DOC_TYPE_LABELS: { ART: 'Journal article', COMM: 'Conference paper', THESE: 'Thesis', OTHER: 'Other publication' },
}));

import { measureText, renderErrorSvg, renderSvg } from '../src/svg';
import { DARK_PALETTE, LIGHT_PALETTE } from '../src/theme';
import type { DetailLevel, HalDoc, SvgRenderOptions } from '../src/types';
import { assertWellFormedXml } from './helpers/xml';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ABSTRACT =
  'A Knowledge Graph (KG) is a structured representation of facts where entities are connected by typed relationships, ' +
  'typically encoded using the Resource Description Framework (RDF) standard. KGs are widely used across domains such as ' +
  'life sciences, urban planning, and weather forecasting, but evolve continuously as data is updated, corrected, and expanded. ' +
  'Managing this evolution through explicit versioning is essential for reproducibility.';

const DOCS: HalDoc[] = [
  {
    docid: '5726064',
    halId_s: 'hal-05726064',
    uri_s: 'https://hal.science/hal-05726064v1',
    label_s:
      'Jey Puget Gil, Emmanuel Coquery, John Samuel, Gilles Gesquière. ConVer-G: A Suite for Versioning, Querying and ' +
      'Visualization of Dynamic Knowledge Graphs. Journal of Open Source Software, 2026, 11 (124), pp.10828. ' +
      '&#x27E8;10.21105/joss.10828&#x27E9;. &#x27E8;hal-05726064&#x27E9;',
    title_s: ['ConVer-G: A Suite for Versioning, Querying and Visualization of Dynamic Knowledge Graphs'],
    authFullName_s: ['Jey Puget Gil', 'Emmanuel Coquery', 'John Samuel', 'Gilles Gesquière'],
    authIdHalFullName_fs: [
      'jpugetgil_FacetSep_Jey PUGET GIL',
      '_FacetSep_Emmanuel Coquery',
      'john-samuel_FacetSep_John Samuel',
      'gilles-gesquiere_FacetSep_Gilles Gesquière',
    ],
    producedDateY_i: 2026,
    docType_s: 'ART',
    journalTitle_s: 'Journal of Open Source Software',
    openAccess_bool: true,
    keyword_s: ['Semantic web', 'SPARQL', 'RDF', 'Knowledge graph'],
    domain_s: ['0.info', '1.info.info-db'],
    en_domainAllCodeLabel_fs: [
      'info_FacetSep_Computer Science [cs]',
      'info.info-db_FacetSep_Computer Science [cs]/Databases [cs.DB]',
    ],
    abstract_s: [ABSTRACT],
  },
  {
    docid: '4690144',
    uri_s: 'https://hal.science/hal-04690144v1',
    label_s: 'Jey PUGET GIL, Emmanuel Coquery. ConVer-G: Concurrent versioning of knowledge graphs. BDA, Oct 2024, Orléans, France.',
    title_s: ['ConVer-G: Concurrent versioning of knowledge graphs'],
    authFullName_s: ['Jey PUGET GIL', 'Emmanuel Coquery'],
    authIdHalFullName_fs: ['jpugetgil_FacetSep_Jey PUGET GIL'],
    producedDateY_i: 2024,
    docType_s: 'COMM',
    conferenceTitle_s: '40ème conférence sur la gestion des données (BDA)',
    openAccess_bool: false,
    keyword_s: ['Graph', 'RDF', 'Versioning'],
  },
  {
    docid: '5560970',
    uri_s: 'https://hal.science/hal-05175454v3',
    label_s: 'Jey Puget Gil. Condensed Representation for Snapshot-Based RDF Graphs. 2025.',
    title_s: ['Condensed Representation for Snapshot-Based RDF Graphs'],
    authFullName_s: ['Jey Puget Gil'],
    producedDateY_i: 2025,
    docType_s: 'UNDEFINED',
  },
];

const HOSTILE: HalDoc = {
  docid: '666',
  uri_s: 'javascript:alert(1)',
  label_s: '<script>alert(1)</script>',
  title_s: ['</text><script>alert("x")</script> & <b>bold</b> ' + 'W'.repeat(150)],
  authFullName_s: ['Robert"); DROP TABLE--', '<img src=x onerror=alert(1)>', 'A'.repeat(300)],
  producedDateY_i: 2024,
  docType_s: '<svg onload=alert(1)>',
  journalTitle_s: ']]></style><style>*{fill:red}</style>',
  keyword_s: ['<k1>', '&amp;', 'x'.repeat(300)],
  openAccess_bool: true,
  abstract_s: ['<script>alert(1)</script>Abstract &amp; <i>markup</i> \u0001\u0008 control \ud800 chars'],
};

function render(docs: HalDoc[], options: Partial<SvgRenderOptions> = {}): string {
  return renderSvg(docs, { totalFound: 1234, halUrl: 'https://cv.hal.science/jpugetgil', highlightAuthors: ['jpugetgil'], ...options });
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

/** Decodes the escapes produced by escapeXml (for measuring and asserting text content). */
function unescape(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** All visible strings of the SVG (text elements, tspans flattened). */
function texts(svg: string): string[] {
  // Whitespace is collapsed like the SVG renderer does (default xml:space handling).
  return [...svg.matchAll(/<text\b[^>]*>(.*?)<\/text>/g)].map((m) => unescape(m[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' '));
}

/** Card inner boxes: their text and pills must never exceed the inner width. */
function assertTextFitsCards(svg: string): void {
  const cards = [...svg.matchAll(/<svg x="[\d.]+" y="[\d.]+" width="([\d.]+)" height="[\d.]+" overflow="hidden">([\s\S]*?)<\/svg>/g)];
  expect(cards.length).toBeGreaterThan(0);
  for (const [, w, body] of cards) {
    const innerW = Number(w) - 32;
    for (const m of body.matchAll(/<text x="([\d.-]+)" y="[\d.-]+" class="[\w-]+" font-size="([\d.]+)"( font-weight="700")?( text-anchor="middle")?>(.*?)<\/text>/g)) {
      const [, x, size, bold, middle, content] = m;
      let width = 0;
      for (const seg of content.split(/(<tspan font-weight="700">.*?<\/tspan>)/)) {
        const isBold = Boolean(bold) || seg.startsWith('<tspan');
        width += measureText(unescape(seg.replace(/<[^>]+>/g, '')), Number(size), isBold);
      }
      const left = middle ? Number(x) - width / 2 : Number(x);
      expect(left, content).toBeGreaterThanOrEqual(-0.1);
      expect(left + width, content).toBeLessThanOrEqual(innerW + 0.1);
    }
    for (const m of body.matchAll(/<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)" height="20"/g)) {
      expect(Number(m[1]) + Number(m[2])).toBeLessThanOrEqual(innerW + 0.1);
    }
  }
}

// ---------------------------------------------------------------------------
// Document structure
// ---------------------------------------------------------------------------

describe('renderSvg — document', () => {
  const levels: DetailLevel[] = [0, 1, 2, 3];

  it.each(levels.flatMap((lvl) => (['light', 'dark', 'auto'] as const).map((theme) => [lvl, theme] as const)))(
    'lvl %i / %s is a well-formed standalone SVG',
    (lvl, theme) => {
      const svg = render(DOCS, { lvl, theme, groupBy: 'year' });
      assertWellFormedXml(svg);
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" ')).toBe(true);
      const [, w, h, vw, vh] = /width="(\d+)" height="([\d.]+)" viewBox="0 0 (\d+) ([\d.]+)"/.exec(svg) ?? [];
      expect(w).toBe('800');
      expect(vw).toBe(w);
      expect(vh).toBe(h);
      expect(svg).toContain('role="img"');
      expect(svg).toMatch(/^<svg[^>]*>\n<title>Publications – 1,234 results<\/title>/);
    },
  );

  it('is deterministic', () => {
    expect(render(DOCS, { lvl: 3, theme: 'auto' })).toBe(render(DOCS, { lvl: 3, theme: 'auto' }));
  });

  it('scales from an explicit width', () => {
    expect(render(DOCS, { width: 400 })).toMatch(/width="400" height="[\d.]+" viewBox="0 0 400 /);
    expect(render(DOCS, { width: 10 })).toContain('width="320"');
    expect(render(DOCS, { width: Number.NaN })).toContain('width="800"');
  });

  it('describes the documents for assistive technologies', () => {
    expect(render(DOCS)).toContain('<desc>ConVer-G: A Suite for Versioning');
  });

  it('never contains scripts, event handlers or javascript: URLs', () => {
    for (const svg of [render([...DOCS, HOSTILE], { lvl: 3, theme: 'auto' }), render([HOSTILE], { lvl: 0 })]) {
      expect(svg).not.toMatch(/<script/i);
      // Event handler attributes inside real tags (escaped text such as `&lt;img onerror=` is harmless).
      expect(svg).not.toMatch(/<[^>]*\son\w+="/i);
      expect(svg).not.toMatch(/javascript:/i);
      expect(svg).not.toMatch(/<foreignObject/i);
    }
  });
});

// ---------------------------------------------------------------------------
// Security
// ---------------------------------------------------------------------------

describe('renderSvg — escaping', () => {
  const svg = render([HOSTILE], {
    lvl: 3,
    title: '<script>alert(1)</script>',
    halUrl: 'javascript:alert(1)',
    mainColor: 'red;}</style><script>alert(1)</script>',
    backgroundColor: 'url(https://evil.example/x)',
    highlightAuthors: ['<img src=x onerror=alert(1)>'],
    labels: { title: '<b>x</b>', etAl: '<i>', empty: '&' },
  });

  it('stays well-formed with hostile data', () => {
    assertWellFormedXml(svg);
  });

  it('escapes titles, authors, venues, keywords and doc types', () => {
    expect(svg).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(svg).toContain('&lt;/text&gt;&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &lt;b&gt;bold&lt;/b&gt;');
    expect(svg).toContain('Robert&quot;); DROP TABLE--');
    expect(svg).toContain('<tspan font-weight="700">&lt;img src=x onerror=alert(1)&gt;</tspan>');
    expect(svg).toContain(']]&gt;&lt;/style&gt;&lt;style&gt;*{fill:red}&lt;/style&gt;');
    expect(svg).toContain('&lt;k1&gt;');
    expect(svg).toContain('&lt;svg onload=alert(1)&gt;');
  });

  it('keeps a single, untouched stylesheet', () => {
    expect(svg.match(/<style>/g)).toHaveLength(1);
    expect(svg).not.toContain('evil.example');
    expect(svg).not.toContain('red;');
    expect(svg).toContain(`fill:${LIGHT_PALETTE.accent}`);
  });

  it('only links http(s) URLs', () => {
    const hrefs = [...svg.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(['https://github.com/JPugetGil/hal-search']);
  });

  it('strips markup and invalid characters from the abstract', () => {
    expect(texts(svg)).toContain('Abstract & markup control chars');
  });

  it('keeps every line inside its card', () => {
    assertTextFitsCards(svg);
    assertTextFitsCards(render([HOSTILE, ...DOCS], { lvl: 3, width: 320, maxAuthors: 0 }));
  });
});

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

describe('renderSvg — theme', () => {
  it('light renders the light palette only', () => {
    const svg = render(DOCS, { theme: 'light' });
    expect(svg).toContain(`.hal-bg{fill:${LIGHT_PALETTE.surface}`);
    expect(svg).not.toContain('prefers-color-scheme');
  });

  it('dark renders the dark palette only', () => {
    const svg = render(DOCS, { theme: 'dark' });
    expect(svg).toContain(`.hal-bg{fill:${DARK_PALETTE.surface}`);
    expect(svg).not.toContain(`fill:${LIGHT_PALETTE.accent}`);
    expect(svg).not.toContain('prefers-color-scheme');
  });

  it('auto switches with a prefers-color-scheme media query', () => {
    const svg = render(DOCS, { theme: 'auto' });
    const [light, dark] = svg.split('@media (prefers-color-scheme:dark){');
    expect(dark).toBeDefined();
    expect(light).toContain(`.hal-bg{fill:${LIGHT_PALETTE.surface}`);
    expect(dark).toContain(`.hal-bg{fill:${DARK_PALETTE.surface}`);
  });

  it('applies color overrides on top of both palettes', () => {
    const svg = render(DOCS, { theme: 'auto', mainColor: '#b45309' });
    const [light, dark] = svg.split('@media');
    expect(light).toContain('.hal-head{fill:#b45309}');
    expect(dark).toContain('.hal-head{fill:#b45309}');
  });

  /** Fill of the first `.cls{fill:…}` rule (light set when the theme is auto). */
  const fillOf = (svg: string, cls: string) => new RegExp(`\\.${cls}\\{fill:([^;}]*)`).exec(svg)?.[1];

  it('keeps the text readable on a named dark background (bg=black)', () => {
    for (const theme of ['light', 'dark', 'auto'] as const) {
      const svg = render(DOCS, { theme, backgroundColor: 'black', lvl: 2 });
      expect(fillOf(svg, 'hal-card')).toBe('black');
      expect(fillOf(svg, 'hal-text')).toBe(DARK_PALETTE.text);
      expect(fillOf(svg, 'hal-text')).toBe(fillOf(render(DOCS, { theme, backgroundColor: '#000000', lvl: 2 }), 'hal-text'));
    }
  });

  it('draws dark ink on a named light accent (main=yellow)', () => {
    for (const theme of ['light', 'dark', 'auto'] as const) {
      const svg = render(DOCS, { theme, mainColor: 'yellow' });
      expect(fillOf(svg, 'hal-head')).toBe('yellow');
      expect(fillOf(svg, 'hal-head-text')).not.toBe('#ffffff');
      expect(fillOf(svg, 'hal-head-text')).toBe(fillOf(render(DOCS, { theme, mainColor: '#ffff00' }), 'hal-head-text'));
    }
  });

  it('stays well-formed XML whatever the color whitespace (U+000B / U+000C are rejected)', () => {
    const svg = render(DOCS, { backgroundColor: 'rgb(1\u000b2\u000b3)', mainColor: 'hsl(1\u000c2%\u000c3%)', textColor: 'rgb(1\n2\t3)' });
    assertWellFormedXml(svg);
    expect(svg).not.toMatch(/[\u000b\u000c]/);
    expect(fillOf(svg, 'hal-card')).toBe(LIGHT_PALETTE.cardBg);
    expect(fillOf(svg, 'hal-head')).toBe(LIGHT_PALETTE.accent);
    expect(fillOf(svg, 'hal-text')).toBe('rgb(1\n2\t3)');
  });

  it('defaults to light for unknown themes', () => {
    expect(render(DOCS, { theme: 'neon' as never })).toContain(`.hal-bg{fill:${LIGHT_PALETTE.surface}`);
  });

  it('scopes every rule to a class of the root element', () => {
    const svg = render(DOCS, { theme: 'auto' });
    const scope = /class="hal-svg (hal-svg-[a-z0-9]+)"/.exec(svg)?.[1];
    expect(scope).toBeDefined();
    const css = /<style>(.*)<\/style>/.exec(svg)?.[1] ?? '';
    const selectors = css
      .replace(/@media[^{]*\{/, '')
      .split('}')
      .map((rule) => rule.split('{')[0])
      .filter(Boolean)
      .flatMap((sel) => sel.split(','));
    for (const sel of selectors) expect(sel.startsWith(`.${scope} `), sel).toBe(true);
    // Different colors never share a scope (several inline SVGs on one page).
    expect(render(DOCS, { theme: 'auto', mainColor: '#b45309' })).not.toContain(scope);
  });
});

// ---------------------------------------------------------------------------
// Display contract
// ---------------------------------------------------------------------------

describe('renderSvg — content', () => {
  it('lvl 0 shows the decoded citation linking to HAL', () => {
    const svg = render(DOCS, { lvl: 0 });
    expect(texts(svg).join(' ')).toContain('⟨10.21105/joss.10828⟩');
    expect(svg).toContain('<a href="https://hal.science/hal-05726064v1"');
    expect(svg).not.toContain('Journal article');
    expect(svg).not.toContain('Open Access');
  });

  it('lvl 1 shows title, authors, year, venue and doc type label', () => {
    const svg = render(DOCS, { lvl: 1 });
    const all = texts(svg);
    expect(all).toContain('ConVer-G: A Suite for Versioning, Querying and Visualization of Dynamic Knowledge Graphs');
    expect(all).toContain('Jey Puget Gil, Emmanuel Coquery, John Samuel, Gilles Gesquière');
    expect(all).toContain('2026 · Journal of Open Source Software');
    expect(all).toContain('2024 · 40ème conférence sur la gestion des données (BDA)');
    expect(all).toContain('Journal article');
    expect(all).toContain('Conference paper');
    expect(svg).not.toContain('Open Access');
    expect(svg).not.toContain('SPARQL');
    expect(svg).not.toContain('Abstract');
  });

  it('never shows raw doc type codes and hides UNDEFINED', () => {
    const all = texts(render(DOCS, { lvl: 2 }));
    for (const code of ['ART', 'COMM', 'UNDEFINED']) expect(all).not.toContain(code);
    expect(all).toContain('2025');
  });

  it('emphasises highlighted authors, by idHal across name casings', () => {
    const svg = render(DOCS, { lvl: 1 });
    expect(svg).toContain('<tspan font-weight="700">Jey Puget Gil</tspan>, Emmanuel Coquery');
    expect(svg).toContain('<tspan font-weight="700">Jey PUGET GIL</tspan>, Emmanuel Coquery');
    expect(render(DOCS, { lvl: 1, highlightAuthors: [] })).not.toContain('<tspan');
  });

  it('truncates authors with "et al." after maxAuthors', () => {
    const all = texts(render(DOCS, { lvl: 1, maxAuthors: 2 }));
    expect(all).toContain('Jey Puget Gil, Emmanuel Coquery, et al.');
  });

  it('cuts long author lists at two lines with "et al."', () => {
    const doc: HalDoc = { title_s: ['Big collaboration'], authFullName_s: Array.from({ length: 80 }, (_, i) => `Author Number${i}`) };
    const svg = render([doc], { lvl: 1, maxAuthors: 0 });
    const lines = texts(svg).filter((t) => t.includes('Author Number'));
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith(', et al.')).toBe(true);
    assertTextFitsCards(svg);
  });

  it('lvl 2 adds the Open Access pill, domains and keywords', () => {
    const all = texts(render(DOCS, { lvl: 2 }));
    expect(all.filter((t) => t === 'Open Access')).toHaveLength(1);
    expect(all).toContain('Databases [cs.DB]');
    expect(all).toContain('SPARQL');
    expect(all).not.toContain('Abstract');
  });

  it('lvl 3 adds the abstract on at most three lines', () => {
    const svg = render(DOCS, { lvl: 3 });
    const all = texts(svg);
    const start = all.indexOf('Abstract');
    expect(start).toBeGreaterThan(-1);
    const lines = all.slice(start + 1, start + 4);
    expect(lines[0].startsWith('A Knowledge Graph (KG)')).toBe(true);
    expect(lines[2].endsWith('…')).toBe(true);
    expect(all[start + 4]).not.toMatch(/^(reproducibility|Managing)/);
  });

  it('inserts group headings in the incoming order', () => {
    const headings = (svg: string) => [...svg.matchAll(/font-size="13" font-weight="700">([^<]+)<\/text>/g)].map((m) => m[1]);
    expect(headings(render(DOCS, { groupBy: 'year' }))).toEqual(['2026', '2024', '2025']);
    expect(headings(render(DOCS, { groupBy: 'docType' }))).toEqual(['Journal article', 'Conference paper', 'Other publication']);
    expect(headings(render(DOCS, { groupBy: 'none' }))).toEqual([]);
  });

  it('shows the empty state', () => {
    const svg = renderSvg([], { totalFound: 0 });
    assertWellFormedXml(svg);
    expect(texts(svg)).toContain('No results found.');
    expect(svg).not.toContain('View all');
  });
});

// ---------------------------------------------------------------------------
// Header and footer
// ---------------------------------------------------------------------------

describe('renderSvg — header and footer', () => {
  it('shows the title and the formatted result count', () => {
    const all = texts(render(DOCS, { title: '  My   papers ' }));
    expect(all).toContain('My papers');
    expect(all).toContain('1,234 results');
    expect(texts(render(DOCS))).toContain('Publications');
  });

  it('uses singular labels for exactly one result', () => {
    const all = texts(renderSvg([DOCS[0]], { totalFound: 1, halUrl: 'https://hal.science/x' }));
    expect(all).toContain('1 result');
    expect(all).toContain('View this publication on HAL');
    expect(all).not.toContain('1 results');
  });

  it('links the footer to the HAL list', () => {
    const svg = render(DOCS);
    expect(svg).toMatch(/<a href="https:\/\/cv\.hal\.science\/jpugetgil"[^>]*><text[^>]*>View all 1,234 publications on HAL<\/text><\/a>/);
    expect(svg).not.toMatch(/Page \d/);
  });

  it('shows the footer text without a link when halUrl is missing', () => {
    const svg = renderSvg(DOCS, { totalFound: 3 });
    expect(texts(svg)).toContain('View all 3 publications on HAL');
    expect(svg).not.toMatch(/<a [^>]*><text[^>]*>View all/);
    expect(svg).not.toContain('cv.hal.science');
  });

  it('shows the credit unless showCredit is false', () => {
    expect(render(DOCS)).toContain('href="https://github.com/JPugetGil/hal-search"');
    const svg = render(DOCS, { showCredit: false });
    expect(svg).not.toContain('github.com');
    expect(texts(svg)).not.toContain('hal-search');
  });

  it('uses label overrides', () => {
    const all = texts(
      render(DOCS, {
        lvl: 3,
        maxAuthors: 1,
        labels: {
          title: 'Publications',
          resultCount: '{count} résultats',
          viewOnHal: 'Voir les {count} publications sur HAL',
          abstract: 'Résumé',
          etAl: 'et coll.',
          openAccess: 'Accès ouvert',
          docTypes: { ART: 'Article' },
        },
      }),
    );
    expect(all).toEqual(expect.arrayContaining(['1,234 résultats', 'Voir les 1,234 publications sur HAL', 'Résumé', 'Accès ouvert', 'Article']));
    expect(all).toContain('Jey Puget Gil, et coll.');
  });
});

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

describe('renderSvg — snapshots', () => {
  it.each([0, 1, 2, 3] as const)('lvl %i', (lvl) => {
    expect(render(DOCS, { lvl, theme: lvl % 2 ? 'auto' : 'light' })).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// Error SVG
// ---------------------------------------------------------------------------

describe('renderErrorSvg', () => {
  it('renders an escaped, well-formed message', () => {
    const svg = renderErrorSvg('Error: <b>HAL</b> & "timeout"');
    assertWellFormedXml(svg);
    expect(svg).toContain('Error: &lt;b&gt;HAL&lt;/b&gt; &amp; &quot;timeout&quot;');
    expect(svg).toContain('role="img"');
    expect(svg).toContain(`fill:${LIGHT_PALETTE.errorBg}`);
    expect(svg).not.toMatch(/<script/i);
  });

  it('supports the dark and auto themes and a custom width', () => {
    expect(renderErrorSvg('x', { theme: 'dark' })).toContain(`fill:${DARK_PALETTE.errorBg}`);
    expect(renderErrorSvg('x', { theme: 'auto' })).toContain('@media (prefers-color-scheme:dark)');
    expect(renderErrorSvg('x', { width: 400 })).toMatch(/width="400"/);
  });

  it('wraps long messages', () => {
    const svg = renderErrorSvg('word '.repeat(200), { width: 320 });
    assertWellFormedXml(svg);
    expect(texts(svg).filter((t) => t.startsWith('word')).length).toBeLessThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------
// The well-formedness checker itself
// ---------------------------------------------------------------------------

describe('assertWellFormedXml (test helper)', () => {
  it('accepts a minimal SVG with tab/LF/CR and surrogate pairs', () => {
    expect(() => assertWellFormedXml('<svg a="1"><style>a{fill:rgb(1\t2\n3)}</style><text>📖 &amp;</text></svg>')).not.toThrow();
  });

  it.each([
    ['U+000B in <style>', '<svg><style>a{fill:rgb(1\u000b2\u000b3)}</style></svg>'],
    ['U+000C in text', '<svg><text>a\u000cb</text></svg>'],
    ['U+FFFF in an attribute', '<svg a="\uffff"></svg>'],
    ['a lone surrogate', '<svg><text>\ud800x</text></svg>'],
    ['an unescaped &', '<svg><text>a & b</text></svg>'],
    ['unbalanced tags', '<svg><text></svg>'],
    ['two roots', '<svg></svg><svg></svg>'],
  ])('rejects %s', (_label, xml) => {
    expect(() => assertWellFormedXml(xml)).toThrow();
  });
});
