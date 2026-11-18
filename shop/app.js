// Cape browsing: featured collections, popular/new strips, category tiles, the full catalog and
// the 3D inspector. The diver in the background (depths.js) wears whatever "Try on" picks.
(() => {
  const $ = (s, r = document) => r.querySelector(s)
  const $$ = (s, r = document) => [...r.querySelectorAll(s)]
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  let motion = !reduced.matches
  let capes = [], cat = 'New HD', query = '', limit = 24, current = null, previousFocus = null, wearIndex = 0
  const face = (c, f = 0) => `assets/previews/${c.id}${c.frames > 1 ? '_' + f : ''}.png`
  const byId = id => capes.find(c => c.id === id)

  // The original eight HD Originals; everything else in the collection arrived in 2.0.
  const FIRST_HD = new Set(['hd_demon_gray', 'hd_demon_red', 'hd_fuji_starfall', 'hd_kirin_lightning_dragon', 'hd_kitsune_flame', 'hd_kitsune_spirit', 'hd_koi_garden', 'hd_sakura_moon'])
  const POPULAR = ['hd_kirin_lightning_dragon', 'hd_blue_ruin', 'hd_fuji_starfall', 'an_moonwolf', 'hd_spirit_stag_forest', 'hd_koi_garden', 'an_neonrain', 'hd_demon_red', 'hd_crimson_dawn', 'an_tide', 'hd_kitsune_flame', 'an_sakura']
  const SHOWCASE = ['hd_blue_ruin', 'hd_fuji_starfall', 'hd_spirit_stag_forest', 'hd_kirin_lightning_dragon', 'hd_crimson_dawn', 'hd_koi_garden', 'hd_heart_card', 'hd_misty_peaks']
  const isNew = c => c.cat === 'HD Originals' && !FIRST_HD.has(c.id)

  // Animated thumbnails: only the ones on screen tick.
  const live = new Set()
  const io = new IntersectionObserver(entries => entries.forEach(e => e.isIntersecting ? live.add(e.target) : live.delete(e.target)), { rootMargin: '80px' })
  const reveal = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); reveal.unobserve(e.target) } }), { threshold: 0.08 })
  $$('.reveal').forEach(el => reveal.observe(el))
  const watch = root => $$('[data-anim]', root).forEach(el => io.observe(el))

  function setMotion (on) {
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

  // ── prices (store.js fills window.XionMoney once the catalog loads) ──
  const priceLabel = c => {
    const money = window.XionMoney?.(c.id)
    if (money) return c.tier === 'pro' ? `${money} <small>or Xion+</small>` : money
    return c.tier === 'pro' ? '<span class="gold">Xion+</span>' : 'Free'
  }
  const rarity = c => c.texWidth >= 1024 ? 'Legendary' : c.frames > 1 ? 'Epic' : c.tier === 'pro' ? 'Rare' : 'Common'
  const meta = c => c.texWidth >= 1024 ? `HD · ${c.frames} frames` : c.frames > 1 ? `Animated · ${c.frames} frames` : c.cat

  // ── strips (popular / new) ──
  const pcard = c => `<article class="pcard" data-id="${esc(c.id)}">
    <button class="pshot" type="button" aria-label="Inspect ${esc(c.name)} in 3D"><img data-anim data-id="${esc(c.id)}" data-frames="${c.frames}" data-frame-ms="${c.frameMs || 110}" src="${face(c)}" alt="" loading="lazy" decoding="async">${isNew(c) ? '<span class="pbadge new">NEW</span>' : ''}<span class="pview">VIEW 3D</span></button>
    <div class="pinfo"><span class="rar r-${rarity(c).toLowerCase()}">${rarity(c)}</span><b>${esc(c.name)}</b><small>${esc(meta(c))}</small></div>
    <div class="pfoot"><span class="pprice">${priceLabel(c)}</span><button class="try" type="button" data-wear="${esc(c.id)}">Try on</button></div>
  </article>`
  function renderStrips () {
    const popular = POPULAR.map(byId).filter(Boolean)
    const fresh = capes.filter(isNew)
    $('#popularStrip').innerHTML = popular.map(pcard).join('')
    $('#newStrip').innerHTML = fresh.map(pcard).join('')
    watch($('#popularStrip')); watch($('#newStrip'))
  }
  for (const strip of ['#popularStrip', '#newStrip']) {
    $(strip).addEventListener('click', e => {
      const w = e.target.closest('[data-wear]')
      if (w) return wear(w.dataset.wear, true)
      const card = e.target.closest('.pcard'); if (!card) return
      const c = byId(card.dataset.id); if (c) openCape(c, e.target.closest('button'))
    })
  }

  // ── featured collections carousel ──
  let feat = [], featAt = 0, featTimer = 0
  function renderFeature () {
    const group = name => capes.filter(c => c.cat === name)
    const hd = group('HD Originals')
    feat = [
      { tag: 'NEW · 2.0', name: 'HD Originals', blurb: `${hd.length} creator-made capes at 1024×512 with up to 48 frames. Blue Ruin, Spirit Stag, Crimson Dawn and eight more just surfaced.`, cat: 'New HD', list: SHOWCASE.map(byId).filter(Boolean) },
      { tag: 'HAND-PAINTED', name: 'Anime Nocturne', blurb: 'Painted frame by frame: a moonlit wolf, neon rain, a sunrise torii gate and a tide that rises behind you.', cat: 'Anime', list: group('Anime') },
      { tag: 'IN MOTION', name: 'Animated', blurb: 'Capes that never sit still: flowing gradients, pulsing emblems and drifting stars.', cat: 'Animated', list: capes.filter(c => c.frames > 1 && c.cat !== 'HD Originals' && c.cat !== 'Anime') },
      { tag: 'FREE FOR EVERYONE', name: 'Free capes', blurb: 'Every Xion Launcher player can wear these right now. No account, no purchase.', cat: 'Free', list: capes.filter(c => c.tier !== 'pro') }
    ].filter(f => f.list.length)
    $('#featureTrack').innerHTML = feat.map((f, i) => `<article class="fslide${i === 0 ? ' on' : ''}" data-i="${i}" aria-hidden="${i !== 0}">
      <span class="ftag">${esc(f.tag)}</span><h3>${esc(f.name)}</h3><p>${esc(f.blurb)}</p>
      <div class="fcapes">${f.list.slice(0, 4).map(c => `<button type="button" data-wear="${esc(c.id)}" title="Try ${esc(c.name)} on"><img data-anim data-id="${esc(c.id)}" data-frames="${c.frames}" data-frame-ms="${c.frameMs || 110}" src="${face(c)}" alt="${esc(c.name)}" loading="lazy"></button>`).join('')}</div>
      <a class="flink" href="#capes" data-go-cat="${esc(f.cat)}">Explore ${esc(f.name)} →</a>
    </article>`).join('')
    $('#featureDots').innerHTML = feat.map((f, i) => `<button type="button" class="${i === 0 ? 'on' : ''}" data-fi="${i}" aria-label="${esc(f.name)}"><i></i></button>`).join('')
    watch($('#featureTrack'))
    setFeature(0)
  }
  function setFeature (i) {
    featAt = (i + feat.length) % feat.length
    $$('.fslide').forEach(s => { const on = Number(s.dataset.i) === featAt; s.classList.toggle('on', on); s.setAttribute('aria-hidden', String(!on)) })
    $$('#featureDots button').forEach(b => b.classList.toggle('on', Number(b.dataset.fi) === featAt))
    clearTimeout(featTimer)
    featTimer = setTimeout(() => { if (motion && !document.hidden) setFeature(featAt + 1); else setFeature(featAt) }, 7000)
  }
  $('#featureDots').addEventListener('click', e => { const b = e.target.closest('[data-fi]'); if (b) setFeature(Number(b.dataset.fi)) })
  $('#featureTrack').addEventListener('click', e => { const w = e.target.closest('[data-wear]'); if (w) wear(w.dataset.wear, true) })

  // ── category tiles ──
  const CATS = [
    { cat: 'New HD', name: 'HD Originals', test: c => c.cat === 'HD Originals', pick: 'hd_blue_ruin' },
    { cat: 'Anime', name: 'Anime', test: c => c.cat === 'Anime', pick: 'an_moonwolf' },
    { cat: 'Animated', name: 'Animated', test: c => c.frames > 1, pick: 'hd_changing_moon' },
    { cat: 'Xion+', name: 'Xion+ capes', test: c => c.tier === 'pro', pick: 'hd_kitsune_spirit' },
    { cat: 'Free', name: 'Free capes', test: c => c.tier !== 'pro', pick: null },
    { cat: 'All', name: 'All capes', test: () => true, pick: 'hd_misty_peaks' }
  ]
  function renderTiles () {
    $('#tiles').innerHTML = CATS.map(t => {
      const list = capes.filter(t.test)
      const c = byId(t.pick) || list[0]
      return `<a class="tile reveal" href="#capes" data-go-cat="${esc(t.cat)}"><span class="tile-art">${c ? `<img data-anim data-id="${esc(c.id)}" data-frames="${c.frames}" data-frame-ms="${c.frameMs || 110}" src="${face(c)}" alt="" loading="lazy">` : ''}</span><b>${esc(t.name)}</b><small>${list.length} capes</small></a>`
    }).join('')
    $$('#tiles .reveal').forEach(el => reveal.observe(el))
    watch($('#tiles'))
  }
  document.addEventListener('click', e => {
    const go = e.target.closest('[data-go-cat]'); if (!go) return
    cat = go.dataset.goCat; limit = 24; query = ''; $('#search').value = ''
    buildChips(); renderGrid()
  })

  // ── full catalog ──
  function matches (c) {
    if (cat === 'New HD' && c.cat !== 'HD Originals') return false
    if (cat === 'Anime' && c.cat !== 'Anime') return false
    if (cat === 'Animated' && c.frames < 2) return false
    if (cat === 'Free' && c.tier === 'pro') return false
    if (cat === 'Xion+' && c.tier !== 'pro') return false
    if (!['All', 'New HD', 'Anime', 'Animated', 'Free', 'Xion+'].includes(cat) && c.cat !== cat) return false
    return !query || `${c.name} ${c.cat}`.toLowerCase().includes(query)
  }
  function buildChips () {
    const cats = [...new Set(['All', 'New HD', 'Anime', 'Animated', 'Free', 'Xion+', ...capes.map(c => c.cat).filter(c => c && c !== 'HD Originals' && c !== 'Anime' && c !== 'Animated')])]
    $('#chips').innerHTML = cats.map(n => `<button type="button" data-cat="${esc(n)}" class="${n === cat ? 'on' : ''}" aria-pressed="${n === cat}">${esc(n)}</button>`).join('')
  }
  function renderGrid () {
    $$('#grid [data-anim]').forEach(el => { io.unobserve(el); live.delete(el) })
    const rank = c => (isNew(c) ? 3 : c.cat === 'HD Originals' ? 2 : c.cat === 'Anime' ? 1 : 0)
    const all = capes.filter(matches).sort((a, b) => rank(b) - rank(a))
    const list = all.slice(0, limit)
    $('#empty').hidden = !!list.length
    $('#count').textContent = `${list.length} of ${all.length} capes`
    $('#loadMore').hidden = list.length >= all.length
    $('#grid').innerHTML = list.map(c => `<article class="card in" data-id="${esc(c.id)}">
      <div class="shot"><img data-anim data-id="${esc(c.id)}" data-frames="${c.frames}" data-frame-ms="${c.frameMs || 110}" src="${face(c)}" alt="${esc(c.name)} cape artwork" loading="lazy" decoding="async"><div class="glow"></div>${isNew(c) ? '<span class="pbadge new">NEW</span>' : ''}<button class="cape-open" type="button" aria-label="Inspect ${esc(c.name)} in 3D"><span class="preview-cue">VIEW 3D ↗</span></button></div>
      <span class="${c.tier === 'pro' ? 'pro' : 'free'}">${c.tier === 'pro' ? 'XION+' : 'FREE'}</span>
      <div class="meta"><span class="nm">${esc(c.name)}</span><span class="rarity">${esc(meta(c))}</span></div>
      <button class="try card-try" type="button" data-wear="${esc(c.id)}">Try on</button></article>`).join('')
    watch($('#grid'))
  }
  $('#chips').addEventListener('click', e => {
    const b = e.target.closest('[data-cat]'); if (!b) return
    cat = b.dataset.cat; limit = 24; buildChips(); renderGrid()
  })
  $('#search').addEventListener('input', e => { query = e.target.value.trim().toLowerCase(); limit = 24; renderGrid() })
  $('#loadMore').addEventListener('click', () => { limit += 24; renderGrid() })
  $('#grid').addEventListener('click', e => {
    if (e.target.closest('.card-buy')) return
    const w = e.target.closest('[data-wear]'); if (w) return wear(w.dataset.wear, true)
    const card = e.target.closest('.card'); if (!card) return
    const c = byId(card.dataset.id); if (c) openCape(c, $('.cape-open', card))
  })

  // ── the diver's cape ──
  function wear (id, announce) {
    const c = byId(id); if (!c) return
    const i = SHOWCASE.indexOf(id); if (i >= 0) wearIndex = i
    $('#wearName').textContent = c.name
    $('#wearSwatch').style.backgroundImage = `url("${face(c)}")`
    $$('[data-wear]').forEach(b => b.classList.toggle('on', b.dataset.wear === id))
    window.XionWearing = c
    dispatchEvent(new CustomEvent('xion:wear', { detail: c }))
    if (announce) { $('#wearing').classList.remove('pulse'); void $('#wearing').offsetWidth; $('#wearing').classList.add('pulse') }
  }
  $('#wearNext').addEventListener('click', () => wear(SHOWCASE[++wearIndex % SHOWCASE.length], true))
  $('#wearPrev').addEventListener('click', () => wear(SHOWCASE[(wearIndex = (wearIndex - 1 + SHOWCASE.length) % SHOWCASE.length)], true))

  // ── visitor's own skin ──
  $('#skinForm').addEventListener('submit', async e => {
    e.preventDefault()
    const name = $('#skinName').value.trim()
    if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) { $('#skinMsg').textContent = 'Use a Minecraft name: 3–16 letters, numbers or _.'; return }
    $('#skinMsg').textContent = 'Finding your skin…'
    try {
      const r = await fetch('/api/cosmetics?r=skin&name=' + encodeURIComponent(name))
      if (!r.ok) throw new Error('missing')
      const url = URL.createObjectURL(await r.blob())
      // The API bridge may drop the model header; then the viewer detects slim arms itself.
      const model = r.headers.get('X-Skin-Model')
      dispatchEvent(new CustomEvent('xion:skin', { detail: { url, slim: model ? model === 'slim' : undefined } }))
      $('#skinMsg').textContent = `The diver is now ${name}.`
    } catch { $('#skinMsg').textContent = 'No Java Edition skin found for that name.' }
  })

  // ── 3D inspector ──
  function openCape (c, focus) {
    current = c; previousFocus = focus || document.activeElement
    $('#lbImg').src = face(c)
    $('#lbImg').alt = c.name + ' cape artwork'
    $('#lbCap').textContent = c.name
    $('#modelHint').textContent = 'Loading the 3D preview…'
    $('#lbTier').textContent = c.frames > 1 ? `${c.frames}-frame ${c.texWidth >= 1024 ? 'HD ' : ''}animated cape` : `${c.cat} cape`
    const unlocked = (window.XionAvailable || []).includes(c.id)
    $('#lbBuy').textContent = unlocked ? 'Open my locker' : c.tier === 'pro' ? 'Get this look' : 'Free in Xion Launcher'
    $('#lbNotice').textContent = c.texWidth >= 1024 ? `Original ${c.texWidth}×${c.texHeight} textures · ${c.frameMs} ms per frame · included with Xion+ or sold one by one.` : c.tier === 'pro' ? 'Included with Xion+.' : 'Pick it in the launcher. No purchase needed.'
    $('#lightbox').hidden = false
    document.documentElement.classList.add('preview-lock')
    $('#lbClose').focus()
    $$('[data-model-view]').forEach(b => b.classList.toggle('on', b.dataset.modelView === 'back'))
    dispatchEvent(new CustomEvent('xion:preview', { detail: c }))
  }
  function closeCape () {
    $('#lightbox').hidden = true; current = null
    document.documentElement.classList.remove('preview-lock')
    dispatchEvent(new CustomEvent('xion:preview-close'))
    previousFocus?.focus()
  }
  $('#lbClose').addEventListener('click', closeCape)
  $('#lightbox').addEventListener('click', e => { if (e.target === $('#lightbox')) closeCape() })
  $('#lbWear').addEventListener('click', () => { if (current) { const id = current.id; closeCape(); wear(id, true) } })
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

  // ── section tabs follow the scroll ──
  const tabs = $$('#tabs a')
  const sections = tabs.map(a => $(a.getAttribute('href'))).filter(Boolean)
  function syncTabs () {
    const y = innerHeight * 0.35
    let active = sections[0]
    for (const s of sections) if (s.getBoundingClientRect().top < y) active = s
    tabs.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + active.id))
    $('#nav').classList.toggle('shrunk', scrollY > 30)
  }
  addEventListener('scroll', syncTabs, { passive: true })
  syncTabs()

  // ── frame clock for every animated thumbnail on screen ──
  setInterval(() => {
    if (!motion || document.hidden) return
    const time = performance.now()
    for (const img of live) {
      if (!img.isConnected) { live.delete(img); continue }
      const n = Number(img.dataset.frames)
      if (n < 2) continue
      const f = Math.floor(time / Number(img.dataset.frameMs || 110)) % n
      if (img.dataset.frame !== String(f)) { img.dataset.frame = String(f); img.src = face({ id: img.dataset.id, frames: n }, f) }
    }
    if (current?.frames > 1) {
      const f = Math.floor(time / (current.frameMs || 110)) % current.frames
      if ($('#lbImg').dataset.frame !== String(f)) { $('#lbImg').dataset.frame = String(f); $('#lbImg').src = face(current, f) }
    }
    const w = window.XionWearing
    if (w?.frames > 1) $('#wearSwatch').style.backgroundImage = `url("${face(w, Math.floor(time / (w.frameMs || 110)) % w.frames)}")`
  }, 40)

  async function load () {
    try {
      const r = await fetch('assets/capes/capes.json')
      if (!r.ok) throw new Error('Cape catalog unavailable')
      capes = await r.json()
      capes.forEach(c => { c.frames = c.frames || 1 })
      $('#search').placeholder = `Search ${capes.length} capes…`
      $('#cmpFree').textContent = String(capes.filter(c => c.tier !== 'pro').length)
      $('#cmpAll').textContent = `All ${capes.length}`
      buildChips(); renderGrid(); renderStrips(); renderTiles(); renderFeature()
      const groups = [...new Set(capes.map(c => c.cat))]
      $('#setGrid').innerHTML = groups.map(name => {
        const items = capes.filter(c => c.cat === name)
        return `<article class="set reveal"><span class="n">${items.length} capes</span><h3>${esc(name)}</h3><p>${name === 'Anime' ? 'Hand-painted stories in motion, from moonlit seas to neon nights.' : name === 'HD Originals' ? 'Creator-made 1024×512 capes with up to 48 frames.' : 'Find your signature in the ' + esc(name) + ' collection.'}</p><div class="strip-mini">${items.slice(0, 5).map(c => `<img src="${face(c)}" alt="${esc(c.name)}" loading="lazy">`).join('')}</div></article>`
      }).join('')
      $$('#setGrid .reveal').forEach(el => reveal.observe(el))
      window.XionCapes = capes
      dispatchEvent(new CustomEvent('xion:capes', { detail: capes }))
      wear(SHOWCASE[0])
      const requested = byId(new URLSearchParams(location.search).get('cape'))
      if (requested) { wear(requested.id); openCape(requested) }
    } catch (e) { $('#empty').hidden = false; $('#empty').textContent = 'Could not load the cape collection. Please refresh.'; console.warn(e) }
  }
  // Prices arrive after store.js loads the catalog, and change when the buyer signs in.
  addEventListener('xion:catalog', () => { if (capes.length) renderStrips() })
  window.XionShop = { openCape, wear, get current () { return current } }
  load()
})()
