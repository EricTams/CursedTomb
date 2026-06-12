// Playfield geometry per design doc §8.
// 28x21 tiles @ 16px = 448x336, exactly 4:3. If the on-device test (todo.md,
// Milestone 2) votes for 20px tiles, this is the only file that changes.
export const TILE = 16;
export const GRID_W = 28;
export const GRID_H = 21;
export const VIEW_W = GRID_W * TILE; // 448
export const VIEW_H = GRID_H * TILE; // 336

// Fixed simulation rate (arcade-style determinism; required for seeded levels later).
export const TICK_HZ = 60;
export const TICK_MS = 1000 / TICK_HZ;
