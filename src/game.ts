import { TILE, GRID_W, GRID_H, VIEW_W, VIEW_H, TICK_HZ } from "./config";
import { Level, Tile, parseLevel } from "./level";
import { Input } from "./input";
import { Art } from "./art";
import { Player, PLAYER_W, PLAYER_H } from "./player";
import { Enemy, spawnEnemies, Spawner, buildSpawners } from "./enemy";

// Remaining placeholder colors: exit and player don't have approved art yet.
const COLORS = {
  background: "#000000",
  exit: "#c9b458",
  player: "#d96a3b",
  playerDying: "#ffffff",
  whip: "#d9b36a",
  cleared: "#c9b458",
  shatter: "#e8e4d8",
};

const CLEAR_TICKS = Math.round(1.5 * TICK_HZ); // flash before auto-restart
const DEATH_TICKS = Math.round(0.8 * TICK_HZ); // touch kills: blink, then restart
const HELD_BLINK_TICKS = 1 * TICK_HZ; // held box flashes this long before waking
const STOMP_BOUNCE = -2.5;
const EFFECT_TICKS = 14;

// Effective whip lash thickness: enemy hitboxes are inflated by this much in
// the hit test so grazing the target still connects (the drawn lash is 1px,
// which felt stingy — especially against the 10px-tall Virus).
const WHIP_HIT_PAD = 4;

// Spawner statue brightnesses: dark monument normally, lit pulse while
// telegraphing a respawn.
const STATUE_DIM = 0.4;
const STATUE_LIT = 0.85;

// Carry: the held box rides just above the player's head.
const CARRY_GAP = 1;
// Throw: leaves from chest height, nudged forward so it clears the body.
const THROW_OFF_X = 8;
const THROW_OFF_Y = 10;

interface Effect {
  x: number; // center of the burst
  y: number;
  ticks: number;
}

// Eye shot: a horizontal bolt. Kills the player; stops at walls; passes
// through enemies (the Eye doesn't fear its own kin).
interface Shot {
  x: number; // center
  y: number;
  prevX: number;
  vx: number;
}

const SHOT_SPEED = 2;
const SHOT_W = 6;
const SHOT_H = 4;

export class Game {
  private readonly level: Level;
  private readonly player: Player;
  private enemies: Enemy[];
  private readonly spawners: Spawner[];
  private held: Enemy | null = null;
  private effects: Effect[] = [];
  private shots: Shot[] = [];
  private clearedTimer = 0; // >0 while showing the CLEARED flash
  private deathTimer = 0; // >0 while showing the death blink
  // Statue images for spawner landmarks (grayscale takes of the monster).
  private readonly statueDim: OffscreenCanvas;
  private readonly statueLit: OffscreenCanvas;

  constructor(
    private readonly ctx: OffscreenCanvasRenderingContext2D,
    private readonly art: Art,
    private readonly input: Input,
    levelAscii: string,
  ) {
    this.level = parseLevel(levelAscii);
    this.player = new Player(this.level);
    this.enemies = spawnEnemies(this.level);
    this.spawners = buildSpawners(this.level);
    // The statue is the monster's dormant pose, set in stone.
    this.statueDim = art.plantSit.statue(art.plantSit.lastFrame, STATUE_DIM);
    this.statueLit = art.plantSit.statue(art.plantSit.lastFrame, STATUE_LIT);
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
    if (this.deathTimer > 0) {
      if (--this.deathTimer === 0) this.restart();
      return;
    }

    this.player.update(this.input);

    // B while holding = throw (the player skipped the whip because holding
    // was set during its update, so the press is ours to consume here).
    if (this.held && this.input.bPressed) {
      this.held.throwFrom(
        this.player.x + PLAYER_W / 2 + this.player.facing * THROW_OFF_X,
        this.player.y + THROW_OFF_Y,
        this.player.facing,
      );
      this.held = null;
      this.player.holding = false;
    }

    this.updateEnemies();
    this.updateSpawners();
    this.updateShots();
    this.applyWhipHits();
    this.applyStomps();
    this.checkPlayerDeath();

    for (const fx of this.effects) fx.ticks--;
    this.effects = this.effects.filter((fx) => fx.ticks > 0);

    if (this.deathTimer === 0 && this.touchingExit()) {
      this.clearedTimer = CLEAR_TICKS;
    }
  }

