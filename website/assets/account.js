// Xion account panel on the main site: the same email/password as xion-shop.vercel.app and the
// launcher. Sign in here to see what you own and to wear it.
(() => {
  const $ = (s, r = document) => r.querySelector(s)
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const SYM = { USD: '$', BDT: '৳', INR: '₹' }
  const K = 'xion-acc'
  const ls = () => { try { return JSON.parse(localStorage.getItem(K)) || null } catch { return null } }
  const setLs = v => { try { v ? localStorage.setItem(K, JSON.stringify(v)) : localStorage.removeItem(K) } catch {} }
  let acc = ls()
  let mode = 'in'
  let items = []

  async function api (body) {
    const r = await fetch('/api/account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || j.error) throw new Error(j.error || 'Something went wrong.')
    return j
  }

  const css = document.createElement('style')
  css.textContent = `
    .accx { position: fixed; inset: 0; z-index: 80; display: none; }
    .accx.open { display: grid; place-items: center; }
    .accx-back { position: absolute; inset: 0; background: rgba(4,6,12,.82); backdrop-filter: blur(8px); }
    .accx-card { position: relative; width: min(520px, calc(100vw - 24px)); max-height: 88vh; overflow-y: auto; padding: 24px;
      border-radius: 18px; border: 1px solid rgba(255,255,255,.12); background: linear-gradient(180deg,#0d1220,#070a12);
      color: #e8ecf4; box-shadow: 0 40px 120px -40px #000; font-family: var(--body, system-ui, sans-serif); }
    .accx-card h3 { font-size: 18px; margin: 0 0 4px; }
    .accx-card .sub { color: #8b96ab; font-size: 13px; line-height: 1.55; margin: 0 0 16px; }
    .accx-x { position: absolute; top: 14px; right: 14px; width: 32px; height: 32px; border-radius: 50%; border: 1px solid rgba(255,255,255,.14);
      background: rgba(255,255,255,.06); color: inherit; cursor: pointer; }
    .accx-tabs { display: inline-flex; gap: 4px; padding: 4px; border-radius: 10px; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.03); margin-bottom: 14px; }
    .accx-tabs button { font: inherit; font-size: 12px; color: #8b96ab; background: none; border: 0; border-radius: 7px; padding: 7px 13px; cursor: pointer; }
    .accx-tabs button.on { background: rgba(255,255,255,.09); color: #fff; }
    .accx-form { display: grid; gap: 10px; }
    .accx-form label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: #8b96ab; }
    .accx-form input { font: inherit; font-size: 13px; color: #e8ecf4; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12); border-radius: 9px; padding: 10px 12px; outline: 0; }
    .accx-form input:focus { border-color: rgba(140,170,255,.6); }
    .accx-btn { font: inherit; font-size: 13px; font-weight: 600; color: #080b12; background: linear-gradient(120deg,#dbe4ff,#a8bdff); border: 0; border-radius: 10px; padding: 11px 16px; cursor: pointer; }
    .accx-btn.ghost { background: rgba(255,255,255,.05); color: #e8ecf4; border: 1px solid rgba(255,255,255,.14); font-weight: 500; }
    .accx-btn[disabled] { opacity: .6; cursor: default; }
    .accx-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
    .accx-err { color: #fb7185; font-size: 12px; min-height: 15px; margin: 8px 0 0; }
    .accx-who { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 14px; }
    .accx-who b { display: block; font-size: 15px; }
    .accx-who small { color: #8b96ab; font-size: 12px; display: block; margin-top: 3px; }
    .accx-stats { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; padding: 11px 13px; border: 1px solid rgba(255,255,255,.1);
      border-radius: 10px; background: rgba(255,255,255,.03); font-size: 12px; color: #8b96ab; margin-bottom: 14px; }
    .accx-stats b { color: #fff; }
    .accx-slot { margin-bottom: 12px; }
    .accx-slot h4 { font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: #8b96ab; margin: 0 0 7px; }
    .accx-chips { display: flex; flex-wrap: wrap; gap: 7px; }
    .accx-chips button { font: inherit; font-size: 11.5px; color: #8b96ab; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.12);
      border-radius: 999px; padding: 6px 11px; cursor: pointer; }
    .accx-chips button.on { background: linear-gradient(120deg,#dbe4ff,#a8bdff); color: #080b12; border-color: transparent; font-weight: 600; }
    .accx-fine { color: #6b768a; font-size: 11.5px; line-height: 1.5; margin: 12px 0 0; }
    .accx-fine a { color: #a8bdff; }
  `
  document.head.appendChild(css)

  const modal = document.createElement('div')
  modal.className = 'accx'
  modal.innerHTML = '<div class="accx-back" data-close></div><div class="accx-card" role="dialog" aria-modal="true"><button class="accx-x" data-close aria-label="Close">✕</button><div id="accxBody"></div></div>'
  document.body.appendChild(modal)
  modal.addEventListener('click', e => { if (e.target.closest('[data-close]')) close() })
  addEventListener('keydown', e => { if (e.key === 'Escape') close() })
  const open = () => { modal.classList.add('open'); paint() }
  const close = () => modal.classList.remove('open')

  const SLOTS = [['cape', 'Cape'], ['hat', 'Hat'], ['wings', 'Wings'], ['aura', 'Aura']]
  const byId = id => items.find(i => i.id === id)

  async function loadCatalog () {
    if (items.length) return
    try {
      const r = await fetch('/api/cosmetics?r=shop')
      const j = await r.json()
      items = (j.items || []).concat(j.bundles || [])
    } catch {}
  }

  function paint () {
    const body = $('#accxBody')
    if (!acc || !acc.token) {
      const up = mode === 'up'
      body.innerHTML = `<h3>Your Xion account</h3>
        <p class="sub">One login for the shop, the launcher and the game. Cosmetics you buy are tied to your Minecraft name.</p>
        <div class="accx-tabs"><button data-mode="in" class="${up ? '' : 'on'}">Sign in</button><button data-mode="up" class="${up ? 'on' : ''}">Create account</button></div>
        <div class="accx-form">
          <label>Email<input id="axEmail" type="email" placeholder="you@gmail.com" autocomplete="email" spellcheck="false"></label>
          <label>Password<input id="axPass" type="password" placeholder="At least 6 characters" autocomplete="${up ? 'new-password' : 'current-password'}"></label>
          ${up ? '<label>Minecraft name<input id="axIgn" placeholder="Steve" spellcheck="false"></label><label>Display name (optional)<input id="axName" placeholder="Your name"></label>' : ''}
        </div>
        <div class="accx-row"><button class="accx-btn" id="axGo">${up ? 'Create my account' : 'Sign in'}</button>
          <a class="accx-btn ghost" href="https://xion-shop.vercel.app" style="text-decoration:none;display:inline-flex;align-items:center">Open the shop</a></div>
        <p class="accx-err" id="axErr"></p>
        <p class="accx-fine">Buying with the same email on the shop unlocks the items here and in the launcher, on the Minecraft name you enter.</p>`
      $('.accx-tabs', body).addEventListener('click', e => {
        const b = e.target.closest('[data-mode]'); if (!b) return
        mode = b.dataset.mode; paint()
      })
      $('#axGo', body).addEventListener('click', submit)
      body.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') submit() })
      return
    }
    loadCatalog().then(() => { if (modal.classList.contains('open')) paintSigned() })
    paintSigned()
  }

  function paintSigned () {
    const body = $('#accxBody')
    const own = acc.access || acc.owned || []
    body.innerHTML = `<div class="accx-who"><div><b>${esc(acc.name || acc.ign)}</b><small>${esc(acc.email)} · linked to <b style="display:inline;color:#fff">${esc(acc.ign)}</b></small></div>
        <button class="accx-btn ghost" id="axOut">Sign out</button></div>
      <div class="accx-stats"><span><b>${own.length}</b> cosmetic${own.length === 1 ? '' : 's'} owned</span><span>Equipped cape: <b>${esc((byId((acc.equipped || {}).cape) || {}).name || 'none')}</b></span></div>
      ${SLOTS.map(([slot, label]) => {
        const list = own.map(byId).filter(i => i && i.type === slot && !i.items)
        const worn = (acc.equipped || {})[slot]
        return `<div class="accx-slot"><h4>${label}</h4><div class="accx-chips">
          <button data-slot="${slot}" data-item="" class="${!worn ? 'on' : ''}">None</button>
          ${list.map(i => `<button data-slot="${slot}" data-item="${esc(i.id)}" class="${worn === i.id ? 'on' : ''}">${esc(i.name)}</button>`).join('')}
          ${list.length ? '' : '<span style="font-size:11.5px;color:#5c667a">Nothing owned here yet.</span>'}
        </div></div>`
      }).join('')}
      <p class="accx-fine">What you wear here shows on your name for every Xion Client player, and the launcher picks it up when you are signed in there. <a href="https://xion-shop.vercel.app" target="_blank" rel="noopener">Buy more in the shop →</a></p>`
    $('#axOut', body).addEventListener('click', () => { acc = null; setLs(null); paintBtn(); paint() })
    body.addEventListener('click', async e => {
      const b = e.target.closest('[data-slot]')
      if (!b) return
      b.disabled = true
      try {
        const r = await api({ action: 'equip', token: acc.token, slot: b.dataset.slot, item: b.dataset.item })
        acc = { ...acc, ...r.account }
        setLs(acc)
        paintSigned()
      } catch (x) { b.disabled = false; alert(x.message) }
    })
  }

  async function submit () {
    const err = $('#axErr')
    const email = $('#axEmail')?.value.trim()
    const pass = $('#axPass')?.value
    if (!email || !pass) { if (err) err.textContent = 'Enter your email and password.'; return }
    const btn = $('#axGo'); if (btn) btn.disabled = true
    try {
      const r = await api(mode === 'up'
        ? { action: 'signup', email, pass, ign: $('#axIgn')?.value.trim(), name: $('#axName')?.value.trim() }
        : { action: 'login', email, pass })
      acc = { ...r.account, token: r.token }
      setLs(acc)
      paintBtn()
      paint()
    } catch (e) {
      if (err) err.textContent = e.message
      if (btn) btn.disabled = false
    }
  }

  function paintBtn () {
    const b = $('#accBtn')
    if (!b) return
    b.innerHTML = acc && acc.token
      ? `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6"/></svg>${esc(acc.ign)}`
      : `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6"/></svg>Sign in`
  }

  const btn = $('#accBtn')
  if (btn) {
    btn.addEventListener('click', e => { e.preventDefault(); open() })
    paintBtn()
    if (location.hash === '#account') open()
    if (acc && acc.token) {
      api({ action: 'me', token: acc.token }).then(r => { acc = { ...acc, ...r.account }; setLs(acc); paintBtn() }).catch(() => {})
    }
  }
})()
