import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { boxGeo, cylGeo, lam, mesh, sphereGeo } from "./meshes";
import { bannerTexture } from "./signs";
import type { Prop } from "./types";

/**
 * The arrival plaza, round the spawn at (0, 0, 22).
 *
 * She lands on a round paved plaza with a striped carnival pole in the middle,
 * bunting running out to eight lamp posts, flower planters, benches, a popcorn
 * cart and a balloon cart, and a welcome arch over the midway behind her. The
 * midway runs south from here to the carnival and the ferris wheel; the
 * crossroads at the north edge (walkways.ts) leads everywhere else.
 *
 * Split the usual way: `plazaProps` is what the engine makes solid and what
 * the placement map, the grass mask and the minimap see; `makeArrivalPlaza`
 * is the look, and adds no colliders. Every drawn shape encloses its prop, so
 * nothing here is an invisible wall.
 */

export const PLAZA = { x: 0, z: 14, r: 10 };
/** Top of the paving props; the drawn disc sits 2cm over them. */
export const PLAZA_TOP = 0.03;
const DISC_Y = 0.05;

const PAVE = "#cfc6b4";
const LAMP_C = "#2f5e4e";
const PLANTER_C = "#c9825a";

/**
 * The lamp posts the bunting hangs from: six round the rim, skipping due
 * north and due south so nothing stands in the way she walks in and out, and
 * none of them within 6m of where she lands.
 */
const LAMP_R = 9.0;
const LAMP_ANGLES = [0, 45, 135, 180, 225, 315];
const LAMPS: [number, number][] = LAMP_ANGLES.map((deg) => {
  const a = (deg * Math.PI) / 180;
  return [PLAZA.x + Math.cos(a) * LAMP_R, PLAZA.z + Math.sin(a) * LAMP_R];
});
const LAMP_H = 3.5;

/** Benches: axis-aligned, backs out, facing the middle. */
const BENCHES: [number, number, number][] = [
  [-6.9, 10.5, 1],
  [-6.9, 17.5, 1],
  [6.9, 10.5, -1],
  [6.9, 17.5, -1],
];

/** Flower planters flanking the two ways in and out. */
const PLANTERS: [number, number][] = [
  [-5.0, 7.8],
  [5.0, 7.8],
  [-5.0, 20.2],
  [5.0, 20.2],
];

/**
 * Lamp posts down the midway behind her, with bunting strung across it, so
 * the way to the carnival reads as a midway from the moment she lands.
 * They stand 1.1m clear of the path's edging on both sides, and clear in z of
 * the flower garden's spur, which leaves the midway between them at z 31.
 */
const MIDWAY_LAMP_Z = [28.6, 34.6];
const MIDWAY_LAMPS: [number, number][] = MIDWAY_LAMP_Z.flatMap(
  (z) => [[-3.6, z], [3.6, z]] as [number, number][],
);

const POPCORN: [number, number] = [-6.4, 17.6];
const BALLOONS: [number, number] = [6.4, 17.6];

/** The welcome arch over the midway, just south of where she lands. */
const ARCH = { z: 25.6, halfW: 3.0, h: 4.6 };

const POLE_H = 7.6;

function box(
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  color: string,
  collide = true,
): Prop {
  return { kind: "box", pos: [x, y, z], size: [sx, sy, sz], color, collide };
}

/** Paving as bands across the circle, each one inside it, none overlapping. */
function pavingBands(): Prop[] {
  const out: Prop[] = [];
  const n = 13;
  const dz = (PLAZA.r * 2) / n;
  const h = PLAZA_TOP + 0.1;
  for (let i = 0; i < n; i++) {
    const z0 = PLAZA.z - PLAZA.r + i * dz;
    const z1 = z0 + dz;
    const far = Math.max(Math.abs(z0 - PLAZA.z), Math.abs(z1 - PLAZA.z));
    const halfW = Math.sqrt(Math.max(0, PLAZA.r * PLAZA.r - far * far));
    if (halfW < 0.4) continue;
    out.push({
      kind: "box",
      pos: [PLAZA.x, PLAZA_TOP - h / 2, (z0 + z1) / 2],
      size: [halfW * 2, h, dz],
      color: PAVE,
      collide: false,
    });
  }
  return out;
}