  private updateEnemies(): void {
    const playerRect = {
      x: this.player.x,
      y: this.player.y,
      w: PLAYER_W,
      h: PLAYER_H,
    };
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const impact = e.update(playerRect);

      if (e === this.held) {
        e.carryAt(this.player.x + PLAYER_W / 2, this.player.y - CARRY_GAP);
        if (e.heldExpired) {
          // Wake-up while held: pops free into a brief harmless get-up.
          e.eject(this.player.facing);
          this.held = null;
          this.player.holding = false;
        }
        continue;
      }

      if (e.state === "thrown") {
        // A thrown box kills the first enemy it hits, dying with it.
        for (const other of this.enemies) {
          if (other === e || !other.alive || other.state === "held") continue;
          if (other.overlaps(e.x, e.y, e.w, e.h)) {
            this.killEnemy(other);
            this.killEnemy(e);
            break;
          }
        }
        if (e.alive && impact) this.killEnemy(e); // shattered on wall/floor
      }

      if (e.kind === "eye" && e.fired) {
        // The bolt leaves from the pupil, just clear of the hitbox.
        this.shots.push({
          x: e.shotDir === -1 ? e.x - SHOT_W / 2 : e.x + e.w + SHOT_W / 2,
          y: e.y + e.h / 2,
          prevX: e.x + e.w / 2,
          vx: e.shotDir * SHOT_SPEED,
        });
      }
    }
    this.enemies = this.enemies.filter((e) => e.alive);
  }

  private updateShots(): void {
    for (const shot of this.shots) {
      shot.prevX = shot.x;
      shot.x += shot.vx;
    }
    this.shots = this.shots.filter((shot) => {
      const tx = Math.floor((shot.x + Math.sign(shot.vx) * (SHOT_W / 2)) / TILE);
      const ty = Math.floor(shot.y / TILE);
      return !this.level.isSolid(tx, ty); // walls absorb the bolt
    });
    if (this.deathTimer > 0) return;
    for (const shot of this.shots) {
      if (
        shot.x - SHOT_W / 2 < this.player.x + PLAYER_W &&
        shot.x + SHOT_W / 2 > this.player.x &&
        shot.y - SHOT_H / 2 < this.player.y + PLAYER_H &&
        shot.y + SHOT_H / 2 > this.player.y
      ) {
        this.deathTimer = DEATH_TICKS;
        return;
      }
    }
  }

  private updateSpawners(): void {
    for (const sp of this.spawners) {
      const r = sp.tileRect;
      // Don't materialize into the player (or pointlessly into a corpse pile
      // of frame-one overlap with another enemy walking by).
      const blocked =
        this.player.x < r.x + r.w &&
        this.player.x + PLAYER_W > r.x &&
        this.player.y < r.y + r.h &&
        this.player.y + PLAYER_H > r.y;
      const born = sp.update(blocked);
      if (born) this.enemies.push(born);
    }
  }

  private applyWhipHits(): void {
    const seg = this.player.whipSegment(this.player.x, this.player.y);
    if (!seg) return;
    // Also test from the previous-tick position: a jump arc moves up to
    // 5px/tick, enough to step the once-per-tick sample over a short enemy.
    const segPrev = this.player.whipSegment(this.player.prevX, this.player.prevY);
    for (const e of this.enemies) {
      if (!e.whippable || e.lastWhipId === this.player.whipId) continue;
      const rx = e.x - WHIP_HIT_PAD;
      const ry = e.y - WHIP_HIT_PAD;
      const rw = e.w + WHIP_HIT_PAD * 2;
      const rh = e.h + WHIP_HIT_PAD * 2;
      if (
        !segmentHitsRect(seg, rx, ry, rw, rh) &&
        !(segPrev && segmentHitsRect(segPrev, rx, ry, rw, rh))
      ) {
        continue;
      }
      e.lastWhipId = this.player.whipId;

      if (e.kind === "virus" || e.kind === "eye") {
        this.killEnemy(e); // one whip hit kills (the Eye's defense is range)
      } else if (e.stunnable) {
        e.stun();
      } else if (e.state === "stunned" && !this.held) {
        e.grab(); // yank into the hands
        this.held = e;
        this.player.holding = true;
      }
    }
  }

  // Landing on a stunned enemy kills it (the whip itself never kills the
  // person tier — stomps and thrown objects do).
  private applyStomps(): void {
    const prevBottom = this.player.prevY + PLAYER_H;
    const bottom = this.player.y + PLAYER_H;
    for (const e of this.enemies) {
      if (!e.alive || e.state !== "stunned") continue;
      const overlapX =
        this.player.x < e.x + e.w && this.player.x + PLAYER_W > e.x;
      if (overlapX && prevBottom <= e.y + 3 && bottom >= e.y) {
        this.killEnemy(e);
        this.player.y = e.y - PLAYER_H;
        this.player.vy = STOMP_BOUNCE;
      }
    }
    this.enemies = this.enemies.filter((e) => e.alive);
  }

  private checkPlayerDeath(): void {
    for (const e of this.enemies) {
      if (!e.deadly) continue;
      if (e.overlaps(this.player.x, this.player.y, PLAYER_W, PLAYER_H)) {
        this.deathTimer = DEATH_TICKS;
        return;
      }
    }
  }

  private killEnemy(e: Enemy): void {
    e.kill();
    this.effects.push({ x: e.x + e.w / 2, y: e.y + e.h / 2, ticks: EFFECT_TICKS });
  }

  private restart(): void {
    this.clearedTimer = 0;
    this.deathTimer = 0;
    this.player.respawn();
    this.enemies = spawnEnemies(this.level);
    for (const sp of this.spawners) sp.reset();
    this.held = null;
    this.effects = [];
    this.shots = [];
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

    // Background layer: spawner statues sit behind every living thing.
    for (const sp of this.spawners) this.drawSpawner(sp);

    for (const e of this.enemies) {
      if (e.alive) this.drawEnemy(e, alpha);
    }

    this.drawPlayer(alpha);
    this.drawWhip(alpha);
    this.drawShots(alpha);
    this.drawEffects();

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

  private drawSpawner(sp: Spawner): void {
    // Pulse between the dim monument and the lit one while telegraphing.
    const lit = sp.flashing && Math.floor(sp.flashTicks / 6) % 2 === 0;
    const img = lit ? this.statueLit : this.statueDim;
    const r = sp.tileRect;
    this.ctx.drawImage(
      img,
      Math.round(r.x + r.w / 2 - img.width / 2),
      r.y + r.h - img.height,
    );
  }

  private drawPlayer(alpha: number): void {
    // Death blink: alternate white/normal so the kill reads instantly.
    const dying = this.deathTimer > 0;
    if (dying && Math.floor(this.deathTimer / 4) % 2 === 0) return;
    this.ctx.fillStyle = dying ? COLORS.playerDying : COLORS.player;
    this.ctx.fillRect(
      Math.round(this.player.drawX(alpha)),
      Math.round(this.player.drawY(alpha)),
      PLAYER_W,
      PLAYER_H,
    );
  }

  private drawEnemy(e: Enemy, alpha: number): void {
    // White pop the instant the whip connects: a canvas filter washes the
    // whole sprite (outlines included) to a solid silhouette for a few ticks.
    if (e.hitFlash > 0) this.ctx.filter = "brightness(0) invert(1)";
    this.drawEnemySprite(e, alpha);
    this.ctx.filter = "none";
  }

  private drawEnemySprite(e: Enemy, alpha: number): void {
    // Sprite sheets face left; flip when walking right. Anchor is the
    // bottom-center of the AABB (art canvases are padded; the sprite loader
    // measures opaque content bounds and rests the content on the anchor).
    const anchorX = e.drawX(alpha) + e.w / 2;
    const anchorY = e.drawY(alpha) + e.h;
    const flip = e.facing === 1;

    if (e.kind === "virus") {
      const s = this.art.virus;
      s.draw(this.ctx, s.frameAt(e.animTick), anchorX, anchorY, flip);
      return;
    }

    if (e.kind === "eye") {
      if (e.charging) {
        // Wind-up telegraph: locked wide open, strobing white.
        if (Math.floor(e.animTick / 4) % 2 === 0) {
          this.ctx.filter = "brightness(0) invert(1)";
        }
        this.art.eyeOpen.draw(this.ctx, 0, anchorX, anchorY, false);
        return; // drawEnemy resets the filter
      }
      // Open stare with a periodic blink (close, hold, reopen) so it reads
      // as alive while it guards the exit.
      const t = e.animTick % 240;
      let s = this.art.eyeOpen;
      if (t >= 200) {
        if (t < 208) s = this.art.eyeClosing;
        else if (t < 226) s = this.art.eyeClosed;
        else if (t < 234) s = this.art.eyeOpening;
      }
      s.draw(this.ctx, 0, anchorX, anchorY, false);
      return;
    }

    switch (e.state) {
      case "patrol": {
        const s = this.art.plantWalk;
        s.draw(this.ctx, s.frameAt(e.animTick), anchorX, anchorY, flip);
        break;
      }
      case "waiting": {
        // Sit-down transition, then hold the seated pose.
        const s = this.art.plantSit;
        s.draw(this.ctx, s.frameAtOnce(e.animTick), anchorX, anchorY, flip);
        break;
      }
      case "rousing": {
        const s = this.art.plantIdle;
        s.draw(this.ctx, s.frameAt(e.animTick), anchorX, anchorY, flip);
        break;
      }
      case "stunned": {
        if (e.showingGetUp) {
          const s = this.art.plantGetUp;
          s.draw(this.ctx, s.frameAt(e.animTick), anchorX, anchorY, flip);
        } else {
          // Knocked over: the squash-flip lands it upside down on its head,
          // and reverses as the revive approaches.
          this.art.plantBoxForm.draw(
            this.ctx,
            0,
            anchorX,
            anchorY,
            flip,
            e.stunScaleY(),
          );
        }
        break;
      }
      case "held": {
        // Blink during the final second so the wake-up is telegraphed.
        const blinking =
          e.heldTicks <= HELD_BLINK_TICKS && Math.floor(e.heldTicks / 4) % 2 === 0;
        if (!blinking) {
          this.art.plantBoxForm.draw(this.ctx, 0, anchorX, anchorY, flip);
        }
        break;
      }
      case "thrown": {
        this.art.plantBoxForm.draw(this.ctx, 0, anchorX, anchorY, flip);
        break;
      }
    }
  }

  private drawShots(alpha: number): void {
    const ctx = this.ctx;
    for (const shot of this.shots) {
      const x = Math.round(shot.prevX + (shot.x - shot.prevX) * alpha);
      const y = Math.round(shot.y);
      ctx.fillStyle = "#e85048";
      ctx.fillRect(x - SHOT_W / 2, y - SHOT_H / 2, SHOT_W, SHOT_H);
      ctx.fillStyle = "#fff0e0";
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
  }

  private drawEffects(): void {
    // Four shards flying out diagonally from the kill point.
    const ctx = this.ctx;
    ctx.fillStyle = COLORS.shatter;
    for (const fx of this.effects) {
      const age = EFFECT_TICKS - fx.ticks;
      const d = 2 + age * 1.2;
      for (const [sx, sy] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        ctx.fillRect(
          Math.round(fx.x + sx * d) - 1,
          Math.round(fx.y + sy * d) - 1,
          2,
          2,
        );
      }
    }
  }

  // The whip renders as a straight lash with the undeployed remainder coiled
  // at the tip — the coil shrinks as it unrolls, so reach is always readable.
  private drawWhip(alpha: number): void {
    const seg = this.player.whipSegment(
      Math.round(this.player.drawX(alpha)),
      Math.round(this.player.drawY(alpha)),
    );
    if (!seg) return;
    const ctx = this.ctx;
    const ext = this.player.whipExtension();
    const dx = this.player.whipDirX;
    const dy = this.player.whipDirY;

    ctx.strokeStyle = COLORS.whip;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(seg.x1 + 0.5, seg.y1 + 0.5);
    ctx.lineTo(seg.x2 + 0.5, seg.y2 + 0.5);

    const rem = 1 - ext;
    if (rem > 0.05) {
      // Archimedean spiral curling forward from the tip, radius and turn
      // count shrinking with the remaining length.
      const radius = 1.5 + rem * 4.5;
      const sweep = (1 + rem * 2) * Math.PI * 2;
      const coilX = seg.x2 + dx * radius;
      const coilY = seg.y2 + dy * radius;
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

// Liang-Barsky segment-vs-AABB test for the whip lash.
function segmentHitsRect(
  seg: { x1: number; y1: number; x2: number; y2: number },
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): boolean {
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [seg.x1 - rx, rx + rw - seg.x1, seg.y1 - ry, ry + rh - seg.y1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return true;
}
