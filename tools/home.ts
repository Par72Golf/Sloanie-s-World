/**
 * Sloan's house, headless.
 *
 * 1. The catalogue: 34 pieces, 3 per spot except wallpaper and floor (5), one
 *    starter per spot, prices 4..25 on shop items only, one crown, one
 *    stickers30 and one pet reward.
 * 2. makeHome with each spot set to each of its options in turn (the rest
 *    starters), and setSpot cycling every option on one rig:
 *    - no NaN or infinite value in any transform or vertex
 *    - every piece's exact bounding box inside the room (x -5..5, z -4..4,
 *      y 0..3.4); wall pieces within 0.3m of their wall
 *    - no piece's box overlaps another spot's solid, and no two spots' pieces
 *      overlap (any options), rugs excepted from floor pieces standing on them
 *    - cycling setSpot twice creates no new geometry or material
 * 3. Colliders: none overlaps the spawn capsule or the door standing spot.
 * 4. Reachability: BFS on a 0.25m grid for a 0.34 half-width, 1.62m capsule
 *    from the spawn; every spot's front (1m along its yaw) is reachable. The
 *    colliders only vary with the pet bed, so running each pet bed covers every
 *    combination of furniture. Then she actually walks each route through
 *    moveAndCollide.
 * 5. Triangle counts: shell, each piece, and the worst-case room.
 *
 * Run: npx jiti tools/home.ts   (exits 1 on any failure)
 */
import * as THREE from "three";
import { moveAndCollide, type AABB, type Capsule } from "../src/game/collision";
import { FURNITURE, SPOTS, furnitureFor, makeFurniture, starterFurniture, type SpotId } from "../src/game/furniture";
import { HOME, HOME_ENTRY, HOME_SPOTS, homeColliders, makeHome } from "../src/game/home-mesh";
import { PLAYER_H, PLAYER_W, WALK } from "../src/game/tuning";

// lam() warns about undefined optional params; not ours to fix here
const warn = console.warn;
console.warn = (...a: unknown[]) => {
  if (typeof a[0] === "string" && a[0].startsWith("THREE.Material: parameter")) return;
  warn(...a);
};

let failures = 0;
const check = (ok: boolean, msg: string, quiet = false) => {
  if (!ok) {
    console.log(`  FAIL ${msg}`);
    failures++;
  } else if (!quiet) console.log(`  ok   ${msg}`);
};

const EPS = 1e-3;
const WALL_SPOTS: SpotId[] = ["curtains", "picture"];
const SURFACE_SPOTS: SpotId[] = ["wallpaper", "floor"];

function tris(root: THREE.Object3D) {
  let n = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry;
    n += (g.index ? g.index.count : g.attributes.position!.count) / 3;
  });
  return n;
}

function finite(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  let bad = "";
  root.traverse((o) => {
    if (bad) return;
    if (!o.matrixWorld.elements.every(Number.isFinite)) bad = `matrix of ${o.name || o.type}`;
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      const p = m.geometry.attributes.position!.array as ArrayLike<number>;
      for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i]!)) bad = `vertex in ${o.parent?.name}`;
    }
  });
  return bad;
}

function exactBox(o: THREE.Object3D) {
  o.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(o, true);
}

const overlaps = (a: AABB, b: AABB, pad = 0) =>
  a.minX < b.maxX - pad && a.maxX > b.minX + pad && a.minY < b.maxY - pad && a.maxY > b.minY + pad && a.minZ < b.maxZ - pad && a.maxZ > b.minZ + pad;
const aabb = (b: THREE.Box3): AABB => ({ minX: b.min.x, maxX: b.max.x, minY: b.min.y, maxY: b.max.y, minZ: b.min.z, maxZ: b.max.z });
const capsuleBox = (x: number, z: number): AABB => ({ minX: x - PLAYER_W, maxX: x + PLAYER_W, minY: 0, maxY: PLAYER_H, minZ: z - PLAYER_W, maxZ: z + PLAYER_W });
const front = (spot: SpotId): [number, number] => {
  const { pos, yaw } = HOME_SPOTS[spot];
  return [pos[0] + Math.sin(yaw), pos[2] + Math.cos(yaw)];
};
const fmt = (b: THREE.Box3) =>
  `x ${b.min.x.toFixed(2)}..${b.max.x.toFixed(2)} y ${b.min.y.toFixed(2)}..${b.max.y.toFixed(2)} z ${b.min.z.toFixed(2)}..${b.max.z.toFixed(2)}`;

