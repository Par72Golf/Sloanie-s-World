import * as THREE from "three";
import { beveledBox } from "./beveled";
import { CANDY } from "./candy-scenery";
import { canvasMaterial, glowMaterial, type FurnitureId, type SpotId } from "./furniture";
import { HOUSE_KITS } from "./furniture-kits";
import { lam } from "./meshes";
import { makeCandyDoor } from "./candy-builds";
import type { AABB } from "./collision";
import type { HouseStage } from "./candy-house";

/**
 * Inside her gingerbread house: one room at first, and another every time she
 * builds the outside up a stage.
 *
 * Park one's clubhouse is a single room with all ten decoration spots in it
 * (home-mesh.ts). This one starts with six and earns the rest, because the
 * upgrade she asked for was "it gets bigger and nicer every time and adds a
 * room inside", and a room that arrives with nothing new to do in it is not a
 * reward. So the spots are spread across the three rooms:
 *
 *   Bedroom       bed, rug, lamp, curtains, and the wallpaper and floor, which
 *                 are the whole house's surfaces wherever she changes them
 *   Sweet kitchen table and plant           (stage 2, the candy house)
 *   Tower room    picture and pet bed       (stage 3, the candy castle)
 *
 * Local frame: the bedroom's floor is at y 0 with its inside spanning x -5..5
 * and z -4..4, the front door in the middle of the +z wall, the window in the
 * -z wall. The kitchen is through the east wall, the tower room through the
 * west, both 7 x 6. Walls are 0.4m slabs on the centrelines below, so the
 * drawn wall is the collider and there is no lip to stand on.
 *
 * The furniture frames are exactly park one's, and candy-furniture.ts builds to
 * the same footprints, so a piece drops into a spot here the way it does there.
 */

export const CANDY_HOME = { height: 3.4 };
/** wall thickness; walls sit outside the room they enclose */
const T = 0.4;
/** how far the papered face stands clear of the wall slab behind it */
const FACE_GAP = 0.008;
/** beams hang to here, and the ceiling collider starts here */
const BEAM_BOTTOM = 3.24;
const H = CANDY_HOME.height;

type Rect = { x0: number; x1: number; z0: number; z1: number };

/** The inside of each room, in the order they are built. */
export const CANDY_ROOMS: { name: string; stage: HouseStage; rect: Rect }[] = [
  { name: "Bedroom", stage: 1, rect: { x0: -5, x1: 5, z0: -4, z1: 4 } },
  { name: "Sweet kitchen", stage: 2, rect: { x0: 5.4, x1: 12.4, z0: -3, z1: 3 } },
  { name: "Tower room", stage: 3, rect: { x0: -12.4, x1: -5.4, z0: -3, z1: 3 } },
];

const WINDOW = { x0: 0, x1: 1.6, y0: 1.15, y1: 2.35 };
const DOOR = { hw: 0.6, h: 2.3 };
/**
 * The front door, seen from inside: half its width and the plane of the wall's
 * inner face. It is shut and solid. The room is built 150m up, over the house,
 * and the doorway used to be an open gap in the wall: she walked out through
 * it into the sky, fell on to her own roof and was stuck. Walking into the door
 * now takes her outside instead (sugar-home.ts).
 */
export const CANDY_FRONT_DOOR = { hw: DOOR.hw, z: CANDY_ROOMS[0]!.rect.z1 };
/** the doorways through to the kitchen and the tower, along z on the shared walls */
const ARCH = { hw: 0.8, h: 2.4 };

