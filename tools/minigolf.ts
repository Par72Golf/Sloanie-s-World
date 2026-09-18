/**
 * Mini golf, played headlessly with the game's own physics.
 *
 * Nothing in this environment can draw a frame, so the only way to know the
 * course is playable is to putt on it. Everything here calls `stepBall` and
 * `putt` from src/game/minigolf.ts, over the course data park.ts draws from,
 * so a pass means the real game behaves this way.
 *
 * What it proves, per hole:
 *  - the geometry agrees with itself: tee, cup and every obstacle sit inside
 *    the green, and nothing is standing on the tee or in the cup;
 *  - a putt from the tee at a sensible angle and power reaches the cup, at
 *    every phase of the windmill and the rolling log;
 *  - the ball never leaves the borders, whatever it is hit at;
 *  - it never gets permanently stuck: from every place a ball came to rest,
 *    some putt still makes progress, and no stroke ever runs forever;
 *  - a player who aims roughly and pulls the power roughly (a seven-year-old,
 *    modelled as the best of a few tries plus a fat random error) gets round
 *    in a few strokes a hole.
 *
 * Run: npx jiti tools/minigolf.ts   (exits 1 on any failure)
 */
import { LEVELS } from "../src/game/levels";
import { collidersFor } from "../src/game/colliders";
import {
  AIM_LIMIT,
  BALL_R,
  aimDir,
  golfCamera,
  golfSight,
  holeWorld,
  toWorld,
  type GolfCam,
  MAX_V,
  golfPar,
  golfTickets,
  logX,
  putt,
  sailAngle,
  sailBounds,
  sailRect,
  stepBall,
  teeBall,
  type Ball,
} from "../src/game/minigolf";
import { GOLF, GOLF_BLOCKS } from "../src/game/park";

const DT = 1 / 60;
let failures = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failures++;
};

/** A repeatable random, so a failure can be reproduced. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Shot = {
  result: "sunk" | "stop" | "timeout";
  /** how many sixtieths it took */
  frames: number;
  /** the worst distance outside the green seen during the roll */
  escape: number;
  /** the fastest the ball ever went */
  peak: number;
  t: number;
};

/** One stroke, watched all the way to rest. */
function stroke(b: Ball, hole: number, power: number, aim: number, t: number): Shot {
  putt(b, power, aim);
  let escape = 0;
  let peak = 0;
  for (let f = 1; f <= 60 * 25; f++) {
    const r = stepBall(b, hole, DT, t);
    t += DT;
    escape = Math.max(escape, Math.abs(b.x) - (GOLF.halfW - BALL_R), Math.abs(b.z) - (GOLF.halfD - BALL_R));
    peak = Math.max(peak, Math.hypot(b.vx, b.vz));
    if (r !== "roll") return { result: r, frames: f, escape, peak, t };
  }
  return { result: "timeout", frames: 60 * 25, escape, peak, t };
}

const toCup = (b: Ball) => Math.hypot(b.x, b.z - GOLF.cupDz);

/** Is the way ahead of a ball at `x` clear of the moving parts right now? */
function wayOpen(hole: number, t: number, x: number) {
  const pad = BALL_R * 2;
  if (hole === GOLF.log.hole) return Math.abs(x - logX(t)) > GOLF.log.halfLen + pad;
  if (hole === GOLF.windmill.hole) {
    for (let k = 0; k < 4; k++) {
      if (sailRect(k, t) && sailBounds.minX < x + pad && sailBounds.maxX > x - pad) return false;
    }
  }
  return true;
}

/** She watches the sails or the log and putts when the way ahead looks open. */
function waitForGap(hole: number, t: number, x: number) {
  for (let i = 0; i < 60 * 12 && !wayOpen(hole, t, x); i++) t += DT;
  return t;
}

