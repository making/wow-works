// The Last Second
// A probe falls toward a Schwarzschild horizon. Its own second is finite;
// the received second is not. Everything below is the reception.

import { Renderer } from './renderer.js';
import { Sound } from './audio.js';
import { UI } from './ui.js';

const RS = 1.0;
const PROBE_R0 = 10.5;
const PROBE_INC = 0.42;
const CAM_DIST = 17.0;
const CAM_ELEV = 0.235;
const TAN_HALF = 0.58;

const canvas = document.getElementById('scene');
const ui = new UI();
const sound = new Sound();

let renderer = null;
try {
  renderer = new Renderer(canvas);
} catch (e) {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend',
    '<div style="position:fixed;inset:0;display:grid;place-items:center;color:#8a8073;font:11px ui-monospace;letter-spacing:.2em">WEBGL2 UNAVAILABLE</div>');
}

const state = {
  phase: 'entry',           // entry | intro | live | release | ended
  t: 0,
  worldT: 0,
  introT: 0,
  probeR: PROBE_R0,
  probeTarget: PROBE_R0,
  theta: 0.0,
  yaw: 0.0,
  pitch: 0.0,
  yawBase: 0.55,
  camDist: 26.0,
  camDistTarget: CAM_DIST,
  releaseT: 0,
  releaseR0: PROBE_R0,
  endTimer: 0,
  fade: 0,
  exposure: 1.0,
  idle: 0,
  interacted: false,
  pingAccum: 0,
  lineCooldown: 0,
  paused: false,
};

// ---------------------------------------------------------------- input
const pointers = new Map();
let lastX = 0, lastY = 0;
let pinchY = 0;

canvas.addEventListener('pointerdown', (e) => {
  if (state.phase === 'entry' || state.phase === 'ended') return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  canvas.setPointerCapture(e.pointerId);
  if (pointers.size === 1) { lastX = e.clientX; lastY = e.clientY; }
  if (pointers.size === 2) {
    const p = [...pointers.values()];
    pinchY = (p[0].y + p[1].y) * 0.5;
  }
  markInteracted();
});

canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size === 1) {
    const dx = (e.clientX - lastX) / window.innerHeight;
    const dy = (e.clientY - lastY) / window.innerHeight;
    lastX = e.clientX; lastY = e.clientY;
    state.yaw = clamp(state.yaw - dx * 2.4, -1.1, 1.1);
    state.pitch = clamp(state.pitch + dy * 1.6, -0.42, 0.5);
    markInteracted();
  } else if (pointers.size >= 2 && state.phase === 'live') {
    const p = [...pointers.values()];
    const y = (p[0].y + p[1].y) * 0.5;
    const dy = y - pinchY;
    pinchY = y;
    state.probeTarget = clamp(state.probeTarget - dy * 0.012, 1.012, 13.5);
    state.idle = 0;
    ui.scheduleHintFade(5000);
  }
});

const endPointer = (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size === 1) {
    const p = [...pointers.values()][0];
    lastX = p.x; lastY = p.y;
  }
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

if (window.matchMedia('(pointer: coarse)').matches) {
  document.getElementById('hint').innerHTML =
    '<span class="k">drag</span> look &nbsp;&nbsp; <span class="k">two fingers</span> fall &nbsp;&nbsp; <span class="k">let go</span> &nbsp;&nbsp;';
}

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  finishIntro();
  if (state.phase !== 'live') return;
  state.probeTarget = clamp(state.probeTarget - e.deltaY * 0.0042, 1.012, 13.5);
  state.idle = 0;
  markInteracted();
  ui.scheduleHintFade(5000);
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (state.phase === 'live') releaseProbe();
  } else if (e.code === 'ArrowDown' && state.phase === 'live') {
    state.probeTarget = clamp(state.probeTarget - 0.35, 1.02, 13.5);
    markInteracted();
  } else if (e.code === 'ArrowUp' && state.phase === 'live') {
    state.probeTarget = clamp(state.probeTarget + 0.35, 1.02, 13.5);
    markInteracted();
  } else if (e.code === 'Enter' && state.phase === 'entry') {
    begin();
  }
});

