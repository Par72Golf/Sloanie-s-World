/**
 * Emmett's day, and whether he can actually get across the park.
 *
 * The dad's note on the birthday morning was "emmett gets caught up on lots of
 * stuff and has a hard time getting to you". He was right: with a straight-line
 * "head for her, sidestep when stuck" steer, the arrival plaza, walkways, kite
 * field, duck pond, flower garden, story circle, fairground green, zoo, bowls
 * club, mini golf and lava course were between him and her almost everywhere,
 * and he only ever got home because of the 30-second give-up teleport. He now
 * plans a route over a coarse grid of the real colliders (src/game/navgrid.ts).
 *
 * This tool proves it four ways:
 *
 *   1. the park as he sees it: grid size, how much of it is solid, and that
 *      one connected region holds the great majority of the open ground
 *   2. what it costs: the one-off build, the worst single re-plan, and the
 *      per-frame cost of following a route
 *   3. the rounds: from several starting points, with her standing in many
 *      places including awkward ones (inside the maze, on the lookout, the
 *      far corners, beside the lava course), he reaches her, never sits
 *      wedged for more than a second or two, and gets home afterwards
 *   4. the routine: the original 15-minute run, lapping at home, riding out,
 *      catching her and pedalling back, with no NaN transforms
 *
 * The 30-second give-up is still there as a last resort (scaled by how far
 * from home he is, because a ride in from the far corner of a 320m park is a
 * genuine 45 seconds). It must never fire: this tool counts every one.
 *
 * Run: npx jiti tools/emmett-home.ts          (exits 1 on any failure)
 *      npx jiti tools/emmett-home.ts rounds   prints every round, not just the worst
 */
import * as THREE from "three";
import { Emmett } from "../src/game/emmett";
import { EMMETT_BASE } from "../src/game/emmett-base";
import { LEVELS } from "../src/game/levels";
import { collidersFor } from "../src/game/colliders";
import { navGridFor } from "../src/game/navgrid";
import { EMMETT_WALKWAYS } from "../src/game/emmett";

/* ----------------------------------------------- headless browser stand-ins */
const warn = console.warn; console.warn = (...a: unknown[]) => { if (typeof a[0] === "string" && a[0].includes("undefined")) return; warn(...a); };
const noop = () => {};
const ctx = new Proxy({} as Record<string, unknown>, {
  get: (target, k) => (k === "getImageData" || k === "createImageData" ? (a: number, b: number, w = a, h = b) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }) : k === "measureText" ? () => ({ width: 40 }) : k in target ? target[k as string] : noop),
  set: (target, k, v) => ((target[k as string] = v), true),
});
(globalThis as any).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
const anyNode: any = new Proxy(function () {}, { get: (_t, k) => (k === "then" ? undefined : k === Symbol.toPrimitive ? () => 0 : k === "currentTime" || k === "sampleRate" ? 1 : anyNode), apply: () => anyNode, construct: () => anyNode, set: () => true });
(globalThis as any).window = { AudioContext: anyNode, setInterval: () => 0, clearInterval: () => {} };

const lv = LEVELS[0]!;
const cols = collidersFor(lv);
const keepOut = lv.emmettKeepOut ?? [];
const scene = new THREE.Scene();
const base = { x: EMMETT_BASE.x, z: EMMETT_BASE.z, loop: EMMETT_BASE.loop, park: EMMETT_BASE.trikePark };
const verbose = process.argv[2] === "rounds";

/** His own ride speed and catch radius (emmett.ts), for the timings below. */
const SPEED = 5.1;
const CATCH_R = 2.6;
const DT = 1 / 30;

