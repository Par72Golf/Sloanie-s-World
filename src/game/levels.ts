import { EMMETT_BASE, yardProps } from "./emmett-base";
import { sugarRushPark } from "./sugar-level";
import type { BoxProp, DumplingDef, LevelDef, Prop } from "./types";
import { CAVE_SPOTS, caveFootprint, mountainCave } from "./cave";
import { carnivalProps } from "./carnival";
import { cloudField, findClear, gatedRing, hits, occupancy, pathOccupancy, rectAt } from "./placement";
import { DUCK_POND, FAIR_GREEN, FLOWER_GARDEN, KITE_FIELD, NO_PLACES, STORY_CIRCLE, placeProps } from "./places";
import { plazaProps } from "./plaza";
import { PARK_DIRECTORIES, PARK_NAME_SIGNS, signProps } from "./signs";
import { walkwayProps, walkwayRects } from "./walkways";
import { ZOO, ZOO_NO_JUMP, zooFootprint, zooProps } from "./zoo";
import {
  baseballDiamond,
  basketballCourt,
  boundaryWall,
  campground,
  farm,
  forest,
  GOLF,
  miniGolf,
  outdoorGym,
  pavilion,
  soccerPitch,
  swimmingPool,
  berm,
  hedge,
  houseRow,
  parkPath,
  picnicArea,
  playCorner,
  playground,
  splashPad,
  tennisCourts,
  treeLine,
} from "./park";

function box(
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  color: string,
  collide = true,
  extra?: Partial<BoxProp>,
): BoxProp {
  return { kind: "box", pos: [x, y, z], size: [sx, sy, sz], color, collide, ...extra };
}

function fenceRing(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  color: string,
): BoxProp[] {
  const h = 1.15;
  const t = 0.35;
  const y = h / 2;
  const w = maxX - minX;
  const d = maxZ - minZ;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  return [
    box(cx, y, minZ, w + t, h, t, color),
    box(cx, y, maxZ, w + t, h, t, color),
    box(minX, y, cz, t, h, d, color),
    box(maxX, y, cz, t, h, d, color),
  ];
}

/**
 * Hedge maze. S is the entrance (south), E the exit (north), D the dumpling.
 * There are two separate ways in to the dumpling and a short way on to the
 * exit, so a seven-year-old gets turned around for a couple of minutes but
 * never stuck. tools/maze.ts scores any edit to this grid.
 */
/** The picnic park maze: where it is and how big. Tools read this too. */
export const PICNIC_MAZE = { ox: -42, oz: -18, cell: 2.4, n: 15 } as const;

/**
 * 15x15 cells. Entrance S at the bottom, exit E at the top, D the dumpling.
 * Two separate ways in, a short way out, and several dead ends of a few
 * cells each: a couple of minutes for a seven-year-old, never a trap.
 * tools/maze.ts scores any edit and fails if it breaks those properties.
 */
const PICNIC_MAZE_LAYOUT = [
  "#######E#######",
  "#     #       #",
  "# ### # ##### #",
  "# #   #   #   #",
  "# # ##### # ###",
  "# #     # #   #",
  "# ##### # ### #",
  "#   #   D     #",
  "### # ##### # #",
  "#   #   # # # #",
  "# ##### # # # #",
  "#     # # # # #",
  "##### # # # # #",
  "#       #     #",
  "#######S#######",
];

/** The sky park keeps the small original maze. */
const SKY_MAZE_LAYOUT = [
  "#####E#####",
  "#####     #",
  "##### ### #",
  "###   #   #",
  "##### # # #",
  "##    D # #",
  "##### ### #",
  "###     # #",
  "# # ### # #",
  "#   #     #",
  "#####S#####",
];

function mazeAt(
  ox: number,
  oz: number,
  wall: string,
  layout: string[] = PICNIC_MAZE_LAYOUT,
): { props: Prop[]; dumpling: [number, number]; entrance: [number, number]; exit: [number, number] } {
  const cell = 2.4;
  const half = (layout.length - 1) / 2;
  const props: Prop[] = [];
  let dumpling: [number, number] = [ox, oz];
  let entrance: [number, number] = [ox, oz];
  let exit: [number, number] = [ox, oz];
  const h = 1.7;
  for (let row = 0; row < layout.length; row++) {
    const line = layout[row]!;
    for (let col = 0; col < line.length; col++) {
      const ch = line[col]!;
      const x = ox + (col - half) * cell;
      const z = oz + (row - half) * cell;
      if (ch === "#") props.push(box(x, h / 2, z, cell + 0.08, h, cell + 0.08, wall));
      if (ch === "D") dumpling = [x, z];
      if (ch === "S") entrance = [x, z];
      if (ch === "E") exit = [x, z];
    }
  }
  return { props, dumpling, entrance, exit };
}

/**
 * Posts and a floor tile at a maze opening so she can tell the way in from
 * the way out, from the ground and from the lifted camera. `dir` is which way
 * is outside (+1 south, -1 north). Posts are 0.3m so they are honest solids
 * without becoming walls; nothing goes overhead, because any solid above her
 * head within 1.2m flips the camera into indoor mode.
 */
function mazeGate(x: number, z: number, dir: 1 | -1, post: string, tile: string): Prop[] {
  const zOut = z + dir * 1.9;
  return [
    box(x - 1.5, 1.5, zOut, 0.3, 3, 0.3, post),
    box(x + 1.5, 1.5, zOut, 0.3, 3, 0.3, post),
    box(x, 0.03, z, 2.3, 0.06, 2.3, tile),
  ];
}

function woods(ox: number, oz: number, n: number, seed: number): Prop[] {
  const props: Prop[] = [];
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  const avoid = [
    [54.2, -50.2, 8],
    [46.5, -40.5, 5.5],
  ];
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const r = 4 + rand() * 18;
    const x = ox + Math.cos(a) * r;
    const z = oz + Math.sin(a) * r * 0.85;
    if (avoid.some(([ax, az, ar]) => Math.hypot(x - ax, z - az) < ar)) continue;
    props.push({
      kind: "tree",
      x,
      z,
      variant: (i % 3) as 0 | 1 | 2,
      scale: 0.85 + rand() * 0.5,
    });
  }
  return props;
}

function orchard(ox: number, oz: number): Prop[] {
  const props: Prop[] = [];
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      if (i === 0 && j === 0) continue;
      props.push({
        kind: "tree",
        x: ox + i * 4.4,
        z: oz + j * 4.4,
        variant: 1,
        scale: 0.75,
      });
    }
  }
  return props;
}

function climbStairs(
  x: number,
  z: number,
  dx: number,
  dz: number,
  steps: number,
  rise: number,
  run: number,
  width: number,
  color: string,
  baseY = 0,
): BoxProp[] {
  const out: BoxProp[] = [];
  const len = Math.hypot(dx, dz) || 1;
  const nx = dx / len;
  const nz = dz / len;
  const px = -nz;
  const pz = nx;
  const rail = "#a07848";
  for (let i = 0; i < steps; i++) {
    const top = baseY + (i + 1) * rise;
    const cx = x + nx * i * run;
    const cz = z + nz * i * run;
    const sx = Math.abs(nx) > 0.5 ? run * 0.96 : width;
    const sz = Math.abs(nz) > 0.5 ? run * 0.96 : width;
    out.push(box(cx, top - rise / 2, cz, sx, rise * 0.92, sz, i % 2 === 0 ? color : "#d4b07a"));
    const hx = cx + px * (width * 0.5 + 0.08);
    const hz = cz + pz * (width * 0.5 + 0.08);
    const hx2 = cx - px * (width * 0.5 + 0.08);
    const hz2 = cz - pz * (width * 0.5 + 0.08);
    // handrails are decoration; at 0.12m square they are invisible edge-on
    // and would stand as unexplained walls wherever a path meets a stair top
    out.push(box(hx, top + 0.45, hz, 0.12, 0.9, 0.12, rail, false));
    out.push(box(hx2, top + 0.45, hz2, 0.12, 0.9, 0.12, rail, false));
  }
  const endX = x + nx * (steps - 1) * run;
  const endZ = z + nz * (steps - 1) * run;
  const railLen = steps * run;
  const midX = x + nx * ((steps - 1) * run * 0.5);
  const midZ = z + nz * ((steps - 1) * run * 0.5);
  const midY = (steps * rise) / 2 + 0.85;
  const alongX = Math.abs(nx) > 0.5 ? railLen : 0.12;
  const alongZ = Math.abs(nz) > 0.5 ? railLen : 0.12;
  out.push(box(midX + px * (width * 0.5 + 0.08), midY, midZ + pz * (width * 0.5 + 0.08), alongX, 0.12, alongZ, rail));
  out.push(box(midX - px * (width * 0.5 + 0.08), midY, midZ - pz * (width * 0.5 + 0.08), alongX, 0.12, alongZ, rail));
  void endX;
  void endZ;
  return out;
}

