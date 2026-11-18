// The Deep: one fixed WebGL ocean behind the whole shop. Scrolling the page dives the camera from
// the sunlit surface past a coral shelf, a kelp forest and an ocean monument down to the abyss,
// while a swimming player wears the cape picked with "Try on". A second, on-demand viewer powers
// the cape inspector. Everything is drawn from cubes in code; no outside models or CDNs.
import * as THREE from 'three'
import { SkinViewer, IdleAnimation, PlayerAnimation } from 'skinview3d'
import { loadCapeToCanvas } from 'skinview-utils'

const $ = s => document.querySelector(s)
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v))
const lerp = (a, b, t) => a + (b - a) * t
const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t) }

// Camera depth range in world units; the page scroll maps onto it.
const TOP = 34, BOTTOM = -330
const ZONES = [[0, 'Sunlit shallows'], [0.16, 'Coral shelf'], [0.38, 'Kelp forest'], [0.58, 'Monument ruins'], [0.8, 'The abyss']]
const WATER = [[0, '#3cc3d4'], [0.18, '#1693a9'], [0.4, '#0d6b84'], [0.6, '#0a4a63'], [0.8, '#062c42'], [1, '#020c18']]

const images = new Map()
function image (src) {
  if (!images.has(src) && images.size >= 120) images.delete(images.keys().next().value)
  if (!images.has(src)) {
    images.set(src, new Promise((resolve, reject) => {
      const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('Texture unavailable: ' + src)); img.src = src
    }))
  }
  return images.get(src)
}
const files = c => Array.from({ length: c.frames || 1 }, (_, f) => `assets/capes/${c.id}${c.frames > 1 ? '_' + f : ''}.png`)

let motion = window.XionMotion !== false
let raf = 0, last = 0, modalOpen = false, mode = 'back'
let depth = 0, depthSmooth = 0, stroke = 0, dir = 1
// Critically damped springs (Unity-style SmoothDamp): no overshoot, no jitter from wheel steps.
const springs = { depth: { v: 0 }, stroke: { v: 0 }, pitch: { v: 0 }, yaw: { v: 0 } }
function damp (cur, target, st, time, dt) {
  const omega = 2 / Math.max(0.0001, time), x = omega * dt, exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  const change = cur - target, temp = (st.v + omega * change) * dt
  st.v = (st.v - omega * temp) * exp
  return target + (change + temp) * exp
}

// ── swimming: treading water when still, a head-first dive while the page scrolls ──
class SwimDive extends PlayerAnimation {
  constructor () { super(); this.stroke = 0; this.dir = 1 }
  animate (player) {
    const t = this.progress, s = this.stroke, up = this.dir < 0
    const sk = player.skin
    // Treading: wide slow sweeps. Diving: arms stretched past the head with a quick flutter.
    const sweep = Math.sin(t * 2.1)
    const treadZ = 0.55 + sweep * 0.35, treadX = Math.sin(t * 2.1 + 1.2) * 0.45
    const diveX = (up ? -2.6 : -2.95) + Math.sin(t * 7) * 0.12
    sk.leftArm.rotation.x = lerp(treadX, diveX, s)
    sk.rightArm.rotation.x = lerp(-treadX, diveX, s)
    sk.leftArm.rotation.z = lerp(treadZ, 0.18, s)
    sk.rightArm.rotation.z = -lerp(treadZ, 0.18, s)
    // Flutter kick: faster and wider when diving.
    const kick = t * lerp(3.4, 9, s), amp = lerp(0.32, 0.5, s)
    sk.leftLeg.rotation.x = Math.sin(kick) * amp
    sk.rightLeg.rotation.x = Math.sin(kick + Math.PI) * amp
    sk.leftLeg.rotation.z = 0.04; sk.rightLeg.rotation.z = -0.04
    // Look around while floating, look where you are going while diving.
    sk.head.rotation.y = Math.sin(t * 0.55) * 0.45 * (1 - s)
    sk.head.rotation.x = lerp(Math.sin(t * 0.4) * 0.12, up ? 0.5 : -0.65, s)
    // The cape floats up in the water and streams behind on a dive.
    player.cape.rotation.x = 0.32 + Math.sin(t * 1.6) * 0.16 + s * 0.95 + Math.sin(t * 9) * 0.05 * s
    player.cape.rotation.z = Math.sin(t * 1.1) * 0.05
    player.rotation.z = Math.sin(t * 0.8) * 0.05
  }
}

