import type { ColorOptions } from './types';

/** Colors used by both renderers. CSS variable name = '--hal-' + kebab-case(key). */
export interface Palette {
  /** SVG canvas / HTML empty-state background */
  surface: string;
  /** Article card background (backgroundColor) */
  cardBg: string;
  border: string;
  /** Main text (textColor) */
  text: string;
  /** Secondary text, derived from text */
  muted: string;
  /** Links, buttons, SVG header (mainColor) */
  accent: string;
  /** Derived from accent */
  accentHover: string;
  /** Text drawn on top of accent, picked for contrast */
  accentText: string;
  tagBg: string;
  tagText: string;
  domainBg: string;
  domainText: string;
  oaBg: string;
  oaText: string;
  errorBg: string;
  errorBorder: string;
  errorText: string;
}

// ---------------------------------------------------------------------------
// Base palettes
// ---------------------------------------------------------------------------

/** Light theme: the historical hal-search look (accent #0052cc on white cards). */
export const LIGHT_PALETTE: Palette = Object.freeze({
  surface: '#f6f8fa',
  cardBg: '#ffffff',
  border: '#e0e0e0',
  text: '#1a1a1a',
  muted: '#666666',
  accent: '#0052cc',
  accentHover: '#003d99',
  accentText: '#ffffff',
  tagBg: '#f0f0f0',
  tagText: '#444444',
  domainBg: '#e8f0fe',
  domainText: '#1a56c4',
  oaBg: '#e3f5ee',
  oaText: '#006644',
  errorBg: '#fff5f5',
  errorBorder: '#ffc9c9',
  errorText: '#c92a2a',
});

/** Dark theme, tuned for the GitHub dark canvas (#0d1117). Every text color passes WCAG AA on its background. */
export const DARK_PALETTE: Palette = Object.freeze({
  surface: '#0d1117',
  cardBg: '#161b22',
  border: '#30363d',
  text: '#e6edf3',
  muted: '#8b949e',
  accent: '#4493f8',
  accentHover: '#69a9f9',
  accentText: '#0d1117',
  tagBg: '#21262d',
  tagText: '#c9d1d9',
  domainBg: '#1b2d45',
  domainText: '#79b8ff',
  oaBg: '#173326',
  oaText: '#3fb950',
  errorBg: '#2d1517',
  errorBorder: '#6e2b2b',
  errorText: '#ff7b72',
});

// ---------------------------------------------------------------------------
// Validation (XSS barrier for user-supplied colors)
// ---------------------------------------------------------------------------

