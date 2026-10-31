// GLSL sources. Units: Schwarzschild radius rs = 1, c = 1, G M = 1/2.

export const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const SCENE_FRAG = `#version 300 es
precision highp float;

uniform vec2  uRes;
uniform float uTime;
uniform vec3  uCamPos;
uniform vec3  uCamTarget;
uniform float uTanHalf;
uniform float uRoll;
uniform vec3  uProbePos;
uniform float uProbeR;
uniform float uProbeGlow;
uniform float uProbeShift;   // 1 = no shift, 0 = frozen at horizon
uniform float uDiskIn;
uniform float uDiskOut;
uniform float uSpin;
uniform float uRelease;      // 0..1, ending collapse
uniform float uQuality;      // 0..1 detail

out vec4 fragColor;

#define STEPS 220

// ---------------------------------------------------------------- hashes
float hash31(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
vec3 hash33(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}
float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash31(i + vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  return mix(mix(nx00, nx10, f.y), mix(nx01, nx11, f.y), f.z);
}
float fbm(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * noise3(p);
    p = p * 2.03 + vec3(11.3, 4.7, 7.9);
    a *= 0.5;
  }
  return s;
}

// ---------------------------------------------------------------- palette
vec3 heatColor(float t) {
  // t: 0 outer/cool -> 1 inner/hot
  vec3 c0 = vec3(0.55, 0.075, 0.015);
  vec3 c1 = vec3(1.00, 0.30, 0.055);
  vec3 c2 = vec3(1.00, 0.68, 0.30);
  vec3 c3 = vec3(0.98, 0.95, 0.90);
  vec3 c4 = vec3(0.72, 0.86, 1.00);
  vec3 c = mix(c0, c1, smoothstep(0.0, 0.35, t));
  c = mix(c, c2, smoothstep(0.30, 0.62, t));
  c = mix(c, c3, smoothstep(0.60, 0.86, t));
  c = mix(c, c4, smoothstep(0.85, 1.0, t));
  return c;
}

// ---------------------------------------------------------------- sky
vec3 starLayer(vec3 d, float scale, float cutoff, float size, vec3 tint) {
  vec3 p = d * scale;
  vec3 id = floor(p);
  vec3 f = fract(p) - 0.5;
  vec3 hs = hash33(id);
  if (hs.x < cutoff) return vec3(0.0);
  vec3 off = (hash33(id + 19.7) - 0.5) * 0.7;
  float dist = length(f - off);
  float bright = exp(-dist * dist * size);
  float mag = pow((hs.x - cutoff) / (1.0 - cutoff), 3.0);
  return tint * bright * (0.22 + 2.0 * mag);
}

vec3 sky(vec3 d) {
  float n1 = fbm(d * 2.7 + 2.0);
  float n2 = fbm(d * 6.1 - 5.0);
  vec3 dust = mix(vec3(0.006, 0.010, 0.026), vec3(0.042, 0.024, 0.052), n1);
  dust += vec3(0.012, 0.020, 0.040) * pow(clamp(n2, 0.0, 1.0), 3.0);
  dust *= 0.55;

  vec3 s = vec3(0.0);
  s += starLayer(d, 105.0, 0.965, 190.0, vec3(0.72, 0.82, 1.0));
  s += starLayer(d + 0.37, 165.0, 0.972, 220.0, vec3(1.0, 0.90, 0.78));
  s += starLayer(d + 0.71, 240.0, 0.980, 250.0, vec3(1.0, 0.72, 0.52));

  // two anchors so the lensing reads
  vec3 anchor = normalize(vec3(-0.55, 0.42, -0.72));
  float ad = max(dot(d, anchor), 0.0);
  s += vec3(0.9, 0.95, 1.0) * pow(ad, 3200.0) * 3.0;
  s += vec3(0.55, 0.68, 1.0) * pow(ad, 260.0) * 0.22;

  vec3 anchor2 = normalize(vec3(0.72, -0.18, 0.66));
  float ad2 = max(dot(d, anchor2), 0.0);
  s += vec3(1.0, 0.78, 0.58) * pow(ad2, 2200.0) * 1.4;

  return dust + s;
}

// ---------------------------------------------------------------- disk
// Evaluated where a ray crosses the disk mid-plane. Returns source colour in
// rgb and optical depth per unit path in a.
vec4 diskSample(vec3 p, vec3 rayDir) {
  float r = length(p.xz);
  if (r < uDiskIn || r > uDiskOut) return vec4(0.0);
  float t = (r - uDiskIn) / (uDiskOut - uDiskIn);   // 0 inner -> 1 outer
  float thick = 0.05 + 0.30 * t * t;

  float phi = atan(p.z, p.x);
  float omega = 1.35 * pow(max(r, 0.6), -1.5) * uSpin;
  float a = phi - omega * uTime;
  vec2 rp = vec2(cos(a), sin(a)) * r;

  // sheared turbulence in the co-moving frame
  float n = fbm(vec3(rp * 0.60, 3.0));
  float fine = fbm(vec3(rp * 2.4 + 9.0, 0.0));
  float fil = pow(clamp(n * 1.3, 0.0, 1.0), 1.6);
  float streaks = pow(clamp(fine, 0.0, 1.0), 2.2);

  float inner = smoothstep(0.0, 0.05, t);
  float outer = pow(1.0 - t, 3.6);
  float turb = 0.10 + 1.7 * fil + 0.9 * streaks;
  float dens = inner * outer * turb;

  // Doppler beaming + gravitational shift
  float beta = min(sqrt(0.5 / max(r, 0.5)), 0.85);
  vec3 vdir = normalize(vec3(-p.z, 0.0, p.x)) * sign(uSpin);
  vec3 toCam = -normalize(rayDir);
  float gam = 1.0 / sqrt(max(1.0 - beta * beta, 1e-3));
  float dop = 1.0 / max(gam * (1.0 - beta * dot(vdir, toCam)), 1e-4);
  float grav = sqrt(max(1.0 - 1.0 / r, 0.0));
  float g = clamp(dop * grav, 0.18, 2.35);

  float heat = pow(clamp(1.0 - t, 0.0, 1.0), 0.9);

  vec3 col = heatColor(heat * 0.94 + 0.04);
  col = mix(col, vec3(0.72, 0.84, 1.0), clamp(g - 1.0, 0.0, 1.0) * 0.55);
  col = mix(col, col * vec3(1.0, 0.42, 0.22), clamp(1.0 - g, 0.0, 1.0) * 0.9);

  // emission follows the filaments too, so the dark lanes stay dark
  float intensity = 0.62 * pow(g, 2.0) * (0.18 + 0.85 * turb);
  // hot razor edge at the ISCO
  intensity += 0.95 * exp(-pow((t - 0.008) / 0.024, 2.0)) * (0.35 + 0.65 * dop);

  return vec4(col * intensity, dens);
}

// ---------------------------------------------------------------- trace
float segDist2(vec3 a, vec3 b, vec3 p) {
  vec3 ab = b - a;
  float dd = dot(ab, ab);
  float h = clamp(dot(p - a, ab) / max(dd, 1e-6), 0.0, 1.0);
  vec3 q = a + ab * h;
  return dot(p - q, p - q);
}

vec3 probeColor(float shift) {
  // probe beacon: cold white core, shifting to ember and out
  vec3 c = mix(vec3(1.0, 0.28, 0.10), vec3(0.80, 0.93, 1.0), smoothstep(0.0, 0.85, shift));
  return c;
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
  vec3 ww = normalize(uCamTarget - uCamPos);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  float cr = cos(uRoll), sr = sin(uRoll);
  vec3 ru = uu * cr + vv * sr;
  vec3 rv = vv * cr - uu * sr;
  vec3 rd = normalize(uv.x * ru + uv.y * rv + ww / max(uTanHalf, 0.05));

  vec3 pos = uCamPos;
  vec3 dir = rd;
  vec3 hv = cross(pos, dir);
  float h2 = dot(hv, hv);

  vec3 col = vec3(0.0);
  float trans = 1.0;
  bool captured = false;

  // closest approach of this bent photon path to the probe: gives a stable,
  // correctly occluded and lensed beacon instead of a step-size dependent blob
  float probeD2 = 1e9;
  float probeTrans = 1.0;
  float tailD1 = 1e9, tailD2 = 1e9, tailD3 = 1e9, tailD4 = 1e9;
  vec3 tdir = normalize(vec3(uProbePos.z, 0.0, -uProbePos.x));

  for (int i = 0; i < STEPS; i++) {
    float r = length(pos);
    if (r < 1.0) { captured = true; break; }
    if (r > 90.0 && dot(pos, dir) > 0.0) break;

    float dt = clamp(0.05 * r, 0.014, 0.42);
    if (r < 2.2) dt = 0.012 + 0.035 * (r - 1.0);

    vec3 acc = -1.5 * h2 * pos / pow(dot(pos, pos), 2.5);
    dir += acc * dt;
    vec3 npos = pos + dir * dt;
    vec3 mid = (pos + npos) * 0.5;

    // accretion flow: sample the slab where the ray crosses the mid-plane
    if (pos.y * npos.y < 0.0) {
      float f = pos.y / (pos.y - npos.y);
      vec3 hit = mix(pos, npos, f);
      vec4 ds = diskSample(hit, dir);
      if (ds.a > 0.0) {
        float rr = length(hit.xz);
        float tt = clamp((rr - uDiskIn) / (uDiskOut - uDiskIn), 0.0, 1.0);
        float thick = 0.05 + 0.30 * tt * tt;
        float path = min(2.0 * thick / max(abs(dir.y), 0.025), 4.5);
        float tau = ds.a * path * 1.6;
        float alpha = 1.0 - exp(-tau);
        col += trans * ds.rgb * (alpha * 0.9 + 0.02 * ds.a);
        trans *= 1.0 - alpha * 0.92;
      }
    }

    float pd2 = segDist2(pos, npos, uProbePos);
    if (pd2 < probeD2) { probeD2 = pd2; probeTrans = trans; }

    // the trail it drags behind it
    tailD1 = min(tailD1, segDist2(pos, npos, uProbePos + tdir * 0.07));
    tailD2 = min(tailD2, segDist2(pos, npos, uProbePos + tdir * 0.16));
    tailD3 = min(tailD3, segDist2(pos, npos, uProbePos + tdir * 0.26));
    tailD4 = min(tailD4, segDist2(pos, npos, uProbePos + tdir * 0.38));

    pos = npos;
    if (trans < 0.02) break;
  }

  if (!captured) {
    col += trans * sky(normalize(dir));
  }

  // the beacon itself
  float pulse = 0.80 + 0.20 * sin(uTime * 6.2831 * (0.55 * uProbeShift + 0.05) - 1.2);
  float beacon = exp(-probeD2 * 900.0) * 3.4
               + exp(-probeD2 * 120.0) * 0.55
               + exp(-probeD2 * 14.0) * 0.06;
  beacon *= uProbeGlow * pulse;
  float trail = exp(-tailD1 * 260.0) * 0.50
              + exp(-tailD2 * 260.0) * 0.30
              + exp(-tailD3 * 260.0) * 0.16
              + exp(-tailD4 * 260.0) * 0.07;
  col += probeColor(uProbeShift) * probeTrans * (beacon + trail * uProbeGlow * pulse * 0.55);

  // warm pressure of light as the probe nears the horizon
  float ringAmt = smoothstep(4.5, 1.06, length(uProbePos));
  col += vec3(1.0, 0.38, 0.13) * ringAmt * 0.012;

  fragColor = vec4(max(col, 0.0), 1.0);
}
`;

