#!/usr/bin/env node
// Generates the animated Xion cape set as PNG frames (no image libraries needed: the PNG encoder
// below is the whole thing). Every design is drawn at 40x64 — the size of the cape face — then
// blown up 4x and mirror-tiled across the 256x128 texture the client expects, so any UV region
// (cape face, elytra panels) shows the same scene.
//
//   node tools/make-capes.js
//
// Writes into src/assets/capes (what Xion Launcher distributes), website/assets/capes and
// store/assets/capes (what the site previews), and keeps capes.json in step.
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const ROOT = path.resolve(__dirname, '..')
const DIRS = ['src/assets/capes', 'website/assets/capes', 'store/assets/capes'].map(d => path.join(ROOT, d))
// The client reads a 40x64 face at (4,4) of a 256x128 texture, so the art is drawn at exactly
// that size and the rest of the canvas repeats it (mirrored) for the elytra panels.
const W = 256, H = 128, FACE_W = 40, FACE_H = 64, FACE_U = 4, FACE_V = 4, FRAMES = 8

// ---- PNG ----

const CRC = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c }
  return t
})()
const crc32 = buf => { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0 }

function chunk (type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, crc])
}

function png (w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ---- drawing helpers ----

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v))
const mix = (a, b, t) => [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * clamp(t)))
const add = (a, b, t = 1) => [0, 1, 2].map(i => Math.min(255, Math.round(a[i] + b[i] * t)))
const smooth = t => t * t * (3 - 2 * t)

function hash (x, y, s = 0) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Vertical sky gradient through evenly spaced stops. */
function sky (v, stops) {
  const n = stops.length - 1
  const x = clamp(v) * n
  const i = Math.min(n - 1, Math.floor(x))
  return mix(stops[i], stops[i + 1], x - i)
}

/** Soft round glow added on top of a colour. */
function glow (c, u, v, cx, cy, r, col, strength = 1) {
  const d = Math.hypot((u - cx) * 0.62, v - cy) / r
  if (d > 1) return c
  return add(c, col, (1 - d) * (1 - d) * strength)
}

const disc = (u, v, cx, cy, r) => Math.hypot((u - cx) * 0.62, v - cy) <= r

/** A falling particle that wraps around the face; phase drives the fall. */
function fall (u, v, seed, p, speed, size, col, c, streak = 0) {
  const x0 = hash(seed, 1) * 1.35 - 0.15
  const y0 = hash(seed, 2)
  const drift = (hash(seed, 3) - 0.5) * 0.25
  const y = ((y0 + p * speed) % 1.2) - 0.1
  const x = x0 + drift * Math.sin((y + p) * 3.1) + (hash(seed, 4) - 0.5) * 0.05
  const dx = Math.abs(u - x) * 0.62, dy = Math.abs(v - y)
  if (dy < size * (1 + streak) && dx < size) return mix(c, col, 1 - (dx / size) * 0.6)
  return c
}

// ---- the designs ----