// ── shared voxel helpers ──
const box = new THREE.BoxGeometry(1, 1, 1)
function noiseTexture (seed = 1) {
  const c = document.createElement('canvas'); c.width = c.height = 16
  const g = c.getContext('2d')
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const n = Math.abs(Math.sin(x * 51.13 + y * 17.79 + seed) * 4937.51) % 1
      const v = Math.round(200 + n * 55); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, y, 1, 1)
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true
  return t
}
const stoneMat = new THREE.MeshStandardMaterial({ map: noiseTexture(3), roughness: 0.95 })
const plantMat = new THREE.MeshStandardMaterial({ map: noiseTexture(9), roughness: 0.8 })
const glowMat = new THREE.MeshBasicMaterial({ map: noiseTexture(5), toneMapped: false })

/** Collects cubes, then builds one InstancedMesh per material with per-cube colours. */
class Blocks {
  constructor () { this.list = [] }
  add (x, y, z, w, h, d, color, mat = stoneMat) { this.list.push({ x, y, z, w, h, d, color: new THREE.Color(color), mat }); return this }
  build (parent) {
    const groups = new Map()
    for (const b of this.list) { if (!groups.has(b.mat)) groups.set(b.mat, []); groups.get(b.mat).push(b) }
    const o = new THREE.Object3D(), meshes = []
    for (const [mat, list] of groups) {
      const mesh = new THREE.InstancedMesh(box, mat, list.length)
      list.forEach((b, i) => { o.position.set(b.x, b.y, b.z); o.scale.set(b.w, b.h, b.d); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix); mesh.setColorAt(i, b.color) })
      parent.add(mesh); meshes.push(mesh)
    }
    return meshes
  }
}
const rnd = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647 } })()
const pick = list => list[Math.floor(rnd() * list.length)]

// ── the player viewer (used for the diver and for the inspector) ──
class Player {
  constructor (canvas, { immersive = false } = {}) {
    this.canvas = canvas; this.immersive = immersive; this.frames = []; this.request = 0; this.currentFrame = -1
    const small = innerWidth < 760
    this.v = new SkinViewer({ canvas, width: 300, height: 300, renderPaused: true, pixelRatio: Math.min(devicePixelRatio || 1, immersive ? (small ? 1.25 : 1.5) : 1.75), fov: immersive ? 40 : 38 })
    this.v.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.v.globalLight.intensity = immersive ? 1.6 : 2.7
    this.v.cameraLight.intensity = immersive ? 0.9 : 0.75
    this.v.controls.enabled = !immersive; this.v.controls.enablePan = false; this.v.controls.enableZoom = !immersive
    this.v.controls.minDistance = 40; this.v.controls.maxDistance = 100
    this.v.controls.addEventListener('change', () => { if (!immersive) schedule() })
    if (immersive) { this.anim = new SwimDive(); this.v.animation = this.anim } else this.v.animation = new IdleAnimation()
    this.skinReady = this.skin('assets/default-skin.png')
    this.resize()
    new ResizeObserver(() => { this.resize(); schedule() }).observe(immersive ? document.documentElement : canvas.parentElement)
  }
  async skin (src, slim) {
    try {
      await this.v.loadSkin(src, { model: slim === undefined ? 'auto-detect' : slim ? 'slim' : 'default' })
      this.v.skinTexture.colorSpace = THREE.SRGBColorSpace; this.v.skinTexture.needsUpdate = true; schedule(); return true
    } catch { return false }
  }
  resize () {
    const w = this.immersive ? innerWidth : Math.max(1, this.canvas.parentElement.clientWidth)
    const h = this.immersive ? innerHeight : Math.max(1, this.canvas.parentElement.clientHeight)
    this.v.setSize(w, h)
    if (!this.immersive) { this.v.camera.position.set(0, 1, 62); this.v.controls.target.set(0, -2, 0); this.v.controls.update() }
  }
  async cape (c, backEquipment = 'cape') {
    const request = ++this.request
    const frames = await Promise.all(files(c).map(image))
    if (request !== this.request) return
    if (frames.some(i => i.width !== i.height * 2)) throw new Error('Invalid cape UV texture')
    this.frames = frames; this.frameMs = c.frameMs || 110; this.currentFrame = -1
    await this.v.loadCape(frames[0], { backEquipment })
    this.v.capeTexture.colorSpace = THREE.SRGBColorSpace; this.v.capeTexture.needsUpdate = true
    schedule()
  }
  tick (now, dt) {
    if (motion) this.v.animation?.update(this.v.playerObject, dt)
    const f = motion ? Math.floor(now / (this.frameMs || 110)) % Math.max(1, this.frames.length) : 0
    if (this.frames.length && f !== this.currentFrame && this.v.capeTexture) {
      this.currentFrame = f
      loadCapeToCanvas(this.v.capeCanvas, this.frames[f]); this.v.capeTexture.needsUpdate = true
    }
  }
}