const picnicDumplings: DumplingDef[] = [
  {
    id: "peachy",
    name: "Peachy Bao",
    color: "#f3c4a0",
    accent: "#e8a070",
    // the first one is always in plain sight of the spawn, so the hunt starts
    // with a win rather than a search
    pos: [3.5, 0.62, 16],
    finish: "plain",
    hide: "easy",
    region: "where you start",
    // it rests on the arrival plaza's paving, not on grass (check-layout says
    // which prop every dumpling sits on), so the hint says stones
    hint: "Right by where you start, on the plaza stones.",

    alts: [
      { pos: [-3.5, 0.62, 15], region: "where you start", hint: "Right by where you start, a few steps the other way." },
      { pos: [8, 0.62, -3.6], region: "the gazebo", hint: "Somebody left one on the pale stone floor of the gazebo, straight north of where you start." },
    ],
  },
  {
    id: "sesame",
    name: "Sesame Puff",
    color: "#efe4c8",
    accent: "#c8b48a",
    pos: [93, 1.05, 74.4],
    finish: "plain",
    hide: "easy",
    region: "the east picnic lawn",
    hint: "Sitting on a picnic table on the lawn past the east gate.",
 
    alts: [
      { pos: [98, 1.05, 69.6], region: "the east picnic lawn", hint: "On a different picnic table out past the east gate." },
      { pos: [102, 0.62, 76], region: "the barbecue", hint: "Next to the barbecue on the east picnic lawn." },
    ],
  },
  {
    id: "clover",
    name: "Clover Bun",
    color: "#b7d48a",
    accent: "#7aaa54",
    pos: [7.5, 0.62, -48],
    finish: "plain",
    hide: "easy",
    region: "the big pond",
    hint: "Down at the big pond with the fountain, tucked in the reeds on the bank.",
 
    alts: [
      { pos: [-9.5, 0.62, -46.5], region: "the big pond", hint: "On the far side of the pond from the little dock, near the water." },
      // was (3, -32), which the walkways put in the middle of the path out to
      // the dock; the duck pond's far bank is 20m away and is somewhere to go
      { pos: [22, 0.62, -15], region: "the duck pond", hint: "At the little duck pond north-east of the gazebo, on the far bank where the ducks swim." },
    ],
  },
  {
    id: "honey",
    name: "Honey Fold",
    color: "#f0d08a",
    accent: "#d4a04a",
    pos: [0, 0.85, -86.8],
    finish: "pearl",
    hide: "medium",
    region: "the pitcher's mound",
    hint: "Right in the middle of the ball diamond, on the little dirt hill.",
 
    alts: [
      { pos: [0, 0.85, -96], region: "home plate", hint: "Standing right on home plate at the ball diamond." },
      { pos: [-12, 0.85, -97.1], region: "the first base dugout", hint: "On the bench inside one of the dugouts." },
    ],
  },
  {
    id: "berry",
    name: "Berry Squish",
    color: "#d48aaa",
    accent: "#b45a7a",
    pos: [95, 0.62, -48.2],
    finish: "iridescent",
    hide: "medium",
    region: "the basketball court",
    hint: "Behind the far basketball hoop, tucked against the post.",
 
    alts: [
      { pos: [95, 0.62, -19.5], region: "the basketball court", hint: "Behind the near basketball hoop." },
      { pos: [95, 0.62, -34], region: "the basketball court", hint: "Right in the middle of the basketball court." },
    ],
  },
  {
    id: "lemon",
    name: "Lemon Drop",
    color: "#f0e08a",
    accent: "#d4c04a",
    pos: [0, 0.55, 0],
    finish: "iridescent",
    hide: "medium",
    region: "the flower maze",
    hint: "The maze has a dumpling at its heart. Go in at the blue posts. The gold posts are the way out.",
  },
  {
    id: "cocoa",
    name: "Cocoa Pillow",
    color: "#8a5a3a",
    accent: "#6a3a22",
    pos: [-90, 3.95, -32],
    finish: "rainbow",
    hide: "hard",
    region: "the climbing tower",
    hint: "Up high at the playground. Climb the steps, then get on the roof.",
 
    alts: [
      { pos: [-91.5, 2.15, -33.5], region: "the climbing tower", hint: "Climb the steps at the playground and look in the corner of the platform." },
      { pos: [16.4, 3.02, 135.4], region: "the ninja course", hint: "Climb the wall at the ninja course, right up onto the deck with the flag." },
    ],
  },
  {
    id: "mint",
    name: "Mint Cloud",
    color: "#b8e0c8",
    accent: "#6aaa8a",
    pos: [20.5, 0.62, 112.5],
    finish: "rainbow",
    hide: "hard",
    region: "the houses on the south street",
    hint: "In a back yard on the south street, hiding behind a hedge.",
 
    alts: [
      { pos: [-15.5, 0.62, 112.5], region: "the houses on the south street", hint: "In a back yard on the south street, behind a hedge." },
      { pos: [-16, 0.62, 21.4], region: "the kite field", hint: "Out on the kite field west of the plaza, by the rack of spare kites." },
    ],
  },
  {
    id: "star",
    name: "Star Bao",
    color: "#f2e6a0",
    accent: "#d4b84a",
    // inside the little house on the deck, the back corner away from the steps
    pos: [56.0, 3.95, -54.8],
    finish: "gold",
    hide: "hard",
    region: "the treehouse",
    hint: "Climb the steps to the treehouse in the woods and go right inside, into the back corner.",

    alts: [
      { pos: [52.3, 3.95, -54.6], region: "the treehouse", hint: "Inside the treehouse, in the other back corner." },
      { pos: [56.5, 0.62, -47], region: "the woods", hint: "Down among the trees below the treehouse." },
    ],
  },
  {
    id: "moon",
    name: "Moon Gyoza",
    color: "#d8dce8",
    accent: "#9aa4c4",
    pos: CAVE_SPOTS.ledge,
    finish: "glow",
    hide: "hard",
    region: "the mountain cave",
    hint: "Find the rocky mountain past the north gate, to the east. Follow the tunnels to the biggest cavern and look up on the ledge.",

    alts: [
      { pos: CAVE_SPOTS.grotto, region: "the mountain cave", hint: "Inside the mountain cave, in the sparkly crystal room." },
      { pos: CAVE_SPOTS.nook, region: "the mountain cave", hint: "Inside the mountain cave, past the glowing mushrooms, at the end of a little dead-end tunnel." },
    ],
  },
  {
    id: "blush",
    name: "Blush Bao",
    color: "#f0b8c4",
    accent: "#d47a8a",
    pos: [-85.5, 0.85, 30],
    finish: "iridescent",
    hide: "medium",
    region: "the splash pad",
    hint: "On the long bench at the splash pad, where you would leave a towel.",
 
    alts: [
      { pos: [-102, 0.62, 25.8], region: "the splash pad", hint: "Right under the big tipping bucket at the splash pad." },
      // the splash pad already holds blush's home, its other alternate, the
      // sunglasses, the rainbow sticker and Emmett's rehide spot
      { pos: [17.1, 1.12, 34.7], region: "the flower garden", hint: "In the walled flower garden south of the plaza, sitting on a flower bed." },
    ],
  },
  {
    id: "rain",
    name: "Raindrop",
    color: "#a8d4e8",
    accent: "#6aa8c4",
    pos: [95, 0.85, 39.3],
    finish: "pearl",
    hide: "medium",
    region: "the tennis courts",
    hint: "On the bench beside the tennis courts. Look for the way in through the fence.",
 
    alts: [
      { pos: [101, 0.62, 16], region: "the tennis courts", hint: "Inside the far tennis court, in the back corner." },
      { pos: [88.75, 0.62, 33], region: "the tennis courts", hint: "On the near tennis court, close to the net post." },
    ],
  },
  // ---- the outer band, added with the park expansion ----------------------
  {
    id: "acorn",
    name: "Acorn Bun",
    color: "#c9a06a",
    accent: "#8a5a32",
    pos: [-141, 0.62, 13],
    finish: "plain",
    hide: "medium",
    region: "the woods clearing",
    hint: "Head into the deep woods west of the park, all the way to the clearing.",
    alts: [
      { pos: [-131, 0.62, 6.5], region: "the woods", hint: "In the woods west of the park, between the trees on the way to the clearing." },
      { pos: [-108, 0.62, 5.5], region: "the edge of the woods", hint: "By the little signpost at the edge of the woods, west of the park." },
    ],
  },
  {
    id: "smore",
    name: "S'more Puff",
    color: "#e8d3b0",
    accent: "#8a5a32",
    pos: [121, 0.62, 121],
    finish: "pearl",
    hide: "medium",
    region: "the campground",
    hint: "At the campground in the far south-east corner, tucked behind the orange tent.",
    alts: [
      { pos: [119, 0.95, 134], region: "the campground", hint: "On the picnic table at the campground, south-east corner of the park." },
      { pos: [138, 1.0, 133], region: "the campground hammock", hint: "Lying in the hammock at the campground." },
    ],
  },
  {
    id: "maple",
    name: "Maple Bao",
    color: "#e0a060",
    accent: "#b05a30",
    pos: [128, 0.95, 60],
    finish: "iridescent",
    hide: "medium",
    region: "the pavilion",
    hint: "On a table under the big red roof of the pavilion, out past the east gate.",
    alts: [
      { pos: [136, 0.95, 60], region: "the pavilion", hint: "On the other table under the pavilion roof, east side of the park." },
      { pos: [126.5, 0.62, 57.8], region: "the pavilion", hint: "Under the noticeboard on the pavilion's corner post." },
    ],
  },
  {
    id: "sky",
    name: "Sky Dumpling",
    color: "#cfe6ff",
    accent: "#7ec4e8",
    // floats just above the top of the ferris wheel, clear of the rim and the
    // gondola roofs so it shows against the sky: she rides up to it and has to
    // press Collect while her gondola passes the top (RIDE_COLLECT_R in runtime)
    pos: [30, 15.2, 58],
    finish: "glow",
    hide: "hard",
    region: "the top of the ferris wheel",
    hint: "Ride the ferris wheel on the east lawn and press Collect right at the very top!",
  },
];

