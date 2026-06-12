import { TILE, GRID_W, GRID_H, VIEW_W, VIEW_H, TICK_HZ } from "./config";
import { Level, Tile, parseLevel } from "./level";
import { Input } from "./input";
import { Art } from "./art";
import { Player, PLAYER_W, PLAYER_H, WHIP_RANGE } from "./player";

// Remaining placeholder colors: exit and player don't have approved art yet.
const COLORS = {
  background: "#000000",
  exit: "#c9b458",
  player: "#d96a3b",
  whip: "#d9b36a",
  cleared: "#c9b458",
};

const CLEAR_TICKS = Math.round(1.5 * TICK_HZ); // flash before auto-restart

export class Game {
  private readonly level: Level;
  private readonly player: Player;
  private clearedTimer = 0; // >0 while showing the CLEARED flash

  constructor(
    private readonly ctx: OffscreenCanvasRenderingContext2D,
    private readonly art: Art,
    private readonly input: Input,
    levelAscii: string,
  ) {
    this.level = parseLevel(levelAscii);
    this.player = new Player(this.level);
  }

  update(): void {
    this.input.poll();

    if (this.input.restartPressed) {
      this.restart();
      return;
    }

    if (this.clearedTimer > 0) {
      if (--this.clearedTimer === 0) this.restart();
      return; // freeze gameplay during the flash
    }

    this.player.update(this.input);

    if (this.touchingExit()) {
      this.clearedTimer = CLEAR_TICKS;
    }
  }

  private restart(): void {
    this.clearedTimer = 0;
    this.player.respawn();
  }

  private touchingExit(): boolean {
    const left = Math.floor(this.player.x / TILE);
    const right = Math.floor((this.player.x + PLAYER_W - 1) / TILE);
    const top = Math.floor(this.player.y / TILE);
    const bottom = Math.floor((this.player.y + PLAYER_H - 1) / TILE);
    for (let ty = top; ty <= bottom; ty++) {
      for (let tx = left; tx <= right; tx++) {
        if (this.level.isExit(tx, ty)) return true;
      }
    }
    return false;
  }

  render(alpha: number): void {
    const ctx = this.ctx;

    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    for (let ty = 0; ty < GRID_H; ty++) {
      for (let tx = 0; tx < GRID_W; tx++) {
        const tile = this.level.tileAt(tx, ty);
        if (tile === Tile.Solid) {
          ctx.drawImage(this.art.solid, tx * TILE, ty * TILE);
        } else if (tile === Tile.Ladder) {
          ctx.drawImage(this.art.ladder, tx * TILE, ty * TILE);
        } else if (tile === Tile.Platform) {
          ctx.drawImage(this.art.platform, tx * TILE, ty * TILE);
        } else if (tile === Tile.Exit) {
          // Exit art isn't approved yet; gold doorway placeholder.
          ctx.fillStyle = COLORS.exit;
          ctx.fillRect(tx * TILE + 3, ty * TILE + 2, TILE - 6, TILE - 2);
          ctx.fillStyle = COLORS.background;
          ctx.fillRect(tx * TILE + 6, ty * TILE + 6, TILE - 12, TILE - 6);
        }
      }
    }

    ctx.fillStyle = COLORS.player;
    ctx.fillRect(
      Math.round(this.player.drawX(alpha)),
      Math.round(this.player.drawY(alpha)),
      PLAYER_W,
      PLAYER_H,
    );

    this.drawWhip(alpha);

    if (this.clearedTimer > 0) {
      // Blink so the flash reads even on a short timer.
      if (Math.floor(this.clearedTimer / 8) % 2 === 0) {
        ctx.fillStyle = COLORS.cleared;
        ctx.font = "16px monospace";
        ctx.textAlign = "center";
        ctx.fillText("CLEARED", VIEW_W / 2, VIEW_H / 2);
      }
    }
  }

  // The whip renders as a straight lash with the undeployed remainder coiled
  // at the tip — the coil shrinks as it unrolls, so reach is always readable.
  private drawWhip(alpha: number): void {
    if (!this.player.whipping) return;
    const ctx = this.ctx;
    const ext = this.player.whipExtension();
    const dx = this.player.whipDirX;
    const dy = this.player.whipDirY;

    // Hand sits on the player's edge in the aim direction (top for up,
    // corner for diagonals, side at shoulder height for horizontal).
    const px = Math.round(this.player.drawX(alpha));
    const py = Math.round(this.player.drawY(alpha));
    const handX = px + PLAYER_W / 2 + (dx * PLAYER_W) / 2;
    const handY = dy < 0 ? py : py + 5;

    const tipX = handX + dx * ext * WHIP_RANGE;
    const tipY = handY + dy * ext * WHIP_RANGE;

    ctx.strokeStyle = COLORS.whip;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(handX + 0.5, handY + 0.5);
    ctx.lineTo(tipX + 0.5, tipY + 0.5);

    const rem = 1 - ext;
    if (rem > 0.05) {
      // Archimedean spiral curling forward from the tip, radius and turn
      // count shrinking with the remaining length.
      const radius = 1.5 + rem * 4.5;
      const sweep = (1 + rem * 2) * Math.PI * 2;
      const coilX = tipX + dx * radius;
      const coilY = tipY + dy * radius;
      // Outer end of the coil touches the tip; curl direction follows aim.
      const startAngle = Math.atan2(dy, dx) + Math.PI;
      const curl = dx !== 0 ? Math.sign(dx) : this.player.facing;
      const steps = 24;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const angle = startAngle + curl * t * sweep;
        const r = radius * (1 - t) + 0.3;
        ctx.lineTo(
          coilX + r * Math.cos(angle) + 0.5,
          coilY + r * Math.sin(angle) + 0.5,
        );
      }
    }
    ctx.stroke();
  }
}
