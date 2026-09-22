/**
 * Marshmallow Toss, played headlessly.
 *
 * The one number that decides whether a seven-year-old can play this is how
 * long the button may be held and still land the marshmallow in the mug. So
 * this sweeps the whole meter in millisecond steps with exactly the physics
 * the game runs (`stepMarsh` from marshmallow-toss.ts) and reports, per mug,
 * the window in milliseconds — the same measurement tools/lava.ts makes for
 * the jumps, where the tightest window on the shipped course is 183ms.
 *
 * It also checks the booth against the park it stands in: that nothing the
 * level places is inside the lane, that the colliders it adds cannot pen her
 * in, and that both ends of the meter are real misses.
 *
 * Run: npx jiti tools/toss.ts
 */
import {
  CATCH_R,
  CHARGE_TIME,
  MAX_V,
  MIN_V,
  TIP_V,
  TOSS,
  TOSS_SITE,
  freshMugs,
  powerFor,
  powerToSpeed,
  rangeFor,
  settleTime,
  throwOnce,
  tossColliders,
  tossTickets,
} from "../src/game/marshmallow-toss";
import { sugarRushPark } from "../src/game/sugar-level";
import type { Prop } from "../src/game/types";

let fails = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) fails++;
  if (!ok || process.env.VERBOSE) console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`);
};
const f2 = (n: number) => n.toFixed(2);

/* ------------------------------------------------------------ the throw */

console.log("the lane");
console.log(`  the line is at (${TOSS.x}, ${TOSS.z}), the lane runs east`);
for (let i = 0; i < TOSS.mugD.length; i++) {
  const d = TOSS.mugD[i]!;
  console.log(`  mug ${i + 1}: ${f2(d)}m out, meter at ${(powerFor(d) * 100).toFixed(0)}%`);
}
console.log(`  the meter throws ${f2(rangeFor(MIN_V))}m at nothing and ${f2(rangeFor(MAX_V))}m at full`);

check(rangeFor(MIN_V) < TOSS.mugD[0]! - 0.6, `no power falls short of mug 1 (${f2(rangeFor(MIN_V))}m against ${TOSS.mugD[0]}m)`);
check(rangeFor(MAX_V) > TOSS.mugD[2]! + 1.5, `full power sails past mug 3 (${f2(rangeFor(MAX_V))}m against ${TOSS.mugD[2]}m)`);
for (let i = 0; i < 3; i++) {
  const p = powerFor(TOSS.mugD[i]!);
  check(p > 0.05 && p < 0.95, `mug ${i + 1} sits inside the meter, not against an end (${(p * 100).toFixed(0)}%)`);
}

/**
 * The window for one mug: every hold time that lands a marshmallow in it,
 * with the other mugs empty and standing. Swept in 1ms of hold.
 */
function windowFor(mug: number) {
  const stepMs = 1;
  const holdMs = Math.round(CHARGE_TIME * 1000);
  let best = { from: 0, to: 0 };
  let run: { from: number; to: number } | null = null;
  for (let ms = 0; ms <= holdMs; ms += stepMs) {
    const r = throwOnce(ms / 1000 / CHARGE_TIME, freshMugs());
    const hit = r.hit.kind === "in" && r.hit.mug === mug;
    if (hit) run = run ? { from: run.from, to: ms } : { from: ms, to: ms };
    else {
      if (run && run.to - run.from > best.to - best.from) best = run;
      run = null;
    }
  }
  if (run && run.to - run.from > best.to - best.from) best = run;
  return best;
}

console.log("\nthe timing window: how long the button may be held and still go in");
let tightest = Infinity;
for (let i = 0; i < 3; i++) {
  const w = windowFor(i);
  const width = w.to - w.from + 1;
  tightest = Math.min(tightest, width);
  const mid = (w.from + w.to) / 2;
  console.log(
    `  mug ${i + 1} (${TOSS.mugD[i]}m): a ${width}ms window, from ${w.from}ms to ${w.to}ms of hold` +
      ` (the meter at ${((mid / 1000 / CHARGE_TIME) * 100).toFixed(0)}%)`,
  );
  check(width >= 250, `mug ${i + 1}'s window is ${width}ms, which a child can hit`);
}
console.log(`  tightest window on the booth: ${tightest}ms (the lava course's tightest jump is 183ms)`);

/* --------------------------------------------------------- what a miss does */

