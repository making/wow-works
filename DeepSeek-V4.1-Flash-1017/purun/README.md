# ぷるん — a crème caramel, in real time

A single crème caramel in a dark room. You can put your hand on it.

Everything on screen is computed in one WebGL fragment shader at sixty frames a
second: no textures, no meshes, no photographs, no 3D assets. The pudding, the
caramel running over its shoulder, the syrup pooled on the plate, the ceramic,
the table and the light are signed distance fields, procedural noise, a
physically based BRDF and a soft-shadow marcher. The jiggle is a damped
oscillator driving a deformation kernel, not an animation clip.

## Run

    python3 -m http.server 8000

then open `http://localhost:8000/`. (It also runs from `file://`; the server is
only a convenience.)

Requires WebGL2 with float render targets. Chrome, Safari 16+, Firefox on a
desktop GPU.

## What is happening

| Element | How it is made |
| --- | --- |
| Pudding & caramel | Ray-marched SDF (rounded cone, dome, mould flutes) with a shear/squash deformation kernel |
| Caramel coverage | Per-angle height field with irregular flow fingers and a rounded bead at the flow front |
| Syrup on the plate | A second field that raises the plate surface and switches its material |
| Custard | Layered procedural micro-normals, marbling, pinholes, subsurface and a thin wet coat |
| Lighting | Analytic softbox environment, area-light-style specular, penumbra shadow march, plate bounce |
| Table | Real single-bounce reflection of the scene, Fresnel, light pool |
| Camera | Slow drift plus a thin-lens depth-of-field gather and filmic post |
| Interaction | Damped spring physics, velocity-coupled impulse, procedural audio |

## Controls

- Drag across the pudding: push it and let go.
- Click or tap: poke it.
- Space: a random poke.

Sound is synthesised (no samples) and starts on the first interaction, as
browsers require.

## Notes

The scene is tuned for a 1440×900 viewport; the renderer caps its internal
resolution to keep the wobble at frame rate, and widens the lens on portrait
screens instead of cropping the subject.
