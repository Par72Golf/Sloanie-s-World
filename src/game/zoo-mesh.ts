import * as THREE from "three";
import { beveledBox } from "./beveled";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { mergeStatic } from "./merge";
import { lam } from "./meshes";
import {
  ARCH,
  ENCLOSURES,
  FENCE,
  FENCE_LINES,
  POOL,
  SPOT_R,
  ZOO,
  enclosureAtLocal,
  plaqueSpotLocal,
  worldToZoo,
  zooToWorld,
  type AnimalId,
  type Enclosure,
} from "./zoo";

/**
 * Sloanie's Zoo: fences, the entrance arch, plaques and six kinds of animal,
 * built from primitives with flat plastic materials like the pets.
 *
 * Layout and colliders are zoo.ts; nothing here adds a collider. Every fence
 * run is drawn over its collider (posts at both ends, two rails, 1.18m to the
 * post caps), so the collider is never wider or taller than what she sees.
 *
 * Rig: group (at the world origin, holds the merged static meshes) > site (at
 * the zoo centre) > fences, arch, decorations, and one group per animal. The
 * animals and the glowing plaque rings are live; the rest is merged once by
 * makeZoo, so the whole zoo is a few dozen draw calls.
 *
 * Animation writes only rotations, scales and inner positions, reads the
 * clock from a shared object and passes nothing but objects between
 * functions, so a frame allocates nothing (tools/zoo.ts counts GCs).
 *
 * ZooWorld (bottom) is what the runtime owns: build, update, near, interact.
 */

/* ------------------------------------------------------------------ shared geometry and materials */

const BOX = new THREE.BoxGeometry(1, 1, 1);
const SPH = new THREE.SphereGeometry(1, 10, 7);
const SPH_S = new THREE.SphereGeometry(1, 7, 5);
const CONE = new THREE.ConeGeometry(1, 1, 7);
const ROCK = new THREE.DodecahedronGeometry(1, 0);
const cylCache = new Map<string, THREE.CylinderGeometry>();
/** A cylinder of height 1 (scale y for length), tapered from rBottom to rTop. */
function cylG(rTop: number, rBottom: number, seg = 8) {
  const k = `${rTop.toFixed(3)}|${rBottom.toFixed(3)}|${seg}`;
  let g = cylCache.get(k);
  if (!g) cylCache.set(k, (g = new THREE.CylinderGeometry(rTop, rBottom, 1, seg)));
  return g;
}
const capCache = new Map<string, THREE.CapsuleGeometry>();
/** A capsule of radius r and overall length len, along y. */
function capG(r: number, len: number) {
  const k = `${r.toFixed(3)}|${len.toFixed(3)}`;
  let g = capCache.get(k);
  if (!g) capCache.set(k, (g = new THREE.CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 3, 8)));
  return g;
}

const mat = (c: string, roughness = 0.55) => lam(c, { flat: true, roughness });
const shine = () => lam("#ffffff", { flat: true, roughness: 0.3, emissive: "#ffffff" });

type O = THREE.Object3D;

function part(parent: O, geo: THREE.BufferGeometry, color: string, sx: number, sy: number, sz: number, x: number, y: number, z: number, shadow = false) {
  const m = new THREE.Mesh(geo, mat(color));
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function pivot(parent: O, x: number, y: number, z: number) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
/** Two glossy eyes with a catchlight each, looking along +z. */
function eyes(parent: O, spread: number, y: number, z: number, r: number) {
  for (const s of [-1, 1]) {
    part(parent, SPH_S, "#1d140f", r, r, r, s * spread, y, z);
    const c = new THREE.Mesh(SPH_S, shine());
    c.scale.setScalar(r * 0.34);
    c.position.set(s * spread + r * 0.3, y + r * 0.38, z + r * 0.72);
    parent.add(c);
  }
}
/** A point on an ellipsoid's surface in direction (dx, dy, dz). */
function onEllipsoid(rx: number, ry: number, rz: number, dx: number, dy: number, dz: number, k = 1): [number, number, number] {
  const s = k / Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2 + (dz / rz) ** 2);
  return [dx * s, dy * s, dz * s];
}

/* ------------------------------------------------------------------ canvas (skipped headless) */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  return g ? [c, g] : null;
}
function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
const FONT = "system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";
const EMOJI: Record<AnimalId, string> = { penguin: "🐧", zebra: "🦓", monkey: "🐒", giraffe: "🦒", elephant: "🐘", lion: "🦁" };

function boardTexture(textures: THREE.Texture[], draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number) {
  const cg = canvas(w, h);
  if (!cg) return null;
  draw(cg[1], w, h);
  const t = new THREE.CanvasTexture(cg[0]);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  textures.push(t);
  return t;
}

/** A board with a painted face on +z (and on -z when both). Edges in `edge`. */
function board(textures: THREE.Texture[], geometries: THREE.BufferGeometry[], materials: THREE.Material[], w: number, h: number, depth: number, edge: string, fallback: string, both: boolean, draw: (g: CanvasRenderingContext2D, cw: number, ch: number) => void) {
  const cw = 512;
  const ch = Math.round((512 * h) / w);
  const t = boardTexture(textures, draw, cw, ch);
  const face = t ? new THREE.MeshStandardMaterial({ map: t, roughness: 0.75 }) : mat(fallback);
  if (t) materials.push(face);
  const e = mat(edge);
  const geo = new THREE.BoxGeometry(w, h, depth);
  geometries.push(geo);
  return new THREE.Mesh(geo, [e, e, e, e, face, both ? face : e]);
}

/* ------------------------------------------------------------------ animals */

export type AnimalRig = {
  id: AnimalId;
  group: THREE.Group;
  parts: Record<string, THREE.Object3D>;
  seed: number;
  /** 1 for the monkey hanging from the bar, 0 otherwise */
  variant: number;
  /** seconds of happy animation left */
  happyT: number;
  /** the walk clock, stopped while it is busy being happy */
  wt: number;
  /** penguins: a walk between two points in the site frame; the rest stand still */
  walk: { ax: number; az: number; bx: number; bz: number; speed: number } | null;
};

const HAPPY_TIME = 2.6;
/** The clock every animate function reads, so no doubles cross a call. */
const Z = { t: 0, dt: 0, ph: 0, h: 0 };

function rig(id: AnimalId, seed: number): AnimalRig {
  const group = new THREE.Group();
  group.name = `zoo ${id}`;
  return { id, group, parts: {}, seed, variant: 0, happyT: 0, wt: seed * 3.1, walk: null };
}

/* ---- giraffe: faces +z, head about 3.9m up */

