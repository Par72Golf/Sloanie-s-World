/**
 * The mountain lookout, through the real collision code.
 *
 * Proves three things about the platform on top of the cave:
 *   1. she can walk to the bottom step from the spawn without ever jumping
 *      (a flood fill finds the way, then she walks it through collision.ts),
 *   2. she can climb the switchback stair to the deck, the telescope, the
 *      bench and the flag with the jump key never pressed, and
 *   3. she cannot walk off any of it: from every tread and all round the
 *      deck she is driven at full speed into the drop and has to stay up.
 *
 * Also checks the arithmetic the collision code cares about: every riser
 * under the 0.62m step-up, every tread deep enough to stand on, and head
 * room above each step (stepping up without headroom was a real bug).
 *
 * Run: npx jiti tools/lookout.ts   (exits 1 on any failure)
 */
import { LEVELS } from "../src/game/levels";
import { collidersFor } from "../src/game/colliders";
import { moveAndCollide, type AABB, type Capsule } from "../src/game/collision";
import { PLAYER_H, PLAYER_W, WALK, GRAVITY } from "../src/game/tuning";
import { LOOKOUT, lookoutStep } from "../src/game/cave";

const level = LEVELS[0]!;
const boxes = collidersFor(level);
const DT = 1 / 60;
const STEP_UP = 0.62;
let failures = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok || process.env.VERBOSE) console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failures++;
};

const L = LOOKOUT;
const treadX = (k: number): [number, number] =>
  k <= 13
    ? [L.x0 + (k - 1) * L.tread, L.x0 + k * L.tread]
    : k === 14
      ? L.landingX
      : k <= 27
        ? [L.landingX[0] - (k - 14) * L.tread, L.landingX[0] - (k - 15) * L.tread]
        : L.topX;
const laneZ = (k: number): [number, number] => (k <= 13 ? L.laneOut : k === 14 ? [L.laneIn[0], L.laneOut[1]] : L.laneIn);
const centre = (k: number): [number, number] => {
  const [x1, x2] = treadX(k);
  const [z1, z2] = laneZ(k);
  return [(x1 + x2) / 2, (z1 + z2) / 2];
};

console.log("the steps themselves");
{
  let worstRise = 0;
  let worstTread = Infinity;
  let worstHead = Infinity;
  for (let k = 1; k <= L.risers; k++) {
    worstRise = Math.max(worstRise, lookoutStep(k) - lookoutStep(k - 1));
    const [x1, x2] = treadX(k);
    worstTread = Math.min(worstTread, k <= 13 || k >= 15 ? x2 - x1 : Infinity);
    const [cx, cz] = centre(k);
    const top = lookoutStep(k);
    const over = boxes.filter((b) => cx > b.minX && cx < b.maxX && cz > b.minZ && cz < b.maxZ && b.minY >= top + 0.01);
    worstHead = Math.min(worstHead, ...over.map((b) => b.minY - top));
  }
  check(worstRise < STEP_UP, `every riser is under the ${STEP_UP}m step-up (worst ${worstRise.toFixed(2)}m)`);
  check(worstTread >= 0.9, `every tread is at least 0.9m deep (worst ${worstTread.toFixed(2)}m)`);
  check(worstHead > PLAYER_H + 0.3, `head room over every step (worst ${worstHead === Infinity ? "open sky" : worstHead.toFixed(2) + "m"})`);
}

/* ------------------------------------------------- walking, with no jumping */

const cap: Capsule = { x: 0, y: 0, z: 22, hw: PLAYER_W, h: PLAYER_H, hd: PLAYER_W };
let vy = 0;
let airborne = 0;
/** Walk toward a point. She never jumps here: the only lift is the step-up. */
function walkTo(tx: number, tz: number, seconds = 12) {
  let stalls = 0;
  for (let i = 0; i < seconds * 60; i++) {
    const dx = tx - cap.x;
    const dz = tz - cap.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.25) return d;
    const sp = Math.min(WALK, d / DT);
    const px = cap.x;
    const pz = cap.z;
    vy -= GRAVITY * DT;
    const r = moveAndCollide(cap, (dx / d) * sp, vy, (dz / d) * sp, boxes, DT, level.groundY);
    vy = r.vy;
    if (!r.grounded) airborne++;
    const moved = Math.hypot(cap.x - px, cap.z - pz);
    if (moved > 1) check(false, `teleport of ${moved.toFixed(2)}m near (${px.toFixed(1)}, ${pz.toFixed(1)})`);
    stalls = moved < 0.01 ? stalls + 1 : 0;
    if (stalls > 45) break;
  }
  return Math.hypot(tx - cap.x, tz - cap.z);
}

