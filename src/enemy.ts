import { TILE, TICK_HZ } from "./config";
import { Level, EnemyKind, EnemySpawn } from "./level";

// Shared physics (same per-tick units as the player).
const GRAVITY = 0.18;
const FALL_MAX = 5;

// Virus: fodder tier — slow floor patroller, one whip hit kills.
const VIRUS_W = 12;
const VIRUS_H = 10;
const VIRUS_SPEED = 0.35;

// Plant Box: grabbable tier. Hitbox is under a tile tall so a thrown box can
// pass through one-tile slots even though the art overdraws a little.
const PLANT_W = 14;
const PLANT_H = 15;
const PLANT_SPEED = 0.3;

// Eye: stationary exit guardian. One whip hit kills it — but its sight far
// out-ranges the whip, so closing in means dodging bolts; a thrown enemy is
// the safe kill. Low enough that a flat ground-level throw connects.
const EYE_W = 14;
const EYE_H = 12;
// It spots intruders far outside whip range (40px), charges with a flash,
// then fires a horizontal shot — approaching on foot is a losing race.
const EYE_SIGHT_PX = 112; // 7 tiles
const EYE_CHARGE_TICKS = 30;

export const STUN_TICKS = 3 * TICK_HZ; // stun window after a whip hit
export const GETUP_TICKS = 1 * TICK_HZ; // tail of the stun shows the Get Up telegraph
export const HELD_WAKE_TICKS = 8 * TICK_HZ; // carried this long, it pops free
const EJECT_STUN_TICKS = 45; // brief harmless get-up after popping free

// Stunned knock-over: squash to 2/3 height, flip upside down, unsquash —
// reversed again when the get-up telegraph begins. Each half takes
// FLIP_HALF ticks. Stuns too short to fit the whole show skip the flip.
const FLIP_HALF = 4;
const FLIP_TICKS = FLIP_HALF * 2;

const HIT_FLASH_TICKS = 5; // white pop the instant the whip connects

const THROW_VX = 3;
const THROW_GRAVITY = 0.07; // flat-ish Mario 2 arc
const THROW_BOUNCES = 2; // ground bounces before it shatters (Mario 2 style)
const THROW_BOUNCE_VY = -2.4; // first bounce pop; later bounces decay
const THROW_BOUNCE_DECAY = 0.65;

export type EnemyState =
  | "patrol"
  | "waiting" // sitting dormant until the player crosses its field of view
  | "rousing" // spotted the player: a beat of idle before it starts walking
  | "stunned"
  | "held"
  | "thrown";

const ROUSE_TICKS = 30; // the idle beat between spotting and walking (~0.5s)

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Vertical slack when checking if the player is in an enemy's sight band.
const SIGHT_SLACK = 4;

export class Enemy {
  readonly kind: EnemyKind;
  readonly w: number;
  readonly h: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx = 0;
  vy = 0;
  facing: 1 | -1 = -1; // sprite sheets face left
  alive = true;
  state: EnemyState = "patrol";
  stunTicks = 0; // counts down while stunned
  stunDuration = 0; // full length of the current stun (for the flip phases)
  heldTicks = 0; // counts down while held
  rouseTicks = 0; // counts down through the idle beat after a sighting
  private bounces = 0; // ground bounces used up while thrown
  animTick = 0;
  lastWhipId = 0; // dedups whip hits: one effect per swing
  hitFlash = 0; // ticks of white flash right after a whip connects
  eyeCharge = 0; // Eye only: charge progress toward the next shot
  fired = false; // Eye only: true on the tick a shot leaves the eye
  shotDir: 1 | -1 = -1; // Eye only: which way the pending shot flies
  private grounded = false;

  constructor(kind: EnemyKind, spawn: EnemySpawn, private readonly level: Level) {
    this.kind = kind;
    this.w = kind === "virus" ? VIRUS_W : kind === "eye" ? EYE_W : PLANT_W;
    this.h = kind === "virus" ? VIRUS_H : kind === "eye" ? EYE_H : PLANT_H;
    // Plant Box is a watcher: it stands still until it spots the player.
    if (kind === "plantbox") this.state = "waiting";
    // Bottom-center the AABB in the spawn tile.
    this.x = spawn.tx * TILE + (TILE - this.w) / 2;
    this.y = (spawn.ty + 1) * TILE - this.h;
    this.prevX = this.x;
    this.prevY = this.y;
  }

  get speed(): number {
    return this.kind === "virus" ? VIRUS_SPEED : PLANT_SPEED;
  }

  // Active = will kill the player on touch.
  get deadly(): boolean {
    if (!this.alive) return false;
    if (this.kind === "eye") return true; // always watching, always lethal
    return (
      this.state === "patrol" || this.state === "waiting" || this.state === "rousing"
    );
  }