function makeGiraffe(): AnimalRig {
  const a = rig("giraffe", 1.3);
  const P = a.parts;
  const COAT = "#f2c14e";
  const SPOT = "#b8742e";
  const DARK = "#6a4526";
  const body = (P.body = pivot(a.group, 0, 0, 0));
  for (const [x, z] of [[-0.28, 0.5], [0.28, 0.5], [-0.28, -0.52], [0.28, -0.52]] as [number, number][]) {
    part(body, cylG(0.075, 0.1), COAT, 1, 1.62, 1, x, 0.91, z, true);
    part(body, cylG(0.1, 0.11), DARK, 1, 0.14, 1, x, 0.07, z);
    part(body, SPH_S, COAT, 0.1, 0.1, 0.1, x, 0.95, z);
  }
  const torso = pivot(body, 0, 1.95, 0);
  torso.rotation.x = -0.12;
  const [rx, ry, rz] = [0.46, 0.42, 0.8];
  part(torso, SPH, COAT, rx, ry, rz, 0, 0, 0, true);
  const spots: [number, number, number][] = [
    [1, 0.3, 0.3], [1, 0.1, -0.5], [1, -0.3, 0.05], [-1, 0.3, 0.3], [-1, 0.1, -0.5], [-1, -0.3, 0.05], [0.3, 1, -0.2], [-0.3, 1, 0.35], [0.5, 0.2, 0.9], [-0.5, 0.2, -1],
  ];
  for (const [dx, dy, dz] of spots) {
    const [x, y, z] = onEllipsoid(rx, ry, rz, dx, dy, dz, 0.93);
    part(torso, SPH_S, SPOT, 0.13, 0.13, 0.13, x, y, z);
  }
  // neck: its frame tips forward; the head's frame undoes that so it is built level
  const neck = (P.neck = pivot(body, 0, 2.15, 0.55));
  neck.rotation.x = 0.3;
  part(neck, cylG(0.11, 0.19), COAT, 1, 1.7, 1, 0, 0.85, 0, true);
  part(neck, BOX, DARK, 0.05, 1.55, 0.08, 0, 0.9, -0.14);
  for (let i = 0; i < 4; i++) {
    const y = 0.3 + i * 0.36;
    const r = 0.18 - i * 0.02;
    part(neck, SPH_S, SPOT, 0.08, 0.1, 0.08, (i % 2 ? 1 : -1) * r * 0.85, y, 0.02);
  }
  const head = (P.head = pivot(neck, 0, 1.68, 0));
  head.rotation.x = -0.3;
  part(head, SPH, COAT, 0.17, 0.18, 0.28, 0, 0.06, 0.1, true);
  P.muzzle = part(head, SPH, "#f5d58a", 0.13, 0.12, 0.14, 0, 0.0, 0.34);
  part(head, SPH_S, DARK, 0.025, 0.02, 0.02, -0.05, 0.05, 0.47);
  part(head, SPH_S, DARK, 0.025, 0.02, 0.02, 0.05, 0.05, 0.47);
  eyes(head, 0.14, 0.13, 0.16, 0.05);
  for (const s of [-1, 1]) {
    part(head, cylG(0.03, 0.035, 6), COAT, 1, 0.2, 1, s * 0.08, 0.3, -0.03);
    part(head, SPH_S, DARK, 0.05, 0.05, 0.05, s * 0.08, 0.41, -0.03);
    const ear = (P[s < 0 ? "earL" : "earR"] = pivot(head, s * 0.15, 0.2, -0.06));
    part(ear, SPH_S, COAT, 0.13, 0.05, 0.04, s * 0.11, 0, 0);
  }
  const tail = (P.tail = pivot(body, 0, 2.05, -0.78));
  tail.rotation.x = -0.25;
  part(tail, cylG(0.025, 0.03, 6), COAT, 1, 0.75, 1, 0, -0.37, 0);
  part(tail, SPH_S, DARK, 0.06, 0.13, 0.06, 0, -0.78, 0);
  return a;
}

function animateGiraffe(a: AnimalRig) {
  const P = a.parts;
  const t = Z.t + a.seed;
  const h = Z.h;
  const ph = Z.ph;
  P.neck!.rotation.x = 0.3 + Math.sin(t * 0.7) * 0.06 + h * Math.sin(ph * 5) * 0.22;
  P.neck!.rotation.z = Math.sin(t * 0.45) * 0.08 + h * Math.sin(ph * 3.2) * 0.3;
  P.head!.rotation.x = -0.3 + Math.sin(t * 0.9 + 1) * 0.08 - h * 0.2;
  P.head!.rotation.y = Math.sin(t * 0.35) * 0.35;
  P.muzzle!.scale.y = 0.12 * (1 + Math.sin(t * 7) * 0.07);
  const flick = Math.pow(Math.max(0, Math.sin(t * 1.3)), 16);
  P.earL!.rotation.x = flick * 0.6 + h * Math.sin(ph * 14) * 0.4;
  P.earR!.rotation.x = -flick * 0.4 - h * Math.sin(ph * 14) * 0.4;
  P.tail!.rotation.z = Math.sin(t * 1.6) * 0.35 + h * Math.sin(ph * 12) * 0.4;
  P.body!.position.y = h * Math.abs(Math.sin(ph * 6)) * 0.22;
}

/* ---- elephant: faces +z */

function makeElephant(): AnimalRig {
  const a = rig("elephant", 4.1);
  const P = a.parts;
  const G = "#9aa3ad";
  const GD = "#88919c";
  const NAIL = "#f4ecdc";
  // rears up about the back feet when happy
  const rear = (P.rear = pivot(a.group, 0, 0, -0.62));
  const body = pivot(rear, 0, 0, 0.62);
  P.body = body;
  part(body, SPH, G, 0.9, 0.82, 1.12, 0, 1.45, 0, true);
  for (const [x, z] of [[-0.5, 0.6], [0.5, 0.6], [-0.5, -0.6], [0.5, -0.6]] as [number, number][]) {
    part(body, cylG(0.27, 0.3, 10), G, 1, 1.0, 1, x, 0.5, z, true);
    for (const k of [-1, 0, 1]) part(body, SPH_S, NAIL, 0.06, 0.05, 0.04, x + k * 0.12, 0.07, z + 0.27);
  }
  const head = (P.head = pivot(body, 0, 1.85, 1.0));
  part(head, SPH, G, 0.6, 0.58, 0.55, 0, 0, 0.18, true);
  eyes(head, 0.28, 0.14, 0.62, 0.07);
  for (const s of [-1, 1]) {
    const ear = (P[s < 0 ? "earL" : "earR"] = pivot(head, s * 0.42, 0.08, 0.1));
    part(ear, SPH, GD, 0.5, 0.56, 0.06, s * 0.42, -0.06, 0, true);
    part(ear, SPH_S, "#e8a8b8", 0.36, 0.42, 0.03, s * 0.42, -0.06, 0.045);
    // tusks
    const tusk = part(head, CONE, NAIL, 0.055, 0.32, 0.055, s * 0.2, -0.24, 0.62);
    tusk.rotation.x = 1.25;
  }
  // trunk: four segments hanging from the face, each a child of the last
  let parent: O = pivot(head, 0, -0.05, 0.66);
  const lens = [0.3, 0.28, 0.26, 0.24];
  const radii = [0.17, 0.14, 0.115, 0.095, 0.08];
  for (let i = 0; i < 4; i++) {
    const seg = pivot(parent, 0, 0, 0);
    P[`trunk${i}`] = seg;
    part(seg, cylG(radii[i]!, radii[i + 1]!, 10), G, 1, lens[i]! + 0.04, 1, 0, -lens[i]! / 2, 0);
    const next = pivot(seg, 0, -lens[i]!, 0);
    parent = next;
  }
  part(parent, SPH_S, GD, 0.09, 0.05, 0.09, 0, 0, 0);
  const tail = (P.tail = pivot(body, 0, 1.6, -1.1));
  tail.rotation.x = -0.3;
  part(tail, cylG(0.03, 0.04, 6), G, 1, 0.6, 1, 0, -0.3, 0);
  part(tail, SPH_S, "#4a4f57", 0.06, 0.1, 0.06, 0, -0.62, 0);
  return a;
}

