import { describe, expect, it, vi } from 'vitest';

// theme.ts is owned by another agent: use a minimal, predictable color validator.
vi.mock('../src/theme', () => ({
  isSafeColor: (value: string) => /^#[0-9a-f]{3,8}$/i.test(value),
}));

import {
  WEB_COMPONENT_ATTRIBUTES,
  buildEmbedSnippet,
  buildEmbedUrl,
  buildMarkdownSnippet,
  buildSvgUrl,
  buildWebComponentSnippet,
} from '../src/embed';
import { parseUrlParams } from '../src/url-params';

// ---------------------------------------------------------------------------
// Embed page (iframe)
// ---------------------------------------------------------------------------

describe('buildEmbedUrl', () => {
  it('uses the public URL scheme and tolerates a trailing slash', () => {
    expect(buildEmbedUrl({ embedBase: 'https://x.example/', query: { idHal: 'jpugetgil' }, lvl: 2, output: 'svg' })).toBe(
      'https://x.example/embed.html?idHal=jpugetgil&lvl=2&output=svg',
    );
    expect(buildEmbedUrl({ embedBase: 'https://x.example' })).toBe('https://x.example/embed.html');
  });

  it('does not leak snippet-only options into the URL', () => {
    const url = buildEmbedUrl({ embedBase: 'https://x.example', width: '50%', height: '300', iframeTitle: 'T' });
    expect(url).toBe('https://x.example/embed.html');
  });

  it('is parsed back by parseUrlParams', () => {
    const url = new URL(
      buildEmbedUrl({ embedBase: 'https://x.example', query: { structId: 1088569 }, filters: { openAccess: true }, rows: 5 }),
    );
    expect(parseUrlParams(url.searchParams)).toEqual({
      query: { structId: 1088569 },
      filters: { openAccess: true },
      rows: 5,
    });
  });
});

describe('buildEmbedSnippet', () => {
  it('builds an accessible, lazy, borderless iframe', () => {
    expect(buildEmbedSnippet({ embedBase: 'https://x.example', query: { idHal: 'a' } })).toBe(
      '<iframe src="https://x.example/embed.html?idHal=a" title="Publications from HAL" width="100%" height="600"' +
        ' loading="lazy" style="border:0"></iframe>',
    );
  });

  it('escapes every attribute value', () => {
    const snippet = buildEmbedSnippet({
      embedBase: 'https://x.example/"><script>',
      width: '100%" onload="alert(1)',
      height: "1'2",
      iframeTitle: '<b>"Mine" & yours</b>',
      title: 'a"b',
    });
    expect(snippet).not.toContain('<script>');
    expect(snippet).not.toContain('" onload');
    expect(snippet).toContain('width="100%&quot; onload=&quot;alert(1)"');
    expect(snippet).toContain('height="1&#39;2"');
    expect(snippet).toContain('title="&lt;b&gt;&quot;Mine&quot; &amp; yours&lt;/b&gt;"');
    expect(snippet).toContain('src="https://x.example/&quot;&gt;&lt;script&gt;/embed.html?title=a%22b"');
  });
});

// ---------------------------------------------------------------------------
// SVG (README)
// ---------------------------------------------------------------------------

describe('buildSvgUrl', () => {
  it('targets {svgBase}/svg and tolerates a trailing slash', () => {
    expect(buildSvgUrl('https://svg.example/', { query: { idHal: 'jpugetgil' }, theme: 'dark' })).toBe(
      'https://svg.example/svg?idHal=jpugetgil&theme=dark',
    );
    expect(buildSvgUrl('https://svg.example', {})).toBe('https://svg.example/svg');
  });

  it('drops the meaningless output param', () => {
    expect(buildSvgUrl('https://svg.example', { output: 'svg', lvl: 0 })).toBe('https://svg.example/svg?lvl=0');
  });
});