  // Awake-and-dangerous states: a whip hit stuns any of these.
  get stunnable(): boolean {
    return this.kind !== "eye" && this.deadly;
  }

  // Whip interactions are valid in these states (not while held/thrown).
  get whippable(): boolean {
    return this.alive && (this.deadly || this.state === "stunned");
  }

  get showingGetUp(): boolean {
    return this.state === "stunned" && this.stunTicks <= GETUP_TICKS;
  }

  // Vertical draw scale for the stunned knock-over. Timeline (long stuns):
  // squash 1 -> 2/3, flip, unsquash -2/3 -> -1; hold upside down; then the
  // reverse just before the get-up telegraph window opens.
  stunScaleY(): number {
    if (this.state !== "stunned") return 1;
    // Too short for the full show (e.g. the post-hold eject): stay upright.
    if (this.stunDuration <= GETUP_TICKS + FLIP_TICKS * 2) return 1;

    const age = this.stunDuration - this.stunTicks;
    if (age < FLIP_HALF) return 1 - age / FLIP_HALF / 3;
    if (age < FLIP_TICKS) return -(2 / 3 + (age - FLIP_HALF) / FLIP_HALF / 3);

    // Reversal occupies the FLIP_TICKS before the get-up window.
    const t = GETUP_TICKS + FLIP_TICKS - this.stunTicks;
    if (t <= 0) return -1; // the upside-down hold
    if (t < FLIP_HALF) return -(1 - t / FLIP_HALF / 3);
    if (t < FLIP_TICKS) return 2 / 3 + (t - FLIP_HALF) / FLIP_HALF / 3;
    return 1; // get-up window: upright for the Get Up animation
  }

  stun(): void {
    this.state = "stunned";
    this.stunTicks = STUN_TICKS;
    this.stunDuration = STUN_TICKS;
    this.vx = 0;
    this.hitFlash = HIT_FLASH_TICKS;
  }

  grab(): void {
    this.state = "held";
    this.heldTicks = HELD_WAKE_TICKS;
    this.vx = 0;
    this.vy = 0;
    this.hitFlash = HIT_FLASH_TICKS;
  }

  // Carried position: game calls this every tick while held.
  carryAt(centerX: number, bottomY: number): void {
    this.x = centerX - this.w / 2;
    this.y = bottomY - this.h;
  }

  throwFrom(centerX: number, bottomY: number, dir: 1 | -1): void {
    this.carryAt(centerX, bottomY);
    this.prevX = this.x;
    this.prevY = this.y;
    this.state = "thrown";
    this.vx = dir * THROW_VX;
    this.vy = 0;
    this.facing = dir;
    this.bounces = 0;
  }

  // Wake-up while held: pops free into a brief harmless get-up.
  eject(awayFrom: 1 | -1): void {
    this.state = "stunned";
    this.stunTicks = EJECT_STUN_TICKS;
    this.stunDuration = EJECT_STUN_TICKS;
    this.vx = -awayFrom * 1.2;
    this.vy = -2.5;
  }

  kill(): void {
    this.alive = false;
  }

