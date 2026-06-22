// Device-agnostic action layer (Milestone 2). Each input source (keyboard,
// touch) reports the raw held state of the NES-style actions; Input merges
// them every tick (logical OR) and latches just-pressed edges. Game code only
// ever reads Input — it never knows which device produced an action.

export interface ActionState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  a: boolean; // jump (always)
  b: boolean; // context verb: whip empty-handed, activate held object when holding
  restart: boolean;
  lightMode: boolean; // dev: toggle per-tile / per-pixel lighting
  lightCurve: boolean; // dev: toggle linear / plateau (non-linear) lighting
  prevLevel: boolean; // dev: jump to the previous level
  nextLevel: boolean; // dev: jump to the next level
}

export function emptyActions(): ActionState {
  return {
    left: false,
    right: false,
    up: false,
    down: false,
    a: false,
    b: false,
    restart: false,
    lightMode: false,
    lightCurve: false,
    prevLevel: false,
    nextLevel: false,
  };
}

export interface InputSource {
  // Live held state; the source mutates this as device events arrive.
  readonly actions: ActionState;
  // When true, this source's gameplay actions are authoritative this tick:
  // every OTHER source's gameplay inputs (left/right/up/down/a/b) are ignored,
  // while their meta/dev keys still apply. Used by the intro replay so live
  // input can't perturb a tape that's playing.
  readonly suppressesGameplay?: boolean;
}

export class Input {
  left = false;
  right = false;
  up = false;
  down = false;
  a = false;
  aPressed = false; // true only on the tick the button went down
  b = false;
  bPressed = false;
  restartPressed = false;
  lightModePressed = false;
  lightCurvePressed = false;
  prevLevelPressed = false;
  nextLevelPressed = false;

  private aWasDown = false;
  private bWasDown = false;
  private restartWasDown = false;
  private lightModeWasDown = false;
  private lightCurveWasDown = false;
  private prevLevelWasDown = false;
  private nextLevelWasDown = false;
  private readonly sources: InputSource[] = [];

  addSource(source: InputSource): void {
    this.sources.push(source);
  }

  // Call once at the start of each tick: merge sources, latch edges.
  poll(): void {
    let left = false;
    let right = false;
    let up = false;
    let down = false;
    let a = false;
    let b = false;
    let restart = false;
    let lightMode = false;
    let lightCurve = false;
    let prevLevel = false;
    let nextLevel = false;
    // When a scripted source (the intro replay) is driving, only it contributes
    // gameplay actions; live player input is muted but meta/dev keys still pass.
    const suppress = this.sources.some((s) => s.suppressesGameplay);
    for (const source of this.sources) {
      const { actions } = source;
      if (!suppress || source.suppressesGameplay) {
        left ||= actions.left;
        right ||= actions.right;
        up ||= actions.up;
        down ||= actions.down;
        a ||= actions.a;
        b ||= actions.b;
      }
      restart ||= actions.restart;
      lightMode ||= actions.lightMode;
      lightCurve ||= actions.lightCurve;
      prevLevel ||= actions.prevLevel;
      nextLevel ||= actions.nextLevel;
    }

    this.left = left;
    this.right = right;
    this.up = up;
    this.down = down;
    this.a = a;
    this.b = b;

    this.aPressed = a && !this.aWasDown;
    this.aWasDown = a;
    this.bPressed = b && !this.bWasDown;
    this.bWasDown = b;
    this.restartPressed = restart && !this.restartWasDown;
    this.restartWasDown = restart;
    this.lightModePressed = lightMode && !this.lightModeWasDown;
    this.lightModeWasDown = lightMode;
    this.lightCurvePressed = lightCurve && !this.lightCurveWasDown;
    this.lightCurveWasDown = lightCurve;
    this.prevLevelPressed = prevLevel && !this.prevLevelWasDown;
    this.prevLevelWasDown = prevLevel;
    this.nextLevelPressed = nextLevel && !this.nextLevelWasDown;
    this.nextLevelWasDown = nextLevel;
  }
}
