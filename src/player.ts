import { TILE } from "./config";
import { Level } from "./level";
import { Input } from "./input";

// All physics constants are per-tick at 60Hz (px and px/tick).
const WALK_ACCEL = 0.25;
const WALK_MAX = 1.5;
const FRICTION = 0.3;
const GRAVITY = 0.18;
const FALL_MAX = 5;
const JUMP_VEL = -4.2; // ~3 tiles of jump height
const JUMP_CUT = -1.5; // releasing jump early caps upward speed here
const COYOTE_TICKS = 6; // grace period (~100ms) to jump after leaving a ledge
const JUMP_BUFFER_TICKS = 6; // press this early before landing and still jump
const CLIMB_SPEED = 1.0; // px/tick on ladders
const DROP_TICKS = 8; // one-way platforms ignored briefly after down+jump
const REGRAB_TICKS = 10; // ladder ignored briefly after jumping off, so a held
// Up doesn't instantly re-latch and eat the jump
const WHIP_TICKS = 20; // full whip animation (~333ms)
export const WHIP_RANGE = 40; // tip reach in px (2.5 tiles)

// AABB size: slightly narrower than a tile so 1-tile gaps are enterable.
export const PLAYER_W = 12;
export const PLAYER_H = 14;

export class Player {
  // x/y = top-left of the AABB, in playfield pixels (floats for sub-pixel motion).
  x = 0;
  y = 0;
  prevX = 0;
  prevY = 0;
  vx = 0;
  vy = 0;
  grounded = false;
  climbing = false;
  facing: 1 | -1 = 1;
  private whipTicks = 0; // counts down from WHIP_TICKS while the whip is out
  // Aim unit vector, captured from held keys when the whip fires
  // (Bionic Commando style): horizontal, 45° up-forward, or straight up.
  whipDirX = 1;
  whipDirY = 0;
  whipId = 0; // increments per swing so a hit registers once per enemy
  holding = false; // set by the game while carrying an enemy (whip suppressed)
  private coyote = 0; // ticks left where a jump is still allowed after leaving ground
  private jumpBuffer = 0; // ticks left where a stored jump press can fire on landing
  private dropTicks = 0; // ticks left of falling through one-way platforms
  private regrabTicks = 0; // ticks left before a ladder can be grabbed again

  constructor(private readonly level: Level) {
    this.respawn();
  }

  respawn(): void {
    // Center the AABB in the spawn tile, feet on the tile's floor line.
    this.x = this.level.spawnX * TILE + (TILE - PLAYER_W) / 2;
    this.y = this.level.spawnY * TILE + (TILE - PLAYER_H);
    this.prevX = this.x;
    this.prevY = this.y;
    this.vx = 0;
    this.vy = 0;
    this.grounded = false;
    this.climbing = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.dropTicks = 0;
    this.regrabTicks = 0;
    this.whipTicks = 0;
    this.facing = 1;
    this.holding = false;
  }

  get whipping(): boolean {
    return this.whipTicks > 0;
  }

  // The lash segment from hand to tip for a given top-left position (pass the
  // raw position for hit logic, the interpolated one for drawing).
  whipSegment(
    px: number,
    py: number,
  ): { x1: number; y1: number; x2: number; y2: number } | null {
    if (!this.whipping) return null;
    const ext = this.whipExtension();
    // Hand sits on the player's edge in the aim direction (top for up,
    // corner for diagonals, side at shoulder height for horizontal).
    const x1 = px + PLAYER_W / 2 + (this.whipDirX * PLAYER_W) / 2;
    const y1 = this.whipDirY < 0 ? py : py + 5;
    return {
      x1,
      y1,
      x2: x1 + this.whipDirX * ext * WHIP_RANGE,
      y2: y1 + this.whipDirY * ext * WHIP_RANGE,
    };
  }

  // 0..1 reach of the whip: unroll, crack at full reach, recoil.
  whipExtension(): number {
    if (this.whipTicks === 0) return 0;
    const p = 1 - this.whipTicks / WHIP_TICKS;
    if (p < 0.5) return p / 0.5;
    if (p < 0.7) return 1;
    return (1 - p) / 0.3;
  }