const TRUNK_IDLE = [-0.2, -0.08, -0.08, -0.1];
const TRUNK_UP = [-1.2, -0.75, -0.7, -0.6];

function animateElephant(a: AnimalRig) {
  const P = a.parts;
  const t = Z.t + a.seed;
  const h = Z.h;
  const ph = Z.ph;
  const flap = 0.4 + Math.sin(t * 2.2) * 0.3;
  const spread = flap * (1 - h) - 0.25 * h + h * Math.sin(ph * 16) * 0.12;
  P.earL!.rotation.y = -spread;
  P.earR!.rotation.y = spread;
  for (let i = 0; i < 4; i++) {
    const seg = P[i === 0 ? "trunk0" : i === 1 ? "trunk1" : i === 2 ? "trunk2" : "trunk3"]!;
    seg.rotation.x = TRUNK_IDLE[i]! * (1 - h) + TRUNK_UP[i]! * h + Math.sin(t * 0.9 - i * 0.5) * 0.1;
    seg.rotation.z = Math.sin(t * 1.3 - i * 0.6) * 0.16 * (1 - h);
  }
  P.head!.rotation.x = Math.sin(t * 0.6) * 0.04 - h * 0.18;
  P.head!.rotation.y = Math.sin(t * 0.25) * 0.12;
  P.tail!.rotation.z = Math.sin(t * 1.4) * 0.3;
  const up = h * (0.7 + 0.3 * Math.sin(ph * 8));
  P.rear!.rotation.x = -0.22 * up;
  P.rear!.position.y = 0.12 * up;
}

/* ---- lion: faces +z */

function makeLion(): AnimalRig {
  const a = rig("lion", 2.7);
  const P = a.parts;
  const COAT = "#e8a948";
  const MANE = "#b8642a";
  const LIGHT = "#fbe3b0";
  const body = (P.body = pivot(a.group, 0, 0, 0));
  P.torso = part(body, SPH, COAT, 0.42, 0.4, 0.85, 0, 0.88, 0, true);
  for (const [x, z] of [[-0.24, 0.5], [0.24, 0.5], [-0.24, -0.52], [0.24, -0.52]] as [number, number][]) {
    part(body, capG(0.12, 0.76), COAT, 1, 1, 1, x, 0.38, z, true);
    part(body, SPH_S, COAT, 0.14, 0.09, 0.17, x, 0.06, z + 0.05);
  }
  const head = (P.head = pivot(body, 0, 1.15, 0.8));
  P.mane = part(head, SPH, MANE, 0.55, 0.55, 0.4, 0, 0, -0.06, true);
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    part(P.mane, SPH_S, MANE, 0.34, 0.34, 0.5, Math.cos(ang) * 0.9, Math.sin(ang) * 0.9, -0.1);
  }
  part(head, SPH, COAT, 0.32, 0.3, 0.28, 0, -0.02, 0.24);
  part(head, SPH_S, LIGHT, 0.19, 0.13, 0.13, 0, -0.13, 0.47);
  part(head, SPH_S, "#5a3a2a", 0.07, 0.05, 0.04, 0, -0.05, 0.58);
  eyes(head, 0.12, 0.08, 0.47, 0.045);
  for (const s of [-1, 1]) part(head, SPH_S, COAT, 0.1, 0.1, 0.05, s * 0.25, 0.26, 0.14);
  const jaw = (P.jaw = pivot(head, 0, -0.2, 0.47));
  part(jaw, SPH_S, "#7a2a2a", 0.1, 0.07, 0.06, 0, 0, 0);
  jaw.scale.y = 0.2;
  const tail = (P.tail = pivot(body, 0, 0.98, -0.8));
  tail.rotation.x = -2.3;
  part(tail, cylG(0.035, 0.045, 6), COAT, 1, 0.6, 1, 0, 0.3, 0);
  const tip = (P.tailTip = pivot(tail, 0, 0.6, 0));
  part(tip, cylG(0.03, 0.035, 6), COAT, 1, 0.45, 1, 0, 0.22, 0);
  part(tip, SPH_S, MANE, 0.09, 0.12, 0.09, 0, 0.47, 0);
  return a;
}

function animateLion(a: AnimalRig) {
  const P = a.parts;
  const t = Z.t + a.seed;
  const h = Z.h;
  const ph = Z.ph;
  P.tail!.rotation.z = Math.sin(t * 1.2) * 0.45;
  P.tailTip!.rotation.x = -0.5 + Math.sin(t * 1.2 - 0.8) * 0.4;
  P.head!.rotation.y = Math.sin(t * 0.3) * 0.45 * (1 - h);
  // a big yawn now and then; a roar when happy
  const yawn = Math.pow(Math.max(0, Math.sin(t * 0.21)), 30);
  P.head!.rotation.x = -yawn * 0.3 - h * 0.4;
  P.jaw!.scale.y = 0.2 + yawn * 1.2 + h * (1.3 + Math.sin(ph * 20) * 0.2);
  const puff = 1 + h * (0.1 + Math.sin(ph * 18) * 0.05);
  P.mane!.scale.set(0.55 * puff, 0.55 * puff, 0.4 * puff);
  P.torso!.scale.y = 0.4 * (1 + Math.sin(t * 1.8) * 0.025);
  P.body!.position.y = h * Math.abs(Math.sin(ph * 5)) * 0.12;
}

/* ---- zebra: faces +z */

