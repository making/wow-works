# 命の砂時計 — The Hourglass of Life

A real-time hourglass, lit by a single lamp in the dark. The sand inside it is alive.
Every grain is a life: it is born in the upper glass, drifts as a light, is drawn down
through the neck, and settles into the pile below. The pile never stops growing, the
hourglass never stops being turned over.

Nothing in the piece is a loop of video or an image. All of it is computed per pixel,
per frame, in the browser.

## Viewing

Open `index.html` directly, or serve the folder:

```
python3 -m http.server 8137
# then open http://localhost:8137/
```

Requires a WebGL2-capable browser (Chrome, Edge, Firefox, Safari 17+).
Sound starts only after clicking はじめる. Headphones recommended.

## Controls

| Action | Effect |
| --- | --- |
| drag | orbit the glass |
| wheel | move closer / further |
| click, tap, or Space | turn the hourglass over |
| M | sound on / off |

The hourglass turns itself over when it empties. Turning it early keeps the sand
you have already spent: the top refills only as much as the bottom held.

## What is actually being drawn

- The glass is a signed-distance field of a surface of revolution, sphere-traced per
  pixel, with refraction, Fresnel, a procedural environment and a caustic table.
- The sand is an analytic isosurface (a funnel in the upper chamber, an angle-of-repose
  cone below) shaded from its density gradient, with per-point grain and a shadow
  march toward the lamp. Its level is the same number that drives the story.
- The 9,000 lights are analytic particles: their whole trajectory is a function of a
  seed and time, so the swarm costs one draw call and no simulation.
- The sound is generated with WebAudio: a low drone, filtered noise for the falling
  sand, grain ticks, and occasional bell tones through a synthesized reverb.
- No images, no fonts, no libraries, no build step.

Rendering resolution adapts to the frame rate, so slower GPUs stay interactive.

## Notes

The clock in the corner counts the time you have given the piece. The counter beside
it counts the lives that have returned to sand. Neither one resets.
