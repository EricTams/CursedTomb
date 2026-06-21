import type { LevelInput } from "../level";
import { LEVEL_INTRO_SEQUENCE } from "./intro_sequence";
import { LEVEL_DESCENT } from "./descent";
import { LEVEL_FIRST_SWING } from "./first_swing";
import { LEVEL_BAT_ROOST } from "./bat_roost";
import { LEVEL_SPIKE_PIT } from "./spike_pit";
import { LEVEL_PLAYGROUND } from "./playground";
// <editor-imports></editor-imports>

export interface LevelEntry {
  // Descriptive display name (edit freely). The level editor lists these and,
  // for round-tripping, slugifies the name to find the source file/const —
  // keep the name's slug aligned with the file: <slug>.ts exports LEVEL_<SLUG>.
  name: string;
  level: LevelInput;
}

// THE play order — reorder by moving entries, rename via `name`. This is the
// single source of truth the game (main.ts) and the level editor both read.
// The editor's save plugin inserts new levels just before the <editor-levels>
// marker.
export const LEVELS: LevelEntry[] = [
  // Authoring slot for the intro playground. While the intro flow is being
  // built it boots first (and is editable here / in the level editor); Phase 6
  // pulls it out of the normal rotation and main.ts loads it explicitly.
  { name: "Intro Sequence", level: LEVEL_INTRO_SEQUENCE },
  { name: "Descent", level: LEVEL_DESCENT },
  { name: "First Swing", level: LEVEL_FIRST_SWING },
  { name: "Bat Roost", level: LEVEL_BAT_ROOST },
  { name: "Spike Pit", level: LEVEL_SPIKE_PIT },
  { name: "Playground", level: LEVEL_PLAYGROUND },
  /* <editor-levels> */
];
