// Two WebGL contexts at most: one original voxel ocean + player, one reusable product inspector.
// No renderers per product card, no scroll hijacking, no third-party CDN dependency.
import * as THREE from 'three'
import { SkinViewer, IdleAnimation } from 'skinview3d'
import { loadCapeToCanvas } from 'skinview-utils'

const $ = s => document.querySelector(s)
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v))
const images = new Map()
function image(src) {
  if (!images.has(src) && images.size >= 64) images.delete(images.keys().next().value)
  if (!images.has(src)) images.set(src, new Promise((resolve, reject) => {
    const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('Texture unavailable: ' + src)); img.src = src
  }))
  return images.get(src)
}
const files = c => Array.from({ length: c.frames || 1 }, (_, f) => `assets/capes/${c.id}${c.frames > 1 ? '_' + f : ''}.png`)
let motion = window.XionMotion !== false, visible = true, frame = 0, last = 0, progress = 0, smooth = 0
let hero, inspector, modalOpen = false, selected = null, mode = 'back', heroIndex = 0
const showcaseIds = ['hd_fuji_starfall', 'hd_kirin_lightning_dragon', 'hd_demon_red']

class Player {
  constructor(canvas, immersive = false) {
    this.canvas = canvas; this.immersive = immersive; this.frames = []; this.request = 0; this.currentFrame = -1
    this.v = new SkinViewer({ canvas, width: 500, height: 600, renderPaused: true, preserveDrawingBuffer: immersive, pixelRatio: Math.min(devicePixelRatio || 1, 1.25), fov: immersive ? 43 : 40 })
    THREE.ColorManagement.enabled = true
    this.v.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.v.globalLight.intensity = 2.7; this.v.cameraLight.intensity = 0.75
    this.v.animation = new IdleAnimation()
    this.v.controls.enabled = !immersive; this.v.controls.enablePan = false; this.v.controls.enableZoom = !immersive
    this.v.controls.minDistance = 40; this.v.controls.maxDistance = 100
    this.v.controls.addEventListener('change', () => { if (!immersive) this.v.render() })
    this.skinReady = this.v.loadSkin('assets/default-skin.png').then(() => { this.v.skinTexture.colorSpace = THREE.SRGBColorSpace; this.v.skinTexture.needsUpdate = true; schedule(); return true }).catch(() => false)
    this.resize()
    new ResizeObserver(() => { this.resize(); schedule() }).observe(canvas.parentElement)
    canvas.addEventListener('webglcontextlost', () => { if (immersive) $('#sceneStatus').textContent = '3D paused. Your cape collection is still available below.' })
  }
  resize() {
    const box = this.canvas.parentElement.getBoundingClientRect()
    const w = Math.max(1, box.width), h = Math.max(1, box.height)
    this.v.setSize(w, h)
    if (!this.immersive) { this.v.camera.position.set(0, 1, 62); this.v.controls.target.set(0, -2, 0); this.v.controls.update() }
  }
  async cape(c) {
    const request = ++this.request
    const frames = await Promise.all(files(c).map(image))
    if (request !== this.request) return
    if (frames.some(i => i.width !== i.height * 2)) throw new Error('Invalid cape UV texture')
    this.frames = frames; this.frameMs = c.frameMs || 110; this.currentFrame = -1
    await this.v.loadCape(frames[0], { backEquipment: mode === 'elytra' && !this.immersive ? 'elytra' : 'cape' })
    this.v.capeTexture.colorSpace = THREE.SRGBColorSpace; this.v.capeTexture.needsUpdate = true
    schedule()
  }
  tick(now, dt) {
    if (motion) this.v.animation?.update(this.v.playerObject, dt)
    const f = motion ? Math.floor(now / (this.frameMs || 110)) % Math.max(1, this.frames.length) : 0
    if (this.frames.length && f !== this.currentFrame && this.v.capeTexture) {
      this.currentFrame = f
      loadCapeToCanvas(this.v.capeCanvas, this.frames[f]); this.v.capeTexture.needsUpdate = true
    }
  }
}

