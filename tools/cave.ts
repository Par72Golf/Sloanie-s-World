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
import { CAVE, CAVE_MAP, CAVE_SPOTS, caveCellCenter, caveEntrance, caveFootprint, isOpen } from "../src/game/cave";
import * as THREE from "three";
// meshes.ts draws its textures on a canvas when a material is first made
const noop = () => {};
const ctx = new Proxy({} as Record<string, unknown>, {
  get: (t, k) =>
    k === "getImageData" || k === "createImageData"
      ? (a: number, b: number, w = a, h = b) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h })
      : k === "measureText"
        ? () => ({ width: 40 })
        : k in t
          ? t[k as string]
          : noop,
  set: (t, k, v) => ((t[k as string] = v), true),
});
(globalThis as any).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
const warn = console.warn;
console.warn = (...a: unknown[]) => {
  if (typeof a[0] === "string" && a[0].startsWith("THREE.Material")) return;
  warn(...a);
};
import { makeMountainCave } from "../src/game/meshes";

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

/**
 * The drawn rock against the tunnels she can actually walk in.
 *
 * Every boulder is sampled over its whole surface and each sample that lands
 * in open tunnel space is measured against the real colliders: how far it is
 * from the nearest rock column, roof slab or ledge is how far that rock bulges
 * into the passage. This is the check the "passages look almost closed" report
 * needed: before the fix the worst wall rock stood 1.92m into a 3m tunnel and
 * one row-9 boulder closed the way to the great cavern completely.
 */
console.log("rock meshes in the passages");
{
  const WALL = 0.45;
  const ROOF = 0.6;
  const fp = caveFootprint();
  const cave = boxes.filter((b) => b.maxX > fp.minX && b.minX < fp.maxX && b.maxZ > fp.minZ && b.minZ < fp.maxZ && b.minY < CAVE.height);
  const [mx] = caveEntrance();
  const group = makeMountainCave();
  group.updateMatrixWorld(true);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const v = new THREE.Vector3();
  let rocks = 0;
  let worstWall = { d: 0, x: 0, y: 0, z: 0 };
  let worstRoof = { d: 0, x: 0, y: 0, z: 0 };
  let overWall = 0;
  let overRoof = 0;
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.geometry.type !== "IcosahedronGeometry") return;
    rocks++;
    const pos = m.geometry.attributes.position as THREE.BufferAttribute;
    let wall = 0;
    let roof = 0;
    let at = { x: 0, y: 0, z: 0 };
    let atRoof = { x: 0, y: 0, z: 0 };
    for (let t = 0; t < pos.count; t += 3) {
      a.fromBufferAttribute(pos, t).applyMatrix4(m.matrixWorld);
      b.fromBufferAttribute(pos, t + 1).applyMatrix4(m.matrixWorld);
      c.fromBufferAttribute(pos, t + 2).applyMatrix4(m.matrixWorld);
      for (let i = 0; i <= 4; i++) {
        for (let j = 0; j <= 4 - i; j++) {
          v.set(0, 0, 0)
            .addScaledVector(a, 1 - i / 4 - j / 4)
            .addScaledVector(b, i / 4)
            .addScaledVector(c, j / 4);
          if (v.y <= 0.05 || v.y >= CAVE.height) continue;
          const inside = v.x > fp.minX && v.x < fp.maxX && v.z > fp.minZ && v.z < fp.maxZ;
          // the 2m of mouth in front of the face counts as tunnel too
          const inMouth = !inside && v.z > fp.maxZ && v.z < fp.maxZ + 2 && v.x > mx - 1.5 && v.x < mx + 1.5;
          if (!inside && !inMouth) continue;
          if (inMouth) {
            const side = Math.min(v.x - (mx - 1.5), mx + 1.5 - v.x);
            const head = 3.6 - v.y;
            if (side < head) {
              if (side > wall) ((wall = side), (at = { x: v.x, y: v.y, z: v.z }));
            } else if (head > roof) ((roof = head), (atRoof = { x: v.x, y: v.y, z: v.z }));
            continue;
          }
          let best = Infinity;
          let sideways = true;
          for (const box of cave) {
            const dx = Math.max(box.minX - v.x, 0, v.x - box.maxX);
            const dy = Math.max(box.minY - v.y, 0, v.y - box.maxY);
            const dz = Math.max(box.minZ - v.z, 0, v.z - box.maxZ);
            const d = Math.hypot(dx, dy, dz);
            if (d < best) {
              best = d;
              sideways = dy < Math.hypot(dx, dz);
            }
            if (d === 0) break;
          }
          if (best === 0 || best === Infinity) continue;
          if (sideways) {
            if (best > wall) ((wall = best), (at = { x: v.x, y: v.y, z: v.z }));
          } else if (best > roof) ((roof = best), (atRoof = { x: v.x, y: v.y, z: v.z }));
        }
      }
    }
    if (wall > WALL) {
      overWall++;
      if (process.env.VERBOSE) console.log(`    wall rock ${wall.toFixed(2)}m into the passage at (${at.x.toFixed(1)}, ${at.y.toFixed(1)}, ${at.z.toFixed(1)})`);
    }
    if (roof > ROOF) {
      overRoof++;
      if (process.env.VERBOSE) console.log(`    roof rock ${roof.toFixed(2)}m below the roof at (${atRoof.x.toFixed(1)}, ${atRoof.y.toFixed(1)}, ${atRoof.z.toFixed(1)})`);
    }
    if (wall > worstWall.d) worstWall = { d: wall, ...at };
    if (roof > worstRoof.d) worstRoof = { d: roof, ...atRoof };
  });
  const fitStat = group.userData.rockFit as { refitted: number; dropped: number };
  console.log(`  ${rocks} rock meshes, ${fitStat.refitted} shrunk to fit, ${fitStat.dropped} dropped`);
  check(overWall === 0, `no wall rock bulges more than ${WALL}m into a tunnel (worst ${worstWall.d.toFixed(2)}m at (${worstWall.x.toFixed(1)}, ${worstWall.y.toFixed(1)}, ${worstWall.z.toFixed(1)}), ${overWall} over)`);
  check(overRoof === 0, `no ceiling rock hangs more than ${ROOF}m below the roof (worst ${worstRoof.d.toFixed(2)}m at (${worstRoof.x.toFixed(1)}, ${worstRoof.y.toFixed(1)}, ${worstRoof.z.toFixed(1)}), ${overRoof} over)`);
}

// apart from climbing onto the cavern ledge, nothing should ever need a hop
check(hops === 0, `no hops needed anywhere but the ledge (${hops})`);

console.log(failures ? `\n${failures} failure(s)` : `\nall cave checks passed (${CAVE_MAP.length}x${CAVE_MAP[0]!.length} grid, ${CAVE.cell}m cells)`);
process.exit(failures ? 1 : 0);
