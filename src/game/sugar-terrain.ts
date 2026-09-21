import { CANDY, SUGAR, clearGround } from "./sugar-rush";
import { model } from "./sugar-models";
import type { BoxProp, Prop } from "./types";

/**
 * Sugar Rush Park: the ground she walks over.
 *
 * The park was a 320m table with things standing on it. This gives it relief in
 * the only way the engine has — stacked slabs — and the whole module is written
 * round one number: her step-up is 0.62m (collision.ts), so every riser here is
 * 0.55m or less and she never has to jump. A wide flat slab is solid whatever
 * its `collide` flag says (colliders.ts), which is exactly what makes a stack of
 * them a staircase rather than a painting of one.
 *
 * Two things live here:
 *
 *   gumdropHills()  Gumdrop Meadow, rebuilt. It was 70 gumdrops scattered at
 *                   random over a flat field — sprinkled everywhere with no
 *                   thought or flow. Now it is three terraced hills she can run
 *                   up, and the gumdrops sit on and between them.
 *   sugarBerms()    long low mounds elsewhere, beside the loop and the river,
 *                   so the rest of the park stops reading as a table.
 *
 * Nothing here is placed by eye: every footprint is checked against
 * `clearGround`, which knows where the paths, the river, the plaza and the
 * hidden candies are.
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
    pos: [(r.x0 + r.x1) / 2, top - h / 2, (r.z0 + r.z1) / 2],
    size: [r.x1 - r.x0, h, r.z1 - r.z0],
    color,
  };
}

const KERB_W = 0.28;

/**
 * The icing edge round a terrace. Thin and `collide: false`, so the engine
 * builds no collider for it at all — she walks through it, which is what a
 * 28cm lip on the lip of a step has to do or it is a trip hazard she cannot
 * see. The runs stop short of each other rather than crossing at the corners:
 * two flat tops at one height, overlapping, is the flicker.
 */
function kerbs(r: Rect, top: number, face: Face, color: string): Prop[] {
  const out: Prop[] = [];
  const y = top + 0.12;
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const strip = (x: number, z: number, sx: number, sz: number): BoxProp => ({
    kind: "box",
    pos: [x, y - 0.06, z],
    size: [sx, 0.12, sz],
    color,
    collide: false,
  });
  /** The face side is open in the middle: that gap is the way up, from afar. */
  const GAP = 5.2;
  /**
   * One side. `open` leaves the middle out; the north and south runs own the
   * corners, so the east and west ones are short by a kerb's width at each end
   * and no two of them ever lie over each other.
   */
  const run = (along: "x" | "z", at: number, span: number, mid: number, open: boolean) => {
    for (const s of open ? [-1, 1] : [0]) {
      const len = open ? (span - GAP) / 2 : span;
      if (len < 0.8) continue;
      const c = open ? mid + s * (GAP / 2 + len / 2) : mid;
      out.push(along === "x" ? strip(c, at, len, KERB_W) : strip(at, c, KERB_W, len));
    }
  };
  const midX = (r.x0 + r.x1) / 2;
  const midZ = (r.z0 + r.z1) / 2;
  run("x", r.z0 + KERB_W / 2, w, midX, face[1] < 0);
  run("x", r.z1 - KERB_W / 2, w, midX, face[1] > 0);
  run("z", r.x0 + KERB_W / 2, d - KERB_W * 2, midZ, face[0] < 0);
  run("z", r.x1 - KERB_W / 2, d - KERB_W * 2, midZ, face[0] > 0);
  return out;
}

/**
 * Two sugar stripes up the face of the hill, one tread at a time.
 *
 * They are 30cm wide and non-colliding, so they are paint and nothing else.
 * The obvious thing — a wide sugar landing on each tread — is a trap: a wide
 * slab is solid however it is flagged, and a solid pad sitting on the very
 * edge she is stepping onto fails the step-up's headroom test and turns the
 * way up into a wall.
 */
