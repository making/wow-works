# The Last Second

A probe falls toward a Schwarzschild horizon. Its own second is finite.
The received second is not.

**The Last Second** is a real-time piece about gravitational time dilation,
experienced rather than explained. You orbit a black hole with the last signal
of a probe. As you let it fall, the probe's clock drifts away from yours, its
light redshifts into an ember, and the whole world — the accretion flow, the
camera drift, the sound — is witnessed through that clock and slows with it.
At the horizon it never arrives.

## Run

Serve the directory over HTTP (ES modules do not load from `file://`):

```
python3 -m http.server 8000
```

Then open `http://localhost:8000/`.

Requires WebGL2 and a desktop-class GPU. Headphones recommended.

## Controls

| Input | Action |
| --- | --- |
| drag | look around |
| scroll / two-finger drag | let the probe fall or pull it back |
| space / LET GO | cut the tether |
| sound icon | mute |

## Notes

Everything is generated at runtime: no textures, no images, no samples.

- The scene is ray-marched through a Schwarzschild metric. Photon paths are
  integrated with the null-geodesic acceleration `a = -3/2 h² r / |r|⁵`
  (units `rs = 1`), so the shadow, the photon ring, the secondary image of the
  disk and the lensed images of the beacon are all consequences of the
  integration rather than painted effects.
- The disk is sampled where a ray crosses the mid-plane, with a Keplerian
  velocity field, relativistic Doppler beaming, gravitational redshift and a
  sheared turbulence field evaluated in the co-rotating frame.
- The probe's beacon is found by closest approach of each bent photon path to
  the probe, which is what produces its lensed companions.
- The audio is synthesized: a drone whose pitch, filter and air follow the
  received clock rate, a beacon whose interval stretches with it, and static
  bursts for each transmission.
- The clock rate shown is the static-observer factor `sqrt(1 - rs/r)`, used as
  an illustrative reading of the received signal; the exact redshift of a
  radially infalling emitter differs by a finite constant.
- Quality scales itself down if the frame budget is exceeded.

## Files

```
index.html      entry, HUD, ending
css/style.css   typography and overlay
js/main.js      state, camera, input, narrative timing
js/renderer.js  WebGL2 passes, bloom chain, composite
js/shaders.js   geodesic marcher, disk, sky, film treatment
js/audio.js     procedural sound field
js/ui.js        transmission log and telemetry
```
