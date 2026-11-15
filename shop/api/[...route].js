// Same-origin bridge to the Xion API on xionx.vercel.app, so the shop never depends on CORS
// and the buyer's browser only ever talks to its own origin. Every path and query string is
// forwarded as-is: /api/shop, /api/cosmetics?r=shop, /api/cosmetics?r=locker, ...
const UPSTREAM = 'https://xionx.vercel.app'

module.exports = async (req, res) => {
  const body = req.method === 'GET' || req.method === 'HEAD'
    ? undefined
    : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}))
  try {
    const r = await fetch(UPSTREAM + req.url, {
      method: req.method,
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': String(req.headers['x-forwarded-for'] || ''),
        ...(req.headers.authorization ? { authorization: req.headers.authorization } : {})
      },
      body
    })
    const text = await r.text()
    res.status(r.status)
      .setHeader('content-type', r.headers.get('content-type') || 'application/json; charset=utf-8')
      .setHeader('cache-control', 'no-store')
      .send(text)
  } catch {
    res.status(502).setHeader('cache-control', 'no-store').json({ error: 'The Xion server is unreachable right now. Try again in a moment.' })
  }
}
