// Player-facing settings. These are RENDER-ONLY knobs — nothing here may feed
// the deterministic simulation (see CLAUDE.md: no wall-clock / non-deterministic
// inputs into the tick). Persisted to localStorage so a choice survives reloads.

const STORAGE_KEY = "cursedTomb.settings.v1";

// Upper bound for the lighting brightness floor slider. Past ~0.6 the scene is
// so flat the torch/statue pools stop reading, so we cap the menu there.
export const LIGHT_FLOOR_MAX = 0.6;

// Brightness floor = lighting dynamic-range compression. The lighting operator
// normally ramps a light level in [0,1]; with a floor f it instead ramps over
// [f, 1], so the darkest tile is "at least f lit" and the live lighting is
// crammed into the remaining (1 - f). f = 0 is full range (the authored look);
// higher f lifts the darks — easier to read on a dim/glare-prone phone screen.
//
// Phones default to a compressed range; desktop keeps the full authored range.
function deviceDefaultLightFloor(): number {
  const isTouch =
    typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  return isTouch ? 0.4 : 0.0;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export class Settings {
  // Current brightness floor in [0, LIGHT_FLOOR_MAX].
  lightFloor: number;
  // The per-device default, kept so the menu can offer "reset to default".
  readonly defaultLightFloor: number;

  constructor() {
    this.defaultLightFloor = deviceDefaultLightFloor();
    this.lightFloor = this.defaultLightFloor;
    this.load();
  }

  setLightFloor(v: number): void {
    this.lightFloor = clamp(v, 0, LIGHT_FLOOR_MAX);
    this.save();
  }

  resetLightFloor(): void {
    this.setLightFloor(this.defaultLightFloor);
  }

  // localStorage may be absent or throw (private mode, disabled cookies); a
  // missing/corrupt value just falls back to the device default.
  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as { lightFloor?: unknown };
      if (typeof data.lightFloor === "number" && isFinite(data.lightFloor)) {
        this.lightFloor = clamp(data.lightFloor, 0, LIGHT_FLOOR_MAX);
      }
    } catch {
      // ignore: keep the device default
    }
  }

  private save(): void {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ lightFloor: this.lightFloor }),
      );
    } catch {
      // ignore: storage unavailable, setting just won't persist
    }
  }
}
