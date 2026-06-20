// Minimal canvas text for the intro / tutorial (no bitmap font yet — design
// doc defers that). Draws with the monospace family at a pixel size; it's a
// touch soft when the 448x336 buffer is scaled up, which is fine for the intro
// chrome. Coordinates are in buffer (logical) pixels.
type Ctx = OffscreenCanvasRenderingContext2D;

export interface TextOpts {
  size?: number; // px
  bold?: boolean;
  color?: string;
  shadow?: string; // 1px drop shadow color, if set
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  alpha?: number; // 0..1
}

export function drawText(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  opts: TextOpts = {},
): void {
  const size = opts.size ?? 16;
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.font = `${opts.bold ? "bold " : ""}${size}px "Courier New", monospace`;
  ctx.textAlign = opts.align ?? "center";
  ctx.textBaseline = opts.baseline ?? "middle";
  if (opts.shadow) {
    ctx.fillStyle = opts.shadow;
    ctx.fillText(text, x + 1, y + 1);
  }
  ctx.fillStyle = opts.color ?? "#ffffff";
  ctx.fillText(text, x, y);
  ctx.restore();
}
