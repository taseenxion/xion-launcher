#!/usr/bin/env node
// Tests the real FPS feature/UI against lightweight Minecraft stubs for every API branch.
// Usage: JAVA_HOME=/path/to/jdk node tools/test-fps.js [--ref=v1.26.0]
// --ref is useful for confirming that a shipped release reproduces the regression.
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const WORK = path.join(ROOT, '.work', 'fps-tests')
const ref = (process.argv.find(s => s.startsWith('--ref=')) || '').slice(6)
const javaBin = name => process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', name) : name
const cases = [['1.18', 11800], ['1.19.2', 11902], ['1.19.3', 11903], ['1.21.1', 12101], ['1.21.11', 12111], ['26.3', 260300]]

function source (file) {
  if (!ref) return fs.readFileSync(path.join(ROOT, 'src', 'main', 'java', file), 'utf8')
  const r = spawnSync('git', ['show', `${ref}:xion-client-mod/src/main/java/${file}`], { cwd: ROOT, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(r.stderr)
  return r.stdout
}

function preprocess (src, mc) {
  const stack = []
  const active = () => stack.every(s => s.active)
  const test = cond => {
    const m = /^MC\s*(>=|<=|>|<|==|!=)\s*(\d+)$/.exec(cond.trim())
    if (!m) throw new Error('Unsupported test directive: ' + cond)
    const n = Number(m[2])
    return ({ '>=': mc >= n, '<=': mc <= n, '>': mc > n, '<': mc < n, '==': mc === n, '!=': mc !== n })[m[1]]
  }
  return src.split('\n').map(line => {
    const m = /^\s*\/\/#(if|elif|else|endif)\b\s*(.*)$/.exec(line)
    if (!m) return active() ? line : ''
    if (m[1] === 'if') {
      const take = test(m[2])
      stack.push({ active: take, taken: take })
    } else if (m[1] === 'endif') stack.pop()
    else {
      const s = stack[stack.length - 1]
      s.active = !s.taken && (m[1] === 'else' || test(m[2]))
      s.taken ||= s.active
    }
    return ''
  }).join('\n')
}

function options (mc) {
  const particles = mc >= 12102 ? 'net.minecraft.server.level.ParticleStatus' : 'net.minecraft.client.ParticleStatus'
  const ambient = mc >= 11903 ? 'Boolean' : 'AmbientOcclusionStatus'
  const fields = [
    ['CloudStatus', 'renderClouds', 'CloudStatus.OFF', 'cloudStatus'],
    ['Boolean', 'entityShadows', 'false', 'entityShadows'],
    ['Boolean', 'enableVsync', 'true', 'enableVsync'],
    [mc >= 11900 ? 'Double' : 'Float', 'entityDistanceScaling', mc >= 11900 ? '0.75' : '0.75f', 'entityDistanceScaling'],
    ['Integer', 'biomeBlendRadius', '0', 'biomeBlendRadius'],
    ['Integer', 'framerateLimit', '144', 'framerateLimit'],
    ['Integer', 'renderDistance', '6', 'renderDistance'],
    ['Integer', 'simulationDistance', '5', 'simulationDistance'],
    [ambient, 'ambientOcclusion', mc >= 11903 ? 'false' : 'AmbientOcclusionStatus.OFF', 'ambientOcclusion'],
    ['Integer', 'mipmapLevels', '0', 'mipmapLevels'],
    [particles, 'particles', particles + '.DECREASED', 'particles'],
    ['Boolean', 'cutoutLeaves', 'false', 'cutoutLeaves'],
    ['Double', 'chunkSectionFadeInTime', '0.0', 'chunkSectionFadeInTime'],
    ['Integer', 'weatherRadius', '2', 'weatherRadius']
  ]
  const primitive = t => ({ Boolean: 'boolean', Integer: 'int', Double: 'double', Float: 'float' })[t] || t
  return `package net.minecraft.client;
public class Options {
  public int saves, writes;
  ${fields.map(([type, field, value]) => `public ${primitive(type)} ${field} = ${value};`).join('\n  ')}
  ${fields.map(([type, field, , method]) => `private final Option<${type}> ${method}Option = new Option<>(() -> ${field}, v -> { ${field} = v; writes++; });
  public Option<${type}> ${method}() { return ${method}Option; }`).join('\n  ')}
  public void save() { saves++; }
  public String quality() { return renderClouds + ":" + entityShadows + ":" + entityDistanceScaling + ":" + biomeBlendRadius + ":" + renderDistance + ":" + simulationDistance + ":" + ambientOcclusion + ":" + mipmapLevels + ":" + particles + ":" + cutoutLeaves + ":" + chunkSectionFadeInTime + ":" + weatherRadius; }
  public static class Option<T> {
    final java.util.function.Supplier<T> get;
    final java.util.function.Consumer<T> set;
    Option(java.util.function.Supplier<T> get, java.util.function.Consumer<T> set) { this.get = get; this.set = set; }
    public T get() { return get.get(); }
    public void set(T value) { set.accept(value); }
  }
}`
}

const bools = ['NoClouds', 'NoParticles', 'NoEntityShadows', 'NoSmoothLight', 'NoMipmap', 'LowEntityDistance', 'LowBiomeBlend', 'NoVsync', 'OpaqueLeaves', 'NoWeather', 'LowRenderDistance', 'LowSimDistance', 'Unlimited', 'NoChunkFade']
let failed = false
for (const [name, mc] of cases) {
  const dir = path.join(WORK, ref ? ref.replace(/[^a-z0-9_.-]/gi, '_') : 'current', name)
  fs.mkdirSync(dir, { recursive: true })
  const files = {
    'net/xion/client/feature/FpsTweaks.java': preprocess(source('net/xion/client/feature/FpsTweaks.java'), mc),
    'net/xion/client/ui/FpsPanel.java': preprocess(source('net/xion/client/ui/FpsPanel.java'), mc),
    'net/xion/client/ui/FpsTweaksTest.java': fs.readFileSync(path.join(ROOT, 'tests', 'fps', 'FpsTweaksTest.java'), 'utf8'),
    'net/xion/client/XionConfig.java': `package net.xion.client; public class XionConfig { public static Data data = new Data(); public static void save() {} public static class Data { ${bools.map(n => `public boolean fps${n};`).join(' ')} public int fpsCap; } }`,
    'net/minecraft/client/Options.java': options(mc),
    'net/minecraft/client/Minecraft.java': 'package net.minecraft.client; public class Minecraft { public Options options; public Minecraft(Options o) { options = o; } }',
    'net/minecraft/client/CloudStatus.java': 'package net.minecraft.client; public enum CloudStatus { OFF, FAST, FANCY }',
    'net/minecraft/client/AmbientOcclusionStatus.java': 'package net.minecraft.client; public enum AmbientOcclusionStatus { OFF, MIN, MAX }',
    'net/minecraft/client/ParticleStatus.java': 'package net.minecraft.client; public enum ParticleStatus { MINIMAL, DECREASED, ALL }',
    'net/minecraft/server/level/ParticleStatus.java': 'package net.minecraft.server.level; public enum ParticleStatus { MINIMAL, DECREASED, ALL }',
    'net/xion/client/compat/Compat.java': 'package net.xion.client.compat; public class Compat { public static void click() {} }',
    'net/xion/client/compat/Colors.java': 'package net.xion.client.compat; public class Colors { public static int TEXT, MUTED, CARD_HOVER, CARD, ACCENT, ON_PILL; public static int alpha(int c, float a) { return c; } }',
    'net/xion/client/compat/Gfx.java': `package net.xion.client.compat; public class Gfx {
      public final Font font = new Font(); public static class Font { public int width(String s) { return s.length(); } public String plainSubstrByWidth(String s, int w) { return s; } }
      public void text(String s, int x, int y, int c, boolean shadow) {} public void pill(int x, int y, int w, int h, int c) {} public void pillOutline(int x, int y, int w, int h, int c) {} public void rounded(int x, int y, int w, int h, int c) {}
    }`
  }
  const paths = Object.entries(files).map(([file, text]) => {
    const full = path.join(dir, file)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, text)
    return full
  })
  const classes = path.join(dir, 'classes')
  const compile = spawnSync(javaBin('javac'), ['--release', '17', '-d', classes, ...paths], { encoding: 'utf8' })
  if (compile.status !== 0) {
    console.error(`FAIL ${name}: ${compile.error || compile.stderr}`)
    failed = true
    continue
  }
  const test = spawnSync(javaBin('java'), ['-cp', classes, 'net.xion.client.ui.FpsTweaksTest'], { encoding: 'utf8' })
  console.log(`${name}: ${test.status === 0 ? test.stdout.trim() : 'FAIL\n' + (test.stderr || test.error)}`)
  failed ||= test.status !== 0
}
process.exitCode = failed ? 1 : 0