/** Nothing between this spot and the hole's first target (the dogleg's corner). */
function sightOpen(hole: number, x: number, z: number) {
  const [sx, sz] = golfSight(hole);
  if (sx === 0 && sz === GOLF.cupDz) return false;
  const dx = sx - x;
  const dz = sz - z;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.02));
  for (let i = 0; i <= n; i++) if (buried(hole, x + (dx * i) / n, z + (dz * i) / n) > 0) return false;
  return true;
}

/** Nothing standing between this spot and the cup: the next putt can be straight. */
function clearLine(hole: number, x: number, z: number) {
  const dx = -x;
  const dz = GOLF.cupDz - z;
  const n = Math.ceil(Math.hypot(dx, dz) / 0.02);
  for (let i = 0; i <= n; i++) {
    if (buried(hole, x + (dx * i) / n, z + (dz * i) / n) > 0) return false;
  }
  return true;
}

/**
 * The signed aim, in the game's own convention, that points from the ball at
 * (bx, bz) to (tx, tz): positive is the player's right.
 */
function aimOffset(bx: number, bz: number, tx: number, tz: number) {
  const ux = -bx;
  const uz = GOLF.cupDz - bz;
  const ul = Math.hypot(ux, uz) || 1;
  const vx = tx - bx;
  const vz = tz - bz;
  const vl = Math.hypot(vx, vz) || 1;
  const a = ux / ul;
  const b = uz / ul;
  const c = vx / vl;
  const d = vz / vl;
  return Math.atan2(a * d - b * c, a * c + b * d);
}

/**
 * The best a putt from this spot can do, scored the way a player would: in the
 * hole is best, then a line to the cup (or, round a dogleg, to the corner) for
 * the next one, then simply ending closer. Backing sideways out from behind a
 * wall costs distance and is still the right shot, which is why "gets closer"
 * on its own is not the test.
 */
function bestPutt(hole: number, x: number, z: number, t0: number) {
  let best = -Infinity;
  const from = Math.hypot(x, z - GOLF.cupDz);
  for (const wait of [0, 1, 2]) {
    const t = waitForGap(hole, t0 + wait * 0.9, x);
    for (let ai = -8; ai <= 8; ai++) {
      for (let pi = 0; pi <= 8; pi++) {
        const c: Ball = { x, z, vx: 0, vz: 0 };
        const s = stroke(c, hole, pi / 8, (ai / 8) * AIM_LIMIT, t);
        const open = clearLine(hole, c.x, c.z) || sightOpen(hole, c.x, c.z);
        const score = s.result === "sunk" ? 99 : open ? Math.max(1, from - toCup(c)) : from - toCup(c);
        if (score > best) best = score;
        if (best >= 1) return best;
      }
    }
  }
  return best;
}

/**
 * How far a ball at this spot is buried in a static obstacle, in metres.
 * A ball resting on a corner is exactly BALL_R from it and counts as zero;
 * measuring against the obstacle's box grown by BALL_R would call that a
 * 1cm burial, which is what the first version of this check did.
 */
function buried(hole: number, x: number, z: number) {
  let worst = 0;
  for (const o of GOLF_BLOCKS[hole] ?? []) {
    let gap: number;
    if (o.round) {
      gap = Math.hypot(x - o.dx, z - o.dz) - o.w / 2;
    } else {
      const px = Math.max(o.dx - o.w / 2, Math.min(o.dx + o.w / 2, x));
      const pz = Math.max(o.dz - o.d / 2, Math.min(o.dz + o.d / 2, z));
      const inside = Math.abs(x - o.dx) < o.w / 2 && Math.abs(z - o.dz) < o.d / 2;
      gap = inside ? -Math.hypot(x - px, z - pz) - 1e-3 : Math.hypot(x - px, z - pz);
    }
    worst = Math.max(worst, BALL_R - gap);
  }
  return worst;
}
const insideBlock = (hole: number, x: number, z: number) => buried(hole, x, z) > 2e-3;

/* ------------------------------------------- 0. which way is right? */

