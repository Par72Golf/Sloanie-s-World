/**
 * Emmett's home base (src/game/emmett-base.ts, art in src/game/monster-truck.ts),
 * through the real colliders and the real collision code. It proves:
 *
 *   - clear ground: the truck's colliders and the solid yard props, each grown
 *     by a 2m margin, overlap no existing collider, no prop footprint
 *     (placement.ts occupancy, flat surfaces included), no reserved walkway,
 *     keepClear corridor or water; the 18m x 14m dirt yard itself overlaps
 *     none of them either, and it is inside the park wall
 *   - spacing: the yard's footprint is at least 12m from every dumpling and
 *     its alternates, juice box, accessory, sticker, the sticker book, pet
 *     treats, the paw trail, the farmer and the pet's home, Emmett's rehide
 *     spots, each carnival booth's standing spot, the carousel gate, the ferris
 *     wheel's boarding platform and Sloan's front door
 *   - reach: talkSpot and trikePark are reachable on foot from the spawn with
 *     no jumping (Dijkstra over a 0.5m grid of standing states with the 0.62m
 *     step-up, as in tools/collectibles.ts), and she then actually walks the
 *     route with moveAndCollide at 60Hz and arrives within 0.5m on the ground;
 *     the walk to talkSpot is 55..115m
 *   - the roof: roofSeat is on the cab's collider top and on the built roof
 *     mesh's top (within 0.05m), inside the roof's edges
 *   - Emmett: his trike fits at trikePark, his home laps (radius loop round the
 *     truck) are clear of every collider with room for the trike, and a trike
 *     can ride from trikePark to the middle of the park (the spawn) on the
 *     flat, without step-ups, outside his keep-out zones
 *
 * The walkways and keepClear corridors are not in the level's props (they are
 * reserved in levels.ts but not built), so their rects are copied below; if
 * levels.ts moves them, update RESERVED.
 *
 * Run: npx jiti tools/emmett-base.ts        (exits 1 on any failure)
 *      npx jiti tools/emmett-base.ts path   also prints the walking routes
 */
import * as THREE from "three";
import { LEVELS } from "../src/game/levels";
import { collidersFor } from "../src/game/colliders";
import { moveAndCollide, type AABB, type Capsule } from "../src/game/collision";
import { occupancy, rectAt, type Rect } from "../src/game/placement";
import { GRAVITY, PLAYER_H, PLAYER_W, WALK } from "../src/game/tuning";
import { BOOTHS, boothStand, carouselGate } from "../src/game/carnival";
import { PET_QUEST, STICKER_BOOK, STICKER_SPOTS } from "../src/game/collectibles";
import { EMMETT_BASE, TRUCK, YARD, YARD_SOLIDS, baseToWorld, truckColliders, yardBoxesLocal, yardFootprint, yardProps } from "../src/game/emmett-base";
import { makeMonsterTruck, makeTruckYard } from "../src/game/monster-truck";
import type { LevelDef } from "../src/game/types";

type V3 = [number, number, number];
// the park as it was before the yard: the level now includes the yard, which would overlap itself
const ownProps = new Set(yardProps().map((p) => JSON.stringify(p)));
const base: LevelDef = { ...LEVELS[0]!, emmettBase: false, props: LEVELS[0]!.props.filter((p) => !ownProps.has(JSON.stringify(p))) };
const DT = 1 / 60;
const STEP_UP = 0.62;
const FLOOR_TOL = 0.03;
const MARGIN = 2;
const MIN_GAP = 12;
const showPaths = process.argv[2] === "path";

