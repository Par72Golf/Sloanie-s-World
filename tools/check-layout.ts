/**
 * Offline layout checker.
 *
 * Rebuilds the same colliders world-build.ts creates, then reports:
 *   - overlapping solid props (the thing that broke the park)
 *   - dumplings buried inside a collider
 *   - spawn point blocked
 *   - paths between zones that are walled off
 *
 * Run: npx jiti tools/check-layout.ts
 */
import { LEVELS } from "../src/game/levels";
import { isSolidProp } from "../src/game/world-build";
import { collidersFor as engineColliders } from "../src/game/colliders";
import type { LevelDef, Prop } from "../src/game/types";

type Box = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  label: string;
  index: number;
};

function aabb(
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  label: string,
  index: number,
): Box {
  return {
    minX: x - w / 2,
    maxX: x + w / 2,
    minY: y - h / 2,
    maxY: y + h / 2,
    minZ: z - d / 2,
    maxZ: z + d / 2,
    label,
    index,
  };
}

function collidersFor(level: LevelDef, visualsToo = false): Box[] {
  const out: Box[] = [];
  level.props.forEach((p: Prop, i: number) => {
    if (p.kind === "box") {
      if (p.size[0] < 0.15 && p.size[1] < 0.15) return;
      if (!visualsToo && !isSolidProp(p.color)) return;
      // The engine does NOT rotate colliders: addBox pushes an axis-aligned
      // box at the unrotated dimensions. Model that exactly, or the checker
      // reports walls the game does not have and misses ones it does.
      const w = p.size[0];
      const d = p.size[2];
      out.push(aabb(p.pos[0], p.pos[1], p.pos[2], w, p.size[1], d, `box ${p.color}`, i));
    } else if (p.kind === "cyl") {
      if (!visualsToo && !isSolidProp(p.color)) return;
      out.push(aabb(p.pos[0], p.pos[1], p.pos[2], p.r * 1.6, p.h, p.r * 1.6, `cyl ${p.color}`, i));
    } else if (p.kind === "tree") {
      const s = p.scale ?? 1;
      out.push(aabb(p.x, 1.1 * s, p.z, 0.9 * s, 2.2 * s, 0.9 * s, "tree", i));
    } else if (p.kind === "house") {
      const w = p.w ?? 6;
      const d = p.d ?? 5;
      const rotated = p.ry != null && Math.abs(Math.abs(p.ry) - Math.PI / 2) < 0.2;
      out.push(aabb(p.x, 2.1, p.z, rotated ? d : w, 4.2, rotated ? w : d, "house", i));
    } else if (p.kind === "lollipop") {
      out.push(aabb(p.x, 1.2, p.z, 0.6, 2.4, 0.6, "lollipop", i));
    }
  });
  return out;
}

/** Colliders the world builder adds for mesh props (gazebo, slide, fountain, treehouse). */
const MESH_COLLIDERS: [string, number, number, number, number, number, number][] = [
  ["slide", 22, 1.3, 8, 2.2, 2.6, 2.2],
  ["fountain", 0, 0.4, -42, 6.6, 0.8, 6.6],
  ["treehouse trunk", 54.2, 1.8, -53, 1.4, 3.6, 1.4],
  ["treehouse deck", 54.2, 3.55, -53, 5.2, 0.16, 5.2],
];

function overlap(a: Box, b: Box, tol = 0.02) {
  const ox = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const oy = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  const oz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
  if (ox <= tol || oy <= tol || oz <= tol) return null;
  return { ox, oy, oz, volume: ox * oy * oz };
}

/** Broad-phase grid so we are not doing 4000^2 comparisons. */
function findOverlaps(boxes: Box[], minVolume = 0.6) {
  const cell = 8;
  const grid = new Map<string, number[]>();
  const key = (cx: number, cz: number) => `${cx}:${cz}`;

  boxes.forEach((b, i) => {
    for (let cx = Math.floor(b.minX / cell); cx <= Math.floor(b.maxX / cell); cx++) {
      for (let cz = Math.floor(b.minZ / cell); cz <= Math.floor(b.maxZ / cell); cz++) {
        const k = key(cx, cz);
        const list = grid.get(k);
        if (list) list.push(i);
        else grid.set(k, [i]);
      }
    }
  });

  const seen = new Set<string>();
  const hits: { a: Box; b: Box; volume: number }[] = [];
  for (const list of grid.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const ai = list[i]!;
        const bi = list[j]!;
        const pk = ai < bi ? `${ai},${bi}` : `${bi},${ai}`;
        if (seen.has(pk)) continue;
        seen.add(pk);
        const o = overlap(boxes[ai]!, boxes[bi]!);
        if (o && o.volume >= minVolume) {
          hits.push({ a: boxes[ai]!, b: boxes[bi]!, volume: o.volume });
        }
      }
    }
  }
  return hits.sort((x, y) => y.volume - x.volume);
}