function stairStripes(outer: Rect, inner: Rect | null, top: number, face: Face, color: string): Prop[] {
  const out: Prop[] = [];
  const y = top + 0.1;
  const alongX = face[0] !== 0;
  const from = alongX
    ? face[0] > 0
      ? outer.x1
      : outer.x0
    : face[1] > 0
      ? outer.z1
      : outer.z0;
  const toEdge = inner
    ? alongX
      ? face[0] > 0
        ? inner.x1
        : inner.x0
      : face[1] > 0
        ? inner.z1
        : inner.z0
    : from - (alongX ? face[0] : face[1]) * 2.4;
  const len = Math.abs(from - toEdge);
  if (len < 0.6) return out;
  const mid = (from + toEdge) / 2;
  const cross = alongX ? (outer.z0 + outer.z1) / 2 : (outer.x0 + outer.x1) / 2;
  for (const s of [-1, 1]) {
    out.push({
      kind: "box",
      pos: alongX ? [mid, y - 0.05, cross + s * 1.8] : [cross + s * 1.8, y - 0.05, mid],
      size: alongX ? [len, 0.1, 0.3] : [0.3, 0.1, len],
      color,
      collide: false,
    });
  }
  return out;
}

/* ----------------------------------------------------------- the hills */

type Level = { w: number; d: number; dx: number; dz: number };

type Hill = {
  /** offset from the meadow's centre, so moving the region moves the hills */
  dx: number;
  dz: number;
  /** rise per terrace. Under 0.62 with a margin, or she has to jump. */
  rise: number;
  face: Face;
  levels: Level[];
  seed: number;
};

/**
 * The strata. One ramp shared by all three hills, so they read as one place cut
 * from the same cake rather than three unrelated lumps: meadow green at the
 * bottom, then sponge, then blossom, then mint at the top. Pastels, because a
 * whole hillside of a saturated candy colour is what made the first fairground
 * look like a warning sign; the saturated colours arrive as gumdrops.
 */
const STRATA = ["#7ccb74", "#f2e3c0", "#ffc9de", "#bdf0e2"];

/**
 * Three hills, fitted to the ground that is actually free.
 *
 * The meadow looks like an open field on the map, but the chocolate river cuts
 * off its west corner, the loop path takes the east edge and two hidden candies
 * hold 4m circles at (66, 62) and (94, 84). What is left is an L of open ground,
 * and the three hills stand in it as a triangle — the big one east where the
 * path brings her in, the little one back to the west, the middle one south —
 * so she walks *between* them rather than past a row.
 *
 * Every hill's treads are wider on one side than the other. The wide side is
 * the way up and it faces somewhere she comes from; the narrow side is the
 * shoulder you look down. Each faces a different way, so whichever way she runs
 * into the meadow one of them is offering her a staircase.
 */
const HILLS: Hill[] = [
  {
    // the big one: four terraces to 2.08m, the high ground of the meadow,
    // climbed from the east where the candy-cane loop passes
    dx: 10,
    dz: -23,
    rise: 0.52,
    face: [1, 0],
    levels: [
      { w: 24, d: 21, dx: 0, dz: 0 },
      { w: 18.5, d: 16, dx: -1, dz: 0 },
      { w: 13.5, d: 11.5, dx: -2, dz: 0 },
      { w: 8, d: 7, dx: -2.5, dz: 0 },
    ],
    seed: 71041,
  },
  {
    // the middle one, south, climbed from the west: the saddle between it and
    // the big hill is the way through the meadow, so the way up opens onto it
    dx: 5,
    dz: -1,
    rise: 0.48,
    face: [-1, 0],
    levels: [
      { w: 16, d: 14, dx: 0, dz: 0 },
      { w: 11, d: 9.5, dx: 0.8, dz: 0.5 },
      { w: 6, d: 5.5, dx: 1.5, dz: 1 },
    ],
    seed: 71043,
  },
  {
    // the little one: two steps and a top barely over a metre, for the days
    // when a seven-year-old wants to be on top of something immediately
    dx: -11.5,
    dz: -27,
    rise: 0.55,
    face: [0, -1],
    levels: [
      { w: 11, d: 10, dx: 0, dz: 0 },
      { w: 6, d: 5.5, dx: 0, dz: -0.5 },
    ],
    seed: 71047,
  },
];

