// Portrait pause: the game is landscape-only (design doc §8). On touch
// devices held in portrait, gameplay pauses and a full-screen note asks the
// player to rotate. Gated on coarse pointers so resizing a desktop window
// tall never blocks play.

const CSS = `
#rotate-note {
  position: fixed;
  inset: 0;
  display: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  background: #0d0a14;
  z-index: 20;
  -webkit-user-select: none;
  user-select: none;
}
#rotate-note.visible { display: flex; }
#rotate-note .phone {
  width: 36px;
  height: 64px;
  border: 3px solid #c9b458;
  border-radius: 6px;
  animation: rotate-hint 1.6s ease-in-out infinite;
}
#rotate-note .text {
  color: #c9b458;
  font: bold 16px monospace;
  letter-spacing: 2px;
  text-align: center;
}
@keyframes rotate-hint {
  0%, 25% { transform: rotate(0deg); }
  60%, 100% { transform: rotate(90deg); }
}
`;

export class OrientationGuard {
  private readonly portrait = matchMedia("(orientation: portrait)");
  private readonly coarse = matchMedia("(pointer: coarse)");
  private readonly note: HTMLDivElement;

  constructor() {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    this.note = document.createElement("div");
    this.note.id = "rotate-note";
    const phone = document.createElement("div");
    phone.className = "phone";
    const text = document.createElement("div");
    text.className = "text";
    text.textContent = "ROTATE TO LANDSCAPE";
    this.note.appendChild(phone);
    this.note.appendChild(text);
    document.body.appendChild(this.note);

    this.portrait.addEventListener("change", () => this.sync());
    this.coarse.addEventListener("change", () => this.sync());
    this.sync();
  }

  get paused(): boolean {
    return this.coarse.matches && this.portrait.matches;
  }

  private sync(): void {
    this.note.classList.toggle("visible", this.paused);
  }
}
