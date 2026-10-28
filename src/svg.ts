import type { ColorOptions, DetailLevel, HalDoc, Labels, SvgRenderOptions, ThemeName } from './types';
import type { Palette } from './theme';
import { resolvePalette } from './theme';
import { formatLabel, resolveLabels } from './labels';
import { normalizeDomains } from './levels';
import {
  decodeEntities,
  dedupe,
  escapeXml,
  formatAuthors,
  getDocTypeLabel,
  getKeywords,
  getTitle,
  getVenue,
  getYear,
  groupDocs,
  normalizeSpace,
  stripHtml,
} from './format';

// DOM-free: every function returns markup strings. Every dynamic value goes through escapeXml().

const NS = 'http://www.w3.org/2000/svg';
const CREDIT_URL = 'https://github.com/JPugetGil/hal-search';
const CREDIT_TEXT = 'hal-search';
/** GitHub's system font stack: no web fonts can load inside an <img>. */
const FONT_STACK = "-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif";

const DEFAULT_WIDTH = 800;
const MIN_WIDTH = 320;
const MAX_WIDTH = 2000;

// Layout (px)
const RADIUS = 10;
const PAD = 16;
const HEADER_H = 52;
const FOOTER_H = 40;
const CARD_GAP = 10;
const CARD_PAD_X = 16;
const CARD_PAD_Y = 14;
const CARD_RADIUS = 6;
const GROUP_H = 28;
const PILL_H = 20;
const PILL_PAD = 8;
const PILL_GAP = 6;
const ROW_H = 22;

// Typography: [font size, line height]
const TITLE: Typo = { size: 15, line: 20, bold: true };
const CITATION: Typo = { size: 13, line: 19 };
const AUTHORS: Typo = { size: 13, line: 18 };
const META: Typo = { size: 12.5, line: ROW_H };
const PILL: Typo = { size: 11.5, line: PILL_H };
const ABSTRACT: Typo = { size: 12.5, line: 18 };
const ABSTRACT_LABEL: Typo = { size: 11.5, line: 16, bold: true };
const HEADER_TITLE: Typo = { size: 18, line: HEADER_H, bold: true };
const HEADER_COUNT: Typo = { size: 13, line: HEADER_H };
const GROUP: Typo = { size: 13, line: GROUP_H, bold: true };
const FOOTER: Typo = { size: 12, line: FOOTER_H };

const MAX_TITLE_LINES = 2;
const MAX_CITATION_LINES = 3;
const MAX_AUTHOR_LINES = 2;
const MAX_ABSTRACT_LINES = 3;

interface Typo {
  size: number;
  line: number;
  bold?: boolean;
}

// ---------------------------------------------------------------------------
// Text metrics (no measuring API outside the DOM)
// ---------------------------------------------------------------------------

/**
 * Advance widths of ASCII 32–126 in 1/1000 em (Helvetica/Arial metrics). Like shields.io,
 * text is measured with a table; the safety factors below cover Segoe UI, SF Pro and Noto Sans.
 */
// prettier-ignore
const ASCII_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, // space ! " # $ % & ' ( ) * + , - . /
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, // 0-9
  278, 278, 584, 584, 584, 556, 1015, // : ; < = > ? @
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, // A-M
  722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, // N-Z
  278, 278, 278, 469, 556, 333, // [ \ ] ^ _ `
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, // a-m
  556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, // n-z
  334, 260, 334, 584, // { | } ~
];
const SAFETY = 1.06;
const BOLD_FACTOR = 1.07;
const ELLIPSIS = '…';

const wideCache = new Map<number, number>();

