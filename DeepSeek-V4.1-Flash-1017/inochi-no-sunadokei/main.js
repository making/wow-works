/* 命の砂時計 — The Hourglass of Life
   A real-time WebGL2 piece. No textures, no models, no libraries.
   Every light inside the glass is a life: born, drifting, falling, returning. */
'use strict';

(() => {

/* ============================================================
   0.  Canvas & device
   ============================================================ */

const canvas = document.getElementById('scene');
const gl = canvas.getContext('webgl2', {
  alpha: false, antialias: false, depth: false, stencil: false,
  powerPreference: 'high-performance', preserveDrawingBuffer: false
});

if (!gl) {
  document.getElementById('gate').innerHTML =
    '<div class="frame"><h1>命の砂時計</h1><p class="lead">WebGL2 が必要です</p></div>';
  return;
}

const canHDR = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
const HDR_FMT = canHDR ? gl.RGBA16F : gl.RGBA8;
const HDR_TYPE = canHDR ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

/* ============================================================
   1.  GL helpers
   ============================================================ */

function compile(type, src, label) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    console.error(`[${label}] ${log}\n` + src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n'));
    throw new Error(`${label} compile failed: ${log}`);
  }
  return sh;
}

class Program {
  constructor(vs, fs, label) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs, label + '.vs'));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs, label + '.fs'));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(`${label} link failed: ${gl.getProgramInfoLog(p)}`);
    }
    this.p = p;
    this.loc = new Map();
  }
  use() { gl.useProgram(this.p); return this; }
  u(name) {
    if (!this.loc.has(name)) this.loc.set(name, gl.getUniformLocation(this.p, name));
    return this.loc.get(name);
  }
  f(name, v) { const l = this.u(name); if (l) gl.uniform1f(l, v); }
  i(name, v) { const l = this.u(name); if (l) gl.uniform1i(l, v); }
  v2(name, x, y) { const l = this.u(name); if (l) gl.uniform2f(l, x, y); }
  v3(name, a) { const l = this.u(name); if (l) gl.uniform3f(l, a[0], a[1], a[2]); }
}

function makeTarget(w, h, hdr = true) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, hdr ? HDR_FMT : gl.RGBA8, w, h);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (!ok) throw new Error('framebuffer incomplete at ' + w + 'x' + h);
  return { tex, fb, w, h };
}

function dropTarget(t) {
  if (!t) return;
  gl.deleteTexture(t.tex);
  gl.deleteFramebuffer(t.fb);
}

const quadVAO = gl.createVertexArray();
gl.bindVertexArray(quadVAO);
const quadBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.bindVertexArray(null);

