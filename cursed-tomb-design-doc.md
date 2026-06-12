# Cursed Tomb (working title) — Design Document
*Draft 1 — output of initial brainstorm session. Intended for revision.*

**One-sentence pitch:** Whip enemies to stun and snatch them, then wield their powers to descend a cursed tomb before your time runs out.

**Genre statement:** A one-screen arcade homage in the lineage of Dig Dug, Lode Runner, Bomberman, and Ice Climber — a classic-feeling game with a twist, not a retro clone.

---

## 1. Design pillars (criteria rubric)

All pitches and features are judged against this rubric.

### Hard requirements — break one and it's a different game
1. **NES-simple controls.** D-pad plus two buttons, max. No menus, no inventory screens. Everything discoverable by pressing buttons.
2. **One-screen levels.** Grid-based; the whole playfield visible at once.
3. **Dexterity matters.** Arcadey timing and control — hands are a determining factor, not just planning.
4. **Readable enemies.** Simple behaviors understood quickly by watching. One-sentence rules.
5. **One core verb, emergent depth.** Whole game explainable in a sentence. New interactions come from context and level objects, not new player verbs. (Functions as a scope guardian.)
6. **Readable state at a glance.** Threats and modes visually telegraphed. No hidden information.
7. **Fast restart loop.** Death to retry in ~2 seconds. Lives, not checkpoints. Full run 10–20 minutes.

### Strong defaults — assume yes; a great idea may override
8. **Risk pays mechanical rewards.** Dangerous play earns things that feed back into the run (power, time, access) — never just points. Score is the accounting layer, not the motivation. Smell test: a player who ignores leaderboards should still want it.
9. **One wildcard.** Enemies follow rigid learnable rules, plus exactly ONE source of unpredictability (randomness or a pressure mechanic) so the game can't be solved into a recital. More than one wildcard feels unfair.

### Nice-to-haves — bonus points, never required
10. **Tool is danger.** The player's main ability can hurt or trap them.
11. **Escalate by remixing.** Same small set of enemies/tiles in nastier arrangements. (Production strategy.)
12. **Mutable terrain.** Player can reshape the level.

---

## 2. Fiction

- Attract-mode opening (~5 seconds): explorer grabs a golden idol → the mummy's curse strikes → the floor collapses → descent begins.
- **Monkey's paw premise:** greed caused the curse, and greed is the only thing that delays it. Treasure feeds the curse timer.
- **Why descend?** The curse can only be lifted by returning the idol to the burial chamber at the tomb's heart. The descent is the point.
- Ending should rhyme with the premise: one final greed check at the burial chamber (exact shape TBD — e.g., returning the idol sacrifices its score value, or an obviously-trapped final hoard sits beside the pedestal).

---

## 3. Core mechanics

### The whip (the one verb)
- **Stun:** whip a stunnable enemy → brief stun window.
- **Grab:** whip a stunned enemy again → yank it into your hands.
- **Swing:** whip a grapple point → swing traversal.
- **Yank:** whip treasure/objects to pull them to you from range.

### Hold system (Mario 2 / Kirby / Klonoa lineage)
- While holding an enemy, its power is active and **the whip is suppressed**. This is the central tension: picking up a power partially grounds you (no swing, no stun) for as long as you carry it.
- **Throw** empties your hands instantly: thrown enemies are projectiles/tools (Mario 2 attack). Throwing doubles as discard, so dropping a power is never a wasted input.
- **Wake-up timers:** held/stunned enemies wake after a per-enemy duration — every grab is a spend-it-or-lose-it clock.
- Getting hit while holding sends the held enemy bouncing loose (Kirby ability-loss style) — recoverable for a moment, then it wakes.
- Expert technique that falls out for free: ferrying (throw the enemy ahead, traverse with the whip, re-grab).

### Controls
**Gamepad (NES mapping):**
- A = jump (always)
- B = context verb: whip when empty-handed; activate the held object when holding (for many objects, activating means throwing it). No chords, no third button.
- Sprites move smoothly (sub-tile positions) over a logical grid — grid for the level, pixels for the actors.

**Touch (landscape):**
- Virtual d-pad left zone, A/B buttons right zone. Same two buttons as the pad — touch gets no extra buttons.
- To prototype: tap-to-whip-toward-touch-point as an alternative aiming scheme. Heresy for the homage; may be the difference between playable and good on phone. Both schemes can coexist.

---

## 4. Enemy design rules

**NOTE: No specific enemies have been decided.** This section defines the framework. Appendix A contains illustrative sketches from brainstorming — they are examples of the rules in use, not a canon roster.

