import type { BoxProp, CylinderProp, ModelProp, Prop, WaterZone } from "./types";
import { riverPath } from "./candy-river";
import { TREE_IDS, bridgeFor, model } from "./sugar-models";
import { modelColliders } from "./models";

/**
 * Sugar Rush Park: the ground plan.
 *
 * This is the blockout — the river, the candy-cane path loop, the plaza and the
 * boundary — everything that decides where you can walk before any candy is
 * placed on top of it. The landmarks (forest, factory, mountain, village, maze,
 * meadow, fairground) hang off the region centres below, so moving a region
 * moves everything in it.
 *
 * Conventions are park 1's, because the checks are shared: north is -z, east is
 * +x, flat surfaces collide:false so she walks over them, anything with real
 * height collides, and flat slabs are stacked by the height of their top face so
 * two of them never z-fight.
 */

/* ------------------------------------------------------------- vocabulary */

export const SUGAR_BOUNDS = { minX: -160, maxX: 160, minZ: -160, maxZ: 160 };
/** The fence stands inside the bounds, so the flood-fill check has a sealed edge. */
const FENCE_AT = 157.5;

/** Flat surfaces, by the height of their visible top face (park 1's bands). */
const TOP = {
  lawn: 0.03,
  apron: 0.05,
  drive: 0.08,
  path: 0.1,
  court: 0.13,
  inner: 0.16,
  line: 0.19,
  mark: 0.22,
};

/**
 * The candy palette. The river brown has to be registered as a liquid in
 * colliders.ts or it becomes a chocolate-coloured wall.
 */
export const CANDY = {
  choc: "#6b4226",
  chocLight: "#8a5a34",
  /** the flowing surface of the river: liquid, never solid */
  chocRiver: "#6e3f1e",
  cane: "#e8384f",
  icing: "#f6f1e8",
  cream: "#f7ead3",
  pink: "#ff6aa8",
  blush: "#ff93c4",
  sun: "#ffc83a",
  mint: "#6fe3c4",
  lilac: "#b06aff",
  orange: "#ff8a3a",
  /** the paths: park 1's path colour, warmed up. Anything brighter blooms. */
  sugar: "#e9d7b6",
  /**
   * The stripe across a path. Blossom rather than pillar-box: at this scale the
   * saturated red read as hazard tape from the air, and the park is meant to
   * look sweet, not urgent. The plaza keeps the strong red, where it is an
   * accent rather than a hundred metres of it.
   */
  stripe: "#ff9ec8",
  licorice: "#2a2430",
  /**
   * Spearmint, not lawn. A candy park with an ordinary green field in it reads
   * as a fete on a village green; mint keeps the ground sweet and still lets
   * the gingerbread and the pink paths sit on top of it.
   */
  grass: "#8fe0cf",
  /** the deeper mint of a mown lawn, for the lawns inside the park */
  lawn: "#6fd4be",
} as const;

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

function cyl(x: number, y: number, z: number, r: number, h: number, color: string, collide = true): CylinderProp {
  return { kind: "cyl", pos: [x, y, z], r, h, color, collide };
}

/** Flat slab described by the height of its visible top face. */
function surf(
  x: number,
  top: number,
  z: number,
  sx: number,
  sz: number,
  color: string,
  h = 0.12,
  extra?: Partial<BoxProp>,
): BoxProp {
  return { kind: "box", pos: [x, top - h / 2, z], size: [sx, h, sz], color, collide: false, ...extra };
}

function disc(x: number, top: number, z: number, r: number, color: string, h = 0.12): CylinderProp {
  return { kind: "cyl", pos: [x, top - h / 2, z], r, h, color, collide: false };
}

/* ---------------------------------------------------------------- regions */

/** Where everything in the park lives. Move a centre and its region follows. */
export const SUGAR = {
  plaza: { x: 0, z: 20, r: 14 },
  spawn: [0, 0, 34] as [number, number, number],
  factory: { x: -18, z: -58 },
  mountain: { x: -112, z: -124 },
  forest: { x: -105, z: 15 },
  village: { x: 130, z: 10 },
  maze: { x: 80, z: -78 },
  meadow: { x: 74, z: 78 },
  marshmallow: { x: -30, z: 116 },
  fair: { x: -104, z: 104 },
  lake: { x: 130, z: 130, r: 15 },
  emmett: { x: 120, z: 45 },
} as const;

/* ------------------------------------------------------------ the river */

/**
 * The chocolate river, as a polyline from the mountain to the lake. Each run is
 * one rotated slab: rotated boxes keep their axis-aligned collider, which would
 * be wrong for anything solid, but the river is liquid and has no collider at
 * all, so a diagonal costs nothing here.
 */
export const RIVER: [number, number][] = [
  [-116, -134],
  [-64, -92],
  [-30, -58],
  [14, -58],
  [26, -16],
  [40, 40],
  [70, 100],
  [SUGAR.lake.x, SUGAR.lake.z],
];

export const RIVER_W = 9;
/**
 * The reach through the factory is narrower, because the factory's channel is
 * 5m wide: a river runs into a mill race, it does not knock the wall out. One
 * width per control point, so the narrowing eases in rather than stepping.
 */
export const RIVER_WIDTHS = [RIVER_W, RIVER_W, 4.6, 4.6, RIVER_W, RIVER_W, RIVER_W, RIVER_W];
/** Sugar banks sit a little proud of the water so the edge reads from a distance. */
const BANK_W = 1.6;

/**
 * The river as the game actually uses it: a curve through the control points,
 * sampled every couple of metres. Everything asks this rather than the control
 * points — where the water is, where a path has to be bridged, how far a
 * lollipop is from the bank — so the drawn river and the rules about it can
 * never disagree.
 */
export const RIVER_PATH = riverPath(RIVER, RIVER_WIDTHS);

/** The river is one mesh, not a chain of slabs. Slabs notched at every bend. */
export function riverProps(): Prop[] {
  return [model("choc-river", 0, 0)];
}

/**
 * Swimming zones down the river: circles along the curve, because that is the
 * only shape the water rule understands. `pool` keeps the pond dressing (rocks,
 * cattails, lily pads) off a river made of chocolate.
 */
export function riverWater(): WaterZone[] {
  const out: WaterZone[] = [];
  for (let i = 0; i < RIVER_PATH.length; i += 2) {
    const p = RIVER_PATH[i]!;
    out.push({ kind: "water", x: p.x, z: p.z, r: p.w / 2, pool: true });
  }
  out.push({ kind: "water", x: SUGAR.lake.x, z: SUGAR.lake.z, r: SUGAR.lake.r, pool: true });
  return out;
}

/** Every point where the river crosses a line of constant x (or constant z). */
export function riverCrossings(along: "x" | "z", at: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < RIVER_PATH.length; i++) {
    const p = RIVER_PATH[i]!;
    const q = RIVER_PATH[i + 1]!;
    const a = along === "x" ? p.x : p.z;
    const b = along === "x" ? q.x : q.z;
    if ((at - a) * (at - b) > 0) continue;
    const t = b === a ? 0 : (at - a) / (b - a);
    out.push([p.x + (q.x - p.x) * t, p.z + (q.z - p.z) * t]);
  }
  return out;
}

/** The river's direction and width at the sample nearest a point. */
export function riverAt(x: number, z: number) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < RIVER_PATH.length; i++) {
    const p = RIVER_PATH[i]!;
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  const p = RIVER_PATH[Math.max(1, best)]!;
  const q = RIVER_PATH[Math.max(1, best) - 1]!;
  const len = Math.hypot(p.x - q.x, p.z - q.z) || 1;
  return { w: p.w, dx: (p.x - q.x) / len, dz: (p.z - q.z) / len };
}

/* ------------------------------------------------------- the path loop */

export const LOOP = { x: 108, z: 108 };
export const PATH_W = 6;

/**
 * The candy-cane loop: a rounded rectangle round the park with spokes into the
 * plaza. It is what makes a 320m park walkable rather than a field — park 1
 * learned that the hard way — and it doubles as Emmett's preferred route.
 */
