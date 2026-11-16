// Xion account API, one function for the shop, the website and the launcher:
//   signup {email, pass, ign, name?}   create an account and stay signed in
//   login  {email, pass}               sign back in
//   me     {token}                     profile: owned cosmetics, what is equipped, order list
//   equip  {token, slot, item}         wear something you own (item "" takes it off)
//   orders {token}                     just the order list
const A = require('../lib/acc')

const send = (res, status, data) => { res.status(status).setHeader('Cache-Control', 'no-store'); res.json(data) }

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' })
    const b = req.body || {}
    const action = String(b.action || '')

    if (action === 'signup') return send(res, 200, await A.signup(b))
    if (action === 'login') return send(res, 200, await A.login(b))

    const a = await A.fromToken(b.token)
    if (!a) return send(res, 401, { error: 'Please sign in again.' })

    if (action === 'me') return send(res, 200, { account: A.view(a) })
    if (action === 'orders') return send(res, 200, { orders: A.view(a).orders })
    if (action === 'equip') return send(res, 200, { account: await A.equip(a, String(b.slot || ''), String(b.item || '')) })

    return send(res, 400, { error: 'Unknown action' })
  } catch (e) {
    if (/valid|already|Wrong|Too many|own|goes there|Unknown slot/.test(String(e && e.message))) return send(res, 400, { error: e.message })
    console.error(e)
    return send(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