function fullscreen(prog) {
  gl.bindVertexArray(quadVAO);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

/* ============================================================
   2.  Shaders
   ============================================================ */

const VS_FULL = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`;

/* ---------- background ---------- */

const FS_BG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform vec2  uRes;
uniform float uTime, uAspect, uFocal;
uniform vec3  uCamPos, uCamRight, uCamUp, uCamFwd;

float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }

void main(){
  vec2 ndc = vUv*2.0-1.0;
  vec3 rd = normalize(uCamFwd*uFocal + uCamRight*(ndc.x*uAspect) + uCamUp*ndc.y);

  vec3 col = mix(vec3(0.0012,0.0016,0.0032), vec3(0.0032,0.0044,0.0085),
                 smoothstep(-0.55,0.65,rd.y));

  /* the key lamp is out of frame; only its spill reaches the air */
  vec3 lampDir = normalize(vec3(-0.62,0.50,0.35));
  col += vec3(0.020,0.012,0.007)*pow(max(dot(rd, lampDir),0.0), 3.0);
  col += vec3(0.045,0.026,0.013)*pow(max(dot(rd, lampDir),0.0), 24.0);
  /* a breath of warmth behind the glass so the silhouette has air behind it */
  col += vec3(0.020,0.011,0.005)*pow(max(dot(rd, normalize(vec3(0.20,0.06,-0.98))),0.0), 7.0);

  /* cold rim from upper right */
  col += vec3(0.007,0.011,0.020)*pow(max(dot(rd, normalize(vec3(0.82,0.40,-0.40))),0.0), 13.0);

  /* a dark stone table; the glass stands on it */
  if (rd.y < -0.0005){
    float tf = (-1.075 - uCamPos.y)/rd.y;
    if (tf > 0.0){
      vec3 fp = uCamPos + rd*tf;
      float d = length(fp.xz);
      vec3 fc = vec3(0.0085,0.0070,0.0056);
      fc *= 0.84 + 0.16*sin(fp.x*37.0 + sin(fp.z*29.0)*2.2);
      fc += vec3(0.050,0.026,0.011)*exp(-d*d*0.42);
      fc *= mix(0.30, 1.0, smoothstep(0.13, 0.70, d));
      /* caustic lace gathered under the glass */
      float ca = sin(d*31.0 - uTime*0.5 + sin(fp.x*11.0 + fp.z*7.0)*1.7)
               * sin(d*23.0 + uTime*0.33 + sin(fp.z*9.0)*1.3);
      fc += vec3(0.045,0.024,0.010)*smoothstep(0.25,0.95,ca)*exp(-d*d*2.2);
      fc *= exp(-tf*0.09);
      float fogMix = smoothstep(2.0, 9.0, tf);
      col = mix(fc, col, fogMix);
    }
  }

  /* suspended dust, parallaxed by camera position */
  vec2 gp = vUv*vec2(uAspect,1.0)*86.0 + vec2(uCamPos.x*1.7, uCamPos.y*1.3);
  vec2 cell = floor(gp);
  vec2 f = fract(gp) - 0.5;
  float rnd = h21(cell);
  vec2 off = (vec2(h21(cell+3.17), h21(cell+9.41)) - 0.5)*0.62;
  float speck = smoothstep(0.16,0.0,length(f-off));
  float tw = 0.45 + 0.55*sin(uTime*0.55 + rnd*41.0);
  col += vec3(0.62,0.55,0.46)*speck*step(0.935,rnd)*tw*0.15;

  /* very faint film grain in the void */
  col += (h21(vUv*uRes + fract(uTime)*57.0)-0.5)*0.0035;

  outColor = vec4(col,1.0);
}`;

/* ---------- lives (analytic particles) ---------- */

const VS_LIVES = `#version 300 es
precision highp float;
layout(location=0) in vec4 aSeed;

uniform float uTime, uAspect, uTanHalf, uSand, uFlip;
uniform vec2  uWind;
uniform vec3  uCamPos, uCamRight, uCamUp, uCamFwd;

out vec3 vCol;
out float vGlow;

float topLevel(){ return max(0.02, 0.93*(1.0-uSand)); }
float pileLevel(){ return min(-0.015, -0.985 + 0.97*uSand); }
float profR(float y){
  float t = clamp(abs(y), 0.0, 1.0);
  float s = (t - 0.55)/0.30;
  return 0.026 + 0.298*exp(-s*s);
}

void main(){
  float life = 15.0 + 15.0*aSeed.x;
  float t = fract((uTime + aSeed.y*life)/life);
  float ang0 = aSeed.z*6.2831853;

  float spawnY = mix(topLevel()+0.030, 0.945, fract(aSeed.w*7.31));
  float spawnR = min(0.022 + 0.235*pow(fract(aSeed.w*3.77), 0.62), profR(spawnY)*0.82);

  vec3 pos;
  float bright;
  float swirl = ang0 + (0.55 + fract(aSeed.z*13.0)*0.9)*t*8.5;

  if (t < 0.66) {
    float k = smoothstep(0.0, 0.66, t);
    float r = mix(spawnR, 0.0095, pow(k, 1.85));
    float y = mix(spawnY, 0.014, pow(k, 1.55));
    r = min(r, profR(y)*0.80);
    pos = vec3(cos(swirl)*r, y, sin(swirl)*r);
    float wander = 0.026*(1.0-k);
    pos.x += wander*sin(uTime*0.87 + aSeed.x*31.0);
    pos.z += wander*cos(uTime*0.79 + aSeed.y*29.0);
    pos.y += 0.009*sin(uTime*1.21 + aSeed.z*17.0)*(1.0-k);
    pos.x += uWind.x*(1.0-k);
    pos.z += uWind.y*(1.0-k);
    bright = 0.95 + 0.55*fract(aSeed.w*11.0);
  } else {
    float k = (t-0.66)/0.34;
    float floorY = clamp(pileLevel() + 0.055, -0.94, 0.0);
    float y = mix(0.014, floorY, pow(k, 0.78));
    float spread = 0.010 + 0.135*pow(k, 0.85)*abs(sin(k*8.0 + aSeed.x*37.0));
    spread = min(spread, profR(y)*0.86);
    pos = vec3(cos(ang0 + k*1.7)*spread, y, sin(ang0 + k*1.7)*spread);
    bright = mix(0.55 + 0.30*fract(aSeed.y*19.0), 0.05, smoothstep(0.35,1.0,k));
  }

  bright *= smoothstep(0.0,0.055,t)*(1.0-smoothstep(0.93,1.0,t));

  float ca = cos(uFlip), sa = sin(uFlip);
  pos = vec3(pos.x, pos.y*ca - pos.z*sa, pos.y*sa + pos.z*ca);

  vec3 rel = pos - uCamPos;
  vec3 vp = vec3(dot(rel,uCamRight), dot(rel,uCamUp), dot(rel,uCamFwd));
  if (vp.z < 0.05) {
    gl_Position = vec4(2.0,2.0,2.0,1.0);
    gl_PointSize = 0.0;
    vCol = vec3(0.0);
    vGlow = 0.0;
    return;
  }

  float z = vp.z;
  gl_Position = vec4(vp.x/(z*uTanHalf*uAspect), vp.y/(z*uTanHalf), 0.0, 1.0);

  float px = (uResHeightPx * $PXSCALE$);
  gl_PointSize = clamp((0.0034 + 0.0030*aSeed.y) * uTanHalfInv * 0.5 / z * uResY, 1.0, 11.0);

  vec3 warm = vec3(1.0, 0.76, 0.46);
  vec3 pale = vec3(0.62, 0.80, 1.0);
  vec3 c = mix(warm, pale, step(0.945, fract(aSeed.z*23.0)));
  c *= 0.65 + 0.65*fract(aSeed.w*53.0);
  vCol = c;
  vGlow = bright;
}`;

/* placeholder replaced below — kept simple to avoid macro juggling */
const FS_LIVES = `#version 300 es
precision highp float;
in vec3 vCol;
in float vGlow;
out vec4 outColor;
void main(){
  vec2 d = gl_PointCoord*2.0-1.0;
  float r2 = dot(d,d);
  if (r2 > 1.0) discard;
  float core = exp(-r2*9.0);
  float halo = exp(-r2*2.4)*0.34;
  float a = (core + halo) * vGlow;
  outColor = vec4(vCol*a, 1.0);
}`;

/* grains resting on the sand surface — the missing tooth of real sand */
const VS_GRAINS = `#version 300 es
precision highp float;
layout(location=0) in vec4 aSeed;
uniform float uTime, uAspect, uTanHalf, uTanHalfInv, uResY, uSand, uFlip;
uniform vec3 uCamPos, uCamRight, uCamUp, uCamFwd;
out vec3 vCol;
out float vGlow;

float topLevel(){ return max(0.02, 0.93*(1.0-uSand)); }
float pileLevel(){ return min(-0.015, -0.985 + 0.97*uSand); }
float profR(float y){
  float t = clamp(abs(y), 0.0, 1.0);
  float s = (t - 0.55)/0.30;
  return 0.026 + 0.298*exp(-s*s);
}
float upperSurf(float rad, float ang){
  float lvl = topLevel();
  float dip = max(0.0, lvl - 0.02)*exp(-pow(rad/0.125, 2.0));
  float ripple = (0.012*sin(rad*38.0 + ang*6.0 + uTime*0.05)
                + 0.006*sin(rad*79.0 - ang*11.0 - uTime*0.03)
                + 0.004*sin(rad*21.0 + ang*17.0))*smoothstep(0.01,0.07,rad);
  return lvl - dip - ripple;
}
float lowerSurf(float rad, float ang){
  float lvl = pileLevel();
  float coneH = 0.26*(1.0 - 0.72*uSand);
  float cone = coneH*exp(-pow(rad/0.135, 2.0));
  float ripple = 0.011*sin(rad*33.0 - ang*7.0 - uTime*0.04)
               + 0.005*sin(rad*71.0 + ang*13.0);
  return lvl + cone + ripple;
}

void main(){
  float ang = fract(aSeed.x*13.7)*6.2831853;
  vec3 pos;
  if (fract(aSeed.y*5.31) < 0.46){
    float lvl = topLevel();
    float r = profR(lvl)*0.95*sqrt(fract(aSeed.z*7.13));
    float y = upperSurf(r, ang);
    pos = vec3(cos(ang)*r, y + 0.0025, sin(ang)*r);
  } else {
    float lvl = pileLevel();
    float r = profR(lvl)*0.94*sqrt(fract(aSeed.z*3.91));
    float y = lowerSurf(r, ang);
    pos = vec3(cos(ang)*r, y + 0.0035, sin(ang)*r);
  }

  float ca = cos(uFlip), sa = sin(uFlip);
  pos = vec3(pos.x, pos.y*ca - pos.z*sa, pos.y*sa + pos.z*ca);

  vec3 rel = pos - uCamPos;
  vec3 vp = vec3(dot(rel,uCamRight), dot(rel,uCamUp), dot(rel,uCamFwd));
  if (vp.z < 0.15){
    gl_Position = vec4(2.0,2.0,2.0,1.0); gl_PointSize = 0.0;
    vGlow = 0.0; vCol = vec3(0.0); return;
  }
  float z = vp.z;
  gl_Position = vec4(vp.x/(z*uTanHalf*uAspect), vp.y/(z*uTanHalf), 0.0, 1.0);
  gl_PointSize = clamp((0.0016 + 0.0022*aSeed.w) * uTanHalfInv * 0.5 / z * uResY, 1.0, 5.0);

  float tw = 0.5 + 0.5*sin(uTime*(0.7 + aSeed.w*2.3) + aSeed.x*61.0);
  vGlow = 0.03 + 0.10*tw*tw;
  vCol = mix(vec3(1.0,0.72,0.42), vec3(1.0,0.88,0.66), fract(aSeed.w*7.7));
}`;

/* the particle VS needs a couple of extra uniforms; declare them in a wrapper */
const VS_LIVES_FULL = VS_LIVES
  .replace('uniform float uTime, uAspect, uTanHalf, uSand, uFlip;',
           'uniform float uTime, uAspect, uTanHalf, uTanHalfInv, uSand, uFlip, uResY;')
  .replace('  float px = (uResHeightPx * $PXSCALE$);\n', '');

/* dust suspended in the air around the glass */
const VS_DUST = `#version 300 es
precision highp float;
layout(location=0) in vec4 aSeed;
uniform float uTime, uAspect, uTanHalf, uTanHalfInv, uResY;
uniform vec3 uCamPos, uCamRight, uCamUp, uCamFwd;
out vec3 vCol;
out float vGlow;

void main(){
  float ang = aSeed.x*6.2831853 + uTime*(0.010 + aSeed.y*0.028);
  float rad = 0.86 + 1.55*aSeed.z;
  float y = (fract(aSeed.w*3.71 + uTime*0.0045) - 0.5)*2.35;
  vec3 p = vec3(cos(ang)*rad, y, sin(ang)*rad);

  vec3 rel = p - uCamPos;
  vec3 vp = vec3(dot(rel,uCamRight), dot(rel,uCamUp), dot(rel,uCamFwd));
  if (vp.z < 0.15) {
    gl_Position = vec4(2.0,2.0,2.0,1.0);
    gl_PointSize = 0.0; vGlow = 0.0; vCol = vec3(0.0); return;
  }
  float z = vp.z;
  gl_Position = vec4(vp.x/(z*uTanHalf*uAspect), vp.y/(z*uTanHalf), 0.0, 1.0);
  gl_PointSize = clamp((0.0018 + 0.0070*aSeed.y*aSeed.y) * uTanHalfInv * 0.5 / z * uResY, 1.0, 26.0);

  float tw = 0.55 + 0.45*sin(uTime*(0.4 + aSeed.y*0.7) + aSeed.x*40.0);
  vGlow = (0.045 + 0.10*fract(aSeed.w*17.0))*tw;
  vCol = mix(vec3(1.0,0.66,0.36), vec3(0.72,0.78,0.95), step(0.8, fract(aSeed.y*31.0)));
}`;

/* ---------- glass + sand ---------- */

const FS_GLASS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform vec2  uRes;
uniform float uTime, uAspect, uFocal;
uniform vec3  uCamPos, uCamRight, uCamUp, uCamFwd;
uniform sampler2D uScene;
uniform float uSand, uFlip, uFlash, uFlow;

const float PI = 3.14159265359;

float h13(vec3 p){
  p = fract(p*0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y)*p.z);
}