const box = new THREE.BoxGeometry(1, 1, 1)
function texture(color, seed) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16
  const ctx = canvas.getContext('2d'), base = new THREE.Color(color)
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const n = (Math.sin(x * 51.13 + y * 17.79 + seed) * 4937.51) % 1
    const c = base.clone().multiplyScalar(0.86 + Math.abs(n) * 0.24)
    ctx.fillStyle = '#' + c.getHexString(); ctx.fillRect(x, y, 1, 1)
  }
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter
  return t
}
const materials = new Map()
function material(color) {
  if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ map: texture(color, materials.size * 17), roughness: 0.9 }))
  return materials.get(color)
}
function cube(parent, x, y, z, w, h, d, color) {
  const mesh = new THREE.Mesh(box, material(color)); mesh.position.set(x, y, z); mesh.scale.set(w, h, d); parent.add(mesh); return mesh
}
function batchBlocks(group) {
  const buckets = new Map()
  for (const child of [...group.children]) {
    if (!child.isMesh || child.geometry !== box) continue
    child.updateMatrix()
    if (!buckets.has(child.material)) buckets.set(child.material, [])
    buckets.get(child.material).push(child.matrix.clone())
    group.remove(child)
  }
  for (const [mat, matrices] of buckets) {
    const mesh = new THREE.InstancedMesh(box, mat, matrices.length)
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix))
    group.add(mesh)
  }
}

