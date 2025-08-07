# Warm Drift — Tiny 3D Racing Prototype

A minimal, cozy, warm-vibe "3D-like" racing toy built with Three.js. It features:

- Smooth, procedurally generated closed-loop track with pleasant corners
- Simple kinematic car model with drift (hold Shift)
- Soft golden-hour look with lightweight decor

## Run

Open `index.html` in a browser, or serve the folder statically:

```bash
# From /workspace
python3 -m http.server 8080
# then visit http://localhost:8080
```

No build step is required; Three.js is loaded from a CDN.

## Controls

- W / Up Arrow: Accelerate
- S / Down Arrow: Brake/Reverse
- A / Left Arrow: Steer left
- D / Right Arrow: Steer right
- Shift: Drift (reduced lateral grip, snappier yaw)
- R: Regenerate a new track

## Notes

- The dynamics are deliberately arcade-like and forgiving.
- You can tune parameters in `src/main.js` under the `params` object to change handling/feel.
