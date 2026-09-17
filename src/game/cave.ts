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
  p.push(slab(67, 0.6, -145, 10, 1.2, 2, "#5f5a53"));
  p.push(slab(67, 0.3, -143.4, 3, 0.6, 1.2, "#6f6a62"));
  return p;
}