// ---------------------------------------------------------------------------
console.log("catalogue");
check(FURNITURE.length === 34, `34 pieces (${FURNITURE.length})`);
check(new Set(FURNITURE.map((f) => f.id)).size === FURNITURE.length, "ids unique");
for (const { id } of SPOTS) {
  const opts = furnitureFor(id);
  const want = SURFACE_SPOTS.includes(id) ? 5 : 3;
  check(opts.length === want, `${id}: ${want} options (${opts.length})`, true);
  check(opts.filter((f) => f.source === "starter").length === 1, `${id}: one starter`, true);
}
for (const f of FURNITURE) {
  if (f.source === "shop") check(f.price != null && f.price >= 4 && f.price <= 25, `${f.id} price ${f.price} in 4..25`, true);
  else check(f.price == null, `${f.id} has no price`, true);
}
for (const s of ["crown", "stickers30", "pet"] as const) check(FURNITURE.filter((f) => f.source === s).length === 1, `one ${s} reward`, true);
check(FURNITURE.find((f) => f.source === "pet")?.spot === "petbed", "pet reward is a pet bed", true);
check(FURNITURE.find((f) => f.source === "stickers30")?.spot === "picture", "stickers30 reward is a picture", true);
console.log(`  ${failures ? "" : "ok   "}counts, sources and prices`);

// ---------------------------------------------------------------------------
console.log("\npieces in the room");
const starters = starterFurniture();
const hx = HOME.width / 2;
const hz = HOME.depth / 2;
const pieceBoxes = new Map<string, THREE.Box3>();
const pieceTris = new Map<string, number>();
let shellTris = 0;
let markerTris = 0;

for (const { id: spot } of SPOTS) {
  for (const f of furnitureFor(spot)) {
    const placed = { ...starters, [spot]: f.id };
    const rig = makeHome(placed);
    const bad = finite(rig.group);
    check(!bad, `${f.id}: no NaN (${bad || "clean"})`, true);
    if (SURFACE_SPOTS.includes(spot)) {
      const surf = rig.group.children.filter((c) => c.name === (spot === "floor" ? "home-floor" : "home-wall")) as THREE.Mesh[];
      check(surf.length > 0 && surf.every((m) => m.material === surf[0]!.material), `${f.id}: applied to ${surf.length} surface(s)`, true);
      continue;
    }
    const holder = rig.group.getObjectByName(`spot:${spot}`)!;
    check(holder.children.length === 1 && holder.children[0]!.userData.furniture === f.id, `${f.id}: placed`, true);
    const b = exactBox(holder);
    pieceBoxes.set(f.id, b);
    pieceTris.set(f.id, tris(holder));
    const inside = b.min.x >= -hx - EPS && b.max.x <= hx + EPS && b.min.z >= -hz - EPS && b.max.z <= hz + EPS && b.min.y >= -EPS && b.max.y <= HOME.height + EPS;
    check(inside, `${f.id}: inside the room (${fmt(b)})`);
    if (WALL_SPOTS.includes(spot)) {
      const d = Math.min(b.max.x + hx, hx - b.min.x, b.max.z + hz, hz - b.min.z);
      check(d <= 0.3 + EPS, `${f.id}: within 0.3m of its wall (${d.toFixed(3)})`, true);
    }
    if (spot === "bed" && f.id === starters.bed) {
      // shell = everything that is not furniture or a marker
      const clone = rig.group.clone(false);
      for (const c of rig.group.children) if (!c.name.startsWith("spot:") && !c.name.startsWith("marker:")) clone.add(c.clone());
      shellTris = tris(clone);
      markerTris = rig.group.children.filter((c) => c.name.startsWith("marker:")).reduce((n, c) => n + tris(c), 0);
    }
  }
}

console.log("\nclearances");
const cols = homeColliders();
const solidBySpot = new Map<SpotId, AABB>();
{
  let i = 5; // walls and ceiling come first
  for (const { id } of SPOTS) {
    if (["bed", "lamp", "plant", "table", "petbed"].includes(id)) solidBySpot.set(id, cols[i++]!);
  }
}
let intrusions = 0;
for (const f of FURNITURE) {
  const b = pieceBoxes.get(f.id);
  if (!b) continue;
  for (const [spot, s] of solidBySpot) {
    if (spot === f.spot) continue;
    if (overlaps(aabb(b), s, 0.005)) {
      intrusions++;
      check(false, `${f.id} reaches into the ${spot} solid`);
    }
  }
}
check(intrusions === 0, "no piece reaches into another spot's solid");
let clashes = 0;
for (const a of FURNITURE)
  for (const b of FURNITURE) {
    if (a.id >= b.id || a.spot === b.spot) continue;
    const ba = pieceBoxes.get(a.id);
    const bb = pieceBoxes.get(b.id);
    if (!ba || !bb) continue;
    const flatRug = (x: THREE.Box3) => x.max.y <= 0.03;
    if (flatRug(ba) || flatRug(bb)) {
      if (overlaps(aabb(ba), aabb(bb), 0.005)) {
        clashes++;
        check(false, `${a.id} and ${b.id} overlap on the rug`);
      }
      continue;
    }
    if (overlaps(aabb(ba), aabb(bb), 0.005)) {
      clashes++;
      check(false, `${a.id} overlaps ${b.id}`);
    }
  }
