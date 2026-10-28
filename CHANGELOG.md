# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/) (0.x: minor versions may break).

## [0.6.0] - 2026-10-28

French, strict Content Security Policies, structured data, and a lighter package.
Upgrading: see [docs/migration-0.6.md](docs/migration-0.6.md). The URL scheme is unchanged, apart from the new `lang` parameter.

### Added

- French locale: `locale` option (`'en'` default, `'fr'`; `'fr-FR'` → `'fr'`; other languages fall back to English), `lang` URL parameter (embed page, SVG service: `https://hal-search.vercel.app/svg?idHal=…&lang=fr`) and the standard `lang` attribute on `<hal-search>`. French labels, HAL's own French document types, French domain labels (`fr_domainAllCodeLabel_fs`, from `lvl=2`), locale number formatting (`9 183 résultats`) and plural rules. `labels` overrides apply on top of the locale. `HalSearch` sets `lang` on its container (restored by `destroy()`), `renderSvg` on the SVG root.
- SVG service: French error images with `lang=fr`. The landing page lists the parameter.
- Snippet builders and `toUrlParams`: an explicit `locale` adds `lang` to the URLs and attributes (`en` included), and translates the default alt text / iframe title ("Publications sur HAL").
- Exports `DEFAULT_LOCALE`, `LOCALES`, `resolveLocale()`. `resolveLabels(overrides, locale?)`, `resolveFields(lvl, locale?)`, and a `locale` parameter for `fetchArticles`, `buildHalUrl` and `fetchSvg`.
- `structuredData` option / `structured-data` attribute (opt-in): schema.org JSON-LD (`ItemList` of `ScholarlyArticle`, `Thesis`, `Book`, `Chapter`) describing the displayed page, in the light DOM. Replaced on each render, removed while loading, on errors, empty results and `destroy()`. A data block, so a CSP doesn't block it.
- `hal-search/svg` subpath: the DOM-free part of the API (everything except `HalSearch`, `defineHalSearchElement`, `DEFAULT_CSS` and `injectDefaultStyles`) for Node, edge runtimes and SSR, as ES module and CommonJS (about 42 kB instead of 82 kB). Its types compile without the DOM lib (so it doesn't export `HalSearchOptions`), and resolve under `moduleResolution: node10` too (`typesVersions`). The SVG service uses it.
- `<hal-search>` theming with page variables: `hal-search { --hal-accent: … }` now works. Precedence: `bg` / `text` / `main` attributes > variables set on the element > theme defaults. The element mirrors its theme in `data-hal-theme`.
- `Labels.missingQuery` ("No search criterion given." / "Aucun critère de recherche indiqué.") and the `hal-empty--missing-query` class.
- React and Vue usage of `<hal-search>` in the README (no wrapper package).
- SVG root markers for monitoring: `data-hal-count` (total, a plain integer) on `renderSvg` output, `data-hal-error="true"` on error images (`renderErrorSvg` and the SVG service's fallback image).
- Monitoring of the public SVG service: `.github/workflows/health.yml` checks it every 6 hours (status, content type, error images, empty lists for a known author, `cdg1` function region, response time). A failing scheduled run emails the maintainer.

### Changed

- `HalSearch.search()` with a query that has no criterion (`{}`, `{ idHal: '' }`, `{ text: '***' }`, `''`) no longer requests the whole archive (`q=*:*`, millions of documents). It sends nothing, shows `labels.missingQuery`, resolves `undefined` and calls neither `onResults` nor `onError`. A raw `'*:*'` is still sent.
- `<hal-search>` without a query criterion shows `labels.missingQuery` (in its `lang`) instead of staying empty. It still sends no request.
- **Breaking for full `Labels` objects**: `missingQuery` is a new required key. `Partial<Labels>` overrides are not affected.
- HTML result counts are formatted in the language of the labels (English by default), no longer in the language of the closest `lang` attribute: `<html lang="fr">` with English labels gave "1 234 results".
- Strict Content Security Policy (no `style-src 'unsafe-inline'`): `<hal-search>` styles itself with constructable stylesheets instead of `<style>` elements. `HalSearch` still inserts `<style id="hal-search-styles">` first in `<head>`, and adopts the same stylesheet when a CSP blocks it. Inline styles are written through the CSSOM. The inline SVG output (`output: 'svg'`) gets its colors from an attached stylesheet instead of a `<style>` inside the SVG (`renderSvg()` and `fetchSvg()` still embed it).
- Trusted Types (`require-trusted-types-for 'script'`): the inline SVG markup and the JSON-LD go through a policy named `hal-search`. A page that restricts policy names must allow it (`trusted-types hal-search`); otherwise inline SVG output fails with an explanatory error (`onError`), and HTML output is unaffected.
- `<hal-search>` declares its theme defaults on `:host`. Variables set through `::part(container)` still override everything; the README now recommends `::part(container)` for layout only.
- The ES bundle is minified (whitespace included, `/* @__PURE__ */` annotations kept), and bundlers can drop the HTML widget, its stylesheet and the web component from apps that only import `renderSvg`, `fetchSvg` or `buildHalUrl`.
- Source maps are no longer published: the npm tarball is about 200 kB instead of 448 kB, with the new `hal-search/svg` files and CommonJS declarations included. The bundles carry no `sourceMappingURL`.
- Build: type declarations are emitted by `tsc` (`npm run build:types`) instead of `vite-plugin-dts`, with TypeScript 7. `npm run typecheck` also checks the `hal-search/svg` entry without the DOM lib.
- The configurator has a language selector, and its snippets load `hal-search@0.6`. The dev sandbox (`npm run dev`) has language and JSON-LD switches.

### Fixed

- The Dependabot update to TypeScript 7 broke `npm run build`: `vite-plugin-dts` needs the JavaScript compiler API that TypeScript 7 no longer ships. Declarations are now emitted by `tsc` itself.
- The type declarations didn't resolve under `moduleResolution: node16` / `nodenext`: the whole package was silently typed `any` (or failed without `skipLibCheck`). Relative imports in `dist/*.d.ts` now carry `.js`.
- TypeScript CommonJS consumers (`import x = require('hal-search')` in a `.cts` file) got ES module declarations (TS1471). The `require` conditions now have their own `.d.cts` declarations.
- Legacy `uid` URLs from 0.4 (`uid=Jane Doe`): plain text is searched as an exact phrase again, as in 0.4. 0.5 passed it unquoted, which matched the words in any order. Field queries (`uid=authIdHal_s:x`) stay raw.

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

[0.6.0]: https://github.com/JPugetGil/hal-search/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/JPugetGil/hal-search/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/JPugetGil/hal-search/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/JPugetGil/hal-search/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/JPugetGil/hal-search/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/JPugetGil/hal-search/releases/tag/v0.1.0
