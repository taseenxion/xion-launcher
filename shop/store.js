// Xion Shop buying flow: cart → bKash/Nagad/UPI/card proof → order → key → locker vault.
// Talks to the Xion API through the shop's own /api bridge (see api/[...route].js).
(() => {
  const $ = (s, r = document) => r.querySelector(s)
  const $$ = (s, r = document) => [...r.querySelectorAll(s)]
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

  const SYM = { USD: '$', BDT: '৳', INR: '₹' }
  const K_CART = 'xion-cart'
  const K_ORD = 'xion-orders'
  const K_LOCK = 'xion-locker'
  const ls = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v } catch { return d } }
  const setLs = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }
  const money = (cur, v) => (SYM[cur] || '') + (cur === 'USD' ? (Number.isInteger(v) ? v : Number(v).toFixed(2)) : Math.round(v))

  let CX = null // Xion+ config
  let CC = null // cosmetics config
  let CUR = (/Dhaka/.test(Intl.DateTimeFormat().resolvedOptions().timeZone || '') ? 'BDT' : /Kolkata|Calcutta/.test(Intl.DateTimeFormat().resolvedOptions().timeZone || '') ? 'INR' : 'USD')
  let cart = ls(K_CART, []).filter(x => typeof x === 'string')

  async function call (url, body) {
    const r = await fetch(url, body == null ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    let j = {}
    try { j = await r.json() } catch {}
    if (!r.ok || j.error) throw new Error(j.error || 'Something went wrong. Try again.')
    return j
  }

  function toast (msg) {
    let t = $('#shopToast')
    if (!t) { t = document.createElement('div'); t.id = 'shopToast'; document.body.appendChild(t) }
    t.textContent = msg
    t.classList.add('on')
    clearTimeout(t._t)
    t._t = setTimeout(() => t.classList.remove('on'), 2600)
  }

  // ── catalog helpers ──
  const cosItem = id => (CC ? CC.items.find(i => i.id === id) : null) || (CC ? CC.bundles.find(b => b.id === id) : null)
  const priceOf = id => { const i = cosItem(id); return i ? i.price[CUR] : 0 }
  const cartTotal = () => cart.reduce((s, id) => s + priceOf(id), 0)

  // ── cape cards: price + add to cart ──
  function decorate () {
    if (!CC) return
    for (const card of $$('#grid .card[data-id]')) {
      const id = card.dataset.id
      const item = cosItem(id)
      if (!item) continue
      let b = $('.card-buy', card)
      if (!b) {
        b = document.createElement('button')
        b.className = 'card-buy'
        b.addEventListener('click', e => {
          e.stopPropagation()
          e.preventDefault()
          toggleCart(id)
        })
        card.querySelector('.shot').appendChild(b)
      }
      const inCart = cart.includes(id)
      b.textContent = inCart ? '✓ In cart' : money(CUR, item.price[CUR])
      b.classList.toggle('in', inCart)
    }
    // The Anime set card in Collections can buy the whole set at once.
    for (const set of $$('#setGrid .set')) {
      if ($('#setAnimeBuy', set) || !/^Anime/.test(set.querySelector('h3')?.textContent || '')) continue
      const bundle = CC.bundles.find(b => b.id === 'bundle_anime')
      if (!bundle) continue
      const b = document.createElement('button')
      b.id = 'setAnimeBuy'
      b.className = 'set-buy'
      b.textContent = `Get all ${bundle.items.length} — ${money(CUR, bundle.price[CUR])}`
      b.addEventListener('click', e => {
        e.stopPropagation()
        cart = ['bundle_anime', ...cart.filter(id => cosItem(id)?.items || !bundle.items.includes(id))]
        commitCart()
        toast('Added the whole Anime set')
        openDrawer(drawer('cartDrawer', 'Your cart'))
        renderCart()
      })
      set.appendChild(b)
    }
  }

  function commitCart () {
    setLs(K_CART, cart)
    renderCart()
    decorate()
  }

  function toggleCart (id) {
    const bundle = cosItem(id)
    if (cart.includes(id)) cart = cart.filter(x => x !== id)
    else {
      cart.push(id)
      // A bundle replaces its own items; an item makes the bundle pointless.
      const items = bundle?.items || [id]
      cart = cart.filter(x => {
        const it = cosItem(x)
        if (it?.items) return !it.items.some(i => items.includes(i)) || x === id
        return !(bundle?.items || []).includes(x) || x === id
      })
    }
    commitCart()
    toast(cart.includes(id) ? 'Added to cart' : 'Removed from cart')
  }

  // ── cart drawer ──
  function drawer (id, title) {
    let d = $('#' + id)
    if (d) return d
    d = document.createElement('div')
    d.id = id
    d.className = 'drawer'
    d.innerHTML = `<div class="dr-back" data-close></div>
      <aside class="dr-panel" role="dialog" aria-modal="true">
        <header class="dr-head"><h3>${esc(title)}</h3><button class="dr-x" data-close aria-label="Close">✕</button></header>
        <div class="dr-body"></div>
      </aside>`
    document.body.appendChild(d)
    d.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeDrawer(d) })
    return d
  }
  const openDrawer = el => {
    el._previousFocus = document.activeElement
    el.classList.add('open'); document.documentElement.classList.add('shop-lock')
    requestAnimationFrame(() => $('button, input', el)?.focus())
  }
  const closeDrawer = el => {
    el.classList.remove('open')
    if (!$('.drawer.open, .sheet.open')) { document.documentElement.classList.remove('shop-lock'); el._previousFocus?.focus() }
  }

  function renderCart () {
    const btn = $('#cartBtn')
    if (btn) {
      btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M3 4h2l2.5 11h11L21 7H6"/><circle cx="9" cy="19" r="1.4"/><circle cx="18" cy="19" r="1.4"/></svg><span>Cart</span><b class="badge">${cart.length}</b>`
      btn.classList.toggle('has', cart.length > 0)
    }
    const d = $('#cartDrawer')
    if (!d) return
    const lines = cart.map(id => {
      const it = cosItem(id)
      return `<div class="cart-line"><div><b>${esc(it ? it.name : id)}</b><small>${it?.items ? it.items.length + ' items' : esc(it?.type || '')}</small></div><span>${money(CUR, priceOf(id))}</span><button data-rm="${esc(id)}" aria-label="Remove">✕</button></div>`
    }).join('')
    $('.dr-body', d).innerHTML = cart.length
      ? `<div class="cart-lines">${lines}</div>
         <div class="cart-total"><span>Total</span><b>${money(CUR, cartTotal())}</b></div>
         <div class="cur-pick">${['BDT', 'USD', 'INR'].map(c => `<button class="${c === CUR ? 'on' : ''}" data-cur="${c}">${SYM[c]} ${c}</button>`).join('')}</div>
         <button class="btn big wide" id="cartGo">Continue to checkout<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
         <p class="fine">Payment is checked by hand. Cosmetics unlock on your order page, and Xion+ appears on your Xion account automatically.</p>`
      : '<p class="empty-cart">Your cart is empty. Every cape with a price tag can be bought.</p>'
    $('.dr-body', d).onclick = e => {
      const rm = e.target.closest('[data-rm]')
      if (rm) { cart = cart.filter(x => x !== rm.dataset.rm); commitCart(); return }
      const c = e.target.closest('[data-cur]')
      if (c) { CUR = c.dataset.cur; commitCart(); return }
      if (e.target.closest('#cartGo')) {
        closeDrawer(d)
        if (cart.includes('xion_plus') && !signedIn()) { showAccount(); toast('Sign in first so Xion+ unlocks on your account.'); return }
        sheetOpen('cos')
      }
    }
  }

  // ── checkout sheet ──
  const METHOD = {
    bkash: { name: 'bKash', payer: 'Your bKash number', ph: '01XXXXXXXXX', how: n => `bKash → <b>Send Money</b> → <b>${esc(n)}</b>` },
    nagad: { name: 'Nagad', payer: 'Your Nagad number', ph: '01XXXXXXXXX', how: n => `Nagad → <b>Send Money</b> → <b>${esc(n)}</b>` },
    upi: { name: 'UPI', payer: 'UPI ID you paid from', ph: 'name@okaxis', how: n => `Pay with any UPI app to <b>${esc(n)}</b>` },
    card: { name: 'Card', payer: 'Email or name on the card payment', ph: 'you@gmail.com', how: () => 'Pay on the card page, then come back here' }
  }

  function sheet () {
    let s = $('#checkout')
    if (s) return s
    s = document.createElement('div')
    s.id = 'checkout'
    s.className = 'sheet'
    s.innerHTML = `<div class="sh-back" data-close></div><div class="sh-card" role="dialog" aria-modal="true">
      <button class="sh-x" data-close aria-label="Close">✕</button>
      <header class="sh-head"><span class="sh-badge" id="shBadge">XION</span><h3 id="shTitle">Checkout</h3><div class="sh-dots"><i></i><i></i><i></i></div></header>
      <div class="sh-steps" id="shSteps"></div>
      <p class="sh-err" id="shErr" role="alert"></p>
    </div>`
    document.body.appendChild(s)
    s.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeDrawer(s) })
    return s
  }

  const st = { kind: 'cos', step: 0, currency: CUR, method: '', code: '', shot: '', discount: null, busy: false, details: {}, plus: false }
  const cfgFor = () => (st.kind === 'xion' ? CX : CC)

  function sheetOpen (kind) {
    st.kind = kind; st.step = 0; st.currency = CUR; st.method = ''; st.code = ''; st.shot = ''; st.discount = null; st.details = {}; st.plus = false
    const s = sheet()
    $('#shBadge').textContent = kind === 'xion' ? 'XION+' : 'COSMETICS'
    $('#shTitle').textContent = kind === 'xion' ? 'Get Xion+' : 'Checkout'
    err('')
    openDrawer(s)
    renderStep()
  }
  const err = msg => { const e = $('#shErr'); if (!e) return; e.textContent = msg || ''; e.classList.toggle('show', !!msg) }

  function renderStep () {
    const s = $('#checkout')
    $$('.sh-dots i', s).forEach((d, i) => d.classList.toggle('on', i <= Math.min(st.step, 2)))
    $('.sh-dots', s).style.visibility = st.step === 3 ? 'hidden' : ''
    $('#shSteps').innerHTML = [stepSummary, stepDetails, stepPay, stepDone][st.step]()
    if (st.step === 1) bindDetails()
    if (st.step === 2) bindPay()
    if (st.step === 3) bindDone()
    if (st.step === 0) bindSummary()
  }

  function stepSummary () {
    if (st.kind === 'xion') {
      const base = CX ? CX.prices[st.currency] : 0
      const now = st.discount != null ? st.discount : base
      return `<section class="sh-step">
        <p class="sh-lead">One-time payment for Xion+. Pick your currency.</p>
        <div class="cur-grid">${['USD', 'BDT', 'INR'].map(c => `<button class="cur-card ${c === st.currency ? 'on' : ''}" data-cur="${c}"><b>${SYM[c]}${(CX?.prices[c] ?? 0)}</b><small>${{ USD: 'Card', BDT: 'bKash · Nagad', INR: 'UPI' }[c]}</small></button>`).join('')}</div>
        <div class="sum"><span>Xion+</span><b>${now < base ? `<s>${money(st.currency, base)}</s> ${money(st.currency, now)}` : money(st.currency, now)}</b></div>
        <button class="btn big wide" data-next>Continue<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
      </section>`
    }
    const total = cartTotal()
    const reduced = st.discount != null ? st.discount : total
    return `<section class="sh-step">
      <p class="sh-lead">You are buying ${cart.length} item${cart.length === 1 ? '' : 's'}. Pick your currency.</p>
      <div class="cart-lines">${cart.map(id => { const it = cosItem(id); return `<div class="cart-line"><div><b>${esc(it?.name || id)}</b><small>${it?.items ? it.items.length + ' items' : esc(it?.type || '')}</small></div><span>${money(st.currency, priceOf(id))}</span></div>` }).join('')}</div>
      <div class="cur-pick">${['BDT', 'USD', 'INR'].map(c => `<button class="${c === st.currency ? 'on' : ''}" data-cur="${c}">${SYM[c]} ${c}</button>`).join('')}</div>
      <div class="sum"><span>Total</span><b>${reduced < total ? `<s>${money(st.currency, total)}</s> ${money(st.currency, reduced)}` : money(st.currency, total)}</b></div>
      <button class="btn big wide" data-next>Continue<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
    </section>`
  }

  function bindSummary () {
    const s = $('#checkout')
    $('.sh-step', s).addEventListener('click', e => {
      const c = e.target.closest('[data-cur]')
      if (c) { st.currency = c.dataset.cur; CUR = st.currency; st.discount = null; renderStep(); return }
      if (e.target.closest('[data-next]')) { st.step = 1; renderStep() }
    })
  }

  function stepDetails () {
    const ign = ls('xion-ign', '')
    const mail = ls('xion-email', '')
    return `<section class="sh-step">
      <div class="fields">
        ${st.kind === 'xion' ? `<label>Full name<input id="fName" maxlength="80" placeholder="Taseen Rahman" autocomplete="name"></label>` : ''}
        <label>Minecraft name<input id="fIgn" maxlength="16" value="${esc(ign)}" placeholder="Steve" spellcheck="false"></label>
        <label class="${st.kind === 'xion' ? '' : 'wide'}">Gmail<input id="fEmail" type="email" maxlength="120" value="${esc(mail)}" placeholder="you@gmail.com" autocomplete="email"></label>
        ${st.kind === 'xion' ? `<label class="wide">Device ID <small>Launcher → Settings → Xion Premium</small><input id="fDevice" maxlength="24" placeholder="1A2B-3C4D-5E6F-7A8B" spellcheck="false"></label>` : ''}
      </div>
      <div class="code-row"><input id="fCode" maxlength="40" placeholder="Redeem code (optional)" spellcheck="false"><button class="btn ghost" id="codeGo">Apply</button></div>
      <p class="code-msg" id="codeMsg"></p>
      <div class="sh-row"><button class="btn ghost" data-prev>Back</button><button class="btn" data-next>Continue</button></div>
    </section>`
  }

  function bindDetails () {
    const s = $('#checkout')
    const step = $('.sh-step', s)
    step.addEventListener('click', async e => {
      if (e.target.closest('[data-prev]')) { st.step = 0; return renderStep() }
      if (e.target.closest('#codeGo')) return applyCode()
      if (!e.target.closest('[data-next]')) return
      const bad = checkDetails()
      if (bad) return err(bad)
      st.details = {
        ign: $('#fIgn').value.trim(),
        email: $('#fEmail').value.trim(),
        name: ($('#fName')?.value || '').trim(),
        device: ($('#fDevice')?.value || '').trim()
      }
      setLs('xion-ign', st.details.ign)
      setLs('xion-email', st.details.email)
      if (st.discount === 0) return submit(e.target.closest('[data-next]'))
      st.step = 2
      renderStep()
    })
    $('#fCode').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyCode() } })
  }

  function checkDetails () {
    const ign = ($('#fIgn')?.value || '').trim()
    const mail = ($('#fEmail')?.value || '').trim()
    if (!/^[A-Za-z0-9_]{3,16}$/.test(ign)) return 'Minecraft name must be 3–16 letters, numbers or _.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return 'Enter a valid Gmail address.'
    if (st.kind === 'xion') {
      if (($('#fName')?.value || '').trim().length < 2) return 'Enter your full name.'
      const dev = ($('#fDevice')?.value || '').toLowerCase().replace(/[^0-9a-f]/g, '')
      if (dev.length !== 16) return 'Device ID is 16 characters — copy it from the launcher.'
    }
    return ''
  }

  async function applyCode () {
    const raw = $('#fCode').value.trim()
    const msg = $('#codeMsg')
    const base = st.kind === 'xion' ? CX.prices[st.currency] : cartTotal()
    if (!raw) { st.code = ''; st.discount = null; msg.textContent = ''; return renderStep() }
    try {
      const r = st.kind === 'xion'
        ? await call('/api/shop', { action: 'code', code: raw, currency: st.currency }).then(x => { if (!x.ok) throw new Error(x.error); return { price: x.price, label: x.type === 'free' ? 'free' : x.value + '% off' } })
        : await call('/api/cosmetics?r=shop', { action: 'quote', cart, currency: st.currency, code: raw }).then(x => { if (!x.code || x.code.invalid) throw new Error('That code is not valid or has been used up.'); return { price: x.total, label: x.code.type === 'free' ? 'free' : x.code.value + '% off' } })
      st.code = raw; st.discount = r.price
      msg.className = 'code-msg ok'; msg.textContent = `Code applied: ${r.label}.`
    } catch (e) {
      st.code = ''; st.discount = null
      msg.className = 'code-msg bad'; msg.textContent = e.message
    }
    renderStep()
  }

  function payTarget () {
    const cfg = cfgFor()
    return st.method === 'card' ? cfg.pay.cardLink : cfg.pay[st.method]
  }

  function stepPay () {
    const cfg = cfgFor()
    const list = cfg.methods[st.currency] || ['bkash']
    if (!list.includes(st.method)) st.method = list[0]
    const M = METHOD[st.method]
    const target = payTarget()
    const amount = st.discount != null ? st.discount : (st.kind === 'xion' ? CX.prices[st.currency] : cartTotal())
    return `<section class="sh-step">
      <div class="pay-methods">${list.map(m => `<button class="pm ${m === st.method ? 'on' : ''}" data-m="${m}"><b>${METHOD[m].name}</b><small>${m === 'card' ? 'Debit / credit' : 'Send Money'}</small></button>`).join('')}</div>
      <div class="pay-how">${target
        ? `<div class="pay-amount">${money(st.currency, amount)}</div><p>${M.how(target)}</p><button class="btn ghost copy" data-copy="${esc(target)}">Copy ${st.method === 'upi' ? 'UPI ID' : 'number'}</button>`
        : `<p class="pay-off"><b>${M.name} isn't set up yet.</b> Place the order and we'll send the ${M.name} number on your order page.</p>`}</div>
      ${st.method === 'card' && target ? `<a class="btn wide" href="${esc(target)}" target="_blank" rel="noopener">Pay ${money(st.currency, amount)} by card ↗</a>` : ''}
      <div class="fields">
        <label class="wide"><span id="payerLabel">${M.payer}</span><input id="fPayer" maxlength="60" placeholder="${M.ph}"></label>
        <label class="wide">Transaction ID<input id="fTrx" maxlength="60" placeholder="e.g. 9JK4L2M8QX" spellcheck="false"></label>
      </div>
      <label class="drop" id="drop"><input type="file" id="fShot" accept="image/*" hidden><span><b>Add payment screenshot</b><small>Tap to choose or drop the bKash receipt</small></span><img id="shotPrev" alt=""></label>
      <div class="sh-row"><button class="btn ghost" data-prev>Back</button><button class="btn" id="send">Place order</button></div>
    </section>`
  }

  function bindPay () {
    const s = $('#checkout')
    const step = $('.sh-step', s)
    step.addEventListener('click', e => {
      const m = e.target.closest('[data-m]')
      if (m) { st.method = m.dataset.m; return renderStep() }
      const c = e.target.closest('[data-copy]')
      if (c) return navigator.clipboard?.writeText(c.dataset.copy).then(() => { c.textContent = 'Copied ✓'; setTimeout(() => renderStep(), 1400) })
      if (e.target.closest('[data-prev]')) { st.step = 1; return renderStep() }
      const send = e.target.closest('#send')
      if (send) {
        if (($('#fPayer')?.value || '').trim().length < 3) return err(METHOD[st.method].payer + ' is needed.')
        if (($('#fTrx')?.value || '').trim().length < 4) return err('Enter the transaction ID from your receipt.')
        if (!st.shot) return err('Add a screenshot of your payment.')
        submit(send)
      }
    })
    $('#fShot').addEventListener('change', e => readShot(e.target.files[0]))
    const drop = $('#drop')
    ;['dragover', 'dragenter'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over') }))
    ;['dragleave', 'drop'].forEach(t => drop.addEventListener(t, () => drop.classList.remove('over')))
    drop.addEventListener('drop', e => { e.preventDefault(); readShot(e.dataTransfer.files[0]) })
  }

  // Screenshots are shrunk in the browser (max 1400px JPEG) so uploads stay small.
  function readShot (file) {
    if (!file || !file.type.startsWith('image/')) return err('That file is not an image.')
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, 1400 / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      st.shot = c.toDataURL('image/jpeg', 0.82)
      $('#shotPrev').src = st.shot
      $('#drop').classList.add('has')
      err('')
      URL.revokeObjectURL(img.src)
    }
    img.onerror = () => err('Could not read that image.')
    img.src = URL.createObjectURL(file)
  }

  async function submit (btn) {
    if (st.busy) return
    st.busy = true
    err('')
    btn.disabled = true
    btn.classList.add('busy')
    const details = {
      ...st.details,
      token: signedIn() ? ACC.token : '',
      currency: st.currency,
      code: st.code,
      method: st.method,
      payer: ($('#fPayer')?.value || '').trim(),
      trx: ($('#fTrx')?.value || '').trim(),
      screenshot: st.shot
    }
    try {
      let r
      if (st.kind === 'xion') {
        r = await call('/api/shop', { action: 'order', ...details })
        remember({ kind: 'xion', id: r.id, token: r.token, at: Date.now(), title: 'Xion+', amount: CX.prices[st.currency], currency: st.currency })
      } else {
        const hasPlus = cart.includes('xion_plus')
        st.plus = hasPlus
        r = await call('/api/cosmetics?r=shop', { action: 'order', ...details, cart })
        remember({ kind: 'cos', plus: hasPlus, id: r.id, token: r.token, at: Date.now(), title: hasPlus ? 'Xion+' : cart.length === 1 && cosItem(cart[0]) ? cosItem(cart[0]).name : `${cart.length} cosmetics`, amount: st.discount != null ? st.discount : cartTotal(), currency: st.currency })
        cart = []
        commitCart()
      }
      st.last = r
      st.step = 3
      renderStep()
    } catch (e) {
      err(e.message)
    } finally {
      st.busy = false
      btn.disabled = false
      btn.classList.remove('busy')
    }
  }

  function stepDone () {
    return `<section class="sh-step done">
      <div class="done-anim"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-16"/></svg></div>
      <h4>Order placed!</h4>
      <p class="sh-lead">We check every payment by hand. ${st.plus ? 'Xion+ unlocks on your Xion account after approval.' : `Your ${st.kind === 'xion' ? 'Xion+ license key' : 'locker key'} appears on your order page after approval.`} Keep your order link so you can return to it.</p>
      <button class="btn big wide" id="openOrder">Open my order</button>
    </section>`
  }
  function bindDone () { $('#openOrder').addEventListener('click', () => { closeDrawer($('#checkout')); showOrders(st.last) }) }

  // ── orders ──
  const orders = () => ls(K_ORD, [])
  function remember (o) { setLs(K_ORD, [o, ...orders().filter(x => !(x.id === o.id && x.kind === o.kind))].slice(0, 20)); paintOrdersBtn() }

  const STATUS = { pending: ['Checking your payment', 1], approved: ['Payment confirmed', 2], done: ['Key sent', 3], rejected: ['Payment not confirmed', -1] }

  function showOrders (focus) {
    const d = drawer('ordersDrawer', 'My orders')
    const list = orders()
    openDrawer(d)
    paint(focus)
    function paint (f) {
      $('.dr-body', d).innerHTML = list.length
        ? `<div class="ord-list">${list.map(o => `<button class="ord-row" data-open="${o.kind}:${o.id}">${(o.plus || o.kind === 'xion') ? '<i class="tagx">XION+</i>' : '<i class="tagc">CAPES</i>'}<div><b>${esc(o.title)}</b><small>${new Date(o.at).toLocaleDateString()} · ${money(o.currency, o.amount)}</small></div><span class="arrow">›</span></button>`).join('')}</div><div id="ordView"></div>`
        : '<p class="empty-cart">No orders from this browser yet. Place one and it will appear here with its status.</p>'
      $('.dr-body', d).onclick = e => {
        const b = e.target.closest('[data-open]')
        if (b) { const [kind, id] = b.dataset.open.split(':'); openOrder(kind, id) }
      }
      if (f) openOrder(f.kind, f.id)
    }
  }

  const orderOf = (kind, id) => orders().find(o => o.kind === kind && o.id === id)

  async function openOrder (kind, id) {
    const meta = orderOf(kind, id)
    if (!meta) return
    const view = $('#ordView')
    if (!view) return
    view.innerHTML = '<p class="sh-lead">Loading your order…</p>'
    const url = kind === 'xion' ? '/api/shop' : '/api/cosmetics?r=shop'
    let o
    try { o = await call(url, { action: 'status', id: meta.id, token: meta.token }) } catch (e) { view.innerHTML = `<p class="sh-lead">${esc(e.message)}</p>`; return }
    const [label, lvl] = STATUS[o.status] || STATUS.pending
    const plusOrder = kind === 'xion' || meta.plus
    const key = kind === 'xion' ? o.key : meta.plus ? '' : o.lockerKey
    view.innerHTML = `
      <div class="ord-card">
        <div class="ord-meta"><b>#${o.id.slice(0, 6).toUpperCase()}</b><span>${esc(o.ign || '')}</span><span>${o.amount === 0 ? 'Free code' : money(o.currency, o.amount)}</span></div>
        <ol class="ord-steps ${lvl < 0 ? 'bad' : ''}">${['Order sent', 'Payment confirmed', plusOrder ? 'Xion+ unlocked' : 'Cosmetics unlocked'].map((s, i) => `<li class="${lvl < 0 ? (i === 0 ? 'on' : '') : i < lvl ? 'on' : ''}">${lvl < 0 && i === 1 ? 'Not confirmed' : s}</li>`).join('')}</ol>
        ${key
          ? `<div class="ord-key"><small>${kind === 'xion' ? 'Your Xion+ license key' : 'Your locker key'}</small><code>${esc(key)}</code>
             <button class="btn small" data-copy-key="${esc(key)}">Copy key</button>
             ${kind === 'xion' ? '<a class="btn ghost small" href="https://xionx.vercel.app/#download">How to activate ↗</a>' : '<button class="btn ghost small" data-locker="1">Open my locker</button>'}
             </div>`
          : `<p class="ord-wait">${esc(label)}… ${plusOrder ? 'Xion+ appears on your Xion account as soon as it is approved, then in the launcher and in game.' : 'your key appears here once it is approved.'}</p>`}
        ${meta.plus ? '<p class="fine">Signed in on the launcher with the same Xion account? Xion+ unlocks there automatically after approval.</p>' : kind === 'xion' ? '' : '<p class="fine">Paste the locker key below in “Your locker” to equip what you bought.</p>'}
        <div class="chat">${(o.messages || []).map(m => `<div class="msg ${esc(m.from)}"><p>${esc(m.text)}</p><small>${m.from === 'buyer' ? 'You' : 'Xion'} · ${new Date(m.at).toLocaleString()}</small></div>`).join('')}</div>
        <div class="chat-in"><input id="ordMsg" maxlength="1000" placeholder="Message us…"><button class="btn small" id="ordSend">Send</button></div>
      </div>`
    const chat = $('.chat', view); if (chat) chat.scrollTop = chat.scrollHeight
    view.onclick = async e => {
      const c = e.target.closest('[data-copy-key]')
      if (c) return navigator.clipboard?.writeText(c.dataset.copyKey).then(() => { c.textContent = 'Copied ✓' })
      if (e.target.closest('[data-locker]')) {
        closeDrawer($('#ordersDrawer'))
        const saved = ls(K_LOCK, null)
        $('#vault').scrollIntoView({ behavior: 'smooth', block: 'center' })
        if (saved) setTimeout(() => openLocker(saved.name, saved.key), 400)
        return
      }
      if (e.target.closest('#ordSend')) {
        const t = $('#ordMsg').value.trim(); if (!t) return
        try { await call(url, { action: 'message', id: meta.id, token: meta.token, text: t }); $('#ordMsg').value = ''; openOrder(kind, id) } catch (x) { toast(x.message) }
      }
    }
    $('#ordMsg')?.addEventListener('keydown', e => { if (e.key === 'Enter') $('#ordSend').click() })
  }

  function paintOrdersBtn () {
    const b = $('#ordersBtn'); if (!b) return
    const n = orders().length
    b.innerHTML = `<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z"/></svg><span>Orders</span>${n ? `<b class="badge">${n}</b>` : ''}`
  }

  // ── locker vault ──
  let LK = ls(K_LOCK, null)

  function bindLocker () {
    const form = $('#vaultForm')
    if (!form) return
    form.addEventListener('submit', e => {
      e.preventDefault()
      openLocker(form.elements.namedItem('name').value.trim(), form.elements.namedItem('key').value.trim())
    })
    if (LK) { form.elements.namedItem('name').value = LK.name; form.elements.namedItem('key').value = LK.key; openLocker(LK.name, LK.key, true) }
    $('#vaultOut')?.addEventListener('click', () => {
      LK = null; setLs(K_LOCK, null)
      $('#vaultForm').reset()
      $('#vaultMain').hidden = true
      $('#vaultForm').hidden = false
    })
  }

  async function openLocker (name, key, quiet) {
    const out = $('#vaultErr'), main = $('#vaultMain'), form = $('#vaultForm')
    out.textContent = ''
    if (!name || !key) return
    try {
      const r = await call('/api/cosmetics?r=locker', { action: 'open', name, key })
      LK = { name, key }
      setLs(K_LOCK, LK)
      form.hidden = true
      main.hidden = false
      drawLocker(r)
    } catch (e) {
      if (LK && quiet && e.message.includes('wrong')) { LK = null; setLs(K_LOCK, null); form.hidden = false }
      out.textContent = e.message
      main.hidden = true
      form.hidden = false
    }
  }

  const SLOTS = [['cape', 'Cape'], ['hat', 'Hat'], ['wings', 'Wings'], ['aura', 'Aura']]

  function drawLocker (p) {
    const main = $('#vaultMain')
    const own = p.owned || []
    main.innerHTML = `<div class="vault-who"><b id="vaultName">${esc(p.display || p.name)}</b><span>${own.length} item${own.length === 1 ? '' : 's'} owned</span><button class="link" id="vaultOut">Sign out</button></div>
      ${SLOTS.map(([slot, label]) => {
        const items = own.map(id => cosItem(id)).filter(i => i && i.type === slot && !i.items)
        const worn = p.equipped?.[slot]
        return `<div class="slot"><h4>${label}</h4><div class="slot-items">
          <button class="slot-item ${!worn ? 'on' : ''}" data-slot="${slot}" data-item="">None</button>
          ${items.map(i => `<button class="slot-item ${worn === i.id ? 'on' : ''}" data-slot="${slot}" data-item="${esc(i.id)}">${esc(i.name)}</button>`).join('')}
          ${items.length ? '' : '<span class="slot-none">Nothing owned in this slot yet.</span>'}
        </div></div>`
      }).join('')}
      <p class="fine">What you wear here is what every Xion Client player sees on your back, on your elytra and in the tab list.</p>`
    $('#vaultOut').addEventListener('click', () => {
      LK = null; setLs(K_LOCK, null)
      $('#vaultMain').hidden = true
      $('#vaultForm').hidden = false
      $('#vaultForm').reset()
    })
    main.onclick = async e => {
      const b = e.target.closest('[data-slot]')
      if (!b) return
      b.disabled = true
      try {
        const r = await call('/api/cosmetics?r=locker', { action: 'equip', name: LK.name, key: LK.key, slot: b.dataset.slot, item: b.dataset.item })
        drawLocker(r)
        toast(b.dataset.item ? 'Equipped — it shows in game now' : 'Taken off')
      } catch (x) { toast(x.message); b.disabled = false }
    }
  }

  // ── account: Gmail / email sign-in, shared with the launcher ──
  const K_ACC = 'xion-acc'
  let ACC = ls(K_ACC, null)
  const signedIn = () => !!(ACC && ACC.token)

  function paintAccBtn () {
    const b = $('#accBtn')
    if (!b) return
    b.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6"/></svg><span>${signedIn() ? esc(ACC.ign) : 'Sign in'}</span>`
    b.classList.toggle('has', signedIn())
  }

  async function refreshAccount (quiet) {
    if (!signedIn()) return null
    try {
      const r = await call('/api/account', { action: 'me', token: ACC.token })
      ACC = { ...ACC, ...r.account, token: ACC.token }
      setLs(K_ACC, ACC)
      if (ACC.orders?.length) {
        const seen = new Set()
        const merged = [...ACC.orders, ...orders()].filter(o => { const k = o.kind + o.id; return seen.has(k) ? false : (seen.add(k), true) })
        setLs(K_ORD, merged.slice(0, 30))
        paintOrdersBtn()
      }
      if (ACC.ign) setLs('xion-ign', ACC.ign)
      if (ACC.email) setLs('xion-email', ACC.email)
      paintAccBtn()
      return ACC
    } catch (e) {
      if (/sign in again/i.test(e.message)) { ACC = null; setLs(K_ACC, null); paintAccBtn(); if (!quiet) toast('Signed out — please sign in again.') }
      else if (!quiet) toast(e.message)
      return null
    }
  }

  const EQUIP_SLOTS = [['cape', 'Cape'], ['hat', 'Hat'], ['wings', 'Wings'], ['aura', 'Aura']]

  function showAccount () {
    const d = drawer('accDrawer', 'Your Xion account')
    openDrawer(d)
    renderAccount(d)
  }

  function renderAccount (d) {
    const body = $('.dr-body', d)
    if (!signedIn()) {
      body.innerHTML = `<p class="sh-lead">Sign in with your email (a Gmail address works the same) so your purchases, cosmetics and orders follow you into the launcher and into game.</p>
        <div class="acc-tabs"><button class="on" data-mode="in">Sign in</button><button data-mode="up">Create account</button></div>
        <form class="acc-form" id="accForm" autocomplete="on">
          <label>Email<input name="email" type="email" maxlength="120" placeholder="you@gmail.com" autocomplete="email" required></label>
          <label>Password<input name="pass" type="password" minlength="6" placeholder="At least 6 characters" autocomplete="current-password" required></label>
          <div class="acc-extra" hidden>
            <label>Minecraft name<input name="ign" maxlength="16" placeholder="Steve" spellcheck="false"></label>
            <label>Display name (optional)<input name="name" maxlength="40" placeholder="Your name"></label>
          </div>
          <button class="btn wide" type="submit" id="accGo">Sign in</button>
          <p class="err" id="accErr"></p>
          <p class="fine">Cosmetics you buy with this email unlock in the launcher when you sign in there too. One account per Minecraft name.</p>
        </form>`
      let mode = 'in'
      const tabs = $('.acc-tabs', body)
      tabs.addEventListener('click', e => {
        const t = e.target.closest('[data-mode]'); if (!t) return
        mode = t.dataset.mode
        $$('button', tabs).forEach(b => b.classList.toggle('on', b === t))
        $('.acc-extra', body).hidden = mode !== 'up'
        $('.acc-form input[name=pass]', body).autocomplete = mode === 'up' ? 'new-password' : 'current-password'
        $('#accGo', body).textContent = mode === 'up' ? 'Create my account' : 'Sign in'
        $('#accErr', body).textContent = ''
      })
      $('#accForm').addEventListener('submit', async e => {
        e.preventDefault()
        const f = e.target
        const btn = $('#accGo', body), errEl = $('#accErr', body)
        errEl.textContent = ''
        btn.disabled = true
        try {
          const body2 = mode === 'up'
            ? { action: 'signup', email: f.email.value, pass: f.pass.value, ign: f.ign.value, name: f.elements.namedItem('name').value }
            : { action: 'login', email: f.email.value, pass: f.pass.value }
          const r = await call('/api/account', body2)
          ACC = { ...r.account, token: r.token }
          setLs(K_ACC, ACC)
          paintAccBtn()
          await refreshAccount(true)
          if (mode === 'up') toast('Account created — you are signed in')
          else toast('Signed in')
          renderAccount(d)
          syncVault()
        } catch (x) { errEl.textContent = x.message } finally { btn.disabled = false }
      })
      return
    }

    const own = (ACC.owned || []).filter(id => { const i = cosItem(id); return i && i.type !== 'plus' })
    body.innerHTML = `<div class="acc-who"><div><b>${esc(ACC.name || ACC.ign)}</b><small>${esc(ACC.email)} · linked to <b>${esc(ACC.ign)}</b></small></div><button class="link" id="accOut">Sign out</button></div>
      <div class="acc-stats"><span><b>${own.length}</b> cosmetic${own.length === 1 ? '' : 's'} owned</span><span>${ACC.plus ? '<b>Xion+ active</b>' : 'No Xion+'}</span><button class="btn ghost small" id="accOrders">My orders</button><button class="btn ghost small" id="accVault">My locker</button></div>
      ${EQUIP_SLOTS.map(([slot, label]) => {
        const items = own.map(id => cosItem(id)).filter(i => i && i.type === slot && !i.items)
        const worn = (ACC.equipped || {})[slot]
        return `<div class="slot"><h4>${label}</h4><div class="slot-items">
          <button class="slot-item ${!worn ? 'on' : ''}" data-aslot="${slot}" data-aitem="">None</button>
          ${items.map(i => `<button class="slot-item ${worn === i.id ? 'on' : ''}" data-aslot="${slot}" data-aitem="${esc(i.id)}">${esc(i.name)}</button>`).join('')}
          ${items.length ? '' : '<span class="slot-none">Nothing owned here yet.</span>'}</div></div>`
      }).join('')}
      <p class="fine">Equipped items show on <b>${esc(ACC.ign)}</b> for every Xion Client player, and in the launcher on the same account.</p>`

    $('#accOut', body).addEventListener('click', () => {
      ACC = null; setLs(K_ACC, null); paintAccBtn(); toast('Signed out'); renderAccount(d); syncVault()
    })
    $('#accOrders', body).addEventListener('click', () => { closeDrawer(d); showOrders() })
    $('#accVault', body).addEventListener('click', () => { closeDrawer(d); $('#vault').scrollIntoView({ behavior: 'smooth', block: 'center' }) })
    body.onclick = async e => {
      const b = e.target.closest('[data-aslot]')
      if (!b) return
      b.disabled = true
      try {
        const r = await call('/api/account', { action: 'equip', token: ACC.token, slot: b.dataset.aslot, item: b.dataset.aitem })
        ACC = { ...ACC, ...r.account, token: ACC.token }
        setLs(K_ACC, ACC)
        renderAccount(d)
        toast(b.dataset.aitem ? 'Equipped — it shows in game now' : 'Taken off')
        if ($('#vaultMain') && !$('#vaultMain').hidden) drawAccVault()
      } catch (x) { toast(x.message); b.disabled = false }
    }
  }

  // The vault section doubles as the account's locker when signed in.
  function drawAccVault () {
    const main = $('#vaultMain'), form = $('#vaultForm')
    if (!main || !signedIn()) return
    form.hidden = true
    main.hidden = false
    const own = (ACC.owned || []).filter(id => { const i = cosItem(id); return i && i.type !== 'plus' })
    main.innerHTML = `<div class="vault-who"><b>${esc(ACC.ign)}</b><span>signed in as ${esc(ACC.email)} · ${own.length} item${own.length === 1 ? '' : 's'}</span><button class="link" id="vaultAccOut">Sign out</button></div>
      ${EQUIP_SLOTS.map(([slot, label]) => {
        const items = own.map(id => cosItem(id)).filter(i => i && i.type === slot && !i.items)
        const worn = (ACC.equipped || {})[slot]
        return `<div class="slot"><h4>${label}</h4><div class="slot-items">
          <button class="slot-item ${!worn ? 'on' : ''}" data-vslot="${slot}" data-vitem="">None</button>
          ${items.map(i => `<button class="slot-item ${worn === i.id ? 'on' : ''}" data-vslot="${slot}" data-vitem="${esc(i.id)}">${esc(i.name)}</button>`).join('')}
          ${items.length ? '' : '<span class="slot-none">Nothing owned in this slot yet.</span>'}</div></div>`
      }).join('')}
      <p class="fine">This is what other players see on your back, on your elytra and in the tab list. Signed in on the launcher too? Your cape is applied there automatically.</p>`
    $('#vaultAccOut').addEventListener('click', () => {
      ACC = null; setLs(K_ACC, null); paintAccBtn()
      main.hidden = true; $('#vaultForm').hidden = false
      toast('Signed out')
    })
    main.onclick = async e => {
      const b = e.target.closest('[data-vslot]')
      if (!b) return
      b.disabled = true
      try {
        const r = await call('/api/account', { action: 'equip', token: ACC.token, slot: b.dataset.vslot, item: b.dataset.vitem })
        ACC = { ...ACC, ...r.account, token: ACC.token }
        setLs(K_ACC, ACC)
        drawAccVault()
        toast(b.dataset.vitem ? 'Equipped — it shows in game now' : 'Taken off')
      } catch (x) { toast(x.message); b.disabled = false }
    }
  }

  // Signing in swaps the key form for the account's own locker, and back again.
  function syncVault () {
    if (!$('#vaultMain') || !$('#vaultForm')) return
    if (signedIn()) return drawAccVault()
    $('#vaultMain').hidden = true
    $('#vaultForm').hidden = false
  }

  async function initAccount () {
    paintAccBtn()
    $('#accBtn')?.addEventListener('click', () => showAccount())
    if (!signedIn()) return
    await refreshAccount(true)
    if (signedIn()) syncVault()
  }

  // ── wire up ──
  async function init () {
    const [x, c] = await Promise.allSettled([call('/api/shop'), call('/api/cosmetics?r=shop')])
    if (x.status === 'fulfilled') CX = x.value
    if (c.status === 'fulfilled') { CC = c.value; window.XionCatalog = CC; cart = cart.filter(id => cosItem(id)) }
    else console.warn('cosmetics config unavailable:', c.reason?.message)
    if (CX?.pay?.bkash === '' && !$('#payWarn')?.dataset.init) { /* number is set from the admin panel */ }
    decorate()
    renderCart()
    paintOrdersBtn()
    bindLocker()
    await initAccount()
    const plusBtn = $('#buyPlus')
    if (plusBtn) plusBtn.addEventListener('click', e => {
      e.preventDefault()
      if (!CC) return toast('The shop is still loading. Try again in a second.')
      if (!cosItem('xion_plus')) return toast('Xion+ is not available right now.')
      if (cart.includes('xion_plus')) toast('Xion+ is already in your cart')
      else { cart.push('xion_plus'); commitCart(); toast('Xion+ added to your cart') }
      const d = drawer('cartDrawer', 'Your cart'); renderCart(); openDrawer(d)
    })
    $('#cartBtn')?.addEventListener('click', () => { const d = drawer('cartDrawer', 'Your cart'); renderCart(); openDrawer(d) })
    addEventListener('xion:cart-add', e => {
      const id = e.detail
      if (!cosItem(id)) return toast('This look is included in Xion+ or the free launcher collection.')
      if (!cart.includes(id)) { toggleCart(id) }
      const d = drawer('cartDrawer', 'Your cart'); renderCart(); openDrawer(d)
    })
    $('#ordersBtn')?.addEventListener('click', () => showOrders())
    $('#vaultLink')?.addEventListener('click', e => {
      if (!LK) return
      e.preventDefault()
      $('#vault').scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    // Cards and set buttons are re-rendered by app.js filters, so keep decorating.
    const mo = new MutationObserver(() => decorate())
    for (const el of ['#grid', '#setGrid']) { const n = $(el); if (n) mo.observe(n, { childList: true }) }
    addEventListener('keydown', e => {
      if (e.key === 'Escape') $$('.drawer.open, .sheet.open').forEach(closeDrawer)
      const open = $('.sheet.open') || $('.drawer.open')
      if (e.key !== 'Tab' || !open) return
      const nodes = $$('button, input, a, select', open).filter(n => !n.disabled && n.offsetParent !== null)
      const first = nodes[0], last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    })
    // Open the order a buyer linked to, e.g. /#order=<kind>.<id>
    const m = /#order=(xion|cos)\.([0-9a-f]{16})/.exec(location.hash)
    if (m) showOrders()
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', init)
  else init()
})()
