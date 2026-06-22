import { TILE, GRID_W, GRID_H } from "./config";

// ASCII level format — the same text representation the future generator and
// AI-edit loop will consume (design doc §6): GRID_H rows of GRID_W chars.
//
// Legend:
//   #  solid stone
//   .  background (empty)
//   E  exit tile (touch to clear the level)
//   H  ladder (climbable; its topmost tile is standable like a platform)
//   -  one-way platform (solid from above only; down+jump drops through)
//   P  player spawn (exactly one; stored as spawn, tile becomes background)
//   s  Snake spawn (fodder enemy; stored as spawn, tile becomes background)
//   t  Large Troll spawn (tanky watcher; the whip only stuns it — never grabs,
//      never kills — and it goes briefly stun-immune after reviving. Killed
//      only by a thrown object. Stored as spawn, tile becomes background)
//   m  Small Troll spawn (grabbable enemy: whip stuns, second whip grabs, throw
//      as a weapon; whip never kills. Stored as spawn, tile becomes background)
//   f  Frog spawn (ambush leaper: crouches, then leaps when it spots the
//      player; one whip hit kills. Stored as spawn, tile becomes background)
//      Any spawn (s/t/m/f/c/a/A) becomes a respawning statue spawner of its kind
//      when its cell carries the meta `spawner: true` flag (§5).
//   c  Cannon spawn (exit guardian; dies to whip or thrown enemy — but its
//      bolt range far exceeds the whip, so closing in is the risky route)
//   a  Small Bat spawn (ceiling-roosting flyer; swoops in a parabolic arc when
//      the player nears, reverses on walls, re-roosts at a ceiling; one whip kills)
//   A  Large Bat spawn (same hang-and-swoop flight, but bigger and grabbable:
//      whip stuns, a second whip grabs it; carried it works as a glider — hold
//      jump while falling to drift down slowly. Killed only by a thrown object)
//   *  grapple ring (whip latch point for swinging; tile itself is background)
//   L  light statue (a static light source; tile itself is background)
//   G  glass window (passable; any glass in a level raises the base light level
//      — see Game's light floor; tile itself is background)
//   ^  spike marker (passable; hazards derived from adjacent solid surfaces)
//   $  treasure pot (breakable; the whip shatters it, spilling coins)
//   @  altar pot (breakable; shatters into a single giant coin — the intro
//      sequence's trigger; tile itself is background)
//   %  cursed pot (breakable; spills NO treasure — bursts into a lingering
//      cloud of cursed energy that docks the curse clock on contact. Purple
//      attacks your clock; dodge it. Tile itself is background)
//   o  bounce onion (indestructible trampoline pad; landing on top launches
//      the player — and thrown enemies — upward; tile itself is background)
//   O  explosive bounce onion (triggered bomb: detonates when the player, the
//      whip, or a thrown enemy touches it; the blast kills nearby enemies AND
//      the player; one-shot; tile itself is background)

export enum Tile {
  Background = 0,
  Solid = 1,
  Exit = 2,
  Ladder = 3,
  Platform = 4,
}

const LEGEND: Record<string, Tile> = {
  "#": Tile.Solid,
  ".": Tile.Background,
  E: Tile.Exit,
  H: Tile.Ladder,
  "-": Tile.Platform,
};

export type EnemyKind =
  | "snake"
  | "troll" // large troll: stun-only watcher, killed only by a thrown object
  | "smallTroll" // grabbable/throwable troll (the old "troll" behavior)
  | "frog" // ambush leaper
  | "cannon"
  | "smallBat" // ceiling swoop fodder (one whip kills) — the old "bat"
  | "largeBat"; // grabbable swooper: whip stuns then grabs; carried as a glider

// Per-cell metadata side-table. The ASCII grid stays the canonical, readable
// representation of *what* and *where*; meta carries extra authored attributes
// (enemy facing, and whether a spawn is a respawning statue spawner) keyed by
// `${tx},${ty}`. This is what the level editor re-keys when it moves an object,
// and where further per-cell attributes land without polluting the grid.
export type FacingTag = "left" | "right";

