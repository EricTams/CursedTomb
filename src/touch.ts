import { ActionState, Input, InputSource, emptyActions } from "./input";

// Touch overlay (Milestone 2, design doc §8): virtual 8-way d-pad in the left
// thumb zone, B/A buttons in the right (A outermost, NES order). Lives in a
// full-window DOM layer above the letterboxed canvas; hidden until the first
// touch is seen so mouse/keyboard players never see it.
//
// The d-pad is a 9-segment rosette (4 cardinal arms + 4 diagonal wedges +
// center hub). All segments render faintly to advertise that diagonals exist;
// the segment matching the live merged input lights up (see render()).

const DEAD_ZONE = 0.28; // fraction of pad radius with no direction
const HYSTERESIS_DEG = 8; // extra degrees needed to leave the current sector

// Sector index 0..7 counterclockwise-in-screen-space from +x:
// 0=right, 1=down-right, 2=down, 3=down-left, 4=left, 5=up-left, 6=up, 7=up-right.
const SECTOR_ACTIONS: ReadonlyArray<Partial<ActionState>> = [
  { right: true },
  { right: true, down: true },
  { down: true },
  { left: true, down: true },
  { left: true },
  { left: true, up: true },
  { up: true },
  { right: true, up: true },
];

const CSS = `
#touch-ui {
  position: fixed;
  inset: 0;
  display: none;
  pointer-events: none;
  z-index: 10;
  -webkit-user-select: none;
  user-select: none;
}
#touch-ui.visible { display: block; }
#touch-ui .zone {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 176px;
  height: 176px;
  pointer-events: auto;
  touch-action: none;
}
#touch-pad { left: 14px; }
#touch-buttons { right: 14px; }
#touch-pad svg { width: 100%; height: 100%; display: block; }
#touch-pad .seg,
#touch-pad .hub {
  fill: rgba(255, 255, 255, 0.1);
  stroke: rgba(255, 255, 255, 0.22);
  stroke-width: 2;
  transition: fill 40ms linear;
}
#touch-pad .seg.active { fill: rgba(255, 255, 255, 0.5); }
#touch-ui .btn {
  position: absolute;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.55);
  font: bold 26px monospace;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 40ms linear;
}
#touch-ui .btn.active {
  background: rgba(255, 255, 255, 0.5);
  color: rgba(0, 0, 0, 0.7);
}
#touch-btn-b { left: 0; top: 14px; }
#touch-btn-a { right: 0; bottom: 14px; }
`;

// setPointerCapture throws for pointers the browser no longer (or never)
// considers active — e.g. a touch that lifted between event and handler, or
// synthetic events in tests. Capture is an enhancement, not a requirement.
function tryCapture(el: Element, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // fine: events still reach the zone while the pointer stays inside it
  }
}

// Annular sector path (SVG coords, y down) centered on `centerDeg`,
// spanning `spreadDeg`, between radii r0 and r1, in a 0..200 viewBox.
function sectorPath(centerDeg: number, spreadDeg: number, r0: number, r1: number): string {
  const a0 = ((centerDeg - spreadDeg / 2) * Math.PI) / 180;
  const a1 = ((centerDeg + spreadDeg / 2) * Math.PI) / 180;
  const cx = 100;
  const cy = 100;
  const p = (r: number, a: number) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
  return [
    `M ${p(r0, a0)}`,
    `L ${p(r1, a0)}`,
    `A ${r1} ${r1} 0 0 1 ${p(r1, a1)}`,
    `L ${p(r0, a1)}`,
    `A ${r0} ${r0} 0 0 0 ${p(r0, a0)}`,
    "Z",
  ].join(" ");
}

export class TouchSource implements InputSource {
  readonly actions: ActionState = emptyActions();

  private readonly root: HTMLDivElement;
  private readonly padZone: HTMLDivElement;
  private readonly segs: SVGPathElement[] = []; // indexed by sector 0..7
  private readonly btnA: HTMLDivElement;
  private readonly btnB: HTMLDivElement;

  private padPointer = -1; // pointerId steering the d-pad, -1 = none
  private sector = -1; // current 8-way sector, -1 = dead zone / no touch
  // Active pointers over the button zone, for slide-between-buttons support.
  private readonly buttonPointers = new Map<number, { x: number; y: number }>();

  constructor() {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    this.root = document.createElement("div");
    this.root.id = "touch-ui";

    this.padZone = document.createElement("div");
    this.padZone.id = "touch-pad";
    this.padZone.className = "zone";
    this.padZone.appendChild(this.buildPadSvg());
    this.root.appendChild(this.padZone);

    const buttons = document.createElement("div");
    buttons.id = "touch-buttons";
    buttons.className = "zone";
    this.btnB = this.buildButton("touch-btn-b", "B");
    this.btnA = this.buildButton("touch-btn-a", "A");
    buttons.appendChild(this.btnB);
    buttons.appendChild(this.btnA);
    this.root.appendChild(buttons);

    document.body.appendChild(this.root);

    this.bindPad();
    this.bindButtons(buttons);

    // Reveal the overlay on the first real touch anywhere; once shown it stays.
    window.addEventListener(
      "pointerdown",
      (e) => {
        if (e.pointerType === "touch") this.root.classList.add("visible");
      },
      { capture: true },
    );
  }

