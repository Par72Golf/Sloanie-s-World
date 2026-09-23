/**
 * Ice Cream Mountain, climbed through the real collision code.
 *
 * The first real play of Sugar Rush said the stairs were bad and that she
 * fell off going round them. That is a claim about what happens when a child
 * steers badly on a narrow spiral fifteen metres up, which no geometry check
 * can see, so this does what she does:
 *
 *   1. climbs from the foot of the first flight to the telescope, tread by
 *      tread, with the jump key never pressed;
 *   2. from every tread, drives her at full speed straight off the outside
 *      edge — and off each side along the flight — and records how far she
 *      falls; and
 *   3. climbs again with a wobble on the stick, the way a seven-year-old
 *      steers, and counts the times she ends up on a lower level than the one
 *      she was climbing.
 *
 * Run: npx jiti tools/mountain.ts        (exits 1 on any failure)
 */
import { LEVELS } from "../src/game/levels";
import { applyLevelOrigins } from "../src/game/level-origins";
import { collidersFor } from "../src/game/colliders";
import { moveAndCollide, type Capsule } from "../src/game/collision";
import { PLAYER_H, PLAYER_W, WALK, GRAVITY } from "../src/game/tuning";
import { ICE_CREAM_MOUNTAIN } from "../src/game/candy-builds";
import { SUGAR } from "../src/game/sugar-rush";

const level = LEVELS[1]!;
applyLevelOrigins(level);
const boxes = collidersFor(level);
const DT = 1 / 60;
const O = SUGAR.mountain;
const M = ICE_CREAM_MOUNTAIN;
type Flight = { fromY: number; toY: number; r: number; a0: number; span: number; n: number; tread: number };
const FLIGHTS = M.flights as unknown as Flight[];