/** Flood fill the park on foot, and hand back the way from spawn to a point. */
function route(from: [number, number], to: [number, number]) {
  const step = 0.5;
  const b = level.bounds;
  const w = Math.ceil((b.maxX - b.minX) / step);
  const h = Math.ceil((b.maxZ - b.minZ) / step);
  const blocked = new Uint8Array(w * h);
  const pad = PLAYER_W + 0.08;
  for (const box of boxes) {
    if (box.maxY < 0.75 || box.minY > 1.75) continue;
    const x0 = Math.max(0, Math.floor((box.minX - pad - b.minX) / step));
    const x1 = Math.min(w - 1, Math.ceil((box.maxX + pad - b.minX) / step));
    const z0 = Math.max(0, Math.floor((box.minZ - pad - b.minZ) / step));
    const z1 = Math.min(h - 1, Math.ceil((box.maxZ + pad - b.minZ) / step));
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) blocked[iz * w + ix] = 1;
  }
  const idx = (x: number, z: number) => {
    const ix = Math.floor((x - b.minX) / step);
    const iz = Math.floor((z - b.minZ) / step);
    return ix < 0 || iz < 0 || ix >= w || iz >= h ? -1 : iz * w + ix;
  };
  const prev = new Int32Array(w * h).fill(-2);
  const s = idx(from[0], from[1]);
  const goal = idx(to[0], to[1]);
  if (s < 0 || goal < 0 || blocked[s] || blocked[goal]) return null;
  prev[s] = -1;
  const q = [s];
  for (let head = 0; head < q.length; head++) {
    const cur = q[head]!;
    if (cur === goal) break;
    const cx = cur % w;
    const cz = (cur / w) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
      const n = nz * w + nx;
      if (prev[n] !== -2 || blocked[n]) continue;
      prev[n] = cur;
      q.push(n);
    }
  }
  if (prev[goal] === -2) return null;
  const path: [number, number][] = [];
  for (let cur = goal; cur >= 0; cur = prev[cur]!) {
    path.unshift([b.minX + ((cur % w) + 0.5) * step, b.minZ + (((cur / w) | 0) + 0.5) * step]);
  }
  // one waypoint every few metres is enough to steer her along it
  return path.filter((_, i) => i % 8 === 0 || i === path.length - 1);
}

console.log("walking there from the spawn");
const start = L.start;
const path = route([0, 22], start);
check(path != null, `a walking route from the spawn to the bottom step at (${start[0]}, ${start[1]})`);
if (path) {
  let ok = true;
  for (const [wx, wz] of path) if (walkTo(wx, wz) > 0.6) ok = false;
  check(ok && walkTo(start[0], start[1]) < 0.4, `she walked the ${path.length} waypoints to the bottom step (ended at (${cap.x.toFixed(1)}, ${cap.z.toFixed(1)}))`);
}

console.log("climbing to the lookout");
{
  const before = airborne;
  let ok = true;
  for (let k = 1; k <= L.risers; k++) {
    const [cx, cz] = centre(k);
    if (walkTo(cx, cz, 8) > 0.4) {
      ok = false;
      check(false, `stopped short of step ${k} at (${cap.x.toFixed(1)}, ${cap.y.toFixed(2)}, ${cap.z.toFixed(1)})`);
      break;
    }
    if (Math.abs(cap.y - lookoutStep(k)) > 0.12) {
      ok = false;
      check(false, `step ${k}: she is at ${cap.y.toFixed(2)}m, the tread is ${lookoutStep(k).toFixed(2)}m`);
      break;
    }
  }
  check(ok, `walked all ${L.risers} steps to the deck at ${cap.y.toFixed(2)}m`);
  // stepping up is not jumping: the only airborne frames are the 2cm skin
  check(airborne - before < 30, `no jump needed on the stair (${airborne - before} airborne frames)`);
}

console.log("out on the deck");
{
  const d = L.deck;
  const spots: [string, number, number][] = [
    ["onto the deck", (L.topX[0] + L.topX[1]) / 2, d.maxZ - 1.2],
    ["the telescope", 81.5, -115.4],
    ["the bench", 70, -116.4],
    ["the flag", 65.8, -115.6],
    ["the far corner", d.minX + 1.2, d.minZ + 1.2],
    ["the east corner", d.maxX - 1.2, d.minZ + 1.2],
  ];
  for (const [name, x, z] of spots) {
    const left = walkTo(x, z, 10);
    check(left < 0.5 && cap.y > L.top - 0.1, `${name}: (${cap.x.toFixed(1)}, ${cap.y.toFixed(2)}, ${cap.z.toFixed(1)})`);
  }
}

