import { startLoop } from "./loop";
import { Screen } from "./screen";
import { Game } from "./game";
import { loadArt } from "./art";
import { Input } from "./input";
import { KeyboardSource } from "./keyboard";
import { TouchSource } from "./touch";
import { OrientationGuard } from "./orientation";
import { LEVEL_1 } from "./levels/level1";
import { LEVEL_2 } from "./levels/level2";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const screen = new Screen(canvas);

const input = new Input();
input.addSource(new KeyboardSource());
const touch = new TouchSource();
input.addSource(touch);
const orientation = new OrientationGuard();

const art = await loadArt();
// TEMP: level 2 first for overlay testing — revert before commit.
const game = new Game(screen.ctx, art, input, [LEVEL_2, LEVEL_1]);

// Dev hook: dump the native-res frame buffer to tmp/frame.png on disk (the
// vite middleware in vite.config.ts does the writing). Lets tooling inspect
// the exact pixels instead of scaled screenshots.
(window as unknown as { __dumpFrame: () => Promise<string> }).__dumpFrame =
  async () => {
    const blob = await screen.buffer.convertToBlob({ type: "image/png" });
    const res = await fetch("/__frame", { method: "POST", body: blob });
    return res.text();
  };

startLoop({
  update() {
    if (orientation.paused) return; // portrait on a phone: wait for rotation
    game.update();
  },

  render(alpha) {
    game.render(alpha);
    screen.present();
    touch.render(input);
  },
});
