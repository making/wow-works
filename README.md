# wow-works

Generated works stored for an experiment on [mia-ai.net/lab/experiments](https://mia-ai.net/lab/experiments).
The following prompt was given verbatim to an LLM, and the resulting code is archived here
unmodified, one directory per model.

```text
Build me something when people see it, they will say "Wow". Must be immersive, when people see it, they will be stunned by what they see.

This can be a video, or anything else you can think of.

Be creative. Go wild. Dig deep.

No AI slop. Something unique, think outside of the box. Think big. Think amazing. Something no other model done before.

Be proud. Show your best. Don't disappoint.
```

## Viewing

Published at <https://making.github.io/wow-works/>. The root `index.html` lists the works;
each entry links to its own page.

## Contents

| Model | Work | Description |
| --- | --- | --- |
| `DeepSeek-V4.1-Flash-1017` | [Harmonia](https://making.github.io/wow-works/DeepSeek-V4.1-Flash-1017/harmonia/) (`harmonia`) | A heliocentric instrument. Computes real planetary positions from JPL approximate Keplerian elements and sonifies their motion with browser-synthesised audio. See its own `README.md` for controls and model notes. |
| `DeepSeek-V4.1-Flash-1017` | [Totality](https://making.github.io/wow-works/DeepSeek-V4.1-Flash-1017/totality/) (`totality`) | A composed total solar eclipse over still water, computed and rendered in real time: a relief lunar limb, the corona, the diamond ring, a 360-degree twilight, and a lake that mirrors it. Sound follows the light. See its own `README.md` for controls and model notes. |
| `GLM-5.3-Flash-FP4-Local` | [The Drowned Cathedral](https://making.github.io/wow-works/GLM-5.3-Flash-FP4-Local/abyss-cathedral/) (`abyss-cathedral`) | A WebGL2 scene; move the pointer to look around, click to enable sound, scroll to drift. |
| `GLM-5.3-Flash-FP4-Local` | [墨の宇宙 / Ink Cosmos](https://making.github.io/wow-works/GLM-5.3-Flash-FP4-Local/ink-cosmos/) (`ink-cosmos`) | An interactive ink-wash cosmos that morphs on click and on pointer movement. |

## Running

Every work is a single self-contained `index.html` with no build step and no external
dependencies. Open the file you want to view directly in a browser; no server is needed.

Some works require WebGL2 or Web Audio and start audio only after a user gesture.

## Notes

- Directory names identify the model that produced the work; no other metadata is attached.
- The code is preserved as generated. No shared stylesheet, framework, or cleanup was applied.
