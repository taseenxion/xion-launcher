// Storage for the Xion website APIs: Vercel Blob, private store "xion-data" (connected to the xionx project).
// Keys keep their path names ("shop/orders/<id>.json", "store/players/<name>.json", ...).
// Binary files (payment screenshots) are stored as "<content-type>;<base64>" text.
const { put, get, list, del: blobDel } = require('@vercel/blob')

// Reads are uncached: an order, a code or a locker must reflect the write that just happened.
const READ = { access: 'private', useCache: false }
const WRITE = { access: 'private', allowOverwrite: true, addRandomSuffix: false }

const missing = e => e && (e.name === 'BlobNotFoundError' || e.statusCode === 404 || /not.?found/i.test(String(e.message)))

async function readText (key) {
  try {
    const r = await get(key, READ)
    if (!r || r.statusCode !== 200 || !r.stream) return null
    return await new Response(r.stream).text()
  } catch (e) {
    if (missing(e)) return null
    throw e
  }
}

async function readJSON (key, fallback = null) {
  const v = await readText(key)
  if (v == null) return fallback
  try { return JSON.parse(v) } catch { return fallback }
}

const writeJSON = (key, data) => put(key, JSON.stringify(data), { ...WRITE, contentType: 'application/json' })

async function readBytes (key) {
  const v = await readText(key)
  if (v == null) return null
  const i = v.indexOf(';')
  return { type: v.slice(0, i), data: Buffer.from(v.slice(i + 1), 'base64') }
}
const writeBytes = (key, buf, contentType) => put(key, contentType + ';' + Buffer.from(buf).toString('base64'), { ...WRITE, contentType: 'text/plain' })

// Every key under a prefix, as [{ pathname }] (same shape the callers already use).
async function listAll (prefix) {
  const out = []
  let cursor
  do {
    const page = await list({ prefix, limit: 1000, cursor, access: 'private' })
    for (const b of page.blobs) out.push({ pathname: b.pathname, url: b.url })
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)
  return out
}

// Blob deletes take URLs, so each key is looked up first (deletes are rare: admin only).
async function del (keys) {
  const ks = [].concat(keys)
  const urls = []
  for (const k of ks) {
    try {
      const page = await list({ prefix: k, limit: 10, access: 'private' })
      for (const b of page.blobs) if (b.pathname === k) urls.push(b.url)
    } catch {}
  }
  if (urls.length) await blobDel(urls, { access: 'private' }).catch(() => {})
  return urls.length
}

module.exports = { readJSON, writeJSON, readBytes, writeBytes, listAll, del }