function picnicPark(): LevelDef {
  const maze = mazeAt(PICNIC_MAZE.ox, PICNIC_MAZE.oz, "#5aaa62");
  picnicDumplings.find((d) => d.id === "lemon")!.pos = [maze.dumpling[0], 0.55, maze.dumpling[1]];
  const mazeGates = [
    // blue in, gold out: green posts disappeared against the hedges
    ...mazeGate(maze.entrance[0], maze.entrance[1], 1, "#4f93c4", "#a8d4f0"),
    ...mazeGate(maze.exit[0], maze.exit[1], -1, "#ffc53d", "#ffe08a"),
  ];

  // Walkways are laid out but not built while the park is still growing: they
  // stopped matching the layout, and they get re-mapped once the buildings are
  // in. They still reserve their ground in the placement map below, so berms,
  // hedges and tree lines land exactly where they did with paths present.
  // To bring them back, add `walkways` to `props` at the end of this function.
  const coreWalks: Prop[] = [
    // crossing walkways sit on their own layers so they do not z-fight
    box(0, 0.04, 8, 4.4, 0.08, 52, "#d8c49a", false),
    box(-10, 0.06, 12, 28, 0.08, 4.4, "#d8c49a", false),
    box(18, 0.08, 10, 36, 0.08, 3.8, "#d8c49a", false),
    box(0, 0.10, -20, 4.2, 0.08, 28, "#d8c49a", false),
    box(40, 0.04, -8, 3.6, 0.08, 36, "#d8c49a", false),
    box(-36, 0.04, 20, 3.6, 0.08, 40, "#d8c49a", false),
  ];

  // The old lookout hill and its cave came out when the cave moved to the
  // mountain (cave.ts). Its ground stays reserved in the placement map, like
  // the walkways, so nothing else shifts; the lawn is kept for the carnival.
  const oldHillReserve: Prop[] = [
    /* ---- lookout hill, hollowed into a proper cave --------------------
     * Chamber is x -19..-7, z 59..67, with 4.2m of headroom: about four
     * times the floor area of the old one and twice the height, which is
     * what the third-person camera needs to sit behind her indoors.
     * The mouth is 6m wide on the south face so the exit stays in view.
     * Sized to stop short of the park wall at z 70 and the central path.
     */
    box(-23, 2.1, 63.2, 4, 4.2, 12.4, "#7aaa62"),
    box(-4, 2.1, 63.5, 2, 4.2, 13, "#7aaa62"),
    box(-13.5, 2.1, 68.75, 17, 4.2, 1.5, "#7aaa62"),
    box(-19, 2.1, 58.5, 4, 4.2, 3, "#6e9e58"),
    box(-8, 2.1, 58.5, 4, 4.2, 3, "#6e9e58"),
    box(-13.5, 4.9, 63.5, 17, 1.4, 13, "#6e9e58"),
    // Baffle across the middle of the chamber: standing at the mouth you see
    // rock, not the prize. You go round it on either side.
    box(-12, 2.1, 62, 10, 4.2, 1.2, "#6a655d"),
    // raised back ledge, reached by steps on the west side
    box(-13, 0.6, 66.5, 16, 1.2, 3, "#5f5a53"),
    ...climbStairs(-19, 62.8, 0, 1, 3, 0.4, 0.9, 3.4, "#6f6a62"),
    box(-13, 5.9, 63, 20, 1.6, 12, "#7aaa62"),
    box(-13, 7.0, 63.5, 14, 1.4, 9, "#6e9e58"),
    box(-13, 7.9, 64, 8, 1.2, 6, "#649454"),
    // Path up to the lookout: a switchback on the west face. Two flights,
    // because one straight run at this height would overshoot the park wall.
    ...climbStairs(-27, 52, 0, 1, 8, 0.53, 1.0, 3.4, "#8aba6a"),
    box(-27, 4.12, 60.4, 3.4, 0.32, 2.4, "#8aba6a"),
    ...climbStairs(-26, 60.6, 0, 1, 8, 0.53, 0.8, 3.4, "#8aba6a", 4.28),
    // walkway east from the top of the second flight onto the summit
    box(-20, 8.37, 67.3, 12, 0.3, 2.2, "#8aba6a"),
    // summit rail, so standing up there feels like a lookout
    box(-13, 8.85, 61.2, 8, 0.7, 0.2, "#a07848"),
    // stops short of the walkway, which arrives across z 66..68
    box(-17.2, 8.85, 63.1, 0.2, 0.7, 4.2, "#a07848"),
    box(-8.8, 8.85, 64, 0.2, 0.7, 6, "#a07848"),
  ];

  /**
   * Ground the walkways take. Trees in the woods are scattered at random and
   * the houses have a hedge between every pair of lots, so a few of both land
   * on a path once the network is laid; those are dropped rather than having
   * the path bend round them. Nothing else is ever removed this way.
   */
  const walkGround = walkwayRects(0.6);
  const prune = (list: Prop[]) =>
    list.filter((p) => {
      if (p.kind === "tree") return !hits(walkGround, rectAt(p.x, p.z, 2.4, 2.4));
      if (p.kind === "box" && p.color === "#4a8a4a") {
        return !hits(walkGround, rectAt(p.pos[0], p.pos[2], p.size[0], p.size[2]));
      }
      return true;
    });

  const core: Prop[] = prune([
    ...gatedRing(-70, 70, -70, 70, "#c4b48a"),

    // (three v1 picnic tables and three coloured mats stood loose on this lawn,
    // x -10..-22, z 6..14. Nothing tied them together and nothing named them.
    // The kite field in places.ts is here now.)

    { kind: "cyl", pos: [0, -0.15, -42], r: 11, h: 0.5, color: "#5aa8c8", collide: false },
    { kind: "cyl", pos: [0, 0.08, -42], r: 9.8, h: 0.18, color: "#6cb8d4", collide: false },
    box(2.4, 0.16, -35.2, 2.4, 0.22, 4.2, "#c4a06a"),
    box(2.4, 0.16, -32.8, 3.8, 0.22, 1.4, "#c4a06a"),
    box(-7.2, 0.4, -36, 0.7, 0.8, 0.7, "#8aaa5a", false),
    box(8.4, 0.35, -46, 0.8, 0.7, 0.8, "#8aaa5a", false),
    box(-4.2, 0.25, -48.5, 0.6, 0.5, 0.6, "#6a9a4a", false),
    box(6.8, 0.3, -38.4, 0.7, 0.55, 0.7, "#8aaa5a", false),

    { kind: "cyl", pos: [-48, -0.12, -48], r: 6.4, h: 0.42, color: "#5aa8c8", collide: false },
    { kind: "cyl", pos: [-48, 0.08, -48], r: 5.6, h: 0.16, color: "#6cb8d4", collide: false },
    box(-48, 0.18, -42.2, 2.2, 0.2, 2.8, "#c4a06a"),
    box(-50.6, 0.35, -46, 0.7, 0.6, 0.7, "#8aaa5a", false),
    box(-45.4, 0.3, -50.2, 0.6, 0.5, 0.6, "#6a9a4a", false),

    // Sandcastle Corner, east of the plaza. This used to be sixteen props with
    // no plan between them: a pad with the slide standing in the middle of it,
    // a stray tower, a mat floating at 0.7m, a second pad with a plate on two
    // legs, and stairs to a deck that went nowhere. park.ts lays it out now.
    // The slide itself stays where it is: world-build.ts places that mesh at
    // (22, 8) and colliders.ts has its box, and neither is level data.
    ...playCorner(),

    box(8, 0.08, -6, 5.2, 0.12, 5.2, "#efe4d0", false),
    // two 1.4m blocks used to stand here with nothing on them. Benches facing
    // the gazebo instead, which is also where the sticker book sits.
    box(4.6, 0.45, -2.4, 0.8, 0.2, 3.0, "#c49a62"),
    box(4.28, 0.85, -2.4, 0.16, 0.7, 3.0, "#c49a62", false),
    box(11.4, 0.45, -2.4, 0.8, 0.2, 3.0, "#c49a62"),
    box(11.72, 0.85, -2.4, 0.16, 0.7, 3.0, "#c49a62", false),


    // stairs stop at the treehouse deck; the structure itself is a mesh now
    ...climbStairs(54.2, -40.6, 0, -1, 9, 0.4, 1.25, 3.6, "#c4a06a"),

    // (a 1.2m x 20m blue stripe with a grey plank laid across it and four loose
    // blue pads beside it stood here: from above it read as a blue cross and
    // from the ground as nothing at all. The duck pond is here now.)

    box(-62, 0.85, 26, 1.2, 1.7, 16, "#5aaa62"),
    box(-56, 0.85, 36, 12, 1.7, 1.2, "#5aaa62"),
    box(-56, 0.85, 18, 12, 1.7, 1.2, "#5aaa62"),
    box(-60.5, 0.08, 32.2, 8, 0.1, 10, "#8aba6a", false),
    box(-60.2, 0.4, 28.4, 0.8, 0.7, 0.8, "#d47a8a", false),
    box(-57.6, 0.35, 34.4, 0.7, 0.6, 0.7, "#4f93c4", false),
    box(-58.8, 0.45, 30.2, 0.9, 0.8, 0.9, "#e8c46a", false),

    // (a brown mat with four coloured cubes on it stood on this lawn too; it
    // was the same unreadable thing as the "flower bed" and is gone.)
    { kind: "house", x: 56, z: 40, body: "#c48a5a", roof: "#a05040", w: 8, d: 6 },
    box(50.4, 0.45, 38.2, 1.4, 0.9, 1.4, "#d4a04a"),
    box(49.2, 0.7, 40.6, 1.1, 1.4, 1.1, "#d4a04a"),
    box(61.2, 0.45, 42.4, 1.5, 0.9, 1.2, "#d4a04a"),
    box(52.6, 0.35, 34.8, 0.9, 0.7, 0.9, "#d4894a", false),
    box(54.8, 0.4, 34.2, 0.8, 0.8, 0.8, "#e07040", false),
    box(56.6, 0.32, 33.6, 0.7, 0.6, 0.7, "#d4894a", false),

    // (a kiosk stood alone in the middle of this lawn, the one you look at
    // from the carousel. The fairground green in places.ts is here now.)

    // (the "flower bed" here was a 10m green mat with five coloured cubes on
    // it. The walled flower garden in places.ts replaces it, and the ladybug
    // sticker at (10, 30) now sits on its north-west bed.)

    // (the old hanging sign tower at (0, 66) stood in the middle of what is
    // now the midway to the south gate; the gate has a proper sign now)

    // (a grey block with a red box on a post stood at (-28, 8) with nothing
    // around it; it is inside the kite field now, so it went with the rest.)

    // moved off the kite field, the flower garden and the duck pond; a kite
    // field with a tree in the middle of it is a tree, not a kite field
    { kind: "tree", x: -36, z: 9, variant: 0, scale: 1.1 },
    { kind: "tree", x: -35, z: 24, variant: 1, scale: 0.95 },
    { kind: "tree", x: 15, z: 21, variant: 0, scale: 1 },
    { kind: "tree", x: 23, z: 34, variant: 2, scale: 1.2 },
    { kind: "tree", x: -13.5, z: 27.5, variant: 1, scale: 0.9 },
    { kind: "tree", x: 30, z: 16, variant: 0, scale: 1 },
    { kind: "tree", x: -16, z: -16, variant: 2, scale: 1.15 },
    { kind: "tree", x: 16, z: -54, variant: 1, scale: 1 },
    { kind: "tree", x: -28, z: 32, variant: 0, scale: 1.05 },
    { kind: "tree", x: -56, z: -8, variant: 2, scale: 1.2 },
    { kind: "tree", x: -62, z: 8, variant: 0, scale: 1 },
    { kind: "tree", x: 62, z: -8, variant: 1, scale: 1.1 },
    { kind: "tree", x: 64, z: 16, variant: 0, scale: 0.95 },
    { kind: "tree", x: -8, z: -58, variant: 2, scale: 1.15 },
    { kind: "tree", x: 13, z: 56, variant: 1, scale: 1 },
    { kind: "tree", x: -32, z: 62, variant: 0, scale: 1.05 },
    { kind: "cloud", pos: [-18, 16, -10], scale: 1.4 },
    { kind: "cloud", pos: [20, 18, 8], scale: 1.1 },
    { kind: "cloud", pos: [6, 15, 28], scale: 0.9 },
    { kind: "cloud", pos: [-30, 17, 10], scale: 1.2 },
    { kind: "cloud", pos: [48, 16, -20], scale: 1.3 },
    { kind: "cloud", pos: [-50, 15, 40], scale: 1.1 },
    { kind: "cloud", pos: [10, 17, 60], scale: 1.2 },

    // the five places that fill the lawns inside the ring (places.ts)
    ...(NO_PLACES ? [] : placeProps()),

    ...maze.props,
    ...mazeGates,
    ...woods(50, -40, 36, 17),
    box(46.5, 0.08, -40.5, 4.2, 0.12, 4.2, "#8a5a32", false),
    box(46.5, 0.28, -38.4, 0.7, 0.4, 0.7, "#6a3a22", false),
    ...woods(-8, -58, 16, 41),
    ...orchard(48, 52),

  ]);


  /* ---------------------------------------------------------------- *
   * Outer park. Zone anchors are chosen deliberately, then every added
   * shape is checked against what already exists before it is placed.
   * ---------------------------------------------------------------- */

  const GATE = 13;

  /* ---- the outer band, added in v2.9 -------------------------------
   * The park grew from 240m to 320m. Beyond the ring road: woods down the
   * whole west side with a winding trail to a clearing, a campground in the
   * north-east corner, and a pavilion on the east side. The ring road is
   * unchanged; she walks off it onto grass to reach the new areas.
   */
  const CAMP = { x: 128, z: 128 };
  const PAV = { x: 132, z: 60 };
  const CLEARING = { x: -140, z: 12 };

  // winding trail from the west gate spur into the woods, as slabs end to end
  // each slab a hair higher than the last: they overlap end to end and
  // same-height tops z-fight
  const trailSlabs: Prop[] = [
    box(-111, 0.055, 0, 12, 0.12, 4.4, "#d8c49a", false),
    box(-120, 0.07, 3, 8, 0.12, 4.4, "#d8c49a", false),
    box(-126, 0.085, 7, 8, 0.12, 4.4, "#d8c49a", false),
    box(-131, 0.1, 3, 6, 0.12, 4.4, "#d8c49a", false),
    box(-136, 0.115, 8, 8, 0.12, 4.4, "#d8c49a", false),
  ];
  const trail: Prop[] = [
    // the clearing: a lighter lawn disc, a log to sit on, a stump
    { kind: "cyl", pos: [CLEARING.x, 0.01, CLEARING.z], r: 9, h: 0.08, color: "#8fcf74", collide: false },
    box(CLEARING.x - 3, 0.3, CLEARING.z + 4, 2.4, 0.6, 0.7, "#8a5a32"),
    box(CLEARING.x + 4, 0.3, CLEARING.z - 3, 0.9, 0.6, 0.9, "#7a5232"),
    // a little signpost at the trail head
    box(-108, 1.0, 3.2, 0.14, 2.0, 0.14, "#8a5a32", false),
    box(-108, 1.8, 3.2, 1.2, 0.4, 0.08, "#e8d7b8", false),
  ];
  const trailRects = [
    rectAt(-111, 0, 12, 4.4, 2),
    rectAt(-120, 3, 8, 4.4, 2),
    rectAt(-126, 7, 8, 4.4, 2),
    rectAt(-131, 3, 6, 4.4, 2),
    rectAt(-136, 8, 8, 4.4, 2),
    rectAt(CLEARING.x, CLEARING.z, 20, 20),
    // keep the ring road's west edge and the wall clear
    rectAt(-105, 0, 6, 320),
    rectAt(-158, 0, 8, 320),
  ];

  // the second round of fills: behind the houses, the south band, the east band
  const POOL = { x: -40, z: 136 };
  const GYM = { x: 8, z: 136 };
  const FARM = { x: -60, z: -132 };
  const PITCH = { x: 130, z: -60 };

  const zones: Prop[] = prune([
    ...houseRow(-63, 110, 8, 18, 1),
    ...swimmingPool(POOL.x, POOL.z),
    ...outdoorGym(GYM.x, GYM.z),
    ...farm(FARM.x, FARM.z),
    ...miniGolf(GOLF.x, GOLF.z),
    ...soccerPitch(PITCH.x, PITCH.z),
    ...forest(108, 152, -152, -100, 40, 4471, []),
    ...baseballDiamond(0, -96, true),
    ...tennisCourts(95, 26, 2),
    ...basketballCourt(95, -34),
    ...picnicArea(93, 72),
    ...splashPad(-95, 28),
    ...playground(-95, -30),
    ...campground(CAMP.x, CAMP.z),
    ...pavilion(PAV.x, PAV.z),
    ...mountainCave(),
    // inside the old hill's reserved ground, so nothing else moves
    ...carnivalProps(),
    ...yardProps(),
    ...trail,
    ...forest(-155, -108, -150, 150, 150, 8121, trailRects),
  ]);
  // the zoo (zoo.ts) is authored to fit its own patch of lawn, so it is not
  // pruned against the walkways; its spur arrives square at the arch instead
  zones.push(...zooProps());

  const boundary = boundaryWall(-157.5, 157.5, -157.5, 157.5, 6.5);

  const paths: Prop[] = [
    // out through each gate to its zone
    // spurs stop exactly where the ring road starts so nothing overlaps
    ...parkPath(0, 84.75, GATE - 3, 31.5),
    ...parkPath(0, -84.75, GATE - 3, 31.5),
    ...parkPath(84.75, 0, 31.5, GATE - 3),
    ...parkPath(-84.75, 0, 31.5, GATE - 3),
    // ring road: north and south runs butt into the east and west runs
    ...parkPath(0, 103, 201, 5),
    ...parkPath(0, -103, 201, 5),
    ...parkPath(103, 0, 5, 216),
    ...parkPath(-103, 0, 5, 216),
    // spurs from the ring road out to the pavilion and the campground; the
    // pavilion one overlaps the ring road's edge so it sits a hair higher
    box(118, 0.055, 60, 26, 0.12, 4.4, "#d8c49a", false),
    // north: up to the pool and the gym; south: down to the farm and mini golf;
    // east: across to the pitch. All stop a hair short of the ring road.
    ...parkPath(-40, 115, 4.4, 19),
    ...parkPath(8, 115, 4.4, 19),
    ...parkPath(-60, -110, 4.4, 9),
    ...parkPath(20, -110, 4.4, 9),
    box(112, 0.055, -60, 14, 0.12, 4.4, "#d8c49a", false),
    ...parkPath(112, 103, 4.4, 24),
    ...parkPath(112, 122, 4.4, 14),
  ];

  /* ---- the walkway network, the arrival plaza and the signs --------------
   * The network is walkways.ts; the plaza round the spawn is plaza.ts and the
   * boards are signs.ts. All three are reserved in the placement map below
   * before any berm, hedge or tree line is dropped, so nothing lands on a
   * path. The old (unbuilt) walkway rects are still reserved as well, so
   * removing them cannot shuffle anything that was placed against them.
   */
  const walks = walkwayProps();
  const plaza = plazaProps();
  const signs = signProps(PARK_DIRECTORIES, PARK_NAME_SIGNS);
  const built: Prop[] = [...walks, ...plaza, ...signs];

  // Anything already standing, plus corridors that must stay walkable.
  const reserved = [...coreWalks, ...trailSlabs, ...oldHillReserve];
  const taken = occupancy([...core, ...reserved, ...zones, ...boundary, ...plaza, ...signs]);
  // keep berms and hedges off the walkways (reserved even while not built)
  taken.push(...pathOccupancy([...core, ...reserved, ...paths, ...zones]));
  taken.push(...walkwayRects(0.5));
  const keepClear = [
    rectAt(0, 86, GATE + 6, 36),
    rectAt(0, -86, GATE + 6, 36),
    rectAt(86, 0, 36, GATE + 6),
    rectAt(-86, 0, 36, GATE + 6),
    // approach corridors from the ring road into each zone
    rectAt(99, 26, 14, 16),
    rectAt(99, -34, 14, 16),
    rectAt(-99, 28, 14, 16),
    rectAt(-99, -30, 14, 16),
    rectAt(97, 72, 16, 14),
    rectAt(0, -99, 16, 16),
    rectAt(0, 106, 180, 8),
    rectAt(0, 103, 220, 11),
    rectAt(0, -103, 220, 11),
    rectAt(103, 0, 11, 220),
    rectAt(-103, 0, 11, 220),
    // new areas and the ways to them
    rectAt(CAMP.x, CAMP.z, 36, 32),
    rectAt(PAV.x, PAV.z, 20, 16),
    rectAt(118, 60, 30, 8),
    rectAt(112, 114, 8, 44),
    rectAt(POOL.x, POOL.z, 40, 28),
    rectAt(GYM.x, GYM.z, 32, 24),
    rectAt(FARM.x, FARM.z, 58, 42),
    rectAt(GOLF.x, GOLF.z, 38, 30),
    rectAt(PITCH.x, PITCH.z, 52, 40),
    // the mountain and a clear apron round it, widest at the entrance
    rectAt(73, -128, 50, 46),
    // the carnival's way in: its arch and the carousel gate face south
    rectAt(-16, 40, 24, 12),
    // the zoo between the farm and the mini golf, and room round its fence
    rectAt(ZOO.x, ZOO.z, ZOO.w + 6, ZOO.d + 6),
    // Emmett's monster truck yard on the east lawn
    rectAt(EMMETT_BASE.x, EMMETT_BASE.z, 14, 18),
    // Sandcastle Corner and the lawn round it, so no berm or tree line lands
    // on the one place near the spawn that is meant to read as tidy
    rectAt(23.0, 12.7, 19, 18),
    // the five places inside the ring (places.ts) and the ways in to them:
    // a kite field wants open sky over it, so its rect is the widest
    rectAt(KITE_FIELD.x, KITE_FIELD.z, KITE_FIELD.w + 6, KITE_FIELD.d + 6),
    // the pond plus its jetty and the walk round it, stopping at x 22: any
    // wider and the berm east of it has nowhere left to stand and is dropped
    rectAt(13.2, DUCK_POND.z, 17.6, 16.8),
    rectAt(FLOWER_GARDEN.x, FLOWER_GARDEN.z, FLOWER_GARDEN.w + 5, FLOWER_GARDEN.d + 5),
    rectAt(STORY_CIRCLE.x, STORY_CIRCLE.z, STORY_CIRCLE.r * 2 + 6, STORY_CIRCLE.r * 2 + 6),
    rectAt(FAIR_GREEN.x, FAIR_GREEN.z, FAIR_GREEN.w + 5, FAIR_GREEN.d + 5),
    rectAt(-40, 115, 8, 24),
    rectAt(8, 115, 8, 24),
    rectAt(-60, -110, 8, 14),
    rectAt(20, -110, 8, 14),
    rectAt(112, -60, 18, 8),
    ...trailRects,
  ];
  taken.push(...keepClear);

  // never bury a dumpling, and leave room to walk up to each one
  for (const d of picnicDumplings) {
    taken.push(rectAt(d.pos[0], d.pos[2], 7, 7));
  }

  const worldBounds = { minX: -159, maxX: 159, minZ: -159, maxZ: 159 };
  const blockers: Prop[] = [];

  // Berms that break up long sightlines. Preferred spots, but the search
  // moves them if something is already there, and drops them if nothing fits.
  const wantBerms: [number, number, number, number, number][] = [
    [-32, 34, 26, 8, 4.2],
    // (was [30, -26, 8, 26]: shifted north and shortened to clear the east road)
    [32, -30, 8, 22, 4.0],
    // (was [-44, -38, 22, 8]: sized to fit between the north road and the little pond)
    [-31, -44, 18, 8, 3.8],
    [42, 38, 8, 22, 3.8],
    [-30, -4, 8, 20, 3.6],
    [28, 12, 20, 8, 3.6],
    [-40, 78, 34, 8, 4.4],
    [40, 78, 34, 8, 4.4],
    [-40, -78, 34, 8, 4.4],
    [40, -78, 34, 8, 4.4],
    [78, 40, 8, 34, 4.4],
    [78, -40, 8, 34, 4.4],
    [-78, 40, 8, 34, 4.4],
    [-78, -40, 8, 34, 4.4],
  ];
  for (const [px, pz, w, d, h] of wantBerms) {
    const spot = findClear(taken, px, pz, w, d, { pad: 2.5, maxRadius: 20, bounds: worldBounds });
    if (!spot) continue;
    blockers.push(...berm(spot[0], spot[1], w, d, h));
    taken.push(rectAt(spot[0], spot[1], w, d, 1));
  }

  const wantHedges: [number, number, number, number][] = [
    // moved west off the new midway between the plaza and the carnival
    [-30, 30, 18, 1.8],
    [18, -40, 18, 1.8],
    [40, 14, 1.8, 16],
    [-40, -14, 1.8, 16],
  ];
  for (const [px, pz, w, d] of wantHedges) {
    const spot = findClear(taken, px, pz, w, d, { pad: 2, maxRadius: 16, bounds: worldBounds });
    if (!spot) continue;
    blockers.push(...hedge(spot[0], spot[1], w, d));
    taken.push(rectAt(spot[0], spot[1], w, d, 1));
  }

  // Boundary tree lines, placed one trunk at a time against the same map.
  const lines: [number, number, number, number, number][] = [
    // along the new outer wall (the west side is solid forest already)
    [-150, 154, 150, 154, 30],
    [-150, -154, 150, -154, 30],
    [154, -146, 154, 146, 30],
    // a few trees along the old wall line on the east, between the pitch and
    // the pavilion; the north and south bands are full now
    [119.5, -30, 119.5, 40, 6],
    [-116, 76, -22, 76, 10],
    [22, 76, 116, 76, 10],
    [-116, -76, -22, -76, 10],
    [22, -76, 116, -76, 10],
  ];
  for (const [x1, z1, x2, z2, n] of lines) {
    for (const t of treeLine(x1, z1, x2, z2, n, 1.2)) {
      if (t.kind !== "tree") continue;
      if (hits(taken, rectAt(t.x, t.z, 4, 4, 0.5))) continue;
      blockers.push(t);
      taken.push(rectAt(t.x, t.z, 4, 4, 0.5));
    }
  }

  const props: Prop[] = [
    ...core,
    ...boundary,
    ...zones,
    ...built,
    ...blockers,
    ...cloudField(-150, 150, -150, 150, 48, 20260928),
  ];

  /**
   * Juice boxes: a speed boost, so the rule is one within reach wherever she
   * is and never two together. `tools/spread.ts` proves it: no two closer than
   * 18m, none in water, on a walkway or inside a game's playing area, and it
   * reports how far the nearest one is from every named place in the park
   * (and over every walkable cell, as a map with `spread.ts map`).
   *
   * Nineteen, up from fourteen. Three of the old ones had been overtaken by
   * new content: (-4, -46) was inside the big pond, and (0, 88) and (88, 4)
   * were laid on walkways once the network went in. (0, -88) sat 1.2m from the
   * dumpling on the pitcher's mound. The five new ones fill the outer band,
   * which had nothing north of the ring road at all.
   */
  const juice: [number, number][] = [
    // the middle of the park, beside the routes she actually runs
    [6, 34], // in the flower garden, inside the west opening
    [34, 18], // the lawn east of Sandcastle Corner
    [-22, -12], // the lawn between the kite field and the story circle
    [94, -12], // between the tennis courts and the basketball court
    [-88, -4], // the playground road
    [-11, -55], // the lawn west of the big pond (the old spot was in the water)
    [29, -85], // the lawn east of the ball field
    [100, -62], // the lawn north of the soccer pitch
    [-98, -70], // the west lawn, north of the playground
    [95, 52], // the east lawn
    [-52, 66], // west of the carnival midway
    [-7, 86], // beside the midway down to the houses
    // the outer band, which had nothing north of the ring road at all
    [-124, 1], // the woods trail
    [124, 116], // the campground
    [-42, -117], // the farm lawn, the 12m tools/zoo.ts wants clear of the zoo
    [42, -126], // beside the mini golf course
    [31, -104], // the road out to the cave and the golf, clear of the lava site
    [-75, 112], // between the swimming pool and the ring road
    [18, 124], // on the way to the ninja course, clear of the lava site
  ];

  // The hedge maze is 11 cells of 2.4m and the secret garden is walled, so a
  // trike has no way through either. He waits outside instead.
  const emmettKeepOut = [
    // the mountain cave: he cannot ride a trike through tunnels
    { minX: 46, maxX: 100, minZ: -155, maxZ: -107 },
    // the zoo: gates and narrow paths, no room for a trike
    zooFootprint(1),
    { minX: -61, maxX: -23, minZ: -37, maxZ: 1 },
    { minX: -64, maxX: -48, minZ: 16, maxZ: 38 },
  ];

  // She jumps 2.7m and the hedges are 1.7m. The zone reaches 23m from the maze
  // centre: the outer hedge is at 13.2m and a boosted running jump can land on
  // a 1.7m top from 9.3m away. tools/maze.ts checks the arithmetic.
  // 15 cells: outer hedge at 18m from the centre, plus 9.3m reach, rounded up.
  const noJump = [
    // tight to the hedges: a running jump from outside can still clear the outer
    // hedge, and landing on top puts her back where she jumped from (keepOff)
    { minX: -60.5, maxX: -23.5, minZ: -36.5, maxZ: 0.5, why: "the hedge maze", keepOff: 0.9 },
    // the lookout deck on the mountain roof: no hopping the rail onto the rock
    { minX: 62, maxX: 96, minZ: -121, maxZ: -107, why: "the lookout" },
    // the carousel's fence is 0.9m; she would hop it onto the turning deck
    { minX: -25.5, maxX: -6.5, minZ: 43.5, maxZ: 62.5, why: "the carousel" },
    // the zoo's fences are 1.1m (zoo.ts)
    ZOO_NO_JUMP,
  ];

  // Things to find and wear. Each sits beside a landmark the reachability
  // check already proves walkable; check-layout verifies the spots too.
  const accessories: LevelDef["accessories"] = [
    { id: "sunglasses", pos: [-95, 0, 28], region: "the splash pad" },
    { id: "partyhat", pos: [88.75, 0, 25], region: "the tennis courts" },
    { id: "bow", pos: [-82, 0, -14], region: "the playground sandbox" },
    { id: "backpack", pos: [4, 0, -84], region: "the ball field" },
    { id: "flowercrown", pos: [-40, 0, 56.5], region: "the fairground green" },
  ];

  /**
   * Where Emmett hides a dumpling he wins. The runtime nudges the spot by up
   * to 1.75m in each direction, so each one needs about 2m of clear ground
   * round it as well as its own landmark, and it must not land on top of
   * something else that is hidden: (-95, 28) was the sunglasses' exact spot,
   * home plate was 1.0m from honey's alternate and the barbecue 2.0m from
   * sesame's. Three of the six were also in the same corner of the park.
   * tools/spread.ts checks the spacing; tools/collectibles.ts walks to them.
   */
  const rehideSpots = [
    { name: "the gazebo", say: "I put it by the gazebo!", pos: [12, 0.62, -6] as [number, number, number] },
    { name: "the story circle", say: "It's at the story circle!", pos: [-8.5, 0.62, -21] as [number, number, number] },
    { name: "the splash pad", say: "It's at the splash pad!", pos: [-103.5, 0.62, 36.5] as [number, number, number] },
    { name: "the ball field", say: "I left it out at the ball field!", pos: [14, 0.62, -93] as [number, number, number] },
    { name: "the campfire", say: "I took it to the campfire!", pos: [124, 0.62, 128] as [number, number, number] },
    { name: "the pavilion", say: "It's under the pavilion roof!", pos: [132, 0.62, 64] as [number, number, number] },
  ];

  return {
    id: "picnic",
    name: "Sunny Picnic Park",
    tagline: "A giant park with a maze, cave, farm, woods, and a secret garden.",
    sky: "#7ec4e8",
    fogFar: 165,
    grass: "#5cad5c",
    path: "#d8c49a",
    spawn: [0, 0, 22],
    spawnYaw: 0,
    bounds: { minX: -160, maxX: 160, minZ: -160, maxZ: 160 },
    groundY: 0,
    props,
    dumplings: picnicDumplings,
    splash: { x: -95, z: 28 },
    campfire: { x: CAMP.x, z: CAMP.z },
    juice,
    rehideSpots,
    emmettKeepOut,
    noJump,
    accessories,
    // on the east lawn; the reachability check covers (30, 65) in front of it
    ride: { x: 30, z: 58 },
    caveZone: caveFootprint(),
    carnival: true,
    emmettBase: true,
    zoo: true,
    water: [
      { kind: "water", x: 0, z: -42, r: 9.4 },
      { kind: "water", x: -48, z: -48, r: 5.4 },
      ...(NO_PLACES ? [] : [{ kind: "water" as const, x: DUCK_POND.x, z: DUCK_POND.z, r: DUCK_POND.r }]),
      // the pool, as two circles under its 20x10 rectangle
      { kind: "water", x: POOL.x - 5, z: POOL.z, r: 5, pool: true },
      { kind: "water", x: POOL.x + 5, z: POOL.z, r: 5, pool: true },
    ],
  };
}