/** Flood fill on a walkable grid to prove every dumpling is reachable. */
function reachability(level: LevelDef, boxes: Box[], start: [number, number]) {
  const step = 0.4;
  const b = level.bounds;
  const w = Math.ceil((b.maxX - b.minX) / step);
  const h = Math.ceil((b.maxZ - b.minZ) / step);
  const blocked = new Uint8Array(w * h);
  const pad = 0.42;

  for (const box of boxes) {
    // anything she can step over does not block
    if (box.maxY < 0.75) continue;
    // nor does anything she can walk under, like a cave roof or a dugout lid
    if (box.minY > 1.75) continue;
    const x0 = Math.max(0, Math.floor((box.minX - pad - b.minX) / step));
    const x1 = Math.min(w - 1, Math.ceil((box.maxX + pad - b.minX) / step));
    const z0 = Math.max(0, Math.floor((box.minZ - pad - b.minZ) / step));
    const z1 = Math.min(h - 1, Math.ceil((box.maxZ + pad - b.minZ) / step));
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) blocked[iz * w + ix] = 1;
    }
  }

  const idx = (x: number, z: number) => {
    const ix = Math.floor((x - b.minX) / step);
    const iz = Math.floor((z - b.minZ) / step);
    if (ix < 0 || iz < 0 || ix >= w || iz >= h) return -1;
    return iz * w + ix;
  };

  const seen = new Uint8Array(w * h);
  const q: number[] = [];
  const s = idx(start[0], start[1]);
  if (s < 0 || blocked[s]) return { seen, w, h, step, blocked, startBlocked: true };
  seen[s] = 1;
  q.push(s);
  while (q.length) {
    const cur = q.pop()!;
    const cx = cur % w;
    const cz = (cur / w) | 0;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as [number, number][]) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
      const n = nz * w + nx;
      if (seen[n] || blocked[n]) continue;
      seen[n] = 1;
      q.push(n);
    }
  }
  return { seen, w, h, step, blocked, startBlocked: false, idx };
}

const LAYOUT = Number(process.env.LAYOUT ?? "0");
const base = LEVELS[0]!;
const level: LevelDef = {
  ...base,
  dumplings: base.dumplings.map((d) => {
    const alt = LAYOUT > 0 ? d.alts?.[LAYOUT - 1] : undefined;
    return alt ? { ...d, pos: alt.pos, region: alt.region, hint: alt.hint } : d;
  }),
};
console.log(`LAYOUT ${LAYOUT}`);
// The solid list is the engine's own (colliders.ts), so this checker can no
// longer drift from what the game builds. The visuals list is still local:
// it deliberately includes non-solid props for the intersection check.
const boxes: Box[] = engineColliders(level);
const visuals = collidersFor(level, true);

