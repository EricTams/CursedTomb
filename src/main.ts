import { startLoop } from "./loop";
import { Screen } from "./screen";
import { Game } from "./game";
import { loadArt } from "./art";
import { LEVEL_1 } from "./levels/level1";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const screen = new Screen(canvas);

const art = await loadArt();
const game = new Game(screen.ctx, art, LEVEL_1);

startLoop({
  update() {
    game.update();
  },

  render(alpha) {
    game.render(alpha);
    screen.present();
  },
});