console.log("\nmissing");
let short = 0;
let long = 0;
let tips = 0;
let ins = 0;
let samples = 0;
for (let ms = 0; ms <= CHARGE_TIME * 1000; ms += 5) {
  const r = throwOnce(ms / 1000 / CHARGE_TIME, freshMugs());
  samples++;
  if (r.hit.kind === "in") ins++;
  else {
    if (r.hit.kind === "hit" && r.hit.tip) tips++;
    if (r.d < TOSS.mugD[0]!) short++;
    else if (r.d > TOSS.mugD[2]!) long++;
  }
}
console.log(
  `  of ${samples} hold times: ${ins} land in a mug, ${tips} knock one over,` +
    ` ${short} come down before the first mug, ${long} past the last`,
);
check(throwOnce(0, freshMugs()).hit.kind !== "in", "the very bottom of the meter misses");
check(throwOnce(1, freshMugs()).hit.kind !== "in", "the very top of the meter misses");
check(short > 0, "she can throw too softly");
check(long > 0, "she can throw too hard");
check(tips > 0, `a hard enough throw tips a mug over (over ${TIP_V}m/s at the rim)`);
check(ins / samples > 0.25, `a quarter of the whole meter goes in somewhere (${((ins / samples) * 100).toFixed(0)}%)`);

// a hard throw at the near mug knocks the middle one over, which is the
// behaviour the booth is meant to show off
const hard = throwOnce(powerFor(TOSS.mugD[1]!) + 0.02, freshMugs());
check(hard.hit.kind !== "ground", `a throw a touch past mug 2 reaches it (${hard.hit.kind})`);

// nothing gets stuck in the air
for (let ms = 0; ms <= CHARGE_TIME * 1000; ms += 17) {
  const r = throwOnce(ms / 1000 / CHARGE_TIME, freshMugs());
  if (r.path.length >= 660) {
    check(false, `a throw at ${ms}ms never came down`);
    break;
  }
}

/* ----------------------------------------------------------- the scoring */

console.log("\ntickets");
for (let m = 0; m <= 3; m++) console.log(`  ${m} mug${m === 1 ? "" : "s"}: ${tossTickets(m)} tickets`);
check(tossTickets(0) > 0, "a go with nothing in it still pays, so losing costs her nothing");
check(tossTickets(3) > tossTickets(2) + 3, "all three is worth going for");

/* ------------------------------------------------------------- the ground */

console.log("\nwhere it stands");
const level = sugarRushPark();
const pos = (p: Prop): [number, number] =>
  "pos" in p ? [p.pos[0], p.pos[2]] : [(p as { x: number }).x, (p as { z: number }).z];
const solid = (p: Prop) => {
  if (p.kind === "box") return p.collide !== false && p.size[1] > 0.35;
  if (p.kind === "cyl") return p.collide !== false && p.h > 0.35;
  return p.kind === "model" || p.kind === "tree" || p.kind === "house" || p.kind === "lollipop";
};
const clash = level.props.filter((p) => {
  if (!solid(p)) return false;
  const [x, z] = pos(p);
  return x > TOSS_SITE.minX - 1.6 && x < TOSS_SITE.maxX + 1.6 && z > TOSS_SITE.minZ - 1.6 && z < TOSS_SITE.maxZ + 1.6;
});
check(clash.length === 0, `the lane is clear ground: ${clash.length} of the park's solids are in it`);
for (const c of clash) console.log(`       ${c.kind} at ${pos(c).map(f2).join(", ")}`);

const inLane = (x: number, z: number) =>
  x > TOSS_SITE.minX && x < TOSS_SITE.maxX && z > TOSS_SITE.minZ && z < TOSS_SITE.maxZ;
check(!level.dumplings.some((d) => inLane(d.pos[0], d.pos[2])), "no candy is hidden in the lane");
check(!(level.juice ?? []).some(([x, z]) => inLane(x, z)), "no cotton candy is in the lane");
check(
  !(level.accessories ?? []).some((a) => inLane(a.pos[0], a.pos[2])),
  "nothing to wear is in the lane",
);

/* ----------------------------------------------------------- the colliders */

console.log("\nthe colliders it adds");
const boxes = tossColliders();
console.log(`  ${boxes.length}: the counter, two sign posts and three plinths`);
for (const b of boxes) {
  const w = b.maxX - b.minX;
  const d = b.maxZ - b.minZ;
  check(w < 1.3 && d < 3.0, `nothing it adds is a wall (${f2(w)} x ${f2(d)}, ${f2(b.maxY)} high)`);
}
// a pocket needs solids on three sides of a square metre. Walk the lane on a
// half-metre grid and prove every cell has a way out to open ground.
const step = 0.5;
const pad = 4;
const cells = new Set<string>();
const key = (i: number, j: number) => `${i}:${j}`;
const blocked = (x: number, z: number) =>
  boxes.some((b) => x > b.minX - 0.34 && x < b.maxX + 0.34 && z > b.minZ - 0.34 && z < b.maxZ + 0.34 && b.maxY > 0.62);
