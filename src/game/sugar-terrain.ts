import { CANDY, SUGAR, clearGround, riverDistance } from "./sugar-rush";
import { model } from "./sugar-models";
import type { BoxProp, Prop } from "./types";

/**
 * Sugar Rush Park: the ground she walks over.
 *
 * The park was a 320m table with things standing on it. This gives it relief in
 * the only way the engine has — stacked slabs — and the whole module is written
 * round one number: her step-up is 0.62m (collision.ts), so no riser here is
 * over 0.52m and she never has to jump. A wide flat slab is solid whatever its
 * `collide` flag says (colliders.ts), which is exactly what makes a stack of
 * them a staircase rather than a painting of one.
 *
 * Two things live here:
 *
 *   gumdropHills()  Gumdrop Meadow, rebuilt. It was 70 gumdrops scattered at
 *                   random over a flat field — sprinkled everywhere with no
 *                   thought or flow. Now it is three terraced hills she can run
 *                   up, and every gumdrop stands on a rim, a corner or a summit.
 *   sugarBerms()    long low mounds elsewhere, beside the loop and the river,
 *                   so the rest of the park stops reading as a table.
 *
 * The ground under all of it is smooth spearmint with no blades of grass
 * (sugar-level.ts: `grass: "#8fe0cf"`, `grassDensity: 0`), so a hill here is a
 * mint sweet, not a grassy knoll: it starts in the ground's own mint at the
 * foot and lightens layer by layer to an iced summit, the way a cake does.
 * Green would look like a fete on a village green, which is what the first
 * version of this file was still painted as.
 *
 * Nothing is placed by eye: every footprint is checked against `clearGround`,
 * which knows where the paths, the river, the plaza and the hidden candies are.
 */

/* ------------------------------------------------------------- vocabulary */

/** Deterministic: the park has to be the same park every time she loads it. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** An axis-aligned footprint. Terraces are rectangles because colliders are. */
type Rect = { x0: number; x1: number; z0: number; z1: number };

const rectOf = (x: number, z: number, w: number, d: number): Rect => ({
  x0: x - w / 2,
  x1: x + w / 2,
  z0: z - d / 2,
  z1: z + d / 2,
});

const midX = (r: Rect) => (r.x0 + r.x1) / 2;
const midZ = (r: Rect) => (r.z0 + r.z1) / 2;

/** Which way the way up faces: +x east, -x west, +z south, -z north. */
type Face = [number, number];

/**
 * One terrace: a slab whose top face is at `top`, reaching 1cm down into the
 * terrace below.
 *
 * The 1cm is the whole trick. Sitting two slabs face to face leaves coplanar
 * faces that flicker; overlapping them by the checker's own 2cm tolerance is a
 * rounding error away from being reported as two props inside each other. A
 * centimetre is under the tolerance with room to spare and no one can see it.
 */
function terrace(r: Rect, top: number, rise: number, color: string): BoxProp {
  const h = rise + 0.01;
  return {
    kind: "box",
    pos: [midX(r), top - h / 2, midZ(r)],
    size: [r.x1 - r.x0, h, r.z1 - r.z0],
    color,
  };
}

/**
 * The bottom step of everything here is 0.28m, never more.
 *
 * Not for her legs — she could take twice it — but for the rest of the park. The
 * bottom slab is the only one that sits down on the ground where the frosting
 * patches, the lawn aprons and the planted roundels already are, and at 0.29m
 * thick it is under both of the thresholds that matter: `frostingProps` counts
 * anything 0.3m or thinner as a flat surface and keeps its patches clear of it,
 * and tools/check-layout.ts calls it thin and stops reporting it as a prop
 * inside a prop. A 0.5m apron is neither, and a hill built that way has a
 * frosting patch buried under every skirt.
 *
 * That only works if the level hands the hills to `frostingProps` — they have
 * to be in the `already` list, which is why the frosting goes on last.
 *
 * Above the ground nothing else is flat, so the risers up there are free to be
 * the full step.
 */
const APRON_RISE = 0.28;
/**
 * Every step above the apron. Her step-up is 0.62m, so this keeps a tenth of a
 * metre in hand: enough that a frame of jitter on the way up can never leave
 * her standing at the foot of a wall she was walking up a moment ago.
 */