### The five-question template
Every enemy must answer:
1. **Threat rule** — its behavior in one sentence.
2. **Held power** — what holding it grants (one sentence). May be "nothing" (pure ammunition).
3. **Thrown behavior** — what it does as a projectile.
4. **Lock answered** — which obstacle type only it opens (or "none").
5. **Mobility price** — what carrying it costs (beyond losing the whip).

### Size tiers (the readability rule)
- **Small (sub-tile) = dies.** One whip hit kills. Fodder/swarm enemies: threaten by pathing interference, never carry powers.
- **Person-sized = stuns.** The grabbable tier. First hit stuns (grab window); **second hit while stunned kills.** Every grabbable has a "no thanks" option in the same verb.
- **Big/armored = special condition.** Conditional stuns (e.g., behind-only), unkillables, bosses. Keep this tier tiny.

Tier is readable from silhouette size alone.

### Roster-level rules
- **Risk-to-power gradient:** the harder an enemy is to stun/grab, the stronger its held power. The stun condition is the difficulty dial.
- **Lock coverage:** one lock type ↔ one key enemy. No overlaps, no two-key locks. The player should read any lock and know its key on sight. ("One lock, one key, one screen-visible solution" — the anti-Lolo rule: depth comes from route and live enemies, never deduction.)
- **Power spectrum:** roster should span mobility sidegrades (compensate for the lost whip) through pure utility-at-mobility-cost to maximum-power/maximum-grounding. If every hold purely reduces mobility, holding always feels bad.
- **Cursed recolors:** purple/black variants of base enemies reuse behavior rules with time-damage instead of body-damage. Doubles the roster via palette swap (the NES way). Open question: are cursed variants grabbable, and do their powers carry a curse tax (drain while held)? Current lean: yes-grabbable-with-tax.
- **Roster size:** ~4 enemies (plus fodder and one curse entity) is a complete prototype. ~6 grabbables is likely the full-game budget.

### The curse family (purple/black = time damage)
- One color rule teaches everything: **purple attacks your clock, everything else attacks your body.** Extends to traps, floor tiles, cursed chests (telegraphed by purple sheen — spotting them is a perception skill, not a gotcha).
- The ambient curse entity (e.g., a wisp): ungrabbable, whip-stun only, never dies, drifts semi-randomly — this is the design's **one wildcard** (pillar 9). Safe to touch when time is fat, deadly when thin: threat level scales with the player's economy at zero design cost.

---

## 5. Spawners (key-enemy guarantee)

Required key enemies come from **spawners** (Gauntlet generators, repurposed as a solvability guarantee):

- **Spawner = landmark.** Each is visually matched to its enemy (urn, nest, burrow). Architecture telegraphs which lock-type lives in a stratum before any enemy exists.
- **One-alive cap, spawn on vacancy.** Dormant while its enemy lives; on death/removal, respawns after a short telegraphed delay (~2–3 s). Killing your key is never fatal, just costs time — correct arcade pricing under the curse clock.
- **Spawned enemies pay nothing on death.** Kills farming with one rule. Wild-placed enemies may pay token time.
- **Two classes:** indestructible spawners for main-path locks (the descent is unfailable by construction); destructible spawners for optional treasure locks (self-inflicted lockout via your own blast is fair arcade tragedy).
- Emergent bonus: the spawner's live enemy defends its own lock area — puzzle and combat braided by one object.

---

## 6. Curse timer and economy

- **The timer is an explicit countdown number in the HUD.** Big, centered, the most important number on screen. Curse styling (purple/black) is presentation only — the number is the information channel.
- **Treasure adds time.** The score/survival currency is unified: treasure = seconds = score.
- **Visible arithmetic:** every transaction prints — floating gold **+15** on treasure, purple **−10** on curse hits. The player learns exchange rates without a manual.
- **Two-tier economy:** safe main-route treasure is sufficient for a clean, brisk descent; risky treasure buys surplus (mistake cushion + score). Risk stays opt-in — the curse punishes dawdling and whiffing, not declining fights. Drain rate + treasure density are the two difficulty knobs, tunable per level/depth.
- **Fodder pays token time (+1), never respawns.** Message: violence is pocket change, treasure is wealth.
- Optional pressure variants kept in pocket (not adopted): decaying-value treasure; hurry-up guardian if the timer fully expires.

---

## 7. Level structure and generation

### Strata structure (Ice Climber, inverted)
- Levels are vertical descents built from stacked **strata** — horizontal bands 3–5 tiles tall, generated top to bottom.
- Each stratum gets: ≥1 pass-through point (gap, breakable section, swing-gap), enemy spawns from the difficulty pool, optionally a lock/treasure cell and its key spawner.
- Solvability nearly by construction: each stratum needs one valid descent route; key-before-lock means the spawner sits in or above the lock's stratum.
- Strata are a generation structure, not walls — the screen is one continuous space; enemies and thrown objects cross strata freely.

