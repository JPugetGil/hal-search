import fs from 'node:fs/promises'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

// Polyfill require for JSDOM in ESM build environments (like Vercel)
const require = createRequire(import.meta.url)
globalThis.require = require

// Constants
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isProduction = process.env.NODE_ENV === 'production'
const port = process.env.PORT || 5173
const base = process.env.BASE || '/'

// Cached production assets
const templateHtml = isProduction
  ? await fs.readFile(path.resolve(__dirname, './dist/client/index.html'), 'utf-8')
  : ''

// Create http server
const app = express()

// Add Vite or respective production middlewares
let vite
if (!isProduction) {
  const { createServer } = await import('vite')
  vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    base
  })
  app.use(vite.middlewares)
} else {
  const compression = (await import('compression')).default
  const sirv = (await import('sirv')).default
  app.use(compression())
  app.use(base, sirv(path.resolve(__dirname, './dist/client'), { extensions: [] }))
}

// Serve HTML
app.use(async (req, res) => {
  try {
    const url = req.originalUrl.replace(base, '')

    let template
    let render
    if (!isProduction) {
      // Always read fresh template in development
      template = await fs.readFile(path.resolve(__dirname, './index.html'), 'utf-8')
      template = await vite.transformIndexHtml(url, template)
      render = (await vite.ssrLoadModule('/src/render.ts')).renderHalSearch
    } else {
      template = templateHtml
      render = (await import('./dist/server/render.js')).renderHalSearch
    }

    const { parseParams } = await (isProduction 
      ? import('./dist/server/render.js') 
      : vite.ssrLoadModule('/src/render.ts'))

    // Parse URL params
    const searchParams = new URLSearchParams(req.url.split('?')[1])
    const renderParams = parseParams(searchParams)

    // Render the app
    const rendered = await render(renderParams)

    if (renderParams.output === 'svg' && typeof rendered === 'string') {
      res.setHeader('Content-Type', 'image/svg+xml')
      return res.status(200).end(rendered)
    }

    // output HTML
    if (typeof rendered !== 'string') {
        const html = template
        .replace(`<!--ssr-head-->`, rendered.head ?? '')
        .replace(`<!--ssr-outlet-->`, rendered.html ?? '')

        res.status(200).set({ 'Content-Type': 'text/html' }).end(html)
    } else {
        res.status(200).set({ 'Content-Type': 'text/html' }).end(rendered)
    }
    
  } catch (e) {
    vite?.ssrFixStacktrace(e)
    console.log(e.stack)
    res.status(500).end(e.stack)
  }
})

// Start http server
app.listen(port, () => {
  console.log(`Server started at http://localhost:${port}`)
})