const STEP_RISE = 0.52;

const KERB_W = 0.28;
/** The opening left in the rim: the way up, seen from the bottom of the hill. */
const KERB_GAP = 5.4;

/**
 * The piped icing edge round a terrace. Thin and `collide: false`, so the
 * engine builds no collider for it at all — she walks through it, which is what
 * a 28cm lip on the lip of a step has to do or it is a trip hazard she cannot
 * see.
 *
 * `stair` is where the way up crosses this rim: the runs stop short of it, and
 * that gap is what tells her from the bottom of the hill which side to climb.
 * The north and south runs own the corners, so the east and west ones are short
 * by a kerb's width at each end — two flat tops at one height, overlapping, is
 * the flicker the checker fails on.
 */
function kerbs(r: Rect, top: number, face: Face, stair: number, color: string): Prop[] {
  const out: Prop[] = [];
  const y = top + 0.12;
  const strip = (x: number, z: number, sx: number, sz: number): BoxProp => ({
    kind: "box",
    pos: [x, y - 0.06, z],
    size: [sx, 0.12, sz],
    color,
    collide: false,
  });
  /** One side, minus the opening if the way up comes through it. */
  const runs = (a: number, b: number, open: boolean): [number, number][] => {
    if (!open) return b - a > 0.6 ? [[a, b]] : [];
    const out: [number, number][] = [];
    if (stair - KERB_GAP / 2 - a > 0.8) out.push([a, stair - KERB_GAP / 2]);
    if (b - (stair + KERB_GAP / 2) > 0.8) out.push([stair + KERB_GAP / 2, b]);
    return out;
  };
  for (const [z, open] of [
    [r.z0 + KERB_W / 2, face[1] < 0],
    [r.z1 - KERB_W / 2, face[1] > 0],
  ] as [number, boolean][]) {
    for (const [a, b] of runs(r.x0, r.x1, open)) out.push(strip((a + b) / 2, z, b - a, KERB_W));
  }
  for (const [x, open] of [
    [r.x0 + KERB_W / 2, face[0] < 0],
    [r.x1 - KERB_W / 2, face[0] > 0],
  ] as [number, boolean][]) {
    for (const [a, b] of runs(r.z0 + KERB_W, r.z1 - KERB_W, open)) out.push(strip(x, (a + b) / 2, KERB_W, b - a));
  }
  return out;
}

/**
 * Two sugar stripes up the face of the hill, one tread at a time, all of them
 * on the same line so they read as one staircase from the foot. Blossom, the
 * colour of the stripe across every path in this park, because that is what
 * they are: a path marking. In sugar they read as two planks laid on the step.
 *
 * They are 24cm wide and non-colliding, so they are paint and nothing else.
 * The obvious thing — a wide sugar landing on each tread — is a trap: a wide
 * slab is solid however it is flagged, and a solid pad sitting on the very
 * edge she is stepping onto fails the step-up's headroom test and turns the
 * way up into a wall.
 */
function stairStripes(outer: Rect, inner: Rect | null, top: number, face: Face, stair: number, color: string): Prop[] {
  const out: Prop[] = [];
  const alongX = face[0] !== 0;
  const from = alongX ? (face[0] > 0 ? outer.x1 : outer.x0) : face[1] > 0 ? outer.z1 : outer.z0;
  const to = inner
    ? alongX
      ? face[0] > 0
        ? inner.x1
        : inner.x0
      : face[1] > 0
        ? inner.z1
        : inner.z0
    : from - (alongX ? face[0] : face[1]) * 2.4;
  const len = Math.abs(from - to);
  if (len < 0.6) return out;
  const mid = (from + to) / 2;
  for (const s of [-1, 1]) {
    out.push({
      kind: "box",
      pos: alongX ? [mid, top + 0.05, stair + s * 1.5] : [stair + s * 1.5, top + 0.05, mid],
      size: alongX ? [len, 0.1, 0.24] : [0.24, 0.1, len],
      color,
      collide: false,
    });
  }
  return out;
}

/* ------------------------------------------------------------- the hills */

type Level = { w: number; d: number; dx: number; dz: number; rise: number };

