import * as THREE from "three";
import { lam } from "./meshes";

/**
 * The chocolate river, as one continuous ribbon.
 *
 * It started as a chain of straight slabs, which is how every other flat
 * surface in this game is built — and it looked like it: the runs met at
 * visible notches, and two slabs at the same height flicker where they overlap,
 * so the bends could not simply be lapped over each other.
 *
 * A river is the one thing in the park that is genuinely a curve, so it gets
 * its own geometry: a spline through the control points, sampled every couple
 * of metres, with the banks and the cream froth built as ribbons beside it. One
 * mesh each, no seams, no overlaps to fight.
 *
 * Chocolate reads as chocolate because it is glossy and dark, not because it is
 * brown: the surface is nearly smooth so it catches the sky, and the swirls
 * dragged along it are what say "liquid" from a distance.
 */

export type RiverPoint = { x: number; z: number; w: number };

/** Sample a Catmull-Rom spline through the control points. */
export function riverPath(points: [number, number][], widths: number[], step = 2.5): RiverPoint[] {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    "catmullrom",
    0.5,
  );
  const total = curve.getLength();
  const n = Math.max(2, Math.round(total / step));
  const out: RiverPoint[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = curve.getPointAt(t);
    // the width follows the control points it lies between, so the narrowing
    // through the factory arrives gradually rather than as a step
    const at = t * (points.length - 1);
    const a = Math.min(points.length - 1, Math.floor(at));
    const b = Math.min(points.length - 1, a + 1);
    const f = at - a;
    out.push({ x: p.x, z: p.z, w: widths[a]! * (1 - f) + widths[b]! * f });
  }
  return out;
}

