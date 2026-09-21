import type { BoxProp, CylinderProp, ModelProp, Prop, WaterZone } from "./types";
import { TREE_IDS, bridgeFor, model } from "./sugar-models";

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
  licorice: "#2a2430",
  grass: "#63c46a",
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
  factory: { x: -8, z: -58 },
  mountain: { x: -105, z: -120 },
  forest: { x: -105, z: 15 },
  village: { x: 124, z: 10 },
  maze: { x: 90, z: -92 },
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
 * 5m wide: a river runs into a mill race, it does not knock the wall out. The
 * index is the run, counted from the mountain.
 */
const FACTORY_RUN = 2;
const NARROW_W = 4.6;
const widthOf = (i: number) => (i === FACTORY_RUN ? NARROW_W : RIVER_W);
/** Sugar banks sit a little proud of the water so the edge reads from a distance. */
const BANK_W = 1.6;

function segments(points: [number, number][]) {
  const out: { x: number; z: number; len: number; ry: number; dx: number; dz: number }[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const [x0, z0] = points[i]!;
    const [x1, z1] = points[i + 1]!;
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    out.push({
      x: (x0 + x1) / 2,
      z: (z0 + z1) / 2,
      len,
      // a slab is built along z, so the angle is measured from north
      ry: Math.atan2(dx, dz),
      dx: dx / len,
      dz: dz / len,
    });
  }
  return out;
}

export function riverProps(): Prop[] {
  const out: Prop[] = [];
  // The bank is one wide slab *under* a narrower water slab rather than two
  // strips beside it: strips met at every elbow and overlapped each other, and
  // stacking is how this game keeps flat surfaces from z-fighting anyway.
  const runs = segments(RIVER);
  runs.forEach((s, i) => {
    // the last run stops at the lake's edge rather than lying across it
    const last = i === runs.length - 1;
    const len = s.len + RIVER_W - (last ? SUGAR.lake.r * 2 : 0);
    const back = last ? SUGAR.lake.r : 0;
    const x = s.x - s.dx * back;
    const z = s.z - s.dz * back;
    /*
     * Runs are overlength so the bends have no notch, which means consecutive
     * runs lie over each other at every elbow. Two surfaces at the same height
     * z-fight, so alternate runs sit 2cm higher: invisible underfoot on a river
     * she cannot walk on anyway, and the flicker is gone.
     */
    const lift = i % 2 ? 0.02 : 0;
    const w = widthOf(i);
    out.push(surf(x, TOP.apron + lift, z, w + BANK_W * 2, len, CANDY.sugar, 0.14, { ry: s.ry }));
    out.push(surf(x, TOP.path + lift, z, w, len, CANDY.chocRiver, 0.1, { ry: s.ry }));
  });
  // No discs at the elbows: a disc at the same height as the run it joins is
  // exactly the coplanar overlap that z-fights. Each run is overlength instead,
  // which covers the notch at these shallow bends.
  out.push(disc(SUGAR.lake.x, TOP.apron, SUGAR.lake.z, SUGAR.lake.r + BANK_W, CANDY.sugar, 0.14));
  out.push(disc(SUGAR.lake.x, TOP.path, SUGAR.lake.z, SUGAR.lake.r, CANDY.chocRiver, 0.1));
  return out;
}

/**
 * Swimming zones for the river: circles down the middle of every run, because
 * that is the only shape the water rule understands. `pool` keeps the pond
 * dressing (rocks, cattails, lily pads) off a river made of chocolate.
 */
export function riverWater(): WaterZone[] {
  const out: WaterZone[] = [];
  segments(RIVER).forEach((s, i) => {
    const r = widthOf(i) / 2;
    const steps = Math.max(1, Math.round(s.len / r));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      out.push({
        kind: "water",
        x: s.x - (s.dx * s.len) / 2 + s.dx * s.len * t,
        z: s.z - (s.dz * s.len) / 2 + s.dz * s.len * t,
        r,
        pool: true,
      });
    }
  });
  out.push({ kind: "water", x: SUGAR.lake.x, z: SUGAR.lake.z, r: SUGAR.lake.r, pool: true });
  return out;
}