type Hill = {
  name: string;
  /** offset from the meadow's centre, so moving the region moves the hills */
  dx: number;
  dz: number;
  /** which side the way up is on: the treads are widest there */
  face: Face;
  levels: Level[];
  seed: number;
};

/**
 * The strata, bottom to top. One ramp shared by all three hills, so they read
 * as one place cut from the same cake rather than three unrelated lumps: the
 * ground's own mint at the foot, a paler mint above it, sponge, blossom, and
 * every summit iced.
 *
 * Pastels, because a whole hillside of a saturated candy colour is what made
 * the first fairground look like a warning sign. The saturated colours arrive
 * as gumdrops, which is the point of the meadow.
 */
/**
 * The strata, bottom to top. One ramp shared by all three hills, so they read
 * as one place cut from the same cake rather than three unrelated lumps: the
 * ground's own mint at the foot, lightening through sponge to blossom, and
 * every summit iced. A hill with fewer terraces than there are strata takes its
 * colours spread over the whole ramp rather than stopping halfway up it, which
 * is what keeps the little hill looking like the top of the big one.
 *
 * Pastels, because a whole hillside of a saturated candy colour is what made
 * the first fairground look like a warning sign. The saturated colours arrive
 * as gumdrops, which is the point of the meadow.
 */
const STRATA = [CANDY.lawn, "#8ddfcb", "#a9e7d6", CANDY.cream, "#ffd9e8", "#ffc7e0"];
/** The iced top. #f6f1e8 is the white that does not bloom in sunlight. */
const SUMMIT = CANDY.icing;

const strataFor = (i: number, n: number) =>
  n - 1 >= STRATA.length
    ? STRATA[Math.min(i, STRATA.length - 1)]!
    : STRATA[Math.round((i * (STRATA.length - 1)) / Math.max(1, n - 1))]!;

/**
 * Three hills, fitted to the ground that is actually free.
 *
 * The meadow looks like an open field on the map, but the chocolate river cuts
 * diagonally across its west half, the candy-cane loop takes the east edge, the
 * planted roundel at (92, 92) holds a 7m circle and two hidden candies hold 4m
 * circles at (66, 62) and (94, 84). What is left is a band of open ground
 * between the river and the path, so that is how the hills are arranged: the
 * big one in the middle of it with a smaller one either side, and a saddle you
 * can walk through between each pair.
 *
 * Every hill is the same shape twice over. A wide apron at the bottom — a
 * single 0.28m step, three metres deep — is the planted rim: it is the only
 * tread with room for a gumdrop of any size, and its corners are where the
 * giants stand. Above it the steps are 0.52m and the treads are barely a metre
 * and a half, because that is what makes the thing read as a hill instead of a
 * stack of plates. The first version of this file used three-metre treads all
 * the way up and looked like a running track.
 *
 * The summit is offset from the base, which gives every hill a gentle side and
 * a steep one: the treads are widest where the summit has moved away. That side
 * is the way up and it faces where she comes from — the loop path for the big
 * hill, the saddle for the other two — and the narrow side is the shoulder you
 * stand on and look down.
 */
