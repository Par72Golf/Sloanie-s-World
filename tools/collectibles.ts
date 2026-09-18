/**
 * Stickers, the sticker book and the pet quest, through the real colliders
 * and the real collision code.
 *
 * For every spot in src/game/collectibles.ts it proves:
 *   - it is in the area its theme says (the frog at the big pond, the snail
 *     inside the hedge maze, the mushroom in an M cell of the cave, ...)
 *   - a capsule can stand there: not inside or on top of a solid (the floor it
 *     stands on is at most a step-up high), and the floating pickup does not
 *     poke into anything
 *   - it is not in water (the goldfish floats over the pond, and must be within
 *     pick-up reach of a standing spot on the dock or bank)
 *   - it is at least 4m (horizontally) from every dumpling and all of their
 *     alternates, juice boxes, accessories, other stickers and treats, and 3m
 *     from Emmett's rehide spots
 *   - it is reachable on foot from the spawn without jumping: Dijkstra over a
 *     0.5m grid of standing states (a cell's floor is the highest collider top
 *     under the capsule within a step-up of where she came from; a collider
 *     blocks if it rises past the floor tolerance and starts below her head,
 *     so cave roofs and dugout lids are walked under), and then she actually
 *     walks the found path with moveAndCollide at 60Hz and must arrive within
 *     0.5m, never stall and never hop.
 * For the paw trail: 20-40 points, 3-5m apart, each on walkable dry ground,
 * every segment walkable in a straight line, starting at the farm and ending at
 * the cave entrance, and walked end to end through the collision code.
 *
 * Run:  npx jiti tools/collectibles.ts                 (exits 1 on any failure)
 *       npx jiti tools/collectibles.ts map <x> <z> [r]  ASCII map of standing cells
 *       npx jiti tools/collectibles.ts path <x> <z>     walking route from spawn
 *       npx jiti tools/collectibles.ts trail [spacing]  suggest a paw trail
 */
import { LEVELS } from "../src/game/levels";
import { boxIsBuilt, boxIsSolid, collidersFor, isSolidProp, type LabelledAABB } from "../src/game/colliders";
import { aabbFromCenter, moveAndCollide, type AABB, type Capsule } from "../src/game/collision";
import { GRAVITY, PLAYER_H, PLAYER_W, WALK } from "../src/game/tuning";
import { CAVE, CAVE_MAP, CAVE_SPOTS, caveEntrance, isOpen } from "../src/game/cave";
import { splashJets } from "../src/game/splash";
import { BOOTHS, CAROUSEL, boothStand, carouselGate } from "../src/game/carnival";
import { PET_QUEST, STICKER_BOOK, STICKER_SPOTS } from "../src/game/collectibles";
import { GOLF } from "../src/game/park";

type V3 = [number, number, number];
const level = LEVELS[0]!;
const boxes = collidersFor(level);
const DT = 1 / 60;
const STEP_UP = 0.62;
const FLOOR_TOL = 0.03;
const PICKUP_R = 1.7;
const MIN_GAP = 4;
const REHIDE_GAP = 3;

/* ------------------------------------------------------------ broad phase */

const HB = 4;
const hash = new Map<number, number[]>();
const hkey = (ix: number, iz: number) => (ix + 1000) * 4096 + (iz + 1000);
boxes.forEach((b, i) => {
  for (let ix = Math.floor(b.minX / HB); ix <= Math.floor(b.maxX / HB); ix++) {
    for (let iz = Math.floor(b.minZ / HB); iz <= Math.floor(b.maxZ / HB); iz++) {
      const k = hkey(ix, iz);
      let list = hash.get(k);
      if (!list) hash.set(k, (list = []));
      list.push(i);
    }
  }
});
const stamp = new Uint32Array(boxes.length);
let stampGen = 0;
/** Colliders whose footprint strictly overlaps the rectangle. */
function query(minX: number, maxX: number, minZ: number, maxZ: number): LabelledAABB[] {
  stampGen++;
  const out: LabelledAABB[] = [];
  for (let ix = Math.floor(minX / HB); ix <= Math.floor(maxX / HB); ix++) {
    for (let iz = Math.floor(minZ / HB); iz <= Math.floor(maxZ / HB); iz++) {
      const list = hash.get(hkey(ix, iz));
      if (!list) continue;
      for (const i of list) {
        if (stamp[i] === stampGen) continue;
        stamp[i] = stampGen;
        const b = boxes[i]!;
        if (minX < b.maxX && maxX > b.minX && minZ < b.maxZ && maxZ > b.minZ) out.push(b);
      }
    }
  }
  return out;
}

/**
 * Built props she walks straight through: fence rails, net bands, poles and
 * handrails (non-colliding and under 0.35m thick). Nothing blocks her there,
 * but paw prints running under a paddock rail or a pickup floating inside a
 * pole would look wrong, so the trail and the pickups keep clear of them.
 * Ground markings (court lines) are not included: they start below 0.25m and
 * are not tall.
 */
const thin: (AABB & { label: string })[] = level.props.flatMap((p) => {
  if (p.kind !== "box" || !boxIsBuilt(p) || boxIsSolid(p) || !isSolidProp(p.color)) return [];
  const b = aabbFromCenter(p.pos[0], p.pos[1], p.pos[2], p.size[0], p.size[1], p.size[2]);
  const raised = b.minY > 0.25 && b.minY < 1.4;
  const upright = b.maxY - b.minY > 0.5 && b.minY < 1.4;
  return raised || upright ? [{ ...b, label: `thin ${p.color} at (${p.pos[0].toFixed(1)}, ${p.pos[2].toFixed(1)})` }] : [];
});
const thinAt = (x: number, z: number, pad: number) =>
  thin.find((b) => x + pad > b.minX && x - pad < b.maxX && z + pad > b.minZ && z - pad < b.maxZ);
/** Set while generating a paw trail: routes keep off thin props too. */
let avoidThin = false;