const designs = [
  {
    id: 'an_sunrise', name: 'Sunrise Torii', cat: 'Anime', tier: 'free',
    desc: 'A torii gate on the water at first light, birds crossing a burning sky.',
    draw (u, v, p) {
      let c = sky(v, [[28, 12, 46], [96, 32, 78], [214, 84, 72], [255, 176, 92]])
      const sunY = 0.66 - 0.05 * p
      c = glow(c, u, v, 0.5, sunY, 0.34, [70, 32, 6])
      if (disc(u, v, 0.5, sunY, 0.11)) c = mix(c, [255, 226, 168], 0.92)
      // water
      if (v > 0.8) {
        c = mix(c, [24, 14, 34], 0.55)
        const refl = Math.abs(Math.sin((u - 0.5) * 22 + p * 6)) < 0.32 ? 0.7 : 0
        if (refl && Math.abs(u - 0.5) < 0.16) c = add(c, [60, 34, 10], refl)
      }
      // torii silhouette
      const post = (Math.abs(u - 0.26) < 0.028 || Math.abs(u - 0.74) < 0.028) && v > 0.32 && v < 0.84
      const beamTop = v > 0.3 && v < 0.345 && u > 0.16 && u < 0.84
      const beamMid = v > 0.4 && v < 0.428 && u > 0.2 && u < 0.8
      if (post || beamTop || beamMid) c = mix(c, [26, 10, 22], 0.94)
      // birds
      for (let i = 0; i < 3; i++) {
        const bu = 0.2 + i * 0.18 + p * 0.09
        const bv = 0.22 + Math.sin(p * 6 + i) * 0.012 + i * 0.02
        if (Math.abs(u - bu) < 0.03 && Math.abs(v - bv) < 0.008) c = mix(c, [40, 16, 26], 0.9)
      }
      return c
    }
  },
  {
    id: 'an_sakura', name: 'Sakura Dusk', cat: 'Anime', tier: 'pro',
    desc: 'Cherry boughs over a violet dusk, petals drifting the whole time.',
    draw (u, v, p) {
      let c = sky(v, [[38, 12, 44], [92, 32, 74], [150, 70, 108], [54, 22, 46]])
      c = glow(c, u, v, 0.72, 0.24, 0.3, [40, 12, 40])
      if (disc(u, v, 0.72, 0.24, 0.075)) c = mix(c, [246, 214, 226], 0.9)
      // bough from the left shoulder
      const bough = u < 0.58 && Math.abs(v - (0.16 + u * 0.62)) < 0.026
      const twig = u > 0.3 && u < 0.42 && Math.abs(v - (0.2 + u * 0.2)) < 0.014
      if (bough || twig) c = mix(c, [28, 12, 26], 0.9)
      for (let i = 0; i < 5; i++) {
        const bu = 0.12 + hash(i, 7) * 0.5, bv = 0.14 + hash(i, 8) * 0.4
        if (disc(u, v, bu, bv, 0.028)) c = mix(c, [255, 196, 214], 0.86)
      }
      for (let i = 0; i < 11; i++) c = fall(u, v, 100 + i, p, 0.55 + (i % 3) * 0.12, 0.014, [255, 186, 208], c)
      return c
    }
  },
  {
    id: 'an_leafall', name: 'Autumn Fall', cat: 'Anime', tier: 'pro',
    desc: 'A dark wood in October with leaves coming down for good.',
    draw (u, v, p) {
      let c = sky(v, [[26, 30, 26], [46, 40, 28], [70, 46, 26], [24, 22, 18]])
      c = glow(c, u, v, 0.5, 0.28, 0.42, [34, 22, 8])
      // trunks
      for (const tu of [0.16, 0.84]) if (Math.abs(u - tu) < 0.05 + Math.sin(v * 6 + tu) * 0.006) c = mix(c, [22, 16, 12], 0.88)
      // canopy
      for (let i = 0; i < 16; i++) {
        const cu = hash(i, 11), cv = 0.05 + hash(i, 12) * 0.3
        if (disc(u, v, cu, cv, 0.055)) c = mix(c, i % 3 ? [92, 52, 18] : [128, 62, 16], 0.5)
      }
      const warm = [[222, 122, 32], [196, 74, 26], [240, 176, 60], [150, 96, 30]]
      for (let i = 0; i < 12; i++) c = fall(u, v, 200 + i, p, 0.42 + (i % 4) * 0.1, 0.017, warm[i % 4], c)
      return c
    }
  },
  {
    id: 'an_neonrain', name: 'Neon Rain', cat: 'Anime', tier: 'pro',
    desc: 'A back street after midnight: magenta signs, cyan puddles, rain never stops.',
    draw (u, v, p) {
      let c = sky(v, [[6, 6, 14], [12, 10, 24], [10, 8, 18], [4, 4, 10]])
      // towers
      for (const [tu, tw, th] of [[0.08, 0.14, 0.5], [0.32, 0.1, 0.64], [0.66, 0.16, 0.55], [0.88, 0.1, 0.42]]) {
        if (u > tu && u < tu + tw && v > th) c = mix(c, [12, 12, 22], 0.85)
      }
      // neon signs
      const signs = [[0.14, 0.18, [255, 42, 140]], [0.36, 0.26, [42, 236, 255]], [0.7, 0.2, [255, 96, 64]], [0.5, 0.5, [120, 80, 255]]]
      for (const [su, sv, col] of signs) {
        const flick = hash(Math.round(p * 8), Math.round(su * 100)) > 0.15 ? 1 : 0.25
        c = glow(c, u, v, su, sv, 0.12, col.map(x => Math.round(x * 0.3 * flick)))
        if (Math.abs(u - su) < 0.035 && Math.abs(v - sv) < 0.05) c = mix(c, col, 0.85 * flick)
      }
      // rain
      for (let i = 0; i < 26; i++) {
        const x = hash(i, 21) * 1.3 - 0.15
        const y = (hash(i, 22) + p * 1.6 + i * 0.05) % 1.15 - 0.1
        if (Math.abs(u - x) * 0.62 < 0.008 && v > y && v < y + 0.09) c = add(c, [90, 110, 150], 0.35)
      }
      // wet ground reflection
      if (v > 0.86) c = add(c, [24, 10, 40], 0.6)
      return c
    }
  },
  {
    id: 'an_moonwolf', name: 'Moonlit Wolf', cat: 'Anime', tier: 'pro',
    desc: 'A wolf on the ridge under a huge moon, mist crawling past.',
    draw (u, v, p) {
      let c = sky(v, [[10, 22, 34], [16, 34, 48], [12, 26, 40], [6, 14, 22]])
      c = glow(c, u, v, 0.58, 0.2, 0.4, [40, 60, 70])
      if (disc(u, v, 0.58, 0.2, 0.135)) c = mix(c, [226, 236, 236], 0.95)
      // ridge
      if (v > 0.7 + Math.sin(u * 5 + 1) * 0.05) c = mix(c, [10, 18, 24], 0.9)
      // wolf head silhouette
      const head = disc(u, v, 0.3, 0.68, 0.075) || (Math.abs(u - 0.3) < 0.045 && v > 0.6 && v < 0.75)
      const earL = u > 0.24 && u < 0.28 && v > 0.57 && v < 0.64
      const earR = u > 0.33 && u < 0.37 && v > 0.57 && v < 0.64
      if (head || earL || earR) c = mix(c, [6, 10, 14], 0.95)
      if (disc(u, v, 0.278, 0.675, 0.011)) c = mix(c, [180, 240, 255], 0.9)
      if (disc(u, v, 0.324, 0.675, 0.011)) c = mix(c, [180, 240, 255], 0.9)
      // mist
      const mist = Math.sin((v * 9 + p * 2 - u * 3)) * 0.5 + 0.5
      if (v > 0.75 && mist > 0.72) c = add(c, [40, 60, 70], 0.4)
      return c
    }
  },
  {
    id: 'an_bamboo', name: 'Moonlit Bamboo', cat: 'Anime', tier: 'free',
    desc: 'Bamboo stalks, deep green dark, and fireflies that wander.',
    draw (u, v, p) {
      let c = sky(v, [[8, 20, 16], [14, 34, 26], [10, 26, 20], [4, 12, 10]])
      c = glow(c, u, v, 0.5, 0.3, 0.5, [18, 40, 30])
      for (const bu of [0.12, 0.34, 0.58, 0.8]) {
        if (Math.abs(u - bu) < 0.045) {
          c = mix(c, [16, 40, 28], 0.9)
          if (Math.abs(((v * 5 - p * 0.4) % 1) - 0.5) > 0.46) c = mix(c, [8, 22, 16], 0.9)
        }
      }
      // leaves
      for (let i = 0; i < 12; i++) {
        const lu = hash(i, 31), lv = 0.06 + hash(i, 32) * 0.5
        if (Math.abs(u - lu) < 0.05 && Math.abs(v - lv) < 0.012) c = mix(c, [26, 62, 40], 0.75)
      }
      // fireflies
      for (let i = 0; i < 7; i++) {
        const fu = 0.1 + hash(i, 41) * 0.8 + Math.sin(p * 6.3 + i) * 0.03
        const fv = 0.3 + hash(i, 42) * 0.55 + Math.cos(p * 5.1 + i) * 0.03
        c = glow(c, u, v, fu, fv, 0.05, [90, 120, 30], 0.9)
        if (disc(u, v, fu, fv, 0.008)) c = mix(c, [226, 255, 168], 0.9)
      }
      return c
    }
  },
  {
    id: 'an_starfall', name: 'Starfall', cat: 'Anime', tier: 'pro',
    desc: 'Midnight blue with meteors cutting across and stars that twinkle.',
    draw (u, v, p) {
      let c = sky(v, [[4, 6, 24], [8, 14, 44], [10, 18, 52], [4, 6, 22]])
      for (let i = 0; i < 40; i++) {
        const su = hash(i, 51), sv = hash(i, 52) * 0.9
        const tw = 0.55 + 0.45 * Math.sin(p * 6.28 + hash(i, 53) * 6.28)
        if (Math.abs(u - su) * 0.62 < 0.006 && Math.abs(v - sv) < 0.01) c = add(c, [200, 220, 255], 0.5 * tw)
      }
      for (let m = 0; m < 3; m++) {
        const start = (p + m * 0.33) % 1
        const mu = -0.2 + start * 1.5
        const mv = 0.12 + m * 0.18 + start * 0.25
        for (let s = 0; s < 9; s++) {
          const tu = mu - s * 0.018, tv = mv - s * 0.012
          if (Math.abs(u - tu) * 0.62 < 0.01 && Math.abs(v - tv) < 0.01) {
            c = add(c, [180, 230, 255], 0.85 * (1 - s / 9))
          }
        }
      }
      return c
    }
  },
  {
    id: 'an_ember', name: 'Ember Dusk', cat: 'Anime', tier: 'pro',
    desc: 'Burnt red sky, ash in the air, embers going up instead of down.',
    draw (u, v, p) {
      let c = sky(v, [[34, 8, 12], [78, 18, 16], [120, 34, 18], [26, 6, 10]])
      c = glow(c, u, v, 0.5, 0.82, 0.5, [70, 24, 6])
      for (let i = 0; i < 14; i++) {
        const x = hash(i, 61) * 1.2 - 0.1 + Math.sin(p * 4 + i) * 0.02
        const y = 1.05 - ((hash(i, 62) + p * (0.5 + (i % 3) * 0.2)) % 1.15)
        c = glow(c, u, v, x, y, 0.05, [90, 30, 8], 0.8)
        if (Math.abs(u - x) * 0.62 < 0.01 && Math.abs(v - y) < (i % 4 === 0 ? 0.014 : 0.007)) c = mix(c, [255, i % 3 ? 150 : 96, 40], 0.9)
      }
      // smoke wisps
      for (let i = 0; i < 5; i++) {
        const wu = 0.1 + i * 0.2 + Math.sin(p * 2 + i) * 0.03
        if (Math.abs(u - wu) * 0.62 < 0.05 && v < 0.25 + Math.sin(u * 8 + p * 3) * 0.05) c = add(c, [30, 16, 16], 0.5)
      }
      return c
    }
  },
  {
    id: 'an_tide', name: 'Moon Tide', cat: 'Anime', tier: 'pro',
    desc: 'Cold sea at night, wave crests rolling and a moon on the water.',
    draw (u, v, p) {
      let c = sky(v, [[6, 14, 34], [10, 26, 54], [8, 22, 46], [4, 10, 22]])
      c = glow(c, u, v, 0.62, 0.18, 0.34, [40, 60, 90])
      if (disc(u, v, 0.62, 0.18, 0.1)) c = mix(c, [232, 242, 255], 0.92)
      for (let b = 0; b < 5; b++) {
        const yb = 0.4 + b * 0.12
        const wave = yb + Math.sin((u * 6) + p * 4 + b) * 0.03
        if (Math.abs(v - wave) < 0.014) c = add(c, [70, 120, 170], 0.55)
        if (v > wave && Math.abs(v - wave) < 0.05) c = mix(c, [10, 28, 52], 0.5)
      }
      const refl = Math.abs(u - 0.62) < 0.05 && Math.abs(Math.sin(v * 40 + p * 8)) > 0.3
      if (refl) c = add(c, [60, 70, 90], 0.5)
      return c
    }
  },
  {
    id: 'an_lantern', name: 'Snow Lantern', cat: 'Anime', tier: 'free',
    desc: 'A paper lantern in the snow, warm light against a slate night.',
    draw (u, v, p) {
      let c = sky(v, [[16, 20, 30], [26, 32, 46], [18, 24, 36], [10, 12, 20]])
      c = glow(c, u, v, 0.34, 0.52, 0.26, [90, 50, 16])
      if (Math.abs(u - 0.34) < 0.075 && Math.abs(v - 0.52) < 0.11) {
        c = mix(c, [255, 174, 96], 0.85)
        if (Math.abs(v - 0.415) < 0.012 || Math.abs(v - 0.625) < 0.012) c = mix(c, [60, 26, 16], 0.8)
      }
      // evergreen silhouette
      for (let t = 0; t < 3; t++) {
        const tu = 0.72 + t * 0.1, th = 0.55 - t * 0.05
        if (Math.abs(u - tu) < (v - th) * 0.35 && v > th) c = mix(c, [8, 16, 16], 0.9)
      }
      for (let i = 0; i < 20; i++) c = fall(u, v, 300 + i, p, 0.25 + (i % 5) * 0.06, 0.01, [226, 236, 250], c)
      return c
    }
  },
  {
    id: 'an_eyes', name: 'Shadow Eyes', cat: 'Anime', tier: 'pro',
    desc: 'Almost nothing, then two eyes open in the dark. Blinks on a loop.',
    draw (u, v, p) {
      let c = sky(v, [[10, 10, 14], [16, 16, 24], [12, 12, 18], [6, 6, 10]])
      // hatch
      if ((Math.floor(u * 40) + Math.floor(v * 64)) % 7 === 0) c = add(c, [8, 8, 12], 0.6)
      const open = 0.35 + 0.65 * Math.min(1, Math.abs(Math.sin(p * Math.PI * 2)) * 3)
      for (const ex of [0.34, 0.64]) {
        const dx = u - ex, dy = (v - 0.5) / open
        const almond = Math.abs(dx) * 0.62 < 0.085 && Math.abs(dy) < 0.045 * (1 - Math.abs(dx) * 7)
        if (almond) {
          const iris = Math.hypot(dx * 0.62, dy) < 0.022
          c = mix(c, iris ? [220, 40, 60] : [240, 236, 240], iris ? 0.95 : 0.85)
          if (iris && Math.abs(dx * 0.62) < 0.006 && Math.abs(dy) < 0.012) c = mix(c, [255, 240, 240], 0.9)
        }
        c = glow(c, u, v, ex, 0.5, 0.14, [60, 10, 20], 0.7)
      }
      return c
    }
  },
  {
    id: 'an_garden', name: 'Night Garden', cat: 'Anime', tier: 'pro',
    desc: 'Indigo garden, glowing flowers, fireflies between them.',
    draw (u, v, p) {
      let c = sky(v, [[16, 12, 40], [30, 20, 62], [20, 16, 44], [8, 8, 22]])
      c = glow(c, u, v, 0.5, 0.78, 0.6, [30, 18, 60])
      for (let i = 0; i < 9; i++) {
        const fu = 0.06 + hash(i, 71) * 0.88
        const fv = 0.52 + hash(i, 72) * 0.42
        const hue = [[150, 220, 255], [255, 170, 230], [200, 160, 255], [160, 255, 220]][i % 4]
        if (Math.abs(u - fu) * 0.62 < 0.01 && v > fv && v < 0.98) c = mix(c, [24, 30, 30], 0.7)
        const bloom = 0.012 + Math.abs(Math.sin(p * 5 + i)) * 0.008
        if (disc(u, v, fu, fv, bloom)) c = mix(c, hue, 0.92)
        c = glow(c, u, v, fu, fv, 0.06, hue.map(x => Math.round(x * 0.25)), 0.8)
      }
      for (let i = 0; i < 8; i++) {
        const gu = 0.08 + hash(i, 81) * 0.84 + Math.sin(p * 5 + i * 1.7) * 0.04
        const gv = 0.3 + hash(i, 82) * 0.4 + Math.cos(p * 4 + i) * 0.05
        if (disc(u, v, gu, gv, 0.006)) c = mix(c, [250, 255, 210], 0.9)
      }
      return c
    }
  }
]

