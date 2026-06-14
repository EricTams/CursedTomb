// Approved art lives in assets/art/ (PNG + Aseprite JSON pairs) — the only
// folder the game loads from. Vite turns these imports into hashed URLs.
//
// Dark / Very Dark tile variants live in assets/art/ as calibration reference
// for the runtime lighting operator — they are not imported here.
import solidUrl from "../assets/art/Tileset-Tile.png";
import ladderUrl from "../assets/art/Tileset-Ladder.png";
import platformUrl from "../assets/art/Tileset-Platform.png";

import exitUrl from "../assets/art/Exit-Door.png";
import exitJson from "../assets/art/Exit-Door.json";
import hookUrl from "../assets/art/Hook-Hook.png";
import hookJson from "../assets/art/Hook-Hook.json";

// Enemies (reskinned onto the existing behaviors):
//   walker = Snake, grabbable/throwable + spawner = Large Troll,
//   stationary shooter = Dart Cannon (fires Darts).
import snakeUrl from "../assets/art/Snake-Walk.png";
import snakeJson from "../assets/art/Snake-Walk.json";
import snakeHitUrl from "../assets/art/Snake-Hit.png";
import snakeHitJson from "../assets/art/Snake-Hit.json";
import trollUrl from "../assets/art/Large Troll-Walk.png";
import trollJson from "../assets/art/Large Troll-Walk.json";
import trollHitUrl from "../assets/art/Large Troll-Hit.png";
import trollHitJson from "../assets/art/Large Troll-Hit.json";
import smallTrollWalkUrl from "../assets/art/Small Troll-Walk.png";
import smallTrollWalkJson from "../assets/art/Small Troll-Walk.json";
import smallTrollHitUrl from "../assets/art/Small Troll-Hit.png";
import smallTrollHitJson from "../assets/art/Small Troll-Hit.json";
import frogStillUrl from "../assets/art/Frog-Still.png";
import frogStillJson from "../assets/art/Frog-Still.json";
import frogUpUrl from "../assets/art/Frog-Up.png";
import frogUpJson from "../assets/art/Frog-Up.json";
import frogJumpUrl from "../assets/art/Frog-Jump Up.png";
import frogJumpJson from "../assets/art/Frog-Jump Up.json";
import frogHitUrl from "../assets/art/Frog-Hit.png";
import frogHitJson from "../assets/art/Frog-Hit.json";
import frogHitGroundUrl from "../assets/art/Frog-Hit Ground.png";
import frogHitGroundJson from "../assets/art/Frog-Hit Ground.json";
import batFlyUrl from "../assets/art/Bat-Fly.png";
import batFlyJson from "../assets/art/Bat-Fly.json";
import batHitUrl from "../assets/art/Bat-Hit.png";
import batHitJson from "../assets/art/Bat-Hit.json";
import batCapturedUrl from "../assets/art/Bat-Captured Fly.png";
import batCapturedJson from "../assets/art/Bat-Captured Fly.json";
import cannonIdleUrl from "../assets/art/Dart Cannon-Idle.png";
import cannonIdleJson from "../assets/art/Dart Cannon-Idle.json";
import cannonShootUrl from "../assets/art/Dart Cannon-Shoot.png";
import cannonShootJson from "../assets/art/Dart Cannon-Shoot.json";
import dartUrl from "../assets/art/Dart-Fly.png";
import dartJson from "../assets/art/Dart-Fly.json";
import dartBoomUrl from "../assets/art/Dart Explosion-Explosion.png";
import dartBoomJson from "../assets/art/Dart Explosion-Explosion.json";

import spikeDownUrl from "../assets/art/Spike-Down.png";
import spikeDownJson from "../assets/art/Spike-Down.json";
import spikeLeftUrl from "../assets/art/Spike-Left.png";
import spikeLeftJson from "../assets/art/Spike-Left.json";
import spikeRightUrl from "../assets/art/Spike-Right.png";
import spikeRightJson from "../assets/art/Spike-Right.json";
import spikeUpUrl from "../assets/art/Spike-Up.png";
import spikeUpJson from "../assets/art/Spike-Up.json";