/** Everything solid on the plaza. */
export function plazaProps(): Prop[] {
  const out: Prop[] = [...pavingBands()];

  // the middle: a round planter with the pole standing in it. Both colliders
  // sit inside the drawn shapes (planter r 2.2, pole r 0.26).
  out.push(box(PLAZA.x, 0.35, PLAZA.z, 3.0, 0.7, 3.0, PLANTER_C));
  out.push(box(PLAZA.x, 0.7 + (POLE_H - 0.7) / 2, PLAZA.z, 0.36, POLE_H - 0.7, 0.36, "#e8455f"));

  for (const [x, z] of [...LAMPS, ...MIDWAY_LAMPS]) out.push(box(x, LAMP_H / 2, z, 0.24, LAMP_H, 0.24, LAMP_C));

  for (const [x, z] of BENCHES) out.push(box(x, 0.45, z, 0.8, 0.2, 3.2, "#c49a62"));

  for (const [x, z] of PLANTERS) out.push(box(x, 0.3, z, 1.5, 0.6, 1.5, PLANTER_C));

  // carts: one solid body each, hidden inside the drawn cart
  out.push(box(POPCORN[0], 0.55, POPCORN[1], 1.9, 1.1, 1.2, "#e8455f"));
  out.push(box(BALLOONS[0], 0.55, BALLOONS[1], 1.6, 1.1, 1.1, "#4f93c4"));

  // the welcome arch's legs
  for (const s of [-1, 1]) {
    out.push(box(s * ARCH.halfW, ARCH.h / 2, ARCH.z, 0.3, ARCH.h, 0.3, "#e8455f"));
  }

  return out;
}

/* ------------------------------------------------------------------- look */