export const CANDY_HOME_SPOTS: Record<SpotId, { pos: [number, number, number]; yaw: number; stage: HouseStage }> = {
  bed: { pos: [-3.9, 0, -3.35], yaw: 0, stage: 1 },
  lamp: { pos: [-2.0, 0, -3.5], yaw: 0, stage: 1 },
  curtains: { pos: [(WINDOW.x0 + WINDOW.x1) / 2, (WINDOW.y0 + WINDOW.y1) / 2, -4], yaw: 0, stage: 1 },
  rug: { pos: [0, 0, 0.4], yaw: 0, stage: 1 },
  wallpaper: { pos: [5, 1.6, -2.7], yaw: -Math.PI / 2, stage: 1 },
  floor: { pos: [-2.6, 0, 2.4], yaw: 0, stage: 1 },
  table: { pos: [10.4, 0, 0.4], yaw: -Math.PI / 2, stage: 2 },
  plant: { pos: [6.3, 0, -2.4], yaw: 0, stage: 2 },
  picture: { pos: [-12.4, 1.65, 0.4], yaw: Math.PI / 2, stage: 3 },
  petbed: { pos: [-11.2, 0, -2.2], yaw: 0, stage: 3 },
};

export const CANDY_HOME_ENTRY: { spawn: [number, number, number]; yaw: number; door: [number, number, number] } = {
  spawn: [0, 0, 2.5],
  yaw: 0,
  door: [0, 0, 3.6],
};

/** Marker offsets in each spot's local frame, as park one's. */
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

/** Which spots exist at a stage: a room she has not built has no spots in it. */
export function spotsForStage(stage: number): SpotId[] {
  return (Object.keys(CANDY_HOME_SPOTS) as SpotId[]).filter((s) => CANDY_HOME_SPOTS[s].stage <= stage);
}

/** The room a spot is in, for the notice when a new room opens. */
export function roomForStage(stage: number) {
  return CANDY_ROOMS.find((r) => r.stage === stage) ?? CANDY_ROOMS[0]!;
}

function isQuarterTurned(yaw: number) {
  return Math.abs(Math.sin(yaw)) > 0.5;
}

function spotToRoom(spot: SpotId, p: [number, number, number]): [number, number, number] {
  const { pos, yaw } = CANDY_HOME_SPOTS[spot];
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [pos[0] + p[0] * c + p[2] * s, pos[1] + p[1], pos[2] - p[0] * s + p[2] * c];
}

/* --------------------------------------------------------------- the shell */

/**
 * The walls, as centreline runs. `open` is a hole in the run, measured along
 * it from its start: a doorway when it reaches the floor, a window otherwise.
 * Each run is one slab the length of the wall, which is also its collider.
 */
type Run = { a: [number, number]; b: [number, number]; open?: { from: number; to: number; y0: number; y1: number } };

function runsFor(stage: number): Run[] {
  const A = CANDY_ROOMS[0]!.rect;
  const out: Run[] = [];
  const ax0 = A.x0 - T / 2;
  const ax1 = A.x1 + T / 2;
  const az0 = A.z0 - T / 2;
  const az1 = A.z1 + T / 2;
  const len = ax1 - ax0;
  // the bedroom's back wall, with the window, and its front wall, with the door
  out.push({ a: [ax0, az0], b: [ax1, az0], open: { from: len / 2 + WINDOW.x0, to: len / 2 + WINDOW.x1, y0: WINDOW.y0, y1: WINDOW.y1 } });
  out.push({ a: [ax0, az1], b: [ax1, az1], open: { from: len / 2 - DOOR.hw, to: len / 2 + DOOR.hw, y0: 0, y1: DOOR.h } });
  // the side walls, which get an archway through once the room beyond is built
  const depth = az1 - az0;
  const arch = { from: depth / 2 - ARCH.hw, to: depth / 2 + ARCH.hw, y0: 0, y1: ARCH.h };
  out.push({ a: [ax1, az0], b: [ax1, az1], open: stage >= 2 ? arch : undefined });
  out.push({ a: [ax0, az0], b: [ax0, az1], open: stage >= 3 ? arch : undefined });

  for (const room of CANDY_ROOMS) {
    if (room.stage === 1 || room.stage > stage) continue;
    const r = room.rect;
    const x0 = r.x0 - T / 2;
    const x1 = r.x1 + T / 2;
    const z0 = r.z0 - T / 2;
    const z1 = r.z1 + T / 2;
    const w = x1 - x0;
    // the far wall (the shared one is already up as the bedroom's side)
    const far = room.stage === 2 ? x1 : x0;
    out.push({ a: [far, z0], b: [far, z1] });
    // and the two ends, one of them with this room's own window
    const win = { from: w / 2 - 0.8, to: w / 2 + 0.8, y0: 1.15, y1: 2.35 };
    out.push({ a: [x0, z0], b: [x1, z0], open: room.stage === 3 ? win : undefined });
    out.push({ a: [x0, z1], b: [x1, z1], open: room.stage === 2 ? win : undefined });
  }
  return out;
}

