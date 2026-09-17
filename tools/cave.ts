/**
 * Mountain cave, through the real collision code.
 *
 * Walks her from outside the entrance along the tunnel grid (breadth-first
 * over CAVE_MAP, cell centre to cell centre) to every open cell, then up to
 * each hiding spot, and fails if she ever stalls, teleports, or ends up
 * somewhere other than where she was heading. Also checks the headroom she
 * has in every cell, and that no dumpling spot can be seen in a straight line
 * from the entrance (so the tunnels actually hide it).
 *
 * Run: npx jiti tools/cave.ts   (exits 1 on any failure)
 */
import { LEVELS } from "../src/game/levels";
import { collidersFor } from "../src/game/colliders";
import { moveAndCollide, type Capsule } from "../src/game/collision";
import { PLAYER_H, PLAYER_W, WALK, JUMP } from "../src/game/tuning";
import { CAVE, CAVE_MAP, CAVE_SPOTS, caveCellCenter, caveEntrance, isOpen } from "../src/game/cave";

const level = LEVELS[0]!;
const boxes = collidersFor(level);
const DT = 1 / 60;
let failures = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok || process.env.VERBOSE) console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failures++;
};

const [ex, ez] = caveEntrance();
const cap: Capsule = { x: ex, y: 0, z: ez + 6, hw: PLAYER_W, h: PLAYER_H, hd: PLAYER_W };
for (let i = 0; i < 10; i++) moveAndCollide(cap, 0, -1, 0, boxes, DT, level.groundY);

let vy = 0;
let grounded = true;
let hops = 0;
/** Walk toward a point; hop if stuck against something low. Returns distance left. */
function walkTo(tx: number, tz: number, maxSeconds = 6) {
  let stuck = 0;
  for (let i = 0; i < maxSeconds * 60; i++) {
    const dx = tx - cap.x;
    const dz = tz - cap.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.25) return d;
    const sp = Math.min(WALK, d / DT);
    const px = cap.x;
    const pz = cap.z;
    vy -= 23 * DT;
    const r = moveAndCollide(cap, (dx / d) * sp, vy, (dz / d) * sp, boxes, DT, level.groundY);
    vy = r.vy;
    grounded = r.grounded;
    const moved = Math.hypot(cap.x - px, cap.z - pz);
    if (moved > 1) check(false, `teleport of ${moved.toFixed(2)}m near (${px.toFixed(1)}, ${pz.toFixed(1)})`);
    stuck = moved < 0.01 ? stuck + 1 : 0;
    if (stuck > 10 && grounded) {
      // the cavern ledge (x 62..72, z -146..-144) is meant to be climbed by its step
      const ontoLedge = tx > 62 && tx < 72 && tz > -146 && tz < -144;
      if (!ontoLedge) hops++;
      if (process.env.VERBOSE) console.log(`    hop at (${cap.x.toFixed(2)}, ${cap.y.toFixed(2)}, ${cap.z.toFixed(2)}) heading (${tx.toFixed(1)}, ${tz.toFixed(1)})`);
      vy = JUMP;
      stuck = 0;
    }
  }
  return Math.hypot(tx - cap.x, tz - cap.z);
}

console.log("walking the tunnels");
check(walkTo(ex, ez - 1.5) < 0.3, `into the entrance at (${ex}, ${ez - 1.5})`);
const rows = CAVE_MAP.length;
const cols = CAVE_MAP[0]!.length;
const start: [number, number] = [0, CAVE_MAP[0]!.indexOf(".")];
const prev = new Map<string, string | null>([[start.join(","), null]]);
const queue = [start];
while (queue.length) {
  const [r, c] = queue.shift()!;
  for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr < 0 || nc < 0 || nr >= rows || nc >= cols || !isOpen(CAVE_MAP[nr]![nc])) continue;
    const key = `${nr},${nc}`;
    if (prev.has(key)) continue;
    prev.set(key, `${r},${c}`);
    queue.push([nr, nc]);
  }
}
const openCells = CAVE_MAP.flatMap((row, r) => [...row].map((ch, c) => (isOpen(ch) ? `${r},${c}` : null))).filter(Boolean) as string[];
check(prev.size === openCells.length, `every open cell is connected to the entrance (${prev.size} of ${openCells.length})`);

