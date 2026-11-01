/* Purun — a crème caramel, modelled, lit and rendered in real time.
   Everything on screen is distance-field marching, procedural noise and math.
   No textures. No meshes. No photographs. */
(() => {
  'use strict';

  const canvas = document.getElementById('c');
  const gl = canvas.getContext('webgl2', {
    alpha: false, antialias: false, depth: false, stencil: false,
    powerPreference: 'high-performance', preserveDrawingBuffer: false
  });
  if (!gl) { document.documentElement.classList.add('no-webgl'); return; }

  const hasFloat = !!gl.getExtension('EXT_color_buffer_float');

  /* ------------------------------------------------------------------ */
  /*  shaders                                                            */
  /* ------------------------------------------------------------------ */

  const VS = `#version 300 es
  precision highp float;
  void main(){
    vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  }`;

  const SCENE = `#version 300 es
precision highp float;

uniform vec2  uRes;
uniform vec3  uCamPos;
uniform vec3  uCamTarget;
uniform float uFovTan;
uniform float uTime;
uniform float uIntro;
uniform vec4  uJig;      // shearX, shearZ, squash, energy

out vec4 fragColor;

#define PI 3.14159265359

const float PBASE = 0.021;   // where the pudding meets the plate
const float PH    = 0.780;   // cone height
const float PT    = 0.400;   // radius at the top of the cone
const float PRB   = 0.660;   // radius at the base

const vec3 LK = normalize(vec3(-0.74, 0.56,  0.40));  // key
const vec3 LF = normalize(vec3( 0.90, 0.16,  0.36));  // fill
const vec3 LB = normalize(vec3( 0.40, 0.34, -0.86));  // back rim

/* ---------------- small utilities ---------------- */

float hash13(vec3 p3){
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec3 x){
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash13(i + vec3(0,0,0)), hash13(i + vec3(1,0,0)), f.x),
                mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y);
  float b = mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x),
                mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y);
  return mix(a, b, f.z);
}
float fbm(vec3 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++){ s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}

float smin(float a, float b, float k){
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float smax(float a, float b, float k){
  float h = clamp(0.5 - 0.5 * (a - b) / k, 0.0, 1.0);
  return mix(a, b, h) + k * h * (1.0 - h);
}

float sdRoundCone(vec3 p, float r1, float r2, float h){
  vec2 q = vec2(length(p.xz), p.y);
  float b = (r1 - r2) / h;
  float a = sqrt(1.0 - b * b);
  float k = dot(q, vec2(-b, a));
  if (k < 0.0) return length(q) - r1;
  if (k > a * h) return length(q - vec2(0.0, h)) - r2;
  return dot(q, vec2(a, b)) - r1;
}

float sdPoly(vec2 p, vec2 v[16]){
  float d = dot(p - v[0], p - v[0]);
  float s = 1.0;
  for (int i = 0; i < 16; i++){
    int j = (i + 15) & 15;
    vec2 e = v[j] - v[i];
    vec2 w = p - v[i];
    vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    d = min(d, dot(b, b));
    bvec3 c = bvec3(p.y >= v[i].y, p.y < v[j].y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) s *= -1.0;
  }
  return s * sqrt(d);
}

/* ---------------- deformation: the wobble ---------------- */

vec3 unDeform(vec3 p){
  float s = clamp((p.y - PBASE) / PH, 0.0, 1.35);
  float shape = s * s;
  p.x -= uJig.x * shape;
  p.z -= uJig.y * shape;
  float sq = clamp(uJig.z, -0.4, 0.4);
  p.y = PBASE + (p.y - PBASE) / (1.0 - sq);
  p.xz *= (1.0 + sq * 0.5);
  // the body swells opposite the swing, the way a set jelly actually moves
  float swing = length(uJig.xy);
  p.xz *= 1.0 + 0.40 * swing * sin(3.14159 * clamp(s, 0.0, 1.0));
  // a travelling ripple along the shoulder, only when the thing is moving
  float e = clamp(uJig.w, 0.0, 1.0);
  if (e > 0.001){
    float r = length(p.xz);
    float ph = r * 16.0 - uTime * 11.0;
    float w = sin(ph) * 0.0045 * e * smoothstep(0.50, 0.80, p.y) * smoothstep(1.10, 0.85, p.y);
    p.xz *= 1.0 - w;
  }
  return p;
}

/* ---------------- caramel ---------------- */

float caramelThresh(float th){
  float d = 0.038
          + 0.030 * sin(th * 2.0 + 1.3)
          + 0.020 * sin(th * 4.0 + 0.4)
          + 0.011 * sin(th * 7.0 + 2.1);
  d += 0.090 * pow(max(0.0, sin(th * 5.0 + 0.9)), 6.0);
  d += 0.060 * pow(max(0.0, sin(th * 8.0 + 2.7)), 9.0);
  d += 0.045 * pow(max(0.0, sin(th * 3.0 + 4.4)), 4.0);
  return 0.872 - clamp(d, 0.0, 0.24);
}
float caramelMask(vec3 p){
  float th = atan(p.z, p.x);
  float thr = caramelThresh(th);
  return smoothstep(thr - 0.008, thr + 0.008, p.y);
}

/* ---------------- geometry ---------------- */

float mapPudding(vec3 wp){
  vec3 p = unDeform(wp);

  float body = sdRoundCone(p - vec3(0.0, PBASE, 0.0), PRB, PT, PH);

  vec3 q = p - vec3(0.0, PBASE + PH, 0.0);
  float dome = (length(vec3(q.x / PT, q.y / 0.125, q.z / PT)) - 1.0) * 0.125;
  body = smin(body, dome, 0.090);

  // sit flat on the plate with a soft moulded edge
  body = smax(body, PBASE - p.y, 0.030);

  float th = atan(p.z, p.x);

  // the vertical mould flutes
  float flute = smoothstep(0.02, 0.20, p.y - PBASE) * smoothstep(0.92, 0.78, p.y);
  body += 0.0058 * cos(th * 12.0) * flute;

  // hand-made unevenness: the thing is not a lathe object
  body += 0.0026 * (vnoise(p * 5.0) - 0.5) * flute;
  body += 0.0075 * (vnoise(p * 2.1 + 5.0) - 0.5) * smoothstep(0.0, 0.30, p.y - PBASE);

  // caramel: a viscous layer that thins out and beads at the flow front
  float thr = caramelThresh(th);
  float d = p.y - thr;
  float layer = 0.0090 * smoothstep(-0.075, 0.050, d);
  float bulb  = 0.0032 * exp(-pow(d * 20.0, 2.0));
  // syrup residue: a thin film where it once ran further down
  float film = 0.0020 * smoothstep(-0.15, -0.02, d) * (0.45 + 0.55 * sin(th * 5.0 + p.y * 21.0));
  body -= layer + bulb + film;

  // tiny ripples on the caramel when the pudding is struck
  float rr = length(p.xz);
  body -= 0.0030 * sin(rr * 30.0 - uTime * 12.0) * clamp(uJig.w, 0.0, 1.0) * smoothstep(-0.06, 0.03, d);
  // a few trapped bubbles
  body -= 0.0010 * smoothstep(0.80, 0.97, vnoise(p * 46.0)) * smoothstep(-0.02, 0.04, d);

  return body;
}

float syrupField(vec3 p){
  vec2 q = p.xz;
  float r = length(q);
  if (r < 0.50 || r > 0.92) return 0.0;
  float ang = atan(q.y, q.x);
  float outer = 0.730
              + 0.018 * sin(ang * 2.0 + 0.7)
              + 0.010 * sin(ang * 5.0 + 2.2)
              + 0.030 * pow(max(0.0, sin(ang * 3.0 + 1.1)), 4.0)
              + 0.018 * pow(max(0.0, sin(ang * 7.0 + 3.4)), 6.0)
              + 0.010 * (vnoise(vec3(q * 11.0, 1.1)) - 0.5);
  return smoothstep(outer + 0.004, outer - 0.004, r);
}

float mapPlate(vec3 p){
  vec2 q = vec2(length(p.xz), p.y);
  vec2 v[16];
  v[0]  = vec2(0.000, 0.0210);
  v[1]  = vec2(0.690, 0.0210);
  v[2]  = vec2(0.800, 0.0225);
  v[3]  = vec2(0.870, 0.0305);
  v[4]  = vec2(0.920, 0.0430);
  v[5]  = vec2(0.960, 0.0570);
  v[6]  = vec2(0.990, 0.0675);
  v[7]  = vec2(1.010, 0.0700);
  v[8]  = vec2(1.032, 0.0635);
  v[9]  = vec2(1.034, 0.0510);
  v[10] = vec2(1.005, 0.0290);
  v[11] = vec2(0.950, 0.0110);
  v[12] = vec2(0.870, 0.0032);
  v[13] = vec2(0.400, 0.0020);
  v[14] = vec2(0.000, 0.0020);
  v[15] = vec2(0.000, 0.0117);
  float d = sdPoly(q, v);
  // the caramel that ran off the pudding pools on the plate
  d -= 0.0050 * syrupField(p);
  return d;
}

vec2 mapObj(vec3 p){
  float a = mapPudding(p);
  float b = mapPlate(p);
  if (b < a) return vec2(b, 2.0);
  return vec2(a, 1.0);
}

/* ---------------- tracing ---------------- */

vec2 trace(vec3 ro, vec3 rd, float tmax){
  float t = 0.0;
  for (int i = 0; i < 110; i++){
    vec3 p = ro + rd * t;
    vec2 h = mapObj(p);
    if (h.x < 0.0007 * t + 0.0004) return vec2(t, h.y);
    t += h.x * 0.86;
    if (t > tmax) break;
  }
  return vec2(-1.0, -1.0);
}

vec3 calcNormal(vec3 p){
  const vec2 e = vec2(1.0, -1.0) * 0.0016;
  return normalize(
    e.xyy * mapObj(p + e.xyy).x +
    e.yyx * mapObj(p + e.yyx).x +
    e.yxy * mapObj(p + e.yxy).x +
    e.xxx * mapObj(p + e.xxx).x);
}

float calcAO(vec3 p, vec3 n){
  float occ = 0.0, sca = 1.0;
  for (int i = 0; i < 5; i++){
    float h = 0.015 + 0.10 * float(i);
    float d = mapObj(p + n * h).x;
    occ += (h - d) * sca;
    sca *= 0.72;
  }
  return clamp(1.0 - 2.1 * occ, 0.0, 1.0);
}

float softShadow(vec3 ro, vec3 rd, float mint, float maxt){
  float res = 1.0, t = mint;
  for (int i = 0; i < 28; i++){
    float h = mapObj(ro + rd * t).x;
    res = min(res, 9.0 * h / t);
    if (res < 0.005 || t > maxt) break;
    t += clamp(h, 0.012, 0.14);
  }
  return clamp(res, 0.0, 1.0);
}

/* ---------------- environment ---------------- */

float softbox(vec3 rd, vec3 L, vec2 sz, float soft){
  float c = dot(rd, L);
  if (c <= 0.0) return 0.0;
  vec3 t1 = normalize(cross(L, vec3(0.0, 1.0, 0.0031)));
  vec3 t2 = cross(t1, L);
  vec2 uv = vec2(dot(rd, t1), dot(rd, t2)) / c;
  float mx = 1.0 - smoothstep(sz.x - soft, sz.x + soft, abs(uv.x));
  float my = 1.0 - smoothstep(sz.y - soft, sz.y + soft, abs(uv.y));
  return mx * my;
}

vec3 envR(vec3 rd, float rough){
  float r = clamp(rough, 0.0, 1.0);
  vec3 c = vec3(0.005, 0.005, 0.007);
  c += vec3(0.016, 0.013, 0.011) * smoothstep(-0.45, 0.95, rd.y);
  c += softbox(rd, normalize(vec3(-0.74, 0.56, 0.40)),
               vec2(0.34 + 1.6 * r, 0.22 + 1.6 * r), 0.07 + 0.36 * r)
       * vec3(1.0, 0.86, 0.68) * (9.0 / (1.0 + 6.0 * r));
  c += softbox(rd, normalize(vec3(0.90, 0.16, 0.36)),
               vec2(0.55 + 2.2 * r, 0.55 + 2.2 * r), 0.30 + 0.45 * r)
       * vec3(0.20, 0.30, 0.52) * (1.8 / (1.0 + 3.0 * r));
  c += softbox(rd, normalize(vec3(0.40, 0.34, -0.86)),
               vec2(0.85 + 1.3 * r, 0.045 + 0.55 * r), 0.05 + 0.30 * r)
       * vec3(1.0, 0.58, 0.30) * (11.0 / (1.0 + 5.0 * r));
  // a small, very bright kicker: the crisp wet highlight
  c += softbox(rd, normalize(vec3(-0.45, 0.72, 0.53)),
               vec2(0.10 + 1.0 * r, 0.045 + 1.0 * r), 0.025 + 0.5 * r)
       * vec3(1.0, 0.92, 0.78) * (46.0 / (1.0 + 20.0 * r));
  c += vec3(0.030, 0.024, 0.019) * smoothstep(0.30, -0.40, rd.y);
  return c;
}

/* ---------------- the room behind it ---------------- */

vec3 bg(vec3 rd){
  vec3 c = vec3(0.0055, 0.0050, 0.0058);
  c += vec3(0.020, 0.016, 0.013) * pow(clamp(rd.y * 0.5 + 0.5, 0.0, 1.0), 2.5);
  float back = clamp(dot(rd, normalize(vec3(0.05, 0.22, -1.0))), 0.0, 1.0);
  c += vec3(0.055, 0.028, 0.013) * pow(back, 10.0);
  c += vec3(0.030, 0.014, 0.006) * pow(back, 40.0);
  return c;
}

/* ---------------- BRDF ---------------- */

float D_ggx(float NoH, float a){
  float a2 = a * a;
  float d = NoH * NoH * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d);
}
float V_smith(float NoL, float NoV, float a){
  float k = a * 0.5;
  return (NoL / (NoL * (1.0 - k) + k)) * (NoV / (NoV * (1.0 - k) + k));
}
vec3 pbr(vec3 alb, vec3 n, vec3 v, vec3 L, vec3 lc, float rough, float f0, float shadow){
  vec3 h = normalize(L + v);
  float NoL = clamp(dot(n, L), 0.0, 1.0);
  float NoV = clamp(dot(n, v), 1e-3, 1.0);
  float NoH = clamp(dot(n, h), 0.0, 1.0);
  float VoH = clamp(dot(v, h), 0.0, 1.0);
  if (NoL <= 0.0) return vec3(0.0);
  float a = max(rough * rough, 1e-3);
  float D = D_ggx(NoH, a);
  float G = V_smith(NoL, NoV, a);
  float F = f0 + (1.0 - f0) * pow(1.0 - VoH, 5.0);
  vec3 spec = vec3(D * G * F / (4.0 * NoV + 1e-4)) * NoL;
  vec3 diff = alb * (1.0 - f0) * NoL / PI;
  return (diff + spec) * lc * shadow;
}

vec3 microNormal(vec3 p, vec3 n, float scale, float amp){
  vec3 q = p * scale;
  float f0 = vnoise(q);
  float e = 0.7;
  vec3 g = vec3(vnoise(q + vec3(e, 0, 0)) - f0,
                vnoise(q + vec3(0, e, 0)) - f0,
                vnoise(q + vec3(0, 0, e)) - f0);
  g -= n * dot(g, n);
  return normalize(n - g * amp);
}

/* ---------------- materials ---------------- */

vec3 matCustard(vec3 p, vec3 n, vec3 v, float ao){
  // a steamed custard skin: soft orange-peel, not a mirror
  vec3 nc = microNormal(p, n, 64.0, 0.22);
  nc = normalize(mix(n, nc, 0.4));
  vec3 nf = microNormal(p, n, 300.0, 0.14);
  nc = normalize(nc + (nf - n) * 0.25);
  vec3 nb = microNormal(p, n, 19.0, 0.16);           // the mould's hand-made unevenness
  nc = normalize(nc + (nb - n) * 0.25);

  float m  = fbm(p * 2.6);
  float m2 = fbm(p * 11.0 + 11.0);
  float rings = fbm(vec3(p.x * 1.6, p.y * 34.0, p.z * 1.6));
  float th1 = atan(p.z, p.x);
  float streak = fbm(vec3(th1 * 7.0, p.y * 2.2, 3.0));   // the mold's vertical drag
  float pores = smoothstep(0.80, 0.97, vnoise(p * 105.0));  // steam pinholes

  vec3 alb = vec3(0.745, 0.400, 0.092);
  alb *= 0.88 + 0.20 * m;
  alb *= 0.95 + 0.10 * rings;
  alb *= 0.92 + 0.16 * streak;
  alb = mix(alb, alb * vec3(1.0, 0.88, 0.66), smoothstep(0.72, 1.02, p.y) * 0.5);
  alb = mix(alb, alb * vec3(0.94, 0.86, 0.74), smoothstep(0.30, 0.00, p.y) * 0.7);
  // the custard is not homogeneous: faint marbling from the eggs and milk
  float swirl = fbm(vec3(p.x * 2.2, p.y * 7.5, p.z * 2.2) + 17.0);
  alb *= 0.965 + 0.07 * swirl;
  alb *= 1.0 - 0.22 * pores;

  // the syrup leaves a translucent amber stain where it ran
  float th0 = atan(p.z, p.x);
  float thr0 = caramelThresh(th0);
  float below = thr0 - p.y;
  float stain = smoothstep(0.0, 0.035, below) * (1.0 - smoothstep(0.05, 0.30, below));
  stain *= 0.55 + 0.45 * vnoise(vec3(th0 * 5.0, p.y * 12.0, 2.0));
  alb = mix(alb, alb * vec3(0.72, 0.50, 0.26), stain * 0.85);

  float rough = clamp(0.30 + 0.22 * m2 + 0.25 * pores, 0.10, 0.85);

  vec3 col = vec3(0.0);
  float sh = softShadow(p + n * 0.010, LK, 0.02, 4.0);
  col += pbr(alb, nc, v, LK, vec3(6.2, 4.8, 3.5), rough, 0.045, sh);
  col += pbr(alb, nc, v, LF, vec3(0.42, 0.52, 0.85), rough + 0.1, 0.045, 1.0) * 0.45;
  col += pbr(alb, nc, v, LB, vec3(1.5, 1.0, 0.66), rough + 0.05, 0.045, 1.0) * 0.55;

  // thin, wet skin: a satin coat that catches the softbox even head-on
  col += pbr(vec3(0.0), nc, v, LK, vec3(1.35, 1.10, 0.86), 0.16 + 0.10 * (1.0 - stain), 0.05, sh);
  col += pbr(vec3(0.0), nc, v, LF, vec3(0.4, 0.5, 0.75), 0.20, 0.05, 1.0) * 0.35;

  // subsurface: light that has travelled through the body
  float bl = pow(clamp(dot(-n, LB), 0.0, 1.0), 1.6);
  col += vec3(1.0, 0.40, 0.10) * bl * 0.45;
  float wrapK = pow(clamp(dot(-n, LK), 0.0, 1.0), 2.5);
  col += alb * vec3(1.0, 0.55, 0.22) * wrapK * 0.30;

  // the plate throws a warm bounce up into the lower third
  vec3 LBn = normalize(vec3(0.15, -0.55, 0.55));
  col += pbr(alb, nc, v, LBn, vec3(0.55, 0.34, 0.18), rough + 0.25, 0.045, 1.0)
       * smoothstep(0.50, 0.02, p.y) * 0.9;

  // the custard is translucent: the silhouette takes on an amber glow
  float edge = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  col += vec3(1.0, 0.42, 0.11) * edge * 0.24;

  float fres = 0.045 + 0.955 * pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 5.0);
  col += envR(reflect(v, n), rough) * fres * ao * 0.45;

  col *= ao;
  return col;
}

vec3 matCaramel(vec3 p, vec3 n, vec3 v, float ao){
  vec3 nc = microNormal(p, n, 120.0, 0.25);
  nc = normalize(mix(n, nc, 0.4));

  float m = fbm(p * 7.0);
  float burn = smoothstep(0.55, 0.85, fbm(p * 3.1 + 4.0));   // unevenly cooked syrup
  vec3 alb = vec3(0.26, 0.062, 0.007) * (0.65 + 0.60 * m);
  alb *= mix(1.0, 0.45, burn);
  float rough = 0.018 + 0.055 * m + 0.05 * burn;

  vec3 col = vec3(0.0);
  float sh = softShadow(p + n * 0.012, LK, 0.02, 4.0);
  col += pbr(alb * 0.55, nc, v, LK, vec3(7.4, 5.6, 4.0), rough, 0.028, sh);
  col += pbr(alb * 0.55, nc, v, LF, vec3(0.55, 0.7, 1.0), rough + 0.03, 0.028, 1.0) * 0.6;

  float ct = clamp(dot(n, v), 0.0, 1.0);
  float fres = 0.028 + 0.972 * pow(1.0 - ct, 5.0);
  vec3 R = reflect(v, n);
  col += envR(R, rough) * fres * 1.35;

  // amber glow where the light passes through the syrup
  float t1 = pow(clamp(dot(-n, LB), 0.0, 1.0), 1.2);
  float t2 = pow(clamp(dot(-n, LK), 0.0, 1.0), 2.0);
  col += vec3(1.0, 0.34, 0.05) * (t1 * 0.35 + t2 * 0.22) * (0.5 + 0.9 * m);
  col += alb * 0.22 * ao;

  col *= ao;
  return col;
}

vec3 matSyrup(vec3 p, vec3 n, vec3 v, float ao){
  vec3 nc = microNormal(p, n, 150.0, 0.10);
  float m = fbm(p * 9.0);
  vec3 alb = vec3(0.085, 0.017, 0.002) * (0.7 + 0.6 * m);
  float rough = 0.018 + 0.05 * m;

  vec3 col = vec3(0.0);
  float sh = softShadow(p + n * 0.010, LK, 0.02, 4.0);
  col += pbr(alb, nc, v, LK, vec3(5.2, 4.0, 3.0), rough, 0.03, sh);
  col += pbr(alb, nc, v, LF, vec3(0.4, 0.5, 0.8), rough + 0.03, 0.03, 1.0) * 0.5;

  float ct = clamp(dot(n, v), 0.0, 1.0);
  float fres = 0.03 + 0.97 * pow(1.0 - ct, 4.5);
  col += envR(reflect(v, n), rough) * fres * 1.15;

  float t1 = pow(clamp(dot(-n, LB), 0.0, 1.0), 1.5);
  col += vec3(0.95, 0.30, 0.04) * t1 * 0.16;
  col *= ao;
  return col;
}

vec3 matPlate(vec3 p, vec3 n, vec3 v, float ao){
  float m = fbm(p * 5.0);
  float m2 = fbm(p * 19.0);
  float rad = length(p.xz);
  vec3 alb = vec3(0.040, 0.036, 0.032) * (0.75 + 0.55 * m);       // dark glazed stoneware
  alb = mix(alb, vec3(0.20, 0.175, 0.145), smoothstep(0.88, 0.99, rad) * 0.55);
  float rough = clamp(0.13 + 0.10 * m2, 0.05, 0.45);

  vec3 col = vec3(0.0);
  float sh = softShadow(p + n * 0.008, LK, 0.02, 4.0);
  col += pbr(alb, n, v, LK, vec3(6.6, 5.2, 3.9), rough, 0.05, sh);
  col += pbr(alb, n, v, LF, vec3(0.55, 0.72, 1.05), rough + 0.05, 0.05, 1.0) * 0.7;
  col += pbr(alb, n, v, LB, vec3(1.2, 0.85, 0.6), rough + 0.05, 0.05, 1.0) * 0.5;

  float ct = clamp(dot(n, v), 0.0, 1.0);
  float fres = 0.05 + 0.95 * pow(1.0 - ct, 4.0);
  col += envR(reflect(v, n), rough) * fres * ao * 0.62;
  col *= ao;
  return col;
}

vec3 shadeSimple(vec3 p, vec3 n, vec3 v, float mat, float ao){
  if (mat < 1.5){
    float cm = caramelMask(p);
    if (cm > 0.5) return matCaramel(p, n, v, ao);
    return matCustard(p, n, v, ao);
  }
  float sy = syrupField(p);
  if (sy > 0.5) return matSyrup(p, n, v, ao);
  return matPlate(p, n, v, ao);
}

/* ---------------- main ---------------- */

vec3 camRay(vec2 uv){
  vec3 fw = normalize(uCamTarget - uCamPos);
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  return normalize(fw + (uv.x * rt + uv.y * up) * uFovTan);
}

void main(){
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = (frag - 0.5 * uRes) / (0.5 * uRes.y);

  vec3 ro = uCamPos;
  vec3 rd = camRay(uv);

  float tPlane = 1e9;
  if (rd.y < -1e-4) tPlane = -ro.y / rd.y;

  float tmax = min(tPlane, 14.0);
  vec2 hit = trace(ro, rd, tmax);

  vec3 col;
  if (hit.x > 0.0){
    vec3 p = ro + rd * hit.x;
    vec3 n = calcNormal(p);
    vec3 v = -rd;
    float ao = calcAO(p, n);
    if (hit.y < 1.5){
      float cm = caramelMask(p);
      vec3 cc = matCustard(p, n, v, ao);
      vec3 kc = matCaramel(p, n, v, ao);
      col = mix(cc, kc, smoothstep(0.15, 0.85, cm));
    } else {
      float sy = syrupField(p);
      vec3 pc = matPlate(p, n, v, ao);
      if (sy > 0.002) pc = mix(pc, matSyrup(p, n, v, ao), smoothstep(0.05, 0.85, sy));
      col = pc;
    }
  } else if (tPlane < 14.0){
    vec3 p = ro + rd * tPlane;
    vec3 n = vec3(0.0, 1.0, 0.0);
    vec3 v = -rd;
    float ao = 1.0;

    float m = fbm(vec3(p.xz * 7.0, 1.7));
    vec3 alb = vec3(0.020, 0.018, 0.017) * (0.7 + 0.6 * m);

    // a real, single-bounce reflection of the thing above the table
    vec3 R = reflect(rd, n);
    float jitter = (hash13(vec3(frag, 3.0)) - 0.5) * (0.012 + 0.05 * m);
    R = normalize(R + vec3(jitter, 0.0, -jitter * 0.7));
    vec3 refl;
    vec2 rh = trace(p + n * 0.004, R, 8.0);
    if (rh.x > 0.0){
      vec3 rp = p + n * 0.004 + R * rh.x;
      vec3 rn = calcNormal(rp);
      refl = shadeSimple(rp, rn, -R, rh.y, 0.75);
    } else {
      refl = envR(R, 0.55) * 0.55;
    }

    float ct = clamp(dot(n, v), 0.0, 1.0);
    float fres = 0.02 + 0.98 * pow(1.0 - ct, 3.0);
    col = refl * fres * 0.35 + alb * 0.30;

    // the plate's shadow falls on the table
    float sh = softShadow(p + n * 0.004, LK, 0.02, 4.0);
    col *= 0.25 + 0.75 * sh;
    // light pool: the room falls away into darkness
    float pool = 1.0 / (1.0 + 0.55 * dot(p.xz, p.xz));
    col *= pool;
    col = mix(bg(rd) * 0.8, col, smoothstep(6.5, 1.0, tPlane));
  } else {
    col = bg(rd);
  }

  // exposure / warm-up
  col *= mix(0.22, 1.0, uIntro);

  float depth = 40.0;
  if (hit.x > 0.0) depth = hit.x;
  else if (tPlane < 14.0) depth = tPlane;

  fragColor = vec4(col, depth);
}
`;

  const BRIGHT = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform vec2 uOut;
out vec4 fragColor;
void main(){
  vec2 uv = gl_FragCoord.xy / uOut;
  vec3 c = vec3(0.0);
  for (int y = -1; y <= 1; y++){
    for (int x = -1; x <= 1; x++){
      c += texture(uTex, uv + vec2(float(x), float(y)) * uTexel * 0.5).rgb;
    }
  }
  c /= 9.0;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c *= smoothstep(1.1, 4.0, l);
  fragColor = vec4(c, 1.0);
}`;

  const BLUR = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uDir;
uniform vec2 uOut;
out vec4 fragColor;
void main(){
  vec2 uv = gl_FragCoord.xy / uOut;
  vec3 c = texture(uTex, uv).rgb * 0.2270270270;
  float w[5];
  w[0]=0.1945945946; w[1]=0.1216216216; w[2]=0.0540540541; w[3]=0.0162162162; w[4]=0.0;
  for (int i = 1; i <= 4; i++){
    c += texture(uTex, uv + uDir * float(i)).rgb * w[i-1];
    c += texture(uTex, uv - uDir * float(i)).rgb * w[i-1];
  }
  fragColor = vec4(c, 1.0);
}`;

  const COMPOSITE = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2 uRes;
uniform float uTime;
uniform float uIntro;
uniform float uExposure;
uniform float uFocus;
uniform float uAperture;
out vec4 fragColor;

vec3 aces(vec3 x){
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
float h21(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float cocOf(float d){
  float c = abs(d - uFocus) / max(uFocus, 0.001);
  return clamp(c, 0.0, 1.6);
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;

  vec4 c0 = texture(uScene, uv);
  float depth = c0.a;
  float coc = cocOf(depth);

  // thin-lens gather, weighted so the plane of focus never smears
  vec3 acc = c0.rgb;
  float wsum = 1.0;
  float r = coc * uAperture;
  if (r > 0.0004){
    for (int i = 0; i < 12; i++){
      float fi = float(i);
      float ang = fi * 2.39996323;
      float rad = sqrt((fi + 0.5) / 12.0) * r;
      vec2 off = vec2(cos(ang), sin(ang)) * rad;
      vec4 s = texture(uScene, uv + off);
      float dz = abs(s.a - depth) / max(depth, 0.001);
      float w = 1.0 / (1.0 + dz * 90.0);
      acc += s.rgb * w;
      wsum += w;
    }
    acc /= wsum;
  }
  vec3 col = mix(c0.rgb, acc, smoothstep(0.06, 0.6, coc));

  vec3 bloom = texture(uBloom, uv).rgb;
  col += bloom * vec3(1.0, 0.78, 0.52) * 0.32;

  col *= uExposure;

  // grade: cool shadows, warm highlights
  col = max(col, vec3(0.0));
  {
    float lum0 = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(col, col * vec3(0.90, 0.96, 1.10), (1.0 - smoothstep(0.02, 0.45, lum0)) * 0.55);
    col = mix(col, col * vec3(1.07, 1.00, 0.90), smoothstep(0.35, 1.6, lum0) * 0.40);
  }
  col = aces(col);

  col = pow(col, vec3(0.4545));

  // vignette
  vec2 d = uv - 0.5;
  float vig = smoothstep(1.05, 0.15, length(d) * 1.25);
  col *= mix(0.42, 1.0, vig);

  // film grain
  float g = h21(gl_FragCoord.xy + fract(uTime) * 137.0) - 0.5;
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col += g * (0.028 * (1.0 - lum * 0.75));

  // gentle black lift, like a printed still
  col = col * (1.0 - 0.012) + vec3(0.012, 0.011, 0.011);

  col *= uIntro;

  fragColor = vec4(col, 1.0);
}`;

  /* ------------------------------------------------------------------ */
  /*  gl plumbing                                                        */
  /* ------------------------------------------------------------------ */

  function compile(type, src){
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
      console.error(gl.getShaderInfoLog(s));
      const line = (gl.getShaderInfoLog(s) || '').match(/0:(\d+)/);
      if (line) {
        const n = +line[1];
        console.error(src.split('\n').slice(Math.max(0, n - 4), n + 3).join('\n'));
      }
      throw new Error('shader compile failed');
    }
    return s;
  }

  function link(vsSrc, fsSrc){
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)){
      console.error(gl.getProgramInfoLog(p));
      throw new Error('link failed');
    }
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++){
      const info = gl.getActiveUniform(p, i);
      u[info.name] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }

  const progScene = link(VS, SCENE);
  const progBright = link(VS, BRIGHT);
  const progBlur = link(VS, BLUR);
  const progComp = link(VS, COMPOSITE);

  const vao = gl.createVertexArray();

  function makeTarget(w, h){
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (hasFloat){
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fb, w, h };
  }

  let sceneT = null, bloomA = null, bloomB = null;
  let W = 1, H = 1;

  function resize(){
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    // keep the fragment budget sane: this is a heavy marcher
    const maxPix = 1500000;
    let scale = Math.min(1, Math.sqrt(maxPix / Math.max(1, cw * ch)));
    scale = Math.max(scale, 0.45);
    W = Math.max(2, Math.round(cw * scale));
    H = Math.max(2, Math.round(ch * scale));

    canvas.width = W;
    canvas.height = H;

    [sceneT, bloomA, bloomB].forEach(t => { if (t){ gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); } });
    sceneT = makeTarget(W, H);
    const bw = Math.max(2, W >> 2), bh = Math.max(2, H >> 2);
    bloomA = makeTarget(bw, bh);
    bloomB = makeTarget(bw, bh);
  }

  /* ------------------------------------------------------------------ */
  /*  camera + physics                                                   */
  /* ------------------------------------------------------------------ */

  const camBase = { x: 0.52, y: 2.05, z: 2.95 };
  const camTgt  = { x: 0.00, y: 0.330, z: 0.0 };
  const FOV_TAN = 0.300;

  const jig = { x: 0, vx: 0, z: 0, vz: 0, sq: 0, vsq: 0, energy: 0 };
  const K = 175.0, C = 2.0;

  function stepPhysics(dt){
    const n = 6, h = Math.min(dt, 0.05) / n;
    for (let i = 0; i < n; i++){
      jig.vx += (-K * jig.x - C * jig.vx) * h;
      jig.x  += jig.vx * h;
      jig.vz += (-K * jig.z - C * jig.vz) * h;
      jig.z  += jig.vz * h;
      jig.vsq += (-260.0 * jig.sq - 9.0 * jig.vsq) * h;
      jig.sq  += jig.vsq * h;
    }
    const lim = 0.115;
    jig.x = Math.max(-lim, Math.min(lim, jig.x));
    jig.z = Math.max(-lim, Math.min(lim, jig.z));
    jig.sq = Math.max(-0.10, Math.min(0.14, jig.sq));

    const e = Math.min(1, (Math.abs(jig.vx) + Math.abs(jig.vz)) * 0.22 + Math.abs(jig.vsq) * 0.05);
    jig.energy += (e - jig.energy) * Math.min(1, dt * 18);
  }

  function impulse(sx, sz, strength, squash){
    jig.vx += sx * strength * 2.8;
    jig.vz += sz * strength * 2.8;
    if (squash) jig.vsq += strength * 2.2;
  }

  /* ------------------------------------------------------------------ */
  /*  sound                                                              */
  /* ------------------------------------------------------------------ */

  let actx = null;
  let lastSound = 0;

  function audio(){
    if (!actx){
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
      const master = actx.createGain();
      master.gain.value = 0.55;
      master.connect(actx.destination);
      actx._master = master;
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }

  function jellySound(strength){
    const a = audio();
    if (!a) return;
    const now = a.currentTime;
    if (now - lastSound < 0.075) return;
    lastSound = now;
    const s = Math.max(0.12, Math.min(1, strength));

    const out = a.createGain();
    out.gain.setValueAtTime(0.0, now);
    out.gain.linearRampToValueAtTime(0.16 * s, now + 0.012);
    out.gain.exponentialRampToValueAtTime(0.0006, now + 0.55);
    out.connect(a._master);

    const lp = a.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1100, now);
    lp.frequency.exponentialRampToValueAtTime(320, now + 0.4);
    lp.connect(out);

    const o = a.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(210 + 90 * s, now);
    o.frequency.exponentialRampToValueAtTime(66, now + 0.26);
    const og = a.createGain();
    og.gain.setValueAtTime(0.9, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    o.connect(og); og.connect(lp);
    o.start(now); o.stop(now + 0.55);

    const o2 = a.createOscillator();
    o2.type = 'triangle';
    o2.frequency.setValueAtTime(560 * (0.85 + 0.3 * s), now);
    o2.frequency.exponentialRampToValueAtTime(190, now + 0.14);
    const og2 = a.createGain();
    og2.gain.setValueAtTime(0.22 * s, now);
    og2.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    o2.connect(og2); og2.connect(out);
    o2.start(now); o2.stop(now + 0.2);

    // the wet squelch
    const len = Math.floor(a.sampleRate * 0.13);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++){
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    const src = a.createBufferSource();
    src.buffer = buf;
    const bp = a.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(900 + 700 * s, now);
    bp.Q.value = 2.2;
    const ng = a.createGain();
    ng.gain.value = 0.10 * s;
    src.connect(bp); bp.connect(ng); ng.connect(out);
    src.start(now);
  }

  /* ------------------------------------------------------------------ */
  /*  input                                                              */
  /* ------------------------------------------------------------------ */

  let dragging = false, lastX = 0, lastY = 0, lastT = 0;
  let moved = 0;

  function toWorldDelta(dx, dy){
    // screen right -> world +x (roughly), screen down -> world -y tilt -> we use z
    const k = 0.0016;
    return [dx * k, dy * k * 0.75];
  }

  canvas.addEventListener('pointerdown', e => {
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
    dragging = true; moved = 0;
    lastX = e.clientX; lastY = e.clientY; lastT = performance.now();
    canvas.classList.add('dragging');
    audio();
    impulse(0.0, 0.0, 0.55, 1.0);
    impulse((Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.25, 0.4, 0);
    jellySound(0.6);
  });

  canvas.addEventListener('pointermove', e => {
    if (!dragging) return;
    const now = performance.now();
    const dt = Math.max(1, now - lastT);
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY; lastT = now;
    moved += Math.abs(dx) + Math.abs(dy);

    const [wx, wz] = toWorldDelta(dx, dy);
    const v = Math.min(1, (Math.abs(dx) + Math.abs(dy)) / (dt * 0.9));
    impulse(wx, wz, 0.55 + v, 0);
    if (v > 0.12) jellySound(0.25 + v * 0.55);
  });

  function endDrag(e){
    if (!dragging) return;
    dragging = false;
    canvas.classList.remove('dragging');
    if (moved < 6){
      impulse(0, 0, 0.5, 1.0);
      jellySound(0.5);
    }
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  window.addEventListener('keydown', e => {
    if (e.code === 'Space'){
      e.preventDefault();
      impulse((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, 0.9, 1.0);
      jellySound(0.9);
    }
  });

  /* ------------------------------------------------------------------ */
  /*  render loop                                                        */
  /* ------------------------------------------------------------------ */

  let startT = performance.now();
  let last = startT;
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };

  window.addEventListener('pointermove', e => {
    mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
    mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  function drawFullscreen(){
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function frame(now){
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = (now - startT) / 1000;

    stepPhysics(dt);

    mouse.x += (mouse.tx - mouse.x) * Math.min(1, dt * 2.0);
    mouse.y += (mouse.ty - mouse.y) * Math.min(1, dt * 2.0);

    const intro = Math.min(1, Math.max(0, (t - 0.75) / 4.4));
    const introE = 1 - Math.pow(1 - intro, 3);

    // camera: a slow, never-resting drift, plus a dolly-in on the intro
    const drift = t * 0.055;
    const dolly = 1.0 + (1 - introE) * 0.55;
    // the camera creeps around the plinth: the light is fixed, so the
    // highlights travel across the syrup while you watch
    const orb = Math.sin(t * 0.042) * 0.115;
    const bx = camBase.x, bz = camBase.z;
    const ox = (bx * Math.cos(orb) + bz * Math.sin(orb)) * dolly;
    const oz = (-bx * Math.sin(orb) + bz * Math.cos(orb)) * dolly;
    const cx = ox + Math.sin(drift * 0.9) * 0.035 + mouse.x * 0.05;
    const cy = camBase.y + Math.sin(drift * 0.7 + 1.1) * 0.022 + (1 - introE) * 0.30 - mouse.y * 0.025;
    const cz = oz + Math.sin(drift) * 0.03;

    // ---- scene
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneT.fb);
    gl.viewport(0, 0, W, H);
    gl.useProgram(progScene.p);
    gl.uniform2f(progScene.u.uRes, W, H);
    gl.uniform3f(progScene.u.uCamPos, cx, cy, cz);
    gl.uniform3f(progScene.u.uCamTarget, camTgt.x + mouse.x * 0.006, camTgt.y, camTgt.z);
    // portrait screens get a wider lens instead of a cropped subject
    const aspect = W / H;
    let fovTan = FOV_TAN;
    if (aspect < 1.2) fovTan = Math.min(0.56, FOV_TAN * Math.pow(1.2 / aspect, 0.75));
    gl.uniform1f(progScene.u.uFovTan, fovTan);
    gl.uniform1f(progScene.u.uTime, t);
    gl.uniform1f(progScene.u.uIntro, introE);
    // a barely-there idle motion: the thing is never perfectly still
    const idleX = Math.sin(t * 1.31) * 0.0030 + Math.sin(t * 2.71 + 1.3) * 0.0011;
    const idleZ = Math.sin(t * 1.07 + 2.0) * 0.0026 + Math.sin(t * 2.33 + 0.4) * 0.0010;
    const idleS = Math.sin(t * 1.87 + 0.9) * 0.0022;
    gl.uniform4f(progScene.u.uJig, jig.x + idleX, jig.z + idleZ, jig.sq + idleS, Math.max(jig.energy, 0.0));
    drawFullscreen();

    // ---- bloom
    const bw = bloomA.w, bh = bloomA.h;
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.fb);
    gl.viewport(0, 0, bw, bh);
    gl.useProgram(progBright.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneT.tex);
    gl.uniform1i(progBright.u.uTex, 0);
    gl.uniform2f(progBright.u.uTexel, 1 / W, 1 / H);
    gl.uniform2f(progBright.u.uOut, bw, bh);
    drawFullscreen();

    gl.useProgram(progBlur.p);
    gl.uniform2f(progBlur.u.uOut, bw, bh);
    gl.uniform1i(progBlur.u.uTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomB.fb);
    gl.bindTexture(gl.TEXTURE_2D, bloomA.tex);
    gl.uniform2f(progBlur.u.uDir, 1.2 / bw, 0);
    drawFullscreen();

    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.fb);
    gl.bindTexture(gl.TEXTURE_2D, bloomB.tex);
    gl.uniform2f(progBlur.u.uDir, 0, 1.2 / bh);
    drawFullscreen();

    // ---- composite
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(progComp.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneT.tex);
    gl.uniform1i(progComp.u.uScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloomA.tex);
    gl.uniform1i(progComp.u.uBloom, 1);
    gl.uniform2f(progComp.u.uRes, W, H);
    gl.uniform1f(progComp.u.uTime, t);
    gl.uniform1f(progComp.u.uIntro, introE);
    gl.uniform1f(progComp.u.uExposure, 1.0);
    gl.uniform1f(progComp.u.uFocus, 3.35);
    gl.uniform1f(progComp.u.uAperture, 0.0075);
    drawFullscreen();
    gl.activeTexture(gl.TEXTURE0);

    if (!frame.veiled && t > 0.55){
      frame.veiled = true;
      document.getElementById('veil').classList.add('gone');
    }
  }

  resize();
  let rt = null;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(resize, 180);
  });

  requestAnimationFrame(frame);

  // expose a little state for debugging
  window.__purun = { jig, impulse, jellySound };
})();
