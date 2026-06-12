import { GRID_W, GRID_H } from "./config";

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

export class Level {
  readonly tiles: Tile[]; // row-major, GRID_W * GRID_H
  readonly spawnX: number; // spawn tile coords
  readonly spawnY: number;

  constructor(tiles: Tile[], spawnX: number, spawnY: number) {
    this.tiles = tiles;
    this.spawnX = spawnX;
    this.spawnY = spawnY;
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

export function parseLevel(ascii: string): Level {
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
      const tile = LEGEND[ch];
      if (tile === undefined) {
        throw new Error(`Unknown tile '${ch}' at ${x},${y}`);
      }
      tiles[y * GRID_W + x] = tile;
    }
  }

  if (spawnX === -1) throw new Error("Level has no spawn 'P'");
  return new Level(tiles, spawnX, spawnY);
}
