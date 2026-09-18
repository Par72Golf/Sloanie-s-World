/**
 * Where everything hidden in the picnic park actually is.
 *
 * It started as a nearest-neighbour report on the dumplings. The park has
 * doubled in content since (the arrival plaza and its walkways, Sandcastle
 * Corner, the kite field, duck pond, flower garden, story circle, fairground
 * green, the zoo, the lookout, Emmett's truck yard, mini golf, lawn bowls and
 * the floor-is-lava course), so it now looks at *every* hidden thing at once:
 *
 *   - dumpling homes and, with LAYOUT=1 / LAYOUT=2, their alternates
 *   - juice boxes, accessory pickups, Emmett's rehide spots
 *   - stickers, the sticker book and the five pet treats
 *
 * and reports three things the eye cannot check by reading a coordinate list:
 *
 *   1. CLUSTERING. Any two hidden things closer than MIN_GAP (4m, the same
 *      rule tools/collectibles.ts enforces for stickers) are a failure: two
 *      finds within a few steps of each other waste a hiding place.
 *   2. SILLY PLACES. A rectangle list of every spot in the park that is
 *      someone's *playing area* — a mini golf green, a bowls rink, the lava
 *      course, a zoo enclosure, the carousel deck, a booth counter, open
 *      water, a walkway she runs along. Nothing hidden may sit in one.
 *   3. JUICE COVERAGE. Juice boxes are a speed boost, so the rule is "usually
 *      one within reach wherever she is, and never a cluster". This floods the
 *      park from the spawn on a 2m grid and reports, over every walkable cell,
 *      the distance to the nearest juice box: mean, p90, worst, and where the
 *      worst cell is. It also fails if two juice boxes are closer than
 *      JUICE_MIN apart.
 *
 * Run:  npx jiti tools/spread.ts            (exits 1 on any failure)
 *       LAYOUT=1 npx jiti tools/spread.ts   (the first alternate layout)
 */
import { LEVELS } from "../src/game/levels";
import { collidersFor } from "../src/game/colliders";
import { PET_QUEST, STICKER_BOOK, STICKER_SPOTS } from "../src/game/collectibles";
import { GOLF } from "../src/game/park";
import { BOWLS } from "../src/game/bowls";
import { lavaFootprint } from "../src/game/lava";
import { ENCLOSURES, zooToWorld } from "../src/game/zoo";
import { BOOTHS, CAROUSEL, boothStand } from "../src/game/carnival";
import { walkwayRects } from "../src/game/walkways";
import { DUCK_POND, FAIR_GREEN, FLOWER_GARDEN, KITE_FIELD, STORY_CIRCLE } from "../src/game/places";
import type { LevelDef } from "../src/game/types";

const LAYOUT = Number(process.env.LAYOUT ?? "0");
const base = LEVELS[0]!;
const level: LevelDef = {
  ...base,
  dumplings: base.dumplings.map((d) => {
    const alt = LAYOUT > 0 ? d.alts?.[LAYOUT - 1] : undefined;
    return alt ? { ...d, pos: alt.pos, region: alt.region, hint: alt.hint } : d;
  }),
};

/** Two hidden things closer than this are one hiding place, not two. */
const MIN_GAP = 4;
/** Juice boxes are a route decision; two of them together is a wasted one. */
const JUICE_MIN = 18;
/**
 * No named place in the park should be further than this from a boost. It is
 * not tighter because of the arithmetic: 19 juice boxes over a 320m park, even
 * packed perfectly, leave a point about 40m from the nearest one (each covers
 * pi*r^2 and 19 of them have to cover 102,400m2). 50m is roughly eight seconds
 * of running, and every place she actually plays in comes in well under it.
 */
const JUICE_REACH = 50;

type Thing = { name: string; kind: string; x: number; z: number; y: number };

const things: Thing[] = [];
const add = (kind: string, name: string, p: readonly [number, number, number]) =>
  things.push({ kind, name, x: p[0], y: p[1], z: p[2] });

for (const d of level.dumplings) add("dumpling", `dumpling ${d.id}`, d.pos);
for (const [x, z] of level.juice ?? []) add("juice", `juice (${x}, ${z})`, [x, 0.6, z]);
for (const a of level.accessories ?? []) add("accessory", `accessory ${a.id}`, a.pos);
for (const r of level.rehideSpots ?? []) add("rehide", `rehide ${r.name}`, r.pos);
for (const s of STICKER_SPOTS) add("sticker", `sticker ${s.id}`, s.pos);
add("sticker", "sticker book", STICKER_BOOK.pos);
PET_QUEST.treats.forEach((t, i) => add("treat", `treat ${i + 1} (${t.area})`, t.pos));

