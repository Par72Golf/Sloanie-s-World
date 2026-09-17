/**
 * Sloanie's Zoo (src/game/zoo.ts, art in src/game/zoo-mesh.ts), through the
 * real colliders and the real collision code. It proves:
 *
 *   - clear ground: every fence and arch collider, grown by a 2m margin,
 *     overlaps no existing collider, no prop footprint (placement.ts
 *     occupancy, flat surfaces included), no reserved walkway, keepClear
 *     corridor or water; the zoo's own footprint overlaps none of them
 *     either, is inside the park wall, and touches the farm (within 15m)
 *   - spacing: the footprint is 12m+ from every dumpling and its alternates,
 *     juice box, accessory, sticker, the sticker book, pet treats, the
 *     farmer, the pet's home and hideout, Emmett's rehide spots, his truck's
 *     talk spot, each carnival booth and Sloan's front door; and the paw
 *     trail passes outside the fence
 *   - the walk: every plaque's standing spot is reachable on foot from the
 *     spawn with no jumping (Dijkstra over a 0.5m grid of standing states
 *     with the 0.62m step-up, as in tools/emmett-base.ts), she then walks
 *     each route with moveAndCollide at 60Hz and arrives, and she can walk
 *     the whole loop round the penguin island in one go
 *   - the fences are solid: no point inside any enclosure is reachable from
 *     the spawn, and she cannot step up onto a fence (1.1m vs the 0.62m
 *     step-up)
 *   - no invisible walls: a walk.ts sweep across the zoo and 6m round it
 *     reports no stall where the blocker's top is within the step-up
 *   - jumping: she jumps 2.7m, so ZOO_NO_JUMP must cover the fence line plus
 *     a boosted running jump's reach onto a fence top, and the level must
 *     carry that zone once the zoo is wired in
 *   - the art: every collider is inside the drawn fence for its run (no
 *     invisible walls, no fence hanging past its collider), each animal
 *     stands on the ground and stays inside its own enclosure over 1200
 *     frames of idle and happy animation, and animateZoo allocates nothing
 *   - the cost: triangles for the whole zoo, static and animated
 *
 * The walkways and keepClear corridors are not in the level's props (they are
 * reserved in levels.ts but not built), so their rects are copied below; if
 * levels.ts moves them, update RESERVED.
 *
 * Run: npx jiti tools/zoo.ts          (exits 1 on any failure)
 *      npx jiti tools/zoo.ts path     also prints the walking routes
 *      npx jiti tools/zoo.ts scan     the clear-space search that picked the spot
 */
import * as THREE from "three";
import { LEVELS } from "../src/game/levels";
import { collidersFor } from "../src/game/colliders";
import { moveAndCollide, type AABB, type Capsule } from "../src/game/collision";
import { occupancy, rectAt, type Rect } from "../src/game/placement";
import { GRAVITY, PLAYER_H, PLAYER_W, WALK, jumpHeight, jumpReach } from "../src/game/tuning";
import { BOOST_MULTIPLIER } from "../src/game/emmett";
import { BOOTHS, boothStand, carouselGate } from "../src/game/carnival";
import { PET_QUEST, STICKER_BOOK, STICKER_SPOTS } from "../src/game/collectibles";
import { EMMETT_BASE } from "../src/game/emmett-base";
import {
  ENCLOSURES,
  FENCE,
  FENCE_LINES,
  ZOO,
  ZOO_NO_JUMP,
  plaqueSpot,
  zooColliders,
  zooFootprint,
  zooProps,
  zooToWorld,
} from "../src/game/zoo";
import { ZooWorld, animateZoo, makeZoo } from "../src/game/zoo-mesh";
import type { LevelDef } from "../src/game/types";

type V3 = [number, number, number];
const DT = 1 / 60;
const STEP_UP = 0.62;
const FLOOR_TOL = 0.03;
const MARGIN = 2;
const MIN_GAP = 12;
const mode = process.argv[2] ?? "";
const showPaths = mode === "path";

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