const i0 = Math.floor((TOSS_SITE.minX - pad) / step);
const i1 = Math.ceil((TOSS_SITE.maxX + pad) / step);
const j0 = Math.floor((TOSS_SITE.minZ - pad) / step);
const j1 = Math.ceil((TOSS_SITE.maxZ + pad) / step);
for (let i = i0; i <= i1; i++) {
  for (let j = j0; j <= j1; j++) if (!blocked(i * step, j * step)) cells.add(key(i, j));
}
// flood from a corner well outside the booth
const startI = i0;
const startJ = j0;
const seen = new Set<string>([key(startI, startJ)]);
const queue = [[startI, startJ] as [number, number]];
while (queue.length) {
  const [i, j] = queue.pop()!;
  for (const [di, dj] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const k = key(i + di, j + dj);
    if (!cells.has(k) || seen.has(k)) continue;
    seen.add(k);
    queue.push([i + di, j + dj]);
  }
}
check(seen.size === cells.size, `every square she can stand on is connected to open ground (${seen.size} of ${cells.size})`);

// Step-up is 0.62m. Each solid is deliberately on one side of it or the
// other: the counter is a thing she steps over, the plinths and the posts are
// things she walks round. Nothing is a hidden lip, because every one of them
// is the box of a mesh that is drawn at exactly those dimensions.
const STEP_UP = 0.62;
check(boxes[0]!.maxY < STEP_UP, `the counter is low enough to step over (${f2(boxes[0]!.maxY)}m)`);
check(
  boxes.slice(1).every((b) => b.maxY > STEP_UP),
  "the posts and plinths are all too tall to climb, so none of them is a step to nowhere",
);
check(CATCH_R < TOSS.mouthR + 0.08, `the catch radius is the mouth of the mug, not more (${CATCH_R} against ${TOSS.mouthR})`);
check(MAX_V > MIN_V, "the meter runs the right way round");
check(powerToSpeed(0) === MIN_V && powerToSpeed(1) === MAX_V, "the meter covers exactly the speed range");

/* ------------------------------------------------------- every throw ends */

/*
 * A throw that never settles is a game that never ends: no card, no tickets,
 * and the marshmallow spent. The bounce off a mug used to do exactly that when
 * the marshmallow clipped the wall near the rim — the ~0.6 m/s hop was not
 * enough to clear the mug, so it landed on the same wall again, for ever. This
 * sweeps the whole meter against fresh mugs and against mugs already filled
 * (which change what it can collide with) and fails on anything still in the
 * air after MAX_SETTLE.
 */
console.log("\nevery throw ends");
const MAX_SETTLE = 4;
let worst = { seconds: 0, ms: 0, kind: "", filled: "" };
for (const [label, mugs] of [
  ["fresh", () => freshMugs()],
  ["first filled", () => freshMugs().map((m, i) => (i === 0 ? { ...m, filled: true } : m))],
  ["first two filled", () => freshMugs().map((m, i) => (i < 2 ? { ...m, filled: true } : m))],
  ["first knocked over", () => freshMugs().map((m, i) => (i === 0 ? { ...m, tip: 1 } : m))],
] as [string, () => ReturnType<typeof freshMugs>][]) {
  for (let ms = 0; ms <= CHARGE_TIME * 1000; ms += 2) {
    const r = settleTime(ms / 1000 / CHARGE_TIME, mugs());
    if (r.seconds > worst.seconds) worst = { seconds: r.seconds, ms, kind: r.kind, filled: label };
    if (r.kind !== "in" && r.kind !== "ground") {
      check(false, `${label}, held ${ms}ms: the marshmallow ${r.kind}`);
      break;
    }
  }
}
check(
  worst.seconds < MAX_SETTLE,
  `the slowest throw settles in ${f2(worst.seconds)}s (${worst.filled}, held ${worst.ms}ms, ${worst.kind}) — must be under ${MAX_SETTLE}s`,
);

console.log(fails === 0 ? "\nall checks passed" : `\n${fails} FAILED`);
if (fails) process.exitCode = 1;
