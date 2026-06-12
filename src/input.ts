// TEMPORARY keyboard stub — just enough to play Milestone 1. Milestone 2
// replaces this with the device-agnostic action layer (todo.md), so this
// stays tiny and nothing outside Game should depend on its shape.

export class Input {
  left = false;
  right = false;
  up = false;
  down = false;
  jump = false;
  jumpPressed = false; // true only on the tick the key went down
  whipPressed = false;
  restartPressed = false;

  private jumpWasDown = false;
  private jumpDown = false;
  private whipDown = false;
  private whipWasDown = false;
  private restartDown = false;
  private restartWasDown = false;

  constructor() {
    window.addEventListener("keydown", (e) => this.onKey(e, true));
    window.addEventListener("keyup", (e) => this.onKey(e, false));
  }

  // Call once at the start of each tick to latch just-pressed edges.
  poll(): void {
    this.jumpPressed = this.jumpDown && !this.jumpWasDown;
    this.jumpWasDown = this.jumpDown;
    this.whipPressed = this.whipDown && !this.whipWasDown;
    this.whipWasDown = this.whipDown;
    this.restartPressed = this.restartDown && !this.restartWasDown;
    this.restartWasDown = this.restartDown;
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    switch (e.code) {
      case "ArrowLeft":
      case "KeyA":
        this.left = down;
        break;
      case "ArrowRight":
      case "KeyD":
        this.right = down;
        break;
      // Up is climb, not jump, now that ladders exist (NES scheme arrives in M2).
      case "ArrowUp":
      case "KeyW":
        this.up = down;
        break;
      case "ArrowDown":
      case "KeyS":
        this.down = down;
        break;
      // A-button: jump. Z pairs with arrows; K pairs with WASD (NES layout:
      // A sits right of B); Space works for both hands.
      case "KeyZ":
      case "KeyK":
      case "Space":
        this.jumpDown = down;
        this.jump = down;
        break;
      // B-button stand-in: whip. X pairs with arrows; J pairs with WASD.
      case "KeyX":
      case "KeyJ":
        this.whipDown = down;
        break;
      case "KeyR":
        this.restartDown = down;
        break;
      default:
        return;
    }
    e.preventDefault();
  }
}
