# Totality

A composed total solar eclipse over a lake, rendered in real time in one HTML file. The moon's
disc is drawn with a relief limb; the photosphere has limb darkening; the corona is a layered
streamer model with a chromosphere and prominences. The lake mirrors the sky through Fresnel
reflectance and moving ripples. The sound is synthesized from the same timeline: the wind dies as
the shadow arrives, a low drone swells, a shimmer rises with the corona, insects begin.

## Run

Open `index.html` in a browser (Chrome or Firefox, WebGL2). No server, no dependencies, no
network.

## Controls

- Drag to look around. The afterglow continues around the whole horizon.
- Scroll, or drag the rail at the bottom, to move through the eclipse.
- Click `begin` to start; sound begins with that gesture.
- `space` pause, `r` restart, `h` hide the interface, `f` fullscreen.

## The model

- The eclipse is composed, after the total eclipse of 12 August 2026. The Sun stands 5.5° above
  the horizon, as it did at sunset in Spain. The angular radii of the Sun and Moon are enlarged
  1.6× so the corona reads at a 26° vertical field; their ratio and the geometry of the shadow are
  preserved.
- The timeline is compressed: about 55 s of approach, 22 s inside the shadow, then the release.
  The Moon's offset is a keyframed chord; the obscuration, the sky's light, the corona and the
  360° afterglow are computed from the two discs and their positions.
- The corona is procedural: four helmet streamers of different lengths, fine radial striations,
  a thin chromosphere, prominences, and a faint outer halo.
- The water is a Fresnel mirror of the same world function, perturbed by a slow ripple field, so
  the eclipse, the mountains and the stars are reflected by the same code that draws them.
- The mountains are a two-layer ridged silhouette, the stars a procedural field, and one bright
  planet is placed about 18° from the Sun.

## Notes on the model

- The scene is one full-screen fragment shader; there are no textures, meshes, libraries or
  external assets.
- `?debug` overlays altitude and azimuth guides, the horizon, the solar altitude and the moon's
  centre.
- The renderer caps device pixel ratio at 1.75 and lowers resolution automatically if frames
  become slow.
