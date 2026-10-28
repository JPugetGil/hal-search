// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { HalSearch } from '../src/HalSearch';
import { defineHalSearchElement } from '../src/element';
import { renderSvg, renderSvgParts } from '../src/svg';
import { LIGHT_PALETTE } from '../src/theme';
import type { HalDoc } from '../src/types';

// Inline SVG output (HalSearch output 'svg', <hal-search output="svg">) against the real modules; fetch is stubbed.
// A strict Content-Security-Policy (`style-src` without 'unsafe-inline') blocks every `<style>` element, so the
// SVG's colors must come from a constructable stylesheet, never from a `<style>` inside the SVG.

const DOCS: HalDoc[] = [
  {
    docid: '1',
    uri_s: 'https://hal.science/hal-00000001v1',
    title_s: ['Condensed Representation for Snapshot-Based RDF Graphs'],
    authFullName_s: ['Jey Puget Gil'],
    producedDateY_i: 2025,
    docType_s: 'ART',
  },
];

const flush = () => new Promise((r) => setTimeout(r, 0));

/** The `hal-svg-<hash>` class of the root <svg>: the scope of its stylesheet. */
function scopeOf(root: ParentNode): string {
  const svg = root.querySelector('svg');
  expect(svg).not.toBeNull();
  const scope = [...(svg as SVGElement).classList].find((c) => /^hal-svg-\w+$/.test(c));
  expect(scope).toBeDefined();
  return scope as string;
}

/** Adopted stylesheets of a root, as CSS text. */
function adoptedCss(root: Document | ShadowRoot): string[] {
  return root.adoptedStyleSheets.map((sheet) => [...sheet.cssRules].map((rule) => rule.cssText).join('\n'));
}

/** Simulates a browser without constructable stylesheets (Safari < 16.4) during `run`. */
async function withoutConstructableSheets(run: () => Promise<void>): Promise<void> {
  const view = document.defaultView as unknown as Record<string, unknown>;
  const original = view.CSSStyleSheet;
  view.CSSStyleSheet = undefined;
  try {
    await run();
  } finally {
    view.CSSStyleSheet = original;
  }
}

function container(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

beforeAll(() => defineHalSearchElement());

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ responseHeader: { status: 0 }, response: { numFound: 1, start: 0, docs: DOCS } }))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  document.adoptedStyleSheets = [];
});

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

describe('renderSvgParts', () => {
  it('is renderSvg without the <style>, which it returns apart', () => {
    const options = { totalFound: 1, theme: 'auto' as const, mainColor: '#aa0000' };
    const { markup, css } = renderSvgParts(DOCS, options);
    const standalone = renderSvg(DOCS, options);
    expect(markup).not.toContain('<style');
    expect(standalone).toContain(`<style>${css}</style>`);
    expect(standalone.replace(`\n<style>${css}</style>`, '')).toBe(markup);
    expect(css).toContain('@media (prefers-color-scheme:dark)');
  });
});

// ---------------------------------------------------------------------------
// HalSearch
// ---------------------------------------------------------------------------

describe('HalSearch output svg', () => {
  it('puts no <style> in the container: the colors are an adopted stylesheet scoped to the SVG', async () => {
    const el = container();
    await new HalSearch({ container: el, output: 'svg' }).search({ query: { idHal: 'jpugetgil' } });

    expect(el.querySelector('style')).toBeNull();
    // The default CSS of the HTML widget (a <style> in <head>, adopted instead when a CSP blocks it) is the only one.
    expect([...document.querySelectorAll('style')].map((s) => s.id)).toEqual(['hal-search-styles']);
    const scope = scopeOf(el);
    const sheets = adoptedCss(document);
    expect(sheets).toHaveLength(1);
    expect(sheets[0]).toContain(`.${scope} .hal-bg`);
    expect(sheets[0]).toContain(LIGHT_PALETTE.surface);
    // The whole SVG is in the DOM (cards included).
    expect(el.querySelector('svg > title')?.textContent).toBe('Publications – 1 result');
    expect(el.textContent).toContain('Condensed Representation');
  });

  it('keeps several inline SVGs with different colors apart, and cleans up on destroy', async () => {
    const a = container();
    const b = container();
    const first = new HalSearch({ container: a, output: 'svg', injectStyles: false });
    const second = new HalSearch({ container: b, output: 'svg', injectStyles: false, mainColor: '#aa0000' });
    await first.search({ query: { idHal: 'jpugetgil' } });
    await second.search({ query: { idHal: 'jpugetgil' } });

    const [scopeA, scopeB] = [scopeOf(a), scopeOf(b)];
    expect(scopeA).not.toBe(scopeB);
    expect(adoptedCss(document)).toHaveLength(2);
    const sheetB = adoptedCss(document).find((css) => css.includes(scopeB)) ?? '';
    expect(sheetB).toContain('#aa0000');
    expect(sheetB).not.toContain(`.${scopeA} `);

    first.destroy();
    expect(adoptedCss(document)).toEqual([sheetB]);
    second.destroy();
    expect(document.adoptedStyleSheets).toHaveLength(0);
  });

  it('replaces its stylesheet when the SVG is re-rendered (theme, colors)', async () => {
    const el = container();
    const hs = new HalSearch({ container: el, output: 'svg', injectStyles: false });
    await hs.search({ query: { idHal: 'jpugetgil' } });
    const before = scopeOf(el);

    hs.setColors({ mainColor: '#00aa00' });
    hs.setTheme('dark');
    const after = scopeOf(el);
    expect(after).not.toBe(before);
    const sheets = adoptedCss(document);
    expect(sheets).toHaveLength(1);
    expect(sheets[0]).toContain(`.${after} `);
    expect(sheets[0]).toContain('#00aa00');
    expect(el.querySelector('style')).toBeNull();
  });

  it('falls back to a <style> in <head> without constructable stylesheets', async () => {
    await withoutConstructableSheets(async () => {
      const el = container();
      const hs = new HalSearch({ container: el, output: 'svg', injectStyles: false });
      await hs.search({ query: { idHal: 'jpugetgil' } });
      expect(el.querySelector('style')).toBeNull();
      const styles = document.head.querySelectorAll('style[data-hal-search-svg]');
      expect(styles).toHaveLength(1);
      expect(styles[0].textContent).toContain(`.${scopeOf(el)} .hal-bg`);
      hs.destroy();
      expect(document.head.querySelector('style[data-hal-search-svg]')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// <hal-search>
// ---------------------------------------------------------------------------

describe('<hal-search output="svg">', () => {
  it('adopts the SVG stylesheet in its shadow root, without any <style> in the SVG', async () => {
    const el = document.createElement('hal-search');
    el.setAttribute('id-hal', 'jpugetgil');
    el.setAttribute('output', 'svg');
    document.body.appendChild(el);
    await flush();
    await flush();

    const root = el.shadowRoot as ShadowRoot;
    const mount = root.querySelector('[part="container"]') as HTMLElement;
    expect(mount.querySelector('style')).toBeNull();
    const scope = scopeOf(mount);
    expect(adoptedCss(root).some((css) => css.includes(`.${scope} .hal-bg`))).toBe(true);
    expect(adoptedCss(document).some((css) => css.includes(scope))).toBe(false);

    el.remove();
    await flush();
    expect(adoptedCss(root).some((css) => css.includes(scope))).toBe(false);
  });
});
