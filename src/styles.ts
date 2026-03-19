export const DEFAULT_CSS = `
:root {
  --hal-accent: #0052cc;
  --hal-accent-hover: #003d99;
  --hal-bg: #ffffff;
  --hal-bg-article: #fafafa;
  --hal-border: #e0e0e0;
  --hal-text: #1a1a1a;
  --hal-text-muted: #666666;
  --hal-oa-color: #006644;
  --hal-oa-bg: #e3f5ee;
  --hal-tag-bg: #f0f0f0;
  --hal-tag-color: #444444;
  --hal-font: system-ui, -apple-system, sans-serif;
  --hal-radius: 6px;
  --hal-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.hal-results {
  font-family: var(--hal-font);
  color: var(--hal-text);
  width: 100%;
}

/* Loading state */
.hal-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 24px 0;
  color: var(--hal-text-muted);
  font-size: 0.95rem;
}

.hal-spinner {
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
.hal-error,
.hal-empty {
  padding: 16px;
  border-radius: var(--hal-radius);
  font-size: 0.9rem;
}

.hal-error {
  background: #fff5f5;
  border: 1px solid #ffc9c9;
  color: #c92a2a;
}

.hal-empty {
  background: var(--hal-bg-article);
  border: 1px solid var(--hal-border);
  color: var(--hal-text-muted);
}

/* Article card */
.hal-article {
  background: var(--hal-bg);
  border: 1px solid var(--hal-border);
  border-radius: var(--hal-radius);
  padding: 18px 20px;
  margin-bottom: 12px;
  box-shadow: var(--hal-shadow);
}

.hal-article:last-of-type {
  margin-bottom: 0;
}

/* Title */
.hal-article__title {
  margin: 0 0 8px 0;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.4;
}

.hal-article__title a {
  color: var(--hal-accent);
  text-decoration: none;
}

.hal-article__title a:hover {
  color: var(--hal-accent-hover);
  text-decoration: underline;
}

/* Label (minimal mode) */
.hal-article__label {
  margin: 0 0 8px 0;
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--hal-text);
}

/* Meta row */
.hal-article__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  color: var(--hal-text-muted);
  margin-bottom: 4px;
}

.hal-article__authors {
  font-weight: 500;
  color: var(--hal-text);
}

.hal-article__date::before {
  content: '·';
  margin-right: 6px;
}

/* Badges */
.hal-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  background: var(--hal-tag-bg);
  color: var(--hal-tag-color);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.hal-badge--oa {
  background: var(--hal-oa-bg);
  color: var(--hal-oa-color);
}

/* Details section (lvl >= 2) */
.hal-article__details {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--hal-border);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hal-article__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.hal-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.78rem;
  background: var(--hal-tag-bg);
  color: var(--hal-tag-color);
}

.hal-tag--domain {
  background: #e8f0fe;
  color: #1a56c4;
}

.hal-article__conference {
  font-size: 0.85rem;
  color: var(--hal-text-muted);
  font-style: italic;
}

.hal-article__abstract {
  font-size: 0.85rem;
  color: var(--hal-text);
  line-height: 1.55;
  margin-top: 4px;
}

.hal-article__link {
  font-size: 0.82rem;
  color: var(--hal-accent);
  text-decoration: none;
}

.hal-article__link:hover {
  text-decoration: underline;
}

/* Footer credit */
.hal-footer {
  margin-top: 12px;
  text-align: right;
  font-size: 0.75rem;
}

.hal-footer__link {
  color: var(--hal-text-muted);
  text-decoration: none;
}

.hal-footer__link:hover {
  color: var(--hal-accent);
  text-decoration: underline;
}

/* Pagination */
.hal-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--hal-border);
  font-size: 0.875rem;
}

.hal-pagination__info {
  color: var(--hal-text-muted);
}

.hal-pagination__btn {
  padding: 7px 16px;
  border: 1px solid var(--hal-border);
  border-radius: var(--hal-radius);
  background: var(--hal-bg);
  color: var(--hal-accent);
  font-size: 0.875rem;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.hal-pagination__btn:hover:not(:disabled) {
  background: #f0f4ff;
  border-color: var(--hal-accent);
}

.hal-pagination__btn:disabled {
  color: var(--hal-text-muted);
  cursor: not-allowed;
  opacity: 0.5;
}
`;

/** Injects the default CSS into <head> once. Idempotent — safe to call multiple times. */
export function injectDefaultStyles(): void {
  const ID = 'hal-search-styles';
  if (document.getElementById(ID)) return;
  const style = document.createElement('style');
  style.id = ID;
  style.textContent = DEFAULT_CSS;
  document.head.appendChild(style);
}