let failures = 0;
let passes = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`);
  if (ok) passes++;
  else failures++;
};
const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);

// lam() hands three.js undefined optional parameters and it warns once per material; not ours to fix here
const warn = console.warn;
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].includes("has value of undefined")) return;
  warn(...args);
};

/* ------------------------------------------------------------ what is already there */

const existing = collidersFor(base);
const footprints: (Rect & { label: string })[] = [];
for (const p of base.props) {
  if (p.kind === "cloud") continue;
  const tag = p.kind === "box" ? `box ${p.color} at (${f1(p.pos[0])}, ${f1(p.pos[2])})` : p.kind === "cyl" ? `cyl ${p.color} at (${f1(p.pos[0])}, ${f1(p.pos[2])})` : `${p.kind} at (${f1(p.x)}, ${f1(p.z)})`;
  // flat surfaces included: a dirt yard on a court or a lawn would z-fight and look wrong
  for (const r of occupancy([p], true)) footprints.push({ ...r, label: `footprint ${tag}` });
}

/** Reserved ground copied from picnicPark() in levels.ts: walkways (not built) and keepClear corridors. */
const GATE = 13;
const RESERVED: (Rect & { label: string })[] = [];
const reserve = (label: string, list: number[][]) => {
  for (const [x, z, w, d] of list) RESERVED.push({ ...rectAt(x!, z!, w!, d!), label: `${label} (${x}, ${z}) ${w}x${d}` });
};
reserve("core walkway", [[0, 8, 4.4, 52], [-10, 12, 28, 4.4], [18, 10, 36, 3.8], [0, -20, 4.2, 28], [40, -8, 3.6, 36], [-36, 20, 3.6, 40]]);
reserve("trail slab", [[-111, 0, 12, 4.4], [-120, 3, 8, 4.4], [-126, 7, 8, 4.4], [-131, 3, 6, 4.4], [-136, 8, 8, 4.4]]);
reserve("path", [
  [0, 84.75, GATE - 3, 31.5], [0, -84.75, GATE - 3, 31.5], [84.75, 0, 31.5, GATE - 3], [-84.75, 0, 31.5, GATE - 3],
  [0, 103, 201, 5], [0, -103, 201, 5], [103, 0, 5, 216], [-103, 0, 5, 216],
  [118, 60, 26, 4.4], [-40, 115, 4.4, 19], [8, 115, 4.4, 19], [-60, -110, 4.4, 9], [20, -110, 4.4, 9],
  [112, -60, 14, 4.4], [112, 103, 4.4, 24], [112, 122, 4.4, 14],
]);
RESERVED.push({ minX: -29, maxX: -2, minZ: 50, maxZ: 70, label: "old hill reserve" });
reserve("keepClear", [
  [0, 86, GATE + 6, 36], [0, -86, GATE + 6, 36], [86, 0, 36, GATE + 6], [-86, 0, 36, GATE + 6],
  [99, 26, 14, 16], [99, -34, 14, 16], [-99, 28, 14, 16], [-99, -30, 14, 16], [97, 72, 16, 14], [0, -99, 16, 16],
  [0, 106, 180, 8], [0, 103, 220, 11], [0, -103, 220, 11], [103, 0, 11, 220], [-103, 0, 11, 220],
  [128, 128, 36, 32], [132, 60, 20, 16], [118, 60, 30, 8], [112, 114, 8, 44],
  [-40, 136, 40, 28], [8, 136, 32, 24], [-60, -132, 58, 42], [20, -132, 38, 30], [130, -60, 52, 40],
  [73, -128, 50, 46], [-16, 40, 24, 12], [-40, 115, 8, 24], [8, 115, 8, 24], [-60, -110, 8, 14], [20, -110, 8, 14], [112, -60, 18, 8],
]);

const overlaps = (a: Rect, b: Rect) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
const grow = (r: Rect, m: number): Rect => ({ minX: r.minX - m, maxX: r.maxX + m, minZ: r.minZ - m, maxZ: r.maxZ + m });
const rectDist = (x: number, z: number, r: Rect) => Math.hypot(Math.max(r.minX - x, 0, x - r.maxX), Math.max(r.minZ - z, 0, z - r.maxZ));
const fmtRect = (r: Rect) => `x ${f2(r.minX)}..${f2(r.maxX)}, z ${f2(r.minZ)}..${f2(r.maxZ)}`;

/* ------------------------------------------------------------ the new things */

const truck = truckColliders();
const props = yardProps();
const yard = yardFootprint();
// the level with the yard props added, so their colliders come from colliders.ts like the game's
const level: LevelDef = { ...base, props: [...base.props, ...props] };
const yardCols = collidersFor(level).filter((b) => b.index >= base.props.length);
const newSolids: (AABB & { label: string })[] = [
  ...truck.map((b, i) => ({ ...b, label: ["truck body", "truck cab", "truck rear wheels", "truck front wheels"][i] ?? `truck ${i}` })),
  ...yardCols.map((b, i) => ({ ...b, label: yardBoxesLocal()[i]?.label ?? b.label })),
];
const boxes: (AABB & { label: string })[] = [...existing, ...newSolids];

console.log(`Emmett's base at (${EMMETT_BASE.x}, ${EMMETT_BASE.z}), yaw ${f2(EMMETT_BASE.yaw)} (truck nose toward ${EMMETT_BASE.yaw === -Math.PI / 2 ? "+z, south" : "?"})`);
console.log(`  yard ${fmtRect(yard)}`);
console.log(`  roofSeat ${JSON.stringify(EMMETT_BASE.roofSeat)}  trikePark ${JSON.stringify(EMMETT_BASE.trikePark)}  talkSpot ${JSON.stringify(EMMETT_BASE.talkSpot)}  loop ${EMMETT_BASE.loop}`);
console.log(`  ${truck.length} truck colliders, ${props.length} yard props`);