/** Flat surfaces whose top faces sit within 1cm of each other will z-fight. */
function zFights(level: LevelDef) {
  type Surf = { x: number; z: number; w: number; d: number; top: number; i: number; label: string };
  const surfs: Surf[] = [];
  level.props.forEach((p, i) => {
    if (p.kind === "box" && p.size[1] <= 0.3) {
      const rot = (p.ry ?? 0) !== 0;
      const w = rot ? Math.max(p.size[0], p.size[2]) : p.size[0];
      const d = rot ? Math.max(p.size[0], p.size[2]) : p.size[2];
      surfs.push({ x: p.pos[0], z: p.pos[2], w, d, top: p.pos[1] + p.size[1] / 2, i, label: `box ${p.color}` });
    } else if (p.kind === "cyl" && p.h <= 0.3) {
      surfs.push({ x: p.pos[0], z: p.pos[2], w: p.r * 2, d: p.r * 2, top: p.pos[1] + p.h / 2, i, label: `cyl ${p.color}` });
    }
  });
  const out: string[] = [];
  for (let a = 0; a < surfs.length; a++) {
    for (let b = a + 1; b < surfs.length; b++) {
      const A = surfs[a]!;
      const B = surfs[b]!;
      if (Math.abs(A.top - B.top) > 0.012) continue;
      const ox = Math.min(A.x + A.w / 2, B.x + B.w / 2) - Math.max(A.x - A.w / 2, B.x - B.w / 2);
      const oz = Math.min(A.z + A.d / 2, B.z + B.d / 2) - Math.max(A.z - A.d / 2, B.z - B.d / 2);
      if (ox > 0.3 && oz > 0.3) {
        out.push(
          `  top ${A.top.toFixed(3)}  [${A.i}] ${A.label} @ (${A.x.toFixed(1)}, ${A.z.toFixed(1)}) ` +
            `overlaps [${B.i}] ${B.label} @ (${B.x.toFixed(1)}, ${B.z.toFixed(1)})  by ${ox.toFixed(1)}x${oz.toFixed(1)}m`,
        );
      }
    }
  }
  return out;
}

console.log(`level: ${level.name}`);
console.log(`props: ${level.props.length}   solid colliders: ${boxes.length}`);
console.log(
  `bounds: x ${level.bounds.minX}..${level.bounds.maxX}  z ${level.bounds.minZ}..${level.bounds.maxZ}`,
);

const hits = findOverlaps(boxes);
console.log(`\n--- overlapping solids (volume >= 0.6): ${hits.length} ---`);
for (const hit of hits.slice(0, 40)) {
  const a = hit.a;
  const bb = hit.b;
  console.log(
    `  ${hit.volume.toFixed(1)}m3  [${a.index}] ${a.label} @ ` +
      `(${((a.minX + a.maxX) / 2).toFixed(1)}, ${((a.minZ + a.maxZ) / 2).toFixed(1)})` +
      `  vs  [${bb.index}] ${bb.label} @ ` +
      `(${((bb.minX + bb.maxX) / 2).toFixed(1)}, ${((bb.minZ + bb.maxZ) / 2).toFixed(1)})`,
  );
}
if (hits.length > 40) console.log(`  ... and ${hits.length - 40} more`);

// Stacked flat surfaces (apron under court under lines) intersect on purpose.
// Only report pairs where at least one side is a real 3D object.
const thin = (b: Box) => b.maxY - b.minY <= 0.35;

// Structures whose parts are meant to interpenetrate: the boundary wall and its
// piers and capstones, the stacked slabs of the lookout hill, and pond water
// layered over its own bed.
const INTENTIONAL = [
  ["#b3a894", "#9b8f7c"], // wall runs, caps, piers
  ["#7aaa62", "#6e9e58", "#649454", "#8aba6a"], // lookout hill
  ["#5aa8c8", "#6cb8d4", "#9fd4ea"], // water layers
  ["#6fa85e", "#68a058", "#5f9852", "#58904c"], // berm slabs
];
const sameStructure = (a: Box, b: Box) =>
  INTENTIONAL.some((set) => set.some((c) => a.label.includes(c)) && set.some((c) => b.label.includes(c)));

const vis = findOverlaps(visuals, 1.2).filter(
  (h) => !(thin(h.a) && thin(h.b)) && !sameStructure(h.a, h.b),
);
console.log(`\n--- visual intersections incl. non-colliding props: ${vis.length} ---`);
for (const hit of vis.slice(0, 25)) {
  console.log(
    `  ${hit.volume.toFixed(1)}m3  [${hit.a.index}] ${hit.a.label} @ ` +
      `(${((hit.a.minX + hit.a.maxX) / 2).toFixed(1)}, ${((hit.a.minZ + hit.a.maxZ) / 2).toFixed(1)})` +
      `  vs  [${hit.b.index}] ${hit.b.label} @ ` +
      `(${((hit.b.minX + hit.b.maxX) / 2).toFixed(1)}, ${((hit.b.minZ + hit.b.maxZ) / 2).toFixed(1)})`,
  );
}

