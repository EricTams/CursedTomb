// Approved art lives in assets/art/ (PNG + Aseprite JSON pairs) — the only
// folder the game loads from. Vite turns these imports into hashed URLs.
//
// Current palette: "Cube" tiles recovered from the old AutoPlatformer levels
// (Weird Random Cubes set) on a plain black background. The Old Stone family
// also lives in assets/art/, approved but currently unused.
import solidUrl from "../assets/art/Cube Block.png";
import ladderUrl from "../assets/art/Cube Ladder.png";
import platformUrl from "../assets/art/Cube Platform.png";

// Milestone 3 enemies (approved at the roster design talk).
import virusUrl from "../assets/art/Virus-Red.png";
import virusJson from "../assets/art/Virus-Red.json";
import plantWalkUrl from "../assets/art/Plant Box-Walk.png";
import plantWalkJson from "../assets/art/Plant Box-Walk.json";
import plantIdleUrl from "../assets/art/Plant Box-Idle.png";
import plantIdleJson from "../assets/art/Plant Box-Idle.json";
import plantBoxFormUrl from "../assets/art/Plant Box-Box Form.png";
import plantBoxFormJson from "../assets/art/Plant Box-Box Form.json";
import plantGetUpUrl from "../assets/art/Plant Box-Get Up.png";
import plantGetUpJson from "../assets/art/Plant Box-Get Up.json";
import plantSitUrl from "../assets/art/Plant Box-Sit.png";
import plantSitJson from "../assets/art/Plant Box-Sit.json";
import eyeOpenUrl from "../assets/art/Eye-Open.png";
import eyeOpenJson from "../assets/art/Eye-Open.json";
import eyeOpeningUrl from "../assets/art/Eye-Opening.png";
import eyeOpeningJson from "../assets/art/Eye-Opening.json";
import eyeClosingUrl from "../assets/art/Eye-Closing.png";
import eyeClosingJson from "../assets/art/Eye-Closing.json";
import eyeClosedUrl from "../assets/art/Eye-Closed.png";
import eyeClosedJson from "../assets/art/Eye-Closed.json";

import { Sprite, AsepriteSheet } from "./sprite";

export interface Art {
  solid: HTMLImageElement;
  ladder: HTMLImageElement;
  platform: HTMLImageElement;
  virus: Sprite;
  plantWalk: Sprite;
  plantIdle: Sprite;
  plantBoxForm: Sprite; // stunned / held / thrown (folded into its box)
  plantGetUp: Sprite; // wake-up telegraph
  plantSit: Sprite; // dormant watcher pose (sit-down transition, hold last)
  eyeOpen: Sprite; // exit guardian: open stare plus a periodic blink cycle
  eyeOpening: Sprite;
  eyeClosing: Sprite;
  eyeClosed: Sprite;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

async function loadSprite(url: string, sheet: AsepriteSheet): Promise<Sprite> {
  return new Sprite(await loadImage(url), sheet);
}

export async function loadArt(): Promise<Art> {
  const [
    solid,
    ladder,
    platform,
    virus,
    plantWalk,
    plantIdle,
    plantBoxForm,
    plantGetUp,
    plantSit,
    eyeOpen,
    eyeOpening,
    eyeClosing,
    eyeClosed,
  ] = await Promise.all([
    loadImage(solidUrl),
    loadImage(ladderUrl),
    loadImage(platformUrl),
    loadSprite(virusUrl, virusJson),
    loadSprite(plantWalkUrl, plantWalkJson),
    loadSprite(plantIdleUrl, plantIdleJson),
    loadSprite(plantBoxFormUrl, plantBoxFormJson),
    loadSprite(plantGetUpUrl, plantGetUpJson),
    loadSprite(plantSitUrl, plantSitJson),
    loadSprite(eyeOpenUrl, eyeOpenJson),
    loadSprite(eyeOpeningUrl, eyeOpeningJson),
    loadSprite(eyeClosingUrl, eyeClosingJson),
    loadSprite(eyeClosedUrl, eyeClosedJson),
  ]);
  return {
    solid,
    ladder,
    platform,
    virus,
    plantWalk,
    plantIdle,
    plantBoxForm,
    plantGetUp,
    plantSit,
    eyeOpen,
    eyeOpening,
    eyeClosing,
    eyeClosed,
  };
}