check(clashes === 0, "no two spots' pieces overlap, in any options");
const [sx, , sz] = HOME_ENTRY.spawn;
const [dx, , dz] = HOME_ENTRY.door;
for (const pet of furnitureFor("petbed")) {
  const cs = homeColliders({ ...starters, petbed: pet.id });
  check(!cs.some((c) => overlaps(c, capsuleBox(sx, sz))), `spawn capsule clear (${pet.id})`, true);
  check(!cs.some((c) => overlaps(c, capsuleBox(dx, dz))), `door standing spot clear (${pet.id})`, true);
  for (const f of FURNITURE) {
    const b = pieceBoxes.get(f.id);
    if (b && b.max.y > 0.03) {
      check(!overlaps(aabb(b), capsuleBox(sx, sz)), `${f.id} clear of the spawn`, true);
      check(!overlaps(aabb(b), capsuleBox(dx, dz)), `${f.id} clear of the door`, true);
    }
  }
}
console.log(`  ok   spawn [${HOME_ENTRY.spawn}] and door [${HOME_ENTRY.door}] clear of colliders and pieces`);

console.log("\nsetSpot");
{
  const rig = makeHome(starters);
  const seen = () => {
    const g = new Set<unknown>();
    const m = new Set<unknown>();
    rig.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      g.add(mesh.geometry);
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.add(mat);
    });
    return { g, m };
  };
  const cycle = () => {
    for (const { id: spot } of SPOTS) for (const f of [...furnitureFor(spot), furnitureFor(spot)[0]!]) rig.setSpot(spot, f.id);
  };
  const allGeo = new Set<unknown>();
  const allMat = new Set<unknown>();
  const collect = () => {
    const { g, m } = seen();
    g.forEach((x) => allGeo.add(x));
    m.forEach((x) => allMat.add(x));
  };
  // cycle once, recording everything seen at each step
  for (const { id: spot } of SPOTS)
    for (const f of [...furnitureFor(spot), furnitureFor(spot)[0]!]) {
      rig.setSpot(spot, f.id);
      collect();
    }
  const g1 = allGeo.size;
  const m1 = allMat.size;
  cycle();
  for (const { id: spot } of SPOTS)
    for (const f of furnitureFor(spot)) {
      rig.setSpot(spot, f.id);
      collect();
    }
  check(allGeo.size === g1 && allMat.size === m1, `second cycle adds no geometry or material (${g1} geometries, ${m1} materials)`);
  const before = rig.group.getObjectByName("spot:bed")!.children[0];
  rig.setSpot("bed", "rug_map");
  check(rig.group.getObjectByName("spot:bed")!.children[0] === before, "a piece from another spot is refused");
  check(Object.keys(rig.markers).length === SPOTS.length && Object.values(rig.markers).every((m) => !m.visible), "a hidden marker per spot");
}

// ---------------------------------------------------------------------------
console.log("\nreachability (0.25m grid, capsule 0.34 x 1.62)");
const STEP = 0.25;
const NX = Math.round(HOME.width / STEP);
const NZ = Math.round(HOME.depth / STEP);
const nodeX = (i: number) => -hx + i * STEP;
const nodeZ = (j: number) => -hz + j * STEP;
const blocks = (cs: AABB[], x: number, z: number) => cs.some((c) => c.maxY > 0.03 && c.minY < PLAYER_H && overlaps(c, capsuleBox(x, z)));

function walkTo(cs: AABB[], route: [number, number][]) {
  const c: Capsule = { x: route[0]![0], y: 0, z: route[0]![1], hw: PLAYER_W, h: PLAYER_H, hd: PLAYER_W };
  const DT = 1 / 60;
  for (const [tx, tz] of route.slice(1)) {
    for (let k = 0; k < 120; k++) {
      const ddx = tx - c.x;
      const ddz = tz - c.z;
      const d = Math.hypot(ddx, ddz);
      if (d < 0.03) break;
      const sp = Math.min(WALK, d / DT);
      moveAndCollide(c, (ddx / d) * sp, -1, (ddz / d) * sp, cs, DT, 0);
    }
  }
  const [ex, ez] = route[route.length - 1]!;
  return { d: Math.hypot(c.x - ex, c.z - ez), y: c.y };
}

