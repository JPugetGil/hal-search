# Migrating from 0.4 to 0.5

0.5 is a rewrite. The JavaScript API has breaking changes and no deprecated aliases. The **public URLs keep working**: `uid` and `type` are still read by the embed page and the SVG service.

> Going to 0.6 afterwards? See [Migrating from 0.5 to 0.6](migration-0.6.md).

Quick checklist:

- [ ] `search({ uid })` → `search({ query })` ([1](#1-uid-becomes-a-structured-query))
- [ ] Results are now sorted by date. Add `sort: 'relevance'` if you relied on relevance ([2](#2-default-sort-is-now-by-date))
- [ ] `container` is required. Headless SVG → `fetchSvg()` ([3](#3-container-is-required-headless-svg-moved-to-fetchsvg--rendersvg))
- [ ] Methods resolve with the HAL response instead of an `SVGSVGElement` ([4](#4-return-values-and-error-handling))
- [ ] CSS variables renamed and scoped to `.hal-search` ([6](#6-css-variables))
- [ ] CSS classes and markup changed ([7](#7-html-markup-and-css-classes))
- [ ] Embed builders: `uid` → `query`, `type` → `output` ([8](#8-embed-builders-and-embedhtml))
- [ ] `buildUrl` / `fetchArticles` signatures ([10](#10-low-level-functions))
- [ ] `buildArticlesSvg`, `renderResultsSvg`, `SvgColorOverrides` removed ([11](#11-svg-functions-and-types))

---

## 1. `uid` becomes a structured query

In 0.4, `uid` went into the Solr `q` parameter **wrapped in double quotes**. Field queries such as `authIdHal_s:jdupont` were therefore searched as a phrase and returned 0 results.
0.5 takes a structured `query` and quotes only the values.

```js
// 0.4
hs.search({ uid: 'authIdHal_s:jdupont' });
hs.search({ uid: 'structId_i:123456' });
hs.search({ uid: 'machine learning' });

// 0.5
hs.search({ query: { idHal: 'jdupont' } });
hs.search({ query: { structId: 123456 } });
hs.search({ query: { text: '"machine learning"' } }); // quotes keep the phrase; without them, any order
```

Also available: `orcid`, `collection` (uses the `/search/{COLLECTION}/` endpoint) and `solr` (raw Solr, AND-ed with the other criteria). A plain string is a raw Solr query: `hs.search({ query: 'authIdHal_s:jdupont' })`.

`start` (0-based offset) is replaced by `page` (1-based):

```js
// 0.4
hs.search({ uid: 'machine learning', rows: 10, start: 20 });
// 0.5
hs.search({ query: { text: 'machine learning' }, rows: 10, page: 3 });
```

`search()` also accepts `filters`, `sort` and `lvl`. `filters` and `sort` apply to that search only, while `lvl` and `rows` are kept for the following requests. See [Query and filters](../README.md#query-and-filters).

## 2. Default sort is now by date

0.4 sent no `sort`, so HAL used relevance. 0.5 sorts by `date-desc` (newest first) everywhere: `HalSearch`, `fetchArticles`, `fetchSvg`, the embed page, the web component and the SVG service.

```js
new HalSearch({ container: '#publications', sort: 'relevance' }); // previous behaviour
hs.search({ query: { text: 'graph' }, sort: 'relevance' });       // for one search
```

URL parameter: `sort=relevance`.

## 3. `container` is required; headless SVG moved to `fetchSvg` / `renderSvg`

```js
// 0.4: no container + output 'svg' → search() resolved with an SVGSVGElement
const hs = new HalSearch({ output: 'svg', lvl: 2, rows: 5 });
const svgElement = await hs.search({ uid: 'authIdHal_s:jdupont' });
document.body.appendChild(svgElement);

// 0.5: an SVG string, without a DOM (browsers, Node 18+, edge runtimes)
import { fetchSvg } from 'hal-search';
const svg = await fetchSvg({ query: { idHal: 'jdupont' }, lvl: 2, rows: 5 });
```

`fetchSvg` throws on fetch errors. Turn them into an image with `renderErrorSvg(err.message)`.
To insert the string in a page, use `container.innerHTML = svg` (every dynamic value is XML-escaped by the renderer). To render an inline SVG inside a container, use HalSearch:

```js
new HalSearch({ container: '#publications', output: 'svg' }).search({ query: { idHal: 'jdupont' } });
```

`new HalSearch({})` without `container` now throws: `HalSearch: \`container\` is required (use fetchSvg() for a headless SVG)`.

## 4. Return values and error handling

| | 0.4 | 0.5 |
|---|---|---|
| `search`, `goToPage`, `nextPage`, `prevPage`, `setLevel` | `Promise<SVGSVGElement \| void>` | `Promise<HalApiResponse \| undefined>` |
| Fetch error, no container and no `onError` | promise rejected | never rejects: resolves `undefined`, renders the error, calls `onError` |
| Exception thrown by `onResults` | replaced the results with an error message | logged, results stay on screen |
| Two quick searches | the slower response could win | the previous request is aborted, and late responses are ignored |

```js
// 0.5
const response = await hs.search({ query: { idHal: 'jdupont' } });
if (response) console.log(response.response.numFound);
console.log(hs.state); // { query, filters, sort, lvl, page, totalFound }
```

## 5. `setColors`, `setTheme`, `destroy`

- `setColors()` now works in SVG output too: the SVG is re-rendered from the last response, without a request. A key passed as `undefined` **removes** that override. In 0.4 it was ignored.
- New `theme` option and `setTheme('light' | 'dark' | 'auto')`.
- `destroy()` now aborts the in-flight request and removes the class, the theme attribute and the inline variables from the container. **The instance is then final**: later calls do nothing. Create a new `HalSearch` instead of reusing a destroyed one.

## 6. CSS variables

Variables are no longer declared on `:root`. They are declared on `.hal-search`, a class HalSearch adds to your container.
Overrides on `:root` or `body` are therefore ignored. Set them on the container (an id selector also beats the dark theme rules):

```css
/* 0.4 */
:root { --hal-accent: #e63946; --hal-bg: #fff8f0; --hal-text-muted: #555; }

/* 0.5 */
#publications { --hal-accent: #e63946; --hal-card-bg: #fff8f0; --hal-muted: #555; }
```

| 0.4 | 0.5 |
|---|---|
| `--hal-bg` (cards, set by `backgroundColor`) | `--hal-card-bg` |
| `--hal-bg-article` (empty state) | `--hal-surface` |
| `--hal-text-muted` | `--hal-muted` |
| `--hal-tag-color` | `--hal-tag-text` |
| `--hal-oa-color` | `--hal-oa-text` |
| `--hal-accent`, `--hal-accent-hover`, `--hal-border`, `--hal-text`, `--hal-tag-bg`, `--hal-oa-bg`, `--hal-font`, `--hal-radius`, `--hal-shadow` | unchanged |
| | new: `--hal-accent-text`, `--hal-domain-bg`, `--hal-domain-text`, `--hal-error-bg`, `--hal-error-border`, `--hal-error-text` |

`backgroundColor`, `textColor` and `mainColor` now also derive secondary colors (muted text, hover, text on the accent, domain tags) and keep them readable.
The default stylesheet is now inserted **first** in `<head>` (it was appended), so your own rules win at equal specificity.

## 7. HTML markup and CSS classes

| 0.4 | 0.5 |
|---|---|
| `<div class="hal-results">` with `<article>` children | `.hal-search` container → `.hal-results` → `<ul class="hal-list">` → `<li class="hal-item">` → `<article class="hal-article hal-article--lvl1">` |
| `<header>` + `<h3 class="hal-article__title">` | `<h3 class="hal-article__title">` (level set by `headingLevel`, no `<header>`) |
| authors in `<span class="hal-article__authors">` inside the meta row | `<p class="hal-article__authors">` with `.hal-author` / `.hal-author--highlight` and `.hal-article__etal` |
| `.hal-article__date` (from `publicationDate_s`) | `.hal-article__year` (from `producedDateY_i`) |
| `.hal-article__conference` (lvl 2, in the details) | `.hal-article__venue` (lvl ≥ 1, in the meta row: journal or conference) |
| `.hal-badge` with the raw code (`ART`) | `.hal-badge.hal-badge--doctype` with a label ("Journal article") |
| `<div class="hal-article__tags">` of `<span class="hal-tag">` | `<ul class="hal-article__tags hal-article__keywords">` / `hal-article__domains` of `<li class="hal-tag">` |
| `<section class="hal-article__details">` | `<div class="hal-article__details">` |
| `.hal-article__abstract` | `.hal-abstract` with `__label`, `__text`, `__ellipsis`, `__more`, `__toggle` |
| `<div class="hal-article__label">` (lvl 0) | `<p class="hal-article__label">` |
| `.hal-pagination__info` ("Page 1 of 4 (37 results)") | numbered pages: `.hal-pagination__list`, `__item`, `__page`, `__gap`, `__btn--prev`, `__btn--next`, `__label`, `__arrow` |
| `<div class="hal-error">`, `<div class="hal-empty">` (replacing the results), `<div class="hal-footer">` | `<p class="hal-error">`, `<p class="hal-empty">` inside `.hal-results`, `<p class="hal-footer">` |
| | new: `.hal-article__links` with `.hal-action--pdf`, `--doi`, `--bibtex`, `--copy`; `.hal-group` / `.hal-group__title` (`groupBy`); `.hal-live`, `.hal-visually-hidden`, `.hal-loading__text`, `.hal-citation` |

The full list is in the [README](../README.md#public-class-names).

Visible content changes:

- Authors are truncated after 10 names with "et al.". Use `maxAuthors: 0` to show them all.
- Document types show a label instead of the code, and `UNDEFINED` is hidden.
- Level 1 adds the venue and PDF/DOI links. Level 2 adds BibTeX and "Copy citation".
- The SVG header reads "Publications" instead of "HAL Search Results". Use the `title` option or the `title=` URL parameter to change it.
- Every string can be translated with `labels`.

## 8. Embed builders and `embed.html`

`EmbedOptions` now extends the URL state (`Partial<UrlState>`):

```js
// 0.4
buildEmbedSnippet({ embedBase, uid: 'jpugetgil', lvl: 2, rows: 5, type: 'svg', mainColor: '#e63946' });

// 0.5
buildEmbedSnippet({ embedBase, query: { idHal: 'jpugetgil' }, lvl: 2, rows: 5, output: 'svg', mainColor: '#e63946' });
```

- `uid` → `query`, `type` → `output`. `backgroundColor`, `textColor`, `mainColor`, `width` and `height` keep their names.
- New: `filters`, `sort`, `theme`, `groupBy`, `highlightAuthors`, `maxAuthors`, `showCredit`, `title`, `iframeTitle`.
- The snippet now escapes every attribute and adds `title` (accessibility), `loading="lazy"` and `style="border:0"`.

`embed.html` still accepts `?uid=…&type=svg`. A field query in `uid` is **no longer wrapped in quotes**, so `uid=authIdHal_s:jdupont` finally works. (Plain text such as `uid=Jane Doe` was passed unquoted in 0.5.0; since 0.6 it is quoted again, as in 0.4, see [migration-0.6.md](migration-0.6.md#4-legacy-uid-plain-text-is-a-phrase-again).)
Prefer the new parameters (`idHal=jdupont&output=svg`). Without any query parameter, the page shows a short message instead of loading the whole archive (`*:*`).

New builders: `buildSvgUrl`, `buildMarkdownSnippet`, `buildWebComponentSnippet`.

## 9. SVG service (`ssr-app`)

- The HTML output is removed. The service only returns SVG images, for Markdown.
- New endpoint: `/svg?…`. README URLs from 0.4 (`/?uid=…&output=svg`) still return the SVG. So does `/?uid=…` without `output`, which used to return HTML.
- No default query: a URL without a criterion returns an error image (0.4 silently showed `jpugetgil`).
- `rows` is capped at 20. Images are cached for 1 hour. Errors are returned as an error image.

```md
<!-- 0.4 -->
![Publications](https://hal-search.vercel.app/?uid=jpugetgil&output=svg)

<!-- 0.5 -->
[![Publications](https://hal-search.vercel.app/svg?idHal=jpugetgil)](https://cv.hal.science/jpugetgil)
```

## 10. Low-level functions

```js
// 0.4
buildUrl(uid, lvl, rows, start, base);
fetchArticles(uid, lvl, rows, start, base);

// 0.5: one object, the same one for both
buildHalUrl({ query: { idHal: 'jdupont' }, lvl: 1, rows: 10, start: 0, apiBase });
fetchArticles({ query: { idHal: 'jdupont' }, filters, sort, lvl: 1, rows: 10, start: 0, apiBase, signal });
```

`fetchArticles` now also throws on HAL's "HTTP 200 with an error body" answers and on unexpected responses, such as an unknown collection. It rejects with an `AbortError` when `signal` aborts (`isAbortError(err)`).

Field lists (`LEVEL_FIELDS`) changed:

- Level 3 no longer requests `fl=*` (about 10× heavier). It now requests an explicit list.
- `publicationDate_s` and `peerReviewing_s` are no longer requested.
- New fields: `producedDateY_i`, `halId_s`, `authIdHalFullName_fs`, `journalTitle_s`, `doiId_s`, `fileMain_s`, `citationFull_s`, `abstract_s`, `language_s`.

If your `onResults` callback read other fields (for example `structName_s`), they are no longer in the response.

## 11. SVG functions and types

| 0.4 | 0.5 |
|---|---|
| `buildArticlesSvg(docs, lvl, pagination, colors)` → `SVGSVGElement` | `renderSvg(docs, { lvl, totalFound, theme, ...colors })` → `string` |
| `renderResultsSvg(container, docs, lvl, pagination, colors)` | `new HalSearch({ container, output: 'svg' })`, or `container.innerHTML = renderSvg(...)` |
| `resolvePalette(overrides)`, palette keys `bg`, `link`, `tagColor`… | `resolvePalette({ theme, backgroundColor, textColor, mainColor })` → `Palette` (`surface`, `cardBg`, `text`, `muted`, `accent`, …) |
| type `SvgColorOverrides` | type `ColorOptions` |
| `SearchParams { uid, rows?, start? }` | `SearchParams { query, filters?, sort?, rows?, page?, lvl? }` |
| `HalSearchOptions.container?` | `HalSearchOptions.container` (required) |
| `HalDoc.version_i`, `structName_s`, `submittedDate_s`, `modifiedDate_s` | no longer declared (still readable as `unknown` through the index signature) |

## 12. Package and scripts

- `main` and `exports.require` now point to `dist/hal-search.cjs` (CommonJS) instead of the UMD file.
- For `<script>` tags, use the new `dist/hal-search.min.js`. It registers `<hal-search>` and exposes the global `HalSearch` namespace, so the class is `HalSearch.HalSearch`.
  `dist/hal-search.umd.js` is still built but is no longer in the `exports` map.
- The `publish` npm script is removed. It ran `npm publish` from npm's own `publish` lifecycle hook. Run `npm publish` directly: `prepublishOnly` runs typecheck, tests and build first.
