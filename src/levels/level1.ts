// First hand-authored level: a simple descent. Spawn on the top-left ledge,
// drop and hop across ledges down to the exit at the bottom-right.
// A ladder (H) climbs the left side back up from the floor, and one-way
// platforms (-) bridge the row-9 gap and float above the row-17 ledge for
// jump-through / drop-through testing. 28x21 grid; legend in src/level.ts.
export const LEVEL_1 = `
############################
#..........................#
#.P........................#
######.....................#
#..........................#
#..........####............#
#..........................#
#.................######...#
#..........................#
#...######..------.........#
#..........................#
#..........................#
#.......#####..............#
#..H.......................#
#..H.----..................#
#..H.......................#
#..H.......................#
#..H####...................#
#..H.......................#
#..H....................E..#
############################
`;