export interface CellMeta {
  facing?: FacingTag;
  // Turns a normal enemy spawn (s/t/c/a) into a statue spawner for that kind:
  // a landmark that respawns its enemy on vacancy (design doc §5). Any kind can
  // be a spawner this way; the legacy 'T' char is the troll-only shorthand.
  spawner?: boolean;
}

export type LevelMeta = Record<string, CellMeta>;

export interface LevelModule {
  ascii: string;
  meta: LevelMeta;
}

// A level can be authored as a bare ASCII string (the original form — still
// used by level1-4) or as a { ascii, meta } module (what the editor emits).
export type LevelInput = string | LevelModule;

export interface EnemySpawn {
  kind: EnemyKind;
  tx: number; // spawn tile coords
  ty: number;
  facing?: 1 | -1; // authored initial facing (from meta); default is the
  // Enemy class's own default when omitted.
}

// Whip latch point for swinging. The anchor is the tile's center in
// playfield pixels — what the lash tests against and the rope hangs from.
export interface GrapplePoint {
  tx: number;
  ty: number;
  x: number; // anchor pixel coords
  y: number;
}

// Static light source placed in the level. x/y are the tile center in
// playfield pixels (where the emitted light is centered).
export interface LightStatue {
  tx: number;
  ty: number;
  x: number;
  y: number;
}

export type SpikeDir = "up" | "down" | "left" | "right";

export interface SpikeSegment {
  tx: number; // tile where the hazard is drawn (the marker cell)
  ty: number;
  dir: SpikeDir;
}

// Breakable treasure container. A normal pot ("pot") spills a handful of
// coins; the altar pot ("altar") shatters into a single giant coin. x/y are
// the tile center in playfield pixels (the pot rests bottom-anchored in its
// cell). Break state is runtime-only and lives in the Game, not here.
export type TreasurePotKind = "pot" | "altar" | "cursed";

export interface TreasurePot {
  kind: TreasurePotKind;
  tx: number;
  ty: number;
  x: number; // tile center px
  y: number;
}

// Bounce onion: an interactive object (no AI). A plain "bounce" pad is an
// indestructible trampoline; an "explosiveBounce" pad is a one-shot bomb that
// detonates on contact. x/y are the tile center in playfield pixels (it rests
// bottom-anchored in its cell). Runtime state lives in the Game, not here.
export type BounceOnionKind = "bounce" | "explosiveBounce";

export interface BounceOnion {
  kind: BounceOnionKind;
  tx: number;
  ty: number;
  x: number; // tile center px
  y: number;
}

// Passable "window" tile. It blocks nothing. Two lighting effects (both applied
// by Game): a level containing any glass renders with a raised base light floor,
// AND each glass tile casts a local radial pool like a light statue. x/y are the
// tile center in playfield pixels (where the emitted pool is centered).
export interface GlassTile {
  tx: number;
  ty: number;
  x: number;
  y: number;
}

function isSpikeSurface(tiles: readonly Tile[], tx: number, ty: number): boolean {
  if (tx < 0 || tx >= GRID_W || ty < 0 || ty >= GRID_H) return false;
  const tile = tiles[ty * GRID_W + tx];
  if (tile === Tile.Solid || tile === Tile.Platform) return true;
  if (tile === Tile.Ladder && (ty === 0 || tiles[(ty - 1) * GRID_W + tx] !== Tile.Ladder)) {
    return true;
  }
  return false;
}

export function resolveSpikeSegments(
  tiles: readonly Tile[],
  markers: readonly { tx: number; ty: number }[],
): SpikeSegment[] {
  const segments: SpikeSegment[] = [];

  for (const { tx, ty } of markers) {
    if (isSpikeSurface(tiles, tx, ty + 1)) segments.push({ tx, ty, dir: "up" });
    if (isSpikeSurface(tiles, tx, ty - 1)) segments.push({ tx, ty, dir: "down" });
    if (isSpikeSurface(tiles, tx - 1, ty)) segments.push({ tx, ty, dir: "right" });
    if (isSpikeSurface(tiles, tx + 1, ty)) segments.push({ tx, ty, dir: "left" });
  }

  return segments;
}

