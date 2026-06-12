// First hand-authored level: a simple descent. Spawn on the top-left ledge,
// drop and hop across ledges down to the exit at the bottom-right.
// A ladder (H) climbs the left side back up from the floor, and one-way
// platforms (-) bridge the row-9 gap and float above the row-17 ledge for
// jump-through / drop-through testing. 28x21 grid; legend in src/level.ts.
//
// Milestone 3 enemies: a Virus (v) pacing the row-7 ledge mid-descent, a
// Plant Box spawner (B) on the row-12 ledge — its statue flashes and rebirths
// the box whenever the live one dies — and a second Virus on the bottom floor.
// The exit sits at the end of a long, low 2-tall corridor (ceiling row 17,
// x14-26) with the Eye (e) right beside the door. It spots intruders from
// ~7 tiles — far outside whip range — charges with a flash, and fires down
// the corridor; walking the full hallway is a hopeless race. Kill it with a
// thrown Plant Box (its bounces skim the whole corridor); a missed throw
// only costs the walk back to the spawner.
export const LEVEL_1 = `
############################
#..........................#
#.P........................#
######.....................#
#..........................#
#..........####............#
#..................v.......#
#.................######...#
#..........................#
#...######..------.........#
#..........................#
#.........B................#
#.......#####..............#
#..H.......................#
#..H.----..................#
#..H.......................#
#..H.......................#
#..H####......##############
#..H.......................#
#..H.......v............eE.#
############################
`;