  update(input: Input): void {
    this.prevX = this.x;
    this.prevY = this.y;
    if (this.dropTicks > 0) this.dropTicks--;
    if (this.regrabTicks > 0) this.regrabTicks--;
    if (this.whipTicks > 0) this.whipTicks--;

    if (!this.climbing && !this.whipping) this.tryGrabLadder(input);
    if (this.climbing) {
      this.climb(input);
      return;
    }

    // Whip commits: on the ground it stops you; in the air it cuts steering.
    // (B is the context verb: whip when empty-handed; while holding, the game
    // consumes B as the throw, so the whip is suppressed here.)
    if (input.bPressed && !this.whipping && !this.holding) {
      this.whipTicks = WHIP_TICKS;
      this.whipId++;
      if (this.grounded) this.vx = 0;
      // Aim from keys held at the press. A held direction also turns the
      // player first, so left+whip while facing right whips left.
      const h = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      if (h !== 0) this.facing = h > 0 ? 1 : -1;
      if (input.up && h === 0) {
        this.whipDirX = 0;
        this.whipDirY = -1;
      } else if (input.up) {
        this.whipDirX = this.facing * Math.SQRT1_2;
        this.whipDirY = -Math.SQRT1_2;
      } else {
        this.whipDirX = this.facing;
        this.whipDirY = 0;
      }
    }

    // Horizontal: accelerate toward held direction, friction when idle.
    // While whipping, input is ignored; airborne momentum is preserved
    // (no friction) so an air whip doesn't kill the jump arc.
    const dir = this.whipping ? 0 : (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir !== 0) {
      this.facing = dir > 0 ? 1 : -1;
      this.vx += dir * WALK_ACCEL;
      this.vx = Math.max(-WALK_MAX, Math.min(WALK_MAX, this.vx));
    } else if (this.whipping && !this.grounded) {
      // keep vx as-is: no air-control, no air drag
    } else if (this.vx > 0) {
      this.vx = Math.max(0, this.vx - FRICTION);
    } else if (this.vx < 0) {
      this.vx = Math.min(0, this.vx + FRICTION);
    }

    // Vertical: gravity, jump, variable height via early release.
    this.vy = Math.min(this.vy + GRAVITY, FALL_MAX);

    // Coyote time: refresh while grounded, tick down after leaving a ledge.
    if (this.grounded) this.coyote = COYOTE_TICKS;
    else if (this.coyote > 0) this.coyote--;

    // Jump buffer: a press is stored briefly so landing a few ticks later
    // still fires the jump instead of eating the input.
    if (input.aPressed) this.jumpBuffer = JUMP_BUFFER_TICKS;
    else if (this.jumpBuffer > 0) this.jumpBuffer--;

    // Down+jump on a one-way platform drops through instead of jumping.
    // Both are locked out mid-whip (the buffer keeps ticking, so a press
    // near the end of the whip still fires once it finishes).
    if (!this.whipping) {
      if (this.grounded && input.down && input.aPressed && this.onPlatformOnly()) {
        this.dropTicks = DROP_TICKS;
        this.grounded = false;
        this.coyote = 0;
        this.jumpBuffer = 0;
      }

      if (this.jumpBuffer > 0 && this.coyote > 0) {
        this.vy = JUMP_VEL;
        this.grounded = false;
        // Consume both windows so a coyote jump can't double-fire mid-air.
        this.coyote = 0;
        this.jumpBuffer = 0;
      }
    }
    if (!input.a && this.vy < JUMP_CUT) {
      this.vy = JUMP_CUT;
    }

    this.moveX(this.vx);
    this.moveY(this.vy);
  }

  // --- Ladders ---

  private centerTileX(): number {
    return Math.floor((this.x + PLAYER_W / 2) / TILE);
  }

  // Ladder under the body's center column (middle or feet row).
  private ladderHere(): boolean {
    const cx = this.centerTileX();
    const mid = Math.floor((this.y + PLAYER_H / 2) / TILE);
    const feet = Math.floor((this.y + PLAYER_H - 1) / TILE);
    return this.level.isLadder(cx, mid) || this.level.isLadder(cx, feet);
  }

  private tryGrabLadder(input: Input): void {
    if (this.regrabTicks > 0) return;
    if (!input.up && !input.down) return;
    const cx = this.centerTileX();
    const below = this.level.isLadder(cx, Math.floor((this.y + PLAYER_H + 1) / TILE));
    const here = this.ladderHere();

    if ((input.up && here) || (input.down && (here || (this.grounded && below)))) {
      this.climbing = true;
      this.vx = 0;
      this.vy = 0;
      this.grounded = false;
      // Stepping down from standing on a ladder top: nudge into the ladder
      // so the one-way check below the feet releases.
      if (!here && below) this.y += 2;
    }
  }