/* ------------------------------------------------------------ 1. clear ground */

console.log("\nclear ground");
{
  const blockers = [...existing.map((b) => ({ ...b, label: `collider ${b.label}` })), ...footprints, ...RESERVED];
  let hits = 0;
  for (const s of newSolids) {
    const g = grow(s, MARGIN);
    for (const b of blockers) {
      if (!overlaps(g, b)) continue;
      hits++;
      if (hits <= 12) console.log(`       ${s.label} + ${MARGIN}m overlaps ${b.label} (${fmtRect(b)})`);
    }
    const wet = (base.water ?? []).find((w) => rectDist(w.x, w.z, g) < w.r);
    if (wet) {
      hits++;
      console.log(`       ${s.label} + ${MARGIN}m is in water at (${wet.x}, ${wet.z})`);
    }
  }
  check(hits === 0, `truck and yard colliders + ${MARGIN}m margin overlap nothing (${newSolids.length} boxes against ${blockers.length} colliders, footprints and reserved rects, and ${(base.water ?? []).length} water zones)`);

  let yardHits = 0;
  for (const b of blockers) {
    if (!overlaps(yard, b)) continue;
    yardHits++;
    if (yardHits <= 12) console.log(`       yard overlaps ${b.label} (${fmtRect(b)})`);
  }
  const wet = (base.water ?? []).filter((w) => rectDist(w.x, w.z, yard) < w.r + MARGIN);
  check(yardHits === 0 && wet.length === 0, `the ${YARD.length}m x ${YARD.width}m dirt yard overlaps nothing and is ${MARGIN}m+ from water`);

  const nearest = blockers
    .map((b) => ({ b, d: Math.hypot(Math.max(b.minX - yard.maxX, 0, yard.minX - b.maxX), Math.max(b.minZ - yard.maxZ, 0, yard.minZ - b.maxZ)) }))
    .sort((p, q) => p.d - q.d)
    .slice(0, 4);
  for (const { b, d } of nearest) console.log(`       nearest: ${f2(d)}m to ${b.label}`);

  const B = base.bounds;
  check(yard.minX > B.minX + 10 && yard.maxX < B.maxX - 10 && yard.minZ > B.minZ + 10 && yard.maxZ < B.maxZ - 10, "the yard is well inside the park wall");

  let inner = 0;
  for (const a of newSolids) for (const b of newSolids) if (a !== b && a.label.startsWith("truck") !== b.label.startsWith("truck") && overlaps(a, b)) inner++;
  check(inner === 0, "no yard prop overlaps the truck");
}

/* ------------------------------------------------------------ 2. spacing */

console.log("\nspacing (from the yard's footprint)");
{
  const pts: [number, number, string][] = [];
  for (const d of base.dumplings) {
    pts.push([d.pos[0], d.pos[2], `dumpling ${d.id}`]);
    (d.alts ?? []).forEach((a, i) => pts.push([a.pos[0], a.pos[2], `dumpling ${d.id} alt${i + 1}`]));
  }
  for (const [x, z] of base.juice ?? []) pts.push([x, z, `juice (${x}, ${z})`]);
  for (const a of base.accessories ?? []) pts.push([a.pos[0], a.pos[2], `accessory ${a.id}`]);
  for (const s of STICKER_SPOTS) pts.push([s.pos[0], s.pos[2], `sticker ${s.id}`]);
  pts.push([STICKER_BOOK.pos[0], STICKER_BOOK.pos[2], "sticker book"]);
  PET_QUEST.treats.forEach((t, i) => pts.push([t.pos[0], t.pos[2], `treat ${i + 1} (${t.area})`]));
  PET_QUEST.pawTrail.forEach(([x, z], i) => pts.push([x, z, `paw trail point ${i}`]));
  pts.push([PET_QUEST.farmer[0], PET_QUEST.farmer[2], "farmer"]);
  pts.push([PET_QUEST.home[0], PET_QUEST.home[2], "pet home"]);
  pts.push([PET_QUEST.hideout[0], PET_QUEST.hideout[2], "pet hideout"]);
  for (const r of base.rehideSpots ?? []) pts.push([r.pos[0], r.pos[2], `rehide ${r.name}`]);
  for (const b of BOOTHS) {
    const [x, z] = boothStand(b);
    pts.push([x, z, `booth ${b.name}`]);
  }
  {
    const [x, z] = carouselGate();
    pts.push([x, z, "carousel gate"]);
  }
  if (base.ride) pts.push([base.ride.x, base.ride.z + 4, "ferris wheel platform"]);
  pts.push([-9, 105.4, "Sloan's front door"]);

  const rows = pts.map(([x, z, name]) => ({ name, d: rectDist(x, z, yard) })).sort((a, b) => a.d - b.d);
  const close = rows.filter((r) => r.d < MIN_GAP);
  for (const r of close) console.log(`       ${f1(r.d)}m from ${r.name}`);
  check(close.length === 0, `${pts.length} spots all ${MIN_GAP}m+ away; nearest ${rows.slice(0, 3).map((r) => `${r.name} ${f1(r.d)}m`).join(", ")}`);
}