function makeZebra(): AnimalRig {
  const a = rig("zebra", 0.6);
  const P = a.parts;
  const W = "#f7f5f0";
  const B = "#2a2c30";
  const body = (P.body = pivot(a.group, 0, 0, 0));
  const [rx, ry, rz] = [0.36, 0.38, 0.72];
  part(body, SPH, W, rx, ry, rz, 0, 1.08, 0, true);
  // stripes: thin black slices just proud of the body
  for (const z of [-0.5, -0.26, -0.02, 0.22, 0.44]) {
    const f = Math.sqrt(Math.max(0, 1 - (z / rz) ** 2)) + 0.025;
    part(body, SPH_S, B, rx * f, ry * f, 0.045, 0, 1.08, z);
  }
  const legs: [number, number, string][] = [[-0.2, 0.45, "legFL"], [0.2, 0.45, "legFR"], [-0.2, -0.45, "legBL"], [0.2, -0.45, "legBR"]];
  for (const [x, z, name] of legs) {
    const hip = (P[name] = pivot(body, x, 0.86, z));
    part(hip, cylG(0.07, 0.09), W, 1, 0.8, 1, 0, -0.44, 0, true);
    part(hip, cylG(0.095, 0.095), B, 1, 0.06, 1, 0, -0.3, 0);
    part(hip, cylG(0.085, 0.085), B, 1, 0.06, 1, 0, -0.56, 0);
    part(hip, cylG(0.08, 0.09), B, 1, 0.1, 1, 0, -0.81, 0);
  }
  const neck = (P.neck = pivot(body, 0, 1.28, 0.55));
  neck.rotation.x = 0.55;
  part(neck, cylG(0.12, 0.18), W, 1, 0.72, 1, 0, 0.36, 0, true);
  part(neck, SPH_S, B, 0.16, 0.16, 0.04, 0, 0.25, 0).rotation.x = Math.PI / 2;
  part(neck, SPH_S, B, 0.135, 0.135, 0.04, 0, 0.5, 0).rotation.x = Math.PI / 2;
  part(neck, BOX, B, 0.06, 0.74, 0.1, 0, 0.4, -0.13);
  const head = (P.head = pivot(neck, 0, 0.74, 0));
  head.rotation.x = -0.55;
  const skull = pivot(head, 0, 0, 0.08);
  skull.rotation.x = 0.6;
  part(skull, SPH, W, 0.13, 0.15, 0.3, 0, 0, 0.1, true);
  part(skull, SPH_S, B, 0.11, 0.11, 0.1, 0, -0.02, 0.36);
  part(skull, SPH_S, B, 0.135, 0.03, 0.2, 0, 0.1, 0.06);
  eyes(skull, 0.12, 0.05, 0.0, 0.04);
  for (const s of [-1, 1]) {
    const ear = (P[s < 0 ? "earL" : "earR"] = pivot(skull, s * 0.07, 0.12, -0.12));
    part(ear, SPH_S, W, 0.045, 0.13, 0.035, 0, 0.1, 0).rotation.z = -s * 0.3;
  }
  const tail = (P.tail = pivot(body, 0, 1.25, -0.7));
  tail.rotation.x = -0.35;
  part(tail, cylG(0.025, 0.03, 6), W, 1, 0.55, 1, 0, -0.27, 0);
  part(tail, SPH_S, B, 0.06, 0.13, 0.06, 0, -0.58, 0);
  return a;
}

function animateZebra(a: AnimalRig) {
  const P = a.parts;
  const t = Z.t + a.seed;
  const h = Z.h;
  const ph = Z.ph;
  // graze: head down to the grass for a while, then up to look around
  const s = Math.sin(t * 0.42);
  const graze = s > 0.2 ? Math.min(1, (s - 0.2) * 3) : 0;
  const g = graze * (1 - h);
  P.neck!.rotation.x = 0.55 + g * 1.5 + Math.sin(t * 5) * 0.03 * g - h * 0.25 + h * Math.sin(ph * 9) * 0.15;
  P.head!.rotation.x = -0.55 + g * 0.25;
  P.head!.rotation.y = Math.sin(t * 0.5) * 0.25 * (1 - graze);
  const flick = Math.pow(Math.max(0, Math.sin(t * 1.7)), 14);
  P.earL!.rotation.z = flick * 0.5;
  P.earR!.rotation.z = -flick * 0.3;
  P.tail!.rotation.z = Math.sin(t * 2.1) * 0.4 + h * Math.sin(ph * 15) * 0.3;
  const hop = Math.sin(ph * 7);
  P.body!.position.y = h * Math.max(0, hop) * 0.3;
  const kick = -0.7 * h * Math.max(0, -Math.sin(ph * 7 + 0.6));
  P.legBL!.rotation.x = kick;
  P.legBR!.rotation.x = kick;
}

/* ---- monkey: faces +z; a hanger swings from a bar, a sitter sits on the platform */

function makeMonkey(hanging: boolean, seed: number): AnimalRig {
  const a = rig("monkey", seed);
  a.variant = hanging ? 1 : 0;
  const P = a.parts;
  const BR = hanging ? "#8a5a3b" : "#7a4e33";
  const FACE = "#f0cfa0";
  // swing: the hands' grip for a hanger; the hips for a sitter
  const swing = (P.swing = pivot(a.group, 0, 0, 0));
  const body = (P.body = pivot(swing, 0, hanging ? -1.1 : 0, 0));
  part(body, SPH, BR, 0.2, 0.26, 0.18, 0, 0.5, 0, true);
  part(body, SPH_S, FACE, 0.13, 0.17, 0.08, 0, 0.47, 0.12);
  const head = (P.head = pivot(body, 0, 0.84, 0.02));
  part(head, SPH, BR, 0.21, 0.2, 0.19, 0, 0, 0, true);
  part(head, SPH_S, FACE, 0.15, 0.13, 0.09, 0, -0.03, 0.13);
  part(head, SPH_S, "#5a3a2a", 0.03, 0.02, 0.02, 0, -0.04, 0.23);
  eyes(head, 0.065, 0.03, 0.19, 0.035);
  for (const s of [-1, 1]) part(head, SPH_S, FACE, 0.08, 0.08, 0.035, s * 0.21, 0.02, 0);
  for (const s of [-1, 1]) {
    const arm = (P[s < 0 ? "armL" : "armR"] = pivot(body, s * 0.19, 0.66, 0));
    part(arm, capG(0.055, 0.5), BR, 1, 1, 1, 0, -0.22, 0);
    part(arm, SPH_S, FACE, 0.07, 0.07, 0.07, 0, -0.46, 0);
    if (hanging) arm.rotation.x = Math.PI;
    const leg = (P[s < 0 ? "legL" : "legR"] = pivot(body, s * 0.11, 0.32, 0.03));
    part(leg, capG(0.065, 0.36), BR, 1, 1, 1, 0, -0.15, 0);
    part(leg, SPH_S, FACE, 0.07, 0.05, 0.09, 0, -0.32, 0.03);
    if (!hanging) leg.rotation.x = -1.45;
  }
  let parent: O = pivot(body, 0, 0.32, -0.15);
  for (let i = 0; i < 4; i++) {
    const seg = pivot(parent, 0, 0, 0);
    P[`tail${i}`] = seg;
    part(seg, capG(0.03, 0.2), BR, 1, 1, 1, 0, 0.08, 0);
    parent = pivot(seg, 0, 0.16, 0);
  }
  if (!hanging) body.position.y = -0.24;
  return a;
}