// ── the ocean ──
class Ocean {
  constructor (player) {
    this.p = player
    const v = player.v, scene = v.scene
    this.scene = scene
    scene.background = new THREE.Color(WATER[0][1])
    scene.fog = new THREE.Fog(WATER[0][1], 40, 320)
    this.sun = new THREE.DirectionalLight('#e6fff6', 2.4); this.sun.position.set(-60, 120, 60); scene.add(this.sun)
    this.hemi = new THREE.HemisphereLight('#b4fff0', '#06303c', 2); scene.add(this.hemi)
    // The diver's lamp: barely there near the surface, the only warm light in the abyss.
    this.lamp = new THREE.PointLight('#8ff7ff', 0, 90, 1.4); scene.add(this.lamp)
    this.world = new THREE.Group(); scene.add(this.world)
    const aniso = Math.min(8, v.renderer.capabilities.getMaxAnisotropy())
    for (const m of [stoneMat, plantMat, glowMat]) { m.map.anisotropy = aniso; m.map.needsUpdate = true }
    this.kelp = []; this.fish = []; this.jellies = []; this.vents = []
    this.buildSurface(); this.buildCliff(); this.buildShelf(); this.buildKelpForest(); this.buildMonument(); this.buildAbyss()
    this.buildFish(); this.buildSnow(); this.buildBubbles()
  }

