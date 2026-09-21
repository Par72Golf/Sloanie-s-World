import type { BoxProp, CylinderProp, Prop, WaterZone } from "./types";

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
  village: { x: 118, z: 10 },
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
  [-120, -140],
  [-60, -90],
  [-8, -58],
  [25, -10],
  [40, 40],
  [80, 85],
  [SUGAR.lake.x, SUGAR.lake.z],
];

export const RIVER_W = 9;
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
    out.push(surf(x, TOP.apron + lift, z, RIVER_W + BANK_W * 2, len, CANDY.sugar, 0.14, { ry: s.ry }));
    out.push(surf(x, TOP.path + lift, z, RIVER_W, len, CANDY.chocRiver, 0.1, { ry: s.ry }));
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
  const r = RIVER_W / 2;
  for (const s of segments(RIVER)) {
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
  }
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
 * How much path is taken out at a crossing, and handed to a bridge. The river
 * crosses the loop at an angle, so its footprint along the path is wider than
 * the river itself: this is sized for the shallowest crossing.
 */
export const BRIDGE_LEN = 24;

/** Where a bridge stands: the point, and whether it runs along x or z. */
export function bridgeSites(): { x: number; z: number; along: "x" | "z" }[] {
  const out: { x: number; z: number; along: "x" | "z" }[] = [];
  for (const r of loopRects()) {
    const alongX = r.maxX - r.minX > r.maxZ - r.minZ;
    const at = alongX ? (r.minZ + r.maxZ) / 2 : (r.minX + r.maxX) / 2;
    for (const [cx, cz] of riverCrossings(alongX ? "z" : "x", at)) {
      const inside = alongX ? cx > r.minX && cx < r.maxX : cz > r.minZ && cz < r.maxZ;
      if (inside) out.push({ x: cx, z: cz, along: alongX ? "x" : "z" });
    }
  }
  return out;
}

/**
 * The bridge deck sits a step above the path so it is never coplanar with the
 * water it spans, which is what z-fights.
 */
function bridgeProps(): Prop[] {
  const out: Prop[] = [];
  for (const b of bridgeSites()) {
    const w = b.along === "x" ? BRIDGE_LEN : PATH_W;
    const d = b.along === "x" ? PATH_W : BRIDGE_LEN;
    out.push(surf(b.x, TOP.inner, b.z, w, d, CANDY.icing, 0.16));
    // candy-cane rails: short posts, so she can see the edge without them
    // blocking the view of the chocolate underneath
    const n = 5;
    for (let i = 0; i <= n; i++) {
      const t = -BRIDGE_LEN / 2 + (i * BRIDGE_LEN) / n;
      for (const side of [-1, 1]) {
        const px = b.along === "x" ? b.x + t : b.x + side * (PATH_W / 2 - 0.3);
        const pz = b.along === "x" ? b.z + side * (PATH_W / 2 - 0.3) : b.z + t;
        out.push(cyl(px, 0.6, pz, 0.16, 1.2, i % 2 ? CANDY.icing : CANDY.cane, false));
      }
    }
  }
  return out;
}

/** Path slabs, split wherever the river runs under them. */
function runProps(r: { minX: number; maxX: number; minZ: number; maxZ: number }): Prop[] {
  const out: Prop[] = [];
  const alongX = r.maxX - r.minX > r.maxZ - r.minZ;
  const at = alongX ? (r.minZ + r.maxZ) / 2 : (r.minX + r.maxX) / 2;
  const from = alongX ? r.minX : r.minZ;
  const to = alongX ? r.maxX : r.maxZ;
  const cuts = riverCrossings(alongX ? "z" : "x", at)
    .map(([cx, cz]) => (alongX ? cx : cz))
    .filter((c) => c > from && c < to)
    .sort((a, b) => a - b);
  let start = from;
  const pieces: [number, number][] = [];
  for (const c of cuts) {
    if (c - BRIDGE_LEN / 2 > start) pieces.push([start, c - BRIDGE_LEN / 2]);
    start = c + BRIDGE_LEN / 2;
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
    const cuts = riverCrossings(alongX ? "z" : "x", at).map(([cx, cz]) => (alongX ? cx : cz));
    for (let c = from + 2; c < to - 1; c += 4) {
      if (cuts.some((cut) => Math.abs(c - cut) < BRIDGE_LEN / 2 + 1)) continue;
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