console.log("aiming");
{
  // Standing behind the ball looking down the hole (towards -z), the player's
  // right hand is +x. Pressing right must send the ball that way. It did not:
  // the aim used to be an angle added in a (sin, cos) frame that turns the
  // other way, so every control on the putting screen was mirrored.
  const d = { x: 0, z: 0 };
  aimDir(0, GOLF.teeDz, 0, d);
  check(d.z < -0.99, `aim 0 goes straight at the cup (${d.x.toFixed(3)}, ${d.z.toFixed(3)})`);
  aimDir(0, GOLF.teeDz, 0.5, d);
  check(d.x > 0.4 && d.z < 0, `positive aim goes to the player's right, +x (${d.x.toFixed(3)}, ${d.z.toFixed(3)})`);
  aimDir(0, GOLF.teeDz, -0.5, d);
  check(d.x < -0.4 && d.z < 0, `negative aim goes to the player's left, -x (${d.x.toFixed(3)}, ${d.z.toFixed(3)})`);
  // and the ball really goes there, through putt()
  const right: Ball = { x: 0, z: 0, vx: 0, vz: 0 };
  teeBall(right);
  stroke(right, 0, 0.55, 0.45, 0);
  const left: Ball = { x: 0, z: 0, vx: 0, vz: 0 };
  teeBall(left);
  stroke(left, 0, 0.55, -0.45, 0);
  check(right.x > 0.5, `a putt aimed right ends right of the tee line (x ${right.x.toFixed(2)})`);
  check(left.x < -0.5, `a putt aimed left ends left of the tee line (x ${left.x.toFixed(2)})`);
}

/* ------------------------------------------------- 1. the course as drawn */

console.log(`mini golf: ${GOLF.holes} holes, par ${GOLF.par} each, ${golfPar()} for the round\n`);
console.log("geometry");
{
  check(GOLF.laneDx.length === GOLF.holes, `${GOLF.laneDx.length} lanes for ${GOLF.holes} holes`);
  check(GOLF.flags.length === GOLF.holes && GOLF.names.length === GOLF.holes, "a flag colour and a name for every hole");
  check(GOLF_BLOCKS.length === GOLF.holes, "a list of obstacles for every hole");
  // the lanes must not touch: each is halfW + wallT either side of its centre
  const pitch = GOLF.laneDx[1]! - GOLF.laneDx[0]!;
  const outer = (GOLF.halfW + GOLF.wallT) * 2;
  check(
    GOLF.laneDx.every((d, i) => i === 0 || Math.abs(d - GOLF.laneDx[i - 1]!) === pitch),
    `lanes evenly spaced, ${pitch}m apart`,
  );
  check(pitch > outer + 0.5, `${(pitch - outer).toFixed(2)}m of apron between one lane's border and the next`);
  // everything the course draws has to fit on the apron
  const span = Math.abs(GOLF.laneDx[0]!) + GOLF.halfW + GOLF.wallT;
  check(span * 2 <= GOLF.apronW, `the lanes span ${(span * 2).toFixed(1)}m on a ${GOLF.apronW}m apron`);
  const deep = Math.max(GOLF.halfD + GOLF.wallT, GOLF.teeDz + 0.6, -GOLF.cupDz + 0.6);
  check(deep * 2 <= GOLF.apronD, `the lanes are ${(deep * 2).toFixed(1)}m deep on a ${GOLF.apronD}m apron`);

  for (let h = 0; h < GOLF.holes; h++) {
    const blocks = GOLF_BLOCKS[h] ?? [];
    const fits = blocks.every(
      (o) =>
        Math.abs(o.dx) + o.w / 2 <= GOLF.halfW + 1e-9 &&
        Math.abs(o.dz) + o.d / 2 <= GOLF.halfD + 1e-9,
    );
    const clearTee = !insideBlock(h, 0, GOLF.teeDz);
    const clearCup = blocks.every((o) => !insideBlock(h, 0, GOLF.cupDz)) && !insideBlock(h, 0, GOLF.cupDz);
    check(fits, `hole ${h + 1} (${GOLF.names[h]}): ${blocks.length} obstacle(s), all inside the borders`);
    check(clearTee && clearCup, `hole ${h + 1}: nothing standing on the tee or in the cup`);
  }
  check(GOLF.cupR > BALL_R * 2.5, `the cup is ${GOLF.cupR}m across the radius, the ball ${BALL_R}m: forgiving`);
}