const rectFor = (h: Hill, i: number): Rect => {
  const l = h.levels[i]!;
  return rectOf(SUGAR.meadow.x + h.dx + l.dx, SUGAR.meadow.z + h.dz + l.dz, l.w, l.d);
};

/** The top of terrace `i`, counting the ground as 0. */
const topOf = (h: Hill, i: number) => (i + 1) * h.rise;

/**
 * Where a candy could sit on a summit: the clear half of each flat top, with
 * the crowning gumdrop behind it.
 *
 * Fair warning for whoever places one: tools/check-layout.ts floods a flat grid
 * and treats anything over 0.75m as a wall, so a candy up here reports as
 * UNREACHABLE even though she can walk to it. That is the checker being 2D, not
 * the hill being wrong — walk it and see.
 */
export const HILL_TOPS: { x: number; z: number; y: number }[] = HILLS.map((h) => {
  const top = rectFor(h, h.levels.length - 1);
  return {
    x: (top.x0 + top.x1) / 2 + h.face[0] * 1.3,
    z: (top.z0 + top.z1) / 2 + h.face[1] * 1.3,
    y: topOf(h, h.levels.length - 1),
  };
});

/**
 * Points spaced round the middle of a terrace's tread.
 *
 * A gumdrop goes at each one, sized to the tread it is standing on — the inner
 * edge of the tread is the wall of the next terrace up, and a gumdrop wide
 * enough to touch it would be a prop inside another prop and an invisible
 * shoulder she bumps into on the way past. The tread does the sizing, so the
 * wide side of the hill gets the big ones and the narrow side gets buttons.
 */
function treadSpots(outer: Rect, inner: Rect, face: Face, spacing: number) {
  const out: { x: number; z: number; room: number }[] = [];
  const edges: [Face, number, number, number, number, number][] = [
    // face, fixed axis is z: north edge, then south, then west, then east
    [[0, -1], (outer.z0 + inner.z0) / 2, inner.z0 - outer.z0, outer.x0, outer.x1, 0],
    [[0, 1], (outer.z1 + inner.z1) / 2, outer.z1 - inner.z1, outer.x0, outer.x1, 0],
    [[-1, 0], (outer.x0 + inner.x0) / 2, inner.x0 - outer.x0, inner.z0, inner.z1, 1],
    [[1, 0], (outer.x1 + inner.x1) / 2, outer.x1 - inner.x1, inner.z0, inner.z1, 1],
  ];
  for (const [ef, at, tread, from, to, axis] of edges) {
    if (tread < 1.2) continue;
    const span = to - from;
    const n = Math.max(1, Math.floor(span / spacing));
    for (let i = 0; i < n; i++) {
      const c = from + (span * (i + 0.5)) / n;
      const x = axis === 0 ? c : at;
      const z = axis === 0 ? at : c;
      // the way up stays clear: nothing to squeeze past on the stairs
      if (ef[0] === face[0] && ef[1] === face[1]) {
        const off = axis === 0 ? Math.abs(x - (outer.x0 + outer.x1) / 2) : Math.abs(z - (outer.z0 + outer.z1) / 2);
        if (off < 3.2) continue;
      }
      out.push({ x, z, room: tread / 2 - 0.45 });
    }
  }
  return out;
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
    let r = Math.min(room, 0.48 * (0.9 + rand() * 2.4));
    const variant = Math.floor(rand() * 6);
    const ry = rand() * Math.PI * 2;
    for (const t of taken) {
      // one on a terrace and one on the grass below pass each other happily
      if (y >= t.top || t.y >= y + r * 1.96) continue;
      r = Math.min(r, Math.hypot(x - t.x, z - t.z) - t.r - 0.3);
    }
    if (r < 0.38) return;
    const scale = r / 0.48;
    taken.push({ x, z, y, r, top: y + 0.94 * scale });
    out.push(model("gumdrop", x, z, { y, scale, variant, ry }));
  };
}

