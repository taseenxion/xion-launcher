// Xion accounts: email + password, one per player, linked to their Minecraft name.
// Purchases are granted to the account, and the account's equipped cosmetics are published to the
// public wear index so Xion Client shows them in game — and to the launcher, which is signed in too.
//
// Stored in the same Blob store as the rest of the shop:
//   accounts/<id>.json          { id, email, name, ign, pass, created, owned[], equipped{}, orders[] }
//   accounts/e/<hash>.json      { id, email }   (email → account, so sign-in is one read)
const crypto = require('crypto')
const kv = require('./kv')

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const IGN = /^[A-Za-z0-9_]{3,16}$/
const SLOTS = ['cape', 'hat', 'wings', 'aura']
const NS = 'accounts/'
const MAX_ORDERS = 40

const id = () => crypto.randomBytes(9).toString('hex')
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex')
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y) }
const accPath = i => NS + i + '.json'
const mailPath = email => NS + 'e/' + sha(String(email).trim().toLowerCase()).slice(0, 40) + '.json'
const get = i => kv.readJSON(accPath(i))
const save = a => kv.writeJSON(accPath(a.id), a)

// ── passwords ──
function hashPass (pass) {
  const salt = crypto.randomBytes(16).toString('hex')
  return salt + ':' + crypto.scryptSync(String(pass), salt, 32).toString('hex')
}
function checkPass (pass, stored) {
  const [salt, hash] = String(stored || '').split(':')
  if (!salt || !hash) return false
  return safeEq(crypto.scryptSync(String(pass), salt, 32).toString('hex'), hash)
}

// ── sessions: signed "acc.<id>.<expiry>.<sig>" tokens, valid 30 days ──
const secret = () => process.env.SESSION_SECRET || ''
function tokenFor (accountId) {
  const body = `acc.${accountId}.${Date.now() + 30 * 24 * 3600 * 1000}`
  return body + '.' + crypto.createHmac('sha256', secret()).update(body).digest('hex')
}
function idFromToken (tok) {
  const p = String(tok || '').trim().split('.')
  if (p.length !== 4 || p[0] !== 'acc' || !secret()) return null
  const body = p[0] + '.' + p[1] + '.' + p[2]
  const want = crypto.createHmac('sha256', secret()).update(body).digest('hex')
  if (!safeEq(want, p[3]) || +p[2] < Date.now()) return null
  return p[1]
}

// ── rate limiting for sign-in (per warm instance, so it costs no storage reads) ──
const tries = new Map()
function limited (key, max, windowMs) {
  const now = Date.now()
  const hits = (tries.get(key) || []).filter(t => now - t < windowMs)
  if (hits.length >= max) return true
  hits.push(now)
  if (tries.size > 5000) tries.clear()
  tries.set(key, hits)
  return false
}

const clean = (v, max) => String(v == null ? '' : v).trim().slice(0, max)
const view = a => ({
  id: a.id, email: a.email, name: a.name, ign: a.ign, created: a.created,
  owned: a.owned || [], equipped: a.equipped || {}, orders: (a.orders || []).slice(0, MAX_ORDERS)
})

async function signup ({ email, pass, ign, name }) {
  email = clean(email, 120).toLowerCase()
  ign = clean(ign, 16)
  name = clean(name, 40) || ign
  if (!EMAIL.test(email)) throw new Error('Enter a valid email address.')
  if (String(pass || '').length < 6) throw new Error('Use a password with at least 6 characters.')
  if (!IGN.test(ign)) throw new Error('Minecraft name must be 3–16 letters, numbers or _.')
  const existing = await kv.readJSON(mailPath(email))
  if (existing) throw new Error('An account already uses that email. Sign in instead.')
  // One account per Minecraft name: that is who the cosmetics are published for in game.
  const taken = await findByIgn(ign)
  if (taken && taken.email !== email) throw new Error('That Minecraft name is already linked to another Xion account.')
  const a = { id: id(), email, name, ign, pass: hashPass(pass), created: Date.now(), owned: [], equipped: {}, orders: [] }
  await save(a)
  await kv.writeJSON(mailPath(email), { id: a.id, email, ign })
  return { token: tokenFor(a.id), account: view(a) }
}