/* ------------------------------------------- 2. the windmill cannot shut */

console.log("\nthe windmill");
{
  const h = GOLF.windmill.hole;
  const w = GOLF.windmill;
  // how far sideways a sail ever reaches while its tip is down in the grass
  let widest = 0;
  for (let i = 0; i < 4000; i++) {
    const t = (i / 4000) * w.period;
    for (let k = 0; k < 4; k++) {
      if (sailRect(k, t)) widest = Math.max(widest, Math.abs(sailBounds.minX), Math.abs(sailBounds.maxX));
    }
  }
  // the ways round the tower, between a leg and the border
  const legs = GOLF_BLOCKS[h]!;
  const legEdge = Math.max(...legs.map((o) => Math.abs(o.dx) + o.w / 2));
  const sideGap = GOLF.halfW - legEdge;
  check(widest < legEdge, `a sail reaches ${widest.toFixed(2)}m sideways, the tower is ${legEdge.toFixed(2)}m wide: the ways round stay open`);
  check(sideGap > BALL_R * 4, `${sideGap.toFixed(2)}m each side of the tower, for a ${(BALL_R * 2).toFixed(2)}m ball`);
  const door = Math.min(...legs.map((o) => Math.abs(o.dx) - o.w / 2));
  check(door * 2 > BALL_R * 4, `the doorway is ${(door * 2).toFixed(2)}m wide`);
  check(w.hubY >= w.sail, `the sails (${w.sail}m) never dig into the green under a ${w.hubY}m hub`);
}

console.log("\nthe rolling log");
{
  const l = GOLF.log;
  const reach = l.travel + l.halfLen;
  check(reach < GOLF.halfW - BALL_R * 3, `the log reaches ${reach.toFixed(2)}m of ${GOLF.halfW}m: ${(GOLF.halfW - reach).toFixed(2)}m always open at one border`);
  check(l.dz + l.r < GOLF.halfD && l.dz - l.r > GOLF.cupDz + GOLF.cupR, "the log runs clear of the cup and the back border");
  // the straight line from the tee to the cup has to open up, or a putt
  // down the middle could never get through however well it was timed
  check(l.travel > l.halfLen, `the log's swing (${l.travel}m) is longer than its half-length (${l.halfLen}m), so the middle opens`);
  let open = 0;
  const N = 2000;
  for (let i = 0; i < N; i++) if (Math.abs(logX((i / N) * l.period)) > l.halfLen + BALL_R) open++;
  check(open / N > 0.35, `the middle of the lane is clear ${Math.round((open / N) * 100)}% of the time`);
}

/* --------------------------------------- 3. one putt from the tee gets there */

