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
- [ ] Verify deployed URL shows the scaled playfield on desktop and phone

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

- [ ] Abstract input layer emitting actions (game code never branches on device)
- [ ] Keyboard: arrows/WASD + Z/X mapped to NES scheme — A = jump, B = context verb,
      Down+B = throw
- [ ] Touch (landscape): virtual d-pad left zone, A/B right zone (~198px thumb zones,
      §8 layout); shown only when touch is detected
- [ ] Contextual throw button appears only while holding something
- [ ] Whip stub on B so the controls can be felt
- [ ] On-device phone test; settle the open 16px vs 20px tile size question

## Milestone 3 — Enemies

- [ ] Design talk first: pick the first 1–2 roster entries using the §4 five-question
      template and size tiers (Appendix A sketches are candidates, not canon)
- [ ] Implement one fodder enemy (small tier: one whip hit kills)
- [ ] Implement one grabbable enemy (person tier: stun → grab → hold → throw)
- [ ] Whip core loop: stun, grab, hold suppresses whip, throw/discard, wake-up timer

## Later (out of scope for now)

Curse timer + treasure economy, spawners, strata-based level generation + validators,
AI-assisted level editing, curse enemy family, swing/yank whip modes, attract mode.