function pavingTexture() {
  const px = 1024;
  const c = document.createElement("canvas");
  c.width = px;
  c.height = px;
  const g = c.getContext("2d")!;
  const mid = px / 2;
  g.fillStyle = "#e4dac4";
  g.fillRect(0, 0, px, px);

  // ring of paving stones, drawn in rings of wedges
  const rings = [1, 0.84, 0.68, 0.52, 0.36, 0.22];
  for (let r = 0; r < rings.length - 1; r++) {
    const outer = (rings[r]! * px) / 2;
    const inner = (rings[r + 1]! * px) / 2;
    const wedges = Math.max(8, Math.round(outer / 14));
    for (let i = 0; i < wedges; i++) {
      const a0 = (i / wedges) * Math.PI * 2;
      const a1 = ((i + 1) / wedges) * Math.PI * 2;
      const warm = (i + r) % 2 === 0;
      g.fillStyle = r % 2 === 0 ? (warm ? "#ded3bb" : "#d5c9ae") : warm ? "#e6dcc6" : "#dbd0b6";
      g.beginPath();
      g.arc(mid, mid, outer - 2, a0 + 0.01, a1 - 0.01);
      g.arc(mid, mid, inner + 2, a1 - 0.01, a0 + 0.01, true);
      g.closePath();
      g.fill();
    }
  }

  // two painted rings and a star in the middle, so it reads as a proper plaza
  for (const [rad, col, width] of [
    [0.845, "#e8455f", 0.022],
    [0.53, "#2f7d5b", 0.018],
  ] as [number, number | string, number][]) {
    g.strokeStyle = col as string;
    g.lineWidth = (width as number) * px;
    g.beginPath();
    g.arc(mid, mid, ((rad as number) * px) / 2, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = "#ffc53d";
  const points = 8;
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = (i % 2 === 0 ? 0.2 : 0.09) * px;
    const fn = i === 0 ? "moveTo" : "lineTo";
    g[fn](mid + Math.cos(a) * rr, mid + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/**
 * One globe material and one striped-pole material for the whole plaza.
 * Building them inside the loop gave every lamp a material of its own, and a
 * material of its own is a draw call of its own: ten lamps, the pole and the
 * two arch legs were thirteen calls in the view she spends the most time in.
 */
let globeMat: THREE.MeshStandardMaterial | null = null;
function lampGlobeMaterial() {
  if (!globeMat) {
    globeMat = new THREE.MeshStandardMaterial({
      color: "#fff3c4",
      emissive: new THREE.Color("#ffe9a8"),
      emissiveIntensity: 0.85,
      roughness: 0.3,
    });
  }
  return globeMat;
}
let stripeMat: THREE.MeshStandardMaterial | null = null;
function stripedMaterial() {
  if (!stripeMat) stripeMat = new THREE.MeshStandardMaterial({ map: poleStripes(), roughness: 0.4 });
  return stripeMat;
}

function lamp(x: number, z: number, g: THREE.Group) {
  g.add(mesh(cylGeo, LAMP_C, 0.34, 0.22, 0.34, x, 0.11, z, false));
  g.add(mesh(boxGeo, LAMP_C, 0.24, LAMP_H, 0.24, x, LAMP_H / 2, z));
  // lantern: a glass globe on a little collar, under a cap
  g.add(mesh(cylGeo, "#ffc53d", 0.22, 0.12, 0.22, x, LAMP_H + 0.05, z, false));
  const globe = new THREE.Mesh(sphereGeo, lampGlobeMaterial());
  globe.scale.setScalar(0.3);
  globe.position.set(x, LAMP_H + 0.34, z);
  g.add(globe);
  g.add(mesh(cylGeo, LAMP_C, 0.26, 0.14, 0.26, x, LAMP_H + 0.62, z, false));
  // pennant on top
  const flag = mesh(boxGeo, "#e8455f", 0.5, 0.3, 0.04, x + 0.25, LAMP_H + 0.9, z, false);
  g.add(mesh(boxGeo, "#c9825a", 0.06, 0.6, 0.06, x, LAMP_H + 0.85, z, false));
  g.add(flag);
}

/** A string of triangular flags between two points, sagging in the middle. */
function bunting(
  from: [number, number, number],
  to: [number, number, number],
  colors: string[],
  out: Map<string, THREE.BufferGeometry[]>,
) {
  const span = Math.hypot(to[0] - from[0], to[2] - from[2]);
  const n = Math.max(3, Math.round(span / 1.5));
  const sag = Math.min(1.2, span * 0.08);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = from[0] + (to[0] - from[0]) * t;
    const z = from[2] + (to[2] - from[2]) * t;
    const y = from[1] + (to[1] - from[1]) * t - Math.sin(t * Math.PI) * sag;
    const geo = new THREE.ConeGeometry(0.22, 0.5, 3);
    geo.rotateX(Math.PI);
    geo.rotateY(Math.atan2(to[0] - from[0], to[2] - from[2]));
    geo.translate(x, y - 0.25, z);
    const col = colors[i % colors.length]!;
    const list = out.get(col) ?? [];
    list.push(geo);
    out.set(col, list);
  }
}

function cart(g: THREE.Group, x: number, z: number, kind: "popcorn" | "balloons") {
  if (kind === "popcorn") {
    g.add(mesh(boxGeo, "#e8455f", 1.9, 0.9, 1.2, x, 0.75, z));
    g.add(mesh(boxGeo, "#fff4e8", 1.95, 0.12, 1.25, x, 1.26, z, false));
    // striped canopy on four little posts
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      g.add(mesh(boxGeo, "#fff4e8", 0.07, 1.0, 0.07, x + sx * 0.85, 1.8, z + sz * 0.5, false));
    }
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(1.5, 0.6, 4),
      new THREE.MeshStandardMaterial({ color: "#e8455f", roughness: 0.6 }),
    );
    roof.rotation.y = Math.PI / 4;
    roof.position.set(x, 2.6, z);
    roof.castShadow = true;
    g.add(roof);
    // popcorn spilling out of a striped box on the counter
    g.add(mesh(boxGeo, "#fff4e8", 0.5, 0.5, 0.4, x + 0.5, 1.55, z, false));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      g.add(
        mesh(sphereGeo, "#fff3c4", 0.09, 0.09, 0.09, x + 0.5 + Math.cos(a) * 0.18, 1.82 + (i % 3) * 0.05, z + Math.sin(a) * 0.15, false),
      );
    }
    for (const sx of [-1, 1]) g.add(mesh(cylGeo, "#3a3531", 0.3, 0.12, 0.3, x + sx * 0.7, 0.3, z + 0.62, false));
  } else {
    g.add(mesh(boxGeo, "#4f93c4", 1.6, 0.9, 1.1, x, 0.75, z));
    g.add(mesh(boxGeo, "#fff4e8", 1.65, 0.12, 1.15, x, 1.26, z, false));
    g.add(mesh(boxGeo, "#c9825a", 0.1, 1.9, 0.1, x + 0.6, 2.2, z, false));
    const cols = ["#e8455f", "#ffc53d", "#4f93c4", "#3fa35c", "#d47a96"];
    cols.forEach((c, i) => {
      const a = (i / cols.length) * Math.PI * 2;
      const bx = x + 0.6 + Math.cos(a) * 0.5;
      const bz = z + Math.sin(a) * 0.45;
      const by = 3.25 + (i % 2) * 0.28;
      const b = mesh(sphereGeo, c, 0.34, 0.4, 0.34, bx, by, bz, false);
      g.add(b);
      g.add(mesh(boxGeo, "#fff4e8", 0.03, by - 3.1, 0.03, bx, (by + 3.1) / 2 - 0.2, bz, false));
    });
    for (const sx of [-1, 1]) g.add(mesh(cylGeo, "#3a3531", 0.28, 0.12, 0.28, x + sx * 0.55, 0.28, z + 0.56, false));
  }
}