console.log("\none putt from the tee (every phase of the moving parts)");
const PHASES = 12;
for (let h = 0; h < GOLF.holes; h++) {
  let best = { sunk: 0, near: Infinity, aim: 0, power: 0 };
  // the phases that matter: a full turn of the sails, a full swing of the log
  const period = Math.max(GOLF.windmill.period, GOLF.log.period);
  for (let ai = -8; ai <= 8; ai++) {
    for (let pi = 0; pi <= 10; pi++) {
      const aim = (ai / 8) * 0.55;
      const power = 0.5 + pi * 0.05;
      let sunk = 0;
      let near = 0;
      for (let ph = 0; ph < PHASES; ph++) {
        const b: Ball = { x: 0, z: 0, vx: 0, vz: 0 };
        teeBall(b);
        const s = stroke(b, h, power, aim, (ph / PHASES) * period);
        if (s.result === "sunk") sunk++;
        near += toCup(b);
      }
      if (sunk > best.sunk) best = { sunk, near: near / PHASES, aim, power };
    }
  }
  if (best.sunk === PHASES) {
    check(true, `hole ${h + 1}: aim ${best.aim.toFixed(2)}rad at power ${best.power.toFixed(2)} goes in from the tee on ${PHASES}/${PHASES} phases`);
  } else {
    // a dogleg cannot be holed from the tee; the first putt has to open the line
    let opened = 0;
    const period = Math.max(GOLF.windmill.period, GOLF.log.period);
    for (let ph = 0; ph < PHASES; ph++) {
      const b: Ball = { x: 0, z: 0, vx: 0, vz: 0 };
      teeBall(b);
      if (bestPutt(h, b.x, b.z, (ph / PHASES) * period) >= 1) opened++;
    }
    check(
      opened === PHASES,
      `hole ${h + 1}: round the corner, so not holeable from the tee; the first putt opens the line on ${opened}/${PHASES} phases`,
    );
  }
}

/* ---------------------------------------- 4. the ball never leaves the green */

console.log("\ncontainment: 6000 wild putts");
{
  const rand = rng(20260918);
  let worst = 0;
  let stuckIn = 0;
  let timeouts = 0;
  let fastest = 0;
  for (let i = 0; i < 6000; i++) {
    const h = i % GOLF.holes;
    const b: Ball = { x: 0, z: 0, vx: 0, vz: 0 };
    // from anywhere on the green, not inside anything, at any angle and power
    let guard = 0;
    do {
      b.x = (rand() * 2 - 1) * (GOLF.halfW - BALL_R);
      b.z = (rand() * 2 - 1) * (GOLF.halfD - BALL_R);
    } while (insideBlock(h, b.x, b.z) && guard++ < 50);
    b.vx = 0;
    b.vz = 0;
    const s = stroke(b, h, rand(), (rand() * 2 - 1) * Math.PI, rand() * 30);
    worst = Math.max(worst, s.escape);
    fastest = Math.max(fastest, s.peak);
    if (s.result === "timeout") timeouts++;
    else if (s.result === "stop") stuckIn = Math.max(stuckIn, buried(h, b.x, b.z));
  }
  check(worst <= 1e-6, `never past the borders (worst overshoot ${(worst * 1000).toFixed(3)}mm)`);
  check(stuckIn <= 2e-3, `never comes to rest inside an obstacle (deepest ${(stuckIn * 1000).toFixed(2)}mm)`);
  check(timeouts === 0, `every putt comes to rest within 25s (${timeouts} did not)`);
  check(fastest <= MAX_V + 1e-6, `nothing ever speeds the ball up past a full putt (${fastest.toFixed(2)} m/s)`);
}

/* ------------------------------------ 5. nowhere on the green is a dead end */

console.log("\nno dead ends: from every resting place, some putt makes progress");
{
  const rand = rng(777);
  let worstSpot: { h: number; x: number; z: number; gain: number } | null = null;
  for (let h = 0; h < GOLF.holes; h++) {
    for (let i = 0; i < 260; i++) {
      const b: Ball = { x: 0, z: 0, vx: 0, vz: 0 };
      let guard = 0;
      do {
        b.x = (rand() * 2 - 1) * (GOLF.halfW - BALL_R);
        b.z = (rand() * 2 - 1) * (GOLF.halfD - BALL_R);
      } while (insideBlock(h, b.x, b.z) && guard++ < 50);
      const gain = bestPutt(h, b.x, b.z, rand() * 30);
      if (!worstSpot || gain < worstSpot.gain) worstSpot = { h, x: b.x, z: b.z, gain };
    }
  }
  const w = worstSpot!;
  check(
    w.gain >= 1,
    `worst spot is hole ${w.h + 1} at (${w.x.toFixed(2)}, ${w.z.toFixed(2)}): the best putt ${
      w.gain === 99 ? "goes straight in" : w.gain >= 1 ? "opens a clear line to the cup" : `only gains ${w.gain.toFixed(2)}m`
    }`,
  );
}

