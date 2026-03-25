import { parseParams, renderHalSearch } from '../src/render';

export default {
  async fetch(req: Request) {
    const url = new URL(req.url);
    const params = parseParams(url.searchParams);

    // SVG requests are handled by the /api/svg route
    if (params.output === 'svg') {
      return new Response(null, {
        status: 302,
        headers: { Location: `/api/svg${url.search}` },
      });
    }

    const result = await renderHalSearch(params);

    if (typeof result === 'string') {
      return new Response(result, {
        headers: { 'Content-Type': 'text/html;charset=utf-8' },
      });
    }

    // Include HalSearch's head content (already contains <style> tags) before the rendered HTML
    const content = (result.head || '') + result.html;

    return new Response(content, {
      headers: { 'Content-Type': 'text/html;charset=utf-8' },
    });
  },
};