function bench(g: THREE.Group, x: number, z: number, facing: number) {
  g.add(mesh(boxGeo, "#c49a62", 0.8, 0.2, 3.2, x, 0.45, z));
  g.add(mesh(boxGeo, "#c49a62", 0.16, 0.7, 3.2, x - facing * 0.32, 0.85, z, false));
  for (const s of [-1, 1]) {
    g.add(mesh(boxGeo, "#6a7a80", 0.6, 0.45, 0.2, x, 0.22, z + s * 1.4, false));
  }
}

function planter(g: THREE.Group, x: number, z: number, r: number) {
  g.add(mesh(cylGeo, PLANTER_C, r, 0.62, r, x, 0.31, z));
  g.add(mesh(cylGeo, "#b06a48", r + 0.08, 0.12, r + 0.08, x, 0.66, z, false));
  g.add(mesh(cylGeo, "#5a4632", r - 0.12, 0.1, r - 0.12, x, 0.68, z, false));
  const cols = ["#e8455f", "#ffc53d", "#d47a96", "#fff4e8", "#b98ce0"];
  const n = Math.round(r * 7);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.3 + ((i * 7) % 5) / 9);
    const fx = x + Math.cos(a) * rr;
    const fz = z + Math.sin(a) * rr;
    const fy = 0.78 + ((i * 3) % 4) * 0.06;
    g.add(mesh(cylGeo, "#3f9a6b", 0.04, 0.3, 0.04, fx, fy - 0.1, fz, false));
    g.add(mesh(sphereGeo, cols[i % cols.length]!, 0.13, 0.1, 0.13, fx, fy + 0.08, fz, false));
  }
}

export function makeArrivalPlaza() {
  const g = new THREE.Group();

  // paving
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(PLAZA.r, 64),
    new THREE.MeshStandardMaterial({ map: pavingTexture(), roughness: 0.9 }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(PLAZA.x, DISC_Y, PLAZA.z);
  disc.receiveShadow = true;
  g.add(disc);

  // middle: planter, striped pole, welcome boards, star
  planter(g, PLAZA.x, PLAZA.z, 2.2);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, POLE_H - 0.6, 16), stripedMaterial());
  pole.position.set(PLAZA.x, 0.6 + (POLE_H - 0.6) / 2, PLAZA.z);
  pole.castShadow = true;
  g.add(pole);

  // Thick enough that the striped pole passes BEHIND both faces: a thin board
  // centred on the pole put a stripe of pole right across her name.
  const banner = painted(5.6, 1.4, "#b8323f", "Sloanie's World", "#e8455f", "Sloanie's World", 0.74);
  banner.position.set(PLAZA.x, 5.7, PLAZA.z);
  g.add(banner);

  const star = new THREE.Mesh(
    new THREE.ConeGeometry(0.62, 0.9, 5),
    new THREE.MeshStandardMaterial({ color: "#ffc53d", emissive: new THREE.Color("#ffb020"), emissiveIntensity: 0.35, roughness: 0.3 }),
  );
  star.position.set(PLAZA.x, POLE_H + 0.35, PLAZA.z);
  g.add(star);
  g.add(mesh(sphereGeo, "#ffc53d", 0.34, 0.34, 0.34, PLAZA.x, POLE_H - 0.15, PLAZA.z, false));

  for (const [x, z] of [...LAMPS, ...MIDWAY_LAMPS]) lamp(x, z, g);
  for (const [x, z, facing] of BENCHES) bench(g, x, z, facing);
  for (const [x, z] of PLANTERS) planter(g, x, z, 0.75);
  cart(g, POPCORN[0], POPCORN[1], "popcorn");
  cart(g, BALLOONS[0], BALLOONS[1], "balloons");

  // the welcome arch over the midway
  for (const s of [-1, 1]) {
    const x = s * ARCH.halfW;
    g.add(mesh(cylGeo, "#c9825a", 0.42, 0.24, 0.42, x, 0.12, ARCH.z, false));
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.24, ARCH.h, 14), stripedMaterial());
    leg.position.set(x, ARCH.h / 2, ARCH.z);
    leg.castShadow = true;
    g.add(leg);
    g.add(mesh(sphereGeo, "#ffc53d", 0.26, 0.26, 0.26, x, ARCH.h + 0.9, ARCH.z, false));
  }
  g.add(mesh(boxGeo, "#2f7d5b", ARCH.halfW * 2 + 0.9, 0.24, 0.45, 0, ARCH.h + 0.12, ARCH.z, false));
  // +z faces south, where she walks up from the carnival: that side welcomes
  // her in, and the north side (facing the plaza) points the way out
  const archBanner = painted(ARCH.halfW * 2 + 0.6, 1.25, "#245f46", "Sloanie's World", "#2f7d5b", "Carnival Midway");
  archBanner.position.set(0, ARCH.h + 0.85, ARCH.z);
  g.add(archBanner);

  // bunting: pole to every lamp, and lamp to lamp round the rim
  const strings = new Map<string, THREE.BufferGeometry[]>();
  const flagCols = ["#e8455f", "#ffc53d", "#4f93c4", "#3fa35c", "#fff4e8"];
  for (const [x, z] of LAMPS) {
    bunting([PLAZA.x, POLE_H - 0.6, PLAZA.z], [x, LAMP_H + 0.5, z], flagCols, strings);
  }
  for (let i = 0; i < LAMPS.length; i++) {
    const a = LAMPS[i]!;
    const b = LAMPS[(i + 1) % LAMPS.length]!;
    bunting([a[0], LAMP_H + 0.45, a[1]], [b[0], LAMP_H + 0.45, b[1]], flagCols, strings);
  }
  // and across the arch
  bunting([-ARCH.halfW, ARCH.h - 0.2, ARCH.z], [ARCH.halfW, ARCH.h - 0.2, ARCH.z], flagCols, strings);
  // down the midway: across between each facing pair, and along each side
  for (const z of MIDWAY_LAMP_Z) {
    bunting([-3.6, LAMP_H + 0.45, z], [3.6, LAMP_H + 0.45, z], flagCols, strings);
  }
  for (const x of [-3.6, 3.6]) {
    bunting([x, LAMP_H + 0.45, MIDWAY_LAMP_Z[0]!], [x, LAMP_H + 0.45, MIDWAY_LAMP_Z[1]!], flagCols, strings);
  }
  for (const [color, geos] of strings) {
    const merged = mergeAll(geos);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, lam(color, { flat: true, roughness: 0.75 }));
    m.castShadow = false;
    m.receiveShadow = true;
    g.add(m);
  }

  return g;
}

