# Migrating from 0.5 to 0.6

0.6 adds French, strict Content Security Policy support, structured data and the `hal-search/svg` entry. Most sites only need to change the version in the CDN URL:

```html
<script src="https://cdn.jsdelivr.net/npm/hal-search@0.6/dist/hal-search.min.js" defer></script>
```

README images (`https://hal-search.vercel.app/svg?…`) and embed URLs don't change. The behaviour changes are below.

Quick checklist:

- [ ] A full `Labels` object needs the new `missingQuery` key ([1](#1-new-label-missingquery))
- [ ] `HalSearch.search()` with an empty query no longer lists the whole archive ([2](#2-an-empty-query-sends-no-request))
- [ ] `<hal-search>` colors: variables on `hal-search` now apply, `::part(container)` is for layout ([3](#3-styling-hal-search))
- [ ] Legacy `uid=` URLs with plain text are searched as a phrase again ([4](#4-legacy-uid-plain-text-is-a-phrase-again))
- [ ] French labels written by hand: add `lang="fr"` / `locale: 'fr'` so counts stay French ([5](#5-result-counts-follow-the-labels-not-the-page))

---

## 1. New label: `missingQuery`

`Labels` has a new required key, `missingQuery`, shown when there is nothing to search ([2](#2-an-empty-query-sends-no-request)).
`labels` options and the `labels` attribute are partial, so they keep working. Only code that builds a complete `Labels` object (TypeScript reports it) must add the key:

```ts
const labels: Labels = {
  ...myLabels,
  missingQuery: 'No search criterion given.',
};
```

Translating everything into French by hand is no longer needed: use `locale: 'fr'` (or `lang="fr"`), then override only what you want. Your `labels` apply on top of the locale. See [Language](../README.md#language).

## 2. An empty query sends no request

In 0.5, `HalSearch.search()` with a query that has no criterion sent `q=*:*`, which lists the whole HAL archive (millions of documents). The web component, the embed page and the SVG service already refused it.

```js
// 0.5: requests the whole archive
// 0.6: no request, the container shows labels.missingQuery
await hs.search({ query: {} });             // resolves undefined
await hs.search({ query: { text: '***' } }); // Solr syntax only: not a criterion
await hs.search({ query: '' });
```

- `onResults` and `onError` are not called. Any request in flight is aborted.
- `goToPage()`, `nextPage()`, `prevPage()` and `setLevel()` don't send anything either until the next search with a criterion.
- To list the whole archive on purpose, pass the raw query: `hs.search({ query: '*:*' })`.
- An invalid query (`{ structId: 'abc' }`) is still an error, reported through `onError`.
- Check user input beforehand with `hasQueryCriterion(query)`.

`<hal-search>` without a query attribute (or with `search="*"`) still sends no request, but now shows the same message instead of staying empty. If you relied on an empty element being invisible, hide it yourself until it has a criterion.

## 3. Styling `<hal-search>`

In 0.5, variables set on the element (`hal-search { --hal-accent: … }`) were ignored, and the README said to use `hal-search::part(container)` for everything.
In 0.6 the variables set on `hal-search` apply. Precedence, strongest first:

1. `bg`, `text` and `main` attributes;
2. variables your page sets on `hal-search`;
3. the defaults of the `theme`.

```css
/* 0.5 */
hal-search::part(container) { --hal-accent: #c8102e; --hal-font: "Marianne", sans-serif; }

/* 0.6 */
hal-search { --hal-accent: #c8102e; --hal-font: "Marianne", sans-serif; }
hal-search::part(container) { max-width: 48rem; } /* layout */
```

Your 0.5 rules keep working: variables set through `::part(container)` still override everything, the `bg`, `text` and `main` attributes included. Move them to `hal-search` if you want the attributes to win.

The element now also carries `data-hal-theme` (its theme) on the host. It no longer has a `<style>` element in its shadow root: its styles are adopted stylesheets, which work under a strict Content Security Policy.

For `HalSearch` nothing changes, except on pages whose CSP blocks `<style>` elements: there the default stylesheet is adopted after your own, so overrides at equal specificity need a more specific selector. See [Content Security Policy](../README.md#content-security-policy).

## 4. Legacy `uid`: plain text is a phrase again

0.4 always sent `uid` as a quoted phrase. 0.5 passed it unquoted, so `uid=Jane Doe` matched "Jane" and "Doe" anywhere in a record. 0.6 restores the 0.4 meaning for plain text:

| URL | 0.5 | 0.6 |
|---|---|---|
| `?uid=Jane%20Doe` | `Jane Doe` (both words, any order) | `"Jane Doe"` (exact phrase, like 0.4) |
| `?uid=authIdHal_s:jdupont` | raw query | raw query (unchanged) |

A value containing `:` or `"` is a field query and is passed as is, like `q`. New URLs should use `search=` (free text) or `q=` (raw Solr) instead of `uid`.

## 5. Result counts follow the labels, not the page

In 0.5, the HTML result count was formatted for the closest `lang` attribute: on a `<html lang="fr">` page, "1 234". In 0.6 it is formatted in the language of the labels, so English labels always give "1,234 results", whatever the page.

If you translated the labels by hand with `labels` (the 0.5 way), add the language so the counts are French again. The built-in French labels then apply, and yours on top:

```html
<!-- 0.5 -->
<hal-search collection="LIRIS" labels='{"resultCount":"{count} publications", …}'></hal-search>

<!-- 0.6 -->
<hal-search collection="LIRIS" lang="fr" labels='{"resultCount":"{count} publications"}'></hal-search>
```

```js
new HalSearch({ container: '#publications', locale: 'fr', labels: { resultCount: '{count} publications' } });
```

You can usually drop most of your hand-written labels: keep only the ones that differ from the built-in French.

## Also new (no action needed)

- `lang` URL parameter and `lang` attribute: `en` (default) or `fr`. Snippets built with `locale: 'fr'` include it.
- `structuredData` / `structured-data`: opt-in schema.org JSON-LD. See [Structured data](../README.md#structured-data-for-search-engines).
- `hal-search/svg`: a DOM-free entry for Node, edge runtimes and SSR. See [`hal-search/svg`](../README.md#hal-searchsvg-node-edge-and-ssr).
- TypeScript projects using `moduleResolution: node16` or `nodenext` now get real types instead of `any`.
- The npm package no longer contains source maps.