let fails = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) fails++;
  if (!ok || process.env.VERBOSE) console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`);
};

/** Every tread, in climbing order: where its middle is and how high its top. */
const treads: { f: number; k: number; x: number; z: number; top: number; a: number }[] = [];
FLIGHTS.forEach((f, fi) => {
  for (let k = 1; k <= f.n; k++) {
    const a = f.a0 + (f.span * (k - 1)) / (f.n - 1);
    treads.push({ f: fi, k, x: O.x + Math.cos(a) * f.r, z: O.z + Math.sin(a) * f.r, top: f.fromY + ((f.toY - f.fromY) * k) / f.n, a });
  }
});

/**
 * The way up as she walks it: every tread, and between flights the way round
 * the ledge — off the landing and along the middle of the ledge to the foot of
 * the next flight, the way a child goes, not a straight line through whatever
 * stands on the ledge (the first one has the slide coming down across it).
 */
const LEDGE_WALK = [
  { y: M.ringY, r: (FLIGHTS[1]!.r + FLIGHTS[1]!.tread / 2 + M.ringRadius) / 2 },
  { y: M.deckY, r: (M.scoopRadius + M.deckRadius) / 2 - 0.15 },
];
const route: { x: number; z: number; min: number; tread?: (typeof treads)[number] }[] = [];
for (const t of treads) {
  const next = treads[treads.indexOf(t) + 1];
  route.push({ x: t.x, z: t.z, min: t.top - 0.4, tread: t });
  if (!next || next.f === t.f || t.f >= LEDGE_WALK.length) continue;
  const L = LEDGE_WALK[t.f]!;
  let a0 = t.a;
  let a1 = next.a;
  while (a1 < a0) a1 += Math.PI * 2;
  for (let a = a0 + 0.12; a < a1; a += 0.25) route.push({ x: O.x + Math.cos(a) * L.r, z: O.z + Math.sin(a) * L.r, min: L.y - 0.4 });
}

const cap: Capsule = { x: 0, y: 0, z: 0, hw: PLAYER_W, h: PLAYER_H, hd: PLAYER_W };
let vy = 0;
function place(x: number, y: number, z: number) {
  cap.x = x;
  cap.y = y;
  cap.z = z;
  vy = 0;
  for (let i = 0; i < 20; i++) step(0, 0);
}
function step(vx: number, vz: number) {
  vy -= GRAVITY * DT;
  const r = moveAndCollide(cap, vx, vy, vz, boxes, DT, level.groundY);
  vy = r.vy;
  return r.grounded;
}
/** Walk toward a point, never jumping; `wobble` swings the stick side to side. */
function walkTo(tx: number, tz: number, seconds = 6, wobble = 0, seed = 1) {
  let t = seed;
  for (let i = 0; i < seconds * 60; i++) {
    const dx = tx - cap.x;
    const dz = tz - cap.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.3) return true;
    let ux = dx / d;
    let uz = dz / d;
    if (wobble) {
      t += DT;
      const w = Math.sin(t * 2.3 + seed) * wobble + Math.sin(t * 5.1 + seed * 3) * wobble * 0.5;
      const c = Math.cos(w);
      const s = Math.sin(w);
      [ux, uz] = [ux * c - uz * s, ux * s + uz * c];
    }
    step(ux * WALK, uz * WALK);
  }
  return Math.hypot(tx - cap.x, tz - cap.z) < 0.6;
}

// ---- 1. the climb, jump never pressed
console.log("the climb, jump never pressed");
const foot = treads[0]!;
place(O.x + Math.cos(foot.a) * (FLIGHTS[0]!.r + 0.2), 0.1, O.z + Math.sin(foot.a) * (FLIGHTS[0]!.r + 0.2) + 3);
let reached = -1;
for (let i = 0; i < route.length; i++) {
  const w = route[i]!;
  walkTo(w.x, w.z, 5);
  // on a turn the square treads overlap, and the middle of one can be standing
  // on the next one up; only ending up lower than it means she fell
  if (cap.y < w.min) break;
  if (w.tread) reached = treads.indexOf(w.tread);
}
check(reached === treads.length - 1, `climbs all ${treads.length} treads to ${treads[treads.length - 1]!.top.toFixed(1)}m (reached tread ${reached + 1}, standing at ${cap.y.toFixed(2)}m)`);
const glass = { x: O.x + M.glass.x, z: O.z + M.glass.z };
walkTo(glass.x, glass.z, 6);
check(Math.abs(cap.y - M.summitY) < 0.3 && Math.hypot(cap.x - glass.x, cap.z - glass.z) < 1.2, `and walks to the telescope on the summit (${cap.y.toFixed(2)}m)`);

// ---- 2. driven off every edge
console.log("\ndriven off every tread at full speed");
let falls = 0;
let worst = { drop: 0, where: "" };
for (const t of treads) {
  // straight out, and along the flight both ways at 45 degrees outward
  const out = [Math.cos(t.a), Math.sin(t.a)] as const;
  const along = [-Math.sin(t.a), Math.cos(t.a)] as const;
  for (const [label, hx, hz] of [
    ["out", out[0], out[1]],
    ["out and up", out[0] * 0.7 + along[0] * 0.7, out[1] * 0.7 + along[1] * 0.7],
    ["out and down", out[0] * 0.7 - along[0] * 0.7, out[1] * 0.7 - along[1] * 0.7],
    ["straight on", along[0], along[1]],
  ] as const) {
    place(t.x, t.top + 0.05, t.z);
    for (let i = 0; i < 90; i++) step(hx * WALK, hz * WALK);
    // Stepping back down the flight, or off one of its low first steps on to
    // the ledge it starts from, is not falling off the mountain. Ending up
    // below that ledge is.
    const drop = t.top - cap.y;
    if (cap.y < FLIGHTS[t.f]!.fromY - 0.5) {
      falls++;
      if (process.env.VERBOSE) console.log(`       fell ${drop.toFixed(1)}m: flight ${t.f + 1} tread ${t.k}, pushed ${label}`);
      if (drop > worst.drop) worst = { drop, where: `flight ${t.f + 1} tread ${t.k}, pushed ${label}` };
    }
  }
}
check(falls === 0, `nothing falls off the stairs: ${falls} of ${treads.length * 4} shoves fell${worst.drop ? `, worst ${worst.drop.toFixed(1)}m from ${worst.where}` : ""}`);

// ---- 2b. the ledges between the flights, where she walks round to the next one
console.log("\ndriven off the ledges between the flights");
const LEDGES = [
  { name: "the strawberry ring", y: M.ringY, rIn: M.deckRadius, rOut: M.ringRadius },
  { name: "the deck", y: M.deckY, rIn: M.scoopRadius, rOut: M.deckRadius },
  { name: "the bubblegum ring", y: M.scoopY, rIn: M.summitRadius, rOut: M.scoopRadius },
];
for (const L of LEDGES) {
  let off = 0;
  let tried = 0;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = (L.rIn + L.rOut) / 2;
    place(O.x + Math.cos(a) * r, L.y + 0.3, O.z + Math.sin(a) * r);
    if (Math.abs(cap.y - L.y) > 0.5) continue; // a flight or a landing stands here
    tried++;
    for (let k = 0; k < 90; k++) step(Math.cos(a) * WALK, Math.sin(a) * WALK);
    if (cap.y < L.y - 1.0) {
      off++;
      if (process.env.VERBOSE) console.log(`       ${L.name}: over the edge at ${((a * 180) / Math.PI).toFixed(0)} degrees`);
    }
  }
  check(off === 0, `${L.name}: ${off} of ${tried} runs at the edge went over`);
}

// ---- 3. a wobbly climb, the way she steers
console.log("\nclimbing with a wobble on the stick");
let offs = 0;
const RUNS = 12;
for (let run = 0; run < RUNS; run++) {
  place(treads[0]!.x, 0.2, treads[0]!.z + 0.5);
  for (let i = 1; i < route.length; i++) {
    const w = route[i]!;
    walkTo(w.x, w.z, 5, 0.55, run + 1);
    if (cap.y < w.min - 0.6) {
      offs++;
      const where = w.tread ? `flight ${w.tread.f + 1} tread ${w.tread.k}` : "the ledge";
      if (process.env.VERBOSE) console.log(`       climb ${run + 1} came off heading for ${where}, landed at ${cap.y.toFixed(1)}m`);
      break;
    }
  }
}
check(offs === 0, `a wobbly climber stays on the stairs: ${offs} of ${RUNS} climbs came off`);

console.log(fails ? `\n${fails} FAILED` : "\nall mountain checks passed");
if (fails) process.exitCode = 1;
