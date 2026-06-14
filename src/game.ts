import { TILE, GRID_W, GRID_H, VIEW_W, VIEW_H, TICK_HZ } from "./config";
import { Level, Tile, parseLevel } from "./level";
import { Input } from "./input";
import { Art } from "./art";
import { Player, PLAYER_W, PLAYER_H } from "./player";
import { Enemy, spawnEnemies, Spawner, buildSpawners } from "./enemy";
import { ReachMap, computeReachMap } from "./reachability";
import { Lighting, LightMode } from "./lighting";
import { Sprite } from "./sprite";

const COLORS = {
  background: "#000000",
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

// Light source radii (px): the player carries a torch; Light Statues cast a
// wider pool. fullR = fully lit, fadeR = down to ambient.
const PLAYER_LIGHT_FULL = 40;
const PLAYER_LIGHT_FADE = 150;
const STATUE_LIGHT_FULL = 44;
const STATUE_LIGHT_FADE = 180;

// Carry: the held box rides just above the player's head.
const CARRY_GAP = 1;
// Throw: leaves from chest height, nudged forward so it clears the body.
const THROW_OFF_X = 8;
const THROW_OFF_Y = 10;

interface Effect {
  x: number; // center of the burst
  y: number;
  ticks: number;
  kind: "shatter" | "snakeHit" | "boom" | "batHit";
}

// Eye shot: a horizontal bolt. Kills the player; stops at walls; passes
// through enemies (the Eye doesn't fear its own kin).
interface Shot {
  x: number; // center
  y: number;
  prevX: number;
  vx: number;
  anim: number; // animation tick for the dart sprite
}

const SHOT_SPEED = 2;
const SHOT_W = 6;
const SHOT_H = 4;

export class Game {
  private level!: Level;
  private player!: Player;
  private enemies: Enemy[] = [];
  private spawners: Spawner[] = [];
  private levelIndex = 0;
  private held: Enemy | null = null;
  private effects: Effect[] = [];
  private shots: Shot[] = [];
  private clearedTimer = 0; // >0 while showing the CLEARED flash
  private deathTimer = 0; // >0 while showing the death blink
  // Dev reachability overlay (M to toggle, sticky across levels). The map is
  // computed lazily per level and cached until the level changes.
  private showReach = false;
  private reachMap: ReachMap | null = null;
  // Statue images for spawner landmarks (grayscale takes of the monster).
  private readonly statueDim: OffscreenCanvas;
  private readonly statueLit: OffscreenCanvas;
  // Darkening pass (reproduces the authored Dark/Very Dark art). Dev toggle
  // (L) flips between per-tile (art-faithful, blocky) and per-pixel (smooth).
  private readonly lighting = new Lighting();
  private lightMode: LightMode = "tile";
  // N toggles linear ramp vs plateau (snap to normal/Dark/Very Dark) response.
  private lightNonlinear = false;

  constructor(
    private readonly ctx: OffscreenCanvasRenderingContext2D,
    private readonly art: Art,
    private readonly input: Input,
    private readonly levels: readonly string[],
  ) {
    // The statue is the monster's dormant pose, set in stone.
    this.statueDim = art.troll.statue(art.troll.lastFrame, STATUE_DIM);
    this.statueLit = art.troll.statue(art.troll.lastFrame, STATUE_LIT);
    this.loadLevel(0);
  }

  // (Re)build the whole play state from a level's ASCII. Used for boot,
  // restarts (same index), and advancing after a clear (next index).
  private loadLevel(index: number): void {
    this.levelIndex = index;
    this.level = parseLevel(this.levels[index]);
    this.player = new Player(this.level);
    this.enemies = spawnEnemies(this.level);
    this.spawners = buildSpawners(this.level);
    this.held = null;
    this.effects = [];
    this.shots = [];
    this.clearedTimer = 0;
    this.deathTimer = 0;
    this.reachMap = null;
  }

  update(): void {
    this.input.poll();

    if (this.input.restartPressed) {
      this.restart();
      return;
    }

    if (this.input.mapPressed) {
      this.showReach = !this.showReach;
      if (this.showReach && !this.reachMap) {
        this.reachMap = computeReachMap(this.level);
      }
    }

    if (this.input.lightModePressed) {
      this.lightMode = this.lightMode === "tile" ? "pixel" : "tile";
    }

    if (this.input.lightCurvePressed) {
      this.lightNonlinear = !this.lightNonlinear;
    }

    // Dev: step through levels with - / = (wraps both ways).
    if (this.input.prevLevelPressed) {
      const n = this.levels.length;
      this.loadLevel((this.levelIndex - 1 + n) % n);
      return;
    }
    if (this.input.nextLevelPressed) {
      this.loadLevel((this.levelIndex + 1) % this.levels.length);
      return;
    }

    if (this.clearedTimer > 0) {
      // Advance to the next level (looping for now — no ending yet).
      if (--this.clearedTimer === 0) {
        this.loadLevel((this.levelIndex + 1) % this.levels.length);
      }
      return; // freeze gameplay during the flash
    }
    if (this.deathTimer > 0) {
      if (--this.deathTimer === 0) this.restart();
      return;
    }

    this.player.update(this.input);

    // B while holding = throw (the player skipped the whip because holding
    // was set during its update, so the press is ours to consume here).
    // Mid-yank the hands are still reeling, so the press is simply eaten.
    if (this.held && this.held.state === "held" && this.input.bPressed) {
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
        const carryX = this.player.x + PLAYER_W / 2;
        const carryY = this.player.y - CARRY_GAP;
        if (e.state === "yanked") {
          e.yankToward(carryX, carryY); // still flying to the hands
          continue;
        }
        e.carryAt(carryX, carryY);
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
          if (other === e || !other.alive) continue;
          if (other.state === "held" || other.state === "yanked") continue;
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
          anim: 0,
        });
      }
    }
    this.enemies = this.enemies.filter((e) => e.alive);
  }

  private updateShots(): void {
    for (const shot of this.shots) {
      shot.prevX = shot.x;
      shot.x += shot.vx;
      shot.anim++;
    }
    this.shots = this.shots.filter((shot) => {
      const tx = Math.floor((shot.x + Math.sign(shot.vx) * (SHOT_W / 2)) / TILE);
      const ty = Math.floor(shot.y / TILE);
      if (this.level.isSolid(tx, ty)) {
        // Wall absorbs the dart: burst where it struck.
        this.effects.push({
          x: shot.x,
          y: shot.y,
          ticks: this.art.dartBoom.durationTicks,
          kind: "boom",
        });
        return false;
      }
      return true;
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

      if (e.kind === "virus" || e.kind === "eye" || e.kind === "bat") {
        this.killEnemy(e); // one whip hit kills (the Eye's defense is range)
      } else if (e.stunnable) {
        e.stun();
      } else if (e.state === "stunned" && !this.held) {
        e.startYank(); // reel it into the hands over a short pull
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
    const cx = e.x + e.w / 2;
    const cy = e.y + e.h / 2;
    if (e.kind === "virus") {
      const s = this.art.snakeHit;
      this.effects.push({ x: cx, y: cy, ticks: s.durationTicks, kind: "snakeHit" });
      return;
    }
    if (e.kind === "bat") {
      const s = this.art.bat.hit;
      this.effects.push({ x: cx, y: cy, ticks: s.durationTicks, kind: "batHit" });
      return;
    }
    this.effects.push({ x: cx, y: cy, ticks: EFFECT_TICKS, kind: "shatter" });
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
          const s = this.art.exit;
          s.draw(ctx, 0, tx * TILE + TILE / 2, (ty + 1) * TILE, false);
        }
      }
    }

    this.drawGrappleRings();

    // Background layer: light statues and spawner statues sit behind everything.
    this.drawLightStatues();
    for (const sp of this.spawners) this.drawSpawner(sp);

    for (const e of this.enemies) {
      if (e.alive) this.drawEnemy(e, alpha);
    }

    this.drawPlayer(alpha);
    this.drawWhip(alpha);
    this.drawRope(alpha);
    this.drawShots(alpha);
    this.drawEffects();

    // Lighting: darken the rendered scene. The player carries a torch and each
    // Light Statue casts a pool; sources combine by max over an ambient floor.
    this.lighting.clear();
    this.lighting.addLight(
      this.player.drawX(alpha) + PLAYER_W / 2,
      this.player.drawY(alpha) + PLAYER_H / 2,
      PLAYER_LIGHT_FULL,
      PLAYER_LIGHT_FADE,
    );
    for (const ls of this.level.lightStatues) {
      this.lighting.addLight(ls.x, ls.y, STATUE_LIGHT_FULL, STATUE_LIGHT_FADE);
    }
    this.lighting.apply(ctx, this.lightMode, this.lightNonlinear);

    if (this.showReach && this.reachMap) this.drawReachOverlay(this.reachMap);

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

  // Dev overlay: where can the body get to from spawn, using the real player
  // physics? Green = on foot alone; gold = only with the whip (what this
  // level's rings unlock); untinted = unreachable. A red X covers the exit
  // if even the whip can't get there.
  private drawReachOverlay(map: ReachMap): void {
    const ctx = this.ctx;
    ctx.globalAlpha = 0.35;
    for (let ty = 0; ty < GRID_H; ty++) {
      for (let tx = 0; tx < GRID_W; tx++) {
        const idx = ty * GRID_W + tx;
        if (!map.full[idx]) continue;
        ctx.fillStyle = map.walk[idx] ? "#3fae5a" : "#e0a82e";
        ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
      }
    }
    ctx.globalAlpha = 1;

    if (!map.exitReachable) {
      ctx.strokeStyle = "#e84048";
      ctx.lineWidth = 2;
      for (let ty = 0; ty < GRID_H; ty++) {
        for (let tx = 0; tx < GRID_W; tx++) {
          if (!this.level.isExit(tx, ty)) continue;
          ctx.beginPath();
          ctx.moveTo(tx * TILE + 2, ty * TILE + 2);
          ctx.lineTo((tx + 1) * TILE - 2, (ty + 1) * TILE - 2);
          ctx.moveTo((tx + 1) * TILE - 2, ty * TILE + 2);
          ctx.lineTo(tx * TILE + 2, (ty + 1) * TILE - 2);
          ctx.stroke();
        }
      }
      ctx.lineWidth = 1;
    }
  }

  private drawGrappleRings(): void {
    const s = this.art.hook;
    for (const gp of this.level.grapplePoints) {
      s.drawCentered(this.ctx, 0, gp.x, gp.y);
    }
  }

  // While swinging, the whip is the rope: a taut line from hand to anchor.
  private drawRope(alpha: number): void {
    if (!this.player.swinging) return;
    const ctx = this.ctx;
    ctx.strokeStyle = COLORS.whip;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(
      Math.round(this.player.handX(alpha)) + 0.5,
      Math.round(this.player.handY(alpha)) + 0.5,
    );
    ctx.lineTo(this.player.swingAnchorX + 0.5, this.player.swingAnchorY + 0.5);
    ctx.stroke();
  }

  private drawLightStatues(): void {
    const off = this.art.lightStatueOff;
    const on = this.art.lightStatueOn;
    const frame = on.frameAt(this.player.animTick);
    for (const ls of this.level.lightStatues) {
      const anchorY = (ls.ty + 1) * TILE;
      off.draw(this.ctx, 0, ls.x, anchorY, false);
      on.draw(this.ctx, frame, ls.x, anchorY, false);
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
    // Death blink: skip on alternating frames so the kill reads instantly.
    const dying = this.deathTimer > 0;
    if (dying && Math.floor(this.deathTimer / 4) % 2 === 0) return;

    const p = this.player;
    const pa = this.art.player;
    const anchorX = p.drawX(alpha) + PLAYER_W / 2;
    const anchorY = p.drawY(alpha) + PLAYER_H;
    const flip = p.facing === -1; // sheets face right

    // State -> animation.
    let s: Sprite;
    let frozen = false;
    if (p.whipping || p.holding) {
      s = pa.use;
    } else if (p.climbing) {
      s = p.vy > 0 ? pa.down : pa.up;
      frozen = p.vy === 0; // hold a climb frame when not moving on the ladder
    } else if (!p.grounded) {
      s = p.vy < 0 ? pa.jumpUp : pa.fallDown;
    } else if (p.landing) {
      s = pa.land;
    } else if (Math.abs(p.vx) > 0.1) {
      s = pa.walk;
    } else {
      s = pa.still;
    }

    // Death pop: wash the silhouette white on the shown frames.
    if (dying) this.ctx.filter = "brightness(0) invert(1)";
    s.draw(this.ctx, frozen ? 0 : s.frameAt(p.animTick), anchorX, anchorY, flip);
    if (dying) this.ctx.filter = "none";
  }

  private drawEnemy(e: Enemy, alpha: number): void {
    // White pop the instant the whip connects: a canvas filter washes the
    // whole sprite (outlines included) to a solid silhouette for a few ticks.
    if (e.hitFlash > 0) this.ctx.filter = "brightness(0) invert(1)";
    this.drawEnemySprite(e, alpha);
    this.ctx.filter = "none";
  }

  private drawEnemySprite(e: Enemy, alpha: number): void {
    // Sprite sheets face right; flip when walking left. Anchor is the
    // bottom-center of the AABB (art canvases are padded; the sprite loader
    // measures opaque content bounds and rests the content on the anchor).
    const anchorX = e.drawX(alpha) + e.w / 2;
    const anchorY = e.drawY(alpha) + e.h;
    const flip = e.facing === -1;

    // Walker: Snake.
    if (e.kind === "virus") {
      const s = this.art.snake;
      s.draw(this.ctx, s.frameAt(e.animTick), anchorX, anchorY, flip);
      return;
    }

    // Flyer: Bat. Same wing-flap loop whether perched, diving, or climbing.
    if (e.kind === "bat") {
      const s = this.art.bat.fly;
      s.draw(this.ctx, s.frameAt(e.animTick), anchorX, anchorY, flip);
      return;
    }

    // Stationary shooter: Dart Cannon. Idle stare, then the Shoot animation
    // (strobing white) as the wind-up telegraph before a dart fires.
    if (e.kind === "eye") {
      if (e.charging && Math.floor(e.animTick / 4) % 2 === 0) {
        this.ctx.filter = "brightness(0) invert(1)"; // drawEnemy resets it
      }
      const s = e.charging ? this.art.cannonShoot : this.art.cannonIdle;
      s.draw(this.ctx, s.frameAt(e.animTick), anchorX, anchorY, false);
      return;
    }

    // Grabbable/throwable: Large Troll. The hurt pose doubles as the
    // folded/stunned/carried silhouette (no dedicated box form in this set).
    switch (e.state) {
      case "patrol":
      case "rousing": {
        const s = this.art.troll;
        s.draw(this.ctx, s.frameAt(e.animTick), anchorX, anchorY, flip);
        break;
      }
      case "waiting": {
        this.art.troll.draw(this.ctx, 0, anchorX, anchorY, flip);
        break;
      }
      case "stunned": {
        // Knocked over: the squash-flip lands it upside down and reverses as
        // the revive approaches.
        this.art.trollHit.draw(this.ctx, 0, anchorX, anchorY, flip, e.stunScaleY());
        break;
      }
      case "held": {
        // Blink during the final second so the wake-up is telegraphed.
        const blinking =
          e.heldTicks <= HELD_BLINK_TICKS && Math.floor(e.heldTicks / 4) % 2 === 0;
        if (!blinking) {
          this.art.trollHit.draw(this.ctx, 0, anchorX, anchorY, flip);
        }
        break;
      }
      case "yanked":
      case "thrown": {
        this.art.trollHit.draw(this.ctx, 0, anchorX, anchorY, flip);
        break;
      }
    }
  }

  private drawShots(alpha: number): void {
    const s = this.art.dart;
    for (const shot of this.shots) {
      const x = Math.round(shot.prevX + (shot.x - shot.prevX) * alpha);
      const y = Math.round(shot.y);
      // Sheet faces left; flip when the dart travels right.
      s.drawCentered(this.ctx, s.frameAt(shot.anim), x, y, shot.vx > 0);
    }
  }

  private drawEffects(): void {
    const ctx = this.ctx;
    for (const fx of this.effects) {
      if (fx.kind === "boom") {
        // Dart impact: play the explosion once, centered on the hit point.
        const s = this.art.dartBoom;
        const age = s.durationTicks - fx.ticks;
        s.drawCentered(ctx, s.frameAtOnce(age), Math.round(fx.x), Math.round(fx.y));
        continue;
      }
      if (fx.kind === "snakeHit") {
        const s = this.art.snakeHit;
        const age = s.durationTicks - fx.ticks;
        s.drawCentered(ctx, s.frameAtOnce(age), Math.round(fx.x), Math.round(fx.y));
        continue;
      }
      if (fx.kind === "batHit") {
        const s = this.art.bat.hit;
        const age = s.durationTicks - fx.ticks;
        s.drawCentered(ctx, s.frameAtOnce(age), Math.round(fx.x), Math.round(fx.y));
        continue;
      }
      // Four shards flying out diagonally from the kill point.
      ctx.fillStyle = COLORS.shatter;
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