const inWater = (x: number, z: number, margin = 0) =>
  (level.water ?? []).some((w) => Math.hypot(x - w.x, z - w.z) < w.r + margin);

/**
 * The floor she would stand on with her capsule centred at (x, z), arriving
 * from height fromY, or null if something blocks her there. Trampolines are
 * treated as blocked (landing on one launches her), and so is wading into water.
 */
function standAt(x: number, z: number, fromY: number): number | null {
  const hw = PLAYER_W;
  const under = query(x - hw, x + hw, z - hw, z + hw);
  let floor = level.groundY;
  for (const b of under) if (b.maxY <= fromY + STEP_UP + 1e-6 && b.maxY > floor) floor = b.maxY;
  for (const b of under) {
    if (b.label === "trampoline") return null;
    if (b.maxY - floor > FLOOR_TOL && b.minY < floor + PLAYER_H) return null;
  }
  if (floor < 0.1 && inWater(x, z)) return null;
  if (avoidThin && thinAt(x, z, 0.5)) return null;
  return floor;
}

/** Something she cannot step over within `pad` of her capsule: routes keep off corners. */
function tight(x: number, z: number, floor: number, pad: number) {
  const hw = PLAYER_W + pad;
  for (const b of query(x - hw, x + hw, z - hw, z + hw)) {
    if (b.label === "trampoline") return true;
    if (b.maxY - floor > STEP_UP + 0.01 && b.minY < floor + PLAYER_H) return true;
  }
  return false;
}

/* ------------------------------------------------------------ the search */

const G = 0.5;
const B = level.bounds;
const W = Math.round((B.maxX - B.minX) / G) + 1;
const H = Math.round((B.maxZ - B.minZ) / G) + 1;
const SLOTS = 4;
const cellX = (ix: number) => B.minX + ix * G;
const cellZ = (iz: number) => B.minZ + iz * G;
const ixOf = (x: number) => Math.round((x - B.minX) / G);
const izOf = (z: number) => Math.round((z - B.minZ) / G);

type Search = { dist: Float64Array; prev: Int32Array; floor: Float32Array; start: number };

/** Dijkstra over standing states (cell, floor height) from a start point. */
function search(sx: number, sz: number, sy = 0): Search {
  const N = W * H * SLOTS;
  const dist = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const floor = new Float32Array(N).fill(NaN);
  const slotOf = (cell: number, y: number) => {
    for (let s = 0; s < SLOTS; s++) {
      const f = floor[cell * SLOTS + s]!;
      if (Number.isNaN(f)) {
        floor[cell * SLOTS + s] = y;
        return cell * SLOTS + s;
      }
      if (Math.abs(f - y) < 0.01) return cell * SLOTS + s;
    }
    return -1;
  };
  // binary heap
  const hk: number[] = [];
  const hv: number[] = [];
  const push = (k: number, v: number) => {
    let i = hk.length;
    hk.push(k);
    hv.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hk[p]! <= k) break;
      hk[i] = hk[p]!;
      hv[i] = hv[p]!;
      i = p;
    }
    hk[i] = k;
    hv[i] = v;
  };
  const pop = () => {
    const v = hv[0]!;
    const lk = hk.pop()!;
    const lv = hv.pop()!;
    if (hk.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= hk.length) break;
        const r = l + 1;
        const c = r < hk.length && hk[r]! < hk[l]! ? r : l;
        if (hk[c]! >= lk) break;
        hk[i] = hk[c]!;
        hv[i] = hv[c]!;
        i = c;
      }
      hk[i] = lk;
      hv[i] = lv;
    }
    return v;
  };

  const six = ixOf(sx);
  const siz = izOf(sz);
  const f0 = standAt(cellX(six), cellZ(siz), sy + 0.05);
  const start = f0 == null ? -1 : slotOf(siz * W + six, f0);
  if (start < 0) return { dist, prev, floor, start };
  dist[start] = 0;
  push(0, start);
  const dirs: [number, number, number][] = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, Math.SQRT2],
    [1, -1, Math.SQRT2],
    [-1, 1, Math.SQRT2],
    [-1, -1, Math.SQRT2],
  ];
  let pops = 0;
  while (hk.length) {
    const d0 = hk[0]!;
    const st = pop();
    if (d0 > dist[st]!) continue;
    if (process.env.PROGRESS && ++pops % 50000 === 0) console.log(`  ${pops} states, heap ${hk.length}, d ${d0.toFixed(0)}`);
    const cell = Math.floor(st / SLOTS);
    const ix = cell % W;
    const iz = Math.floor(cell / W);
    const y = floor[st]!;
    for (const [dx, dz, len] of dirs) {
      const nx = ix + dx;
      const nz = iz + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const f = standAt(cellX(nx), cellZ(nz), y);
      if (f == null) continue;
      if (dx && dz) {
        // no cutting corners: both orthogonal cells must be standable too
        if (standAt(cellX(nx), cellZ(iz), y) == null || standAt(cellX(ix), cellZ(nz), y) == null) continue;
      }
      const ns = slotOf(nz * W + nx, f);
      if (ns < 0) continue;
      const penalty = tight(cellX(nx), cellZ(nz), f, 0.35) ? 3 : tight(cellX(nx), cellZ(nz), f, 0.8) ? 0.6 : 0;
      const nd = d0 + G * len * (1 + penalty);
      if (nd < dist[ns]!) {
        dist[ns] = nd;
        prev[ns] = st;
        push(nd, ns);
      }
    }
  }
  return { dist, prev, floor, start };
}

/** Reached standing states at (x, z)'s cell: [state, floor]. */
function statesAt(s: Search, x: number, z: number): [number, number][] {
  const ix = ixOf(x);
  const iz = izOf(z);
  if (ix < 0 || iz < 0 || ix >= W || iz >= H) return [];
  const out: [number, number][] = [];
  for (let k = 0; k < SLOTS; k++) {
    const st = (iz * W + ix) * SLOTS + k;
    if (Number.isFinite(s.dist[st]!)) out.push([st, s.floor[st]!]);
  }
  return out;
}

