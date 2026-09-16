import type { BoxProp, DumplingDef, LevelDef, Prop } from "./types";
import { cloudField, findClear, gatedRing, hits, occupancy, pathOccupancy, rectAt } from "./placement";
import {
  baseballDiamond,
  basketballCourt,
  boundaryWall,
  berm,
  hedge,
  houseRow,
  parkPath,
  picnicArea,
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

function mazeAt(ox: number, oz: number, wall: string): { props: Prop[]; dumpling: [number, number] } {
  const layout = [
    "###########",
    "#S    #   #",
    "##### # # #",
    "#     # # #",
    "# ### # # #",
    "# #     # #",
    "# # ##### #",
    "# #    D  #",
    "# ####### #",
    "#         #",
    "##### #####",
  ];
  const cell = 2.4;
  const props: Prop[] = [];
  let dumpling: [number, number] = [ox, oz];
  const h = 1.7;
  for (let row = 0; row < layout.length; row++) {
    const line = layout[row]!;
    for (let col = 0; col < line.length; col++) {
      const ch = line[col]!;
      const x = ox + (col - 5) * cell;
      const z = oz + (row - 5) * cell;
      if (ch === "#") props.push(box(x, h / 2, z, cell + 0.08, h, cell + 0.08, wall));
      if (ch === "D") dumpling = [x, z];
    }
  }
  return { props, dumpling };
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
    out.push(box(hx, top + 0.45, hz, 0.12, 0.9, 0.12, rail));
    out.push(box(hx2, top + 0.45, hz2, 0.12, 0.9, 0.12, rail));
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
    pos: [8, 0.62, -3.6],
    finish: "plain",
    hide: "easy",
    region: "the picnic blanket",
    hint: "Somebody left one on the picnic blanket near the gazebo.",
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
  },
  {
    id: "clover",
    name: "Clover Bun",
    color: "#b7d48a",
    accent: "#7aaa54",
    pos: [-82.6, 0.62, -23.4],
    finish: "plain",
    hide: "easy",
    region: "the sandbox",
    hint: "Half buried in the sandbox at the playground, way out west.",
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
    hint: "The maze has a dumpling at its heart. Start from the south opening.",
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
  },
  {
    id: "mint",
    name: "Mint Cloud",
    color: "#b8e0c8",
    accent: "#6aaa8a",
    pos: [20.5, 0.62, 112.5],
    finish: "rainbow",
    hide: "hard",
    region: "the houses on the north street",
    hint: "In a back yard on the north street, hiding behind a hedge.",
  },
  {
    id: "star",
    name: "Star Bao",
    color: "#f2e6a0",
    accent: "#d4b84a",
    pos: [54.2, 3.95, -54.2],
    finish: "gold",
    hide: "hard",
    region: "the treehouse",
    hint: "Climb the steps to the treehouse in the woods, then look behind the trunk.",
  },
  {
    id: "moon",
    name: "Moon Gyoza",
    color: "#d8dce8",
    accent: "#9aa4c4",
    pos: [-12, 0.62, 62.2],
    finish: "glow",
    hide: "hard",
    region: "the hill cave",
    hint: "There is a dark cave mouth on the south face of the lookout hill. Go inside.",
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
  },
];