export function loopRects() {
  const { x, z } = LOOP;
  const h = PATH_W / 2;
  /*
   * Runs abut, they never overlap: two path slabs at the same height z-fight,
   * and the corner is the easiest place to get that wrong. The east-west runs
   * own the corners; everything else stops at their inner edge.
   */
  return [
    { minX: -x - h, maxX: x + h, minZ: -z - h, maxZ: -z + h },
    { minX: -x - h, maxX: x + h, minZ: z - h, maxZ: z + h },
    { minX: -x - h, maxX: -x + h, minZ: -z + h, maxZ: z - h },
    { minX: x - h, maxX: x + h, minZ: -z + h, maxZ: z - h },
    // the spokes: plaza to the loop, north/south/east/west
    { minX: -h, maxX: h, minZ: -z + h, maxZ: SUGAR.plaza.z - SUGAR.plaza.r },
    { minX: -h, maxX: h, minZ: SUGAR.plaza.z + SUGAR.plaza.r, maxZ: z - h },
    { minX: SUGAR.plaza.x + SUGAR.plaza.r, maxX: x - h, minZ: SUGAR.plaza.z - h, maxZ: SUGAR.plaza.z + h },
    { minX: -x + h, maxX: SUGAR.plaza.x - SUGAR.plaza.r, minZ: SUGAR.plaza.z - h, maxZ: SUGAR.plaza.z + h },
  ];
}

/**
 * Where a bridge stands, and how long it has to be. The river crosses the loop
 * at an angle, so the water under a path is wider than the river itself: a run
 * meeting it at 40 degrees needs half again the span.
 */
export function bridgeSites(): { x: number; z: number; along: "x" | "z"; span: number }[] {
  const out: { x: number; z: number; along: "x" | "z"; span: number }[] = [];
  for (const r of loopRects()) {
    const alongX = r.maxX - r.minX > r.maxZ - r.minZ;
    const at = alongX ? (r.minZ + r.maxZ) / 2 : (r.minX + r.maxX) / 2;
    for (const [cx, cz] of riverCrossings(alongX ? "z" : "x", at)) {
      const inside = alongX ? cx > r.minX && cx < r.maxX : cz > r.minZ && cz < r.maxZ;
      if (!inside) continue;
      const here = riverAt(cx, cz);
      // the water lying along the path: the river's width over the sine of the
      // angle between them, floored so a square crossing still gets a bridge
      const sin = Math.abs(alongX ? here.dz : here.dx);
      const water = here.w / Math.max(0.35, sin);
      out.push({ x: cx, z: cz, along: alongX ? "x" : "z", span: bridgeFor(water + 9).span });
    }
  }
  return out;
}

/** The candy-cane bridges themselves, turned to lie along their path. */
function bridgeProps(): Prop[] {
  return bridgeSites().map((b) =>
    // the model is built along +z, so a run along x is a quarter turn: one of
    // the angles that keeps a model's colliders exact
    model(bridgeFor(b.span).id, b.x, b.z, { ry: b.along === "x" ? Math.PI / 2 : 0 }),
  );
}

/** Path slabs, split wherever the river runs under them. */
function runProps(r: { minX: number; maxX: number; minZ: number; maxZ: number }): Prop[] {
  const out: Prop[] = [];
  const alongX = r.maxX - r.minX > r.maxZ - r.minZ;
  const at = alongX ? (r.minZ + r.maxZ) / 2 : (r.minX + r.maxX) / 2;
  const from = alongX ? r.minX : r.minZ;
  const to = alongX ? r.maxX : r.maxZ;
  const cuts = bridgeSites()
    .filter((b) => (alongX ? Math.abs(b.z - at) < 0.1 : Math.abs(b.x - at) < 0.1))
    .map((b) => ({ at: alongX ? b.x : b.z, span: b.span }))
    .filter((c) => c.at > from && c.at < to)
    .sort((a, b) => a.at - b.at);
  let start = from;
  const pieces: [number, number][] = [];
  for (const c of cuts) {
    if (c.at - c.span / 2 > start) pieces.push([start, c.at - c.span / 2]);
    start = c.at + c.span / 2;
  }
  if (to > start) pieces.push([start, to]);
  for (const [a, b] of pieces) {
    const mid = (a + b) / 2;
    const len = b - a;
    if (len < 0.5) continue;
    out.push(
      alongX
        ? surf(mid, TOP.path, at, len, PATH_W, CANDY.sugar)
        : surf(at, TOP.path, mid, PATH_W, len, CANDY.sugar),
    );
  }
  return out;
}

export function pathProps(): Prop[] {
  const out: Prop[] = [...bridgeProps()];
  for (const r of loopRects()) {
    out.push(...runProps(r));
    // candy-cane stripes: a red band every 4m. Cheap, and it is what makes the
    // loop read as a candy cane from the air and on the map.
    const w = r.maxX - r.minX;
    const d = r.maxZ - r.minZ;
    const alongX = w > d;
    const at = alongX ? (r.minZ + r.maxZ) / 2 : (r.minX + r.maxX) / 2;
    const from = alongX ? r.minX : r.minZ;
    const to = alongX ? r.maxX : r.maxZ;
    const cuts = bridgeSites().filter((b) => (alongX ? Math.abs(b.z - at) < 0.1 : Math.abs(b.x - at) < 0.1));
    for (let c = from + 2; c < to - 1; c += 4) {
      if (cuts.some((cut) => Math.abs(c - (alongX ? cut.x : cut.z)) < cut.span / 2 + 1)) continue;
      out.push(
        alongX
          ? surf(c, TOP.court, at, 1.2, PATH_W, CANDY.stripe, 0.08)
          : surf(at, TOP.court, c, PATH_W, 1.2, CANDY.stripe, 0.08),
      );
    }
  }
  return out;
}

/* ------------------------------------------------------------- the plaza */

/** Peppermint Plaza: where she arrives, and the one place every path leads to. */
export function plazaProps(): Prop[] {
  const { x, z, r } = SUGAR.plaza;
  const out: Prop[] = [];
  out.push(disc(x, TOP.apron, z, r + 1.5, CANDY.icing));
  out.push(disc(x, TOP.path, z, r, CANDY.cane));
  // A peppermint swirl: white bars over the red disc. They stop short of the
  // middle, because eight bars meeting at a point is eight surfaces fighting
  // over the same pixels; the white centre disc covers the join instead.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const at = r * 0.64;
    out.push(surf(x + Math.sin(a) * at, TOP.court, z + Math.cos(a) * at, 2.6, r * 0.62, CANDY.icing, 0.08, { ry: a }));
  }
  out.push(disc(x, TOP.line, z, 3.2, CANDY.icing));
  // a peppermint bollard at each corner of the ring, to stop it reading flat
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    out.push(cyl(x + Math.sin(a) * (r + 0.8), 0.55, z + Math.cos(a) * (r + 0.8), 0.5, 1.1, CANDY.cane));
    out.push(cyl(x + Math.sin(a) * (r + 0.8), 1.2, z + Math.cos(a) * (r + 0.8), 0.55, 0.2, CANDY.icing, false));
  }
  return out;
}

/* ---------------------------------------------------------- the boundary */

/**
 * The park's edge. Park 1 uses a stone wall; here it is a candy fence, but the
 * job is the same and the check is unforgiving: it has to be continuous, with no
 * gap anywhere, or the reachability flood-fill escapes and the park fails.
 */