/* ------------------------------------------------------------ grid search */

const HB = 4;
type Hashed = { list: (AABB & { label: string })[]; hash: Map<number, number[]>; stamp: Uint32Array; gen: number };
const hkey = (ix: number, iz: number) => (ix + 1000) * 4096 + (iz + 1000);
function hashed(list: (AABB & { label: string })[]): Hashed {
  const hash = new Map<number, number[]>();
  list.forEach((b, i) => {
    for (let ix = Math.floor(b.minX / HB); ix <= Math.floor(b.maxX / HB); ix++) {
      for (let iz = Math.floor(b.minZ / HB); iz <= Math.floor(b.maxZ / HB); iz++) {
        const k = hkey(ix, iz);
        let l = hash.get(k);
        if (!l) hash.set(k, (l = []));
        l.push(i);
      }
    }
  });
  return { list, hash, stamp: new Uint32Array(list.length), gen: 0 };
}
const world = hashed(boxes);
function query(minX: number, maxX: number, minZ: number, maxZ: number, h = world): (AABB & { label: string })[] {
  h.gen++;
  const out: (AABB & { label: string })[] = [];
  for (let ix = Math.floor(minX / HB); ix <= Math.floor(maxX / HB); ix++) {
    for (let iz = Math.floor(minZ / HB); iz <= Math.floor(maxZ / HB); iz++) {
      const l = h.hash.get(hkey(ix, iz));
      if (!l) continue;
      for (const i of l) {
        if (h.stamp[i] === h.gen) continue;
        h.stamp[i] = h.gen;
        const b = h.list[i]!;
        if (minX < b.maxX && maxX > b.minX && minZ < b.maxZ && maxZ > b.minZ) out.push(b);
      }
    }
  }
  return out;
}

const inWater = (x: number, z: number, margin = 0) => (base.water ?? []).some((w) => Math.hypot(x - w.x, z - w.z) < w.r + margin);

type Mover = { hw: number; stepUp: number; avoid: Rect[] };
const SLOAN: Mover = { hw: PLAYER_W, stepUp: STEP_UP, avoid: [] };
/** A trike: wider, cannot climb anything but a kerb-high slab, keeps out of his keep-out zones. */
const TRIKE: Mover = { hw: 0.55, stepUp: 0.12, avoid: base.emmettKeepOut ?? [] };

function standAt(m: Mover, x: number, z: number, fromY: number): number | null {
  const under = query(x - m.hw, x + m.hw, z - m.hw, z + m.hw);
  let floor = base.groundY;
  for (const b of under) if (b.maxY <= fromY + m.stepUp + 1e-6 && b.maxY > floor) floor = b.maxY;
  for (const b of under) {
    if (b.label === "trampoline") return null;
    if (b.maxY - floor > FLOOR_TOL && b.minY < floor + PLAYER_H) return null;
  }
  if (floor < 0.1 && inWater(x, z)) return null;
  if (m.avoid.some((k) => x > k.minX && x < k.maxX && z > k.minZ && z < k.maxZ)) return null;
  return floor;
}

function tight(m: Mover, x: number, z: number, floor: number, pad: number) {
  const hw = m.hw + pad;
  for (const b of query(x - hw, x + hw, z - hw, z + hw)) {
    if (b.label === "trampoline") return true;
    if (b.maxY - floor > m.stepUp + 0.01 && b.minY < floor + PLAYER_H) return true;
  }
  return false;
}