/* cheap organic pulse — no hash sampling in the hot path */
float lifeGlow(vec3 p){
  vec3 q = p*10.0 + vec3(0.0, -uTime*0.16, uTime*0.05);
  float n = sin(q.x + sin(q.y*1.71)*1.35) * sin(q.z*1.27 + sin(q.x*0.93)*1.15);
  return smoothstep(0.30, 0.88, n*0.5 + 0.5);
}

mat3 rotX(float a){
  float c = cos(a), s = sin(a);
  return mat3(1.0,0.0,0.0, 0.0,c,s, 0.0,-s,c);
}

float profR(float y){
  float t = clamp(abs(y), 0.0, 1.0);
  float s = (t - 0.55)/0.30;
  return 0.026 + 0.298*exp(-s*s);
}
float profD(float y){
  float t = clamp(abs(y), 0.0, 1.0);
  float s = (t - 0.55)/0.30;
  return 0.298*exp(-s*s)*(-2.0*s/0.30);
}

float sdGlassLocal(vec3 p){
  float rad = length(p.xz);
  float r = profR(p.y);
  float dr = profD(p.y);
  float d = (rad - r)/sqrt(1.0 + dr*dr);
  d = max(d, abs(p.y) - 1.0);
  return d*0.86;
}

float sdPlateLocal(vec3 p){
  float rad = length(p.xz);
  float y = abs(p.y) - 1.030;
  vec2 q = vec2(rad - 0.128, abs(y) - 0.022);
  return min(max(q.x,q.y),0.0) + length(max(q,vec2(0.0))) - 0.017;
}

float sdAll(vec3 pw){
  vec3 p = rotX(-uFlip)*pw;
  return min(sdGlassLocal(p), sdPlateLocal(p));
}

float topLevel(){ return max(0.02, 0.93*(1.0-uSand)); }
float pileLevel(){ return min(-0.015, -0.985 + 0.97*uSand); }

float upperSurf(float rad, float ang){
  float lvl = topLevel();
  float dip = max(0.0, lvl - 0.02)*exp(-pow(rad/0.125, 2.0));
  float ripple = (0.012*sin(rad*38.0 + ang*6.0 + uTime*0.05)
                + 0.006*sin(rad*79.0 - ang*11.0 - uTime*0.03)
                + 0.004*sin(rad*21.0 + ang*17.0))*smoothstep(0.01,0.07,rad);
  return lvl - dip - ripple;
}
float lowerSurf(float rad, float ang){
  float lvl = pileLevel();
  float coneH = 0.26*(1.0 - 0.72*uSand);
  float cone = coneH*exp(-pow(rad/0.135, 2.0));
  float ripple = 0.011*sin(rad*33.0 - ang*7.0 - uTime*0.04)
               + 0.005*sin(rad*71.0 + ang*13.0);
  return lvl + cone + ripple;
}

float sandDen(vec3 p){
  if (abs(p.y) > 0.985) return 0.0;
  float rad = length(p.xz);
  if (rad > profR(p.y) - 0.006) return 0.0;
  float ang = atan(p.z, p.x);
  if (p.y >= 0.0){
    float s = upperSurf(rad, ang);
    return 1.0 - smoothstep(s - 0.010, s + 0.009, p.y);
  }
  float s = lowerSurf(rad, ang);
  return 1.0 - smoothstep(s - 0.010, s + 0.009, p.y);
}

float streamDen(vec3 p){
  float y = p.y;
  float top = upperSurf(0.0, 0.0);
  float bot = lowerSurf(0.0, 0.0);
  if (y > top || y < bot) return 0.0;
  vec2 c = vec2(0.0040*sin(y*9.0 + uTime*1.7), 0.0040*cos(y*7.3 - uTime*1.4));
  vec2 d = p.xz - c;
  float w = 0.0062 + 0.0042*smoothstep(0.0, 0.35, abs(y));
  return exp(-dot(d,d)/(w*w))*uFlow;
}

float sandShadow(vec3 lp, vec3 L){
  float acc = 0.0;
  acc += sandDen(lp + L*0.075);
  acc += sandDen(lp + L*0.170);
  acc += sandDen(lp + L*0.300);
  return exp(-acc*1.05);
}