export class Level {
  readonly tiles: Tile[]; // row-major, GRID_W * GRID_H
  readonly spawnX: number; // spawn tile coords
  readonly spawnY: number;
  readonly enemySpawns: readonly EnemySpawn[];
  readonly spawnerSpawns: readonly EnemySpawn[];
  readonly grapplePoints: readonly GrapplePoint[];
  readonly lightStatues: readonly LightStatue[];
  readonly spikeSegments: readonly SpikeSegment[];
  readonly treasurePots: readonly TreasurePot[];
  readonly bounceOnions: readonly BounceOnion[];
  readonly glassTiles: readonly GlassTile[];

  constructor(
    tiles: Tile[],
    spawnX: number,
    spawnY: number,
    enemySpawns: EnemySpawn[] = [],
    spawnerSpawns: EnemySpawn[] = [],
    grapplePoints: GrapplePoint[] = [],
    lightStatues: LightStatue[] = [],
    spikeSegments: SpikeSegment[] = [],
    treasurePots: TreasurePot[] = [],
    bounceOnions: BounceOnion[] = [],
    glassTiles: GlassTile[] = [],
  ) {
    this.tiles = tiles;
    this.spawnX = spawnX;
    this.spawnY = spawnY;
    this.enemySpawns = enemySpawns;
    this.spawnerSpawns = spawnerSpawns;
    this.grapplePoints = grapplePoints;
    this.lightStatues = lightStatues;
    this.spikeSegments = spikeSegments;
    this.treasurePots = treasurePots;
    this.bounceOnions = bounceOnions;
    this.glassTiles = glassTiles;
  }

  tileAt(tx: number, ty: number): Tile {
    if (tx < 0 || tx >= GRID_W || ty < 0 || ty >= GRID_H) return Tile.Solid;
    return this.tiles[ty * GRID_W + tx];
  }

  // Out-of-bounds counts as solid so actors can never leave the playfield.
  isSolid(tx: number, ty: number): boolean {
    return this.tileAt(tx, ty) === Tile.Solid;
  }

  isExit(tx: number, ty: number): boolean {
    return this.tileAt(tx, ty) === Tile.Exit;
  }

  isLadder(tx: number, ty: number): boolean {
    return this.tileAt(tx, ty) === Tile.Ladder;
  }

  isPlatform(tx: number, ty: number): boolean {
    return this.tileAt(tx, ty) === Tile.Platform;
  }

  // The top tile of each ladder run is standable (one-way), so free-standing
  // ladders work without needing a platform placed on top.
  isLadderTop(tx: number, ty: number): boolean {
    return this.isLadder(tx, ty) && !this.isLadder(tx, ty - 1);
  }
}

