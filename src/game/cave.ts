import type { BoxProp, Prop } from "./types";

/**
 * The mountain cave: a rocky mountain in the south-east band with a network of
 * winding tunnels inside, laid out on a grid so the solid rock, the roofs, the
 * decoration and the runtime's first-person zone all come from one map.
 *
 * Every rock cell is one solid column the full height of the mountain; every
 * open cell has a roof slab above its headroom. Colliders are axis-aligned
 * boxes, so a grid is what keeps the tunnels exactly as wide as they look.
 *
 * Legend:
 *   #  solid rock
 *   .  tunnel (3.2m headroom)
 *   C  crystal grotto (5m)
 *   M  mushroom room (5m)
 *   G  great cavern (6.5m)
 *   N  dead-end nook (3.2m)
 *
 * Row 0 is the north face, where the entrance opens toward the ring road.
 * Inside, first person is forced (runtime), because the third-person boom
 * cannot fit in a 3m tunnel at any size; that is what kept the old cave small.
 */
export const CAVE_MAP = [
  "######.#######",
  "######.#######",
  "##CC......####",
  "##CC#####.####",
  "##.######...##",
  "##.##...###.##",
  "##....#.#MM.##",
  "#######.#MM###",
  "###GGGG.#.####",
  "###GGGG....###",
  "###GGGG###N###",
  "##############",
];

export const CAVE = {
  /** north-west corner of the grid */
  x0: 52,
  z0: -113,
  cell: 3,
  /** top of the solid rock */
  height: 9.5,
};

const HEADROOM: Record<string, number> = { ".": 3.2, N: 3.2, C: 5, M: 5, G: 6.5 };

export const CAVE_ROCK = "#7a736a";
const ROOF = "#5f5a53";
const FLOOR = "#3a3531";

export function caveCellCenter(r: number, c: number): [number, number] {
  return [CAVE.x0 + (c + 0.5) * CAVE.cell, CAVE.z0 - (r + 0.5) * CAVE.cell];
}

/** The mountain's footprint; inside it (and low) she is in the tunnels. */
export function caveFootprint() {
  const rows = CAVE_MAP.length;
  const cols = CAVE_MAP[0]!.length;
  return {
    minX: CAVE.x0,
    maxX: CAVE.x0 + cols * CAVE.cell,
    minZ: CAVE.z0 - rows * CAVE.cell,
    maxZ: CAVE.z0,
  };
}

export function isOpen(ch: string | undefined) {
  return ch != null && ch !== "#";
}

/** Where the entrance tunnel meets the north face. */
export function caveEntrance(): [number, number] {
  const c = CAVE_MAP[0]!.indexOf(".");
  return [CAVE.x0 + (c + 0.5) * CAVE.cell, CAVE.z0];
}

/** Hiding spots, resting on the floor or the cavern ledge. */
export const CAVE_SPOTS = {
  /** the great cavern, on the ledge at the back */
  ledge: [64, 1.82, -145] as [number, number, number],
  /** crystal grotto, in the far corner */
  grotto: [59, 0.62, -120] as [number, number, number],
  /** the dead-end nook past the mushroom room */
  nook: [83.5, 0.62, -144.5] as [number, number, number],
};

function slab(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, collide = true): BoxProp {
  return { kind: "box", pos: [x, y, z], size: [sx, sy, sz], color, collide };
}

/**
 * Solid rock, roofs and floors as props. Runs of the same kind along a row are
 * merged into one box so the collider count stays small.
 */
