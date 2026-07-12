// Sound-effects layer. Mirrors the HTMLAudioElement pattern art.ts uses for the
// intro VO, but for short one-shot SFX. Playback is a pure side-effect — it must
// never feed the deterministic sim (see CLAUDE.md). All calls are gated behind
// the "press any key" gesture in main.ts, so the browser autoplay policy is
// already satisfied by the time any of these fire.
//
// Vite turns each import into a hashed URL (types come from vite/client). The
// files live in assets/sound/ alongside the art convention.
import batUrl from "../assets/sound/Bat.mp3";
import bounceUrl from "../assets/sound/Bounce Pad.mp3";
import exitUrl from "../assets/sound/Exit Level.mp3";
import explosionUrl from "../assets/sound/Explosion.mp3";
import footstepUrl from "../assets/sound/Footstep.mp3";
import hitGroundUrl from "../assets/sound/Hit Ground.mp3";
import hitUrl from "../assets/sound/Hit.mp3";
import pickUpUrl from "../assets/sound/Pick Up.mp3";
import whipUrl from "../assets/sound/Whip.mp3";

import type { Settings } from "./settings";

export type SfxName =
  | "bat"
  | "bounce"
  | "exit"
  | "explosion"
  | "footstep"
  | "hitGround"
  | "hit"
  | "pickUp"
  | "whip";

const URLS: Record<SfxName, string> = {
  bat: batUrl,
  bounce: bounceUrl,
  exit: exitUrl,
  explosion: explosionUrl,
  footstep: footstepUrl,
  hitGround: hitGroundUrl,
  hit: hitUrl,
  pickUp: pickUpUrl,
  whip: whipUrl,
};

// A tiny round-robin pool per sound. HTMLAudioElement.play() won't restart an
// element that's already playing, so overlapping triggers (footsteps, a lash
// hitting several enemies in one tick) need distinct elements to double up on.
const POOL_SIZE = 4;

export class Sfx {
  private readonly pools: Record<SfxName, HTMLAudioElement[]>;
  private readonly cursor: Record<SfxName, number>;

  // Volume is read from Settings at each play() so the settings slider takes
  // effect live with no wiring — SFX are one-shots, so "on next play" is instant
  // enough. The intro VO path (art.introSpeech) is untouched by this.
  constructor(private readonly settings: Settings) {
    this.pools = {} as Record<SfxName, HTMLAudioElement[]>;
    this.cursor = {} as Record<SfxName, number>;
    for (const name of Object.keys(URLS) as SfxName[]) {
      const url = URLS[name];
      const pool: HTMLAudioElement[] = [];
      for (let i = 0; i < POOL_SIZE; i++) {
        const a = new Audio(url);
        a.preload = "auto";
        pool.push(a);
      }
      this.pools[name] = pool;
      this.cursor[name] = 0;
    }
  }

  play(name: SfxName): void {
    const vol = this.settings.sfxVolume;
    if (vol <= 0) return; // muted: skip entirely
    const pool = this.pools[name];
    const i = this.cursor[name];
    this.cursor[name] = (i + 1) % pool.length;
    const a = pool[i];
    a.volume = vol;
    try {
      a.currentTime = 0; // rewind (a pool slot may still be tailing out)
    } catch {
      // not seekable yet (still loading); play() from wherever it is
    }
    void a.play().catch(() => {}); // autoplay/interrupt rejections are harmless
  }
}
