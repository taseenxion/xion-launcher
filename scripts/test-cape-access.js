#!/usr/bin/env node
// In-memory tests only: no account, purchase or Blob writes reach production.
const assert = require('assert/strict')
const path = require('path')
const root = path.resolve(__dirname, '..')
const accounts = new Map(), players = new Map(), wear = new Map()
const mock = (file, exports) => { const id = require.resolve(path.join(root, file)); require.cache[id] = { id, filename: id, loaded: true, exports } }
mock('website/lib/kv.js', {
  readJSON: async file => accounts.get(file), writeJSON: async (file, value) => accounts.set(file, value)
})
mock('website/lib/cos/_cos.js', {
  getPlayer: async ign => players.get(ign), savePlayer: async p => players.set(p.display, p), updateWear: async p => wear.set(p.display, { ...p.equipped })
})
const A = require('../website/lib/acc')
const C = require('../website/lib/cos/catalog')
const hd = C.ITEMS.filter(i => i.set === 'hd_originals')
assert.equal(hd.length, 8)
assert(hd.every(i => i.price.USD === 2.99 && i.price.BDT === 360 && i.price.INR === 240))
const account = { id: 'test', email: 'test@example.invalid', name: 'Test', ign: 'CapeTest', owned: ['xion_plus'], equipped: {} }
;(async () => {
  accounts.set('accounts/test.json', account)
  assert(hd.every(c => A.access(account).includes(c.id)))
  await A.equip(account, 'cape', hd[0].id)
  assert.equal(wear.get('CapeTest').cape, hd[0].id)
  assert(!account.owned.includes(hd[0].id), 'Membership access must not become a permanent purchase')
  assert(!players.get('CapeTest').owned.includes(hd[0].id), 'Membership must not permanently grant legacy locker items')
  await assert.rejects(() => A.equip({ ...account, owned: [], equipped: {} }, 'cape', hd[1].id), /do not own/)
  await A.equip(account, 'cape', '')
  assert(!wear.get('CapeTest').cape)
  await A.equip(account, 'cape', hd[1].id)
  await A.revokeItems('test', ['xion_plus'])
  assert(!A.canWear(account, hd[1].id) && !wear.get('CapeTest').cape, 'Refunded membership still grants capes')
  account.owned = [hd[2].id]
  assert(A.canWear(account, hd[2].id) && !A.canWear(account, hd[3].id))
  await A.equip(account, 'cape', hd[2].id)
  assert.equal(wear.get('CapeTest').cape, hd[2].id)
  console.log('PASS: approved prices, Xion+ access/equip, guest rejection, clearing, refunds and individual ownership')
})().catch(e => { console.error(e); process.exitCode = 1 })