async function login ({ email, pass }) {
  email = clean(email, 120).toLowerCase()
  const key = 'acc/login-' + sha(email).slice(0, 24)
  if (limited(key, 10, 15 * 60 * 1000)) throw new Error('Too many tries. Wait a few minutes and try again.')
  const ref = await kv.readJSON(mailPath(email))
  const a = ref && await get(ref.id)
  if (!a || !checkPass(pass, a.pass)) {
    await new Promise(r => setTimeout(r, 400))
    throw new Error('Wrong email or password.')
  }
  return { token: tokenFor(a.id), account: view(a) }
}

async function findByIgn (ign) {
  const list = await kv.listAll(NS)
  const files = list.map(x => x.pathname).filter(p => /^accounts\/[0-9a-f]{18}\.json$/.test(p))
  const all = (await Promise.all(files.map(p => kv.readJSON(p)))).filter(Boolean)
  return all.find(a => a.ign.toLowerCase() === String(ign).toLowerCase()) || null
}

async function fromToken (tok) {
  const accountId = idFromToken(tok)
  return accountId ? get(accountId) : null
}

async function addOrder (a, o) {
  if (!a) return
  a.orders = [{ ...o, at: Date.now() }, ...(a.orders || []).filter(x => !(x.id === o.id && x.kind === o.kind))].slice(0, MAX_ORDERS)
  await save(a)
}

// Mirrors an account's ownership onto the public player record, so the game sees it.
async function publishPlayer (a) {
  const S = require('./cos/_cos')
  let p = await S.getPlayer(a.ign)
  if (!p) p = { name: a.ign.toLowerCase(), display: a.ign, keyHash: '', owned: [], equipped: {}, created: Date.now() }
  p.display = a.ign
  p.accountId = a.id
  p.owned = [...new Set([...(p.owned || []), ...(a.owned || [])])]
  p.equipped = { ...(p.equipped || {}) }
  for (const s of SLOTS) {
    if (a.equipped && a.equipped[s] && p.owned.includes(a.equipped[s])) p.equipped[s] = a.equipped[s]
    else if (p.equipped[s] && !p.owned.includes(p.equipped[s])) delete p.equipped[s]
  }
  await S.savePlayer(p)
  await S.updateWear(p)
  return p
}

async function equip (a, slot, item) {
  if (!SLOTS.includes(slot)) throw new Error('Unknown slot.')
  a.equipped = a.equipped || {}
  if (!item) delete a.equipped[slot]
  else {
    const C = require('./cos/catalog')
    const it = C.byId(item)
    if (!it || it.type !== slot) throw new Error('That item does not go there.')
    if (!(a.owned || []).includes(item)) throw new Error('You do not own that item yet.')
    a.equipped[slot] = item
  }
  await save(a)
  await publishPlayer(a)
  return view(a)
}

// Called by the admin panel when an order is approved: the items go to the account, and the
// account's owner then has them in the launcher and in game.
async function grantItems (accountId, ign, items) {
  const a = accountId && await get(accountId)
  if (!a) return null
  a.owned = [...new Set([...(a.owned || []), ...items])]
  a.equipped = a.equipped || {}
  const C = require('./cos/catalog')
  for (const i of items) {
    const it = C.byId(i)
    if (it && it.type && !a.equipped[it.type]) a.equipped[it.type] = i
  }
  await save(a)
  await publishPlayer(a)
  return view(a)
}

module.exports = { signup, login, fromToken, addOrder, equip, grantItems, publishPlayer, view, idFromToken, findByIgn, EMAIL, IGN, SLOTS }