const HILLS: Hill[] = [
  {
    // the big one, at (85, 58): seven terraces to 3.40m, the high ground of the
    // meadow, climbed from the east where the candy-cane loop brings her in
    name: "sugarloaf",
    dx: 11,
    dz: -20,
    face: [1, 0],
    levels: [
      { w: 26.5, d: 24.5, dx: 0, dz: 0, rise: APRON_RISE },
      { w: 20.5, d: 18.5, dx: 0, dz: 0, rise: STEP_RISE },
      { w: 17.8, d: 16.0, dx: -0.25, dz: -0.15, rise: STEP_RISE },
      { w: 15.1, d: 13.5, dx: -0.5, dz: -0.3, rise: STEP_RISE },
      { w: 12.4, d: 11.0, dx: -0.75, dz: -0.45, rise: STEP_RISE },
      { w: 9.7, d: 8.5, dx: -1.0, dz: -0.6, rise: STEP_RISE },
      { w: 7.0, d: 6.0, dx: -1.25, dz: -0.75, rise: STEP_RISE },
    ],
    seed: 71041,
  },
  {
    // the south one, at (76, 82): four terraces to 1.84m, climbed from the
    // saddle it shares with the big hill, so crossing from one to the other is
    // a walk down and straight back up
    name: "south knoll",
    dx: 2,
    dz: 4,
    face: [0, -1],
    levels: [
      { w: 16.6, d: 15.6, dx: 0, dz: 0, rise: APRON_RISE },
      { w: 12.2, d: 11.2, dx: 0, dz: 0, rise: STEP_RISE },
      { w: 9.6, d: 8.6, dx: 0, dz: 0.1, rise: STEP_RISE },
      { w: 7.0, d: 6.0, dx: 0, dz: 0.2, rise: STEP_RISE },
    ],
    seed: 71043,
  },
  {
    // the little one, at (61, 45.5): two shallow steps and a top at 0.90m, for
    // the days when a seven-year-old wants to be on top of something
    // immediately
    name: "sugar button",
    dx: -13,
    dz: -32.5,
    face: [1, 0],
    levels: [
      { w: 13.9, d: 12.9, dx: 0, dz: 0, rise: APRON_RISE },
      { w: 9.5, d: 8.5, dx: 0, dz: 0, rise: 0.31 },
      { w: 7.0, d: 6.0, dx: -0.6, dz: 0, rise: 0.31 },
    ],
    seed: 71047,
  },
];

const rectFor = (h: Hill, i: number): Rect => {
  const l = h.levels[i]!;
  return rectOf(SUGAR.meadow.x + h.dx + l.dx, SUGAR.meadow.z + h.dz + l.dz, l.w, l.d);
};

/** The top of terrace `i`, counting the ground as 0. */
const topOf = (h: Hill, i: number) => h.levels.slice(0, i + 1).reduce((y, l) => y + l.rise, 0);

/** Where the way up crosses each rim: the summit's own line, so it runs straight. */
const stairLine = (h: Hill) => {
  const top = rectFor(h, h.levels.length - 1);
  return h.face[0] !== 0 ? midZ(top) : midX(top);
};

/**
 * Where a candy could sit on a summit: the front half of each flat top, with
 * the crowning gumdrop behind it and the way up arriving beside it.
 *
 * Fair warning for whoever places one: tools/check-layout.ts floods a flat grid
 * and treats anything over 0.75m as a wall, so a candy on the big hill or the
 * north knoll reports as UNREACHABLE even though she can walk to it. That is
 * the checker being 2D, not the hill being wrong — walk it and see. The little
 * hill's top is under that line, so a candy there passes the checker as well.
 * A candy rests 0.55m over what holds it, so the y to use is `y + 0.55`.
 */
export const HILL_TOPS: { x: number; z: number; y: number }[] = HILLS.map((h) => {
  const top = rectFor(h, h.levels.length - 1);
  return {
    x: midX(top) + h.face[0] * 1.4,
    z: midZ(top) + h.face[1] * 1.4,
    y: topOf(h, h.levels.length - 1),
  };
});

/* ----------------------------------------------------------- the planting */

type Spot = { x: number; z: number; room: number };

/**
 * Where a gumdrop may stand on a terrace: the corners of the tread, and points
 * spaced evenly along each side of it.
 *
 * Corners first, because a corner is the one place on a stepped hill that is
 * obviously deliberate — it is where two rims meet — and because the corner
 * pocket is the widest bit of tread there is, so that is where the big ones go.
 * Each spot carries the room it has: the tread it stands on is what sizes the
 * gumdrop, since the inner edge of a tread is the wall of the next terrace up
 * and anything wide enough to touch it would be a prop inside another prop and
 * an invisible shoulder she bumps into on the way past.
 *
 * The way up is left alone: nothing within 3.4m of the stair line on the face
 * side, so the staircase is never something to squeeze past.
 */
