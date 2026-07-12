import { TILE, GRID_W, GRID_H, VIEW_W, VIEW_H, TICK_HZ } from "./config";
import {
  Level,
  Tile,
  parseLevel,
  type LevelInput,
  type EnemyKind,
  type TreasurePotKind,
  type BounceOnionKind,
} from "./level";
import { Input } from "./input";
import { ReplaySource } from "./replay";
import { Art } from "./art";
import { Player, PLAYER_W, PLAYER_H } from "./player";
import { Enemy, spawnEnemies, Spawner, buildSpawners } from "./enemy";
import { Lighting, LightMode } from "./lighting";
import { Settings, LIGHT_FLOOR_MAX } from "./settings";
import { Sfx } from "./audio";
import { Sprite } from "./sprite";
import { drawSpikeSegment, spikeHitboxes, SPIKE_SCALE, SPIKE_CROSS_ASPECT } from "./spikes";
import { drawText } from "./text";
import {
  barFill,
  curseRamp,
  crunchColor,
  CURSE_PALETTE,
  hash01,
  formatClock,
  CURSE_START_TICKS,
  COIN_TICKS,
  CURSE_HIT_TICKS,
  CLOUD_TICKS,
  CLOUD_ATTACH_TICKS,
  CURSE_PARTICLE_TICKS,
  CURSE_EMIT_PER_TICK,
  CLOUD_W,
  CLOUD_H,
  POPUP_TICKS,
  COIN_SECONDS,
  CURSE_HIT_SECONDS,
  BAR_PX,
  DANGER_SECONDS,
} from "./curse";

const COLORS = {
  background: "#000000",
  player: "#d96a3b",
  playerDying: "#ffffff",
  whip: "#d9b36a",
  shatter: "#e8e4d8",
};

const IRIS_TICKS = Math.round(1.0 * TICK_HZ); // iris open/close transition (1s)
const IRIS_MIN_RADIUS = 14; // tight circle around the player at the closed end
const DEATH_TICKS = Math.round(0.8 * TICK_HZ); // touch kills: blink, then restart
const HELD_BLINK_TICKS = 1 * TICK_HZ; // held box flashes this long before waking
const STOMP_BOUNCE = -2.5;
const EFFECT_TICKS = 14;

// Bounce onion (trampoline pad): launch impulse given to whatever lands on top.
// Stronger than a normal jump so it clears several tiles. The squash animation
// plays for ONION_SQUASH_TICKS after a launch.
const ONION_LAUNCH = -6;
const ONION_SQUASH_TICKS = 10;
const FOOTSTEP_INTERVAL = 16; // ticks between footstep SFX while walking (~3.7/s)
// Explosive onion blast: anything (enemy or player) whose center is within this
// radius of the onion center when it detonates is killed.
const ONION_BLAST_R = 24;

// Treasure: a whipped pot spills coins; the altar pot bursts into one giant
// coin (the intro trigger). Coin motion is deterministic — no Math.random in
// the sim (seeded levels depend on it) — so the spread is a fixed fan.
const POT_COINS = 4; // coins spilled by a normal pot
// Collision/rest boxes match the drawn sprite so coins rest ON the floor, not
// sunk into it. The coin art fills its 16px frame; small coins draw at 0.5x
// (8px) and the giant at 2x (32px) — see COIN_SCALE / drawPickups.
const COIN_W = 8;
const COIN_H = 8;
const GIANT_W = 32;
const GIANT_H = 32;
const COIN_SCALE = 0.5; // small coins render at half the sprite's native size
const COIN_GRAVITY = 0.25; // px/tick^2
const COIN_FALL_MAX = 4;
const COIN_POP_SPEED = 1.6; // initial burst speed
const COIN_BOUNCE = 0.4; // wall rebound retained fraction
const COIN_FRICTION = 0.8; // ground horizontal damping per landing
const GIANT_POP_VY = -1.6; // the giant coin hops up out of the altar

// Intro curse cutscene (Act 2): the screen convulses, the words splat in, then
// a tutorial dialog waits for input before the descent. All tick-scheduled.
const CURSE_STRIKE_TICKS = 230; // shaking + flicker phase (~3.8s, through CURSED)
const DIALOG_AT = 300; // tutorial dialog appears (~1.5s after CURSED lands)
// Word splats land at 1.5s / 2.5s / 3.5s (60Hz).
const WORD_YOU_AT = 90;
const WORD_ARE_AT = 150;
const WORD_CURSED_AT = 210;
const CURSE_GRAVITY = 0.22; // puppet bounce gravity while the player is tossed
const SHAKE_X = 6; // peak screenshake amplitude (px)
const SHAKE_Y = 5;
const CURSE_PURPLE = "#c9a0ff";
const CURSE_RED = "#e0506a";
const COIN_GOLD = "#ffd86b"; // floating "+Ns" treasure-gain popup color

// Effective whip lash thickness: enemy hitboxes are inflated by this much in
// the hit test so grazing the target still connects (the drawn lash is 1px,
// which felt stingy — especially against the 10px-tall Snake).
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

// A level containing any glass "window" tile renders with a raised base light
// floor (added to the player's brightness slider, then capped at the slider's
// own max). Flat boost on presence — the number of glass tiles doesn't matter.
const GLASS_LIGHT_BOOST = 0.2;

// On top of the base-light lift, each glass tile also casts a local radial pool
// like a light statue — softer/smaller, since glass is placeable in bulk.
const GLASS_LIGHT_FULL = 28;
const GLASS_LIGHT_FADE = 120;

// Carry: the held box rides just above the player's head.
const CARRY_GAP = 1;
// Throw: leaves from chest height, nudged forward so it clears the body.
const THROW_OFF_X = 8;
const THROW_OFF_Y = 10;

interface Effect {
  x: number; // center of the burst
  y: number;
  ticks: number;
  kind: "shatter" | "snakeHit" | "boom" | "batHit" | "frogHit" | "onionBoom" | "curseShatter";
}

// A lingering cloud of cursed energy left by a shattered cursed pot. Touching
// it costs time (purple = attacks your clock); it fades after CLOUD_TICKS.
// A single mote of cursed energy, emitted by a cloud. Drifts and fades, then
// times out — so when its emitter moves, old motes linger in place while new
// ones spawn at the new spot (the cloud flows instead of teleporting).
interface CurseParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ticks: number; // remaining life
  life: number; // total life (for the fade)
  size: number; // blob radius (px)
}

// A cursed-energy emitter. Spawns motes from (x,y) while `ticks > 0`; after that
// it stops emitting and lingers only until its last mote dies. Dangerous (one
// −10 bite) while still emitting; on the bite it attaches and the emitter
// follows the player for a cling window.
interface CurseCloud {
  x: number; // emitter position px (follows the player while attached)
  y: number;
  ticks: number; // remaining emit time; dangerous while > 0
  attached: boolean; // clinging to the player after a touch
  seq: number; // deterministic per-mote emission seed
  particles: CurseParticle[];
}

// Floating "+3s" / "-10" arithmetic that prints on every clock transaction
// (design doc §6: the player learns exchange rates without a manual).
interface Popup {
  text: string;
  color: string;
  x: number; // spawn center px (drifts upward as it ages)
  y: number;
  ticks: number;
}

// Cannon shot: a horizontal bolt. Kills the player; stops at walls; passes
// through enemies (the Cannon doesn't fear its own kin).
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

// A pot from the level, plus its runtime break state (the Level itself stays
// immutable so a restart re-arms every pot).
interface PotState {
  kind: TreasurePotKind;
  tx: number;
  ty: number;
  x: number; // tile center px
  y: number;
  broken: boolean;
}

