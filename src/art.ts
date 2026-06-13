// Approved art lives in assets/art/ (PNG + Aseprite JSON pairs) — the only
// folder the game loads from. Vite turns these imports into hashed URLs.
//
// Current palette: the "Tileset" stone set plus the new creature/player roster
// (Snake, Large Troll, Dart Cannon, Player) and the Light Statue.
import solidUrl from "../assets/art/Tileset-Tile.png";
import ladderUrl from "../assets/art/Tileset-Ladder.png";
import platformUrl from "../assets/art/Tileset-Platform.png";

// Enemies (reskinned onto the existing behaviors):
//   walker = Snake, grabbable/throwable + spawner = Large Troll,
//   stationary shooter = Dart Cannon (fires Darts).
import snakeUrl from "../assets/art/Snake-Walk.png";
import snakeJson from "../assets/art/Snake-Walk.json";
import trollUrl from "../assets/art/Large Troll-Walk.png";
import trollJson from "../assets/art/Large Troll-Walk.json";
import trollHitUrl from "../assets/art/Large Troll-Hit.png";
import trollHitJson from "../assets/art/Large Troll-Hit.json";
import cannonIdleUrl from "../assets/art/Dart Cannon-Idle.png";
import cannonIdleJson from "../assets/art/Dart Cannon-Idle.json";
import cannonShootUrl from "../assets/art/Dart Cannon-Shoot.png";
import cannonShootJson from "../assets/art/Dart Cannon-Shoot.json";
import dartUrl from "../assets/art/Dart-Fly.png";
import dartJson from "../assets/art/Dart-Fly.json";
import dartBoomUrl from "../assets/art/Dart Explosion-Explosion.png";
import dartBoomJson from "../assets/art/Dart Explosion-Explosion.json";

// Player animation set.
import playerStillUrl from "../assets/art/Player-Still.png";
import playerStillJson from "../assets/art/Player-Still.json";
import playerWalkUrl from "../assets/art/Player-Walk.png";
import playerWalkJson from "../assets/art/Player-Walk.json";
import playerJumpUrl from "../assets/art/Player-Jump Up.png";
import playerJumpJson from "../assets/art/Player-Jump Up.json";
import playerFallUrl from "../assets/art/Player-Fall Down.png";
import playerFallJson from "../assets/art/Player-Fall Down.json";
import playerUpUrl from "../assets/art/Player-Up.png";
import playerUpJson from "../assets/art/Player-Up.json";
import playerDownUrl from "../assets/art/Player-Down.png";
import playerDownJson from "../assets/art/Player-Down.json";
import playerUseUrl from "../assets/art/Player-Use.png";
import playerUseJson from "../assets/art/Player-Use.json";
import playerLandUrl from "../assets/art/Player-Hitting Ground.png";
import playerLandJson from "../assets/art/Player-Hitting Ground.json";

// Light source.
import lightStatueOnUrl from "../assets/art/Light Statue-On.png";
import lightStatueOnJson from "../assets/art/Light Statue-On.json";

import { Sprite, AsepriteSheet } from "./sprite";

export interface PlayerArt {
  still: Sprite;
  walk: Sprite;
  jumpUp: Sprite;
  fallDown: Sprite;
  up: Sprite; // ladder climb (ascending)
  down: Sprite; // ladder climb (descending)
  use: Sprite; // whip / activate
  land: Sprite; // brief landing pose
}

export interface Art {
  solid: HTMLImageElement;
  ladder: HTMLImageElement;
  platform: HTMLImageElement;
  snake: Sprite; // walker (was Virus)
  troll: Sprite; // grabbable/throwable walker (was Plant Box)
  trollHit: Sprite; // hurt/folded pose for stun/held/thrown
  cannonIdle: Sprite; // shooter stare (was Eye)
  cannonShoot: Sprite; // shooter charge/fire
  dart: Sprite; // the fired projectile (was the bolt)
  dartBoom: Sprite; // dart impact burst
  player: PlayerArt;
  lightStatueOn: Sprite;
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
    snake,
    troll,
    trollHit,
    cannonIdle,
    cannonShoot,
    dart,
    dartBoom,
    playerStill,
    playerWalk,
    playerJump,
    playerFall,
    playerUp,
    playerDown,
    playerUse,
    playerLand,
    lightStatueOn,
  ] = await Promise.all([
    loadImage(solidUrl),
    loadImage(ladderUrl),
    loadImage(platformUrl),
    loadSprite(snakeUrl, snakeJson),
    loadSprite(trollUrl, trollJson),
    loadSprite(trollHitUrl, trollHitJson),
    loadSprite(cannonIdleUrl, cannonIdleJson),
    loadSprite(cannonShootUrl, cannonShootJson),
    loadSprite(dartUrl, dartJson),
    loadSprite(dartBoomUrl, dartBoomJson),
    loadSprite(playerStillUrl, playerStillJson),
    loadSprite(playerWalkUrl, playerWalkJson),
    loadSprite(playerJumpUrl, playerJumpJson),
    loadSprite(playerFallUrl, playerFallJson),
    loadSprite(playerUpUrl, playerUpJson),
    loadSprite(playerDownUrl, playerDownJson),
    loadSprite(playerUseUrl, playerUseJson),
    loadSprite(playerLandUrl, playerLandJson),
    loadSprite(lightStatueOnUrl, lightStatueOnJson),
  ]);
  return {
    solid,
    ladder,
    platform,
    snake,
    troll,
    trollHit,
    cannonIdle,
    cannonShoot,
    dart,
    dartBoom,
    player: {
      still: playerStill,
      walk: playerWalk,
      jumpUp: playerJump,
      fallDown: playerFall,
      up: playerUp,
      down: playerDown,
      use: playerUse,
      land: playerLand,
    },
    lightStatueOn,
  };
}