export function boundaryProps(): Prop[] {
  const out: Prop[] = [];
  const h = 5.4;
  const t = 1.5;
  const span = FENCE_AT * 2;
  /*
   * Cream rather than chocolate. A six-metre chocolate wall ringed the park in
   * a dark band on every horizon, which is the first thing the eye found in a
   * park made of sweets; a pale wall with candy piers lets the sky meet the
   * ground instead.
   */
  for (const z of [-FENCE_AT, FENCE_AT]) {
    out.push(box(0, h / 2, z, span + t * 2, h, t, CANDY.cream));
    out.push(box(0, h + 0.25, z, span + t * 2, 0.5, t + 0.6, CANDY.blush, false));
  }
  for (const x of [-FENCE_AT, FENCE_AT]) {
    out.push(box(x, h / 2, 0, t, h, span + t * 2, CANDY.cream));
    out.push(box(x, h + 0.25, 0, t + 0.6, 0.5, span + t * 2, CANDY.blush, false));
  }
  // piers of stacked mints, and a gumdrop on each, so the wall has a rhythm
  for (let i = -15; i <= 15; i++) {
    const at = i * 10;
    for (const z of [-FENCE_AT, FENCE_AT]) {
      out.push(cyl(at, h * 0.5, z + (z < 0 ? 1.1 : -1.1), 0.7, h, CANDY.icing, false));
      out.push(cyl(at, h + 0.7, z + (z < 0 ? 1.1 : -1.1), 0.75, 0.5, CANDY.stripe, false));
    }
    for (const x of [-FENCE_AT, FENCE_AT]) {
      out.push(cyl(x + (x < 0 ? 1.1 : -1.1), h * 0.5, at, 0.7, h, CANDY.icing, false));
      out.push(cyl(x + (x < 0 ? 1.1 : -1.1), h + 0.7, at, 0.75, 0.5, CANDY.stripe, false));
    }
  }
  return out;
}

/* ------------------------------------------------------------- scatter */

/** Deterministic: the park has to be the same park every time she loads it. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const dist2 = (x: number, z: number, px: number, pz: number) => (x - px) ** 2 + (z - pz) ** 2;

/** Distance from a point to the middle of the river, along its whole length. */
export function riverDistance(x: number, z: number) {
  let best = Infinity;
  for (let i = 0; i + 1 < RIVER_PATH.length; i++) {
    const p = RIVER_PATH[i]!;
    const q = RIVER_PATH[i + 1]!;
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const len2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - p.x) * dx + (z - p.z) * dz) / len2));
    best = Math.min(best, Math.hypot(x - (p.x + dx * t), z - (p.z + dz * t)));
  }
  return Math.min(best, Math.hypot(x - SUGAR.lake.x, z - SUGAR.lake.z) - SUGAR.lake.r);
}

/**
 * Ground nothing may be planted on: the paths, the river and its banks, the
 * plaza, and a clear circle round every hidden candy so a lollipop tree never
 * grows through one.
 */
export function clearGround(x: number, z: number, pad: number, keepOut: [number, number][] = []) {
  for (const r of loopRects()) {
    if (x > r.minX - pad && x < r.maxX + pad && z > r.minZ - pad && z < r.maxZ + pad) return false;
  }
  if (riverDistance(x, z) < RIVER_W / 2 + BANK_W + pad) return false;
  if (dist2(x, z, SUGAR.plaza.x, SUGAR.plaza.z) < (SUGAR.plaza.r + 4 + pad) ** 2) return false;
  for (const [kx, kz] of keepOut) if (dist2(x, z, kx, kz) < (4 + pad) ** 2) return false;
  const edge = 152;
  return Math.abs(x) < edge && Math.abs(z) < edge;
}

/**
 * Scatter `count` things over a rectangle, skipping anything that lands on the
 * paths, the river or a candy. Rejection sampling rather than a grid, because a
 * grid of lollipops reads as an orchard, and this is meant to be a wood.
 */
function scatter(
  seed: number,
  area: { x: number; z: number; w: number; d: number },
  count: number,
  pad: number,
  keepOut: [number, number][],
  place: (x: number, z: number, rand: () => number) => Prop[],
) {
  const rand = rng(seed);
  const out: Prop[] = [];
  const taken: [number, number][] = [];
  for (let tries = 0; tries < count * 24 && out.length < count * 4; tries++) {
    const x = area.x + (rand() - 0.5) * area.w;
    const z = area.z + (rand() - 0.5) * area.d;
    if (!clearGround(x, z, pad, keepOut)) continue;
    if (taken.some(([tx, tz]) => dist2(x, z, tx, tz) < (pad * 2) ** 2)) continue;
    taken.push([x, z]);
    out.push(...place(x, z, rand));
    if (taken.length >= count) break;
  }
  return out;
}

/* ------------------------------------------------------------- regions */

/** The Lollipop Forest: this park's woods, and the princess's clearing. */
/**
 * The Lollipop Forest.
 *
 * A wood is not trees at even spacing and it is not trees at random: it is
 * copses with glades between them, thickest in the middle and thinning to an
 * edge you can see from outside, with a way through it. Scattering 170 trees
 * over the region gave a solid mat of lollipops with no way in and nothing to
 * look at, which is what "sprinkled everywhere" meant.
 *
 * So: a trail from the park's west path to the princess's clearing, copses set
 * either side of it, the biggest trees in the middle of each copse and the
 * smallest at the rim, an understorey only where a copse is, and glades left
 * genuinely empty. The clearing at the heart of it stays open for the quest.
 */
/** The wood's paths, in world coordinates: one in from the east, one north. */
export const FOREST_TRAIL: [number, number][] = [
  [SUGAR.forest.x + 38, SUGAR.forest.z + 4],
  [SUGAR.forest.x + 20, SUGAR.forest.z - 2],
  [SUGAR.forest.x + 6, SUGAR.forest.z + 6],
  [SUGAR.forest.x, SUGAR.forest.z],
];
export const FOREST_SPUR: [number, number][] = [
  [SUGAR.forest.x + 6, SUGAR.forest.z + 6],
  [SUGAR.forest.x + 3, SUGAR.forest.z - 12],
  [SUGAR.forest.x + 2, SUGAR.forest.z - 30],
];

export function forestProps(keepOut: [number, number][]): Prop[] {
  const out: Prop[] = [];
  const cx = SUGAR.forest.x;
  const cz = SUGAR.forest.z;
  const rand = rng(1207);

  // the trail in from the west path and the spur north, each one mesh
  const trail = FOREST_TRAIL;
  out.push(model("forest-trail", 0, 0));
  out.push(model("forest-spur", 0, 0));

  /**
   * Copse centres, laid out by hand rather than sampled: this is a small
   * enough number to decide, and deciding is the difference between a wood and
   * a scatter. Each is [x, z, radius, how many trees].
   */
  const copses: [number, number, number, number][] = [
    [cx - 24, cz - 34, 9, 9],
    [cx - 4, cz - 36, 7, 7],
    [cx + 16, cz - 26, 6, 6],
    [cx - 28, cz - 12, 8, 8],
    [cx - 12, cz - 16, 6, 6],
    [cx - 30, cz + 12, 9, 9],
    [cx - 10, cz + 18, 7, 7],
    [cx + 12, cz + 16, 6, 6],
    [cx - 24, cz + 34, 8, 8],
    [cx - 2, cz + 38, 7, 7],
    [cx + 16, cz + 34, 6, 5],
    [cx + 26, cz + 12, 5, 5],
  ];

  for (const [copseX, copseZ, r, n] of copses) {
    for (let i = 0; i < n; i++) {
      // biggest at the middle, smallest at the rim: a copse has a crown
      const t = i / Math.max(1, n - 1);
      const a = rand() * Math.PI * 2;
      const d = r * Math.sqrt(t) * (0.55 + rand() * 0.45);
      const x = copseX + Math.cos(a) * d;
      const z = copseZ + Math.sin(a) * d;
      if (!clearGround(x, z, 2, keepOut)) continue;
      if (onTrail(trail, x, z, 4) || onTrail(FOREST_SPUR, x, z, 4)) continue;
      /*
       * Size comes from where the tree stands in the copse, colour does not:
       * tying the two together made every big tree the same variety and the
       * wood came out in stripes of one colour.
       */
      const big = 1 - t;
      const v = Math.floor(rand() * TREE_IDS.length);
      out.push(model(TREE_IDS[v]!, x, z, { scale: (0.9 + big * 0.9) * (v === 3 ? 1.5 : 1), ry: rand() * Math.PI * 2 }));
    }
    // understorey, at the foot of the copse and nowhere else
    for (let i = 0; i < 2; i++) {
      const a = rand() * Math.PI * 2;
      const x = copseX + Math.cos(a) * r * 0.8;
      const z = copseZ + Math.sin(a) * r * 0.8;
      if (!clearGround(x, z, 1.5, keepOut) || onTrail(trail, x, z, 3)) continue;
      out.push(model(rand() < 0.5 ? "cotton-candy" : "rock-candy", x, z, { scale: 0.9 + rand() * 0.5 }));
      out.push(model("swirl-mint", x + 1.8, z + 1.2, { scale: 0.7 }));
    }
  }

  // sweets along the trail edge, at the bends where the eye goes anyway
  for (const [tx, tz] of [FOREST_TRAIL[1]!, FOREST_TRAIL[2]!, FOREST_SPUR[1]!]) {
    for (const side of [-1, 1]) {
      const x = tx + side * 3.4;
      const z = tz + side * 1.6;
      if (!clearGround(x, z, 1.2, keepOut)) continue;
      out.push(model("gumdrop", x, z, { scale: 1.2, variant: side > 0 ? 1 : 4 }));
      out.push(model("swirl-mint", x + side * 1.6, z - 1.4, { scale: 0.8 }));
    }
  }

  /** The clearing: a ring of the tallest trees, and a mint floor to mark it. */
  out.push(disc(cx, TOP.lawn, cz, 11, CANDY.lawn, 0.1));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const x = cx + Math.sin(a) * 13.5;
    const z = cz + Math.cos(a) * 13.5;
    if (!clearGround(x, z, 1.5, keepOut) || onTrail(trail, x, z, 3)) continue;
    out.push(model(TREE_IDS[2]!, x, z, { scale: 1.9 }));
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    out.push(model("swirl-mint", cx + Math.sin(a) * 7, cz + Math.cos(a) * 7, { scale: 0.9 }));
  }

  /**
   * The wood's edge: smaller trees and gumdrop shrubs round the outside, so
   * from the path it reads as a wood with an edge rather than trees petering
   * out into the lawn.
   */
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2;
    // the edge wanders in and out, because a wood that ends on a circle reads
    // as a hedge round a field
    const wobble = Math.sin(a * 3.1) * 5 + Math.sin(a * 1.7 + 2) * 4;
    const rx = 38 + wobble + rand() * 3;
    const rz = 46 + wobble + rand() * 3;
    const x = cx + Math.sin(a) * rx;
    const z = cz + Math.cos(a) * rz;
    if (!clearGround(x, z, 2, keepOut) || onTrail(trail, x, z, 4)) continue;
    if (rand() < 0.55) out.push(model(TREE_IDS[3]!, x, z, { scale: 0.8 + rand() * 0.4 }));
    else out.push(model("gumdrop", x, z, { scale: 1.1 + rand() * 0.8, variant: Math.floor(rand() * 6) }));
  }
  return out;
}

