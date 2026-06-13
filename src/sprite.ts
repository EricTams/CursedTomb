import { TICK_MS } from "./config";

// Aseprite spritesheet export: a PNG strip plus a JSON array of frame rects
// with per-frame durations in milliseconds.
export interface AsepriteFrame {
  frame: { x: number; y: number; w: number; h: number };
  duration: number;
}

export interface AsepriteSheet {
  frames: AsepriteFrame[];
}

interface Frame {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  ticks: number; // duration converted to 60Hz ticks (min 1)
  // Opaque content bounds within the frame (rows), measured at load. The
  // Aseprite canvases are padded, and the padding is asymmetric — anchoring
  // on the canvas instead of the content made flipped sprites float.
  cy0: number; // first opaque row
  cy1: number; // last opaque row
}

// An animated sprite drawn with a bottom-center anchor. The Aseprite frames
// are padded canvases (e.g. 48x32 with an ~18px-wide creature inside), but
// the content is horizontally centered and bottom-aligned in every sheet we
// use, so anchoring the frame's bottom-center on the entity's AABB
// bottom-center lines the art up without per-frame trim data.
export class Sprite {
  private readonly frames: Frame[];
  private readonly totalTicks: number;

  constructor(
    private readonly image: HTMLImageElement,
    sheet: AsepriteSheet,
  ) {
    // One read of the sheet's pixels to find each frame's opaque row bounds.
    const probe = new OffscreenCanvas(image.width, image.height);
    const pctx = probe.getContext("2d")!;
    pctx.drawImage(image, 0, 0);
    const pixels = pctx.getImageData(0, 0, image.width, image.height).data;

    this.frames = sheet.frames.map((f) => {
      const { x, y, w, h } = f.frame;
      let cy0 = 0;
      let cy1 = h - 1;
      scanTop: for (; cy0 < h; cy0++) {
        for (let px = 0; px < w; px++) {
          if (pixels[((y + cy0) * image.width + x + px) * 4 + 3] > 0) break scanTop;
        }
      }
      scanBottom: for (; cy1 > cy0; cy1--) {
        for (let px = 0; px < w; px++) {
          if (pixels[((y + cy1) * image.width + x + px) * 4 + 3] > 0) break scanBottom;
        }
      }
      if (cy0 >= h) {
        cy0 = 0;
        cy1 = h - 1; // fully transparent frame: fall back to the canvas box
      }
      return {
        sx: x,
        sy: y,
        sw: w,
        sh: h,
        ticks: Math.max(1, Math.round(f.duration / TICK_MS)),
        cy0,
        cy1,
      };
    });
    this.totalTicks = this.frames.reduce((sum, f) => sum + f.ticks, 0);
  }

  get frameCount(): number {
    return this.frames.length;
  }

  // Frame index for a looping animation at the given tick count.
  frameAt(tick: number): number {
    let t = tick % this.totalTicks;
    for (let i = 0; i < this.frames.length; i++) {
      if (t < this.frames[i].ticks) return i;
      t -= this.frames[i].ticks;
    }
    return this.frames.length - 1;
  }

  // Frame index for a play-once animation: runs through, holds the last frame
  // (used for transitions like the Plant Box settling into its sit pose).
  frameAtOnce(tick: number): number {
    let t = tick;
    for (let i = 0; i < this.frames.length; i++) {
      if (t < this.frames[i].ticks) return i;
      t -= this.frames[i].ticks;
    }
    return this.frames.length - 1;
  }

  // A static "statue" of one frame: grayscale, scaled to the given
  // brightness. Used for spawners — the monster's monument on the background
  // layer (design doc §5: spawner = landmark, visually matched to its enemy).
  statue(frameIndex: number, brightness: number): OffscreenCanvas {
    const f = this.frames[frameIndex];
    const canvas = new OffscreenCanvas(f.sw, f.sh);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(this.image, f.sx, f.sy, f.sw, f.sh, 0, 0, f.sw, f.sh);
    const img = ctx.getImageData(0, 0, f.sw, f.sh);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const gray =
        (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) * brightness;
      d[i] = d[i + 1] = d[i + 2] = gray;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  get lastFrame(): number {
    return this.frames.length - 1;
  }

  // Total loop length in ticks — handy for sizing one-shot effects.
  get durationTicks(): number {
    return this.totalTicks;
  }

  // Draw a frame centered on (cx, cy). Used for projectiles and burst effects
  // where bottom-center anchoring doesn't apply.
  drawCentered(
    ctx: OffscreenCanvasRenderingContext2D,
    frameIndex: number,
    cx: number,
    cy: number,
    flip = false,
  ): void {
    const f = this.frames[frameIndex];
    const dx = Math.round(cx - f.sw / 2);
    const dy = Math.round(cy - f.sh / 2);
    if (!flip) {
      ctx.drawImage(this.image, f.sx, f.sy, f.sw, f.sh, dx, dy, f.sw, f.sh);
      return;
    }
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(this.image, f.sx, f.sy, f.sw, f.sh, -dx - f.sw, dy, f.sw, f.sh);
    ctx.restore();
  }

  // Draw a frame with its bottom-center at (anchorX, anchorY).
  // flip=true mirrors horizontally around the anchor.
  // scaleY squashes the sprite vertically toward the anchor; negative values
  // draw it upside down (the stunned knock-over), still resting on the anchor.
  draw(
    ctx: OffscreenCanvasRenderingContext2D,
    frameIndex: number,
    anchorX: number,
    anchorY: number,
    flip = false,
    scaleY = 1,
  ): void {
    const f = this.frames[frameIndex];
    const s = Math.abs(scaleY);
    const h = Math.round(f.sh * s);
    if (h === 0) return; // fully squashed mid-flip: nothing to draw
    const dx = Math.round(anchorX - f.sw / 2);
    // Rest the opaque CONTENT (not the padded canvas) on the anchor. When
    // flipped, the content's top edge becomes its lowest row, so the offset
    // is measured from the opposite side of the canvas.
    const dy =
      scaleY >= 0
        ? Math.round(anchorY - (f.cy1 + 1) * s)
        : Math.round(anchorY - (f.sh - f.cy0) * s);
    const fx = flip ? -1 : 1;
    const fy = scaleY < 0 ? -1 : 1;
    if (fx === 1 && fy === 1) {
      ctx.drawImage(this.image, f.sx, f.sy, f.sw, f.sh, dx, dy, f.sw, h);
      return;
    }
    ctx.save();
    ctx.scale(fx, fy);
    ctx.drawImage(
      this.image,
      f.sx,
      f.sy,
      f.sw,
      f.sh,
      fx === 1 ? dx : -dx - f.sw,
      fy === 1 ? dy : -dy - h,
      f.sw,
      h,
    );
    ctx.restore();
  }
}