/** CSS Color Module level 4 named colors (name:hex), `transparent` included. */
const NAMED_COLOR_TABLE =
  'aliceblue:f0f8ff antiquewhite:faebd7 aqua:00ffff aquamarine:7fffd4 azure:f0ffff beige:f5f5dc ' +
  'bisque:ffe4c4 black:000000 blanchedalmond:ffebcd blue:0000ff blueviolet:8a2be2 brown:a52a2a ' +
  'burlywood:deb887 cadetblue:5f9ea0 chartreuse:7fff00 chocolate:d2691e coral:ff7f50 cornflowerblue:6495ed ' +
  'cornsilk:fff8dc crimson:dc143c cyan:00ffff darkblue:00008b darkcyan:008b8b darkgoldenrod:b8860b ' +
  'darkgray:a9a9a9 darkgreen:006400 darkgrey:a9a9a9 darkkhaki:bdb76b darkmagenta:8b008b ' +
  'darkolivegreen:556b2f darkorange:ff8c00 darkorchid:9932cc darkred:8b0000 darksalmon:e9967a ' +
  'darkseagreen:8fbc8f darkslateblue:483d8b darkslategray:2f4f4f darkslategrey:2f4f4f darkturquoise:00ced1 ' +
  'darkviolet:9400d3 deeppink:ff1493 deepskyblue:00bfff dimgray:696969 dimgrey:696969 dodgerblue:1e90ff ' +
  'firebrick:b22222 floralwhite:fffaf0 forestgreen:228b22 fuchsia:ff00ff gainsboro:dcdcdc ' +
  'ghostwhite:f8f8ff gold:ffd700 goldenrod:daa520 gray:808080 green:008000 greenyellow:adff2f grey:808080 ' +
  'honeydew:f0fff0 hotpink:ff69b4 indianred:cd5c5c indigo:4b0082 ivory:fffff0 khaki:f0e68c lavender:e6e6fa ' +
  'lavenderblush:fff0f5 lawngreen:7cfc00 lemonchiffon:fffacd lightblue:add8e6 lightcoral:f08080 ' +
  'lightcyan:e0ffff lightgoldenrodyellow:fafad2 lightgray:d3d3d3 lightgreen:90ee90 lightgrey:d3d3d3 ' +
  'lightpink:ffb6c1 lightsalmon:ffa07a lightseagreen:20b2aa lightskyblue:87cefa lightslategray:778899 ' +
  'lightslategrey:778899 lightsteelblue:b0c4de lightyellow:ffffe0 lime:00ff00 limegreen:32cd32 ' +
  'linen:faf0e6 magenta:ff00ff maroon:800000 mediumaquamarine:66cdaa mediumblue:0000cd mediumorchid:ba55d3 ' +
  'mediumpurple:9370db mediumseagreen:3cb371 mediumslateblue:7b68ee mediumspringgreen:00fa9a ' +
  'mediumturquoise:48d1cc mediumvioletred:c71585 midnightblue:191970 mintcream:f5fffa mistyrose:ffe4e1 ' +
  'moccasin:ffe4b5 navajowhite:ffdead navy:000080 oldlace:fdf5e6 olive:808000 olivedrab:6b8e23 ' +
  'orange:ffa500 orangered:ff4500 orchid:da70d6 palegoldenrod:eee8aa palegreen:98fb98 paleturquoise:afeeee ' +
  'palevioletred:db7093 papayawhip:ffefd5 peachpuff:ffdab9 peru:cd853f pink:ffc0cb plum:dda0dd ' +
  'powderblue:b0e0e6 purple:800080 rebeccapurple:663399 red:ff0000 rosybrown:bc8f8f royalblue:4169e1 ' +
  'saddlebrown:8b4513 salmon:fa8072 sandybrown:f4a460 seagreen:2e8b57 seashell:fff5ee sienna:a0522d ' +
  'silver:c0c0c0 skyblue:87ceeb slateblue:6a5acd slategray:708090 slategrey:708090 snow:fffafa ' +
  'springgreen:00ff7f steelblue:4682b4 tan:d2b48c teal:008080 thistle:d8bfd8 tomato:ff6347 ' +
  'turquoise:40e0d0 violet:ee82ee wheat:f5deb3 white:ffffff whitesmoke:f5f5f5 yellow:ffff00 ' +
  'yellowgreen:9acd32 transparent:00000000';

/** Named color → hex, so that named colors are measured (contrast) exactly like hex colors. */
const NAMED_COLORS: ReadonlyMap<string, string> = new Map(
  NAMED_COLOR_TABLE.split(' ').map((entry): [string, string] => {
    const [name, hex] = entry.split(':');
    return [name, `#${hex}`];
  }),
);

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
/** A number with an optional % or deg unit: the only tokens allowed inside rgb()/hsl(). */
const ARG = '[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:%|deg)?';
/**
 * Whitespace allowed inside rgb()/hsl(): space, tab, CR, LF only. `\s` would also accept U+000B/U+000C
 * (invalid in XML 1.0: they break the SVG) and Unicode spaces.
 */
const WS = '[ \\t\\r\\n]';
const SEP = `(?:${WS}*[,/]${WS}*|${WS}+)`;
const FUNC_RE = new RegExp(`^(?:rgba?|hsla?)\\(${WS}*${ARG}(?:${SEP}${ARG}){2,3}${WS}*\\)$`, 'i');
/** Control characters other than tab, LF and CR (never part of a color, invalid in XML 1.0 for most). */
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;

/** True for colors safe to embed in CSS/SVG: hex, rgb[a](), hsl[a]() and named colors. */
export function isSafeColor(value: string): boolean {
  if (typeof value !== 'string' || value.length > 64 || CONTROL_RE.test(value)) return false;
  const v = value.trim();
  return HEX_RE.test(v) || FUNC_RE.test(v) || NAMED_COLORS.has(v.toLowerCase());
}