vec3 env(vec3 d){
  float up = clamp(d.y*0.5 + 0.5, 0.0, 1.0);
  vec3 c = mix(vec3(0.004,0.005,0.009), vec3(0.014,0.017,0.026), up);
  /* the warm key lamp, in front and above: this is what the glass catches */
  float a = max(dot(d, normalize(vec3(-0.55,0.55,0.55))), 0.0);
  c += vec3(1.0,0.60,0.28)*(pow(a, 8.0)*0.30 + pow(a, 130.0)*2.8);
  float a2 = max(dot(d, normalize(vec3(-0.20,0.30,0.92))), 0.0);
  c += vec3(0.95,0.72,0.45)*pow(a2, 260.0)*1.4;
  /* a cold strip from the right, for the glass to answer with */
  float b = max(dot(d, normalize(vec3(0.78,0.18,-0.42))), 0.0);
  c += vec3(0.30,0.47,0.72)*pow(b, 34.0)*0.85;
  /* back rim from behind-left, to draw the glass edge in the dark */
  float r = max(dot(d, normalize(vec3(-0.68,0.20,-0.70))), 0.0);
  c += vec3(0.95,0.45,0.20)*pow(r, 30.0)*0.75;
  /* faint warm bounce off the table */
  c += vec3(0.055,0.030,0.014)*exp(-max(d.y,0.0)*7.0)*0.6;
  return c;
}

/* The sand is opaque: find its first surface and shade that surface.
   A volumetric march would only ever show the first centimetre anyway. */
vec4 shadeInterior(vec3 ro, vec3 rd){
  vec3 Lp = vec3(-1.05, 1.02, 0.48);
  float dith = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233)))*43758.5453);
  vec3 p = ro + rd*(0.004 + 0.012*dith);

  for (int i=0;i<78;i++){
    vec3 lp = rotX(-uFlip)*p;
    if (abs(lp.y) > 1.005) break;
    float rad = length(lp.xz);
    if (rad > profR(lp.y) + 0.02) break;

    float den = sandDen(lp);
    if (den > 0.55){
      /* outward normal = negative density gradient */
      float e = 0.007;
      vec3 g = vec3(
        sandDen(lp + vec3(e,0.0,0.0)) - sandDen(lp - vec3(e,0.0,0.0)),
        sandDen(lp + vec3(0.0,e,0.0)) - sandDen(lp - vec3(0.0,e,0.0)),
        sandDen(lp + vec3(0.0,0.0,e)) - sandDen(lp - vec3(0.0,0.0,e))
      );
      vec3 n = -normalize(g + vec3(0.000001));
      if (dot(n, -rd) < 0.0) n = -n;

      /* grain: break the surface normal, cheap and high-frequency */
      float gr = sin(lp.x*127.0 + lp.y*211.0) * sin(lp.z*173.0 - lp.y*149.0);
      vec3 jit = vec3(
        sin(lp.y*233.0 + lp.z*197.0),
        sin(lp.z*181.0 + lp.x*221.0),
        sin(lp.x*199.0 + lp.y*241.0)
      );
      /* walls of sand (seen through the glass) get a coarser grain than the top */
      float wallness = 1.0 - abs(n.y);
      n = normalize(n + (jit + gr*0.5)*(0.018 + 0.075*wallness));

      vec3 Ld = normalize(Lp - lp);
      float sh = 0.12 + 0.88*sandShadow(lp, Ld);
      float diff = max(dot(n, Ld), 0.0);
      float fill = max(dot(n, normalize(vec3(0.5,0.2,0.8))), 0.0)*0.10;

      vec3 albedo = vec3(0.225, 0.128, 0.052);
      albedo *= 0.80 + 0.20*sin(lp.y*13.0 + lp.x*9.0)*sin(lp.z*11.0 - lp.y*7.0);
      albedo *= 0.95 + 0.05*sin(lp.y*80.0 + lp.z*9.0);
      vec3 col = albedo*(0.030 + 1.22*diff*sh + fill)*vec3(1.0, 0.71, 0.42);

      vec3 Hv = normalize(Ld - rd);
      float spec = pow(max(dot(n, Hv), 0.0), 40.0);
      col += vec3(1.0, 0.70, 0.38)*spec*0.055*sh;

      /* the life inside the sand: slow veins of warmth */
      float glow = lifeGlow(lp);
      col += vec3(1.0, 0.40, 0.10)*glow*0.085*(0.6 + 0.4*sin(uTime*0.5));

      /* the sand at the glass wall glows where light is piped through */
      float wall = smoothstep(profR(lp.y) - 0.045, profR(lp.y) - 0.002, rad);
      col += vec3(1.0, 0.55, 0.22)*wall*0.05;

      return vec4(col, 0.985);
    }
    p += rd*0.013;
  }
  return vec4(0.0, 0.0, 0.0, 1.0);
}

void main(){
  vec2 ndc = vUv*2.0 - 1.0;
  vec3 rd = normalize(uCamFwd*uFocal + uCamRight*(ndc.x*uAspect) + uCamUp*ndc.y);
  vec3 ro = uCamPos;
  vec3 sceneCol = texture(uScene, vUv).rgb;

  bool hit = false;
  float t = 0.0;
  float b = dot(ro, rd);
  float c = dot(ro,ro) - 1.30*1.30;
  float disc = b*b - c;
  if (disc > 0.0){
    float t0 = max(-b - sqrt(disc), 0.0);
    t = t0;
    for (int i=0;i<112;i++){
      vec3 p = ro + rd*t;
      float d = sdAll(p);
      if (d < 0.0005 + 0.0008*t){ hit = true; break; }
      t += max(d, 0.0007);
      if (t > t0 + 2.9) break;
    }
  }

  if (!hit){
    outColor = vec4(sceneCol, 1.0);
    return;
  }

  vec3 pw = ro + rd*t;
  vec3 pl = rotX(-uFlip)*pw;
  float dG = sdGlassLocal(pl);
  float dP = sdPlateLocal(pl);

  vec3 ex = vec3(0.0012,0.0,0.0);
  vec3 ey = vec3(0.0,0.0012,0.0);
  vec3 ez = vec3(0.0,0.0,0.0012);
  vec3 n = normalize(vec3(
    sdAll(pw+ex) - sdAll(pw-ex),
    sdAll(pw+ey) - sdAll(pw-ey),
    sdAll(pw+ez) - sdAll(pw-ez)
  ));

  float ndv = max(dot(n, -rd), 0.0);
  vec3 col;

  if (dP < dG){
    /* the bronze plates */
    vec3 L = normalize(vec3(-0.6, 1.2, 0.7) - pw);
    vec3 H = normalize(L - rd);
    float diff = max(dot(n, L), 0.0);
    float spec = pow(max(dot(n, H), 0.0), 90.0);
    float grain = 0.78 + 0.22*sin(pl.y*260.0 + sin(pl.x*70.0)*2.0);
    col = vec3(0.050,0.032,0.021)*(0.30 + 0.95*diff)*grain;
    col += vec3(1.0,0.73,0.44)*spec*1.15;
    col += vec3(1.0,0.64,0.34)*pow(1.0-ndv, 3.0)*0.16;
    outColor = vec4(col, 1.0);
    return;
  }

  float fres = 0.03 + 0.97*pow(1.0 - ndv, 4.2);
  vec3 reflDir = reflect(rd, n);
  vec3 refl = env(reflDir);

  vec3 rdir = refract(rd, n, 1.0/1.50);
  if (dot(rdir, rdir) < 0.0001) rdir = reflect(rd, n);

  vec4 inner = shadeInterior(pw + rdir*0.004, rdir);
  vec2 ruv = clamp(vUv + n.xy*0.045, vec2(0.002), vec2(0.998));
  vec3 through = texture(uScene, ruv).rgb;

  vec3 transmit = through*vec3(0.84,0.93,0.89)*inner.a + inner.rgb;
  col = transmit*(1.0 - fres) + refl*fres*1.55 + refl*0.11;

  /* the glass itself: a bright meniscus of reflected light on the silhouette */
  float rim = pow(1.0 - ndv, 2.6);
  float edge = pow(1.0 - ndv, 9.0);
  vec3 rimTint = mix(vec3(1.0,0.60,0.28), vec3(0.55,0.74,1.0),
                     smoothstep(-0.25, 0.75, reflDir.y));
  col += rimTint*rim*0.85;
  col += rimTint*edge*1.8;
  col *= mix(vec3(1.0), vec3(0.82,0.94,0.90), rim*0.55);

  vec3 L = normalize(vec3(-0.78, 1.5, 0.62) - pw);
  vec3 H = normalize(L - rd);
  col += vec3(1.0,0.79,0.55)*pow(max(dot(n,H),0.0), 300.0)*1.15;
  col += vec3(1.0,0.74,0.48)*uFlash*0.10;

  outColor = vec4(col, 1.0);
}`;

/* ---------- post ---------- */

const FS_BRIGHT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uRes;
void main(){
  vec3 c = texture(uTex, vUv).rgb;
  float l = dot(c, vec3(0.2126,0.7152,0.0722));
  c *= smoothstep(0.95, 2.4, l);
  outColor = vec4(c, 1.0);
}`;

