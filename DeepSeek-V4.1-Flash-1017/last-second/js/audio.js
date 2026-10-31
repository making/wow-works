// Procedural sound field. No samples. Everything is synthesized here.
// The drone's pitch and brightness track the probe's clock rate: as the
// received signal dilates, the sound sinks and the air closes in.

export class Sound {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.muted = false;
    this.target = 0;
  }

  async start() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    try { await ctx.resume(); } catch (_) { /* ignore */ }

    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 22;
    comp.ratio.value = 4;
    comp.attack.value = 0.05;
    comp.release.value = 0.6;
    this.master.connect(comp).connect(ctx.destination);

    // ---- deep drone
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.0;
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 420;
    this.droneFilter.Q.value = 0.9;

    this.oscA = ctx.createOscillator();
    this.oscA.type = 'sine';
    this.oscA.frequency.value = 43.65;

    this.oscB = ctx.createOscillator();
    this.oscB.type = 'sawtooth';
    this.oscB.frequency.value = 65.4;
    this.oscB.detune.value = -7;

    this.oscC = ctx.createOscillator();
    this.oscC.type = 'triangle';
    this.oscC.frequency.value = 87.3;

    const bGain = ctx.createGain(); bGain.gain.value = 0.055;
    const cGain = ctx.createGain(); cGain.gain.value = 0.03;
    this.oscB.connect(bGain).connect(this.droneFilter);
    this.oscC.connect(cGain).connect(this.droneFilter);
    this.oscA.connect(this.droneFilter);
    this.droneFilter.connect(this.droneGain).connect(this.master);

    // slow shimmer on the drone
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.037;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 6.0;
    lfo.connect(lfoGain);
    lfoGain.connect(this.oscB.detune);
    lfoGain.connect(this.oscC.detune);

    // ---- void air (filtered noise, very quiet)
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = last * 0.985 + w * 0.015;
      d[i] = last * 4.0;
    }
    this.noiseBuf = buf;
    this.air = ctx.createBufferSource();
    this.air.buffer = buf;
    this.air.loop = true;
    this.airFilter = ctx.createBiquadFilter();
    this.airFilter.type = 'bandpass';
    this.airFilter.frequency.value = 900;
    this.airFilter.Q.value = 0.55;
    this.airGain = ctx.createGain();
    this.airGain.gain.value = 0.0;
    this.air.connect(this.airFilter).connect(this.airGain).connect(this.master);

    this.oscA.start();
    this.oscB.start();
    this.oscC.start();
    lfo.start();
    this.air.start();

    this.started = true;
    this.setMuted(this.muted);
  }

  fadeIn(t = 6) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(this.master.gain.value, 0.0001), now);
    this.master.gain.exponentialRampToValueAtTime(this.muted ? 0.0001 : 0.5, now + t);
    this.droneGain.gain.setTargetAtTime(0.55, now, 1.5);
    this.airGain.gain.setTargetAtTime(0.055, now, 2.5);
  }

  setMuted(m) {
    this.muted = m;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(m ? 0.0001 : 0.5, now, 0.25);
  }

  // dilation 0..1: 1 = far away, 0 = frozen at the horizon
  setDilation(q, probeR) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const k = Math.max(0, Math.min(1, q));
    const base = 43.65 * (0.42 + 0.58 * Math.pow(k, 0.7));
    this.oscA.frequency.setTargetAtTime(base, now, 0.4);
    this.oscB.frequency.setTargetAtTime(base * 1.5, now, 0.4);
    this.oscC.frequency.setTargetAtTime(base * 2.0, now, 0.4);
    this.droneFilter.frequency.setTargetAtTime(180 + 520 * Math.pow(k, 1.6), now, 0.5);
    this.airFilter.frequency.setTargetAtTime(380 + 900 * k, now, 0.6);
    this.airGain.gain.setTargetAtTime(0.02 + 0.05 * k, now, 0.8);
    this.droneGain.gain.setTargetAtTime(0.35 + 0.3 * (1 - Math.min(probeR / 12, 1)), now, 0.8);
  }

  ping(q) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const f = 180 + 1500 * q * q;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.82, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.10 * Math.max(q, 0.05), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
    const pan = ctx.createStereoPanner();
    pan.pan.value = (Math.random() * 2 - 1) * 0.35;
    o.connect(g).connect(pan).connect(this.master);
    o.start(t);
    o.stop(t + 0.7);
  }

  transmit() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.5;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1400, t);
    bp.frequency.exponentialRampToValueAtTime(520, t + 0.35);
    bp.Q.value = 2.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.085, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t, Math.random() * 2, 0.5);

    // a tiny carrier tone under the static
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 660 + Math.random() * 240;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.012, t + 0.02);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(og).connect(this.master);
    o.start(t);
    o.stop(t + 0.35);
  }

  release(seconds = 9) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    this.oscA.frequency.setTargetAtTime(18, now, seconds * 0.35);
    this.oscB.frequency.setTargetAtTime(27, now, seconds * 0.35);
    this.oscC.frequency.setTargetAtTime(36, now, seconds * 0.35);
    this.droneFilter.frequency.setTargetAtTime(90, now, seconds * 0.3);
    this.airGain.gain.setTargetAtTime(0.0, now, seconds * 0.25);
    this.droneGain.gain.setTargetAtTime(0.5, now, 1.0);

    // final low strike
    const t = now + 0.4;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(26, t + 6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 9);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 9.5);

    this.master.gain.setTargetAtTime(0.0001, now + seconds * 0.55, seconds * 0.45);
  }

  stopAll() {
    if (this.ctx) {
      try { this.ctx.close(); } catch (_) { /* ignore */ }
    }
    this.ctx = null;
    this.started = false;
  }
}
