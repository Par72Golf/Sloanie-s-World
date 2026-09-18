import type { BoxProp, Prop } from "./types";
import type { Rect } from "./placement";

/**
 * The park's walkway network.
 *
 * A graph of nodes and axis-aligned edges, turned into flat props: a sand
 * slab per edge, a stone junction pad per node, and stone edging down both
 * sides. Everything here is data, so the tools can walk the same routes the
 * player sees and the placement map can reserve the ground before berms,
 * hedges and tree lines are dropped on it.
 *
 * Heights are the thing to be careful with. Flat surfaces that share a top
 * face z-fight (park.ts has a TOP table for exactly this), and the checker
 * flags any pair within 1.2cm, so the three layers here are spaced wider than
 * that and clear of every band park.ts uses:
 *
 *   pad    0.060   under the slabs, so a junction never z-fights its arms
 *   slab   0.095   just under 0.1: tools that ask "is anything solid here"
 *                  (tools/carnival.ts) use 0.1 as the cutoff for a surface
 *   edging 0.140   0.28m wide and non-colliding, so it is never a wall
 *
 * Emmett's trike can climb 0.12 (tools/emmett-base.ts), so nothing walkable
 * here is taller than that: he can ride across any path in the park.
 *
 * Edges never overlap each other. Each one is trimmed to end 0.3m inside its
 * node's pad, and the pad is always wider than the arms meeting it, so the
 * only overlap anywhere is slab-over-pad, which is 3.5cm apart.
 */

export const PAD_TOP = 0.06;
export const PATH_TOP = 0.095;
export const EDGE_TOP = 0.14;

export const PATH_COLOR = "#d8c49a";
export const PAD_COLOR = "#cfc6b4";
export const EDGE_COLOR = "#9a948a";

const EDGE_W = 0.28;
/** How far a slab reaches past a pad's edge into the pad. */
const TRIM = 0.3;

export type NodeDef = {
  x: number;
  z: number;
  /** Pad size; false for a plain end (a zone entrance or a stub). */
  pad?: number | false;
};

export type EdgeDef = { a: string; b: string; w: number };

/**
 * Nodes. North is -z, east is +x. Names are the place each one serves.
 *
 * The inner park is a crossroads (J0) at the north edge of the arrival plaza,
 * with the main roads running west, east and north from it and the carnival
 * midway running south through the plaza.
 */