/** A flat ribbon down the middle of the path, `inset` from the centre outward. */
function ribbon(path: RiverPoint[], y: number, half: (p: RiverPoint) => number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let run = 0;
  for (let i = 0; i < path.length; i++) {
    const p = path[i]!;
    const prev = path[Math.max(0, i - 1)]!;
    const next = path[Math.min(path.length - 1, i + 1)]!;
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    // the perpendicular, so the ribbon widens square to the direction of flow
    const nx = -dz / len;
    const nz = dx / len;
    const h = half(p);
    pos.push(p.x + nx * h, y, p.z + nz * h, p.x - nx * h, y, p.z - nz * h);
    if (i > 0) run += Math.hypot(p.x - prev.x, p.z - prev.z);
    uv.push(0, run / 8, 1, run / 8);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function edgeStrip(path: RiverPoint[], y: number, side: 1 | -1, from: (p: RiverPoint) => number, width: number) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < path.length; i++) {
    const p = path[i]!;
    const prev = path[Math.max(0, i - 1)]!;
    const next = path[Math.min(path.length - 1, i + 1)]!;
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * side;
    const nz = (dx / len) * side;
    const inner = from(p);
    pos.push(p.x + nx * inner, y, p.z + nz * inner, p.x + nx * (inner + width), y, p.z + nz * (inner + width));
    uv.push(0, i / 4, 1, i / 4);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/**
 * A winding path as one mesh.
 *
 * Trails made of straight slabs have the same trouble the river had: the runs
 * lap over each other at every bend, and two flat surfaces at one height
 * flicker. A ribbon through a spline has no seams to fight.
 */
export function makeRibbonPath(points: [number, number][], width: number, color: string, y = 0.08): THREE.Group {
  const g = new THREE.Group();
  const path = riverPath(points, points.map(() => width), 2);
  const mesh = new THREE.Mesh(ribbon(path, y, (p) => p.w / 2), lam(color, { roughness: 0.8 }));
  mesh.receiveShadow = true;
  g.add(mesh);
  return g;
}

/* ------------------------------------------------------- the factory's flow */

/**
 * Chocolate, and the vanilla the river runs as while the factory is stopped.
 *
 * The quest turns the river from one to the other, and it has to be visible
 * from anywhere in the park, so the chocolate is not one mesh: it is a chain
 * of them, and the flood is those meshes changing colour in turn outward from
 * the factory. Segment edges show as a hard line, which is exactly what the
 * front of a flood looks like.
 */
const FLOW = {
  choc: { color: "#4a2a16", roughness: 0.08 },
  /*
   * White chocolate, not sand. The first try was a matte cream and it read as
   * a wide path: the park's sugar paths are #e9d7b6 and the river's own bank
   * is the same, so a matte pale band beside them is just more path. What
   * makes it liquid is the gloss, so the stopped river keeps the chocolate's
   * roughness and only loses its colour.
   */
  vanilla: { color: "#f7efe2", roughness: 0.14 },
  froth: { color: "#c98a4a", vanilla: "#f6f1e8", roughness: 0.4 },
  swirl: { color: "#8a5a34", vanilla: "#e6dcc9", roughness: 0.25 },
};

/** How many pieces the chocolate is cut into. Each one is a draw call. */
const SEGMENTS = 10;

type FlowPart = { mat: THREE.MeshStandardMaterial; from: THREE.Color; to: THREE.Color; r0: number; r1: number };
export type RiverFlow = {
  /** the chocolate, ordered outward from the factory */
  segs: FlowPart[];
  /** froth, swirls and the lake, which all turn together with the last segment */
  rest: FlowPart[];
};

function ownMaterial(color: string, roughness: number) {
  // its own instance, never the shared cache: tinting a cached material would
  // repaint every other brown thing in the park
  return (lam(color, { flat: true, roughness }) as THREE.MeshStandardMaterial).clone();
}

function flowPart(mat: THREE.MeshStandardMaterial, vanilla: string, choc: string, rVanilla: number, rChoc: number): FlowPart {
  return { mat, from: new THREE.Color(vanilla), to: new THREE.Color(choc), r0: rVanilla, r1: rChoc };
}

function setPart(p: FlowPart, t: number) {
  p.mat.color.copy(p.from).lerp(p.to, t);
  p.mat.roughness = p.r0 + (p.r1 - p.r0) * t;
}

/**
 * How far the flood has come, 0 (all vanilla) to 1 (all chocolate). The front
 * moves along the segments in order and the leading one fades, so it reads as
 * chocolate running rather than lights switching on.
 */
export function setRiverFlow(group: THREE.Group, filled: number) {
  const flow = group.userData.flow as RiverFlow | undefined;
  if (!flow) return;
  const front = Math.max(0, Math.min(1, filled)) * flow.segs.length;
  flow.segs.forEach((seg, i) => setPart(seg, Math.max(0, Math.min(1, front - i))));
  for (const p of flow.rest) setPart(p, Math.max(0, Math.min(1, filled)));
}

/**
 * The whole river: bank, chocolate, froth along both edges, and swirls dragged
 * down the middle. Everything is flat and at its own height, so nothing fights.
 *
 * `source` is where the chocolate comes from — the factory — and the chocolate
 * is cut into segments ordered by how far along the river they are from it, so
 * `setRiverFlow` can run the flood outward in both directions at once.
 */
export function makeChocolateRiver(
  path: RiverPoint[],
  lake?: { x: number; z: number; r: number },
  source?: { x: number; z: number },
): THREE.Group {
  const g = new THREE.Group();
  const flow: RiverFlow = { segs: [], rest: [] };

  if (lake) {
    const bankDisc = new THREE.Mesh(
      new THREE.CircleGeometry(lake.r + 1.6, 40),
      lam("#e9d7b6", { flat: true, roughness: 0.85 }),
    );
    bankDisc.rotation.x = -Math.PI / 2;
    bankDisc.position.set(lake.x, 0.06, lake.z);
    bankDisc.receiveShadow = true;
    g.add(bankDisc);
    const poolMat = ownMaterial(FLOW.choc.color, FLOW.choc.roughness);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(lake.r, 40), poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(lake.x, 0.12, lake.z);
    pool.receiveShadow = true;
    g.add(pool);
    flow.rest.push(flowPart(poolMat, FLOW.vanilla.color, FLOW.choc.color, FLOW.vanilla.roughness, FLOW.choc.roughness));
  }

  const bank = new THREE.Mesh(
    ribbon(path, 0.06, (p) => p.w / 2 + 1.6),
    lam("#e9d7b6", { flat: true, roughness: 0.85 }),
  );
  bank.receiveShadow = true;
  g.add(bank);

  /*
   * Glossy and dark: chocolate is a mirror with a tint, and roughness is what
   * makes the difference between melted chocolate and a brown floor. Cut into
   * SEGMENTS pieces that share a sample at each join, so there is no seam.
   */
  const per = Math.max(2, Math.ceil((path.length - 1) / SEGMENTS));
  const pieces: { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; at: number }[] = [];
  for (let start = 0; start < path.length - 1; start += per) {
    const slice = path.slice(start, Math.min(path.length, start + per + 1));
    if (slice.length < 2) continue;
    const mat = ownMaterial(FLOW.choc.color, FLOW.choc.roughness);
    const mesh = new THREE.Mesh(ribbon(slice, 0.12, (p) => p.w / 2), mat);
    mesh.receiveShadow = true;
    g.add(mesh);
    // how far along the river this piece sits, for ordering the flood
    const mid = slice[Math.floor(slice.length / 2)]!;
    const at = source ? Math.hypot(mid.x - source.x, mid.z - source.z) : start;
    pieces.push({ mesh, mat, at });
  }
  pieces.sort((a, b) => a.at - b.at);
  for (const p of pieces) {
    flow.segs.push(flowPart(p.mat, FLOW.vanilla.color, FLOW.choc.color, FLOW.vanilla.roughness, FLOW.choc.roughness));
  }

  const frothMat = ownMaterial(FLOW.froth.color, FLOW.froth.roughness);
  for (const side of [1, -1] as const) {
    const strip = new THREE.Mesh(edgeStrip(path, 0.14, side, (p) => p.w / 2 - 0.55, 0.55), frothMat);
    g.add(strip);
  }
  flow.rest.push(flowPart(frothMat, FLOW.froth.vanilla, FLOW.froth.color, 0.3, FLOW.froth.roughness));

  /*
   * Swirls: short cream arcs laid on the surface, spaced along the flow and
   * alternating sides. They are what makes a flat brown strip read as moving
   * chocolate from the far bank, and they cost eight triangles each.
   */
  const swirlGeo = new THREE.TorusGeometry(1, 0.1, 4, 10, Math.PI * 1.2);
  const swirlMat = ownMaterial(FLOW.swirl.color, FLOW.swirl.roughness);
  for (let i = 6; i < path.length - 6; i += 7) {
    const p = path[i]!;
    const prev = path[i - 1]!;
    const dx = p.x - prev.x;
    const dz = p.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    const side = i % 14 === 6 ? 1 : -1;
    const s = Math.min(1.4, p.w / 7);
    const swirl = new THREE.Mesh(swirlGeo, swirlMat);
    swirl.rotation.x = -Math.PI / 2;
    swirl.rotation.z = Math.atan2(dx, dz) + (side > 0 ? 0.6 : -2.4);
    swirl.scale.setScalar(s);
    swirl.position.set(p.x + ((-dz / len) * side * p.w) / 5, 0.16, p.z + ((dx / len) * side * p.w) / 5);
    g.add(swirl);
  }
  flow.rest.push(flowPart(swirlMat, FLOW.swirl.vanilla, FLOW.swirl.color, 0.22, FLOW.swirl.roughness));

  g.userData.flow = flow;
  g.name = "chocolate river";
  return g;
}
