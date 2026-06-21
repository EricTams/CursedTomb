// The curse economy: the run-long clock the player outruns with treasure, the
// non-linear "progress toward death" bar that visualizes it, and the
// purple -> black -> red curse palette. Design doc §6 (curse timer / economy)
// and §8 (HUD). The rule the visuals teach: purple attacks your clock,
// everything else attacks your body.
//
// Pure helpers + tuning knobs only — no rendering, no game state. The sim runs
// on ticks, so the clock is kept in ticks; the *_SECONDS constants are the
// human-facing knobs and *_TICKS are their tick conversions.
import { TICK_HZ } from "./config";

// --- Economy tuning (the difficulty knobs) ---
export const CURSE_START_SECONDS = 180; // a fresh run starts with 3:00 on the clock
export const COIN_SECONDS = 3; // each collected coin tops the clock up by this
export const CURSE_HIT_SECONDS = 10; // a touch of cursed energy costs this much time
export const CURSE_HIT_COOLDOWN_TICKS = Math.round(1 * TICK_HZ); // i-frames vs a cloud
export const CLOUD_TICKS = Math.round(4 * TICK_HZ); // a cursed pot emits motes for ~4s
export const CLOUD_ATTACH_TICKS = Math.round(2.5 * TICK_HZ); // emits from the player ~2.5s after a touch
export const CURSE_PARTICLE_TICKS = Math.round(0.6 * TICK_HZ); // each emitted mote lives ~0.6s
export const CURSE_EMIT_PER_TICK = 2; // motes spawned per tick while the emitter is active
export const POPUP_TICKS = Math.round(1.1 * TICK_HZ); // floating +/- arithmetic lifetime

export const CURSE_START_TICKS = CURSE_START_SECONDS * TICK_HZ;
export const COIN_TICKS = COIN_SECONDS * TICK_HZ;
export const CURSE_HIT_TICKS = CURSE_HIT_SECONDS * TICK_HZ;

// Cursed-energy cloud hitbox (px), centered on the broken pot's floor cell.
export const CLOUD_W = 22;
export const CLOUD_H = 18;

// --- Death-bar geometry (px) ---
// The bar shows progress TOWARD death: empty when time is fat, full at death.
// Two zones meet at the 2-minute seam, and the rate of change is continuous
// across it (C¹) so the bar never visibly jumps speed:
//   t <= 120s: fill = TAIL_PX + (120 - t)          -> linear, exactly 1px/sec
//   t  > 120s: fill = TAIL_PX * exp(-(t-120)/TAIL_PX)
// At t=120 both give TAIL_PX (continuous) and both have slope -1px/sec (the
// exponential's derivative is -e^0 = -1 there), then it eases toward 0 as time
// grows. The exponential decouples tail height from the rate-match, so TAIL_PX
// is free to size the bar (it doubles as the decay time-constant τ in seconds).
export const DANGER_SECONDS = 120; // the final two minutes fill linearly
export const DANGER_PX = 120; // => 1px per second across the danger zone
export const TAIL_PX = 30; // "fat time" tail height (and τ ≈ 30s decay)
export const BAR_PX = DANGER_PX + TAIL_PX; // total fillable height; full = dead

// Progress-toward-death in pixels for a given time remaining (seconds).
export function barFill(secondsLeft: number): number {
  if (secondsLeft <= 0) return BAR_PX;
  if (secondsLeft <= DANGER_SECONDS) {
    return TAIL_PX + (DANGER_SECONDS - secondsLeft);
  }
  return TAIL_PX * Math.exp(-(secondsLeft - DANGER_SECONDS) / TAIL_PX);
}

// --- Curse palette ---
export type RGB = [number, number, number];
const CURSE_PURPLE: RGB = [201, 160, 255]; // #c9a0ff (matches game.ts cutscene)
const CURSE_RED: RGB = [224, 80, 106]; // #e0506a

// Sample the curse ramp at p in [0,1]: medium-bright purple (safe) -> black
// (mid danger) -> saturated red (at death's door). p is typically fill/BAR_PX.
export function curseRamp(p: number): RGB {
  const t = p < 0 ? 0 : p > 1 ? 1 : p;
  if (t < 0.5) {
    const k = 1 - t / 0.5; // 1 -> 0 across the first half
    return [CURSE_PURPLE[0] * k, CURSE_PURPLE[1] * k, CURSE_PURPLE[2] * k];
  }
  const k = (t - 0.5) / 0.5; // 0 -> 1 across the second half
  return [CURSE_RED[0] * k, CURSE_RED[1] * k, CURSE_RED[2] * k];
}

// Discrete cursed-energy palette indexed by OVERLAP DENSITY (not interpolated,
// so the cloud reads as crunchy bands): faint thin edges are purple, the medium
// mid-band goes near-black, and the dense overlapping core saturates to red.
// Purple and red sit two bands apart with black between, so an edge-dither of
// at most one band never puts purple directly against red.
export const CURSE_PALETTE: RGB[] = [
  [170, 88, 255], // 0 — faint edge: bright purple
  [120, 50, 205], // 1 — purple
  [30, 6, 10], // 2 — deep red-black (darkest)
  [34, 16, 52], // 3 — mid: deep violet-black
  [188, 48, 66], // 4 — red
  [72, 18, 24], // 5 — deep red-black (lighter than band 2)
  [255, 96, 96], // 6 — dense core: hot red
];

// Snap a channel value to `levels` evenly-spaced steps — the limited-palette
// "pixel crunch". Used both directly on ramp colors and per-pixel over a region.
export function quantize(v: number, levels: number): number {
  const step = 255 / (levels - 1);
  return Math.round(Math.round(v / step) * step);
}

// crunch an RGB triple to a small palette, returning a css color string.
export function crunchColor(rgb: RGB, levels: number): string {
  return `rgb(${quantize(rgb[0], levels)},${quantize(rgb[1], levels)},${quantize(rgb[2], levels)})`;
}

// Posterize a rectangular region of an ImageData in place (RGB only; alpha is
// left untouched). The crunchy NES-palette pass over the additive curse layer.
// Mirrors the getImageData/putImageData approach lighting.ts already uses.
export function quantizeRegion(
  img: ImageData,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  levels: number,
): void {
  const { data, width, height } = img;
  const lx = Math.max(0, Math.floor(x0));
  const ly = Math.max(0, Math.floor(y0));
  const hx = Math.min(width, Math.ceil(x1));
  const hy = Math.min(height, Math.ceil(y1));
  const step = 255 / (levels - 1);
  for (let y = ly; y < hy; y++) {
    let i = (y * width + lx) * 4;
    for (let x = lx; x < hx; x++) {
      data[i] = Math.round(Math.round(data[i] / step) * step);
      data[i + 1] = Math.round(Math.round(data[i + 1] / step) * step);
      data[i + 2] = Math.round(Math.round(data[i + 2] / step) * step);
      i += 4;
    }
  }
}

// Deterministic 0..1 hash for particle/ember jitter — keeps the curse visuals
// stable across frame dumps and replays (no Math.random in the look).
export function hash01(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

// M:SS for the HUD readout. Ceil so it reads 0:01 until the clock is truly out.
export function formatClock(secondsLeft: number): string {
  const s = Math.max(0, Math.ceil(secondsLeft));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${ss < 10 ? "0" : ""}${ss}`;
}
