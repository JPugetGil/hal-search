# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/) (0.x: minor versions may break).

## [0.5.0] - 2026-10-28

A rewrite focused on two audiences: researchers (GitHub README, personal page) and lab webmasters (collections, CMS).
Upgrading: see [docs/migration-0.5.md](docs/migration-0.5.md).

### Added

- Structured queries: `query: { idHal, orcid, structId, collection, text, solr }`, combined with AND. Collections use the `/search/{COLLECTION}/` endpoint.
- Filters (`docTypes`, `yearFrom`, `yearTo`, `openAccess`) and sort (`date-desc`, `date-asc`, `relevance`), as defaults on the constructor or per `search()`.
- `<hal-search>` web component (`defineHalSearchElement()`): open Shadow DOM, attributes mirroring the URL scheme, `hal-results` / `hal-error` events, and `::part(container)` for theming.
- CDN bundle `dist/hal-search.min.js` (`unpkg` / `jsdelivr` fields). It registers `<hal-search>` and exposes the `HalSearch` global namespace.
- CommonJS build `dist/hal-search.cjs` (`main`, `exports.require`).
- Headless SVG: `fetchSvg()`, `renderSvg()` and `renderErrorSvg()`, DOM-free, for Node 18+, browsers and edge runtimes.
- Public URL scheme shared by the embed page, the SVG service and the web component: `parseUrlParams()` / `toUrlParams()`. Legacy `uid` and `type` are still accepted.
- Snippet builders: `buildSvgUrl()`, `buildMarkdownSnippet()` (with a `<picture>` light/dark variant), `buildWebComponentSnippet()`. `buildEmbedUrl()` / `buildEmbedSnippet()` now take the full URL state.
- SVG service endpoint `/svg?…`, a landing page on `/`, error images, a 1-hour CDN cache, a 4-second HAL timeout and a 20-row limit.
- Display options: `groupBy` (`year` / `docType`), `highlightAuthors` (names or idHal, accent-insensitive), `maxAuthors` ("et al."), `showCredit`, `headingLevel`, SVG `title`.
- Themes `light`, `dark` (tuned for GitHub's dark canvas) and `auto`, plus `setTheme()`. Secondary colors are derived from `backgroundColor` / `textColor` / `mainColor` with contrast checks, for hex, `rgb()`/`hsl()` and named colors. With `auto`, a light and a dark variant are derived.
- Translatable strings (`labels`, `DEFAULT_LABELS`, `resolveLabels`, `formatLabel`) and readable document type labels (`DOC_TYPE_LABELS`, `docTypeLabel`).
- HTML cards: venue, PDF / DOI / BibTeX links, "Copy citation", collapsible abstract, keywords and domains, numbered pagination.
- `HalSearch.state` snapshot. `onResults` / `onError` are now safe: callback exceptions are logged.
- Accessibility: live region announcements, `aria-busy`, labelled pagination with `aria-current`, focus management after pagination clicks, `lang` on titles and abstracts, new-tab hints, reduced motion, forced colors and print styles.
- `hasQueryCriterion(query)`: the "is there anything to search?" rule shared by the web component, the embed page and the SVG service. A free text made only of Solr syntax characters (`search=***`) is not a criterion.
- A page beyond the last one (for example a stale README URL after the list shrank) shows the last page instead of "No results found."
- The `orcid` URL parameter also accepts the `https://orcid.org/…` form.
- Exports: `buildHalUrl`, `buildHalWebUrl`, `buildSolrQuery`, `buildFilterQueries`, `resolveSort`, `escapeSolrValue`, `isAbortError`, `getDocLinks`, `normalizeDomains`, `LIGHT_PALETTE`, `DARK_PALETTE`, `isSafeColor`, `paletteToCssVars`.
- Example page turned into a configurator with live preview and copyable snippets. New guides: [GitHub README](docs/github-readme.md) and [lab website](docs/lab-website.md).
- Unit test suite (Vitest + happy-dom), CI workflow (typecheck of the library and the tests, tests, build, `ssr-app` typecheck and build) and Dependabot configuration.

### Changed (breaking)

- `search({ uid, rows, start })` → `search({ query, filters, sort, lvl, rows, page })`.
- Default sort is now by date, newest first (`date-desc`). It was relevance.
- `container` is required. Use `fetchSvg()` for an SVG without a DOM.
- `search`, `goToPage`, `nextPage`, `prevPage` and `setLevel` resolve with `HalApiResponse | undefined` (not `SVGSVGElement | void`) and never reject.
- `destroy()` aborts the in-flight request, cleans up the container and makes the instance final.
- `setColors({ key: undefined })` removes an override.
- CSS variables are scoped to `.hal-search` (no `:root`) and renamed: `--hal-bg` → `--hal-card-bg`, `--hal-bg-article` → `--hal-surface`, `--hal-text-muted` → `--hal-muted`, `--hal-tag-color` → `--hal-tag-text`, `--hal-oa-color` → `--hal-oa-text`.
- HTML markup and classes: list markup (`hal-list` / `hal-item`), `hal-article__year` (was `__date`), `hal-article__venue` (was `__conference`), `hal-abstract*` (was `hal-article__abstract`), numbered pagination (no `hal-pagination__info`). The default stylesheet is inserted first in `<head>`.
- Authors are truncated after 10 names ("et al.", `maxAuthors: 0` for all). Document types are shown as labels and `UNDEFINED` is hidden. The default SVG title is "Publications".
- `buildUrl(uid, lvl, rows, start, base)` → `buildHalUrl({ query, filters, sort, lvl, rows, start, apiBase })`. `fetchArticles(uid, lvl, rows, start, base)` → `fetchArticles({ query, filters, sort, lvl, rows, start, apiBase, signal })`.
- `EmbedOptions`: `uid` → `query`, `type` → `output`.
- `resolvePalette(overrides)` → `resolvePalette({ theme, ...colors })`, with new `Palette` keys.
- Level fields: explicit field lists at every level (level 3 no longer uses `fl=*`). `publicationDate_s` and `peerReviewing_s` are no longer requested.
- `main` / `exports.require` point to `dist/hal-search.cjs` instead of the UMD file.
- SVG service: HTML output removed (`/?uid=…` now returns the SVG). No default query.
- `embed.html`: no default `*:*` query.

### Fixed

- Field queries returned 0 results: the whole query was wrapped in quotes (`"authIdHal_s:x"`). Now only values are quoted (`authIdHal_s:"x"`).
- SSR XSS: color parameters were written unescaped into a `<style>` of the HTML response, and error messages were interpolated unescaped into the HTML/SVG output. Every value is now validated (`isSafeColor`) or XML-escaped, and responses carry a strict CSP.
- SSR concurrency: the service swapped the global `window`/`document` (JSDOM) for each request, so concurrent requests could interfere. Rendering is now DOM-free and per request.
- An exception thrown by `onResults` replaced the rendered results with an error message.
- Request races: a slow response could overwrite a newer search. Previous requests are now aborted and stale responses ignored.
- `setColors()` had no effect on SVG output until the next request.
- The `publish` npm script ran `npm publish` from npm's own `publish` lifecycle hook. It is removed; `prepublishOnly` runs typecheck, tests and build.
- HAL errors returned with HTTP 200 (`{ "error": … }`) and unknown collections are reported as errors instead of failing later.
- `buildEmbedSnippet()` did not escape attribute values.
- The example page's embed code referenced an undefined `embedIframe` and threw when shown.

### Removed

- `buildUrl` (use `buildHalUrl`), `buildArticlesSvg` and `renderResultsSvg` (use `renderSvg` / `fetchSvg` / `output: 'svg'`), the `SvgColorOverrides` type (use `ColorOptions`).
- Headless mode of `HalSearch` (no container).
- HTML output of the SVG service (`ssr-app`), its client entry and JSDOM.
- The `publish` npm script.

## [0.4.0] - 2026-05-17

### Added

- Readable domain labels (`normalizeDomains`), using HAL's `en_domainAllCodeLabel_fs` labels.
- README documentation for the color options.

## [0.3.0] - 2026-03-26

### Added

- Color options (`backgroundColor`, `textColor`, `mainColor`) applied to the SVG output and passed through the SSR service (`bg`, `text`, `main`).

## [0.2.0] - 2026-03-26

### Added

- Color customization of the article cards (`backgroundColor`, `textColor`, `mainColor`, `setColors()`) and in the embed settings.
- `repository` field in `package.json`.

## [0.1.0] - 2026-03-25

### Added

- `HalSearch` class: HAL API search, four detail levels, pagination and styled article cards.
- SVG output, abstract rendering and footer credit.
- Embeddable page (`embed.html`) with `buildEmbedUrl` / `buildEmbedSnippet`.
- SSR application (Vite + Express) rendering HTML or SVG.
- Interactive example deployed to GitHub Pages, npm publish workflow.

[0.5.0]: https://github.com/JPugetGil/hal-search/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/JPugetGil/hal-search/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/JPugetGil/hal-search/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/JPugetGil/hal-search/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/JPugetGil/hal-search/releases/tag/v0.1.0