/* ---------------------------------------- 6. pinned against the moving parts */

console.log("\nthe moving parts never trap the ball");
for (const [what, hole] of [
  ["windmill", GOLF.windmill.hole],
  ["rolling log", GOLF.log.hole],
] as const) {
  const period = what === "windmill" ? GOLF.windmill.period : GOLF.log.period;
  let trapped = 0;
  let escaped = 0;
  for (let ph = 0; ph < 48; ph++) {
    const t0 = (ph / 48) * period;
    for (let xi = -10; xi <= 10; xi++) {
      // parked right in the sweep, then left alone for five seconds
      const b: Ball = {
        x: (xi / 10) * (GOLF.halfW - BALL_R),
        z: what === "windmill" ? GOLF.windmill.dz : GOLF.log.dz,
        vx: 0,
        vz: 0,
      };
      let t = t0;
      for (let f = 0; f < 60 * 5; f++) {
        stepBall(b, hole, DT, t);
        t += DT;
        if (Math.abs(b.x) > GOLF.halfW - BALL_R + 1e-6 || Math.abs(b.z) > GOLF.halfD - BALL_R + 1e-6) escaped++;
      }
      // and it can still be putted on afterwards, by some putt she could pick
      const best = bestPutt(hole, b.x, b.z, t);
      if (best < 1) trapped++;
    }
  }
  check(escaped === 0, `${what}: a ball left sitting in the sweep is never pushed out of the green`);
  check(trapped === 0, `${what}: a ball shoved about can always be putted on again`);
}

/* -------------------------- 6b. tucked in behind an obstacle, and still out */

console.log("\nthe nastiest spots on each green finish in a few strokes");
{
  /** Play on from here, taking the best putt of a fan each time. */
  function greedyFinish(hole: number, x: number, z: number, t0: number, limit: number) {
    const b: Ball = { x, z, vx: 0, vz: 0 };
    let t = t0;
    for (let n = 1; n <= limit; n++) {
      const from = toCup(b);
      let bestScore = -Infinity;
      let pick = { power: 0.5, aim: 0 };
      const at = waitForGap(hole, t, b.x);
      for (let ai = -8; ai <= 8; ai++) {
        for (let pi = 0; pi <= 8; pi++) {
          const c: Ball = { x: b.x, z: b.z, vx: 0, vz: 0 };
          const r = stroke(c, hole, pi / 8, (ai / 8) * AIM_LIMIT, at);
          const score =
            r.result === "sunk" ? 99 : (clearLine(hole, c.x, c.z) ? 1 : 0) + (from - toCup(c)) / 20;
          if (score > bestScore) {
            bestScore = score;
            pick = { power: pi / 8, aim: (ai / 8) * AIM_LIMIT };
          }
        }
      }
      const r = stroke(b, hole, pick.power, pick.aim, at);
      t = r.t;
      if (r.result === "sunk") return n;
    }
    return Infinity;
  }

  for (let h = 0; h < GOLF.holes; h++) {
    const spots: [number, number][] = [[0, GOLF.teeDz]];
    for (const o of GOLF_BLOCKS[h] ?? []) {
      // tucked against the tee side of the obstacle, in line with it
      const face = o.dz + (o.round ? o.w / 2 : o.d / 2) + BALL_R + 0.02;
      for (const off of [-0.4, 0, 0.4]) spots.push([o.dx + off, Math.min(face, GOLF.halfD - BALL_R)]);
    }
    if (h === GOLF.log.hole) for (const off of [-0.6, 0, 0.6]) spots.push([off, GOLF.log.dz + GOLF.log.r + BALL_R + 0.02]);
    let worst = 0;
    let where: [number, number] = [0, 0];
    for (const [x, z] of spots) {
      const n = greedyFinish(h, x, z, 3.7, 6);
      if (n > worst) {
        worst = n;
        where = [x, z];
      }
    }
    check(
      worst <= 4,
      `hole ${h + 1}: worst of ${spots.length} nasty spots is ${worst === Infinity ? "unfinished" : `${worst} strokes`}, from (${where[0].toFixed(2)}, ${where[1].toFixed(2)})`,
    );
  }
}