  // Returns true when a thrown enemy hit something this tick (wall or floor)
  // and should shatter; the game removes it and may also kill what it hit.
  update(player: Rect): boolean {
    if (!this.alive) return false;
    this.prevX = this.x;
    this.prevY = this.y;
    this.animTick++;
    if (this.hitFlash > 0) this.hitFlash--;

    // The Eye never moves: no gravity, no patrol — a fixture, not a walker.
    // It watches: player in sight charges the shot; losing sight winds the
    // charge back down (faster than it builds, but not instantly).
    if (this.kind === "eye") {
      this.fired = false;
      if (this.eyeSees(player)) {
        this.shotDir =
          player.x + player.w / 2 < this.x + this.w / 2 ? -1 : 1;
        if (++this.eyeCharge >= EYE_CHARGE_TICKS) {
          this.eyeCharge = 0;
          this.fired = true;
        }
      } else if (this.eyeCharge > 0) {
        this.eyeCharge = Math.max(0, this.eyeCharge - 2);
      }
      return false;
    }

    switch (this.state) {
      case "patrol": {
        if (this.grounded) {
          if (this.wallAhead() || !this.groundAhead()) {
            this.facing = this.facing === 1 ? -1 : 1;
            if (this.kind === "plantbox") {
              // End of the path: turn around and wait for the next sighting.
              this.state = "waiting";
              this.vx = 0;
              this.animTick = 0;
              this.vy = Math.min(this.vy + GRAVITY, FALL_MAX);
              this.moveY(this.vy);
              return false;
            }
          }
          this.vx = this.facing * this.speed;
        }
        this.vy = Math.min(this.vy + GRAVITY, FALL_MAX);
        this.moveX(this.vx);
        this.moveY(this.vy);
        return false;
      }
      case "waiting": {
        // Sit still (gravity still applies) until the player crosses the
        // field of view; then rouse — a beat of idle before walking.
        this.vy = Math.min(this.vy + GRAVITY, FALL_MAX);
        this.moveX(this.vx);
        this.moveY(this.vy);
        if (this.grounded) this.vx = 0;
        if (this.seesPlayer(player)) {
          this.state = "rousing";
          this.rouseTicks = ROUSE_TICKS;
          this.animTick = 0;
        }
        return false;
      }
      case "rousing": {
        this.vy = Math.min(this.vy + GRAVITY, FALL_MAX);
        this.moveX(this.vx);
        this.moveY(this.vy);
        if (this.grounded) this.vx = 0;
        if (--this.rouseTicks <= 0) {
          this.state = "patrol";
          this.animTick = 0;
        }
        return false;
      }
      case "stunned": {
        // Falls (a grabbed-then-dropped or ejected box keeps momentum) but
        // doesn't walk; timer runs to wake-up.
        this.vy = Math.min(this.vy + GRAVITY, FALL_MAX);
        if (this.grounded) this.vx = 0;
        this.moveX(this.vx);
        this.moveY(this.vy);
        if (--this.stunTicks <= 0) {
          this.state = this.kind === "plantbox" ? "waiting" : "patrol";
          this.animTick = 0;
        }
        return false;
      }
      case "held": {
        // Position is driven by the game (carryAt); just run the wake clock.
        this.heldTicks--;
        return false;
      }
      case "thrown": {
        this.vy = Math.min(this.vy + THROW_GRAVITY, FALL_MAX);
        const hitWall = this.moveX(this.vx);
        this.moveY(this.vy);
        if (hitWall) return true; // walls always shatter
        if (this.grounded) {
          // Mario 2 bounces: pop back up with decaying height, keep sliding
          // forward; shatter once the bounces are spent.
          if (this.bounces >= THROW_BOUNCES) return true;
          this.vy = THROW_BOUNCE_VY * Math.pow(THROW_BOUNCE_DECAY, this.bounces);
          this.bounces++;
          this.grounded = false;
        }
        return false;
      }
    }
  }

  get heldExpired(): boolean {
    return this.state === "held" && this.heldTicks <= 0;
  }

  get charging(): boolean {
    return this.eyeCharge > 0;
  }

  // Eye sight: either direction, same height band, within range, with a
  // clear line of solid-free tiles along the eye's center row.
  private eyeSees(p: Rect): boolean {
    if (p.y >= this.y + this.h + SIGHT_SLACK * 2) return false;
    if (p.y + p.h <= this.y - SIGHT_SLACK * 2) return false;
    const cx = this.x + this.w / 2;
    const pcx = p.x + p.w / 2;
    if (Math.abs(pcx - cx) > EYE_SIGHT_PX) return false;
    const ty = Math.floor((this.y + this.h / 2) / TILE);
    const x0 = Math.floor(cx / TILE);
    const x1 = Math.floor(pcx / TILE);
    const step = x1 > x0 ? 1 : -1;
    for (let tx = x0 + step; tx !== x1 && tx !== x1 + step; tx += step) {
      if (this.level.isSolid(tx, ty)) return false;
    }
    return true;
  }

  overlaps(x: number, y: number, w: number, h: number): boolean {
    return (
      this.x < x + w && this.x + this.w > x && this.y < y + h && this.y + this.h > y
    );
  }

  // Field of view: the player counts as spotted when they're on the facing
  // side, roughly in the same height band, with no solid tile between (line
  // of sight along the watcher's center row).
  private seesPlayer(p: Rect): boolean {
    if (p.y >= this.y + this.h + SIGHT_SLACK) return false;
    if (p.y + p.h <= this.y - SIGHT_SLACK) return false;
    const x0 = Math.floor((this.x + this.w / 2) / TILE);
    const x1 = Math.floor((p.x + p.w / 2) / TILE);
    if (this.facing === 1 ? x1 < x0 : x1 > x0) return false; // behind
    const ty = Math.floor((this.y + this.h / 2) / TILE);
    const step = x1 > x0 ? 1 : -1;
    for (let tx = x0 + step; tx !== x1 && tx !== x1 + step; tx += step) {
      if (this.level.isSolid(tx, ty)) return false;
    }
    return true;
  }

  // --- Grid collision (mirrors the player's axis-separated sweeps) ---

  private wallAhead(): boolean {
    const frontX = this.facing === 1 ? this.x + this.w + 1 : this.x - 1;
    const tx = Math.floor(frontX / TILE);
    const top = Math.floor(this.y / TILE);
    const bottom = Math.floor((this.y + this.h - 1) / TILE);
    for (let ty = top; ty <= bottom; ty++) {
      if (this.level.isSolid(tx, ty)) return true;
    }
    return false;
  }