const villageDumplings: DumplingDef[] = [
  {
    id: "plaza",
    name: "Plaza Bao",
    color: "#f3d7b5",
    accent: "#e0b888",
    pos: [0.8, 1.15, 0.8],
    hide: "easy",
    region: "the fountain plaza",
    hint: "Right on the rim of the fountain.",
  },
  {
    id: "market",
    name: "Market Fold",
    color: "#e8b86a",
    accent: "#c49040",
    pos: [-16.5, 1.15, 8.4],
    hide: "easy",
    region: "the market stalls",
    hint: "On a market stall west of the plaza.",
  },
  {
    id: "porch",
    name: "Porch Puff",
    color: "#f0c4c8",
    accent: "#d48a92",
    pos: [18.6, 0.55, 14.2],
    hide: "easy",
    region: "the pink house porch",
    hint: "Sitting on the porch of the pink house.",
  },
  {
    id: "alley",
    name: "Alley Gyoza",
    color: "#c8d4a0",
    accent: "#8aaa62",
    pos: [8.4, 0.55, 18.8],
    hide: "medium",
    region: "the narrow alley",
    hint: "Squeeze between the teal house and the mint house.",
  },
  {
    id: "roof",
    name: "Rooftop Star",
    color: "#f2e6a0",
    accent: "#d8bc4a",
    pos: [-20.5, 5.55, -12.2],
    hide: "medium",
    region: "the bakery roof",
    hint: "Use the stairs behind the bakery and climb onto the roof.",
  },
  {
    id: "canal",
    name: "Canal Drop",
    color: "#9ec8e0",
    accent: "#6aa4c4",
    pos: [2.2, 0.55, -22.4],
    hide: "medium",
    region: "under the canal bridge",
    hint: "Go under the wooden bridge over the canal.",
  },
  {
    id: "lolly",
    name: "Lolly Bun",
    color: "#e8a0c0",
    accent: "#c46a92",
    pos: [34.2, 0.55, -18.6],
    hide: "medium",
    region: "the lollipop grove",
    hint: "Among the giant lollipops on the east lawn.",
  },
  {
    id: "well",
    name: "Wishing Well",
    color: "#d4c4a0",
    accent: "#b8a078",
    pos: [-32.4, 0.85, 20.6],
    hide: "medium",
    region: "the wishing well",
    hint: "Beside the stone well in the northwest garden.",
  },
  {
    id: "tower",
    name: "Bell Tower",
    color: "#e8d8c8",
    accent: "#c4a890",
    pos: [0, 8.4, 32.5],
    hide: "hard",
    region: "the bell tower",
    hint: "Climb every landing of the bell tower at the north end.",
  },
  {
    id: "crate",
    name: "Crate Squish",
    color: "#c4a06a",
    accent: "#a07848",
    pos: [-8.6, 0.85, 28.4],
    hide: "hard",
    region: "the crate stack",
    hint: "Tucked behind a stack of crates near the tower.",
  },
  {
    id: "courtyard",
    name: "Quiet Courtyard",
    color: "#b8d8c8",
    accent: "#7aaa92",
    pos: [28.4, 0.55, 28.8],
    hide: "hard",
    region: "the locked courtyard",
    hint: "Walk around the north-east houses. There is a courtyard with one opening.",
  },
  {
    id: "chimney",
    name: "Chimney Bao",
    color: "#d45a4a",
    accent: "#b44438",
    pos: [20.2, 5.7, -16.5],
    hide: "hard",
    region: "the blue house roof",
    hint: "Stairs on the side of the blue house lead to a dumpling by the chimney.",
  },
];

