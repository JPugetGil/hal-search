// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

// Distinctive palettes so the generated blocks can be told apart.
vi.mock('../src/theme', () => {
  const keys = [
    'surface', 'cardBg', 'border', 'text', 'muted', 'accent', 'accentHover', 'accentText', 'tagBg', 'tagText',
    'domainBg', 'domainText', 'oaBg', 'oaText', 'errorBg', 'errorBorder', 'errorText',
  ];
  const make = (prefix: string) =>
    Object.fromEntries(keys.map((k, i) => [k, `#${prefix}${i.toString(16).padStart(4, '0')}`]));
  return {
    LIGHT_PALETTE: make('aa'),
    DARK_PALETTE: make('dd'),
    paletteToCssVars: (palette: Record<string, string>) =>
      Object.fromEntries(
        Object.entries(palette).map(([k, v]) => [`--hal-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, v]),
      ),
  };
});

import { attachStyleSheet, DEFAULT_CSS, elementCss, injectDefaultStyles, injectElementStyles } from '../src/styles';
import { DARK_PALETTE, LIGHT_PALETTE } from '../src/theme';

const VAR_NAMES = [
  '--hal-surface', '--hal-card-bg', '--hal-border', '--hal-text', '--hal-muted', '--hal-accent', '--hal-accent-hover',
  '--hal-accent-text', '--hal-tag-bg', '--hal-tag-text', '--hal-domain-bg', '--hal-domain-text', '--hal-oa-bg',
  '--hal-oa-text', '--hal-error-bg', '--hal-error-border', '--hal-error-text',
];

const CSS = DEFAULT_CSS.replace(/\/\*[\s\S]*?\*\//g, '');

/** Body of the first rule whose prelude is exactly `selector` (searching from `from`). */
function ruleBody(selector: string, from = 0): string {
  const start = CSS.indexOf(`${selector} {`, from);
  if (start < 0) return '';
  const open = CSS.indexOf('{', start);
  return CSS.slice(open + 1, CSS.indexOf('}', open));
}

describe('DEFAULT_CSS', () => {
  it('never targets :root and scopes every rule under .hal-search', () => {
    expect(DEFAULT_CSS).not.toContain(':root');
    const preludes = [...CSS.matchAll(/([^{};]+)\{/g)].map((m) => m[1].trim());
    for (const prelude of preludes) {
      if (prelude.startsWith('@') || /^(from|to|\d+%)$/.test(prelude)) continue;
      for (const selector of prelude.split(',')) expect(selector.trim()).toMatch(/^\.hal-search\b/);
    }
  });

  it('declares light defaults on .hal-search from LIGHT_PALETTE', () => {
    const body = ruleBody('.hal-search');
    for (const name of VAR_NAMES) expect(body).toContain(`${name}:`);
    expect(body).toContain(`--hal-card-bg: ${LIGHT_PALETTE.cardBg};`);
    expect(body).toMatch(/--hal-font:/);
    expect(body).toMatch(/--hal-radius:/);
    expect(body).toMatch(/--hal-shadow:/);
  });

  it('has a dark block and an auto block inside prefers-color-scheme: dark', () => {
    const dark = ruleBody('.hal-search[data-hal-theme="dark"]');
    expect(dark).toContain(`--hal-accent: ${DARK_PALETTE.accent};`);
    for (const name of VAR_NAMES) expect(dark).toContain(`${name}:`);

    const media = CSS.indexOf('@media (prefers-color-scheme: dark)');
    expect(media).toBeGreaterThan(-1);
    const auto = ruleBody('.hal-search[data-hal-theme="auto"]', media);
    expect(auto).toContain(`--hal-accent: ${DARK_PALETTE.accent};`);
    for (const name of VAR_NAMES) expect(auto).toContain(`${name}:`);
  });

  it('has no hard-coded colors outside the variable declarations', () => {
    const withoutVars = CSS.replace(/--hal-[a-z-]+:[^;]+;/g, '');
    expect(withoutVars).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(withoutVars).not.toMatch(/\b(rgba?|hsla?)\(/i);
    expect(withoutVars).not.toMatch(/:\s*(white|black)\b/i);
  });

  it('derives hover colors from --hal-accent-hover', () => {
    expect(ruleBody('.hal-search .hal-pagination__btn:hover:not(:disabled)')).toContain('var(--hal-accent-hover)');
    expect(ruleBody('.hal-search .hal-action:hover')).toContain('var(--hal-accent-hover)');
  });

  it('styles domain tags, error box and pagination from variables', () => {
    expect(ruleBody('.hal-search .hal-tag--domain')).toContain('var(--hal-domain-bg)');
    expect(ruleBody('.hal-search .hal-error')).toContain('var(--hal-error-border)');
  });

  // No layout engine here: the geometry is checked on the declarations.
  it('never starts a wrapped meta line with the "·" separator', () => {
    const px = (body: string, prop: string) => Number(new RegExp(`(?:^|[;\\s])${prop}:\\s*(-?[\\d.]+)px`).exec(body)?.[1]);
    const meta = ruleBody('.hal-search .hal-article__meta');
    const year = ruleBody('.hal-search .hal-article__year');
    const separator = ruleBody('.hal-search .hal-article__year + .hal-article__venue::before');
    expect(separator).toContain("content: '·'");

    // The dot box hangs entirely before the venue box (no width inside it)...
    const width = px(separator, 'width');
    expect(px(separator, 'margin-left')).toBe(-width);
    expect(separator).not.toMatch(/margin-right/);
    // ...inside the space between year and venue...
    expect(width).toBeLessThanOrEqual(px(meta, 'gap') + px(year, 'margin-right'));
    // ...and the row clips what lies left of it (the dot of an item that starts a line).
    const clip = /clip-path:\s*inset\(([^)]*)\)/.exec(meta)?.[1].trim().split(/\s+/) ?? [];
    expect(clip).toHaveLength(4);
    const left = Number(clip[3].replace('px', ''));
    expect(left).toBeLessThanOrEqual(0);
    expect(-left).toBeLessThan(width / 2 - 3);
  });

  it('has focus-visible, reduced-motion, narrow-screen and print rules', () => {
    expect(CSS).toContain(':focus-visible');
    const motion = CSS.slice(CSS.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(motion).toMatch(/\.hal-spinner\s*\{\s*animation: none;/);
    expect(CSS).toMatch(/@media \(max-width: 30em\)/);
    const print = CSS.slice(CSS.indexOf('@media print'));
    expect(print).toMatch(/\.hal-pagination,[\s\S]*display: none !important;/);
    expect(print).toContain('.hal-action--copy');
    expect(print).toContain('.hal-abstract__toggle');
  });
});

describe('elementCss (shadow root of <hal-search>)', () => {
  const ELEMENT_CSS = elementCss().replace(/\/\*[\s\S]*?\*\//g, '');
  const body = (selector: string, from = 0): string => {
    const start = ELEMENT_CSS.indexOf(`${selector} {`, from);
    if (start < 0) return '';
    const open = ELEMENT_CSS.indexOf('{', start);
    return ELEMENT_CSS.slice(open + 1, ELEMENT_CSS.indexOf('}', open));
  };
  /** [selector, declarations] of every style rule */
  const rules = (): [string, string][] =>
    [...ELEMENT_CSS.matchAll(/([^{};]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]]);

  it('declares the theme defaults on :host, selected by the data-hal-theme the element mirrors', () => {
    const light = body(':host');
    expect(light).toContain('display: block;');
    expect(light).toContain(`--hal-accent: ${LIGHT_PALETTE.accent};`);
    for (const name of [...VAR_NAMES, '--hal-font', '--hal-radius', '--hal-shadow']) expect(light).toContain(`${name}:`);
    expect(body(':host([hidden])')).toContain('display: none;');
    expect(body(':host([data-hal-theme="dark"])')).toContain(`--hal-accent: ${DARK_PALETTE.accent};`);
    const media = ELEMENT_CSS.indexOf('@media (prefers-color-scheme: dark)');
    expect(body(':host([data-hal-theme="auto"])', media)).toContain(`--hal-accent: ${DARK_PALETTE.accent};`);
  });

  it('never redeclares a variable on the container: it inherits what the page sets on the host', () => {
    for (const [prelude, declarations] of rules()) {
      if (prelude.startsWith(':host') || /^(from|to|\d+%)$/.test(prelude)) continue;
      for (const selector of prelude.split(',')) expect(selector.trim()).toMatch(/^\.hal-search\b/);
      expect(declarations, prelude).not.toMatch(/--hal-[a-z-]+\s*:/);
    }
  });

  it('keeps every rule of DEFAULT_CSS (only the variable declarations move)', () => {
    const withoutVars = DEFAULT_CSS.replace(/^\s*--hal-[a-z-]+: [^\n]*\n/gm, '');
    expect(elementCss().endsWith(withoutVars)).toBe(true);
    expect(body('.hal-search[data-hal-theme="dark"]')).toContain('color-scheme: dark;');
  });
});

/** Stylesheets adopted by a root, as CSS text. */
function adoptedCss(root: Document | ShadowRoot): string[] {
  return root.adoptedStyleSheets.map((sheet) => [...sheet.cssRules].map((rule) => rule.cssText).join('\n'));
}

/** Simulates a browser without constructable stylesheets (Safari < 16.4) during `run`. */
function withoutConstructableSheets(run: () => void): void {
  const view = document.defaultView as unknown as Record<string, unknown>;
  const original = view.CSSStyleSheet;
  view.CSSStyleSheet = undefined;
  try {
    run();
  } finally {
    view.CSSStyleSheet = original;
  }
}

/** Simulates a strict Content-Security-Policy: the browser gives inline `<style>` elements no sheet. */
function blockInlineStyles(): void {
  vi.spyOn(HTMLStyleElement.prototype, 'sheet', 'get').mockReturnValue(null);
}

describe('injectDefaultStyles', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.getElementById('hal-search-styles')?.remove();
    document.adoptedStyleSheets = [];
  });

  it('injects one <style> in document.head, idempotently', () => {
    injectDefaultStyles();
    injectDefaultStyles(document);
    const styles = document.head.querySelectorAll('style#hal-search-styles');
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toBe(DEFAULT_CSS);
    // first in <head>: page stylesheets override it at equal specificity
    expect(document.head.firstElementChild).toBe(styles[0]);
    // The <style> works: no constructable copy
    expect(document.adoptedStyleSheets).toHaveLength(0);
  });

  it('adopts a constructable copy when a strict CSP blocks the <style>, once', () => {
    blockInlineStyles();
    injectDefaultStyles();
    injectDefaultStyles();
    expect(document.querySelectorAll('style#hal-search-styles')).toHaveLength(1);
    expect(document.adoptedStyleSheets).toHaveLength(1);
    expect(adoptedCss(document)[0]).toContain('.hal-search .hal-article');

    // Shadow roots too, sharing the document's sheet
    const shadow = document.createElement('div').attachShadow({ mode: 'open' });
    document.body.appendChild(shadow.host);
    injectDefaultStyles(shadow);
    expect(shadow.adoptedStyleSheets).toEqual([document.adoptedStyleSheets[0]]);
    shadow.host.remove();
  });

  it('keeps the <style> alone when the browser cannot adopt sheets', () => {
    blockInlineStyles();
    withoutConstructableSheets(() => injectDefaultStyles());
    expect(document.querySelectorAll('style#hal-search-styles')).toHaveLength(1);
    expect(document.adoptedStyleSheets).toHaveLength(0);
  });

  it('injects inside a ShadowRoot, once per root, independently of the document', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.appendChild(document.createElement('div'));

    injectDefaultStyles(shadow);
    injectDefaultStyles(shadow);
    expect(shadow.querySelectorAll('style#hal-search-styles')).toHaveLength(1);
    expect(shadow.lastElementChild?.id).toBe('hal-search-styles');
    expect(document.getElementById('hal-search-styles')).toBeNull();

    const other = document.createElement('div').attachShadow({ mode: 'open' });
    injectDefaultStyles(other);
    expect(other.querySelectorAll('style#hal-search-styles')).toHaveLength(1);
    // Detached: the browser cannot tell yet whether a CSP blocks it, nothing is adopted.
    expect(other.adoptedStyleSheets).toHaveLength(0);
    host.remove();
  });
});

describe('injectElementStyles', () => {
  it('adopts one constructable stylesheet shared by every element of the document, without <style>', () => {
    const a = document.createElement('div').attachShadow({ mode: 'open' });
    const b = document.createElement('div').attachShadow({ mode: 'open' });
    injectElementStyles(a);
    injectElementStyles(a);
    injectElementStyles(b);
    expect(a.adoptedStyleSheets).toHaveLength(1);
    expect(b.adoptedStyleSheets[0]).toBe(a.adoptedStyleSheets[0]);
    expect(adoptedCss(a)[0]).toContain(':host');
    expect(a.querySelector('style')).toBeNull();
  });

  it('falls back to a <style> first in the root, once', () => {
    const root = document.createElement('div').attachShadow({ mode: 'open' });
    root.appendChild(document.createElement('div'));
    withoutConstructableSheets(() => {
      injectElementStyles(root);
      injectElementStyles(root);
    });
    expect(root.querySelectorAll('style#hal-search-styles')).toHaveLength(1);
    expect(root.firstElementChild?.textContent).toBe(elementCss());
    expect(root.adoptedStyleSheets).toHaveLength(0);
  });
});

describe('attachStyleSheet', () => {
  afterEach(() => {
    document.adoptedStyleSheets = [];
    for (const style of document.querySelectorAll('style[data-test]')) style.remove();
  });

  it('adopts a constructable stylesheet after the others, updates it in place and detaches it', () => {
    const other = new CSSStyleSheet();
    document.adoptedStyleSheets = [other];
    const handle = attachStyleSheet(document, '.a { color: red; }', { 'data-test': '1' });
    expect(document.adoptedStyleSheets).toHaveLength(2);
    expect(document.adoptedStyleSheets[0]).toBe(other);
    const sheet = document.adoptedStyleSheets[1];
    expect(document.querySelector('style[data-test]')).toBeNull();

    handle.update('.b { color: blue; }');
    expect(document.adoptedStyleSheets[1]).toBe(sheet);
    expect(adoptedCss(document)[1]).toContain('.b');
    expect(adoptedCss(document)[1]).not.toContain('.a');

    // Re-attached when something else reset the adopted sheets
    document.adoptedStyleSheets = [];
    handle.update('.c { color: green; }');
    expect(document.adoptedStyleSheets).toEqual([sheet]);

    handle.remove();
    expect(document.adoptedStyleSheets).toHaveLength(0);
  });

  it('works in a shadow root', () => {
    const root = document.createElement('div').attachShadow({ mode: 'open' });
    const handle = attachStyleSheet(root, '.a { color: red; }');
    expect(root.adoptedStyleSheets).toHaveLength(1);
    expect(document.adoptedStyleSheets).toHaveLength(0);
    handle.remove();
    expect(root.adoptedStyleSheets).toHaveLength(0);
  });

  it('falls back to a <style> carrying the attributes (head or shadow root)', () => {
    const root = document.createElement('div').attachShadow({ mode: 'open' });
    withoutConstructableSheets(() => {
      const inHead = attachStyleSheet(document, '.a {}', { 'data-test': 'x' });
      const style = document.head.querySelector('style[data-test="x"]');
      expect(style?.textContent).toBe('.a {}');
      expect(document.head.lastElementChild).toBe(style);
      inHead.update('.b {}');
      expect(style?.textContent).toBe('.b {}');
      inHead.remove();
      expect(document.head.querySelector('style[data-test]')).toBeNull();

      const inShadow = attachStyleSheet(root, '.a {}', { 'data-test': 'y' });
      expect(root.querySelector('style[data-test="y"]')?.textContent).toBe('.a {}');
      inShadow.remove();
      expect(root.querySelector('style')).toBeNull();
    });
  });
});