/* -------------------------------------------------------- the playing areas */

type Zone = { name: string; minX: number; maxX: number; minZ: number; maxZ: number };
const zones: Zone[] = [];
const rect = (name: string, cx: number, cz: number, w: number, d: number) =>
  zones.push({ name, minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });

// mini golf: the five greens and their wooden borders
GOLF.laneDx.forEach((dx, i) =>
  rect(
    `mini golf green ${i + 1} (${GOLF.names[i]})`,
    GOLF.x + dx,
    GOLF.z,
    (GOLF.halfW + GOLF.wallT) * 2,
    (GOLF.halfD + GOLF.wallT) * 2,
  ),
);
// lawn bowls: the two rinks (the rest of the green is hers to walk on)
BOWLS.laneDx.forEach((dx, i) =>
  rect(
    `bowls ${BOWLS.laneNames[i]}`,
    BOWLS.x + dx,
    BOWLS.z,
    (BOWLS.halfW + BOWLS.kerbT) * 2,
    (BOWLS.halfD + BOWLS.kerbT) * 2,
  ),
);
// the floor-is-lava course, pool and all
{
  const f = lavaFootprint(0.5);
  zones.push({ name: "the floor-is-lava course", ...f });
}
// zoo enclosures: she cannot get inside a fence
for (const e of ENCLOSURES) {
  const [ax, az] = zooToWorld(e.rect.minX, e.rect.minZ);
  const [bx, bz] = zooToWorld(e.rect.maxX, e.rect.maxZ);
  zones.push({
    name: `the ${e.name.toLowerCase()} enclosure`,
    minX: Math.min(ax, bx),
    maxX: Math.max(ax, bx),
    minZ: Math.min(az, bz),
    maxZ: Math.max(az, bz),
  });
}
// the carnival: the carousel's fence and the strip in front of each counter
rect("the carousel", CAROUSEL.x, CAROUSEL.z, CAROUSEL.fence * 2, CAROUSEL.fence * 2);
for (const b of BOOTHS) {
  const [sx, sz] = boothStand(b);
  rect(`the ${b.name} counter`, b.x, (b.z + sz) / 2, b.w + 1, Math.abs(b.z - sz) + 2.4);
}
// the ferris wheel's boarding platform
if (level.ride) rect("the ferris wheel platform", level.ride.x, level.ride.z + 3, 9, 9);
// the walkway network and the arrival plaza: she runs along these
walkwayRects(0).forEach((r, i) => zones.push({ name: `a walkway (${i})`, ...r }));

/**
 * Everywhere she actually goes. A boost is worth having on the way to any of
 * these, which is a fairer test than the average over 100,000m2 of park,
 * most of which is empty lawn in the corners beyond the ring road.
 */
const LANDMARKS: [string, number, number][] = [
  ["the spawn", 0, 22],
  ["the gazebo", 8, -6],
  ["Sandcastle Corner", 22, 10],
  ["the kite field", KITE_FIELD.x, KITE_FIELD.z],
  ["the duck pond", DUCK_POND.x, DUCK_POND.z],
  ["the flower garden", FLOWER_GARDEN.x, FLOWER_GARDEN.z],
  ["the story circle", STORY_CIRCLE.x, STORY_CIRCLE.z],
  ["the fairground green", FAIR_GREEN.x, FAIR_GREEN.z],
  ["the carousel", CAROUSEL.x, CAROUSEL.z],
  ["the carnival booths", -16, 61],
  ["the ferris wheel", 30, 64],
  ["the big pond", 0, -34],
  ["the hedge maze", -42, -18],
  ["the secret garden", -56, 27],
  ["Emmett's truck yard", 50.5, -9],
  ["the treehouse", 54, -45],
  ["the splash pad", -95, 28],
  ["the playground", -95, -25],
  ["the swimming pool", -36, 118],
  ["the ninja course", 8, 138],
  ["the south street", 0, 103],
  ["the ball field", 0, -90],
  ["the basketball court", 95, -34],
  ["the tennis courts", 95, 25],
  ["the east picnic lawn", 95, 72],
  ["the lawn bowls club", BOWLS.x, BOWLS.z],
  ["the pavilion", 130, 60],
  ["the campground", 125, 125],
  ["the soccer pitch", 130, -60],
  ["the woods clearing", -140, 13],
  ["the woods trail", -112, 0],
  ["the farm", -60, -125],
  ["the zoo", -15, -130],
  ["the mini golf", GOLF.x, GOLF.z],
  ["the floor-is-lava course", 45, -103],
  ["the mountain cave mouth", 71.5, -112],
  ["the ring road, north-west", -103, -103],
  ["the ring road, north-east", 103, -103],
  ["the ring road, south-west", -103, 103],
  ["the ring road, south-east", 103, 103],
];

