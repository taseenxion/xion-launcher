// Renders the launcher's black hole (src/renderer/blackhole.js) into a seamless loop of frames
// for the in-game backdrop. Minecraft can't run that shader on every supported version, so the
// game crossfades these frames instead. Frames are neutral ivory; the game tints them per theme.
//
// Usage: npx electron xion-client-mod/tools/render-blackhole.js
// Then shrink them losslessly (RGB, optimised), e.g. with Pillow: Image.open(f).convert("RGB").save(f, optimize=True)
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const OUT = path.resolve(__dirname, '..', 'src', 'main', 'resources', 'assets', 'xionclient', 'textures', 'gui', 'hole')
const W = 768, H = 432
const FRAMES = 40, BLEND = 10, STEP = 0.4 // 16 second loop; the last 10 frames fade into the first
const SHIFT = [0.06, 0.17], ZOOM = 1.4

const src = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'blackhole.js'), 'utf8')
const FRAG = src.slice(src.indexOf('const FRAG = `') + 14, src.indexOf('`', src.indexOf('const FRAG = `') + 14))

const page = `<!doctype html><canvas id=c width=${W} height=${H}></canvas><script>
const gl = document.getElementById('c').getContext('webgl', { preserveDrawingBuffer: true })
const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x }
const p = gl.createProgram()
gl.attachShader(p, sh(gl.VERTEX_SHADER, 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }'))
gl.attachShader(p, sh(gl.FRAGMENT_SHADER, ${JSON.stringify(FRAG)}))
gl.linkProgram(p); gl.useProgram(p)
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
const u = n => gl.getUniformLocation(p, n)
gl.uniform2f(u('res'), ${W}, ${H}); gl.uniform2f(u('shift'), ${SHIFT[0]}, ${SHIFT[1]}); gl.uniform1f(u('zoom'), ${ZOOM}); gl.uniform1f(u('dim'), 1)
gl.uniform3f(u('tintA'), 0.957, 0.937, 0.902); gl.uniform3f(u('tintB'), 0.66, 0.63, 0.59)
window.frame = t => { gl.uniform1f(u('time'), t); gl.drawArrays(gl.TRIANGLES, 0, 3); const px = new Uint8Array(${W * H * 4}); gl.readPixels(0, 0, ${W}, ${H}, gl.RGBA, gl.UNSIGNED_BYTE, px); return px }
const out = document.createElement('canvas'); out.width = ${W}; out.height = ${H}; const ctx = out.getContext('2d')
window.png = (a, b, k) => {
  const img = ctx.createImageData(${W}, ${H})
  for (let y = 0; y < ${H}; y++) for (let x = 0; x < ${W}; x++) {
    const s = ((${H} - 1 - y) * ${W} + x) * 4, d = (y * ${W} + x) * 4
    for (let c = 0; c < 3; c++) img.data[d + c] = b ? Math.round(a[s + c] * (1 - k) + b[s + c] * k) : a[s + c]
    img.data[d + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return out.toDataURL('image/png').split(',')[1]
}
</script>`

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  await win.loadURL('data:text/html;base64,' + Buffer.from(page).toString('base64'))
  fs.mkdirSync(OUT, { recursive: true })
  // Frame i plays R(i); the first BLEND frames fade from R(FRAMES + i) back to R(i), so the loop
  // continues smoothly from the last frame into the first.
  for (let i = 0; i < FRAMES; i++) {
    const data = await win.webContents.executeJavaScript(`(() => {
      const a = frame(${i * STEP})
      ${i < BLEND ? `const b = frame(${(FRAMES + i) * STEP}); return png(b, a, ${i / BLEND})` : 'return png(a)'}
    })()`)
    fs.writeFileSync(path.join(OUT, `f${String(i).padStart(2, '0')}.png`), Buffer.from(data, 'base64'))
  }
  console.log(`Rendered ${FRAMES} frames to ${path.relative(ROOT, OUT)}`)
  app.quit()
})
