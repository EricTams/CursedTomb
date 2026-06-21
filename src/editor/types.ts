// Shared editor types and small constants.

export type Tool = "paint" | "select" | "flip" | "spawner";

// The background / empty / erase character in the level grid.
export const BG = ".";

// Cells whose char represents an enemy spawn — the only cells that carry
// (and accept) facing/spawner metadata.
export const ENEMY_CHARS = new Set(["s", "t", "m", "f", "c", "a"]);

// Every enemy spawn can be promoted to a respawning statue spawner via the
// `spawner` meta flag (the Toggle spawner tool) — there is no dedicated char.
export const SPAWNER_ABLE_CHARS = new Set(["s", "t", "m", "f", "c", "a"]);

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
