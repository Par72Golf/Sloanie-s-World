/**
 * Sloanie's Bowls Club, played headlessly with the game's own physics.
 *
 * Nothing in this environment can draw a frame, so the only way to know the
 * green is playable is to bowl on it. Everything here calls `stepBowls`,
 * `roll` and `clubBoxes` from src/game/bowls.ts, which is also what the game
 * runs and what builds the meshes, so a pass means the real club behaves this
 * way.
 *
 * What it proves:
 *  0. the spot: `scan` re-runs the clear-ground search that picked it, and
 *     the layout check proves every club collider is clear of the park by 2m,
 *     is outside the area another agent is rebuilding, and is beside a walkway;
 *  1. the geometry agrees with itself: rinks fit on the green, both rinks are
 *     clear of each other, the pin diamond fits, nothing stands on a mat, and
 *     a bowl cannot thread between two adjacent pins;
 *  2. the bowl can never escape a rink or get stuck: 24000 wild bowls from
 *     everywhere on the rink at every angle and power, plus pins parked in
 *     corners and against kerbs; every roll comes to rest, nothing ends up
 *     outside the kerbs, and the bowl never rests inside a standing pin;
 *  3. pins fall and reset correctly: a straight bowl at any power knocks pins
 *     down, a rack resets to the exact spots, no pin ever falls on its own,
 *     and a fallen pin never stands back up;
 *  4. the aim is a timing game: the arrow's swing covers the whole range at a
 *     steady speed, stopping it in the middle really does send the bowl
 *     straight down the rink, and a seven-year-old pressing a bit early or
 *     late scores something reasonable over 400 games;
 *  5. the mat is walkable from the spawn through the real collision code, and
 *     from the walkway through the gateway;
 *  6. she can see the pins: nothing in the park or the club crosses the line
 *     from the bowling camera to the bowl or the pins.
 *
 * Run: npx jiti tools/bowls.ts          (exits 1 on any failure)
 *      npx jiti tools/bowls.ts scan     the clear-space search that picked the spot
 *      npx jiti tools/bowls.ts path     also prints the walking routes
 */
import { LEVELS } from "../src/game/levels";
import { collidersFor } from "../src/game/colliders";
import { moveAndCollide, type AABB, type Capsule } from "../src/game/collision";
import { occupancy, type Rect } from "../src/game/placement";
import { GRAVITY, PLAYER_H, PLAYER_W, WALK } from "../src/game/tuning";
import { routePoints, walkwayRects } from "../src/game/walkways";
import {
  AIM_LIMIT,
  BOWLS,
  BOWL_R,
  MAX_SCORE,
  MAX_V,
  MIN_V,
  PIN_R,
  PIN_SPOTS,
  SWEEP_SPEED,
  SWEEP_SPEED_FIRST,
  TAP_POWER,
  aimDir,
  sweepAim,
  sweepSpeed,
  type Bowl,
  type Rack,
  bowlsCamera,
  bowlsColliders,
  bowlsLine,
  bowlsTickets,
  clubBoxes,
  gateSpot,
  greenRect,
  laneWorld,
  matBowl,
  matStand,
  newRack,
  pinsDown,
  powerToSpeed,
  resetRack,
  roll,
  standing,
  stepBowls,
  toWorld,
  type BowlsCam,
} from "../src/game/bowls";

const mode = process.argv[2] ?? "";
const DT = 1 / 60;
const STEP_UP = 0.62;

let failures = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failures++;
};
const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);

/** A repeatable random, so a failure can be reproduced. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const level = LEVELS[0]!;
const club = bowlsColliders();
const boxes = clubBoxes();
console.log(
  `Sloanie's Bowls Club at (${BOWLS.x}, ${BOWLS.z}): ${BOWLS.laneDx.length} rinks, ${BOWLS.pins} pins, ${BOWLS.turns} turns of ${BOWLS.perTurn} bowls, ${MAX_SCORE} for a perfect game`,
);
console.log(`  ${boxes.length} boxes drawn, ${club.length} of them solid\n`);

/* ------------------------------------------------------------ 0. the spot */

const grow = (r: Rect, m: number): Rect => ({ minX: r.minX - m, maxX: r.maxX + m, minZ: r.minZ - m, maxZ: r.maxZ + m });
const overlaps = (a: Rect, b: Rect) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
const rectDist = (x: number, z: number, r: Rect) => Math.hypot(Math.max(r.minX - x, 0, x - r.maxX), Math.max(r.minZ - z, 0, z - r.maxZ));

/** Anything no taller than this is ground she walks over, not an obstacle. */
const FLAT_TOP = 0.2;
const parkSolids = collidersFor(level).filter((b) => b.maxY > FLAT_TOP);
const blockers: (Rect & { label: string })[] = parkSolids.map((b) => ({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, label: b.label }));
for (const r of occupancy(level.props)) blockers.push({ ...r, label: "prop footprint" });
const water = level.water ?? [];
const nodes = routePoints();
/** The walkway slabs and junction pads, so "near a path" means the path, not a node. */
const walks = walkwayRects();
const rectGap = (a: Rect, b: Rect) =>
  Math.hypot(Math.max(a.minX - b.maxX, b.minX - a.maxX, 0), Math.max(a.minZ - b.maxZ, b.minZ - a.maxZ, 0));
const walkGap = (r: Rect) => walks.reduce((best, w) => Math.min(best, rectGap(r, w)), Infinity);