describe('buildMarkdownSnippet', () => {
  it('wraps the SVG image in a link to the list on HAL', () => {
    expect(buildMarkdownSnippet({ svgBase: 'https://svg.example', query: { idHal: 'jpugetgil' } })).toBe(
      '[![Publications from HAL](https://svg.example/svg?idHal=jpugetgil)](https://cv.hal.science/jpugetgil)',
    );
    expect(buildMarkdownSnippet({ svgBase: 'https://svg.example', query: { collection: 'LIRIS' }, alt: 'LIRIS' })).toBe(
      '[![LIRIS](https://svg.example/svg?collection=LIRIS)](https://hal.science/LIRIS)',
    );
  });

  it('links to the filtered list when the image is filtered', () => {
    const md = buildMarkdownSnippet({ svgBase: 'https://svg.example', query: { idHal: 'jpugetgil' }, filters: { docTypes: ['ART'] } });
    expect(md).toBe(
      '[![Publications from HAL](https://svg.example/svg?idHal=jpugetgil&docTypes=ART)]' +
        '(https://hal.science/search/index/?q=%28authIdHal_s%3A%22jpugetgil%22%29+AND+docType_s%3A%28ART%29)',
    );
  });

  it('escapes Markdown alt text and URLs', () => {
    const md = buildMarkdownSnippet({
      svgBase: 'https://svg.example/a (b)',
      alt: 'x](javascript:alert(1)) [y',
      query: { text: 'rdf (graph)' },
    });
    expect(md).toBe(
      '[![x\\](javascript:alert(1)) \\[y](https://svg.example/a%20%28b%29/svg?search=rdf+%28graph%29)]' +
        '(https://hal.science/search/index/?q=rdf+graph)',
    );
  });

  it('emits a <picture> with light and dark sources in dark mode', () => {
    const html = buildMarkdownSnippet({
      svgBase: 'https://svg.example',
      query: { idHal: 'jpugetgil' },
      theme: 'auto',
      darkMode: true,
      alt: 'My "papers"',
    });
    expect(html).toBe(
      [
        '<a href="https://cv.hal.science/jpugetgil">',
        '  <picture>',
        '    <source media="(prefers-color-scheme: dark)" srcset="https://svg.example/svg?idHal=jpugetgil&amp;theme=dark">',
        '    <img src="https://svg.example/svg?idHal=jpugetgil&amp;theme=light" alt="My &quot;papers&quot;">',
        '  </picture>',
        '</a>',
      ].join('\n'),
    );
  });
});

// ---------------------------------------------------------------------------
// Web component
// ---------------------------------------------------------------------------

describe('buildWebComponentSnippet', () => {
  it('uses the kebab-case attribute names of the contract', () => {
    expect(
      buildWebComponentSnippet({
        query: { idHal: 'jpugetgil', structId: 1, collection: 'LIRIS', text: 'rdf', solr: 'a:b', orcid: '0000-0002-1825-0097' },
        filters: { docTypes: ['ART', 'COMM'], yearFrom: 2020, yearTo: 2024, openAccess: true },
        sort: 'date-asc',
        lvl: 2,
        rows: 5,
        page: 2,
        output: 'svg',
        theme: 'dark',
        backgroundColor: '#fff',
        textColor: '#000',
        mainColor: '#c00',
        groupBy: 'year',
        highlightAuthors: ['A', 'B'],
        maxAuthors: 3,
        title: 'Mine',
        showCredit: false,
      }),
    ).toBe(
      '<hal-search id-hal="jpugetgil" orcid="0000-0002-1825-0097" struct-id="1" collection="LIRIS" search="rdf" q="a:b"' +
        ' doc-types="ART,COMM" year-from="2020" year-to="2024" oa="1" sort="date-asc" lvl="2" rows="5" page="2"' +
        ' output="svg" theme="dark" bg="#fff" text="#000" main="#c00" group-by="year" highlight="A,B" max-authors="3"' +
        ' svg-title="Mine" credit="0"></hal-search>',
    );
  });

  it('maps every URL param to the contract attribute names', () => {
    expect(Object.values(WEB_COMPONENT_ATTRIBUTES).sort()).toEqual(
      [
        'id-hal', 'orcid', 'struct-id', 'collection', 'search', 'q', 'doc-types', 'year-from', 'year-to', 'oa',
        'sort', 'lvl', 'rows', 'page', 'output', 'theme', 'bg', 'text', 'main', 'group-by', 'highlight',
        'max-authors', 'svg-title', 'credit',
      ].sort(),
    );
  });

  it('escapes attribute values', () => {
    const html = buildWebComponentSnippet({ query: { text: '"><script>alert(1)</script>' }, title: "it's & <b>" });
    expect(html).toBe(
      '<hal-search search="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;" svg-title="it&#39;s &amp; &lt;b&gt;"></hal-search>',
    );
  });

  it('emits a bare element for an empty state', () => {
    expect(buildWebComponentSnippet({})).toBe('<hal-search></hal-search>');
  });
});