export function mountainCave(): Prop[] {
  const p: Prop[] = [];
  const { cell, height } = CAVE;
  CAVE_MAP.forEach((row, r) => {
    const z = CAVE.z0 - (r + 0.5) * cell;
    let c = 0;
    while (c < row.length) {
      const ch = row[c]!;
      const key = isOpen(ch) ? `open${HEADROOM[ch]}` : "rock";
      let end = c + 1;
      while (end < row.length) {
        const n = row[end]!;
        const k = isOpen(n) ? `open${HEADROOM[n]}` : "rock";
        if (k !== key) break;
        end++;
      }
      const w = (end - c) * cell;
      const x = CAVE.x0 + c * cell + w / 2;
      if (key === "rock") {
        p.push(slab(x, height / 2, z, w, height, cell, CAVE_ROCK));
      } else {
        const head = HEADROOM[ch]!;
        p.push(slab(x, head + (height - head) / 2, z, w, height - head, cell, ROOF));
        // floor, a hair above the grass line; also keeps the grass out
        p.push(slab(x, 0.02, z, w, 0.04, cell, FLOOR, false));
      }
      c = end;
    }
  });

  // the great cavern's ledge along its back (south) wall, with a step up in
  // the middle; the cavern spans x 61..73, z -137..-146
  for (const [x, y, z, sx, sy, sz, color] of CAVE_LEDGE) p.push(slab(x, y, z, sx, sy, sz, color));
  p.push(...lookoutProps());
  return p;
}

/**
 * The lookout on the mountain top, and the stone stair that climbs to it.
 *
 * The stair is a switchback in the apron in front of the entrance face: a
 * lower flight running east, a landing at the corner, an upper flight running
 * back west, then the deck on the roof of the mountain. Every step is 0.35m,
 * well under the 0.62m step-up, on a 1m tread, and every open side has a
 * parapet or a railing, so nothing up there needs a jump and nothing walkable
 * has a drop off the side of it. Colliders ignore rotation, so all of it is
 * axis-aligned on purpose.
 */
export const LOOKOUT = {
  /** the face the stair climbs, and the ground it stands on */
  face: -113,
  risers: 28,
  top: 9.84,
  tread: 1,
  /** lower flight, running east from here */
  x0: 79.5,
  /** the corner landing */
  landingX: [92.5, 94] as [number, number],
  /** the top landing, where the stair meets the deck */
  topX: [77, 79.5] as [number, number],
  /** the outer (lower) lane and the inner (upper) lane, as z ranges */
  laneOut: [-110.5, -108.3] as [number, number],
  laneIn: [-113, -110.8] as [number, number],
  /** the deck on the mountain top */
  deck: { minX: 64, maxX: 85, minZ: -119.5, maxZ: -113 },
  /** where she steps on: walk east along the apron at about z -109.4 */
  start: [78.5, -109.4] as [number, number],
};

/** Height of the step numbered k (1 is the first tread, 28 the deck). */
export function lookoutStep(k: number) {
  return (LOOKOUT.top * k) / LOOKOUT.risers;
}

/** The x range of a tread: 1..13 climb east, 15..27 climb back west. */
function treadX(k: number): [number, number] {
  const { x0, tread, landingX, topX } = LOOKOUT;
  if (k <= 13) return [x0 + (k - 1) * tread, x0 + k * tread];
  if (k === 14) return landingX;
  if (k <= 27) return [landingX[0] - (k - 14) * tread, landingX[0] - (k - 15) * tread];
  return topX;
}

/**
 * Everything solid in the lookout: the stair, its parapets, the deck, its
 * railing and the things to look at up there.
 */