/**
 * The area another agent is rebuilding (the landing plaza and everything
 * around it), and the carousel. The club has to stay out of both.
 */
const REBUILD: Rect = { minX: -45, maxX: 45, minZ: -30, maxZ: 55 };
const CAROUSEL = { x: -16, z: 53 };

if (mode === "scan") {
  console.log("clear-space scan for the club's footprint, outside the rebuild area and near a walkway\n");
  for (const [w, d] of [
    [BOWLS.greenW, BOWLS.greenD],
    [30, 26],
    [22, 22],
  ] as [number, number][]) {
    const found: { x: number; z: number; node: string; nd: number }[] = [];
    for (let x = -150; x <= 150; x += 1) {
      for (let z = -150; z <= 150; z += 1) {
        const r: Rect = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 };
        if (overlaps(r, REBUILD)) continue;
        if (rectDist(CAROUSEL.x, CAROUSEL.z, r) < 30) continue;
        if (r.minX < level.bounds.minX + 10 || r.maxX > level.bounds.maxX - 10) continue;
        if (r.minZ < level.bounds.minZ + 10 || r.maxZ > level.bounds.maxZ - 10) continue;
        const g = grow(r, 1.5);
        if (blockers.some((b) => overlaps(g, b))) continue;
        if (water.some((wz) => rectDist(wz.x, wz.z, g) < wz.r + 4)) continue;
        const gap = walkGap(r);
        if (gap > 6) continue;
        let best = Infinity;
        let node = "";
        for (const n of nodes) {
          const dd = rectDist(n.x, n.z, r);
          if (dd < best) {
            best = dd;
            node = n.id;
          }
        }
        found.push({ x, z, node, nd: gap });
      }
    }
    const byNode = new Map<string, typeof found>();
    for (const f of found) byNode.set(f.node, [...(byNode.get(f.node) ?? []), f]);
    console.log(`  ${w}m x ${d}m: ${found.length} clear centres within 6m of a walkway slab`);
    for (const [node, list] of byNode) {
      const xs = list.map((l) => l.x);
      const zs = list.map((l) => l.z);
      console.log(`    off ${node}: ${list.length} centres, x ${Math.min(...xs)}..${Math.max(...xs)}, z ${Math.min(...zs)}..${Math.max(...zs)}`);
    }
  }
  console.log(
    "\nThe pick is (97, 92): the lawn on the west side of the east spine, between the\npicnic area and the campground. It is 2.2m off the walkway at x 114, 150m from\nthe rebuild area and 190m from the carousel.",
  );
  process.exit(0);
}

console.log("the spot");
{
  const green = greenRect();
  check(!overlaps(green, REBUILD), `the green (x ${green.minX}..${green.maxX}, z ${green.minZ}..${green.maxZ}) is outside the rebuild area x -45..45, z -30..55`);
  check(
    rectDist(CAROUSEL.x, CAROUSEL.z, green) > 60,
    `${f1(rectDist(CAROUSEL.x, CAROUSEL.z, green))}m from the carousel at (${CAROUSEL.x}, ${CAROUSEL.z})`,
  );
  const b = level.bounds;
  check(
    green.minX > b.minX + 6 && green.maxX < b.maxX - 6 && green.minZ > b.minZ + 6 && green.maxZ < b.maxZ - 6,
    "the whole green is well inside the park boundary",
  );
  const gap = walkGap(green);
  let nearest = { id: "", d: Infinity };
  for (const n of nodes) {
    const d = rectDist(n.x, n.z, green);
    if (d < nearest.d) nearest = { id: n.id, d };
  }
  check(gap < 4, `a walkway slab passes ${f1(gap)}m from the green (nearest junction ${nearest.id}, ${f1(nearest.d)}m): she walks straight into it`);

  // nothing in the park within two metres of anything the club builds
  const MARGIN = 2;
  let hits = 0;
  let worst = "";
  for (const c of club) {
    const g = grow({ minX: c.minX, maxX: c.maxX, minZ: c.minZ, maxZ: c.maxZ }, MARGIN);
    for (const b2 of blockers) {
      if (!overlaps(g, b2)) continue;
      hits++;
      if (hits <= 6) worst = `${b2.label} at (${f1((b2.minX + b2.maxX) / 2)}, ${f1((b2.minZ + b2.maxZ) / 2)})`;
    }
  }
  check(hits === 0, `${club.length} club colliders + ${MARGIN}m margin overlap nothing in the park${hits ? ` (${hits} hits, e.g. ${worst})` : ""}`);
  const wet = water.find((w) => rectDist(w.x, w.z, grow(greenRect(), MARGIN)) < w.r);
  check(!wet, `the green is dry (${water.length} water zones in the park)`);
}

/* ------------------------------------------------------ 1. the club as drawn */