/**
 * What is built into the two later rooms and cannot be changed: a chocolate
 * counter in the kitchen, a window seat in the tower. A new room with nothing
 * in it but one empty decoration spot does not look like something she saved
 * up for, so each one comes with its own furniture already fitted.
 */
const FITTINGS: { stage: HouseStage; solid: AABB[] }[] = [
  {
    stage: 2,
    solid: [{ minX: 7.4, maxX: 12.3, minY: 0, maxY: 0.92, minZ: -2.95, maxZ: -2.25 }],
  },
  {
    stage: 3,
    solid: [{ minX: -10.4, maxX: -7.2, minY: 0, maxY: 0.52, minZ: -2.95, maxZ: -2.15 }],
  },
];

export function candyHomeColliders(stage: number, furniture?: Partial<Record<SpotId, FurnitureId>>): AABB[] {
  const out: AABB[] = [];
  const top = H + T;
  for (const run of runsFor(stage)) {
    const [x0, z0] = run.a;
    const [x1, z1] = run.b;
    const along = Math.hypot(x1 - x0, z1 - z0);
    const horizontal = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const w = horizontal ? along : T;
    const d = horizontal ? T : along;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    if (!run.open || run.open.y0 > 0) {
      // a window leaves the wall solid: she cannot climb through it
      out.push({ minX: cx - w / 2, maxX: cx + w / 2, minY: 0, maxY: top, minZ: cz - d / 2, maxZ: cz + d / 2 });
      continue;
    }
    // a doorway splits the run into two piers and a lintel over the gap
    const o = run.open;
    const at = (s: number, e: number, minY: number, maxY: number) => {
      const sx = horizontal ? x0 + s : cx - T / 2;
      const ex = horizontal ? x0 + e : cx + T / 2;
      const sz = horizontal ? cz - T / 2 : z0 + s;
      const ez = horizontal ? cz + T / 2 : z0 + e;
      out.push({ minX: Math.min(sx, ex), maxX: Math.max(sx, ex), minY, maxY, minZ: Math.min(sz, ez), maxZ: Math.max(sz, ez) });
    };
    at(0, o.from, 0, top);
    at(o.to, along, 0, top);
    at(o.from, o.to, o.y1, top);
  }
  // the floor under every built room, and a ceiling over it
  const kit = HOUSE_KITS.candy;
  for (const room of CANDY_ROOMS) {
    if (room.stage > stage) continue;
    const r = room.rect;
    out.push({ minX: r.x0 - T, maxX: r.x1 + T, minY: -0.4, maxY: 0, minZ: r.z0 - T, maxZ: r.z1 + T });
    out.push({ minX: r.x0, maxX: r.x1, minY: BEAM_BOTTOM, maxY: top, minZ: r.z0, maxZ: r.z1 });
  }
  // the front door, shut, filling the doorway through the wall's thickness
  const front = CANDY_ROOMS[0]!.rect.z1;
  out.push({ minX: -DOOR.hw, maxX: DOOR.hw, minY: 0, maxY: DOOR.h, minZ: front, maxZ: front + T });
  for (const f of FITTINGS) if (f.stage <= stage) out.push(...f.solid);
  const starters = kit.starters();
  for (const spot of spotsForStage(stage)) {
    const solid = kit.solid(furniture?.[spot] ?? starters[spot]);
    if (!solid) continue;
    const { pos, yaw } = CANDY_HOME_SPOTS[spot];
    const [w, d] = isQuarterTurned(yaw) ? [solid.d, solid.w] : [solid.w, solid.d];
    out.push({ minX: pos[0] - w / 2, maxX: pos[0] + w / 2, minY: 0, maxY: solid.h, minZ: pos[2] - d / 2, maxZ: pos[2] + d / 2 });
  }
  return out;
}