export const NODES: Record<string, NodeDef> = {
  // ---- the plaza and the crossroads at its north edge --------------------
  J0: { x: 0, z: 2.4, pad: 5.0 },
  PLZ: { x: 0, z: 22.5, pad: false },

  // ---- west road, out of the west gate -----------------------------------
  /** the kite field's own turning off the west road (places.ts) */
  KITEJ: { x: -23, z: 3.5, pad: 4.2 },
  KITE: { x: -23, z: 8.4, pad: false },
  MAZEJ: { x: -42, z: 3.5, pad: 4.2 },
  MAZE: { x: -42, z: 1.0, pad: false },
  PW: { x: -91, z: 3.5, pad: 5.0 },
  TH: { x: -102.5, z: 3.0, pad: 6.0 },
  PLAY: { x: -91, z: -17.5, pad: false },
  SPLASH: { x: -91, z: 17.5, pad: false },

  // ---- east road, out of the east gate -----------------------------------
  SANDJ: { x: 32, z: 2.9, pad: 4.4 },
  SAND: { x: 32, z: 9.4, pad: false },
  TENJ: { x: 76, z: 2.9, pad: 4.4 },
  TEN2: { x: 76, z: 18, pad: 4.2 },
  TEN: { x: 81.5, z: 18, pad: false },
  BBJ: { x: 90, z: 2.9, pad: 4.4 },
  BB: { x: 90, z: -20.5, pad: false },
  // the east spine, from the soccer pitch down to the campground
  SPJ: { x: 114, z: 2.9, pad: 5.2 },
  PITCH: { x: 114, z: -44, pad: false },
  PAVJ: { x: 114, z: 60, pad: 4.8 },
  PAV: { x: 124.5, z: 60, pad: false },
  PICJ: { x: 114, z: 72, pad: 4.8 },
  PIC: { x: 101.5, z: 72, pad: false },
  CAMP: { x: 114, z: 116, pad: false },

  // ---- north road, round the pond and out of the north gate --------------
  /** the duck pond's jetty, off the north road (places.ts) */
  DUCKJ: { x: 0, z: -15, pad: 4.2 },
  DUCK: { x: 6.2, z: -15, pad: false },
  POND: { x: 0, z: -26, pad: 5.2 },
  DOCK: { x: 2.4, z: -32.3, pad: false },
  PWEST: { x: -16, z: -26, pad: 4.8 },
  PNW: { x: -16, z: -64, pad: 4.8 },
  PGN: { x: 0, z: -64, pad: 4.8 },
  PN: { x: 0, z: -73, pad: 5.2 },
  BW: { x: -24, z: -73, pad: 4.8 },
  BE: { x: 24, z: -73, pad: 4.8 },
  NW2: { x: -24, z: -110.8, pad: 4.8 },
  NE2: { x: 24, z: -110.8, pad: 4.8 },
  FARMJ: { x: -60, z: -110.8, pad: 4.8 },
  FARM: { x: -60, z: -115.5, pad: false },
  /** the zoo's entrance arch, which faces +z (zoo.ts) */
  ZOOJ: { x: -15, z: -110.8, pad: 4.4 },
  ZOO: { x: -15, z: -124.6, pad: false },
  GOLF: { x: 24, z: -119.5, pad: false },
  CAVEJ: { x: 71.5, z: -110.8, pad: 4.0 },
  /** stub at the mountain's mouth, for the lookout going in on top */
  CAVE: { x: 71.5, z: -112.6, pad: false },

  // ---- the carnival midway, south from the plaza -------------------------
  /** the flower garden's arch, off the midway (places.ts) */
  GARDJ: { x: 0, z: 31, pad: 4.0 },
  GARD: { x: 4.6, z: 31, pad: false },
  J1: { x: 0, z: 40, pad: 5.6 },
  CARN: { x: -16, z: 40, pad: 5.0 },
  CGATE: { x: -16, z: 46, pad: false },
  CWJ: { x: -26.5, z: 40, pad: 4.2 },
  /** the fairground green, across the walkway from the carousel (places.ts) */
  FGJ: { x: -26.5, z: 51, pad: 3.6 },
  FG: { x: -31.4, z: 51, pad: false },
  // the strip in front of the booth counters: it has to thread between the
  // carousel fence (z 59.47) and the counters (z 63.0)
  BOOTHW: { x: -26.5, z: 61.3, pad: 3.2 },
  BOOTHE: { x: -4, z: 61.3, pad: false },
  FWJ: { x: 19, z: 40, pad: 5.0 },
  FW2: { x: 19, z: 66, pad: 4.6 },
  FW3: { x: 33, z: 66, pad: false },

  // ---- the south street, the houses, the pool and the ninja course -------
  SS: { x: 0, z: 99, pad: 5.6 },
  POOLJ: { x: -36, z: 99, pad: 4.6 },
  POOL: { x: -36, z: 124.5, pad: false },
  SSE: { x: 36, z: 99, pad: false },
  GYM: { x: 0, z: 126.5, pad: false },
};

const MAIN = 3.6;
const ROAD = 3.2;
const MIDWAY = 4.4;
const SPUR = 2.6;

