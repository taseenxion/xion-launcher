const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { app, safeStorage } = require('electron')

const ROOT = path.join(app.getPath('appData'), '.xionlauncher')
const FILE = path.join(ROOT, 'launcher.json')

const defaults = () => ({
  accounts: [],
  activeAccount: null,
  profiles: [
    { id: 'xion-client', name: 'Latest Release', loader: 'fabric', version: 'latest-release', loaderVersion: 'latest', icon: 'xion', optimize: true, created: Date.now() }
  ],
  selectedProfile: 'xion-client',
  settings: {
    memoryMax: 4096,
    memoryMin: 1024,
    javaPath: '',
    jvmArgs: '',
    width: 1280,
    height: 720,
    fullscreen: false,
    closeOnLaunch: false,
    showSnapshots: false,
    showOld: false,
    gameRoot: ROOT,
    theme: 'nightfall',
    licenseKey: '',
    perfMode: 'boost',
    cape: '',
    capeRev: 0,
    customCape: '',
    xionPack: true,
    xionPackPvp: true,
    onboarded: false
  },
  servers: []
})

let data = null

// Refresh tokens are encrypted at rest with the OS keychain when available.
function enc (s) {
  if (!s) return s
  try { if (safeStorage.isEncryptionAvailable()) return 'enc:' + safeStorage.encryptString(s).toString('base64') } catch {}
  return s
}
function dec (s) {
  if (!s || !s.startsWith('enc:')) return s
  try { return safeStorage.decryptString(Buffer.from(s.slice(4), 'base64')) } catch { return null }
}

function load () {
  fs.mkdirSync(ROOT, { recursive: true })
  const base = defaults()
  let raw
  try {
    raw = JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    // Corrupt or half-written file: recover the last good save instead of resetting accounts
    // and profiles back to defaults.
    try { raw = JSON.parse(fs.readFileSync(FILE + '.bak', 'utf8')) } catch { return (data = base) }
  }
  try {
    data = { ...base, ...raw, settings: { ...base.settings, ...(raw.settings || {}) } }
    data.accounts = (data.accounts || []).map(a => ({ ...a, refresh: dec(a.refresh) }))
    // v1.17: the first-run intro is for new players; people who already have an account skip it.
    if (!raw.settings || raw.settings.onboarded === undefined) data.settings.onboarded = data.accounts.length > 0
    // v1.1: every install gets a Xion Client profile once.
    if (!data.migratedXion) {
      if (!data.profiles.some(p => p.id === 'xion-client')) data.profiles.unshift(base.profiles[0])
      data.selectedProfile = 'xion-client'
      data.migratedXion = true
    }
    // v1.2: Xion Client is built into every profile, so vanilla profiles become Fabric.
    if (!data.migratedAllXion) {
      for (const p of data.profiles) {
        if (p.loader !== 'fabric' && p.loader !== 'quilt') { p.loader = 'fabric'; p.loaderVersion = 'latest' }
        delete p.xionClient
      }
      const xc = data.profiles.find(p => p.id === 'xion-client')
      if (xc && xc.name === 'Xion Client') xc.name = 'Latest Release'
      data.migratedAllXion = true
    }
    // v1.7: new performance mods join every profile that uses a custom mod list.
    if (!data.migratedPerf17) {
      const added = ['scalablelux', 'vmp-fabric', 'clumps', 'fast-ip-ping', 'lazy-language-loader']
      for (const p of data.profiles) if (Array.isArray(p.mods)) p.mods = [...new Set([...p.mods, ...added])]
      data.migratedPerf17 = true
    }
    // v1.8: more performance mods.
    if (!data.migratedPerf18) {
      const added = ['memoryleakfix', 'debugify', 'particle-core', 'entity-view-distance']
      for (const p of data.profiles) if (Array.isArray(p.mods)) p.mods = [...new Set([...p.mods, ...added])]
      data.migratedPerf18 = true
    }
    // v1.8.1: Very Many Players made input feel delayed and repeated, so it leaves every profile.
    if (!data.migratedNoVmp) {
      for (const p of data.profiles) if (Array.isArray(p.mods)) p.mods = p.mods.filter(x => x !== 'vmp-fabric')
      data.migratedNoVmp = true
    }
    // v1.10: Freelook and voice chat join every profile that uses a custom mod list.
    if (!data.migratedSocial110) {
      for (const p of data.profiles) if (Array.isArray(p.mods)) p.mods = [...new Set([...p.mods, 'freelook', 'simple-voice-chat'])]
      data.migratedSocial110 = true
    }
    // v1.12: motion blur joins every profile that uses a custom mod list.
    if (!data.migratedBlur112) {
      for (const p of data.profiles) if (Array.isArray(p.mods)) p.mods = [...new Set([...p.mods, 'natural-motion-blur'])]
      data.migratedBlur112 = true
    }
  } catch {
    data = base
  }
  return data
}

function save () {
  const out = { ...data, accounts: data.accounts.map(a => ({ ...a, refresh: enc(a.refresh) })) }
  const json = JSON.stringify(out, null, 2)
  fs.mkdirSync(ROOT, { recursive: true })
  // Write to a temp file and rename, so a crash or full disk mid-write can't truncate launcher.json.
  // Then keep a .bak copy of the last good save to recover from external corruption.
  const tmp = FILE + '.tmp'
  try {
    fs.writeFileSync(tmp, json)
    fs.renameSync(tmp, FILE)
    try { fs.copyFileSync(FILE, FILE + '.bak') } catch {}
  } catch (e) {
    try { fs.unlinkSync(tmp) } catch {}
    throw e
  }
}

function get () { return data || load() }

function uid () { return crypto.randomBytes(6).toString('hex') }

module.exports = { ROOT, get, save, load, uid }