// ---- render + write ----

function renderCape (design, frame) {
  const p = frame / FRAMES
  const face = Buffer.alloc(FACE_W * FACE_H * 4)
  for (let y = 0; y < FACE_H; y++) {
    for (let x = 0; x < FACE_W; x++) {
      const c = design.draw(x / FACE_W, y / FACE_H, p) || [0, 0, 0]
      const i = (y * FACE_W + x) * 4
      face[i] = c[0]; face[i + 1] = c[1]; face[i + 2] = c[2]; face[i + 3] = 255
    }
  }
  // Mirror-tile the face across the whole texture: the cape samples (4,4)-(44,68), so that
  // window shows the scene 1:1 and the neighbouring panels (elytra) continue it without seams.
  const out = Buffer.alloc(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let dx = (x - FACE_U) % FACE_W
      let dy = (y - FACE_V) % FACE_H
      if (dx < 0) dx += FACE_W
      if (dy < 0) dy += FACE_H
      const tileX = Math.floor((x - FACE_U) / FACE_W)
      const tileY = Math.floor((y - FACE_V) / FACE_H)
      if (((tileX % 2) + 2) % 2 === 1) dx = FACE_W - 1 - dx
      if (((tileY % 2) + 2) % 2 === 1) dy = FACE_H - 1 - dy
      const s = (dy * FACE_W + dx) * 4
      const d = (y * W + x) * 4
      out[d] = face[s]; out[d + 1] = face[s + 1]; out[d + 2] = face[s + 2]; out[d + 3] = 255
    }
  }
  return png(W, H, out)
}