export const EDGES: EdgeDef[] = [
  // west road
  { a: "J0", b: "KITEJ", w: MAIN },
  { a: "KITEJ", b: "KITE", w: SPUR },
  { a: "KITEJ", b: "MAZEJ", w: MAIN },
  { a: "MAZEJ", b: "MAZE", w: SPUR },
  { a: "MAZEJ", b: "PW", w: MAIN },
  { a: "PW", b: "TH", w: ROAD },
  { a: "PW", b: "PLAY", w: ROAD },
  { a: "PW", b: "SPLASH", w: ROAD },
  // east road
  { a: "J0", b: "SANDJ", w: ROAD },
  { a: "SANDJ", b: "SAND", w: SPUR },
  { a: "SANDJ", b: "TENJ", w: ROAD },
  { a: "TENJ", b: "TEN2", w: SPUR },
  { a: "TEN2", b: "TEN", w: SPUR },
  { a: "TENJ", b: "BBJ", w: ROAD },
  { a: "BBJ", b: "BB", w: SPUR },
  { a: "BBJ", b: "SPJ", w: ROAD },
  // east spine
  { a: "SPJ", b: "PITCH", w: MAIN },
  { a: "SPJ", b: "PAVJ", w: MAIN },
  { a: "PAVJ", b: "PAV", w: SPUR },
  { a: "PAVJ", b: "PICJ", w: MAIN },
  { a: "PICJ", b: "PIC", w: SPUR },
  { a: "PICJ", b: "CAMP", w: MAIN },
  // north road
  { a: "J0", b: "DUCKJ", w: MAIN },
  { a: "DUCKJ", b: "DUCK", w: SPUR },
  { a: "DUCKJ", b: "POND", w: MAIN },
  { a: "POND", b: "DOCK", w: SPUR },
  { a: "POND", b: "PWEST", w: ROAD },
  { a: "PWEST", b: "PNW", w: ROAD },
  { a: "PNW", b: "PGN", w: ROAD },
  { a: "PGN", b: "PN", w: MAIN },
  { a: "PN", b: "BW", w: ROAD },
  { a: "PN", b: "BE", w: ROAD },
  { a: "BW", b: "NW2", w: ROAD },
  { a: "BE", b: "NE2", w: ROAD },
  { a: "NW2", b: "FARMJ", w: ROAD },
  { a: "FARMJ", b: "FARM", w: SPUR },
  { a: "NW2", b: "ZOOJ", w: ROAD },
  { a: "ZOOJ", b: "ZOO", w: ROAD },
  { a: "NE2", b: "GOLF", w: SPUR },
  { a: "NE2", b: "CAVEJ", w: ROAD },
  { a: "CAVEJ", b: "CAVE", w: SPUR },
  // the midway
  { a: "PLZ", b: "GARDJ", w: MIDWAY },
  { a: "GARDJ", b: "GARD", w: SPUR },
  { a: "GARDJ", b: "J1", w: MIDWAY },
  { a: "J1", b: "CARN", w: MAIN },
  { a: "CARN", b: "CGATE", w: ROAD },
  { a: "CARN", b: "CWJ", w: SPUR },
  { a: "CWJ", b: "FGJ", w: SPUR },
  { a: "FGJ", b: "FG", w: SPUR },
  { a: "FGJ", b: "BOOTHW", w: SPUR },
  { a: "BOOTHW", b: "BOOTHE", w: 2.4 },
  { a: "J1", b: "FWJ", w: MAIN },
  { a: "FWJ", b: "FW2", w: ROAD },
  { a: "FW2", b: "FW3", w: ROAD },
  { a: "J1", b: "SS", w: MIDWAY },
  // the south street
  { a: "SS", b: "POOLJ", w: ROAD },
  { a: "POOLJ", b: "POOL", w: SPUR },
  { a: "SS", b: "SSE", w: ROAD },
  { a: "SS", b: "GYM", w: SPUR },
];

function node(id: string): NodeDef {
  const n = NODES[id];
  if (!n) throw new Error(`walkways: unknown node ${id}`);
  return n;
}

/** Pad size for a node: what the author asked for, or wide enough for its arms. */
export function padSize(id: string): number {
  const n = node(id);
  if (n.pad === false) return 0;
  if (typeof n.pad === "number") return n.pad;
  let w = 0;
  for (const e of EDGES) if (e.a === id || e.b === id) w = Math.max(w, e.w);
  return w + 1.6;
}

export function padRect(id: string): Rect | null {
  const s = padSize(id);
  if (!s) return null;
  const n = node(id);
  return { minX: n.x - s / 2, maxX: n.x + s / 2, minZ: n.z - s / 2, maxZ: n.z + s / 2 };
}