console.log("she cannot walk off it");
{
  /** Drive her at full speed toward a heading for a while and report her lowest point. */
  const shove = (x: number, y: number, z: number, hx: number, hz: number, seconds = 2.5) => {
    cap.x = x;
    cap.y = y;
    cap.z = z;
    vy = 0;
    let low = y;
    for (let i = 0; i < seconds * 60; i++) {
      vy -= GRAVITY * DT;
      const r = moveAndCollide(cap, hx * WALK, vy, hz * WALK, boxes, DT, level.groundY);
      vy = r.vy;
      low = Math.min(low, cap.y);
    }
    return low;
  };
  let worst = { drop: 0, where: "" };
  const note = (drop: number, where: string) => {
    if (drop > worst.drop) worst = { drop, where };
  };
  // every tread, pushed sideways off the flight (up and down the flight is
  // the way she came and the way she is going, so those are not drops), and
  // the landings pushed at their open ends too
  for (let k = 1; k <= L.risers; k++) {
    const [cx, cz] = centre(k);
    const top = lookoutStep(k);
    const dirs: [number, number][] = [[0, 1], [0, -1]];
    if (k === 14) dirs.push([1, 0]);
    if (k === 28) dirs.push([-1, 0]);
    for (const [hx, hz] of dirs) {
      const low = shove(cx, top + 0.05, cz, hx, hz, 1.6);
      note(Math.max(0, top - 0.4 - low), `step ${k} pushed (${hx}, ${hz}) fell to ${low.toFixed(2)}m from ${top.toFixed(2)}m`);
    }
  }
  check(worst.drop < 0.3, `nothing falls off the stair (worst: ${worst.where || "none"})`);

  // all round the deck, a pace in from the rail
  const d = L.deck;
  worst = { drop: 0, where: "" };
  for (let x = d.minX + 0.6; x <= d.maxX - 0.6; x += 1) {
    for (const [z, hz] of [[d.minZ + 0.6, -1], [d.maxZ - 0.6, 1]] as [number, number][]) {
      // the gap where the stair arrives is the way down, not a fall
      if (hz === 1 && x > L.topX[0] - 0.6 && x < L.topX[1] + 0.6) continue;
      const low = shove(x, L.top + 0.05, z, 0, hz);
      note(Math.max(0, L.top - 0.6 - low), `deck edge (${x.toFixed(1)}, ${z.toFixed(1)}) fell to ${low.toFixed(2)}m`);
    }
  }
  for (let z = d.minZ + 0.6; z <= d.maxZ - 0.6; z += 1) {
    for (const [x, hx] of [[d.minX + 0.6, -1], [d.maxX - 0.6, 1]] as [number, number][]) {
      const low = shove(x, L.top + 0.05, z, hx, 0);
      note(Math.max(0, L.top - 0.6 - low), `deck edge (${x.toFixed(1)}, ${z.toFixed(1)}) fell to ${low.toFixed(2)}m`);
    }
  }
  // and diagonally at the corners, where two rails meet
  for (const [x, z, hx, hz] of [
    [d.minX + 0.8, d.minZ + 0.8, -1, -1],
    [d.maxX - 0.8, d.minZ + 0.8, 1, -1],
    [d.minX + 0.8, d.maxZ - 0.8, -1, 1],
    [d.maxX - 0.8, d.maxZ - 0.8, 1, 1],
  ] as [number, number, number, number][]) {
    const low = shove(x, L.top + 0.05, z, hx / Math.SQRT2, hz / Math.SQRT2);
    note(Math.max(0, L.top - 0.6 - low), `deck corner (${x.toFixed(1)}, ${z.toFixed(1)}) fell to ${low.toFixed(2)}m`);
  }
  check(worst.drop < 0.3, `the railing holds her on the deck (worst: ${worst.where || "none"})`);
}

console.log(failures ? `\n${failures} failure(s)` : `\nall lookout checks passed (deck ${L.deck.maxX - L.deck.minX}x${L.deck.maxZ - L.deck.minZ}m at ${L.top}m, ${L.risers} steps from (${start[0]}, ${start[1]}))`);
process.exit(failures ? 1 : 0);