const inZone = (t: Thing) => {
  // the sky dumpling hangs above the wheel and the goldfish floats over the
  // pond; both are meant to be over something she cannot stand on
  if (t.y > 4) return null;
  if (t.name === "sticker goldfish") return null;
  return zones.find((z) => t.x > z.minX && t.x < z.maxX && t.z > z.minZ && t.z < z.maxZ) ?? null;
};
const inWater = (t: Thing) =>
  t.name === "sticker goldfish"
    ? null
    : ((level.water ?? []).find((w) => Math.hypot(t.x - w.x, t.z - w.z) < w.r) ?? null);

/* ------------------------------------------------------ walkable park cells */

const boxes = collidersFor(level);
const STEP = 2;
const b = level.bounds;
const W = Math.ceil((b.maxX - b.minX) / STEP);
const H = Math.ceil((b.maxZ - b.minZ) / STEP);
const blocked = new Uint8Array(W * H);
for (const box of boxes) {
  if (box.maxY < 0.75 || box.minY > 1.75) continue;
  const x0 = Math.max(0, Math.floor((box.minX - b.minX) / STEP));
  const x1 = Math.min(W - 1, Math.ceil((box.maxX - b.minX) / STEP));
  const z0 = Math.max(0, Math.floor((box.minZ - b.minZ) / STEP));
  const z1 = Math.min(H - 1, Math.ceil((box.maxZ - b.minZ) / STEP));
  for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) blocked[iz * W + ix] = 1;
}
for (const w of level.water ?? []) {
  const x0 = Math.max(0, Math.floor((w.x - w.r - b.minX) / STEP));
  const x1 = Math.min(W - 1, Math.ceil((w.x + w.r - b.minX) / STEP));
  const z0 = Math.max(0, Math.floor((w.z - w.r - b.minZ) / STEP));
  const z1 = Math.min(H - 1, Math.ceil((w.z + w.r - b.minZ) / STEP));
  for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) blocked[iz * W + ix] = 1;
}
const spawn = level.spawn ?? [0, 0, 0];
const start =
  Math.floor((spawn[2] - b.minZ) / STEP) * W + Math.floor((spawn[0] - b.minX) / STEP);
const seen = new Uint8Array(W * H);
const queue = [start];
seen[start] = 1;
while (queue.length) {
  const cur = queue.pop()!;
  const cx = cur % W;
  const cz = (cur / W) | 0;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
    const nx = cx + dx;
    const nz = cz + dz;
    if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
    const n = nz * W + nx;
    if (seen[n] || blocked[n]) continue;
    seen[n] = 1;
    queue.push(n);
  }
}

/* ------------------------------------------------------------------ report */

let failures = 0;
const fail = (line: string) => {
  failures++;
  console.log(`  FAIL  ${line}`);
};

console.log(`LAYOUT ${LAYOUT}   ${things.length} hidden things in ${level.name}`);

console.log(`\n--- nearest neighbour, dumplings only ---`);
const dumps = things.filter((t) => t.kind === "dumpling");
const nn = (t: Thing, pool: Thing[]) => {
  let best = Infinity;
  let who = "";
  for (const o of pool) {
    if (o === t) continue;
    const d = Math.hypot(o.x - t.x, o.z - t.z);
    if (d < best) {
      best = d;
      who = o.name;
    }
  }
  return { best, who };
};
for (const row of dumps
  .map((t) => ({ t, ...nn(t, dumps) }))
  .sort((a, c) => a.best - c.best)) {
  console.log(`  ${row.t.name.padEnd(20)} ${row.best.toFixed(1).padStart(5)}m from ${row.who}`);
}

console.log(`\n--- everything hidden, closest pairs (want >= ${MIN_GAP}m) ---`);
const pairs: { a: Thing; c: Thing; d: number }[] = [];
for (let i = 0; i < things.length; i++) {
  for (let j = i + 1; j < things.length; j++) {
    const a = things[i]!;
    const c = things[j]!;
    pairs.push({ a, c, d: Math.hypot(a.x - c.x, a.z - c.z) });
  }
}
pairs.sort((x, y) => x.d - y.d);
for (const p of pairs.slice(0, 12)) {
  const line = `${p.d.toFixed(1).padStart(5)}m  ${p.a.name} <-> ${p.c.name}`;
  if (p.d < MIN_GAP) fail(line);
  else console.log(`  ok    ${line}`);
}