  // Standable ground just past the leading foot (solid, platform, or ladder top).
  private groundAhead(): boolean {
    const frontX = this.facing === 1 ? this.x + this.w + 1 : this.x - 1;
    const tx = Math.floor(frontX / TILE);
    const ty = Math.floor((this.y + this.h + 1) / TILE);
    return (
      this.level.isSolid(tx, ty) ||
      this.level.isPlatform(tx, ty) ||
      this.level.isLadderTop(tx, ty)
    );
  }

  private moveX(dx: number): boolean {
    this.x += dx;
    if (dx === 0) return false;
    const top = Math.floor(this.y / TILE);
    const bottom = Math.floor((this.y + this.h - 1) / TILE);
    if (dx > 0) {
      const tx = Math.floor((this.x + this.w - 1) / TILE);
      for (let ty = top; ty <= bottom; ty++) {
        if (this.level.isSolid(tx, ty)) {
          this.x = tx * TILE - this.w;
          this.vx = 0;
          return true;
        }
      }
    } else {
      const tx = Math.floor(this.x / TILE);
      for (let ty = top; ty <= bottom; ty++) {
        if (this.level.isSolid(tx, ty)) {
          this.x = (tx + 1) * TILE;
          this.vx = 0;
          return true;
        }
      }
    }
    return false;
  }

  private moveY(dy: number): boolean {
    const bottomBefore = this.y + this.h;
    this.y += dy;
    this.grounded = false;
    const left = Math.floor(this.x / TILE);
    const right = Math.floor((this.x + this.w - 1) / TILE);
    if (dy >= 0) {
      const ty = Math.floor((this.y + this.h) / TILE);
      // One-way surfaces catch feet crossing their top edge from above.
      const oneWayActive = bottomBefore <= ty * TILE;
      for (let tx = left; tx <= right; tx++) {
        const oneWay =
          oneWayActive && (this.level.isPlatform(tx, ty) || this.level.isLadderTop(tx, ty));
        if (this.level.isSolid(tx, ty) || oneWay) {
          this.y = ty * TILE - this.h;
          this.vy = 0;
          this.grounded = true;
          return true;
        }
      }
    } else {
      const ty = Math.floor(this.y / TILE);
      for (let tx = left; tx <= right; tx++) {
        if (this.level.isSolid(tx, ty)) {
          this.y = (ty + 1) * TILE;
          this.vy = 0;
          return true;
        }
      }
    }
    return false;
  }

  drawX(alpha: number): number {
    return this.prevX + (this.x - this.prevX) * alpha;
  }

  drawY(alpha: number): number {
    return this.prevY + (this.y - this.prevY) * alpha;
  }
}

export function spawnEnemies(level: Level): Enemy[] {
  return level.enemySpawns.map((s) => new Enemy(s.kind, s, level));
}

// Spawner (design doc §5): a statue landmark with a one-alive cap. Dormant
// while its enemy lives; once the enemy stops existing, it flashes for a
// telegraphed delay and then rebirths the enemy in front of itself.
const SPAWNER_DELAY = Math.round(2.5 * TICK_HZ);

export class Spawner {
  enemy: Enemy | null = null; // the live linked enemy (one-alive cap)
  flashTicks = 0; // >0 while telegraphing an imminent spawn

  constructor(
    readonly spawn: EnemySpawn,
    private readonly level: Level,
  ) {}

  get flashing(): boolean {
    return this.flashTicks > 0;
  }

  // Tile-rect of the spawn point, used to hold a spawn while it's occupied.
  get tileRect(): Rect {
    return {
      x: this.spawn.tx * TILE,
      y: this.spawn.ty * TILE,
      w: TILE,
      h: TILE,
    };
  }

  reset(): void {
    this.enemy = null;
    this.flashTicks = 0;
  }

  // Returns a freshly spawned enemy on the tick it materializes, else null.
  // `blocked` delays the materialization (e.g. the player stands on the spot)
  // so nothing spawns inside someone.
  update(blocked: boolean): Enemy | null {
    if (this.enemy && this.enemy.alive) {
      this.flashTicks = 0; // occupied: dormant
      return null;
    }
    if (this.flashTicks === 0) {
      this.flashTicks = SPAWNER_DELAY; // vacancy noticed: start the telegraph
      return null;
    }
    if (this.flashTicks > 1) {
      this.flashTicks--;
      return null;
    }
    if (blocked) return null; // hold at the brink until the spot is clear
    this.flashTicks = 0;
    this.enemy = new Enemy(this.spawn.kind, this.spawn, this.level);
    return this.enemy;
  }
}

export function buildSpawners(level: Level): Spawner[] {
  return level.spawnerSpawns.map((s) => new Spawner(s, level));
}