const FS_BLUR = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uDir;
void main(){
  vec3 c = texture(uTex, vUv).rgb*0.227027;
  c += (texture(uTex, vUv + uDir*1.3846).rgb + texture(uTex, vUv - uDir*1.3846).rgb)*0.316216;
  c += (texture(uTex, vUv + uDir*3.2308).rgb + texture(uTex, vUv - uDir*3.2308).rgb)*0.070270;
  outColor = vec4(c, 1.0);
}`;

const FS_COMP = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene, uBloom;
uniform vec2 uRes;
uniform float uTime, uExposure, uGrain;

vec3 aces(vec3 x){
  const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14;
  return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
}

void main(){
  vec2 d = vUv - 0.5;
  float ca = 0.0018 + 0.0022*length(d);
  vec3 col;
  col.r = texture(uScene, vUv + d*ca).r;
  col.g = texture(uScene, vUv).g;
  col.b = texture(uScene, vUv - d*ca).b;

  vec3 bloom = texture(uBloom, vUv).rgb;
  col += bloom*0.30;

  col *= uExposure;
  col = aces(col);
  col = mix(col, col*col*(3.0 - 2.0*col), 0.30);

  float vig = smoothstep(0.92, 0.22, length(d*vec2(1.02,1.10)));
  col *= mix(0.42, 1.0, vig);

  float g = fract(sin(dot(vUv*uRes + fract(uTime)*91.0, vec2(12.9898,78.233)))*43758.5453);
  col += (g - 0.5)*uGrain;

  /* keep the deepest blacks slightly warm */
  col += vec3(0.004,0.0025,0.0015);

  col = pow(max(col, 0.0), vec3(1.0/2.2));
  outColor = vec4(col, 1.0);
}`;

/* ============================================================
   3.  Programs
   ============================================================ */

let bgProg, livesProg, dustProg, grainsProg, glassProg, brightProg, blurProg, compProg;
try {
  bgProg = new Program(VS_FULL, FS_BG, 'bg');
  livesProg = new Program(VS_LIVES_FULL, FS_LIVES, 'lives');
  dustProg = new Program(VS_DUST, FS_LIVES, 'dust');
  grainsProg = new Program(VS_GRAINS, FS_LIVES, 'grains');
  glassProg = new Program(VS_FULL, FS_GLASS, 'glass');
  brightProg = new Program(VS_FULL, FS_BRIGHT, 'bright');
  blurProg = new Program(VS_FULL, FS_BLUR, 'blur');
  compProg = new Program(VS_FULL, FS_COMP, 'comp');
} catch (e) {
  console.error(e);
  document.getElementById('gate').innerHTML =
    '<div class="frame"><h1>命の砂時計</h1><p class="lead">描画の初期化に失敗しました</p></div>';
  return;
}

/* ============================================================
   4.  Lives buffer
   ============================================================ */

const LIVES = 9000;
const seeds = new Float32Array(LIVES*4);
for (let i=0;i<LIVES*4;i++) seeds[i] = Math.random();
const livesVAO = gl.createVertexArray();
gl.bindVertexArray(livesVAO);
const livesBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, livesBuf);
gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
gl.bindVertexArray(null);

