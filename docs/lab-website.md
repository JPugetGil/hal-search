# Publication lists on a lab or team website

This guide is for webmasters of research units and teams: list the lab's publications from [HAL](https://hal.science/) on WordPress, Hugo, Drupal or plain HTML, and keep the list up to date with no manual export.

Two ways to embed it:

| | `<hal-search>` web component (recommended) | iframe |
|---|---|---|
| Needs | One `<script>` tag | Only an `<iframe>` |
| Result | Interactive cards: pagination, PDF/DOI/BibTeX links, copy citation | Same cards, inside a frame with a fixed height |
| Styling | Attributes + CSS variables (`::part`) | URL parameters (colors, theme) |
| Translations | `labels` attribute | English only (unless you self-host `embed.html`) |

> Build your snippet with the **[configurator](https://jpugetgil.github.io/hal-search/)** and check the preview before pasting it.

## 1. Choose what to list

| Your lab has… | Attribute | URL param | How to find the value |
|---|---|---|---|
| A HAL **collection** (curated by your HAL administrators) | `collection="LIRIS"` | `collection=LIRIS` | The code at the end of the collection page address, e.g. `https://hal.science/LIRIS` |
| A HAL **structure** (lab, team, department) | `struct-id="1234"` | `structId=1234` | The numeric identifier of the structure in [AuréHAL](https://aurehal.archives-ouvertes.fr/structure/index), HAL's structure reference |
| One person | `id-hal="jdupont"` | `idHal=jdupont` | The end of `https://cv.hal.science/jdupont` |

Criteria are combined with AND. For example, `collection="LIRIS" search="graph"` lists the collection's publications that mention "graph".

Then narrow the list with filters:

```html
<hal-search collection="LIRIS" doc-types="ART,COMM,COUV,OUV" year-from="2020" oa></hal-search>
```

- `doc-types`: comma-separated HAL codes. `ART` journal article, `COMM` conference paper, `COUV` book chapter, `OUV` book, `THESE` thesis, `HDR` habilitation, `POSTER`, `REPORT`, `PROCEEDINGS`, `SOFTWARE`, `UNDEFINED` preprint / working paper. The full list is in [src/doctypes.ts](../src/doctypes.ts).
- `year-from` / `year-to`: inclusive year range.
- `oa`: open access only (a bare attribute means "true").

Publications are sorted newest first (`sort="date-desc"`). `sort="date-asc"` and `sort="relevance"` are also available.

## 2. Embed with the web component

```html
<script src="https://cdn.jsdelivr.net/npm/hal-search@0.5/dist/hal-search.min.js" defer></script>

<hal-search collection="LIRIS" group-by="year" rows="20" lvl="1"></hal-search>
```

- Load the script once per page, for example in your site's `<head>` or footer. Then use as many `<hal-search>` elements as you like.
- `@0.5` gets the latest 0.5.x fixes. Pin an exact version (`@0.5.0`) if you never want changes. You can also download `dist/hal-search.min.js` from npm and host it yourself.
- `lvl` sets the detail level: `0` citation only, `1` title, authors, venue and links (default), `2` adds keywords, domains, Open Access badge, BibTeX and copy citation, `3` adds the abstract.
- `rows` sets the number of publications per page (default 10, max 50). Pagination appears below the list.
- Visitors' browsers query the HAL API (`api.archives-ouvertes.fr`) directly. There is no hal-search server in between.

All attributes are listed in the [README](../README.md#url-parameters).

### Grouping by year or by type

`group-by="year"` adds a heading per year. With the default date sort, this gives a chronological list.

`group-by="docType"` adds a heading per document type. Headings appear in the order of the results (the type of the newest publication comes first).
For fixed sections in a fixed order, use one element per type with your own headings:

```html
<h2>Journal articles</h2>
<hal-search collection="LIRIS" doc-types="ART" heading-level="3"></hal-search>

<h2>Conference papers</h2>
<hal-search collection="LIRIS" doc-types="COMM" heading-level="3"></hal-search>
```

`heading-level` sets the HTML level of the publication titles (default `3`, from 2 to 6). With `group-by`, group headings are one level above. Pick values that fit under your page's own headings.

### WordPress

1. In the block editor, add a **Custom HTML** block and paste the snippet (script and element).
2. Publish and check the page.

WordPress only keeps `<script>` tags and unknown elements for users with the `unfiltered_html` capability. That means administrators and editors on a single site, and super admins only on a multisite network.
If the snippet disappears when you save:

- add the `<script>` once for the whole site (your theme, or a plugin that inserts code in the header/footer), and ask an administrator to add the `<hal-search>` block; or
- use the [iframe](#3-embed-with-an-iframe), which most WordPress setups, including hosted plans, accept more readily.

### Hugo

Create a shortcode `layouts/shortcodes/hal-publications.html`:

```go-html-template
{{- /* Usage: {{< hal-publications collection="LIRIS" groupBy="year" rows="20" >}} */ -}}
<hal-search
  {{- with .Get "collection" }} collection="{{ . }}"{{ end }}
  {{- with .Get "structId" }} struct-id="{{ . }}"{{ end }}
  {{- with .Get "idHal" }} id-hal="{{ . }}"{{ end }}
  {{- with .Get "docTypes" }} doc-types="{{ . }}"{{ end }}
  {{- with .Get "yearFrom" }} year-from="{{ . }}"{{ end }}
  {{- with .Get "groupBy" }} group-by="{{ . }}"{{ end }}
  {{- with .Get "lvl" }} lvl="{{ . }}"{{ end }}
  {{- with .Get "rows" }} rows="{{ . }}"{{ end }}
  {{- with .Get "theme" }} theme="{{ . }}"{{ end }}
  {{- with .Get "main" }} main="{{ . }}"{{ end }}
></hal-search>
```

Add the script once in your base template, for example in `layouts/partials/head.html` or your theme's head partial:

```html
<script src="https://cdn.jsdelivr.net/npm/hal-search@0.5/dist/hal-search.min.js" defer></script>
```

Then write `{{< hal-publications collection="LIRIS" groupBy="year" >}}` in any content page. Shortcodes output raw HTML, so you don't need to enable unsafe HTML in Goldmark.

### Drupal

Drupal's text formats filter HTML. With CKEditor 5, the "Limit allowed HTML tags and correct faulty HTML" filter removes `<script>` and unknown elements such as `<hal-search>`. Pick one option:

- **Theme library (cleanest)**: declare the script as an external library in your theme's `*.libraries.yml` and attach it globally. Then add the element and its attributes to the format's allowed tags, for example: `<hal-search collection struct-id id-hal doc-types year-from year-to group-by lvl rows theme main bg text heading-level labels>`.
- **Full HTML** format without the tag filter, for trusted editors only.
- **iframe**: allow `<iframe src title width height loading style>` in the text format and paste the [iframe snippet](#3-embed-with-an-iframe).

### Plain HTML, Jekyll, other generators

Paste the two lines where the list should appear. Nothing else is needed.

## 3. Embed with an iframe

When you can't add a script, embed the hosted page:

```html
<iframe src="https://jpugetgil.github.io/hal-search/embed.html?collection=LIRIS&amp;groupBy=year&amp;rows=20"
  title="Publications from HAL" width="100%" height="900" loading="lazy" style="border:0"></iframe>
```

- The page reads the same [URL parameters](../README.md#url-parameters) as the web component (`collection`, `structId`, `docTypes`, `yearFrom`, `groupBy`, `lvl`, `rows`, `theme`, `bg`, `text`, `main`…). URLs from 0.4 (`uid=…&type=svg`) still work.
- Without a query parameter, it shows a short message instead of loading the whole archive.
- An iframe doesn't resize to its content. Choose `height` for your `rows` and `lvl`, or the frame will scroll.
- The configurator's iframe snippet uses the address where the configurator is served. `buildEmbedSnippet({ embedBase, … })` builds the same snippet in code.
- To host the page yourself, put `example/embed.html` and `dist/hal-search.es.js` in the same folder of your web server and point `src` to it.

## 4. Match your lab's visual identity

Attributes cover the basics:

```html
<hal-search collection="LIRIS" main="#c8102e" bg="#fffaf5" text="#222222" theme="light"></hal-search>
```

- `main`: accent color (links, buttons, current page). Hover and text-on-accent colors are derived from it.
- `bg`: card background. `text`: main text color. The muted text is derived and kept readable.
- `theme`: `light` (default), `dark`, or `auto` to follow the visitor's light/dark preference.
- Accepted colors: hex, `rgb()`, `hsl()`, named colors (`navy`, `white`…). Invalid values are ignored. In URLs, write `#` as `%23`.
- With `theme="auto"`, a light and a dark variant are derived from your colors.
- `highlight="jdupont,mmartin"` puts these authors in bold. The list is comma-separated, so prefer idHal values, or full names written without a comma.

For everything else (fonts, corners, shadows, borders), set the CSS variables through the component's `container` part. The styles live in the component's Shadow DOM, so setting the variables on `hal-search` itself has no effect:

```css
hal-search::part(container) {
  --hal-accent: #c8102e;
  --hal-accent-hover: #9e0c24;
  --hal-font: "Marianne", Arial, sans-serif;
  --hal-radius: 0;
  --hal-shadow: none;
  --hal-border: #d9d9d9;
}
```

Rules set with `::part(container)` take precedence over the `bg`, `text` and `main` attributes.
Group headings, the loading text and the credit link use your page's text color, so they stay readable on any background.
The full list of variables, with their light and dark defaults, is in the [README](../README.md#css-custom-properties-html-output).
With the iframe, only the URL parameters (`main`, `bg`, `text`, `theme`) apply. Your site's CSS can't reach inside the frame.

## 5. Show or hide sections

The element dispatches `hal-results` (`event.detail.response`) and `hal-error` (`event.detail.error`). Both events bubble. For example, to hide a section that has no publications:

```html
<section id="theses">
  <h2>Theses</h2>
  <hal-search collection="LIRIS" doc-types="THESE,HDR" heading-level="3"></hal-search>
</section>

<script>
  document.querySelector('#theses hal-search').addEventListener('hal-results', (event) => {
    if (event.detail.response.response.numFound === 0) document.getElementById('theses').hidden = true;
  });
</script>
```

## 6. French labels

Every visible string can be replaced with the `labels` attribute, a JSON object. Write it between single quotes, and use the typographic apostrophe `’` inside the text:

```html
<html lang="fr">
…
<hal-search collection="LIRIS" group-by="year" labels='{
  "loading": "Chargement…",
  "empty": "Aucune publication trouvée.",
  "error": "Erreur : {message}",
  "previous": "Précédent",
  "next": "Suivant",
  "pageInfo": "Page {page} sur {pages}",
  "resultCount": "{count} publications",
  "resultCountOne": "{count} publication",
  "pagination": "Pages de résultats",
  "openAccess": "Accès ouvert",
  "abstract": "Résumé",
  "showMore": "Afficher plus",
  "showLess": "Afficher moins",
  "untitled": "Sans titre",
  "copyCitation": "Copier la citation",
  "copied": "Copié !",
  "opensInNewTab": "(nouvel onglet)",
  "undated": "Sans date",
  "docTypes": {
    "ART": "Article dans une revue",
    "COMM": "Communication dans un congrès",
    "COUV": "Chapitre d’ouvrage",
    "OUV": "Ouvrage",
    "THESE": "Thèse",
    "HDR": "HDR",
    "POSTER": "Poster",
    "REPORT": "Rapport",
    "SOFTWARE": "Logiciel",
    "UNDEFINED": "Prépublication"
  }
}'></hal-search>
```

- Keys you leave out stay in English. `docTypes` is merged code by code. Invalid JSON is ignored, and the list then shows in English.
- `{count}`, `{page}`, `{pages}` and `{message}` are placeholders.
- With `lang="fr"` on the page (or on a parent element), counts are formatted the French way (`1 234`).
- Year groups (`group-by="year"`) need no translation. Document-type groups use the `docTypes` labels.

The same object works as the `labels` option of the JavaScript `HalSearch` class. See the [README](../README.md#labels-and-translation).

## 7. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Nothing appears | The element needs a query attribute (`collection`, `struct-id`, `id-hal`, `orcid`, `search` or `q`). Check the page source: your CMS may have removed the `<script>` or the element. Check the browser console |
| *Error: HAL API returned an unexpected response. Is "XYZ" a valid HAL collection code?* | Wrong collection code. Check `https://hal.science/XYZ` |
| Some publications are missing | A collection lists what your HAL administrators put in it, and a structure lists the publications affiliated with it in HAL. Fix the affiliation or the collection in HAL itself |
| The list never loads on a site with a Content Security Policy | Allow `script-src https://cdn.jsdelivr.net` (or host the file yourself), `connect-src https://api.archives-ouvertes.fr`, and `style-src 'unsafe-inline'` (the component injects its stylesheet in a `<style>` element) |
| Colors ignored | Invalid color value, or `#` not encoded as `%23` in an iframe URL |
| Headings out of order for accessibility checkers | Set `heading-level` to one level below the heading that introduces the list |
