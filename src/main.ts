import { TILE, GRID_W, GRID_H, VIEW_W, VIEW_H } from "./config";
import { startLoop } from "./loop";
import { Screen } from "./screen";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const screen = new Screen(canvas);
const ctx = screen.ctx;

// Milestone 0 test scene: checkerboard grid + title, enough to verify the
// integer scaler and deploy pipeline on desktop and phone. Replaced by the
// real level renderer in Milestone 1.
let tick = 0;

startLoop({
  update() {
    tick++;
  },

  render() {
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? "#1a1426" : "#221a30";
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }

    // Pulsing torch-light dot so it's obvious the loop is running.
    const pulse = Math.sin(tick / 20) * 0.5 + 0.5;
    ctx.fillStyle = `rgba(255, 180, 60, ${0.5 + pulse * 0.5})`;
    ctx.fillRect(VIEW_W / 2 - 2, VIEW_H / 2 + 24, 4, 4);

    ctx.fillStyle = "#c9b458";
    ctx.font = "16px monospace";
    ctx.textAlign = "center";
    ctx.fillText("CURSED TOMB", VIEW_W / 2, VIEW_H / 2);
    ctx.fillStyle = "#6e5fa0";
    ctx.font = "8px monospace";
    ctx.fillText(`${GRID_W}x${GRID_H} @ ${TILE}px`, VIEW_W / 2, VIEW_H / 2 + 14);

    screen.present();
  },
});