/** Grid route to a state, as [x, z, floor] points, and its length in metres. */
function route(s: Search, st: number) {
  const pts: V3[] = [];
  for (let k = st; k >= 0; k = s.prev[k]!) {
    const cell = Math.floor(k / SLOTS);
    pts.unshift([cellX(cell % W), cellZ(Math.floor(cell / W)), s.floor[k]!]);
  }
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  return { pts, len };
}

/* ------------------------------------------------------------ walking */

type Walk = { ok: boolean; x: number; y: number; z: number; err: number; metres: number; why: string };

/** Walk her along points with moveAndCollide, no jumping; she must end within 0.5m of the last point. */
function walk(pts: [number, number][], startY = 0): Walk {
  const [sx, sz] = pts[0]!;
  const c: Capsule = { x: sx, y: startY + 0.3, z: sz, hw: PLAYER_W, h: PLAYER_H, hd: PLAYER_W };
  let vy = 0;
  for (let i = 0; i < 20; i++) {
    vy -= GRAVITY * DT;
    vy = moveAndCollide(c, 0, vy, 0, query(c.x - 2, c.x + 2, c.z - 2, c.z + 2), DT, level.groundY).vy;
  }
  let i = 1;
  let best = Infinity;
  let bestI = 0;
  let stall = 0;
  let metres = 0;
  const last = pts.length - 1;
  const maxFrames = 60 * 600;
  for (let f = 0; f < maxFrames; f++) {
    while (i < last && Math.hypot(pts[i]![0] - c.x, pts[i]![1] - c.z) < 0.6) i++;
    const [tx, tz] = pts[i]!;
    const dx = tx - c.x;
    const dz = tz - c.z;
    const d = Math.hypot(dx, dz);
    if (i === last && d < 0.08) break;
    const sp = Math.min(WALK, d / DT);
    const px = c.x;
    const pz = c.z;
    vy -= GRAVITY * DT;
    const r = moveAndCollide(c, (dx / d) * sp, vy, (dz / d) * sp, query(c.x - 2, c.x + 2, c.z - 2, c.z + 2), DT, level.groundY);
    vy = r.vy;
    const moved = Math.hypot(c.x - px, c.z - pz);
    metres += moved;
    if (moved > 1) return { ok: false, x: c.x, y: c.y, z: c.z, err: Infinity, metres, why: `teleported ${moved.toFixed(2)}m at (${px.toFixed(1)}, ${pz.toFixed(1)})` };
    if (i > bestI) {
      bestI = i;
      best = d;
      stall = 0;
    } else if (d < best - 0.02) {
      best = d;
      stall = 0;
    } else if (++stall > 90) {
      return { ok: false, x: c.x, y: c.y, z: c.z, err: Math.hypot(pts[last]![0] - c.x, pts[last]![1] - c.z), metres, why: `stalled at (${c.x.toFixed(2)}, ${c.y.toFixed(2)}, ${c.z.toFixed(2)}) heading for (${tx}, ${tz})` };
    }
  }
  // stand still a moment so a step down or a fall has finished before reading her height
  for (let f = 0; f < 30; f++) {
    vy -= GRAVITY * DT;
    vy = moveAndCollide(c, 0, vy, 0, query(c.x - 2, c.x + 2, c.z - 2, c.z + 2), DT, level.groundY).vy;
  }
  const err = Math.hypot(pts[last]![0] - c.x, pts[last]![1] - c.z);
  return { ok: err <= 0.5, x: c.x, y: c.y, z: c.z, err, metres, why: err <= 0.5 ? "" : `ended ${err.toFixed(2)}m short` };
}

/* ------------------------------------------------------------ the park's things */

type Thing = { name: string; x: number; z: number };
const pickups: Thing[] = [];
for (const d of level.dumplings) {
  pickups.push({ name: `dumpling ${d.id}`, x: d.pos[0], z: d.pos[2] });
  (d.alts ?? []).forEach((a, i) => pickups.push({ name: `dumpling ${d.id} alt${i + 1}`, x: a.pos[0], z: a.pos[2] }));
}
for (const [x, z] of level.juice ?? []) pickups.push({ name: `juice (${x}, ${z})`, x, z });
for (const a of level.accessories ?? []) pickups.push({ name: `accessory ${a.id}`, x: a.pos[0], z: a.pos[2] });
const rehide: Thing[] = (level.rehideSpots ?? []).map((r) => ({ name: `rehide ${r.name}`, x: r.pos[0], z: r.pos[2] }));

const [ex, ez] = caveEntrance();
const caveCell = (x: number, z: number) => {
  const c = Math.floor((x - CAVE.x0) / CAVE.cell);
  const r = Math.floor((CAVE.z0 - z) / CAVE.cell);
  return CAVE_MAP[r]?.[c];
};
const inRect = (x: number, z: number, minX: number, maxX: number, minZ: number, maxZ: number) =>
  x >= minX && x <= maxX && z >= minZ && z <= maxZ;
const near = (x: number, z: number, cx: number, cz: number, r: number) => Math.hypot(x - cx, z - cz) <= r;
const rectDist = (x: number, z: number, minX: number, maxX: number, minZ: number, maxZ: number) =>
  Math.hypot(Math.max(minX - x, 0, x - maxX), Math.max(minZ - z, 0, z - maxZ));

const barn = level.props.find((p) => p.kind === "house" && p.x === -76 && p.z === -140);
const barnBox = barn && barn.kind === "house" ? { minX: barn.x - (barn.w ?? 6) / 2, maxX: barn.x + (barn.w ?? 6) / 2, minZ: barn.z - (barn.d ?? 5) / 2, maxZ: barn.z + (barn.d ?? 5) / 2 } : null;
const tents = level.props.filter((p) => p.kind === "tent") as { x: number; z: number }[];
const tractor = level.props.find((p) => p.kind === "tractor") as { x: number; z: number } | undefined;
const maze = { minX: -42 - 7 * 2.4, maxX: -42 + 7 * 2.4, minZ: -18 - 7 * 2.4, maxZ: -18 + 7 * 2.4 };

