import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/**
 * Beveled parts.
 *
 * The single biggest tell of the Roblox look is that every part has a small
 * rounded edge that catches a highlight, so shapes read as moulded plastic
 * rather than flat card.
 *
 * The catch is that the bevel has to be a constant real-world size. The game
 * previously scaled one shared unit cube, which would stretch a bevel into a
 * 30m curve on a long wall and a sliver on a thin rail. So geometry is built
 * per size and cached, and the mesh is never scaled.
 */

const BEVEL = 0.07;
const SEGMENTS = 2;

const cache = new Map<string, THREE.BufferGeometry>();

/** Quantise so near-identical sizes share one geometry. */
function key(sx: number, sy: number, sz: number) {
  const q = (n: number) => Math.round(Math.abs(n) * 50) / 50;
  return `${q(sx)}|${q(sy)}|${q(sz)}`;
}

export function beveledBox(sx: number, sy: number, sz: number): THREE.BufferGeometry {
  const k = key(sx, sy, sz);
  const found = cache.get(k);
  if (found) return found;

  const w = Math.abs(sx) || 0.01;
  const h = Math.abs(sy) || 0.01;
  const d = Math.abs(sz) || 0.01;

  // never let the bevel eat more than a third of the smallest dimension,
  // or thin rails and floor slabs turn into sausages
  const r = Math.min(BEVEL, Math.min(w, h, d) / 3);

  let geo: THREE.BufferGeometry;
  if (r < 0.012) {
    geo = new THREE.BoxGeometry(w, h, d);
  } else {
    geo = new RoundedBoxGeometry(w, h, d, SEGMENTS, r);
  }
  cache.set(k, geo);
  return geo;
}

export function beveledStats() {
  return { geometries: cache.size };
}