/* ------------------------------ 6c. she can see what she is aiming at */

console.log("\nthe view from every tee, against the park's real colliders");
{
  const level = LEVELS[0]!;
  // flat things (greens, mats, the apron) are colliders too; a sightline that
  // ends on the grass has to be allowed to reach it
  const boxes = collidersFor(level).filter((b) => b.maxY > 0.25);

  /** Does the segment hit any collider, ignoring its very ends? */
  function blocked(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    for (const o of boxes) {
      let s0 = 0.02;
      let s1 = 0.97;
      let miss = false;
      for (const [p, q, lo, hi] of [
        [dx, ax, o.minX, o.maxX],
        [dy, ay, o.minY, o.maxY],
        [dz, az, o.minZ, o.maxZ],
      ] as const) {
        if (Math.abs(p) < 1e-9) {
          if (q < lo || q > hi) miss = true;
          continue;
        }
        const u = (lo - q) / p;
        const v = (hi - q) / p;
        s0 = Math.max(s0, Math.min(u, v));
        s1 = Math.min(s1, Math.max(u, v));
      }
      if (!miss && s1 > s0) return o.label;
    }
    return null;
  }

  const cam: GolfCam = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0 };
  // the tee, and places the ball really ends up: level with each obstacle,
  // just past it, and on the way to the cup. The worst view on this course was
  // never from the tee: it was from mid-lane, with the windmill between the
  // camera and the ball.
  for (let h = 0; h < GOLF.holes; h++) {
    const spots: [number, number][] = [[0, GOLF.teeDz], [0, 4], [1.7, 1.5], [-1.5, 0], [1.2, -2], [0, -4.5]];
    for (const o of GOLF_BLOCKS[h] ?? []) spots.push([o.dx, o.dz - o.d / 2 - 0.4], [o.dx, o.dz + o.d / 2 + 0.4]);
    let worstBall: string | null = null;
    let worstAim: string | null = null;
    let where: [number, number] = [0, 0];
    let high = 0;
    for (const [px, pz] of spots) {
      if (Math.abs(px) > GOLF.halfW - BALL_R || Math.abs(pz) > GOLF.halfD - BALL_R || insideBlock(h, px, pz)) continue;
      golfCamera(h, px, pz, cam);
      high = Math.max(high, cam.py);
      const [bx, bz] = toWorld(h, px, pz);
      const ball = blocked(cam.px, cam.py, cam.pz, bx, BALL_R + 0.14, bz);
      if (ball && !worstBall) {
        worstBall = ball;
        where = [px, pz];
      }
      const w = holeWorld(h);
      const cup = blocked(cam.px, cam.py, cam.pz, w.x, 0.2, w.cupZ);
      const [sx, sz] = golfSight(h);
      const [tx, tz] = toWorld(h, sx, sz);
      const first = blocked(cam.px, cam.py, cam.pz, tx, 0.2, tz);
      if (cup && first && !worstAim) {
        worstAim = `${cup} / ${first}`;
        where = [px, pz];
      }
    }
    check(
      !worstBall,
      `hole ${h + 1}: the ball is in sight from every camera (up to ${high.toFixed(1)}m up)${
        worstBall ? `, blocked by ${worstBall} at (${where[0]}, ${where[1]})` : ""
      }`,
    );
    check(
      !worstAim,
      `hole ${h + 1}: the cup or ${GOLF.names[h]}'s first target is always in sight${worstAim ? `, both blocked by ${worstAim}` : ""}`,
    );
  }
}