/** Where each sticker's theme says it belongs. */
const AREA: Record<string, (x: number, z: number) => boolean> = {
  frog: (x, z) => { const d = Math.hypot(x, z + 42); return d > 9.4 && d < 16; },
  dragonfly: (x, z) => { const d = Math.hypot(x + 48, z + 48); return d > 5.4 && d < 11; },
  goldfish: (x, z) => near(x, z, 0, -42, 5.5),
  butterfly: (x, z) => inRect(x, z, -61.4, -50, 18.6, 35.4),
  // the flower bed moved to (10, 30) when the walkways went in
  ladybug: (x, z) => inRect(x, z, 5, 15, 25, 35),
  bee: (x, z) => inRect(x, z, 37, 59, 41, 63),
  apple: (x, z) => inRect(x, z, 37, 59, 41, 63),
  tractor: (x, z) => !!tractor && near(x, z, tractor.x, tractor.z, 5),
  chicken: (x, z) => inRect(x, z, -63, -41, -145, -131),
  sunflower: (x, z) => inRect(x, z, -83, -65, -125, -116),
  horse: (x, z) => { const d = Math.max(Math.abs(x - CAROUSEL.x), Math.abs(z - CAROUSEL.z)); return d > CAROUSEL.fence + 0.3 && d < CAROUSEL.fence + 4; },
  balloon: (x, z) => inRect(x, z, -31, -2, 59.5, 63),
  popcorn: (x, z) => near(x, z, CAROUSEL.x, CAROUSEL.z - CAROUSEL.fence - 4.2, 5.5),
  ferriswheel: (x, z) => !!level.ride && near(x, z, level.ride.x, level.ride.z + 4, 8),
  mushroom: (x, z) => caveCell(x, z) === "M",
  crystal: (x, z) => caveCell(x, z) === "C",
  bat: (x, z) => caveCell(x, z) === ".",
  tent: (x, z) => tents.some((t) => near(x, z, t.x, t.z, 4)),
  marshmallow: (x, z) => !!level.campfire && near(x, z, level.campfire.x, level.campfire.z, 4.5),
  owl: (x, z) => x < -110 && !near(x, z, -140, 12, 12),
  squirrel: (x, z) => near(x, z, -140, 12, 9),
  baseball: (x, z) => inRect(x, z, -28, 28, -102, -64),
  tennisball: (x, z) => inRect(x, z, 79.25, 110.75, 10.5, 41.5),
  basketball: (x, z) => inRect(x, z, 86.5, 103.5, -48, -20),
  soccerball: (x, z) => inRect(x, z, 110, 150, -73, -47),
  // by a flag on any of the mini golf greens, wherever park.ts puts them
  // by a cup, but never on a green: the greens are a playing surface and a
  // sticker sitting on one is in the way of the hole (tools/spread.ts)
  golfflag: (x, z) =>
    GOLF.laneDx.some((dx) => near(x, z, GOLF.x + dx, GOLF.z + GOLF.cupDz, 4.5)) &&
    !GOLF.laneDx.some(
      (dx) =>
        Math.abs(x - (GOLF.x + dx)) <= GOLF.halfW + GOLF.wallT &&
        Math.abs(z - GOLF.z) <= GOLF.halfD + GOLF.wallT,
    ),
  beachball: (x, z) => inRect(x, z, -57, -23, 125, 147),
  rainbow: (x, z) => level.splash != null && near(x, z, level.splash.x, level.splash.z, 13),
  sneaker: (x, z) => inRect(x, z, -5, 21, 127, 145),
  snail: (x, z) => inRect(x, z, maze.minX + 1.2, maze.maxX - 1.2, maze.minZ + 1.2, maze.maxZ - 1.2),
};

/** Landmarks the treats are named after, and how near a treat must be to one. */
const TREAT_AREA: Record<string, (x: number, z: number) => boolean> = {
  "the slide": (x, z) => near(x, z, 22, 8, 6),
  "the swings": (x, z) => near(x, z, -106, -30, 6),
  "the houses": (x, z) => z > 100 && z < 118 && x > -70 && x < 70,
  "the pavilion": (x, z) => inRect(x, z, 124, 140, 53, 67),
  "the treehouse": (x, z) => near(x, z, 54.2, -46, 10),
  "the windmill": (x, z) => near(x, z, -40, -124, 4),
  "the mountain": (x, z) => rectDist(x, z, 52, 94, -149, -113) < 6,
};

/* ------------------------------------------------------------ debug modes */

const [mode, a1, a2, a3] = process.argv.slice(2);
const spawn = level.spawn;
const t0 = Date.now();
const lap = (what: string) => process.env.PROGRESS && console.log(`  [${((Date.now() - t0) / 1000).toFixed(1)}s] ${what}`);
const fromSpawn = search(spawn[0], spawn[2], spawn[1]);
if (fromSpawn.start < 0) {
  console.log("FAIL spawn is not standable");
  process.exit(1);
}
const searchMs = Date.now() - t0;

const allSpots: { name: string; x: number; z: number; kind: string }[] = [
  ...STICKER_SPOTS.map((s) => ({ name: `sticker ${s.id}`, x: s.pos[0], z: s.pos[2], kind: "S" })),
  { name: "sticker book", x: STICKER_BOOK.pos[0], z: STICKER_BOOK.pos[2], kind: "B" },
  ...PET_QUEST.treats.map((t, i) => ({ name: `treat ${i + 1} (${t.area})`, x: t.pos[0], z: t.pos[2], kind: "T" })),
];

