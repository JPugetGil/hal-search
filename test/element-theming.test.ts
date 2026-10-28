// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { HalApiResponse } from '../src/types';

// Real modules (styles, theme, renderer, URL parser); only the network is stubbed.
vi.mock('../src/api', () => ({
  DEFAULT_BASE: 'https://api.example/search/',
  fetchArticles: vi.fn(
    async (): Promise<HalApiResponse> => ({
      responseHeader: { status: 0, QTime: 1 },
      response: {
        numFound: 1,
        start: 0,
        docs: [{ docid: '1', uri_s: 'https://hal.science/hal-1', title_s: ['Graph versioning'] }],
      },
    }),
  ),
  isAbortError: () => false,
}));

import { defineHalSearchElement } from '../src/element';
import { DARK_PALETTE, LIGHT_PALETTE } from '../src/theme';

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Computed color of the title link (`color: var(--hal-accent)`), as lower-case hex. */
function accentOf(el: HTMLElement): string {
  const link = el.shadowRoot!.querySelector('.hal-article__title a') as HTMLElement;
  expect(link).not.toBeNull();
  const color = getComputedStyle(link).color.trim().toLowerCase();
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
  return rgb ? `#${rgb.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}` : color;
}

async function render(attrs: Record<string, string>, hostVars: Record<string, string> = {}): Promise<HTMLElement> {
  const el = document.createElement('hal-search');
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  // CSSOM write on the host: the same cascade level as a page rule `hal-search { --hal-accent: … }`
  // (both come from the outer context; happy-dom does not model contexts, so a page rule is not used here).
  for (const [name, value] of Object.entries(hostVars)) el.style.setProperty(name, value);
  document.body.appendChild(el);
  await flush();
  await flush();
  return el;
}

beforeAll(() => defineHalSearchElement());

afterEach(() => {
  document.body.innerHTML = '';
});

describe('<hal-search> theming precedence: attributes > host variables > theme defaults', () => {
  it('level 3, theme defaults: light, and dark selected through the host', async () => {
    expect(accentOf(await render({ 'id-hal': 'x' }))).toBe(LIGHT_PALETTE.accent);
    const dark = await render({ 'id-hal': 'x', theme: 'dark' });
    expect(dark.getAttribute('data-hal-theme')).toBe('dark');
    expect(accentOf(dark)).toBe(DARK_PALETTE.accent);
  });

  it('level 2, variables set on the host win over the theme defaults (light and dark)', async () => {
    expect(accentOf(await render({ 'id-hal': 'x' }, { '--hal-accent': '#ff0000' }))).toBe('#ff0000');
    expect(accentOf(await render({ 'id-hal': 'x', theme: 'dark' }, { '--hal-accent': '#ff0000' }))).toBe('#ff0000');
  });

  it('level 1, color attributes win over host variables (inline and auto-theme stylesheet)', async () => {
    const light = await render({ 'id-hal': 'x', main: '#00aa00' }, { '--hal-accent': '#ff0000' });
    expect(accentOf(light)).toBe('#00aa00');
    const auto = await render({ 'id-hal': 'x', theme: 'auto', main: '#00aa00' }, { '--hal-accent': '#ff0000' });
    expect(accentOf(auto)).toBe('#00aa00');

    // Removing the attribute gives the host variable back, without a new request.
    light.removeAttribute('main');
    await flush();
    expect(accentOf(light)).toBe('#ff0000');
  });

  it('keeps the container part for layout tweaks, and no <style> element in the shadow root', async () => {
    const el = await render({ 'id-hal': 'x' });
    expect(el.shadowRoot!.querySelector('[part="container"]')?.classList.contains('hal-search')).toBe(true);
    expect(el.shadowRoot!.querySelector('style')).toBeNull();
    expect(el.shadowRoot!.adoptedStyleSheets.length).toBeGreaterThan(0);
  });
});
