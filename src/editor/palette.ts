// The palette of placeable legend characters, grouped for display.

export interface PaletteItem {
  char: string;
  label: string;
}

export const PALETTE_GROUPS: { title: string; items: PaletteItem[] }[] = [
  {
    title: "Tiles",
    items: [
      { char: ".", label: "Erase / Background" },
      { char: "#", label: "Solid" },
      { char: "H", label: "Ladder" },
      { char: "-", label: "One-way platform" },
      { char: "E", label: "Exit" },
    ],
  },
  {
    title: "Spawns",
    items: [
      { char: "P", label: "Player spawn" },
      { char: "s", label: "Snake" },
      { char: "t", label: "Large Troll" },
      { char: "m", label: "Small Troll" },
      { char: "f", label: "Frog" },
      { char: "c", label: "Cannon" },
      { char: "a", label: "Bat" },
    ],
  },
  {
    title: "Objects",
    items: [
      { char: "*", label: "Grapple ring" },
      { char: "L", label: "Light statue" },
      { char: "G", label: "Glass window" },
      { char: "^", label: "Spike" },
      { char: "$", label: "Treasure pot" },
      { char: "@", label: "Altar pot" },
      { char: "o", label: "Bounce Onion" },
      { char: "O", label: "Explosive Onion" },
    ],
  },
];

// Builds the palette DOM and tracks the current brush. Clicking an item selects
// it; `brush` is read by the paint tool.
export class Palette {
  brush = "#";
  private readonly buttons = new Map<string, HTMLButtonElement>();

  // onPick fires when the user clicks a palette item (not on initial setup) —
  // used to switch the editor into Paint mode so a pick is immediately usable.
  constructor(container: HTMLElement, onPick?: () => void) {
    for (const group of PALETTE_GROUPS) {
      const wrap = document.createElement("div");
      wrap.className = "pal-group";
      const h = document.createElement("h4");
      h.textContent = group.title;
      wrap.appendChild(h);
      for (const item of group.items) {
        const btn = document.createElement("button");
        btn.className = "pal-btn";
        const badge = document.createElement("code");
        badge.textContent = item.char;
        btn.appendChild(badge);
        btn.appendChild(document.createTextNode(" " + item.label));
        btn.addEventListener("click", () => {
          this.setBrush(item.char);
          onPick?.();
        });
        this.buttons.set(item.char, btn);
        wrap.appendChild(btn);
      }
      container.appendChild(wrap);
    }
    this.setBrush(this.brush);
  }

  setBrush(char: string): void {
    this.brush = char;
    for (const [ch, btn] of this.buttons) {
      btn.classList.toggle("active", ch === char);
    }
  }
}
