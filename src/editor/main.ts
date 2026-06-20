import { loadArt } from "../art";
import { EditorModel } from "./model";
import { EditorRenderer } from "./renderer";
import { EditorInput } from "./input";
import { Palette } from "./palette";
import { emitModule } from "./serialize";
import type { Tool } from "./types";
import { LEVELS } from "../levels";

// Slugify a display name to the file/const id used for saving (e.g.
// "Spike Pit" -> "spike_pit"), so loading a level prefills a save name that
// overwrites its own source file.
const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>("edit-canvas");
const statusEl = $("status");
const nameInput = $<HTMLInputElement>("save-name");
const loadSelect = $<HTMLSelectElement>("load-select");

const art = await loadArt();
const renderer = new EditorRenderer(canvas, art);

// Mutable holder so New/Load can swap the model while input/render read the
// current one.
const app = { model: EditorModel.newLevel() };
let tool: Tool = "paint";

const palette = new Palette($("palette"), () => selectTool("paint"));
const input = new EditorInput(renderer, () => app.model, palette, () => tool);

// --- Toolbar: tool selection ------------------------------------------------
const toolButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>(".tool-btn[data-tool]"),
);
function selectTool(next: Tool): void {
  tool = next;
  input.reset(); // drop any in-progress selection/move when switching tools
  for (const btn of toolButtons) {
    btn.classList.toggle("active", btn.dataset.tool === next);
  }
}
for (const btn of toolButtons) {
  btn.addEventListener("click", () => selectTool(btn.dataset.tool as Tool));
}
selectTool("paint");

// --- New / Load -------------------------------------------------------------
$("new-btn").addEventListener("click", () => {
  if (app.model.dirty && !confirm("Discard unsaved changes and start a new level?")) {
    return;
  }
  app.model = EditorModel.newLevel();
  loadSelect.value = "";
});

const placeholder = new Option("Load level…", "", true, true);
placeholder.disabled = true;
loadSelect.appendChild(placeholder);
for (const e of LEVELS) loadSelect.appendChild(new Option(e.name, slugify(e.name)));
loadSelect.addEventListener("change", () => {
  const found = LEVELS.find((e) => slugify(e.name) === loadSelect.value);
  if (!found) return;
  if (app.model.dirty && !confirm("Discard unsaved changes and load this level?")) {
    loadSelect.value = "";
    return;
  }
  app.model = EditorModel.fromInput(found.level);
  nameInput.value = slugify(found.name);
});

// --- Save -------------------------------------------------------------------
$<HTMLButtonElement>("save-btn").addEventListener("click", () => void save());

async function save(): Promise<void> {
  const name = nameInput.value.trim();
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) {
    setStatus("Invalid name — use letters/digits/underscore, starting with a letter.", "err");
    return;
  }
  if (!app.model.canSave()) {
    setStatus("Cannot save: " + app.model.issues().join(" "), "err");
    return;
  }
  const source = emitModule(name, app.model);
  try {
    const res = await fetch("/__save-level", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, source }),
    });
    if (!res.ok) {
      setStatus(`Save failed (${res.status}): ${await res.text()}`, "err");
      return;
    }
    const r = (await res.json()) as { overwrote: boolean; registered: boolean };
    app.model.dirty = false;
    const bits = [
      `Saved src/levels/${name}.ts`,
      r.overwrote ? "(overwrote)" : "(new)",
      r.registered ? "and registered in main.ts." : "(already registered).",
    ];
    setStatus(bits.join(" "), "ok");
  } catch (err) {
    setStatus(`Save failed: ${String(err)} — is the dev server running?`, "err");
  }
}

let statusTimer = 0;
function setStatus(msg: string, cls: "ok" | "err"): void {
  statusEl.textContent = msg;
  statusEl.className = cls;
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => {
    statusEl.className = "";
  }, 4000);
}

// --- Render loop ------------------------------------------------------------
function frame(): void {
  renderer.render(app.model);
  // Live validation hint when the status line isn't showing a save result.
  if (statusEl.className === "") {
    const issues = app.model.issues();
    statusEl.textContent = issues.length
      ? "⚠ " + issues.join("  ")
      : `${tool} · brush "${palette.brush}" · ready to save`;
  }
  requestAnimationFrame(frame);
}
frame();