// ---------------------------------------------------------------------------
// Color math (sRGB, WCAG 2.x)
// ---------------------------------------------------------------------------

interface Rgb {
  r: number;
  g: number;
  b: number;
}

const BLACK: Rgb = { r: 0, g: 0, b: 0 };
const WHITE: Rgb = { r: 255, g: 255, b: 255 };
/** Dark text drawn on light accents (the GitHub dark canvas). */
const DARK_INK: Rgb = { r: 13, g: 17, b: 23 };

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

/** Parses a numeric rgb()/hsl() argument; percentages are scaled to `percentScale`. */
function num(arg: string | undefined, percentScale: number): number {
  if (arg === undefined) return NaN;
  const n = parseFloat(arg);
  return arg.endsWith('%') ? (n / 100) * percentScale : n;
}

/**
 * Parses hex, rgb[a](), hsl[a]() and named colors into opaque sRGB. Translucent colors
 * (including `transparent`) are composited over `backdrop`.
 */
function parseColor(value: string, backdrop: Rgb = WHITE): Rgb | undefined {
  const trimmed = value.trim().toLowerCase();
  const v = NAMED_COLORS.get(trimmed) ?? trimmed;
  let rgb: Rgb;
  let alpha = 1;
  if (HEX_RE.test(v)) {
    let hex = v.slice(1);
    if (hex.length <= 4) hex = hex.replace(/./g, (c) => c + c);
    rgb = { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
    if (hex.length === 8) alpha = parseInt(hex.slice(6, 8), 16) / 255;
  } else if (FUNC_RE.test(v)) {
    const args = v.slice(v.indexOf('(') + 1, -1).split(/[\s,/]+/).filter(Boolean);
    if (v.startsWith('rgb')) {
      rgb = { r: num(args[0], 255), g: num(args[1], 255), b: num(args[2], 255) };
    } else {
      const h = (((parseFloat(args[0] ?? '') % 360) + 360) % 360) / 360;
      // Saturation and lightness are percentages (CSS Color 4 also allows bare numbers).
      const pct = (arg: string | undefined): number => clamp(parseFloat(arg ?? '') / 100, 0, 1);
      rgb = hslToRgb(h, pct(args[1]), pct(args[2]));
    }
    if (args[3] !== undefined) alpha = num(args[3], 1);
  } else {
    return undefined;
  }
  if (![rgb.r, rgb.g, rgb.b, alpha].every(Number.isFinite)) return undefined;
  rgb = { r: clamp(rgb.r, 0, 255), g: clamp(rgb.g, 0, 255), b: clamp(rgb.b, 0, 255) };
  return mix(rgb, backdrop, clamp(alpha, 0, 1));
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number): number => {
    const k = ((t % 1) + 1) % 1;
    if (k < 1 / 6) return p + (q - p) * 6 * k;
    if (k < 1 / 2) return q;
    if (k < 2 / 3) return p + (q - p) * (2 / 3 - k) * 6;
    return p;
  };
  return { r: channel(h + 1 / 3) * 255, g: channel(h) * 255, b: channel(h - 1 / 3) * 255 };
}

/** Linear blend: `weight` of `a`, (1 - weight) of `b`. */
function mix(a: Rgb, b: Rgb, weight: number): Rgb {
  return {
    r: a.r * weight + b.r * (1 - weight),
    g: a.g * weight + b.g * (1 - weight),
    b: a.b * weight + b.b * (1 - weight),
  };
}