/** One hill: its terraces, its icing edges, its way up, and its planting. */
function hillProps(h: Hill, out: Prop[], plant: Plant, keepOut: [number, number][]) {
  const n = h.levels.length;

  for (let i = 0; i < n; i++) {
    const r = rectFor(h, i);
    const top = topOf(h, i);
    out.push(terrace(r, top, h.rise, STRATA[i % STRATA.length]!));
    out.push(...kerbs(r, top, h.face, CANDY.icing));
    out.push(...stairStripes(r, i + 1 < n ? rectFor(h, i + 1) : null, top, h.face, CANDY.sugar));

    if (i + 1 < n) {
      for (const s of treadSpots(r, rectFor(h, i + 1), h.face, 5.2)) plant(s.x, s.z, top, s.room);
    } else {
      /*
       * The summit. One big gumdrop at the back, where it crowns the hill from
       * every direction, with two small ones beside it and the front left
       * clear: the whole point of a flat top is that she can stand on it.
       */
      const cx = (r.x0 + r.x1) / 2;
      const cz = (r.z0 + r.z1) / 2;
      const w = Math.min(r.x1 - r.x0, r.z1 - r.z0);
      const back = w / 2 - 1.9;
      plant(cx - h.face[0] * back, cz - h.face[1] * back, top, Math.min(1.4, w / 2 - 0.5));
      for (const s of [-1, 1]) {
        plant(
          cx + (h.face[0] === 0 ? s * (w / 2 - 0.9) : -h.face[0] * (w / 2 - 0.9)),
          cz + (h.face[1] === 0 ? s * (w / 2 - 0.9) : -h.face[1] * (w / 2 - 0.9)),
          top,
          0.55,
        );
      }
    }
  }

  /*
   * The skirt: gumdrops standing on the grass round the foot, clear of the
   * bottom step by their own width so neither ever grows through the other.
   * They are the biggest ones on the hill, which is what makes the terraces
   * behind them read as ground rather than furniture.
   */
  const foot = rectFor(h, 0);
  const skirt = { x0: foot.x0 - 3.4, x1: foot.x1 + 3.4, z0: foot.z0 - 3.4, z1: foot.z1 + 3.4 };
  for (const s of treadSpots(skirt, foot, h.face, 7.5)) {
    if (!clearGround(s.x, s.z, 2, keepOut)) continue;
    plant(s.x, s.z, 0, Math.min(s.room, offHill(s.x, s.z) - 0.3, 1.9));
  }
}

/**
 * Gumdrop Meadow: three terraced hills and everything planted on them.
 *
 * Replaces `meadowProps`. The old meadow put 70 gumdrops down at random and
 * called it a region; the ground itself never changed, so there was nothing to
 * walk up and nothing to look at from anywhere in particular.
 */