function candyVillage(): LevelDef {
  const props: Prop[] = [
    ...fenceRing(-46, 46, -46, 46, "#e8c4a0"),
    box(0, 0.04, 0, 18, 0.08, 18, "#e8d8c0", false),
    box(0, 0.04, 8, 4, 0.08, 40, "#e8d8c0", false),
    box(8, 0.04, 0, 40, 0.08, 4, "#e8d8c0", false),

    { kind: "house", x: -20, z: -12, body: "#f3eadc", roof: "#d45a4a", w: 7, d: 6 },
    { kind: "house", x: 20, z: -16, body: "#4f93c4", roof: "#f0e8dc", w: 7, d: 6, ry: Math.PI },
    { kind: "house", x: 18, z: 16, body: "#d47a96", roof: "#f7f0e4", w: 6.5, d: 5.5 },
    { kind: "house", x: -18, z: 16, body: "#3f9a6b", roof: "#f0e0c8", w: 6, d: 5.5, ry: Math.PI / 2 },
    { kind: "house", x: 8, z: 22, body: "#5aa8b8", roof: "#e8c46a", w: 5.5, d: 5 },
    { kind: "house", x: 32, z: 8, body: "#e8c46a", roof: "#d45a4a", w: 6, d: 5 },

    box(-16.5, 0.7, 8.4, 2.6, 1.4, 1.4, "#e8b86a"),
    box(-16.5, 1.45, 8.4, 2.4, 0.12, 1.2, "#c49040"),
    box(-13.6, 0.7, 6.2, 2.2, 1.4, 1.4, "#d47a96"),
    box(-19.4, 0.7, 6.0, 2.2, 1.4, 1.4, "#4f93c4"),

    box(-22.6, 0.4, -8.4, 1.6, 0.8, 1.6, "#d8c49a"),
    box(-22.6, 1.2, -9.2, 1.6, 0.8, 1.6, "#d8c49a"),
    box(-21.4, 2.0, -10.2, 1.6, 0.8, 1.6, "#d8c49a"),
    box(-20.5, 2.8, -11.2, 1.8, 0.8, 1.6, "#d8c49a"),
    box(-20.5, 3.6, -12.0, 2.2, 0.8, 1.8, "#d8c49a"),
    box(-20.5, 4.4, -12.2, 3.4, 0.28, 3.4, "#f3eadc"),

    box(0, 0.2, -22, 18, 0.35, 3.4, "#5aa8c8", false),
    box(0, 0.9, -22, 3.6, 0.28, 5.2, "#c4a06a"),
    box(-4.2, 0.7, -22, 0.28, 1.1, 4.6, "#c4a06a"),
    box(4.2, 0.7, -22, 0.28, 1.1, 4.6, "#c4a06a"),
    box(2.2, 0.18, -22.4, 1.4, 0.22, 1.6, "#8ab8c8", false),

    box(22.4, 0.4, -12.6, 1.5, 0.8, 1.5, "#d8c49a"),
    box(21.6, 1.2, -13.6, 1.5, 0.8, 1.5, "#d8c49a"),
    box(20.8, 2.0, -14.6, 1.5, 0.8, 1.5, "#d8c49a"),
    box(20.2, 2.8, -15.6, 1.6, 0.8, 1.6, "#d8c49a"),
    box(20.2, 3.6, -16.4, 1.8, 0.8, 1.8, "#d8c49a"),
    box(20.2, 4.4, -16.5, 3.2, 0.28, 3.2, "#4f93c4"),
    box(21.4, 5.3, -17.4, 0.6, 1.6, 0.6, "#d45a4a"),

    box(0, 1.2, 32.5, 3.4, 2.4, 3.4, "#e8d8c0"),
    box(0, 3.4, 32.5, 2.8, 2.0, 2.8, "#e0d0b8"),
    box(0, 5.4, 32.5, 2.2, 2.0, 2.2, "#d8c8b0"),
    box(0, 7.2, 32.5, 1.8, 1.6, 1.8, "#d0c0a8"),
    box(0, 8.6, 32.5, 2.4, 0.28, 2.4, "#d45a4a"),
    box(-1.2, 1.6, 30.8, 1.2, 0.28, 1.4, "#c4a06a"),
    box(-1.0, 3.6, 31.2, 1.1, 0.28, 1.2, "#c4a06a"),
    box(-0.8, 5.6, 31.4, 1.0, 0.28, 1.1, "#c4a06a"),
    box(-0.6, 7.4, 31.6, 0.9, 0.28, 1.0, "#c4a06a"),

    box(-8.2, 0.45, 28.2, 1.2, 0.9, 1.2, "#c4a06a"),
    box(-9.4, 0.7, 29.0, 1.1, 1.4, 1.1, "#b89060"),
    box(-7.2, 0.55, 29.4, 1.0, 1.1, 1.0, "#c4a06a"),

    box(-32.4, 0.7, 20.6, 1.8, 1.4, 1.8, "#c8c0b4"),
    { kind: "cyl", pos: [-32.4, 0.9, 20.6], r: 0.7, h: 0.5, color: "#5aa8c8", collide: false },

    box(28.4, 0.85, 24, 8, 1.7, 1.1, "#e8c46a"),
    box(32.4, 0.85, 28.8, 1.1, 1.7, 10, "#e8c46a"),
    box(24.4, 0.85, 28.8, 1.1, 1.7, 10, "#e8c46a"),
    box(28.4, 0.08, 28.8, 7, 0.1, 8, "#8aba6a", false),

    { kind: "lollipop", x: 32, z: -16, candy: "#d45a4a" },
    { kind: "lollipop", x: 36, z: -20, candy: "#4f93c4" },
    { kind: "lollipop", x: 30, z: -22, candy: "#d47a96" },
    { kind: "lollipop", x: 38, z: -14, candy: "#3f9a6b" },
    { kind: "lollipop", x: 34, z: -12, candy: "#e8c46a" },
    { kind: "lollipop", x: 38.5, z: -24, candy: "#d45a4a" },

    { kind: "cloud", pos: [-12, 16, 10], scale: 1.3 },
    { kind: "cloud", pos: [18, 15, -8], scale: 1 },
    { kind: "cloud", pos: [6, 17, 24], scale: 1.2 },
    { kind: "tree", x: -28, z: -8, variant: 1, scale: 1 },
    { kind: "tree", x: 12, z: -32, variant: 0, scale: 1.1 },
    { kind: "tree", x: -10, z: -32, variant: 2, scale: 1.2 },
    { kind: "tree", x: 40, z: 20, variant: 1, scale: 0.9 },
  ];

  return {
    id: "village",
    name: "Candy Village",
    tagline: "Rooftops, alleys, a bell tower, and a hidden courtyard.",
    sky: "#9ad0ee",
    fogFar: 90,
    grass: "#6bbb6a",
    path: "#e8d8c0",
    spawn: [0, 0, 12],
    spawnYaw: 0,
    bounds: { minX: -45, maxX: 45, minZ: -45, maxZ: 45 },
    groundY: 0,
    props,
    dumplings: villageDumplings,
    water: [{ kind: "water", x: 0, z: -22, r: 8.5 }],
  };
}

