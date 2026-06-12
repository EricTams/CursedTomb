# Cursed Tomb — Project Todo

Working plan for the first milestones. Check items off as they land; add new items
at the appropriate milestone. Full design rationale lives in
[cursed-tomb-design-doc.md](cursed-tomb-design-doc.md).

## Decisions made

- **Stack:** Vanilla TypeScript + Canvas 2D + Vite. No engine.
- **Rendering:** Offscreen canvas at native tile resolution (448x336 = 28x21 tiles @ 16px),
  blitted at largest integer scale, nearest-neighbor, letterboxed (design doc §8).
  Game logic never knows about screen size.
- **Deploy:** GitHub Pages via GitHub Actions on push to `main`; Vite `base` = repo name.
- **Art policy:** `import_tiles*/` folders are a quarantined review pool (see
  [art-manifest.md](art-manifest.md)). Art is only used after we review and approve it,
  copying PNG+JSON pairs into `assets/art/` — the only folder the game loads from.

## Milestone 0 — Scaffold and deploy

- [x] Scaffold Vite + TypeScript project (`index.html`, `src/main.ts`, configs)
- [x] Canvas with integer scaler, letterboxing, and resize handling
- [x] Fixed-timestep update/render loop
- [x] GitHub Actions workflow for Pages deploy
- [x] Init git repo and initial commit
- [x] Push to GitHub, enable Pages (auto-enabled by the deploy workflow via
      `configure-pages` with `enablement: true`)
- [x] Verify deployed URL shows the scaled playfield on desktop and phone

## Milestone 1 — First simple level

- [x] ASCII level format + parser (28x21 grid with legend — same format the future
      generator and AI-edit loop will use)
- [x] Hand-author the first level: solid / background / exit tiles, simple descent
- [x] Player actor: gravity, walk, jump, AABB grid collision (sub-tile movement over grid)
- [x] Reach-the-exit win condition with fast restart (~2s loop)
- [x] Placeholder colored-rect art
- [x] **Art review session:** look at candidate tiles together (start with the
      `Old Stone` / `Carved Old Stone` / `Cave` / `Old Rock` sets), approve a tomb
      palette, copy pairs to `assets/art/`, swap into the level
      — current palette: **Cube** tiles recovered from the old AutoPlatformer levels
      (`Cube Block` solid, `Cube Ladder` / `Cube Platform` grabbed for later) on a
      plain black background. The Old Stone family is approved and in `assets/art/`
      but unused (BG-everywhere look was rejected). `Cave` / `Old Rock` remain
      future deeper-strata candidates. Exit and player are placeholder rects.

## Milestone 2 — Controls

- [x] Abstract input layer emitting actions (game code never branches on device)
- [x] Keyboard: arrows/WASD + Z/X mapped to NES scheme — A = jump, B = context verb
      (whip empty-handed; activates the held object when holding, which sometimes
      means throwing it — no Down+B chord, no third button)
- [x] Touch (landscape): virtual d-pad left zone, A/B right zone (~198px thumb zones,
      §8 layout); shown only when touch is detected. Portrait pauses with a
      rotate-to-landscape note (coarse-pointer devices only)
- [x] Touch d-pad supports diagonals (8-way sectors) with visual feedback: segments
      show available directions and light up while active; A/B light while pressed.
      Continuous rotation (no hysteresis); A pulled inward off the camera edge
- [x] Whip stub on B so the controls can be felt
- [x] On-device phone test passed for feel/layout; 16px tiles confirmed
      readable on device — tile size is locked

## Milestone 3 — Enemies

- [x] Design talk first: pick the first 1–2 roster entries using the §4 five-question
      template and size tiers (Appendix A sketches are candidates, not canon)
      — decided: **Virus** (fodder) + **Plant Box** (grabbable, pure ammo). Whip
      never kills person tier (stun → grab); kills come from stomps or thrown
      objects. Touch kills the player, instant restart. Template answers in §4.
- [x] Implement one fodder enemy (small tier: one whip hit kills) — Virus,
      edge-respecting floor patroller
- [x] Implement one grabbable enemy (person tier: stun → grab → hold → throw)
      — Plant Box: Box Form = stunned/carried, Get Up = wake-up telegraph
- [x] Whip core loop: stun, grab, hold suppresses whip, throw/discard, wake-up timer
      — stun 3s, held wake 8s (blinks last second); throw is flat, kills the first
      enemy hit, shatters on walls. Stomp kills stunned enemies (whip never kills
      person tier). Touch kills the player; ~0.8s blink then full restart.
- [x] Eye exit guardian: lethal to touch, guards a long low corridor before
      the door; spots the player at ~7 tiles (far outside whip range),
      strobes while charging, then fires a horizontal bolt. One whip hit
      kills it, but its range advantage makes the lash the daredevil route —
      the safe kill is a thrown Plant Box lobbed from beyond its sight
      (the game's first soft lock-and-key)
- [x] Thrown enemies bounce off the ground Mario 2 style (two decaying bounces,
      then shatter; walls still shatter immediately)
- [x] First spawner (§5): Plant Box spawner replaces the placed box — a
      grayscale darkened statue of the monster on the background layer;
      one-alive cap; on vacancy it flashes ~2.5s and rebirths the enemy
      (spawn holds while the player stands on the spot)

## Later (out of scope for now)

Curse timer + treasure economy, more spawner classes (destructible, §5),
strata-based level generation + validators, AI-assisted level editing,
curse enemy family, swing/yank whip modes, attract mode.