// the park as it was before the zoo: once the zoo is wired in, the level
// carries its props and colliders, which would then overlap themselves
/** Anything no taller than this is ground she walks over, not an obstacle. */
const FLAT_TOP = 0.2;
const ownProps = new Set(zooProps().map((p) => JSON.stringify(p)));
const base: LevelDef = { ...LEVELS[0]!, props: LEVELS[0]!.props.filter((p) => !ownProps.has(JSON.stringify(p))) };
const wiredIn = base.props.length !== LEVELS[0]!.props.length;
const existing = collidersFor(base).filter((b) => !b.label.startsWith("zoo") && b.maxY > FLAT_TOP);

/**
 * Paths are meant to arrive at the zoo's arch, so flat ground (walkway slabs,
 * their edging, paving) is not something the zoo has to keep clear of. Only
 * things that stand up count as blockers.
 */
const footprints: (Rect & { label: string })[] = [];
for (const p of base.props) {
  if (p.kind === "cloud") continue;
  if (p.kind === "box" && p.pos[1] + p.size[1] / 2 <= FLAT_TOP) continue;
  const tag = p.kind === "box" ? `box ${p.color} at (${f1(p.pos[0])}, ${f1(p.pos[2])})` : p.kind === "cyl" ? `cyl ${p.color} at (${f1(p.pos[0])}, ${f1(p.pos[2])})` : `${p.kind} at (${f1(p.x)}, ${f1(p.z)})`;
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
  [EMMETT_BASE.x, EMMETT_BASE.z, 14, 18],
]);
/** The farm's keepClear rect, which the zoo has to sit beside. */
const FARM = rectAt(-60, -132, 58, 42);

const overlaps = (a: Rect, b: Rect) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
const grow = (r: Rect, m: number): Rect => ({ minX: r.minX - m, maxX: r.maxX + m, minZ: r.minZ - m, maxZ: r.maxZ + m });
const rectDist = (x: number, z: number, r: Rect) => Math.hypot(Math.max(r.minX - x, 0, x - r.maxX), Math.max(r.minZ - z, 0, z - r.maxZ));
const rectGap = (a: Rect, b: Rect) => Math.hypot(Math.max(b.minX - a.maxX, 0, a.minX - b.maxX), Math.max(b.minZ - a.maxZ, 0, a.minZ - b.maxZ));
const fmtRect = (r: Rect) => `x ${f2(r.minX)}..${f2(r.maxX)}, z ${f2(r.minZ)}..${f2(r.maxZ)}`;

/* ------------------------------------------------------------ the new things */

const zooCols = zooColliders();
const props = zooProps();
const foot = zooFootprint();
const level: LevelDef = { ...base, props: [...base.props, ...props] };
const propCols = collidersFor(level).filter((b) => b.index >= base.props.length);
const boxes: (AABB & { label: string })[] = [...existing, ...zooCols, ...propCols];
const blockers = [...existing.map((b) => ({ ...b, label: `collider ${b.label}` })), ...footprints, ...RESERVED];

console.log(`Sloanie's Zoo at (${ZOO.x}, ${ZOO.z}), ${ZOO.w}m x ${ZOO.d}m, entrance arch on the road side (+z), turned ${ZOO.yaw.toFixed(2)}`);
console.log(`  fence line ${fmtRect(foot)}`);
console.log(`  ${zooCols.length} fence and arch colliders, ${props.length} flat props, ${ENCLOSURES.length} enclosures`);
console.log(`  ${wiredIn ? "the level already carries the zoo props (checking against the park without them)" : "not wired into levels.ts yet"}`);

/* ------------------------------------------------------------ 0. the spot search */