/* ------------------------------------------------------------ the mesh work */

export type CandyHomeRig = {
  group: THREE.Group;
  setSpot: (spot: SpotId, id: FurnitureId) => void;
  markers: Partial<Record<SpotId, THREE.Object3D>>;
};

const flat = (c: string, roughness = 0.6) => lam(c, { flat: true, roughness });
/** icing white, for sills, frames and lids */
const trimMat = flat("#f6f1e8", 0.5);
const GUMDROP_COLOURS = [CANDY.red, CANDY.pink, CANDY.yellow, CANDY.mint, CANDY.lilac, CANDY.orange];

const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}
const unitBox = () => cached("box", () => new THREE.BoxGeometry(1, 1, 1));

function slab(parent: THREE.Object3D, mat: THREE.Material, min: [number, number, number], max: [number, number, number]) {
  const m = new THREE.Mesh(unitBox(), mat);
  m.scale.set(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  m.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/**
 * A wall's inner face, in metres, so the wallpaper's repeat is a real tile
 * size. ShapeGeometry's UVs are the shape's own coordinates, which is what
 * makes that true.
 */
function wallFace(w: number, h: number, opening?: { x0: number; x1: number; y0: number; y1: number }) {
  const hw = w / 2;
  const s = new THREE.Shape();
  if (opening && opening.y0 <= 0) {
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
  const gem = new THREE.Mesh(cached("marker-gem", () => new THREE.OctahedronGeometry(1, 0)), glowMaterial("#ffd84a", 1.2, 0.3));
  gem.scale.set(0.1, 0.15, 0.1);
  g.add(gem);
  const halo = new THREE.Mesh(cached("marker-halo", () => new THREE.TorusGeometry(1, 0.1, 4, 16)), glowMaterial("#fff4c8", 0.9, 0.3));
  halo.scale.setScalar(0.17);
  halo.rotation.x = Math.PI / 2;
  halo.position.y = -0.2;
  g.add(halo);
  return g;
}

/** What she sees out of the windows: the candy park, from her bedroom. */
function candyView() {
  return canvasMaterial(
    "candy-home-view",
    "#ffd3ea",
    256,
    192,
    (c, w, h) => {
      const sky = c.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#f3a8d8");
      sky.addColorStop(0.6, "#ffd3ea");
      sky.addColorStop(1, "#fff0d8");
      c.fillStyle = sky;
      c.fillRect(0, 0, w, h);
      // cotton-candy clouds
      c.fillStyle = "#fff6fb";
      for (const [x, y, s] of [
        [56, 38, 15],
        [186, 56, 11],
      ] as const) {
        c.beginPath();
        c.arc(x - s, y, s * 0.8, 0, Math.PI * 2);
        c.arc(x, y - s * 0.5, s, 0, Math.PI * 2);
        c.arc(x + s, y, s * 0.85, 0, Math.PI * 2);
        c.fill();
      }
      // spearmint ground
      c.fillStyle = "#8fe0cf";
      c.fillRect(0, h * 0.66, w, h * 0.34);
      c.fillStyle = "#6fd4be";
      c.beginPath();
      c.ellipse(w * 0.75, h * 1.02, w * 0.5, h * 0.3, 0, 0, Math.PI * 2);
      c.fill();
      // lollipop trees
      for (const [x, r, col] of [
        [44, 20, "#ff6aa8"],
        [92, 14, "#ffc83a"],
        [206, 17, "#6fe3c4"],
      ] as const) {
        c.strokeStyle = "#f6f1e8";
        c.lineWidth = 5;
        c.beginPath();
        c.moveTo(x, h * 0.78);
        c.lineTo(x, h * 0.55);
        c.stroke();
        c.fillStyle = col;
        c.beginPath();
        c.arc(x, h * 0.52, r, 0, Math.PI * 2);
        c.fill();
      }
    },
    { basic: true },
  );
}

/**
 * Build the inside of her house at the given stage, with the given furniture.
 *
 * Shell materials and geometry are shared and cached, but the rig is rebuilt
 * when a stage is bought, because the walls themselves change.
 */
export function makeCandyHome(stage: HouseStage, initial: Partial<Record<SpotId, FurnitureId>>): CandyHomeRig {
  const kit = HOUSE_KITS.candy;
  const group = new THREE.Group();
  group.name = "candy-home";
  const starters = kit.starters();
  const current = {} as Record<SpotId, FurnitureId>;
  for (const spot of Object.keys(CANDY_HOME_SPOTS) as SpotId[]) {
    const want = initial?.[spot];
    current[spot] = want && kit.def(want)?.spot === spot ? want : starters[spot]!;
  }

  const rooms = CANDY_ROOMS.filter((r) => r.stage <= stage);
  const floors: THREE.Mesh[] = [];
  const walls: THREE.Mesh[] = [];
  const floorMat = kit.surface(current.floor);
  const wallMat = kit.surface(current.wallpaper);

  // floors, ceilings, beams and a light in every built room
  const ceilMat = flat("#f7ead3", 0.9);
  const beamMat = flat("#8f5c2e", 0.75);
  const lightMat = glowMaterial("#fff1c9", 1.0, 0.4);
  for (const room of rooms) {
    const r = room.rect;
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    const floor = new THREE.Mesh(
      cached(`floor|${w}|${d}`, () => {
        const s = new THREE.Shape();
        s.moveTo(-w / 2, -d / 2);
        s.lineTo(w / 2, -d / 2);
        s.lineTo(w / 2, d / 2);
        s.lineTo(-w / 2, d / 2);
        s.closePath();
        return new THREE.ShapeGeometry(s);
      }),
      floorMat,
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    floor.receiveShadow = true;
    group.add(floor);
    floors.push(floor);

    const ceiling = new THREE.Mesh(cached(`ceil|${w}|${d}`, () => new THREE.PlaneGeometry(w, d)), ceilMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(cx, H, cz);
    group.add(ceiling);

    // liquorice beams, and a boiled-sweet lamp between them
    const beams = Math.max(2, Math.round(w / 2.5));
    for (let i = 0; i < beams; i++) {
      const x = r.x0 + ((i + 0.5) * w) / beams;
      const m = new THREE.Mesh(beveledBox(0.2, H - BEAM_BOTTOM, d - 0.02), beamMat);
      m.position.set(x, (H + BEAM_BOTTOM) / 2, cz);
      m.receiveShadow = true;
      group.add(m);
    }
    const ring = new THREE.Mesh(beveledBox(1.5, 0.07, 1.1), flat(CANDY.pinkPale, 0.4));
    ring.position.set(cx, H - 0.035, cz);
    group.add(ring);
    const panel = new THREE.Mesh(beveledBox(1.3, 0.09, 0.9), lightMat);
    panel.position.set(cx, H - 0.07, cz);
    group.add(panel);
  }

  // the walls: a gingerbread slab on each run, papered on both faces
  const shell = lam("#a9703c", { tex: "dough", repeat: 3, roughness: 0.78 });
  const view = candyView();
  const trim = trimMat;
  const top = H + T;
  for (const run of runsFor(stage)) {
    const [x0, z0] = run.a;
    const [x1, z1] = run.b;
    const horizontal = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const along = Math.hypot(x1 - x0, z1 - z0);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const o = run.open;

    const piece = (from: number, to: number, y0: number, y1: number) => {
      const a: [number, number, number] = horizontal ? [x0 + from, y0, cz - T / 2] : [cx - T / 2, y0, z0 + from];
      const b: [number, number, number] = horizontal ? [x0 + to, y1, cz + T / 2] : [cx + T / 2, y1, z0 + to];
      slab(group, shell, [Math.min(a[0], b[0]), a[1], Math.min(a[2], b[2])], [Math.max(a[0], b[0]), b[1], Math.max(a[2], b[2])]);
    };
    if (!o) piece(0, along, 0, top);
    else if (o.y0 > 0) {
      // a window: the wall below, above and either side of the pane
      piece(0, o.from, 0, top);
      piece(o.to, along, 0, top);
      piece(o.from, o.to, 0, o.y0);
      piece(o.from, o.to, o.y1, top);
    } else {
      piece(0, o.from, 0, top);
      piece(o.to, along, 0, top);
      piece(o.from, o.to, o.y1, top);
    }

    // the papered faces, one looking each way, so a shared wall is papered in
    // both rooms and the bedroom never shows bare gingerbread
    const opening = o ? { x0: o.from - along / 2, x1: o.to - along / 2, y0: o.y0, y1: o.y1 } : undefined;
    const geo = wallFace(along, H, opening);
    for (const side of [1, -1] as const) {
      const m = new THREE.Mesh(geo, wallMat);
      m.receiveShadow = true;
      m.name = "candy-home-wall";
      if (horizontal) {
        // each face looks away from the middle of the wall, into whatever room
        // is on that side; the other way round it is backface-culled and the
        // bare gingerbread slab shows through. It stands a few millimetres
        // clear of the slab, because two surfaces at one depth flicker.
        m.position.set(cx, 0, cz + side * (T / 2 + FACE_GAP));
        m.rotation.y = side > 0 ? 0 : Math.PI;
      } else {
        m.position.set(cx + side * (T / 2 + FACE_GAP), 0, cz);
        m.rotation.y = (side * Math.PI) / 2;
      }
      group.add(m);
      walls.push(m);
    }

    // a boiled-sweet pane in the window, with icing bars and a sill
    if (o && o.y0 > 0) {
      const wc = o.from + (o.to - o.from) / 2 - along / 2;
      const ww = o.to - o.from;
      const wh = o.y1 - o.y0;
      const yc = (o.y0 + o.y1) / 2;
      const pane = new THREE.Mesh(cached("plane", () => new THREE.PlaneGeometry(1, 1)), view);
      pane.scale.set(ww, wh, 1);
      const place = (m: THREE.Object3D, out: number) => {
        if (horizontal) {
          m.position.set(cx + wc, yc, cz + out * (T / 2 + 0.02));
          m.rotation.y = out > 0 ? 0 : Math.PI;
        } else {
          m.position.set(cx + out * (T / 2 + 0.02), yc, cz - wc * out);
          m.rotation.y = (out * Math.PI) / 2;
        }
        group.add(m);
      };
      // the view faces into the room, which is the side the wall's inside is on
      const inward = horizontal ? (cz > 0 ? -1 : 1) : cx > 0 ? -1 : 1;
      place(pane, inward);
      const bar = new THREE.Mesh(beveledBox(0.06, wh, 0.04), trim);
      place(bar, inward);
      const sill = new THREE.Mesh(beveledBox(ww + 0.3, 0.08, 0.22), trim);
      place(sill, inward);
      sill.position.y = o.y0 - 0.04;
    }
  }

  // the kitchen's chocolate counter and its shelf of sweet jars
  if (stage >= 2) {
    const choc = flat("#6b4226", 0.5);
    const wafer = flat("#e8b86a", 0.6);
    slab(group, choc, [7.4, 0, -2.95], [12.3, 0.82, -2.25]);
    slab(group, wafer, [7.3, 0.82, -3.0], [12.4, 0.92, -2.2]);
    // three jars of sweets on the top, and a shelf of them above
    const jars = [CANDY.pink, CANDY.mint, CANDY.yellow];
    jars.forEach((c, i) => {
      const x = 8.3 + i * 1.5;
      const jar = new THREE.Mesh(cached("jar", () => new THREE.CylinderGeometry(1, 1, 1, 14)), flat(c, 0.2));
      jar.scale.set(0.26, 0.42, 0.26);
      jar.position.set(x, 1.13, -2.6);
      jar.castShadow = true;
      group.add(jar);
      const lid = new THREE.Mesh(beveledBox(0.56, 0.08, 0.56), trimMat);
      lid.position.set(x, 1.38, -2.6);
      group.add(lid);
    });
    slab(group, wafer, [7.6, 1.85, -3.0], [12.1, 1.95, -2.5]);
    for (let i = 0; i < 4; i++) {
      const s2 = new THREE.Mesh(cached("sph", () => new THREE.SphereGeometry(1, 10, 8)), flat(GUMDROP_COLOURS[i % 6]!, 0.2));
      s2.scale.setScalar(0.17);
      s2.position.set(8.1 + i * 1.2, 2.11, -2.75);
      group.add(s2);
    }
  }

  // the tower room's window seat, under its window
  if (stage >= 3) {
    slab(group, flat("#a9703c", 0.7), [-10.4, 0, -2.95], [-7.2, 0.42, -2.15]);
    slab(group, flat("#fff6fb", 0.85), [-10.45, 0.42, -3.0], [-7.15, 0.52, -2.1]);
    for (let i = 0; i < 3; i++) {
      const cushion = new THREE.Mesh(beveledBox(0.62, 0.22, 0.24), flat([CANDY.pinkPale, CANDY.mint, CANDY.lilac][i]!, 0.6));
      cushion.position.set(-9.8 + i * 1.0, 0.63, -2.42);
      cushion.castShadow = true;
      group.add(cushion);
    }
  }

  // an icing arch round the front door, and a liquorice doormat inside it
  const az1 = CANDY_ROOMS[0]!.rect.z1;
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(beveledBox(0.14, DOOR.h + 0.14, 0.3), trim);
    post.position.set(s * (DOOR.hw + 0.07), (DOOR.h + 0.14) / 2, az1 + 0.02);
    group.add(post);
  }
  const head = new THREE.Mesh(beveledBox(DOOR.hw * 2 + 0.28, 0.14, 0.3), trim);
  head.position.set(0, DOOR.h + 0.07, az1 + 0.02);
  group.add(head);
  // and the door itself, shut, set a little way into the doorway: the same
  // wafer door as the one outside, so in and out read as one door
  const door = makeCandyDoor(DOOR.hw * 2 - 0.04, DOOR.h - 0.02, "#d6253f");
  door.position.set(-DOOR.hw + 0.02, 0.01, az1 + 0.08);
  group.add(door);
  const matTop = canvasMaterial("candy-home-mat", "#ff9ec8", 256, 140, (c, w, h) => {
    c.fillStyle = "#ff9ec8";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = "#f6f1e8";
    c.lineWidth = 9;
    c.strokeRect(11, 11, w - 22, h - 22);
    c.fillStyle = "#f6f1e8";
    c.font = "bold 40px system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("SWEET HOME", w / 2, h / 2 + 2);
  });
  const edge = flat("#e8608f", 0.9);
  const doormat = new THREE.Mesh(unitBox(), [edge, edge, matTop, edge, edge, edge]);
  doormat.scale.set(1.3, 0.02, 0.7);
  doormat.position.set(0, 0.01, az1 - 0.75);
  doormat.rotation.y = Math.PI;
  group.add(doormat);

  // furniture holders and markers, for the rooms that exist
  const holders = {} as Partial<Record<SpotId, THREE.Group>>;
  const markers: Partial<Record<SpotId, THREE.Object3D>> = {};
  for (const spot of spotsForStage(stage)) {
    const { pos, yaw } = CANDY_HOME_SPOTS[spot];
    const holder = new THREE.Group();
    holder.name = `spot:${spot}`;
    holder.position.set(pos[0], pos[1], pos[2]);
    holder.rotation.y = yaw;
    group.add(holder);
    holders[spot] = holder;
    if (spot !== "wallpaper" && spot !== "floor") holder.add(kit.make(current[spot]));

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
    const def = kit.def(id);
    if (!def || def.spot !== spot) return;
    if (current[spot] === id) return;
    current[spot] = id;
    if (spot === "wallpaper") {
      const m = kit.surface(id);
      for (const w of walls) w.material = m;
    } else if (spot === "floor") {
      const m = kit.surface(id);
      for (const f of floors) f.material = m;
    } else {
      const holder = holders[spot];
      if (!holder) return;
      holder.clear();
      holder.add(kit.make(id));
    }
  };

  return { group, setSpot, markers };
}