function rimSpots(outer: Rect, inner: Rect, face: Face, stair: number, spacing: number): Spot[] {
  const out: Spot[] = [];
  const tread = {
    north: inner.z0 - outer.z0,
    south: outer.z1 - inner.z1,
    west: inner.x0 - outer.x0,
    east: outer.x1 - inner.x1,
  };

  // the four corner pockets
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      const tx = sx < 0 ? tread.west : tread.east;
      const tz = sz < 0 ? tread.north : tread.south;
      const room = Math.min(tx, tz) / 2 - 0.35;
      if (room < 0.4) continue;
      out.push({
        x: sx < 0 ? (outer.x0 + inner.x0) / 2 : (outer.x1 + inner.x1) / 2,
        z: sz < 0 ? (outer.z0 + inner.z0) / 2 : (outer.z1 + inner.z1) / 2,
        room,
      });
    }
  }

  // then along each side, between the corners
  const sides: [number, number, 0 | 1, number, number][] = [
    // middle of the tread, its width, the axis it runs along, and from..to
    [(outer.z0 + inner.z0) / 2, tread.north, 0, inner.x0, inner.x1],
    [(outer.z1 + inner.z1) / 2, tread.south, 0, inner.x0, inner.x1],
    [(outer.x0 + inner.x0) / 2, tread.west, 1, inner.z0, inner.z1],
    [(outer.x1 + inner.x1) / 2, tread.east, 1, inner.z0, inner.z1],
  ];
  for (const [at, width, axis, from, to] of sides) {
    const room = width / 2 - 0.35;
    if (room < 0.4 || to - from < spacing) continue;
    const n = Math.max(1, Math.round((to - from) / spacing));
    for (let i = 0; i < n; i++) {
      const c = from + ((to - from) * (i + 0.5)) / n;
      out.push({ x: axis === 0 ? c : at, z: axis === 0 ? at : c, room });
    }
  }

  // and never on the stairs
  return out.filter((s) => {
    const onFace =
      face[0] > 0 ? s.x > inner.x1 : face[0] < 0 ? s.x < inner.x0 : face[1] > 0 ? s.z > inner.z1 : s.z < inner.z0;
    const perp = face[0] !== 0 ? s.z : s.x;
    return !(onFace && Math.abs(perp - stair) < 3.4);
  });
}

/** Plants one gumdrop, sized to the room it has; see `planter`. */
type Plant = (x: number, z: number, y: number, room: number) => void;

/**
 * The gumdrop planter.
 *
 * Every gumdrop in the meadow goes through here, so there is one place that
 * knows how much room each one has: the tread it stands on, and every gumdrop
 * already in the ground. The second half is not a hypothetical — three hills
 * whose skirts meet in a four-metre gap had eight pairs growing through each
 * other before this existed. A gumdrop that cannot make itself small enough to
 * fit is simply not planted.
 */
function planter(out: Prop[], seed: number): Plant {
  const rand = rng(seed);
  const taken: { x: number; z: number; y: number; r: number; top: number }[] = [];
  return (x, z, y, room) => {
    let r = Math.min(room, 0.48 * (1.1 + rand() * 1.6));
    const variant = Math.floor(rand() * 6);
    const ry = rand() * Math.PI * 2;
    for (const t of taken) {
      // one on a terrace and one on the grass below pass each other happily
      if (y >= t.top || t.y >= y + r * 1.96) continue;
      // square, not round: a model's collider is an axis-aligned box, so two
      // gumdrops 2m apart on the diagonal are only 1.4m apart as far as the
      // engine and the checker are concerned. Measuring the way they do is
      // what stopped the summit crown growing through the pair beside it.
      r = Math.min(r, Math.max(Math.abs(x - t.x), Math.abs(z - t.z)) - t.r - 0.3);
    }
    if (r < 0.38) return;
    const scale = r / 0.48;
    taken.push({ x, z, y, r, top: y + 0.94 * scale });
    out.push(model("gumdrop", x, z, { y, scale, variant, ry }));
  };
}

/** The clear ground between two hills' feet, which is the saddle she walks. */
function footGap(a: Hill, b: Hill) {
  const ra = rectFor(a, 0);
  const rb = rectFor(b, 0);
  const dx = Math.max(ra.x0 - rb.x1, rb.x0 - ra.x1);
  const dz = Math.max(ra.z0 - rb.z1, rb.z0 - ra.z1);
  return dx > 0 && dz > 0 ? Math.hypot(dx, dz) : Math.max(dx, dz);
}