const DUST = 1400;
const dustSeeds = new Float32Array(DUST*4);
for (let i=0;i<DUST*4;i++) dustSeeds[i] = Math.random();
const dustVAO = gl.createVertexArray();
gl.bindVertexArray(dustVAO);
const dustBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, dustBuf);
gl.bufferData(gl.ARRAY_BUFFER, dustSeeds, gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
gl.bindVertexArray(null);

const GRAINS = 9000;
const grainSeeds = new Float32Array(GRAINS*4);
for (let i=0;i<GRAINS*4;i++) grainSeeds[i] = Math.random();
const grainsVAO = gl.createVertexArray();
gl.bindVertexArray(grainsVAO);
const grainsBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, grainsBuf);
gl.bufferData(gl.ARRAY_BUFFER, grainSeeds, gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
gl.bindVertexArray(null);

/* ============================================================
   5.  Targets / sizing
   ============================================================ */

let W = 1, H = 1;
let sceneT = null, glassT = null, brightT = null, blurA = null, blurB = null;
let quality = 0.80;
let dprCap = Math.min(window.devicePixelRatio || 1, 2);
let maxPixels = 3.2e6;

function allocTargets() {
  [sceneT, glassT, brightT, blurA, blurB].forEach(dropTarget);
  const bw = Math.max(2, Math.floor(W/2));
  const bh = Math.max(2, Math.floor(H/2));
  sceneT = makeTarget(W, H, true);
  glassT = makeTarget(W, H, true);
  brightT = makeTarget(bw, bh, true);
  blurA = makeTarget(bw, bh, true);
  blurB = makeTarget(bw, bh, true);
}

function resize() {
  const cssW = Math.max(320, window.innerWidth);
  const cssH = Math.max(240, window.innerHeight);
  const targetW = cssW*dprCap;
  const targetH = cssH*dprCap;
  let scale = quality;
  const pixels = targetW*targetH*scale*scale;
  if (pixels > maxPixels) scale *= Math.sqrt(maxPixels/pixels);
  W = Math.max(320, Math.round(targetW*scale));
  H = Math.max(200, Math.round(targetH*scale));
  canvas.width = W;
  canvas.height = H;
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  allocTargets();
}
window.addEventListener('resize', () => { clearTimeout(resize._t); resize._t = setTimeout(resize, 180); });

/* ============================================================
   6.  State & camera
   ============================================================ */

const now0 = performance.now();
const state = {
  started: false,
  enteredAt: 0,
  sand: 0.16,
  flip: 0,
  flipActive: false,
  flipT: 0,
  flipDur: 1.75,
  flash: 0,
  autoWait: -1,
  muted: false,
  elapsed: 0,
  lives: 0
};

const cam = {
  yaw: 0.26,
  pitch: 0.13,
  dist: 3.58,
  yawV: 0,
  pitchV: 0,
  drag: false,
  lastX: 0, lastY: 0,
  moved: 0,
  downAt: 0,
  windX: 0, windZ: 0,
  windTX: 0, windTZ: 0,
  intro: 0
};

window.__dbg = { state, cam };

function vsub(a,b){ return [a[0]-b[0],a[1]-b[1],a[2]-b[2]]; }
function vcross(a,b){ return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
function vnorm(a){ const l = Math.hypot(a[0],a[1],a[2])||1; return [a[0]/l,a[1]/l,a[2]/l]; }
function vlerp(a,b,t){ return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; }

function orbitPos() {
  const cy = Math.cos(cam.pitch), sy = Math.sin(cam.pitch);
  return [
    Math.sin(cam.yaw)*cy*cam.dist,
    sy*cam.dist,
    Math.cos(cam.yaw)*cy*cam.dist
  ];
}

function cameraNow(now, dt) {
  const t = (now - now0) * 0.001;

  if (!state.started) {
    const p = orbitPos();
    return { pos: p, target: [0, 0.01, 0], fov: 38 };
  }

  const since = (now - state.enteredAt) * 0.001;
  const k = Math.min(1, since / 17);
  cam.intro = k*k*(3-2*k);

  const wide = orbitPos();
  const macroPos = [0.055 + 0.018*Math.sin(t*0.31), 0.012 + 0.014*Math.sin(t*0.23+1.2), 0.58];
  const e = cam.intro;
  let pos = vlerp(macroPos, wide, e);
  let target = vlerp([0, 0.006, 0], [0, 0.02, 0], e);

  /* pull back while turning the glass */
  if (state.flipActive) {
    const ft = Math.min(1, state.flipT/state.flipDur);
    const pull = Math.sin(ft*Math.PI)*0.18;
    pos = [
      pos[0]*(1+pull) + (pos[0]-target[0])*pull*0.3,
      pos[1]*(1+pull),
      pos[2]*(1+pull)
    ];
  }

  /* handheld breath */
  const sway = 0.0035;
  pos[0] += Math.sin(t*0.37)*sway;
  pos[1] += Math.cos(t*0.29)*sway;

  return { pos, target, fov: 38 };
}

/* ============================================================
   7.  Audio
   ============================================================ */

const Audio = (() => {
  let ctx = null, master = null, comp = null, verb = null, verbGain = null;
  let started = false, muted = false, timers = [];
  let drone = null, hiss = null, air = null, grainBuf = null;

  function makeNoise(seconds = 2.5) {
    const len = Math.floor(ctx.sampleRate*seconds);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c=0;c<2;c++){
      const d = b.getChannelData(c);
      let last = 0;
      for (let i=0;i<len;i++){
        const w = Math.random()*2-1;
        last = (last + 0.02*w)/1.02;
        d[i] = last*3.2;
      }
    }
    return b;
  }

  function makeImpulse(seconds = 4.2) {
    const len = Math.floor(ctx.sampleRate*seconds);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c=0;c<2;c++){
      const d = b.getChannelData(c);
      for (let i=0;i<len;i++){
        const x = i/len;
        d[i] = (Math.random()*2-1)*Math.pow(1-x, 3.1)*(1-x*0.2);
      }
    }
    return b;
  }

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();

    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.6;

    master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(comp);
    comp.connect(ctx.destination);

    verb = ctx.createConvolver();
    verb.buffer = makeImpulse();
    verbGain = ctx.createGain();
    verbGain.gain.value = 0.55;
    verb.connect(verbGain);
    verbGain.connect(master);

    /* drone */
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 260;
    droneFilter.Q.value = 0.8;
    droneFilter.connect(master);

    drone = [];
    const freqs = [55, 82.5, 110.3, 164.8];
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 0 ? 'sine' : (i === 2 ? 'triangle' : 'sine');
      o.frequency.value = f;
      o.detune.value = (i - 1.5)*7;
      const g = ctx.createGain();
      g.gain.value = [0.085, 0.032, 0.018, 0.010][i];
      o.connect(g);
      g.connect(droneFilter);
      o.start();
      drone.push(o);
    });

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.017;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain);
    lfoGain.connect(droneFilter.frequency);
    lfo.start();

    /* air */
    const airSrc = ctx.createBufferSource();
    airSrc.buffer = makeNoise(3.0);
    airSrc.loop = true;
    const airF = ctx.createBiquadFilter();
    airF.type = 'bandpass';
    airF.frequency.value = 420;
    airF.Q.value = 0.65;
    air = ctx.createGain();
    air.gain.value = 0.020;
    airSrc.connect(airF);
    airF.connect(air);
    air.connect(master);
    airSrc.start();

    const airLfo = ctx.createOscillator();
    airLfo.frequency.value = 0.043;
    const airLfoG = ctx.createGain();
    airLfoG.gain.value = 0.009;
    airLfo.connect(airLfoG);
    airLfoG.connect(air.gain);
    airLfo.start();

    /* sand hiss */
    const hissSrc = ctx.createBufferSource();
    hissSrc.buffer = makeNoise(2.0);
    hissSrc.loop = true;
    const hissF = ctx.createBiquadFilter();
    hissF.type = 'bandpass';
    hissF.frequency.value = 3300;
    hissF.Q.value = 1.1;
    hiss = ctx.createGain();
    hiss.gain.value = 0.0075;
    hissSrc.connect(hissF);
    hissF.connect(hiss);
    hiss.connect(master);
    hiss.connect(verb);
    hissSrc.start();

    const hissLfo = ctx.createOscillator();
    hissLfo.frequency.value = 0.19;
    const hissLfoG = ctx.createGain();
    hissLfoG.gain.value = 0.004;
    hissLfo.connect(hissLfoG);
    hissLfoG.connect(hiss.gain);
    hissLfo.start();

    /* grains */
    const grainLoop = () => {
      if (!ctx || ctx.state !== 'running') { timers.push(setTimeout(grainLoop, 120)); return; }
      const n = Math.random() < 0.22 ? 2 : 1;
      for (let i=0;i<n;i++){
        const t0 = ctx.currentTime + Math.random()*0.03;
        const src = ctx.createBufferSource();
        src.buffer = grainBuf;
        src.playbackRate.value = 0.6 + Math.random()*1.9;
        const f = ctx.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = 2600 + Math.random()*4200;
        const g = ctx.createGain();
        const amp = 0.008 + Math.random()*0.020;
        const dur = 0.012 + Math.random()*0.05;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(amp, t0+0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, t0+dur);
        const pan = ctx.createStereoPanner();
        pan.pan.value = (Math.random()*2-1)*0.75;
        src.connect(f); f.connect(g); g.connect(pan); pan.connect(master);
        if (Math.random() < 0.3) pan.connect(verb);
        src.start(t0);
        src.stop(t0+dur+0.05);
      }
      timers.push(setTimeout(grainLoop, 55 + Math.random()*130));
    };

    grainBuf = makeNoise(0.4);
    grainLoop();

    /* distant bells */
    const notes = [196.0, 220.0, 261.63, 293.66, 329.63, 392.0, 440.0];
    const bellLoop = () => {
      if (ctx && ctx.state === 'running'){
        const f = notes[Math.floor(Math.random()*notes.length)]*(Math.random()<0.4 ? 2 : 1);
        bell(f, 0.030 + Math.random()*0.022);
      }
      timers.push(setTimeout(bellLoop, 27000 + Math.random()*38000));
    };
    timers.push(setTimeout(bellLoop, 14000));
  }

  function bell(freq, amp) {
    const t0 = ctx.currentTime;
    const car = ctx.createOscillator();
    car.type = 'sine';
    car.frequency.value = freq;
    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = freq*2.01;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(freq*3.2, t0);
    mg.gain.exponentialRampToValueAtTime(freq*0.12, t0+5.5);
    mod.connect(mg);
    mg.connect(car.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(amp, t0+0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0+9.0);
    car.connect(g);
    g.connect(master);
    g.connect(verb);
    car.start(t0); mod.start(t0);
    car.stop(t0+9.2); mod.stop(t0+9.2);
  }

  function start() {
    init();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (started) return;
    started = true;
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(0.0001, t);
    master.gain.exponentialRampToValueAtTime(muted ? 0.0001 : 0.62, t+6.5);
    bell(261.63, 0.028);
  }

  function whoosh() {
    if (!ctx || !started || muted) return;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = grainBuf || makeNoise(1.2);
    src.playbackRate.value = 0.7;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(180, t0);
    f.frequency.exponentialRampToValueAtTime(2400, t0+0.9);
    f.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.055, t0+0.10);
    g.gain.exponentialRampToValueAtTime(0.0001, t0+1.5);
    src.connect(f); f.connect(g); g.connect(master); g.connect(verb);
    src.start(t0); src.stop(t0+1.6);
    bell(329.63, 0.024);
  }

  function setMuted(m) {
    muted = m;
    if (!ctx) return;
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), t);
    master.gain.exponentialRampToValueAtTime(m ? 0.0001 : 0.62, t + (m ? 0.9 : 1.6));
  }

  function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }
  function resume() { if (ctx && ctx.state === 'suspended' && started && !muted) ctx.resume(); }

  return { start, setMuted, suspend, resume, whoosh };
})();

