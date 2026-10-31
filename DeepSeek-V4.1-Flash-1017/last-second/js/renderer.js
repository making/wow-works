// WebGL2 renderer: geodesic scene pass, bloom chain, film composite.

import { VERT, SCENE_FRAG, BRIGHT_FRAG, BLUR_FRAG, COMPOSITE_FRAG } from './shaders.js';

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    console.error('shader compile failed:\n' + log);
    throw new Error(log);
  }
  return sh;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    console.error('link failed:\n' + log);
    throw new Error(log);
  }
  const uniforms = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    uniforms[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
  }
  return { prog: p, u: uniforms };
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('EXT_color_buffer_half_float');
    gl.getExtension('OES_texture_float_linear');

    this.sceneProg = program(gl, VERT, SCENE_FRAG);
    this.brightProg = program(gl, VERT, BRIGHT_FRAG);
    this.blurProg = program(gl, VERT, BLUR_FRAG);
    this.compProg = program(gl, VERT, COMPOSITE_FRAG);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.vao = vao;

    this.scene = null;    // { fbo, tex, w, h }
    this.b1 = null;
    this.b1t = null;
    this.b2 = null;
    this.b2t = null;

    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderScale = 0.72;
    this.maxDim = 2200;
    this.resize();
  }

  makeTarget(w, h) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (ok) console.warn('incomplete framebuffer', w, h);
    return { fbo, tex, w, h };
  }

  resize() {
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let cw = Math.round(cssW * dpr);
    let ch = Math.round(cssH * dpr);
    const over = Math.max(cw, ch) / this.maxDim;
    if (over > 1) { cw = Math.round(cw / over); ch = Math.round(ch / over); }
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
      this.dpr = dpr / Math.max(over, 1);
    }
    this.cssW = cssW;
    this.cssH = cssH;

    const sw = Math.max(2, Math.round(cw * this.renderScale));
    const sh = Math.max(2, Math.round(ch * this.renderScale));
    if (!this.scene || this.scene.w !== sw || this.scene.h !== sh) {
      this.disposeTargets();
      this.scene = this.makeTarget(sw, sh);
      this.b1 = this.makeTarget(Math.max(2, sw >> 2), Math.max(2, sh >> 2));
      this.b1t = this.makeTarget(Math.max(2, sw >> 2), Math.max(2, sh >> 2));
      this.b2 = this.makeTarget(Math.max(2, sw >> 3), Math.max(2, sh >> 3));
      this.b2t = this.makeTarget(Math.max(2, sw >> 3), Math.max(2, sh >> 3));
    }
  }

  setRenderScale(s) {
    const clamped = Math.max(0.4, Math.min(1, s));
    if (Math.abs(clamped - this.renderScale) < 0.03) return;
    this.renderScale = clamped;
    this.resize();
  }

  disposeTargets() {
    const gl = this.gl;
    for (const t of [this.scene, this.b1, this.b1t, this.b2, this.b2t]) {
      if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
    }
    this.scene = this.b1 = this.b1t = this.b2 = this.b2t = null;
  }

  drawQuad() {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  bindTarget(t) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null);
    gl.viewport(0, 0, t ? t.w : this.canvas.width, t ? t.h : this.canvas.height);
  }

  render(s) {
    const gl = this.gl;
    if (!this.scene) return;

    // ---- scene
    this.bindTarget(this.scene);
    gl.disable(gl.BLEND);
    gl.useProgram(this.sceneProg.prog);
    const u = this.sceneProg.u;
    gl.uniform2f(u.uRes, this.scene.w, this.scene.h);
    gl.uniform1f(u.uTime, s.time);
    gl.uniform3f(u.uCamPos, s.camPos[0], s.camPos[1], s.camPos[2]);
    gl.uniform3f(u.uCamTarget, s.camTarget[0], s.camTarget[1], s.camTarget[2]);
    gl.uniform1f(u.uTanHalf, s.tanHalf);
    gl.uniform1f(u.uRoll, s.roll);
    gl.uniform3f(u.uProbePos, s.probePos[0], s.probePos[1], s.probePos[2]);
    gl.uniform1f(u.uProbeR, s.probeR);
    gl.uniform1f(u.uProbeGlow, s.probeGlow);
    gl.uniform1f(u.uProbeShift, s.probeShift);
    gl.uniform1f(u.uDiskIn, s.diskIn);
    gl.uniform1f(u.uDiskOut, s.diskOut);
    gl.uniform1f(u.uSpin, s.spin);
    gl.uniform1f(u.uRelease, s.release);
    gl.uniform1f(u.uQuality, this.renderScale);
    this.drawQuad();

    // ---- bright pass
    this.bindTarget(this.b1);
    gl.useProgram(this.brightProg.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
    gl.uniform1i(this.brightProg.u.uTex, 0);
    gl.uniform2f(this.brightProg.u.uRes, this.b1.w, this.b1.h);
    gl.uniform1f(this.brightProg.u.uThreshold, 0.9);
    this.drawQuad();

    // ---- blur / ping-pong
    gl.useProgram(this.blurProg.prog);
    const bl = this.blurProg.u;
    gl.uniform1i(bl.uTex, 0);
    gl.uniform2f(bl.uRes, this.b1.w, this.b1.h);
    gl.uniform2f(bl.uDir, 1 / this.b1.w, 0);
    this.bindTarget(this.b1t);
    gl.bindTexture(gl.TEXTURE_2D, this.b1.tex);
    this.drawQuad();
    gl.uniform2f(bl.uDir, 0, 1 / this.b1.h);
    this.bindTarget(this.b1);
    gl.bindTexture(gl.TEXTURE_2D, this.b1t.tex);
    this.drawQuad();

    // wide bloom
    gl.uniform2f(bl.uRes, this.b2.w, this.b2.h);
    gl.uniform2f(bl.uDir, 2 / this.b1.w, 0);
    this.bindTarget(this.b2t);
    gl.bindTexture(gl.TEXTURE_2D, this.b1.tex);
    this.drawQuad();
    gl.uniform2f(bl.uDir, 0, 2 / this.b1.h);
    this.bindTarget(this.b2);
    gl.bindTexture(gl.TEXTURE_2D, this.b2t.tex);
    this.drawQuad();

    // second wide pass for the anamorphic smear
    gl.uniform2f(bl.uRes, this.b2.w, this.b2.h);
    gl.uniform2f(bl.uDir, 6 / this.b2.w, 0);
    this.bindTarget(this.b2t);
    gl.bindTexture(gl.TEXTURE_2D, this.b2.tex);
    this.drawQuad();
    gl.uniform2f(bl.uDir, 0, 6 / this.b2.h);
    this.bindTarget(this.b2);
    gl.bindTexture(gl.TEXTURE_2D, this.b2t.tex);
    this.drawQuad();

    // ---- composite to screen
    this.bindTarget(null);
    gl.useProgram(this.compProg.prog);
    const cu = this.compProg.u;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.b1.tex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.b2.tex);
    gl.uniform1i(cu.uScene, 0);
    gl.uniform1i(cu.uBloom1, 1);
    gl.uniform1i(cu.uBloom2, 2);
    gl.uniform2f(cu.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(cu.uTime, s.time);
    gl.uniform1f(cu.uExposure, s.exposure);
    gl.uniform1f(cu.uFade, s.fade);
    gl.uniform1f(cu.uBloomAmount, s.bloom);
    gl.uniform1f(cu.uAberr, s.aberration);
    gl.uniform1f(cu.uGrain, s.grain);
    this.drawQuad();
  }
}
