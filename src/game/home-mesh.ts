import * as THREE from "three";
import { beveledBox } from "./beveled";
import type { AABB } from "./collision";
import {
  SPOTS,
  canvasMaterial,
  furnitureDef,
  furnitureSolid,
  glowMaterial,
  makeFurniture,
  starterFurniture,
  surfaceMaterial,
  type FurnitureId,
  type SpotId,
} from "./furniture";
import { lam } from "./meshes";

/**
 * Sloan's clubhouse: one room, bedroom and den together.
 *
 * Local frame: floor at y 0, the room's inside spans x -5..5 and z -4..4, the
 * ceiling is at 3.4. Walls are 0.3m thick OUTSIDE that span (so the outer
 * shell is 10.6 x 8.6). The front door is in the middle of the +z wall, the
 * window in the -z wall.
 *
 *            -z (back wall, window)
 *     +---------------------------------+
 *     | BED        LAMP   [window]  PLANT|
 *     |                                 |
 *  PIC|                               WP| (wallpaper sample, right wall)
 *     |           ( RUG )      TABLE    |
 *     |                                 |
 *     | FLOOR                   PET BED |
 *     +--------------[door]-------------+
 *            +z (front wall)
 *
 * Yaw. A spot's yaw is the rotation.y of its furniture group: local +z (the
 * piece's front) points along (sin yaw, 0, cos yaw), and "in front of the
 * spot" is 1m along that. HOME_ENTRY.yaw is the PLAYER's yaw, which uses the
 * runtime's convention (0 faces -z).
 */

export const HOME = { width: 10, depth: 8, height: 3.4 };
const WALL = 0.3;
/** beams hang to here; the ceiling collider starts here so her head never enters them */
const BEAM_BOTTOM = 3.22;
const WINDOW = { x0: 0, x1: 1.6, y0: 1.15, y1: 2.35 };
const DOOR = { hw: 0.6, h: 2.3 };

export const HOME_SPOTS: Record<SpotId, { pos: [number, number, number]; yaw: number }> = {
  bed: { pos: [-3.9, 0, -3.35], yaw: 0 },
  lamp: { pos: [-2.0, 0, -3.5], yaw: 0 },
  curtains: { pos: [(WINDOW.x0 + WINDOW.x1) / 2, (WINDOW.y0 + WINDOW.y1) / 2, -4], yaw: 0 },
  plant: { pos: [4.4, 0, -3.4], yaw: 0 },
  wallpaper: { pos: [5, 1.6, -0.5], yaw: -Math.PI / 2 },
  picture: { pos: [-5, 1.65, 0.2], yaw: Math.PI / 2 },
  rug: { pos: [0, 0, 0.4], yaw: 0 },
  table: { pos: [3.0, 0, 0.8], yaw: -Math.PI / 2 },
  petbed: { pos: [4.4, 0, 3.3], yaw: -Math.PI / 2 },
  floor: { pos: [-2.6, 0, 2.4], yaw: 0 },
};

export const HOME_ENTRY: { spawn: [number, number, number]; yaw: number; door: [number, number, number] } = {
  spawn: [0, 0, 2.5],
  yaw: 0,
  /** where she stands at the door, just clear of the front wall */
  door: [0, 0, 3.6],
};

/** Marker offsets in each spot's local frame. */
const MARKER_AT: Record<SpotId, [number, number, number]> = {
  bed: [0, 1.55, 0.85],
  lamp: [0, 1.45, 0],
  curtains: [0, 1.12, 0.2],
  plant: [0, 1.55, 0],
  wallpaper: [0, 0, 0.3],
  picture: [0, 0.64, 0.25],
  rug: [0, 0.5, 0],
  table: [0, 1.25, 0],
  petbed: [0, 1.2, 0],
  floor: [0, 0.35, 0],
};

function isQuarterTurned(yaw: number) {
  return Math.abs(Math.sin(yaw)) > 0.5;
}

/** Spot-local point to room-local, for a group at pos rotated by yaw. */
function spotToRoom(spot: SpotId, p: [number, number, number]): [number, number, number] {
  const { pos, yaw } = HOME_SPOTS[spot];
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [pos[0] + p[0] * c + p[2] * s, pos[1] + p[1], pos[2] - p[0] * s + p[2] * c];
}

