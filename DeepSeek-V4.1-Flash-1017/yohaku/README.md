# 余白 — YOHAKU

A ritual in ink. Open `index.html` in a browser (WebGL2 required) and click to begin.

Move the cursor to paint; click to drop ink. Leave it alone and the piece composes
itself: a single breath of a brush draws an *enso*, a haiku writes itself beside it,
a seal is pressed, and then the lamp behind the paper goes out.

## What is inside

- A GPU fluid solver (advection, vorticity confinement, pressure projection) that
  carries real ink, with a paper-absorbency model that bleeds wet pigment along the
  fibres and fixes it once dry.
- A brush model with torn hair edges, individual hair loads, and drying that leaves
  the paper showing through the tail of a stroke — the *kasure* of a real brush.
- Procedural washi, a poem, and a hand-cut seal, all drawn at runtime. No images,
  no fonts beyond the system mincho, no libraries, no network requests.
- A synthesiser: a synthesised reverb, a Karplus–Strong plucked string in the
  hirajoshi scale, brushed noise tied to stroke speed, and a low drone.
- A single HTML file. Nothing to install.
