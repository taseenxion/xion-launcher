// Cape browsing and ocean-showcase interactions. Preview images use the actual cape-face UV crop.
(() => {
  const $ = (s, r = document) => r.querySelector(s)
  const $$ = (s, r = document) => [...r.querySelectorAll(s)]
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  let motion = !reduced.matches
  let capes = [], cat = 'New HD', query = '', limit = 24, current = null, previousFocus = null
  const face = (c, f = 0) => `assets/previews/${c.id}${c.frames > 1 ? '_' + f : ''}.png`
  const live = new Set()
  const io = new IntersectionObserver(entries => entries.forEach(e => e.isIntersecting ? live.add(e.target) : live.delete(e.target)), { rootMargin: '80px' })
  const reveal = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); reveal.unobserve(e.target) } }), { threshold: 0.08 })
  $$('.reveal').forEach(el => reveal.observe(el))
  // Put the feature/price section before the large catalog so it is never buried under 136 cards.
  $('#capes').before($('#plus'))

  function setMotion(on) {
    motion = on
    document.documentElement.dataset.motion = on ? 'on' : 'off'
    $('#motionBtn').setAttribute('aria-pressed', String(on))
    $('#motionBtn').setAttribute('aria-label', on ? 'Pause animations' : 'Enable animations')
    $('#motionBtn').innerHTML = `◌<span>Motion ${on ? 'on' : 'off'}</span>`
    window.XionMotion = on
    dispatchEvent(new CustomEvent('xion:motion', { detail: on }))
  }
  setMotion(motion)
  $('#motionBtn').addEventListener('click', () => setMotion(!motion))
  reduced.addEventListener('change', e => setMotion(!e.matches))

  function matches(c) {
    if (cat === 'New HD' && c.cat !== 'HD Originals') return false
    if (cat === 'Anime' && c.cat !== 'Anime') return false
    if (cat === 'Animated' && c.frames < 2) return false
    if (cat === 'Free' && c.tier === 'pro') return false
    if (cat === 'Xion+' && c.tier !== 'pro') return false
    if (!['All', 'New HD', 'Anime', 'Animated', 'Free', 'Xion+'].includes(cat) && c.cat !== cat) return false
    return !query || `${c.name} ${c.cat}`.toLowerCase().includes(query)
  }
  function buildChips() {
    const cats = [...new Set(['All', 'New HD', 'Anime', 'Animated', 'Free', 'Xion+', ...capes.map(c => c.cat).filter(c => c && c !== 'HD Originals')])]
    $('#chips').innerHTML = cats.map(n => `<button type="button" data-cat="${esc(n)}" class="${n === cat ? 'on' : ''}" aria-pressed="${n === cat}">${esc(n)}</button>`).join('')
  }
  function renderGrid() {
    $$('#grid .card').forEach(el => io.unobserve(el))
    live.clear()
    const rank = c => c.cat === 'HD Originals' ? 2 : c.cat === 'Anime' ? 1 : 0
    const matchesList = capes.filter(matches).sort((a, b) => rank(b) - rank(a))
    const list = matchesList.slice(0, limit)
    $('#empty').hidden = !!list.length
    $('#count').textContent = `${list.length} of ${matchesList.length} capes shown`
    $('#loadMore').hidden = list.length >= matchesList.length
    $('#grid').innerHTML = list.map(c => `<article class="card in" data-id="${esc(c.id)}" data-frames="${c.frames}" data-frame-ms="${c.frameMs || 110}" data-name="${esc(c.name)}" data-cat="${esc(c.cat)}">
      <div class="shot"><img src="${face(c)}" alt="${esc(c.name)} cape artwork" loading="lazy" decoding="async"><div class="glow"></div><button class="cape-open" type="button" aria-label="Preview ${esc(c.name)} in 3D"><span class="preview-cue">VIEW IN 3D ↗</span></button></div>
      <span class="${c.tier === 'pro' ? 'pro' : 'free'}">${c.tier === 'pro' ? 'XION+' : 'FREE'}</span><div class="meta"><span class="nm">${esc(c.name)}</span><span class="rarity">${c.texWidth >= 1024 ? 'HD · ' + c.frames + ' frames' : c.frames > 1 ? '◌ Animated' : esc(c.cat)}</span></div></article>`).join('')
    $$('#grid .card').forEach(el => io.observe(el))
  }
  $('#chips').addEventListener('click', e => {
    const b = e.target.closest('[data-cat]'); if (!b) return
    cat = b.dataset.cat; limit = 24; buildChips(); renderGrid()
  })
  $('#search').addEventListener('input', e => { query = e.target.value.trim().toLowerCase(); limit = 24; renderGrid() })
  $('#loadMore').addEventListener('click', () => { limit += 24; renderGrid() })

  function openCape(c, focus) {
    current = c; previousFocus = focus || document.activeElement
    $('#lbImg').src = face(c)
    $('#lbImg').alt = c.name + ' cape artwork'
    $('#lbCap').textContent = c.name
    $('#modelHint').textContent = 'Loading the 3D preview…'
    $('#lbTier').textContent = c.frames > 1 ? `${c.frames}-frame ${c.texWidth >= 1024 ? 'HD ' : ''}animated cape` : 'Cape collection'
    const unlocked = (window.XionAvailable || []).includes(c.id)
    $('#lbBuy').textContent = unlocked ? 'Open my locker' : c.tier === 'pro' ? 'Get this look' : 'Included free in Xion Launcher'
    $('#lbNotice').textContent = c.texWidth >= 1024 ? `Original ${c.texWidth}×${c.texHeight} textures · ${c.frameMs} ms/frame · included with Xion+ or sold individually.` : c.tier === 'pro' ? 'Buy individually when available, or unlock launcher capes with Xion+.' : 'Choose this cape in the launcher. No purchase needed.'
    $('#lightbox').hidden = false
    document.documentElement.classList.add('preview-lock')
    $('#lbClose').focus()
    $$('[data-model-view]').forEach(b => b.classList.toggle('on', b.dataset.modelView === 'back'))
    dispatchEvent(new CustomEvent('xion:preview', { detail: c }))
  }
  function closeCape() {
    $('#lightbox').hidden = true; current = null
    document.documentElement.classList.remove('preview-lock')
    dispatchEvent(new CustomEvent('xion:preview-close'))
    previousFocus?.focus()
  }
  $('#grid').addEventListener('click', e => {
    if (e.target.closest('.card-buy')) return
    const card = e.target.closest('.card'); if (!card) return
    const c = capes.find(c => c.id === card.dataset.id); if (c) openCape(c, $('.cape-open', card))
  })
  $('#lbClose').addEventListener('click', closeCape)
  $('#lightbox').addEventListener('click', e => { if (e.target === $('#lightbox')) closeCape() })
  $('#lbBuy').addEventListener('click', () => {
    if (!current) return
    const item = window.XionCatalog?.items?.find(i => i.id === current.id)
    const id = current.id, premium = current.tier === 'pro'
    closeCape()
    if (item) dispatchEvent(new CustomEvent('xion:cart-add', { detail: id }))
    else $(premium ? '#plus' : '#how')?.scrollIntoView({ behavior: motion ? 'smooth' : 'auto' })
  })
  document.addEventListener('keydown', e => {
    if ($('#lightbox').hidden) return
    if (e.key === 'Escape') closeCape()
    if (e.key === 'Tab') {
      const focusable = $$('#lightbox button, #lightbox a').filter(el => !el.disabled)
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  })
  $$('[data-model-view]').forEach(b => b.addEventListener('click', () => {
    $$('[data-model-view]').forEach(el => el.classList.toggle('on', el === b))
    dispatchEvent(new CustomEvent('xion:model-view', { detail: b.dataset.modelView }))
  }))

  setInterval(() => {
    if (!motion || document.hidden) return
    const time = performance.now()
    for (const card of live) {
      if (!card.isConnected) { live.delete(card); continue }
      const n = Number(card.dataset.frames)
      const f = Math.floor(time / Number(card.dataset.frameMs || 110)) % n
      if (n > 1 && card.dataset.frame !== String(f)) { card.dataset.frame = String(f); card.querySelector('img').src = face({ id: card.dataset.id, frames: n }, f) }
    }
    if (current?.frames > 1) {
      const f = Math.floor(time / (current.frameMs || 110)) % current.frames
      if ($('#lbImg').dataset.frame !== String(f)) { $('#lbImg').dataset.frame = String(f); $('#lbImg').src = face(current, f) }
    }
    const badge = $('.gold-badge'), f = Math.floor(time / 140) % 16
    badge.style.backgroundPosition = `${-(f % 8) * 24}px ${-Math.floor(f / 8) * 24}px`
  }, 25)

  async function load() {
    try {
      const r = await fetch('assets/capes/capes.json')
      if (!r.ok) throw new Error('Cape catalog unavailable')
      capes = await r.json()
      capes.forEach(c => { c.frames = c.frames || 1 })
      $('#search').placeholder = `Search ${capes.length} capes…`
      buildChips(); renderGrid()
      const groups = [...new Set(capes.map(c => c.cat))]
      $('#setGrid').innerHTML = groups.map(name => {
        const items = capes.filter(c => c.cat === name)
        return `<article class="set reveal"><span class="n">${items.length} capes</span><h3>${esc(name)}</h3><p>${name === 'Anime' ? 'Hand-painted stories in motion, from moonlit seas to neon nights.' : 'Find your signature in the ' + esc(name) + ' collection.'}</p><div class="strip">${items.slice(0, 5).map(c => `<img src="${face(c)}" alt="${esc(c.name)}" loading="lazy">`).join('')}</div></article>`
      }).join('')
      $$('#setGrid .reveal').forEach(el => reveal.observe(el))
      window.XionCapes = capes
      dispatchEvent(new CustomEvent('xion:capes', { detail: capes }))
      const requested = new URLSearchParams(location.search).get('cape')
      const preview = capes.find(c => c.id === requested)
      if (preview) openCape(preview)
    } catch (e) { $('#empty').hidden = false; $('#empty').textContent = 'Could not load the cape collection. Please refresh.'; console.warn(e) }
  }
  window.XionShop = { openCape, get current() { return current } }
  load()
})()