if (mode === "map") {
  const cx = Number(a1);
  const cz = Number(a2);
  const r = Number(a3 ?? 10);
  console.log(`standing cells round (${cx}, ${cz}), 0.5m grid, north (-z) at the top, east (+x) to the right`);
  console.log("  .  reached from spawn   :  reached, raised floor (>0.1)   -  reached but within 4m of a pickup/other spot");
  console.log("  #  blocked   ~ water   ' ' standable but unreached   P pickup   S sticker   T treat   B book   @ centre");
  const header = [];
  for (let x = cx - r; x <= cx + r; x += G) header.push(Math.abs((x % 5) + 0) < 1e-6 ? "|" : " ");
  console.log(`         ${header.join("")}`);
  for (let z = cz - r; z <= cz + r; z += G) {
    let line = "";
    for (let x = cx - r; x <= cx + r; x += G) {
      const gx = cellX(ixOf(x));
      const gz = cellZ(izOf(z));
      const mark =
        pickups.find((p) => Math.abs(p.x - gx) < 0.25 && Math.abs(p.z - gz) < 0.25) ? "P" :
        allSpots.find((p) => Math.abs(p.x - gx) < 0.25 && Math.abs(p.z - gz) < 0.25)?.kind;
      if (mark) { line += mark; continue; }
      if (Math.abs(gx - cx) < 0.25 && Math.abs(gz - cz) < 0.25) { line += "@"; continue; }
      const st = statesAt(fromSpawn, gx, gz);
      if (st.length) {
        const f = st[0]![1];
        const crowded = pickups.some((p) => near(gx, gz, p.x, p.z, MIN_GAP)) || allSpots.some((p) => near(gx, gz, p.x, p.z, MIN_GAP));
        line += crowded ? "-" : f > 0.1 ? ":" : ".";
      } else if (inWater(gx, gz)) line += "~";
      else line += standAt(gx, gz, 0) == null ? "#" : " ";
    }
    console.log(`${cellZ(izOf(z)).toFixed(1).padStart(8)} ${line}`);
  }
  process.exit(0);
}

if (mode === "path") {
  const x = Number(a1);
  const z = Number(a2);
  const st = statesAt(fromSpawn, x, z);
  if (!st.length) {
    console.log(`(${x}, ${z}) is not reachable from spawn`);
    process.exit(1);
  }
  const rt = route(fromSpawn, st[0]![0]);
  const w = walk(rt.pts.map((p) => [p[0], p[1]] as [number, number]).concat([[x, z]]), spawn[1]);
  console.log(`route ${rt.len.toFixed(1)}m, floor ${st[0]![1].toFixed(3)}; walked ${w.metres.toFixed(1)}m ${w.ok ? "ok" : "FAIL " + w.why}`);
  process.exit(0);
}

if (mode === "trail") {
  const spacing = Number(a1 ?? 4);
  const [hx, , hz] = PET_QUEST.home;
  avoidThin = true;
  const s = search(hx, hz, 0);
  const st = statesAt(s, ex, ez + 1.5);
  if (!st.length) {
    console.log("cave entrance not reachable from home");
    process.exit(1);
  }
  const rt = route(s, st[0]![0]);
  // resample evenly by distance along the route, from the home to just outside the entrance
  const pts: [number, number][] = [...rt.pts.map((p) => [p[0], p[1]] as [number, number]), [ex, ez + 1.5]];
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  const total = cum[cum.length - 1]!;
  const n = Math.max(1, Math.round(total / spacing));
  const out: [number, number][] = [];
  let j = 1;
  for (let k = 0; k <= n; k++) {
    const at = (total * k) / n;
    while (j < pts.length - 1 && cum[j]! < at) j++;
    const seg = cum[j]! - cum[j - 1]!;
    const t = seg > 0 ? (at - cum[j - 1]!) / seg : 0;
    const x = pts[j - 1]![0] + (pts[j]![0] - pts[j - 1]![0]) * t;
    const z = pts[j - 1]![1] + (pts[j]![1] - pts[j - 1]![1]) * t;
    out.push([Math.round(x * 10) / 10, Math.round(z * 10) / 10]);
  }
  console.log(`route ${rt.len.toFixed(1)}m, ${out.length} points`);
  for (let i = 0; i < out.length; i += 6) console.log("    " + out.slice(i, i + 6).map(([x, z]) => `[${x}, ${z}],`).join(" "));
  process.exit(0);
}

/* ------------------------------------------------------------ the checks */

type Row = { name: string; area: string; pos: string; floor: string; walkM: string; nearest: string; result: string };
const rows: Row[] = [];
let failures = 0;
let passes = 0;
const fails: string[] = [];

const fmt = (p: V3) => `(${p[0]}, ${p[1]}, ${p[2]})`;

function nearestOf(x: number, z: number, self: string) {
  let best = { name: "", d: Infinity };
  for (const p of pickups) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < best.d) best = { name: p.name, d };
  }
  for (const p of allSpots) {
    if (p.name === self) continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < best.d) best = { name: p.name, d };
  }
  return best;
}

/**
 * Walk from spawn to a reached state: the grid route and then the last step
 * onto the exact point. Returns the walk and the route length.
 */
function walkFromSpawn(st: number, x: number, z: number) {
  const rt = route(fromSpawn, st);
  const pts = rt.pts.map((p) => [p[0], p[1]] as [number, number]);
  pts.push([x, z]);
  return { w: walk(pts, spawn[1]), len: rt.len };
}

type SpotOpts = {
  name: string;
  area: string;
  pos: V3;
  /** a floating pickup (y is floor + ~0.9) rather than a floor spot */
  pickup: boolean;
  inArea: boolean;
  /** distance rules apply */
  spaced: boolean;
  /** goldfish: floats over water, collected from a standing spot within reach */
  overWater?: boolean;
  extra?: [boolean, string][];
};

