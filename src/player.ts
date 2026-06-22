import { TILE } from "./config";
import { Level } from "./level";
import { Input } from "./input";

// All physics constants are per-tick at 60Hz (px and px/tick).
const WALK_ACCEL = 0.25;
const WALK_MAX = 1.5;
const FRICTION = 0.3;
const GRAVITY = 0.18;
const FALL_MAX = 5;
const GLIDE_FALL_MAX = 1.0; // capped descent while gliding with a carried Large Bat
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
const LAND_TICKS = 8; // brief "hitting ground" pose after a fall

// --- Swing (grapple rings) ---
// The lash latching within this distance of a ring's anchor starts a swing.
// Generous on purpose: aim directions are quantized to 8 ways, so a tight
// radius would make rings only hittable from exact standing spots.
const LATCH_RADIUS = 10;
// After latching you free-fall under gravity until the hand is this far from
// the ring, then the rope snaps taut and the pendulum begins. A latch already
// farther than this arcs immediately. Rope length = max(this, latch distance).
const DEFAULT_SWING_LEN = 40; // 2.5 tiles
const SWING_PUMP = 0.002; // angular accel from held left/right (rad/tick^2)
const SWING_MAX_TANGENT = 5; // tangential speed cap (px/tick); lets a big drop become a big swing
const SWING_IDLE_DAMPING = 0.998; // per-tick decay while no direction is held

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
  // Swing state: a rigid pendulum hung from a grapple ring. The rope attaches
  // at the hand (top-center of the AABB); angle is measured from straight
  // down, positive = hand on the anchor's right.
  swinging = false;
  swingAnchorX = 0;
  swingAnchorY = 0;
  private swingTaut = false; // false = slack rope free-falling, true = rigid pendulum
  private swingLen = 0;
  private swingAngle = 0;
  private swingVel = 0; // angular velocity (rad/tick)
  facing: 1 | -1 = 1;
  animTick = 0; // drives looping sprite animations
  private landTicks = 0; // counts down through the landing pose after a fall
  private whipTicks = 0; // counts down from WHIP_TICKS while the whip is out
  // Aim unit vector, captured from held keys when the whip fires
  // (Bionic Commando style): horizontal, 45° up-forward, or straight up.
  whipDirX = 1;
  whipDirY = 0;
  whipId = 0; // increments per swing so a hit registers once per enemy
  holding = false; // set by the game while carrying an enemy (whip suppressed)
  canGlide = false; // set by the game while carrying a Large Bat (glider)
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
    this.canGlide = false;
    this.swinging = false;
  }

  get whipping(): boolean {
    return this.whipTicks > 0;
  }

  get landing(): boolean {
    return this.landTicks > 0;
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
    this.animTick++;
    const wasGrounded = this.grounded;
    if (this.dropTicks > 0) this.dropTicks--;
    if (this.regrabTicks > 0) this.regrabTicks--;
    if (this.landTicks > 0) this.landTicks--;
    if (this.whipTicks > 0) this.whipTicks--;

    if (!this.climbing && !this.swinging && !this.whipping) this.tryGrabLadder(input);
    if (this.climbing) {
      this.climb(input);
      return;
    }
    if (this.swinging) {
      this.swing(input);
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

    // Horizontal: accelerate toward held direction; friction only on the
    // ground. Airborne momentum is preserved (no air drag), so a swing fling
    // or an air whip keeps its arc; steering against it still decelerates.
    // While whipping, input is ignored.
    const dir = this.whipping ? 0 : (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir !== 0) {
      this.facing = dir > 0 ? 1 : -1;
      const speedAlong = this.vx * dir; // signed speed in the held direction
      let next: number;
      if (speedAlong > WALK_MAX) {
        // Excess momentum (a swing fling): holding into it never clamps it
        // away — it carries in the air and bleeds off through ground friction
        // back toward run speed after landing.
        next = this.grounded ? Math.max(WALK_MAX, speedAlong - FRICTION) : speedAlong;
      } else {
        next = Math.min(speedAlong + WALK_ACCEL, WALK_MAX);
      }
      this.vx = next * dir;
    } else if (this.grounded) {
      if (this.vx > 0) this.vx = Math.max(0, this.vx - FRICTION);
      else if (this.vx < 0) this.vx = Math.min(0, this.vx + FRICTION);
    }

    // Vertical: gravity, jump, variable height via early release.
    this.vy = Math.min(this.vy + GRAVITY, FALL_MAX);

    // Glider (carrying a Large Bat): holding jump while descending caps the fall
    // to a slow, steady drift. Jumping up and releasing jump are unaffected.
    if (this.canGlide && input.a && this.vy > 0) {
      this.vy = Math.min(this.vy, GLIDE_FALL_MAX);
    }

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
    if (this.grounded && !wasGrounded) this.landTicks = LAND_TICKS;

    // The lash latching onto a grapple ring turns the whip into a rope.
    if (this.whipping) this.tryLatch();
  }

  // --- Swing ---

  // Latch when the live lash passes within LATCH_RADIUS of a ring's anchor.
  // No grounded/airborne special case (it's the level designer's job to
  // place rings where a grounded latch makes sense).
  private tryLatch(): void {
    const seg = this.whipSegment(this.x, this.y);
    if (!seg) return;
    for (const gp of this.level.grapplePoints) {
      if (segmentPointDistance(seg, gp.x, gp.y) <= LATCH_RADIUS) {
        this.enterSwing(gp.x, gp.y);
        return;
      }
    }
  }

  private enterSwing(ax: number, ay: number): void {
    const hx = this.x + PLAYER_W / 2;
    const hy = this.y;
    const dist = Math.hypot(hx - ax, hy - ay);
    this.swingLen = Math.max(DEFAULT_SWING_LEN, dist);
    this.swingAnchorX = ax;
    this.swingAnchorY = ay;
    this.swinging = true;
    // A latch already at/past the rope length arcs at once; a closer one
    // free-falls (slack rope) until the rope reaches swingLen, then catches.
    this.swingTaut = dist >= this.swingLen;
    if (this.swingTaut) {
      this.swingAngle = Math.atan2(hx - ax, hy - ay);
      // Carry momentum onto the arc: the tangential component of the current
      // velocity becomes angular velocity, so an airborne latch keeps its arc.
      this.swingVel =
        (this.vx * Math.cos(this.swingAngle) - this.vy * Math.sin(this.swingAngle)) /
        this.swingLen;
    }
    // Slack case: keep current vx/vy; angle + swingVel are set at the taut catch.
    this.whipTicks = 0; // the whip IS the rope now
    this.grounded = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
  }

  private swing(input: Input): void {
    // Either button exits, releasing with full tangential momentum. (A is the
    // jump button, so the usual jump-cut caps upward speed if let go early.)
    if (input.aPressed || input.bPressed) {
      this.releaseSwing();
      return;
    }

    if (!this.swingTaut) {
      // Slack rope: the same air gravity + steering as a normal fall, until
      // the rope reaches swingLen and the pendulum catches.
      const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      if (dir !== 0) {
        this.facing = dir > 0 ? 1 : -1;
        const speedAlong = this.vx * dir;
        this.vx =
          (speedAlong > WALK_MAX ? speedAlong : Math.min(speedAlong + WALK_ACCEL, WALK_MAX)) *
          dir;
      }
      this.vy = Math.min(this.vy + GRAVITY, FALL_MAX);
      this.moveX(this.vx);
      this.moveY(this.vy);
      if (this.grounded) {
        // Hit a floor before the rope caught: abandon the swing, resume normal.
        this.swinging = false;
        return;
      }
      const hx = this.x + PLAYER_W / 2;
      const hy = this.y;
      if (Math.hypot(hx - this.swingAnchorX, hy - this.swingAnchorY) >= this.swingLen) {
        this.goTaut(hx, hy);
      }
      return;
    }

    // Pendulum step: gravity torque plus an input pump (which can start a
    // swing from rest after a grounded latch), capped by tangential speed.
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir !== 0) this.facing = dir > 0 ? 1 : -1;
    this.swingVel -= (GRAVITY / this.swingLen) * Math.sin(this.swingAngle);
    if (dir !== 0) this.swingVel += dir * SWING_PUMP;
    else this.swingVel *= SWING_IDLE_DAMPING;
    const maxVel = SWING_MAX_TANGENT / this.swingLen;
    this.swingVel = Math.max(-maxVel, Math.min(maxVel, this.swingVel));
    const startAngle = this.swingAngle;
    this.swingAngle += this.swingVel;

    // Move along the arc with the normal solid sweeps. If a solid clamps the
    // move, re-derive the pendulum from where we actually ended up: momentum
    // dies on impact and the rope drags along surfaces instead of snapping.
    const targetX =
      this.swingAnchorX + Math.sin(this.swingAngle) * this.swingLen - PLAYER_W / 2;
    const targetY = this.swingAnchorY + Math.cos(this.swingAngle) * this.swingLen;
    this.moveX(targetX - this.x);
    this.moveY(targetY - this.y);
    if (Math.abs(this.x - targetX) > 0.01 || Math.abs(this.y - targetY) > 0.01) {
      const actual = Math.atan2(
        this.x + PLAYER_W / 2 - this.swingAnchorX,
        this.y - this.swingAnchorY,
      );
      this.swingVel = angleDiff(actual, startAngle);
      this.swingAngle = actual;
    }
  }

  private releaseSwing(): void {
    // Tangential direction of the hand's circular motion.
    this.vx = Math.cos(this.swingAngle) * this.swingVel * this.swingLen;
    this.vy = -Math.sin(this.swingAngle) * this.swingVel * this.swingLen;
    this.swinging = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
  }

  // The slack rope reaches full length: snap onto the circle and convert the
  // fall into a swing, keeping only the tangential speed (the rope eats the
  // inward/radial component).
  private goTaut(hx: number, hy: number): void {
    this.swingAngle = Math.atan2(hx - this.swingAnchorX, hy - this.swingAnchorY);
    this.x = this.swingAnchorX + Math.sin(this.swingAngle) * this.swingLen - PLAYER_W / 2;
    this.y = this.swingAnchorY + Math.cos(this.swingAngle) * this.swingLen;
    this.swingVel =
      (this.vx * Math.cos(this.swingAngle) - this.vy * Math.sin(this.swingAngle)) /
      this.swingLen;
    this.swingTaut = true;
  }

  // Rope attachment point (the hand), for the renderer.
  handX(alpha: number): number {
    return this.drawX(alpha) + PLAYER_W / 2;
  }

  handY(alpha: number): number {
    return this.drawY(alpha);
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
    const hDir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const vDir = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    this.vx = hDir * CLIMB_SPEED;
    this.vy = vDir * CLIMB_SPEED;
    this.moveX(this.vx);
    this.moveY(this.vy);

    // Blocked vertical climb while the body straddles into a neighbor column:
    // slide back onto the ladder's column so the clear shaft opens up. moveY
    // zeroes vy only on a collision, so vy === 0 after an intended move means
    // we were blocked. Only when the player isn't steering left/right — that's
    // "leave the ladder" intent, handled by the release check below.
    if (vDir !== 0 && this.vy === 0 && hDir === 0) {
      const targetX = this.centerTileX() * TILE + (TILE - PLAYER_W) / 2;
      const dx = targetX - this.x;
      if (Math.abs(dx) > 0.01) {
        this.moveX(Math.max(-CLIMB_SPEED, Math.min(CLIMB_SPEED, dx)));
        // A downward block set a false "landing"; clear it so the recenter
        // isn't released as if we hit the floor. If the ladder column itself
        // is the floor, next tick we're centered, blocked again, and release
        // normally.
        this.grounded = false;
      }
    }

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

// Distance from a segment to a point, for the ring latch test.
function segmentPointDistance(
  seg: { x1: number; y1: number; x2: number; y2: number },
  px: number,
  py: number,
): number {
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  const lenSq = dx * dx + dy * dy;
  const t =
    lenSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - seg.x1) * dx + (py - seg.y1) * dy) / lenSq));
  return Math.hypot(px - (seg.x1 + t * dx), py - (seg.y1 + t * dy));
}

// Signed shortest angular difference a - b, wrapped to (-PI, PI].
function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}