function picnicPark(): LevelDef {
  const maze = mazeAt(-42, -18, "#5aaa62");
  picnicDumplings.find((d) => d.id === "lemon")!.pos = [maze.dumpling[0], 0.55, maze.dumpling[1]];

  const core: Prop[] = [
    ...gatedRing(-70, 70, -70, 70, "#c4b48a"),
    // crossing walkways sit on their own layers so they do not z-fight
    box(0, 0.04, 8, 4.4, 0.08, 52, "#d8c49a", false),
    box(-10, 0.06, 12, 28, 0.08, 4.4, "#d8c49a", false),
    box(18, 0.08, 10, 36, 0.08, 3.8, "#d8c49a", false),
    box(0, 0.10, -20, 4.2, 0.08, 28, "#d8c49a", false),
    box(40, 0.04, -8, 3.6, 0.08, 36, "#d8c49a", false),
    box(-36, 0.04, 20, 3.6, 0.08, 40, "#d8c49a", false),

    box(-14, 0.4, 10, 2.8, 0.8, 1.4, "#c48a5a"),
    box(-14, 0.85, 10, 2.6, 0.1, 1.2, "#e8d2b0"),
    box(-15.1, 0.55, 10.8, 0.18, 1.1, 0.18, "#c48a5a"),
    box(-12.9, 0.55, 9.2, 0.18, 1.1, 0.18, "#c48a5a"),
    box(-10.2, 0.22, 8.4, 1.8, 0.08, 1.8, "#d45a4a", false),
    box(-18.2, 0.4, 12.5, 2.4, 0.8, 1.3, "#b87a4a"),
    box(-18.2, 0.85, 12.5, 2.2, 0.1, 1.1, "#e8d2b0"),
    box(-22.4, 0.4, 8.6, 2.6, 0.8, 1.4, "#c48a5a"),
    box(-22.4, 0.85, 8.6, 2.4, 0.1, 1.2, "#e8d2b0"),
    box(-16, 0.08, 6.5, 2.2, 0.08, 2.2, "#4f93c4", false),
    box(-12.4, 0.08, 13.8, 2.4, 0.08, 2.4, "#d47a8a", false),

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

    box(22, 0.15, 8, 8, 0.22, 8, "#e2d2a8", false),
    box(26.4, 1.1, 9.4, 1.8, 2.2, 1.8, "#f0c44a"),
    box(26.4, 2.3, 9.4, 1.5, 0.2, 1.5, "#e8d7b8"),
    box(26.4, 2.5, 8.6, 0.35, 1.6, 0.35, "#e8d7b8"),
    box(26.4, 3.4, 9.0, 0.35, 0.14, 0.9, "#e8d7b8"),
    box(24.2, 0.7, 10.8, 1.2, 0.18, 3.2, "#4f93c4"),
    ...climbStairs(18.4, 5.4, 0, 1, 5, 0.38, 1.35, 1.8, "#e8c46a"),
    box(18.4, 2.1, 12.2, 2.2, 0.28, 2.2, "#e8c46a"),
    box(32, 0.12, 12, 6, 0.18, 6, "#e8d7b0", false),
    box(33.4, 0.45, 12.2, 2.8, 0.12, 2.8, "#d4b06a"),
    box(30.6, 0.7, 10.4, 0.35, 1.2, 0.35, "#c4a06a"),
    box(34.8, 0.7, 10.4, 0.35, 1.2, 0.35, "#c4a06a"),
    box(30.6, 1.4, 10.4, 0.18, 0.18, 1.6, "#8a6a3a"),
    box(32, 0.35, 14.6, 1.6, 0.55, 1.2, "#d4894a"),

    box(8, 0.08, -6, 5.2, 0.12, 5.2, "#efe4d0", false),
    box(4.4, 0.35, -2.2, 1.4, 0.55, 1.4, "#c48a5a"),
    box(11.6, 0.35, -2.4, 1.4, 0.55, 1.4, "#c48a5a"),

    /* ---- lookout hill, hollowed into a proper cave --------------------
     * Chamber is x -19..-7, z 59..67, with 4.2m of headroom: about four
     * times the floor area of the old one and twice the height, which is
     * what the third-person camera needs to sit behind her indoors.
     * The mouth is 6m wide on the south face so the exit stays in view.
     * Sized to stop short of the park wall at z 70 and the central path.
     */
    box(-22, 2.1, 63, 6, 4.2, 12, "#7aaa62"),
    box(-5, 2.1, 63, 4, 4.2, 12, "#7aaa62"),
    box(-13, 2.1, 68, 12, 4.2, 2, "#7aaa62"),
    box(-17.5, 2.1, 58, 3, 4.2, 2, "#6e9e58"),
    box(-8.5, 2.1, 58, 3, 4.2, 2, "#6e9e58"),
    box(-13, 4.9, 63, 12, 1.4, 12, "#6e9e58"),
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
    box(-17.2, 8.85, 64, 0.2, 0.7, 6, "#a07848"),
    box(-8.8, 8.85, 64, 0.2, 0.7, 6, "#a07848"),

    // stairs stop at the treehouse deck; the structure itself is a mesh now
    ...climbStairs(54.2, -40.6, 0, -1, 9, 0.4, 1.25, 3.6, "#c4a06a"),

    box(18.6, 0.12, -12, 1.8, 0.18, 1.8, "#6aa8c4", false),
    box(18.6, 0.12, -18.4, 1.6, 0.18, 1.6, "#6aa8c4", false),
    box(14.8, 0.12, -24.2, 1.5, 0.18, 1.5, "#6aa8c4", false),
    box(10.2, 0.12, -30.4, 1.6, 0.18, 1.6, "#6aa8c4", false),
    box(16.4, 0.02, -16, 1.2, 0.08, 20, "#5aa0bc", false),
    box(16.8, 0.55, -15.2, 3.4, 0.22, 1.2, "#a09080"),
    box(16.8, 0.9, -15.2, 0.28, 0.7, 1.4, "#a09080"),

    box(-62, 0.85, 26, 1.2, 1.7, 16, "#5aaa62"),
    box(-56, 0.85, 36, 12, 1.7, 1.2, "#5aaa62"),
    box(-56, 0.85, 18, 12, 1.7, 1.2, "#5aaa62"),
    box(-60.5, 0.08, 32.2, 8, 0.1, 10, "#8aba6a", false),
    box(-60.2, 0.4, 28.4, 0.8, 0.7, 0.8, "#d47a8a", false),
    box(-57.6, 0.35, 34.4, 0.7, 0.6, 0.7, "#4f93c4", false),
    box(-58.8, 0.45, 30.2, 0.9, 0.8, 0.9, "#e8c46a", false),

    box(28.2, 0.15, 36.2, 6.4, 0.22, 5.2, "#8a5a32"),
    box(26.4, 0.45, 35.2, 0.7, 0.5, 0.7, "#d45a4a", false),
    box(29.4, 0.4, 37.4, 0.55, 0.4, 0.55, "#4f93c4", false),
    box(30.6, 0.5, 35.2, 0.6, 0.6, 0.6, "#3f9a6b", false),
    box(27.2, 0.35, 38.0, 0.5, 0.3, 0.5, "#d4894a", false),
    { kind: "house", x: 56, z: 40, body: "#c48a5a", roof: "#a05040", w: 8, d: 6 },
    box(50.4, 0.45, 38.2, 1.4, 0.9, 1.4, "#d4a04a"),
    box(49.2, 0.7, 40.6, 1.1, 1.4, 1.1, "#d4a04a"),
    box(61.2, 0.45, 42.4, 1.5, 0.9, 1.2, "#d4a04a"),
    box(52.6, 0.35, 34.8, 0.9, 0.7, 0.9, "#d4894a", false),
    box(54.8, 0.4, 34.2, 0.8, 0.8, 0.8, "#e07040", false),
    box(56.6, 0.32, 33.6, 0.7, 0.6, 0.7, "#d4894a", false),

    box(-46, 0.12, 52, 8, 0.16, 8, "#8a6a48", false),
    box(-46, 0.35, 52, 1.2, 0.5, 1.2, "#c45a2a"),
    box(-46, 0.7, 52, 0.7, 0.4, 0.7, "#f0c44a"),
    box(-48.6, 0.4, 50.2, 1.8, 0.45, 0.7, "#6a4a32"),
    box(-43.4, 0.4, 53.6, 1.8, 0.45, 0.7, "#6a4a32"),
    box(-49.4, 1.1, 54.4, 2.4, 1.8, 0.18, "#4f93c4"),
    box(-49.4, 1.1, 51.6, 0.18, 1.8, 2.6, "#4f93c4"),
    box(-47.2, 1.1, 51.6, 0.18, 1.8, 2.6, "#4f93c4"),
    box(-48.3, 2.05, 53, 2.6, 0.16, 3.0, "#c45a4a"),

    box(8, 0.12, 40, 10, 0.1, 10, "#7bbb6a", false),
    box(6.2, 0.35, 38.4, 0.7, 0.6, 0.7, "#d47a8a", false),
    box(10.4, 0.4, 41.6, 0.8, 0.7, 0.8, "#4f93c4", false),
    box(8.6, 0.32, 43.2, 0.6, 0.5, 0.6, "#e8c46a", false),
    box(5.4, 0.38, 42.0, 0.7, 0.65, 0.7, "#d45a4a", false),
    box(11.2, 0.3, 38.8, 0.55, 0.5, 0.55, "#3f9a6b", false),

    box(0, 3.4, 66, 1.2, 6.8, 1.2, "#d8d0c4"),
    box(0, 7.0, 66, 4.2, 0.35, 1.1, "#efe8dc"),
    box(-1.6, 5.4, 66, 0.22, 2.6, 1.4, "#efe8dc"),
    box(1.6, 5.4, 66, 0.22, 2.6, 1.4, "#efe8dc"),

    box(-28, 0.35, 8, 1.6, 0.7, 0.7, "#6a8aaa"),
    box(-26.4, 1.1, 8, 0.2, 1.6, 0.2, "#6a8aaa"),
    box(-26.4, 2.0, 8, 0.7, 0.5, 0.4, "#d45a4a"),

    { kind: "tree", x: -22, z: 6, variant: 0, scale: 1.1 },
    { kind: "tree", x: -20, z: 18, variant: 1, scale: 0.95 },
    { kind: "tree", x: 6, z: 16, variant: 0, scale: 1 },
    { kind: "tree", x: 12, z: 26, variant: 2, scale: 1.2 },
    { kind: "tree", x: -4, z: 22, variant: 1, scale: 0.9 },
    { kind: "tree", x: 30, z: 16, variant: 0, scale: 1 },
    { kind: "tree", x: -16, z: -16, variant: 2, scale: 1.15 },
    { kind: "tree", x: 16, z: -54, variant: 1, scale: 1 },
    { kind: "tree", x: -28, z: 32, variant: 0, scale: 1.05 },
    { kind: "tree", x: -56, z: -8, variant: 2, scale: 1.2 },
    { kind: "tree", x: -62, z: 8, variant: 0, scale: 1 },
    { kind: "tree", x: 62, z: -8, variant: 1, scale: 1.1 },
    { kind: "tree", x: 64, z: 16, variant: 0, scale: 0.95 },
    { kind: "tree", x: -8, z: -58, variant: 2, scale: 1.15 },
    { kind: "tree", x: 22, z: 58, variant: 1, scale: 1 },
    { kind: "tree", x: -32, z: 62, variant: 0, scale: 1.05 },
    { kind: "cloud", pos: [-18, 16, -10], scale: 1.4 },
    { kind: "cloud", pos: [20, 18, 8], scale: 1.1 },
    { kind: "cloud", pos: [6, 15, 28], scale: 0.9 },
    { kind: "cloud", pos: [-30, 17, 10], scale: 1.2 },
    { kind: "cloud", pos: [48, 16, -20], scale: 1.3 },
    { kind: "cloud", pos: [-50, 15, 40], scale: 1.1 },
    { kind: "cloud", pos: [10, 17, 60], scale: 1.2 },

    ...maze.props,
    ...woods(50, -40, 36, 17),
    box(46.5, 0.08, -40.5, 4.2, 0.12, 4.2, "#8a5a32", false),
    box(46.5, 0.28, -38.4, 0.7, 0.4, 0.7, "#6a3a22", false),
    ...woods(-8, -58, 16, 41),
    ...orchard(48, 52),

  ];


  /* ---------------------------------------------------------------- *
   * Outer park. Zone anchors are chosen deliberately, then every added
   * shape is checked against what already exists before it is placed.
   * ---------------------------------------------------------------- */

  const GATE = 13;

  const zones: Prop[] = [
    ...houseRow(-63, 110, 8, 18, 1),
    ...baseballDiamond(0, -96, true),
    ...tennisCourts(95, 26, 2),
    ...basketballCourt(95, -34),
    ...picnicArea(93, 72),
    ...splashPad(-95, 28),
    ...playground(-95, -30),
  ];

  const boundary = boundaryWall(-117.5, 117.5, -117.5, 117.5, 6.5);

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
  ];

  // Anything already standing, plus corridors that must stay walkable.
  const taken = occupancy([...core, ...zones, ...boundary]);
  // keep berms and hedges off the walkways
  taken.push(...pathOccupancy([...core, ...paths, ...zones]));
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
  ];
  taken.push(...keepClear);

  // never bury a dumpling, and leave room to walk up to each one
  for (const d of picnicDumplings) {
    taken.push(rectAt(d.pos[0], d.pos[2], 7, 7));
  }

  const worldBounds = { minX: -119, maxX: 119, minZ: -119, maxZ: 119 };
  const blockers: Prop[] = [];

  // Berms that break up long sightlines. Preferred spots, but the search
  // moves them if something is already there, and drops them if nothing fits.
  const wantBerms: [number, number, number, number, number][] = [
    [-32, 34, 26, 8, 4.2],
    [30, -26, 8, 26, 4.0],
    [-44, -38, 22, 8, 3.8],
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
    [-16, 40, 18, 1.8],
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
    [-114, 119.5, 114, 119.5, 22],
    [-114, -119.5, 114, -119.5, 22],
    [-119.5, -108, -119.5, 108, 22],
    [119.5, -108, 119.5, 108, 22],
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
    ...paths,
    ...zones,
    ...blockers,
    ...cloudField(-115, 115, -115, 115, 34, 20260928),
  ];

  // Juice boxes: spread along the routes she will actually walk, a couple
  // tucked in the far zones so the boost is worth a detour.
  const juice: [number, number][] = [
    [6, 34],
    [-22, -12],
    [34, 18],
    [-4, -46],
    [0, 88],
    [0, -88],
    [88, 4],
    [-88, -4],
    [-95, -44],
    [95, 52],
    [46, -62],
    [-52, 66],
  ];

  // The hedge maze is 11 cells of 2.4m and the secret garden is walled, so a
  // trike has no way through either. He waits outside instead.
  const emmettKeepOut = [
    { minX: -56, maxX: -28, minZ: -32, maxZ: -4 },
    { minX: -64, maxX: -48, minZ: 16, maxZ: 38 },
  ];

  const rehideSpots = [
    { name: "the gazebo", say: "I put it by the gazebo!", pos: [8, 0.62, -6] as [number, number, number] },
    { name: "the splash pad", say: "It's at the splash pad!", pos: [-95, 0.62, 28] as [number, number, number] },
    { name: "home plate", say: "Check home plate!", pos: [0, 0.62, -95] as [number, number, number] },
    { name: "the barbecue", say: "It's by the barbecue!", pos: [100, 0.62, 76] as [number, number, number] },
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
    bounds: { minX: -120, maxX: 120, minZ: -120, maxZ: 120 },
    groundY: 0,
    props,
    dumplings: picnicDumplings,
    juice,
    rehideSpots,
    emmettKeepOut,
    water: [
      { kind: "water", x: 0, z: -42, r: 9.4 },
      { kind: "water", x: -48, z: -48, r: 5.4 },
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
  const maze = mazeAt(0, 0, "#d8f0e0");
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

export const LEVELS: LevelDef[] = [picnicPark(), candyVillage(), cloudCastle()];

export function levelByIndex(i: number) {
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, i))]!;
}
