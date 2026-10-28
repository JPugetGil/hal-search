import { describe, expect, it } from 'vitest';
import { DARK_PALETTE, LIGHT_PALETTE, isSafeColor, paletteToCssVars, resolvePalette } from '../src/theme';
import type { Palette } from '../src/theme';

// ---------------------------------------------------------------------------
// WCAG helpers (independent from the implementation)
// ---------------------------------------------------------------------------

function rgb(hex: string): number[] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Text/background pairs that must stay readable. */
const PAIRS: [keyof Palette, keyof Palette][] = [
  ['text', 'cardBg'],
  ['muted', 'cardBg'],
  ['muted', 'surface'],
  ['accent', 'cardBg'],
  ['accentText', 'accent'],
  ['tagText', 'tagBg'],
  ['domainText', 'domainBg'],
  ['oaText', 'oaBg'],
  ['errorText', 'errorBg'],
];

// ---------------------------------------------------------------------------
// isSafeColor
// ---------------------------------------------------------------------------

describe('isSafeColor', () => {
  it.each([
    '#fff',
    '#FFFA',
    '#0052cc',
    '#0052cc80',
    'rgb(0, 82, 204)',
    'rgba(0,0,0,0.5)',
    'rgb(0 0 0 / 50%)',
    'rgb(10%, 20%, 30%)',
    'hsl(210deg 100% 40%)',
    'hsla(210, 100%, 40%, .5)',
    'red',
    'RebeccaPurple',
    'transparent',
    '  #fff  ',
  ])('accepts %s', (value) => {
    expect(isSafeColor(value)).toBe(true);
  });

  it.each([
    '',
    '#ff',
    '#fffff',
    '#ggg',
    '#fff;',
    'red;}</style><script>alert(1)</script>',
    'red;}</style><script>',
    'url(javascript:alert(1))',
    'url(https://evil.example/x.png)',
    'expression(alert(1))',
    'rgb(0,0,0);background:url(x)',
    'rgb(0,0,0) url(x)',
    'rgb(1,2)',
    'rgb(1,2,3,4,5)',
    'rgb(a,b,c)',
    'rgb(calc(1),2,3)',
    'hsl(1turn,50%,50%)',
    'var(--x)',
    'calc(1px)',
    'inherit',
    'currentColor',
    'red !important',
    '"red"',
    'red\n}',
    'red/**/',
    'notacolor',
    '#'.padEnd(80, 'f'),
    // U+000B / U+000C are `\s` but invalid in XML 1.0: they would break the SVG <style>.
    'rgb(1\u000b2\u000b3)',
    'hsl(1\u000c2%\u000c3%)',
    'rgb(1, 2,3)',
    '\u000bred',
    'red\u0000',
    '#fff\u007f',
    '#fff\u0085',
  ])('rejects %j', (value) => {
    expect(isSafeColor(value)).toBe(false);
  });

  it('accepts tab, CR and LF as whitespace inside rgb()/hsl()', () => {
    expect(isSafeColor('rgb(1\t2\r\n3)')).toBe(true);
    expect(isSafeColor('hsl( 1 , 2% , 3% )')).toBe(true);
  });

  it('rejects non-string values', () => {
    expect(isSafeColor(42 as unknown as string)).toBe(false);
    expect(isSafeColor(undefined as unknown as string)).toBe(false);
    expect(isSafeColor({ toString: () => 'red' } as unknown as string)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Base palettes
// ---------------------------------------------------------------------------

describe('LIGHT_PALETTE / DARK_PALETTE', () => {
  it('keeps the historical light look', () => {
    expect(LIGHT_PALETTE.accent).toBe('#0052cc');
    expect(LIGHT_PALETTE.accentHover).toBe('#003d99');
    expect(LIGHT_PALETTE.cardBg).toBe('#ffffff');
    expect(LIGHT_PALETTE.text).toBe('#1a1a1a');
  });

  it('matches the GitHub dark canvas', () => {
    expect(DARK_PALETTE.surface).toBe('#0d1117');
  });

  it('defines every key with a safe color and is frozen', () => {
    for (const palette of [LIGHT_PALETTE, DARK_PALETTE]) {
      expect(Object.keys(palette)).toEqual(Object.keys(LIGHT_PALETTE));
      for (const value of Object.values(palette)) expect(isSafeColor(value)).toBe(true);
      expect(Object.isFrozen(palette)).toBe(true);
    }
  });

  it.each([
    ['light', LIGHT_PALETTE],
    ['dark', DARK_PALETTE],
  ] as const)('%s palette passes WCAG AA for every text pair', (_name, palette) => {
    for (const [fg, bg] of PAIRS) expect(contrast(palette[fg], palette[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });
});

// ---------------------------------------------------------------------------
// resolvePalette
// ---------------------------------------------------------------------------

describe('resolvePalette', () => {
  it('returns a copy of the base palette without overrides', () => {
    const light = resolvePalette({});
    expect(light).toEqual(LIGHT_PALETTE);
    expect(light).not.toBe(LIGHT_PALETTE);
    expect(resolvePalette({ theme: 'dark' })).toEqual(DARK_PALETTE);
  });

  it('ignores unsafe colors entirely', () => {
    expect(
      resolvePalette({
        mainColor: 'red;}</style><script>alert(1)</script>',
        backgroundColor: 'url(x)',
        textColor: 'expression(alert(1))',
      }),
    ).toEqual(LIGHT_PALETTE);
  });

  it('maps the three overrides to cardBg, text and accent', () => {
    const p = resolvePalette({ backgroundColor: '#fffbea', textColor: '#3d2c00', mainColor: '#b45309' });
    expect(p.cardBg).toBe('#fffbea');
    expect(p.text).toBe('#3d2c00');
    expect(p.accent).toBe('#b45309');
  });

  it('trims overrides', () => {
    expect(resolvePalette({ mainColor: '  #b45309 ' }).accent).toBe('#b45309');
  });

  it('derives accent colors from mainColor', () => {
    const p = resolvePalette({ mainColor: '#b45309' });
    expect(luminance(p.accentHover)).toBeLessThan(luminance('#b45309'));
    expect(p.accentText).toBe('#ffffff');
    expect(p.domainBg).not.toBe(LIGHT_PALETTE.domainBg);
    expect(contrast(p.domainText, p.domainBg)).toBeGreaterThanOrEqual(4.5);
    // Unrelated colors keep their defaults.
    expect(p.muted).toBe(LIGHT_PALETTE.muted);
    expect(p.surface).toBe(LIGHT_PALETTE.surface);
  });

  it('picks dark ink on a light accent', () => {
    const p = resolvePalette({ mainColor: '#ffd33d' });
    expect(p.accentText).not.toBe('#ffffff');
    expect(contrast(p.accentText, '#ffd33d')).toBeGreaterThanOrEqual(4.5);
  });

  it('lightens the hover color on dark cards', () => {
    const p = resolvePalette({ theme: 'dark', mainColor: '#2f81f7' });
    expect(luminance(p.accentHover)).toBeGreaterThan(luminance('#2f81f7'));
  });

  it('derives a readable muted color from textColor', () => {
    const p = resolvePalette({ textColor: '#333333' });
    expect(p.muted).not.toBe(LIGHT_PALETTE.muted);
    expect(contrast(p.muted, p.cardBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.muted, p.cardBg)).toBeLessThan(contrast('#333333', p.cardBg));
  });

  it('keeps muted text readable even for a low-contrast textColor', () => {
    const p = resolvePalette({ textColor: '#777777' });
    expect(contrast(p.muted, p.cardBg)).toBeGreaterThanOrEqual(4.5);
  });

  it('adapts the whole palette to a dark background on the light theme', () => {
    const p = resolvePalette({ backgroundColor: '#222222' });
    expect(p.cardBg).toBe('#222222');
    expect(luminance(p.surface)).toBeLessThan(luminance('#222222'));
    expect(p.oaBg).toBe(DARK_PALETTE.oaBg);
    expect(p.errorText).toBe(DARK_PALETTE.errorText);
    for (const [fg, bg] of PAIRS.filter(([, b]) => b !== 'surface')) {
      expect(contrast(p[fg], p[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('adapts to a light background on the dark theme', () => {
    const p = resolvePalette({ theme: 'dark', backgroundColor: '#fafafa' });
    expect(contrast(p.text, '#fafafa')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.accent, '#fafafa')).toBeGreaterThanOrEqual(3);
    expect(contrast(p.muted, '#fafafa')).toBeGreaterThanOrEqual(4.5);
  });

  it('parses rgb() and hsl() for derivation', () => {
    expect(resolvePalette({ mainColor: 'rgb(180, 83, 9)' }).accentHover).toBe(resolvePalette({ mainColor: '#b45309' }).accentHover);
    const hsl = resolvePalette({ mainColor: 'hsl(120deg 50% 30%)' });
    expect(hsl.accent).toBe('hsl(120deg 50% 30%)');
    expect(hsl.accentHover).not.toBe(LIGHT_PALETTE.accentHover);
  });

  it('derives from named colors exactly like from their hex value', () => {
    const p = resolvePalette({ mainColor: 'RebeccaPurple', backgroundColor: 'ivory' });
    const hex = resolvePalette({ mainColor: '#663399', backgroundColor: '#fffff0' });
    expect(p.accent).toBe('RebeccaPurple');
    expect(p.cardBg).toBe('ivory');
    expect({ ...p, accent: '#663399', cardBg: '#fffff0' }).toEqual(hex);
    expect(p.accentHover).not.toBe(LIGHT_PALETTE.accentHover);
  });

  it('keeps the text readable on a named dark background (bg=black)', () => {
    for (const theme of ['light', 'dark'] as const) {
      const p = resolvePalette({ theme, backgroundColor: 'black' });
      expect(p.cardBg).toBe('black');
      expect({ ...p, cardBg: '#000000' }).toEqual(resolvePalette({ theme, backgroundColor: '#000000' }));
      for (const [fg, bg] of PAIRS.filter(([, b]) => b !== 'surface')) {
        const background = bg === 'cardBg' ? '#000000' : p[bg];
        // Accents (links, buttons) need 3:1 like for any other background, text needs 4.5:1.
        const min = fg === 'accent' ? 3 : 4.5;
        expect(contrast(p[fg], background), `${theme}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(min);
      }
    }
    expect(resolvePalette({ backgroundColor: 'black' }).text).toBe(DARK_PALETTE.text);
  });

  it('picks a readable ink on a named light accent (main=yellow)', () => {
    for (const theme of ['light', 'dark'] as const) {
      const p = resolvePalette({ theme, mainColor: 'yellow' });
      expect(p.accent).toBe('yellow');
      expect(p.accentText).not.toBe('#ffffff');
      expect(contrast(p.accentText, '#ffff00')).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.domainText, p.domainBg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('treats transparent as the theme surface', () => {
    const p = resolvePalette({ backgroundColor: 'transparent' });
    expect(p.cardBg).toBe('transparent');
    expect(contrast(p.text, LIGHT_PALETTE.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.muted, LIGHT_PALETTE.surface)).toBeGreaterThanOrEqual(4.5);
    expect(resolvePalette({ theme: 'dark', backgroundColor: 'transparent' }).text).toBe(DARK_PALETTE.text);
  });

  it('composites translucent backgrounds before deriving', () => {
    const p = resolvePalette({ backgroundColor: 'rgba(0, 0, 0, 0.9)' });
    expect(p.cardBg).toBe('rgba(0, 0, 0, 0.9)');
    expect(contrast(p.text, '#1a1a1a')).toBeGreaterThanOrEqual(4.5);
  });

  it('only ever produces safe colors', () => {
    const inputs = ['#000', '#fff', '#7f7f7f', 'rgb(255 0 0 / 0.2)', 'hsl(300, 100%, 50%)', 'navy', 'transparent', '#12345678'];
    for (const theme of ['light', 'dark'] as const) {
      for (const a of inputs) {
        for (const b of inputs) {
          const p = resolvePalette({ theme, backgroundColor: a, textColor: b, mainColor: b });
          for (const value of Object.values(p)) expect(isSafeColor(value), value).toBe(true);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// paletteToCssVars
// ---------------------------------------------------------------------------

describe('paletteToCssVars', () => {
  it('names variables --hal- + kebab-case(key)', () => {
    const vars = paletteToCssVars(LIGHT_PALETTE);
    expect(vars['--hal-card-bg']).toBe('#ffffff');
    expect(vars['--hal-accent-hover']).toBe('#003d99');
    expect(vars['--hal-accent-text']).toBe('#ffffff');
    expect(vars['--hal-oa-bg']).toBe('#e3f5ee');
    expect(vars['--hal-error-border']).toBe('#ffc9c9');
    expect(Object.keys(vars)).toHaveLength(17);
  });

  it('accepts partial palettes', () => {
    expect(paletteToCssVars({ accent: '#b45309', domainText: '#123456' })).toEqual({
      '--hal-accent': '#b45309',
      '--hal-domain-text': '#123456',
    });
    expect(paletteToCssVars({})).toEqual({});
  });

  it('drops values that are not safe colors', () => {
    expect(paletteToCssVars({ accent: 'red;}</style>', text: '#000' })).toEqual({ '--hal-text': '#000' });
  });
});
