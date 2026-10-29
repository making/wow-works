# Harmonia

A heliocentric instrument. It computes the real positions of the eight planets from
JPL approximate Keplerian elements (J2000, valid 1800–2050) and sonifies their motion:
each orbit sounds a note every thirty degrees of true anomaly, and the pitch follows the
planet's instantaneous angular rate. Nothing is composed; everything is measured.

## Run

```
python3 -m http.server 8771
open http://127.0.0.1:8771/index.html
```

Single self-contained HTML file, no dependencies, no network access.

## Instrument

- Click a planet to sound it. Hover for its current pitch.
- Scroll to change the passage of time (0.05–900 days/second). The drone opens as time accelerates.
- Drag to look around. Drag the time rail to move between 1800 and 2050.
- A gold thread appears while two orbits stand in a simple interval; the label names it.
- Keys: `space` pause, `n` now, `m` sound, `h` view, `f` full, arrows orbit, `+`/`-` rate.

## Notes on the model

- Positions come from the JPL approximate elements for the major planets (Table 1).
  The Sun is the origin; Earth is the Earth–Moon barycenter.
- Radial distances are compressed for display (each orbit keeps its shape, tilt and
  eccentricity). Angles, distances in the readout and angular rates are unaltered.
- Audio is synthesised in the browser: additive bells tuned to a D minor pentatonic
  derived from the measured rates, a reverb, and a drone whose filter follows the time rate.