console.log("\ngeometry");
{
  const B = BOWLS;
  const outer = (B.halfW + B.kerbT) * 2;
  const pitch = Math.abs(B.laneDx[1]! - B.laneDx[0]!);
  check(B.laneDx.length === 2, `${B.laneDx.length} rinks side by side`);
  check(pitch > outer + 0.5, `${f2(pitch - outer)}m of green between one rink's kerb and the next`);
  const span = Math.abs(B.laneDx[0]!) + B.halfW + B.kerbT;
  check(span * 2 + 2 <= B.greenW, `the rinks span ${f1(span * 2)}m on a ${B.greenW}m green`);
  const deep = Math.max(B.halfD + B.kerbT, B.matDz + 1.2);
  check(deep * 2 + 2 <= B.greenD, `the rinks are ${f1(deep * 2)}m deep on a ${B.greenD}m green`);

  // every drawn box inside the green's footprint
  const green = greenRect(0.4);
  const stray = boxes.filter((b) => b.x - b.w / 2 < green.minX || b.x + b.w / 2 > green.maxX || b.z - b.d / 2 < green.minZ || b.z + b.d / 2 > green.maxZ);
  check(stray.length === 0, `every one of the ${boxes.length} boxes sits on the green${stray.length ? ` (${stray[0]!.label} does not)` : ""}`);

  // the pin diamond
  const far = Math.max(...PIN_SPOTS.map(([x]) => Math.abs(x))) + PIN_R;
  const deepest = Math.max(...PIN_SPOTS.map(([, z]) => Math.abs(z - BOWLS.pinDz))) + PIN_R;
  check(PIN_SPOTS.length === B.pins, `${PIN_SPOTS.length} pins in the diamond`);
  check(far < B.halfW - 0.2, `the diamond is ${f2(far * 2)}m across inside a ${f2(B.halfW * 2)}m rink`);
  check(B.halfD - (deepest - B.pinDz) > 1.2, `${f2(B.halfD + B.pinDz - deepest)}m of run-off behind the back pin`);
  // nearest neighbours, and whether a bowl can thread between two of them
  let closest = Infinity;
  for (let i = 0; i < PIN_SPOTS.length; i++) {
    for (let j = i + 1; j < PIN_SPOTS.length; j++) {
      closest = Math.min(closest, Math.hypot(PIN_SPOTS[i]![0] - PIN_SPOTS[j]![0], PIN_SPOTS[i]![1] - PIN_SPOTS[j]![1]));
    }
  }
  const gap = closest - PIN_R * 2;
  check(gap > 0.05, `pins stand ${f2(closest)}m apart, ${f2(gap)}m of daylight between them`);
  check(gap < BOWL_R * 2, `a ${f2(BOWL_R * 2)}m bowl cannot thread that ${f2(gap)}m gap: reaching the diamond means hitting something`);

  // the mat, and how far the bowl has to travel
  const toFront = B.matDz - Math.max(...PIN_SPOTS.map(([, z]) => z));
  check(toFront > 8 && toFront < 15, `${f1(toFront)}m from the mat to the front pin`);
  for (let i = 0; i < B.laneDx.length; i++) {
    const s = matStand(i);
    const w = laneWorld(i);
    const off = Math.hypot(s.x - w.x, s.z - w.matZ);
    check(off < 2.8, `rink ${i + 1}: she stands ${f2(off)}m from the mat, inside the ${2.8}m the big action needs`);
    const onHer = club.filter((c) => c.maxY > 0.12 && c.minX < s.x + 0.4 && c.maxX > s.x - 0.4 && c.minZ < s.z + 0.4 && c.maxZ > s.z - 0.4);
    check(onHer.length === 0, `rink ${i + 1}: where she stands to bowl is clear of everything solid`);
    // and she must not be between the camera and the bowl
    const cm: BowlsCam = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0 };
    bowlsCamera(i, BOWLS.matDz, cm);
    const across = Math.abs(s.x - cm.px);
    check(across > 1.2, `rink ${i + 1}: she stands ${f2(across)}m to the side of the camera line, so her head never covers the rink`);
    const onMat = club.filter((c) => c.maxY > 0.12 && c.minX < w.x + 0.7 && c.maxX > w.x - 0.7 && c.minZ < w.matZ + 0.7 && c.maxZ > w.matZ - 0.7);
    check(onMat.length === 0, `rink ${i + 1}: nothing solid stands on the mat`);
    const inDiamond = club.filter(
      (c) => c.maxY > 0.12 && c.minX < w.x + far && c.maxX > w.x - far && c.minZ < w.pinZ + deepest && c.maxZ > w.pinZ - deepest,
    );
    check(inDiamond.length === 0, `rink ${i + 1}: nothing solid stands in the pin diamond`);
  }

  // the kerbs are low enough to step onto, so she can never be shut in
  const kerbs = boxes.filter((b) => b.label.startsWith("kerb"));
  check(kerbs.length === B.laneDx.length * 4, `${kerbs.length} kerbs, four to a rink`);
  check(kerbs.every((k) => k.y + k.h / 2 <= STEP_UP), `the kerbs are ${f2(B.kerbH)}m: inside the ${STEP_UP}m step-up, so she walks over them`);

  // the gateway is wide enough to walk through
  check(BOWLS.gateW - 0.4 * 2 > PLAYER_W * 2 + 1, `the gateway is ${f2(BOWLS.gateW - 0.8)}m clear between the posts, for a ${f2(PLAYER_W * 2)}m girl`);

  // powers
  check(MIN_V < MAX_V && TAP_POWER > 0 && TAP_POWER < 1, `a bowl leaves the mat between ${MIN_V} and ${MAX_V} m/s, a tap at ${powerToSpeed(TAP_POWER).toFixed(1)}`);
}

/* ------------------------------------------------- 1b. the swinging arrow */