const skyDumplings: DumplingDef[] = [
  {
    id: "welcome",
    name: "Welcome Bao",
    color: "#f3d7b5",
    accent: "#e0b888",
    pos: [0, 0.55, -4],
    hide: "easy",
    region: "the arrival cloud",
    hint: "Right in front of you on the first island.",
  },
  {
    id: "garden",
    name: "Sky Garden",
    color: "#b8e0a8",
    accent: "#7aaa62",
    pos: [-10.4, 0.55, 8.6],
    hide: "easy",
    region: "the flower beds",
    hint: "Among the flower boxes on the first island.",
  },
  {
    id: "bridge",
    name: "Rainbow Fold",
    color: "#e8a0c0",
    accent: "#c46a92",
    pos: [14.5, 2.4, 0],
    hide: "medium",
    region: "the rainbow bridge",
    hint: "Halfway across the rainbow bridge.",
  },
  {
    id: "hedge",
    name: "Cloud Maze",
    color: "#f0e08a",
    accent: "#d4c04a",
    pos: [0, 0.55, 0],
    hide: "medium",
    region: "the cloud hedge maze",
    hint: "The second island is a hedge maze. The dumpling is in the middle.",
  },
  {
    id: "throne",
    name: "Throne Gyoza",
    color: "#d8c4e8",
    accent: "#a090c4",
    pos: [32.4, 1.35, 0.2],
    hide: "medium",
    region: "the castle hall",
    hint: "Walk into the castle and look behind the throne.",
  },
  {
    id: "rampart",
    name: "Rampart Star",
    color: "#f2e6a0",
    accent: "#d8bc4a",
    pos: [36.8, 5.7, 4.4],
    hide: "hard",
    region: "the castle ramparts",
    hint: "Climb the stairs inside the castle up onto the walls.",
  },
  {
    id: "keep",
    name: "High Keep",
    color: "#e8d8c8",
    accent: "#c4a890",
    pos: [32.4, 9.4, -3.2],
    hide: "hard",
    region: "the keep tower",
    hint: "Keep climbing. The tallest tower holds a dumpling.",
  },
  {
    id: "step",
    name: "Stepping Cloud",
    color: "#c8e8f4",
    accent: "#8ac4d8",
    pos: [8.2, 3.55, 18.4],
    hide: "medium",
    region: "the stepping clouds",
    hint: "Jump the little clouds north of the maze island.",
  },
  {
    id: "fall",
    name: "Waterfall Cave",
    color: "#a8d4e8",
    accent: "#6aa8c4",
    pos: [-22.6, 0.85, -16.4],
    hide: "hard",
    region: "behind the waterfall",
    hint: "A third island to the southwest has a waterfall. Walk behind it.",
  },
  {
    id: "arch",
    name: "Moon Arch",
    color: "#d8dce8",
    accent: "#9aa4c4",
    pos: [-28.4, 4.6, 12.2],
    hide: "hard",
    region: "the moon arch island",
    hint: "Northwest island. Look under the stone arch.",
  },
  {
    id: "nest",
    name: "Bird Nest",
    color: "#e8c46a",
    accent: "#c49a40",
    pos: [-6.4, 6.4, 24.8],
    hide: "hard",
    region: "the nest cloud",
    hint: "A high tiny cloud north of the stepping stones.",
  },
  {
    id: "party",
    name: "Birthday Bao",
    color: "#f0b8c4",
    accent: "#d47a8a",
    pos: [42.2, 1.15, -14.6],
    hide: "hard",
    region: "the party terrace",
    hint: "A secret terrace east of the castle, past a low wall.",
  },
];