/** Within `pad` of any run of a trail. */
function onTrail(trail: [number, number][], x: number, z: number, pad: number) {
  for (let i = 0; i + 1 < trail.length; i++) {
    const [ax, az] = trail[i]!;
    const [bx, bz] = trail[i + 1]!;
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
    if (Math.hypot(x - (ax + dx * t), z - (az + dz * t)) < pad) return true;
  }
  return false;
}

/** Gumdrop Meadow: open ground with gumdrop hills of every size. */
export function meadowProps(keepOut: [number, number][]): Prop[] {
  return scatter(
    4411,
    { x: SUGAR.meadow.x, z: SUGAR.meadow.z, w: 72, d: 66 },
    70,
    3,
    keepOut,
    (x, z, rand) => {
      const big = rand();
      const scale = big < 0.2 ? 3 + rand() * 2 : big < 0.6 ? 1.4 + rand() * 1.2 : 0.7 + rand() * 0.5;
      const props: Prop[] = [
        model("gumdrop", x, z, { scale, ry: rand() * Math.PI * 2, variant: Math.floor(rand() * 6) }),
      ];
      if (rand() < 0.25) props.push(model("candy-corn", x + 2.4, z - 1.8, { scale: 0.7 + rand() * 0.6 }));
      if (rand() < 0.3) props.push(model("cotton-candy", x - 2.2, z + 2.2, { scale: 0.8 + rand() * 0.6 }));
      return props;
    },
  );
}

/** Marshmallow Fields: soft ground, and something to bounce on. */
export function marshmallowProps(keepOut: [number, number][]): Prop[] {
  const out: Prop[] = scatter(
    9021,
    { x: SUGAR.marshmallow.x, z: SUGAR.marshmallow.z, w: 64, d: 48 },
    46,
    3.2,
    keepOut,
    (x, z, rand) => [model("marshmallow", x, z, { scale: 0.7 + rand() * 1.1, ry: rand() * Math.PI * 2 })],
  );
  // two real trampolines, because a field that looks bouncy and is not is a lie
  for (const [tx, tz] of [
    [SUGAR.marshmallow.x - 10, SUGAR.marshmallow.z - 6],
    [SUGAR.marshmallow.x + 11, SUGAR.marshmallow.z + 5],
  ] as [number, number][]) {
    out.push({ kind: "trampoline", x: tx, z: tz, w: 6, d: 6, pad: CANDY.stripe, mat: "#ffd9ea", leg: CANDY.icing });
  }
  return out;
}

/**
 * The Licorice Maze: a grid maze of hedge walls. Corridors are 4m so a trike
 * could follow her in, and the whole thing is small enough to solve by looking,
 * because this is a seven-year-old's maze and the one in park 1 is the hard one.
 */
/**
 * Six cells, not seven: at seven the maze reached the loop's north run and the
 * path ran inside the hedges, which the signs agent's placement checks caught.
 */
export const MAZE = { cell: 8, n: 6 };

/** The middle of maze cell (i, j), which is where a candy can safely hide. */
export function mazeCell(i: number, j: number): [number, number] {
  const { cell, n } = MAZE;
  return [SUGAR.maze.x - (n * cell) / 2 + i * cell + cell / 2, SUGAR.maze.z - (n * cell) / 2 + j * cell + cell / 2];
}

export function mazeProps(): Prop[] {
  const { cell: CELL, n: N } = MAZE;
  const ox = SUGAR.maze.x - (N * CELL) / 2;
  const oz = SUGAR.maze.z - (N * CELL) / 2;
  const rand = rng(777);

  /*
   * A carved maze, not a random sprinkle of walls. Randomly walling half the
   * edges sealed cells off, and the candy inside the maze was unreachable — the
   * reachability check caught it. This digs from one cell to the next until
   * every cell has been visited, so every cell is connected by construction,
   * then knocks a few more walls out so there is more than one way through and
   * fewer dead ends to trap a small child in.
   */
  const right = Array.from({ length: N }, () => new Array<boolean>(N).fill(true));
  const down = Array.from({ length: N }, () => new Array<boolean>(N).fill(true));
  const seen = Array.from({ length: N }, () => new Array<boolean>(N).fill(false));
  const stack: [number, number][] = [[0, 0]];
  seen[0]![0] = true;
  while (stack.length) {
    const [i, j] = stack[stack.length - 1]!;
    const options: [number, number][] = [];
    if (i + 1 < N && !seen[i + 1]![j]) options.push([i + 1, j]);
    if (i - 1 >= 0 && !seen[i - 1]![j]) options.push([i - 1, j]);
    if (j + 1 < N && !seen[i]![j + 1]) options.push([i, j + 1]);
    if (j - 1 >= 0 && !seen[i]![j - 1]) options.push([i, j - 1]);
    if (!options.length) {
      stack.pop();
      continue;
    }
    const [ni, nj] = options[Math.floor(rand() * options.length)]!;
    if (ni > i) right[i]![j] = false;
    else if (ni < i) right[ni]![j] = false;
    else if (nj > j) down[i]![j] = false;
    else down[i]![nj] = false;
    seen[ni]![nj] = true;
    stack.push([ni, nj]);
  }
  for (let k = 0; k < 10; k++) {
    const i = Math.floor(rand() * N);
    const j = Math.floor(rand() * N);
    if (rand() < 0.5) right[i]![j] = false;
    else down[i]![j] = false;
  }

  const out: Prop[] = [];
  const wall = (x: number, z: number, len: number, along: "x" | "z") =>
    out.push(model(`licorice-hedge${len}`, x, z, { ry: along === "x" ? 0 : Math.PI / 2 }));
  // the way in from the west, where the path comes from, and out to the south
  for (let i = 0; i < N; i++) {
    if (i !== 5) wall(ox + i * CELL + CELL / 2, oz, CELL, "x");
    if (i !== 1) wall(ox + i * CELL + CELL / 2, oz + N * CELL, CELL, "x");
    if (i !== 3) wall(ox, oz + i * CELL + CELL / 2, CELL, "z");
    wall(ox + N * CELL, oz + i * CELL + CELL / 2, CELL, "z");
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (i + 1 < N && right[i]![j]) wall(ox + (i + 1) * CELL, oz + j * CELL + CELL / 2, CELL, "z");
      if (j + 1 < N && down[i]![j]) wall(ox + i * CELL + CELL / 2, oz + (j + 1) * CELL, CELL, "x");
    }
  }
  return out;
}