### Stratum challenge grammar (variety engine)
Each stratum leads with one challenge type; levels are sequences drawn from these pools:
- **Dexterity-led:** the way down is the test (swing chains, collapsing floors, timed drops).
- **Logistics-led:** the light puzzle — order and path between key and lock. Never "what", only "in what order, along what route."
- **Pressure-led:** something on a clock (the curse economy makes much of this ambient).
- **Choice-led:** safe route vs. risky detour to treasure. Where pillar 8 lives every screen.
Difficulty = the mix (early: mostly dexterity + one logistics beat; late: logistics chained into pressure) plus drain rate.

### Generation approach: random-ish with human curation
- **Bomberman-style shuffle** (fixed skeleton, randomized fill) acceptable for v1.
- Target: **template + chunk generation** (Spelunky method) at stratum granularity, with a curation loop:
  - Generation is **deterministic from a seed**; a shipped level = seed + diff list. Approve/reject/regenerate with single keys; rejection reasons become generator rules.
  - **Curate chunks/strata, not whole screens** — approvals compound combinatorially.
  - **Automated validators run first:** reachability flood-fill, grapple coverage (every gap wider than max jump has a grapple point in whip range), key-before-lock ordering. Machines reject the broken; humans judge the fun.
  - Generator guarantee: spawners make key availability permanent (see §5).
- Tradeoff accepted: random levels trade memorization-as-skill for sight-reading-as-skill, which suits this design (plan the visible screen, then execute).