function toHex(c: Rgb): string {
  const h = (n: number): string => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

/** WCAG relative luminance. */
function luminance(c: Rgb): number {
  const lin = (v: number): number => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/** WCAG contrast ratio (1–21). */
function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** A background is "dark" when white text reads better on it than black text. */
function isDark(c: Rgb): boolean {
  return contrast(c, WHITE) > contrast(c, BLACK);
}

/** Moves `fg` toward `toward` in 10 % steps until it reaches `min` contrast against `bg`. */
function ensureContrast(fg: Rgb, bg: Rgb, min: number, toward: Rgb): Rgb {
  let out = fg;
  for (let i = 1; i <= 10 && contrast(out, bg) < min; i++) out = mix(toward, fg, i / 10);
  return out;
}

// ---------------------------------------------------------------------------
// Palette resolution
// ---------------------------------------------------------------------------

function safe(value: string | undefined): string | undefined {
  return typeof value === 'string' && isSafeColor(value) ? value.trim() : undefined;
}

/** Base palette for the theme with color overrides applied and secondary colors derived. Unsafe colors are ignored. */
export function resolvePalette(options: ColorOptions & { theme?: 'light' | 'dark' }): Palette {
  const base = options?.theme === 'dark' ? DARK_PALETTE : LIGHT_PALETTE;
  const p: Palette = { ...base };
  const bgIn = safe(options?.backgroundColor);
  const textIn = safe(options?.textColor);
  const accentIn = safe(options?.mainColor);
  if (!bgIn && !textIn && !accentIn) return p;

  if (bgIn) p.cardBg = bgIn;
  if (textIn) p.text = textIn;
  if (accentIn) p.accent = accentIn;

  const backdrop = parseColor(base.surface) ?? WHITE;
  const bg = parseColor(p.cardBg, backdrop);
  // Every safe color parses; an unmeasurable one would keep the base secondary colors as they are.
  if (!bg) return p;
  const dark = isDark(bg);
  // Palette whose fixed hues (OA, errors, fallback text/accent) suit the card brightness.
  const ref = dark ? DARK_PALETTE : LIGHT_PALETTE;

  if (bgIn) {
    // Keep the default text/accent readable on a custom background.
    const baseText = parseColor(base.text) as Rgb;
    if (!textIn && contrast(baseText, bg) < 4.5) p.text = ref.text;
    const baseAccent = parseColor(base.accent) as Rgb;
    if (!accentIn && contrast(baseAccent, bg) < 3) p.accent = ref.accent;

    p.surface = toHex(dark ? mix(BLACK, bg, 0.35) : mix(BLACK, bg, 0.035));
    p.border = toHex(dark ? mix(WHITE, bg, 0.14) : mix(BLACK, bg, 0.12));
    p.tagBg = toHex(dark ? mix(WHITE, bg, 0.07) : mix(BLACK, bg, 0.06));
    for (const key of ['oaBg', 'oaText', 'errorBg', 'errorBorder', 'errorText'] as const) p[key] = ref[key];
  }

  const text = parseColor(p.text, bg);
  const accent = parseColor(p.accent, bg);
  // Secondary text is pushed toward pure black/white when it lacks contrast (even if textColor does).
  const ink = dark ? WHITE : BLACK;

  if (text && (bgIn || textIn)) {
    p.muted = toHex(ensureContrast(mix(text, bg, 0.66), bg, 4.5, ink));
    const tagBg = parseColor(p.tagBg, bg) ?? bg;
    p.tagText = toHex(ensureContrast(mix(text, tagBg, 0.8), tagBg, 4.5, ink));
  }

  if (accent && (bgIn || accentIn || p.accent !== base.accent)) {
    p.accentHover = toHex(dark ? mix(WHITE, accent, 0.2) : mix(BLACK, accent, 0.25));
    // Prefer white ink; switch to dark ink only when it reads better (WCAG contrast).
    const whiteInk = contrast(WHITE, accent);
    p.accentText = whiteInk >= 4.5 || whiteInk >= contrast(DARK_INK, accent) ? '#ffffff' : toHex(DARK_INK);
    const domainBg = mix(accent, bg, dark ? 0.18 : 0.1);
    p.domainBg = toHex(domainBg);
    const domainText = dark ? mix(WHITE, accent, 0.2) : accent;
    p.domainText = toHex(ensureContrast(domainText, domainBg, 4.5, ink));
  }

  return p;
}

/** Maps a (partial) palette to CSS custom properties, e.g. { '--hal-card-bg': '#fff' }. */
export function paletteToCssVars(palette: Partial<Palette>): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(palette ?? {})) {
    // Defense in depth: never emit a value that did not pass the color barrier.
    if (typeof value !== 'string' || !isSafeColor(value)) continue;
    vars[`--hal-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`] = value.trim();
  }
  return vars;
}