// A bounce onion from the level, plus its runtime state. A plain pad is
// indestructible and only tracks a transient squash animation; an explosive
// pad detonates once (then `exploded` hides it; the boom effect covers it).
interface BounceOnionState {
  kind: BounceOnionKind;
  tx: number;
  ty: number;
  x: number; // tile center px
  y: number;
  exploded: boolean;
  squash: number; // ticks of squash animation remaining after a launch
}

// A loose coin spilled from a pot. x/y are the CENTER (coins draw centered and
// collide as a small box around it). prevX/prevY interpolate the render.
interface Pickup {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  giant: boolean; // the altar's single big coin (ends the intro's Act 1)
  anim: number;
}

export class Game {
  private level!: Level;
  private player!: Player;
  private enemies: Enemy[] = [];
  private spawners: Spawner[] = [];
  private levelIndex = 0;
  private held: Enemy | null = null;
  private effects: Effect[] = [];
  private shots: Shot[] = [];
  private pots: PotState[] = []; // breakable treasure containers
  private bounceOnions: BounceOnionState[] = []; // trampoline pads / bombs
  private pickups: Pickup[] = []; // loose coins in flight / on the floor
  // The curse clock: a RUN-LONG resource (ticks). Treasure tops it up, cursed
  // energy drains it; at zero the curse takes you. It survives loadLevel and
  // body-death (see restart) — only a clock-zero death refills it.
  private curseTicks = CURSE_START_TICKS;
  private curseDeath = false; // set when the clock (not a touch) caused the death
  private curseClouds: CurseCloud[] = []; // lingering cursed energy to dodge
  private popups: Popup[] = []; // floating +/- clock arithmetic
  private irisInTicks = 0; // >0 while the opening iris reveals a new level
  private irisOutTicks = 0; // >0 while the closing iris wipes out to the exit
  private deathTimer = 0; // >0 while showing the death blink
  private introMode = false; // true while the intro level runs its scripted flow
  private cutsceneTick = -1; // >=0 while the curse cutscene plays (counts up)
  private shakeX = 0; // current screenshake offset (px), applied in render
  private shakeY = 0;
  private cutsceneFloorY = 0; // player's resting y captured at the curse strike
  private cutsceneBaseX = 0; // player's x captured at the curse strike
  private readonly isTouch =
    typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  // Statue images for spawner landmarks (grayscale takes of the monster),
  // one dim/lit pair per enemy kind so each spawner shows its own monument.
  private readonly statues: Record<EnemyKind, { dim: OffscreenCanvas; lit: OffscreenCanvas }>;
  // Darkening pass (reproduces the authored Dark/Very Dark art). Dev toggle
  // (L) flips between per-tile (art-faithful, blocky) and per-pixel (smooth).
  private readonly lighting = new Lighting();
  private lightMode: LightMode = "tile";
  // N toggles linear ramp vs plateau (snap to normal/Dark/Very Dark) response.
  private lightNonlinear = false;
  // Free-running render counter for cosmetic-only pulsing (curse sheen, cloud
  // swirl, bar embers). Render-side, not part of the sim.
  private animTick = 0;
  // Scratch buffer the cursed-energy clouds accumulate their overlap field into
  // (so overlap indexes a palette, rather than additively summing to white).
  private curseScratch: OffscreenCanvas | null = null;
  // Footstep SFX cadence: counts down while walking; 0 = play a step and reload.
  private footstepTick = 0;

  constructor(
    private readonly ctx: OffscreenCanvasRenderingContext2D,
    private readonly art: Art,
    private readonly input: Input,
    private readonly settings: Settings,
    private readonly sfx: Sfx,
    private readonly levels: readonly LevelInput[],
    private readonly replay: ReplaySource,
  ) {
    // The statue is the monster's dormant pose, set in stone. Each kind derives
    // its monument from a representative frame of its own sprite.
    const statueOf = (s: Sprite) => ({
      dim: s.statue(s.lastFrame, STATUE_DIM),
      lit: s.statue(s.lastFrame, STATUE_LIT),
    });
    this.statues = {
      snake: statueOf(art.snake),
      troll: statueOf(art.troll),
      smallTroll: statueOf(art.smallTroll.walk),
      frog: statueOf(art.frog.still),
      cannon: statueOf(art.cannonIdle),
      smallBat: statueOf(art.smallBat.fly),
      largeBat: statueOf(art.largeBat.fly),
    };
    this.loadLevel(0);
  }

  // Reload the current level to its clean start state. The intro recorder and
  // replay both call this so a recorded run and its playback begin from an
  // identical sim state (required for deterministic replay).
  reload(): void {
    this.loadLevel(this.levelIndex);
  }

  // Arm the intro's scripted flow on the current (intro) level: grabbing the
  // altar's giant coin will spring the curse handoff. Call right after reload()
  // so the recorded tape and the flow start from the same clean tick.
  beginIntro(): void {
    this.introMode = true;
  }

  // (Re)build the whole play state from a level's ASCII. Used for boot,
  // restarts (same index), and advancing after a clear (next index).
  private loadLevel(index: number): void {
    // Switching to a different level cancels any intro tape that's playing (a
    // same-index reload — used to set the tape's start state — does not).
    if (index !== this.levelIndex) this.replay.stop();
    this.levelIndex = index;
    this.level = parseLevel(this.levels[index]);
    this.player = new Player(this.level);
    this.enemies = spawnEnemies(this.level);
    this.spawners = buildSpawners(this.level);
    this.held = null;
    this.effects = [];
    this.shots = [];
    this.pots = this.level.treasurePots.map((p) => ({ ...p, broken: false }));
    this.bounceOnions = this.level.bounceOnions.map((o) => ({
      ...o,
      exploded: false,
      squash: 0,
    }));
    this.pickups = [];
    this.irisInTicks = IRIS_TICKS; // play the opening iris when a level loads
    this.irisOutTicks = 0;
    this.deathTimer = 0;
    this.introMode = false; // re-armed explicitly via beginIntro() if needed
    this.cutsceneTick = -1;
    this.shakeX = 0;
    this.shakeY = 0;
    // The curse clock is run-long — it is deliberately NOT reset here, so it
    // carries over as the player descends to the next level.
    this.curseClouds = [];
    this.popups = [];
  }