/**
 * A painted banner: a plain box with a printed plane pinned to each side, so
 * the body merges with the rest of the park and only the two faces cost a
 * draw call. `front` is the +z (south) side.
 */
function painted(w: number, h: number, body: string, front: string, bg: string, back?: string, depth = 0.16) {
  const g = new THREE.Group();
  g.add(mesh(boxGeo, body, w, h, depth, 0, 0, 0));
  const quad = (z: number, turn: boolean) => {
    const geo = new THREE.PlaneGeometry(w - 0.05, h - 0.05);
    if (turn) geo.rotateY(Math.PI);
    geo.translate(0, 0, z);
    return geo;
  };
  const paint = (text: string, geos: THREE.BufferGeometry[]) => {
    const geo = geos.length > 1 ? mergeGeometries(geos, false)! : geos[0]!;
    if (geos.length > 1) for (const gg of geos) gg.dispose();
    g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: bannerTexture(text, w, h, bg), roughness: 0.6 })));
  };
  const zf = depth / 2 + 0.01;
  // the same words on both sides is one texture and one draw call, not two
  if (back === front) paint(front, [quad(zf, false), quad(-zf, true)]);
  else {
    paint(front, [quad(zf, false)]);
    if (back) paint(back, [quad(-zf, true)]);
  }
  return g;
}

function mergeAll(geos: THREE.BufferGeometry[]) {
  if (!geos.length) return null;
  const parts = geos.map((x) => x.toNonIndexed());
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  for (const p of parts) {
    const a = p.attributes.position as THREE.BufferAttribute;
    const n = p.attributes.normal as THREE.BufferAttribute;
    const u = p.attributes.uv as THREE.BufferAttribute | undefined;
    for (let i = 0; i < a.count; i++) {
      pos.push(a.getX(i), a.getY(i), a.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
    }
    p.dispose();
  }
  for (const gg of geos) gg.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

function poleStripes() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const g = c.getContext("2d")!;
  for (let i = 0; i < 16; i++) {
    g.fillStyle = i % 2 ? "#fff4e8" : "#e8455f";
    g.fillRect(0, (i * 256) / 16, 64, 256 / 16 + 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