/** Candy-cane arches where the paths reach the plaza, so it feels like arriving. */
export function plazaArches(): Prop[] {
  const { x, z, r } = SUGAR.plaza;
  const at = r + 3;
  return [
    model("cane-arch", x, z - at, { scale: 1.6 }),
    model("cane-arch", x, z + at, { scale: 1.6 }),
    model("cane-arch", x + at, z, { ry: Math.PI / 2, scale: 1.6 }),
    model("cane-arch", x - at, z, { ry: Math.PI / 2, scale: 1.6 }),
  ];
}

/* ----------------------------------------------------- the landmarks */

/**
 * The candy factory, straddling the river.
 *
 * It is turned a quarter so its channel runs along the river's straight reach:
 * a quarter turn keeps a model's colliders exact, and the reach was made
 * straight for exactly this reason. The river narrows to fit the channel.
 */
export function factoryProps(): Prop[] {
  const { x, z } = SUGAR.factory;
  return [
    model("candy-factory", x, z, { ry: Math.PI / 2 }),
    model("choc-fountain", x - 16, z + 11),
    model("gumball-machine", x + 15, z + 12, { scale: 1.4 }),
  ];
}

/**
 * Ice Cream Mountain. The way up starts on its +z side and climbs anticlockwise
 * to a deck at 8.4m, which is the highest ground in the park and the place to
 * send anyone who wants to see all of it.
 */
export function mountainProps(): Prop[] {
  const { x, z } = SUGAR.mountain;
  return [
    model("ice-cream-mountain", x, z),
    // sweets at the foot, so the walk up starts somewhere rather than nowhere
    model("cotton-candy", x + 12, z + 6, { scale: 1.3 }),
    model("rock-candy", x - 13, z + 3, { scale: 1.4 }),
    model("cane-post", x + 9, z + 13),
    model("cane-post", x - 9, z + 13),
  ];
}

/** Where the mountain's deck is, for anything that wants to stand on top. */
export const MOUNTAIN_DECK = { x: SUGAR.mountain.x, z: SUGAR.mountain.z, y: 8.4 };

/**
 * Gingerbread Village: houses round a square, with the shop on it. Her own
 * gingerbread house takes the plot on the square's north side later.
 */
export function villageProps(): Prop[] {
  const { x, z } = SUGAR.village;
  const out: Prop[] = [];
  // a square of icing paving, so the village has a middle
  out.push(surf(x, TOP.path, z, 22, 22, CANDY.cream));
  out.push(disc(x, TOP.court, z, 4.5, CANDY.blush, 0.08));
  const houses: [number, number, number, number][] = [
    // x, z, turn, which house
    [x - 14, z - 10, 0, 0],
    [x + 14, z - 10, 0, 1],
    [x - 14, z + 10, Math.PI, 2],
    [x + 14, z + 10, Math.PI, 0],
  ];
  for (const [hx, hz, ry, v] of houses) out.push(model(`gingerbread${v}`, hx, hz, { ry }));
  /*
   * The head of the square is left empty: that is her plot. Her own house is
   * built by the runtime rather than placed here, because it changes as she
   * upgrades it (sugar-home.ts), so all the village lays out is the ground it
   * stands on — a path from the square to her gate, and a lawn under it.
   */
  out.push(surf(x, TOP.lawn, z - 18, 26, 18, CANDY.lawn));
  out.push(surf(x, TOP.drive, z - 6.5, 4, 12, CANDY.sugar));
  out.push(model("candy-stall", x - 7, z + 4, { variant: 0 }));
  out.push(model("candy-stall", x + 7, z + 4, { variant: 1, ry: Math.PI }));
  // at the south end of the square: the middle of it is the way to her door
  out.push(model("gumball-machine", x, z + 8, { scale: 1.2 }));
  out.push(model("cane-post", x - 10, z - 1));
  out.push(model("cane-post", x + 10, z - 1));
  return out;
}

/**
 * The fairground. The gumdrop wheel is the level's `ride`, so it is built by
 * the world rather than here; this is everything standing round it.
 */
export function fairProps(): Prop[] {
  const { x, z } = SUGAR.fair;
  const out: Prop[] = [];
  out.push(surf(x, TOP.apron, z, 56, 44, CANDY.cream, 0.1));
  // a lilac ring under the wheel, kept clear of the loop: two flat surfaces at
  // the same height are the one thing that flickers
  out.push(disc(x + 6, TOP.path, z - 10, 6.5, CANDY.lilac, 0.08));
  for (let i = 0; i < 4; i++) {
    out.push(model("candy-stall", x - 18 + i * 12, z + 16, { variant: i }));
  }
  out.push(model("cane-arch", x, z + 22, { scale: 2 }));
  out.push(model("gumball-machine", x - 24, z + 6, { scale: 1.6 }));
  return out;
}

/** Where the gumdrop wheel stands. The level hands this to `ride`. */
export const WHEEL = { x: SUGAR.fair.x + 6, z: SUGAR.fair.z - 10 };

/**
 * Frosting: wide, soft patches of a slightly different mint, spaced so they
 * never touch. Without the blades of grass the ground is one flat colour, and
 * a park you cross in a minute needs the ground to change under you.
 */
export function frostingProps(keepOut: [number, number][], already: Prop[]): Prop[] {
  /*
   * Every other flat thing in the park — aprons, lawns, squares, the garden's
   * beds — sits at the same height as these patches, and two flat surfaces at
   * one height flicker. So a patch is only laid where the ground is genuinely
   * bare: this walks what has already been placed and keeps clear of it.
   */
  const flats: { x: number; z: number; hw: number; hd: number }[] = [];
  for (const p of already) {
    if (p.kind === "box" && p.size[1] <= 0.3) {
      const rot = (p.ry ?? 0) !== 0;
      const w = rot ? Math.max(p.size[0], p.size[2]) : p.size[0];
      const d = rot ? Math.max(p.size[0], p.size[2]) : p.size[2];
      flats.push({ x: p.pos[0], z: p.pos[2], hw: w / 2, hd: d / 2 });
    } else if (p.kind === "cyl" && p.h <= 0.3) {
      flats.push({ x: p.pos[0], z: p.pos[2], hw: p.r, hd: p.r });
    }
  }

  const out: Prop[] = [];
  const rand = rng(8899);
  const taken: [number, number, number][] = [];
  // barely different from the ground: at full contrast they read as puddles
  const shades = ["#95e3d5", "#89dcc9", "#9ae6d9"];
  for (let tries = 0; tries < 2500 && taken.length < 40; tries++) {
    const x = (rand() - 0.5) * 290;
    const z = (rand() - 0.5) * 290;
    const r = 6 + rand() * 11;
    if (!clearGround(x, z, r + 2, keepOut)) continue;
    if (taken.some(([tx, tz, tr]) => dist2(x, z, tx, tz) < (r + tr + 4) ** 2)) continue;
    if (flats.some((f) => Math.abs(f.x - x) < f.hw + r + 1 && Math.abs(f.z - z) < f.hd + r + 1)) continue;
    taken.push([x, z, r]);
    out.push(disc(x, TOP.lawn, z, r, shades[Math.floor(rand() * shades.length)]!, 0.1));
  }
  return out;
}