  update(): void {
    this.input.poll();

    if (this.input.restartPressed) {
      this.restart();
      return;
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

    if (this.irisInTicks > 0) {
      this.irisInTicks--;
      return; // freeze gameplay while the level opens
    }
    if (this.irisOutTicks > 0) {
      // Advance to the next level (looping for now — no ending yet) once the
      // iris has closed fully.
      if (--this.irisOutTicks === 0) {
        this.loadLevel((this.levelIndex + 1) % this.levels.length);
      }
      return; // freeze gameplay while the iris closes
    }
    if (this.deathTimer > 0) {
      if (--this.deathTimer === 0) this.restart();
      return;
    }
    if (this.cutsceneTick >= 0) {
      this.updateCutscene();
      return; // the curse cutscene owns the sim while it plays
    }

    // Carrying a Large Bat turns it into a glider: while it's in hand, holding
    // jump during a fall lets the player drift down slowly (capped in player.ts).
    this.player.canGlide =
      this.held?.kind === "largeBat" && this.held.state === "held";

    // Snapshot pre-update state so we can detect the whip swing (whipId bumps
    // inside player.update) and the landing edge (grounded rises) for SFX.
    const wasGrounded = this.player.grounded;
    const prevWhipId = this.player.whipId;

    this.player.update(this.input);

    if (this.player.whipId !== prevWhipId) this.sfx.play("whip");
    const justLanded = this.player.grounded && !wasGrounded;
    if (justLanded) this.sfx.play("hitGround");
    // Footsteps: a steady cadence while walking on the ground (not the landing
    // tick, which already thumped). Reset when idle/airborne so the first step
    // after moving off plays promptly.
    if (this.player.grounded && !justLanded && Math.abs(this.player.vx) > 0.1) {
      if (this.footstepTick <= 0) {
        this.sfx.play("footstep");
        this.footstepTick = FOOTSTEP_INTERVAL;
      } else {
        this.footstepTick--;
      }
    } else {
      this.footstepTick = 0;
    }

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
    this.applyBounceOnions();
    this.updatePickups();
    this.collectPickups();
    this.checkPlayerDeath();
    this.checkSpikeDeath();
    this.updateCurse();

    for (const fx of this.effects) fx.ticks--;
    this.effects = this.effects.filter((fx) => fx.ticks > 0);

    if (this.deathTimer === 0 && this.touchingExit()) {
      this.irisOutTicks = IRIS_TICKS;
      this.sfx.play("exit");
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
      const wasHanging = e.state === "hanging"; // bat about to swoop?
      const impact = e.update(playerRect);
      if (wasHanging && e.state === "diving") this.sfx.play("bat");

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

      if (e.kind === "cannon" && e.fired) {
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

      if (
        e.kind === "snake" ||
        e.kind === "cannon" ||
        e.kind === "smallBat" ||
        e.kind === "frog"
      ) {
        this.killEnemy(e); // one whip hit kills (the Cannon's defense is range)
        this.sfx.play("hit");
      } else if (e.kind === "troll") {
        // Large Troll: the whip only stuns it (stunnable is already false during
        // the post-revive immunity); it can't be grabbed and only dies to a
        // thrown object.
        if (e.stunnable) {
          e.stun();
          this.sfx.play("hit");
        }
      } else if (e.stunnable) {
        e.stun(); // Small Troll: first hit stuns
        this.sfx.play("hit");
      } else if (e.state === "stunned" && !this.held) {
        e.startYank(); // ...second hit reels it into the hands over a short pull
        this.held = e;
        this.player.holding = true;
        this.sfx.play("pickUp");
      }
    }

    // The lash also shatters treasure pots it crosses.
    for (const pot of this.pots) {
      if (pot.broken) continue;
      const b = potBox(pot);
      if (
        segmentHitsRect(seg, b.x, b.y, b.w, b.h) ||
        (segPrev && segmentHitsRect(segPrev, b.x, b.y, b.w, b.h))
      ) {
        this.breakPot(pot);
      }
    }

    // ...and detonates explosive onions it crosses (a safe ranged trigger).
    for (const onion of this.bounceOnions) {
      if (onion.kind !== "explosiveBounce" || onion.exploded) continue;
      const b = onionBox(onion);
      if (
        segmentHitsRect(seg, b.x, b.y, b.w, b.h) ||
        (segPrev && segmentHitsRect(segPrev, b.x, b.y, b.w, b.h))
      ) {
        this.detonateOnion(onion);
      }
    }
  }

  // Shatter a pot: a normal one fans out a handful of coins; the altar pot
  // bursts into a single giant coin. Deterministic spread (no Math.random).
  private breakPot(pot: PotState): void {
    pot.broken = true;
    // A cursed pot spills no treasure — it bursts into a cloud of cursed energy
    // that lingers on the floor as a clock hazard to dodge (design doc §7).
    if (pot.kind === "cursed") {
      this.effects.push({ x: pot.x, y: pot.y, ticks: EFFECT_TICKS, kind: "curseShatter" });
      this.curseClouds.push({
        x: pot.x,
        y: (pot.ty + 1) * TILE - CLOUD_H / 2, // emit from the cell floor
        ticks: CLOUD_TICKS,
        attached: false,
        seq: 0,
        particles: [],
      });
      return;
    }
    this.effects.push({ x: pot.x, y: pot.y, ticks: EFFECT_TICKS, kind: "shatter" });
    if (pot.kind === "altar") {
      this.pickups.push({
        x: pot.x,
        y: pot.y - 2,
        prevX: pot.x,
        prevY: pot.y - 2,
        vx: 0,
        vy: GIANT_POP_VY,
        w: GIANT_W,
        h: GIANT_H,
        giant: true,
        anim: 0,
      });
      return;
    }
    for (let i = 0; i < POT_COINS; i++) {
      // Fan across the top half (0..PI): cos -> sideways, sin -> upward.
      const a = (Math.PI * (i + 0.5)) / POT_COINS;
      this.pickups.push({
        x: pot.x,
        y: pot.y,
        prevX: pot.x,
        prevY: pot.y,
        vx: Math.cos(a) * COIN_POP_SPEED,
        vy: -Math.sin(a) * COIN_POP_SPEED - 0.6,
        w: COIN_W,
        h: COIN_H,
        giant: false,
        anim: i, // stagger the shimmer so they don't pulse in lockstep
      });
    }
  }

  // Loose-coin physics: gravity, walls rebound, floor catches (solids and the
  // tops of one-way platforms). Coins use center coords.
  private updatePickups(): void {
    for (const p of this.pickups) {
      p.prevX = p.x;
      p.prevY = p.y;
      p.anim++;
      p.vy = Math.min(p.vy + COIN_GRAVITY, COIN_FALL_MAX);
      const half = p.w / 2;

      p.x += p.vx;
      const row = Math.floor(p.y / TILE);
      if (p.vx > 0) {
        const tx = Math.floor((p.x + half) / TILE);
        if (this.level.isSolid(tx, row)) {
          p.x = tx * TILE - half;
          p.vx = -p.vx * COIN_BOUNCE;
        }
      } else if (p.vx < 0) {
        const tx = Math.floor((p.x - half) / TILE);
        if (this.level.isSolid(tx, row)) {
          p.x = (tx + 1) * TILE + half;
          p.vx = -p.vx * COIN_BOUNCE;
        }
      }

      p.y += p.vy;
      if (p.vy > 0) {
        const ty = Math.floor((p.y + half) / TILE);
        const col = Math.floor(p.x / TILE);
        const onPlatform =
          this.level.isPlatform(col, ty) && p.prevY + half <= ty * TILE;
        if (this.level.isSolid(col, ty) || onPlatform) {
          p.y = ty * TILE - half;
          p.vy = 0;
          p.vx *= COIN_FRICTION;
        }
      }
    }
  }

  // Player overlap collects coins. The giant coin additionally ends the
  // intro's Act 1 (see onGiantCoinGrabbed).
  private collectPickups(): void {
    if (this.deathTimer > 0) return;
    const px = this.player.x;
    const py = this.player.y;
    let gotGiant = false;
    this.pickups = this.pickups.filter((p) => {
      const l = p.x - p.w / 2;
      const t = p.y - p.h / 2;
      const hit =
        px < l + p.w &&
        px + PLAYER_W > l &&
        py < t + p.h &&
        py + PLAYER_H > t;
      if (!hit) return true;
      // The giant coin's pickup is the curse trigger — no sparkle pop; the
      // cutscene owns that moment. Normal coins sparkle.
      if (p.giant) {
        gotGiant = true;
      } else {
        this.effects.push({ x: p.x, y: p.y, ticks: EFFECT_TICKS, kind: "shatter" });
        this.curseTicks += COIN_TICKS; // treasure = seconds (design doc §6)
        this.pushPopup(`+${COIN_SECONDS}`, COIN_GOLD, p.x, p.y - p.h / 2);
      }
      return false;
    });
    if (gotGiant) this.onGiantCoinGrabbed();
  }

  // Hook for the intro: grabbing the altar's giant coin springs the curse.
  // Only fires during the scripted intro flow (not while free-playing the
  // level or recording a tape). Hands off to the Act-2 curse cutscene.
  private onGiantCoinGrabbed(): void {
    if (!this.introMode) return;
    this.introMode = false;
    this.cutsceneTick = 0;
    this.cutsceneFloorY = this.player.y; // bounce on the spot the coin was grabbed
    this.cutsceneBaseX = this.player.x;
    this.player.holding = false;
    void this.art.introSpeech.play().catch(() => {}); // user already gestured
  }

  // Curse cutscene step. The strike phase shakes the screen, tosses the player
  // and splats the words in; then a tutorial dialog waits for any input before
  // the iris wipes out to Level 1.
  private updateCutscene(): void {
    const t = this.cutsceneTick;

    if (t <= CURSE_STRIKE_TICKS) {
      const env = 1 - t / CURSE_STRIKE_TICKS; // shake decays across the strike
      this.shakeX = Math.round(Math.sin(t * 1.7) * SHAKE_X * env);
      this.shakeY = Math.round(Math.cos(t * 2.3) * SHAKE_Y * env);
      this.bouncePlayer(t);
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }

    // Dialog phase: dismiss on any input (after a short lockout so a held key
    // from the run can't skip it instantly), then advance to Level 1.
    if (t > DIALOG_AT + 8 && this.cutsceneDismissed()) {
      this.cutsceneTick = -1;
      this.shakeX = 0;
      this.shakeY = 0;
      this.irisOutTicks = IRIS_TICKS;
      return;
    }

    this.cutsceneTick++;
  }

  // Puppet the player: a few scripted kicks plus gravity, bouncing on the floor
  // line captured at the strike. Deterministic (no Math.random).
  private bouncePlayer(t: number): void {
    const p = this.player;
    p.prevX = p.x;
    p.prevY = p.y;
    if (t === 0) {
      p.vy = -3.4;
      p.vx = 1.6;
    } else if (t === 24) {
      p.vy = -3.0;
      p.vx = -1.8;
    } else if (t === 52) {
      p.vy = -3.2;
      p.vx = 1.4;
    } else if (t === 88) {
      p.vy = -2.6;
      p.vx = -1.2;
    }
    p.vy += CURSE_GRAVITY;
    p.x += p.vx;
    p.y += p.vy;
    if (p.y >= this.cutsceneFloorY) {
      p.y = this.cutsceneFloorY;
      p.vy = Math.abs(p.vy) < 0.6 ? 0 : -p.vy * 0.45; // bounce, settle
      p.vx *= 0.6;
    }
    // Don't let the flailing wander far from the altar.
    const dx = p.x - this.cutsceneBaseX;
    if (Math.abs(dx) > 24) {
      p.x = this.cutsceneBaseX + Math.sign(dx) * 24;
      p.vx = -p.vx * 0.5;
    }
  }

  private cutsceneDismissed(): boolean {
    const i = this.input;
    return i.aPressed || i.bPressed || i.left || i.right || i.up || i.down;
  }

  // Landing on a stunned enemy kills it (the whip itself never kills the
  // person tier — stomps and thrown objects do).
  private applyStomps(): void {
    const prevBottom = this.player.prevY + PLAYER_H;
    const bottom = this.player.y + PLAYER_H;
    for (const e of this.enemies) {
      if (!e.alive || e.state !== "stunned") continue;
      // The Large Troll dies only to a thrown object — a stomp just bounces off.
      if (e.kind === "troll") continue;
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

  // Bounce onions. A plain pad launches whatever descends onto its top (the
  // player, or a thrown enemy) and plays a squash; it's indestructible and
  // repeatable. An explosive pad detonates on contact (player or thrown enemy).
  private applyBounceOnions(): void {
    const prevBottom = this.player.prevY + PLAYER_H;
    const bottom = this.player.y + PLAYER_H;
    let detonated = false;
    for (const o of this.bounceOnions) {
      if (o.squash > 0) o.squash--;
      if (o.exploded) continue;
      const b = onionBox(o);

      if (o.kind === "explosiveBounce") {
        // Triggered bomb: player overlap or a thrown enemy touching it.
        const playerHit =
          this.player.x < b.x + b.w &&
          this.player.x + PLAYER_W > b.x &&
          this.player.y < b.y + b.h &&
          this.player.y + PLAYER_H > b.y;
        const thrownHit = this.enemies.some(
          (e) => e.alive && e.state === "thrown" && e.overlaps(b.x, b.y, b.w, b.h),
        );
        if (playerHit || thrownHit) {
          this.detonateOnion(o);
          detonated = true;
        }
        continue;
      }

      // Trampoline: launch the player when their feet descend onto the top.
      const overlapX =
        this.player.x < b.x + b.w && this.player.x + PLAYER_W > b.x;
      if (overlapX && prevBottom <= b.y + 3 && bottom >= b.y && this.player.vy >= 0) {
        this.player.y = b.y - PLAYER_H;
        this.player.vy = ONION_LAUNCH;
        o.squash = ONION_SQUASH_TICKS;
        this.sfx.play("bounce");
      }
      // ...and launch thrown enemies that land on it (a fun ricochet).
      for (const e of this.enemies) {
        if (!e.alive || e.state !== "thrown") continue;
        if (e.vy >= 0 && e.overlaps(b.x, b.y, b.w, b.h)) {
          e.vy = ONION_LAUNCH;
          o.squash = ONION_SQUASH_TICKS;
          this.sfx.play("bounce");
        }
      }
    }
    if (detonated) this.enemies = this.enemies.filter((e) => e.alive);
  }

  // Detonate an explosive onion: burst effect, kill every enemy within the
  // blast radius, and kill the player if they're caught in it.
  private detonateOnion(o: BounceOnionState): void {
    o.exploded = true;
    this.sfx.play("explosion");
    const cx = o.x;
    const cy = (o.ty + 1) * TILE - TILE / 2;
    this.effects.push({
      x: cx,
      y: cy,
      ticks: this.art.explosiveBounceOnion.explode.durationTicks,
      kind: "onionBoom",
    });
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const ex = e.x + e.w / 2;
      const ey = e.y + e.h / 2;
      if (Math.hypot(ex - cx, ey - cy) <= ONION_BLAST_R) this.killEnemy(e);
    }
    if (this.deathTimer === 0) {
      const px = this.player.x + PLAYER_W / 2;
      const py = this.player.y + PLAYER_H / 2;
      if (Math.hypot(px - cx, py - cy) <= ONION_BLAST_R) {
        this.deathTimer = DEATH_TICKS;
      }
    }
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

  private checkSpikeDeath(): void {
    const px = this.player.x;
    const py = this.player.y;
    for (const seg of this.level.spikeSegments) {
      for (const box of spikeHitboxes(seg, SPIKE_SCALE, SPIKE_CROSS_ASPECT)) {
        if (
          px < box.x + box.w &&
          px + PLAYER_W > box.x &&
          py < box.y + box.h &&
          py + PLAYER_H > box.y
        ) {
          this.deathTimer = DEATH_TICKS;
          return;
        }
      }
    }
  }

  // The clock is live once the curse has struck: not during the scripted intro,
  // and not while a transition/cutscene owns the sim. Gates draining and the HUD.
  private get curseActive(): boolean {
    return !this.introMode && this.cutsceneTick < 0;
  }

  // The curse economy each tick: drain the run-long clock, age cursed energy
  // and the floating arithmetic, dock time for standing in a cloud, and trigger
  // a curse death when the clock empties.
  private updateCurse(): void {
    for (const p of this.popups) {
      p.ticks--;
      p.y -= 0.4; // drift upward as it fades
    }
    this.popups = this.popups.filter((p) => p.ticks > 0);

    for (const c of this.curseClouds) {
      if (c.attached) {
        // Clinging cursed energy emits from (and rides along with) the player.
        c.x = this.player.x + PLAYER_W / 2;
        c.y = this.player.y + PLAYER_H / 2;
      }
      // Emit fresh motes while the emitter is still active.
      if (c.ticks > 0) {
        c.ticks--;
        for (let k = 0; k < CURSE_EMIT_PER_TICK; k++) {
          const s = c.seq++;
          const ang = hash01(s * 1.7) * Math.PI * 2;
          const spd = 0.2 + hash01(s * 2.3) * 0.6;
          // Spread the spawn a little wider when clinging to the player so the
          // cloud wraps the body rather than streaming from a single point.
          const spread = c.attached ? 15 : 10;
          c.particles.push({
            x: c.x + (hash01(s * 3.1) - 0.5) * spread,
            y: c.y + (hash01(s * 4.7) - 0.5) * spread,
            vx: Math.cos(ang) * spd,
            vy: -0.2 - hash01(s * 5.9) * 0.5, // drift upward like cursed smoke
            ticks: CURSE_PARTICLE_TICKS,
            life: CURSE_PARTICLE_TICKS,
            size: 3 + hash01(s * 6.3) * 4, // 3..7px
          });
        }
      }
      // Advance + age the motes.
      for (const pt of c.particles) {
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.vx *= 0.96;
        pt.vy *= 0.96;
        pt.ticks--;
      }
      c.particles = c.particles.filter((pt) => pt.ticks > 0);
    }
    // A cloud is gone once it has stopped emitting AND its last mote has died.
    this.curseClouds = this.curseClouds.filter(
      (c) => c.ticks > 0 || c.particles.length > 0,
    );

    if (!this.curseActive || this.deathTimer > 0) return;

    this.curseTicks--; // 1 sim tick of clock per tick = real-time countdown
    this.checkCurseClouds();

    if (this.curseTicks <= 0) {
      this.curseTicks = 0;
      this.curseDeath = true; // restart() refills the clock only for this death
      this.deathTimer = DEATH_TICKS;
    }
  }

  // Touching cursed energy costs ONE fixed chunk of time — each cloud bites
  // exactly once. That first touch makes the cloud ATTACH: it then clings to the
  // player for a few seconds (following them) purely as the "you got cursed"
  // visual, harmless from here on, before it fades and dies. Clouds already in
  // their fade-out tail never bite.
  private checkCurseClouds(): void {
    const px = this.player.x;
    const py = this.player.y;
    for (const c of this.curseClouds) {
      if (c.attached) continue; // already bit once — now just clinging
      if (c.ticks <= 0) continue; // done emitting -> harmless, just fading motes
      const bx = c.x - CLOUD_W / 2;
      const by = c.y - CLOUD_H / 2;
      if (
        px < bx + CLOUD_W &&
        px + PLAYER_W > bx &&
        py < by + CLOUD_H &&
        py + PLAYER_H > by
      ) {
        this.curseTicks -= CURSE_HIT_TICKS;
        this.pushPopup(
          `-${CURSE_HIT_SECONDS}`,
          CURSE_PURPLE,
          this.player.x + PLAYER_W / 2,
          this.player.y,
        );
        // Latch onto the player and keep emitting for a cling window; it won't
        // bite again (one −10 per cloud).
        c.attached = true;
        c.ticks = CLOUD_ATTACH_TICKS;
      }
    }
  }

  private pushPopup(text: string, color: string, x: number, y: number): void {
    this.popups.push({ text, color, x, y, ticks: POPUP_TICKS });
  }

  private killEnemy(e: Enemy): void {
    e.kill();
    const cx = e.x + e.w / 2;
    const cy = e.y + e.h / 2;
    if (e.kind === "snake") {
      const s = this.art.snakeHit;
      this.effects.push({ x: cx, y: cy, ticks: s.durationTicks, kind: "snakeHit" });
      return;
    }
    if (e.isBat) {
      const s = this.art.largeBat.hit;
      this.effects.push({ x: cx, y: cy, ticks: s.durationTicks, kind: "batHit" });
      return;
    }
    if (e.kind === "frog") {
      const s = this.art.frog.hit;
      this.effects.push({ x: cx, y: cy, ticks: s.durationTicks, kind: "frogHit" });
      return;
    }
    this.effects.push({ x: cx, y: cy, ticks: EFFECT_TICKS, kind: "shatter" });
  }

  private restart(): void {
    this.irisInTicks = 0;
    this.irisOutTicks = 0;
    this.deathTimer = 0;
    this.cutsceneTick = -1;
    this.shakeX = 0;
    this.shakeY = 0;
    this.player.respawn();
    this.enemies = spawnEnemies(this.level);
    for (const sp of this.spawners) sp.reset();
    this.held = null;
    this.effects = [];
    this.shots = [];
    this.pots = this.level.treasurePots.map((p) => ({ ...p, broken: false }));
    this.bounceOnions = this.level.bounceOnions.map((o) => ({
      ...o,
      exploded: false,
      squash: 0,
    }));
    this.pickups = [];
    // The curse clock is run-long: a body-death (touch/spike) keeps it. Only a
    // clock-zero death refills it — the stopgap for a real game-over/run flow.
    if (this.curseDeath) this.curseTicks = CURSE_START_TICKS;
    this.curseDeath = false;
    this.curseClouds = [];
    this.popups = [];
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
    this.animTick++;

    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // Screenshake: offset the whole world for one pass. The lighting pass below
    // reads back pixels via getImageData (which ignores the transform), so it's
    // restored first and then operates on the already-shaken buffer.
    ctx.save();
    ctx.translate(this.shakeX, this.shakeY);

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
    this.drawSpikes();

    // Background layer: glass windows, light statues and spawner statues sit
    // behind everything.
    this.drawGlass();
    this.drawLightStatues();
    for (const sp of this.spawners) this.drawSpawner(sp);
    this.drawPots();
    this.drawBounceOnions();

    for (const e of this.enemies) {
      if (e.alive) this.drawEnemy(e, alpha);
    }

    this.drawPickups(alpha);
    this.drawPlayer(alpha);
    this.drawWhip(alpha);
    this.drawRope(alpha);
    this.drawShots(alpha);
    this.drawEffects();

    ctx.restore(); // end screenshake offset before the lighting read-back

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
    for (const g of this.level.glassTiles) {
      this.lighting.addLight(g.x, g.y, GLASS_LIGHT_FULL, GLASS_LIGHT_FADE);
    }
    this.lighting.apply(
      ctx,
      this.lightMode,
      this.lightNonlinear,
      this.cutsceneLightFloor(),
    );

    // Cursed energy glows over the darkened scene (it is NOT dimmed by the
    // lighting pass), so it draws after lighting, under the screenshake.
    this.drawCurseClouds();

    if (this.irisInTicks > 0 || this.irisOutTicks > 0) {
      this.drawIris(ctx, alpha);
    }

    if (this.cutsceneTick >= 0) this.drawCutscene(ctx);

    // HUD on top of everything: the death bar, the countdown, the floating
    // arithmetic. Hidden until the curse is live (pre-curse intro shows none).
    if (this.curseActive) {
      this.drawCurseHud();
      this.drawPopups();
    }
  }

  // During the curse strike the lights convulse (flicker between black and a
  // surge); the dialog phase holds the room lit. Otherwise the normal floor.
  private cutsceneLightFloor(): number {
    const t = this.cutsceneTick;
    if (t < 0) {
      // Normal play: glass in the level lifts the base light, compounding with
      // the player's slider but never past the slider's own flatten cap.
      const boost = this.level.glassTiles.length > 0 ? GLASS_LIGHT_BOOST : 0;
      return Math.min(this.settings.lightFloor + boost, LIGHT_FLOOR_MAX);
    }
    if (t >= CURSE_STRIKE_TICKS) return 0.5; // keep the room readable for dialog
    const f = Math.sin(t * 0.8) * Math.sin(t * 0.31);
    return f > 0.3 ? 0.55 : 0.0;
  }

  // Iris transition: a black mask with a circular window centered on the
  // player. Opens (grows) on level load, closes (shrinks) toward the exit.
  private drawIris(ctx: OffscreenCanvasRenderingContext2D, alpha: number): void {
    const cx = this.player.drawX(alpha) + PLAYER_W / 2;
    const cy = this.player.drawY(alpha) + PLAYER_H / 2;

    // Reach the farthest corner so "fully open" reveals the whole screen and
    // doesn't keep growing past it.
    const maxR = Math.max(
      Math.hypot(cx, cy),
      Math.hypot(VIEW_W - cx, cy),
      Math.hypot(cx, VIEW_H - cy),
      Math.hypot(VIEW_W - cx, VIEW_H - cy),
    );

    // Interpolate the tick with alpha for smoothness above 60Hz, then smoothstep.
    const ticks = this.irisInTicks > 0 ? this.irisInTicks : this.irisOutTicks;
    let t = 1 - (ticks - alpha) / IRIS_TICKS;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ease = t * t * (3 - 2 * t);
    const radius =
      this.irisInTicks > 0
        ? IRIS_MIN_RADIUS + (maxR - IRIS_MIN_RADIUS) * ease // grow
        : maxR + (IRIS_MIN_RADIUS - maxR) * ease; // shrink

    // Black everywhere outside the circle: rect minus a reverse-wound arc.
    ctx.fillStyle = COLORS.background;
    ctx.beginPath();
    ctx.rect(0, 0, VIEW_W, VIEW_H);
    ctx.arc(cx, cy, radius, 0, Math.PI * 2, true);
    ctx.fill();
  }

  // Curse cutscene overlay: the words splat in during the strike, then the
  // tutorial dialog takes over.
  private drawCutscene(ctx: OffscreenCanvasRenderingContext2D): void {
    const t = this.cutsceneTick;
    if (t < DIALOG_AT) {
      this.drawCurseWord(ctx, "YOU", VIEW_H * 0.3, 28, t - WORD_YOU_AT, CURSE_PURPLE);
      this.drawCurseWord(ctx, "ARE", VIEW_H * 0.45, 28, t - WORD_ARE_AT, CURSE_PURPLE);
      this.drawCurseWord(ctx, "CURSED", VIEW_H * 0.62, 48, t - WORD_CURSED_AT, CURSE_RED);
    } else {
      this.drawTutorialDialog(ctx, t - DIALOG_AT);
    }
  }

  // A word that punches in oversized then settles, with a brief fade.
  private drawCurseWord(
    ctx: OffscreenCanvasRenderingContext2D,
    word: string,
    y: number,
    baseSize: number,
    age: number,
    color: string,
  ): void {
    if (age < 0) return;
    const scale = age < 6 ? 1.7 - age * 0.117 : 1;
    drawText(ctx, word, VIEW_W / 2, y, {
      size: Math.round(baseSize * scale),
      bold: true,
      color,
      shadow: "#000000",
      alpha: Math.min(1, age / 3),
    });
  }

  private drawTutorialDialog(ctx: OffscreenCanvasRenderingContext2D, age: number): void {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    const w = 300;
    const h = 124;
    const x = Math.round((VIEW_W - w) / 2);
    const y = Math.round((VIEW_H - h) / 2);
    ctx.fillStyle = "#1a1024";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#9a6ad9";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

    drawText(ctx, "THE GREED CURSE IS UPON YOU", VIEW_W / 2, y + 24, {
      size: 13,
      bold: true,
      color: CURSE_PURPLE,
    });
    drawText(ctx, "Get gold to survive!", VIEW_W / 2, y + 44, {
      size: 12,
      color: "#e8e4d8",
    });

    if (!this.isTouch) {
      drawText(ctx, "MOVE  ARROWS / WASD", VIEW_W / 2, y + 70, {
        size: 9,
        color: "#9a8fa8",
      });
      drawText(ctx, "JUMP  Z / K / SPACE        WHIP  X / J", VIEW_W / 2, y + 84, {
        size: 9,
        color: "#9a8fa8",
      });
    }

    if (Math.floor(age / 30) % 2 === 0) {
      drawText(
        ctx,
        this.isTouch ? "TAP TO DESCEND" : "PRESS ANY KEY TO DESCEND",
        VIEW_W / 2,
        y + h - 16,
        { size: 10, bold: true, color: "#d9b36a" },
      );
    }
    ctx.restore();
  }

  private drawGrappleRings(): void {
    const s = this.art.hook;
    for (const gp of this.level.grapplePoints) {
      s.drawCentered(this.ctx, 0, gp.x, gp.y);
    }
  }

  private drawSpikes(): void {
    for (const seg of this.level.spikeSegments) {
      drawSpikeSegment(this.ctx, this.art, seg, SPIKE_SCALE, SPIKE_CROSS_ASPECT);
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

  // Passable window tiles: just the art, behind the actors. Their only gameplay
  // effect (the base-light boost) is applied in cutsceneLightFloor().
  private drawGlass(): void {
    for (const g of this.level.glassTiles) {
      this.ctx.drawImage(this.art.glass, g.tx * TILE, g.ty * TILE);
    }
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
    const statue = this.statues[sp.spawn.kind];
    const img = lit ? statue.lit : statue.dim;
    const r = sp.tileRect;
    this.ctx.drawImage(
      img,
      Math.round(r.x + r.w / 2 - img.width / 2),
      r.y + r.h - img.height,
    );
  }

  private drawPots(): void {
    const ctx = this.ctx;
    for (const p of this.pots) {
      if (p.broken) continue;
      const s = p.kind === "altar" ? this.art.tallPot : this.art.smallPot;
      s.draw(ctx, 0, p.x, (p.ty + 1) * TILE, false);
      // Cursed pots reuse the small-pot art but wear a pulsing purple sheen —
      // the design doc's telegraph (spotting them is a perception skill). No
      // dedicated cursed-pot art is approved yet, so the sheen carries the read.
      if (p.kind === "cursed") {
        const cy = (p.ty + 1) * TILE - 6;
        const pulse = 0.45 + 0.3 * Math.sin(this.animTick * 0.15);
        const r = 11;
        const g = ctx.createRadialGradient(p.x, cy, 0, p.x, cy, r);
        g.addColorStop(0, `rgba(170,110,255,${0.55 * pulse})`);
        g.addColorStop(1, "rgba(170,110,255,0)");
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  private drawBounceOnions(): void {
    for (const o of this.bounceOnions) {
      if (o.exploded) continue; // the boom effect covers the burst
      const art =
        o.kind === "explosiveBounce"
          ? this.art.explosiveBounceOnion
          : this.art.bounceOnion;
      // Squash (bounce) frame right after a launch; otherwise the still pose.
      const s = o.squash > 0 ? art.bounce : art.still;
      const frame = o.squash > 0 ? s.frameAt(ONION_SQUASH_TICKS - o.squash) : 0;
      s.draw(this.ctx, frame, o.x, (o.ty + 1) * TILE, false);
    }
  }

  private drawPickups(alpha: number): void {
    const s = this.art.coin;
    const ctx = this.ctx;
    for (const p of this.pickups) {
      const frame = s.frameAt(p.anim);
      const x = Math.round(p.prevX + (p.x - p.prevX) * alpha);
      const y = Math.round(p.prevY + (p.y - p.prevY) * alpha);
      // Small coins shrink to 0.5x; the altar coin reads as treasure at 2x.
      const scale = p.giant ? 2 : COIN_SCALE;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      s.drawCentered(ctx, frame, 0, 0);
      ctx.restore();
    }
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
      s = pa.climb;
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
    if (e.kind === "snake") {
      const s = this.art.snake;
      s.draw(this.ctx, s.frameAt(e.animTick), anchorX, anchorY, flip);
      return;
    }

    // Flyer: Small Bat. Sleeps while roosting on the ceiling, wakes as the
    // swoop begins, then the wing-flap loop through the dive.
    if (e.kind === "smallBat") {
      const s =
        e.state === "hanging"
          ? this.art.smallBat.sleep
          : e.animTick < this.art.smallBat.wakeUp.durationTicks
            ? this.art.smallBat.wakeUp
            : this.art.smallBat.fly;
      s.draw(this.ctx, s.frameAt(e.animTick), anchorX, anchorY, flip);
      return;
    }

    // Flyer: Large Bat. Wing-flap loop while in flight; the captured/folded pose
    // (its Hit art) once it's been whipped down — stunned, carried, or thrown.
    if (e.kind === "largeBat") {
      const flying = e.state === "hanging" || e.state === "diving";
      if (flying) {
        const s = this.art.largeBat.fly;
        s.draw(this.ctx, s.frameAt(e.animTick), anchorX, anchorY, flip);
      } else if (e.state === "stunned") {
        this.art.largeBat.hit.draw(this.ctx, 0, anchorX, anchorY, flip, e.stunScaleY());
      } else {
        // yanked / held / thrown: the folded captured pose.
        const blinking =
          e.state === "held" &&
          e.heldTicks <= HELD_BLINK_TICKS &&
          Math.floor(e.heldTicks / 4) % 2 === 0;
        if (!blinking) this.art.largeBat.hit.draw(this.ctx, 0, anchorX, anchorY, flip);
      }
      return;
    }

    // Stationary shooter: Dart Cannon. Idle stare, then the Shoot animation
    // (strobing white) as the wind-up telegraph before a dart fires.
    if (e.kind === "cannon") {
      if (e.charging && Math.floor(e.animTick / 4) % 2 === 0) {
        this.ctx.filter = "brightness(0) invert(1)"; // drawEnemy resets it
      }
      const s = e.charging ? this.art.cannonShoot : this.art.cannonIdle;
      s.draw(this.ctx, s.frameAt(e.animTick), anchorX, anchorY, false);
      return;
    }

    // Ambush leaper: Frog. Sit (Still), crouch telegraph (Up), airborne (Jump Up).
    if (e.kind === "frog") {
      const s =
        e.state === "leaping"
          ? this.art.frog.jumpUp
          : e.state === "rousing"
            ? this.art.frog.up
            : this.art.frog.still;
      s.draw(this.ctx, s.frameAt(e.animTick), anchorX, anchorY, flip);
      return;
    }

    // Troll tiers. The Small Troll is grabbable/throwable (its hurt pose doubles
    // as the folded/stunned/carried silhouette); the Large Troll only walks and
    // stuns (whip-stars + post-revive immunity flash), never grabbed/thrown.
    const isLarge = e.kind === "troll";
    const walkS = isLarge ? this.art.troll : this.art.smallTroll.walk;
    const hitS = isLarge ? this.art.trollHit : this.art.smallTroll.hit;
    // Large Troll flashes while stun-immune after a revive.
    if (isLarge && e.immuneTicks > 0 && Math.floor(e.immuneTicks / 4) % 2 === 0) {
      return;
    }
    switch (e.state) {
      case "patrol":
      case "rousing": {
        walkS.draw(this.ctx, walkS.frameAt(e.animTick), anchorX, anchorY, flip);
        break;
      }
      case "waiting": {
        walkS.draw(this.ctx, 0, anchorX, anchorY, flip);
        break;
      }
      case "stunned": {
        // Knocked over: the squash-flip lands it upside down and reverses as
        // the revive approaches.
        hitS.draw(this.ctx, 0, anchorX, anchorY, flip, e.stunScaleY());
        // Large Troll: stars orbit its head while it's stunned.
        if (isLarge) this.drawStunStars(anchorX, e.drawY(alpha), e.animTick);
        break;
      }
      case "held": {
        // Blink during the final second so the wake-up is telegraphed.
        const blinking =
          e.heldTicks <= HELD_BLINK_TICKS && Math.floor(e.heldTicks / 4) % 2 === 0;
        if (!blinking) {
          hitS.draw(this.ctx, 0, anchorX, anchorY, flip);
        }
        break;
      }
      case "yanked":
      case "thrown": {
        hitS.draw(this.ctx, 0, anchorX, anchorY, flip);
        break;
      }
    }
  }

  // Procedural "stun stars": a few small stars orbiting above a stunned Large
  // Troll's head. Deterministic — the orbit angle is driven by the anim tick.
  private drawStunStars(centerX: number, topY: number, animTick: number): void {
    const ctx = this.ctx;
    const count = 3;
    const orbitR = 6;
    const cy = topY - 4; // just above the head
    ctx.fillStyle = "#f5e08a";
    for (let i = 0; i < count; i++) {
      const a = animTick * 0.15 + (i / count) * Math.PI * 2;
      const sx = Math.round(centerX + Math.cos(a) * orbitR);
      const sy = Math.round(cy + Math.sin(a) * 2); // shallow vertical wobble
      // A tiny 5px plus-shaped star.
      ctx.fillRect(sx - 1, sy, 3, 1);
      ctx.fillRect(sx, sy - 1, 1, 3);
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
        const s = this.art.largeBat.hit;
        const age = s.durationTicks - fx.ticks;
        s.drawCentered(ctx, s.frameAtOnce(age), Math.round(fx.x), Math.round(fx.y));
        continue;
      }
      if (fx.kind === "frogHit") {
        const s = this.art.frog.hit;
        const age = s.durationTicks - fx.ticks;
        s.drawCentered(ctx, s.frameAtOnce(age), Math.round(fx.x), Math.round(fx.y));
        continue;
      }
      if (fx.kind === "onionBoom") {
        const s = this.art.explosiveBounceOnion.explode;
        const age = s.durationTicks - fx.ticks;
        s.drawCentered(ctx, s.frameAtOnce(age), Math.round(fx.x), Math.round(fx.y));
        continue;
      }
      if (fx.kind === "curseShatter") {
        // Cursed pot burst: six additive purple/red shards flung outward — the
        // moment the cloud is born.
        const age = EFFECT_TICKS - fx.ticks;
        const d = 2 + age * 1.6;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI * 2 * i) / 6 + age * 0.05;
          ctx.fillStyle = i % 2 === 0 ? CURSE_PURPLE : CURSE_RED;
          ctx.fillRect(
            Math.round(fx.x + Math.cos(a) * d) - 1,
            Math.round(fx.y + Math.sin(a) * d) - 1,
            2,
            2,
          );
        }
        ctx.restore();
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

  // Cursed energy. The look is a CUSTOM DISCRETE PALETTE indexed by OVERLAP
  // DENSITY, in chunky blocks. Each cloud is a particle emitter; its live motes
  // accumulate a grayscale "coverage" field in a scratch buffer (the cloud's
  // SHAPE). Then we walk a BLOCK-aligned grid: each block samples the coverage
  // at its center and maps it to a CURSE_PALETTE band — faint edges purple, the
  // mid-band black, the dense core red (concentric, NOT vertical). A per-block
  // dither (capped at one band) only stipples the seams between neighbouring
  // bands, shimmering slowly, so purple and red never bleed into each other.
  // Drawn after the lighting pass so the curse glows in the dark. Deterministic.
  private drawCurseClouds(): void {
    if (this.curseClouds.length === 0) return;
    const ctx = this.ctx;
    const PAL = CURSE_PALETTE;
    const N = PAL.length;
    const BLOCK = 2; // chunky-pixel size for the color zones
    const DITHER = 1.0; // ±0.5 band of seam stipple (capped at one band)
    const slowT = Math.floor(this.animTick / 6); // slow shimmer of the stipple

    if (!this.curseScratch) this.curseScratch = new OffscreenCanvas(VIEW_W, VIEW_H);
    const sctx = this.curseScratch.getContext("2d", { willReadFrequently: true })!;

    for (const c of this.curseClouds) {
      if (c.particles.length === 0) continue;

      // Bounding box over the live motes (in screen space).
      let minx = VIEW_W;
      let miny = VIEW_H;
      let maxx = 0;
      let maxy = 0;
      for (const pt of c.particles) {
        const px = pt.x + this.shakeX;
        const py = pt.y + this.shakeY;
        if (px - pt.size < minx) minx = px - pt.size;
        if (py - pt.size < miny) miny = py - pt.size;
        if (px + pt.size > maxx) maxx = px + pt.size;
        if (py + pt.size > maxy) maxy = py + pt.size;
      }
      const x0 = Math.max(0, Math.floor(minx));
      const y0 = Math.max(0, Math.floor(miny));
      const x1 = Math.min(VIEW_W, Math.ceil(maxx));
      const y1 = Math.min(VIEW_H, Math.ceil(maxy));
      const w = x1 - x0;
      const h = y1 - y0;
      if (w <= 0 || h <= 0) continue;

      // 1) Accumulate the coverage field: each mote is a soft radial bump summed
      //    with 'lighter' (alpha-1 so only the gray VALUE adds, edges add 0).
      sctx.clearRect(x0, y0, w, h);
      sctx.save();
      sctx.globalCompositeOperation = "lighter";
      for (const pt of c.particles) {
        const fade = pt.ticks / pt.life; // 1 -> 0 over the mote's life
        const px = pt.x + this.shakeX;
        const py = pt.y + this.shakeY;
        const v = Math.round(60 * fade); // per-mote coverage contribution
        const g = sctx.createRadialGradient(px, py, 0, px, py, pt.size);
        g.addColorStop(0, `rgba(${v},${v},${v},1)`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        sctx.fillStyle = g;
        sctx.beginPath();
        sctx.arc(px, py, pt.size, 0, Math.PI * 2);
        sctx.fill();
      }
      sctx.restore();

      // 2) Color in chunky blocks: each block's coverage picks a density band
      //    (purple edge -> black mid -> red core); a per-block dither stipples
      //    only the band seams. Blocks align to absolute screen coords so they
      //    don't crawl when the screen shakes.
      const cov = sctx.getImageData(x0, y0, w, h);
      const dst = ctx.getImageData(x0, y0, w, h);
      const cd = cov.data;
      const dd = dst.data;
      const ax0 = x0 - (x0 % BLOCK); // snap the grid to absolute BLOCK boundaries
      const ay0 = y0 - (y0 % BLOCK);
      for (let ay = ay0; ay < y1; ay += BLOCK) {
        for (let ax = ax0; ax < x1; ax += BLOCK) {
          // Sample coverage at the block centre (clamped into the region).
          const sx = Math.min(w - 1, Math.max(0, ax - x0 + (BLOCK >> 1)));
          const sy = Math.min(h - 1, Math.max(0, ay - y0 + (BLOCK >> 1)));
          const c0 = cd[(sy * w + sx) * 4] / 255;
          if (c0 <= 0.06) continue; // outside the cloud — leave the scene be
          const dither = (hash01(ax * 1.7 + ay * 9.3 + slowT * 4.1) - 0.5) * DITHER;
          let bi = Math.round(c0 * (N - 1) + dither);
          bi = bi < 0 ? 0 : bi >= N ? N - 1 : bi;
          const [r, g, b] = PAL[bi];
          const a = Math.min(1, c0 * 1.3); // faint at the edges, solid in the core
          const xlo = Math.max(0, ax - x0);
          const ylo = Math.max(0, ay - y0);
          const xhi = Math.min(w, ax - x0 + BLOCK);
          const yhi = Math.min(h, ay - y0 + BLOCK);
          for (let yy = ylo; yy < yhi; yy++) {
            let p = (yy * w + xlo) * 4;
            for (let xx = xlo; xx < xhi; xx++) {
              dd[p] = r * a + dd[p] * (1 - a);
              dd[p + 1] = g * a + dd[p + 1] * (1 - a);
              dd[p + 2] = b * a + dd[p + 2] * (1 - a);
              p += 4;
            }
          }
        }
      }
      ctx.putImageData(dst, x0, y0);
    }
  }

  // The death HUD: a non-linear vertical "progress toward death" bar on the
  // right edge (purple when time is fat -> red at death's door) plus the
  // explicit countdown number the design doc insists on (§8).
  private drawCurseHud(): void {
    const ctx = this.ctx;
    const secondsLeft = this.curseTicks / TICK_HZ;
    const fill = barFill(secondsLeft);
    const p = fill / BAR_PX;

    const BAR_W = 12; // leaves room for the 1px outline to stay inside the tile
    const barX = VIEW_W - TILE + Math.floor((TILE - BAR_W) / 2); // centered in the last column
    const barTop = Math.round((VIEW_H - BAR_PX) / 2);
    const barBottom = barTop + BAR_PX;

    // Track: a dark recess with a dim purple frame so the bar is always
    // locatable even where the fill color crosses through black.
    ctx.fillStyle = "rgba(16,10,22,0.82)";
    ctx.fillRect(barX - 1, barTop - 1, BAR_W + 2, BAR_PX + 2);
    ctx.strokeStyle = "#3a2a4a";
    ctx.lineWidth = 1;
    ctx.strokeRect(barX - 1.5, barTop - 1.5, BAR_W + 3, BAR_PX + 3);

    // Fill body (crunchy ramp color) growing up from the bottom toward death.
    const fh = Math.max(0, Math.min(BAR_PX, Math.round(fill)));
    if (fh > 0) {
      ctx.fillStyle = crunchColor(curseRamp(p), 5);
      ctx.fillRect(barX, barBottom - fh, BAR_W, fh);
      // Bright leading "waterline" so the level reads even at the black midpoint.
      ctx.fillStyle = p < 0.5 ? "#c9a0ff" : "#ff6a7e";
      ctx.fillRect(barX, barBottom - fh, BAR_W, 1);
      // Additive embers rising off the waterline.
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 4; i++) {
        const ph = hash01(i + 3);
        const t = ((this.animTick * 0.04 + ph) % 1);
        ctx.globalAlpha = (1 - t) * 0.7;
        ctx.fillStyle = p < 0.5 ? CURSE_PURPLE : CURSE_RED;
        const ex = barX + Math.round(ph * (BAR_W - 1));
        const ey = barBottom - fh - Math.round(t * 8);
        ctx.fillRect(ex, ey, 1, 1);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Countdown number, top-center. White normally; pulses red inside the final
    // two minutes (the danger zone the bar climbs at 1px/sec).
    const danger = secondsLeft <= DANGER_SECONDS;
    const blink = danger && Math.floor(this.animTick / 20) % 2 === 0;
    drawText(ctx, formatClock(secondsLeft), VIEW_W / 2, 14, {
      size: 18,
      bold: true,
      color: danger ? (blink ? "#ff5a6e" : CURSE_RED) : "#e8e4d8",
      shadow: "#000000",
    });
  }

  // Floating clock arithmetic: gold "+Ns" on treasure, purple "-N" on a curse
  // touch. They drift up (handled in updateCurse) and fade out here.
  private drawPopups(): void {
    for (const p of this.popups) {
      const a = Math.min(1, p.ticks / (POPUP_TICKS * 0.5));
      drawText(this.ctx, p.text, Math.round(p.x), Math.round(p.y), {
        size: 10,
        bold: true,
        color: p.color,
        shadow: "#000000",
        alpha: a,
      });
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

// Whip/collision box for a pot, resting on its cell floor. The altar pot is
// taller, so its box reaches a tile high; a normal pot is a squat cube.
function potBox(p: PotState): { x: number; y: number; w: number; h: number } {
  const w = 12;
  const h = p.kind === "altar" ? 16 : 12;
  return { x: p.x - w / 2, y: (p.ty + 1) * TILE - h, w, h };
}

// Collision/landing box for a bounce onion, resting on its cell floor. A squat
// cube whose top edge is the trampoline surface (and the bomb's contact area).
function onionBox(o: BounceOnionState): { x: number; y: number; w: number; h: number } {
  const w = 14;
  const h = 12;
  return { x: o.x - w / 2, y: (o.ty + 1) * TILE - h, w, h };
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
