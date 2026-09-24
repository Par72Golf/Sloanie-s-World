/**
 * Emmett's two monster-truck courses, through the real collision code.
 *
 * The times she has to beat are worked out from the length of each route
 * (truck-gauntlet.ts), not picked, so the only thing worth checking is
 * whether the route as built is actually runnable in that time by someone
 * running it about as well as a seven-year-old would: straight at the next
 * ring, no cutting, and a jump only where the course asks for one — at a
 * hurdle in front of her, and off the kicker ramp for the high ring.
 *
 * It also checks the obvious ways a route can be wrong: a ring inside a
 * solid, a ring she cannot reach, and rings so close together that two count
 * at once.
 *
 * Run: npx jiti tools/gauntlet.ts        (exits 1 on any failure)
 */
import { LEVELS } from "../src/game/levels";
import { collidersFor } from "../src/game/colliders";
import { applyLevelOrigins } from "../src/game/level-origins";
import { moveAndCollide, type AABB, type Capsule } from "../src/game/collision";

type Labelled = AABB & { label?: string };
import { GRAVITY, JUMP, PLAYER_H, PLAYER_W, WALK } from "../src/game/tuning";
import { HURDLE_H, throughGate, truckCourses, TRUCK_PARK, type TruckCourse } from "../src/game/truck-gauntlet";

const level = LEVELS[1]!;
applyLevelOrigins(level);
const boxes: Labelled[] = collidersFor(level);
const DT = 1 / 60;
const GATE_R = 2.6;

let failures = 0;
let passes = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok || process.env.VERBOSE) console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`);
  if (ok) passes++;
  else failures++;
};
const f1 = (n: number) => n.toFixed(1);

/**
 * Run the route straight at each ring in turn; returns the seconds it took.
 * `jumps` "none" runs it without ever pressing jump, and "hurdles" jumps
 * only the hurdles, to prove each of them and the high ring asks for one.
 */
function run(c: TruckCourse, jumps: "all" | "hurdles" | "none" = "all") {
  const solid = [...boxes, ...c.hurdles];
  const gates = c.gates;
  const cap: Capsule = { x: c.start.x, y: 0.1, z: c.start.z, hw: PLAYER_W, h: PLAYER_H, hd: PLAYER_W };
  let vy = 0;
  let i = 0;
  let steps = 0;
  let stuck = 0;
  let grounded = true;
  while (i < gates.length && steps < 60 * 240) {
    const g = gates[i]!;
    const dx = g.x - cap.x;
    const dz = g.z - cap.z;
    const d = Math.hypot(dx, dz) || 1;
    const ux = dx / d;
    const uz = dz / d;
    if (jumps !== "none" && grounded) {
      // a hurdle just ahead, or the top of the ramp with the high ring beyond it
      const ax = cap.x + ux * 0.9;
      const az = cap.z + uz * 0.9;
      const hurdle = c.hurdles.some((h) => ax > h.minX - 0.2 && ax < h.maxX + 0.2 && az > h.minZ - 0.2 && az < h.maxZ + 0.2);
      const lip = jumps === "all" && g.high && cap.y > 0.45 && d < 3.2;
      if (hurdle || lip) vy = JUMP;
    }
    vy -= GRAVITY * DT;
    const px = cap.x;
    const pz = cap.z;
    const r = moveAndCollide(cap, ux * WALK, vy, uz * WALK, solid, DT, level.groundY);
    // standing on something resets the fall, or she is driven into the ground
    // hard enough that a 0.5m terrace stops reading as a step
    vy = r.grounded ? 0 : r.vy;
    grounded = r.grounded;
    steps++;
    // a run that stops moving is a route with something in the way
    if (Math.hypot(cap.x - px, cap.z - pz) < WALK * DT * 0.25) stuck++;
    else stuck = 0;
    if (stuck > 90) return { seconds: Infinity, reached: i, stuckAt: { x: cap.x, z: cap.z } };
    if (throughGate(g, cap.x, cap.y, cap.z)) i++;
    // the high ring missed: she has run on past it on the ground
    if (g.high && jumps !== "all" && d < 0.5) return { seconds: Infinity, reached: i, stuckAt: { x: cap.x, z: cap.z } };
  }
  return { seconds: steps * DT, reached: i, stuckAt: null };
}

const tall = boxes.filter((b) => b.maxY > 0.62);
const inSolid = (x: number, z: number) => tall.find((b) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ);

console.log("Emmett's monster truck courses\n");
for (const c of truckCourses()) {
  console.log(`${c.name}: ${c.gates.length} rings, beat ${c.target}s`);
  for (const [i, g] of c.gates.entries()) {
    const hit = inSolid(g.x, g.z);
    check(!hit, `ring ${i + 1} at (${f1(g.x)}, ${f1(g.z)}) stands on clear ground${hit ? ` (inside ${hit.label})` : ""}`);
  }
  for (let i = 1; i < c.gates.length; i++) {
    const a = c.gates[i - 1]!;
    const b = c.gates[i]!;
    check(Math.hypot(a.x - b.x, a.z - b.z) > GATE_R * 2.4, `rings ${i} and ${i + 1} are far enough apart to count separately`);
  }
  for (const [i, h] of c.hurdles.entries()) {
    const hit = boxes.find((b) => b.maxY > 0.3 && h.minX < b.maxX && h.maxX > b.minX && h.minZ < b.maxZ && h.maxZ > b.minZ);
    check(!hit, `hurdle ${i + 1} stands clear of everything else${hit ? ` (crosses ${hit.label})` : ""}`);
  }
  if (c.hurdles.length) {
    check(HURDLE_H > 0.62 + 0.1, `a hurdle (${HURDLE_H}m) is too tall to step over`);
    const r0 = run(c, "none");
    check(r0.reached < c.gates.length, `without jumping the course cannot be finished (got ${r0.reached} of ${c.gates.length} rings)`);
    const high = c.gates.findIndex((g) => g.high);
    const r1 = run(c, "hurdles");
    check(r1.reached === high, `jumping the hurdles but running on past the ramp's lip misses the high ring (got ${r1.reached} of ${c.gates.length} rings)`);
  }
  {
    const hit = inSolid(c.start.x, c.start.z) ?? inSolid(c.watch.x, c.watch.z);
    check(!hit, `the start line and Emmett's watching spot are clear${hit ? ` (inside ${hit.label})` : ""}`);
  }
  const r = run(c);
  check(r.reached === c.gates.length, `the whole route can be run${r.stuckAt ? `: stuck at (${f1(r.stuckAt.x)}, ${f1(r.stuckAt.z)}) after ${r.reached} rings` : ""}`);
  // she is not a robot: the straight-line run has to leave real headroom
  check(
    r.seconds < c.target * 0.78,
    `run straight at every ring it takes ${f1(r.seconds)}s against a ${c.target}s target (${Math.round((1 - r.seconds / c.target) * 100)}% spare)`,
  );
  // and not a walkover: the first version could be beaten at a stroll
  check(r.seconds > c.target * 0.45, `but it is a real challenge: a clean run uses ${Math.round((r.seconds / c.target) * 100)}% of the time`);
  console.log("");
}

{
  const hit = inSolid(TRUCK_PARK.x, TRUCK_PARK.z);
  check(!hit, `the truck parks on clear ground beside her house${hit ? ` (inside ${hit.label})` : ""}`);
}

console.log(failures ? `\n${failures} failure(s), ${passes} passed` : `\nall ${passes} gauntlet checks passed`);
process.exit(failures ? 1 : 0);
