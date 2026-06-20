import { Settings, LIGHT_FLOOR_MAX } from "./settings";

// Settings menu: a gear button (top-right, always visible) that opens a small
// modal panel. Lives in a DOM layer above the letterboxed canvas, mirroring
// touch.ts / orientation.ts. While open the game pauses (main.ts checks `open`),
// but render() keeps running, so slider changes preview the lighting live.
//
// Currently the only setting is the lighting brightness floor (dynamic-range
// compression — see settings.ts). The slider edits it in real time and the
// value persists via Settings.

const SLIDER_MAX = Math.round(LIGHT_FLOOR_MAX * 100); // percent

const CSS = `
#settings-gear {
  position: fixed;
  top: 10px;
  right: 10px;
  width: 40px;
  height: 40px;
  z-index: 15;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid rgba(201, 180, 88, 0.5);
  border-radius: 8px;
  background: rgba(13, 10, 20, 0.55);
  color: #c9b458;
  font: 22px monospace;
  cursor: pointer;
  -webkit-user-select: none;
  user-select: none;
  touch-action: manipulation;
}
#settings-gear:hover { border-color: #c9b458; }
#settings-overlay {
  position: fixed;
  inset: 0;
  display: none;
  align-items: center;
  justify-content: center;
  z-index: 16;
  background: rgba(0, 0, 0, 0.6);
  -webkit-user-select: none;
  user-select: none;
}
#settings-overlay.open { display: flex; }
#settings-panel {
  min-width: 260px;
  max-width: 86vw;
  padding: 20px 22px;
  background: #0d0a14;
  border: 2px solid #c9b458;
  border-radius: 10px;
  color: #c9b458;
  font: 14px monospace;
}
#settings-panel h2 {
  margin: 0 0 16px;
  font-size: 16px;
  letter-spacing: 3px;
  text-align: center;
}
#settings-panel .row { margin-bottom: 14px; }
#settings-panel .label {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
}
#settings-panel input[type="range"] {
  width: 100%;
  accent-color: #c9b458;
}
#settings-panel .hint {
  font-size: 11px;
  line-height: 1.4;
  opacity: 0.6;
  margin-bottom: 16px;
}
#settings-panel .buttons {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
#settings-panel button {
  flex: 1;
  padding: 8px 0;
  background: rgba(201, 180, 88, 0.12);
  border: 2px solid rgba(201, 180, 88, 0.5);
  border-radius: 6px;
  color: #c9b458;
  font: bold 13px monospace;
  letter-spacing: 1px;
  cursor: pointer;
  touch-action: manipulation;
}
#settings-panel button:hover { border-color: #c9b458; }
`;

export class SettingsMenu {
  open = false;

  private readonly overlay: HTMLDivElement;
  private readonly gear: HTMLDivElement;
  private readonly slider: HTMLInputElement;
  private readonly valueLabel: HTMLSpanElement;

  constructor(private readonly settings: Settings) {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    this.gear = document.createElement("div");
    this.gear.id = "settings-gear";
    this.gear.textContent = "⚙"; // gear glyph
    this.gear.setAttribute("aria-label", "Settings");
    document.body.appendChild(this.gear);

    this.overlay = document.createElement("div");
    this.overlay.id = "settings-overlay";
    const panel = document.createElement("div");
    panel.id = "settings-panel";

    const title = document.createElement("h2");
    title.textContent = "SETTINGS";
    panel.appendChild(title);

    const row = document.createElement("div");
    row.className = "row";
    const label = document.createElement("div");
    label.className = "label";
    const name = document.createElement("span");
    name.textContent = "Brightness floor";
    this.valueLabel = document.createElement("span");
    label.appendChild(name);
    label.appendChild(this.valueLabel);
    row.appendChild(label);

    this.slider = document.createElement("input");
    this.slider.type = "range";
    this.slider.min = "0";
    this.slider.max = String(SLIDER_MAX);
    this.slider.step = "1";
    row.appendChild(this.slider);
    panel.appendChild(row);

    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent =
      "Higher lifts the dark areas and shrinks the lighting range — easier to see on a phone screen.";
    panel.appendChild(hint);

    const buttons = document.createElement("div");
    buttons.className = "buttons";
    const resetBtn = document.createElement("button");
    resetBtn.textContent = "RESET";
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "DONE";
    buttons.appendChild(resetBtn);
    buttons.appendChild(closeBtn);
    panel.appendChild(buttons);

    this.overlay.appendChild(panel);
    document.body.appendChild(this.overlay);

    this.syncFromSettings();

    this.gear.addEventListener("click", () => this.toggle());
    closeBtn.addEventListener("click", () => this.setOpen(false));
    resetBtn.addEventListener("click", () => {
      this.settings.resetLightFloor();
      this.syncFromSettings();
    });
    // Tap the dimmed backdrop (outside the panel) to dismiss.
    this.overlay.addEventListener("click", (e) => {
      if (e.target === this.overlay) this.setOpen(false);
    });
    this.slider.addEventListener("input", () => {
      this.settings.setLightFloor(Number(this.slider.value) / 100);
      this.updateValueLabel();
    });
  }

  private toggle(): void {
    this.setOpen(!this.open);
  }

  private setOpen(open: boolean): void {
    this.open = open;
    this.overlay.classList.toggle("open", open);
    if (open) this.syncFromSettings();
  }

  private syncFromSettings(): void {
    this.slider.value = String(Math.round(this.settings.lightFloor * 100));
    this.updateValueLabel();
  }

  private updateValueLabel(): void {
    this.valueLabel.textContent = `${this.slider.value}%`;
  }
}