if (mode === "scan") {
  console.log("\nclear-space scan for the zoo's footprint, within 15m of the farm");
  for (const [w, d] of [[ZOO.w, ZOO.d], [30, 26], [24, 24]] as [number, number][]) {
    const found: [number, number][] = [];
    for (let x = -150; x <= 150; x += 1) {
      for (let z = -150; z <= -60; z += 1) {
        const r = rectAt(x, z, w, d);
        if (rectGap(r, FARM) > 15) continue;
        if (r.minX < base.bounds.minX + 12 || r.maxX > base.bounds.maxX - 12 || r.minZ < base.bounds.minZ + 12 || r.maxZ > base.bounds.maxZ - 12) continue;
        const g = grow(r, MARGIN);
        if (blockers.some((b) => overlaps(g, b))) continue;
        if ((base.water ?? []).some((wz) => rectDist(wz.x, wz.z, g) < wz.r)) continue;
        found.push([x, z]);
      }
    }
    const xs = found.map((p) => p[0]);
    const zs = found.map((p) => p[1]);
    console.log(
      `  ${w}m x ${d}m: ${found.length} clear centres` +
        (found.length ? `, x ${Math.min(...xs)}..${Math.max(...xs)}, z ${Math.min(...zs)}..${Math.max(...zs)}` : ""),
    );
  }
  console.log("\nThe only clear ground beside the farm is the lawn between it and the mini golf.");
  process.exit(0);
}

/* ------------------------------------------------------------ 1. clear ground */

console.log("\nclear ground");
{
  let hits = 0;
  for (const s of zooCols) {
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
  check(hits === 0, `${zooCols.length} zoo colliders + ${MARGIN}m margin overlap nothing (${blockers.length} colliders, footprints and reserved rects, ${(base.water ?? []).length} water zones)`);

  let footHits = 0;
  for (const b of blockers) {
    if (!overlaps(grow(foot, 0.3), b)) continue;
    footHits++;
    if (footHits <= 12) console.log(`       the zoo overlaps ${b.label} (${fmtRect(b)})`);
  }
  const wet = (base.water ?? []).filter((w) => rectDist(w.x, w.z, foot) < w.r + MARGIN);
  check(footHits === 0 && wet.length === 0, `the ${ZOO.w}m x ${ZOO.d}m zoo (with its ground slab) overlaps nothing and is ${MARGIN}m+ from water`);

  const nearest = blockers.map((b) => ({ b, d: rectGap(foot, b) })).sort((p, q) => p.d - q.d).slice(0, 4);
  for (const { b, d } of nearest) console.log(`       nearest: ${f2(d)}m to ${b.label}`);

  const B = base.bounds;
  check(foot.minX > B.minX + 10 && foot.maxX < B.maxX - 10 && foot.minZ > B.minZ + 10 && foot.maxZ < B.maxZ - 10, "the zoo is well inside the park wall");
  const gap = rectGap(foot, FARM);
  check(gap <= 15, `the zoo is beside the farm: ${f2(gap)}m from its keepClear rect (want <= 15m)`);
}

/* ------------------------------------------------------------ 2. spacing */

console.log("\nspacing (from the fence line)");
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
  pts.push([EMMETT_BASE.talkSpot[0], EMMETT_BASE.talkSpot[2], "Emmett's talk spot"]);
  pts.push([-9, 105.4, "Sloan's front door"]);

  const rows = pts.map(([x, z, name]) => ({ name, d: rectDist(x, z, foot) })).sort((a, b) => a.d - b.d);
  const close = rows.filter((r) => r.d < MIN_GAP);
  for (const r of close) console.log(`       ${f1(r.d)}m from ${r.name}`);
  check(close.length === 0, `${pts.length} spots all ${MIN_GAP}m+ away; nearest ${rows.slice(0, 3).map((r) => `${r.name} ${f1(r.d)}m`).join(", ")}`);

  // the paw trail is drawn on the ground and she follows it on foot: it must
  // pass outside the fence, segments included
  let worst = Infinity;
  let worstAt = "";
  const trail = PET_QUEST.pawTrail;
  for (let i = 0; i < trail.length; i++) {
    const [x1, z1] = trail[i]!;
    const [x2, z2] = trail[Math.min(i + 1, trail.length - 1)]!;
    for (let s = 0; s <= 1; s += 0.05) {
      const d = rectDist(x1 + (x2 - x1) * s, z1 + (z2 - z1) * s, foot);
      if (d < worst) {
        worst = d;
        worstAt = `(${f1(x1 + (x2 - x1) * s)}, ${f1(z1 + (z2 - z1) * s)})`;
      }
    }
  }
  check(worst >= 1.5, `the paw trail passes outside the zoo: closest ${f2(worst)}m at ${worstAt} (want 1.5m+)`);
}