/** How far a point is outside every hill's foot. Negative means it is on one. */
function offHill(x: number, z: number) {
  let worst = Infinity;
  for (const h of HILLS) {
    const r = rectFor(h, 0);
    const dx = Math.max(r.x0 - x, x - r.x1);
    const dz = Math.max(r.z0 - z, z - r.z1);
    worst = Math.min(worst, dx > 0 && dz > 0 ? Math.hypot(dx, dz) : Math.max(dx, dz));
  }
  return worst;
}

/** One hill: its terraces, its icing rims, its way up, and its planting. */
function hillProps(h: Hill, out: Prop[], plant: Plant, keepOut: [number, number][]) {
  const n = h.levels.length;
  const stair = stairLine(h);

  for (let i = 0; i < n; i++) {
    const r = rectFor(h, i);
    const top = topOf(h, i);
    const last = i + 1 === n;
    out.push(terrace(r, top, h.levels[i]!.rise, last ? SUMMIT : strataFor(i, n)));
    // Piping round the iced top and nowhere else. Every terrace used to get a
    // white lip and the hill came out looking like a municipal swimming pool:
    // at this scale a rim on a 1.3m tread is a painted line on a court. The
    // strata do that job anyway — the colour changes at every edge.
    if (last) out.push(...kerbs(r, top, h.face, stair, CANDY.blush));
    out.push(...stairStripes(r, last ? null : rectFor(h, i + 1), top, h.face, stair, CANDY.stripe));

    if (!last) {
      for (const s of rimSpots(r, rectFor(h, i + 1), h.face, stair, 7)) plant(s.x, s.z, top, Math.min(s.room, 1.15));
    } else {
      /*
       * The summit. One big gumdrop at the back, where it crowns the hill from
       * every direction, with a smaller one either side of it on the same line
       * and the whole front half left clear: the point of a flat top is that
       * she can stand on it, and that a candy can be hidden on it (HILL_TOPS).
       */
      const halfW = (r.x1 - r.x0) / 2;
      const halfD = (r.z1 - r.z0) / 2;
      const back = Math.min(halfW, halfD) - 1.5;
      const bx = midX(r) - h.face[0] * back;
      const bz = midZ(r) - h.face[1] * back;
      plant(bx, bz, top, Math.min(1.35, Math.min(halfW, halfD) - 0.5));
      // out to the shoulders of the top, across the way up rather than along it
      const across = (h.face[0] !== 0 ? halfD : halfW) - 0.97;
      for (const s of [-1, 1]) {
        plant(
          h.face[0] !== 0 ? bx : bx + s * across,
          h.face[0] !== 0 ? bz + s * across : bz,
          top,
          0.62,
        );
      }
    }
  }

  /*
   * The skirt: gumdrops standing on the grass round the foot, clear of the
   * bottom step by their own width so neither ever grows through the other.
   * These are the giants — nothing up on the terraces is allowed past 1.15m
   * across — and they are what make the terraces behind them read as ground
   * rather than as furniture.
   */
  const foot = rectFor(h, 0);
  const skirt = { x0: foot.x0 - 4.2, x1: foot.x1 + 4.2, z0: foot.z0 - 4.2, z1: foot.z1 + 4.2 };
  for (const s of rimSpots(skirt, foot, h.face, stair, 7.5)) {
    // a ring of big ones or nothing: a spot squeezed between two hills would
    // get a button, and a scattering of buttons round the foot is the look
    // this rebuild exists to get rid of
    if (!clearGround(s.x, s.z, 2, keepOut)) continue;
    // the bank is the river's, not the meadow's: plantingProps stands its
    // cotton candy and its lollipops 3.2m off the water, and a gumdrop planted
    // on top of one of them is two props inside each other. clearGround only
    // knows where the water is, so the last two metres are this rule's job.
    if (riverDistance(s.x, s.z) < 11) continue;
    const room = Math.min(s.room, offHill(s.x, s.z) - 0.4, 1.35);
    if (room < 0.62) continue;
    plant(s.x, s.z, 0, room);
  }
}

/**
 * The candies this region hides, from sugar-level.ts: the sour worm out in the
 * meadow and the cotton candy on its far side. The hills are fitted round them
 * — neither is under one — but the planting still asks, because a gumdrop
 * standing on a hidden sweet is a sweet she never finds.
 */