export function lookoutProps(): Prop[] {
  const p: Prop[] = [];
  const L = LOOKOUT;
  const [ao, ai] = L.laneOut;
  const [bo, bi] = L.laneIn;
  const box = (minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number, color: string, collide = true) =>
    p.push(slab((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2, maxX - minX, maxY - minY, maxZ - minZ, color, collide));
  // rock colours, not the masonry ones: the stair is cut out of the mountain,
  // and a brick texture stretched up a 9m block is exactly what looked wrong
  // in the tunnels
  const STONE = "#8a8378";
  const WALL = "#7d766c";
  const DECK = "#c49a62";
  const RAIL = "#b98d58";

  // treads: each one a block up from the ground, so there is nothing to fall
  // into and the step onto it is always 0.35m
  for (let k = 1; k <= L.risers; k++) {
    const [x1, x2] = treadX(k);
    const lane = k <= 13 ? [ao, ai] : k === 14 ? [bo, ai] : [bo, bi];
    box(x1, x2, 0, lookoutStep(k), lane[0]!, lane[1]!, STONE);
  }
  // the outer parapet along the lower flight and round the corner landing
  for (let k = 1; k <= 14; k++) {
    const [x1, x2] = treadX(k);
    box(x1, x2, 0, lookoutStep(k) + 1, ai, ai + 0.35, WALL);
  }
  // the east end of the landing
  box(L.landingX[1], L.landingX[1] + 0.35, 0, lookoutStep(14) + 1, bo, ai + 0.35, WALL);
  // the wall between the two lanes, which is also the upper flight's parapet
  for (let k = 15; k <= 28; k++) {
    const [x1, x2] = treadX(k);
    box(x1, x2, 0, lookoutStep(k) + 1, bi, bi + 0.3, WALL);
  }
  // the west end of the top landing, above the cave mouth side
  box(L.topX[0] - 0.35, L.topX[0], 0, lookoutStep(28) + 1, bo, bi + 0.3, WALL);

  // the deck: a plank floor on the rock, 0.34m proud of it
  const d = L.deck;
  box(d.minX, d.maxX, CAVE.height, L.top, d.minZ, d.maxZ, DECK);
  // the railing: a top rail she cannot walk through, with posts and a middle
  // rail drawn under it (both too slim to be solid, so they cannot trap her)
  const rail = (minX: number, maxX: number, minZ: number, maxZ: number) => {
    box(minX, maxX, L.top + 0.71, L.top + 1.05, minZ, maxZ, RAIL);
    box(minX, maxX, L.top + 0.36, L.top + 0.48, minZ, maxZ, RAIL, false);
    const along = maxX - minX > maxZ - minZ;
    const from = along ? minX : minZ;
    const to = along ? maxX : maxZ;
    for (let t = from + 0.12; t <= to - 0.12; t += 1.6) {
      const px = along ? t : (minX + maxX) / 2;
      const pz = along ? (minZ + maxZ) / 2 : t;
      p.push({ kind: "cyl", pos: [px, L.top + 0.55, pz], r: 0.09, h: 1.1, color: "#a07848", collide: false });
    }
  };
  rail(d.minX, L.topX[0], d.maxZ - 0.25, d.maxZ);
  rail(L.topX[1], d.maxX, d.maxZ - 0.25, d.maxZ);
  rail(d.minX, d.maxX, d.minZ, d.minZ + 0.25);
  rail(d.minX, d.minX + 0.25, d.minZ, d.maxZ);
  rail(d.maxX - 0.25, d.maxX, d.minZ, d.maxZ);

  // a bench facing the park, a flag, and a telescope on a post
  const bx = 70;
  const bz = -117.2;
  box(bx - 1.2, bx + 1.2, L.top, L.top + 0.45, bz - 0.28, bz + 0.28, "#6a4a32");
  box(bx - 1.3, bx + 1.3, L.top + 0.45, L.top + 0.58, bz - 0.34, bz + 0.34, "#c4a06a");
  box(bx - 1.3, bx + 1.3, L.top + 0.58, L.top + 1.12, bz + 0.2, bz + 0.34, "#c4a06a");
  p.push({ kind: "cyl", pos: [65.8, L.top + 2.6, -114.6], r: 0.1, h: 5.2, color: "#b8c2c8" });
  p.push({ kind: "cyl", pos: [81.5, L.top + 0.6, -114.4], r: 0.14, h: 1.2, color: "#5a6a70" });
  return p;
}

/**
 * The air she walks in on the stair and the deck. makeMountainCave keeps
 * every boulder out of these, so no rock leans over the steps.
 */
export function lookoutClearance() {
  const L = LOOKOUT;
  return [
    // the stair, lane by lane: the air she walks in, kept 0.15m clear of the
    // rock face and 0.22m clear of the wall between the lanes, which is
    // dressed with the same small rocks the tunnels use
    { minX: L.topX[0], maxX: L.landingX[0], minY: 0, maxY: L.top + 2.6, minZ: L.face + 0.15, maxZ: L.laneIn[1] },
    { minX: L.topX[0], maxX: L.landingX[0], minY: 0, maxY: L.top + 2.6, minZ: L.laneOut[0] + 0.22, maxZ: L.laneOut[1] },
    { minX: L.landingX[0], maxX: L.landingX[1], minY: 0, maxY: L.top + 2.6, minZ: L.face + 0.15, maxZ: L.laneOut[1] },
    // the deck, and head height above it
    { minX: L.deck.minX, maxX: L.deck.maxX, minY: CAVE.height - 0.05, maxY: L.top + 2.6, minZ: L.deck.minZ, maxZ: L.deck.maxZ },
  ];
}

/** The cavern ledge and its step: centre, size, colour. */
export const CAVE_LEDGE: [number, number, number, number, number, number, string][] = [
  [67, 0.6, -145, 10, 1.2, 2, "#5f5a53"],
  [67, 0.3, -143.4, 3, 0.6, 1.2, "#6f6a62"],
];

export function caveHeadroom(ch: string | undefined) {
  return ch != null ? HEADROOM[ch] : undefined;
}

/**
 * How far a point sits inside the walkable space of the tunnels: its distance
 * to the nearest solid rock column, roof slab or ledge. 0 inside solid, and 0
 * anywhere outside the mountain except the first 2m in front of the mouth,
 * where the entrance tunnel's walls and a 3.6m lintel are carried outward.
 * `wall` is true when the nearest solid is beside the point, not above it.
 *
 * makeMountainCave uses this to keep every boulder from bulging into a
 * passage; tools/cave.ts checks the built meshes against the real colliders.
 */
export function caveIntrusion(x: number, y: number, z: number): { d: number; wall: boolean } {
  const { x0, z0, cell, height } = CAVE;
  const rows = CAVE_MAP.length;
  const cols = CAVE_MAP[0]!.length;
  const mouthCol = CAVE_MAP[0]!.indexOf(".");
  const none = { d: 0, wall: true };
  if (y <= 0 || y >= height) return none;
  const r = Math.floor((z0 - z) / cell);
  const c = Math.floor((x - x0) / cell);
  // the solid part of a cell as a y range, or null when it has none
  const solid = (rr: number, cc: number): [number, number] | null => {
    if (rr === -1 && cc >= 0 && cc < cols) {
      return cc === mouthCol ? [3.6, height] : [0, height];
    }
    if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) return null;
    const ch = CAVE_MAP[rr]![cc]!;
    return isOpen(ch) ? [HEADROOM[ch]!, height] : [0, height];
  };
  if (r < -1 || c < 0 || r >= rows || c >= cols) return none;
  if (r === -1 && (c !== mouthCol || z > z0 + 2)) return none;
  const own = solid(r, c)!;
  if (y >= own[0]) return none;
  let best = Infinity;
  let wall = true;
  const consider = (minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number) => {
    const dx = Math.max(minX - x, 0, x - maxX);
    const dy = Math.max(minY - y, 0, y - maxY);
    const dz = Math.max(minZ - z, 0, z - maxZ);
    const d = Math.hypot(dx, dy, dz);
    if (d < best) {
      best = d;
      wall = dy < Math.hypot(dx, dz);
    }
  };
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const s = solid(r + dr, c + dc);
      if (!s) continue;
      const cx0 = x0 + (c + dc) * cell;
      const cz1 = z0 - (r + dr) * cell;
      consider(cx0, cx0 + cell, s[0], s[1], cz1 - cell, cz1);
    }
  }
  for (const [lx, ly, lz, sx, sy, sz] of CAVE_LEDGE) {
    consider(lx - sx / 2, lx + sx / 2, ly - sy / 2, ly + sy / 2, lz - sz / 2, lz + sz / 2);
  }
  return best === Infinity ? none : { d: best, wall };
}
