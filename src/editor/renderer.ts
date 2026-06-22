import { GRID_W, GRID_H, TILE, VIEW_W, VIEW_H } from "../config";
import type { Art } from "../art";
import type { EditorModel } from "./model";
import { BG, ENEMY_CHARS, SPAWNER_ABLE_CHARS } from "./types";

// Integer on-screen scale: each 16px tile is drawn at TILE*ZOOM px. The level
// is rendered into a native 448x336 buffer (identical coords to the game) then
// blitted up nearest-neighbor, so all the game's anchor math is reused verbatim.
export const ZOOM = 2;

export interface Cell {
  tx: number;
  ty: number;
}

export class EditorRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly buffer: OffscreenCanvas;
  private readonly bctx: OffscreenCanvasRenderingContext2D;
  private readonly art: Art;
  // Spawner landmark monuments (grayscale), one per enemy kind char (used to
  // draw spawner-flagged cells).
  private readonly statues: Record<string, OffscreenCanvas>;

  constructor(canvas: HTMLCanvasElement, art: Art) {
    this.canvas = canvas;
    this.art = art;
    canvas.width = VIEW_W * ZOOM;
    canvas.height = VIEW_H * ZOOM;
    this.ctx = canvas.getContext("2d")!;
    this.buffer = new OffscreenCanvas(VIEW_W, VIEW_H);
    this.bctx = this.buffer.getContext("2d")!;
    const statueOf = (s: typeof art.troll) => s.statue(s.lastFrame, 0.5);
    this.statues = {
      s: statueOf(art.snake),
      t: statueOf(art.troll),
      m: statueOf(art.smallTroll.walk),
      f: statueOf(art.frog.still),
      c: statueOf(art.cannonIdle),
      a: statueOf(art.smallBat.fly),
      A: statueOf(art.largeBat.fly),
    };
  }

  get cellPx(): number {
    return TILE * ZOOM;
  }

  // Map a client (mouse) coordinate to a grid cell, or null if outside.
  cellAt(clientX: number, clientY: number): Cell | null {
    const rect = this.canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * (this.canvas.width / rect.width);
    const py = (clientY - rect.top) * (this.canvas.height / rect.height);
    const tx = Math.floor(px / this.cellPx);
    const ty = Math.floor(py / this.cellPx);
    if (tx < 0 || tx >= GRID_W || ty < 0 || ty >= GRID_H) return null;
    return { tx, ty };
  }

  render(model: EditorModel): void {
    const b = this.bctx;
    b.fillStyle = "#0d0a14";
    b.fillRect(0, 0, VIEW_W, VIEW_H);

    for (let ty = 0; ty < GRID_H; ty++) {
      for (let tx = 0; tx < GRID_W; tx++) {
        const ch = model.cells[ty * GRID_W + tx];
        this.drawCell(ch, tx, ty, this.flipOf(model, ch, tx, ty), model.spawnerOf(tx, ty));
      }
    }

    // Floating (lifted) block, drawn translucent at its live offset.
    const f = model.floating;
    if (f) {
      b.globalAlpha = 0.6;
      for (let ry = 0; ry < f.h; ry++) {
        for (let rx = 0; rx < f.w; rx++) {
          const ch = f.chars[ry * f.w + rx];
          if (ch === BG) continue;
          const m = f.metas[ry * f.w + rx];
          const flip = ENEMY_CHARS.has(ch) && (m?.facing ?? "left") === "left";
          this.drawCell(ch, f.ox + rx, f.oy + ry, flip, m?.spawner === true);
        }
      }
      b.globalAlpha = 1;
    }

    // Blit native buffer to the visible canvas at integer scale.
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(this.buffer, 0, 0, this.canvas.width, this.canvas.height);

    // Screen-space overlays.
    this.drawGrid();
    this.drawFacingArrows(model);
    this.drawSelection(model);
    this.drawValidation(model);
  }

  private flipOf(model: EditorModel, ch: string, tx: number, ty: number): boolean {
    if (!ENEMY_CHARS.has(ch)) return false;
    // Engine convention: flip when facing left (the sprite default, facing -1).
    return (model.facingOf(tx, ty) ?? "left") === "left";
  }

  // Draw one cell into the native buffer using the same art + anchors as the
  // game's renderer.
  private drawCell(ch: string, tx: number, ty: number, flip: boolean, spawner: boolean): void {
    const b = this.bctx;
    const px = tx * TILE;
    const py = ty * TILE;
    const cx = px + TILE / 2;
    const bottom = py + TILE; // bottom-center anchor row
    // Spawner-flagged enemy cells render as their kind's grayscale monument
    // (matching the game's spawner landmark) instead of the live sprite.
    if (spawner && SPAWNER_ABLE_CHARS.has(ch)) {
      const statue = this.statues[ch];
      b.drawImage(statue, Math.round(cx - statue.width / 2), bottom - statue.height);
      return;
    }
    switch (ch) {
      case "#":
        b.drawImage(this.art.solid, px, py);
        break;
      case "H":
        b.drawImage(this.art.ladder, px, py);
        break;
      case "-":
        b.drawImage(this.art.platform, px, py);
        break;
      case "E":
        this.art.exit.draw(b, 0, cx, bottom, false);
        break;
      case "P":
        this.art.player.still.draw(b, 0, cx, bottom, false);
        break;
      case "s":
        this.art.snake.draw(b, 0, cx, bottom, flip);
        break;
      case "t":
        this.art.troll.draw(b, 0, cx, bottom, flip);
        break;
      case "m":
        this.art.smallTroll.walk.draw(b, 0, cx, bottom, flip);
        break;
      case "f":
        this.art.frog.still.draw(b, 0, cx, bottom, flip);
        break;
      case "c":
        this.art.cannonIdle.draw(b, 0, cx, bottom, flip);
        break;
      case "a":
        this.art.smallBat.sleep.draw(b, 0, cx, bottom, flip);
        break;
      case "A":
        this.art.largeBat.fly.draw(b, 0, cx, bottom, flip);
        break;
      case "*":
        this.art.hook.drawCentered(b, 0, cx, py + TILE / 2);
        break;
      case "L":
        this.art.lightStatueOff.draw(b, 0, cx, bottom, false);
        break;
      case "G":
        b.drawImage(this.art.glass, px, py);
        break;
      case "^":
        this.art.spike.up.drawCentered(b, 0, cx, py + TILE / 2);
        break;
      case "$":
        this.art.smallPot.draw(b, 0, cx, bottom, false);
        break;
      case "@":
        this.art.tallPot.draw(b, 0, cx, bottom, false);
        break;
      case "o":
        this.art.bounceOnion.still.draw(b, 0, cx, bottom, false);
        break;
      case "O":
        this.art.explosiveBounceOnion.still.draw(b, 0, cx, bottom, false);
        break;
      default:
        break; // background / unknown: nothing
    }
  }

  private drawGrid(): void {
    const ctx = this.ctx;
    const s = this.cellPx;
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= GRID_W; x++) {
      ctx.moveTo(x * s + 0.5, 0);
      ctx.lineTo(x * s + 0.5, GRID_H * s);
    }
    for (let y = 0; y <= GRID_H; y++) {
      ctx.moveTo(0, y * s + 0.5);
      ctx.lineTo(GRID_W * s, y * s + 0.5);
    }
    ctx.stroke();
  }

  private drawFacingArrows(model: EditorModel): void {
    const ctx = this.ctx;
    const s = this.cellPx;
    ctx.fillStyle = "rgba(255,220,90,0.9)";
    for (let ty = 0; ty < GRID_H; ty++) {
      for (let tx = 0; tx < GRID_W; tx++) {
        const ch = model.cells[ty * GRID_W + tx];
        if (!ENEMY_CHARS.has(ch)) continue;
        const right = (model.facingOf(tx, ty) ?? "left") === "right";
        const midY = ty * s + s / 2;
        const x = tx * s + (right ? s - 5 : 5);
        const dir = right ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(x, midY - 4);
        ctx.lineTo(x + dir * 5, midY);
        ctx.lineTo(x, midY + 4);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  private drawSelection(model: EditorModel): void {
    const ctx = this.ctx;
    const s = this.cellPx;
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 2;
    if (model.selection) {
      const { x0, y0, x1, y1 } = model.selection;
      ctx.strokeStyle = "rgba(150,200,255,0.95)";
      ctx.strokeRect(x0 * s, y0 * s, (x1 - x0 + 1) * s, (y1 - y0 + 1) * s);
    }
    const f = model.floating;
    if (f) {
      ctx.strokeStyle = "rgba(150,255,180,0.95)";
      ctx.strokeRect(f.ox * s, f.oy * s, f.w * s, f.h * s);
    }
    ctx.restore();
  }

  // Tint player-spawn cells red when the count is invalid (0 or >1).
  private drawValidation(model: EditorModel): void {
    if (model.count("P") === 1) return;
    const ctx = this.ctx;
    const s = this.cellPx;
    ctx.fillStyle = "rgba(255,60,60,0.35)";
    for (let ty = 0; ty < GRID_H; ty++) {
      for (let tx = 0; tx < GRID_W; tx++) {
        if (model.cells[ty * GRID_W + tx] === "P") {
          ctx.fillRect(tx * s, ty * s, s, s);
        }
      }
    }
  }
}