const MEADOW_CANDIES: [number, number][] = [
  [66, 62],
  [94, 84],
];

/**
 * Gumdrop Meadow: three terraced hills and everything planted on them.
 *
 * Replaces `meadowProps`. The old meadow put 70 gumdrops down at random and
 * called it a region; the ground itself never changed, so there was nothing to
 * walk up and nothing to look at from anywhere in particular, and she said so
 * twice.
 */
export function gumdropHills(keepOut: [number, number][] = MEADOW_CANDIES): Prop[] {
  const out: Prop[] = [];
  const plant = planter(out, 71059);
  for (const h of HILLS) hillProps(h, out, plant, keepOut);

  /*
   * The saddles: the gaps you walk through between one hill and the next.
   *
   * A pair of gumdrops stands either side of the line joining two hills, like
   * a gate, and the line itself stays clear — she runs through it, she does not
   * squeeze past it. Only pairs with a real gap between their feet get one: the
   * big hill and the south knoll are four metres apart, and a gate planted in a
   * four-metre gap is not a gate, it is the clutter this whole rebuild was
   * meant to get rid of. Anything that lands on a hill is dropped rather than
   * nudged, and the open lawn beyond stays open, because a park needs somewhere
   * to run.
   */
  const rand = rng(71071);
  const centre = (h: Hill) => [SUGAR.meadow.x + h.dx, SUGAR.meadow.z + h.dz] as [number, number];
  for (const [a, b] of [
    [HILLS[0]!, HILLS[1]!],
    [HILLS[0]!, HILLS[2]!],
  ] as [Hill, Hill][]) {
    const [ax, az] = centre(a);
    const [bx, bz] = centre(b);
    const len = Math.hypot(bx - ax, bz - az) || 1;
    if (footGap(a, b) < 7) continue;
    const nx = -(bz - az) / len;
    const nz = (bx - ax) / len;
    for (let t = 0.36; t <= 0.66; t += 0.28) {
      for (const s of [-1, 1]) {
        const x = ax + (bx - ax) * t + nx * s * 6.5;
        const z = az + (bz - az) * t + nz * s * 6.5;
        const room = Math.min(1.5, offHill(x, z) - 1.2);
        if (room < 0.5 || !clearGround(x, z, 3, keepOut)) continue;
        plant(x, z, 0, room);
        if (rand() < 0.45 && offHill(x + 2.8, z + 1.9) > 1.6) {
          out.push(model("cotton-candy", x + 2.8, z + 1.9, { scale: 1 + rand() * 0.5 }));
        }
      }
    }
  }

  /*
   * The approach. Two pairs of gumdrops standing between the loop path and the
   * big hill's east face, lined up with its stairs: from the path you see the
   * gap they make, and the gap points at the way up.
   */
  const big = HILLS[0]!;
  const bigFoot = rectFor(big, 0);
  const bigStair = stairLine(big);
  for (let i = 0; i < 2; i++) {
    const x = bigFoot.x1 + 5.6 + i * 3.6;
    for (const s of [-1, 1]) {
      const z = bigStair + s * (4.2 + i * 0.9);
      if (!clearGround(x, z, 2, keepOut)) continue;
      plant(x, z, 0, 1.5 - i * 0.35);
    }
  }
  return out;
}

/* ------------------------------------------------------------- the berms */

/**
 * A long low mound: two steps, a crest at 0.58m, and the height is the point.
 * The layout checker's reachability flood-fill walks over anything under 0.75m,
 * so a berm can never be the thing that cuts a candy off, however long it is,
 * and she runs over it without even slowing down. Anything taller belongs in
 * the meadow with the hills.
 *
 * Both slabs are thin enough (0.29m and 0.31m) to lap over whatever flat thing
 * they land on, and the bottom one is thin enough that the frosting keeps off
 * it altogether, for the reason APRON_RISE explains.
 */
const BERM_STEPS: [number, number][] = [
  // rise, how far this step stands back from the one below
  [APRON_RISE, 0],
  [0.3, 2.6],
];

/** The crest: what the planting down the ridge stands on. */
const BERM_TOP = BERM_STEPS.reduce((y, [rise]) => y + rise, 0);