function animateMonkey(a: AnimalRig, hanging: boolean) {
  const P = a.parts;
  const t = Z.t + a.seed;
  const h = Z.h;
  const ph = Z.ph;
  for (let i = 0; i < 4; i++) {
    const seg = P[i === 0 ? "tail0" : i === 1 ? "tail1" : i === 2 ? "tail2" : "tail3"]!;
    seg.rotation.x = -0.9 - 0.25 * i + Math.sin(t * 1.5 - i * 0.7) * 0.2;
    seg.rotation.z = Math.sin(t * 1.1 - i * 0.5) * 0.15;
  }
  if (hanging) {
    // swings about the bar, bigger when happy; legs trail and kick
    const amp = 0.28 + h * 0.3;
    const sw = Math.sin(t * 2.0) * amp;
    P.swing!.rotation.x = sw;
    P.legL!.rotation.x = -0.3 + Math.sin(t * 2.0 + 0.9) * 0.4;
    P.legR!.rotation.x = -0.3 + Math.sin(t * 2.0 + 1.3) * 0.4;
    P.head!.rotation.x = -0.25 + Math.sin(t * 2.0) * 0.12 - sw * 0.4;
  } else {
    // sits on the platform, looks about and scratches its head; jumps and claps when happy
    const scratch = Math.max(0, Math.sin(t * 0.55)) > 0.8 ? 1 : 0;
    P.armR!.rotation.x = -2.6 * scratch * (1 - h) - h * 2.9;
    P.armR!.rotation.z = scratch * (0.4 + Math.sin(t * 14) * 0.15) * (1 - h) + h * (0.5 + Math.sin(ph * 22) * 0.45);
    P.armL!.rotation.x = -h * 2.9;
    P.armL!.rotation.z = -h * (0.5 + Math.sin(ph * 22) * 0.45);
    P.head!.rotation.y = Math.sin(t * 0.7) * 0.5;
    P.head!.rotation.z = Math.sin(t * 1.3) * 0.12;
    P.swing!.position.y = h * Math.abs(Math.sin(ph * 7)) * 0.45;
  }
}

/* ---- penguin: faces +z, waddles along its walk */

function makePenguin(seed: number): AnimalRig {
  const a = rig("penguin", seed);
  const P = a.parts;
  const BL = "#2b2f3a";
  const WH = "#fbfbf6";
  const OR = "#ff9f2e";
  const hop = (P.hop = pivot(a.group, 0, 0, 0));
  const rock = (P.rock = pivot(hop, 0, 0, 0));
  part(rock, SPH, BL, 0.25, 0.34, 0.23, 0, 0.4, 0, true);
  part(rock, SPH, WH, 0.2, 0.27, 0.13, 0, 0.36, 0.12);
  part(rock, SPH, BL, 0.18, 0.17, 0.17, 0, 0.8, 0.01, true);
  part(rock, SPH_S, WH, 0.13, 0.1, 0.08, 0, 0.78, 0.11);
  const beak = part(rock, CONE, OR, 0.05, 0.14, 0.05, 0, 0.77, 0.23);
  beak.rotation.x = Math.PI / 2;
  eyes(rock, 0.065, 0.84, 0.15, 0.03);
  for (const s of [-1, 1]) {
    const fl = (P[s < 0 ? "flipL" : "flipR"] = pivot(rock, s * 0.23, 0.58, 0));
    part(fl, SPH_S, BL, 0.05, 0.2, 0.1, s * 0.02, -0.17, 0);
    const foot = (P[s < 0 ? "footL" : "footR"] = pivot(hop, s * 0.1, 0.03, 0.07));
    part(foot, SPH_S, OR, 0.08, 0.03, 0.11, 0, 0, 0);
  }
  return a;
}

function animatePenguin(a: AnimalRig) {
  const P = a.parts;
  const t = Z.t + a.seed;
  const h = Z.h;
  const ph = Z.ph;
  const w = a.walk;
  let moving = 0;
  if (w) {
    // there and back: walk, turn round, walk, turn round
    const dx = w.bx - w.ax;
    const dz = w.bz - w.az;
    const len = Math.sqrt(dx * dx + dz * dz);
    const walkT = len / w.speed;
    const turnT = 0.8;
    const period = 2 * (walkT + turnT);
    // a happy penguin stops to hop, so its walk clock is the game clock minus hops
    a.wt += Z.dt * (1 - h * 0.9);
    let u = a.wt % period;
    if (u < 0) u += period;
    const yawAB = Math.atan2(dx, dz);
    let f = 0;
    let yaw = yawAB;
    if (u < walkT) {
      f = u / walkT;
      moving = 1;
    } else if (u < walkT + turnT) {
      f = 1;
      yaw = yawAB + Math.PI * ((u - walkT) / turnT);
    } else if (u < 2 * walkT + turnT) {
      f = 1 - (u - walkT - turnT) / walkT;
      yaw = yawAB + Math.PI;
      moving = 1;
    } else {
      yaw = yawAB + Math.PI + Math.PI * ((u - 2 * walkT - turnT) / turnT);
    }
    a.group.position.x = w.ax + dx * f;
    a.group.position.z = w.az + dz * f;
    a.group.rotation.y = yaw;
  }
  const m = moving * (1 - h);
  const step = Math.sin(t * 9);
  P.rock!.rotation.z = step * 0.16 * m + Math.sin(t * 1.2) * 0.04 * (1 - m);
  P.footL!.position.y = 0.03 + Math.max(0, step) * 0.06 * m;
  P.footR!.position.y = 0.03 + Math.max(0, -step) * 0.06 * m;
  const flap = h * (0.6 + Math.sin(ph * 26) * 0.5) + Math.pow(Math.max(0, Math.sin(t * 0.8)), 12) * 0.5;
  P.flipL!.rotation.z = -0.15 - flap;
  P.flipR!.rotation.z = 0.15 + flap;
  P.hop!.position.y = h * Math.abs(Math.sin(ph * 8)) * 0.28;
  P.rock!.rotation.x = -h * 0.2 + Math.sin(t * 0.5) * 0.05;
}

/**
 * Bake each animated group's own plain meshes into one mesh per material.
 * A giraffe is ~50 little meshes as built, which would be ~50 draw calls it
 * cannot merge away (animals are excluded from the static merge). Only meshes
 * that never move inside their group are folded in, so the rig still poses.
 */