function checkSpot(o: SpotOpts) {
  const [x, y, z] = o.pos;
  const problems: string[] = [];
  let floorTxt = "-";
  let walkTxt = "-";
  if (!o.inArea) problems.push(`not in ${o.area}`);

  // standing and reach
  let target: { st: number; floor: number; x: number; z: number } | null = null;
  if (o.overWater) {
    // nearest reached dry standing cell within pick-up reach
    let bestD = Infinity;
    for (let dx = -PICKUP_R; dx <= PICKUP_R; dx += G) {
      for (let dz = -PICKUP_R; dz <= PICKUP_R; dz += G) {
        const gx = cellX(ixOf(x + dx));
        const gz = cellZ(izOf(z + dz));
        const d = Math.hypot(gx - x, gz - z);
        if (d > PICKUP_R - 0.2) continue;
        for (const [st, f] of statesAt(fromSpawn, gx, gz)) {
          if (d < bestD) {
            bestD = d;
            target = { st, floor: f, x: gx, z: gz };
          }
        }
      }
    }
    if (!target) problems.push("no standing spot within pick-up reach");
    else {
      floorTxt = `${target.floor.toFixed(2)} @${bestD.toFixed(1)}m`;
      if (y - (target.floor + 0.9) > 0.5 || target.floor + 0.9 - y > 0.5) problems.push(`y ${y} is far from reach floor ${target.floor.toFixed(2)} + 0.9`);
      if (!inWater(x, z)) problems.push("goldfish is meant to be over the pond");
    }
  } else {
    const want = o.pickup ? y - 0.9 : y;
    const sts = statesAt(fromSpawn, x, z).sort((p, q) => Math.abs(p[1] - want) - Math.abs(q[1] - want));
    const direct = standAt(x, z, want + 0.01);
    if (!sts.length) problems.push(direct == null ? "blocked: a capsule cannot stand here" : "not reachable from spawn");
    else {
      const [st, f] = sts[0]!;
      target = { st, floor: f, x, z };
      floorTxt = f.toFixed(2);
      const tol = 0.03;
      if (Math.abs(want - f) > tol) problems.push(`y ${y} should be ${(f + (o.pickup ? 0.9 : 0)).toFixed(2)} (floor ${f.toFixed(3)})`);
      if (f > STEP_UP) problems.push(`standing on top of something ${f.toFixed(2)}m high`);
      if (direct == null) problems.push("capsule overlaps a solid");
    }
    if (inWater(x, z, 0.3)) problems.push("in water");
  }

  // the floating pickup itself must not poke into anything
  if (o.pickup) {
    const r = 0.3;
    const hit = query(x - r, x + r, z - r, z + r).find((b) => y - r < b.maxY && y + r > b.minY);
    if (hit) problems.push(`pickup overlaps ${hit.label} (top ${hit.maxY.toFixed(2)})`);
    const pole = thin.find((b) => x - r < b.maxX && x + r > b.minX && z - r < b.maxZ && z + r > b.minZ && y - r < b.maxY && y + r > b.minY);
    if (pole) problems.push(`pickup overlaps ${pole.label}`);
  }

  // spacing
  const nn = nearestOf(x, z, o.name);
  if (o.spaced) {
    for (const p of pickups) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < MIN_GAP) problems.push(`${d.toFixed(1)}m from ${p.name}`);
    }
    for (const p of allSpots) {
      if (p.name === o.name) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < MIN_GAP) problems.push(`${d.toFixed(1)}m from ${p.name}`);
    }
    for (const p of rehide) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < REHIDE_GAP) problems.push(`${d.toFixed(1)}m from ${p.name}`);
    }
  }
  for (const [ok, msg] of o.extra ?? []) if (!ok) problems.push(msg);

  // walk it
  let len = NaN;
  if (target) {
    lap(`walking to ${o.name}`);
    const { w, len: l } = walkFromSpawn(target.st, target.x, target.z);
    lap(`walked ${w.metres.toFixed(0)}m`);
    len = l;
    walkTxt = `${l.toFixed(0)}m`;
    if (!w.ok) problems.push(`walk failed: ${w.why}`);
    else if (Math.abs(w.y - target.floor) > 0.1) problems.push(`walk ended at height ${w.y.toFixed(2)}, expected ${target.floor.toFixed(2)}`);
    else if (o.overWater && Math.hypot(w.x - x, w.z - z) > PICKUP_R) problems.push(`walk ended ${Math.hypot(w.x - x, w.z - z).toFixed(2)}m from the pickup`);
  }

  const ok = problems.length === 0;
  if (ok) passes++;
  else {
    failures++;
    fails.push(`${o.name}: ${problems.join("; ")}`);
  }
  rows.push({
    name: o.name,
    area: o.area,
    pos: fmt(o.pos),
    floor: floorTxt,
    walkM: walkTxt,
    nearest: nn.d === Infinity ? "-" : `${nn.d.toFixed(1)}m ${nn.name}`,
    result: ok ? "PASS" : "FAIL",
  });
  return { ok, len, target };
}

// the set itself
{
  const want = ["frog", "dragonfly", "goldfish", "butterfly", "ladybug", "bee", "apple", "tractor", "chicken", "sunflower", "horse", "balloon", "popcorn", "ferriswheel", "mushroom", "crystal", "bat", "tent", "marshmallow", "owl", "squirrel", "baseball", "tennisball", "basketball", "soccerball", "golfflag", "beachball", "rainbow", "sneaker", "snail"];
  const ids = STICKER_SPOTS.map((s) => s.id);
  const missing = want.filter((id) => !ids.includes(id));
  const extra = ids.filter((id) => !want.includes(id));
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  const ok = ids.length === 30 && !missing.length && !extra.length && !dupes.length;
  if (!ok) {
    failures++;
    fails.push(`sticker ids: ${ids.length} ids, missing [${missing}], unexpected [${extra}], duplicates [${dupes}]`);
  } else passes++;
  for (const s of STICKER_SPOTS) {
    if (!s.hint || !s.area) {
      failures++;
      fails.push(`sticker ${s.id}: needs a hint and an area`);
    }
    if (/\b(north|south)\b/i.test(s.hint) && process.env.VERBOSE) console.log(`  compass hint: ${s.id}: ${s.hint}`);
  }
}