/**
 * Where the cotton candy sits: the speed boosts.
 *
 * Park 1's rule is that every landmark has one within 50m, and no two are
 * closer than 18m, so they are worth going out of your way for without being
 * everywhere. These are picked near the paths — a boost she never finds is a
 * boost that does not exist — and the spacing is checked here rather than
 * hoped for.
 */
/**
 * Where the princess's three creatures are stuck (candy-creatures.ts). Kept
 * here rather than there because the park's planting has to know about them
 * before anything else is built, and nothing in this file may import the
 * things that import it.
 *
 *   the jellybean puppy   up a lollipop tree in the forest
 *   the marshmallow bunny out in the bog in Marshmallow Fields
 *   the gummy bear        set in a toffee puddle on Gumdrop Meadow
 */
export const CREATURE_SPOTS: [number, number][] = [
  [-118, 34],
  [-8, 120],
  [96, 96],
];

/**
 * Ground the park must leave bare because something is built on it at runtime
 * — the creatures' predicaments, and the two fairground games that lay out a
 * box and a floor of their own.
 *
 * `clearGround` keeps 4m plus its pad from each point, which is not enough on
 * its own for anything wider than that, so a wide thing is written down as a
 * centre and a ring: five points make a circle the planting stays out of. A
 * lollipop growing through the middle of the gummy box is the sort of thing
 * that only shows up in a photograph.
 */
function ringOf(x: number, z: number, r: number): [number, number][] {
  const out: [number, number][] = [[x, z]];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    out.push([x + Math.cos(a) * r, z + Math.sin(a) * r]);
  }
  return out;
}

export const NO_PLANT: [number, number][] = [
  ...CREATURE_SPOTS,
  // whack-a-gummy's chocolate box, on the fairground's east side
  ...ringOf(SUGAR.fair.x + 8, SUGAR.fair.z + 3.75, 4.6),
];

export function boostSpots(
  keepOut: [number, number][],
  already: Prop[] = [],
  noGo: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [],
): [number, number][] {
  const out: [number, number][] = [];
  const rand = rng(6161);
  const nearAPath = (x: number, z: number) =>
    loopRects().some(
      (r) => x > r.minX - 14 && x < r.maxX + 14 && z > r.minZ - 14 && z < r.maxZ + 14,
    );
  /*
   * clearGround knows about the paths, the river and the candies, but not
   * about the hundreds of things already standing in the park — and a boost
   * she cannot reach because it is inside a gingerbread house is worse than
   * no boost at all. So the solids that are already placed are walked here.
   */
  const solids: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
  for (const p of already) {
    if (p.kind === "model") {
      for (const b of modelColliders(p)) if (b.maxY > 0.5) solids.push(b);
    } else if (p.kind === "box" && p.collide !== false && p.size[1] > 0.5) {
      solids.push({
        minX: p.pos[0] - p.size[0] / 2,
        maxX: p.pos[0] + p.size[0] / 2,
        minZ: p.pos[2] - p.size[2] / 2,
        maxZ: p.pos[2] + p.size[2] / 2,
      });
    } else if (p.kind === "cyl" && p.collide !== false && p.h > 0.5) {
      solids.push({ minX: p.pos[0] - p.r, maxX: p.pos[0] + p.r, minZ: p.pos[2] - p.r, maxZ: p.pos[2] + p.r });
    }
  }
  const inSolid = (x: number, z: number) =>
    solids.some((b) => x > b.minX - 1.4 && x < b.maxX + 1.4 && z > b.minZ - 1.4 && z < b.maxZ + 1.4);
  for (let tries = 0; tries < 6000 && out.length < 19; tries++) {
    const x = (rand() - 0.5) * 290;
    const z = (rand() - 0.5) * 290;
    if (!clearGround(x, z, 2.5, keepOut)) continue;
    if (!nearAPath(x, z)) continue;
    if (inSolid(x, z)) continue;
    // ground another module builds on at runtime, such as the chocolate course
    if (noGo.some((r) => x > r.minX - 4 && x < r.maxX + 4 && z > r.minZ - 4 && z < r.maxZ + 4)) continue;
    if (out.some(([ox, oz]) => dist2(x, z, ox, oz) < 20 * 20)) continue;
    out.push([x, z]);
  }
  return out;
}

/* -------------------------------------------------------- planting */

/**
 * What goes between the landmarks.
 *
 * The first version scattered sweets at random over the whole park and it
 * looked exactly like what it was: confetti. Nothing here is random any more.
 * Sweets line the things that already have a shape — the loop, the river, the
 * region edges — so they read as planting rather than litter, and the open
 * lawns are left open on purpose, because a park needs somewhere to run.
 */
export function plantingProps(keepOut: [number, number][]): Prop[] {
  const out: Prop[] = [];

  /** Lollipop trees down both sides of the loop, evenly spaced, like street trees. */
  for (const r of loopRects()) {
    const alongX = r.maxX - r.minX > r.maxZ - r.minZ;
    const at = alongX ? (r.minZ + r.maxZ) / 2 : (r.minX + r.maxX) / 2;
    const from = alongX ? r.minX : r.minZ;
    const to = alongX ? r.maxX : r.maxZ;
    const cuts = bridgeSites().filter((b) => (alongX ? Math.abs(b.z - at) < 0.1 : Math.abs(b.x - at) < 0.1));
    let n = 0;
    for (let c = from + 9; c < to - 9; c += 18) {
      if (cuts.some((cut) => Math.abs(c - (alongX ? cut.x : cut.z)) < cut.span / 2 + 6)) continue;
      // the same variant down a whole side, alternating side to side: an avenue
      // reads as planted precisely because the trees match
      for (const side of [-1, 1]) {
        const px = alongX ? c : at + side * (PATH_W / 2 + 3.4);
        const pz = alongX ? at + side * (PATH_W / 2 + 3.4) : c;
        if (!clearGround(px, pz, 1, keepOut)) continue;
        out.push(model(TREE_IDS[side > 0 ? 0 : 2]!, px, pz, { scale: 1.25 }));
      }
      n++;
    }
    void n;
  }

  /**
   * The river bank: cotton candy and rushes of candy cane, in pairs facing each
   * other across the water, thinning as the bank widens.
   */
  for (let i = 8; i < RIVER_PATH.length - 8; i += 9) {
    const p = RIVER_PATH[i]!;
    const q = RIVER_PATH[i - 1]!;
    const len = Math.hypot(p.x - q.x, p.z - q.z) || 1;
    const nx = -(p.z - q.z) / len;
    const nz = (p.x - q.x) / len;
    const off = p.w / 2 + 3.2;
    for (const side of [-1, 1]) {
      const x = p.x + nx * side * off;
      const z = p.z + nz * side * off;
      if (!clearGround(x, z, 1.5, keepOut)) continue;
      if (i % 18 === 8) {
        out.push(model("cotton-candy", x, z, { scale: 1.3 }));
      } else {
        out.push(model("cane-post", x, z));
        out.push(model("rock-candy", x + nx * side * 1.8, z + nz * side * 1.8, { scale: 1.1 }));
      }
    }
  }

  /** A roundel of gumdrops at each corner of the loop, like a planted bed. */
  for (const [cx, cz] of [
    [-LOOP.x + 16, -LOOP.z + 16],
    [LOOP.x - 16, -LOOP.z + 16],
    [-LOOP.x + 16, LOOP.z - 16],
    [LOOP.x - 16, LOOP.z - 16],
  ] as [number, number][]) {
    if (!clearGround(cx, cz, 8, keepOut)) continue;
    out.push(disc(cx, TOP.apron, cz, 7, CANDY.cream, 0.1));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      out.push(model("gumdrop", cx + Math.sin(a) * 5, cz + Math.cos(a) * 5, { scale: 1.4, variant: i % 6 }));
    }
    out.push(model("candy-corn", cx, cz, { scale: 2 }));
  }

  return out;
}

/**
 * The Candy Garden: four formal beds round a fountain, in the open ground
 * between the plaza and the woods.
 *
 * The park needed something in that field, and a garden is the one kind of
 * planting that is meant to look planted: rows in beds, beds in quarters,
 * quarters round a middle, hedges holding the whole thing square.
 */