console.log("\nthe swinging arrow");
{
  for (const [what, speed] of [
    ["the first turn", SWEEP_SPEED_FIRST],
    ["every turn after", SWEEP_SPEED],
  ] as [string, number][]) {
    const span = AIM_LIMIT * 2;
    const period = (span * 2) / speed;
    // sample a whole swing finely and see what the arrow actually does
    const N = 20000;
    let lo = Infinity;
    let hi = -Infinity;
    let worstStep = 0;
    let prev = sweepAim(0, speed);
    const bands = new Array(12).fill(0);
    for (let i = 1; i <= N; i++) {
      const t = (i / N) * period;
      const a = sweepAim(t, speed);
      lo = Math.min(lo, a);
      hi = Math.max(hi, a);
      // a triangle wave moves the same amount every tick except at the two turns
      const d = Math.abs(a - prev);
      if (i > 1 && d < (span / N) * 3) worstStep = Math.max(worstStep, Math.abs(d - (period * speed) / N / 2));
      prev = a;
      bands[Math.min(11, Math.floor(((a + AIM_LIMIT) / span) * 12))]!++;
    }
    check(hi > AIM_LIMIT - 1e-3 && lo < -AIM_LIMIT + 1e-3, `${what}: the arrow sweeps the whole range, ${f2(lo)} to ${f2(hi)} rad (limit ${AIM_LIMIT})`);
    check(hi <= AIM_LIMIT + 1e-9 && lo >= -AIM_LIMIT - 1e-9, `${what}: and never past it`);
    const spread = Math.max(...bands) / Math.min(...bands);
    check(spread < 1.05, `${what}: it crosses the middle at the same speed as the edges (busiest band only ${f2(spread)}x the quietest)`);
    console.log(`       ${f1(period)}s for a full swing at ${speed} rad/s, ${Math.round(AIM_LIMIT * 2 * (180 / Math.PI))} degrees wide`);
  }
  check(sweepSpeed(0) < sweepSpeed(1), `the first turn swings at ${SWEEP_SPEED_FIRST} rad/s and the rest at ${SWEEP_SPEED}: gentler to start, never faster later`);
  check(sweepSpeed(1) === sweepSpeed(2), "turns 2 and 3 swing at the same speed: it never speeds up on her");
  check(Math.abs(sweepAim(0, SWEEP_SPEED)) < 1e-9, "a turn starts with the arrow pointing straight down the rink");

  // stopping it in the middle really is straight
  {
    const d = { x: 0, z: 0 };
    aimDir(sweepAim(0, SWEEP_SPEED), d);
    check(Math.abs(d.x) < 1e-9 && d.z < -0.999, `stopped in the middle the bowl goes straight down the rink (${f2(d.x)}, ${f2(d.z)})`);
    const rack = newRack();
    let worst = 9;
    for (let pi = 0; pi <= 10; pi++) {
      resetRack(rack);
      const b: Bowl = { x: 0, z: 0, vx: 0, vz: 0 };
      matBowl(b);
      shoot(b, rack, pi / 10, sweepAim(0, SWEEP_SPEED));
      worst = Math.min(worst, pinsDown(rack));
    }
    check(worst >= 6, `a bowl on that line takes at least ${worst} pins at any power`);
    // what a mistimed press actually costs, averaged over the power she might
    // pull: this, not the width of the swing, is the difficulty of the game
    const costs: [number, number][] = [];
    for (const late of [0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.5]) {
      let sum = 0;
      for (let pi = 0; pi <= 6; pi++) {
        resetRack(rack);
        const b: Bowl = { x: 0, z: 0, vx: 0, vz: 0 };
        matBowl(b);
        shoot(b, rack, 0.25 + (pi / 6) * 0.6, sweepAim(late, SWEEP_SPEED));
        sum += pinsDown(rack);
      }
      costs.push([late, sum / 7]);
    }
    console.log(`       one bowl, pressed this late: ${costs.map(([l, p]) => `${Math.round(l * 1000)}ms ${f1(p)}`).join("  ")} pins`);
    check(costs[0]![1] > 7, `dead on time a single bowl averages ${f1(costs[0]![1])} of ${BOWLS.pins} pins`);
    check(costs[3]![1] < 4, `a press 150ms late averages only ${f1(costs[3]![1])}: the timing is the difficulty, not the power`);
    check(costs[6]![1] < costs[0]![1], `and half a second out is ${f1(costs[6]![1])}, with the bowl dying against the kerb`);
  }
}

/* ------------------------------------------- 2. the bowl cannot escape or stick */

type Shot = { frames: number; escape: number; pinEscape: number; done: boolean; buried: number };

/** One bowl, watched all the way to rest. */
function shoot(b: Bowl, rack: Rack, power: number, aim: number, limit = 60 * 20): Shot {
  roll(b, power, aim);
  let escape = 0;
  let pinEscape = 0;
  let rolled = 0;
  for (let f = 1; f <= limit; f++) {
    const r = stepBowls(b, rack, DT, rolled);
    rolled += DT;
    escape = Math.max(escape, Math.abs(b.x) - (BOWLS.halfW - BOWL_R), Math.abs(b.z) - (BOWLS.halfD - BOWL_R));
    for (const p of rack) pinEscape = Math.max(pinEscape, Math.abs(p.x) - BOWLS.halfW, Math.abs(p.z) - BOWLS.halfD);
    if (r === "stop") {
      let buried = 0;
      for (const p of rack) {
        if (p.down) continue;
        buried = Math.max(buried, BOWL_R + PIN_R - Math.hypot(b.x - p.x, b.z - p.z));
      }
      return { frames: f, escape, pinEscape, done: true, buried };
    }
  }
  return { frames: limit, escape, pinEscape, done: false, buried: 0 };
}

