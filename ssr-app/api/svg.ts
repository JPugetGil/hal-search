import { defineHandler } from 'nitro/h3';
import { parseParams, renderHalSearch } from '../src/render';

export default defineHandler(async (event) => {
  const url = new URL(event.req.url!, `http://${event.req.headers.get('host') || 'localhost'}`);
  const params = parseParams(url.searchParams);
  params.output = 'svg';

  const result = await renderHalSearch(params);
  const svg = typeof result === 'string'
    ? result
    : '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="50"><rect width="100%" height="100%" fill="#eee"/><text x="10" y="30" fill="red">Unexpected error</text></svg>';

  return new Response(svg, {
    headers: { 'Content-Type': 'image/svg+xml' },
  });
});
