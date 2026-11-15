// Xion Shop: every cape, animated in place. No build step, no dependencies.
(() => {
  const $ = (s, r = document) => r.querySelector(s)
  const $$ = (s, r = document) => [...r.querySelectorAll(s)]
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const FRAME_MS = 110

  let capes = []
  let cat = 'All'
  let query = ''

  // ── data ──
  const load = async () => {
    try {
      const r = await fetch('assets/capes/capes.json', { cache: 'force-cache' })
      capes = await r.json()
    } catch { capes = [] }
    capes.forEach(c => { c.animated = (c.frames || 1) > 1 })
    buildChips()
    renderGrid()
    buildSets()
    startCapeTicker()
    countUp()
  }

  const file = (c, f = 0) => `assets/capes/${c.id}${c.frames > 1 ? '_' + f : ''}.png`
  const pro = c => c.tier === 'pro'

  // ── chips ──
  function buildChips () {
    const cats = ['All', 'Anime', 'Animated', 'Free', 'Xion+', ...new Set(capes.map(c => c.cat).filter(Boolean))]
    const seen = new Set()
    const list = cats.filter(c => (seen.has(c) ? false : (seen.add(c), true)))
    $('#chips').innerHTML = list.map(n => `<button data-cat="${esc(n)}" class="${n === cat ? 'on' : ''}">${esc(n)}</button>`).join('')
  }

  const matches = c => {
    if (cat === 'Anime' && c.cat !== 'Anime') return false
    if (cat === 'Animated' && !c.animated) return false
    if (cat === 'Free' && pro(c)) return false
    if (cat === 'Xion+' && !pro(c)) return false
    if (!['All', 'Anime', 'Animated', 'Free', 'Xion+'].includes(cat) && c.cat !== cat) return false
    if (query && !(c.name || '').toLowerCase().includes(query)) return false
    return true
  }

  // ── grid ──
  const seen = new WeakSet()
  function renderGrid () {
    const list = capes.filter(matches).sort((a, b) => (a.cat === 'Anime' ? -1 : 0) - (b.cat === 'Anime' ? -1 : 0))
    $('#empty').hidden = list.length > 0
    $('#count').textContent = list.length ? `${list.length} cape${list.length === 1 ? '' : 's'} shown` : ''
    $('#grid').innerHTML = list.map((c, i) => `
      <article class="card" data-id="${esc(c.id)}" data-frames="${c.frames || 1}" data-name="${esc(c.name)}" data-cat="${esc(c.cat)}" style="animation-delay:${Math.min(i * 18, 320)}ms">
        <div class="shot"><img src="${file(c, 0)}" alt="${esc(c.name)} cape" loading="lazy" decoding="async"><div class="glow"></div></div>
        ${pro(c) ? '<span class="pro">XION+</span>' : '<span class="free">FREE</span>'}
        <div class="meta"><span class="nm">${esc(c.name)}</span><span class="rarity">${esc(c.cat || '')}</span></div>
      </article>`).join('')
    $$('#grid .card').forEach(el => {
      if (!seen.has(el)) { seen.add(el); io.observe(el) }
    })
  }

  // Reveal cards as they scroll in, and only animate the ones on screen.
  const live = new Set()
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('in')
        live.add(e.target)
      } else {
        live.delete(e.target)
      }
    }
  }, { rootMargin: '120px 0px', threshold: 0.05 })

  let frame = 0
  function startCapeTicker () {
    setInterval(() => {
      frame++
      for (const el of live) {
        const n = +el.dataset.frames
        if (!n || n < 2) continue
        const img = el.querySelector('img')
        if (img) img.src = file({ id: el.dataset.id, frames: n }, frame % n)
      }
      // Hero showcase: three different capes, out of phase.
      cycle($('#heroA'), 'an_moonwolf', 8, frame)
      cycle($('#heroB'), 'an_sunrise', 8, frame + 3)
      cycle($('#heroC'), 'an_neonrain', 8, frame + 5)
    }, FRAME_MS)
  }
  function cycle (img, id, frames, f) {
    if (!img) return
    const next = `assets/capes/${id}_${((f % frames) + frames) % frames}.png`
    if (!img.src.endsWith(next)) img.src = next
  }

  // ── sets ──
  const TINT = { Anime: '#8b5cf6', Animated: '#f472b6', Space: '#8fb3ff', Gradient: '#6ee7a8', Emblem: '#f5c86b', Pattern: '#f472b6', Marble: '#c9d6ff', Camo: '#6ee7a8' }
  function buildSets () {
    const sets = new Map()
    for (const c of capes) {
      const k = c.cat || 'Other'
      if (!sets.has(k)) sets.set(k, [])
      sets.get(k).push(c)
    }
    const order = ['Anime', 'Animated', 'Space', 'Gradient', 'Emblem', 'Pattern', 'Marble', 'Camo']
    const sorted = [...sets.entries()].sort((a, b) => {
      const ia = order.indexOf(a[0]); const ib = order.indexOf(b[0])
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
    })
    $('#setGrid').innerHTML = sorted.map(([name, list]) => `
      <article class="set reveal" style="--tint:${TINT[name] || '#8b5cf6'}">
        <span class="n">${list.length} capes</span>
        <h3>${esc(name)}</h3>
        <p>${esc(describe(name, list))}</p>
        <div class="strip">${list.slice(0, 6).map(c => `<img src="${file(c, 0)}" alt="" loading="lazy">`).join('')}</div>
      </article>`).join('')
    $$('#setGrid .reveal').forEach(el => revealIO.observe(el))
  }
  function describe (name, list) {
    if (name === 'Anime') return 'Hand-painted animated capes: a torii gate at sunrise, falling autumn leaves, neon rain, a moonlit wolf, starfall and more. Eight frames each, listed first in the locker.'
    if (name === 'Animated') return 'Every cape that moves — ' + list.length + ' of them, all cycling in game.'
    if (name === 'Space') return 'Galaxies, nebulas and planets drifting across your back.'
    if (name === 'Gradient') return 'Clean colour fades: midnight, ocean, sunset, mint and cherry.'
    if (name === 'Emblem') return 'Bold crests and marks, readable from across the spawn.'
    if (name === 'Pattern') return 'Stripes, checks and geometric repeats for a flatter look.'
    if (name === 'Marble') return 'Stone and marble textures with veins running through them.'
    if (name === 'Camo') return 'Camo patterns for the players who would rather not be seen.'
    return 'More capes from the locker.'
  }

  // ── counters ──
  function countUp () {
    const total = capes.length || 136
    $$('[data-count]').forEach(el => {
      const target = +el.dataset.count === 136 ? total : +el.dataset.count
      let n = 0
      const step = Math.max(1, Math.round(target / 34))
      const t = setInterval(() => {
        n += step
        if (n >= target) { n = target; clearInterval(t) }
        el.textContent = n
      }, 26)
    })
  }

  // ── interactions ──
  $('#chips').addEventListener('click', e => {
    const b = e.target.closest('[data-cat]'); if (!b) return
    cat = b.dataset.cat
    $$('#chips button').forEach(x => x.classList.toggle('on', x === b))
    renderGrid()
  })
  let typing
  $('#search').addEventListener('input', e => {
    clearTimeout(typing)
    typing = setTimeout(() => { query = e.target.value.trim().toLowerCase(); renderGrid() }, 120)
  })

  // Lightbox
  const lb = $('#lightbox')
  $('#grid').addEventListener('click', e => {
    const card = e.target.closest('.card'); if (!card) return
    const cape = capes.find(c => c.id === card.dataset.id)
    if (!cape) return
    $('#lbImg').src = file(cape, 0)
    $('#lbCap').textContent = `${cape.name} · ${cape.cat || ''}${pro(cape) ? ' · Xion+' : ' · Free'}`
    lb.hidden = false
    let f = 0
    clearInterval(lb.timer)
    if (cape.frames > 1) lb.timer = setInterval(() => { f = (f + 1) % cape.frames; $('#lbImg').src = file(cape, f) }, FRAME_MS)
  })
  const close = () => { lb.hidden = true; clearInterval(lb.timer) }
  $('#lbClose').addEventListener('click', close)
  lb.addEventListener('click', e => { if (e.target === lb) close() })
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !lb.hidden) close() })

  // Reveal on scroll
  const revealIO = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target) }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 })
  $$('.reveal').forEach(el => revealIO.observe(el))

  // Nav shrink + hero parallax
  const nav = $('#nav')
  let ticking = false
  addEventListener('scroll', () => {
    if (ticking) return
    ticking = true
    requestAnimationFrame(() => {
      nav.classList.toggle('shrunk', scrollY > 40)
      const stage = $('.hero-stage')
      if (stage && scrollY < 900) stage.style.transform = `translateY(${scrollY * 0.06}px)`
      ticking = false
    })
  }, { passive: true })

  // Cursor glow
  const glow = $('.cursor-glow')
  addEventListener('pointermove', e => {
    glow.style.left = e.clientX + 'px'
    glow.style.top = e.clientY + 'px'
  }, { passive: true })

  // Card tilt
  $$('[data-tilt]').forEach(el => {
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width - 0.5
      const y = (e.clientY - r.top) / r.height - 0.5
      el.style.transform = `perspective(700px) rotateY(${x * 12}deg) rotateX(${-y * 12}deg) translateY(-4px)`
    })
    el.addEventListener('pointerleave', () => { el.style.transform = '' })
  })

  load()
})()