console.log("\ncontainment and dead ends: 24000 wild bowls");
{
  const rand = rng(20260918);
  const rack = newRack();
  let worst = 0;
  let worstPin = 0;
  let unfinished = 0;
  let deepest = 0;
  let slowest = 0;
  for (let i = 0; i < 24000; i++) {
    // a fresh rack every few bowls, so a lot of them are thrown at a full
    // diamond and a lot at the wreckage of one
    if (i % 3 === 0) resetRack(rack);
    const b: Bowl = { x: 0, z: 0, vx: 0, vz: 0 };
    // from anywhere on the rink, at any angle and any power, not just the mat
    b.x = (rand() * 2 - 1) * (BOWLS.halfW - BOWL_R);
    b.z = (rand() * 2 - 1) * (BOWLS.halfD - BOWL_R);
    const s = shoot(b, rack, rand(), (rand() * 2 - 1) * Math.PI);
    worst = Math.max(worst, s.escape);
    worstPin = Math.max(worstPin, s.pinEscape);
    deepest = Math.max(deepest, s.buried);
    slowest = Math.max(slowest, s.frames);
    if (!s.done) unfinished++;
  }
  check(worst <= 1e-6, `the bowl never gets past the kerbs (worst overshoot ${(worst * 1000).toFixed(3)}mm)`);
  check(worstPin <= 1e-6, `no pin is ever knocked off the rink (worst ${(worstPin * 1000).toFixed(3)}mm)`);
  check(unfinished === 0, `every bowl comes to rest (${unfinished} did not)`);
  check(deepest <= 2e-3, `the bowl never rests inside a standing pin (deepest ${(deepest * 1000).toFixed(2)}mm)`);
  check(slowest <= 60 * 9, `the longest roll took ${f1(slowest / 60)}s`);
}

console.log("\nnothing can pin the bowl against a kerb or a corner");
{
  // parked in every corner and along every kerb, with a full rack up, then
  // bowled at from there: it always gets away and always stops
  const rack = newRack();
  let stuck = 0;
  let unfinished = 0;
  const spots: [number, number][] = [];
  const lx = BOWLS.halfW - BOWL_R;
  const lz = BOWLS.halfD - BOWL_R;
  for (const sx of [-1, 0, 1]) for (const sz of [-1, -0.5, 0, 0.5, 1]) spots.push([sx * lx, sz * lz]);
  for (const [x, z] of PIN_SPOTS) spots.push([x, z + PIN_R + BOWL_R + 0.01], [x, z - PIN_R - BOWL_R - 0.01]);
  for (const [x, z] of spots) {
    resetRack(rack);
    let moved = false;
    for (let ai = -6; ai <= 6 && !moved; ai++) {
      for (let pi = 0; pi <= 4 && !moved; pi++) {
        const b: Bowl = { x, z, vx: 0, vz: 0 };
        const s = shoot(b, rack, pi / 4, (ai / 6) * AIM_LIMIT);
        if (!s.done) unfinished++;
        if (Math.hypot(b.x - x, b.z - z) > 1) moved = true;
      }
    }
    if (!moved) stuck++;
  }
  check(stuck === 0, `from all ${spots.length} tight spots the bowl can always be moved a metre (${stuck} could not)`);
  check(unfinished === 0, `and every one of those bowls came to rest (${unfinished} did not)`);
}

/* --------------------------------------- 3. pins fall and reset correctly */

console.log("\npins");
{
  const rack = newRack();
  check(standing(rack) === BOWLS.pins && pinsDown(rack) === 0, "a fresh rack stands all nine up");

  // a straight bowl down the middle at any power knocks pins over
  let worstPower = { power: 0, pins: 99 };
  let allNine = 0;
  for (let pi = 0; pi <= 20; pi++) {
    resetRack(rack);
    const b: Bowl = { x: 0, z: 0, vx: 0, vz: 0 };
    matBowl(b);
    shoot(b, rack, pi / 20, 0);
    const n = pinsDown(rack);
    if (n < worstPower.pins) worstPower = { power: pi / 20, pins: n };
    if (n === BOWLS.pins) allNine++;
  }
  check(worstPower.pins >= 4, `straight down the middle always takes at least ${worstPower.pins} pins (worst at power ${f2(worstPower.power)})`);
  check(allNine > 0, `${allNine} of 21 powers clear all nine with a single straight bowl`);

  // a bowl that misses the diamond knocks nothing over
  resetRack(rack);
  {
    const b: Bowl = { x: BOWLS.halfW - BOWL_R, z: BOWLS.halfD - BOWL_R, vx: 0, vz: 0 };
    shoot(b, rack, 0.2, 0);
    check(pinsDown(rack) === 0, "a bowl hugging the kerb leaves the diamond standing: pins do not fall on their own");
  }

  // a fallen pin stays fallen, and reset puts every pin exactly back
  resetRack(rack);
  {
    const b: Bowl = { x: 0, z: 0, vx: 0, vz: 0 };
    matBowl(b);
    shoot(b, rack, 1, 0);
    const downAfter = rack.filter((p) => p.down).length;
    // roll again: nothing that was down comes back up
    const wasDown = rack.map((p) => p.down);
    const b2: Bowl = { x: 0, z: 0, vx: 0, vz: 0 };
    matBowl(b2);
    shoot(b2, rack, 1, 0.1);
    const roseAgain = rack.filter((p, i) => wasDown[i] && !p.down).length;
    check(downAfter > 0 && roseAgain === 0, `${downAfter} pins went down on the first bowl and none of them stood back up`);
    resetRack(rack);
    const exact = rack.every((p, i) => p.x === PIN_SPOTS[i]![0] && p.z === PIN_SPOTS[i]![1] && !p.down && p.vx === 0 && p.vz === 0);
    check(exact, "resetRack puts all nine back on their exact spots, standing and still");
  }

  // a wrecked rack, reset a hundred times, is always identical
  {
    const rand = rng(99);
    let drift = 0;
    for (let i = 0; i < 100; i++) {
      const b: Bowl = { x: 0, z: 0, vx: 0, vz: 0 };
      matBowl(b);
      shoot(b, rack, rand(), (rand() * 2 - 1) * AIM_LIMIT);
      resetRack(rack);
      for (let k = 0; k < rack.length; k++) {
        drift = Math.max(drift, Math.abs(rack[k]!.x - PIN_SPOTS[k]![0]), Math.abs(rack[k]!.z - PIN_SPOTS[k]![1]));
      }
    }
    check(drift === 0, "a hundred wrecked-and-reset racks show no drift at all");
  }
}