export const BRIGHT_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uThreshold;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = texture(uTex, uv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = smoothstep(uThreshold, uThreshold + 0.7, l);
  fragColor = vec4(c * k, 1.0);
}
`;

export const BLUR_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform vec2 uDir;      // texel-space direction
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 sum = texture(uTex, uv).rgb * 0.2270270270;
  sum += texture(uTex, uv + uDir * 1.3846153846).rgb * 0.3162162162;
  sum += texture(uTex, uv - uDir * 1.3846153846).rgb * 0.3162162162;
  sum += texture(uTex, uv + uDir * 3.2307692308).rgb * 0.0702702703;
  sum += texture(uTex, uv - uDir * 3.2307692308).rgb * 0.0702702703;
  fragColor = vec4(sum, 1.0);
}
`;

export const COMPOSITE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uBloom1;
uniform sampler2D uBloom2;
uniform vec2  uRes;
uniform float uTime;
uniform float uExposure;
uniform float uFade;
uniform float uBloomAmount;
uniform float uAberr;
uniform float uGrain;

out vec4 fragColor;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 c = uv - 0.5;
  float r2 = dot(c, c);

  vec2 off = c * r2 * uAberr;
  vec3 col;
  col.r = texture(uScene, uv + off).r;
  col.g = texture(uScene, uv).g;
  col.b = texture(uScene, uv - off).b;

  vec3 bloom = texture(uBloom1, uv).rgb * 0.78 + texture(uBloom2, uv).rgb * 0.22;
  col += bloom * uBloomAmount;

  col *= uExposure;
  col = aces(col);

  // gentle halation toward warmth at the highlights
  col += vec3(0.06, 0.024, 0.008) * pow(max(dot(col, vec3(0.2, 0.7, 0.1)), 0.0), 3.0);

  float vig = smoothstep(1.25, 0.28, length(c * vec2(1.02, 1.22)));
  col *= 0.16 + 0.84 * vig;

  col = pow(max(col, 0.0), vec3(1.0 / 2.2));

  // grain lives in display space, stronger in the mid-tones than in the void
  float lum = dot(col, vec3(0.333));
  float g = hash12(gl_FragCoord.xy + fract(uTime) * 431.0) - 0.5;
  col += g * uGrain * smoothstep(0.0, 0.12, lum);

  fragColor = vec4(col * uFade, 1.0);
}
`;
