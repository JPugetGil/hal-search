import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createServer as createViteServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function createServer() {
  const app = express();
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom',
  });

  app.use(vite.middlewares);

  app.use('*', async (req, res, next) => {
    const url = req.originalUrl;
    
    // Parse parameters
    const params = new URLSearchParams(url.includes('?') ? url.split('?')[1] : '');
    const output = params.get('output') || 'html'; // 'html' or 'svg'

    try {
      // 1. Read template
      let template = fs.readFileSync(
        path.resolve(__dirname, 'index.html'),
        'utf-8'
      );

      // 2. Transform template with Vite
      template = await vite.transformIndexHtml(url, template);

      // 3. Load server entry
      const { render } = await vite.ssrLoadModule('/src/entry-server.ts');

      // 4. Render app HTML
      const renderResult = await render(url, params);

      if (output === 'svg') {
        res.status(200).set({ 'Content-Type': 'image/svg+xml' }).end(renderResult);
      } else {
        // renderResult is { html, head } — inject styles into <head> and content into body
        let html = template.replace(`<!--ssr-outlet-->`, renderResult.html);
        if (renderResult.head) {
          html = html.replace(`</head>`, `${renderResult.head}</head>`);
        }
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      }
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });

  app.listen(5173, () => {
    console.log('http://localhost:5173');
  });
}

createServer();