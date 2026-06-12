import { TICK_MS } from "./config";

export interface Game {
  update(): void;
  render(alpha: number): void;
}

// Fixed-timestep loop with an accumulator: update() runs at exactly TICK_HZ
// regardless of display refresh rate; render() gets the interpolation factor.
export function startLoop(game: Game): void {
  let last = performance.now();
  let acc = 0;

  function frame(now: number) {
    // Clamp huge deltas (tab was backgrounded) so we don't spiral.
    acc += Math.min(now - last, 250);
    last = now;

    while (acc >= TICK_MS) {
      game.update();
      acc -= TICK_MS;
    }
    game.render(acc / TICK_MS);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