/**
 * Solid boxes in room-local coordinates: the four walls (outside the room
 * span), a ceiling slab from the bottom of the beams, and the solid footprint
 * of the bed, lamp, plant, table and pet bed. Rugs, wallpaper, floor, curtains
 * and pictures have none. There is no floor box: add one under y 0.
 *
 * Footprints are the same for every option at a spot except the pet bed's
 * height (cushion 0.24, basket 0.36, doghouse 0.86). Pass the placed furniture
 * to get the pet bed right; without it the starter pieces are assumed.
 */
export function homeColliders(furniture?: Partial<Record<SpotId, FurnitureId>>): AABB[] {
  const hx = HOME.width / 2;
  const hz = HOME.depth / 2;
  const top = HOME.height + WALL;
  const out: AABB[] = [
    { minX: -hx - WALL, maxX: hx + WALL, minY: 0, maxY: top, minZ: -hz - WALL, maxZ: -hz },
    { minX: -hx - WALL, maxX: hx + WALL, minY: 0, maxY: top, minZ: hz, maxZ: hz + WALL },
    { minX: -hx - WALL, maxX: -hx, minY: 0, maxY: top, minZ: -hz - WALL, maxZ: hz + WALL },
    { minX: hx, maxX: hx + WALL, minY: 0, maxY: top, minZ: -hz - WALL, maxZ: hz + WALL },
    { minX: -hx, maxX: hx, minY: BEAM_BOTTOM, maxY: top, minZ: -hz, maxZ: hz },
  ];
  const starters = starterFurniture();
  for (const { id: spot } of SPOTS) {
    const solid = furnitureSolid(furniture?.[spot] ?? starters[spot]);
    if (!solid) continue;
    const { pos, yaw } = HOME_SPOTS[spot];
    const [w, d] = isQuarterTurned(yaw) ? [solid.d, solid.w] : [solid.w, solid.d];
    out.push({ minX: pos[0] - w / 2, maxX: pos[0] + w / 2, minY: 0, maxY: solid.h, minZ: pos[2] - d / 2, maxZ: pos[2] + d / 2 });
  }
  return out;
}

export type HomeRig = {
  group: THREE.Group;
  /** replace the furniture at a spot (disposes nothing shared) */
  setSpot: (spot: SpotId, id: FurnitureId) => void;
  /** little glowing markers over each spot, which the runtime shows when she's near */
  markers: Record<SpotId, THREE.Object3D>;
};

const flat = (c: string, roughness = 0.7) => lam(c, { flat: true, roughness });

function part(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material | THREE.Material[],
  s: [number, number, number],
  p: [number, number, number],
  shadow = false,
) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(s[0], s[1], s[2]);
  m.position.set(p[0], p[1], p[2]);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

const shellCache = new Map<string, THREE.BufferGeometry>();
function shellGeo(key: string, make: () => THREE.BufferGeometry) {
  let g = shellCache.get(key);
  if (!g) {
    g = make();
    shellCache.set(key, g);
  }
  return g;
}
const unitBox = () => shellGeo("box", () => new THREE.BoxGeometry(1, 1, 1));