  buildSurface () {
    // The underside of the sea surface: bright moving ripples you look up at from the shallows.
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, fade: { value: 1 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 v; void main(){ v = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float time; uniform float fade; varying vec2 v;
        void main(){ vec2 p = v * 150.0; float a = sin(p.x + sin(p.y * 0.8 + time * 0.7) * 1.6); float b = sin(p.y * 1.1 + sin(p.x * 0.9 - time * 0.5) * 1.4);
          float l = pow(max(0.0, 1.0 - abs(a + b) * 0.9), 3.0); float edge = 1.0 - smoothstep(0.25, 0.5, distance(v, vec2(0.5)));
          gl_FragColor = vec4(mix(vec3(0.6, 0.93, 0.95), vec3(0.96, 1.0, 1.0), l), (0.22 + l * 0.5) * edge * fade); }`
    })
    this.surface = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), mat)
    this.surface.rotation.x = Math.PI / 2; this.surface.position.set(0, 58, -120); this.world.add(this.surface)
    // Sun shafts slanting down through the water.
    const c = document.createElement('canvas'); c.width = 16; c.height = 256
    const g = c.getContext('2d'), grad = g.createLinearGradient(0, 0, 0, 256)
    grad.addColorStop(0, 'rgba(220,255,248,0.55)'); grad.addColorStop(1, 'rgba(160,240,230,0)')
    g.fillStyle = grad; g.fillRect(0, 0, 16, 256)
    const tex = new THREE.CanvasTexture(c)
    this.rays = []
    for (let i = 0; i < 7; i++) {
      const ray = new THREE.Mesh(new THREE.PlaneGeometry(10 + (i % 3) * 7, 260), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0.9 }))
      ray.position.set(-110 + i * 36, -70, -60 - (i % 3) * 22); ray.rotation.z = -0.24; ray.userData.phase = i * 1.7
      this.world.add(ray); this.rays.push(ray)
    }
  }

  buildCliff () {
    // A voxel cliff behind everything, its rock changing with depth: sand, stone, prismarine, deepslate.
    const b = new Blocks()
    const band = y => y > -40 ? ['#d3c38a', '#c7b47a', '#bfae7c'] : y > -140 ? ['#6f8079', '#62756f', '#7a8a7c', '#5d7a62'] : y > -240 ? ['#3f8f86', '#4c9d8f', '#357a73', '#5aa99b'] : ['#2a3440', '#232c37', '#303a47']
    for (let x = -170; x <= 170; x += 10) {
      for (let y = 50; y >= -350; y -= 10) {
        const n = Math.sin(x * 0.07) * Math.cos(y * 0.05) + Math.sin(x * 0.021 + y * 0.03)
        b.add(x, y, -135 + n * 8, 10, 10, 14 + Math.abs(n) * 6, pick(band(y)))
      }
    }
    b.build(this.world)
  }

  buildShelf () {
    // Coral shelf: a sandy ledge reaching toward the diver, covered in corals, kelp and sea pickles.
    const b = new Blocks(), top = -62
    for (let x = -170; x <= 170; x += 10) {
      for (let z = -125; z <= -25; z += 10) {
        const h = 10 + Math.round(Math.abs(Math.sin(x * 0.05 + z * 0.08)) * 2) * 4
        b.add(x, top - h / 2, z, 10, h, 10, pick(['#d6c98f', '#cdbd83', '#c4b47c']))
      }
    }
    const coral = ['#ff7a8a', '#ffb347', '#c86bff', '#4fd1ff', '#ffe066', '#ff5fa2']
    for (let i = 0; i < 46; i++) {
      const x = -160 + rnd() * 320, z = -118 + rnd() * 86, col = pick(coral)
      if (Math.abs(x - 26) < 18 && z > -50) continue
      const kind = i % 3
      if (kind === 0) { // branching coral
        b.add(x, top + 4, z, 2, 8, 2, col, plantMat).add(x - 2.5, top + 7, z, 3, 2, 2, col, plantMat).add(x + 2.5, top + 9, z, 3, 2, 2, col, plantMat).add(x - 3.5, top + 10, z, 2, 4, 2, col, plantMat).add(x + 3.5, top + 12, z, 2, 4, 2, col, plantMat)
      } else if (kind === 1) { // brain coral block
        b.add(x, top + 3, z, 6, 6, 6, col, plantMat)
      } else { // fan
        b.add(x, top + 5, z, 7, 9, 1, col, plantMat)
      }
    }
    for (let i = 0; i < 18; i++) b.add(-150 + rnd() * 300, top + 1.4, -110 + rnd() * 80, 1.6, 2.8, 1.6, '#c8ff8a', glowMat) // sea pickles
    b.build(this.world)
    for (let i = 0; i < 16; i++) this.addKelp(-160 + i * 21 + rnd() * 6, top, -100 + rnd() * 50, 6 + Math.floor(rnd() * 6))
  }

  addKelp (x, y, z, segments) {
    const g = new THREE.Group(); g.position.set(x, y, z)
    const b = new Blocks()
    for (let j = 0; j < segments; j++) {
      b.add(0, j * 5 + 2.5, 0, 1.4, 5.2, 1.4, j % 2 ? '#2f7a45' : '#3f9454', plantMat)
      b.add((j % 2 ? -1 : 1) * 1.3, j * 5 + 3, 0, 2.2, 3.6, 0.5, '#6dbb5f', plantMat)
    }
    b.build(g); this.world.add(g); this.kelp.push(g)
  }

  buildKelpForest () {
    // Kelp climbing the cliff and drifting ledges between the shelf and the monument.
    const b = new Blocks()
    for (let i = 0; i < 9; i++) {
      const y = -95 - i * 12 - rnd() * 8, x = -150 + i * 36, z = -112 + rnd() * 18
      for (let k = -2; k <= 2; k++) b.add(x + k * 8, y, z, 8, 6, 14, pick(['#5f746c', '#556b63', '#6a7f74']))
      for (let k = 0; k < 3; k++) this.addKelp(x - 8 + k * 8, y + 3, z + 2, 7 + Math.floor(rnd() * 7))
    }
    b.build(this.world)
  }

  buildMonument () {
    // An original ocean monument: prismarine pillars, arches and glowing sea lanterns.
    const b = new Blocks(), base = -225
    for (let x = -150; x <= 150; x += 10) for (let z = -125; z <= -35; z += 10) b.add(x, base - 5, z, 10, 10, 10, pick(['#3e8e86', '#4a9c90', '#357d75']))
    const lanterns = []
    for (let i = 0; i < 7; i++) {
      const x = -120 + i * 40, z = i % 2 ? -100 : -80
      const h = 30 + (i % 3) * 10
      b.add(x, base + h / 2, z, 8, h, 8, pick(['#2f7f80', '#3b928e']))
      b.add(x, base + h + 2, z, 12, 4, 12, '#5fb3a8')
      if (i < 6) b.add(x + 20, base + h + 6, z, 32, 4, 9, '#5fb3a8')
      lanterns.push([x, base + h - 6, z + 5])
    }
    for (let x = -110; x <= 110; x += 44) { b.add(x, base + 2, -55, 14, 4, 14, '#2f6f6c'); b.add(x, base + 6, -55, 4, 4, 4, '#d6fff2', glowMat) }
    for (const [x, y, z] of lanterns) b.add(x, y, z, 4, 4, 1.2, '#e8fff8', glowMat)
    b.build(this.world)
    this.monumentLights = [new THREE.PointLight('#9ff0dd', 0, 140, 1.2), new THREE.PointLight('#9ff0dd', 0, 140, 1.2)]
    this.monumentLights[0].position.set(-40, base + 20, -60); this.monumentLights[1].position.set(70, base + 20, -60)
    this.monumentLights.forEach(l => this.world.add(l))
  }

  buildAbyss () {
    // The bottom: dark rock, glowing vents with bubble columns, bioluminescent spots and jellies.
    const b = new Blocks(), floor = -352
    for (let x = -170; x <= 170; x += 10) {
      for (let z = -130; z <= 20; z += 10) {
        const h = 10 + Math.round(Math.abs(Math.sin(x * 0.04) * Math.cos(z * 0.06)) * 3) * 5
        b.add(x, floor - 5 + h / 2, z, 10, h, 10, pick(['#1c2430', '#222b38', '#171e29']))
      }
    }
    for (let i = 0; i < 5; i++) {
      const x = -130 + i * 62, z = -90 + (i % 2) * 30
      b.add(x, floor + 10, z, 8, 6, 8, '#ff7b3a', glowMat).add(x, floor + 14, z, 4, 3, 4, '#ffc06b', glowMat)
      this.vents.push(new THREE.Vector3(x, floor + 16, z))
    }
    for (let i = 0; i < 70; i++) b.add(-160 + rnd() * 320, floor + 9 + rnd() * 6, -120 + rnd() * 130, 1.4, 1.4, 1.4, pick(['#36f0ff', '#7affd6', '#6aa8ff']), glowMat)
    b.build(this.world)
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group(), col = pick(['#7ae7ff', '#c08bff', '#7dffc4'])
      const bell = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, toneMapped: false })); bell.scale.set(6, 4, 6); g.add(bell)
      for (let k = 0; k < 4; k++) { const t = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.4 })); t.scale.set(0.6, 7, 0.6); t.position.set(-2.2 + k * 1.5, -5, 0); g.add(t) }
      g.position.set(-120 + i * 40, -280 - (i % 3) * 18, -40 - (i % 4) * 18); g.userData.base = g.position.clone(); g.userData.phase = i * 1.3
      this.world.add(g); this.jellies.push(g)
    }
  }

  buildFish () {
    const schools = [{ y: -18, colors: ['#ffb347', '#ffd166', '#ff8f5a'], n: 14, r: 70 }, { y: -128, colors: ['#7cd8cc', '#a9f0e3', '#5fc4d8'], n: 16, r: 60 }, { y: -238, colors: ['#c48bff', '#9b8cff', '#f08bd8'], n: 12, r: 66 }]
    for (const s of schools) {
      for (let i = 0; i < s.n; i++) {
        const g = new THREE.Group(), col = pick(s.colors)
        const body = new Blocks().add(0, 0, 0, 3, 1.4, 0.9, col, plantMat).add(0.4, 0.95, 0, 1.4, 0.5, 0.3, col, plantMat).add(1.15, 0.2, 0.48, 0.3, 0.3, 0.1, '#10222a')
        body.build(g)
        const tail = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: col, map: plantMat.map })); tail.scale.set(0.9, 1.8, 0.2); tail.position.x = -1.9; g.add(tail)
        g.userData = { tail, a: (i / s.n) * Math.PI * 2, r: s.r * (0.7 + rnd() * 0.45), y: s.y + (rnd() - 0.5) * 16, speed: 0.12 + rnd() * 0.06, z: -55 + (rnd() - 0.5) * 30 }
        this.world.add(g); this.fish.push(g)
      }
    }
  }

  buildSnow () {
    // Marine snow and plankton: drifts slowly down through the whole water column.
    const n = innerWidth < 760 ? 260 : 520, pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { pos[i * 3] = (rnd() - 0.5) * 300; pos[i * 3 + 1] = TOP + 30 - rnd() * (TOP - BOTTOM + 60); pos[i * 3 + 2] = -110 + rnd() * 160 }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.snow = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#d9fff7', size: 0.6, transparent: true, opacity: 0.55, depthWrite: false }))
    this.world.add(this.snow)
  }

  buildBubbles () {
    // Bubbles from the diver and from the abyss vents, recycled from one small pool.
    this.bubbleData = Array.from({ length: 70 }, () => ({ alive: false, p: new THREE.Vector3(), life: 0, wob: rnd() * 6 }))
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(70 * 3), 3))
    const c = document.createElement('canvas'); c.width = c.height = 32
    const g = c.getContext('2d'); g.strokeStyle = 'rgba(230,255,255,0.95)'; g.lineWidth = 3; g.beginPath(); g.arc(16, 16, 11, 0, Math.PI * 2); g.stroke()
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(9, 9, 5, 5)
    this.bubbles = new THREE.Points(geo, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(c), size: 2.1, transparent: true, depthWrite: false }))
    this.bubbles.frustumCulled = false; this.world.add(this.bubbles); this.spawnClock = 0
  }
  spawn (at, spread = 1) {
    const b = this.bubbleData.find(x => !x.alive); if (!b) return
    b.alive = true; b.life = 0; b.p.set(at.x + (rnd() - 0.5) * spread, at.y, at.z + (rnd() - 0.5) * spread)
  }

  water (d) {
    let i = 0; while (i < WATER.length - 2 && d > WATER[i + 1][0]) i++
    const [a, ca] = WATER[i], [b, cb] = WATER[i + 1]
    return new THREE.Color(ca).lerp(new THREE.Color(cb), clamp((d - a) / (b - a)))
  }

  update (time, dt, d, s, dir) {
    const v = this.p.v, mobile = innerWidth < 760
    const camY = lerp(TOP, BOTTOM, d)
    const color = this.water(d)
    this.scene.background.copy(color); this.scene.fog.color.copy(color)
    this.scene.fog.near = lerp(50, 20, d); this.scene.fog.far = lerp(340, 200, d)
    this.sun.intensity = lerp(2.4, 0.05, smoothstep(0, 0.7, d)); this.hemi.intensity = lerp(2.1, 0.45, smoothstep(0, 0.85, d))
    this.surface.material.uniforms.time.value = time; this.surface.material.uniforms.fade.value = 1 - smoothstep(0.05, 0.3, d)
    this.rays.forEach(r => { r.material.opacity = (0.55 + Math.sin(time * 0.6 + r.userData.phase) * 0.25) * (1 - smoothstep(0.08, 0.42, d)) })
    this.monumentLights.forEach((l, i) => { l.intensity = (smoothstep(0.45, 0.6, d) - smoothstep(0.8, 0.95, d)) * (900 + Math.sin(time * 1.3 + i) * 160) })
    this.kelp.forEach((g, i) => { g.rotation.z = Math.sin(time * 0.7 + i * 0.9) * 0.06; g.rotation.x = Math.sin(time * 0.5 + i) * 0.03 })
    this.fish.forEach(g => {
      const u = g.userData, a = u.a + time * u.speed
      g.position.set(Math.cos(a) * u.r, u.y + Math.sin(time * 0.8 + u.a * 3) * 2, u.z + Math.sin(a) * 26)
      g.rotation.y = -a - Math.PI / 2 + Math.PI; u.tail.rotation.y = Math.sin(time * 9 + u.a) * 0.6
    })
    this.jellies.forEach(g => { const u = g.userData, pulse = Math.sin(time * 1.6 + u.phase); g.position.y = u.base.y + Math.sin(time * 0.35 + u.phase) * 8; g.scale.set(1 + pulse * 0.08, 1 - pulse * 0.1, 1 + pulse * 0.08) })
    const snow = this.snow.geometry.attributes.position
    for (let i = 0; i < snow.count; i++) { let y = snow.getY(i) - dt * (0.7 + (i % 5) * 0.2); if (y < BOTTOM - 30) y = TOP + 30; snow.setY(i, y) }
    snow.needsUpdate = true; this.snow.material.opacity = lerp(0.35, 0.8, d)

    // Where the diver swims: right of the copy on wide screens, above it on phones.
    const sx = mobile ? 4 : 31 + Math.sin(d * 7) * 3, sy = camY + (mobile ? 14 : -3) + 17 * (1 - smoothstep(0, 0.12, d)) + Math.sin(time * 0.7) * 0.6
    v.playerWrapper.position.set(sx, sy, mobile ? -10 : 0)
    v.playerWrapper.scale.setScalar(mobile ? 0.62 : 0.74)
    // Slowly turn to show the cape; pitch head-first while the page is scrolling.
    const yaw = Math.PI * 0.86 + Math.sin(time * 0.21) * 0.32 + (dir < 0 ? -0.15 : 0.25) * s
    v.playerWrapper.rotation.y = dt ? damp(v.playerWrapper.rotation.y, yaw, springs.yaw, 0.6, dt) : yaw
    const pitch = dir < 0 ? -s * 0.45 : s * 0.95
    v.playerWrapper.rotation.x = dt ? damp(v.playerWrapper.rotation.x, pitch, springs.pitch, 0.45, dt) : pitch
    v.camera.position.set(Math.sin(time * 0.09) * 0.8, camY + 2, 84)
    v.camera.lookAt(0, camY + 2 + 24 * (1 - smoothstep(0, 0.12, d)), 0)
    this.lamp.position.set(sx + 4, sy + 14, 12); this.lamp.intensity = smoothstep(0.45, 0.95, d) * 420

    // Bubbles: from the diver (more while swimming hard) and from the vents.
    this.spawnClock += dt * (1.2 + s * 9)
    const head = new THREE.Vector3(sx + 1, sy + (mobile ? 6 : 9), 3)
    while (this.spawnClock > 1) { this.spawnClock -= 1; this.spawn(head, 2) }
    if (d > 0.8 && rnd() < dt * 6) this.spawn(pick(this.vents), 3)
    const pos = this.bubbles.geometry.attributes.position
    this.bubbleData.forEach((b, i) => {
      if (b.alive) { b.life += dt; b.p.y += dt * (9 + b.life * 4); b.p.x += Math.sin(time * 4 + b.wob) * dt * 1.4; if (b.life > 5.5) b.alive = false }
      pos.setXYZ(i, b.alive ? b.p.x : 0, b.alive ? b.p.y : -9999, b.alive ? b.p.z : 0)
    })
    pos.needsUpdate = true
  }
}

// ── page ↔ ocean ──
let diver, ocean, inspector
function readScroll () {
  const max = Math.max(1, document.documentElement.scrollHeight - innerHeight)
  depth = clamp(scrollY / max)
  schedule()
}
function paintGauge (d) {
  document.documentElement.style.setProperty('--depth', d.toFixed(4))
  $('#depthFill').style.transform = `scaleY(${d})`
  $('#depthDot').style.top = `${d * 100}%`
  $('#depthM').textContent = `${Math.round(d * 120)} m`
  let zone = ZONES[0][1]; for (const [at, name] of ZONES) if (d >= at) zone = name
  if ($('#depthZone').textContent !== zone) $('#depthZone').textContent = zone
}
function schedule () { if (!raf && !document.hidden) raf = requestAnimationFrame(tick) }
// Adaptive resolution: drop pixel ratio on slow GPUs, raise it again when frames are cheap.
const perf = { frames: 0, time: 0, ratio: 0, max: 1 }
function adapt (dt) {
  if (!diver || !motion) return
  perf.frames++; perf.time += dt
  if (perf.frames < 90) return
  const avg = perf.time / perf.frames; perf.frames = 0; perf.time = 0
  const next = avg > 0.024 ? perf.ratio - 0.25 : avg < 0.0135 ? perf.ratio + 0.25 : perf.ratio
  const clamped = clamp(next, 0.75, perf.max)
  if (clamped !== perf.ratio) { perf.ratio = clamped; diver.v.renderer.setPixelRatio(clamped); diver.resize() }
}
function tick (now) {
  raf = 0
  const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016); last = now
  const max = Math.max(1, document.documentElement.scrollHeight - innerHeight)
  if (motion) depthSmooth = damp(depthSmooth, depth, springs.depth, 0.28, dt)
  else { depthSmooth = depth; springs.depth.v = 0 }
  // Dive strength follows how fast the camera is actually descending (in page pixels per second).
  const speed = springs.depth.v * max
  if (Math.abs(speed) > 60) dir = speed < 0 ? -1 : 1
  stroke = motion ? clamp(damp(stroke, clamp(Math.abs(speed) / 1600), springs.stroke, 0.35, dt)) : 0
  paintGauge(depthSmooth)
  const busy = modalOpen || document.documentElement.classList.contains('shop-lock')
  if (diver && !busy) {
    diver.anim.stroke = stroke; diver.anim.dir = dir
    ocean.update(motion ? now / 1000 : 0, motion ? dt : 0, depthSmooth, stroke, dir)
    diver.tick(now, dt); diver.v.render(); adapt(dt)
  }
  if (inspector && modalOpen) { inspector.tick(now, dt); inspector.v.controls.update(); inspector.v.render() }
  const settling = Math.abs(depthSmooth - depth) > 0.00005 || stroke > 0.005
  if ((motion && (diver || modalOpen)) || settling) schedule()
}

async function dress (c) {
  if (!diver || !c) return
  try {
    const [skin] = await Promise.all([diver.skinReady, diver.cape(c)])
    if (!skin) throw new Error('Skin unavailable')
    $('#sceneStatus').textContent = ''; document.documentElement.classList.add('sea-ready')
  } catch (e) { $('#sceneStatus').textContent = 'The 3D diver is unavailable. Every cape still works below.'; console.warn(e) }
}

try {
  diver = new Player($('#seaCanvas'), { immersive: true })
  perf.ratio = perf.max = diver.v.renderer.getPixelRatio()
  ocean = new Ocean(diver)
  $('#seaCanvas').addEventListener('webglcontextlost', e => { e.preventDefault(); $('#sceneStatus').textContent = '3D paused. Your cape collection still works.' })
} catch (e) {
  diver = null
  document.documentElement.classList.add('no-webgl')
  console.warn('3D unavailable:', e)
}
if (window.XionWearing) dress(window.XionWearing)
addEventListener('xion:wear', e => dress(e.detail))
addEventListener('xion:skin', e => { if (diver) diver.skinReady = diver.skin(e.detail.url, e.detail.slim) })
addEventListener('scroll', readScroll, { passive: true })
addEventListener('resize', () => { readScroll(); diver?.resize() })
addEventListener('xion:motion', e => { motion = e.detail; last = 0; schedule() })
document.addEventListener('visibilitychange', () => { last = 0; if (document.hidden) { cancelAnimationFrame(raf); raf = 0 } else schedule() })
new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
new ResizeObserver(readScroll).observe(document.body)

async function openInspector (c) {
  modalOpen = true; mode = 'back'
  try {
    if (!inspector) inspector = new Player($('#previewCanvas'))
    inspector.resize(); inspector.v.playerWrapper.rotation.y = Math.PI + 0.35
    inspector.v.playerObject.backEquipment = 'cape'
    const [skin] = await Promise.all([inspector.skinReady, inspector.cape(c)])
    if (!skin) throw new Error('Skin unavailable')
    $('#modelHint').textContent = 'Drag to rotate · scroll to zoom'; schedule()
  } catch (e) { $('#modelHint').textContent = '3D unavailable. The original artwork is shown alongside.'; console.warn(e) }
}
addEventListener('xion:preview', e => openInspector(e.detail))
addEventListener('xion:preview-close', () => { modalOpen = false; last = 0; schedule() })
addEventListener('xion:model-view', e => {
  mode = e.detail
  if (!inspector) return
  inspector.v.playerWrapper.rotation.y = mode === 'front' ? 0 : Math.PI + 0.35
  inspector.v.playerObject.backEquipment = mode === 'elytra' ? 'elytra' : 'cape'
  schedule()
})
addEventListener('pagehide', e => { if (!e.persisted) { cancelAnimationFrame(raf); diver?.v.dispose(); inspector?.v.dispose() } })
readScroll()
if (!$('#lightbox').hidden && window.XionShop?.current) openInspector(window.XionShop.current)
window.XionDeep = { get depth () { return depth }, get stroke () { return stroke }, diver: () => diver }
