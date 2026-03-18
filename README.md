# hal-search

A zero-dependency TypeScript library for querying and displaying articles from the [HAL Open Archive](https://hal.science/) API.

---

## Goal

**hal-search** lets you embed a live, paginated list of academic publications from the HAL API into any web page with a single class instantiation. It handles:

- Building the correct HAL API query from a user ID or free-text query
- Fetching results at a configurable level of detail (minimal → full)
- Rendering styled article cards with pagination
- Exposing callbacks for results and errors

---

## Installation

```bash
# from npm (once published)
npm install hal-search

# or use the built files directly
dist/hal-search.es.js   # ES module
dist/hal-search.umd.js  # UMD (browser global: window.HalSearch)
```

---

## Usage

### Basic example

```html
<div id="publications"></div>

<script type="module">
  import { HalSearch } from './dist/hal-search.es.js';

  const hs = new HalSearch({
    container: '#publications',
    lvl: 1,
    rows: 10,
    onResults: (res) => console.log(`${res.response.numFound} results`),
    onError:   (err) => console.error(err.message),
  });

  hs.search({ uid: 'authIdHal_s:jdupont' });
</script>
```

### Constructor options

| Option         | Type                              | Default | Description |
|----------------|-----------------------------------|---------|-------------|
| `container`    | `HTMLElement \| string`           | —       | Target DOM element or CSS selector (required) |
| `lvl`          | `0 \| 1 \| 2 \| 3`              | `1`     | Level of detail (see below) |
| `rows`         | `number`                          | `10`    | Results per page |
| `apiBase`      | `string`                          | HAL URL | Override the API base URL |
| `injectStyles` | `boolean`                         | `true`  | Auto-inject the default stylesheet |
| `onResults`    | `(res: HalApiResponse) => void`   | —       | Called on every successful fetch |
| `onError`      | `(err: Error) => void`            | —       | Called when the fetch fails |

### Methods

| Method | Description |
|--------|-------------|
| `search({ uid, rows?, start? })` | Start a new search, reset to page 1 |
| `setLevel(lvl)` | Change detail level and re-fetch |
| `goToPage(n)` | Jump to page `n` (1-based) |
| `nextPage()` | Go to the next page |
| `prevPage()` | Go to the previous page |
| `destroy()` | Clear the container |

### Detail levels

The `lvl` parameter controls which HAL fields are requested and how much information is shown per article.

| Level | Name | Fields fetched | What is displayed |
|-------|------|---------------|-------------------|
| `0` | Minimal | `docid`, `label_s`, `uri_s` | Citation label + link |
| `1` | Basic *(default)* | + `title_s`, `authFullName_s`, `publicationDate_s`, `docType_s` | Title, authors, year, document type |
| `2` | Detailed | + `keyword_s`, `domain_s`, `openAccess_bool`, `language_s`, `conferenceTitle_s` | All of the above + tags, OA badge, conference |
| `3` | Full | `*` (all fields) | Same rendering as level 2 |

### Theming

Default styles use CSS custom properties. Override any of them on the container or globally:

```css
#publications {
  --hal-accent:       #e63946;
  --hal-bg-article:   #fff8f0;
  --hal-radius:       4px;
}
```

| Variable | Default |
|----------|---------|
| `--hal-accent` | `#0052cc` |
| `--hal-accent-hover` | `#003d99` |
| `--hal-bg` | `#ffffff` |
| `--hal-bg-article` | `#fafafa` |
| `--hal-border` | `#e0e0e0` |
| `--hal-text` | `#1a1a1a` |
| `--hal-text-muted` | `#666666` |
| `--hal-radius` | `6px` |

Disable auto-injection with `injectStyles: false` and provide your own stylesheet.

### Building a query

The `uid` field passed to `search()` maps directly to the `q` parameter of the HAL Solr API, so any valid Solr query works:

```js
// Free-text
hs.search({ uid: 'machine learning' });

// Author by HAL identifier
hs.search({ uid: 'authIdHal_s:jdupont' });

// By lab structure
hs.search({ uid: 'structId_i:123456' });
```

See the [HAL API documentation](https://api.archives-ouvertes.fr/docs/search) for the full query syntax.

---

## Running the example

```bash
npm run example
```

This builds the library and serves the interactive demo at **http://localhost:8080/example/**. The demo lets you switch queries, levels, and page size in real time.

To run the development sandbox (requires Vite):

```bash
npm run dev
# open http://localhost:5173
```

---

## Contributing

### Project structure

```
src/
  index.ts       # Public exports
  HalSearch.ts   # Main class
  api.ts         # URL builder + fetch logic
  levels.ts      # Field lists per detail level
  renderer.ts    # DOM rendering
  styles.ts      # Default CSS
  types.ts       # TypeScript interfaces
example/
  index.html     # Interactive demo
dist/            # Built output (generated)
```

### Development setup

```bash
git clone <repo>
cd hal-search
npm install
npm run dev      # live dev server at localhost:5173
```

### Building

```bash
npm run build
```

Produces:

| File | Format | Use case |
|------|--------|----------|
| `dist/hal-search.es.js` | ES module | Bundlers, `<script type="module">` |
| `dist/hal-search.umd.js` | UMD | `<script>` tag, CommonJS |
| `dist/index.d.ts` | TypeScript types | TypeScript consumers |

### Guidelines

- **TypeScript strict mode** is enabled — all code must type-check cleanly.
- Keep the library **zero-dependency** at runtime; dev dependencies are fine.
- Rendering lives in `renderer.ts`, API logic in `api.ts` — keep concerns separated.
- Test new features against both the dev sandbox (`index.html`) and the example page (`example/index.html`).
- Follow the existing naming conventions for CSS classes (`.hal-*`).

### Useful link

- [HAL API documentation](https://api.archives-ouvertes.fr/docs/search)