function bermProps(x: number, z: number, w: number, d: number, seed: number): Prop[] {
  const out: Prop[] = [];
  const rand = rng(seed);
  const alongX = w > d;
  let top = 0;
  BERM_STEPS.forEach(([rise, back], step) => {
    top += rise;
    // the ends pull in further than the sides, so it tapers away rather than
    // stopping dead: a mound with square ends reads as a wall
    out.push(
      terrace(
        rectOf(x, z, w - back * (alongX ? 3 : 2), d - back * (alongX ? 2 : 3)),
        top,
        rise,
        STRATA[step]!,
      ),
    );
  });
  /*
   * A thin line of sweets down the crest. The berm's own ridge is a line that
   * already exists, and planting in this park follows lines, it never scatters:
   * gumdrops at a steady spacing with a swirl mint between each pair, like
   * bulbs down a verge. The spacing matters as well as the look — a gumdrop is
   * over the flood fill's 0.75m, so a tight row of them would be a hedge.
   */
  // the crest itself, less a metre of shoulder at each end: measuring the top
  // slab rather than the berm means a short berm gets one sweet in the middle
  // instead of two standing in each other
  const crest = (alongX ? w : d) - BERM_STEPS[1]![1] * 3 - 2.4;
  const at = (t: number, id: string, extra: Record<string, number>) =>
    out.push(model(id, alongX ? x + t : x, alongX ? z : z + t, { y: BERM_TOP, ...extra }));
  if (crest < 2) return out;
  const n = Math.max(1, Math.round(crest / 6));
  for (let i = 0; i < n; i++) {
    const t = -crest / 2 + (crest * (i + 0.5)) / n;
    at(t, "gumdrop", { scale: 0.85 + rand() * 0.5, variant: Math.floor(rand() * 6), ry: rand() * Math.PI * 2 });
    if (i + 1 < n) at(t + crest / (2 * n), "swirl-mint", { scale: 0.9 + rand() * 0.4 });
  }
  return out;
}

/**
 * Where the berms go.
 *
 * Every one of them lies along a line the park already has — the four runs of
 * the candy-cane loop, the two spokes into the plaza, and the straight reaches
 * of the chocolate river — and every one is axis-aligned, because the engine
 * gives a rotated box an axis-aligned collider and a 45-degree mound along the
 * river would be solid several metres from where it is drawn.
 *
 * They stand back far enough to leave a walkable verge between the path edge
 * and the foot of the mound, and they sit outside the avenue of lollipop trees
 * that plantingProps puts 6.4m off each path. Nothing is placed in the middle
 * of an open lawn: that is where she runs.
 */
const BERM_SITES: [number, number, number, number][] = [
  // beside the loop, inside it: x, z, w, d
  [20, -94, 26, 8],
  [-36, -92, 26, 9],
  [30, 94, 30, 9],
  [-94, -60, 9, 32],
  [-94, 40, 9, 26],
  [94, -42, 9, 28],
  // along the spokes into the plaza, back from the tree avenue
  [-32, 32, 22, 8],
  [76, 30, 18, 8],
  // and the river's straight reach south of the plaza: a pair facing each
  // other across the water, which is how this park plants a river bank
  [8, -36, 7, 20],
  [36, -40, 7, 18],
];

/**
 * Gentle relief for the rest of the park.
 *
 * `keepOut` is the hidden candies: a mound that swallowed one would make it
 * unfindable, so a site that cannot clear them all is simply dropped rather
 * than nudged — a berm is scenery, and scenery gives way.
 */
export function sugarBerms(keepOut: [number, number][]): Prop[] {
  const out: Prop[] = [];
  BERM_SITES.forEach(([x, z, w, d], i) => {
    // the whole footprint has to be clear, not just the middle of it
    const corners: [number, number][] = [
      [x, z],
      [x - w / 2, z - d / 2],
      [x + w / 2, z - d / 2],
      [x - w / 2, z + d / 2],
      [x + w / 2, z + d / 2],
      [x, z - d / 2],
      [x, z + d / 2],
    ];
    if (!corners.every(([cx, cz]) => clearGround(cx, cz, 1.5, keepOut))) return;
    out.push(...bermProps(x, z, w, d, 6100 + i * 37));
  });
  return out;
}