console.log(`search: ${searchMs}ms over a ${W}x${H} grid at ${G}m`);

for (const s of STICKER_SPOTS) {
  const extra: [boolean, string][] = [];
  if (s.id === "rainbow" && level.splash) {
    // not by a ground jet, which would launch her as she grabs it
    for (const j of splashJets()) {
      const d = Math.hypot(level.splash.x + j.x - s.pos[0], level.splash.z + j.z - s.pos[2]);
      extra.push([d >= 1.5, `${d.toFixed(1)}m from a splash pad ground jet`]);
    }
  }
  if (s.id === "balloon" || s.id === "horse" || s.id === "popcorn") {
    for (const b of BOOTHS) {
      const [bx, bz] = boothStand(b);
      extra.push([Math.hypot(bx - s.pos[0], bz - s.pos[2]) >= 3, `${Math.hypot(bx - s.pos[0], bz - s.pos[2]).toFixed(1)}m from the ${b.name} counter spot`]);
    }
    const [gx, gz] = carouselGate();
    extra.push([Math.hypot(gx - s.pos[0], gz - s.pos[2]) >= 3, `${Math.hypot(gx - s.pos[0], gz - s.pos[2]).toFixed(1)}m from the carousel gate spot`]);
  }
  if (level.ride) {
    const d = Math.hypot(level.ride.x - s.pos[0], level.ride.z + 4 - s.pos[2]);
    extra.push([d >= 3, `${d.toFixed(1)}m from the ferris wheel boarding spot`]);
  }
  checkSpot({
    name: `sticker ${s.id}`,
    area: s.area,
    pos: s.pos,
    pickup: true,
    inArea: AREA[s.id]?.(s.pos[0], s.pos[2]) ?? false,
    spaced: true,
    overWater: s.id === "goldfish",
    extra,
  });
}

{
  const [x, , z] = STICKER_BOOK.pos;
  const byGazebo = near(x, z, 8, -6, 6);
  // the v1 picnic blankets west of the plaza are gone (places.ts); the kite
  // field is that lawn now, and it is still a fine place for the book
  const byKiteField = inRect(x, z, -34, -12, 9, 25);
  const dSpawn = Math.hypot(x - spawn[0], z - spawn[2]);
  checkSpot({
    name: "sticker book",
    area: "the gazebo or the kite field",
    pos: STICKER_BOOK.pos,
    pickup: true,
    inArea: byGazebo || byKiteField,
    spaced: true,
    extra: [[dSpawn >= 12 && dSpawn <= 40, `${dSpawn.toFixed(1)}m from spawn (want 12..40: early, not instant)`]],
  });
}

PET_QUEST.treats.forEach((t, i) => {
  const others = PET_QUEST.treats.filter((_, j) => j !== i);
  const closest = Math.min(...others.map((o) => Math.hypot(o.pos[0] - t.pos[0], o.pos[2] - t.pos[2])));
  checkSpot({
    name: `treat ${i + 1} (${t.area})`,
    area: t.area,
    pos: t.pos,
    pickup: true,
    inArea: TREAT_AREA[t.area]?.(t.pos[0], t.pos[2]) ?? false,
    spaced: true,
    extra: [
      [closest >= 25, `only ${closest.toFixed(1)}m from another treat (want different parts of the park, 25m+)`],
      [!!t.hint, "needs a hint"],
    ],
  });
});
{
  const n = PET_QUEST.treats.length;
  if (n !== 5) {
    failures++;
    fails.push(`treats: ${n}, want 5`);
  } else passes++;
}

// farmer and home, by the barn
let farmLen = NaN;
{
  const [fx, , fz] = PET_QUEST.farmer;
  const [hx, , hz] = PET_QUEST.home;
  const fd = barnBox ? rectDist(fx, fz, barnBox.minX, barnBox.maxX, barnBox.minZ, barnBox.maxZ) : Infinity;
  const hd = barnBox ? rectDist(hx, hz, barnBox.minX, barnBox.maxX, barnBox.minZ, barnBox.maxZ) : Infinity;
  // he stands by his tractor now, where the path into the farm arrives, so
  // she meets him on the way in rather than hunting the field for him
  const tractor = level.props.find((p) => p.kind === "tractor") as { x: number; z: number } | undefined;
  const td = tractor ? Math.hypot(fx - tractor.x, fz - tractor.z) : Infinity;
  const r = checkSpot({
    name: "pet farmer",
    area: "beside his tractor",
    pos: PET_QUEST.farmer,
    pickup: false,
    inArea: td <= 4,
    spaced: false,
    extra: [[pickups.every((p) => Math.hypot(p.x - fx, p.z - fz) >= 3), "within 3m of a pickup"]],
  });
  farmLen = r.len;
  checkSpot({
    name: "pet home",
    area: "beside the barn",
    pos: PET_QUEST.home,
    pickup: false,
    inArea: hd <= 4,
    spaced: false,
    extra: [
      [Math.hypot(hx - fx, hz - fz) >= 2, `${Math.hypot(hx - fx, hz - fz).toFixed(1)}m from the farmer (want 2m+)`],
      [pickups.every((p) => Math.hypot(p.x - hx, p.z - hz) >= 3), "within 3m of a pickup"],
    ],
  });
}

