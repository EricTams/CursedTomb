import { startLoop } from "./loop";
import { Screen } from "./screen";
import { Game } from "./game";
import { loadArt } from "./art";
import { Input } from "./input";
import { KeyboardSource } from "./keyboard";
import { TouchSource } from "./touch";
import { LEVEL_1 } from "./levels/level1";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const screen = new Screen(canvas);

const input = new Input();
input.addSource(new KeyboardSource());
const touch = new TouchSource();
input.addSource(touch);

const art = await loadArt();
const game = new Game(screen.ctx, art, input, LEVEL_1);

startLoop({
  update() {
    game.update();
  },

  render(alpha) {
    game.render(alpha);
    screen.present();
    touch.render(input);
  },
});