function compactAnimal(a: AnimalRig, geometries: THREE.BufferGeometry[]) {
  const keep = new Set<THREE.Object3D>(Object.values(a.parts));
  const nodes: THREE.Object3D[] = [];
  a.group.traverse((o) => nodes.push(o));
  const bucket = new Map<string, THREE.Mesh[]>();
  for (const node of nodes) {
    bucket.clear();
    for (const c of node.children) {
      const m = c as THREE.Mesh;
      if (!m.isMesh || keep.has(m) || m.children.length) continue;
      const mat = m.material as THREE.Material;
      if (Array.isArray(m.material)) continue;
      const k = `${mat.uuid}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}`;
      let l = bucket.get(k);
      if (!l) bucket.set(k, (l = []));
      l.push(m);
    }
    for (const list of bucket.values()) {
      if (list.length < 2) continue;
      const parts: THREE.BufferGeometry[] = [];
      for (const m of list) {
        m.updateMatrix();
        const g = m.geometry.clone();
        g.applyMatrix4(m.matrix);
        for (const name of Object.keys(g.attributes)) {
          if (name === "position" || name === "normal" || name === "uv") continue;
          g.deleteAttribute(name);
        }
        // fill the gaps and match index-ness, or one odd member kills the batch
        if (!g.attributes.normal) g.computeVertexNormals();
        if (!g.attributes.uv) {
          const n = g.attributes.position!.count;
          g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
        }
        parts.push(g);
      }
      const mixed = parts.some((p) => p.index) && parts.some((p) => !p.index);
      const ready = mixed ? parts.map((p) => (p.index ? p.toNonIndexed() : p)) : parts;
      const merged = mergeGeometries(ready, false);
      for (const g of parts) g.dispose();
      if (!merged) continue;
      geometries.push(merged);
      const first = list[0]!;
      const mesh = new THREE.Mesh(merged, first.material);
      mesh.castShadow = first.castShadow;
      mesh.receiveShadow = first.receiveShadow;
      for (const m of list) m.removeFromParent();
      node.add(mesh);
    }
  }
}

/* ------------------------------------------------------------------ the site */

export type ZooRig = {
  group: THREE.Group;
  site: THREE.Group;
  animals: AnimalRig[];
  /** one ring on the ground at each plaque's standing spot, in ENCLOSURES order */
  rings: THREE.Mesh[];
  /** merged geometries, canvas textures and painted materials this rig owns */
  geometries: THREE.BufferGeometry[];
  textures: THREE.Texture[];
  materials: THREE.Material[];
};

const WOOD = "#8a5a32";
const RAIL = "#c49a62";
const CAP = "#3fa35c";

/** Posts at both ends and at most 1.6m apart, a cap on each, two rails; tagged with its FENCE_LINES index. */
function makeFence(site: O, index: number) {
  const f = FENCE_LINES[index]!;
  const g = new THREE.Group();
  g.userData.fenceLine = index;
  const len = f.to - f.from;
  const n = Math.max(1, Math.ceil(len / 1.6));
  const post = 0.2;
  const at = (u: number, y: number, sx: number, sy: number, sz: number, color: string, shadow: boolean) => {
    const m = new THREE.Mesh(BOX, mat(color));
    const along = f.from + u;
    if (f.along === "x") {
      m.position.set(along, y, f.at);
      m.scale.set(sx, sy, sz);
    } else {
      m.position.set(f.at, y, along);
      m.scale.set(sz, sy, sx);
    }
    m.castShadow = shadow;
    m.receiveShadow = true;
    g.add(m);
  };
  for (let i = 0; i <= n; i++) {
    const u = post / 2 + ((len - post) * i) / n;
    at(u, 0.56, post, 1.12, post, WOOD, true);
    at(u, 1.15, post + 0.06, 0.08, post + 0.06, CAP, false);
  }
  for (const y of [0.42, 0.9]) at(len / 2, y, len, 0.12, 0.1, RAIL, true);
  // a low kick board along the bottom so small things never look walkable
  at(len / 2, 0.1, len, 0.2, 0.06, RAIL, false);
  site.add(g);
}

function makeArch(site: O, textures: THREE.Texture[], geometries: THREE.BufferGeometry[], materials: THREE.Material[]) {
  const g = new THREE.Group();
  g.name = "zoo arch";
  const GREEN = "#3f9a6b";
  const YELLOW = "#ffc53d";
  for (const s of [-1, 1]) {
    const x = s * ARCH.postX;
    const p = new THREE.Mesh(beveledBox(ARCH.post, ARCH.postH, ARCH.post), mat(GREEN));
    p.position.set(x, ARCH.postH / 2, ARCH.z);
    p.castShadow = true;
    p.receiveShadow = true;
    g.add(p);
    for (const y of [0.6, 2.0, 3.4]) part(g, BOX, YELLOW, ARCH.post + 0.04, 0.16, ARCH.post + 0.04, x, y, ARCH.z);
    // a leafy topper on each post
    part(g, SPH, "#5aa85c", 0.55, 0.45, 0.55, x, ARCH.postH + 1.35, ARCH.z, true);
  }
  // the beam across, well above her head (and the camera's lift)
  const beam = new THREE.Mesh(beveledBox(ARCH.postX * 2 + 0.9, 0.5, 0.6), mat(YELLOW));
  beam.position.set(0, ARCH.postH + 0.2, ARCH.z);
  beam.castShadow = true;
  g.add(beam);
  const sign = board(textures, geometries, materials, 5.6, 1.35, 0.14, "#6a4a32", "#8a5a32", true, (c, w, h) => {
    c.fillStyle = "#6a4a32";
    c.fillRect(0, 0, w, h);
    roundRect(c, 10, 10, w - 20, h - 20, 26);
    c.fillStyle = "#8a5a32";
    c.fill();
    c.fillStyle = "#a8743f";
    for (let y = 24; y < h - 16; y += 22) c.fillRect(18, y, w - 36, 3);
    c.lineWidth = 8;
    c.strokeStyle = GREEN;
    roundRect(c, 10, 10, w - 20, h - 20, 26);
    c.stroke();
    c.fillStyle = "#fff4d6";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = `900 ${Math.round(h * 0.4)}px ${FONT}`;
    c.fillText("Sloanie's Zoo", w / 2, h * 0.42);
    c.font = `${Math.round(h * 0.22)}px ${FONT}`;
    c.fillText("🦒 🐘 🦁 🦓 🐒 🐧", w / 2, h * 0.78);
  });
  sign.position.set(0, ARCH.postH + 1.15, ARCH.z);
  sign.castShadow = true;
  g.add(sign);
  site.add(g);
}

function makePlaque(site: O, e: Enclosure, textures: THREE.Texture[], geometries: THREE.BufferGeometry[], materials: THREE.Material[]) {
  const b = board(textures, geometries, materials, 1.15, 0.52, 0.06, "#6a4a32", "#f3e2bd", false, (c, w, h) => {
    c.fillStyle = "#6a4a32";
    c.fillRect(0, 0, w, h);
    roundRect(c, 8, 8, w - 16, h - 16, 18);
    c.fillStyle = "#f3e2bd";
    c.fill();
    c.textBaseline = "middle";
    c.textAlign = "center";
    c.font = `${Math.round(h * 0.52)}px ${FONT}`;
    c.fillText(EMOJI[e.id], h * 0.52, h * 0.53);
    c.fillStyle = "#4a3226";
    c.font = `800 ${Math.round(h * 0.4)}px ${FONT}`;
    c.fillText(e.name, w * 0.6, h * 0.54);
  });
  const out = FENCE.t / 2 + 0.035;
  b.position.set(e.plaque.x + Math.sin(e.plaque.yaw) * out, 1.02, e.plaque.z + Math.cos(e.plaque.yaw) * out);
  b.rotation.y = e.plaque.yaw;
  b.castShadow = false;
  b.name = `plaque ${e.id}`;
  site.add(b);
}

