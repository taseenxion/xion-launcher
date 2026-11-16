// Xion account, launcher side. Same email/password account as the shop (xionx.vercel.app), so a
// purchase made on the web shows up here, and the cape equipped on the account is worn in game.
const API = 'https://xionx.vercel.app/api/account'

async function call (body) {
  let r
  try {
    r = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000)
    })
  } catch (e) {
    throw new Error('Could not reach the Xion server. Check your connection and try again.')
  }
  let j = {}
  try { j = await r.json() } catch {}
  if (!r.ok || j.error) throw new Error(j.error || `The Xion server answered ${r.status}.`)
  return j
}

const login = (email, pass) => call({ action: 'login', email, pass })
const signup = ({ email, pass, ign, name }) => call({ action: 'signup', email, pass, ign, name })
const me = token => call({ action: 'me', token }).then(r => r.account)
const equip = (token, slot, item) => call({ action: 'equip', token, slot, item }).then(r => r.account)
// Short-lived proof that this account owns Xion+, for the in-game presence call.
const pass = token => call({ action: 'pass', token }).then(r => r.pass || '')

module.exports = { login, signup, me, equip, pass }