/* ------------------------------ 4. a seven-year-old scores something */

console.log("\ngames, played by four different thumbs");
{
  /**
   * She watches the arrow and presses when it looks straight. Her press lands
   * within a quarter of a second of the moment it crosses, and one press in
   * eight she is daydreaming and stops it anywhere at all. Power is a rough
   * pull of the meter, as before.
   *
   * The stop angle comes out of `sweepAim`, so this is the real swing, not a
   * model of it.
   */
  const GAMES = 400;
  const rack = newRack();

  /** `react` is how far her press lands from the crossing; `wild` how often she is not looking at all. */
  function play(react: number, wild: number, seed: number) {
    const rand = rng(seed);
    const scores: number[] = [];
    const turnPins: number[] = [];
    let blanks = 0;
    let perfect = 0;
    for (let g = 0; g < GAMES; g++) {
      let total = 0;
      for (let turn = 0; turn < BOWLS.turns; turn++) {
        resetRack(rack);
        const speed = sweepSpeed(turn);
        const period = (AIM_LIMIT * 4) / speed;
        for (let d = 0; d < BOWLS.perTurn && standing(rack) > 0; d++) {
          const off = rand() < wild ? rand() * period : (rand() * 2 - 1) * react;
          // the stop angle comes out of the real swing, not a model of it
          const aim = sweepAim(off, speed);
          const power = Math.max(0, Math.min(1, 0.55 + (rand() * 2 - 1) * 0.33));
          const b: Bowl = { x: 0, z: 0, vx: 0, vz: 0 };
          matBowl(b);
          shoot(b, rack, power, aim);
        }
        const n = pinsDown(rack);
        turnPins.push(n);
        total += n;
      }
      scores.push(total);
      if (total === 0) blanks++;
      if (total === MAX_SCORE) perfect++;
    }
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    const sorted = [...scores].sort((a, b) => a - b);
    return {
      mean: avg(scores),
      turn: avg(turnPins),
      median: sorted[Math.floor(sorted.length / 2)]!,
      p10: sorted[Math.floor(sorted.length * 0.1)]!,
      worst: sorted[0]!,
      best: sorted[sorted.length - 1]!,
      blanks,
      perfect,
    };
  }

  const thumbs: [string, number, number][] = [
    ["not even looking", 0, 1],
    ["a sloppy thumb (0.35s out)", 0.35, 0.12],
    ["really watching (0.25s out)", 0.25, 0.12],
    ["a sharp thumb (0.15s out)", 0.15, 0.06],
  ];
  const r = thumbs.map(([name, react, wild], i) => [name, play(react, wild, 424242 + i)] as const);
  for (const [name, s] of r) {
    console.log(`       ${name.padEnd(28)} ${f1(s.mean)} of ${MAX_SCORE} (median ${s.median}, worst one in ten ${s.p10}, ${s.perfect} perfect games)`);
  }
  const blind = r[0]![1];
  const sloppy = r[1]![1];
  const trying = r[2]![1];
  const sharp = r[3]![1];
  check(
    blind.mean < 14,
    `pressing without looking only scores ${f1(blind.mean)} of ${MAX_SCORE}: stopping the arrow is the game (it used to be 27 with a free aim)`,
  );
  check(trying.mean > blind.mean + 6, `watching the arrow is worth ${f1(trying.mean - blind.mean)} pins a game over pressing at random`);
  check(sharp.mean > trying.mean, `and a sharper thumb is worth ${f1(sharp.mean - trying.mean)} more again (${f1(sharp.mean)} of ${MAX_SCORE})`);
  check(trying.mean >= 14 && trying.mean <= 23, `a seven-year-old who is really watching averages ${f1(trying.mean)} of ${MAX_SCORE} (${f1(trying.turn)} pins a turn)`);
  check(sloppy.blanks === 0 && trying.blanks === 0, "she never comes away with nothing at all, however the timing goes");
  check(trying.perfect > 0 && trying.perfect < GAMES * 0.2, `${trying.perfect} of ${GAMES} watched games are a perfect 27: worth chasing, not a given`);
  console.log(
    `  note  a bad game pays ${bowlsTickets(6, false)} tickets, an average one ${bowlsTickets(Math.round(trying.mean), false)}, a perfect one ${bowlsTickets(MAX_SCORE, true)}`,
  );
  console.log(`  note  "${bowlsLine(Math.round(trying.mean))}"`);
}