class Ocean {
  constructor(player) {
    this.p = player; this.kelp = []; this.fish = []; this.reef = new THREE.Group(); this.temple = new THREE.Group()
    const scene = player.v.scene
    scene.add(this.reef, this.temple)
    scene.background = new THREE.Color('#077c91'); scene.fog = new THREE.Fog('#077c91', 65, 230)
    const sun = new THREE.DirectionalLight('#dcfff1', 2.2); sun.position.set(-40, 90, 40); scene.add(sun)
    const blue = new THREE.HemisphereLight('#a8ffe7', '#07343f', 1.8); scene.add(blue)
    // One instanced draw call for the block-built seabed.
    const floor = new THREE.InstancedMesh(box, material('#b5ae76'), 30 * 34), transform = new THREE.Object3D()
    let index = 0
    for (let x = 0; x < 30; x++) for (let z = 0; z < 34; z++) {
      const height = Math.max(1, 3 + Math.round((Math.sin(x * 0.33) + Math.cos(z * 0.29)) * 1.3))
      transform.position.set((x - 15) * 6, -29 + height / 2, 24 - z * 6)
      transform.scale.set(6, height, 6); transform.updateMatrix(); floor.setMatrixAt(index++, transform.matrix)
    }
    scene.add(floor)
    for (let i = 0; i < 23; i++) {
      const g = new THREE.Group(), x = -83 + i * 7.5, z = -8 - (i % 6) * 16, height = 22 + (i % 5) * 6
      g.position.set(x, -25, z)
      for (let j = 0; j < height / 5; j++) {
        cube(g, 0, j * 5, 0, 1.3, 5.2, 1.3, j % 2 ? '#397f4c' : '#499957')
        const leaf = cube(g, (j % 2 ? -1 : 1) * 1.1, j * 5 + 1.1, 0, 2, 4.2, 0.5, '#74b867')
        leaf.rotation.z = (j % 2 ? -1 : 1) * 0.38
      }
      batchBlocks(g); this.reef.add(g); this.kelp.push(g)
    }
    for (let i = 0; i < 14; i++) {
      const x = -76 + i * 12, z = -22 - (i % 4) * 17
      cube(this.reef, x, -24, z, 9, 4, 8, '#647f72')
      const color = ['#cf928c', '#68bab7', '#b0ad67'][i % 3]
      for (let j = 0; j < 3; j++) { cube(this.reef, x + j * 2 - 2, -21 + j, z, 1.7, 7 + j * 2, 1.7, color); cube(this.reef, x + j * 2, -18 + j, z, 4, 1.5, 1.8, color) }
    }
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 24
      cube(this.temple, x, -12, -75, 7, 26, 8, '#2c7d80')
      cube(this.temple, x, 2, -75, 11, 4, 12, '#5babaa')
      if (i < 4) cube(this.temple, x + 12, 6, -75, 24, 5, 9, '#5babaa')
      cube(this.temple, x, -22, -65, 15, 5, 18, '#315f64')
      const light = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: '#b8efce' })); light.position.set(x, -10, -70); light.scale.set(2, 2, 1); this.temple.add(light)
    }
    for (let i = 0; i < 8; i++) {
      const g = new THREE.Group(), color = ['#dfa86c', '#ccd5a6', '#7cd8cc'][i % 3]
      cube(g, 0, 0, 0, 2.3, 1, 0.65, color); const tail = cube(g, -1.5, 0, 0, 0.65, 1.4, 0.15, color)
      cube(g, 0.85, 0.18, 0.36, 0.15, 0.15, 0.1, '#153a43')
      g.position.set(i * 13 - 50, 6 - i * 3, -15 - i * 9); scene.add(g); this.fish.push({ g, tail, base: g.position.clone() })
    }
    const positions = new Float32Array(60 * 3)
    for (let i = 0; i < 60; i++) { positions[i * 3] = Math.sin(i * 7.9) * 70; positions[i * 3 + 1] = i % 40 - 25; positions[i * 3 + 2] = -12 - (i % 8) * 12 }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    this.bubbles = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#c2f6ed', size: 0.32, transparent: true, opacity: 0.45, depthWrite: false })); scene.add(this.bubbles)
    // Caustic light patterns slide across a real 3D plane above the blocks.
    this.caustic = new THREE.Mesh(new THREE.PlaneGeometry(190, 190), new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec2 v; void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'uniform float time;varying vec2 v;void main(){vec2 p=v*65.;float a=sin(p.x+sin(p.y+time*.6));float b=sin(p.y+sin(p.x-time*.4));float l=pow(max(0.,1.-abs(a+b)*2.5),8.);gl_FragColor=vec4(.3,.8,.65,l*.16);}'
    })); this.caustic.rotation.x = -Math.PI / 2; this.caustic.position.set(0, -22.8, -55); scene.add(this.caustic)
    const rayImage = document.createElement('canvas'); rayImage.width = 32; rayImage.height = 128
    const rg = rayImage.getContext('2d'), gradient = rg.createLinearGradient(0, 0, 0, 128)
    gradient.addColorStop(0, '#bfffe940'); gradient.addColorStop(1, '#9cead400'); rg.fillStyle = gradient; rg.fillRect(0, 0, 32, 128)
    const rayTexture = new THREE.CanvasTexture(rayImage)
    for (let i = 0; i < 4; i++) {
      const ray = new THREE.Mesh(new THREE.PlaneGeometry(12, 140), new THREE.MeshBasicMaterial({ map: rayTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }))
      ray.position.set(-65 + i * 37, 37, -55 - i * 8); ray.rotation.z = -0.22; scene.add(ray)
    }
    batchBlocks(this.reef); batchBlocks(this.temple)
    this.temple.visible = false
  }
  update(time, p) {
    const deep = clamp((p - 0.45) * 2.5)
    const color = new THREE.Color('#098b9b').lerp(new THREE.Color('#053545'), deep)
    const v = this.p.v; v.scene.background.copy(color); v.scene.fog.color.copy(color)
    this.temple.visible = deep > 0.12; this.reef.visible = deep < 0.92
    this.kelp.forEach((g, i) => { g.rotation.z = Math.sin(time * 0.6 + i) * 0.035 })
    this.fish.forEach(({ g, tail, base }, i) => { g.position.x = base.x + Math.sin(time * 0.23 + i) * 17; g.position.y = base.y + Math.sin(time * 0.5 + i) * 1.2; tail.rotation.y = Math.sin(time * 5 + i) * 0.5 })
    this.bubbles.position.y = (time * 0.7) % 14
    this.caustic.material.uniforms.time.value = time
    const mobile = innerWidth < 760
    v.playerWrapper.position.set(mobile ? 0 : 19, mobile ? 4 : -2, 0)
    v.playerWrapper.rotation.y = p < 0.5 ? 0.35 + clamp(p * 3) * Math.PI : Math.PI + 0.3 - clamp((p - 0.55) * 3) * Math.PI
    v.playerWrapper.position.y += Math.sin(time * 0.9) * 0.5
    v.camera.position.set(Math.sin(time * 0.17) * 0.6, 4 + deep * -3, mobile ? 98 : 63 + deep * 4)
    v.camera.lookAt(0, 0, -4)
  }
}
let world
function readScroll() {
  const r = $('#journey').getBoundingClientRect(), range = Math.max(1, r.height - innerHeight + 70)
  progress = clamp(-r.top / range)
  const chapter = Math.min(2, Math.floor(progress * 3))
  document.querySelectorAll('[data-chapter]').forEach(el => { const active = Number(el.dataset.chapter) === chapter; el.classList.toggle('active', active); el.setAttribute('aria-hidden', String(!active)) })
  document.querySelectorAll('[data-chapter-jump]').forEach(el => el.classList.toggle('active', Number(el.dataset.chapterJump) === chapter))
  $('.dive-heading')?.style.setProperty('--heading-opacity', String(clamp(1 - progress * 2.2)))
  $('.hud-float').classList.toggle('active', chapter === 2)
  $('.explorer-tag').classList.toggle('submerged', chapter > 0)
  $('#diveHint').textContent = chapter === 2 ? 'Your adventure starts below' : 'Scroll to dive deeper'
  $('#nav').classList.toggle('shrunk', scrollY > 40)
  schedule()
}
function schedule() { if (!frame && !document.hidden) frame = requestAnimationFrame(tick) }
function tick(now) {
  frame = 0
  const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016); last = now
  smooth += (progress - smooth) * (motion ? Math.min(1, dt * 8) : 1)
  const heroActive = visible && !modalOpen && !document.documentElement.classList.contains('shop-lock')
  if (hero && heroActive) { world.update(motion ? now / 1000 : 0, smooth); hero.tick(now, dt); hero.v.render() }
  if (inspector && modalOpen) { inspector.tick(now, dt); inspector.v.controls.update(); inspector.v.render() }
  if (motion && (heroActive || modalOpen)) schedule()
}
async function setShowcase() {
  const c = window.XionCapes?.find(c => c.id === showcaseIds[heroIndex % showcaseIds.length]) || { id: 'an_tide', name: 'Moon Tide', frames: 8 }
  $('#heroCapeName').textContent = c.name
  $('#heroCapeSwitch small').textContent = `${c.texWidth >= 1024 ? 'HD · ' : 'LIVE · '}${c.frames} FRAMES`
  try { const [skin] = await Promise.all([hero?.skinReady, hero?.cape(c)]); if (!skin) throw new Error('Skin unavailable'); $('#sceneStatus').textContent = ''; $('#oceanCanvas').dataset.ready = 'true' } catch (e) { $('#sceneStatus').textContent = 'The cape preview is unavailable. Browse the collection below.'; console.warn(e) }
}
try {
  hero = new Player($('#oceanCanvas'), true); world = new Ocean(hero)
  setShowcase(); schedule()
} catch (e) { $('#sceneStatus').textContent = '3D is unavailable on this browser. Cape artwork and checkout still work below.'; console.warn(e) }
addEventListener('xion:capes', setShowcase)
$('#heroCapeSwitch').addEventListener('click', () => { heroIndex++; setShowcase() })
document.querySelectorAll('[data-chapter-jump]').forEach(b => b.addEventListener('click', () => {
  const rect = $('#journey').getBoundingClientRect(), range = rect.height - innerHeight + 70
  scrollTo({ top: scrollY + rect.top + Number(b.dataset.chapterJump) / 3 * range + 50, behavior: motion ? 'smooth' : 'auto' })
}))
addEventListener('scroll', readScroll, { passive: true })
addEventListener('resize', readScroll)
new IntersectionObserver(entries => { visible = entries[0].isIntersecting; last = 0; schedule() }).observe($('#journey'))
addEventListener('xion:motion', e => { motion = e.detail; last = 0; schedule() })
document.addEventListener('visibilitychange', () => { last = 0; if (document.hidden) { cancelAnimationFrame(frame); frame = 0 } else schedule() })
new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
async function openInspector(c) {
  selected = c; modalOpen = true; mode = 'back'
  try {
    if (!inspector) inspector = new Player($('#previewCanvas'))
    inspector.resize(); inspector.v.playerWrapper.rotation.y = Math.PI + 0.35
    const [skin] = await Promise.all([inspector.skinReady, inspector.cape(selected)]); if (!skin) throw new Error('Skin unavailable'); $('#modelHint').textContent = 'Drag to rotate · scroll to zoom'; schedule()
  } catch (e) { $('#modelHint').textContent = '3D unavailable. The original artwork is shown alongside.'; console.warn(e) }
}
addEventListener('xion:preview', e => openInspector(e.detail))
addEventListener('xion:preview-close', () => { modalOpen = false; last = 0; schedule() })
addEventListener('xion:model-view', e => {
  mode = e.detail
  if (!inspector) return
  inspector.v.playerWrapper.rotation.y = mode === 'front' ? 0 : Math.PI + 0.35
  inspector.v.playerObject.backEquipment = mode === 'elytra' ? 'elytra' : 'cape'
  inspector.v.render(); schedule()
})
addEventListener('pagehide', e => { if (!e.persisted) { cancelAnimationFrame(frame); hero?.v.dispose(); inspector?.v.dispose() } })
readScroll()
if (!$('#lightbox').hidden && window.XionShop?.current) openInspector(window.XionShop.current)
// Local build tooling uses this to render original Minecraft-like background images/fallbacks.
window.XionOcean = {
  hero, get progress() { return progress },
  get inspector() { return inspector },
  async poster(deep = false) {
    if (!hero) throw new Error('3D renderer unavailable')
    const v = hero.v, previous = v.playerWrapper.visible
    v.playerWrapper.visible = false; world.update(10, deep ? 0.85 : 0); v.camera.position.set(0, 3, 65); v.camera.lookAt(0, 0, -35); v.render()
    const blob = await new Promise(resolve => hero.canvas.toBlob(resolve, 'image/jpeg', 0.88))
    v.playerWrapper.visible = previous; schedule(); return blob
  }
}