import bounceOnionStillUrl from "../assets/art/Bounce Onion-Still.png";
import bounceOnionStillJson from "../assets/art/Bounce Onion-Still.json";
import bounceOnionBounceUrl from "../assets/art/Bounce Onion-Bounce.png";
import bounceOnionBounceJson from "../assets/art/Bounce Onion-Bounce.json";
import explosiveOnionStillUrl from "../assets/art/Explosive Bounce Onion-Still.png";
import explosiveOnionStillJson from "../assets/art/Explosive Bounce Onion-Still.json";
import explosiveOnionBounceUrl from "../assets/art/Explosive Bounce Onion-Bounce.png";
import explosiveOnionBounceJson from "../assets/art/Explosive Bounce Onion-Bounce.json";
import explosiveOnionExplodeUrl from "../assets/art/Explosive Bounce Onion-Explode.png";
import explosiveOnionExplodeJson from "../assets/art/Explosive Bounce Onion-Explode.json";

import coinUrl from "../assets/art/Coin-Coin.png";
import coinJson from "../assets/art/Coin-Coin.json";
import smallPotUrl from "../assets/art/Small Pot-Pot.png";
import smallPotJson from "../assets/art/Small Pot-Pot.json";
import tallPotUrl from "../assets/art/Tall Pot-Pot.png";
import tallPotJson from "../assets/art/Tall Pot-Pot.json";

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
import lightStatueOffUrl from "../assets/art/Light Statue-Off.png";
import lightStatueOffJson from "../assets/art/Light Statue-Off.json";
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

export interface SpikeArt {
  down: Sprite;
  left: Sprite;
  right: Sprite;
  up: Sprite;
}

export interface SmallTrollArt {
  walk: Sprite;
  hit: Sprite;
}

export interface FrogArt {
  still: Sprite;
  up: Sprite;
  jumpUp: Sprite;
  hit: Sprite;
  hitGround: Sprite;
}

export interface BatArt {
  fly: Sprite;
  hit: Sprite;
  capturedFly: Sprite;
}

export interface BounceOnionArt {
  still: Sprite;
  bounce: Sprite;
}

export interface ExplosiveBounceOnionArt {
  still: Sprite;
  bounce: Sprite;
  explode: Sprite;
}