export function parseLevel(input: LevelInput): Level {
  const { ascii, meta } =
    typeof input === "string" ? { ascii: input, meta: {} as LevelMeta } : input;

  // Translate authored facing tags to the engine's 1 | -1 convention.
  const facingAt = (x: number, y: number): 1 | -1 | undefined => {
    const f = meta[`${x},${y}`]?.facing;
    return f === "right" ? 1 : f === "left" ? -1 : undefined;
  };

  // A spawn cell carrying the meta `spawner` flag becomes a statue spawner.
  const isSpawnerAt = (x: number, y: number): boolean =>
    meta[`${x},${y}`]?.spawner === true;

  // Route an authored spawn to either the live-spawn list or the spawner list,
  // depending on its meta flag. Used by every enemy spawn char.
  const pushSpawn = (kind: EnemyKind, x: number, y: number): void => {
    const spawn: EnemySpawn = { kind, tx: x, ty: y, facing: facingAt(x, y) };
    (isSpawnerAt(x, y) ? spawnerSpawns : enemySpawns).push(spawn);
  };

  const rows = ascii
    .split("\n")
    .map((r) => r.trimEnd())
    .filter((r) => r.length > 0);

  if (rows.length !== GRID_H) {
    throw new Error(`Level must have ${GRID_H} rows, got ${rows.length}`);
  }

  const tiles: Tile[] = new Array(GRID_W * GRID_H).fill(Tile.Background);
  let spawnX = -1;
  let spawnY = -1;
  const enemySpawns: EnemySpawn[] = [];
  const spawnerSpawns: EnemySpawn[] = [];
  const grapplePoints: GrapplePoint[] = [];
  const lightStatues: LightStatue[] = [];
  const spikeMarkers: { tx: number; ty: number }[] = [];
  const treasurePots: TreasurePot[] = [];
  const bounceOnions: BounceOnion[] = [];
  const glassTiles: GlassTile[] = [];

  for (let y = 0; y < GRID_H; y++) {
    if (rows[y].length !== GRID_W) {
      throw new Error(
        `Level row ${y} must have ${GRID_W} chars, got ${rows[y].length}`,
      );
    }
    for (let x = 0; x < GRID_W; x++) {
      const ch = rows[y][x];
      if (ch === "P") {
        if (spawnX !== -1) throw new Error("Level has more than one spawn 'P'");
        spawnX = x;
        spawnY = y;
        continue; // spawn tile is background
      }
      if (ch === "s") {
        pushSpawn("snake", x, y);
        continue; // spawn tile is background
      }
      if (ch === "t") {
        pushSpawn("troll", x, y);
        continue; // spawn tile is background
      }
      if (ch === "m") {
        pushSpawn("smallTroll", x, y);
        continue; // spawn tile is background
      }
      if (ch === "f") {
        pushSpawn("frog", x, y);
        continue; // spawn tile is background
      }
      if (ch === "c") {
        pushSpawn("cannon", x, y);
        continue; // spawn tile is background
      }
      if (ch === "a") {
        pushSpawn("smallBat", x, y);
        continue; // spawn tile is background (the bat hangs here)
      }
      if (ch === "A") {
        pushSpawn("largeBat", x, y);
        continue; // spawn tile is background (the bat hangs here)
      }
      if (ch === "*") {
        grapplePoints.push({
          tx: x,
          ty: y,
          x: x * TILE + TILE / 2,
          y: y * TILE + TILE / 2,
        });
        continue; // ring tile is background
      }
      if (ch === "L") {
        lightStatues.push({
          tx: x,
          ty: y,
          x: x * TILE + TILE / 2,
          y: y * TILE + TILE / 2,
        });
        continue; // statue tile is background
      }
      if (ch === "G") {
        glassTiles.push({
          tx: x,
          ty: y,
          x: x * TILE + TILE / 2,
          y: y * TILE + TILE / 2,
        });
        continue; // glass tile is background (passable; lights the map)
      }
      if (ch === "^") {
        spikeMarkers.push({ tx: x, ty: y });
        continue; // spike marker tile is background
      }
      if (ch === "$" || ch === "@" || ch === "%") {
        treasurePots.push({
          kind: ch === "@" ? "altar" : ch === "%" ? "cursed" : "pot",
          tx: x,
          ty: y,
          x: x * TILE + TILE / 2,
          y: y * TILE + TILE / 2,
        });
        continue; // pot tile is background (it rests in the cell)
      }
      if (ch === "o" || ch === "O") {
        bounceOnions.push({
          kind: ch === "O" ? "explosiveBounce" : "bounce",
          tx: x,
          ty: y,
          x: x * TILE + TILE / 2,
          y: y * TILE + TILE / 2,
        });
        continue; // onion tile is background (it rests in the cell)
      }
      const tile = LEGEND[ch];
      if (tile === undefined) {
        throw new Error(`Unknown tile '${ch}' at ${x},${y}`);
      }
      tiles[y * GRID_W + x] = tile;
    }
  }

  if (spawnX === -1) throw new Error("Level has no spawn 'P'");
  const spikeSegments = resolveSpikeSegments(tiles, spikeMarkers);
  return new Level(
    tiles,
    spawnX,
    spawnY,
    enemySpawns,
    spawnerSpawns,
    grapplePoints,
    lightStatues,
    spikeSegments,
    treasurePots,
    bounceOnions,
    glassTiles,
  );
}