export function gardenProps(): Prop[] {
  const out: Prop[] = [];
  const gx = -44;
  const gz = -8;
  const half = 22;
  // a real hedge height, so the garden has walls rather than a painted outline
  const hedge = (x: number, z: number, w: number, d: number) =>
    out.push(box(x, 0.75, z, w, 1.5, d, "#3f8a48"));

  // the border, with a gap in the middle of each side to walk in through
  for (const side of [-1, 1]) {
    hedge(gx + side * (half - 0.4), gz - half / 2 - 1, 0.8, half - 2);
    hedge(gx + side * (half - 0.4), gz + half / 2 + 1, 0.8, half - 2);
    hedge(gx - half / 2 - 1, gz + side * (half - 0.4), half - 2, 0.8);
    hedge(gx + half / 2 + 1, gz + side * (half - 0.4), half - 2, 0.8);
  }
  out.push(model("cane-arch", gx, gz + half, { scale: 1.6 }));
  out.push(model("cane-arch", gx, gz - half, { scale: 1.6 }));
  out.push(model("cane-arch", gx + half, gz, { ry: Math.PI / 2, scale: 1.6 }));
  out.push(model("cane-arch", gx - half, gz, { ry: Math.PI / 2, scale: 1.6 }));

  // Four arms out from the middle rather than two crossing bars: two bars lie
  // over each other where they meet, and that is the flicker.
  const arm = (half + 7) / 2;
  out.push(surf(gx, TOP.drive, gz - arm, 5, half - 7, CANDY.sugar, 0.1));
  out.push(surf(gx, TOP.drive, gz + arm, 5, half - 7, CANDY.sugar, 0.1));
  out.push(surf(gx - arm, TOP.drive, gz, half - 7, 5, CANDY.sugar, 0.1));
  out.push(surf(gx + arm, TOP.drive, gz, half - 7, 5, CANDY.sugar, 0.1));
  out.push(disc(gx, TOP.path, gz, 7, CANDY.cream, 0.1));
  out.push(disc(gx, TOP.court, gz, 4.5, CANDY.blush, 0.08));
  out.push(model("choc-fountain", gx, gz));
  for (const [bx, bz, ry] of [
    [gx, gz - 9, 0],
    [gx, gz + 9, Math.PI],
    [gx - 9, gz, Math.PI / 2],
    [gx + 9, gz, -Math.PI / 2],
  ] as [number, number, number][]) {
    out.push(...bench(bx, bz, ry));
  }

  /*
   * The four beds. Rows of small lollipops on a strawberry bed, each quarter
   * turned a quarter, which is what makes a formal garden look formal: the
   * same thing four times, square to the axes.
   */
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const bx = gx + sx * 11.5;
      const bz = gz + sz * 11.5;
      // the cream kerb first and lower, then the strawberry soil on top of it:
      // the wider surface has to be the lower one or it hides the bed
      out.push(surf(bx, TOP.lawn, bz, 16.2, 16.2, CANDY.cream, 0.1));
      out.push(surf(bx, TOP.apron, bz, 15, 15, "#e86a8a", 0.1));
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          const lx = bx - 5.1 + i * 3.4;
          const lz = bz - 5.1 + j * 3.4;
          const v = (i + j) % 2 === 0 ? 3 : 1;
          out.push(model(TREE_IDS[v]!, lx, lz, { scale: 0.9 }));
        }
      }
      for (const [ox, oz] of [[-6.2, -6.2], [6.2, -6.2], [-6.2, 6.2], [6.2, 6.2]] as [number, number][]) {
        out.push(model("gumdrop", bx + ox, bz + oz, { scale: 1.1, variant: sx > 0 ? 3 : 5 }));
      }
    }
  }
  return out;
}

/* -------------------------------------------------- the start district */

/**
 * The first hundred metres.
 *
 * Everything else in this park is a long walk from the plaza, which left the
 * place she arrives in as the emptiest part of it. This fills the ring round
 * the plaza with small places to find within a few steps of each other: a
 * bandstand, a sweet shop row, a soda pond, a picnic lawn and a signpost, all
 * joined by narrow paths off the main spokes.
 *
 * The little paths sit 2cm below the main ones so the two never flicker where
 * they meet, and the soda is a liquid, so she wades rather than walks on it.
 */

const SODA = "#7fd0f0";

/** A narrow path between two points. Straight runs only, like the main loop. */
function lane(x0: number, z0: number, x1: number, z1: number, w = 3, lift = 0): Prop[] {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ry = Math.atan2(x1 - x0, z1 - z0);
  // A hair under the street and the main paths, because a lane always ends by
  // running into one of them and two surfaces at one height flicker. `lift`
  // staggers the runs of a winding trail, which lap over each other at bends.
  return [surf((x0 + x1) / 2, TOP.drive - 0.015 + lift, (z0 + z1) / 2, w, len, CANDY.sugar, 0.1, { ry })];
}

/** A bench made of a marshmallow slab on candy cane legs. */
function bench(x: number, z: number, ry = 0): Prop[] {
  const dx = Math.cos(ry);
  const dz = -Math.sin(ry);
  return [
    box(x, 0.45, z, 2.4, 0.18, 0.7, CANDY.icing, true, { ry }),
    cyl(x - dx * 0.9, 0.22, z - dz * 0.9, 0.16, 0.45, CANDY.cane),
    cyl(x + dx * 0.9, 0.22, z + dz * 0.9, 0.16, 0.45, CANDY.cane),
    box(x - Math.sin(ry) * 0.3, 0.85, z - Math.cos(ry) * 0.3, 2.4, 0.6, 0.16, CANDY.blush, true, { ry }),
  ];
}

/** A wafer-roofed bandstand: somewhere to stand, and something to see from afar. */
function bandstand(x: number, z: number): Prop[] {
  const out: Prop[] = [];
  out.push(disc(x, TOP.inner, z, 5.2, CANDY.cream, 0.3));
  out.push(disc(x, TOP.line, z, 4.6, CANDY.blush, 0.08));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    out.push(cyl(x + Math.sin(a) * 4.2, 1.6, z + Math.cos(a) * 4.2, 0.22, 3.2, CANDY.cane));
  }
  // the roof: three stacked discs, so it reads as a swirl of icing
  out.push(disc(x, 3.6, z, 5.4, CANDY.icing, 0.3));
  out.push(disc(x, 4.1, z, 4.2, CANDY.blush, 0.3));
  out.push(disc(x, 4.6, z, 2.6, CANDY.icing, 0.3));
  out.push(cyl(x, 5.1, z, 0.5, 0.8, CANDY.cane));
  return out;
}

/** A signpost at the plaza with an arm for each way out. */
function signpost(x: number, z: number): Prop[] {
  const out: Prop[] = [cyl(x, 2.2, z, 0.26, 4.4, CANDY.icing)];
  const arms: [number, number, string][] = [
    [0, 3.6, CANDY.cane],
    [Math.PI / 2, 3.0, CANDY.mint],
    [Math.PI, 2.4, CANDY.sun],
    [-Math.PI / 2, 1.8, CANDY.lilac],
  ];
  for (const [ry, y, color] of arms) {
    out.push(box(x + Math.sin(ry) * 1.3, y, z + Math.cos(ry) * 1.3, 2.6, 0.5, 0.14, color, false, { ry: ry + Math.PI / 2 }));
  }
  return out;
}

/** A lamp post: a candy cane with a gumdrop light on top. */
function lamp(x: number, z: number): Prop[] {
  return [
    cyl(x, 1.6, z, 0.14, 3.2, CANDY.icing),
    cyl(x, 3.3, z, 0.36, 0.3, CANDY.cane, false),
    cyl(x, 3.6, z, 0.3, 0.4, CANDY.sun, false),
  ];
}

/** A low icing fence, for a front garden. */
function fence(x: number, z: number, len: number, ry = 0): Prop[] {
  const out: Prop[] = [];
  const n = Math.max(2, Math.round(len / 1.2));
  for (let i = 0; i <= n; i++) {
    const t = -len / 2 + (i * len) / n;
    out.push(cyl(x + Math.cos(ry) * t, 0.35, z - Math.sin(ry) * t, 0.11, 0.7, i % 2 ? CANDY.cane : CANDY.icing));
  }
  out.push(box(x, 0.72, z, len, 0.1, 0.14, CANDY.icing, false, { ry: ry + Math.PI / 2 }));
  return out;
}

