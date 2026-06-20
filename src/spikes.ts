import { TILE } from "./config";
import { SpikeDir, SpikeSegment } from "./level";
import { Art } from "./art";
import { Sprite } from "./sprite";

// Hazard strip depth in source pixels (each spike sprite is 16×16).
const STRIP_DEPTH = 8;

export const SPIKE_SCALE = 0.3;
/** Cross (pointing) axis stretch: 75% taller than the along-edge width. */
export const SPIKE_CROSS_ASPECT = 1.75;

interface StripCrop {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

function stripCrop(dir: SpikeDir): StripCrop {
  switch (dir) {
    case "up":
      return { sx: 0, sy: TILE - STRIP_DEPTH, sw: TILE, sh: STRIP_DEPTH };
    case "down":
      return { sx: 0, sy: 0, sw: TILE, sh: STRIP_DEPTH };
    case "left":
      return { sx: TILE - STRIP_DEPTH, sy: 0, sw: STRIP_DEPTH, sh: TILE };
    case "right":
      return { sx: 0, sy: 0, sw: STRIP_DEPTH, sh: TILE };
  }
}

function spikeSprite(art: Art, dir: SpikeDir): Sprite {
  return art.spike[dir];
}

function blitStrip(
  ctx: OffscreenCanvasRenderingContext2D,
  sprite: Sprite,
  dir: SpikeDir,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  const crop = stripCrop(dir);
  sprite.blit(0, crop.sx, crop.sy, crop.sw, crop.sh, dx, dy, dw, dh, ctx);
}

function clusterDims(
  dir: SpikeDir,
  scale: number,
  crossAspect: number,
): { along: number; cross: number; dw: number; dh: number } {
  const crop = stripCrop(dir);
  const horizontal = dir === "up" || dir === "down";
  const along = (horizontal ? crop.sw : crop.sh) * scale;
  const cross = (horizontal ? crop.sh : crop.sw) * scale * crossAspect;
  return {
    along,
    cross,
    dw: horizontal ? along : cross,
    dh: horizontal ? cross : along,
  };
}

function edgeLayout(
  seg: SpikeSegment,
  scale: number,
  crossAspect: number,
): { origin: number; clusterAlong: number; repeats: number; cross: number } | null {
  const { along, cross } = clusterDims(seg.dir, scale, crossAspect);
  if (along <= 0) return null;

  // Fit as many clusters as the full edge allows; leftover px split evenly as
  // end padding (keeps spikes out of corners without shrinking the count).
  const repeats = Math.max(1, Math.floor(TILE / along));
  const totalSpan = repeats * along;
  const origin = (TILE - totalSpan) / 2;
  return { origin, clusterAlong: along, repeats, cross };
}

export function drawSpikeSegment(
  ctx: OffscreenCanvasRenderingContext2D,
  art: Art,
  seg: SpikeSegment,
  scale: number,
  crossAspect: number,
): void {
  const layout = edgeLayout(seg, scale, crossAspect);
  if (!layout) return;

  const sprite = spikeSprite(art, seg.dir);
  const { dw, dh } = clusterDims(seg.dir, scale, crossAspect);
  const tileX = seg.tx * TILE;
  const tileY = seg.ty * TILE;
  const { origin, clusterAlong, repeats } = layout;

  for (let i = 0; i < repeats; i++) {
    const tOff = origin + i * clusterAlong;
    let dx: number;
    let dy: number;
    switch (seg.dir) {
      case "up":
        dx = tileX + tOff + (clusterAlong - dw) / 2;
        dy = tileY + TILE - dh;
        break;
      case "down":
        dx = tileX + tOff + (clusterAlong - dw) / 2;
        dy = tileY;
        break;
      case "left":
        dx = tileX + TILE - dw;
        dy = tileY + tOff + (clusterAlong - dh) / 2;
        break;
      case "right":
        dx = tileX;
        dy = tileY + tOff + (clusterAlong - dh) / 2;
        break;
    }
    blitStrip(ctx, sprite, seg.dir, dx, dy, dw, dh);
  }
}

export interface SpikeHitbox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function spikeHitboxes(
  seg: SpikeSegment,
  scale: number,
  crossAspect: number,
): SpikeHitbox[] {
  const layout = edgeLayout(seg, scale, crossAspect);
  if (!layout) return [];

  const depth = layout.cross;
  const tileX = seg.tx * TILE;
  const tileY = seg.ty * TILE;
  const { origin, clusterAlong, repeats } = layout;
  const boxes: SpikeHitbox[] = [];

  for (let i = 0; i < repeats; i++) {
    const tOff = origin + i * clusterAlong;
    switch (seg.dir) {
      case "up":
        boxes.push({
          x: tileX + tOff,
          y: tileY + TILE - depth,
          w: clusterAlong,
          h: depth,
        });
        break;
      case "down":
        boxes.push({
          x: tileX + tOff,
          y: tileY,
          w: clusterAlong,
          h: depth,
        });
        break;
      case "left":
        boxes.push({
          x: tileX + TILE - depth,
          y: tileY + tOff,
          w: depth,
          h: clusterAlong,
        });
        break;
      case "right":
        boxes.push({
          x: tileX,
          y: tileY + tOff,
          w: depth,
          h: clusterAlong,
        });
        break;
    }
  }

  return boxes;
}
