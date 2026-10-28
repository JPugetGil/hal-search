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

import { DEFAULT_CSS, injectDefaultStyles } from '../src/styles';
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

describe('injectDefaultStyles', () => {
  afterEach(() => {
    document.getElementById('hal-search-styles')?.remove();
  });

  it('injects one <style> in document.head, idempotently', () => {
    injectDefaultStyles();
    injectDefaultStyles(document);
    const styles = document.head.querySelectorAll('style#hal-search-styles');
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toBe(DEFAULT_CSS);
    // first in <head>: page stylesheets override it at equal specificity
    expect(document.head.firstElementChild).toBe(styles[0]);
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
    host.remove();
  });
});
