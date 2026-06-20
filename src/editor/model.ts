import { GRID_W, GRID_H } from "../config";
import type { CellMeta, FacingTag, LevelInput, LevelMeta } from "../level";
import { BG, ENEMY_CHARS, SPAWNER_ABLE_CHARS, type Rect } from "./types";

// A lifted block being dragged in Select/Move mode. Chars + meta are captured
// relative to the block; the source cells are cleared to background on lift, so
// `orig*` is kept to support cancel (re-stamp at the original origin).
interface Floating {
  w: number;
  h: number;
  chars: string[]; // length w*h
  metas: (CellMeta | undefined)[]; // length w*h, parallel to chars
  ox: number; // current top-left (live, follows the pointer)
  oy: number;
  grabRelX: number; // where inside the block the pointer grabbed
  grabRelY: number;
  origX: number; // origin at lift time (for cancel)
  origY: number;
}

const key = (tx: number, ty: number) => `${tx},${ty}`;

// The editor's in-memory level: a flat grid of legend chars plus a per-cell
// meta side-table. Every mutation funnels through `setCell`, which is also the
// single place orphaned meta is dropped (when a cell's char changes).
export class EditorModel {
  cells: string[];
  meta: Map<string, CellMeta>;
  selection: Rect | null = null;
  floating: Floating | null = null;
  dirty = false;

  constructor(cells?: string[], meta?: Map<string, CellMeta>) {
    this.cells = cells ?? new Array(GRID_W * GRID_H).fill(BG);
    this.meta = meta ?? new Map();
  }

  // Fresh level: solid border, empty interior, an entrance (P) near the
  // top-left and an exit (E) near the bottom-right.
  static newLevel(): EditorModel {
    const cells = new Array<string>(GRID_W * GRID_H).fill(BG);
    for (let x = 0; x < GRID_W; x++) {
      cells[x] = "#";
      cells[(GRID_H - 1) * GRID_W + x] = "#";
    }
    for (let y = 0; y < GRID_H; y++) {
      cells[y * GRID_W] = "#";
      cells[y * GRID_W + GRID_W - 1] = "#";
    }
    cells[1 * GRID_W + 2] = "P";
    cells[(GRID_H - 2) * GRID_W + (GRID_W - 3)] = "E";
    return new EditorModel(cells);
  }

  // Load an existing level for editing. Reads the RAW ascii chars (keeping
  // spawns/objects as their legend chars — NOT the parsed/stripped form).
  static fromInput(input: LevelInput): EditorModel {
    const ascii = typeof input === "string" ? input : input.ascii;
    const meta: LevelMeta = typeof input === "string" ? {} : input.meta;
    const rows = ascii
      .split("\n")
      .map((r) => r.replace(/\s+$/, ""))
      .filter((r) => r.length > 0);
    const cells = new Array<string>(GRID_W * GRID_H).fill(BG);
    for (let y = 0; y < Math.min(GRID_H, rows.length); y++) {
      const row = rows[y];
      for (let x = 0; x < GRID_W; x++) cells[y * GRID_W + x] = row[x] ?? BG;
    }
    const map = new Map<string, CellMeta>();
    for (const k of Object.keys(meta)) map.set(k, { ...meta[k] });
    return new EditorModel(cells, map);
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && tx < GRID_W && ty >= 0 && ty < GRID_H;
  }

  charAt(tx: number, ty: number): string {
    return this.inBounds(tx, ty) ? this.cells[ty * GRID_W + tx] : BG;
  }

  // The single mutation choke point. Changing a cell's char drops any meta
  // that was attached to it (paint-over / erase can't leave orphaned facing).
  setCell(tx: number, ty: number, ch: string): void {
    if (!this.inBounds(tx, ty)) return;
    const i = ty * GRID_W + tx;
    if (this.cells[i] === ch) return; // no change — keep meta (e.g. repaint)
    this.meta.delete(key(tx, ty));
    this.cells[i] = ch;
    this.dirty = true;
  }

