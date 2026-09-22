/**
 * Emmett's two monster-truck courses, through the real collision code.
 *
 * The times she has to beat are worked out from the length of each route
 * (truck-gauntlet.ts), not picked, so the only thing worth checking is
 * whether the route as built is actually runnable in that time by someone
 * running it about as well as a seven-year-old would: straight at the next
 * ring, no cutting, no jumping, and no advance knowledge.
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
import { GRAVITY, PLAYER_H, PLAYER_W, WALK } from "../src/game/tuning";
import { truckCourses, TRUCK_PARK } from "../src/game/truck-gauntlet";

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

/** Run the route straight at each ring in turn; returns the seconds it took. */
function run(gates: { x: number; z: number }[], start: { x: number; z: number }) {
  const cap: Capsule = { x: start.x, y: 0.2, z: start.z, hw: PLAYER_W, h: PLAYER_H, hd: PLAYER_W };
  let vy = 0;
  let i = 0;
  let steps = 0;
  let stuck = 0;
  while (i < gates.length && steps < 60 * 240) {
    const g = gates[i]!;
    const dx = g.x - cap.x;
    const dz = g.z - cap.z;
    const d = Math.hypot(dx, dz) || 1;
    vy -= GRAVITY * DT;
    const px = cap.x;
    const pz = cap.z;
    const r = moveAndCollide(cap, (dx / d) * WALK, vy, (dz / d) * WALK, boxes, DT, level.groundY);
    // standing on something resets the fall, or she is driven into the ground
    // hard enough that a 0.5m terrace stops reading as a step
    vy = r.grounded ? 0 : r.vy;
    steps++;
    // a run that stops moving is a route with something in the way
    if (Math.hypot(cap.x - px, cap.z - pz) < WALK * DT * 0.25) stuck++;
    else stuck = 0;
    if (stuck > 90) return { seconds: Infinity, reached: i, stuckAt: { x: cap.x, z: cap.z } };
    if (Math.hypot(cap.x - g.x, cap.z - g.z) < GATE_R) i++;
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
  const r = run(c.gates, c.start);
  check(r.reached === c.gates.length, `the whole route can be run${r.stuckAt ? `: stuck at (${f1(r.stuckAt.x)}, ${f1(r.stuckAt.z)}) after ${r.reached} rings` : ""}`);
  // she is not a robot: the straight-line run has to leave real headroom
  check(
    r.seconds < c.target * 0.78,
    `run straight at every ring it takes ${f1(r.seconds)}s against a ${c.target}s target (${Math.round((1 - r.seconds / c.target) * 100)}% spare)`,
  );
  console.log("");
}

{
  const hit = inSolid(TRUCK_PARK.x, TRUCK_PARK.z);
  check(!hit, `the truck parks on clear ground beside her house${hit ? ` (inside ${hit.label})` : ""}`);
}

console.log(failures ? `\n${failures} failure(s), ${passes} passed` : `\nall ${passes} gauntlet checks passed`);
process.exit(failures ? 1 : 0);