/** A box by its min and max corners, from the shared unit cube. */
function slab(parent: THREE.Object3D, mat: THREE.Material, min: [number, number, number], max: [number, number, number]) {
  return part(
    parent,
    unitBox(),
    mat,
    [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
  );
}

/** A wall's inner face: a shape in metres (so UVs are metres), with an optional hole. */
function wallFace(w: number, h: number, opening?: { x0: number; x1: number; y0: number; y1: number }) {
  const hw = w / 2;
  const s = new THREE.Shape();
  if (opening && opening.y0 <= 0) {
    // a doorway notched out of the bottom edge
    s.moveTo(-hw, 0);
    s.lineTo(opening.x0, 0);
    s.lineTo(opening.x0, opening.y1);
    s.lineTo(opening.x1, opening.y1);
    s.lineTo(opening.x1, 0);
    s.lineTo(hw, 0);
    s.lineTo(hw, h);
    s.lineTo(-hw, h);
    s.closePath();
  } else {
    s.moveTo(-hw, 0);
    s.lineTo(hw, 0);
    s.lineTo(hw, h);
    s.lineTo(-hw, h);
    s.closePath();
    if (opening) {
      const hole = new THREE.Path();
      hole.moveTo(opening.x0, opening.y0);
      hole.lineTo(opening.x0, opening.y1);
      hole.lineTo(opening.x1, opening.y1);
      hole.lineTo(opening.x1, opening.y0);
      hole.closePath();
      s.holes.push(hole);
    }
  }
  return new THREE.ShapeGeometry(s);
}

function makeMarker(): THREE.Group {
  const g = new THREE.Group();
  const gem = new THREE.Mesh(
    shellGeo("marker-gem", () => new THREE.OctahedronGeometry(1, 0)),
    glowMaterial("#ffd84a", 1.2, 0.3),
  );
  gem.scale.set(0.1, 0.15, 0.1);
  g.add(gem);
  const halo = new THREE.Mesh(
    shellGeo("marker-halo", () => new THREE.TorusGeometry(1, 0.1, 4, 16)),
    glowMaterial("#fff4c8", 0.9, 0.3),
  );
  halo.scale.setScalar(0.17);
  halo.rotation.x = Math.PI / 2;
  halo.position.y = -0.2;
  g.add(halo);
  return g;
}

/**
 * Build the room shell (floor, four walls with a window and a front door,
 * ceiling with beams, skirting, warm emissive ceiling light panels, a welcome
 * mat inside the door) with the given starting furniture per spot.
 *
 * Every geometry and material is cached and shared, so the rig can be rebuilt
 * or its furniture swapped without disposing anything. The shell casts no
 * shadows (a closed box would black out the room under the sun); furniture
 * casts and receives. Markers start hidden.
 */
export function makeHome(initial: Record<SpotId, FurnitureId>): HomeRig {
  const group = new THREE.Group();
  group.name = "home";
  const W = HOME.width;
  const D = HOME.depth;
  const H = HOME.height;
  const hx = W / 2;
  const hz = D / 2;
  const starters = starterFurniture();
  const current = {} as Record<SpotId, FurnitureId>;
  for (const { id } of SPOTS) {
    const want = initial?.[id];
    current[id] = want && furnitureDef(want)?.spot === id ? want : starters[id];
  }

  // floor and wall faces carry the chosen surface materials
  const floor = new THREE.Mesh(
    shellGeo("floor", () => {
      const s = new THREE.Shape();
      s.moveTo(-hx, -hz);
      s.lineTo(hx, -hz);
      s.lineTo(hx, hz);
      s.lineTo(-hx, hz);
      s.closePath();
      return new THREE.ShapeGeometry(s);
    }),
    surfaceMaterial(current.floor),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = "home-floor";
  group.add(floor);

  const walls: THREE.Mesh[] = [];
  const wallMat = surfaceMaterial(current.wallpaper);
  const face = (geo: THREE.BufferGeometry, x: number, z: number, yaw: number) => {
    const m = new THREE.Mesh(geo, wallMat);
    m.position.set(x, 0, z);
    m.rotation.y = yaw;
    m.receiveShadow = true;
    m.name = "home-wall";
    group.add(m);
    walls.push(m);
  };
  face(shellGeo("wall-back", () => wallFace(W, H, WINDOW)), 0, -hz, 0);
  face(shellGeo("wall-front", () => wallFace(W, H, { x0: -DOOR.hw, x1: DOOR.hw, y0: 0, y1: DOOR.h })), 0, hz, Math.PI);
  face(shellGeo("wall-side", () => wallFace(D, H)), -hx, 0, Math.PI / 2);
  face(shellGeo("wall-side", () => wallFace(D, H)), hx, 0, -Math.PI / 2);

  // the outer shell: log walls a hair behind the faces, floor slab and roof
  const logs = flat("#8a5a32", 0.85);
  const T = WALL;
  const e = 0.01;
  const top = H + T;
  slab(group, logs, [-hx - T, 0, -hz - T], [WINDOW.x0, top, -hz - e]);
  slab(group, logs, [WINDOW.x1, 0, -hz - T], [hx + T, top, -hz - e]);
  slab(group, logs, [WINDOW.x0, 0, -hz - T], [WINDOW.x1, WINDOW.y0, -hz - e]);
  slab(group, logs, [WINDOW.x0, WINDOW.y1, -hz - T], [WINDOW.x1, top, -hz - e]);
  slab(group, logs, [-hx - T, 0, hz + e], [-DOOR.hw, top, hz + T]);
  slab(group, logs, [DOOR.hw, 0, hz + e], [hx + T, top, hz + T]);
  slab(group, logs, [-DOOR.hw, DOOR.h, hz + e], [DOOR.hw, top, hz + T]);
  slab(group, logs, [-hx - T, 0, -hz], [-hx - e, top, hz]);
  slab(group, logs, [hx + e, 0, -hz], [hx + T, top, hz]);
  slab(group, logs, [-hx - T, -T, -hz - T], [hx + T, -e, hz + T]);
  slab(group, logs, [-hx - T, H + e, -hz - T], [hx + T, top, hz + T]);

  // ceiling, beams and warm light panels between them
  const ceiling = new THREE.Mesh(shellGeo("ceiling", () => new THREE.PlaneGeometry(W, D)), flat("#f4e6ca", 0.9));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = H;
  group.add(ceiling);
  const beamMat = flat("#9a6a3c", 0.75);
  for (const x of [-3.75, -1.25, 1.25, 3.75]) {
    part(group, beveledBox(0.22, H - BEAM_BOTTOM, D - 0.02), beamMat, [1, 1, 1], [x, (H + BEAM_BOTTOM) / 2, 0]);
  }
  const frameMat = flat("#b07a45", 0.6);
  const lightMat = glowMaterial("#fff1c9", 1.0, 0.4);
  for (const [x, w, d] of [
    [0, 1.4, 1.0],
    [-2.5, 0.8, 0.8],
    [2.5, 0.8, 0.8],
  ] as const) {
    part(group, beveledBox(w + 0.16, 0.06, d + 0.16), frameMat, [1, 1, 1], [x, H - 0.03, 0]);
    part(group, beveledBox(w, 0.08, d), lightMat, [1, 1, 1], [x, H - 0.06, 0]);
  }

  // skirting boards
  const skirt = flat("#b07a45", 0.6);
  const sk = 0.12;
  const st = 0.03;
  slab(group, skirt, [-hx, 0, -hz], [hx, sk, -hz + st]);
  slab(group, skirt, [-hx, 0, hz - st], [-DOOR.hw - 0.12, sk, hz]);
  slab(group, skirt, [DOOR.hw + 0.12, 0, hz - st], [hx, sk, hz]);
  slab(group, skirt, [-hx, 0, -hz + st], [-hx + st, sk, hz - st]);
  slab(group, skirt, [hx - st, 0, -hz + st], [hx, sk, hz - st]);

  // the window: a painted view outside, glazing bars, trim and a sill
  const view = canvasMaterial(
    "home-window-view",
    "#9fd3f0",
    256,
    192,
    (c, w, h) => {
      const sky = c.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#6fb8ea");
      sky.addColorStop(1, "#d6f0fb");
      c.fillStyle = sky;
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#ffffff";
      for (const [x, y, s] of [
        [60, 40, 16],
        [190, 60, 12],
      ] as const) {
        c.beginPath();
        c.arc(x - s, y, s * 0.8, 0, Math.PI * 2);
        c.arc(x, y - s * 0.5, s, 0, Math.PI * 2);
        c.arc(x + s, y, s * 0.85, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = "#7cbf5c";
      c.beginPath();
      c.ellipse(w * 0.3, h * 1.05, w * 0.55, h * 0.4, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#5a9a4a";
      c.beginPath();
      c.ellipse(w * 0.9, h * 1.1, w * 0.5, h * 0.42, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#2f6a3e";
      for (const x of [40, 70, 210]) {
        c.beginPath();
        c.moveTo(x - 16, h * 0.78);
        c.lineTo(x + 16, h * 0.78);
        c.lineTo(x, h * 0.45);
        c.fill();
      }
    },
    { basic: true },
  );
  const wcx = (WINDOW.x0 + WINDOW.x1) / 2;
  const wcy = (WINDOW.y0 + WINDOW.y1) / 2;
  const ww = WINDOW.x1 - WINDOW.x0;
  const wh = WINDOW.y1 - WINDOW.y0;
  part(group, shellGeo("plane", () => new THREE.PlaneGeometry(1, 1)), view, [ww, wh, 1], [wcx, wcy, -hz - 0.2]);
  const bars = flat("#f4ecd8", 0.5);
  part(group, unitBox(), bars, [0.05, wh, 0.04], [wcx, wcy, -hz - 0.17]);
  part(group, unitBox(), bars, [ww, 0.05, 0.04], [wcx, wcy, -hz - 0.17]);
  const trim = flat("#b07a45", 0.6);
  slab(group, trim, [WINDOW.x0 - 0.1, WINDOW.y0 - 0.02, -hz], [WINDOW.x0, WINDOW.y1 + 0.1, -hz + 0.06]);
  slab(group, trim, [WINDOW.x1, WINDOW.y0 - 0.02, -hz], [WINDOW.x1 + 0.1, WINDOW.y1 + 0.1, -hz + 0.06]);
  slab(group, trim, [WINDOW.x0, WINDOW.y1, -hz], [WINDOW.x1, WINDOW.y1 + 0.1, -hz + 0.06]);
  part(group, beveledBox(ww + 0.3, 0.07, 0.2), trim, [1, 1, 1], [wcx, WINDOW.y0 - 0.035, -hz + 0.1]);

  // the front door, set into the wall, with its frame, panels, porthole and knob
  const doorMat = flat("#c0503a", 0.55);
  part(group, beveledBox(DOOR.hw * 2, DOOR.h, 0.08), doorMat, [1, 1, 1], [0, DOOR.h / 2, hz + 0.14]);
  const panel = flat("#a8412f", 0.6);
  for (const x of [-0.25, 0.25]) part(group, beveledBox(0.36, 0.7, 0.03), panel, [1, 1, 1], [x, 0.62, hz + 0.1]);
  const porthole = part(group, shellGeo("cyl", () => new THREE.CylinderGeometry(1, 1, 1, 20)), flat("#f4ecd8", 0.5), [0.22, 0.03, 0.22], [0, 1.72, hz + 0.1]);
  porthole.rotation.x = Math.PI / 2;
  const glass = part(group, shellGeo("cyl", () => new THREE.CylinderGeometry(1, 1, 1, 20)), view, [0.17, 0.03, 0.17], [0, 1.72, hz + 0.09]);
  glass.rotation.x = Math.PI / 2;
  part(group, shellGeo("knob", () => new THREE.SphereGeometry(1, 10, 8)), glowMaterial("#f4c542", 0.25, 0.3), [0.055, 0.055, 0.055], [0.45, 1.05, hz + 0.06]);
  slab(group, trim, [-DOOR.hw - 0.12, 0, hz - 0.06], [-DOOR.hw, DOOR.h + 0.12, hz]);
  slab(group, trim, [DOOR.hw, 0, hz - 0.06], [DOOR.hw + 0.12, DOOR.h + 0.12, hz]);
  slab(group, trim, [-DOOR.hw, DOOR.h, hz - 0.06], [DOOR.hw, DOOR.h + 0.12, hz]);

  // welcome mat, reading the right way up as she walks to the door
  const matTop = canvasMaterial("home-welcome-mat", "#c9975a", 256, 140, (c, w, h) => {
    c.fillStyle = "#c9975a";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = "#6b4222";
    c.lineWidth = 8;
    c.strokeRect(10, 10, w - 20, h - 20);
    c.fillStyle = "#6b4222";
    c.font = "bold 44px system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("WELCOME", w / 2, h / 2 + 2);
  });
  const matEdge = flat("#a8763e", 0.95);
  const mat = part(group, unitBox(), [matEdge, matEdge, matTop, matEdge, matEdge, matEdge], [1.1, 0.02, 0.6], [0, 0.01, hz - 0.65]);
  mat.rotation.y = Math.PI;

  // furniture holders and markers
  const holders = {} as Record<SpotId, THREE.Group>;
  const markers = {} as Record<SpotId, THREE.Object3D>;
  for (const { id: spot } of SPOTS) {
    const { pos, yaw } = HOME_SPOTS[spot];
    const holder = new THREE.Group();
    holder.name = `spot:${spot}`;
    holder.position.set(pos[0], pos[1], pos[2]);
    holder.rotation.y = yaw;
    group.add(holder);
    holders[spot] = holder;
    if (spot !== "wallpaper" && spot !== "floor") holder.add(makeFurniture(current[spot]));

    const m = makeMarker();
    m.name = `marker:${spot}`;
    m.userData.spot = spot;
    const at = spotToRoom(spot, MARKER_AT[spot]);
    m.position.set(at[0], at[1], at[2]);
    m.rotation.y = yaw;
    m.visible = false;
    group.add(m);
    markers[spot] = m;
  }

  const setSpot = (spot: SpotId, id: FurnitureId) => {
    const def = furnitureDef(id);
    if (!def || def.spot !== spot) {
      console.warn(`[home] ${id} does not go in the ${spot} spot`);
      return;
    }
    if (current[spot] === id) return;
    current[spot] = id;
    if (spot === "wallpaper") {
      const m = surfaceMaterial(id);
      for (const w of walls) w.material = m;
    } else if (spot === "floor") {
      floor.material = surfaceMaterial(id);
    } else {
      const holder = holders[spot];
      holder.clear();
      holder.add(makeFurniture(id));
    }
  };

  return { group, setSpot, markers };
}