export function gumdropHills(): Prop[] {
  const out: Prop[] = [];
  for (const h of HILLS) out.push(...hillProps(h));

  /*
   * The saddles: the gaps you walk through between one hill and the next.
   *
   * Gumdrops are stepped down the line joining each pair of hills, and anything
   * that lands on a hill or too close to one to stand clear of it is dropped
   * rather than nudged — the hills are built to fit the ground the river and
   * the hidden candies leave, so the gaps between them are narrow, and a
   * gumdrop wedged into one would be a gate she has to squeeze past. What
   * survives marks the way through; the open lawn beyond stays open, because a
   * park needs somewhere to run.
   */
  const rand = rng(71059);
  const centre = (h: Hill) => [SUGAR.meadow.x + h.dx, SUGAR.meadow.z + h.dz] as [number, number];
  for (const [a, b] of [
    [HILLS[0]!, HILLS[1]!],
    [HILLS[0]!, HILLS[2]!],
    [HILLS[1]!, HILLS[2]!],
  ] as [Hill, Hill][]) {
    const [ax, az] = centre(a);
    const [bx, bz] = centre(b);
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const nx = -(bz - az) / len;
    const nz = (bx - ax) / len;
    for (let t = 0.3; t <= 0.71; t += 0.2) {
      for (const s of [-1, 1]) {
        const x = ax + (bx - ax) * t + nx * s * 6;
        const z = az + (bz - az) * t + nz * s * 6;
        const room = Math.min(1.7, offHill(x, z) - 1.2);
        if (room < 0.5 || !clearGround(x, z, 3, [])) continue;
        out.push(...gumdrop(x, z, 0, room, rand));
        if (rand() < 0.4 && offHill(x + 2.6, z + 1.8) > 1.5) {
          out.push(model("cotton-candy", x + 2.6, z + 1.8, { scale: 1 + rand() * 0.5 }));
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
  for (let i = 0; i < 2; i++) {
    const x = bigFoot.x1 + 2.6 + i * 3.4;
    for (const s of [-1, 1]) {
      const z = (bigFoot.z0 + bigFoot.z1) / 2 + s * (4 + i * 0.8);
      if (!clearGround(x, z, 2, [])) continue;
      out.push(...gumdrop(x, z, 0, 1.5 - i * 0.3, rand));
    }
  }
  return out;
}

/* ------------------------------------------------------------- the berms */

/**
 * A long low mound. Two steps and a top at 0.72m, and the height is the point:
 * the layout checker's reachability flood-fill walks over anything under 0.75m,
 * so a berm can never be the thing that cuts a candy off, however long it is.
 * Anything taller belongs in the meadow with the hills.
 */
const BERM_RISE = 0.36;
const BERM_GREENS = ["#6ac96e", "#7ad47a"];

function bermProps(x: number, z: number, w: number, d: number, seed: number): Prop[] {
  const out: Prop[] = [];
  const rand = rng(seed);
  const alongX = w > d;
  for (let i = 0; i < 2; i++) {
    const back = i * 2.4;
    const r = rectOf(x, z, w - back * (alongX ? 3 : 2), d - back * (alongX ? 2 : 3));
    out.push(terrace(r, (i + 1) * BERM_RISE, BERM_RISE, BERM_GREENS[i]!));
  }
  // a thin line of gumdrops down the ridge: the berm's own crest is a line that
  // already exists, and planting follows lines here, it never scatters
  const ridge = alongX ? w - 9.6 : d - 9.6;
  const n = Math.max(2, Math.round(ridge / 5));
  for (let i = 0; i < n; i++) {
    const t = -ridge / 2 + (ridge * (i + 0.5)) / n;
    out.push(
      model("gumdrop", alongX ? x + t : x, alongX ? z : z + t, {
        y: BERM_RISE * 2,
        scale: 0.8 + rand() * 0.6,
        variant: Math.floor(rand() * 6),
        ry: rand() * Math.PI * 2,
      }),
    );
  }
  return out;
}

/**
 * Where the berms go.
 *
 * Every one of them lies along a line the park already has — the four runs of
 * the candy-cane loop, and the straight reaches of the chocolate river — and
 * every one is axis-aligned, because the engine gives a rotated box an
 * axis-aligned collider and a 45-degree mound along the river would be solid
 * several metres from where it is drawn.
 *
 * They stand back far enough to leave a walkable verge between the path edge
 * and the foot of the mound, and they sit outside the avenue of lollipop trees
 * that plantingProps puts 6.4m off each path. Nothing is placed in the middle
 * of an open lawn: that is where she runs.
 */
const BERM_SITES: [number, number, number, number][] = [
  // beside the loop, inside it: x, z, w, d
  [-40, -94, 30, 9],
  [20, -94, 26, 8],
  [30, 94, 30, 9],
  [-94, -60, 9, 32],
  [94, -40, 9, 30],
  // along the river's straight north-south reach, one bank each
  [17, 2, 7, 20],
  [52, 34, 7, 16],
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