// the hideout, deep in the cave
let hideLen = NaN;
let hideFromEntrance = NaN;
{
  const [x, , z] = PET_QUEST.hideout;
  const extra: [boolean, string][] = [];
  for (const [name, p] of Object.entries(CAVE_SPOTS)) {
    const d = Math.hypot(p[0] - x, p[2] - z);
    extra.push([d >= 3, `${d.toFixed(1)}m from cave spot ${name}`]);
  }
  for (const s of allSpots) {
    const d = Math.hypot(s.x - x, s.z - z);
    extra.push([d >= MIN_GAP, `${d.toFixed(1)}m from ${s.name}`]);
  }
  for (const p of pickups) {
    const d = Math.hypot(p.x - x, p.z - z);
    extra.push([d >= MIN_GAP, `${d.toFixed(1)}m from ${p.name}`]);
  }
  const inside = search(ex, ez - 1.5, 0);
  const st = statesAt(inside, x, z);
  hideFromEntrance = st.length ? route(inside, st[0]![0]).len : Infinity;
  extra.push([hideFromEntrance >= 40 && Number.isFinite(hideFromEntrance), `only ${hideFromEntrance.toFixed(0)}m walk from the cave entrance (want 40m+)`]);
  const r = checkSpot({
    name: "pet hideout",
    area: "deep in the cave",
    pos: PET_QUEST.hideout,
    pickup: false,
    inArea: isOpen(caveCell(x, z)),
    spaced: false,
    extra,
  });
  hideLen = r.len;
}

// the paw trail
let trailLen = 0;
{
  const trail = PET_QUEST.pawTrail;
  const problems: string[] = [];
  if (trail.length < 20 || trail.length > 40) problems.push(`${trail.length} points (want 20..40)`);
  const [fx0, fz0] = trail[0] ?? [NaN, NaN];
  const [fx1, fz1] = trail[trail.length - 1] ?? [NaN, NaN];
  const farmRect = { minX: -86, maxX: -34, minZ: -150, maxZ: -114 };
  if (!inRect(fx0, fz0, farmRect.minX, farmRect.maxX, farmRect.minZ, farmRect.maxZ)) problems.push(`starts at (${fx0}, ${fz0}), not at the farm`);
  const hd = Math.hypot(fx0 - PET_QUEST.home[0], fz0 - PET_QUEST.home[2]);
  if (hd > 8) problems.push(`starts ${hd.toFixed(1)}m from the pet's home (want within 8m)`);
  const endD = Math.hypot(fx1 - ex, fz1 - ez);
  if (endD > 3 || fz1 < ez) problems.push(`ends at (${fx1}, ${fz1}), ${endD.toFixed(1)}m from the cave entrance (${ex}, ${ez}); want within 3m, outside`);
  let prevFloor = 0;
  for (let i = 0; i < trail.length; i++) {
    const [x, z] = trail[i]!;
    const f = standAt(x, z, prevFloor);
    if (f == null) problems.push(`point ${i} (${x}, ${z}) is not standable`);
    else if (!statesAt(fromSpawn, x, z).length) problems.push(`point ${i} (${x}, ${z}) is not reachable from spawn`);
    if (inWater(x, z, 0.5)) problems.push(`point ${i} (${x}, ${z}) is in water`);
    if (f != null && f > STEP_UP) problems.push(`point ${i} (${x}, ${z}) is on top of something ${f.toFixed(2)}m high`);
    if (f != null) prevFloor = f;
    if (i > 0) {
      const [px, pz] = trail[i - 1]!;
      const d = Math.hypot(x - px, z - pz);
      trailLen += d;
      if (d < 3 || d > 5) problems.push(`gap ${i - 1}->${i} is ${d.toFixed(2)}m (want 3..5)`);
      // every 0.25m along the segment must be standable
      let y = standAt(px, pz, 0) ?? 0;
      const n = Math.ceil(d / 0.25);
      for (let k = 1; k <= n; k++) {
        const sx = px + ((x - px) * k) / n;
        const sz = pz + ((z - pz) * k) / n;
        const fy = standAt(sx, sz, y);
        if (fy == null || inWater(sx, sz, 0.3)) {
          problems.push(`segment ${i - 1}->${i} blocked at (${sx.toFixed(2)}, ${sz.toFixed(2)})`);
          break;
        }
        const rail = thinAt(sx, sz, 0.3);
        if (rail) {
          problems.push(`segment ${i - 1}->${i} runs under ${rail.label}`);
          break;
        }
        y = fy;
      }
    }
  }
  const w = walk(trail, 0);
  if (!w.ok) problems.push(`walking the trail: ${w.why}`);
  const ok = problems.length === 0;
  if (ok) passes++;
  else {
    failures++;
    fails.push(`paw trail: ${problems.join("; ")}`);
  }
  rows.push({
    name: "paw trail",
    area: "farm to cave entrance",
    pos: `${trail.length} points`,
    floor: "-",
    walkM: `${trailLen.toFixed(0)}m`,
    nearest: `walked ${w.metres.toFixed(0)}m`,
    result: ok ? "PASS" : "FAIL",
  });
}

/* ------------------------------------------------------------ report */

const cols: (keyof Row)[] = ["name", "area", "pos", "floor", "walkM", "nearest", "result"];
const heads: Record<keyof Row, string> = { name: "spot", area: "area", pos: "pos", floor: "floor", walkM: "walk", nearest: "nearest other thing", result: "" };
const width = Object.fromEntries(cols.map((c) => [c, Math.max(heads[c].length, ...rows.map((r) => r[c].length))])) as Record<keyof Row, number>;
console.log(cols.map((c) => heads[c].padEnd(width[c])).join("  "));
for (const r of rows) console.log(cols.map((c) => r[c].padEnd(width[c])).join("  "));

console.log(`\nwalking distance from spawn: farmer ${farmLen.toFixed(0)}m, cave hideout ${hideLen.toFixed(0)}m (${hideFromEntrance.toFixed(0)}m inside the entrance); paw trail ${trailLen.toFixed(0)}m`);
if (fails.length) {
  console.log(`\n${failures} failure(s):`);
  for (const f of fails) console.log(`  FAIL ${f}`);
}
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
