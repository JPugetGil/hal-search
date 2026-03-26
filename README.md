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
# from npm
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
| `container`       | `HTMLElement \| string`           | —         | Target DOM element or CSS selector (optional if output='svg') |
| `lvl`             | `0 \| 1 \| 2 \| 3`              | `1`       | Level of detail (see below) |
| `rows`            | `number`                          | `10`      | Results per page |
| `apiBase`         | `string`                          | HAL URL   | Override the API base URL |
| `injectStyles`    | `boolean`                         | `true`    | Auto-inject the default stylesheet |
| `backgroundColor` | `string`                          | `#ffffff` | Background color for article cards (sets `--hal-bg`) |
| `textColor`       | `string`                          | `#1a1a1a` | Text color for article content (sets `--hal-text`) |
| `mainColor`       | `string`                          | `#0052cc` | Accent color for links, buttons, and highlights (sets `--hal-accent`) |
| `onResults`       | `(res: HalApiResponse) => void`   | —         | Called on every successful fetch |
| `onError`         | `(err: Error) => void`            | —         | Called when the fetch fails |

### Methods

| Method | Description |
|--------|-------------|
| `search({ uid, rows?, start? })` | Start a new search. Returns `Promise<SVGSVGElement>` if headless SVG mode. |
| `setLevel(lvl)` | Change detail level and re-fetch. Returns `Promise<SVGSVGElement>` if headless SVG mode. |
| `goToPage(n)` | Jump to page `n` (1-based). Returns `Promise<SVGSVGElement>` if headless SVG mode. |
| `nextPage()` | Go to the next page. Returns `Promise<SVGSVGElement>` if headless SVG mode. |
| `prevPage()` | Go to the previous page. Returns `Promise<SVGSVGElement>` if headless SVG mode. |
| `setColors({ backgroundColor?, textColor?, mainColor? })` | Update colors at runtime. Only provided colors are changed. |
| `destroy()` | Clear the container (if one was provided) |

### Headless SVG generation

You can generate a standalone SVG without attaching it to the DOM by omitting the `container` option and setting `output: 'svg'`. The `search()` method (and pagination methods) will resolve with the SVG element.

```js
const hs = new HalSearch({
  output: 'svg',
  lvl: 2,
  rows: 5,
});

const svgElement = await hs.search({ uid: 'authIdHal_s:jdupont' });
document.body.appendChild(svgElement);
```

### Detail levels

The `lvl` parameter controls which HAL fields are requested and how much information is shown per article.

| Level | Name | Fields fetched | What is displayed |
|-------|------|---------------|-------------------|
| `0` | Minimal | `docid`, `label_s`, `uri_s` | Citation label + link |
| `1` | Basic *(default)* | + `title_s`, `authFullName_s`, `publicationDate_s`, `docType_s` | Title, authors, year, document type |
| `2` | Detailed | + `keyword_s`, `domain_s`, `openAccess_bool`, `language_s`, `conferenceTitle_s` | All of the above + tags, OA badge, conference |
| `3` | Full | `*` (all fields) | Adds the abstract of the paper |

### Color customization

Three color options let you control the look of hal-search without writing CSS:

| Option | CSS variable | What it affects |
|--------|-------------|-----------------|
| `backgroundColor` | `--hal-bg` | Article card backgrounds (HTML), card fill (SVG) |
| `textColor` | `--hal-text` | Body text, author names, abstracts (HTML & SVG) |
| `mainColor` | `--hal-accent` | Links, title hover color, pagination buttons, header bar (HTML & SVG) |

These options work in all rendering modes: HTML cards, inline SVG, headless SVG, and server-side rendering (SSR).

#### Via constructor

```js
const hs = new HalSearch({
  container: '#publications',
  backgroundColor: '#1a1a2e',  // dark card background
  textColor:       '#e0e0e0',  // light text
  mainColor:       '#e63946',  // red accent
});
```

#### At runtime

Update colors at any time without re-fetching — the change is applied immediately to the existing results:

```js
hs.setColors({
  backgroundColor: '#ffffff',
  textColor:       '#1a1a1a',
  mainColor:       '#0052cc',
});
```

You can update a single color and leave the others unchanged:

```js
hs.setColors({ mainColor: '#16a34a' }); // only change the accent
```

#### Via URL query parameters (embed & SSR)

When using the embed page or the SSR app, pass colors as URL parameters:

| Parameter | Maps to |
|-----------|---------|
| `bg`      | `backgroundColor` |
| `text`    | `textColor` |
| `main`    | `mainColor` |

Values must be URL-encoded (`#` becomes `%23`).

**Embed example:**

```html
<iframe
  src="embed.html?uid=jpugetgil&lvl=2&rows=5&bg=%231a1a2e&text=%23e0e0e0&main=%23e63946"
  width="100%" height="600" frameborder="0" style="border:none;">
</iframe>
```

**SSR example:**

```
GET /?uid=jpugetgil&output=html&bg=%231a1a2e&text=%23e0e0e0&main=%23e63946
GET /?uid=jpugetgil&output=svg&bg=%231a1a2e&text=%23e0e0e0&main=%23e63946
```

### Theming

For finer control, default styles use CSS custom properties. Override any of them on the container or globally:

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
