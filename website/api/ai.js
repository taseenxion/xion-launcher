// XION AI proxy. The Gemini key stays in Vercel's encrypted GEMINI_API_KEY variable instead of
// being shipped inside every public client jar.
//   POST { contents: [{ role: "user"|"model", parts: [{ text }] }] }
// Shared Gemini capacity can reject one request and accept the next seconds later. Try the lighter
// model again after the larger fallback so players rarely need to press Retry themselves.
const MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-3.1-flash-lite']
const SYSTEM = [
  'You are XION AI, the friendly assistant built into Xion Launcher and Xion Client.',
  'You can answer anything: Minecraft tips, building ideas, redstone, servers, or general questions.',
  'Be warm, clear and practical. Prefer short paragraphs and simple bullet lines.',
  'You cannot change the player’s game, cosmetics or account; point them to the right Xion Launcher tab or Xion menu tab instead.',
  'Never claim to run commands inside their game.'
].join(' ')
const WINDOW = 10 * 60 * 1000
const MAX_HITS = 30
const hits = new Map()

const send = (res, status, body) => {
  res.status(status)
  res.setHeader('Cache-Control', 'no-store')
  res.json(body)
}

function limited (req) {
  const ip = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown').split(',')[0].trim()
  const now = Date.now()
  const recent = (hits.get(ip) || []).filter(t => now - t < WINDOW)
  if (recent.length >= MAX_HITS) return true
  recent.push(now)
  if (hits.size > 5000) hits.clear()
  hits.set(ip, recent)
  return false
}

function cleanContents (input) {
  if (!Array.isArray(input) || !input.length) return null
  const out = []
  let chars = 0
  for (const turn of input.slice(-16)) {
    const role = turn && turn.role
    const text = turn && Array.isArray(turn.parts) && turn.parts[0] && turn.parts[0].text
    if ((role !== 'user' && role !== 'model') || typeof text !== 'string') return null
    const clean = text.replace(/\r/g, '').trim().slice(0, role === 'user' ? 600 : 6000)
    if (!clean) continue
    chars += clean.length
    if (chars > 14000) return null
    out.push({ role, parts: [{ text: clean }] })
  }
  return out.length && out[out.length - 1].role === 'user' ? out : null
}

async function ask (model, contents, key) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents,
      generationConfig: {
        temperature: 0.8,
        topP: 0.95,
        maxOutputTokens: 900,
        thinkingConfig: { thinkingBudget: 0 }
      }
    }),
    signal: AbortSignal.timeout(7000)
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const e = new Error((body.error && body.error.message) || `Gemini answered ${response.status}`)
    e.status = response.status
    throw e
  }
  const text = body.candidates && body.candidates[0] && body.candidates[0].content &&
    body.candidates[0].content.parts && body.candidates[0].content.parts.some(p => typeof p.text === 'string' && p.text.trim())
  if (!text) throw new Error('Gemini returned an empty answer')
  return body
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: { message: 'Method not allowed' } })
  if (limited(req)) return send(res, 429, { error: { message: 'XION AI is busy for you right now. Try again in a few minutes.' } })
  const contents = cleanContents(req.body && req.body.contents)
  if (!contents) return send(res, 400, { error: { message: 'That conversation could not be sent.' } })
  const key = process.env.GEMINI_API_KEY
  if (!key) return send(res, 503, { error: { message: 'XION AI is not configured yet.' } })

  let last
  for (const model of MODELS) {
    try {
      return send(res, 200, await ask(model, contents, key))
    } catch (e) {
      last = e
      if (e.status === 401 || e.status === 403) break
    }
  }
  console.warn('[XION AI]', last && last.message)
  const status = last && (last.status === 401 || last.status === 403) ? 503 : (last && last.status === 429 ? 429 : 503)
  return send(res, status, { error: { message: status === 429 ? 'XION AI is popular right now. Try again shortly.' : 'XION AI is temporarily unavailable.' } })
}
