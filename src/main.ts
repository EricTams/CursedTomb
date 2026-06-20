import { startLoop } from "./loop";
import { Screen } from "./screen";
import { Game } from "./game";
import { loadArt } from "./art";
import { Input } from "./input";
import { KeyboardSource } from "./keyboard";
import { TouchSource } from "./touch";
import { OrientationGuard } from "./orientation";
import { Settings } from "./settings";
import { SettingsMenu } from "./settingsmenu";
import { LEVELS } from "./levels";
import { Recorder, ReplaySource } from "./replay";
import { INTRO_TAPE } from "./intro-tape";
import { drawText } from "./text";
import { VIEW_W, VIEW_H } from "./config";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const screen = new Screen(canvas);

const input = new Input();
input.addSource(new KeyboardSource());
const touch = new TouchSource();
input.addSource(touch);
// Intro recording/playback. The replay source is inert (contributes nothing)
// until a tape is loaded, so live input is unaffected.
const replay = new ReplaySource();
input.addSource(replay);
const recorder = new Recorder();
const orientation = new OrientationGuard();
const settings = new Settings();
const menu = new SettingsMenu(settings);

const art = await loadArt();
// Play order + level data live in src/levels/index.ts (the single source of
// truth the editor also reads). The game only needs the level inputs.
const game = new Game(
  screen.ctx,
  art,
  input,
  settings,
  LEVELS.map((e) => e.level),
);

// Dev hook: dump the native-res frame buffer to tmp/frame.png on disk (the
// vite middleware in vite.config.ts does the writing). Lets tooling inspect
// the exact pixels instead of scaled screenshots.
(window as unknown as { __dumpFrame: () => Promise<string> }).__dumpFrame =
  async () => {
    const blob = await screen.buffer.convertToBlob({ type: "image/png" });
    const res = await fetch("/__frame", { method: "POST", body: blob });
    return res.text();
  };

// Persist the last recording to src/intro-tape.ts (the tape-dump middleware in
// vite.config.ts writes the file). Returns the server's reply text.
const dumpTape = async (): Promise<string> => {
  const res = await fetch("/__tape", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tape: recorder.tape }),
  });
  return res.text();
};
(window as unknown as { __dumpTape: () => Promise<string> }).__dumpTape = dumpTape;

// Press-to-enter gate. The intro auto-plays the recorded tape, but it only
// begins on a real user gesture — that also satisfies browser autoplay policy
// so the curse speech (Phase 5) can sound. Until then the loop is frozen on the
// loaded intro level with a prompt drawn over it.
let started = false;
function enterTomb(): void {
  if (started) return;
  started = true;
  game.reload(); // clean start state the tape was recorded from
  replay.load(INTRO_TAPE);
  game.beginIntro(); // arm the giant-coin curse handoff
}
// Any key (except the dev authoring keys) or a tap enters. Fire on release so
// the key used to enter isn't still held on the tape's first tick (which would
// OR into the replay and perturb the opening frames).
window.addEventListener("keyup", (e) => {
  if (e.code === "Backquote" || e.code === "KeyP" || e.code === "KeyO") return;
  enterTomb();
});
window.addEventListener("pointerup", () => enterTomb());

// Dev-only intro authoring keys (kept off the NES scheme / KeyboardSource so
// they never collide with gameplay): backtick = record toggle, P = play back
// the last take, O = write the tape to disk. These also "enter" so the loop
// ticks while authoring.
if (import.meta.env.DEV) {
  window.addEventListener("keydown", (e) => {
    if (e.code === "Backquote") {
      started = true;
      if (recorder.recording) {
        recorder.stop();
        console.log(`[intro] recording stopped — ${recorder.length} frames`);
      } else {
        replay.stop();
        game.reload(); // start from a clean level state
        recorder.start();
        console.log("[intro] recording… (` to stop)");
      }
      e.preventDefault();
    } else if (e.code === "KeyP") {
      started = true;
      recorder.stop();
      game.reload();
      replay.load(recorder.tape);
      console.log(`[intro] playing back ${recorder.length} frames`);
      e.preventDefault();
    } else if (e.code === "KeyO") {
      dumpTape().then((msg) => console.log(`[intro] ${msg}`));
      e.preventDefault();
    }
  });
}

startLoop({
  update() {
    if (orientation.paused) return; // portrait on a phone: wait for rotation
    if (menu.open) return; // settings menu open: pause gameplay
    if (!started) return; // gate: freeze until the player enters the tomb
    replay.advance(); // feed the tape (no-op unless playing) before poll
    game.update();
    recorder.capture(input); // capture the merged input that drove this tick
  },

  render(alpha) {
    game.render(alpha);
    if (!started) {
      drawText(screen.ctx, "PRESS ANY KEY", VIEW_W / 2, VIEW_H / 2 - 8, {
        size: 18,
        bold: true,
        shadow: "#000000",
      });
      drawText(screen.ctx, "TO ENTER THE TOMB", VIEW_W / 2, VIEW_H / 2 + 12, {
        size: 12,
        color: "#d9b36a",
        shadow: "#000000",
      });
    }
    screen.present();
    touch.render(input);
  },
});