/** Enclosure dressing: nothing here is solid, and all of it stays inside its fence. */
function makeDecor(site: O) {
  // giraffe: an acacia with a flat top
  part(site, cylG(0.12, 0.2), "#7a4a2a", 1, 3.2, 1, -12, 1.6, 10.2, true);
  for (const [dx, dz, s] of [[0, 0, 1.1], [0.6, -0.3, 0.8], [-0.5, 0.35, 0.75]] as [number, number, number][]) {
    part(site, SPH, "#6bb85a", s, 0.32, s * 0.9, -12 + dx, 3.35, 10.2 + dz, true);
  }
  // elephant: a mud wallow and a log
  part(site, cylG(1.3, 1.3, 20), "#7a5a3a", 1, 0.04, 1, 2.2, 0.11, 10);
  part(site, cylG(0.9, 0.9, 16), "#6a8aa0", 1, 0.03, 1, 2.4, 0.125, 9.9);
  const log = part(site, cylG(0.22, 0.24, 10), "#8a5a32", 1, 1.8, 1, -2.2, 0.32, 10.6, true);
  log.rotation.z = Math.PI / 2;
  // lion: a big warm rock to lounge by
  const rock = part(site, ROCK, "#b8a88a", 1.4, 0.95, 1.15, 11.6, 0.55, 9.6, true);
  rock.rotation.y = 0.5;
  part(site, ROCK, "#a89878", 0.6, 0.45, 0.55, 12.6, 0.3, 7.6, true).rotation.y = 1.2;
  // zebra: a hay trough and a bush
  part(site, BOX, WOOD, 1.4, 0.5, 0.6, -12.6, 0.35, -9.4, true);
  part(site, BOX, "#e8c46a", 1.25, 0.12, 0.48, -12.6, 0.62, -9.4);
  part(site, SPH, "#4e9448", 0.8, 0.6, 0.8, -12.8, 0.5, 1.4, true);
  // monkeys: a climbing frame with a bar to hang from, a platform and a tyre swing
  for (const [x, z] of [[10.2, -5.6], [12.2, -5.6], [10.2, -3.4], [12.2, -3.4]] as [number, number][]) {
    part(site, cylG(0.08, 0.09), WOOD, 1, 2.6, 1, x, 1.3, z, true);
  }
  for (const z of [-5.6, -3.4]) part(site, BOX, RAIL, 2.2, 0.14, 0.14, 11.2, 2.52, z, true);
  part(site, cylG(0.06, 0.06), "#c8ced4", 1, 2.2, 1, 11.2, 2.52, -4.5).rotation.x = Math.PI / 2;
  part(site, BOX, RAIL, 2.1, 0.12, 0.9, 11.2, 1.2, -5.15, true);
  part(site, cylG(0.02, 0.02, 5), "#e8d7b8", 1, 1.3, 1, 10.6, 1.8, -3.4);
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.1, 8, 16), mat("#2a2724"));
  tyre.position.set(10.6, 0.95, -3.4);
  tyre.castShadow = true;
  site.add(tyre);
  part(site, BOX, "#ffc53d", 0.3, 0.1, 0.12, 12.0, 1.31, -5.3).rotation.z = 0.3;
  // penguins: ice blocks and a rim round the pool
  part(site, BOX, "#d6ecf5", 0.7, 0.45, 0.55, -1.4, 0.3, -1.3, true);
  part(site, BOX, "#e6f4fa", 0.45, 0.3, 0.45, -1.1, 0.62, -1.3);
  part(site, BOX, "#d6ecf5", 0.6, 0.4, 0.6, 3.3, 0.28, -3.8, true);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(POOL.r + 0.05, 0.1, 6, 28), mat("#c8dce6"));
  rim.rotation.x = Math.PI / 2;
  rim.position.set(POOL.x, 0.14, POOL.z);
  site.add(rim);
}

/** Where each animal lives, in the site frame, and which way it faces. */
const PLACES: { id: AnimalId; make: () => AnimalRig; x: number; z: number; yaw: number; y?: number; walk?: AnimalRig["walk"] }[] = [
  { id: "giraffe", make: makeGiraffe, x: -9.6, z: 7.6, yaw: Math.PI + 0.35 },
  { id: "elephant", make: makeElephant, x: 0, z: 7.4, yaw: Math.PI - 0.15 },
  { id: "lion", make: makeLion, x: 8.6, z: 7.2, yaw: Math.PI - 0.45 },
  { id: "zebra", make: makeZebra, x: -11.2, z: -4.2, yaw: Math.PI / 2 + 0.25 },
  // the hanger grips the bar (along z at y 2.52), facing the walk (-x); the sitter is on the platform
  { id: "monkey", make: () => makeMonkey(true, 0.4), x: 11.2, z: -4.1, y: 2.45, yaw: -Math.PI / 2 },
  { id: "monkey", make: () => makeMonkey(false, 2.2), x: 11.4, z: -5.2, y: 1.26, yaw: -Math.PI / 2 },
  { id: "penguin", make: () => makePenguin(0.3), x: -3.3, z: -4.8, yaw: 0, walk: { ax: -3.3, az: -4.8, bx: -3.3, bz: -1.2, speed: 0.55 } },
  { id: "penguin", make: () => makePenguin(1.9), x: -2.2, z: -4.7, yaw: 0, walk: { ax: -2.2, az: -4.7, bx: 3.0, bz: -4.7, speed: 0.5 } },
  { id: "penguin", make: () => makePenguin(3.4), x: 2.9, z: -1.2, yaw: Math.PI * 0.85 },
];