/** The slab for one edge, trimmed to stop 0.3m inside each pad. */
export function edgeRect(e: EdgeDef): Rect {
  const A = node(e.a);
  const B = node(e.b);
  const ta = Math.max(0, padSize(e.a) / 2 - TRIM);
  const tb = Math.max(0, padSize(e.b) / 2 - TRIM);
  // A small offset between two nodes is a dog-leg absorbed inside the wider
  // node's pad: the run takes the tighter node's line and the pad hides the
  // kink. Anything bigger than that would be a diagonal, which this network
  // does not do (colliders are axis-aligned and a diagonal slab would lie).
  const kink = 2.6;
  const line = (a: number, b: number) => (padSize(e.a) <= padSize(e.b) ? a : b);
  if (Math.abs(A.z - B.z) < kink && Math.abs(A.x - B.x) >= kink) {
    const x1 = Math.min(A.x, B.x);
    const x2 = Math.max(A.x, B.x);
    const [ca, cb] = A.x < B.x ? [ta, tb] : [tb, ta];
    const z = line(A.z, B.z);
    return { minX: x1 + ca, maxX: x2 - cb, minZ: z - e.w / 2, maxZ: z + e.w / 2 };
  }
  if (Math.abs(A.x - B.x) < kink) {
    const z1 = Math.min(A.z, B.z);
    const z2 = Math.max(A.z, B.z);
    const [ca, cb] = A.z < B.z ? [ta, tb] : [tb, ta];
    const x = line(A.x, B.x);
    return { minX: x - e.w / 2, maxX: x + e.w / 2, minZ: z1 + ca, maxZ: z2 - cb };
  }
  throw new Error(`walkways: ${e.a}-${e.b} is not axis aligned`);
}

function slab(r: Rect, top: number, color: string): BoxProp {
  // deep enough that the bottom face is always buried in the ground (y -0.02)
  const h = top + 0.1;
  return {
    kind: "box",
    pos: [(r.minX + r.maxX) / 2, top - h / 2, (r.minZ + r.maxZ) / 2],
    size: [r.maxX - r.minX, h, r.maxZ - r.minZ],
    color,
    collide: false,
  };
}

type Span = [number, number];

/** Cut every [from, to] out of a span; used to keep edging out of junctions. */
function subtract(span: Span, cuts: Span[]): Span[] {
  let out: Span[] = [span];
  for (const [c0, c1] of cuts) {
    const next: Span[] = [];
    for (const [s0, s1] of out) {
      if (c1 <= s0 || c0 >= s1) {
        next.push([s0, s1]);
        continue;
      }
      if (c0 > s0) next.push([s0, c0]);
      if (c1 < s1) next.push([c1, s1]);
    }
    out = next;
  }
  return out.filter(([a, b]) => b - a > 0.6);
}

const overlaps = (a: Rect, b: Rect) =>
  a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;

/**
 * Every walkway prop: junction pads first (lowest), then the slabs, then the
 * edging strips down each side and round the open sides of each pad.
 */