for (const pet of furnitureFor("petbed")) {
  const cs = homeColliders({ ...starters, petbed: pet.id });
  const free: boolean[] = [];
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) free.push(!blocks(cs, nodeX(i), nodeZ(j)));
  const idx = (i: number, j: number) => j * (NX + 1) + i;
  const si = Math.round((sx + hx) / STEP);
  const sj = Math.round((sz + hz) / STEP);
  const prev = new Int32Array((NX + 1) * (NZ + 1)).fill(-2);
  const q = [idx(si, sj)];
  prev[q[0]!] = -1;
  while (q.length) {
    const n = q.shift()!;
    const i = n % (NX + 1);
    const j = Math.floor(n / (NX + 1));
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const a = i + di;
      const b = j + dj;
      if (a < 0 || b < 0 || a > NX || b > NZ) continue;
      const k = idx(a, b);
      if (!free[k] || prev[k] !== -2) continue;
      prev[k] = n;
      q.push(k);
    }
  }
  const reached = prev.reduce((n, p) => n + (p !== -2 ? 1 : 0), 0);
  const freeCount = free.filter(Boolean).length;
  console.log(`  pet bed ${pet.id}: ${reached} of ${freeCount} free nodes reachable from the spawn`);
  check(reached === freeCount, `  every free node is connected (${pet.id})`, true);
  // the door
  const targets: [string, [number, number]][] = [["door", [dx, dz]], ...SPOTS.map((s) => [s.id, front(s.id)] as [string, [number, number]])];
  for (const [name, [fx, fz]] of targets) {
    const exactFree = !blocks(cs, fx, fz);
    // nearest reached node
    let best = -1;
    let bd = Infinity;
    for (let k = 0; k < prev.length; k++) {
      if (prev[k] === -2) continue;
      const d = Math.hypot(nodeX(k % (NX + 1)) - fx, nodeZ(Math.floor(k / (NX + 1))) - fz);
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    const route: [number, number][] = [];
    for (let k = best; k !== -1; k = prev[k]!) route.unshift([nodeX(k % (NX + 1)), nodeZ(Math.floor(k / (NX + 1)))]);
    route.push([fx, fz]);
    const walked = walkTo(cs, route);
    const ok = exactFree && bd <= STEP * 0.75 && walked.d < 0.08 && walked.y < 0.05;
    check(ok, `${name.padEnd(9)} front [${fx.toFixed(2)}, ${fz.toFixed(2)}] ${exactFree ? "free" : "BLOCKED"}, grid ${bd.toFixed(2)}m, walked to within ${walked.d.toFixed(3)}m on the floor (${route.length - 1} steps)`, pet.id !== starters.petbed);
  }
}
{
  // the loop: she can walk all the way round the table
  const cs = homeColliders();
  const t = solidBySpot.get("table")!;
  const r = PLAYER_W + 0.05;
  const cx = (t.minX + t.maxX) / 2;
  const cz = (t.minZ + t.maxZ) / 2;
  const ring: [number, number][] = [
    [t.minX - r, cz],
    [t.maxX + r, cz],
    [cx, t.minZ - r],
    [cx, t.maxZ + r],
    [t.minX - r, t.minZ - r],
    [t.maxX + r, t.minZ - r],
    [t.minX - r, t.maxZ + r],
    [t.maxX + r, t.maxZ + r],
  ];
  const blocked = ring.filter(([x, z]) => blocks(cs, x, z));
  check(blocked.length === 0, `a clear loop round the table (${hx - t.maxX}m to the right wall)`);
  const route: [number, number][] = [ring[4]!, ring[5]!, ring[7]!, ring[6]!, ring[4]!];
  const lap = walkTo(cs, route);
  check(lap.d < 0.08, `walked a lap round the table, back within ${lap.d.toFixed(3)}m`);
}

// ---------------------------------------------------------------------------
console.log("\ntriangles");
console.log(`  shell ${shellTris}, markers ${markerTris}`);
let worst = shellTris + markerTris;
for (const { id: spot } of SPOTS) {
  const opts = furnitureFor(spot).filter((f) => pieceTris.has(f.id));
  if (!opts.length) continue;
  const line = opts.map((f) => `${f.id} ${pieceTris.get(f.id)}`).join(", ");
  worst += Math.max(...opts.map((f) => pieceTris.get(f.id)!));
  console.log(`  ${spot.padEnd(9)} ${line}`);
}
const starterTotal = tris(makeHome(starters).group);
console.log(`  starter room ${starterTotal}, worst-case room ${worst}`);
check(worst < 40000, `worst case under 40k (${worst})`);
{
  let meshes = 0;
  makeHome(starters).group.traverse((o) => ((o as THREE.Mesh).isMesh ? meshes++ : 0));
  console.log(`  starter room meshes (draw calls before merging): ${meshes}`);
}
void makeFurniture;

console.log(failures ? `\n${failures} FAILURE(S)` : "\nall home checks pass");
process.exit(failures ? 1 : 0);
