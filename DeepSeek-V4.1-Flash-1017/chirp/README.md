# CHIRP

An immersive, sonified collision. Two neutron stars fall into each other,
and the gravitational wave they emit is what you hear.

Open `index.html` in a browser (WebGL 2 required). Headphones recommended.

## What it is

A single continuous piece, roughly ninety seconds long, with no interface
beyond a click to begin. It runs in real time: every frame is generated,
nothing is pre-rendered, and there are no assets.

The visual and the audio are driven by one model:

- the gravitational-wave frequency follows the chirp law
  `f(u) = f₀ (1-u)^(-3/8)`, which is what a real inspiral produces as the
  orbit tightens and the radiation grows;
- the orbit decays with the same `u`, the camera closes in on it, the
  quadrupole field in the orbital plane brightens, and the sound sweeps
  from a sub-bass rumble to a 750 Hz scream in the final second;
- at `u = 1` the two stars merge: a flash, a shock front, a ringdown, and
  an expanding kilonova shell of r-process ejecta.

The visual clock is slowed down so that the last moments can be watched.
The audio is not slowed: it is the signal itself.

## The end

The piece ends on GW170817, the binary neutron-star merger observed on
17 August 2017, 130 million light-years away — the event that first showed
that heavy elements like gold are forged in collisions of this kind.

## Controls

- move the pointer: shift the view
- hold the pointer, or space: slow time to a crawl
- scroll: zoom
- click after the ending: begin again

## Files

- `index.html` — the entire work (GLSL, Web Audio, no dependencies)

## Notes

WebGL 2 with `EXT_color_buffer_float` is used for the HDR scene and the
bloom chain. Without it the piece still runs, with a clamped dynamic range.
