import { TILE, GRID_W, GRID_H, VIEW_W, VIEW_H } from "./config";

// Tile-based lighting. The approved art ships pre-darkened tile variants
// (base / "Dark" / "Very Dark"); measuring them showed the darkening is a
// per-channel affine ramp with clamp at black:
//
//   out = clamp(gain * base - floor, 0, 255)
//
// gain scales everything down (a multiply), and the small subtractive floor
// crushes shadow pixels to pure black first, so at the darkest only the
// highlights still draw — matching the mockups (mean abs error ~1-3.5/255).
//
// We reproduce that at runtime instead of swapping art: a light level in [0,1]
// drives the operator. Two sampling modes:
//   - "tile": one light level per tile (blocky, exactly how the art was
//     authored — whole tiles step between base/Dark/Very Dark).
//   - "pixel": the light level is evaluated per pixel for a smooth gradient.
export type LightMode = "tile" | "pixel";

// L (brightness) -> operator params, ordered bright -> dark. L=0.66 lands on the
// best-fit params for the authored "Dark" stop. The darkest stop (L=0.33) is
// tuned to darken less (higher gain) and subtract more (higher floor) than the
// raw "Very Dark" fit (which was gain 0.16 / floor 20), so shadows still crush
// to black but highlights survive instead of the whole tile going black.
const KEYFRAMES: { l: number; gain: number; floor: number }[] = [
  { l: 1.0, gain: 1.0, floor: 0 },
  { l: 0.66, gain: 0.6, floor: 18 },
  { l: 0.33, gain: 0.45, floor: 55 },
  { l: 0.0, gain: 0.0, floor: 0 },
];

// Non-linear ("plateau") response: light snaps toward these three authored
// levels and only transitions quickly through a narrow band between adjacent
// plateaus, rather than ramping linearly across the whole range.
const PLATEAUS = [0.33, 0.66, 1.0]; // very dark, dark, normal (ascending)
const PLATEAU_BAND = 0.18; // half-width of the quick transition (in segment t)

const LUT_N = 256; // light-level -> params lookup resolution

// Default ambient light level for unlit areas (no source nearby).
export const AMBIENT = 0.12;

// Floor on the light level the operator ever sees. Below this, tiles would ramp
// toward pure black and lose the highlights the authored Dark/Very Dark art
// keeps. Clamping here guarantees the darkest areas still use a
// highlight-preserving stop instead of crushing to black.
export const MIN_LIGHT = 0.4;

interface Source {
  x: number;
  y: number;
  fullR: number; // fully-lit radius
  fadeR: number; // light fades to nothing (down to ambient) by here
}

export class Lighting {
  // Per-tile light level in [0,1], row-major like Level.tiles (tile mode).
  private readonly light = new Float32Array(GRID_W * GRID_H);
  private readonly gain = new Float32Array(GRID_W * GRID_H);
  private readonly floor = new Float32Array(GRID_W * GRID_H);

  // L -> (gain, floor) lookups, sampled once. The "nl" pair folds in the
  // plateau remap so the inner loops stay a single array read either way.
  private readonly gainLut = new Float32Array(LUT_N + 1);
  private readonly floorLut = new Float32Array(LUT_N + 1);
  private readonly gainLutNL = new Float32Array(LUT_N + 1);
  private readonly floorLutNL = new Float32Array(LUT_N + 1);

  // Active light sources this frame (player torch + statues). Combined by max.
  private readonly sources: Source[] = [];
  private ambient = AMBIENT;

  constructor() {
    for (let i = 0; i <= LUT_N; i++) {
      const raw = i / LUT_N;
      // Clamp to MIN_LIGHT so any light level below the darkest stop renders
      // with that stop's params instead of ramping toward black. For the
      // plateau (nonlinear) pair, clamp AFTER the snap so the plateau response
      // can't drop a level back below MIN_LIGHT — keeping both modes' floor
      // identical.
      const p = paramsFor(Math.max(MIN_LIGHT, raw));
      this.gainLut[i] = p.gain;
      this.floorLut[i] = p.floor;
      const pnl = paramsFor(Math.max(MIN_LIGHT, plateau(raw)));
      this.gainLutNL[i] = pnl.gain;
      this.floorLutNL[i] = pnl.floor;
    }
  }

  // Begin a frame: reset to a flat ambient with no sources.
  clear(ambient = AMBIENT): void {
    this.ambient = ambient;
    this.light.fill(ambient);
    this.sources.length = 0;
  }

  // Add a radial light source. Bakes into the per-tile map (combined by max)
  // for tile mode and records the source for per-pixel mode.
  addLight(px: number, py: number, fullR = 40, fadeR = 150): void {
    this.sources.push({ x: px, y: py, fullR, fadeR });
    for (let ty = 0; ty < GRID_H; ty++) {
      for (let tx = 0; tx < GRID_W; tx++) {
        const cx = tx * TILE + TILE / 2;
        const cy = ty * TILE + TILE / 2;
        const c = contribution(Math.hypot(cx - px, cy - py), fullR, fadeR);
        const idx = ty * GRID_W + tx;
        if (c > this.light[idx]) this.light[idx] = c;
      }
    }
  }

