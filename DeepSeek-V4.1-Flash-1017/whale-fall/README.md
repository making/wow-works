# Whale Fall

An interactive descent to a whale fall, 4,000 metres below the last light.

You begin under a living whale, sink through the midnight zone past
bioluminescent drifters, and arrive at the skeleton of one that fell decades
ago — a carcass that has become an ecosystem. The lamp in your hand is the only
light. When the fall gives back what it kept, you rise with it.

Everything is generated at runtime: the ocean, the animals, the skeleton, the
light, and the sound. There are no images, no audio files, and no libraries.

## Running

Open `index.html` in a browser, or serve the folder:

```
python3 -m http.server 8000
# http://localhost:8000/
```

Sound starts on the first click (browser autoplay rules). Headphones recommended.

## Controls

- Move the pointer / finger — aim the lamp
- Click — sonar ping, and a bloom of light in the water
- Hold the pointer, scroll, or hold Space / Arrow Down — descend faster
- The descent is automatic; input only changes the pace

## How it is made

- `index.html` is the whole work: canvas rendering and WebAudio synthesis.
- The animals are drawn from cached, pre-shaded sprites (jellyfish bells,
  siphonophore chains, anglerfish silhouettes), then lit and blurred per frame.
- The whale fall is a pre-rendered bone texture masked by a point-light
  gradient at run time, so the lamp reveals it rather than a global overlay.
- Audio is synthesised: a filtered noise bed, a sub drone, sperm-whale click
  trains, a formant-swept call, sonar and glints, all through a generated
  impulse-response reverb.

## Debug

Append `?at=0.9` to jump into the descent at a given progress (0–1).
`?at=0.985&mode=requiem` starts at the requiem.