/* ------------------------------------------ 7. a seven-year-old gets round */

console.log("\nrounds, played by a rough aimer");
{
  const rand = rng(424242);
  const ROUNDS = 60;
  const MAX_STROKES = 12;
  const perHole: number[][] = GOLF.laneDx.map(() => []);
  let worstHole = 0;
  let gaveUp = 0;
  const totals: number[] = [];
  for (let r = 0; r < ROUNDS; r++) {
    let total = 0;
    for (let h = 0; h < GOLF.holes; h++) {
      const b: Ball = { x: 0, z: 0, vx: 0, vz: 0 };
      teeBall(b);
      let t = rand() * 60;
      let strokes = 0;
      for (; strokes < MAX_STROKES; ) {
        // she looks at the hole, picks roughly the right strength, and is
        // out by up to 9 degrees and a fifth of the power
        // she plays at the cup when she can see a way to it, and at the
        // corner when she cannot
        const straight = clearLine(h, b.x, b.z);
        const [sx, sz] = golfSight(h);
        const tx = straight ? 0 : sx;
        const tz = straight ? GOLF.cupDz : sz;
        const d = straight ? toCup(b) : Math.hypot(tx - b.x, tz - b.z) * 1.6;
        let aim = aimOffset(b.x, b.z, tx, tz);
        let power = Math.max(0, Math.min(1, (d - 1.2) / 15.5));
        aim += (rand() * 2 - 1) * 0.16;
        power = Math.max(0, Math.min(1, power + (rand() * 2 - 1) * 0.2));
        // she watches the sails and the log and putts when the way looks open
        t = waitForGap(h, t, b.x);
        const s = stroke(b, h, power, aim, t);
        t = s.t;
        strokes++;
        if (s.result === "sunk") break;
        if (s.result === "timeout") break;
      }
      if (strokes >= MAX_STROKES && toCup(b) > GOLF.cupR) gaveUp++;
      perHole[h]!.push(strokes);
      worstHole = Math.max(worstHole, strokes);
      total += strokes;
    }
    totals.push(total);
  }
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  for (let h = 0; h < GOLF.holes; h++) {
    const a = avg(perHole[h]!);
    check(a <= 4, `hole ${h + 1} (${GOLF.names[h]}): ${a.toFixed(2)} strokes on average, worst ${Math.max(...perHole[h]!)}`);
  }
  check(gaveUp === 0, `every hole finished inside ${MAX_STROKES} strokes (${gaveUp} did not)`);
  check(worstHole <= 8, `the worst single hole in ${ROUNDS} rounds took ${worstHole} strokes`);
  const t = avg(totals);
  check(t <= golfPar() + 6, `rounds average ${t.toFixed(1)} against par ${golfPar()}`);
  console.log(
    `  note  a par round pays ${golfTickets(golfPar(), 0)} tickets, an average one ${golfTickets(Math.round(t), 0)}, a bad one ${golfTickets(golfPar() * 2, 0)}`,
  );
}

/* --------------------------------------------------- 8. the moving parts move */

console.log("\nthe moving parts actually move");
{
  const sails = [0, 1, 2, 3].map((i) => sailAngle((i / 4) * GOLF.windmill.period));
  check(new Set(sails.map((a) => a.toFixed(3))).size === 4, `the sails turn once every ${GOLF.windmill.period}s`);
  const xs = [0, 0.25, 0.5, 0.75].map((f) => logX(f * GOLF.log.period));
  check(Math.max(...xs) - Math.min(...xs) > GOLF.log.travel, `the log swings ${(GOLF.log.travel * 2).toFixed(2)}m across the lane every ${GOLF.log.period}s`);
}

console.log(failures ? `\n${failures} failure(s)` : "\nall mini golf checks passed");
process.exit(failures ? 1 : 0);