  // Run the darkening operator over the whole frame buffer in place.
  // nonlinear=true uses the plateau response (snap to normal/Dark/Very Dark).
  apply(
    ctx: OffscreenCanvasRenderingContext2D,
    mode: LightMode,
    nonlinear: boolean,
  ): void {
    const gainLut = nonlinear ? this.gainLutNL : this.gainLut;
    const floorLut = nonlinear ? this.floorLutNL : this.floorLut;
    const img = ctx.getImageData(0, 0, VIEW_W, VIEW_H);
    const d = img.data;
    if (mode === "tile") {
      this.applyTile(d, gainLut, floorLut);
    } else {
      this.applyPixel(d, gainLut, floorLut);
    }
    ctx.putImageData(img, 0, 0);
  }

  private applyTile(
    d: Uint8ClampedArray,
    gainLut: Float32Array,
    floorLut: Float32Array,
  ): void {
    const n = GRID_W * GRID_H;
    for (let t = 0; t < n; t++) {
      const idx = (this.light[t] * LUT_N) | 0;
      this.gain[t] = gainLut[idx];
      this.floor[t] = floorLut[idx];
    }
    for (let y = 0; y < VIEW_H; y++) {
      const row = ((y / TILE) | 0) * GRID_W;
      let i = y * VIEW_W * 4;
      for (let x = 0; x < VIEW_W; x++, i += 4) {
        const t = row + ((x / TILE) | 0);
        const g = this.gain[t];
        const f = this.floor[t];
        d[i] = clamp(g * d[i] - f);
        d[i + 1] = clamp(g * d[i + 1] - f);
        d[i + 2] = clamp(g * d[i + 2] - f);
      }
    }
  }

  private applyPixel(
    d: Uint8ClampedArray,
    gainLut: Float32Array,
    floorLut: Float32Array,
  ): void {
    const sources = this.sources;
    for (let y = 0; y < VIEW_H; y++) {
      let i = y * VIEW_W * 4;
      for (let x = 0; x < VIEW_W; x++, i += 4) {
        // Combine every source by max, never below ambient.
        let l = this.ambient;
        for (let s = 0; s < sources.length; s++) {
          const src = sources[s];
          const dx = x - src.x;
          const dy = y - src.y;
          const c = contribution(Math.sqrt(dx * dx + dy * dy), src.fullR, src.fadeR);
          if (c > l) l = c;
        }
        const idx = (l * LUT_N) | 0;
        const g = gainLut[idx];
        const f = floorLut[idx];
        d[i] = clamp(g * d[i] - f);
        d[i + 1] = clamp(g * d[i + 1] - f);
        d[i + 2] = clamp(g * d[i + 2] - f);
      }
    }
  }
}

// A source's light contribution at distance d: 1 inside fullR, ramping down to
// 0 by fadeR. Sources are combined by max and floored at the ambient level.
function contribution(d: number, fullR: number, fadeR: number): number {
  if (d <= fullR) return 1;
  if (d >= fadeR) return 0;
  return 1 - (d - fullR) / (fadeR - fullR);
}

function paramsFor(l: number): { gain: number; floor: number } {
  if (l >= 1) return { gain: 1, floor: 0 };
  if (l <= 0) return { gain: 0, floor: 0 };
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    const hi = KEYFRAMES[i];
    const lo = KEYFRAMES[i + 1];
    if (l <= hi.l && l >= lo.l) {
      const t = (l - lo.l) / (hi.l - lo.l);
      return {
        gain: lo.gain + (hi.gain - lo.gain) * t,
        floor: lo.floor + (hi.floor - lo.floor) * t,
      };
    }
  }
  return { gain: 0, floor: 0 };
}

// Remap a continuous light level toward the nearest plateau, transitioning
// quickly only through a narrow band between adjacent plateaus. Below the
// lowest plateau clamps to it; above the highest clamps to it.
function plateau(l: number): number {
  if (l <= PLATEAUS[0]) return PLATEAUS[0];
  if (l >= PLATEAUS[PLATEAUS.length - 1]) return PLATEAUS[PLATEAUS.length - 1];
  for (let i = 0; i < PLATEAUS.length - 1; i++) {
    const a = PLATEAUS[i];
    const b = PLATEAUS[i + 1];
    if (l >= a && l <= b) {
      const t = (l - a) / (b - a); // 0 at a, 1 at b
      // Flat near the plateaus, a quick smoothstep across the middle band.
      const s = smoothstep(0.5 - PLATEAU_BAND, 0.5 + PLATEAU_BAND, t);
      return a + (b - a) * s;
    }
  }
  return l;
}

function smoothstep(e0: number, e1: number, x: number): number {
  let u = (x - e0) / (e1 - e0);
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  return u * u * (3 - 2 * u);
}

function clamp(v: number): number {
  if (v <= 0) return 0;
  if (v >= 255) return 255;
  return v;
}