/**
 * The village round the plaza.
 *
 * She arrives here, so it is the part of the park that has to feel like a
 * place rather than a lawn: a street of gingerbread cottages and sweet shops
 * with front gardens and lamp posts, a green with a bandstand at one end, a
 * soda pond, and a picnic lawn out east. Everything sits within a minute's walk
 * of where she lands.
 */
export function startDistrictProps(keepOut: [number, number][]): Prop[] {
  const out: Prop[] = [];
  const { x: px, z: pz, r: pr } = SUGAR.plaza;

  // ---- the street: east-west, south of the plaza, crossing the south spoke
  const streetZ = pz + 20;
  out.push(surf(px - 18, TOP.drive, streetZ, 76, 7, CANDY.sugar, 0.1));
  for (let c = px - 52; c < px + 16; c += 5) {
    // between the path's own height and the main paths' stripes, so the street
    // crossing the spoke does not set up a flicker
    out.push(surf(c, 0.115, streetZ, 1.1, 7, CANDY.blush, 0.06));
  }

  // cottages down both sides, doors onto the street
  const north: [number, number][] = [
    [px - 48, 0],
    [px - 36, 1],
    [px - 24, 2],
    [px - 12, 0],
    [px + 4, 1],
  ];
  for (const [hx, v] of north) {
    out.push(model(`gingerbread${v}`, hx, streetZ - 9, { scale: 0.95 }));
    out.push(...fence(hx, streetZ - 5.2, 5.4));
    out.push(model(TREE_IDS[v % TREE_IDS.length]!, hx + 4.2, streetZ - 7, { scale: 0.8 }));
  }
  const south: [number, number][] = [
    [px - 44, 2],
    [px - 32, 0],
    [px - 8, 1],
    [px + 8, 2],
  ];
  for (const [hx, v] of south) {
    out.push(model(`gingerbread${v}`, hx, streetZ + 9, { scale: 0.95, ry: Math.PI }));
    out.push(...fence(hx, streetZ + 5.2, 5.4));
    out.push(model(TREE_IDS[(v + 1) % TREE_IDS.length]!, hx - 4.2, streetZ + 7, { scale: 0.8 }));
  }
  // shops on the corner nearest the plaza, where she will walk first
  out.push(model("candy-stall", px - 18, streetZ - 6, { variant: 0 }));
  out.push(model("candy-stall", px - 26, streetZ + 6, { variant: 1, ry: Math.PI }));
  out.push(model("gumball-machine", px - 3, streetZ - 5.5, { scale: 1.1 }));
  for (let c = px - 50; c <= px + 12; c += 12) {
    out.push(...lamp(c, streetZ - 4.4));
    out.push(...lamp(c + 6, streetZ + 4.4));
  }
  for (const [bx, bz] of [
    [px - 40, streetZ - 4.2],
    [px - 20, streetZ + 4.2],
    [px - 2, streetZ + 4.2],
  ] as [number, number][]) {
    out.push(...bench(bx, bz, bz < streetZ ? 0 : Math.PI));
  }

  // ---- the green at the west end of the street, with the bandstand on it
  const band = { x: px - 60, z: streetZ + 2 };
  out.push(surf(band.x, TOP.lawn, band.z, 30, 30, CANDY.lawn, 0.1));
  out.push(...bandstand(band.x, band.z));
  out.push(...lane(px - 52, streetZ, band.x + 6, band.z));
  out.push(...bench(band.x - 9, band.z, Math.PI / 2));
  out.push(...bench(band.x + 9, band.z, -Math.PI / 2));
  for (const [ox, oz] of [[-11, -11], [11, -11], [-11, 11], [11, 11]] as [number, number][]) {
    out.push(model(TREE_IDS[(Math.abs(ox) + Math.abs(oz)) % TREE_IDS.length]!, band.x + ox, band.z + oz, { scale: 1.2 }));
  }

  // ---- the village pond, south of the street
  const pond = { x: px - 18, z: pz + 44, r: 7.5 };
  out.push(disc(pond.x, TOP.apron, pond.z, pond.r + 2.2, CANDY.sugar, 0.14));
  out.push(disc(pond.x, TOP.path, pond.z, pond.r, SODA, 0.1));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    out.push(cyl(pond.x + Math.sin(a) * (pond.r + 1.4), 0.3, pond.z + Math.cos(a) * (pond.r + 1.4), 0.45, 0.6, CANDY.icing));
  }
  out.push(model("choc-fountain", pond.x + pond.r + 6, pond.z));
  out.push(...bench(pond.x - 2, pond.z - pond.r - 3.4));
  out.push(...lane(pond.x, streetZ + 4, pond.x, pond.z - pond.r - 2));

  // ---- the picnic lawn, east, on the plaza's other side
  const lawn = { x: px + 52, z: pz + 4 };
  out.push(surf(lawn.x, TOP.lawn, lawn.z, 26, 22, CANDY.lawn, 0.1));
  for (const [ox, oz] of [[-7, -5], [6, -6], [0, 5], [8, 6]] as [number, number][]) {
    out.push(cyl(lawn.x + ox, 0.6, lawn.z + oz, 1.5, 0.3, CANDY.cream));
    out.push(cyl(lawn.x + ox, 0.3, lawn.z + oz, 0.5, 0.6, CANDY.chocLight));
    out.push(model("marshmallow", lawn.x + ox + 2.4, lawn.z + oz + 1.4, { scale: 0.6 }));
  }
  out.push(...lane(px + pr + 1, pz + 2, lawn.x - 13, lawn.z));
  out.push(...lamp(lawn.x - 10, lawn.z - 8));
  out.push(...lamp(lawn.x + 10, lawn.z + 8));

  // ---- the signpost where she arrives
  out.push(...signpost(px + 6, pz + pr + 3));
  out.push(...lamp(px - 6, pz + pr + 3));

  // ---- planters and sweets filling what is left round the plaza
  const rand = rng(5150);
  const places: [number, number, number][] = [
    [band.x, band.z, 18],
    [pond.x, pond.z, 14],
    [lawn.x, lawn.z, 16],
  ];
  for (let i = 0; i < 60; i++) {
    const a = rand() * Math.PI * 2;
    const r = pr + 6 + rand() * 46;
    const x = px + Math.sin(a) * r;
    const z = pz + Math.cos(a) * r;
    if (!clearGround(x, z, 2, keepOut)) continue;
    if (Math.abs(z - streetZ) < 14 && x > px - 56 && x < px + 16) continue;
    if (places.some(([bx, bz, rr]) => dist2(x, z, bx, bz) < rr * rr)) continue;
    const pick = rand();
    if (pick < 0.35) {
      out.push(cyl(x, 0.45, z, 1.1, 0.9, CANDY.blush));
      out.push(model(TREE_IDS[Math.floor(rand() * TREE_IDS.length)]!, x, z, { y: 0.9, scale: 0.7 + rand() * 0.3 }));
    } else if (pick < 0.55) {
      out.push(...bench(x, z, rand() * Math.PI));
    } else if (pick < 0.8) {
      const n = 2 + Math.floor(rand() * 3);
      for (let k = 0; k < n; k++) {
        out.push(
          model("gumdrop", x + (rand() - 0.5) * 5, z + (rand() - 0.5) * 5, {
            scale: 0.7 + rand(),
            variant: Math.floor(rand() * 6),
          }),
        );
      }
    } else {
      out.push(model("cotton-candy", x, z, { scale: 1 + rand() * 0.5 }));
      out.push(model("swirl-mint", x + 2, z + 1.5, { scale: 0.6 }));
    }
  }
  return out;
}

/** The soda pond she can paddle in, for the level's water list. */
export function startWater(): WaterZone[] {
  return [{ kind: "water", x: SUGAR.plaza.x - 18, z: SUGAR.plaza.z + 44, r: 7.5, pool: true }];
}
