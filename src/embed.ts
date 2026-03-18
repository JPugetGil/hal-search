import type { DetailLevel } from './types';

export interface EmbedOptions {
  /** Base URL where embed.html is hosted */
  embedBase: string;
  /** Search query or author UID */
  uid: string;
  /** Detail level 0-3 */
  lvl?: DetailLevel;
  /** Results per page */
  rows?: number;
  /** iframe width (CSS value) */
  width?: string;
  /** iframe height (CSS value) */
  height?: string;
}

/** Builds the URL for the embeddable page with query parameters. */
export function buildEmbedUrl(options: EmbedOptions): string {
  const params = new URLSearchParams({ uid: options.uid });
  if (options.lvl !== undefined) params.set('lvl', String(options.lvl));
  if (options.rows !== undefined) params.set('rows', String(options.rows));
  return `${options.embedBase}/embed.html?${params.toString()}`;
}

/** Returns a ready-to-paste `<iframe>` HTML snippet. */
export function buildEmbedSnippet(options: EmbedOptions): string {
  const src = buildEmbedUrl(options);
  const width = options.width ?? '100%';
  const height = options.height ?? '600';
  return `<iframe src="${src}" width="${width}" height="${height}" frameborder="0" style="border:none;"></iframe>`;
}