const G = 0.5;
const BB = base.bounds;
const W = Math.round((BB.maxX - BB.minX) / G) + 1;
const H = Math.round((BB.maxZ - BB.minZ) / G) + 1;
const SLOTS = 4;
const cellX = (ix: number) => BB.minX + ix * G;
const cellZ = (iz: number) => BB.minZ + iz * G;
const ixOf = (x: number) => Math.round((x - BB.minX) / G);
const izOf = (z: number) => Math.round((z - BB.minZ) / G);

type Search = { dist: Float64Array; prev: Int32Array; floor: Float32Array; start: number };

function search(m: Mover, sx: number, sz: number, sy = 0): Search {
  const N = W * H * SLOTS;
  const dist = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const floor = new Float32Array(N).fill(NaN);
  const slotOf = (cell: number, y: number) => {
    for (let s = 0; s < SLOTS; s++) {
      const f = floor[cell * SLOTS + s]!;
      if (Number.isNaN(f)) {
        floor[cell * SLOTS + s] = y;
        return cell * SLOTS + s;
      }
      if (Math.abs(f - y) < 0.01) return cell * SLOTS + s;
    }
    return -1;
  };
  const hk: number[] = [];
  const hv: number[] = [];
  const push = (k: number, v: number) => {
    let i = hk.length;
    hk.push(k);
    hv.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hk[p]! <= k) break;
      hk[i] = hk[p]!;
      hv[i] = hv[p]!;
      i = p;
    }
    hk[i] = k;
    hv[i] = v;
  };
  const pop = () => {
    const v = hv[0]!;
    const lk = hk.pop()!;
    const lv = hv.pop()!;
    if (hk.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= hk.length) break;
        const r = l + 1;
        const c = r < hk.length && hk[r]! < hk[l]! ? r : l;
        if (hk[c]! >= lk) break;
        hk[i] = hk[c]!;
        hv[i] = hv[c]!;
        i = c;
      }
      hk[i] = lk;
      hv[i] = lv;
    }
    return v;
  };
  const six = ixOf(sx);
  const siz = izOf(sz);
  const f0 = standAt(m, cellX(six), cellZ(siz), sy + 0.05);
  const start = f0 == null ? -1 : slotOf(siz * W + six, f0);
  if (start < 0) return { dist, prev, floor, start };
  dist[start] = 0;
  push(0, start);
  const dirs: [number, number, number][] = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
  ];
  while (hk.length) {
    const d0 = hk[0]!;
    const st = pop();
    if (d0 > dist[st]!) continue;
    const cell = Math.floor(st / SLOTS);
    const ix = cell % W;
    const iz = Math.floor(cell / W);
    const y = floor[st]!;
    for (const [dx, dz, len] of dirs) {
      const nx = ix + dx;
      const nz = iz + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const f = standAt(m, cellX(nx), cellZ(nz), y);
      if (f == null) continue;
      if (dx && dz && (standAt(m, cellX(nx), cellZ(iz), y) == null || standAt(m, cellX(ix), cellZ(nz), y) == null)) continue;
      const ns = slotOf(nz * W + nx, f);
      if (ns < 0) continue;
      const penalty = tight(m, cellX(nx), cellZ(nz), f, 0.35) ? 3 : tight(m, cellX(nx), cellZ(nz), f, 0.8) ? 0.6 : 0;
      const nd = d0 + G * len * (1 + penalty);
      if (nd < dist[ns]!) {
        dist[ns] = nd;
        prev[ns] = st;
        push(nd, ns);
      }
    }
  }
  return { dist, prev, floor, start };
}

function statesAt(s: Search, x: number, z: number): [number, number][] {
  const ix = ixOf(x);
  const iz = izOf(z);
  if (ix < 0 || iz < 0 || ix >= W || iz >= H) return [];
  const out: [number, number][] = [];
  for (let k = 0; k < SLOTS; k++) {
    const st = (iz * W + ix) * SLOTS + k;
    if (Number.isFinite(s.dist[st]!)) out.push([st, s.floor[st]!]);
  }
  return out;
}

function route(s: Search, st: number) {
  const pts: V3[] = [];
  for (let k = st; k >= 0; k = s.prev[k]!) {
    const cell = Math.floor(k / SLOTS);
    pts.unshift([cellX(cell % W), cellZ(Math.floor(cell / W)), s.floor[k]!]);
  }
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  return { pts, len };
}