/** 6x upscale of just the cape face, written to /tmp/cape-preview so the art can be eyeballed. */
function previewPng (design, frame) {
  const K = 6
  const p = frame / FRAMES
  const out = Buffer.alloc(FACE_W * K * FACE_H * K * 4)
  for (let y = 0; y < FACE_H * K; y++) {
    for (let x = 0; x < FACE_W * K; x++) {
      const c = design.draw(Math.floor(x / K) / FACE_W, Math.floor(y / K) / FACE_H, p) || [0, 0, 0]
      const d = (y * FACE_W * K + x) * 4
      out[d] = c[0]; out[d + 1] = c[1]; out[d + 2] = c[2]; out[d + 3] = 255
    }
  }
  return png(FACE_W * K, FACE_H * K, out)
}

const PREVIEW = '/tmp/cape-preview'
fs.mkdirSync(PREVIEW, { recursive: true })
for (const design of designs) fs.writeFileSync(path.join(PREVIEW, `${design.id}.png`), previewPng(design, 0))

let written = 0
for (const design of designs) {
  for (const dir of DIRS) {
    if (!fs.existsSync(dir)) continue
    for (let f = 0; f < FRAMES; f++) {
      fs.writeFileSync(path.join(dir, `${design.id}_${f}.png`), renderCape(design, f))
      written++
    }
  }
}

// capes.json in every folder keeps the new designs at the end, without duplicating existing ids.
for (const dir of DIRS) {
  const file = path.join(dir, 'capes.json')
  if (!fs.existsSync(dir)) continue
  let list = []
  try { list = JSON.parse(fs.readFileSync(file, 'utf8')) } catch {}
  const kept = list.filter(c => !designs.some(d => d.id === c.id))
  for (const d of designs) kept.push({ id: d.id, name: d.name, cat: d.cat, tier: d.tier, frames: FRAMES })
  fs.writeFileSync(file, JSON.stringify(kept, null, 2) + '\n')
}

console.log(`${designs.length} capes x ${FRAMES} frames, ${written} PNGs written`)
console.log(designs.map(d => `${d.id} — ${d.name} (${d.tier})`).join('\n'))