let failures = 0;
let passes = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`);
  if (ok) passes++;
  else failures++;
};
const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);

/* ------------------------------------------- 1. the park as he sees it */

console.log("the park as he sees it");
// the same arguments emmett.ts passes, so this is the very grid he plans on
const nav = navGridFor(lv.bounds, cols, keepOut, 0.8, 3.2, EMMETT_WALKWAYS);
{
  let open = 0;
  for (let i = 0; i < nav.cells; i++) if (!nav.blockedAt(nav.cellX(i), nav.cellZ(i))) open++;
  const main = nav.mainComponent;
  const mainCells = nav.componentCells(main);
  console.log(
    `       ${nav.nx} x ${nav.nz} cells of ${nav.cell}m, ${open} open (${((open / nav.cells) * 100).toFixed(0)}%), ` +
      `${nav.components} separate regions, built in ${f1(nav.buildMs)}ms`,
  );
  check(nav.buildMs < 400, `the grid builds once in ${f1(nav.buildMs)}ms (want under 400)`);
  check(
    mainCells / open > 0.8,
    `one region holds ${((mainCells / open) * 100).toFixed(0)}% of the open ground (${mainCells} cells), so a route usually exists`,
  );
  const yard = nav.componentAt(EMMETT_BASE.trikePark[0], EMMETT_BASE.trikePark[2]);
  check(yard === main, "his own yard is in that region, so he can leave home and come back");
}

/* --------------------------------------------------- the round-trip harness */

const e = new Emmett(scene, lv.bounds, keepOut, base);

const inKeepOut = (x: number, z: number, pad = 0) =>
  keepOut.some((k) => x > k.minX - pad && x < k.maxX + pad && z > k.minZ - pad && z < k.maxZ + pad);

/** Can he, in principle, get within arm's reach of her there? */
const reachable = (x: number, z: number) =>
  !inKeepOut(x, z, 1) && nav.componentAt(x, z) === nav.componentAt(EMMETT_BASE.trikePark[0], EMMETT_BASE.trikePark[2]);

type Round = {
  start: string;
  spot: string;
  /** seconds from setting off to reaching her, or to settling at the nearest spot he can get to */
  out: number;
  /** seconds pedalling home afterwards */
  home: number;
  /** longest unbroken stretch of going nowhere while he was trying to move */
  wedge: number;
  /** how close he ever got */
  closest: number;
  caught: boolean;
  failsafe: number;
  straight: number;
};

/**
 * One outing: put him at (sx, sz), send him after her at (hx, hz), then send
 * him home and watch him all the way back to the yard.
 */
function round(start: string, sx: number, sz: number, spot: string, hx: number, hz: number, limit = 150): Round {
  e.sendOut(sx, sz);
  const gu0 = e.navStats.homeGiveUps;
  let t = 0;
  let out = -1;
  let home = -1;
  let wedge = 0;
  let worstWedge = 0;
  let closest = Infinity;
  let caught = false;
  let lastX = sx;
  let lastZ = sz;
  let leaving = false;
  for (let i = 0; i < limit * 30; i++) {
    t += DT;
    const hit = e.update(DT, t, hx, hz, 3, 16, cols, false);
    const pos = e.group.position;
    const moved = Math.hypot(pos.x - lastX, pos.z - lastZ);
    lastX = pos.x;
    lastZ = pos.z;
    closest = Math.min(closest, Math.hypot(pos.x - hx, pos.z - hz));
    // waiting at the edge of somewhere he cannot follow her into is not a wedge
    if (!e.waiting && e.state !== "talking" && e.state !== "home") {
      if (moved < SPEED * DT * 0.3) {
        wedge += DT;
        worstWedge = Math.max(worstWedge, wedge);
      } else wedge = 0;
    } else wedge = 0;

    if (out < 0) {
      if (hit) {
        caught = true;
        out = t;
      } else if (e.waiting) {
        // as close as he can get: he has arrived as far as he is concerned
        out = t;
      } else if (e.state === "leaving") {
        out = t; // he gave up on his own
      }
      if (out >= 0 && e.state !== "leaving") {
        e.leave();
        leaving = true;
      } else if (out >= 0) leaving = true;
    } else if (leaving && e.state === "home") {
      home = t - out;
      break;
    }
  }
  return {
    start,
    spot,
    out,
    home,
    wedge: worstWedge,
    closest,
    caught,
    failsafe: e.navStats.homeGiveUps - gu0,
    straight: Math.hypot(hx - sx, hz - sz),
  };
}

/* -------------------------------------------------------- 2. what it costs */

console.log("\nwhat it costs");
{
  // a long haul across the park, so the planner has real work to do
  const before = { ...e.navStats };
  const t0 = performance.now();
  let frames = 0;
  e.sendOut(EMMETT_BASE.trikePark[0], EMMETT_BASE.trikePark[2]);
  let t = 0;
  for (let i = 0; i < 90 * 30; i++) {
    t += DT;
    // she walks a slow circle out at the far south-west, so he re-plans often
    const hx = -110 + Math.cos(t * 0.25) * 18;
    const hz = 96 + Math.sin(t * 0.25) * 18;
    e.update(DT, t, hx, hz, 3, 16, cols, false);
    frames++;
    if (e.state === "leaving" || e.state === "away") break;
  }
  const ms = performance.now() - t0;
  const plans = e.navStats.plans - before.plans;
  const planMs = e.navStats.planMs - before.planMs;
  console.log(
    `       ${frames} frames in ${f1(ms)}ms: ${f2(ms / frames)}ms a frame, ` +
      `${plans} re-plans (${f1(plans / (frames / 30) * 60)} a minute), ${f2(planMs / Math.max(1, plans))}ms each`,
  );
  check(e.navStats.worstPlanMs < 15, `the worst single re-plan is ${f2(e.navStats.worstPlanMs)}ms (want under 15)`);
  check(ms / frames < 0.35, `following a route costs ${f2(ms / frames)}ms a frame including re-plans (want under 0.35)`);
  check(e.navStats.truncated === 0, `no search ever ran out of budget (worst ${e.navStats.worstExpanded} cells expanded)`);
}

/* ------------------------------------------------------------ 3. the rounds */

console.log("\nthe rounds: many starts, many places for her to be");

/** Where a previous encounter might have left him, all round the park. */
const STARTS: [string, number, number][] = [
  ["his yard", EMMETT_BASE.trikePark[0], EMMETT_BASE.trikePark[2]],
  ["the spawn", 0, 22],
  ["the west road", -91, 3.5],
  ["the campground", 114, 116],
  ["the ball field", 0, -95],
  ["the north street", -9, 100],
];

/** Where she might be standing, awkward places included. */
const SPOTS: [string, number, number][] = [
  ["the spawn lawn", 0, 22],
  ["the pond lawn", 0, -38],
  ["the plaza", 0, 12],
  ["the kite field", -23, 17],
  ["the duck pond bank", 14.8, -22],
  ["the flower garden", 13, 31],
  ["the story circle", -8.5, -14],
  ["the fairground green", -39, 51],
  ["inside the maze", -42, -18],
  ["the lookout deck", 79, -114],
  ["beside the lava course", -103, -104],
  ["the mini golf tee", 20, -132],
  ["the bowls green", 97, 92],
  ["the zoo", -56, 26],
  ["the carousel", -16, 53],
  ["the treehouse", -102, 3],
  ["the splash pad", -95, 28],
  ["the campground", 124, 128],
  ["her doorstep", -9, 106],
  ["the far north-east", 148, -148],
  ["the far south-west", -148, 148],
  ["the far north-west", -148, -148],
  ["the cave mouth", 58, -104],
];

const rounds: Round[] = [];
for (const [sName, sx, sz] of STARTS) {
  for (const [hName, hx, hz] of SPOTS) {
    rounds.push(round(sName, sx, sz, hName, hx, hz));
  }
}

const canReach = rounds.filter((r) => reachable(r.spot === "" ? 0 : SPOTS.find((s) => s[0] === r.spot)![1], SPOTS.find((s) => s[0] === r.spot)![2]));
const cannot = rounds.filter((r) => !canReach.includes(r));

{
  const missed = canReach.filter((r) => !r.caught);
  check(missed.length === 0, `he reaches her in all ${canReach.length} rounds where a route exists${missed.length ? `: missed ${missed.map((m) => `${m.start} -> ${m.spot}`).join(", ")}` : ""}`);

  // The park is 320m across, so the yardstick is the straight-line ride, not a
  // flat number of seconds: a ride from one far corner to the other is 70s of
  // pedalling before anything is in the way at all.
  const budget = (r: Round) => 12 + (Math.max(0, r.straight - CATCH_R) / SPEED) * 1.7;
  const ratio = (r: Round) => r.out / Math.max(1, (r.straight - CATCH_R) / SPEED);
  const slowest = canReach.reduce((a, b) => (b.out > a.out ? b : a), canReach[0]!);
  const windiest = canReach.reduce((a, b) => (ratio(b) > ratio(a) ? b : a), canReach[0]!);
  const late = canReach.filter((r) => r.out > budget(r));
  check(
    late.length === 0,
    `every ride out is inside 12s + 1.7x the straight-line ride${late.length ? `: ${late.map((r) => `${r.start} -> ${r.spot} ${f1(r.out)}s`).join(", ")}` : ""}`,
  );
  console.log(
    `       worst ride out ${f1(slowest.out)}s (${slowest.start} to ${slowest.spot}, ${f1(slowest.straight)}m away); ` +
      `windiest route ${f1(ratio(windiest))}x the straight line (${windiest.start} to ${windiest.spot})`,
  );
  const mean = canReach.reduce((a, r) => a + r.out, 0) / canReach.length;
  console.log(`       average ride out ${f1(mean)}s over ${canReach.length} rounds`);

  const worstWedge = rounds.reduce((a, b) => (b.wedge > a.wedge ? b : a), rounds[0]!);
  check(
    worstWedge.wedge <= 2,
    `he is never stuck for more than ${f1(worstWedge.wedge)}s (${worstWedge.start} to ${worstWedge.spot})`,
  );

  const lost = rounds.filter((r) => r.home < 0);
  check(lost.length === 0, `he gets home in all ${rounds.length} rounds${lost.length ? `: lost after ${lost.map((m) => `${m.start} -> ${m.spot}`).join(", ")}` : ""}`);
  const slowHome = rounds.reduce((a, b) => (b.home > a.home ? b : a), rounds[0]!);
  console.log(`       worst ride home ${f1(slowHome.home)}s, from ${slowHome.spot}`);

  check(
    e.navStats.worstNear < 512,
    `the per-frame collision short list never filled up (worst ${e.navStats.worstNear} of 512 boxes beside him)`,
  );

  const fired = rounds.reduce((a, r) => a + r.failsafe, 0);
  check(fired === 0, `the 30-second give-up teleport fired ${fired} times in ${rounds.length} rounds`);

  // she is up the lookout, in the maze, in the zoo: he should stand off, not grind
  const standOff = cannot.filter((r) => r.closest < 26 && r.home >= 0);
  check(
    standOff.length === cannot.length,
    `where she is somewhere a trike cannot go (${cannot.length} rounds) he rides as close as he can and then goes home`,
  );
}

if (verbose) {
  console.log("");
  for (const r of rounds) {
    console.log(
      `       ${r.start.padEnd(16)} -> ${r.spot.padEnd(24)} out ${f1(r.out).padStart(5)}s  home ${f1(r.home).padStart(5)}s  ` +
        `wedge ${f1(r.wedge)}s  closest ${f1(r.closest)}m${r.caught ? "" : "  (stood off)"}`,
    );
  }
}

/* ----------------------------------------------------------- 4. the routine */

console.log("\nthe routine: 15 minutes of his own timers");
{
  const e2 = new Emmett(scene, lv.bounds, keepOut, base);
  // the browser can hand the first frame a zero or negative length; that once
  // made his lean NaN and hid him for the rest of the game
  e2.update(0, 0, 0, 22, 3, 16, cols, false);
  e2.update(-0.004, 0, 0, 22, 3, 16, cols, false);
  let nanFrames = 0;
  const finite = () => {
    let ok = true;
    e2.group.updateMatrixWorld(true);
    e2.group.traverse((o) => { if (o.matrixWorld.elements.some((v) => !Number.isFinite(v))) ok = false; });
    return ok;
  };
  let last = "";
  let t = 0;
  /*
   * Two meeting places: the spawn lawn, and the pond lawn south of the big
   * stepped berm that sits between the middle of the park and his yard. The
   * pond lawn is where a tester found him circling for good, never getting
   * home, which took his truck game with him.
   */
  const MEET = [
    { name: "spawn lawn", x: 0, z: 22 },
    { name: "pond lawn", x: 0, z: -38 },
  ];
  let caught = 0;
  let homeAgain = 0;
  let outstanding = false;
  for (let i = 0; i < 30 * 900; i++) {
    t += DT;
    // swap meeting place halfway, so both routes home are exercised
    const her = MEET[i < 30 * 450 ? 0 : 1]!;
    const c = e2.update(DT, t, her.x, her.z, 3, 16, cols, false);
    if (e2.state !== last) {
      if (verbose) console.log(`       ${f1(t)}s ${last} -> ${e2.state} at (${f1(e2.group.position.x)}, ${f1(e2.group.position.z)}) [${her.name}]`);
      if (last === "leaving" && e2.state === "home") {
        homeAgain++;
        outstanding = false;
      }
      last = e2.state;
    }
    if (i % 30 === 0 && !finite()) nanFrames++;
    if (c) {
      caught++;
      outstanding = true;
      e2.leave();
    }
  }
  console.log(`       ${caught} encounters, ${homeAgain} rides home${outstanding ? " (one still in flight at the whistle)" : ""}`);
  check(caught >= 3, `he finds her ${caught} times in 15 minutes (want 3 or more)`);
  check(nanFrames === 0, `no NaN transform in ${nanFrames === 0 ? "any" : "some"} sampled frame`);
  // every finished encounter must end with him back at the yard, or his truck game is gone
  check(homeAgain >= caught - (outstanding ? 1 : 0), `every finished encounter ended back at the yard (${homeAgain} of ${caught})`);
  check(e2.navStats.homeGiveUps === 0, `the give-up teleport fired ${e2.navStats.homeGiveUps} times in the 15 minutes`);
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