/** Build the whole zoo. The static parts are merged; animals and rings stay live. */
export function makeZoo(merge = true): ZooRig {
  const group = new THREE.Group();
  group.name = "zoo";
  const site = new THREE.Group();
  site.position.set(ZOO.x, 0, ZOO.z);
  site.rotation.y = ZOO.yaw;
  group.add(site);
  const textures: THREE.Texture[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  FENCE_LINES.forEach((_, i) => makeFence(site, i));
  makeArch(site, textures, geometries, materials);
  for (const e of ENCLOSURES) makePlaque(site, e, textures, geometries, materials);
  makeDecor(site);

  const animals: AnimalRig[] = [];
  for (const p of PLACES) {
    const a = p.make();
    a.group.position.set(p.x, p.y ?? 0, p.z);
    a.group.rotation.y = p.yaw;
    a.walk = p.walk ?? null;
    compactAnimal(a, geometries);
    site.add(a.group);
    animals.push(a);
  }

  const ringMat = new THREE.MeshStandardMaterial({ color: "#fff0b0", emissive: new THREE.Color("#ffc84a"), emissiveIntensity: 0.6 });
  const ringGeo = new THREE.TorusGeometry(0.55, 0.045, 6, 28);
  const rings = ENCLOSURES.map((e) => {
    const [x, z] = plaqueSpotLocal(e);
    // each ring has its own material so one can glow brighter than the rest
    const r = new THREE.Mesh(ringGeo, ringMat.clone());
    r.rotation.x = Math.PI / 2;
    r.position.set(x, 0.1, z);
    r.name = `zoo ring ${e.id}`;
    site.add(r);
    return r;
  });
  ringMat.dispose();

  geometries.push(ringGeo);
  if (merge) {
    const live = new Set<THREE.Object3D>([...animals.map((a) => a.group), ...rings]);
    geometries.push(...mergeStatic(group, { live }).geometries);
  }
  Z.t = 0;
  Z.dt = 0;
  for (const r of rings) materials.push(r.material as THREE.Material);
  const rig: ZooRig = { group, site, animals, rings, geometries, textures, materials };
  animateZoo(rig, 0, 0);
  return rig;
}

/** Animate every animal one frame. t: game clock seconds, dt: frame seconds. Allocation-free. */
export function animateZoo(rig: ZooRig, t: number, dt: number) {
  Z.t = t;
  Z.dt = dt;
  const list = rig.animals;
  for (let i = 0; i < list.length; i++) {
    const a = list[i]!;
    if (a.happyT > 0) a.happyT = Math.max(0, a.happyT - dt);
    Z.ph = HAPPY_TIME - a.happyT;
    Z.h = a.happyT > 0 ? Math.min(1, Z.ph * 4, a.happyT * 2.5) : 0;
    switch (a.id) {
      case "giraffe":
        animateGiraffe(a);
        break;
      case "elephant":
        animateElephant(a);
        break;
      case "lion":
        animateLion(a);
        break;
      case "zebra":
        animateZebra(a);
        break;
      case "monkey":
        animateMonkey(a, a.variant === 1);
        break;
      case "penguin":
        animatePenguin(a);
        break;
    }
  }
}

/** Start the happy animation for every animal of a kind. */
export function cheer(rig: ZooRig, id: AnimalId) {
  for (const a of rig.animals) if (a.id === id) a.happyT = HAPPY_TIME;
}

/* ------------------------------------------------------------------ the runtime's handle */

const COOLDOWN = 8;
const FAR = 110;

/**
 * Owned by the runtime (picnic park only):
 *
 *   this.zooWorld = new ZooWorld(this.scene, (text) => useGame.getState().setEmmettNotice(text));
 *   every frame:   this.zooWorld.update(this.clock, this.cap.x, this.cap.z);
 *   on Collect:    if (this.zooWorld?.interact()) return;
 *   on rebuild:    this.zooWorld?.dispose();
 *
 * Walking onto a glowing ring in front of a plaque makes that animal happy and
 * says its next fun fact (once per visit, then not again for 8s). Collect on
 * the ring says another. Walking in under the arch says hello.
 */
export class ZooWorld {
  rig: ZooRig;
  private nearId: AnimalId | null = null;
  private nearIndex = -1;
  private lastT = -1;
  private cheeredAt = new Float64Array(ENCLOSURES.length).fill(-Infinity);
  private factIndex = new Uint8Array(ENCLOSURES.length);
  private welcomedAt = -Infinity;
  private wasInside = false;

  constructor(
    private scene: THREE.Scene,
    private say: (text: string) => void,
  ) {
    this.rig = makeZoo();
    scene.add(this.rig.group);
  }

  dispose() {
    this.scene.remove(this.rig.group);
    for (const g of this.rig.geometries) g.dispose();
    for (const t of this.rig.textures) t.dispose();
    for (const m of this.rig.materials) m.dispose();
  }

  /** The enclosure whose plaque ring she is standing on, or null. */
  near(): AnimalId | null {
    return this.nearId;
  }

  /** Collect pressed: at a plaque, cheer and say another fact. Returns true if it did something. */
  interact(): boolean {
    if (this.nearIndex < 0) return false;
    this.trigger(this.nearIndex, this.lastT);
    return true;
  }

  /** Inside the zoo's fence line. */
  inZoo(x: number, z: number): boolean {
    return Math.abs(x - ZOO.x) < ZOO.w / 2 && Math.abs(z - ZOO.z) < ZOO.d / 2;
  }

  /**
   * A safety net: if she is ever inside an enclosure (the no-jump zone should
   * make that impossible), where to put her back on the walk, else null.
   */
  escapeFrom(x: number, z: number): [number, number] | null {
    const [lx, lz] = worldToZoo(x, z);
    const e = enclosureAtLocal(lx, lz, 0.1);
    if (!e) return null;
    return zooToWorld(...plaqueSpotLocal(e));
  }

  private trigger(i: number, t: number) {
    const e = ENCLOSURES[i]!;
    this.cheeredAt[i] = t;
    cheer(this.rig, e.id);
    const k = this.factIndex[i]!;
    this.factIndex[i] = (k + 1) % e.facts.length;
    this.say(`${e.name}: ${e.facts[k]}`);
  }

  /** Every frame. t: game clock seconds; her position. */
  update(t: number, herX: number, herZ: number) {
    const dt = this.lastT < 0 ? 0 : Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;
    const lx = ZOO.x - herX;
    const lz = ZOO.z - herZ;
    const far = lx * lx + lz * lz > FAR * FAR;
    if (!far) animateZoo(this.rig, t, dt);

    let best = -1;
    let bestD = SPOT_R;
    for (let i = 0; i < ENCLOSURES.length; i++) {
      const ring = this.rig.rings[i]!;
      const d = Math.hypot(lx - ring.position.x, lz - ring.position.z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    for (let i = 0; i < ENCLOSURES.length; i++) {
      const ring = this.rig.rings[i]!;
      const m = ring.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = (i === best ? 1.4 : 0.45) + Math.sin(t * 3 + i) * 0.2;
      ring.position.y = 0.1 + Math.sin(t * 2.4 + i) * 0.02;
    }
    if (best >= 0 && best !== this.nearIndex && t - this.cheeredAt[best]! > COOLDOWN) this.trigger(best, t);
    this.nearIndex = best;
    this.nearId = best >= 0 ? ENCLOSURES[best]!.id : null;

    // hello as she walks in under the arch
    const inside = this.inZoo(herX, herZ);
    if (inside && !this.wasInside && Math.abs(lx) < ARCH.postX + 1 && lz < -ZOO.d / 2 + 3 && t - this.welcomedAt > 60) {
      this.welcomedAt = t;
      this.say("Welcome to Sloanie's Zoo! Walk up to a sign to meet the animals.");
    }
    this.wasInside = inside;
  }
}