/** Walk her along points with moveAndCollide, no jumping; she must end within 0.5m of the last point. */
function walk(pts: [number, number][], startY = 0) {
  const [sx, sz] = pts[0]!;
  const c: Capsule = { x: sx, y: startY + 0.3, z: sz, hw: PLAYER_W, h: PLAYER_H, hd: PLAYER_W };
  let vy = 0;
  const near = () => query(c.x - 2, c.x + 2, c.z - 2, c.z + 2);
  for (let i = 0; i < 20; i++) {
    vy -= GRAVITY * DT;
    vy = moveAndCollide(c, 0, vy, 0, near(), DT, base.groundY).vy;
  }
  let i = 1;
  let best = Infinity;
  let bestI = 0;
  let stall = 0;
  let metres = 0;
  const last = pts.length - 1;
  for (let f = 0; f < 60 * 600; f++) {
    while (i < last && Math.hypot(pts[i]![0] - c.x, pts[i]![1] - c.z) < 0.6) i++;
    const [tx, tz] = pts[i]!;
    const dx = tx - c.x;
    const dz = tz - c.z;
    const d = Math.hypot(dx, dz);
    if (i === last && d < 0.08) break;
    const sp = Math.min(WALK, d / DT);
    const px = c.x;
    const pz = c.z;
    vy -= GRAVITY * DT;
    vy = moveAndCollide(c, (dx / d) * sp, vy, (dz / d) * sp, near(), DT, base.groundY).vy;
    const moved = Math.hypot(c.x - px, c.z - pz);
    metres += moved;
    if (moved > 1) return { ok: false, x: c.x, y: c.y, z: c.z, metres, why: `teleported ${f2(moved)}m at (${f1(px)}, ${f1(pz)})` };
    if (i > bestI) {
      bestI = i;
      best = d;
      stall = 0;
    } else if (d < best - 0.02) {
      best = d;
      stall = 0;
    } else if (++stall > 90) {
      return { ok: false, x: c.x, y: c.y, z: c.z, metres, why: `stalled at (${f2(c.x)}, ${f2(c.y)}, ${f2(c.z)}) heading for (${tx}, ${tz})` };
    }
  }
  for (let f = 0; f < 30; f++) {
    vy -= GRAVITY * DT;
    vy = moveAndCollide(c, 0, vy, 0, near(), DT, base.groundY).vy;
  }
  const err = Math.hypot(pts[last]![0] - c.x, pts[last]![1] - c.z);
  return { ok: err <= 0.5, x: c.x, y: c.y, z: c.z, metres, why: err <= 0.5 ? "" : `ended ${f2(err)}m short` };
}

/* ------------------------------------------------------------ 3. reach on foot */

console.log("\nreach on foot from the spawn");
const spawn = base.spawn;
const fromSpawn = search(SLOAN, spawn[0], spawn[2], spawn[1]);
check(fromSpawn.start >= 0, `spawn (${spawn.join(", ")}) is standable`);
const walkTo = (name: string, p: V3, range?: [number, number]) => {
  const [x, , z] = p;
  const standing = standAt(SLOAN, x, z, 0.05);
  check(standing != null && standing < FLOOR_TOL, `${name} (${f2(x)}, ${f2(z)}): a capsule stands there on the ground`);
  const sts = statesAt(fromSpawn, x, z).sort((a, b) => a[1] - b[1]);
  if (!sts.length) {
    check(false, `${name} is reachable from the spawn`);
    return;
  }
  const rt = route(fromSpawn, sts[0]![0]);
  const pts = rt.pts.map((q) => [q[0], q[1]] as [number, number]);
  pts.push([x, z]);
  const w = walk(pts, spawn[1]);
  check(w.ok && Math.abs(w.y) < 0.1, `${name}: walked ${f1(w.metres)}m along a ${f1(rt.len)}m route and arrived${w.ok ? ` (${f2(Math.hypot(w.x - x, w.z - z))}m off, height ${f2(w.y)})` : `: ${w.why}`}`);
  if (range) check(rt.len >= range[0] && rt.len <= range[1], `${name} is ${f1(rt.len)}m walk from the spawn (want ${range[0]}..${range[1]}m)`);
  if (showPaths) {
    const step = Math.max(1, Math.floor(rt.pts.length / 16));
    console.log(`       route: ${rt.pts.filter((_, i) => i % step === 0 || i === rt.pts.length - 1).map((q) => `(${q[0]}, ${q[1]})`).join(" ")}`);
  }
};
walkTo("talkSpot", EMMETT_BASE.talkSpot, [55, 115]);
walkTo("trikePark", EMMETT_BASE.trikePark);
{
  // she can come round the truck: every side of it is reachable
  const sides: [string, number, number][] = [
    ["nose", TRUCK.halfLength + 1.2, 0],
    ["tail", -TRUCK.halfLength - 1.2, 0],
    ["ladder side", 0, TRUCK.ladderZ + 0.9],
    ["far side", 0, -TRUCK.hubReach - 0.9],
  ];
  const missing = sides.filter(([, lx, lz]) => {
    const [x, z] = baseToWorld(lx, lz);
    return !statesAt(fromSpawn, x, z).some(([, f]) => f < FLOOR_TOL);
  });
  check(missing.length === 0, `she can walk right round the truck${missing.length ? `; not reachable: ${missing.map((m) => m[0]).join(", ")}` : ""}`);
  const [lx, lz] = baseToWorld(0, TRUCK.ladderZ + 0.5);
  check(statesAt(fromSpawn, lx, lz).length > 0, "the foot of the ladder is reachable");

  // the kicker ramp walks like a ramp: straight up from the run-up to the lip, no stall, no jump
  const ramp = YARD_SOLIDS.find((s) => s.kind === "ramp");
  if (ramp && ramp.kind === "ramp") {
    const a = baseToWorld(ramp.x - ramp.len / 2 - 1.5, ramp.z);
    const b = baseToWorld(ramp.x + ramp.len / 2 - 0.35, ramp.z);
    const w = walk([a, b], 0);
    const lip = ramp.h - ramp.h / 6 - 0.02;
    check(w.ok && Math.abs(w.y - lip) < 0.05, `she walks up the kicker ramp onto its lip: ${w.ok ? `ended at height ${f2(w.y)} (lip step ${f2(lip)}, drawn lip ${ramp.h})` : w.why}`);
  }
}