export interface Art {
  solid: HTMLImageElement;
  ladder: HTMLImageElement;
  platform: HTMLImageElement;
  exit: Sprite;
  hook: Sprite;
  snake: Sprite; // walker (was Virus)
  snakeHit: Sprite;
  troll: Sprite; // grabbable/throwable walker (was Plant Box)
  trollHit: Sprite; // hurt/folded pose for stun/held/thrown
  smallTroll: SmallTrollArt;
  frog: FrogArt;
  bat: BatArt;
  cannonIdle: Sprite; // shooter stare (was Eye)
  cannonShoot: Sprite; // shooter charge/fire
  dart: Sprite; // the fired projectile (was the bolt)
  dartBoom: Sprite; // dart impact burst
  spike: SpikeArt;
  bounceOnion: BounceOnionArt;
  explosiveBounceOnion: ExplosiveBounceOnionArt;
  coin: Sprite;
  smallPot: Sprite;
  tallPot: Sprite;
  player: PlayerArt;
  lightStatueOff: Sprite;
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
    exit,
    hook,
    snake,
    snakeHit,
    troll,
    trollHit,
    smallTrollWalk,
    smallTrollHit,
    frogStill,
    frogUp,
    frogJump,
    frogHit,
    frogHitGround,
    batFly,
    batHit,
    batCaptured,
    cannonIdle,
    cannonShoot,
    dart,
    dartBoom,
    spikeDown,
    spikeLeft,
    spikeRight,
    spikeUp,
    bounceOnionStill,
    bounceOnionBounce,
    explosiveOnionStill,
    explosiveOnionBounce,
    explosiveOnionExplode,
    coin,
    smallPot,
    tallPot,
    playerStill,
    playerWalk,
    playerJump,
    playerFall,
    playerUp,
    playerDown,
    playerUse,
    playerLand,
    lightStatueOff,
    lightStatueOn,
  ] = await Promise.all([
    loadImage(solidUrl),
    loadImage(ladderUrl),
    loadImage(platformUrl),
    loadSprite(exitUrl, exitJson),
    loadSprite(hookUrl, hookJson),
    loadSprite(snakeUrl, snakeJson),
    loadSprite(snakeHitUrl, snakeHitJson),
    loadSprite(trollUrl, trollJson),
    loadSprite(trollHitUrl, trollHitJson),
    loadSprite(smallTrollWalkUrl, smallTrollWalkJson),
    loadSprite(smallTrollHitUrl, smallTrollHitJson),
    loadSprite(frogStillUrl, frogStillJson),
    loadSprite(frogUpUrl, frogUpJson),
    loadSprite(frogJumpUrl, frogJumpJson),
    loadSprite(frogHitUrl, frogHitJson),
    loadSprite(frogHitGroundUrl, frogHitGroundJson),
    loadSprite(batFlyUrl, batFlyJson),
    loadSprite(batHitUrl, batHitJson),
    loadSprite(batCapturedUrl, batCapturedJson),
    loadSprite(cannonIdleUrl, cannonIdleJson),
    loadSprite(cannonShootUrl, cannonShootJson),
    loadSprite(dartUrl, dartJson),
    loadSprite(dartBoomUrl, dartBoomJson),
    loadSprite(spikeDownUrl, spikeDownJson),
    loadSprite(spikeLeftUrl, spikeLeftJson),
    loadSprite(spikeRightUrl, spikeRightJson),
    loadSprite(spikeUpUrl, spikeUpJson),
    loadSprite(bounceOnionStillUrl, bounceOnionStillJson),
    loadSprite(bounceOnionBounceUrl, bounceOnionBounceJson),
    loadSprite(explosiveOnionStillUrl, explosiveOnionStillJson),
    loadSprite(explosiveOnionBounceUrl, explosiveOnionBounceJson),
    loadSprite(explosiveOnionExplodeUrl, explosiveOnionExplodeJson),
    loadSprite(coinUrl, coinJson),
    loadSprite(smallPotUrl, smallPotJson),
    loadSprite(tallPotUrl, tallPotJson),
    loadSprite(playerStillUrl, playerStillJson),
    loadSprite(playerWalkUrl, playerWalkJson),
    loadSprite(playerJumpUrl, playerJumpJson),
    loadSprite(playerFallUrl, playerFallJson),
    loadSprite(playerUpUrl, playerUpJson),
    loadSprite(playerDownUrl, playerDownJson),
    loadSprite(playerUseUrl, playerUseJson),
    loadSprite(playerLandUrl, playerLandJson),
    loadSprite(lightStatueOffUrl, lightStatueOffJson),
    loadSprite(lightStatueOnUrl, lightStatueOnJson),
  ]);
  return {
    solid,
    ladder,
    platform,
    exit,
    hook,
    snake,
    snakeHit,
    troll,
    trollHit,
    smallTroll: { walk: smallTrollWalk, hit: smallTrollHit },
    frog: {
      still: frogStill,
      up: frogUp,
      jumpUp: frogJump,
      hit: frogHit,
      hitGround: frogHitGround,
    },
    bat: { fly: batFly, hit: batHit, capturedFly: batCaptured },
    cannonIdle,
    cannonShoot,
    dart,
    dartBoom,
    spike: { down: spikeDown, left: spikeLeft, right: spikeRight, up: spikeUp },
    bounceOnion: { still: bounceOnionStill, bounce: bounceOnionBounce },
    explosiveBounceOnion: {
      still: explosiveOnionStill,
      bounce: explosiveOnionBounce,
      explode: explosiveOnionExplode,
    },
    coin,
    smallPot,
    tallPot,
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
    lightStatueOff,
    lightStatueOn,
  };
}
