import { DARK_PALETTE, LIGHT_PALETTE, paletteToCssVars } from './theme';

// ---------------------------------------------------------------------------
// Theme variables (generated from the palettes: single source of truth)
// ---------------------------------------------------------------------------

/** Non-color variables, shared by every theme. */
const BASE_VARS: Record<string, string> = {
  '--hal-font': 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  '--hal-radius': '6px',
};

const LIGHT_SHADOW = '0 1px 3px rgba(0, 0, 0, 0.08)';
const DARK_SHADOW = '0 1px 3px rgba(0, 0, 0, 0.45)';

function declarations(vars: Record<string, string>, indent: string): string {
  return Object.keys(vars)
    .map((name) => `${indent}${name}: ${vars[name]};`)
    .join('\n');
}

function themeVars(palette: typeof LIGHT_PALETTE, shadow: string, indent: string): string {
  return declarations({ ...paletteToCssVars(palette), '--hal-shadow': shadow }, indent);
}

const VISUALLY_HIDDEN: Record<string, string> = {
  position: 'absolute !important',
  width: '1px !important',
  height: '1px !important',
  padding: '0 !important',
  margin: '-1px !important',
  overflow: 'hidden !important',
  clip: 'rect(0, 0, 0, 0) !important',
  'white-space': 'nowrap !important',
  border: '0 !important',
};

// ---------------------------------------------------------------------------
// Stylesheet
// ---------------------------------------------------------------------------

/**
 * Default stylesheet of the HTML output. Everything is scoped under `.hal-search`
 * (no `:root`), and every color comes from a `--hal-*` custom property:
 * light defaults on `.hal-search`, dark on `[data-hal-theme="dark"]` and on
 * `[data-hal-theme="auto"]` when the visitor prefers a dark scheme.
 *
 * Elements outside the cards (group headings, loading text, credit) inherit the
 * host page text color, so they stay readable whatever the page background.
 * Injected first in `<head>`: page stylesheets win at equal specificity.
 */
export const DEFAULT_CSS: string = /* @__PURE__ */ buildDefaultCss();

