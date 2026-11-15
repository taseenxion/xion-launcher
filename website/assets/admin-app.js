// Xion shop admin: orders inbox (payment proof, status, license key, chat), redeem codes and payment settings.
(() => {
  const $ = (s, r = document) => r.querySelector(s)
  const $$ = (s, r = document) => [...r.querySelectorAll(s)]
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const SYM = { USD: '$', BDT: '৳', INR: '₹' }
  const METHOD = { bkash: 'bKash', nagad: 'Nagad', upi: 'UPI', card: 'Card', free: 'Free code' }
  let token = sessionStorage.getItem('xa') || ''
  let cosToken = sessionStorage.getItem('xac') || ''
  let orders = [], sel = null, filter = 'all', seen = null
  let capeOrders = [], capeFilter = 'all', players = []
  const warn = () => { $('#storeWarn').hidden = false }

  const toast = (t, bad) => { const el = $('#toast'); el.textContent = t; el.className = 'toast show' + (bad ? ' bad' : ''); clearTimeout(toast.t); toast.t = setTimeout(() => el.className = 'toast', 2200) }
  async function api (body) {
    const r = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({ error: 'Network error' }))
    if (r.status === 401 && body.action !== 'login') { logout(); throw new Error(j.error) }
    if (!r.ok || j.error) { if (/not connected/i.test(j.error || '')) warn(); throw new Error(j.error || 'Error') }
    return j
  }

  // Cape store admin (same login, own session token)
  async function cosApi (body) {
    const r = await fetch('/api/cosmetics?r=admin', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cosToken }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({ error: 'Network error' }))
    if (r.status === 401 && body.action !== 'login') { cosToken = ''; sessionStorage.removeItem('xac'); throw new Error('Cape store: please log in again.') }
    if (!r.ok || j.error) { if (/not connected/i.test(j.error || '')) warn(); throw new Error(j.error || 'Error') }
    return j
  }
  async function cosLogin (user, pass) {
    const r = await cosApi({ action: 'login', user, pass })
    cosToken = r.token
    sessionStorage.setItem('xac', cosToken)
  }

  // ---------- login ----------
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault()
    $('#lErr').textContent = ''
    const btn = e.submitter; btn.disabled = true
    try {
      const r = await api({ action: 'login', user: $('#lUser').value, pass: $('#lPass').value })
      token = r.token; sessionStorage.setItem('xa', token)
      try { await cosLogin($('#lUser').value, $('#lPass').value) } catch {}
      $('#lPass').value = ''
      start()
    } catch (err) { $('#lErr').textContent = err.message } finally { btn.disabled = false }
  })
  function logout () { token = ''; sessionStorage.removeItem('xa'); $('#app').hidden = true; $('#login').hidden = false }
  $('#logout').addEventListener('click', logout)

  $('#tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]'); if (!b) return
    $$('#tabs button').forEach(x => x.classList.toggle('on', x === b))
    $$('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === b.dataset.tab))
    if (b.dataset.tab === 'codes') loadCodes()
    if (b.dataset.tab === 'settings') loadSettings()
    if (b.dataset.tab === 'capes') loadCapes()
    if (b.dataset.tab === 'users') loadUsers()
  })

  // ---------- orders ----------
  const ago = t => { const s = (Date.now() - t) / 1000; return s < 60 ? 'now' : s < 3600 ? Math.floor(s / 60) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : Math.floor(s / 86400) + 'd' }
  const amount = o => o.amount === 0 ? 'FREE' : SYM[o.currency] + o.amount
  async function loadOrders () {
    const r = await api({ action: 'orders' })
    orders = r.orders
    const fresh = orders.filter(o => o.unread).length
    $('#unread').hidden = !fresh; $('#unread').textContent = fresh
    document.title = (fresh ? `(${fresh}) ` : '') + 'Xion Admin'
    if (seen && orders.some(o => !seen.has(o.id))) notify(orders.filter(o => !seen.has(o.id)).length)
    seen = new Set(orders.map(o => o.id))
    const sum = cur => orders.filter(o => o.currency === cur && (o.status === 'done' || o.status === 'approved')).reduce((t, o) => t + o.amount, 0)
    $('#stats').innerHTML = `<span><b>${orders.length}</b> orders</span><span><b>${orders.filter(o => o.status === 'pending').length}</b> pending</span><span>Earned <b>$${sum('USD')}</b> · <b>৳${sum('BDT')}</b> · <b>₹${sum('INR')}</b></span>`
    renderList()
    if (sel) { const o = orders.find(x => x.id === sel); if (o) renderDetail(o, false) }
  }
  function notify (n) {
    toast(`${n} new order${n > 1 ? 's' : ''}!`)
    try { if (Notification.permission === 'granted') new Notification('Xion+', { body: `${n} new order${n > 1 ? 's' : ''} waiting`, icon: 'assets/logo.png' }) } catch {}
  }
  function renderList () {
    const list = orders.filter(o => filter === 'all' || o.status === filter)
    $('#orderList').innerHTML = list.length ? list.map(o => `
      <button class="orow ${o.id === sel ? 'on' : ''} ${o.unread ? 'unread' : ''}" data-id="${o.id}">
        <span class="st ${o.status}"></span>
        <span class="who"><b>${esc(o.ign)}</b><small>${esc(o.name)} · ${METHOD[o.method] || o.method}</small></span>
        <span class="amt"><b>${amount(o)}</b><small>${ago(o.created)}</small></span>
      </button>`).join('') : '<p class="muted center">No orders yet</p>'
  }
  $('#filters').addEventListener('click', e => {
    const b = e.target.closest('[data-f]'); if (!b) return
    filter = b.dataset.f; $$('#filters button').forEach(x => x.classList.toggle('on', x === b)); renderList()
  })
  $('#orderList').addEventListener('click', async e => {
    const b = e.target.closest('[data-id]'); if (!b) return
    sel = b.dataset.id
    const o = orders.find(x => x.id === sel)
    renderList(); renderDetail(o, true)
    if (o.unread) { try { const r = await api({ action: 'update', id: o.id, read: true }); Object.assign(o, r.order); loadOrders() } catch {} }
  })

  const fmtDevice = d => d.toUpperCase().match(/.{4}/g).join('-')
  function renderDetail (o, fresh) {
    const draft = fresh ? '' : ($('#reply') ? $('#reply').value : '')
    const keyDraft = fresh ? '' : ($('#keyIn') ? $('#keyIn').value : '')
    $('#detail').innerHTML = `
      <div class="d-head"><div><h2>${esc(o.ign)} <span class="badge ${o.status}">${o.status}</span></h2><p class="muted">${esc(o.name)} · ${new Date(o.created).toLocaleString()}</p></div><b class="big">${amount(o)}</b></div>
      <div class="grid">
        <div class="kv"><small>Gmail</small><span>${esc(o.email)}</span><button class="mini" data-copy="${esc(o.email)}">Copy</button></div>
        <div class="kv"><small>Device ID</small><span class="mono">${fmtDevice(o.device)}</span><button class="mini" data-copy="${fmtDevice(o.device)}">Copy</button></div>
        <div class="kv"><small>Paid with</small><span>${METHOD[o.method] || esc(o.method)}${o.code ? ` · code <b>${esc(o.code)}</b>` : ''}</span></div>
        ${o.method !== 'free' ? `<div class="kv"><small>${o.method === 'upi' ? 'UPI ID' : o.method === 'card' ? 'Payer' : 'From number'}</small><span class="mono">${esc(o.payer)}</span></div>
        <div class="kv"><small>Transaction ID</small><span class="mono">${esc(o.trx)}</span><button class="mini" data-copy="${esc(o.trx)}">Copy</button></div>` : ''}
      </div>
      ${o.shot ? '<div class="shot" id="shot"><button class="ghost" id="loadShot">Show payment screenshot</button></div>' : ''}
      <div class="actions">
        <button class="ok" data-status="approved">Payment OK</button>
        <button class="bad" data-status="rejected">Reject</button>
        <button class="ghost" data-status="pending">Back to pending</button>
        <button class="bad" id="delOrder" style="margin-left:auto">Delete order</button>
      </div>
      <div class="keybox">
        <label>License key <small>Make it in Xion Key Tool with the name, Gmail and Device ID above, then paste it here</small></label>
        ${o.key ? `<code>${esc(o.key)}</code>` : ''}
        <div class="row"><input id="keyIn" placeholder="XION-…" spellcheck="false" value="${esc(keyDraft)}"><button id="sendKey">${o.key ? 'Replace key' : 'Send key to buyer'}</button></div>
      </div>
      <div class="chat" id="chat">${o.messages.map(m => `<div class="msg ${m.from}"><p>${esc(m.text)}</p><small>${m.from === 'buyer' ? esc(o.ign) : m.from === 'admin' ? 'You' : 'System'} · ${new Date(m.at).toLocaleString()}</small></div>`).join('')}</div>
      <div class="row"><input id="reply" placeholder="Reply to ${esc(o.ign)}…" value="${esc(draft)}"><button id="sendReply">Send</button></div>`
    const chat = $('#chat'); chat.scrollTop = chat.scrollHeight
  }
  $('#detail').addEventListener('click', async e => {
    const o = orders.find(x => x.id === sel); if (!o) return
    const c = e.target.closest('[data-copy]')
    if (c) return navigator.clipboard.writeText(c.dataset.copy).then(() => toast('Copied'))
    const s = e.target.closest('[data-status]')
    if (s) return update({ id: o.id, status: s.dataset.status }, 'Status: ' + s.dataset.status)
    if (e.target.id === 'sendKey') {
      const key = $('#keyIn').value.trim(); if (!key) return toast('Paste the key first', true)
      return update({ id: o.id, key }, 'Key sent to buyer')
    }
    if (e.target.id === 'sendReply') return reply(o)
    if (e.target.id === 'delOrder') {
      if (!confirm(`Delete ${o.ign}'s order? This can't be undone.`)) return
      try { await api({ action: 'deleteOrder', id: o.id }); sel = null; $('#detail').innerHTML = '<p class="muted center">Order deleted</p>'; await loadOrders(); toast('Order deleted') } catch (err) { toast(err.message, true) }
      return
    }
    if (e.target.id === 'loadShot') {
      e.target.disabled = true; e.target.textContent = 'Loading…'
      try { const r = await api({ action: 'shot', id: o.id }); $('#shot').innerHTML = `<a href="${r.image}" target="_blank" rel="noopener"><img src="${r.image}" alt="Payment screenshot"></a>` } catch (err) { toast(err.message, true) }
    }
  })
  $('#detail').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'reply') reply(orders.find(x => x.id === sel)) })
  async function reply (o) {
    const text = $('#reply').value.trim(); if (!text) return
    await update({ id: o.id, reply: text }, 'Sent')
    $('#reply').value = ''
  }
  async function update (body, ok) {
    try {
      const r = await api({ action: 'update', ...body })
      const i = orders.findIndex(x => x.id === r.order.id); orders[i] = r.order
      renderList(); renderDetail(r.order, true); toast(ok)
    } catch (err) { toast(err.message, true) }
  }

  // ---------- codes ----------
  $('#cType').addEventListener('change', () => { $('#cValueWrap').hidden = $('#cType').value === 'free' })
  async function loadCodes () { try { renderCodes((await api({ action: 'codes' })).codes) } catch (e) { $('#cErr').textContent = e.message } }
  function renderCodes (codes) {
    $('#codeRows').innerHTML = codes.length ? codes.map(c => `<tr>
      <td class="mono"><b>${esc(c.code)}</b></td>
      <td>${c.type === 'free' ? '<span class="badge done">Free Xion+</span>' : c.value + '% off'}</td>
      <td>${c.uses || 0}${c.maxUses ? ' / ' + c.maxUses : ''}</td>
      <td><label class="sw"><input type="checkbox" data-toggle="${esc(c.code)}" ${c.active ? 'checked' : ''}><i></i></label></td>
      <td><button class="mini bad" data-del="${esc(c.code)}">Delete</button></td></tr>`).join('') : '<tr><td colspan="5" class="muted center">No codes yet</td></tr>'
    renderCodes.list = codes
  }
  $('#codeForm').addEventListener('submit', async e => {
    e.preventDefault(); $('#cErr').textContent = ''
    try {
      renderCodes((await api({ action: 'saveCode', code: $('#cCode').value, type: $('#cType').value, value: $('#cValue').value, maxUses: $('#cMax').value, active: true })).codes)
      $('#cCode').value = ''; toast('Code saved')
    } catch (err) { $('#cErr').textContent = err.message }
  })
  $('#codeRows').addEventListener('click', async e => {
    const d = e.target.closest('[data-del]')
    if (d) { if (!confirm(`Delete code ${d.dataset.del}?`)) return; renderCodes((await api({ action: 'deleteCode', code: d.dataset.del })).codes); return }
    const t = e.target.closest('[data-toggle]')
    if (t) {
      const c = renderCodes.list.find(x => x.code === t.dataset.toggle)
      renderCodes((await api({ action: 'saveCode', ...c, active: t.checked })).codes)
      toast(t.checked ? 'Code on' : 'Code off')
    }
  })

  // ---------- settings ----------
  async function loadSettings () {
    try {
      const s = (await api({ action: 'settings' })).settings
      $('#sBkash').value = s.bkash; $('#sNagad').value = s.nagad; $('#sUpi').value = s.upi; $('#sCard').value = s.cardLink; $('#sNote').value = s.note
    } catch (e) { $('#sErr').textContent = e.message }
  }
  $('#setForm').addEventListener('submit', async e => {
    e.preventDefault(); $('#sErr').textContent = ''
    try { await api({ action: 'saveSettings', bkash: $('#sBkash').value, nagad: $('#sNagad').value, upi: $('#sUpi').value, cardLink: $('#sCard').value, note: $('#sNote').value }); toast('Saved') } catch (err) { $('#sErr').textContent = err.message }
  })

  // ---------- cape orders ----------
  async function loadCapes () {
    $('#capeErr').textContent = ''
    try { capeOrders = (await cosApi({ action: 'orders' })).orders || [] } catch (e) { $('#capeErr').textContent = e.message; capeOrders = [] }
    renderCapes()
  }
  function renderCapes () {
    const list = capeOrders.filter(o => capeFilter === 'all' || o.status === capeFilter)
    $('#capeRows').innerHTML = list.length ? list.map(o => `<tr>
      <td><b>${esc(o.ign)}</b></td>
      <td class="muted">${esc((o.lines || []).map(l => l.name || l.id).join(', ') || '—')}</td>
      <td>${SYM[o.currency] || ''}${o.amount}${o.code ? ` <small class="muted">${esc(o.code)}</small>` : ''}</td>
      <td><span class="badge ${o.status}">${esc(o.status)}</span></td>
      <td class="nowrap"><button class="mini" data-cape-ok="${o.id}">Approve</button>
        <button class="mini" data-cape-no="${o.id}">Reject</button>
        <button class="mini bad" data-cape-del="${o.id}">Delete</button></td></tr>`).join('')
      : '<tr><td colspan="5" class="muted center">No cape orders yet</td></tr>'
  }
  $('#capeFilters').addEventListener('click', e => {
    const b = e.target.closest('[data-cf]'); if (!b) return
    capeFilter = b.dataset.cf; $$('#capeFilters button').forEach(x => x.classList.toggle('on', x === b)); renderCapes()
  })
  $('#capeRows').addEventListener('click', async e => {
    const ok = e.target.closest('[data-cape-ok]'), no = e.target.closest('[data-cape-no]'), del = e.target.closest('[data-cape-del]')
    try {
      if (ok) { await cosApi({ action: 'update', id: ok.dataset.capeOk, status: 'approved' }); toast('Order approved — items unlocked'); }
      if (no) { await cosApi({ action: 'update', id: no.dataset.capeNo, status: 'rejected' }); toast('Order rejected') }
      if (del) {
        if (!confirm('Delete this order? This cannot be undone.')) return
        await cosApi({ action: 'deleteOrder', id: del.dataset.capeDel }); toast('Order deleted')
      }
      if (ok || no || del) loadCapes()
    } catch (err) { $('#capeErr').textContent = err.message }
  })

  // ---------- users ----------
  async function loadUsers () {
    $('#userErr').textContent = ''
    try { players = (await cosApi({ action: 'players' })).players || [] } catch (e) { $('#userErr').textContent = e.message; players = [] }
    renderUsers()
  }
  function renderUsers () {
    const q = ($('#userSearch').value || '').trim().toLowerCase()
    const list = players.filter(p => !q || (p.display || p.name || '').toLowerCase().includes(q))
    $('#userRows').innerHTML = list.length ? list.map(p => `<tr>
      <td><b>${esc(p.display || p.name)}</b>${(p.gifts || []).length ? ' <small class="muted">gift</small>' : ''}</td>
      <td>${(p.owned || []).length}</td>
      <td class="muted">${esc(Object.values(p.equipped || {}).join(', ') || '—')}</td>
      <td class="muted">${p.created ? new Date(p.created).toLocaleDateString() : '—'}</td>
      <td class="nowrap"><button class="mini" data-grant="${esc(p.name)}">Grant</button>
        <button class="mini" data-revoke="${esc(p.name)}">Revoke</button>
        <button class="mini bad" data-reset="${esc(p.name)}">Reset key</button></td></tr>`).join('')
      : '<tr><td colspan="5" class="muted center">No accounts yet</td></tr>'
    return list
  }
  $('#userSearch').addEventListener('input', renderUsers)
  $('#userRows').addEventListener('click', async e => {
    const g = e.target.closest('[data-grant]'), r = e.target.closest('[data-revoke]'), rs = e.target.closest('[data-reset]')
    try {
      if (g) {
        const item = prompt('Cape or cosmetic id to grant (e.g. an_sunrise, hw_bat_wings):'); if (!item) return
        await cosApi({ action: 'grant', name: g.dataset.grant, item }); toast('Granted')
      }
      if (r) {
        const item = prompt('Cape or cosmetic id to take back:'); if (!item) return
        await cosApi({ action: 'revoke', name: r.dataset.revoke, item }); toast('Revoked')
      }
      if (rs) {
        if (!confirm('Reset this account key? The player will need to sign in again.')) return
        await cosApi({ action: 'resetKey', name: rs.dataset.reset }); toast('Key reset')
      }
      if (g || r || rs) loadUsers()
    } catch (err) { $('#userErr').textContent = err.message }
  })

  // ---------- start ----------
  let poll
  async function start () {
    $('#login').hidden = true; $('#app').hidden = false
    try { await loadOrders() } catch { return }
    clearInterval(poll); poll = setInterval(() => loadOrders().catch(() => {}), 20000)
    try { if (Notification.permission === 'default') Notification.requestPermission() } catch {}
  }
  if (token) start()
})()
