// The launcher backdrop: a black hole rendered live in WebGL. Each pixel's light ray is bent by
// the hole's gravity on its way out (Schwarzschild approximation), so the star field and the
// accretion disk are lensed around the shadow, the far side of the disk arches over the top, and
// the side turning toward you is brighter. The disk follows the theme colours.
// It renders below screen resolution, adapts to the GPU, slows down while Minecraft is running
// and stops when the window is hidden. Exposes window.heroScene for app.js.
(function () {
  const canvas = document.getElementById('heroCanvas')
  const api = { pause () {}, resume () {}, setTint () {} }
  window.heroScene = api
  if (!canvas) return
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false })
  if (!gl) { document.body.classList.add('no-webgl'); return }

  const VERT = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }'
  const FRAG = `
precision highp float;
uniform vec2 res; uniform float time; uniform vec2 shift; uniform float zoom; uniform float dim;
uniform vec3 tintA; uniform vec3 tintB;

float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; } return v; }

vec3 sky(vec3 d){
  vec3 col = vec3(0.0);
  vec2 sph = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0)));
  for (int l = 0; l < 3; l++) {
    float fl = float(l);
    float scale = 70.0 + fl * 85.0;
    vec2 uv = sph * scale / 3.14159;
    vec2 id = floor(uv), f = fract(uv) - 0.5;
    float h = h21(id + fl * 19.3);
    if (h > 0.955) {
      vec2 o = vec2(h21(id + 3.1), h21(id + 7.7)) - 0.5;
      float r = length(f - o * 0.55);
      float b = smoothstep(0.16, 0.0, r) * (h - 0.955) * 22.0 / (1.0 + fl * 0.8);
      vec3 c = mix(vec3(1.0, 0.86, 0.72), vec3(0.78, 0.86, 1.0), h21(id + 1.7));
      col += c * b;
    }
  }
  float n = fbm(vec2(sph.x * 1.6, sph.y * 2.4) + 4.0);
  float band = exp(-pow(sph.y * 2.2 - 0.35 * sin(sph.x), 2.0));
  col += mix(vec3(0.03, 0.028, 0.04), tintB * 0.09, 0.5) * smoothstep(0.35, 0.95, n) * (0.35 + band);
  return col;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / res.y;
  uv -= shift;
  float az = 0.85 + time * 0.012;
  float inc = 0.115 + 0.025 * sin(time * 0.045);
  vec3 ro = 26.0 * vec3(cos(az) * cos(inc), sin(inc), sin(az) * cos(inc));
  vec3 fw = normalize(-ro);
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, rt);
  float roll = -0.12;
  vec2 ru = vec2(uv.x * cos(roll) - uv.y * sin(roll), uv.x * sin(roll) + uv.y * cos(roll));
  vec3 v = normalize(fw * zoom + ru.x * rt + ru.y * up);
  vec3 p = ro;
  vec3 hc = cross(p, v); float h2 = dot(hc, hc);
  vec3 col = vec3(0.0);
  float trans = 1.0, minR = 100.0;
  bool fell = false;
  for (int i = 0; i < 220; i++) {
    float r = length(p);
    float dt = clamp(0.05 * r * r / (r + 2.0), 0.02, 1.4);
    vec3 acc = -1.5 * h2 * p / pow(r, 5.0);
    v += acc * dt;
    vec3 pn = p + v * dt;
    if (p.y * pn.y < 0.0) {
      float t = p.y / (p.y - pn.y);
      vec3 q = mix(p, pn, t);
      float rq = length(q.xz);
      if (rq > 2.55 && rq < 12.5) {
        float omega = 1.0 / pow(rq, 1.5);
        float th = time * 1.4 * omega;
        vec2 rp = mat2(cos(th), -sin(th), sin(th), cos(th)) * q.xz;
        float streak = fbm(vec2(rq * 3.2, 0.0) + fbm(rp * 0.6) * 1.5);
        float clump = fbm(rp * 1.1 + 2.0);
        float n = 0.45 * streak + 0.55 * clump;
        float temp = pow(2.55 / rq, 1.35);
        vec3 tang = normalize(vec3(-q.z, 0.0, q.x));
        float dop = dot(tang, -normalize(v));
        float beam = pow(1.0 + 0.62 * dop, 3.2);
        float edge = smoothstep(2.55, 3.4, rq) * smoothstep(12.5, 6.5, rq);
        vec3 hue = mix(tintA, tintB, smoothstep(3.0, 10.0, rq));
        vec3 base = mix(hue, vec3(1.0, 0.95, 0.88), clamp(temp * temp * 0.9, 0.0, 1.0));
        vec3 dc = base * (0.2 + 1.05 * n) * temp * beam * edge * 1.75;
        float a = clamp(edge * (0.5 + 0.5 * n), 0.0, 1.0) * 0.92;
        col += dc * a * trans;
        trans *= 1.0 - a;
      }
    }
    p = pn;
    minR = min(minR, r);
    if (r < 1.0) { fell = true; break; }
    if (r > 60.0 || trans < 0.02) break;
  }
  // Feather the shadow's edge: rays that only just escaped fade in instead of stepping.
  float edgeFade = fell ? 0.0 : smoothstep(1.5, 1.68, minR);
  if (!fell) col += trans * sky(normalize(v)) * edgeFade;
  // Thin photon ring: light that skimmed the photon sphere (r = 1.5) on its way out.
  if (!fell) col += mix(tintA, vec3(1.0), 0.5) * exp(-pow((minR - 1.6) * 5.0, 2.0)) * 0.5 * trans * edgeFade;
  col = 1.0 - exp(-col * 1.15);
  col = pow(col, vec3(0.92));
  float vig = smoothstep(1.35, 0.25, length(uv + shift * 0.6));
  gl_FragColor = vec4(col * dim * (0.55 + 0.45 * vig), 1.0);
}`

  function shader (type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s))
    return s
  }
  let prog
  try {
    prog = gl.createProgram()
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog))
  } catch (e) { console.warn('[backdrop]', e); document.body.classList.add('no-webgl'); return }
  gl.useProgram(prog)
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
  const U = {}; for (const n of ['res', 'time', 'shift', 'zoom', 'dim', 'tintA', 'tintB']) U[n] = gl.getUniformLocation(prog, n)

  const hex = h => { const n = parseInt(String(h).replace('#', ''), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255] }
  // Current and target values, eased every frame so page and theme changes glide.
  const cur = { sx: 0.06, sy: 0.19, zoom: 1.4, dim: 1, a: hex('#ffd6a0'), b: hex('#ff8a3c') }
  const tgt = { sx: 0.06, sy: 0.19, zoom: 1.4, dim: 1, a: cur.a.slice(), b: cur.b.slice() }
  let scale = 0.8, frameAvg = 16, last = 0, clock = 0, raf = 0, mode = 'home', gameRunning = false

  function resize () {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr * scale)), h = Math.max(1, Math.round(canvas.clientHeight * dpr * scale))
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h) }
  }
  addEventListener('resize', resize)

  function frame (now) {
    raf = 0
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0.016)
    // While the game runs or another page is open, draw less often: the motion stays, the GPU rests.
    const every = gameRunning ? 1 / 12 : mode === 'home' ? 0 : 1 / 30
    if (every && last && (now - last) / 1000 < every) { raf = requestAnimationFrame(frame); return }
    last = now
    clock += dt
    const k = 1 - Math.exp(-dt * 2.2)
    cur.sx += (tgt.sx - cur.sx) * k; cur.sy += (tgt.sy - cur.sy) * k
    cur.zoom += (tgt.zoom - cur.zoom) * k; cur.dim += (tgt.dim - cur.dim) * k
    for (let i = 0; i < 3; i++) { cur.a[i] += (tgt.a[i] - cur.a[i]) * k; cur.b[i] += (tgt.b[i] - cur.b[i]) * k }
    // Adaptive resolution: keep the frame under budget on integrated GPUs.
    if (mode === 'home' && !gameRunning) {
      frameAvg = frameAvg * 0.95 + dt * 1000 * 0.05
      const next = frameAvg > 24 ? Math.max(0.4, scale - 0.05) : frameAvg < 15 ? Math.min(0.95, scale + 0.05) : scale
      if (Math.abs(next - scale) > 0.001) { scale = next; frameAvg = 16 }
    }
    resize()
    gl.uniform2f(U.res, canvas.width, canvas.height)
    gl.uniform1f(U.time, clock)
    gl.uniform2f(U.shift, cur.sx, cur.sy)
    gl.uniform1f(U.zoom, cur.zoom)
    gl.uniform1f(U.dim, cur.dim)
    gl.uniform3fv(U.tintA, cur.a); gl.uniform3fv(U.tintB, cur.b)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    if (!document.hidden) raf = requestAnimationFrame(frame)
  }
  const start = () => { if (!raf && !document.hidden) { last = 0; raf = requestAnimationFrame(frame) } }
  document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0 } else start() })
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0 })
  canvas.addEventListener('webglcontextrestored', () => location.reload())

  // Home: the hole sits to the right of the welcome text. Other pages: it drifts to centre,
  // further away and dimmer, behind the panels.
  api.resume = () => { mode = 'home'; Object.assign(tgt, { sx: 0.06, sy: 0.19, zoom: 1.4, dim: 1 }); start() }
  api.pause = () => { mode = 'page'; Object.assign(tgt, { sx: 0.0, sy: 0.02, zoom: 1.05, dim: 0.38 }); start() }
  // Theme colours: the inner disk takes the light accent, the outer disk the deeper one.
  api.setTint = (a, b) => { tgt.a = hex(a); tgt.b = hex(b) }
  if (window.xion && window.xion.on) {
    window.xion.on('launch:status', s => { gameRunning = !!s && s.phase === 'running' })
    window.xion.on('launch:closed', () => { gameRunning = false })
  }
  resize(); start()
})()