function cloudCastle(): LevelDef {
  const maze = mazeAt(0, 0, "#d8f0e0", SKY_MAZE_LAYOUT);
  skyDumplings.find((d) => d.id === "hedge")!.pos = [maze.dumpling[0] + 22, 0.55, maze.dumpling[1]];

  const island = (
    x: number,
    z: number,
    sx: number,
    sz: number,
    color = "#e8f2c8",
  ): Prop[] => [
    box(x, -0.4, z, sx, 0.8, sz, color),
    box(x, -1.2, z, sx * 0.86, 1.0, sz * 0.86, "#d4e8b0"),
  ];

  const mazeProps = maze.props.map((p) => {
    if (p.kind !== "box") return p;
    return {
      ...p,
      pos: [p.pos[0] + 22, p.pos[1], p.pos[2]] as [number, number, number],
    };
  });

  const props: Prop[] = [
    ...island(0, 2, 28, 26),
    ...island(22, 0, 26, 26, "#dff0d4"),
    ...island(34, 0, 22, 22, "#eee6dc"),
    ...island(-24, -16, 16, 16, "#d8ece0"),
    ...island(-28, 12, 14, 14, "#e4eaf4"),
    ...island(8, 18, 8, 8, "#e8f2c8"),
    ...island(-6, 24, 6, 6, "#e8f2c8"),
    ...island(42, -14, 10, 10, "#f4e4dc"),

    box(11, 1.6, 0, 8, 0.35, 1.6, "#d45a4a"),
    box(11, 1.95, 0, 8, 0.22, 1.6, "#e8c46a"),
    box(11, 2.25, 0, 8, 0.22, 1.6, "#3f9a6b"),
    box(11, 2.55, 0, 8, 0.22, 1.6, "#4f93c4"),
    box(11, 2.85, 0, 8, 0.22, 1.6, "#d47a96"),

    box(-10.4, 0.35, 8.6, 1.6, 0.5, 1.6, "#d47a96", false),
    box(-8.4, 0.35, 6.6, 1.4, 0.5, 1.4, "#4f93c4", false),
    box(-12.2, 0.35, 6.2, 1.3, 0.5, 1.3, "#e8c46a", false),

    box(32.4, 2.2, 0, 10, 4.4, 10, "#eee6dc"),
    box(32.4, 5.0, 0, 11, 1.2, 11, "#d45a4a"),
    box(28.2, 1.2, 0, 2.2, 2.4, 2.6, "#eee6dc", false),
    box(32.4, 1.0, -3.6, 2.2, 2.0, 1.4, "#e8d8c8"),
    box(29.2, 1.6, 3.4, 1.4, 0.28, 1.6, "#d8c49a"),
    box(30.4, 2.8, 3.8, 1.4, 0.28, 1.6, "#d8c49a"),
    box(32.0, 4.0, 4.2, 1.6, 0.28, 1.8, "#d8c49a"),
    box(34.6, 5.2, 4.4, 3.6, 0.28, 2.4, "#eee6dc"),
    box(36.8, 5.9, 4.4, 1.4, 1.2, 1.4, "#d45a4a"),
    box(34.8, 6.4, -2.2, 1.6, 0.28, 1.6, "#d8c49a"),
    box(33.6, 7.6, -2.8, 1.5, 0.28, 1.5, "#d8c49a"),
    box(32.4, 8.8, -3.2, 2.4, 0.28, 2.4, "#eee6dc"),
    box(32.4, 10.2, -3.2, 2.0, 2.4, 2.0, "#d45a4a"),

    box(8.2, 3.0, 18.4, 3.6, 0.6, 3.6, "#e8f2c8"),
    box(-6.4, 5.8, 24.8, 3.2, 0.6, 3.2, "#e8f2c8"),

    box(-22.6, 2.4, -18.6, 1.2, 4.4, 0.4, "#8ac4d8", false),
    box(-24.4, 1.4, -16.4, 2.4, 2.8, 1.2, "#b8d8c8"),
    box(-20.8, 1.4, -16.4, 2.4, 2.8, 1.2, "#b8d8c8"),
    box(-22.6, 2.4, -15.2, 5.4, 1.4, 1.2, "#b8d8c8"),

    box(-28.4, 2.4, 12.2, 1.2, 4.4, 0.5, "#c8c8d4"),
    box(-26.2, 2.4, 12.2, 1.2, 4.4, 0.5, "#c8c8d4"),
    box(-27.3, 4.6, 12.2, 3.6, 0.5, 0.5, "#c8c8d4"),

    box(40.2, 0.85, -10.4, 1.1, 1.7, 6, "#e8c4b0"),
    box(44.6, 0.85, -14.6, 1.1, 1.7, 8, "#e8c4b0"),

    { kind: "cloud", pos: [4, 10, -12], scale: 1.4 },
    { kind: "cloud", pos: [24, 12, 10], scale: 1.2 },
    { kind: "cloud", pos: [-16, 11, 6], scale: 1.1 },
    { kind: "cloud", pos: [38, 13, -6], scale: 1.3 },
    { kind: "tree", x: -8, z: -4, variant: 1, scale: 0.8 },
    { kind: "tree", x: 6, z: 8, variant: 0, scale: 0.7 },
    { kind: "tree", x: 26, z: -8, variant: 1, scale: 0.65 },

    ...mazeProps,
  ];

  return {
    id: "sky",
    name: "Cloud Castle",
    tagline: "Floating islands, a maze in the sky, and a castle full of secrets.",
    sky: "#8ec8f0",
    fogFar: 80,
    grass: "#d8ec9a",
    path: "#f0e8d0",
    spawn: [0, 0, 8],
    spawnYaw: 0,
    bounds: { minX: -40, maxX: 50, minZ: -28, maxZ: 32 },
    groundY: -80,
    voidY: -6,
    islands: true,
    props,
    dumplings: skyDumplings,
  };
}

export const LEVELS: LevelDef[] = [picnicPark(), sugarRushPark(), cloudCastle()];

export function levelByIndex(i: number) {
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, i))]!;
}