const zf = zFights(level);
console.log(`\n--- coplanar flat surfaces (z-fighting): ${zf.length} ---`);
for (const line of zf.slice(0, 25)) console.log(line);

console.log(`\n--- dumplings inside solids ---`);
let buried = 0;
for (const d of level.dumplings) {
  for (const box of boxes) {
    const inside =
      d.pos[0] > box.minX - 0.3 &&
      d.pos[0] < box.maxX + 0.3 &&
      d.pos[2] > box.minZ - 0.3 &&
      d.pos[2] < box.maxZ + 0.3 &&
      d.pos[1] > box.minY &&
      d.pos[1] < box.maxY;
    if (inside) {
      buried++;
      console.log(
        `  ${d.id} @ (${d.pos[0]}, ${d.pos[1]}, ${d.pos[2]}) inside [${box.index}] ${box.label}`,
      );
      break;
    }
  }
}
if (!buried) console.log("  none");

console.log(`\n--- dumpling support (what each one is resting on) ---`);
for (const d of level.dumplings) {
  let bestTop = 0;
  let what = "ground";
  for (const b of boxes) {
    if (d.pos[0] < b.minX - 0.25 || d.pos[0] > b.maxX + 0.25) continue;
    if (d.pos[2] < b.minZ - 0.25 || d.pos[2] > b.maxZ + 0.25) continue;
    if (b.maxY > d.pos[1] + 0.05) continue;
    if (b.maxY > bestTop) {
      bestTop = b.maxY;
      what = `[${b.index}] ${b.label}`;
    }
  }
  const gap = d.pos[1] - bestTop;
  const flag = gap > 0.75 ? "FLOATING" : gap < -0.05 ? "SUNK" : "ok      ";
  console.log(
    `  ${flag} ${d.id.padEnd(7)} y=${d.pos[1].toFixed(2)} rests on ${what} (top ${bestTop.toFixed(2)}, gap ${gap.toFixed(2)})`,
  );
}