function markInteracted() {
  if (!state.interacted) {
    state.interacted = true;
    ui.scheduleHintFade(6000);
  }
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// ---------------------------------------------------------------- flow
async function begin() {
  if (state.phase !== 'entry') return;
  ui.hideEntry();
  state.phase = 'intro';
  state.introT = 0;
  state.fade = 0;
  await sound.start();
  sound.fadeIn(7);
  setTimeout(() => {
    if (state.phase === 'intro' || state.phase === 'live') ui.showHud();
  }, 1800);
}

ui.onEnter(begin);
ui.onSoundToggle(() => {
  sound.setMuted(!sound.muted);
  ui.setMuted(sound.muted);
});
ui.onLetGo(releaseProbe);
ui.onAgain(() => {
  reset();
});

// let the viewer cut the opening move short without the camera jumping
function finishIntro() {
  if (state.phase !== 'intro') return;
  const k = Math.min(1, state.introT / 8.0);
  const e = 1 - Math.pow(1 - k, 3);
  const introDist = 26 - (26 - CAM_DIST) * e;
  const introYaw = 0.55 + (1 - e) * 0.35;
  const liveYaw = state.yawBase + state.worldT * 0.004;
  state.camDist = introDist;
  state.yaw = introYaw + state.yaw - liveYaw;
  state.phase = 'live';
}

function releaseProbe() {
  if (state.phase !== 'live') return;
  state.phase = 'release';
  state.releaseT = 0;
  state.releaseR0 = state.probeR;
  state.probeTarget = 1.0008;
  sound.release(11);
  ui.el.release.classList.remove('on');
  ui.el.hint.classList.add('hide');
  ui.addLine('Tether cut.', 'END', { instant: true });
}

function reset() {
  ui.hideEnding();
  ui.reset();
  Object.assign(state, {
    phase: 'intro',
    t: 0,
    worldT: 0,
    introT: 0,
    probeR: PROBE_R0,
    probeTarget: PROBE_R0,
    theta: 0.0,
    yaw: 0,
    pitch: 0,
    yawBase: 0.55,
    camDist: 26.0,
    camDistTarget: CAM_DIST,
    releaseT: 0,
    releaseR0: PROBE_R0,
    endTimer: 0,
    fade: 0,
    idle: 0,
    interacted: false,
    pingAccum: 0,
    lineCooldown: 0,
  });
  ui.el.hint.classList.remove('hide');
  ui.el.release.classList.add('on');
  ui.showHud();
  sound.fadeIn(4);
}

// ---------------------------------------------------------------- simulation
function updateProbe(dt, worldRate) {
  if (state.phase === 'live') {
    // a slow gravitational drift; the viewer can push against it
    state.idle += dt;
    if (state.idle > 6) {
      state.probeTarget = Math.max(1.03, state.probeTarget - dt * 0.055);
    }
    const rate = state.probeTarget < state.probeR ? 1.7 : 1.2;
    state.probeR += (state.probeTarget - state.probeR) * Math.min(1, dt * rate);
  } else if (state.phase === 'release') {
    state.releaseT += dt;
    // a decelerating plunge: from the far side it looks as if the probe
    // slows to a stop just short of the horizon, and never quite arrives
    const dur = 5.0 + 1.15 * (state.releaseR0 - 1.0);
    const u = Math.min(1, state.releaseT / dur);
    state.probeR = 1.0008 + (state.releaseR0 - 1.0008) * Math.pow(1.0 - u, 2.2);
    if (state.probeR < 1.03 && state.endTimer === 0) state.endTimer = 0.001;
    if (state.endTimer > 0) {
      state.endTimer += dt;
      if (state.endTimer > 7.0 && state.phase === 'release') {
        state.phase = 'ended';
        ui.showEnding();
        ui.hideHud();
      }
    }
  }

  // azimuth: Keplerian, so the probe whips around as it closes in
  const omega = 0.9 * Math.pow(Math.max(state.probeR, 1.0), -1.5);
  state.theta += omega * dt * Math.max(worldRate, 0.03);

  const q = Math.sqrt(Math.max(0, 1 - RS / Math.max(state.probeR, 1.0001)));
  state.lineCooldown -= dt;
  if ((state.phase === 'live' || state.phase === 'release') && state.lineCooldown <= 0) {
    if (ui.maybeFire(state.probeR, () => sound.transmit())) state.lineCooldown = 1.5;
  }

  // beacon: constant in proper time, so the received interval stretches
  if (state.phase === 'live' || state.phase === 'release') {
    state.pingAccum += dt * q;
    if (state.pingAccum > 1.35) {
      state.pingAccum -= 1.35;
      sound.ping(q);
    }
  }
}

function cameraFor(now) {
  const intro = state.phase === 'intro';
  let dist = state.camDist;
  let yawBase = state.yawBase;
  if (intro) {
    const k = Math.min(1, state.introT / 8.0);
    const e = 1 - Math.pow(1 - k, 3);
    dist = 26 - (26 - CAM_DIST) * e;
    yawBase = 0.55 + (1 - e) * 0.35;
  } else {
    yawBase = state.yawBase + now * 0.004;
  }
  // note: `now` is world time, so the drift stops when the probe does
  const yaw = yawBase + state.yaw;
  const pitch = CAM_ELEV + state.pitch;
  const cy = Math.cos(pitch), sy = Math.sin(pitch);
  const cp = [Math.cos(yaw) * cy * dist, sy * dist, Math.sin(yaw) * cy * dist];
  return { pos: cp, dist };
}

// ---------------------------------------------------------------- loop
let last = performance.now();
let frameAcc = 0, frameCount = 0, qualityTimer = 0;
let running = false;

function frame(now) {
  if (!running) return;
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (!isFinite(dt)) dt = 0.016;
  dt = Math.min(dt, 0.05);
  if (state.paused) dt = 0;

  if (state.phase === 'entry') {
    // a live window behind the title, before the signal is joined
    state.worldT += dt * 0.9;
    state.fade = 0.55;
  }
  if (state.phase !== 'entry') {
    state.t += dt;
    // the whole world is witnessed through the probe's clock: the closer it
    // falls, the slower everything in the frame is allowed to happen
    const qw = Math.sqrt(Math.max(0, 1 - RS / Math.max(state.probeR, 1.0001)));
    let worldRate = 0.09 + 0.91 * Math.pow(qw, 1.35);
    if (state.phase === 'release') worldRate *= Math.max(0, 1 - state.endTimer / 3.0);
    if (state.phase === 'ended') worldRate = 0;
    state.worldT += dt * worldRate;
    if (state.phase === 'intro') {
      state.introT += dt;
      if (state.introT > 8.0) {
        state.phase = 'live';
        state.camDist = CAM_DIST;
      }
    }
    updateProbe(dt, worldRate);
  }

  const q = Math.sqrt(Math.max(0, 1 - RS / Math.max(state.probeR, 1.0001)));

  // fade in, and the long fade out once the signal is lost
  if (state.phase !== 'entry') {
    if (state.phase === 'release' && state.endTimer > 3.6) {
      state.fade = Math.max(0, 1 - (state.endTimer - 3.6) / 2.8);
    } else if (state.phase === 'ended') {
      state.fade = 0;
    } else {
      state.fade = Math.min(1, state.fade + dt * 0.55);
    }
  }

  if (state.phase === 'live' || state.phase === 'release') {
    ui.telemetry(
      state.probeR,
      1.0 * (state.probeR - 1) / (PROBE_R0 - 1),
      q,
      1 / Math.max(q, 0.001) - 1,
      q
    );
    if (state.phase === 'live') sound.setDilation(q, state.probeR);
  }

  if (renderer) {
    const cam = cameraFor(state.worldT);
    if (state.phase !== 'entry' && state.phase !== 'intro') {
      state.camDist += (state.camDistTarget - state.camDist) * Math.min(1, dt * 2.0);
    }

    const r = state.probeR;
    const ci = Math.cos(PROBE_INC), si = Math.sin(PROBE_INC);
    const px = Math.cos(state.theta) * r * ci;
    const pz = Math.sin(state.theta) * r * ci;
    const py = r * si;
    const shift = Math.pow(q, 1.25);
    const releaseBoost = state.phase === 'release' || state.phase === 'ended' ? 1.9 : 1.0;
    const glow = (0.35 + 0.65 * shift) * releaseBoost;

    const releaseAmt = state.phase === 'release' || state.phase === 'ended'
      ? Math.min(1, state.releaseT / 6) : 0;

    renderer.render({
      time: state.worldT,
      camPos: cam.pos,
      camTarget: [0, 0, 0],
      tanHalf: TAN_HALF * (window.innerWidth / window.innerHeight < 0.85 ? 1.12 : 1.0),
      roll: 0.045,
      probePos: [px, py, pz],
      probeR: r,
      probeGlow: glow,
      probeShift: shift,
      diskIn: 3.0,
      diskOut: 12.0,
      spin: 1.0,
      release: releaseAmt,
      exposure: 0.92,
      fade: state.fade,
      bloom: 0.46,
      aberration: 0.0018,
      grain: 0.014,
    });
  }

  // adaptive resolution
  frameAcc += dt; frameCount++; qualityTimer += dt;
  if (qualityTimer > 1.5 && state.phase !== 'entry') {
    const avg = frameAcc / frameCount;
    if (avg > 0.030 && renderer) renderer.setRenderScale(renderer.renderScale - 0.06);
    else if (avg < 0.019 && renderer) renderer.setRenderScale(renderer.renderScale + 0.04);
    frameAcc = 0; frameCount = 0; qualityTimer = 0;
  }
}

function boot() {
  running = true;
  last = performance.now();
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  if (renderer) renderer.resize();
});

if (renderer) boot();

window.__ls = { state, sound, ui, renderer };