const pathTo = (key: string) => {
  const out: string[] = [];
  for (let k: string | null = key; k; k = prev.get(k) ?? null) out.unshift(k);
  return out;
};
// where she is on the grid; every trip goes back out along the tunnels to the
// entrance cell and then in along the route to the target
let here = start.join(",");
const travel = (key: string) => {
  let ok = true;
  const route = [...pathTo(here).reverse(), ...pathTo(key).slice(1)];
  for (const k of route) {
    const [r, c] = k.split(",").map(Number) as [number, number];
    if (walkTo(...caveCellCenter(r, c)) > 0.3) ok = false;
  }
  here = key;
  return ok;
};
let visited = 0;
for (const key of openCells) {
  if (travel(key)) visited++;
  else check(false, `could not walk to cell ${key}`);
}
check(visited === openCells.length, `walked to all ${openCells.length} open cells from the entrance`);

console.log("headroom");
{
  let worst = Infinity;
  for (const key of openCells) {
    const [r, c] = key.split(",").map(Number) as [number, number];
    const [cx, cz] = caveCellCenter(r, c);
    const roof = Math.min(
      ...boxes.filter((b) => cx > b.minX && cx < b.maxX && cz > b.minZ && cz < b.maxZ && b.minY > 0.5).map((b) => b.minY),
    );
    worst = Math.min(worst, roof);
  }
  check(worst >= 3.1, `lowest roof over any tunnel is ${worst.toFixed(2)}m (she is ${PLAYER_H}m, eye 1.42m)`);
}

console.log("hiding spots");
for (const [name, [sx, sy, sz]] of Object.entries(CAVE_SPOTS)) {
  // walk to the nearest open cell, then to the spot itself
  let best = "";
  let bestD = Infinity;
  for (const key of openCells) {
    const [r, c] = key.split(",").map(Number) as [number, number];
    const [cx, cz] = caveCellCenter(r, c);
    const d = Math.hypot(cx - sx, cz - sz);
    if (d < bestD) {
      bestD = d;
      best = key;
    }
  }
  travel(best);
  // approach from the open side, stopping within collect reach
  const left = walkTo(sx, sz + (name === "ledge" ? 1.2 : 0.8), 4);
  const reach = Math.hypot(sx - cap.x, sy - (cap.y + 0.8), sz - cap.z);
  check(left < 0.4 && reach <= 2.15, `${name}: reached (${cap.x.toFixed(1)}, ${cap.y.toFixed(2)}, ${cap.z.toFixed(1)}), ${reach.toFixed(2)}m from the dumpling (collect reach 2.15m)`);
}

console.log("hidden from the entrance");
for (const [name, [sx, sy, sz]] of Object.entries(CAVE_SPOTS)) {
  const eye = { x: ex, y: 1.42, z: ez + 2 };
  let blocked = false;
  for (let t = 0.02; t < 0.98 && !blocked; t += 0.01) {
    const x = eye.x + (sx - eye.x) * t;
    const y = eye.y + (sy - eye.y) * t;
    const z = eye.z + (sz - eye.z) * t;
    blocked = boxes.some((b) => x > b.minX && x < b.maxX && y > b.minY && y < b.maxY && z > b.minZ && z < b.maxZ);
  }
  check(blocked, `${name} cannot be seen from the entrance`);
}

// apart from climbing onto the cavern ledge, nothing should ever need a hop
check(hops === 0, `no hops needed anywhere but the ledge (${hops})`);

console.log(failures ? `\n${failures} failure(s)` : `\nall cave checks passed (${CAVE_MAP.length}x${CAVE_MAP[0]!.length} grid, ${CAVE.cell}m cells)`);
process.exit(failures ? 1 : 0);
