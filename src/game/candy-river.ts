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

/**
 * The whole river: bank, chocolate, froth along both edges, and swirls dragged
 * down the middle. Everything is flat and at its own height, so nothing fights.
 */
export function makeChocolateRiver(path: RiverPoint[], lake?: { x: number; z: number; r: number }): THREE.Group {
  const g = new THREE.Group();

  if (lake) {
    const bankDisc = new THREE.Mesh(
      new THREE.CircleGeometry(lake.r + 1.6, 40),
      lam("#e9d7b6", { flat: true, roughness: 0.85 }),
    );
    bankDisc.rotation.x = -Math.PI / 2;
    bankDisc.position.set(lake.x, 0.06, lake.z);
    bankDisc.receiveShadow = true;
    g.add(bankDisc);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(lake.r, 40), lam("#4a2a16", { flat: true, roughness: 0.08 }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(lake.x, 0.12, lake.z);
    pool.receiveShadow = true;
    g.add(pool);
  }

  const bank = new THREE.Mesh(
    ribbon(path, 0.06, (p) => p.w / 2 + 1.6),
    lam("#e9d7b6", { flat: true, roughness: 0.85 }),
  );
  bank.receiveShadow = true;
  g.add(bank);

  // Glossy and dark: chocolate is a mirror with a tint, and roughness is what
  // makes the difference between melted chocolate and a brown floor.
  const choc = new THREE.Mesh(
    ribbon(path, 0.12, (p) => p.w / 2),
    lam("#4a2a16", { flat: true, roughness: 0.08 }),
  );
  choc.receiveShadow = true;
  g.add(choc);

  const froth = lam("#c98a4a", { flat: true, roughness: 0.4 });
  for (const side of [1, -1] as const) {
    const strip = new THREE.Mesh(edgeStrip(path, 0.14, side, (p) => p.w / 2 - 0.55, 0.55), froth);
    g.add(strip);
  }

  /*
   * Swirls: short cream arcs laid on the surface, spaced along the flow and
   * alternating sides. They are what makes a flat brown strip read as moving
   * chocolate from the far bank, and they cost eight triangles each.
   */
  const swirlGeo = new THREE.TorusGeometry(1, 0.1, 4, 10, Math.PI * 1.2);
  const swirlMat = lam("#8a5a34", { flat: true, roughness: 0.25 });
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

  return g;
}