export function walkwayProps(): Prop[] {
  const out: Prop[] = [];
  const pads: Rect[] = [];
  for (const id of Object.keys(NODES)) {
    const r = padRect(id);
    if (!r) continue;
    pads.push(r);
    out.push(slab(r, PAD_TOP, PAD_COLOR));
  }
  const slabs = EDGES.map(edgeRect);
  for (const r of slabs) out.push(slab(r, PATH_TOP, PATH_COLOR));

  // edging: a strip down each side of every slab, cut where a pad or another
  // slab is in the way, so nothing ever crosses a junction
  EDGES.forEach((e, i) => {
    const r = slabs[i]!;
    const alongX = r.maxX - r.minX > r.maxZ - r.minZ;
    for (const s of [-1, 1]) {
      const strip: Rect = alongX
        ? {
            minX: r.minX,
            maxX: r.maxX,
            minZ: s < 0 ? r.minZ - EDGE_W : r.maxZ,
            maxZ: s < 0 ? r.minZ : r.maxZ + EDGE_W,
          }
        : {
            minX: s < 0 ? r.minX - EDGE_W : r.maxX,
            maxX: s < 0 ? r.minX : r.maxX + EDGE_W,
            minZ: r.minZ,
            maxZ: r.maxZ,
          };
      const cuts: Span[] = [];
      for (const other of [...pads, ...slabs]) {
        if (other === r || !overlaps(strip, other)) continue;
        cuts.push(alongX ? [other.minX, other.maxX] : [other.minZ, other.maxZ]);
      }
      const span: Span = alongX ? [strip.minX, strip.maxX] : [strip.minZ, strip.maxZ];
      for (const [a, b] of subtract(span, cuts)) {
        out.push(
          slab(
            alongX
              ? { ...strip, minX: a, maxX: b }
              : { ...strip, minZ: a, maxZ: b },
            EDGE_TOP,
            EDGE_COLOR,
          ),
        );
      }
    }
  });

  // edging round each pad, split around the arms that leave it
  for (const id of Object.keys(NODES)) {
    const r = padRect(id);
    if (!r) continue;
    const n = node(id);
    const arms = EDGES.filter((e) => e.a === id || e.b === id);
    const sides: { minX: number; maxX: number; minZ: number; maxZ: number; axis: "x" | "z" }[] = [
      { minX: r.minX - EDGE_W, maxX: r.maxX + EDGE_W, minZ: r.minZ - EDGE_W, maxZ: r.minZ, axis: "x" },
      { minX: r.minX - EDGE_W, maxX: r.maxX + EDGE_W, minZ: r.maxZ, maxZ: r.maxZ + EDGE_W, axis: "x" },
      { minX: r.minX - EDGE_W, maxX: r.minX, minZ: r.minZ, maxZ: r.maxZ, axis: "z" },
      { minX: r.maxX, maxX: r.maxX + EDGE_W, minZ: r.minZ, maxZ: r.maxZ, axis: "z" },
    ];
    for (const side of sides) {
      const cuts: Span[] = [];
      for (const e of arms) {
        const other = node(e.a === id ? e.b : e.a);
        const dx = other.x - n.x;
        const dz = other.z - n.z;
        const half = e.w / 2 + EDGE_W + 0.15;
        if (side.axis === "x") {
          // an arm leaving north or south cuts the north or south edging
          if ((dz < 0 && side.maxZ <= r.minZ + 0.001) || (dz > 0 && side.minZ >= r.maxZ - 0.001)) {
            cuts.push([n.x - half, n.x + half]);
          }
        } else if ((dx < 0 && side.maxX <= r.minX + 0.001) || (dx > 0 && side.minX >= r.maxX - 0.001)) {
          cuts.push([n.z - half, n.z + half]);
        }
      }
      const span: Span = side.axis === "x" ? [side.minX, side.maxX] : [side.minZ, side.maxZ];
      for (const [a, b] of subtract(span, cuts)) {
        out.push(
          slab(
            side.axis === "x"
              ? { minX: a, maxX: b, minZ: side.minZ, maxZ: side.maxZ }
              : { minX: side.minX, maxX: side.maxX, minZ: a, maxZ: b },
            EDGE_TOP,
            EDGE_COLOR,
          ),
        );
      }
    }
  }

  return out;
}

/**
 * The ground the walkways occupy, for the placement map: berms, hedges and
 * tree lines are kept off it. Slabs and pads only; the edging is inside the
 * padding anyway.
 */
export function walkwayRects(pad = 0): Rect[] {
  const out: Rect[] = [];
  for (const id of Object.keys(NODES)) {
    const r = padRect(id);
    if (r) out.push({ minX: r.minX - pad, maxX: r.maxX + pad, minZ: r.minZ - pad, maxZ: r.maxZ + pad });
  }
  for (const e of EDGES) {
    const r = edgeRect(e);
    out.push({ minX: r.minX - pad, maxX: r.maxX + pad, minZ: r.minZ - pad, maxZ: r.maxZ + pad });
  }
  return out;
}

/** Walkable points along the network, for tools that walk the whole park. */
export function routePoints(): { id: string; x: number; z: number }[] {
  return Object.keys(NODES).map((id) => ({ id, x: NODES[id]!.x, z: NODES[id]!.z }));
}