/* ------------------------------------------------------------ grid search (as tools/emmett-base.ts) */

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

const inWater = (x: number, z: number) => (base.water ?? []).some((w) => Math.hypot(x - w.x, z - w.z) < w.r);

function standAt(x: number, z: number, fromY: number): number | null {
  const hw = PLAYER_W;
  const under = query(x - hw, x + hw, z - hw, z + hw);
  let floor = base.groundY;
  for (const b of under) if (b.maxY <= fromY + STEP_UP + 1e-6 && b.maxY > floor) floor = b.maxY;
  for (const b of under) {
    if (b.label === "trampoline") return null;
    if (b.maxY - floor > FLOOR_TOL && b.minY < floor + PLAYER_H) return null;
  }
  if (floor < 0.1 && inWater(x, z)) return null;
  return floor;
}
function tight(x: number, z: number, floor: number, pad: number) {
  const hw = PLAYER_W + pad;
  for (const b of query(x - hw, x + hw, z - hw, z + hw)) {
    if (b.label === "trampoline") return true;
    if (b.maxY - floor > STEP_UP + 0.01 && b.minY < floor + PLAYER_H) return true;
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

function search(sx: number, sz: number, sy = 0): Search {
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
  const f0 = standAt(cellX(six), cellZ(siz), sy + 0.05);
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
      const f = standAt(cellX(nx), cellZ(nz), y);
      if (f == null) continue;
      if (dx && dz && (standAt(cellX(nx), cellZ(iz), y) == null || standAt(cellX(ix), cellZ(nz), y) == null)) continue;
      const ns = slotOf(nz * W + nx, f);
      if (ns < 0) continue;
      const penalty = tight(cellX(nx), cellZ(nz), f, 0.35) ? 3 : tight(cellX(nx), cellZ(nz), f, 0.8) ? 0.6 : 0;
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
  for (let f = 0; f < 60 * 900; f++) {
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

/* ------------------------------------------------------------ 3. the walk round the zoo */

console.log("\nthe walk (from the spawn)");
const spawn = base.spawn;
const fromSpawn = search(spawn[0], spawn[2], spawn[1]);
check(fromSpawn.start >= 0, `spawn (${spawn.join(", ")}) is standable`);

const walkTo = (name: string, x: number, z: number) => {
  const standing = standAt(x, z, 0.05);
  check(standing != null && standing < 0.1, `${name} (${f2(x)}, ${f2(z)}): a capsule stands there on the zoo floor`);
  const sts = statesAt(fromSpawn, x, z).sort((a, b) => a[1] - b[1]);
  if (!sts.length) {
    check(false, `${name} is reachable from the spawn`);
    return;
  }
  const rt = route(fromSpawn, sts[0]![0]);
  const pts = rt.pts.map((q) => [q[0], q[1]] as [number, number]);
  pts.push([x, z]);
  const w = walk(pts, spawn[1]);
  check(w.ok && w.y < 0.2, `${name}: walked ${f1(w.metres)}m along a ${f1(rt.len)}m route and arrived${w.ok ? ` (${f2(Math.hypot(w.x - x, w.z - z))}m off, height ${f2(w.y)})` : `: ${w.why}`}`);
  if (showPaths) {
    const step = Math.max(1, Math.floor(rt.pts.length / 16));
    console.log(`       route: ${rt.pts.filter((_, i) => i % step === 0 || i === rt.pts.length - 1).map((q) => `(${q[0]}, ${q[1]})`).join(" ")}`);
  }
};

{
  const [gx, gz] = zooToWorld(0, -ZOO.d / 2 + 1.5);
  walkTo("the entrance", gx, gz);
  for (const e of ENCLOSURES) {
    const [x, z] = plaqueSpot(e);
    walkTo(`the ${e.name} plaque`, x, z);
  }

  // the loop: in at the arch, round the penguin island, back out
  const loop: [number, number][] = ([
    [0, -13.5], [0, -8], [-6, -7.5], [-6, -3], [-6, 1.5], [0, 1.7], [6, 1.7], [6, -3], [6, -7.5], [0, -8], [0, -13.5],
  ] as [number, number][]).map(([x, z]) => zooToWorld(x, z));
  const w = walk(loop, 0);
  check(w.ok, `she walks the whole loop round the penguin island and back out: ${w.ok ? `${f1(w.metres)}m` : w.why}`);
}

/* ------------------------------------------------------------ 4. the fences are solid */

console.log("\nthe fences");
{
  let inside = 0;
  let where = "";
  for (const e of ENCLOSURES) {
    for (let lx = e.rect.minX + 0.6; lx < e.rect.maxX - 0.5; lx += 0.5) {
      for (let lz = e.rect.minZ + 0.6; lz < e.rect.maxZ - 0.5; lz += 0.5) {
        const [x, z] = zooToWorld(lx, lz);
        if (statesAt(fromSpawn, x, z).length) {
          inside++;
          if (!where) where = `${e.name} at (${f1(x)}, ${f1(z)})`;
        }
      }
    }
  }
  check(inside === 0, `no spot inside any of the ${ENCLOSURES.length} enclosures is reachable on foot${inside ? `: ${inside} cells, e.g. ${where}` : ""}`);

  check(FENCE.h > STEP_UP, `a fence is ${f2(FENCE.h)}m: too tall to step onto (step-up ${STEP_UP}m)`);

  // nothing inside the zoo is a step she could climb toward a fence top
  const tops = zooCols.map((b) => b.maxY);
  check(Math.max(...tops.slice(0, FENCE_LINES.length)) <= FENCE.h + 1e-6, "every fence collider tops out at the fence height");
}

/* ------------------------------------------------------------ 5. invisible walls (tools/walk.ts, round the zoo) */

console.log("\ninvisible walls");
{
  const stalls: string[] = [];
  const seen = new Set<string>();
  const blocker = (c: Capsule, dx: number, dz: number) => {
    const nx = c.x + dx * 0.2;
    const nz = c.z + dz * 0.2;
    let best: (AABB & { label: string }) | null = null;
    for (const b of query(nx - 1, nx + 1, nz - 1, nz + 1)) {
      if (nx - c.hw >= b.maxX || nx + c.hw <= b.minX || nz - c.hd >= b.maxZ || nz + c.hd <= b.minZ) continue;
      if (b.maxY - c.y <= 0.03) continue;
      if (b.minY >= c.y + c.h) continue;
      if (!best || b.maxY > best.maxY) best = b;
    }
    return best;
  };
  const line = (x0: number, z0: number, dx: number, dz: number, metres: number) => {
    const c: Capsule = { x: x0, y: 0, z: z0, hw: PLAYER_W, h: PLAYER_H, hd: PLAYER_W };
    for (let i = 0; i < 4; i++) moveAndCollide(c, 0, -1, 0, query(c.x - 2, c.x + 2, c.z - 2, c.z + 2), DT, base.groundY);
    let vy = 0;
    const steps = Math.ceil(metres / (WALK * DT));
    for (let i = 0; i < steps; i++) {
      const px = c.x;
      const pz = c.z;
      const r = moveAndCollide(c, dx * WALK, vy, dz * WALK, query(c.x - 2, c.x + 2, c.z - 2, c.z + 2), DT, base.groundY);
      vy = r.vy - GRAVITY * DT;
      if (Math.hypot(c.x - px, c.z - pz) < WALK * DT * 0.3 && r.grounded) {
        const b = blocker(c, dx, dz);
        const top = b ? b.maxY : base.groundY;
        if (top - c.y <= STEP_UP) {
          const key = `${Math.round(c.x)},${Math.round(c.z)}`;
          if (!seen.has(key)) {
            seen.add(key);
            stalls.push(`(${f1(c.x)}, ${f1(c.z)}) walking ${dx > 0 ? "+x" : dx < 0 ? "-x" : ""}${dz > 0 ? "+z" : dz < 0 ? "-z" : ""}: stopped by ${b ? `${b.label} top ${f2(b.maxY)}` : "ground"}`);
          }
        }
        return;
      }
    }
  };
  const area = grow(foot, 6);
  for (let x = area.minX; x <= area.maxX; x += 0.5) {
    for (let z = area.minZ; z <= area.maxZ; z += 0.5) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) line(x, z, dx, dz, 1.5);
    }
  }
  for (const s of stalls.slice(0, 10)) console.log(`       ${s}`);
  check(stalls.length === 0, `no stall with a blocker inside the step-up across the zoo and 6m round it (${Math.round((area.maxX - area.minX) * (area.maxZ - area.minZ) * 4)} starts)`);
}

/* ------------------------------------------------------------ 6. jumping */

console.log("\njumping");
{
  const jh = jumpHeight();
  const reach = jumpReach(FENCE.h, WALK * BOOST_MULTIPLIER);
  console.log(`       jump height ${f2(jh)}m vs a ${f2(FENCE.h)}m fence; a boosted running jump reaches a ${f2(FENCE.h)}m top from ${f2(reach)}m away`);
  const need = grow(foot, reach);
  const covers = (z: Rect) => z.minX <= need.minX && z.maxX >= need.maxX && z.minZ <= need.minZ && z.maxZ >= need.maxZ;
  if (jh > FENCE.h) {
    check(covers(ZOO_NO_JUMP), `ZOO_NO_JUMP (${fmtRect(ZOO_NO_JUMP)}) covers the fence line plus the jump's reach (${fmtRect(need)})`);
    const zone = (base.noJump ?? []).find(covers);
    check(
      !!zone || !wiredIn,
      zone ? `the level's no-jump zone "${zone.why}" covers the zoo` : "the level has no no-jump zone over the zoo yet (add ZOO_NO_JUMP to noJump in levels.ts)",
    );
  }
  // nothing solid inside the zoo is a launch pad toward a fence: the only
  // things she can stand on in there are the floor slabs
  const highInside = zooCols
    .concat(propCols.map((b) => ({ ...b, label: b.label })))
    .filter((b) => b.maxY > 0.12 && b.maxY < FENCE.h && b.minX >= foot.minX && b.maxX <= foot.maxX && b.minZ >= foot.minZ && b.maxZ <= foot.maxZ);
  check(highInside.length === 0, `nothing inside the zoo stands between the floor and the fence tops${highInside.length ? `: ${highInside.map((b) => b.label).join(", ")}` : ""}`);
}

/* ------------------------------------------------------------ 7. the art */

console.log("\nthe art");
const rig = makeZoo(false);
rig.group.updateMatrixWorld(true);
{
  // every fence collider is inside the fence drawn for that run
  const drawn = new Map<number, THREE.Box3>();
  rig.site.traverse((o) => {
    const i = o.userData.fenceLine;
    if (typeof i !== "number") return;
    drawn.set(i, new THREE.Box3().setFromObject(o));
  });
  let bare = 0;
  let spill = 0;
  for (let i = 0; i < FENCE_LINES.length; i++) {
    const b = zooCols[i]!;
    const d = drawn.get(i);
    if (!d) {
      bare++;
      continue;
    }
    if (d.min.x > b.minX + 0.02 || d.max.x < b.maxX - 0.02 || d.min.z > b.minZ + 0.02 || d.max.z < b.maxZ - 0.02 || d.max.y < b.maxY - 0.02) bare++;
    spill = Math.max(spill, b.minX - d.min.x, d.max.x - b.maxX, b.minZ - d.min.z, d.max.z - b.maxZ);
  }
  check(bare === 0, `each of the ${FENCE_LINES.length} fence colliders is inside the fence drawn for it`);
  check(spill <= 0.15, `the drawn fences spill at most ${f2(spill)}m past their colliders (want <= 0.15, so nothing invisible and nothing hanging)`);

  // the arch is drawn over its posts and clears her head
  const arch = rig.site.getObjectByName("zoo arch");
  check(!!arch, "the entrance arch is built");
  if (arch) {
    const bb = new THREE.Box3().setFromObject(arch);
    check(bb.max.y > 3.5, `the arch stands ${f2(bb.max.y)}m tall`);
  }
  for (const e of ENCLOSURES) check(!!rig.site.getObjectByName(`plaque ${e.id}`), `the ${e.name} plaque is built`);
}

{
  // animals: on the ground, inside their own enclosure, through idle and happy
  const boxesOf = new THREE.Box3();
  const worst = new Map<string, { low: number; out: number; where: string }>();
  for (const a of rig.animals) a.happyT = 0;
  for (let f = 0; f < 1200; f++) {
    const t = f * DT;
    if (f === 400) for (const a of rig.animals) a.happyT = 2.6;
    animateZoo(rig, t, DT);
    rig.group.updateMatrixWorld(true);
    for (const a of rig.animals) {
      const e = ENCLOSURES.find((x) => x.id === a.id)!;
      boxesOf.setFromObject(a.group);
      const lowY = boxesOf.min.y;
      // the enclosure's rect in the world (the zoo is turned a half turn)
      const [ax, az] = zooToWorld(e.rect.minX, e.rect.minZ);
      const [bx, bz] = zooToWorld(e.rect.maxX, e.rect.maxZ);
      const out = Math.max(
        Math.min(ax, bx) - boxesOf.min.x,
        boxesOf.max.x - Math.max(ax, bx),
        Math.min(az, bz) - boxesOf.min.z,
        boxesOf.max.z - Math.max(az, bz),
      );
      const cur = worst.get(`${a.id}${a.seed}`) ?? { low: 0, out: -99, where: "" };
      if (lowY < cur.low) cur.low = lowY;
      if (out > cur.out) {
        cur.out = out;
        cur.where = `frame ${f}`;
      }
      worst.set(`${a.id}${a.seed}`, cur);
    }
  }
  let sunk = 0;
  let escaped = 0;
  for (const [k, v] of worst) {
    if (v.low < -0.06) {
      sunk++;
      console.log(`       ${k} sinks to ${f2(v.low)}`);
    }
    // the giraffe's head and the monkeys' bar are above the fence; only a
    // low part crossing the fence line matters
    if (v.out > 0.05) {
      escaped++;
      console.log(`       ${k} reaches ${f2(v.out)}m past its fence (${v.where})`);
    }
  }
  check(sunk === 0, "no animal sinks into the ground over 1200 frames of idle and happy animation");
  check(escaped === 0, "no animal reaches past its own fence line");
  for (const a of rig.animals) a.happyT = 0;
}

/* ------------------------------------------------------------ 8. the plaques (the runtime's handle) */

console.log("\nthe plaques");
{
  const said: string[] = [];
  const zw = new ZooWorld(new THREE.Scene(), (text) => said.push(text));
  let t = 0;
  const stand = (x: number, z: number, seconds: number) => {
    for (let i = 0; i < seconds * 60; i++) {
      t += DT;
      zw.update(t, x, z);
    }
  };
  // outside: nothing to say
  stand(0, 0, 1);
  check(said.length === 0 && zw.near() == null, "nothing happens out in the park");

  // in through the arch, then onto each plaque's ring in turn
  const [ox, oz] = zooToWorld(0, -ZOO.d / 2 - 6);
  const [ax, az] = zooToWorld(0, -ZOO.d / 2 + 1.2);
  stand(ox, oz, 0.5);
  stand(ax, az, 0.5);
  check(said.length === 1 && said[0]!.startsWith("Welcome"), `walking in under the arch says hello: "${said[0] ?? ""}"`);

  for (const e of ENCLOSURES) {
    const [x, z] = plaqueSpot(e);
    const before = said.length;
    stand(x, z, 1);
    const spoke = said.slice(before);
    const happy = zw.rig.animals.filter((a) => a.id === e.id && a.happyT > 0).length;
    check(
      spoke.length === 1 && spoke[0]!.startsWith(e.name) && happy > 0,
      `standing at the ${e.name} plaque says one fact and cheers ${happy} ${e.id}${happy === 1 ? "" : "s"}: "${spoke[0] ?? "(nothing)"}"`,
    );
    check(zw.near() === e.id, `near() is "${e.id}" on its ring`);
    // Collect says another fact, and each visit works round the list
    const n = said.length;
    check(zw.interact(), `Collect at the ${e.name} plaque does something`);
    check(said.length === n + 1 && said[n] !== spoke[0], `Collect says the next fact: "${said[n] ?? ""}"`);
    // the middle of the penguin island: 4m+ from every ring
    stand(...zooToWorld(0, -2.5), 0.5);
    check(zw.near() == null, `stepping away from the ${e.name} plaque clears near()`);
  }
  const facts = new Set(said.slice(1));
  check(facts.size === said.length - 1, `every fact said was different (${facts.size} of ${ENCLOSURES.length * 2})`);

  // the escape hatch, if she ever ends up inside an enclosure
  const [ex, ez] = zooToWorld(ENCLOSURES[0]!.rect.minX + 1, ENCLOSURES[0]!.rect.minZ + 1);
  const out = zw.escapeFrom(ex, ez);
  check(!!out && !!ENCLOSURES.find((e) => Math.hypot(plaqueSpot(e)[0] - out[0], plaqueSpot(e)[1] - out[1]) < 0.01), "escapeFrom inside an enclosure puts her back on the walk");
  check(zw.escapeFrom(ax, az) == null && zw.escapeFrom(0, 0) == null, "escapeFrom on the walk and out in the park is null");
  console.log(`       the arch is at (${f1(ax)}, ${f1(zooToWorld(0, -ZOO.d / 2)[1])}), facing +z: the path should meet it there`);
  zw.dispose();
}

/* ------------------------------------------------------------ 9. cost */

console.log("\ncost");
{
  const tris = (root: THREE.Object3D) => {
    let n = 0;
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const g = m.geometry;
      n += (g.index ? g.index.count : g.attributes.position!.count) / 3;
    });
    return n;
  };
  const total = tris(rig.group);
  const animals = rig.animals.reduce((n, a) => n + tris(a.group), 0);
  let meshes = 0;
  rig.group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes++;
  });
  console.log(`       ${Math.round(total)} triangles (${Math.round(animals)} in the ${rig.animals.length} animals), ${meshes} meshes before the merge`);
  const merged = makeZoo(true);
  let mergedMeshes = 0;
  merged.group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) mergedMeshes++;
  });
  let live = 0;
  for (const a of merged.animals) a.group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) live++;
  });
  live += merged.rings.length;
  console.log(`       ${mergedMeshes} meshes after the merge: ${mergedMeshes - live} static, ${live} live (the animals and the plaque rings), ${Math.round(tris(merged.group))} triangles`);
  check(total <= 25000, `the zoo is ${Math.round(total)} triangles (budget 25000)`);
  check(mergedMeshes - live <= 45, `the static half of the zoo is ${mergedMeshes - live} draw calls`);
  check(mergedMeshes <= 180, `the whole zoo is ${mergedMeshes} draw calls, and only when it is on screen`);
}