  // --- construction ---

  private buildPadSvg(): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 200 200");
    for (let i = 0; i < 8; i++) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      // 45° per sector minus a small visual gap between segments.
      path.setAttribute("d", sectorPath(i * 45, 39, 34, 96));
      path.setAttribute("class", "seg");
      svg.appendChild(path);
      this.segs.push(path);
    }
    const hub = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    hub.setAttribute("cx", "100");
    hub.setAttribute("cy", "100");
    hub.setAttribute("r", "24");
    hub.setAttribute("class", "hub");
    svg.appendChild(hub);
    return svg;
  }

  private buildButton(id: string, label: string): HTMLDivElement {
    const el = document.createElement("div");
    el.id = id;
    el.className = "btn";
    el.textContent = label;
    return el;
  }

  // --- d-pad pointer handling ---

  private bindPad(): void {
    const zone = this.padZone;
    zone.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (this.padPointer !== -1) return; // one thumb steers
      this.padPointer = e.pointerId;
      tryCapture(zone, e.pointerId);
      this.steer(e);
    });
    zone.addEventListener("pointermove", (e) => {
      if (e.pointerId === this.padPointer) this.steer(e);
    });
    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.padPointer) return;
      this.padPointer = -1;
      this.setSector(-1);
    };
    zone.addEventListener("pointerup", release);
    zone.addEventListener("pointercancel", release);
  }

  private steer(e: PointerEvent): void {
    const rect = this.padZone.getBoundingClientRect();
    const radius = rect.width / 2;
    const dx = e.clientX - (rect.left + radius);
    const dy = e.clientY - (rect.top + radius);
    const dist = Math.hypot(dx, dy);
    if (dist < radius * DEAD_ZONE) {
      this.setSector(-1);
      return;
    }

    const angle = (Math.atan2(dy, dx) * 180) / Math.PI; // -180..180, 0 = right
    if (this.sector !== -1) {
      // Hysteresis: stay in the current sector until the thumb is clearly out.
      const center = this.sector * 45;
      let delta = angle - center;
      while (delta > 180) delta -= 360;
      while (delta < -180) delta += 360;
      if (Math.abs(delta) <= 22.5 + HYSTERESIS_DEG) return;
    }
    const sector = ((Math.round(angle / 45) % 8) + 8) % 8;
    this.setSector(sector);
  }

  private setSector(sector: number): void {
    this.sector = sector;
    this.actions.left = false;
    this.actions.right = false;
    this.actions.up = false;
    this.actions.down = false;
    if (sector !== -1) Object.assign(this.actions, SECTOR_ACTIONS[sector]);
  }

  // --- button pointer handling ---

  private bindButtons(zone: HTMLDivElement): void {
    const track = (e: PointerEvent) => {
      e.preventDefault();
      if (e.type === "pointerdown") tryCapture(zone, e.pointerId);
      this.buttonPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.updateButtons();
    };
    zone.addEventListener("pointerdown", track);
    zone.addEventListener("pointermove", (e) => {
      if (this.buttonPointers.has(e.pointerId)) track(e);
    });
    const release = (e: PointerEvent) => {
      if (!this.buttonPointers.delete(e.pointerId)) return;
      this.updateButtons();
    };
    zone.addEventListener("pointerup", release);
    zone.addEventListener("pointercancel", release);
  }

  // A pointer presses whichever button circle it's inside (with a little
  // slop), so a thumb can slide between B and A without re-tapping.
  private updateButtons(): void {
    this.actions.a = this.hitsButton(this.btnA);
    this.actions.b = this.hitsButton(this.btnB);
  }

  private hitsButton(btn: HTMLDivElement): boolean {
    const rect = btn.getBoundingClientRect();
    const r = rect.width / 2 + 12;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    for (const p of this.buttonPointers.values()) {
      if (Math.hypot(p.x - cx, p.y - cy) <= r) return true;
    }
    return false;
  }

  // --- visual feedback ---

  // Light the overlay from the merged action state (so keyboard input also
  // shows while the overlay is visible — handy in device emulation).
  render(input: Input): void {
    if (!this.root.classList.contains("visible")) return;

    const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    let active = -1;
    if (dx !== 0 || dy !== 0) {
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      active = ((Math.round(angle / 45) % 8) + 8) % 8;
    }
    for (let i = 0; i < 8; i++) {
      this.segs[i].classList.toggle("active", i === active);
    }
    this.btnA.classList.toggle("active", input.a);
    this.btnB.classList.toggle("active", input.b);
  }
}