// A function call annotated as pure can be dropped by bundlers when DEFAULT_CSS is unused (an app importing
// only renderSvg); a template literal that calls functions cannot.
function buildDefaultCss(): string {
  return `
/* hal-search — default styles (https://github.com/JPugetGil/hal-search) */
.hal-search {
${declarations(BASE_VARS, '  ')}
${themeVars(LIGHT_PALETTE, LIGHT_SHADOW, '  ')}
  color-scheme: light;
  font-family: var(--hal-font);
  line-height: 1.5;
}

.hal-search[data-hal-theme="dark"] {
${themeVars(DARK_PALETTE, DARK_SHADOW, '  ')}
  color-scheme: dark;
}

@media (prefers-color-scheme: dark) {
  .hal-search[data-hal-theme="auto"] {
${themeVars(DARK_PALETTE, DARK_SHADOW, '    ')}
    color-scheme: dark;
  }
}

.hal-search *,
.hal-search *::before,
.hal-search *::after {
  box-sizing: border-box;
}

/* Screen-reader-only text (also set inline by the renderer) */
.hal-search .hal-visually-hidden {
${declarations(VISUALLY_HIDDEN, '  ')}
}

/* Results wrapper: focus target after a pagination click */
.hal-search .hal-results {
  width: 100%;
}

.hal-search .hal-results:focus {
  outline: none;
}

.hal-search .hal-results:focus-visible {
  outline: 2px solid var(--hal-accent);
  outline-offset: 4px;
  border-radius: var(--hal-radius);
}

/* Lists (reset host-page list styles) */
.hal-search .hal-list,
.hal-search .hal-article__tags,
.hal-search .hal-pagination__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.hal-search .hal-item,
.hal-search .hal-tag,
.hal-search .hal-pagination__item {
  margin: 0;
  padding: 0;
}

.hal-search .hal-item::before,
.hal-search .hal-tag::before,
.hal-search .hal-pagination__item::before {
  content: none;
}

.hal-search .hal-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Group headings (groupBy) */
.hal-search .hal-group + .hal-group {
  margin-top: 24px;
}

.hal-search .hal-group__title {
  margin: 0 0 10px 0;
  padding: 0 0 4px 0;
  border-bottom: 2px solid var(--hal-accent);
  color: inherit;
  font-family: inherit;
  font-size: 1.1rem;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: normal;
  text-transform: none;
}

/* Loading state */
.hal-search .hal-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 24px 0;
  color: inherit;
  opacity: 0.8;
  font-size: 0.95rem;
}

.hal-search .hal-spinner {
  flex: none;
  width: 18px;
  height: 18px;
  border: 2px solid var(--hal-border);
  border-top-color: var(--hal-accent);
  border-radius: 50%;
  animation: hal-spin 0.7s linear infinite;
}

@keyframes hal-spin {
  to { transform: rotate(360deg); }
}

/* Error and empty states */
.hal-search .hal-error,
.hal-search .hal-empty {
  margin: 0;
  padding: 16px;
  border-radius: var(--hal-radius);
  font-size: 0.9rem;
}

.hal-search .hal-error {
  background: var(--hal-error-bg);
  border: 1px solid var(--hal-error-border);
  color: var(--hal-error-text);
}

.hal-search .hal-empty {
  background: var(--hal-surface);
  border: 1px solid var(--hal-border);
  color: var(--hal-muted);
}

/* Article card */
.hal-search .hal-article {
  margin: 0;
  padding: 18px 20px;
  background: var(--hal-card-bg);
  color: var(--hal-text);
  border: 1px solid var(--hal-border);
  border-radius: var(--hal-radius);
  box-shadow: var(--hal-shadow);
  overflow-wrap: break-word;
}

/* Title */
.hal-search .hal-article__title {
  margin: 0 0 6px 0;
  padding: 0;
  color: var(--hal-text);
  font-family: inherit;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: normal;
  text-transform: none;
}

.hal-search .hal-article__title a,
.hal-search .hal-article__link {
  color: var(--hal-accent);
  text-decoration: none;
}

.hal-search .hal-article__title a:hover,
.hal-search .hal-article__link:hover {
  color: var(--hal-accent-hover);
  text-decoration: underline;
}

/* Citation (lvl 0) */
.hal-search .hal-article__label {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.5;
}

/* Authors */
.hal-search .hal-article__authors {
  margin: 0 0 4px 0;
  font-size: 0.875rem;
  font-weight: 500;
}

.hal-search .hal-author--highlight {
  font-weight: 700;
}

/* Meta row: year · venue · badges */
.hal-search .hal-article__meta {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  color: var(--hal-muted);
  font-size: 0.85rem;
  /* Hides a separator that would start a wrapped line: it hangs left of its item (see below),
     i.e. left of the row when the item starts a line. Only the left side is clipped. */
  clip-path: inset(-1em -1em -1em -2px);
}

.hal-search .hal-article__venue {
  font-style: italic;
}

/* Room for the separator: 6px gap + 8px = the 14px box of the dot. */
.hal-search .hal-article__year {
  margin-right: 8px;
}

/* The "·" sits in the space before the venue, outside the venue box: never at the start of a line. */
.hal-search .hal-article__year + .hal-article__venue::before {
  content: '·';
  content: '·' / '';
  display: inline-block;
  width: 14px;
  margin-left: -14px;
  text-align: center;
  font-style: normal;
}

/* Badges */
.hal-search .hal-badge {
  display: inline-block;
  padding: 2px 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: var(--hal-tag-bg);
  color: var(--hal-tag-text);
  font-size: 0.75rem;
  font-style: normal;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: 0.02em;
}

.hal-search .hal-badge--oa {
  background: var(--hal-oa-bg);
  color: var(--hal-oa-text);
}

/* Links row: PDF, DOI, BibTeX, Copy citation */
.hal-search .hal-article__links {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.hal-search .hal-action {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  margin: 0;
  padding: 3px 10px;
  border: 1px solid var(--hal-border);
  border-radius: var(--hal-radius);
  background: var(--hal-card-bg);
  box-shadow: none;
  color: var(--hal-accent);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 500;
  line-height: 1.2;
  letter-spacing: normal;
  text-decoration: none;
  text-transform: none;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s, color 0.15s;
}

.hal-search .hal-action:hover {
  border-color: var(--hal-accent-hover);
  background: var(--hal-tag-bg);
  background: color-mix(in srgb, var(--hal-accent-hover) 10%, var(--hal-card-bg));
  color: var(--hal-accent-hover);
}

/* Copy fallback: selectable citation when the clipboard is unavailable */
.hal-search .hal-citation {
  display: block;
  width: 100%;
  margin-top: 8px;
  padding: 6px 8px;
  border: 1px solid var(--hal-border);
  border-radius: var(--hal-radius);
  background: var(--hal-surface);
  color: var(--hal-text);
  font: inherit;
  font-size: 0.8rem;
  resize: vertical;
}

/* Details (lvl >= 2) */
.hal-search .hal-article__details {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--hal-border);
}

.hal-search .hal-article__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.hal-search .hal-tag {
  display: inline-block;
  padding: 2px 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: var(--hal-tag-bg);
  color: var(--hal-tag-text);
  font-size: 0.78rem;
  line-height: 1.4;
}

.hal-search .hal-tag--domain {
  background: var(--hal-domain-bg);
  color: var(--hal-domain-text);
}

/* Abstract (lvl 3) */
.hal-search .hal-abstract__label {
  display: block;
  margin-bottom: 2px;
  color: var(--hal-muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.hal-search .hal-abstract__text {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.55;
}

.hal-search .hal-abstract__toggle {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  margin: 2px 0 0 0;
  padding: 2px 0;
  border: 0;
  background: none;
  box-shadow: none;
  color: var(--hal-accent);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: normal;
  text-decoration: underline;
  text-underline-offset: 2px;
  text-transform: none;
  cursor: pointer;
}

.hal-search .hal-abstract__toggle:hover {
  color: var(--hal-accent-hover);
}

/* Footer credit */
.hal-search .hal-footer {
  margin: 12px 0 0 0;
  text-align: right;
  font-size: 0.75rem;
}

.hal-search .hal-footer__link {
  color: inherit;
  opacity: 0.75;
  text-decoration: none;
}

.hal-search .hal-footer__link:hover {
  color: var(--hal-accent-hover);
  opacity: 1;
  text-decoration: underline;
}

/* Pagination */
.hal-search .hal-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--hal-border);
  font-size: 0.875rem;
}

.hal-search .hal-pagination__list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.hal-search .hal-pagination__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 36px;
  min-height: 36px;
  margin: 0;
  padding: 6px 14px;
  border: 1px solid var(--hal-border);
  border-radius: var(--hal-radius);
  background: var(--hal-card-bg);
  box-shadow: none;
  color: var(--hal-accent);
  font: inherit;
  font-size: 0.875rem;
  line-height: 1.2;
  letter-spacing: normal;
  text-transform: none;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s, color 0.15s;
}

.hal-search .hal-pagination__page {
  padding: 6px 8px;
  font-variant-numeric: tabular-nums;
}

.hal-search .hal-pagination__btn:hover:not(:disabled) {
  border-color: var(--hal-accent-hover);
  background: var(--hal-tag-bg);
  background: color-mix(in srgb, var(--hal-accent-hover) 10%, var(--hal-card-bg));
  color: var(--hal-accent-hover);
}

.hal-search .hal-pagination__page[aria-current="page"],
.hal-search .hal-pagination__page[aria-current="page"]:hover:not(:disabled) {
  border-color: var(--hal-accent);
  background: var(--hal-accent);
  color: var(--hal-accent-text);
  font-weight: 700;
  cursor: default;
}

.hal-search .hal-pagination__btn:disabled {
  color: var(--hal-muted);
  cursor: not-allowed;
  opacity: 0.5;
}

.hal-search .hal-pagination__gap {
  display: inline-block;
  min-width: 24px;
  color: inherit;
  opacity: 0.7;
  text-align: center;
}

/* Keyboard focus */
.hal-search a:focus-visible,
.hal-search button:focus-visible,
.hal-search textarea:focus-visible {
  outline: 2px solid var(--hal-accent);
  outline-offset: 2px;
}

/* Narrow screens (down to 320px) */
@media (max-width: 30em) {
  .hal-search .hal-article {
    padding: 14px;
  }

  .hal-search .hal-pagination__list {
    order: -1;
    flex-basis: 100%;
  }

  .hal-search .hal-pagination__btn--prev,
  .hal-search .hal-pagination__btn--next {
    padding: 6px 10px;
  }

  .hal-search .hal-pagination__label {
${declarations(VISUALLY_HIDDEN, '    ')}
  }
}

@media (prefers-reduced-motion: reduce) {
  .hal-search .hal-spinner {
    animation: none;
  }

  .hal-search .hal-action,
  .hal-search .hal-pagination__btn {
    transition: none;
  }
}

/* Windows high contrast: keep the current page and the spinner visible */
@media (forced-colors: active) {
  .hal-search .hal-pagination__page[aria-current="page"] {
    forced-color-adjust: none;
    border-color: Highlight;
    background: Highlight;
    color: HighlightText;
  }

  .hal-search .hal-spinner {
    forced-color-adjust: none;
    border-color: GrayText;
    border-top-color: Highlight;
  }
}

@media print {
  .hal-search,
  .hal-search[data-hal-theme] {
${themeVars(LIGHT_PALETTE, 'none', '    ')}
    color-scheme: light;
  }

  .hal-search .hal-pagination,
  .hal-search .hal-action--copy,
  .hal-search .hal-abstract__toggle,
  .hal-search .hal-abstract__ellipsis,
  .hal-search .hal-citation,
  .hal-search .hal-loading,
  .hal-search .hal-footer {
    display: none !important;
  }

  .hal-search .hal-abstract__more[hidden] {
    display: inline !important;
  }

  .hal-search .hal-article {
    box-shadow: none;
    break-inside: avoid;
  }

  .hal-search .hal-article__title a[href]::after,
  .hal-search .hal-article__link[href]::after,
  .hal-search .hal-action--doi[href]::after {
    content: " (" attr(href) ")";
    color: var(--hal-muted);
    font-size: 0.8em;
    font-weight: 400;
    overflow-wrap: anywhere;
  }
}
`;
}