/* ============================================================
   8.  Interaction & UI
   ============================================================ */

const gate = document.getElementById('gate');
const enterBtn = document.getElementById('enter');
const soundBtn = document.getElementById('sound');
const hint = document.getElementById('hint');
const livesEl = document.getElementById('lives');
const clockEl = document.getElementById('clock');

function enter() {
  if (state.started) return;
  state.started = true;
  state.enteredAt = performance.now();
  document.body.classList.add('entered');
  gate.setAttribute('aria-hidden', 'true');
  Audio.start();
  setTimeout(() => { hint.classList.add('gone'); }, 11000);
}

enterBtn.addEventListener('click', (e) => { e.stopPropagation(); enter(); });
gate.addEventListener('click', enter);

soundBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  state.muted = !state.muted;
  soundBtn.setAttribute('aria-pressed', String(!state.muted));
  Audio.setMuted(state.muted);
});

function beginFlip() {
  if (!state.started || state.flipActive) return;
  state.flipActive = true;
  state.flipT = 0;
  state.flash = 1.0;
  Audio.whoosh();
}

/* drag to breathe, tap/click to turn */
canvas.addEventListener('pointerdown', (e) => {
  if (!state.started) return;
  cam.drag = true;
  cam.moved = 0;
  cam.lastX = e.clientX;
  cam.lastY = e.clientY;
  cam.downAt = performance.now();
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!state.started) return;

  /* wind follows the cursor across the glass */
  const nx = (e.clientX/window.innerWidth)*2 - 1;
  const ny = -((e.clientY/window.innerHeight)*2 - 1);
  cam.windTX = nx*0.085;
  cam.windTZ = -ny*0.035;

  if (!cam.drag) return;
  const dx = e.clientX - cam.lastX;
  const dy = e.clientY - cam.lastY;
  cam.lastX = e.clientX;
  cam.lastY = e.clientY;
  cam.moved += Math.abs(dx) + Math.abs(dy);
  cam.yawV += dx*0.00055;
  cam.pitchV += dy*0.00045;
});
const endDrag = (e) => {
  if (!cam.drag) return;
  cam.drag = false;
  const dt = performance.now() - cam.downAt;
  if (cam.moved < 7 && dt < 450) beginFlip();
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', () => { cam.drag = false; });

canvas.addEventListener('wheel', (e) => {
  if (!state.started) return;
  e.preventDefault();
  cam.dist = Math.min(4.6, Math.max(1.75, cam.dist + e.deltaY*0.0012));
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); beginFlip(); }
  if (e.key === 'm' || e.key === 'M') {
    state.muted = !state.muted;
    soundBtn.setAttribute('aria-pressed', String(!state.muted));
    Audio.setMuted(state.muted);
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) Audio.suspend();
  else Audio.resume();
});

function fmtClock(sec) {
  const s = Math.floor(sec);
  const h = String(Math.floor(s/3600)).padStart(2,'0');
  const m = String(Math.floor((s%3600)/60)).padStart(2,'0');
  const r = String(s%60).padStart(2,'0');
  return `${h}:${m}:${r}`;
}

/* ============================================================
   9.  Frame
   ============================================================ */

let last = performance.now();
let frames = 0, accTime = 0, perfAcc = 0, lastAdjust = 0;

function update(now, dt) {
  const t = (now - now0)*0.001;

  if (state.started && !state.flipActive) {
    state.elapsed = (now - state.enteredAt)*0.001;
    state.sand = Math.min(1, state.sand + dt/172);
    if (state.sand >= 1) {
      if (state.autoWait < 0) state.autoWait = now;
      else if (now - state.autoWait > 2600) { beginFlip(); state.autoWait = -1; }
    }
  } else if (state.started) {
    state.elapsed = (now - state.enteredAt)*0.001;
  }

  if (state.flipActive) {
    state.flipT += dt;
    const k = Math.min(1, state.flipT/state.flipDur);
    const e = k<0.5 ? 4*k*k*k : 1-Math.pow(-2*k+2,3)/2;
    state.flip = e*Math.PI;
    if (k >= 1) {
      state.flipActive = false;
      state.flip = 0;
      state.sand = Math.min(1, Math.max(0, 1 - state.sand));
      state.flash = 0.85;
      state.autoWait = -1;
    }
  } else {
    state.flip = 0;
  }

  state.flash *= Math.exp(-dt*2.2);

  /* camera inertia + drift */
  if (!cam.drag) {
    cam.yawV *= Math.exp(-dt*3.2);
    cam.pitchV *= Math.exp(-dt*3.2);
  }
  cam.yaw += cam.yawV;
  cam.pitch = Math.max(-0.62, Math.min(0.95, cam.pitch + cam.pitchV));
  if (state.started) cam.yaw += dt*0.010;

  /* wind eases toward the pointer, then back to rest */
  cam.windX += (cam.windTX - cam.windX)*Math.min(1, dt*1.8);
  cam.windZ += (cam.windTZ - cam.windZ)*Math.min(1, dt*1.8);
  cam.windTX *= Math.exp(-dt*0.35);
  cam.windTZ *= Math.exp(-dt*0.35);

  /* readouts */
  state.lives = Math.floor((LIVES/23.0)*Math.max(0, state.elapsed));
  if ((frames & 15) === 0) {
    livesEl.textContent = state.lives.toLocaleString('en-US');
    clockEl.textContent = fmtClock(state.elapsed);
  }

  return t;
}

