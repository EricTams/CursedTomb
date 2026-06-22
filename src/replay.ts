// Deterministic input recording + playback. The sim is fully tick-based and
// has no Math.random / wall-clock, so replaying the exact per-tick input
// reproduces a run bit-for-bit (used for the intro's Act 1).
//
// A tape stores ONLY the six gameplay fields, packed into a bitmask per tick.
// Dev keys and the just-pressed edges are re-derived by Input.poll, so they
// don't need recording.
import { ActionState, InputSource, emptyActions } from "./input";

const L = 1;
const R = 2;
const U = 4;
const D = 8;
const A = 16;
const B = 32;

interface Held {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  a: boolean;
  b: boolean;
}

export function packActions(h: Held): number {
  return (
    (h.left ? L : 0) |
    (h.right ? R : 0) |
    (h.up ? U : 0) |
    (h.down ? D : 0) |
    (h.a ? A : 0) |
    (h.b ? B : 0)
  );
}

// An input source driven by a recorded tape. Add it alongside the keyboard /
// touch sources; it contributes nothing (all-false) until a tape is loaded,
// so live input is unaffected while idle.
export class ReplaySource implements InputSource {
  readonly actions: ActionState = emptyActions();
  private tape: readonly number[] = [];
  private i = 0;
  private playing = false;

  get isPlaying(): boolean {
    return this.playing;
  }

  // While a tape plays it owns gameplay input: Input.poll mutes the live
  // keyboard/touch gameplay actions so they can't perturb the playback.
  get suppressesGameplay(): boolean {
    return this.playing;
  }

  // Begin feeding a tape from the first frame. The caller is responsible for
  // resetting the sim to its start state on the same tick (see Game.reload).
  load(tape: readonly number[]): void {
    this.tape = tape;
    this.i = 0;
    this.playing = tape.length > 0;
  }

  stop(): void {
    this.playing = false;
    this.clear();
  }

  // Call once per tick BEFORE Input.poll: apply this tick's frame. When the
  // tape runs out it clears and goes inert (no stuck keys).
  advance(): void {
    if (!this.playing) return;
    if (this.i >= this.tape.length) {
      this.clear();
      this.playing = false;
      return;
    }
    const m = this.tape[this.i++];
    const a = this.actions;
    a.left = (m & L) !== 0;
    a.right = (m & R) !== 0;
    a.up = (m & U) !== 0;
    a.down = (m & D) !== 0;
    a.a = (m & A) !== 0;
    a.b = (m & B) !== 0;
  }

  private clear(): void {
    const a = this.actions;
    a.left = a.right = a.up = a.down = a.a = a.b = false;
  }
}

// Captures the merged held state each tick into a tape (a bitmask per tick).
export class Recorder {
  private frames: number[] = [];
  private active = false;

  get recording(): boolean {
    return this.active;
  }

  get length(): number {
    return this.frames.length;
  }

  get tape(): readonly number[] {
    return this.frames;
  }

  start(): void {
    this.frames = [];
    this.active = true;
  }

  stop(): void {
    this.active = false;
  }

  // Call once per tick AFTER Input.poll (i.e. after game.update) to capture the
  // input that drove this tick.
  capture(h: Held): void {
    if (!this.active) return;
    this.frames.push(packActions(h));
  }
}