/** Width of one code point in em, conservative for the system sans-serif fonts. */
function charEm(cp: number): number {
  if (cp >= 32 && cp <= 126) return ASCII_WIDTHS[cp - 32] / 1000;
  const cached = wideCache.get(cp);
  if (cached !== undefined) return cached;
  let em: number;
  const base = String.fromCodePoint(cp).normalize('NFD').codePointAt(0) ?? cp;
  if (base !== cp && base >= 32 && base <= 126) em = ASCII_WIDTHS[base - 32] / 1000; // é → e
  else if ((cp >= 0x300 && cp <= 0x36f) || (cp >= 0x200b && cp <= 0x200f) || cp === 0x2060 || cp === 0xfe0f) em = 0;
  else if (cp === 0xa0 || cp === 0x2009 || cp === 0x202f) em = 0.278;
  else if (cp === 0xe6 || cp === 0xc6 || cp === 0x153 || cp === 0x152) em = 1;
  else if (cp === 0x2014 || cp === 0x2026) em = 1;
  else if (cp >= 0x2018 && cp <= 0x201f) em = 0.35;
  else if (cp === 0x27e8 || cp === 0x27e9) em = 0.45;
  else if (cp >= 0x1f000 && cp <= 0x1faff) em = 1.25;
  else if (
    (cp >= 0x1100 && cp <= 0x11ff) ||
    (cp >= 0x2e80 && cp <= 0x9fff) ||
    (cp >= 0xac00 && cp <= 0xd7af) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    cp >= 0x20000
  )
    em = 1;
  else if (cp >= 0x370 && cp <= 0x3ff) em = 0.62;
  else if (cp >= 0x400 && cp <= 0x52f) em = 0.7;
  else if (cp < 0x250) em = 0.65;
  else em = 0.75;
  wideCache.set(cp, em);
  return em;
}

/** Estimated rendered width of `text` in px (conservative: real text is usually narrower). */
export function measureText(text: string, fontSize: number, bold = false): number {
  let em = 0;
  for (const ch of text) em += charEm(ch.codePointAt(0) as number);
  return em * fontSize * SAFETY * (bold ? BOLD_FACTOR : 1);
}

function width(text: string, t: Typo): number {
  return measureText(text, t.size, t.bold);
}

/** Cuts `text` to fit `maxW`, ending with an ellipsis when cut (or always when `force`). */
function ellipsize(text: string, maxW: number, t: Typo, force = false): string {
  if (!force && width(text, t) <= maxW) return text;
  const budget = maxW - width(ELLIPSIS, t);
  if (budget <= 0) return '';
  let used = 0;
  let out = '';
  for (const ch of text) {
    const w = width(ch, t);
    if (used + w > budget) break;
    used += w;
    out += ch;
  }
  return out.replace(/[\s,;:.\-–—·]+$/u, '') + ELLIPSIS;
}

/** Longest prefix of `word` that fits `maxW` (at least one character). */
function fitPrefix(word: string, maxW: number, t: Typo): string {
  let used = 0;
  let out = '';
  for (const ch of word) {
    const w = width(ch, t);
    if (out && used + w > maxW) break;
    used += w;
    out += ch;
  }
  return out;
}

/** Greedy word wrap into at most `maxLines` lines; the last line gets an ellipsis when text remains. */
function wrapText(text: string, maxW: number, t: Typo, maxLines: number): string[] {
  const words = normalizeSpace(text).split(' ').filter(Boolean);
  const lines: string[] = [];
  const space = width(' ', t);
  let cur = '';
  let curW = 0;
  let overflow = false;

  for (let i = 0; i < words.length && !overflow; i++) {
    let word = words[i];
    let w = width(word, t);
    if (cur && curW + space + w <= maxW) {
      cur += ' ' + word;
      curW += space + w;
      continue;
    }
    if (cur) {
      lines.push(cur);
      cur = '';
      curW = 0;
      if (lines.length === maxLines) {
        overflow = true;
        break;
      }
    }
    // Words longer than a line are hard-broken.
    while (w > maxW) {
      const piece = fitPrefix(word, maxW, t);
      lines.push(piece);
      word = word.slice(piece.length);
      w = width(word, t);
      if (lines.length === maxLines) {
        overflow = word.length > 0 || i < words.length - 1;
        break;
      }
    }
    if (!overflow && word) {
      cur = word;
      curW = w;
    }
  }
  if (!overflow && cur) {
    if (lines.length < maxLines) lines.push(cur);
    else overflow = true;
  }
  if (overflow && lines.length > 0) lines[lines.length - 1] = ellipsize(lines[lines.length - 1], maxW, t, true);
  return lines;
}

