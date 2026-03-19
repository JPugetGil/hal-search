import type { HalDoc, DetailLevel, PaginationState } from './types';

const NS = 'http://www.w3.org/2000/svg';
const W = 800;
const PAD = 16;
const CARD_GAP = 8;
const HEADER_H = 50;

/** Default colour palette — mirrors CSS-variable defaults from styles.ts */
const C = {
  accent: '#0052cc',
  accentText: '#ffffff',
  bg: '#f2f4f8',
  cardBg: '#ffffff',
  border: '#e0e0e0',
  text: '#1a1a1a',
  muted: '#666666',
  link: '#0052cc',
  oaBg: '#e3f5ee',
  oaColor: '#006644',
  tagBg: '#f0f0f0',
  tagColor: '#444444',
  domainBg: '#dbeafe',
  domainColor: '#1a56db',
};

// ---------------------------------------------------------------------------
// SVG helpers
// ---------------------------------------------------------------------------

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(NS, tag) as SVGElementTagNameMap[K];
}

function set(el: SVGElement, attrs: Record<string, string | number>): void {
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
}

function decodeEntities(raw: string): string {
  const ta = document.createElement('textarea');
  ta.innerHTML = raw;
  return ta.value;
}

/** Approximate truncation (SVG has no native text-measurement API). */
function truncate(text: string, maxPx: number, fontSize: number): string {
  const charW = fontSize * 0.56;
  const max = Math.floor(maxPx / charW);
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

function mkRect(
  x: number, y: number, w: number, h: number,
  fill: string,
  extra?: Record<string, string | number>,
): SVGRectElement {
  const r = svgEl('rect');
  set(r, { x, y, width: w, height: h, fill, ...extra });
  return r;
}

function mkText(
  x: number, y: number, content: string,
  extra?: Record<string, string | number>,
): SVGTextElement {
  const t = svgEl('text');
  set(t, { x, y, 'font-family': 'system-ui,-apple-system,sans-serif', ...extra });
  t.textContent = content;
  return t;
}

function mkLink(href: string, child: SVGElement): SVGAElement {
  const a = svgEl('a');
  a.setAttribute('href', href);
  a.setAttribute('target', '_blank');
  a.appendChild(child);
  return a;
}

/**
 * Renders a pill badge anchored at (x, baseline-y).
 * Returns the total pixel width consumed, including a 4 px trailing gap.
 */
function pill(
  parent: SVGElement,
  x: number, y: number,
  label: string,
  bg: string, color: string,
): number {
  const fs = 11;
  const ph = 5, pv = 3;
  const bw = label.length * fs * 0.6 + ph * 2;
  const bh = fs + pv * 2;
  parent.appendChild(mkRect(x, y - fs, bw, bh, bg, { rx: 3 }));
  parent.appendChild(mkText(x + ph, y - 1, label, { 'font-size': fs, fill: color }));
  return bw + 4;
}

// ---------------------------------------------------------------------------
// Card geometry
// ---------------------------------------------------------------------------

function cardHeight(doc: HalDoc, lvl: DetailLevel): number {
  if (lvl === 0) return 44;
  const hasTagRow =
    lvl >= 2 &&
    ((doc.keyword_s?.length ?? 0) > 0 ||
      (doc.domain_s?.length ?? 0) > 0 ||
      Boolean(doc.conferenceTitle_s));
  return hasTagRow ? 86 : 62;
}

// ---------------------------------------------------------------------------
// Card builder
// ---------------------------------------------------------------------------

function buildCard(doc: HalDoc, lvl: DetailLevel, cardY: number): SVGElement {
  const g = svgEl('g');
  const h = cardHeight(doc, lvl);
  const cx = PAD;
  const cw = W - PAD * 2;
  const ix = PAD * 2; // inner-x (text left margin)

  // Card background
  g.appendChild(mkRect(cx, cardY, cw, h, C.cardBg, {
    rx: 6, stroke: C.border, 'stroke-width': 1,
  }));

  // ── Level 0: citation label only ──────────────────────────────────────────
  if (lvl === 0) {
    const raw = decodeEntities(doc.label_s ?? doc.docid ?? '');
    const label = truncate(raw, cw - PAD * 2, 12);
    const t = mkText(ix, cardY + 26, label, { 'font-size': 12, fill: C.link });
    if (doc.uri_s?.startsWith('http')) {
      g.appendChild(mkLink(doc.uri_s, t));
    } else {
      t.setAttribute('fill', C.text);
      g.appendChild(t);
    }
    return g;
  }

  // ── Level 1+: title row ──────────────────────────────────────────────────
  const titleRaw = doc.title_s?.[0] ?? doc.label_s ?? 'Untitled';
  const titleStr = truncate(titleRaw, cw - PAD * 2, 14);
  const titleEl = mkText(ix, cardY + 22, titleStr, {
    'font-size': 14,
    'font-weight': 'bold',
    fill: doc.uri_s?.startsWith('http') ? C.link : C.text,
  });
  g.appendChild(doc.uri_s?.startsWith('http') ? mkLink(doc.uri_s, titleEl) : titleEl);

  // ── Meta row ─────────────────────────────────────────────────────────────
  const metaY = cardY + 44;

  // Left: "authors · year"
  const metaParts: string[] = [];
  if (doc.authFullName_s?.length) {
    metaParts.push(truncate(doc.authFullName_s.join(', '), cw * 0.5, 12));
  }
  if (doc.publicationDate_s) {
    metaParts.push(doc.publicationDate_s.slice(0, 4));
  }
  if (metaParts.length) {
    g.appendChild(mkText(ix, metaY, metaParts.join(' · '), {
      'font-size': 12, fill: C.muted,
    }));
  }

  // Right: badges (rendered right-to-left so order is docType | OA visually)
  let badgeRight = cx + cw - PAD;
  if (doc.openAccess_bool === true) {
    const label = 'Open Access';
    badgeRight -= label.length * 11 * 0.6 + 10 + 4;
    pill(g, badgeRight, metaY, label, C.oaBg, C.oaColor);
  }
  if (doc.docType_s && doc.docType_s.toUpperCase() !== 'UNDEFINED') {
    const label = doc.docType_s;
    badgeRight -= label.length * 11 * 0.6 + 10 + 4;
    pill(g, badgeRight, metaY, label, C.tagBg, C.tagColor);
  }

  // ── Tags row (lvl ≥ 2) ───────────────────────────────────────────────────
  if (lvl >= 2) {
    let tagX = ix;
    const tagY = cardY + 68;
    const tagRight = cx + cw - PAD;

    for (const kw of (doc.keyword_s ?? [])) {
      const bw = kw.length * 11 * 0.6 + 14;
      if (tagX + bw > tagRight) break;
      tagX += pill(g, tagX, tagY, kw, C.tagBg, C.tagColor);
    }
    for (const domain of (doc.domain_s ?? [])) {
      const bw = domain.length * 11 * 0.6 + 14;
      if (tagX + bw > tagRight) break;
      tagX += pill(g, tagX, tagY, domain, C.domainBg, C.domainColor);
    }
    if (doc.conferenceTitle_s && tagX < tagRight) {
      const label = truncate(doc.conferenceTitle_s, tagRight - tagX, 11);
      g.appendChild(mkText(tagX, tagY, label, {
        'font-size': 11, fill: C.muted, 'font-style': 'italic',
      }));
    }
  }

  return g;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds an SVG element representing the article list.
 * The SVG is self-contained and can be inserted into the DOM or serialised.
 */
export function buildArticlesSvg(
  docs: HalDoc[],
  lvl: DetailLevel,
  pagination: PaginationState,
): SVGSVGElement {
  const cardsH = docs.reduce((s, d) => s + cardHeight(d, lvl) + CARD_GAP, 0);
  const totalH = HEADER_H + CARD_GAP + cardsH + 32;

  const svg = svgEl('svg');
  set(svg, {
    width: W,
    height: totalH,
    viewBox: `0 0 ${W} ${totalH}`,
    xmlns: NS,
    role: 'img',
    'aria-label': 'HAL Search Results',
  });

  // Background
  svg.appendChild(mkRect(0, 0, W, totalH, C.bg));

  // Header bar
  svg.appendChild(mkRect(0, 0, W, HEADER_H, C.accent));
  svg.appendChild(mkText(PAD, 32, 'HAL Search Results', {
    'font-size': 18, 'font-weight': 'bold', fill: C.accentText,
  }));

  const { totalFound, currentPage, rows } = pagination;
  const totalPages = Math.max(1, Math.ceil(totalFound / rows));
  const pageInfo = `Page ${currentPage} / ${totalPages} · ${totalFound.toLocaleString()} results`;

  svg.appendChild(mkText(W - PAD, 32, pageInfo, {
    'font-size': 12, fill: C.accentText, 'text-anchor': 'end',
  }));

  // Article cards
  let y = HEADER_H + CARD_GAP;
  for (const doc of docs) {
    svg.appendChild(buildCard(doc, lvl, y));
    y += cardHeight(doc, lvl) + CARD_GAP;
  }

  // Footer
  svg.appendChild(mkText(PAD, totalH - 10, pageInfo, {
    'font-size': 11, fill: C.muted,
  }));

  return svg;
}

/**
 * Clears `container` and renders the article list as an inline SVG.
 * Falls back to the standard `.hal-empty` paragraph when `docs` is empty.
 */
export function renderResultsSvg(
  container: HTMLElement,
  docs: HalDoc[],
  lvl: DetailLevel,
  pagination: PaginationState,
): void {
  container.innerHTML = '';
  if (docs.length === 0) {
    const p = document.createElement('p');
    p.className = 'hal-empty';
    p.textContent = 'No results found.';
    container.appendChild(p);
    return;
  }
  container.appendChild(buildArticlesSvg(docs, lvl, pagination));
}