  // Paint every cell along the segment from (x0,y0) to (x1,y1) so fast drags
  // don't leave gaps. Bresenham over grid cells.
  paintLine(x0: number, y0: number, x1: number, y1: number, ch: string): void {
    let dx = Math.abs(x1 - x0);
    let dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    for (;;) {
      this.setCell(x, y, ch);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  facingOf(tx: number, ty: number): FacingTag | undefined {
    return this.meta.get(key(tx, ty))?.facing;
  }

  spawnerOf(tx: number, ty: number): boolean {
    return this.meta.get(key(tx, ty))?.spawner === true;
  }

  // Flip-facing tool: toggle an enemy cell between left/right. Unset defaults to
  // left (the sprite default), so the first toggle flips it to right. Merges
  // into existing meta so a co-located spawner flag survives.
  toggleFacing(tx: number, ty: number): boolean {
    if (!ENEMY_CHARS.has(this.charAt(tx, ty))) return false;
    const cur = this.facingOf(tx, ty);
    const next: FacingTag = cur === "right" ? "left" : "right";
    const prev = this.meta.get(key(tx, ty)) ?? {};
    this.meta.set(key(tx, ty), { ...prev, facing: next });
    this.dirty = true;
    return true;
  }

  // Spawner tool: toggle a spawnable enemy cell (v/b/e/a) between a one-shot
  // spawn and a respawning statue spawner. Merges so facing survives.
  toggleSpawner(tx: number, ty: number): boolean {
    if (!SPAWNER_ABLE_CHARS.has(this.charAt(tx, ty))) return false;
    const prev = this.meta.get(key(tx, ty)) ?? {};
    this.meta.set(key(tx, ty), { ...prev, spawner: !this.spawnerOf(tx, ty) });
    this.dirty = true;
    return true;
  }

  setSelection(rect: Rect | null): void {
    this.selection = rect;
  }

  // Lift a region into a floating block and clear the source cells.
  lift(rect: Rect, grabTx: number, grabTy: number): void {
    const w = rect.x1 - rect.x0 + 1;
    const h = rect.y1 - rect.y0 + 1;
    const chars: string[] = [];
    const metas: (CellMeta | undefined)[] = [];
    for (let ry = 0; ry < h; ry++) {
      for (let rx = 0; rx < w; rx++) {
        const tx = rect.x0 + rx;
        const ty = rect.y0 + ry;
        chars.push(this.charAt(tx, ty));
        const m = this.meta.get(key(tx, ty));
        metas.push(m ? { ...m } : undefined);
      }
    }
    for (let ry = 0; ry < h; ry++) {
      for (let rx = 0; rx < w; rx++) {
        this.setCell(rect.x0 + rx, rect.y0 + ry, BG);
      }
    }
    this.floating = {
      w,
      h,
      chars,
      metas,
      ox: rect.x0,
      oy: rect.y0,
      grabRelX: grabTx - rect.x0,
      grabRelY: grabTy - rect.y0,
      origX: rect.x0,
      origY: rect.y0,
    };
    this.selection = null;
    this.dirty = true;
  }

  // Single-object pickup: lift just the cell under the pointer.
  liftSingle(tx: number, ty: number): void {
    this.lift({ x0: tx, y0: ty, x1: tx, y1: ty }, tx, ty);
  }

  // Move the floating block so the grabbed cell tracks (tx,ty), clamped so the
  // whole block stays in bounds (no partial drop).
  moveFloatingTo(tx: number, ty: number): void {
    const f = this.floating;
    if (!f) return;
    f.ox = clamp(tx - f.grabRelX, 0, GRID_W - f.w);
    f.oy = clamp(ty - f.grabRelY, 0, GRID_H - f.h);
  }

  // Commit the floating block. Non-background cells overwrite the destination;
  // background cells in the block do NOT punch holes. Meta re-keys to the new
  // absolute cell.
  drop(): void {
    const f = this.floating;
    if (!f) return;
    for (let ry = 0; ry < f.h; ry++) {
      for (let rx = 0; rx < f.w; rx++) {
        const ch = f.chars[ry * f.w + rx];
        if (ch === BG) continue;
        const tx = f.ox + rx;
        const ty = f.oy + ry;
        this.setCell(tx, ty, ch);
        const m = f.metas[ry * f.w + rx];
        if (m) this.meta.set(key(tx, ty), { ...m });
      }
    }
    this.floating = null;
    this.dirty = true;
  }

  // Abort a move: re-stamp the block at its original origin (source was cleared
  // on lift).
  cancelFloating(): void {
    const f = this.floating;
    if (!f) return;
    for (let ry = 0; ry < f.h; ry++) {
      for (let rx = 0; rx < f.w; rx++) {
        const ch = f.chars[ry * f.w + rx];
        if (ch === BG) continue;
        const tx = f.origX + rx;
        const ty = f.origY + ry;
        this.setCell(tx, ty, ch);
        const m = f.metas[ry * f.w + rx];
        if (m) this.meta.set(key(tx, ty), { ...m });
      }
    }
    this.floating = null;
  }

  count(ch: string): number {
    let n = 0;
    for (const c of this.cells) if (c === ch) n++;
    return n;
  }

  // Exactly one player spawn is required by parseLevel — block Save otherwise.
  canSave(): boolean {
    return this.count("P") === 1;
  }

  // Human-readable problems for the status bar. The first entry of each is the
  // blocking condition; exit-count is a non-blocking warning.
  issues(): string[] {
    const out: string[] = [];
    const p = this.count("P");
    if (p === 0) out.push("No player spawn (P) — required.");
    else if (p > 1) out.push(`Multiple player spawns (${p}) — only one allowed.`);
    if (this.count("E") === 0) out.push("No exit (E) — level is unwinnable.");
    return out;
  }

  toAscii(): string {
    const rows: string[] = [];
    for (let y = 0; y < GRID_H; y++) {
      rows.push(this.cells.slice(y * GRID_W, (y + 1) * GRID_W).join(""));
    }
    return rows.join("\n");
  }

  // Plain-object meta for serialization: only enemy cells that actually carry a
  // facing and/or spawner flag (defensive against orphaned/non-enemy meta).
  metaObject(): LevelMeta {
    const out: LevelMeta = {};
    for (const [k, m] of this.meta) {
      const [tx, ty] = k.split(",").map(Number);
      if (!ENEMY_CHARS.has(this.charAt(tx, ty))) continue;
      const cell: CellMeta = {};
      if (m.facing) cell.facing = m.facing;
      if (m.spawner) cell.spawner = true;
      if (cell.facing !== undefined || cell.spawner !== undefined) out[k] = cell;
    }
    return out;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