function render(t, now) {
  const camData = cameraNow(now, 0);
  const fovV = camData.fov*Math.PI/180;
  const focal = 1/Math.tan(fovV/2);
  const tanHalf = Math.tan(fovV/2);
  const aspect = W/H;

  const fwd = vnorm(vsub(camData.target, camData.pos));
  const right = vnorm(vcross(fwd, [0,1,0]));
  const up = vcross(right, fwd);

  /* ---- 1. background + lives into scene buffer ---- */
  gl.bindFramebuffer(gl.FRAMEBUFFER, sceneT.fb);
  gl.viewport(0,0,W,H);
  gl.disable(gl.BLEND);

  bgProg.use();
  bgProg.v2('uRes', W, H);
  bgProg.f('uTime', t);
  bgProg.f('uAspect', aspect);
  bgProg.f('uFocal', focal);
  bgProg.v3('uCamPos', camData.pos);
  bgProg.v3('uCamRight', right);
  bgProg.v3('uCamUp', up);
  bgProg.v3('uCamFwd', fwd);
  fullscreen(bgProg);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);

  livesProg.use();
  livesProg.f('uTime', t);
  livesProg.f('uAspect', aspect);
  livesProg.f('uTanHalf', tanHalf);
  livesProg.f('uTanHalfInv', 1/tanHalf);
  livesProg.f('uResY', H);
  livesProg.f('uSand', state.sand);
  livesProg.f('uFlip', state.flip);
  livesProg.v2('uWind', cam.windX, cam.windZ);
  livesProg.v3('uCamPos', camData.pos);
  livesProg.v3('uCamRight', right);
  livesProg.v3('uCamUp', up);
  livesProg.v3('uCamFwd', fwd);
  gl.bindVertexArray(livesVAO);
  gl.drawArrays(gl.POINTS, 0, LIVES);
  gl.bindVertexArray(null);

  gl.disable(gl.BLEND);

  /* ---- 2. glass ---- */
  gl.bindFramebuffer(gl.FRAMEBUFFER, glassT.fb);
  gl.viewport(0,0,W,H);
  glassProg.use();
  glassProg.v2('uRes', W, H);
  glassProg.f('uTime', t);
  glassProg.f('uAspect', aspect);
  glassProg.f('uFocal', focal);
  glassProg.v3('uCamPos', camData.pos);
  glassProg.v3('uCamRight', right);
  glassProg.v3('uCamUp', up);
  glassProg.v3('uCamFwd', fwd);
  glassProg.f('uSand', state.sand);
  glassProg.f('uFlip', state.flip);
  glassProg.f('uFlash', state.flash);
  glassProg.f('uFlow', 1.0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sceneT.tex);
  glassProg.i('uScene', 0);
  fullscreen(glassProg);

  /* grains catching light on the sand surface */
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  grainsProg.use();
  grainsProg.f('uTime', t);
  grainsProg.f('uAspect', aspect);
  grainsProg.f('uTanHalf', tanHalf);
  grainsProg.f('uTanHalfInv', 1/tanHalf);
  grainsProg.f('uResY', H);
  grainsProg.f('uSand', state.sand);
  grainsProg.f('uFlip', state.flip);
  grainsProg.v3('uCamPos', camData.pos);
  grainsProg.v3('uCamRight', right);
  grainsProg.v3('uCamUp', up);
  grainsProg.v3('uCamFwd', fwd);
  gl.bindVertexArray(grainsVAO);
  gl.drawArrays(gl.POINTS, 0, GRAINS);
  gl.bindVertexArray(null);

  /* air dust, in front of and behind the glass alike */
  dustProg.use();
  dustProg.f('uTime', t);
  dustProg.f('uAspect', aspect);
  dustProg.f('uTanHalf', tanHalf);
  dustProg.f('uTanHalfInv', 1/tanHalf);
  dustProg.f('uResY', H);
  dustProg.v3('uCamPos', camData.pos);
  dustProg.v3('uCamRight', right);
  dustProg.v3('uCamUp', up);
  dustProg.v3('uCamFwd', fwd);
  gl.bindVertexArray(dustVAO);
  gl.drawArrays(gl.POINTS, 0, DUST);
  gl.bindVertexArray(null);
  gl.disable(gl.BLEND);

  /* ---- 3. bloom ---- */
  gl.bindFramebuffer(gl.FRAMEBUFFER, brightT.fb);
  gl.viewport(0,0,brightT.w,brightT.h);
  brightProg.use();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, glassT.tex);
  brightProg.i('uTex', 0);
  brightProg.v2('uRes', brightT.w, brightT.h);
  fullscreen(brightProg);

  const steps = 3;
  let src = brightT;
  for (let i=0;i<steps;i++){
    /* horizontal: src -> blurA */
    gl.bindFramebuffer(gl.FRAMEBUFFER, blurA.fb);
    gl.viewport(0,0,blurA.w,blurA.h);
    blurProg.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    blurProg.i('uTex', 0);
    blurProg.v2('uDir', 1.0/blurA.w, 0.0);
    fullscreen(blurProg);

    /* vertical: blurA -> blurB */
    gl.bindFramebuffer(gl.FRAMEBUFFER, blurB.fb);
    gl.viewport(0,0,blurB.w,blurB.h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, blurA.tex);
    blurProg.i('uTex', 0);
    blurProg.v2('uDir', 0.0, 1.0/blurB.h);
    fullscreen(blurProg);

    src = blurB;
  }

  /* ---- 4. composite ---- */
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0,0,W,H);
  compProg.use();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, glassT.tex);
  compProg.i('uScene', 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, src.tex);
  compProg.i('uBloom', 1);
  compProg.v2('uRes', W, H);
  compProg.f('uTime', t);
  compProg.f('uExposure', 1.15);
  compProg.f('uGrain', 0.012);
  fullscreen(compProg);
  gl.activeTexture(gl.TEXTURE0);
}

/* adaptive resolution — keeps the raymarch interactive */
function adapt(now, dt) {
  accTime += dt;
  if (accTime < 1.2) return;
  const fps = frames/accTime;
  frames = 0;
  accTime = 0;
  if (now - lastAdjust < 2200) return;

  const old = quality;
  if (fps < 34) quality = Math.max(0.52, quality - 0.08);
  else if (fps > 55) quality = Math.min(1.0, quality + 0.04);
  if (Math.abs(quality - old) > 0.01) {
    lastAdjust = now;
    resize();
  }
}

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, Math.max(0.0005, (now-last)*0.001));
  last = now;
  frames++;

  if (document.hidden) return;

  const t = update(now, dt);
  try {
    render(t, now);
  } catch (e) {
    console.error(e);
  }
  adapt(now, dt);
}

resize();
requestAnimationFrame(loop);

})();