/* ------------------------------------------------------------ 4. the roof */

console.log("\nthe roof");
{
  const [x, y, z] = EMMETT_BASE.roofSeat;
  const under = truck.filter((b) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ);
  const top = Math.max(...under.map((b) => b.maxY));
  check(Math.abs(y - top) <= 0.05, `roofSeat y ${f2(y)} is on the truck's collider top ${f2(top)}`);
  check(Math.abs(y - TRUCK.roofTop) <= 0.05, `roofSeat y ${f2(y)} is TRUCK.roofTop ${f2(TRUCK.roofTop)}`);

  const rig = makeMonsterTruck();
  rig.group.position.set(EMMETT_BASE.x, 0, EMMETT_BASE.z);
  rig.group.rotation.y = EMMETT_BASE.yaw;
  rig.group.updateMatrixWorld(true);
  const roof = rig.group.getObjectByName("roof");
  if (!roof) check(false, "the truck has a mesh named roof");
  else {
    const bb = new THREE.Box3().setFromObject(roof);
    check(Math.abs(bb.max.y - y) <= 0.05, `roofSeat y ${f2(y)} is on the built roof mesh's top ${f2(bb.max.y)}`);
    const edge = Math.min(x - bb.min.x, bb.max.x - x, z - bb.min.z, bb.max.z - z);
    check(edge >= 0.35, `roofSeat is inside the roof mesh, ${f2(edge)}m from its nearest edge (roof x ${f2(bb.min.x)}..${f2(bb.max.x)}, z ${f2(bb.min.z)}..${f2(bb.max.z)})`);
    // nothing on the roof pokes up through where he sits
    let poke = "";
    const seatBox = new THREE.Box3(new THREE.Vector3(x - 0.25, y + 0.005, z - 0.25), new THREE.Vector3(x + 0.25, y + 0.9, z + 0.25));
    rig.group.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh || poke) return;
      const ob = new THREE.Box3().setFromObject(o);
      if (ob.intersectsBox(seatBox)) poke = o.name || "a mesh";
    });
    check(!poke, `nothing on the roof is in his seat${poke ? `: ${poke}` : ""}`);

    // every truck collider sits inside the drawn truck (no invisible walls), and the drawn body is inside the colliders' reach
    const all = new THREE.Box3().setFromObject(rig.group);
    const outside = truck.filter((b) => b.minX < all.min.x - 0.02 || b.maxX > all.max.x + 0.02 || b.minZ < all.min.z - 0.02 || b.maxZ > all.max.z + 0.02 || b.maxY > all.max.y + 0.02);
    check(outside.length === 0, `truck colliders are within the drawn truck (drawn x ${f2(all.min.x)}..${f2(all.max.x)}, z ${f2(all.min.z)}..${f2(all.max.z)}, top ${f2(all.max.y)})`);
    const cx = { minX: Math.min(...truck.map((b) => b.minX)), maxX: Math.max(...truck.map((b) => b.maxX)), minZ: Math.min(...truck.map((b) => b.minZ)), maxZ: Math.max(...truck.map((b) => b.maxZ)) };
    const spill = Math.max(cx.minX - all.min.x, all.max.x - cx.maxX, cx.minZ - all.min.z, all.max.z - cx.maxZ);
    check(spill <= 0.15, `the drawn truck spills at most ${f2(spill)}m past its colliders (want <= 0.15)`);
  }

  // the yard's solid props are hidden inside what makeTruckYard draws
  const yardG = makeTruckYard();
  yardG.position.set(EMMETT_BASE.x, 0, EMMETT_BASE.z);
  yardG.rotation.y = EMMETT_BASE.yaw;
  yardG.updateMatrixWorld(true);
  const drawn: THREE.Box3[] = [];
  yardG.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.userData.solidCover) drawn.push(new THREE.Box3().setFromObject(o));
  });
  const bare = yardCols.filter((b) => !drawn.some((d) => d.min.x <= b.minX + 1e-3 && d.max.x >= b.maxX - 1e-3 && d.min.z <= b.minZ + 1e-3 && d.max.z >= b.maxZ - 1e-3 && d.max.y >= b.maxY - 1e-3));
  check(bare.length === 0, `each of the ${yardCols.length} yard colliders is inside a drawn cover (${drawn.length} covers)`);
}