// ---------------------------------------------------------------------------
// Injection
// ---------------------------------------------------------------------------

const STYLE_ID = 'hal-search-styles';

function isDocument(root: Document | ShadowRoot): root is Document {
  return root.nodeType === 9; // Node.DOCUMENT_NODE
}

/**
 * Injects DEFAULT_CSS once per root, as `<style id="hal-search-styles">`.
 * - Document (default): inserted first in `<head>`, so page stylesheets can override it.
 * - ShadowRoot (web component): appended inside the shadow root.
 * Idempotent: safe to call for every widget instance.
 */
export function injectDefaultStyles(root?: Document | ShadowRoot): void {
  const target = root ?? (typeof document !== 'undefined' ? document : undefined);
  if (!target) return;

  if (isDocument(target)) {
    if (target.getElementById(STYLE_ID)) return;
    const style = target.createElement('style');
    style.id = STYLE_ID;
    style.textContent = DEFAULT_CSS;
    const head = target.head ?? target.documentElement;
    head.insertBefore(style, head.firstChild);
    return;
  }

  if (target.querySelector(`style#${STYLE_ID}`)) return;
  const style = (target.ownerDocument ?? document).createElement('style');
  style.id = STYLE_ID;
  style.textContent = DEFAULT_CSS;
  target.appendChild(style);
}