### AI-assisted level editing loop
- Direct paint tools handle literal edits (don't route tile placement through a model).
- Vision-model loop handles **semantic edits**: screenshot + drawn annotations + a note ("this carry route is too easy") → model returns a **tile diff** (`[{x,y,tile}]`) + one-line rationale → same validators gate the result → play again.
- Reliability rules: send the level as a text grid (ASCII/JSON + legend) alongside the image; capture drawn strokes as grid coordinates; demand diffs, never full-level regeneration; log every diff (free undo + seed lineage).

### Level end condition
- **Reach the exit** (descend to the next stratum-set / depth), Bomberman/Spelunky style. Kill-all rejected — it would force fighting enemies the player would rather use as tools.

---

## 8. Presentation and tech

### Layout (landscape phone, mocked up and approved)
- Logical design floor: 360 × 800; typical 390–430 × 844–932 (CSS/logical px). Physical = logical × devicePixelRatio.
- **Playfield: 28 × 21 tiles at 16 logical px = 448 × 336 (exactly 4:3).** 28 wide = Lode Runner width.
- **~198 px thumb zones each side** (d-pad left; B/A right). HUD strip above: score left, **timer center**, held-item box right.
- Keep critical action away from bottom corners of the playfield flanks (thumb occlusion).
- Caution flagged: 16 logical px tiles ≈ 2.5 mm — crisp but small. Test on device before locking; 20 px tiles → 22 × 16 grid at the same 4:3 is the fallback.
- Portrait alternative considered (13 wide × ~19 tall): set aside in favor of landscape, revisitable.

### Rendering
- Render to a native art canvas at tile resolution, blit to screen at the **largest integer scale** that fits (nearest-neighbor, no smoothing). Game logic never knows phones exist.
- Pixel-art authenticity depends on integer scaling; letterbox leftovers become decorative tomb-wall bezel (very on-genre).
- Small bonus: the tiny regular canvas is ideal input for the AI-edit loop.

---

## 9. Inspirations and references

- **Hold/power system:** Super Mario Bros. 2 (pluck & throw), Kirby's Adventure (state-dependent B button; power suppresses inhale; ability lost on hit), Klonoa (grab as the only verb).
- **Whip/tomb fantasy:** Spelunker, Montezuma's Revenge, Roc'n Rope, Bionic Commando, arcade Indiana Jones and the Temple of Doom.
- **Drain economy:** Gauntlet (health-as-timer), Wonder Boy (vitality + fruit).
- **Pressure entities:** Bubble Bobble / Bomberman hurry-up monsters, Spelunky ghost.
- **Spawners:** Gauntlet generators.
- **Level structure:** Ice Climber (stacked floors, hand-designed 32 mountains), Bomberman (fixed skeleton + random fill), Spelunky (template/chunk generation, procedural descendant of Spelunker).
- **Grid/screen history:** Lode Runner 28×16 (Apple II; NES port scrolled and suffered), NES 256×240, Bomberman 13-wide.
- **Era procgen-as-compression:** Pitfall!, River Raid (deterministic generation from fixed seeds — the ancestor of the seed-curation workflow).
- **Cautionary references:** Solomon's Key / Adventures of Lolo (puzzle-first drift to avoid), Ms. Pac-Man (randomness added specifically to kill pattern play).

---

## 10. Decision log

### Decided
- Whip as the single core verb (stun / grab / swing / yank); hold suppresses whip; throw = discard.
- Enemy powers ARE the item system (no inventory, no relics-in-chests).
- Size-tier combat rule: small dies / medium stuns then second-hit kills / big is special.
- Curse color rule: purple/black = time damage.
- Key enemies come from spawners; one-alive cap; spawned enemies pay nothing.
- Explicit countdown timer number in HUD; treasure adds time; visible +/− popups.
- Two-tier treasure economy (safe-sufficient / risky-surplus).
- Cursed-by-greed monkey's paw fiction; descend to return the idol.
- Strata-based vertical levels; random-ish generation + human curation + validators; AI-assisted semantic editing.
- Reach-the-exit advancement (not kill-all).
- Landscape phone layout, 28×21 grid @ 16 logical px, integer-scaled pixel art.
- NES control mapping: A = jump, B = context verb (whip empty-handed, activate held object when holding). Touch uses the same two buttons — no extras.

### Open questions
- The enemy roster itself (only the rules in §4 are decided).
- One-way vs. two-way descent (lean: mostly one-way, whip allows one stratum of regret).
- Fall damage: does falling past ~N tiles hurt? (Affects mobility-power value.)
- Cursed-variant grabbability and curse tax (lean: grabbable with drain-while-held tax).
- Whip vs. curse entities (lean: stun only, never grab/kill).
- Exact ending greed-check at the burial chamber.
- Final tile size (16 vs. 20 logical px) pending on-device test.
- Tap-to-whip touch scheme vs. pure virtual buttons.
- Discarding a held object without activating it: needed at all? If so, how — B is activate, and there is no chord or extra button to spend on discard. (Decide at Milestone 3 with the hold system.)
- What ends a "run": fixed depth? endless? depth-loop with escalation?

### Rejected (with reasons — do not relitigate without new information)
- **Torch-light radius as the timer:** hidden information growing over time attacks the readability pillar; the fiction promises light/darkness mechanics that would explode scope; phone-in-sunlight and accessibility taxes.
- **Sprite mummification as the timer display:** too cute; players wouldn't read it. (Survives as optional flavor only; the HUD number is the channel.)
- **Sand line sealing the tomb from above:** strong spatial-pressure idea, superseded by the explicit countdown. Keep in pocket as a possible late-game or hard-mode layer.
- **Multi-verb loadout (dig + bomb + whip + open):** violated pillar 5; consolidated into the whip.
- **Relic/chest item system:** superseded — enemies as items is strictly better (triple content value).
- **Kill-all level advancement:** conflicts with enemies-as-tools.
- **Fully hand-designed levels:** too slow for prototyping pace; curation replaces authorship.
- **Pure score-as-motivation risk/reward:** rewards must be mechanical (pillar 8).

---

## Appendix A — Illustrative enemy sketches (NOT canon)

Brainstorm artifacts demonstrating the §4 template in use. None are decided; treat as examples of the rules, candidates at best.

| Sketch | Threat rule | Held power | Thrown | Lock | Price / notes |
|---|---|---|---|---|---|
| Asp | Patrols a floor, lunges on shared row | None (pure ammo) | Terrain-hugging guided missile | Remote/unreachable enemies | Minimal; fast wake (~5 s) |
| Bat | Ceiling-hang, dive-bomb arc | Slow fall, wider jump (mobility sidegrade) | Straight line, one ricochet | Long drops | Price = no whip mid-air |
| Fire beetle | Lobs embers on a rhythm | Burn vines, light braziers (visible switches) | Straight burning fuse line | Vine walls, braziers | Carrying fire: hits while holding cost time |
| Stone scarab | Invulnerable bulldozer; stun from behind only | Heavy: knockback-immune, breaks cracked floors by landing | Drops like an anvil | Cracked floors (the vertical key) | Steepest: slow, no swing, short jump |
| Mummy spark | Shambles, proximity-detonates | Grabbing lights a 5 s fuse | Grenade; opens sealed walls | Sealed stone walls | Pure pressure object |
| Tomb spider | Drops on a thread when crossed under | None | Thrown upward: sticks as a temporary grapple point (~8 s) | Gaps with no grapple ring | The generator's safety valve; placement-then-swing clock |
| Curse wisp | Drifts through walls, semi-random | — (ungrabbable) | — | — | Time damage on touch; stun-only; the roster's one wildcard |
| Fodder (rats, bone beetles) | Swarm/pathing interference | — | — | — | One-hit kill; +1 s token; never respawn |