// ---------------------------------------------------------------------------
// Markup helpers
// ---------------------------------------------------------------------------

/** Rounds coordinates to 0.1 px for compact, deterministic output. */
function n(value: number): string {
  const r = Math.round(value * 10) / 10;
  return String(r === 0 ? 0 : r);
}

/** Baseline of a single text line vertically centred in a box of height `t.line` starting at `top`. */
function baseline(top: number, t: Typo): number {
  return top + (t.line + 0.7 * t.size) / 2;
}

function textEl(
  x: number,
  y: number,
  content: string,
  cls: string,
  t: Typo,
  extra: { anchor?: 'middle' | 'end'; italic?: boolean } = {},
): string {
  return (
    `<text x="${n(x)}" y="${n(y)}" class="${cls}" font-size="${t.size}"` +
    (t.bold ? ' font-weight="700"' : '') +
    (extra.italic ? ' font-style="italic"' : '') +
    (extra.anchor ? ` text-anchor="${extra.anchor}"` : '') +
    `>${escapeXml(content)}</text>`
  );
}

/** Only absolute http(s) URLs become links. */
function safeHref(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined;
  const u = url.trim();
  return /^https?:\/\/[^\s"'<>`]+$/i.test(u) ? u : undefined;
}

function link(href: string | undefined, inner: string): string {
  if (!href) return inner;
  return `<a href="${escapeXml(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
}

function rect(x: number, y: number, w: number, h: number, cls: string, rx = 0): string {
  return (
    `<rect x="${n(x)}" y="${n(y)}" width="${n(Math.max(0, w))}" height="${n(Math.max(0, h))}"` +
    (rx ? ` rx="${n(rx)}"` : '') +
    ` class="${cls}"/>`
  );
}

interface PillOut {
  markup: string;
  width: number;
}

/** A rounded badge whose top-left corner is (x, top). The label is cut to fit `maxW`. */
function pill(x: number, top: number, label: string, kind: 'tag' | 'domain' | 'oa', maxW: number): PillOut | undefined {
  const text = ellipsize(label, maxW - PILL_PAD * 2, PILL);
  if (!text) return undefined;
  const w = width(text, PILL) + PILL_PAD * 2;
  const markup =
    rect(x, top, w, PILL_H, `hal-${kind}`, PILL_H / 2) +
    textEl(x + w / 2, baseline(top, PILL), text, `hal-${kind}-text`, PILL, { anchor: 'middle' });
  return { markup, width: w };
}

/** Thousands separators without Intl: the output must not depend on the server locale. */
function formatCount(count: number): string {
  return String(Math.max(0, Math.round(count))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** FNV-1a 32-bit hash, base 36: deterministic scope for the embedded stylesheet. */
function hash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

// ---------------------------------------------------------------------------
// Theme stylesheet
// ---------------------------------------------------------------------------

const SCOPE = '%SCOPE%';

function paletteRules(p: Palette): string {
  const s = `.${SCOPE}`;
  return (
    `${s} .hal-bg{fill:${p.surface};stroke:${p.border}}` +
    `${s} .hal-head{fill:${p.accent}}` +
    `${s} .hal-head-text{fill:${p.accentText}}` +
    `${s} .hal-card{fill:${p.cardBg};stroke:${p.border}}` +
    `${s} .hal-rule{fill:${p.border}}` +
    `${s} .hal-text{fill:${p.text}}` +
    `${s} .hal-muted{fill:${p.muted}}` +
    `${s} .hal-link{fill:${p.accent}}` +
    `${s} a:hover .hal-link,${s} a:focus .hal-link{fill:${p.accentHover}}` +
    `${s} .hal-tag{fill:${p.tagBg}}` +
    `${s} .hal-tag-text{fill:${p.tagText}}` +
    `${s} .hal-domain{fill:${p.domainBg}}` +
    `${s} .hal-domain-text{fill:${p.domainText}}` +
    `${s} .hal-oa{fill:${p.oaBg}}` +
    `${s} .hal-oa-text{fill:${p.oaText}}` +
    `${s} .hal-error{fill:${p.errorBg};stroke:${p.errorBorder}}` +
    `${s} .hal-error-text{fill:${p.errorText}}` +
    `${s} .hal-error-icon{fill:${p.errorText}}` +
    `${s} .hal-error-icon-text{fill:${p.errorBg}}`
  );
}

interface Stylesheet {
  /** Class put on the root <svg> */
  scope: string;
  css: string;
}

/**
 * Colors live in an embedded stylesheet (not in attributes) so that theme 'auto' can switch with
 * prefers-color-scheme. Selectors are scoped by a hash of the rules: several inline SVGs with
 * different colors can share a page without overriding each other.
 */
function buildStylesheet(theme: ThemeName, colors: ColorOptions): Stylesheet {
  const light = () => resolvePalette({ ...colors, theme: 'light' });
  const dark = () => resolvePalette({ ...colors, theme: 'dark' });
  const base =
    `.${SCOPE} text{font-family:${FONT_STACK}}` +
    `.${SCOPE} a:hover text,.${SCOPE} a:focus text{text-decoration:underline}`;
  let rules: string;
  if (theme === 'dark') rules = paletteRules(dark());
  else if (theme === 'auto') rules = `${paletteRules(light())}@media (prefers-color-scheme:dark){${paletteRules(dark())}}`;
  else rules = paletteRules(light());
  const css = base + rules;
  const scope = `hal-svg-${hash(css)}`;
  return { scope, css: css.split(SCOPE).join(scope) };
}

function normalizeTheme(theme: unknown): ThemeName {
  return theme === 'dark' || theme === 'auto' ? theme : 'light';
}

function normalizeWidth(w: unknown): number {
  return typeof w === 'number' && Number.isFinite(w) ? Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w))) : DEFAULT_WIDTH;
}

function normalizeLevel(lvl: unknown): DetailLevel {
  return lvl === 0 || lvl === 1 || lvl === 2 || lvl === 3 ? lvl : 1;
}

function svgRoot(w: number, h: number, scope: string, title: string, desc: string, css: string, body: string[]): string {
  return [
    `<svg xmlns="${NS}" width="${w}" height="${n(h)}" viewBox="0 0 ${w} ${n(h)}" role="img" class="hal-svg ${scope}">`,
    `<title>${escapeXml(title)}</title>`,
    ...(desc ? [`<desc>${escapeXml(desc)}</desc>`] : []),
    `<style>${css}</style>`,
    ...body,
    '</svg>',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

interface CardContext {
  lvl: DetailLevel;
  labels: Labels;
  innerW: number;
  maxAuthors?: number;
  highlightAuthors?: string[];
}

interface Block {
  markup: string[];
  height: number;
}

interface AuthorToken {
  name: string;
  bold: boolean;
  /** Width of the name alone */
  w: number;
}

/** Author lines: highlighted names in bold, cut with "et al." when they do not fit. */
function authorLines(doc: HalDoc, ctx: CardContext): string[] {
  const { authors, hiddenCount } = formatAuthors(doc, ctx);
  if (authors.length === 0) return [];
  const space = width(' ', AUTHORS);
  const comma = width(',', AUTHORS);
  const etAl = ctx.labels.etAl;
  const etAlW = width(etAl, AUTHORS);
  const tokens: AuthorToken[] = authors.map((a) => {
    const t: Typo = { ...AUTHORS, bold: a.highlighted };
    const name = ellipsize(a.name, ctx.innerW - comma, t);
    return { name, bold: a.highlighted, w: width(name, t) };
  });

  // Greedy layout. Every name but the last one carries a comma (the last one too before "et al.").
  const lines: AuthorToken[][] = [[]];
  const widths: number[] = [0];
  let placed = 0;
  for (let i = 0; i < tokens.length; i++) {
    const tw = tokens[i].w + (i < tokens.length - 1 || hiddenCount > 0 ? comma : 0);
    const row = lines.length - 1;
    const gap = lines[row].length ? space : 0;
    if (widths[row] + gap + tw <= ctx.innerW) {
      lines[row].push(tokens[i]);
      widths[row] += gap + tw;
    } else if (lines.length < MAX_AUTHOR_LINES) {
      lines.push([tokens[i]]);
      widths.push(tw);
    } else {
      break;
    }
    placed++;
  }

  // Names that did not fit join the hidden ones; make room for " et al." on the last line.
  const needEtAl = hiddenCount > 0 || placed < tokens.length;
  if (needEtAl) {
    let row = lines.length - 1;
    while (row >= 0) {
      const last = lines[row];
      const tail = last.length ? space + etAlW : etAlW;
      // A line that only holds "et al." is fine; otherwise the names + " et al." must fit.
      if (widths[row] + tail <= ctx.innerW || last.length === 0) break;
      const removed = last.pop() as AuthorToken;
      widths[row] -= removed.w + comma + (last.length ? space : 0);
      if (last.length === 0 && row > 0) {
        lines.pop();
        widths.pop();
        row--;
      }
    }
  }

  const total = lines.reduce((sum, l) => sum + l.length, 0);
  let index = 0;
  const out = lines.map((line, row) => {
    const parts = line.map((tok) => {
      index++;
      const name = tok.bold ? `<tspan font-weight="700">${escapeXml(tok.name)}</tspan>` : escapeXml(tok.name);
      return name + (index < total || needEtAl ? ',' : '');
    });
    if (needEtAl && row === lines.length - 1) parts.push(escapeXml(etAl));
    return parts.join(' ');
  });
  return out.filter(Boolean);
}

/** Card body for lvl 0: the citation (label_s) on up to three lines. */
function citationBlock(doc: HalDoc, ctx: CardContext, top: number): Block {
  const citation = normalizeSpace(decodeEntities(typeof doc.label_s === 'string' ? doc.label_s : '')) || getTitle(doc, ctx.labels);
  const lines = wrapText(citation, ctx.innerW, CITATION, MAX_CITATION_LINES);
  const texts = lines.map((line, i) => textEl(0, baseline(top + i * CITATION.line, CITATION), line, 'hal-text', CITATION));
  return { markup: [link(safeHref(doc.uri_s), texts.join(''))], height: lines.length * CITATION.line };
}

/** Pills + "year · venue" row. */
function metaRow(doc: HalDoc, ctx: CardContext, top: number): Block {
  const out: string[] = [];
  let x = 0;
  const pills: { label: string; kind: 'tag' | 'oa' }[] = [];
  const type = getDocTypeLabel(doc.docType_s, ctx.labels);
  if (type) pills.push({ label: type, kind: 'tag' });
  if (ctx.lvl >= 2 && doc.openAccess_bool === true) pills.push({ label: ctx.labels.openAccess, kind: 'oa' });
  for (const p of pills) {
    const made = pill(x, top + (ROW_H - PILL_H) / 2, p.label, p.kind, Math.min(ctx.innerW - x, ctx.innerW / 2));
    if (!made) continue;
    out.push(made.markup);
    x += made.width + PILL_GAP;
  }
  const year = getYear(doc);
  const meta = [year === undefined ? '' : String(year), getVenue(doc) ?? ''].filter(Boolean).join(' · ');
  if (meta) {
    const gap = x > 0 ? 2 : 0;
    const text = ellipsize(meta, ctx.innerW - x - gap, META);
    if (text) out.push(textEl(x + gap, baseline(top, META), text, 'hal-muted', META));
  }
  return { markup: out, height: out.length ? ROW_H : 0 };
}

/** Domains then keywords on one row; a "+N" pill counts the ones that do not fit. */
function tagsRow(doc: HalDoc, ctx: CardContext, top: number): Block {
  const domains = dedupe(
    normalizeDomains(Array.isArray(doc.domain_s) ? doc.domain_s : [], doc.en_domainAllCodeLabel_fs).map((d) =>
      normalizeSpace(decodeEntities(String(d))),
    ),
  );
  const items = [
    ...domains.map((label) => ({ label, kind: 'domain' as const })),
    ...getKeywords(doc).map((label) => ({ label, kind: 'tag' as const })),
  ];
  if (items.length === 0) return { markup: [], height: 0 };

  const pillTop = top + (ROW_H - PILL_H) / 2;
  const placed: { markup: string; x: number; width: number }[] = [];
  let x = 0;
  for (const item of items) {
    const w = width(item.label, PILL) + PILL_PAD * 2;
    if (x + w > ctx.innerW) {
      // A single long first tag is cut instead of dropped.
      if (placed.length > 0) break;
    }
    const made = pill(x, pillTop, item.label, item.kind, ctx.innerW - x);
    if (!made) break;
    placed.push({ markup: made.markup, x, width: made.width });
    x += made.width + PILL_GAP;
  }
  let rest = items.length - placed.length;
  if (rest > 0) {
    // Make room for the counter pill.
    const counterW = (count: number): number => width(`+${count}`, PILL) + PILL_PAD * 2;
    while (placed.length > 1 && placed[placed.length - 1].x + placed[placed.length - 1].width + PILL_GAP + counterW(rest) > ctx.innerW) {
      placed.pop();
      rest++;
    }
    const last = placed[placed.length - 1];
    const cx = last ? last.x + last.width + PILL_GAP : 0;
    const counter = pill(cx, pillTop, `+${rest}`, 'tag', ctx.innerW - cx);
    if (counter) placed.push({ markup: counter.markup, x: cx, width: counter.width });
  }
  return { markup: placed.map((p) => p.markup), height: ROW_H };
}

/** Separator, "Abstract" label and up to three lines of text. */
function abstractBlock(doc: HalDoc, ctx: CardContext, top: number): Block {
  const raw = Array.isArray(doc.abstract_s) ? doc.abstract_s.find((a) => typeof a === 'string' && a.trim()) : undefined;
  const abstract = raw ? stripHtml(raw) : '';
  if (!abstract) return { markup: [], height: 0 };
  const out: string[] = [];
  let y = top + 8;
  out.push(rect(0, y, ctx.innerW, 1, 'hal-rule'));
  y += 7;
  out.push(textEl(0, baseline(y, ABSTRACT_LABEL), ellipsize(ctx.labels.abstract, ctx.innerW, ABSTRACT_LABEL), 'hal-muted', ABSTRACT_LABEL));
  y += ABSTRACT_LABEL.line;
  const lines = wrapText(abstract, ctx.innerW, ABSTRACT, MAX_ABSTRACT_LINES);
  lines.forEach((line, i) => out.push(textEl(0, baseline(y + i * ABSTRACT.line, ABSTRACT), line, 'hal-text', ABSTRACT)));
  y += lines.length * ABSTRACT.line;
  return { markup: out, height: y - top };
}

/** Builds one card. Coordinates are relative to the card's inner box. */
function cardBody(doc: HalDoc, ctx: CardContext): Block {
  if (ctx.lvl === 0) return citationBlock(doc, ctx, 0);

  const out: string[] = [];
  let y = 0;
  const href = safeHref(doc.uri_s);
  const titleLines = wrapText(getTitle(doc, ctx.labels), ctx.innerW, TITLE, MAX_TITLE_LINES);
  const titleCls = href ? 'hal-link' : 'hal-text';
  out.push(link(href, titleLines.map((line, i) => textEl(0, baseline(y + i * TITLE.line, TITLE), line, titleCls, TITLE)).join('')));
  y += titleLines.length * TITLE.line + 2;

  const authors = authorLines(doc, ctx);
  authors.forEach((markup, i) => {
    // `markup` is already escaped (it holds the <tspan> of highlighted names).
    out.push(`<text x="0" y="${n(baseline(y + i * AUTHORS.line, AUTHORS))}" class="hal-text" font-size="${AUTHORS.size}">${markup}</text>`);
  });
  y += authors.length * AUTHORS.line;

  const meta = metaRow(doc, ctx, y + 2);
  out.push(...meta.markup);
  if (meta.height) y += meta.height + 2;

  if (ctx.lvl >= 2) {
    const tags = tagsRow(doc, ctx, y + 4);
    out.push(...tags.markup);
    if (tags.height) y += tags.height + 4;
  }
  if (ctx.lvl >= 3) {
    const abs = abstractBlock(doc, ctx, y);
    out.push(...abs.markup);
    y += abs.height;
  }
  return { markup: out, height: y };
}

/**
 * Wraps a card body in a nested <svg>: it clips its content, so text can never
 * leave the card even when the viewer's font is wider than the width table.
 */
function card(x: number, y: number, w: number, body: Block): Block {
  const h = body.height + CARD_PAD_Y * 2;
  const markup = [
    `<svg x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" overflow="hidden">`,
    rect(0.5, 0.5, w - 1, h - 1, 'hal-card', CARD_RADIUS),
    `<g transform="translate(${CARD_PAD_X} ${CARD_PAD_Y})">`,
    ...body.markup,
    '</g>',
    '</svg>',
  ];
  return { markup, height: h };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Renders the article list as a standalone SVG string (every dynamic value XML-escaped). */
export function renderSvg(docs: HalDoc[], options: SvgRenderOptions): string {
  const opts = options ?? ({ totalFound: 0 } as SvgRenderOptions);
  const list = (Array.isArray(docs) ? docs : []).filter((d) => d && typeof d === 'object');
  const labels = resolveLabels(opts.labels);
  const lvl = normalizeLevel(opts.lvl);
  const W = normalizeWidth(opts.width);
  const total = typeof opts.totalFound === 'number' && Number.isFinite(opts.totalFound) ? opts.totalFound : list.length;
  const count = formatCount(total);
  const title = normalizeSpace(typeof opts.title === 'string' ? opts.title : '') || labels.title;
  const halUrl = safeHref(opts.halUrl);
  const colors = { backgroundColor: opts.backgroundColor, textColor: opts.textColor, mainColor: opts.mainColor };
  const { scope, css } = buildStylesheet(normalizeTheme(opts.theme), colors);

  const body: string[] = [];
  const cardW = W - PAD * 2;
  const ctx: CardContext = {
    lvl,
    labels,
    innerW: cardW - CARD_PAD_X * 2,
    maxAuthors: opts.maxAuthors,
    highlightAuthors: opts.highlightAuthors,
  };

  // Header: title (left) and result count (right) on the accent bar.
  // Singular wording for exactly one result.
  const countText = formatLabel(total === 1 ? labels.resultCountOne : labels.resultCount, { count });
  const countW = Math.min(width(countText, HEADER_COUNT), W / 3);
  const headerTitle = ellipsize(title, W - PAD * 3 - countW, HEADER_TITLE);
  body.push(
    `<path d="M0 ${HEADER_H}V${RADIUS}A${RADIUS} ${RADIUS} 0 0 1 ${RADIUS} 0H${W - RADIUS}A${RADIUS} ${RADIUS} 0 0 1 ${W} ${RADIUS}V${HEADER_H}Z" class="hal-head"/>`,
    link(halUrl, textEl(PAD, baseline(0, HEADER_TITLE), headerTitle, 'hal-head-text', HEADER_TITLE)),
    textEl(W - PAD, baseline(0, HEADER_COUNT), ellipsize(countText, countW, HEADER_COUNT), 'hal-head-text', HEADER_COUNT, {
      anchor: 'end',
    }),
  );

  let y = HEADER_H + PAD;
  if (list.length === 0) {
    const empty: Block = {
      markup: [textEl(ctx.innerW / 2, baseline(0, CITATION), ellipsize(labels.empty, ctx.innerW, CITATION), 'hal-muted', CITATION, { anchor: 'middle' })],
      height: CITATION.line,
    };
    const c = card(PAD, y, cardW, empty);
    body.push(...c.markup);
    y += c.height + CARD_GAP;
  }

  groupDocs(list, opts.groupBy, labels).forEach((group, gi) => {
    if (group.label) {
      if (gi > 0) y += 6;
      const heading = ellipsize(group.label, cardW - 40, GROUP);
      const hw = width(heading, GROUP);
      const base = baseline(y, GROUP);
      body.push(textEl(PAD, base, heading, 'hal-text', GROUP));
      body.push(rect(PAD + hw + 10, base - 4, Math.max(0, cardW - hw - 10), 1, 'hal-rule'));
      y += GROUP_H;
    }
    for (const doc of group.docs) {
      const c = card(PAD, y, cardW, cardBody(doc, ctx));
      body.push(...c.markup);
      y += c.height + CARD_GAP;
    }
  });

  // Footer: link to the full list (left) and credit (right).
  const footerTop = y - CARD_GAP;
  const footerBase = baseline(footerTop, FOOTER);
  const credit = opts.showCredit === false ? '' : CREDIT_TEXT;
  const creditW = credit ? width(credit, FOOTER) : 0;
  if (credit) {
    body.push(link(CREDIT_URL, textEl(W - PAD, footerBase, credit, 'hal-muted', FOOTER, { anchor: 'end' })));
  }
  if (total > 0) {
    const viewAll = ellipsize(formatLabel(total === 1 ? labels.viewOnHalOne : labels.viewOnHal, { count }), W - PAD * 2 - (credit ? creditW + PAD : 0), FOOTER);
    if (viewAll) body.push(link(halUrl, textEl(PAD, footerBase, viewAll, halUrl ? 'hal-link' : 'hal-muted', FOOTER)));
  }
  const H = footerTop + FOOTER_H;

  const background = `<rect x="0.5" y="0.5" width="${W - 1}" height="${n(H - 1)}" rx="${RADIUS}" class="hal-bg"/>`;
  const desc = list.map((d) => getTitle(d, labels)).join('\n');
  return svgRoot(W, H, scope, `${title} – ${countText}`, desc, css, [background, ...body]);
}

/** Renders a small standalone SVG showing an error message (escaped). */
export function renderErrorSvg(message: string, options?: { theme?: ThemeName; width?: number }): string {
  const W = normalizeWidth(options?.width);
  const { scope, css } = buildStylesheet(normalizeTheme(options?.theme), {});
  const text = normalizeSpace(String(message ?? '')) || 'Error';
  const iconR = 9;
  const textX = PAD + iconR * 2 + 10;
  const lines = wrapText(text, W - textX - PAD, CITATION, 4);
  const H = Math.max(PAD * 2 + lines.length * CITATION.line, 52);
  const top = (H - lines.length * CITATION.line) / 2;
  const body = [
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${n(H - 1)}" rx="8" class="hal-error"/>`,
    `<circle cx="${PAD + iconR}" cy="${n(H / 2)}" r="${iconR}" class="hal-error-icon"/>`,
    textEl(PAD + iconR, baseline(H / 2 - CITATION.line / 2, { ...CITATION, bold: true }), '!', 'hal-error-icon-text', { ...CITATION, bold: true }, { anchor: 'middle' }),
    ...lines.map((line, i) => textEl(textX, baseline(top + i * CITATION.line, CITATION), line, 'hal-error-text', CITATION)),
  ];
  return svgRoot(W, H, scope, text, '', css, body);
}
