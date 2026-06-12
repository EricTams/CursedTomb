import { VIEW_W, VIEW_H } from "./config";

// The game draws into a fixed-size offscreen buffer at native tile resolution.
// That buffer is blitted to the visible canvas at the largest integer scale
// that fits the window (nearest-neighbor). Game logic never sees screen size.
export class Screen {
  readonly buffer: OffscreenCanvas;
  readonly ctx: OffscreenCanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;
  private readonly screenCtx: CanvasRenderingContext2D;
  private scale = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.buffer = new OffscreenCanvas(VIEW_W, VIEW_H);
    this.ctx = this.buffer.getContext("2d")!;
    this.screenCtx = canvas.getContext("2d")!;

    window.addEventListener("resize", () => this.fit());
    this.fit();
  }

  private fit(): void {
    const dpr = window.devicePixelRatio || 1;
    const availW = window.innerWidth * dpr;
    const availH = window.innerHeight * dpr;
    this.scale = Math.max(1, Math.floor(Math.min(availW / VIEW_W, availH / VIEW_H)));

    this.canvas.width = VIEW_W * this.scale;
    this.canvas.height = VIEW_H * this.scale;
    // Center via CSS in logical pixels; letterbox leftovers show the page bezel.
    this.canvas.style.width = `${(VIEW_W * this.scale) / dpr}px`;
    this.canvas.style.height = `${(VIEW_H * this.scale) / dpr}px`;
    this.canvas.style.left = `${(window.innerWidth - (VIEW_W * this.scale) / dpr) / 2}px`;
    this.canvas.style.top = `${(window.innerHeight - (VIEW_H * this.scale) / dpr) / 2}px`;

    this.screenCtx.imageSmoothingEnabled = false;
  }

  // Blit the offscreen buffer to the visible canvas.
  present(): void {
    this.screenCtx.imageSmoothingEnabled = false;
    this.screenCtx.drawImage(
      this.buffer,
      0,
      0,
      this.canvas.width,
      this.canvas.height,
    );
  }
}