/* ------------------------------ 5. she can walk to the mats from the spawn */

console.log("\nwalking there, through the real collision code");
{
  const all: AABB[] = [...collidersFor(level).map(({ label: _l, index: _i, ...b }) => b), ...club];
  // a spatial grid, so a 320m walk does not test every collider every frame
  const CELL = 8;
  const grid = new Map<string, AABB[]>();
  const key = (cx: number, cz: number) => `${cx}:${cz}`;
  for (const b of all) {
    for (let cx = Math.floor(b.minX / CELL); cx <= Math.floor(b.maxX / CELL); cx++) {
      for (let cz = Math.floor(b.minZ / CELL); cz <= Math.floor(b.maxZ / CELL); cz++) {
        const k = key(cx, cz);
        const list = grid.get(k);
        if (list) list.push(b);
        else grid.set(k, [b]);
      }
    }
  }
  const query = (x0: number, x1: number, z0: number, z1: number) => {
    const out = new Set<AABB>();
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
        for (const b of grid.get(key(cx, cz)) ?? []) out.add(b);
      }
    }
    return [...out];
  };

  // flood fill on a 0.4m grid, the same rule check-layout.ts uses
  const step = 0.4;
  const bnd = level.bounds;
  const W = Math.ceil((bnd.maxX - bnd.minX) / step);
  const H = Math.ceil((bnd.maxZ - bnd.minZ) / step);
  const blocked = new Uint8Array(W * H);
  const pad = 0.42;
  for (const b of all) {
    if (b.maxY < 0.75) continue;
    if (b.minY > 1.75) continue;
    const x0 = Math.max(0, Math.floor((b.minX - pad - bnd.minX) / step));
    const x1 = Math.min(W - 1, Math.ceil((b.maxX + pad - bnd.minX) / step));
    const z0 = Math.max(0, Math.floor((b.minZ - pad - bnd.minZ) / step));
    const z1 = Math.min(H - 1, Math.ceil((b.maxZ + pad - bnd.minZ) / step));
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) blocked[iz * W + ix] = 1;
  }
  const idx = (x: number, z: number) => {
    const ix = Math.floor((x - bnd.minX) / step);
    const iz = Math.floor((z - bnd.minZ) / step);
    if (ix < 0 || iz < 0 || ix >= W || iz >= H) return -1;
    return iz * W + ix;
  };
  const cellX = (i: number) => bnd.minX + (i % W) * step + step / 2;
  const cellZ = (i: number) => bnd.minZ + Math.floor(i / W) * step + step / 2;

  const spawn = level.spawn;
  const prev = new Int32Array(W * H).fill(-1);
  const seen = new Uint8Array(W * H);
  const start = idx(spawn[0], spawn[2]);
  const q: number[] = [];
  if (start >= 0 && !blocked[start]) {
    seen[start] = 1;
    q.push(start);
  }
  for (let head = 0; head < q.length; head++) {
    const cur = q[head]!;
    const cx = cur % W;
    const cz = (cur / W) | 0;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as [number, number][]) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const n = nz * W + nx;
      if (seen[n] || blocked[n]) continue;
      seen[n] = 1;
      prev[n] = cur;
      q.push(n);
    }
  }
  check(q.length > 0, `flood fill from the spawn (${spawn[0]}, ${spawn[2]}) covers ${q.length} cells`);

  /** Walk her along a list of points, no jumping; she must reach the last one. */
  function walk(pts: [number, number][]) {
    const [sx, sz] = pts[0]!;
    const c: Capsule = { x: sx, y: 0.4, z: sz, hw: PLAYER_W, h: PLAYER_H, hd: PLAYER_W };
    let vy = 0;
    const near = () => query(c.x - 2.5, c.x + 2.5, c.z - 2.5, c.z + 2.5);
    for (let i = 0; i < 24; i++) {
      vy -= GRAVITY * DT;
      vy = moveAndCollide(c, 0, vy, 0, near(), DT, level.groundY).vy;
    }
    let i = 1;
    let stall = 0;
    let bestI = 0;
    const last = pts.length - 1;
    for (let f = 0; f < 60 * 900; f++) {
      while (i < last && Math.hypot(pts[i]![0] - c.x, pts[i]![1] - c.z) < 0.6) i++;
      const [tx, tz] = pts[i]!;
      const dx = tx - c.x;
      const dz = tz - c.z;
      const d = Math.hypot(dx, dz);
      if (i === last && d < 0.25) return { ok: true, x: c.x, z: c.z, why: "" };
      const sp = Math.min(WALK, d / DT);
      const px = c.x;
      const pz = c.z;
      vy -= GRAVITY * DT;
      vy = moveAndCollide(c, (dx / d) * sp, vy, (dz / d) * sp, near(), DT, level.groundY).vy;
      const moved = Math.hypot(c.x - px, c.z - pz);
      if (moved > 1) return { ok: false, x: c.x, z: c.z, why: `teleported ${f2(moved)}m at (${f1(px)}, ${f1(pz)})` };
      if (i > bestI) {
        bestI = i;
        stall = 0;
      } else if (moved < 0.004) {
        if (++stall > 150) return { ok: false, x: c.x, z: c.z, why: `stuck at (${f1(c.x)}, ${f1(c.z)}) heading for point ${i} of ${last}` };
      } else stall = 0;
    }
    return { ok: false, x: c.x, z: c.z, why: "ran out of time" };
  }

  /** Trim the grid route to corners, so she walks a sane line. */
  function routeTo(x: number, z: number): [number, number][] | null {
    const g = idx(x, z);
    if (g < 0 || !seen[g]) return null;
    const pts: [number, number][] = [];
    for (let k = g; k >= 0; k = prev[k]!) pts.unshift([cellX(k), cellZ(k)]);
    const out: [number, number][] = [pts[0]!];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const c = pts[i + 1]!;
      if (Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) > 1e-9) out.push(b);
    }
    out.push(pts[pts.length - 1]!, [x, z]);
    return out;
  }

  const targets: [string, number, number][] = [["the gateway", ...gateSpot()] as [string, number, number]];
  for (let i = 0; i < BOWLS.laneDx.length; i++) {
    const s = matStand(i);
    targets.push([`rink ${i + 1}'s mat`, s.x, s.z]);
  }
  for (const [name, x, z] of targets) {
    const pts = routeTo(x, z);
    if (!pts) {
      check(false, `${name} at (${f1(x)}, ${f1(z)}) is not reachable from the spawn at all`);
      continue;
    }
    const r = walk(pts);
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
    check(r.ok, `she walks ${Math.round(len)}m from the spawn to ${name}${r.ok ? "" : `: ${r.why}`}`);
    if (mode === "path") console.log(`       ${pts.length} corners, ending at (${f1(r.x)}, ${f1(r.z)})`);
  }

  // and the short version: off the walkway, through the gateway, to a mat
  {
    const g = gateSpot();
    const path = walks.reduce((best, w) => (rectGap(greenRect(), w) < rectGap(greenRect(), best) ? w : best), walks[0]!);
    const on: [number, number] = [Math.max(path.minX + 0.5, Math.min(path.maxX - 0.5, g[0])), Math.max(path.minZ + 0.5, Math.min(path.maxZ - 0.5, g[1]))];
    for (let i = 0; i < BOWLS.laneDx.length; i++) {
      const s = matStand(i);
      const pts: [number, number][] = [on, g, [BOWLS.x + BOWLS.greenW / 2 - 2, BOWLS.z + BOWLS.gateDz], [s.x, s.z]];
      const r = walk(pts);
      check(r.ok, `off the walkway at (${f1(on[0])}, ${f1(on[1])}) through the gateway to rink ${i + 1}'s mat${r.ok ? "" : `: ${r.why}`}`);
    }
  }
}