console.log(`\n--- hidden things inside a playing area, on a path, or in water ---`);
let silly = 0;
for (const t of things) {
  const z = inZone(t);
  const w = inWater(t);
  if (z) {
    silly++;
    fail(`${t.name} @ (${t.x}, ${t.z}) is in ${z.name}`);
  } else if (w) {
    silly++;
    fail(`${t.name} @ (${t.x}, ${t.z}) is in the water at (${w.x}, ${w.z})`);
  }
}
if (!silly) console.log("  none");

console.log(`\n--- juice boxes (${(level.juice ?? []).length}) ---`);
const juice = things.filter((t) => t.kind === "juice");
for (const row of juice.map((t) => ({ t, ...nn(t, juice) })).sort((a, c) => a.best - c.best)) {
  const line = `${row.t.name.padEnd(20)} ${row.best.toFixed(1).padStart(5)}m from its nearest juice box`;
  if (row.best < JUICE_MIN) fail(line);
  else console.log(`  ok    ${line}`);
}

let sum = 0;
let cells = 0;
let worst = 0;
let worstAt: [number, number] = [0, 0];
const dists: number[] = [];
for (let ix = 0; ix < W; ix++) {
  for (let iz = 0; iz < H; iz++) {
    if (!seen[iz * W + ix]) continue;
    const x = b.minX + ix * STEP;
    const z = b.minZ + iz * STEP;
    let best = Infinity;
    for (const j of juice) {
      const d = Math.hypot(j.x - x, j.z - z);
      if (d < best) best = d;
    }
    sum += best;
    cells++;
    dists.push(best);
    if (best > worst) {
      worst = best;
      worstAt = [x, z];
    }
  }
}
dists.sort((x, y) => x - y);
const p = (q: number) => dists[Math.min(dists.length - 1, Math.floor(dists.length * q))]!;
console.log(
  `\n  walkable cells ${cells} at ${STEP}m; distance to the nearest juice box:\n` +
    `  mean ${(sum / cells).toFixed(1)}m   median ${p(0.5).toFixed(1)}m   p90 ${p(0.9).toFixed(1)}m   ` +
    `worst ${worst.toFixed(1)}m at (${worstAt[0].toFixed(0)}, ${worstAt[1].toFixed(0)})`,
);
console.log(
  "  (the tail is the empty lawn in the corners past the ring road; the rule\n" +
    "   that matters is the one below, over the places she actually goes)",
);

console.log(`\n--- how far a juice box is from each place in the park (want <= ${JUICE_REACH}m) ---`);
const worstFirst = LANDMARKS.map(([name, lx, lz]) => {
  let best = Infinity;
  for (const j of juice) best = Math.min(best, Math.hypot(j.x - lx, j.z - lz));
  return { name, best };
}).sort((a, c) => c.best - a.best);
for (const row of worstFirst) {
  const line = `${row.best.toFixed(1).padStart(5)}m  ${row.name}`;
  if (row.best > JUICE_REACH) fail(line);
  else console.log(`  ok    ${line}`);
}

if (process.argv[2] === "map") {
  // An ASCII map of how far the nearest juice box is, north up and east right.
  // Digits are tens of metres, '.' is unwalkable, 'J' is a juice box.
  console.log(`\n--- juice coverage map (each cell ${STEP * 2}m, digit = tens of metres) ---`);
  for (let iz = 0; iz < H; iz += 2) {
    let line = "";
    for (let ix = 0; ix < W; ix += 2) {
      const x = b.minX + ix * STEP;
      const z = b.minZ + iz * STEP;
      if (juice.some((j) => Math.abs(j.x - x) <= STEP && Math.abs(j.z - z) <= STEP)) {
        line += "J";
        continue;
      }
      if (!seen[iz * W + ix]) {
        line += ".";
        continue;
      }
      let best = Infinity;
      for (const j of juice) best = Math.min(best, Math.hypot(j.x - x, j.z - z));
      const t = Math.floor(best / 10);
      line += t >= 10 ? "#" : String(t);
    }
    console.log(`  ${line}`);
  }
}

console.log(`\n--- share of the park (hidden things per 80m band) ---`);
const bandName = (v: number) => (v < -53 ? "-" : v > 53 ? "+" : "0");
const grid = new Map<string, number>();
for (const t of things) {
  const k = `${bandName(t.x)}${bandName(t.z)}`;
  grid.set(k, (grid.get(k) ?? 0) + 1);
}
for (const zz of ["-", "0", "+"]) {
  console.log(
    "  " +
      ["-", "0", "+"]
        .map((xx) => `${String(grid.get(`${xx}${zz}`) ?? 0).padStart(3)}`)
        .join(" ") +
      `   z ${zz === "-" ? "north" : zz === "+" ? "south" : "middle"}`,
  );
}
console.log("   west  mid east");

console.log(failures ? `\n${failures} FAILED` : `\nall clear`);
if (failures) process.exit(1);
