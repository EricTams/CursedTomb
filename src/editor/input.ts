import type { EditorModel } from "./model";
import type { EditorRenderer, Cell } from "./renderer";
import type { Palette } from "./palette";
import { BG, type Rect, type Tool } from "./types";

// Pointer-driven tool dispatch. Paint (with Shift = eyedropper), Flip-facing,
// and Select/Move (single-object drag + rubber-band region move) all live here.
export class EditorInput {
  private painting = false;
  private selecting = false;
  private moving = false;
  private last: Cell | null = null;
  private selStart: Cell | null = null;

  constructor(
    private readonly renderer: EditorRenderer,
    private readonly getModel: () => EditorModel,
    private readonly palette: Palette,
    private readonly getTool: () => Tool,
  ) {
    const canvas = renderer.canvas;
    canvas.addEventListener("pointerdown", (e) => this.onDown(e));
    canvas.addEventListener("pointermove", (e) => this.onMove(e));
    canvas.addEventListener("pointerup", (e) => this.onUp(e));
    canvas.addEventListener("pointercancel", (e) => this.onUp(e));
    canvas.addEventListener("contextmenu", (e) => this.onContext(e));
    window.addEventListener("keydown", (e) => this.onKey(e));
  }

  private onDown(e: PointerEvent): void {
    const cell = this.renderer.cellAt(e.clientX, e.clientY);
    if (!cell) return;
    const model = this.getModel();
    const tool = this.getTool();

    if (tool === "paint") {
      if (e.shiftKey) {
        this.palette.setBrush(model.charAt(cell.tx, cell.ty)); // eyedropper
        return;
      }
      this.painting = true;
      this.last = cell;
      model.setCell(cell.tx, cell.ty, this.palette.brush);
    } else if (tool === "flip") {
      model.toggleFacing(cell.tx, cell.ty);
    } else if (tool === "spawner") {
      model.toggleSpawner(cell.tx, cell.ty);
    } else {
      // select / move
      if (model.selection && inside(model.selection, cell)) {
        model.lift(model.selection, cell.tx, cell.ty);
        this.moving = true;
      } else if (model.charAt(cell.tx, cell.ty) !== BG) {
        model.setSelection(null);
        model.liftSingle(cell.tx, cell.ty);
        this.moving = true;
      } else {
        model.setSelection(null);
        this.selecting = true;
        this.selStart = cell;
        model.setSelection({ x0: cell.tx, y0: cell.ty, x1: cell.tx, y1: cell.ty });
      }
    }
    tryCapture(this.renderer.canvas, e.pointerId);
  }

  private onMove(e: PointerEvent): void {
    if (!this.painting && !this.selecting && !this.moving) return;
    const cell = this.renderer.cellAt(e.clientX, e.clientY);
    if (!cell) return;
    const model = this.getModel();
    if (this.painting && this.last) {
      model.paintLine(this.last.tx, this.last.ty, cell.tx, cell.ty, this.palette.brush);
      this.last = cell;
    } else if (this.selecting && this.selStart) {
      model.setSelection(norm(this.selStart, cell));
    } else if (this.moving) {
      model.moveFloatingTo(cell.tx, cell.ty);
    }
  }

  private onUp(e: PointerEvent): void {
    if (this.moving) this.getModel().drop();
    this.painting = false;
    this.selecting = false;
    this.moving = false;
    this.last = null;
    try {
      this.renderer.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  }

  private onContext(e: MouseEvent): void {
    e.preventDefault();
    const model = this.getModel();
    // Right-click cancels an in-progress move; otherwise it erases the cell
    // under the cursor (clearing its char and any facing/spawner meta).
    if (model.floating) {
      model.cancelFloating();
      this.moving = false;
      return;
    }
    const cell = this.renderer.cellAt(e.clientX, e.clientY);
    if (cell) model.setCell(cell.tx, cell.ty, BG);
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key !== "Escape") return;
    const model = this.getModel();
    if (model.floating) {
      model.cancelFloating();
      this.moving = false;
    } else {
      model.setSelection(null);
    }
  }

  // Drop any in-progress selection/move (called by main.ts when the tool changes).
  reset(): void {
    const model = this.getModel();
    if (model.floating) model.cancelFloating();
    model.setSelection(null);
    this.painting = this.selecting = this.moving = false;
  }
}

function inside(rect: Rect, cell: Cell): boolean {
  return cell.tx >= rect.x0 && cell.tx <= rect.x1 && cell.ty >= rect.y0 && cell.ty <= rect.y1;
}

function norm(a: Cell, b: Cell): Rect {
  return {
    x0: Math.min(a.tx, b.tx),
    y0: Math.min(a.ty, b.ty),
    x1: Math.max(a.tx, b.tx),
    y1: Math.max(a.ty, b.ty),
  };
}

function tryCapture(el: HTMLElement, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    /* capture unsupported / pointer gone */
  }
}
