// Overlay: transmission log, telemetry, veils, ending.

const LINES = [
  { r: 11.2, ts: 'T-01.000', text: 'Signal nominal. I am one light-second from the horizon.' },
  { r: 8.6,  ts: 'T-00.712', text: 'The stars behind it are sliding sideways.' },
  { r: 6.6,  ts: 'T-00.548', text: 'Half the sky is already gone.' },
  { r: 5.0,  ts: 'T-00.418', text: 'My clock and yours have stopped agreeing.' },
  { r: 3.7,  ts: 'T-00.311', text: 'I can see my own signal, bent back toward me.' },
  { r: 2.8,  ts: 'T-00.238', text: 'The disk is not a disk. It is a river standing still.' },
  { r: 2.1,  ts: 'T-00.181', text: 'One second left. It is a wide place.' },
  { r: 1.62, ts: 'T-00.142', text: 'I am not falling anymore. I am arriving.' },
];

export class UI {
  constructor() {
    this.el = {
      entry: document.getElementById('entry'),
      hud: document.getElementById('hud'),
      transmission: document.getElementById('transmission'),
      alt: document.getElementById('t-alt'),
      tau: document.getElementById('t-tau'),
      rate: document.getElementById('t-rate'),
      z: document.getElementById('t-z'),
      bar: document.getElementById('t-bar'),
      hint: document.getElementById('hint'),
      release: document.getElementById('release'),
      ending: document.getElementById('ending'),
      sound: document.getElementById('sound'),
      letgo: document.getElementById('letgo'),
    };
    this.fired = new Set();
    this.lines = [];
    this.lastAlt = '';
    this.hintTimer = null;
  }

  onEnter(fn) {
    document.getElementById('enter').addEventListener('click', fn);
  }

  hideEntry() {
    this.el.entry.classList.add('gone');
  }

  showHud() {
    this.el.hud.classList.add('on');
    this.el.release.classList.add('on');
  }

  hideHud() {
    this.el.hud.classList.remove('on');
  }

  scheduleHintFade(ms) {
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => this.el.hint.classList.add('hide'), ms);
  }

  reset() {
    this.fired.clear();
    this.lines = [];
    this.el.transmission.innerHTML = '';
    this.el.ending.classList.add('hidden');
    this.el.hint.classList.remove('hide');
    this.el.hud.classList.remove('off');
    clearTimeout(this.hintTimer);
  }

  // ---- transmission log
  addLine(text, ts, opts = {}) {
    const line = document.createElement('div');
    line.className = 'line';
    const t = document.createElement('span');
    t.className = 'ts';
    t.textContent = ts;
    line.appendChild(t);
    const body = document.createElement('span');
    line.appendChild(body);
    this.el.transmission.appendChild(line);

    // older lines recede
    for (const l of this.lines) l.classList.add('dim');
    this.lines.push(line);
    while (this.lines.length > 3) {
      const old = this.lines.shift();
      old.classList.remove('on');
      setTimeout(() => old.remove(), 1200);
    }

    requestAnimationFrame(() => line.classList.add('on'));

    // radio-style reveal: characters arrive in uneven bursts
    let i = 0;
    const tick = () => {
      if (i >= text.length) return;
      const burst = 1 + Math.floor(Math.random() * 3);
      i = Math.min(text.length, i + burst);
      body.textContent = text.slice(0, i);
      if (i < text.length) {
        const d = 18 + Math.random() * 55;
        setTimeout(tick, d);
      }
    };
    if (opts.instant) { body.textContent = text; } else { setTimeout(tick, 120); }
    return line;
  }

  // one transmission at a time: a fast fall makes its lines arrive late,
  // the way a queued signal would
  maybeFire(r, cb) {
    for (const l of LINES) {
      if (r <= l.r && !this.fired.has(l.ts)) {
        this.fired.add(l.ts);
        this.addLine(l.text, l.ts);
        if (cb) cb(l);
        return true;
      }
    }
    return false;
  }

  // ---- telemetry
  telemetry(r, tau, rate, z, dilation) {
    const alt = r.toFixed(3);
    if (alt !== this.lastAlt) {
      this.el.alt.textContent = alt;
      this.lastAlt = alt;
    }
    this.el.tau.textContent = tau.toFixed(4);
    this.el.rate.textContent = rate.toFixed(4);
    this.el.z.textContent = z < 9.99 ? z.toFixed(3) : z.toFixed(1);
    this.el.bar.style.width = (Math.min(1, dilation) * 100).toFixed(1) + '%';
  }

  showEnding() {
    this.el.ending.classList.remove('hidden');
    this.el.hud.classList.add('off');
  }

  hideEnding() {
    this.el.ending.classList.add('hidden');
    this.el.hud.classList.remove('off');
  }

  setMuted(m) {
    this.el.sound.classList.toggle('muted', m);
  }

  onSoundToggle(fn) {
    this.el.sound.addEventListener('click', fn);
  }

  onLetGo(fn) {
    this.el.letgo.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
  }

  onAgain(fn) {
    document.getElementById('again').addEventListener('click', fn);
  }
}
