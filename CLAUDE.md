# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Cursed Tomb** — a one-screen arcade platformer (homage to Dig Dug / Lode Runner / Ice Climber): whip enemies to stun and grab them, wield their powers, descend a tomb before a curse timer runs out. Built as a **vanilla TypeScript + Canvas 2D + Vite** game — **no game engine, no runtime dependencies** (TS and Vite are the only devDeps).

Two long-form docs are the source of truth for intent and drive most decisions — read them before changing mechanics or content:
- `cursed-tomb-design-doc.md` — full design rationale, pillars, decided/rejected log. Mechanics questions are answered here.
- `todo.md` — milestone plan and what's been built. The codebase is mid-Milestone-4.

## Commands

```bash
npm run dev       # Vite dev server (the frame-dump middleware only exists here)
npm run build     # tsc --noEmit (typecheck) THEN vite build — typecheck gates the build
npm run preview   # serve the production build
```

`play.bat` (Windows) installs deps if needed and runs `dev --open`. There is **no test suite and no linter** — `tsc --strict` (with `noUnusedLocals`/`noUnusedParameters`/`noFallthroughCasesInSwitch`) is the only automated check. Run `npm run build` to verify a change typechecks. Deploy is automatic: pushing to `main` builds and publishes to GitHub Pages (`.github/workflows/deploy.yml`); `vite.config.ts` uses a relative `base` so it works at any Pages path.

## Architecture

**Fixed-timestep core.** `src/main.ts` wires everything and starts `startLoop` (`src/loop.ts`), an accumulator loop that runs `Game.update()` at exactly 60Hz (`TICK_HZ`) regardless of refresh rate and passes `render()` an interpolation `alpha`. **All gameplay is deterministic and tick-based** — physics constants in `player.ts`/`enemy.ts` are per-tick px values, and actors store `prevX/prevY` so the renderer can interpolate via `drawX(alpha)`/`drawY(alpha)`. This determinism is deliberate (seeded procedural levels are a planned feature); don't introduce wall-clock timing or `Math.random()` into the simulation.

**Resolution-independent rendering.** `src/screen.ts` draws the whole game into a fixed `448×336` `OffscreenCanvas` (28×21 tiles @ 16px, `src/config.ts`), then blits it to the visible canvas at the largest integer scale that fits, nearest-neighbor. **Game logic never knows the real screen size** — never read window dimensions outside `screen.ts`.

**Input abstraction.** Game code reads only `Input` (`src/input.ts`), which OR-merges any number of `InputSource`s each tick and latches just-pressed edges (`aPressed`, `bPressed`, …). Sources: `KeyboardSource` (`keyboard.ts`) and `TouchSource` (`touch.ts`, virtual d-pad + A/B). The NES control scheme is **A = jump, B = context verb** (whip when empty-handed; while holding an enemy the whip is suppressed and B throws — see `Game.update`). Adding a control means adding a field to `ActionState` and mapping it in every source.

**`Game` (`src/game.ts`) is the orchestrator.** It owns the `Level`, `Player`, `enemies[]`, `spawners[]`, the single `held` enemy, effects, and shots. `loadLevel(index)` rebuilds all play state from a level's ASCII; the level list is passed into the constructor from `main.ts`. The update order (enemies → spawners → shots → whip hits → stomps → death checks) and the kill/grab/throw rules live here. Player damage model is **touch kills, instant restart** (no health).

**Player physics (`src/player.ts`)** is a hand-rolled AABB-vs-grid platformer: axis-separated `moveX`/`moveY` sweeps, coyote time, jump buffering, one-way platforms (drop-through on down+jump), ladders, and the **swing** system (rigid pendulum hung from a grapple ring; `A` is the only exit, releasing with tangential momentum). The whip is a line segment (`whipSegment`) tested against enemy AABBs (`segmentHitsRect`, Liang-Barsky) and grapple rings (`tryLatch`).

**Enemies (`src/enemy.ts`)** are one `Enemy` class with a `kind` (`snake`/`troll`/`cannon`/`bat`) and a `state` machine (`patrol`/`stunned`/`held`/`yanked`/`thrown`/…). Size-tier combat rule from the design doc: small enemies die to one whip hit; person-tier (`troll`) stuns on first hit, grabs on second, and the whip **never kills it** (stomp or thrown object does). `Spawner`s respawn a key enemy on vacancy (one-alive cap). When adding an enemy: add the kind to `EnemyKind` (`level.ts`), a parser char, behavior in `enemy.update`, and a draw branch in `game.drawEnemySprite`.

**Levels are ASCII (`src/level.ts`).** `parseLevel` turns a 28-row × 28-col string into tiles plus extracted spawns/grapple-points/light-statues/spike-markers. The legend is documented at the top of `level.ts` (`#` solid, `H` ladder, `-` one-way platform, `*` grapple ring, `^` spike, `L` light statue, `P`/`s`/`t`/`T`/`c`/`a` spawns, `E` exit). This is the **same text format the future generator and AI-edit loop will consume** — keep it the canonical representation. Levels live in `src/levels/` and are registered in the ordered manifest `src/levels/index.ts` (which `main.ts` and the editor both read).

**Sprites (`src/sprite.ts`, `src/art.ts`).** Art is Aseprite PNG+JSON pairs. `Sprite` converts per-frame ms durations to ticks and **probes opaque content bounds at load** so bottom-center anchoring lines art up despite asymmetric canvas padding (`draw` anchors content, not the canvas box — important for flipped/squashed sprites). `art.ts` imports every approved asset and `loadArt()` resolves them once at boot into the `Art` struct. `src/lighting.ts` darkens the rendered scene with combined light pools.

## Conventions that bite if missed

**Art workflow (`.cursor/rules/art-assets.mdc`).** Note: that rule warns that file-search can't surface PNGs (a `**/*.png` glob returning 0) — that was a **Cursor IDE** limitation (it doesn't index gitignored paths). Glob works normally in Claude Code, including for gitignored assets, so search directly; `art-manifest.md` is still a convenient pre-built index of every art/metadata file. Every asset is a `Name.png` + `Name.json` pair — move/copy both together. `assets/art/` is the **only** folder the game loads from; `import_tiles*/` and `import_new/` are quarantined review pools (gitignored, don't use or modify). After adding/removing/moving assets, regenerate the manifest: `powershell -NoProfile -ExecutionPolicy Bypass -File tools/generate-art-manifest.ps1`. Art may only be used after the user approves and it's copied into `assets/art/`.

**Level solvability — playtest, don't speculate (`.cursor/rules/level-*.mdc`).** Verify whether a player can reach/jump/swing somewhere by actually playing the level — never by hand-reasoning about jump arcs and whip angles (a known time-sink death spiral), and never by trying to compute or model it offline (the whip and swing make "where can the player get to" too tangled to model honestly). **Authoring vs. revising are separate permissions:** you may create/edit a level's layout when asked, but you must **not** tweak a level to "fix" solvability/reachability/difficulty unless the user explicitly grants it in the current task. If something seems unreachable, stop and report; don't start tweaking.

**Frame dump.** With the dev server running, `window.__dumpFrame()` (browser console) POSTs the native-res buffer to `/__frame`; the Vite middleware in `vite.config.ts` writes `tmp/frame.png`. Read that image to inspect exact pixels instead of scaled screenshots.

**Dev-only keys** (keyboard, no touch/NES equivalent): `R` restart, `L` tile/pixel lighting, `N` linear/plateau light curve, `-`/`=` previous/next level.
