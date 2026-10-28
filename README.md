# hal-search

Show your publications from the [HAL open archive](https://hal.science/) on a GitHub profile, a personal page or a lab website.
You can use it as a Markdown image, a web component, an iframe or a TypeScript library. It has no runtime dependencies.

[![Publications of Jey Puget Gil on HAL](https://hal-search.vercel.app/svg?idHal=jpugetgil&rows=3)](https://cv.hal.science/jpugetgil)

*The image above is generated live by the public SVG service from the HAL author identifier `jpugetgil`.*

**[Open the configurator](https://jpugetgil.github.io/hal-search/)**: fill in a form, check the preview, then copy the snippet.

| You want to… | Use | Guide |
|---|---|---|
| Add your publications to a GitHub README | SVG image `https://hal-search.vercel.app/svg?…` | [docs/github-readme.md](docs/github-readme.md) |
| Add a publication list to a website or CMS (WordPress, Hugo, Drupal) | `<hal-search>` web component (CDN) or iframe | [docs/lab-website.md](docs/lab-website.md) |
| Build your own integration in JavaScript/TypeScript | `npm install hal-search` | [JavaScript API](#javascript-api) |
| Upgrade from 0.4 | | [docs/migration-0.5.md](docs/migration-0.5.md) |

## Contents

- [Quick start](#quick-start)
- [Query and filters](#query-and-filters)
- [Detail levels](#detail-levels)
- [Display options](#display-options)
- [Theming](#theming)
- [URL parameters](#url-parameters)
- [JavaScript API](#javascript-api)
- [Accessibility](#accessibility)
- [SVG service and self-hosting](#svg-service-and-self-hosting)
- [Development](#development)
- [Contributing](#contributing)

---

## Quick start

### 1. GitHub README in 30 seconds

1. Find your HAL author identifier (idHal). `https://cv.hal.science/YOUR_IDHAL` should open your HAL CV.
2. Paste this into your README and replace `YOUR_IDHAL` in both places:

```md
[![My publications](https://hal-search.vercel.app/svg?idHal=YOUR_IDHAL)](https://cv.hal.science/YOUR_IDHAL)
```

GitHub shows the image through its image proxy, so links inside the image can't be clicked. The outer `[...](...)` link sends readers to your HAL CV instead.
To follow the reader's GitHub light/dark theme, use a `<picture>`. See [Light and dark mode](docs/github-readme.md#4-follow-githubs-light-and-dark-theme).

### 2. Website: CDN script and web component

```html
<script src="https://cdn.jsdelivr.net/npm/hal-search@0.5/dist/hal-search.min.js" defer></script>

<hal-search id-hal="YOUR_IDHAL" lvl="2" group-by="year"></hal-search>
```

The script registers `<hal-search>`, which renders interactive HTML cards (pagination, PDF/DOI links, copy citation) inside a Shadow DOM, so your site's CSS can't break it.
`https://unpkg.com/hal-search@0.5/dist/hal-search.min.js` works too.
If your CMS strips `<script>`, use the iframe embed. See [docs/lab-website.md](docs/lab-website.md).

### 3. npm and the `HalSearch` class

```bash
npm install hal-search
```

```html
<div id="publications"></div>
```

```js
import { HalSearch } from 'hal-search';

const hs = new HalSearch({
  container: '#publications',
  lvl: 2,
  rows: 10,
  groupBy: 'year',
  highlightAuthors: ['jdupont'],
  onResults: (res) => console.log(`${res.response.numFound} publications`),
});

hs.search({ query: { idHal: 'jdupont' } });
```

To use the web component from npm, call `defineHalSearchElement()` once. Only the CDN bundle registers it automatically.

```js
import { defineHalSearchElement } from 'hal-search';
defineHalSearchElement(); // registers <hal-search>; no-op outside the browser or if already defined
```

| File | Format | Use |
|---|---|---|
| `dist/hal-search.es.js` | ES module | bundlers, `import` (package `exports.import`) |
| `dist/hal-search.cjs` | CommonJS | `require('hal-search')` (package `main`, `exports.require`) |
| `dist/hal-search.min.js` | minified IIFE, global `HalSearch` namespace, registers `<hal-search>` | `<script>` tag (package `unpkg` / `jsdelivr`) |
| `dist/hal-search.umd.js` | UMD, global `HalSearch` namespace | legacy `<script>` / AMD |
| `dist/index.d.ts` | TypeScript types | |

With a script tag, the class is `HalSearch.HalSearch` because the global is the namespace of every export.

---

## Query and filters

A query combines one or more **criteria** (AND). It is the same everywhere: the JS `query` object, URL parameters and web component attributes.

| Criterion | JS (`HalQuery`) | URL param | Attribute | Sent to HAL as |
|---|---|---|---|---|
| HAL author identifier | `idHal: 'jdupont'` | `idHal` | `id-hal` | `authIdHal_s:"jdupont"` |
| ORCID iD | `orcid: '0000-0002-1825-0097'` | `orcid` | `orcid` | `authORCIDIdExt_s:"…"` (`0000-…` and `https://orcid.org/0000-…` are both accepted) |
| Lab or team (structure id) | `structId: 1234` | `structId` | `struct-id` | `structId_i:1234` (digits only) |
| HAL collection | `collection: 'LIRIS'` | `collection` | `collection` | endpoint `/search/LIRIS/` (code upper-cased) |
| Free text | `text: 'graph "deep learning"'` | `search` | `search` | words; `"double quotes"` keep a phrase; Solr syntax characters and `AND`/`OR`/`NOT` are neutralised |
| Raw Solr query (advanced) | `solr: 'title_s:graph*'` | `q` (legacy `uid`) | `q` | AND-ed as is |

```js
hs.search({ query: { collection: 'LIRIS', text: 'graph' } });   // both criteria (AND)
hs.search({ query: 'authIdHal_s:jdupont OR authIdHal_s:mmartin' }); // a string is a raw Solr query
```

> The web component, the embed page and the SVG service don't search without at least one criterion. A free text made only of Solr syntax characters (`search=***`) doesn't count as one.
> `HalSearch.search({ query: {} })` does run: it sends `*:*`, which matches the whole archive. Check your input with `hasQueryCriterion(query)` first.

**Filters** (`HalFilters`) are AND-ed with the query:

| Filter | JS | URL param / attribute | HAL filter query |
|---|---|---|---|
| Document types | `docTypes: ['ART', 'COMM']` | `docTypes=ART,COMM` / `doc-types` | `docType_s:(ART OR COMM)` |
| Years (inclusive) | `yearFrom: 2020, yearTo: 2024` | `yearFrom`, `yearTo` / `year-from`, `year-to` | `producedDateY_i:[2020 TO 2024]` |
| Open access only | `openAccess: true` | `oa=1` / `oa` (bare attribute = true) | `openAccess_bool:true` |

Common `docTypes` codes: `ART` journal article, `COMM` conference paper, `COUV` book chapter, `OUV` book, `THESE` thesis, `HDR` habilitation, `POSTER`, `REPORT`, `PROCEEDINGS`, `SOFTWARE`, `OTHER`, `UNDEFINED` (preprint / working paper).
The full list with English labels is `DOC_TYPE_LABELS` in [src/doctypes.ts](src/doctypes.ts).

**Sort** (`sort`): `date-desc` (default, newest first), `date-asc`, or `relevance`. Date sorts use `producedDate_tdate` with `docid` as a tie-breaker, so pages don't overlap.

---

## Detail levels

`lvl` sets both what is displayed and which fields are requested from HAL. Each level requests an explicit field list from [src/levels.ts](src/levels.ts), never `fl=*`.

| `lvl` | Name | Displayed | Fields added to the request |
|---|---|---|---|
| `0` | minimal | Citation (`label_s`) linking to HAL | `docid`, `label_s`, `uri_s`, `producedDateY_i`, `docType_s` |
| `1` | basic (**default**) | Title (link), authors (`et al.` after `maxAuthors`, highlighted authors in bold), year, venue, document type. HTML: PDF and DOI links | `halId_s`, `title_s`, `authFullName_s`, `authIdHalFullName_fs`, `journalTitle_s`, `conferenceTitle_s`, `doiId_s`, `fileMain_s` |
| `2` | detailed | Plus the Open Access badge, keywords and domains. HTML: BibTeX link and "Copy citation" button | `openAccess_bool`, `keyword_s`, `domain_s`, `en_domainAllCodeLabel_fs`, `citationFull_s` |
| `3` | full | Plus the abstract. HTML: collapsible "Show more / Show less". SVG: 3 lines | `abstract_s`, `language_s` |

Document types are shown as labels ("Journal article"), never as raw codes. `UNDEFINED` is hidden unless you give it a label.

---

## Display options

| Option (JS) | Attribute | URL param | Default | Notes |
|---|---|---|---|---|
| `lvl` | `lvl` | `lvl` | `1` | `0`–`3`, see above |
| `rows` | `rows` | `rows` | `10` | URLs and attributes: max 50; SVG service: max 20 |
| `sort` | `sort` | `sort` | `'date-desc'` | `'date-asc'`, `'relevance'` |
| `output` | `output` | `output` | `'html'` | `'svg'` renders an inline SVG instead of cards |
| `groupBy` | `group-by` | `groupBy` | `'none'` | `'year'` or `'docType'`. Groups follow the order of the results (sort by date to group chronologically). Documents without a year go under "Undated" |
| `highlightAuthors` | `highlight` | `highlight` | `[]` | idHal values or full names, compared case- and accent-insensitively. In URLs and attributes the list is comma-separated, so prefer idHal values (`highlight=jdupont`) or "First Last" names: a name containing a comma is split. Max 20 in URLs |
| `maxAuthors` | `max-authors` | `maxAuthors` | `10` | Authors shown before "et al."; `0` = all |
| `labels` | `labels` (JSON) | none | English | Any user-facing string, see below |
| `showCredit` | `credit` | `credit` | `true` | `credit=0` hides the small "hal-search" credit link |
| `headingLevel` | `heading-level` | none | `3` | HTML only: titles are `<h3>`. With `groupBy`, group headings are one level above (`<h2>`), never above `<h2>` |
| `title` | `svg-title` | `title` | `'Publications'` | SVG header title (max 80 characters in URLs). The attribute is `svg-title` because the global `title` attribute would show a tooltip |
| `theme`, colors | `theme`, `bg`, `text`, `main` | same | `'light'` | See [Theming](#theming) |

### Labels and translation

The default strings are English. Override any key of `Labels` (see [src/types.ts](src/types.ts)). `docTypes` is merged code by code.
Templates use `{count}`, `{page}`, `{pages}` and `{message}` placeholders. In HTML, the result count is formatted for the closest `lang` attribute (`<html lang="fr">` gives `1 234`).

```js
const fr = {
  loading: 'Chargement…',
  empty: 'Aucune publication trouvée.',
  error: 'Erreur : {message}',
  previous: 'Précédent',
  next: 'Suivant',
  pageInfo: 'Page {page} sur {pages}',
  resultCount: '{count} publications',
  resultCountOne: '{count} publication',
  pagination: 'Pages de résultats',
  openAccess: 'Accès ouvert',
  abstract: 'Résumé',
  showMore: 'Afficher plus',
  showLess: 'Afficher moins',
  untitled: 'Sans titre',
  copyCitation: 'Copier la citation',
  copied: 'Copié !',
  viewOnHal: 'Voir les {count} publications sur HAL',
  viewOnHalOne: 'Voir cette publication sur HAL',
  opensInNewTab: '(nouvel onglet)',
  undated: 'Sans date',
  docTypes: {
    ART: 'Article dans une revue',
    COMM: 'Communication dans un congrès',
    COUV: 'Chapitre d’ouvrage',
    OUV: 'Ouvrage',
    THESE: 'Thèse',
    HDR: 'HDR',
    POSTER: 'Poster',
    REPORT: 'Rapport',
    UNDEFINED: 'Prépublication',
  },
};

new HalSearch({ container: '#publications', labels: fr });
```

```html
<hal-search collection="LIRIS"
  labels='{"empty":"Aucune publication trouvée.","previous":"Précédent","next":"Suivant","docTypes":{"ART":"Article dans une revue"}}'></hal-search>
```

In the `labels` attribute, invalid JSON and non-string values are ignored. The SVG service has no `labels` parameter, so README images are always in English (`title=` still sets the header).

---

## Theming

### Theme and colors

| Option | Attribute / URL | Values |
|---|---|---|
| `theme` | `theme` | `light` (default), `dark` (tuned for GitHub's dark canvas), `auto` (follows `prefers-color-scheme`: CSS media query in HTML, embedded media query in SVG) |
| `backgroundColor` | `bg` | Card background |
| `textColor` | `text` | Main text. Secondary (muted) text is derived from it |
| `mainColor` | `main` | Accent: links, buttons, SVG header. Hover color and text-on-accent color are derived |

Colors can be hex (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`), numeric `rgb()`/`rgba()`/`hsl()`/`hsla()`, or a CSS named color. Anything else is ignored.
In URLs, encode `#` as `%23` (`main=%23c8102e`).
If you only set a background, the default text and accent colors are adjusted to stay readable on it. Named colors (`black`, `yellow`…) get the same treatment as hex colors.
With `theme: 'auto'`, a light and a dark variant are derived from your colors, and the one matching the visitor's preference is used.

```js
hs.setTheme('dark');                           // no new request
hs.setColors({ mainColor: '#c8102e' });        // only the given keys change
hs.setColors({ mainColor: undefined });        // removes that override
```

### CSS custom properties (HTML output)

The default stylesheet is scoped under `.hal-search`, the class HalSearch adds to the container. Every color comes from a variable:

| Variable | Light | Dark | Used for |
|---|---|---|---|
| `--hal-surface` | `#f6f8fa` | `#0d1117` | Empty state, citation box |
| `--hal-card-bg` | `#ffffff` | `#161b22` | Cards, buttons (`backgroundColor`) |
| `--hal-border` | `#e0e0e0` | `#30363d` | Borders |
| `--hal-text` | `#1a1a1a` | `#e6edf3` | Text (`textColor`) |
| `--hal-muted` | `#666666` | `#8b949e` | Meta row, secondary text |
| `--hal-accent` | `#0052cc` | `#4493f8` | Links, buttons, focus ring (`mainColor`) |
| `--hal-accent-hover` | `#003d99` | `#69a9f9` | Hover |
| `--hal-accent-text` | `#ffffff` | `#0d1117` | Text on the accent (current page) |
| `--hal-tag-bg` / `--hal-tag-text` | `#f0f0f0` / `#444444` | `#21262d` / `#c9d1d9` | Keywords, doc type badge |
| `--hal-domain-bg` / `--hal-domain-text` | `#e8f0fe` / `#1a56c4` | `#1b2d45` / `#79b8ff` | Domain tags |
| `--hal-oa-bg` / `--hal-oa-text` | `#e3f5ee` / `#006644` | `#173326` / `#3fb950` | Open Access badge |
| `--hal-error-bg` / `--hal-error-border` / `--hal-error-text` | `#fff5f5` / `#ffc9c9` / `#c92a2a` | `#2d1517` / `#6e2b2b` / `#ff7b72` | Error message |
| `--hal-font` | system-ui stack | | Font family |
| `--hal-radius` | `6px` | | Corner radius |
| `--hal-shadow` | `0 1px 3px rgba(0,0,0,.08)` | `0 1px 3px rgba(0,0,0,.45)` | Card shadow |

The dark values apply when the container has `data-hal-theme="dark"`, or `"auto"` when the visitor prefers a dark scheme.
To override variables, use a selector that beats `.hal-search[data-hal-theme="dark"]`, such as an id:

```css
#publications {
  --hal-accent: #c8102e;
  --hal-font: "Source Sans 3", sans-serif;
  --hal-radius: 0;
}
```

Inside the web component, the styles live in its Shadow DOM, so variables set on `hal-search` itself are not used. Set them through the exposed part instead:

```css
hal-search::part(container) {
  --hal-accent: #c8102e;
  --hal-font: "Source Sans 3", sans-serif;
}
```

Variables set with `::part(container)` take precedence over the `bg`, `text` and `main` attributes.

To write your own stylesheet, pass `injectStyles: false` (you can start from `DEFAULT_CSS`). The default stylesheet is injected once, as `<style id="hal-search-styles">`, first in `<head>`, so your styles win at equal specificity.

### Public class names

`hal-search` (container), `hal-results`, `hal-list`, `hal-item`, `hal-group`, `hal-group__title`,
`hal-article` (+ `hal-article--lvl0`…`--lvl3`, `data-docid`, `data-doctype`), `hal-article__label`, `hal-article__link`, `hal-article__title`, `hal-article__title-text`,
`hal-article__authors`, `hal-author`, `hal-author--highlight`, `hal-article__etal`, `hal-article__meta`, `hal-article__year`, `hal-article__venue`,
`hal-badge`, `hal-badge--doctype`, `hal-badge--oa`, `hal-article__links`, `hal-action` (+ `--pdf`, `--doi`, `--bibtex`, `--copy`), `hal-citation`,
`hal-article__details`, `hal-article__tags`, `hal-article__keywords`, `hal-article__domains`, `hal-tag`, `hal-tag--domain`,
`hal-abstract`, `hal-abstract__label`, `hal-abstract__text`, `hal-abstract__ellipsis`, `hal-abstract__more`, `hal-abstract__toggle` (`is-expanded` on `hal-abstract`),
`hal-pagination`, `hal-pagination__list`, `hal-pagination__item`, `hal-pagination__btn` (+ `--prev`, `--next`), `hal-pagination__page`, `hal-pagination__label`, `hal-pagination__arrow`, `hal-pagination__gap`,
`hal-loading`, `hal-spinner`, `hal-loading__text`, `hal-error`, `hal-empty`, `hal-footer`, `hal-footer__link`, `hal-live`, `hal-visually-hidden`.

---

## URL parameters

The embed page (`embed.html`), the SVG service (`/svg`) and the web component (attribute = kebab-case name) share one public scheme, implemented in [src/url-params.ts](src/url-params.ts).
Unknown parameters are ignored and invalid values are dropped, never echoed back.

| Param | Attribute | Value | Default |
|---|---|---|---|
| `idHal` | `id-hal` | HAL author id (`A-Z a-z 0-9 . _ -`) | |
| `orcid` | `orcid` | `0000-0000-0000-000X` or `https://orcid.org/0000-…` | |
| `structId` | `struct-id` | digits | |
| `collection` | `collection` | collection code (`A-Z a-z 0-9 _ -`) | |
| `search` | `search` | free text (max 1000 characters). Only Solr syntax characters (`***`) = no criterion | |
| `q` | `q` | raw Solr query (max 1000 characters) | |
| `uid` | | **legacy (≤ 0.4)** alias of `q` | |
| `docTypes` | `doc-types` | comma-separated codes, e.g. `ART,COMM` | |
| `yearFrom`, `yearTo` | `year-from`, `year-to` | 4-digit years, inclusive | |
| `oa` | `oa` | `1` / `true` | |
| `sort` | `sort` | `date-desc`, `date-asc`, `relevance` | `date-desc` |
| `lvl` | `lvl` | `0`–`3` | `1` |
| `rows` | `rows` | `1`–`50` (SVG service: `1`–`20`) | `10` |
| `page` | `page` | ≥ 1. A page beyond the last one shows the last page | `1` |
| `output` | `output` | `html`, `svg` (ignored by the SVG service) | `html` |
| `type` | | **legacy (≤ 0.4)** alias of `output` | |
| `theme` | `theme` | `light`, `dark`, `auto` | `light` |
| `bg`, `text`, `main` | `bg`, `text`, `main` | colors (`%23` for `#`) | |
| `groupBy` | `group-by` | `none`, `year`, `docType` | `none` |
| `highlight` | `highlight` | comma-separated idHal values or names (a name containing a comma is split) | |
| `maxAuthors` | `max-authors` | integer ≥ 0 (`0` = all) | `10` |
| `title` | `svg-title` | SVG header title, max 80 characters | `Publications` |
| `credit` | `credit` | `0` / `false` hides the credit | shown |

Widget-only attributes: `heading-level` (2–6), `labels` (JSON, `Partial<Labels>`), `api-base` (HAL API base URL).

Example: `https://hal-search.vercel.app/svg?collection=LIRIS&docTypes=ART&yearFrom=2022&groupBy=year&rows=15&theme=dark`

---

## JavaScript API

Everything below is exported from `hal-search`. The types are in [src/types.ts](src/types.ts).

### `new HalSearch(options)`

Renders publications into a DOM container, as HTML cards or an inline SVG.

| Option | Type | Default |
|---|---|---|
| `container` | `HTMLElement \| string` (CSS selector) | **required** |
| `lvl`, `rows`, `sort`, `output`, `theme`, `groupBy`, `highlightAuthors`, `maxAuthors`, `labels`, `showCredit`, `headingLevel`, `title`, `backgroundColor`, `textColor`, `mainColor` | see [Display options](#display-options) | |
| `filters` | `HalFilters`: default filters, merged under the filters given to `search()` | `{}` |
| `apiBase` | HAL API base URL (proxies, tests) | `https://api.archives-ouvertes.fr/search/` |
| `injectStyles` | inject the default CSS | `true` |
| `styleRoot` | `Document \| ShadowRoot` where the CSS goes | the container's shadow root, else the document |
| `onResults` | `(response: HalApiResponse) => void`, called after each successful fetch | |
| `onError` | `(err: Error) => void`. Aborted requests are not errors | |

| Member | Returns | Notes |
|---|---|---|
| `search({ query, filters?, sort?, lvl?, rows?, page? })` | `Promise<HalApiResponse \| undefined>` | One request. `filters` and `sort` apply to this search only (merged over / falling back to the constructor defaults). `lvl` and `rows` are kept for the following requests |
| `goToPage(n)`, `nextPage()`, `prevPage()` | same | 1-based, clamped to the known page count. No-op before the first `search()`. A `page` beyond the last one (for example a stale URL) loads the last page |
| `setLevel(lvl)` | same | Re-fetches the current page. Before the first search it only stores the level |
| `setTheme(theme)` | `void` | Applied immediately (HTML and SVG), no request |
| `setColors({ backgroundColor?, textColor?, mainColor? })` | `void` | Only the given keys change; `undefined` removes an override. SVG output is re-rendered without a request |
| `state` | `HalSearchState` | Read-only snapshot: `query`, `filters`, `sort`, `lvl`, `page`, `totalFound` |
| `destroy()` | `void` | Aborts the in-flight request, empties the container, removes the class and variables. Later calls do nothing |

Promises resolve with `undefined` when the request failed, was superseded or aborted. They never reject.
Each request aborts the previous one, so a late response can't overwrite a newer one.
If `onResults` or `onError` throws, the error is logged and the rendered results stay on screen.

### `<hal-search>` web component

`defineHalSearchElement(tagName = 'hal-search')` registers the element. The CDN bundle calls it for you.

- Attributes: see [URL parameters](#url-parameters), plus `heading-level`, `labels`, `api-base`. A bare boolean attribute (`<hal-search oa>`) means `true`.
- No request is made until the element has at least one query attribute (`id-hal`, `orcid`, `struct-id`, `collection`, `search`, `q`).
- Changes made in the same task are batched into one update. `theme`, `bg`, `text` and `main` are applied in place. Query, filter, sort, `lvl`, `rows` or `page` changes start a new search. Other attributes rebuild the widget.
- Events (bubbling, composed): `hal-results` with `event.detail.response` (`HalApiResponse`), `hal-error` with `event.detail.error` (`Error`).
- Open Shadow DOM. Style it with `hal-search::part(container)`.

```js
document.querySelector('hal-search').addEventListener('hal-results', (e) => {
  console.log(e.detail.response.response.numFound);
});
```

### SVG without a DOM: `fetchSvg`, `renderSvg`, `renderErrorSvg`

Works in Node 18+, browsers and edge runtimes.

```js
import { fetchSvg, renderErrorSvg } from 'hal-search';

let svg;
try {
  svg = await fetchSvg({ query: { idHal: 'jdupont' }, lvl: 2, rows: 5, theme: 'auto', groupBy: 'year' });
} catch (err) {
  svg = renderErrorSvg(err.message, { theme: 'auto' });
}
```

- `fetchSvg(options)`: `SearchParams` and display options, plus `apiBase`, `title`, `width` (default 800, 320–2000) and `signal`. Throws on fetch errors.
- `renderSvg(docs, { totalFound, title?, halUrl?, width?, ...displayOptions })`: renders documents you already have.
- `renderErrorSvg(message, { theme?, width? })`: a small error image.

All dynamic values are XML-escaped. Colors are embedded in a scoped `<style>` (so `theme: 'auto'` works), and several SVGs can share a page.

### Snippet and URL builders

```js
import { buildMarkdownSnippet, buildSvgUrl, buildWebComponentSnippet, buildEmbedSnippet, buildEmbedUrl } from 'hal-search';

const state = { query: { idHal: 'jdupont' }, filters: { docTypes: ['ART'] }, groupBy: 'year' };

buildSvgUrl('https://hal-search.vercel.app', state);
// https://hal-search.vercel.app/svg?idHal=jdupont&docTypes=ART&groupBy=year

buildMarkdownSnippet({ svgBase: 'https://hal-search.vercel.app', ...state });
// [![Publications from HAL](https://hal-search.vercel.app/svg?…)](https://cv.hal.science/jdupont)

buildMarkdownSnippet({ svgBase: 'https://hal-search.vercel.app', darkMode: true, ...state });
// <a href="…"><picture><source media="(prefers-color-scheme: dark)" srcset="…&theme=dark"><img src="…&theme=light" alt="…"></picture></a>

buildWebComponentSnippet(state);
// <hal-search id-hal="jdupont" doc-types="ART" group-by="year"></hal-search>

buildEmbedSnippet({ embedBase: 'https://jpugetgil.github.io/hal-search', height: '800', ...state });
// <iframe src="https://jpugetgil.github.io/hal-search/embed.html?…" title="Publications from HAL" width="100%" height="800" loading="lazy" style="border:0"></iframe>
```

The state is a `Partial<UrlState>`. Values are attribute-escaped, and default values are left out of the URLs.
`buildMarkdownSnippet` also takes `alt`. `buildEmbedSnippet` takes `width` (`'100%'`), `height` (`'600'`) and `iframeTitle`.

### URL state: `parseUrlParams`, `toUrlParams`

```js
import { parseUrlParams, toUrlParams } from 'hal-search';

const state = parseUrlParams(new URLSearchParams(location.search), { maxRows: 50 }); // UrlState, invalid values dropped
const params = toUrlParams(state);                                                     // URLSearchParams, defaults omitted
```

### Low-level helpers

| Export | Purpose |
|---|---|
| `fetchArticles({ query, filters?, sort?, lvl, rows, start, apiBase?, signal? })` | Fetches one page from HAL, returns `HalApiResponse`. Throws on HTTP and API errors, including HAL's "HTTP 200 + error body" |
| `isAbortError(err)` | `true` for an aborted request |
| `buildHalUrl(params)` | The HAL API URL `fetchArticles` would request |
| `buildHalWebUrl(query)` | Matching page on hal.science (CV page, collection page or search page) |
| `hasQueryCriterion(query)` | `true` when the query has at least one usable criterion (same rule as the web component and the SVG service) |
| `buildSolrQuery(query)`, `buildFilterQueries(filters)`, `resolveSort(sort)`, `escapeSolrValue(value)` | Solr `q`, `fq` and `sort` building blocks |
| `getDocLinks(doc)` | `{ hal?, pdf?, doi?, bibtex? }`, http(s) only |
| `DOC_TYPE_LABELS`, `docTypeLabel(code, overrides?)` | Document type labels |
| `LEVEL_FIELDS`, `LEVEL_NAMES`, `resolveFields(lvl)`, `normalizeDomains(domains, labels?)` | Field lists per level, readable domains |
| `DEFAULT_LABELS`, `resolveLabels(overrides?)`, `formatLabel(template, vars)` | Strings |
| `LIGHT_PALETTE`, `DARK_PALETTE`, `resolvePalette({ theme, ...colors })`, `paletteToCssVars(palette)`, `isSafeColor(value)` | Colors |
| `DEFAULT_CSS`, `injectDefaultStyles(root?)` | Default stylesheet |
| `DEFAULT_BASE` | `https://api.archives-ouvertes.fr/search/` |

---

## Accessibility

- **Announcements**: a polite live region (`role="status"`) announces loading, the result count (with the page), errors and "Copied!". The container has `aria-busy="true"` while loading.
- **Headings**: titles use `headingLevel` (default `<h3>`). Group headings are one level above, never above `<h2>`. Pick the level that fits your page outline.
- **Pagination**: a `<nav>` labelled by `labels.pagination`, with real buttons. The current page has `aria-current="page"` and each page button is named "Page N of M". On narrow screens the Previous/Next text is visually hidden but still read aloud.
- **Focus**: only a click on the built-in pagination moves focus to the start of the new results. `goToPage()`, `nextPage()` and other calls from your code never move focus.
- **Links**: external links open in a new tab and say so to screen readers ("(opens in a new tab)", translatable).
- **Language**: titles and abstracts get a `lang` attribute when HAL reports a single language.
- **Abstract**: the "Show more / Show less" toggle uses `aria-expanded` and `aria-controls`. The hidden text is really hidden.
- **Copy citation**: uses the Clipboard API, then `execCommand('copy')`. If both fail, a selected read-only text box lets the user copy by hand.
- **Visual**: the light and dark palettes meet WCAG AA contrast. With custom colors, the derived colors (muted text, tags, text on the accent) are pushed toward readable contrast. Your own `textColor`/`mainColor` are used as given, so check their contrast. Visible focus ring, `prefers-reduced-motion`, Windows high-contrast (`forced-colors`) and print styles are included, down to 320 px wide.
- **SVG**: `role="img"` with a `<title>` (title and count) and a `<desc>` (the publication titles). In Markdown, set a meaningful `alt` text.

---

## SVG service and self-hosting

The SVG service (`ssr-app/`, public instance at `https://hal-search.vercel.app`) turns the [URL parameters](#url-parameters) into an SVG image for Markdown.

| Request | Response |
|---|---|
| `GET /svg?…` | SVG image (`image/svg+xml`) |
| `GET /?…` with a query criterion or `output`/`type` | Same SVG. Keeps README URLs from ≤ 0.4 (`/?uid=…&output=svg`) working |
| `GET /` without parameters | A static landing page with copy-paste examples |
| other paths / methods | `404` / `405` |

- At least one criterion is required. Without one (or with only Solr syntax characters such as `search=***`), you get an error image ("Missing query…").
- A `page` beyond the last one renders the last page.
- `rows` defaults to 10, with a maximum of 20. `output` is ignored. Labels are English.
- Successful images are cached for 1 hour in browsers and on the CDN (`max-age=3600, s-maxage=3600, stale-while-revalidate=86400`). Error images are cached for 60 seconds.
- Errors are rendered as an error image with HTTP 200, so a README never shows a broken image. HAL gets 4 seconds to answer.
- Inside GitHub's `<img>`, links in the SVG can't be clicked (wrap the image in a link). Fonts are the viewer's system fonts. `theme=auto` follows the viewer's **OS** setting, not GitHub's theme choice. Use the `<picture>` snippet (`buildMarkdownSnippet({ darkMode: true })`) to follow GitHub's theme.

### Run it yourself

```bash
cd ssr-app
npm ci
npm run dev       # development: Vite loads src/render.ts and ../src on each request
npm run build     # bundles the service and the library sources into dist/server/render.js
npm run preview   # production mode: node server.js --production
```

The server listens on `PORT` (default `5173`). Point the builders at it with `svgBase: 'https://your-host'`.
`ssr-app/src/render.ts` exports a framework-agnostic `handleRequest({ method, pathname, searchParams })` if you want another runtime.
The service always bundles this repository's `../src`, so a deployment matches the repository, not the npm release.

### Deploying the SVG service (Vercel)

Maintainer notes for the Vercel project:

- **Root Directory**: `ssr-app`.
- **Include files outside the root directory in the Build Step**: enabled. The build bundles `../src`.
- **Skip deployments when there are no changes to the root directory**: disabled. Otherwise, changes to `src/` would not redeploy the service.
- **Build command**: `npm run build`.
- **Node.js**: 20 or later.
- Vercel's Express support imports `server.js` and serves its default export. `listen()` is skipped when `VERCEL` is set.

---

## Development

```bash
git clone https://github.com/JPugetGil/hal-search.git
cd hal-search
npm install
```

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server with the sandbox `index.html` (imports `src/` directly) at http://localhost:5173 |
| `npm test` | Unit tests (Vitest; DOM tests use happy-dom; the network is always stubbed) |
| `npm run test:watch` | Tests in watch mode |
| `npm run typecheck` | `tsc --noEmit` (strict) on `src/` |
| `npm run typecheck:test` | Type-checks the test suite |
| `npm run build` | Library (`es`, `umd`, `cjs`, types) and the CDN bundle `dist/hal-search.min.js` |
| `npm run example` | Builds, copies `dist/hal-search.es.js` to `example/` and serves the configurator at http://localhost:8080. The script uses `cp`: on Windows run it from Git Bash, or copy the file and run `npx serve -l 8080 example` |

Publishing: `npm publish` runs `prepublishOnly` (typecheck, tests, build). The GitHub workflow publishes on each GitHub release, and `example/` is deployed to GitHub Pages on each push to `main`.

### Project structure

```
src/
  index.ts        public exports
  types.ts        public types (the contract)
  HalSearch.ts    the HalSearch class (requests, state, rendering)
  element.ts      <hal-search> web component
  cdn.ts          entry of the CDN bundle (registers <hal-search>)
  query.ts        Solr query, filters, sort, HAL API and web URLs
  api.ts          fetchArticles
  levels.ts       field lists per detail level, domains
  url-params.ts   the public URL scheme (parse / serialise)
  embed.ts        snippet and URL builders
  renderer.ts     HTML cards (DOM APIs only)
  styles.ts       default CSS
  svg.ts          DOM-free SVG renderer
  headless.ts     fetchSvg
  theme.ts        palettes, color validation and derivation
  labels.ts       default English strings
  doctypes.ts     document type labels
  links.ts        PDF / DOI / BibTeX links
  format.ts       text helpers shared by both renderers
test/             Vitest suites (one per module, plus the SSR service)
example/          configurator (index.html) and iframe page (embed.html), deployed to GitHub Pages
ssr-app/          SVG image service (Express + Vite SSR bundle)
index.html        dev sandbox (npm run dev)
docs/             guides and migration notes
```

---

## Contributing

Issues and pull requests are welcome: https://github.com/JPugetGil/hal-search/issues

- Run `npm run typecheck`, `npm run typecheck:test`, `npm test` and `npm run build` before opening a PR. CI also type-checks and builds `ssr-app/`. Add tests for new behavior. Tests must not hit the network: stub `fetch`.
- No runtime dependencies. TypeScript strict, ES2020.
- Security: data from HAL is never injected as HTML. Use DOM APIs and `textContent` in HTML, and `escapeXml` in SVG. Links are http(s) only, and colors go through `isSafeColor`.
- The URL scheme is a public contract (it is pasted in READMEs). Change it only in `src/url-params.ts`, and keep legacy parameters working.
- The HTML and SVG renderers must show the same information at each detail level.
- Check your change in the dev sandbox (`npm run dev`) and the configurator (`npm run example`). Note user-facing changes in [CHANGELOG.md](CHANGELOG.md).

[HAL API documentation](https://api.archives-ouvertes.fr/docs/search). License: [MIT](LICENSE).