/* ------------------------------------------------------------ 10. allocation */

{
  const { PerformanceObserver, constants } = await import("node:perf_hooks");
  const frames = (n: number, from: number) => {
    for (let i = 0; i < n; i++) {
      if (i % 3000 === 0) for (const a of rig.animals) a.happyT = 2.6;
      animateZoo(rig, from + i * DT, DT);
    }
  };
  frames(40000, 0); // warm up the JIT
  await new Promise((r) => setTimeout(r, 20));
  let gcs = 0;
  const obs = new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if ((e as { detail?: { kind?: number } }).detail?.kind === constants.NODE_PERFORMANCE_GC_MINOR) gcs++;
  });
  obs.observe({ entryTypes: ["gc"] });
  frames(400000, 1000);
  await new Promise((r) => setTimeout(r, 50));
  obs.disconnect();
  check(gcs <= 1, `animateZoo allocates nothing: ${gcs} minor GCs over 400k frames (rerun if the machine is busy)`);
}

console.log(`\nfor levels.ts: ...zooProps() in props, keepClear rectAt(${ZOO.x}, ${ZOO.z}, ${ZOO.w + 6}, ${ZOO.d + 6}), noJump ZOO_NO_JUMP, emmettKeepOut ${fmtRect(zooFootprint(1))}`);
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
