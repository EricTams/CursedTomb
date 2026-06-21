// A throwaway test arena for the newer entities: Frog (f), Small Troll (m),
// Large Troll (t), Bounce Onion (o), and Explosive Onion (O), plus a coin pot
// ($) and a cursed pot (%) near spawn for exercising the curse clock. The
// cursed pot bursts into a lingering cloud that docks the clock on contact.
// Deliberately open and flat so combat — not platforming — is what's being
// exercised; the exit sits on the floor so the level is always solvable. The
// bounce onion sits under a floating ledge so the trampoline launch can be
// tested against it.
// 28x21 grid; legend in src/level.ts.
import type { LevelModule } from "../level";

export const LEVEL_PLAYGROUND: LevelModule = {
  ascii: `
############################
#..........................#
#..........................#
#..........................#
#..........................#
#..........................#
#..........................#
#..........................#
#..........................#
#..........................#
#..........................#
#..........................#
#..........................#
#..........................#
#.....................----.#
#..........................#
#..........................#
#..........................#
#..........................#
#.P.$.%f...m...t...O....o.E#
############################
`,
  meta: {},
};