/** Every point where the river crosses a line of constant x (or constant z). */
export function riverCrossings(along: "x" | "z", at: number): [number, number][] {
  const out: [number, number][] = [];
  for (const [i, p] of RIVER.entries()) {
    const q = RIVER[i + 1];
    if (!q) break;
    const a = along === "x" ? p[0] : p[1];
    const b = along === "x" ? q[0] : q[1];
    if ((at - a) * (at - b) > 0) continue;
    const t = b === a ? 0 : (at - a) / (b - a);
    out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
  }
  return out;
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
  const runs = segments(RIVER);
  for (const r of loopRects()) {
    const alongX = r.maxX - r.minX > r.maxZ - r.minZ;
    const at = alongX ? (r.minZ + r.maxZ) / 2 : (r.minX + r.maxX) / 2;
    for (const [cx, cz] of riverCrossings(alongX ? "z" : "x", at)) {
      const inside = alongX ? cx > r.minX && cx < r.maxX : cz > r.minZ && cz < r.maxZ;
      if (!inside) continue;
      let best = runs[0]!;
      let bestD = Infinity;
      for (const run of runs) {
        const d = Math.hypot(run.x - cx, run.z - cz);
        if (d < bestD) {
          bestD = d;
          best = run;
        }
      }
      // the water lying along the path: the river's width over the sine of the
      // angle between them, floored so a square crossing still gets a bridge
      const sin = Math.abs(alongX ? best.dz : best.dx);
      const water = RIVER_W / Math.max(0.35, sin);
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
          ? surf(c, TOP.court, at, 1.2, PATH_W, CANDY.cane, 0.08)
          : surf(at, TOP.court, c, PATH_W, 1.2, CANDY.cane, 0.08),
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
  const h = 6;
  const t = 1.5;
  const span = FENCE_AT * 2;
  for (const z of [-FENCE_AT, FENCE_AT]) {
    out.push(box(0, h / 2, z, span + t * 2, h, t, CANDY.chocLight));
    out.push(box(0, h + 0.2, z, span + t * 2, 0.4, t + 0.5, CANDY.icing, false));
  }
  for (const x of [-FENCE_AT, FENCE_AT]) {
    out.push(box(x, h / 2, 0, t, h, span + t * 2, CANDY.chocLight));
    out.push(box(x, h + 0.2, 0, t + 0.5, 0.4, span + t * 2, CANDY.icing, false));
  }
  // candy canes along the top, purely so the wall reads as candy from inside
  for (let i = -15; i <= 15; i++) {
    const at = i * 10;
    for (const z of [-FENCE_AT, FENCE_AT]) out.push(cyl(at, h + 1.1, z, 0.35, 2.2, CANDY.cane, false));
    for (const x of [-FENCE_AT, FENCE_AT]) out.push(cyl(x, h + 1.1, at, 0.35, 2.2, CANDY.cane, false));
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
  for (const s of segments(RIVER)) {
    const ax = s.x - (s.dx * s.len) / 2;
    const az = s.z - (s.dz * s.len) / 2;
    const t = Math.max(0, Math.min(s.len, (x - ax) * s.dx + (z - az) * s.dz));
    best = Math.min(best, Math.hypot(x - (ax + s.dx * t), z - (az + s.dz * t)));
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
export function forestProps(keepOut: [number, number][]): Prop[] {
  const clearing: [number, number] = [SUGAR.forest.x, SUGAR.forest.z];
  return scatter(
    1207,
    { x: SUGAR.forest.x, z: SUGAR.forest.z, w: 80, d: 96 },
    170,
    2.4,
    [...keepOut, clearing],
    (x, z, rand) => {
      // the clearing itself stays open, so the princess has somewhere to be
      if (dist2(x, z, clearing[0], clearing[1]) < 16 ** 2) return [];
      const v = Math.floor(rand() * TREE_IDS.length);
      const props: Prop[] = [model(TREE_IDS[v]!, x, z, { scale: 1.1 + rand() * 0.8, ry: rand() * Math.PI * 2 })];
      // sweets in the grass under the trees, for somewhere for the eye to land
      if (rand() < 0.3) props.push(model("swirl-mint", x + 1.6, z + 1.2, { scale: 0.6 + rand() * 0.4 }));
      if (rand() < 0.2) props.push(model("rock-candy", x - 1.4, z + 1.6, { scale: 0.8 + rand() * 0.6 }));
      return props;
    },
  );
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
    out.push({ kind: "trampoline", x: tx, z: tz, w: 6, d: 6 });
  }
  return out;
}

/**
 * The Licorice Maze: a grid maze of hedge walls. Corridors are 4m so a trike
 * could follow her in, and the whole thing is small enough to solve by looking,
 * because this is a seven-year-old's maze and the one in park 1 is the hard one.
 */
export const MAZE = { cell: 8, n: 7 };

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
    [x + 1, z - 17, 0, 2],
  ];
  for (const [hx, hz, ry, v] of houses) out.push(model(`gingerbread${v}`, hx, hz, { ry }));
  out.push(model("candy-stall", x - 7, z + 4, { variant: 0 }));
  out.push(model("candy-stall", x + 7, z + 4, { variant: 1, ry: Math.PI }));
  out.push(model("gumball-machine", x, z - 6, { scale: 1.2 }));
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

/* -------------------------------------------------------- dressing */

/**
 * What goes between the landmarks.
 *
 * A 320m park with only its big pieces in it is mostly walking, so this lines
 * the loop with candy canes and scatters sweets across the ground between the
 * regions. Everything here is decoration: it never blocks a route, and it keeps
 * off the paths, the river and every hidden candy.
 */
export function dressingProps(keepOut: [number, number][]): Prop[] {
  const out: Prop[] = [];

  // candy canes down both sides of the loop, so the path reads as a route from
  // a distance and there is something to follow when she is lost
  for (const r of loopRects()) {
    const alongX = r.maxX - r.minX > r.maxZ - r.minZ;
    const at = alongX ? (r.minZ + r.maxZ) / 2 : (r.minX + r.maxX) / 2;
    const from = alongX ? r.minX : r.minZ;
    const to = alongX ? r.maxX : r.maxZ;
    const cuts = bridgeSites().filter((b) => (alongX ? Math.abs(b.z - at) < 0.1 : Math.abs(b.x - at) < 0.1));
    for (let c = from + 12; c < to - 6; c += 24) {
      if (cuts.some((cut) => Math.abs(c - (alongX ? cut.x : cut.z)) < cut.span / 2 + 3)) continue;
      for (const side of [-1, 1]) {
        const px = alongX ? c : at + side * (PATH_W / 2 + 1.4);
        const pz = alongX ? at + side * (PATH_W / 2 + 1.4) : c;
        if (!clearGround(px, pz, 0.5, keepOut)) continue;
        out.push(model("cane-post", px, pz));
      }
    }
  }

  // sweets dropped across the open ground, thinning out where a region already
  // has its own planting
  const busy: [number, number, number][] = [
    [SUGAR.forest.x, SUGAR.forest.z, 52],
    [SUGAR.meadow.x, SUGAR.meadow.z, 42],
    [SUGAR.marshmallow.x, SUGAR.marshmallow.z, 36],
    [SUGAR.maze.x, SUGAR.maze.z, 36],
    [SUGAR.village.x, SUGAR.village.z, 26],
    [SUGAR.fair.x, SUGAR.fair.z, 34],
    [SUGAR.mountain.x, SUGAR.mountain.z, 22],
    [SUGAR.factory.x, SUGAR.factory.z, 22],
  ];
  const rand = rng(31337);
  const taken: [number, number][] = [];
  for (let tries = 0; tries < 4000 && taken.length < 240; tries++) {
    const x = (rand() - 0.5) * 300;
    const z = (rand() - 0.5) * 300;
    if (!clearGround(x, z, 2, keepOut)) continue;
    if (busy.some(([bx, bz, r]) => dist2(x, z, bx, bz) < r * r)) continue;
    if (taken.some(([tx, tz]) => dist2(x, z, tx, tz) < 12 * 12)) continue;
    taken.push([x, z]);
    const pick = rand();
    if (pick < 0.3) {
      out.push(model(TREE_IDS[Math.floor(rand() * TREE_IDS.length)]!, x, z, { scale: 0.9 + rand() * 0.7 }));
    } else if (pick < 0.55) {
      const n = 2 + Math.floor(rand() * 3);
      for (let k = 0; k < n; k++) {
        out.push(
          model("gumdrop", x + (rand() - 0.5) * 7, z + (rand() - 0.5) * 7, {
            scale: 0.8 + rand() * 1.4,
            variant: Math.floor(rand() * 6),
          }),
        );
      }
    } else if (pick < 0.72) {
      out.push(model("candy-corn", x, z, { scale: 0.8 + rand() * 0.8 }));
      out.push(model("swirl-mint", x + 2.5, z - 1.5, { scale: 0.7 + rand() * 0.5 }));
    } else if (pick < 0.86) {
      out.push(model("cotton-candy", x, z, { scale: 0.9 + rand() * 0.7 }));
      out.push(model("rock-candy", x - 2, z + 2, { scale: 0.9 + rand() * 0.6 }));
    } else {
      out.push(model("marshmallow", x, z, { scale: 0.8 + rand() * 0.6, ry: rand() * Math.PI * 2 }));
    }
  }
  return out;
}
