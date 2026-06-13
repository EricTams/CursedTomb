// Reachability simulation — the first §7 validator, usable today as a level
// design overlay (toggle with M). Breadth-first search over player states
// that drives the REAL Player.update with scripted inputs, so walking,
// jumping, ladders, coyote time, whip latches, and swings behave exactly
// like play and the map can never drift out of sync with the game.
//
// Two passes make the color coding mean something:
//   walk = reachable with movement only (no whip, so no rings)
//   full = reachable with everything
// full-minus-walk is what the level's grapple rings specifically unlock.
//
// Enemies are ignored: this answers "where can the body get to", not "what
// will kill it on the way".

import { TILE, GRID_W, GRID_H } from "./config";
import { Level } from "./level";
import { Input } from "./input";
import { Player, PLAYER_W, PLAYER_H } from "./player";

const BRANCH_TICKS = 60; // max ticks a branch runs before it's abandoned
const MAX_STATES = 20000; // safety cap on explored states per pass

interface Combo {
  dir: -1 | 0 | 1;
  a: boolean;
  up: boolean;
  down: boolean;
  b: boolean;
}

// Held-input combinations, one branch each. B-combos only vary the aim
// inputs that matter for the whip (direction and up for diagonals/vertical).
function buildCombos(withWhip: boolean): Combo[] {
  const combos: Combo[] = [];
  for (const dir of [-1, 0, 1] as const) {
    for (const a of [false, true]) {
      for (const vert of ["none", "up", "down"] as const) {
        combos.push({ dir, a, up: vert === "up", down: vert === "down", b: false });
      }
      if (withWhip) {
        for (const up of [false, true]) {
          combos.push({ dir, a, up, down: false, b: true });
        }
      }
    }
  }
  return combos;
}

// Player.update only reads the held/pressed fields, so a plain object stands
// in for the full Input class (which carries private edge-latching state).
function comboInput(c: Combo, pressed: boolean): Input {
  return {
    left: c.dir === -1,
    right: c.dir === 1,
    up: c.up,
    down: c.down,
    a: c.a,
    aPressed: c.a && pressed,
    b: c.b,
    bPressed: c.b && pressed,
    restartPressed: false,
  } as unknown as Input;
}

// All fields on Player are TS-private at most (no #-privates), so a
// prototype-based shallow copy is a faithful runtime clone. The level
// reference is shared, which is fine: the level is immutable.
function clonePlayer(p: Player): Player {
  return Object.assign(Object.create(Player.prototype), p) as Player;
}

export interface ReachMap {
  walk: Uint8Array; // tile index -> reachable with movement only
  full: Uint8Array; // tile index -> reachable with the whip too
  exitReachable: boolean;
}

export function computeReachMap(level: Level): ReachMap {
  const walk = runPass(level, false);
  const full = runPass(level, true);

  let exitReachable = true;
  for (let ty = 0; ty < GRID_H; ty++) {
    for (let tx = 0; tx < GRID_W; tx++) {
      if (level.isExit(tx, ty)) {
        exitReachable &&= full[ty * GRID_W + tx] === 1;
      }
    }
  }
  return { walk, full, exitReachable };
}

function runPass(level: Level, withWhip: boolean): Uint8Array {
  const reached = new Uint8Array(GRID_W * GRID_H);
  const combos = buildCombos(withWhip);

  const start = new Player(level); // constructor respawns at the level spawn
  const open: Player[] = [start];
  const closed = new Set<string>([stateKey(start)]);
  mark(reached, start);

  let head = 0;
  while (head < open.length && open.length < MAX_STATES) {
    const state = open[head++];
    for (const combo of combos) {
      const result = branch(state, combo, reached);
      if (!result) continue;
      const key = stateKey(result);
      if (closed.has(key)) continue;
      closed.add(key);
      open.push(result);
    }
  }
  return reached;
}

// Run one input combo forward from a state until the player meaningfully
// changes (new tile or new movement mode), marking every tile the body
// touches along the way. Returns null if nothing changed within the budget.
function branch(p: Player, combo: Combo, reached: Uint8Array): Player | null {
  const sim = clonePlayer(p);
  const startCol = Math.floor(sim.x / TILE);
  const startRow = Math.floor(sim.y / TILE);
  const startGrounded = sim.grounded;
  const startClimbing = sim.climbing;
  const startSwinging = sim.swinging;

  const first = comboInput(combo, true);
  const held = comboInput(combo, false);

  for (let t = 0; t < BRANCH_TICKS; t++) {
    sim.update(t === 0 ? first : held);
    mark(reached, sim);

    if (
      Math.floor(sim.x / TILE) !== startCol ||
      Math.floor(sim.y / TILE) !== startRow ||
      sim.grounded !== startGrounded ||
      sim.climbing !== startClimbing ||
      sim.swinging !== startSwinging
    ) {
      return sim;
    }
  }
  return null;
}

// Mark every tile the AABB currently overlaps.
function mark(reached: Uint8Array, p: Player): void {
  const left = Math.max(0, Math.floor(p.x / TILE));
  const right = Math.min(GRID_W - 1, Math.floor((p.x + PLAYER_W - 1) / TILE));
  const top = Math.max(0, Math.floor(p.y / TILE));
  const bottom = Math.min(GRID_H - 1, Math.floor((p.y + PLAYER_H - 1) / TILE));
  for (let ty = top; ty <= bottom; ty++) {
    for (let tx = left; tx <= right; tx++) {
      reached[ty * GRID_W + tx] = 1;
    }
  }
}

// Dedup key: tile plus quantized motion. Velocity buckets keep momentum
// differences (a swing fling vs a walk-off) alive as distinct states without
// letting float noise explode the search. Swing angle/velocity are private
// fields, read dynamically — they're the swing-mode analog of vx/vy.
function stateKey(p: Player): string {
  const col = Math.floor(p.x / TILE);
  const row = Math.floor(p.y / TILE);
  const flags = (p.grounded ? 1 : 0) | (p.climbing ? 2 : 0) | (p.swinging ? 4 : 0);
  let motion: string;
  if (p.swinging) {
    const angle = (p as unknown as { swingAngle: number }).swingAngle;
    const vel = (p as unknown as { swingVel: number }).swingVel;
    motion = `${Math.round(angle * 8)}:${Math.round(vel * 50)}`;
  } else {
    motion = `${Math.round(p.vx * 2)}:${Math.round(p.vy)}`;
  }
  return `${col},${row},${flags},${motion}`;
}