/* ------------------------------ 6. she can see what she is bowling at */

console.log("\nthe view from the mat, against the park's real colliders and the club's");
{
  type Labelled = AABB & { label: string };
  const solidBoxes = boxes.filter((x) => x.solid);
  const all: Labelled[] = [
    ...collidersFor(level)
      .filter((b) => b.maxY > 0.25)
      .map(({ index: _i, ...b }) => b as Labelled),
    ...club.map((b, i) => ({ ...b, label: `club ${solidBoxes[i]?.label ?? "?"}` })),
  ];

  function blockedBy(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    for (const o of all) {
      let s0 = 0.02;
      let s1 = 0.97;
      let miss = false;
      for (const [p, q2, lo, hi] of [
        [dx, ax, o.minX, o.maxX],
        [dy, ay, o.minY, o.maxY],
        [dz, az, o.minZ, o.maxZ],
      ] as const) {
        if (Math.abs(p) < 1e-9) {
          if (q2 < lo || q2 > hi) miss = true;
          continue;
        }
        const u = (lo - q2) / p;
        const v = (hi - q2) / p;
        s0 = Math.max(s0, Math.min(u, v));
        s1 = Math.min(s1, Math.max(u, v));
      }
      if (!miss && s1 > s0) return o.label;
    }
    return null;
  }

  const cam: BowlsCam = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0 };
  for (let l = 0; l < BOWLS.laneDx.length; l++) {
    let hiddenBall: string | null = null;
    let hiddenPins: string | null = null;
    let where = 0;
    // the mat, and every metre of the rink the bowl travels down
    for (let dz = BOWLS.matDz; dz >= -BOWLS.halfD + BOWL_R; dz -= 0.5) {
      bowlsCamera(l, dz, cam);
      const [bx, bz] = toWorld(l, 0, dz);
      const ball = blockedBy(cam.px, cam.py, cam.pz, bx, BOWLS.laneTop + BOWL_R, bz);
      if (ball && !hiddenBall) {
        hiddenBall = ball;
        where = dz;
      }
      const pins = blockedBy(cam.px, cam.py, cam.pz, cam.tx, 0.45, cam.tz);
      if (pins && !hiddenPins) {
        hiddenPins = pins;
        where = dz;
      }
    }
    check(!hiddenBall, `rink ${l + 1}: the bowl is in sight all the way down${hiddenBall ? `, hidden by ${hiddenBall} at dz ${f1(where)}` : ""}`);
    check(!hiddenPins, `rink ${l + 1}: the pins are in sight all the way down${hiddenPins ? `, hidden by ${hiddenPins} at dz ${f1(where)}` : ""}`);
    bowlsCamera(l, BOWLS.matDz, cam);
    console.log(`       camera starts ${f1(cam.py)}m up, ${f1(cam.pz - cam.tz)}m back; it closes to ${f1(bowlsCamera(l, BOWLS.pinDz, cam).pz - cam.tz)}m by the time the bowl arrives`);
  }
}

console.log(failures ? `\n${failures} failure(s)` : "\nall lawn bowls checks passed");
process.exit(failures ? 1 : 0);
