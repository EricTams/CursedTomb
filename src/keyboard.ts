import { ActionState, InputSource, emptyActions } from "./input";

// Keyboard source. Two parallel layouts so either hand position works:
// arrows + Z/X, or WASD + K/J (NES pad order: B left of A under the right
// hand). Space jumps in both.
export class KeyboardSource implements InputSource {
  readonly actions: ActionState = emptyActions();

  constructor() {
    window.addEventListener("keydown", (e) => this.onKey(e, true));
    window.addEventListener("keyup", (e) => this.onKey(e, false));
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    switch (e.code) {
      case "ArrowLeft":
      case "KeyA":
        this.actions.left = down;
        break;
      case "ArrowRight":
      case "KeyD":
        this.actions.right = down;
        break;
      case "ArrowUp":
      case "KeyW":
        this.actions.up = down;
        break;
      case "ArrowDown":
      case "KeyS":
        this.actions.down = down;
        break;
      // A-button: jump.
      case "KeyZ":
      case "KeyK":
      case "Space":
        this.actions.a = down;
        break;
      // B-button: context verb (whip for now).
      case "KeyX":
      case "KeyJ":
        this.actions.b = down;
        break;
      // Dev conveniences, not part of the NES scheme (touch has no equivalent).
      case "KeyR":
        this.actions.restart = down;
        break;
      case "KeyM":
        this.actions.map = down;
        break;
      case "KeyL":
        this.actions.lightMode = down;
        break;
      case "KeyN":
        this.actions.lightCurve = down;
        break;
      // Dev: step to the previous / next level.
      case "Minus":
        this.actions.prevLevel = down;
        break;
      case "Equal":
        this.actions.nextLevel = down;
        break;
      default:
        return;
    }
    e.preventDefault();
  }
}
