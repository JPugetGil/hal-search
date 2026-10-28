// hal-search SVG image service: thin Express adapter around `handleRequest` (src/render.ts).
//
// - `npm run dev`                       Vite dev mode: src/render.ts and the library sources (../src) are
//                                       loaded on the fly, edits apply on the next request.
// - `npm run build && npm run preview`  production mode: the self-contained bundle dist/server/render.js.
// - Vercel (Express preset)             imports this file and serves its default export; NODE_ENV is
//                                       'production' and VERCEL is set, so it never calls listen().
import express from 'express'

const isProduction = process.env.NODE_ENV === 'production' || process.argv.includes('--production')
const port = Number(process.env.PORT) || 5173

/** @type {() => Promise<typeof import('./src/render.ts')>} */
let loadRender
if (isProduction) {
  // Literal specifier: Vercel's file tracing ships the bundle with the function.
  const render = await import('./dist/server/render.js')
  loadRender = async () => render
} else {
  // Non-literal specifier: keeps Vite (a devDependency) out of Vercel's function bundle.
  const viteModule = 'vite'
  const { createServer } = await import(viteModule)
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  })
  loadRender = () => vite.ssrLoadModule('/src/render.ts')
}

const app = express()
app.disable('x-powered-by')

app.use(async (req, res, next) => {
  try {
    const { handleRequest, toSsrRequest } = await loadRender()
    // toSsrRequest reads the target as a path: resolved against a base URL, a leading `//` would be a host.
    const result = await handleRequest(toSsrRequest(req.method, req.originalUrl))
    res.status(result.status).set(result.headers).send(result.body)
  } catch (err) {
    next(err)
  }
})

// Last resort: never send stack traces or internal details to clients.
app.use((err, _req, res, _next) => {
  console.error('[hal-search-ssr] unhandled error', err)
  if (res.headersSent) return
  res
    .status(500)
    .set({
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    .send('Internal error')
})

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`hal-search SVG service (${isProduction ? 'production' : 'dev'}) on http://localhost:${port}`)
  })
}

export default app