const spawn = level.spawn ?? [0, 0, 0];
const reach = reachability(level, boxes, [spawn[0], spawn[2]]);
console.log(`\n--- reachability from spawn (${spawn[0]}, ${spawn[2]}) ---`);
if (reach.startBlocked) {
  console.log("  SPAWN IS INSIDE A SOLID");
} else {
  let unreachable = 0;
  for (const d of level.dumplings) {
    const i = reach.idx!(d.pos[0], d.pos[2]);
    if (i < 0 || !reach.seen[i]) {
      unreachable++;
      console.log(`  UNREACHABLE: ${d.id} @ (${d.pos[0]}, ${d.pos[2]})`);
      let best = Infinity;
      let bx = 0;
      let bz = 0;
      for (let ix = 0; ix < reach.w; ix++) {
        for (let iz = 0; iz < reach.h; iz++) {
          if (!reach.seen[iz * reach.w + ix]) continue;
          const x = level.bounds.minX + ix * reach.step;
          const z = level.bounds.minZ + iz * reach.step;
          const dd = Math.hypot(x - d.pos[0], z - d.pos[2]);
          if (dd < best) {
            best = dd;
            bx = x;
            bz = z;
          }
        }
      }
      console.log(`        nearest walkable ${best.toFixed(1)}m away at (${bx.toFixed(1)}, ${bz.toFixed(1)})`);
    }
  }
  if (!unreachable) console.log("  all dumplings reachable");

  if (level.ride) {
    const px = level.ride.x;
    const pz = level.ride.z + 6.2; // just past the step, where she walks up
    const i = reach.idx!(px, pz);
    const ok = i >= 0 && reach.seen[i] === 1;
    console.log(`  ${ok ? "ok         " : "BLOCKED    "} ferris wheel boarding @ (${px}, ${pz})`);
  }

  // accessory pickups are walked into, so every one must be on reachable ground
  for (const a of level.accessories ?? []) {
    const i = reach.idx!(a.pos[0], a.pos[2]);
    const ok = i >= 0 && reach.seen[i] === 1;
    const under = boxes.filter(
      (b) =>
        a.pos[0] > b.minX &&
        a.pos[0] < b.maxX &&
        a.pos[2] > b.minZ &&
        a.pos[2] < b.maxZ &&
        b.maxY > 0.62 &&
        b.minY < 1.6, // something overhead (an arch) is not in the way
    );
    console.log(
      `  ${ok && !under.length ? "ok         " : "BLOCKED    "} accessory ${a.id} @ (${a.pos[0]}, ${a.pos[2]}) ${a.region}${under.length ? ` (inside ${under[0]!.label})` : ""}`,
    );
  }

  // report which named zones can be walked to
  const zones: [string, number, number][] = [
    ["north gate", 0, 76],
    ["south gate", 0, -76],
    ["east gate", 76, 0],
    ["west gate", -76, 0],
    ["houses street", 0, 103.5],
    ["baseball home plate", 0, -96],
    ["baseball mound", 0, -87],
    ["tennis court A", 88.75, 20],
    ["tennis court B", 101.25, 20],
    ["basketball", 95, -34],
    ["picnic lawn", 93, 72],
    ["splash pad", -95, 22],
    ["playground swings", -106, -33],
    ["playground sandbox", -82, -23],
    ["ring road NE", 103, 103],
    ["ring road SW", -103, -103],
    ["woods trail start", -112, 0],
    ["woods clearing", -140, 12],
    ["campground fire", 128, 124],
    ["campground hammock", 138, 130],
    ["pavilion", 132, 60],
    ["splash pad slide", -85, 18],
  ];
  // containment: the flood fill must not escape past the boundary wall
  let escaped = 0;
  for (let ix = 0; ix < reach.w; ix++) {
    for (let iz = 0; iz < reach.h; iz++) {
      if (!reach.seen[iz * reach.w + ix]) continue;
      const x = level.bounds.minX + ix * reach.step;
      const z = level.bounds.minZ + iz * reach.step;
      // the wall stands 2.5m inside the bounds; anything past it has leaked
      if (x < level.bounds.minX + 2 || x > level.bounds.maxX - 2 || z < level.bounds.minZ + 2 || z > level.bounds.maxZ - 2) escaped++;
    }
  }
  console.log(
    escaped ? `  BOUNDARY LEAK: ${escaped} walkable cells outside the wall` : "  boundary holds",
  );

  for (const [name, zx, zz] of zones) {
    const i = reach.idx!(zx, zz);
    const ok = i >= 0 && reach.seen[i] === 1;
    console.log(`  ${ok ? "reachable  " : "BLOCKED    "} ${name} @ (${zx}, ${zz})`);
    if (!ok) {
      // what is sitting on this point, and where is the nearest open ground?
      const on = boxes.filter(
        (b) =>
          b.maxY >= 0.75 &&
          zx > b.minX - 0.6 &&
          zx < b.maxX + 0.6 &&
          zz > b.minZ - 0.6 &&
          zz < b.maxZ + 0.6,
      );
      for (const b of on.slice(0, 4)) {
        console.log(
          `        sits inside [${b.index}] ${b.label} ` +
            `x ${b.minX.toFixed(1)}..${b.maxX.toFixed(1)}  z ${b.minZ.toFixed(1)}..${b.maxZ.toFixed(1)}`,
        );
      }
      let best = Infinity;
      let bx = 0;
      let bz = 0;
      for (let ix = 0; ix < reach.w; ix++) {
        for (let iz = 0; iz < reach.h; iz++) {
          if (!reach.seen[iz * reach.w + ix]) continue;
          const x = level.bounds.minX + ix * reach.step;
          const z = level.bounds.minZ + iz * reach.step;
          const dd = Math.hypot(x - zx, z - zz);
          if (dd < best) {
            best = dd;
            bx = x;
            bz = z;
          }
        }
      }
      console.log(`        nearest open ground ${best.toFixed(1)}m away at (${bx.toFixed(1)}, ${bz.toFixed(1)})`);
    }
  }
}

console.log(`\n--- juice box spots ---`);
for (const [x, z] of level.juice ?? []) {
  const inside = boxes.find(
    (b) => x > b.minX - 0.5 && x < b.maxX + 0.5 && z > b.minZ - 0.5 && z < b.maxZ + 0.5 && b.maxY > 0.4,
  );
  console.log(
    inside ? `  BLOCKED (${x}, ${z}) inside [${inside.index}] ${inside.label}` : `  ok      (${x}, ${z})`,
  );
}