  private climb(input: Input): void {
    // Jump releases the ladder (works while holding any direction).
    if (input.aPressed) {
      this.climbing = false;
      this.regrabTicks = REGRAB_TICKS;
      this.vy = JUMP_VEL;
      this.coyote = 0;
      this.jumpBuffer = 0;
      return;
    }
    this.coyote = 0;
    this.jumpBuffer = 0;

    // Free movement in both axes at climb speed; sliding the body's center
    // off the ladder column releases it (checked below).
    this.vx = ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * CLIMB_SPEED;
    this.vy = ((input.down ? 1 : 0) - (input.up ? 1 : 0)) * CLIMB_SPEED;
    this.moveX(this.vx);
    this.moveY(this.vy);

    // Release at the floor or when moving off the ladder in any direction.
    if (this.grounded || !this.ladderHere()) {
      this.climbing = false;
      this.vy = 0;
      // Same grace as walking off a ledge: a jump pressed just after the
      // ladder lets go still fires.
      if (!this.grounded) this.coyote = COYOTE_TICKS;
    }
  }

  // True if everything under the feet is one-way (platform/ladder top), so a
  // down+jump drop won't be blocked by solid ground.
  private onPlatformOnly(): boolean {
    const left = Math.floor(this.x / TILE);
    const right = Math.floor((this.x + PLAYER_W - 1) / TILE);
    const ty = Math.floor((this.y + PLAYER_H) / TILE);
    let oneWay = false;
    for (let tx = left; tx <= right; tx++) {
      if (this.level.isSolid(tx, ty)) return false;
      if (this.level.isPlatform(tx, ty) || this.level.isLadderTop(tx, ty)) oneWay = true;
    }
    return oneWay;
  }

  // Axis-separated AABB-vs-grid sweeps: move, then push out of any solid
  // tile the box now overlaps, clamping to the tile edge.

  private moveX(dx: number): void {
    this.x += dx;
    if (dx === 0) return;
    const top = Math.floor(this.y / TILE);
    const bottom = Math.floor((this.y + PLAYER_H - 1) / TILE);
    if (dx > 0) {
      const tx = Math.floor((this.x + PLAYER_W - 1) / TILE);
      for (let ty = top; ty <= bottom; ty++) {
        if (this.level.isSolid(tx, ty)) {
          this.x = tx * TILE - PLAYER_W;
          this.vx = 0;
          return;
        }
      }
    } else {
      const tx = Math.floor(this.x / TILE);
      for (let ty = top; ty <= bottom; ty++) {
        if (this.level.isSolid(tx, ty)) {
          this.x = (tx + 1) * TILE;
          this.vx = 0;
          return;
        }
      }
    }
  }

  private moveY(dy: number): void {
    const bottomBefore = this.y + PLAYER_H;
    this.y += dy;
    this.grounded = false;
    const left = Math.floor(this.x / TILE);
    const right = Math.floor((this.x + PLAYER_W - 1) / TILE);
    if (dy >= 0) {
      // Test the box's bottom EDGE (y + H), not the last interior pixel.
      // With the interior pixel, a resting player (feet at ty*TILE - 1) needs
      // several ticks of accumulated gravity to re-enter the floor tile, so
      // grounded flickers false ~3 of every 4 ticks and eats jump presses.
      const ty = Math.floor((this.y + PLAYER_H) / TILE);
      // One-way surfaces only catch feet crossing their top edge from above,
      // and never while climbing or dropping through.
      const oneWayActive = !this.climbing && this.dropTicks === 0 && bottomBefore <= ty * TILE;
      for (let tx = left; tx <= right; tx++) {
        const oneWay =
          oneWayActive && (this.level.isPlatform(tx, ty) || this.level.isLadderTop(tx, ty));
        if (this.level.isSolid(tx, ty) || oneWay) {
          this.y = ty * TILE - PLAYER_H;
          this.vy = 0;
          this.grounded = true;
          return;
        }
      }
    } else {
      const ty = Math.floor(this.y / TILE);
      for (let tx = left; tx <= right; tx++) {
        if (this.level.isSolid(tx, ty)) {
          this.y = (ty + 1) * TILE;
          this.vy = 0;
          return;
        }
      }
    }
  }

  // Interpolated draw position for the fixed-timestep renderer.
  drawX(alpha: number): number {
    return this.prevX + (this.x - this.prevX) * alpha;
  }

  drawY(alpha: number): number {
    return this.prevY + (this.y - this.prevY) * alpha;
  }
}