/* ------------------------------------------------------------ 5. Emmett */

console.log("\nEmmett");
{
  const [px, , pz] = EMMETT_BASE.trikePark;
  // trike footprint about 0.8m wide by 1.3m long, either way round
  const hits = query(px - 0.75, px + 0.75, pz - 0.75, pz + 0.75).filter((b) => b.maxY > FLOOR_TOL);
  check(hits.length === 0, `his trike fits at trikePark with room to spare${hits.length ? `: ${hits.map((h) => h.label).join(", ")}` : ""}`);
  const dTalk = Math.hypot(px - EMMETT_BASE.talkSpot[0], pz - EMMETT_BASE.talkSpot[2]);
  check(dTalk >= 2, `trikePark is ${f1(dTalk)}m from talkSpot`);

  let worst = Infinity;
  let worstAt = "";
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const x = EMMETT_BASE.x + Math.cos(a) * EMMETT_BASE.loop;
    const z = EMMETT_BASE.z + Math.sin(a) * EMMETT_BASE.loop;
    for (const b of query(x - 3, x + 3, z - 3, z + 3)) {
      if (b.maxY <= FLOOR_TOL) continue;
      const d = rectDist(x, z, b);
      if (d < worst) {
        worst = d;
        worstAt = `${b.label} at angle ${((a * 180) / Math.PI).toFixed(0)}`;
      }
    }
  }
  check(worst >= 0.8, `his home laps (radius ${EMMETT_BASE.loop}) keep ${f2(worst)}m from anything solid (want 0.8m for the trike): nearest ${worstAt}`);
  const talkR = Math.hypot(EMMETT_BASE.talkSpot[0] - EMMETT_BASE.x, EMMETT_BASE.talkSpot[2] - EMMETT_BASE.z);
  check(talkR - EMMETT_BASE.loop >= 0.9, `talkSpot is ${f2(talkR - EMMETT_BASE.loop)}m outside his lap line, so he does not pedal through her`);

  const fromPark = search(TRIKE, px, pz, 0);
  const sts = statesAt(fromPark, spawn[0], spawn[2]);
  if (fromPark.start < 0 || !sts.length) check(false, "a trike can ride from trikePark to the spawn on the flat");
  else {
    const rt = route(fromPark, sts[0]![0]);
    const climbs = rt.pts.reduce((m, q) => Math.max(m, q[2]), 0);
    check(true, `a trike (0.55m half-width, 0.12m kerbs, outside his keep-out zones) rides from trikePark to the spawn: ${f1(rt.len)}m, highest floor ${f2(climbs)}m`);
    if (showPaths) {
      const step = Math.max(1, Math.floor(rt.pts.length / 16));
      console.log(`       route: ${rt.pts.filter((_, i) => i % step === 0 || i === rt.pts.length - 1).map((q) => `(${q[0]}, ${q[1]})`).join(" ")}`);
    }
  }
}

console.log(`\nfor levels.ts: keepClear rectAt(${f2((yard.minX + yard.maxX) / 2)}, ${f2((yard.minZ + yard.maxZ) / 2)}, ${f2(yard.maxX - yard.minX)}, ${f2(yard.maxZ - yard.minZ)}), plus ...yardProps() in props`);
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
