import * as THREE from "three";
import { beveledBox } from "./beveled";
import { CANDY } from "./candy-scenery";
import { makeCandyDoor } from "./candy-builds";
import { boxGeo, cone4Geo, coneGeo, cylGeo, lam, mesh, sphereGeo } from "./meshes";
import { glowMaterial } from "./furniture";
import type { AABB } from "./collision";

/**
 * Her own house in Sugar Rush Park, from the outside, in the three stages she
 * builds it up through with tickets.
 *
 * Sloan asked for a house bigger than the village's, that she could upgrade
 * from the outside so it "gets bigger and nicer every time". So the three
 * stages are not three different houses: stage two stands on stage one and
 * stage three stands on that, which is what makes the upgrade read as building
 * rather than swapping. The ground floor never moves, so her front door is in
 * the same place all the way through — she learns where home is once.
 *
 *   1  Gingerbread cottage  11 x 9, gabled icing roof, candy-cane porch
 *   2  Candy house          + an upper storey, a balcony over the porch and a
 *                             chocolate chimney, and a fenced sugar garden
 *   3  Candy castle         + two round towers with swirl roofs, sugar-cube
 *                             battlements, a banner and bunting
 *   4  Candy palace         + a wafer wing across the back with a golden dome
 *   5  Rainbow palace       + gold crowns on the towers, a rainbow over the
 *                             garden gate and fairy lights along the fence
 *
 * Four and five came after the first real play: with tickets now paid for
 * every find, she had the castle inside an afternoon and nothing left to save
 * up for.
 *
 * Conventions, the same as candy-builds.ts: origin on the ground in the middle
 * of the footprint, +z is the front, everything solid puts its AABB on
 * `group.userData.boxes` in local space, nothing solid is rotated (colliders
 * ignore rotation), and no scale on the group itself.
 */

/* ------------------------------------------------------------------ palette */

const ICING = "#f6f1e8";
const GINGER = "#a9703c";
const GINGER_DARK = "#8f5c2e";
const WAFER = "#e8b86a";
const CHOC = "#6b4226";
const CHOC_DARK = "#4a2e1c";
const CHERRY = "#d6253f";
const GUMDROPS = [CANDY.red, CANDY.pink, CANDY.yellow, CANDY.mint, CANDY.lilac, CANDY.orange];

const flat = (c: string, roughness = 0.42) => lam(c, { flat: true, roughness });
const baked = (c: string, repeat = 3) => lam(c, { tex: "dough", repeat, roughness: 0.78 });

/* ------------------------------------------------------------ the footprint */

/**
 * The ground floor, shared by every stage. Nine metres deep and eleven across
 * is half as big again as the village's cottages, which is the point: hers is
 * the big one on the square.
 */
export const CANDY_HOUSE = {
  w: 11,
  d: 9,
  h: 3.8,
  /** wall thickness; the drawn wall is the collider, so there is no invisible lip */
  t: 0.4,
  doorW: 1.7,
  doorH: 2.6,
  /** how far out from the middle of the house her doorstep is */
  step: 6.2,
} as const;

export type HouseStage = 1 | 2 | 3 | 4 | 5;
/** the biggest the house gets */
export const TOP_STAGE = 5;

/** What each stage is called, what it costs, and what she gets for it. */
export const HOUSE_STAGES: { stage: HouseStage; name: string; price: number; adds: string; room: string }[] = [
  {
    stage: 1,
    name: "Gingerbread cottage",
    price: 0,
    adds: "Your own gingerbread cottage on the village square.",
    room: "Bedroom",
  },
  {
    stage: 2,
    name: "Candy house",
    price: 30,
    adds: "An upstairs, a balcony over the porch and a sugar garden — and a sweet kitchen inside.",
    room: "Sweet kitchen",
  },
  {
    stage: 3,
    name: "Candy castle",
    price: 60,
    adds: "Two candy towers, battlements and your own flag — and a tower room inside.",
    room: "Tower room",
  },
  {
    stage: 4,
    name: "Candy palace",
    price: 150,
    adds: "A wafer wing across the back with a golden dome — and a playroom inside.",
    room: "Playroom",
  },
  {
    stage: 5,
    name: "Rainbow palace",
    price: 300,
    adds: "Gold crowns on your towers, a rainbow over the gate and fairy lights — and a sweet studio inside.",
    room: "Sweet studio",
  },
];

export function stageInfo(stage: number) {
  return HOUSE_STAGES[Math.min(TOP_STAGE, Math.max(1, Math.round(stage))) - 1]!;
}

/* ------------------------------------------------------------- small helpers */

function bx(x: number, y: number, z: number, sx: number, sy: number, sz: number): AABB {
  return {
    minX: x - sx / 2,
    maxX: x + sx / 2,
    minY: y - sy / 2,
    maxY: y + sy / 2,
    minZ: z - sz / 2,
    maxZ: z + sz / 2,
  };
}

/** mesh(), with the material chosen by the caller. Boxes still get bevelled edges. */
function part(
  geo: THREE.BufferGeometry | null,
  mat: THREE.Material,
  sx: number,
  sy: number,
  sz: number,
  x: number,
  y: number,
  z: number,
  shadow = true,
) {
  const m = new THREE.Mesh(geo ?? beveledBox(sx, sy, sz), mat);
  if (geo) m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

/** A piped run of icing: the scalloped edge that says gingerbread at a glance. */
function icingRun(g: THREE.Group, a: [number, number, number], b: [number, number, number], r = 0.24) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  const n = Math.max(2, Math.round(len / (r * 1.7)));
  const mat = flat(ICING, 0.35);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const blob = part(sphereGeo, mat, r, r * 0.85, r, a[0] + dx * t, a[1] + dy * t, a[2] + dz * t, false);
    g.add(blob);
  }
}

/** A candy cane: a striped post with a hooked top, used for posts and railings. */
function candyCane(h: number, r = 0.11, colour: string = CANDY.red) {
  const g = new THREE.Group();
  const stripes = 7;
  for (let i = 0; i < stripes; i++) {
    const seg = h / stripes;
    g.add(part(cylGeo, flat(i % 2 ? colour : ICING, 0.3), r, seg, r, 0, seg * (i + 0.5), 0, false));
  }
  return g;
}

/** A tapered swirl: the cone roof on a tower, piped like soft ice cream. */
function swirlCone(g: THREE.Group, x: number, z: number, base: number, r: number, h: number, colour: string) {
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const s = 1 - i * 0.18;
    g.add(part(coneGeo, flat(i % 2 ? colour : ICING, 0.3), r * s, h / tiers + 0.35, r * s, x, base + (h / tiers) * i + 0.2, z));
  }
  g.add(part(sphereGeo, flat(CHERRY, 0.25), 0.3, 0.3, 0.3, x, base + h + 0.25, z, false));
}

/* ------------------------------------------------------------- the ground floor */

function groundFloor(g: THREE.Group, boxes: AABB[]) {
  const { w, d, h, t, doorW, doorH } = CANDY_HOUSE;
  const wall = baked(GINGER, 4);
  const solid = (sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
    g.add(part(null, wall, sx, sy, sz, x, y, z));
    boxes.push(bx(x, y, z, sx, sy, sz));
  };
  const half = doorW / 2;
  const fz = d / 2 - t / 2;
  const pier = w / 2 - half;
  solid(w, h, t, 0, h / 2, -d / 2 + t / 2);
  solid(t, h, d, -w / 2 + t / 2, h / 2, 0);
  solid(t, h, d, w / 2 - t / 2, h / 2, 0);
  solid(pier, h, t, -(half + pier / 2), h / 2, fz);
  solid(pier, h, t, half + pier / 2, h / 2, fz);
  solid(doorW, h - doorH, t, 0, (doorH + h) / 2, fz);

  // a biscuit floor inside the shell, thin enough to step onto
  g.add(part(null, baked(GINGER_DARK, 3), w - t * 2, 0.1, d - t * 2, 0, 0.05, 0, false));

  // the door: a cane frame round the hole with a wafer leaf standing open
  for (const s of [-1, 1]) {
    const post = candyCane(doorH + 0.2, 0.14);
    post.position.set(s * (half + 0.14), 0, d / 2 + 0.07);
    g.add(post);
  }
  const lintel = part(cylGeo, flat(CANDY.red, 0.3), 0.14, doorW + 0.5, 0.14, 0, doorH + 0.25, d / 2 + 0.07, false);
  lintel.rotation.z = Math.PI / 2;
  g.add(lintel);
  // Her door is shut, and solid. Her rooms are not behind it — Collect at the
  // door takes her to them — so an open doorway only ever showed an empty
  // shell she could wander into, and the leaf propped off the wall beside it
  // read as a shutter, not a door.
  const door = makeCandyDoor(doorW - 0.08, doorH - 0.04, CHERRY);
  door.position.set(-half + 0.04, 0.02, d / 2 - 0.08);
  g.add(door);
  boxes.push(bx(0, doorH / 2, fz, doorW, doorH, t));

  // windows: an icing frame round a boiled-sweet pane, one each side of the door
  for (const s of [-1, 1]) {
    const px = s * (half + pier / 2);
    g.add(part(null, flat(ICING, 0.4), 1.5, 1.5, 0.1, px, 1.85, d / 2 + 0.04, false));
    g.add(part(null, flat(s > 0 ? CANDY.mint : CANDY.yellow, 0.14), 1.2, 1.2, 0.06, px, 1.85, d / 2 + 0.1, false));
    g.add(part(null, flat(ICING, 0.4), 0.1, 1.24, 0.08, px, 1.85, d / 2 + 0.14, false));
    g.add(part(null, flat(ICING, 0.4), 1.24, 0.1, 0.08, px, 1.85, d / 2 + 0.14, false));
  }
  // and one in each side wall, so it is not a blank slab from the path
  for (const s of [-1, 1]) {
    g.add(part(null, flat(ICING, 0.4), 0.1, 1.4, 1.4, s * (w / 2 + 0.04), 1.9, -1.4, false));
    g.add(part(null, flat(CANDY.pink, 0.14), 0.06, 1.1, 1.1, s * (w / 2 + 0.1), 1.9, -1.4, false));
  }

  // gumdrop buttons pressed into the walls
  for (let i = 0; i < 6; i++) {
    const along = (i / 5 - 0.5) * 2;
    const r = 0.24;
    g.add(part(sphereGeo, flat(GUMDROPS[i % 6]!, 0.2), r, r * 0.9, r * 0.6, along * (w * 0.42), 3.25, d / 2 + 0.09, false));
    g.add(part(sphereGeo, flat(GUMDROPS[(i + 3) % 6]!, 0.2), r, r * 0.9, r * 0.6, along * (w * 0.42), 2.6, -d / 2 - 0.09, false));
  }
}

/** The porch: two canes and a little striped roof over the doorstep. */
function porch(g: THREE.Group, deep: boolean) {
  const { d, doorH } = CANDY_HOUSE;
  const z = d / 2 + 1.5;
  for (const s of [-1, 1]) {
    const post = candyCane(doorH + 0.5, 0.15, CANDY.pink);
    post.position.set(s * 1.75, 0, z);
    g.add(post);
  }
  const roofY = doorH + 0.65;
  for (let i = 0; i < 5; i++) {
    g.add(part(null, flat(i % 2 ? CANDY.pink : ICING, 0.35), 0.86, 0.16, 2.1, (i - 2) * 0.86, roofY, d / 2 + 0.75, false));
  }
  icingRun(g, [-2.2, roofY - 0.06, z + 0.5], [2.2, roofY - 0.06, z + 0.5], 0.2);
  // a doorstep of sugar cubes, and boiled sweets set into the path
  g.add(part(null, flat(ICING, 0.5), 3.4, 0.14, 1.5, 0, 0.07, d / 2 + 0.9, false));
  for (let i = 0; i < 4; i++) {
    g.add(part(cylGeo, flat(GUMDROPS[(i * 2) % 6]!, 0.18), 0.4, 0.06, 0.4, (i - 1.5) * 0.9, 0.04, d / 2 + 2.4 + (deep ? 1.2 : 0), false));
  }
}

/* ---------------------------------------------------------------- the roofs */

/** A gabled icing roof with piped courses, ridge running front to back. */
function gable(g: THREE.Group, w: number, d: number, eave: number, ridgeUp = 1.5) {
  const pitch = 0.62;
  const slabW = w * 0.68;
  for (const s of [-1, 1]) {
    const slab = part(null, flat(ICING, 0.45), slabW, 0.22, d + 0.8, (s * slabW) / 2 - s * 0.12, eave + 0.74, 0);
    slab.rotation.z = -s * pitch;
    g.add(slab);
    for (let i = 0; i < 4; i++) {
      const c = part(null, flat(i % 2 ? CANDY.pink : CANDY.mint, 0.3), 0.26, 0.08, d + 0.82, s * (0.5 + i * 0.8), eave + 0.68 - i * 0.54, 0, false);
      c.rotation.z = -s * pitch;
      g.add(c);
    }
  }
  g.add(part(null, flat(ICING, 0.45), 0.46, 0.28, d + 1.0, 0, eave + ridgeUp, 0, false));
  for (const s of [-1, 1]) {
    const tri = new THREE.Shape();
    tri.moveTo(-w * 0.34, 0);
    tri.lineTo(w * 0.34, 0);
    tri.lineTo(0, w * 0.34 * Math.tan(pitch) + 0.5);
    const face = new THREE.Mesh(new THREE.ShapeGeometry(tri), baked(GINGER, 3));
    face.position.set(0, eave + 0.1, (s * (d + 0.62)) / 2);
    if (s < 0) face.rotation.y = Math.PI;
    face.receiveShadow = true;
    g.add(face);
  }
  icingRun(g, [-w / 2 - 0.3, eave + 0.06, d / 2 + 0.38], [w / 2 + 0.3, eave + 0.06, d / 2 + 0.38], 0.26);
  icingRun(g, [-w / 2 - 0.3, eave + 0.06, -d / 2 - 0.38], [w / 2 + 0.3, eave + 0.06, -d / 2 - 0.38], 0.26);
}

/* ------------------------------------------------------- stage two and three */

const UPPER = { w: 8.6, d: 7, y: 4.1, h: 3.1 };

function upperStorey(g: THREE.Group, castle: boolean) {
  const { d } = CANDY_HOUSE;
  const wall = baked(GINGER, 3);
  const top = UPPER.y + UPPER.h;

  // the ground floor's flat top, which the upper storey stands on
  g.add(part(null, flat(WAFER, 0.6), CANDY_HOUSE.w + 0.6, 0.3, CANDY_HOUSE.d + 0.6, 0, CANDY_HOUSE.h + 0.15, 0));
  icingRun(g, [-CANDY_HOUSE.w / 2 - 0.3, CANDY_HOUSE.h + 0.3, d / 2 + 0.3], [CANDY_HOUSE.w / 2 + 0.3, CANDY_HOUSE.h + 0.3, d / 2 + 0.3], 0.26);

  g.add(part(null, wall, UPPER.w, UPPER.h, UPPER.d, 0, UPPER.y + UPPER.h / 2, -0.6));
  // an upstairs window, round, with a swirl-mint pane
  const wz = UPPER.d / 2 - 0.6;
  const frame = part(cylGeo, flat(ICING, 0.4), 0.78, 0.12, 0.78, 0, UPPER.y + 1.7, wz + 0.06, false);
  frame.rotation.x = Math.PI / 2;
  g.add(frame);
  const pane = part(cylGeo, flat(CANDY.lilac, 0.14), 0.6, 0.1, 0.6, 0, UPPER.y + 1.7, wz + 0.12, false);
  pane.rotation.x = Math.PI / 2;
  g.add(pane);

  // gumdrops round the upstairs walls
  for (let i = 0; i < 5; i++) {
    const along = (i / 4 - 0.5) * 2;
    g.add(part(sphereGeo, flat(GUMDROPS[(i + 1) % 6]!, 0.2), 0.24, 0.22, 0.16, along * UPPER.w * 0.4, top - 0.5, -0.6 + UPPER.d / 2 + 0.08, false));
  }

  // the balcony over the porch, with a cane railing
  const by = UPPER.y;
  g.add(part(null, flat(WAFER, 0.6), 5.4, 0.22, 2.6, 0, by - 0.11, d / 2 - 0.4));
  for (let i = -3; i <= 3; i++) {
    const rail = candyCane(1.0, 0.09, CANDY.mint);
    rail.position.set(i * 0.85, by, d / 2 + 0.75);
    g.add(rail);
  }
  const bar = part(cylGeo, flat(CANDY.mint, 0.3), 0.1, 5.4, 0.1, 0, by + 1.0, d / 2 + 0.75, false);
  bar.rotation.z = Math.PI / 2;
  g.add(bar);

  if (castle) {
    // a flat roof with sugar-cube battlements instead of a gable
    g.add(part(null, flat(ICING, 0.5), UPPER.w + 0.5, 0.3, UPPER.d + 0.5, 0, top + 0.15, -0.6));
    const merlons = (len: number, along: "x" | "z", fixed: number) => {
      const n = Math.floor(len / 1.1);
      for (let i = 0; i <= n; i++) {
        const t = (i / n - 0.5) * len;
        const x = along === "x" ? t : fixed;
        const z = along === "x" ? fixed : t;
        g.add(part(null, flat(i % 2 ? ICING : CANDY.pinkPale, 0.45), 0.7, 0.7, 0.7, x, top + 0.65, z, false));
      }
    };
    merlons(UPPER.w + 0.5, "x", -0.6 + UPPER.d / 2 + 0.1);
    merlons(UPPER.w + 0.5, "x", -0.6 - UPPER.d / 2 - 0.1);
    merlons(UPPER.d + 0.5, "z", UPPER.w / 2 + 0.1);
    merlons(UPPER.d + 0.5, "z", -UPPER.w / 2 - 0.1);
    // her flag on a cane pole
    const pole = candyCane(3.2, 0.09, CANDY.lilac);
    pole.position.set(0, top + 0.3, -0.6);
    g.add(pole);
    const flag = part(null, flat(CANDY.pink, 0.3), 1.8, 1.0, 0.08, 0.95, top + 3.0, -0.6, false);
    g.add(flag);
    g.add(part(sphereGeo, flat(CHERRY, 0.2), 0.22, 0.22, 0.22, 0, top + 3.6, -0.6, false));
  } else {
    gable(g, UPPER.w, UPPER.d, top, 1.4);
    // a chocolate-bar chimney with a cotton-candy puff of smoke
    g.add(part(null, flat(CHOC, 0.5), 0.9, 2.2, 0.9, -UPPER.w / 2 + 1.1, top + 1.6, -2.4));
    g.add(part(null, flat(CHOC_DARK, 0.5), 1.1, 0.3, 1.1, -UPPER.w / 2 + 1.1, top + 2.8, -2.4, false));
    for (let i = 0; i < 3; i++) {
      const r = 0.45 + i * 0.16;
      g.add(part(sphereGeo, flat(CANDY.pinkPale, 0.75), r, r * 0.85, r, -UPPER.w / 2 + 1.1 + i * 0.35, top + 3.3 + i * 0.6, -2.4 - i * 0.2, false));
    }
  }
}

function towers(g: THREE.Group, boxes: AABB[]) {
  const { w, d } = CANDY_HOUSE;
  for (const s of [-1, 1]) {
    const x = s * (w / 2 + 1.1);
    const z = d / 2 - 1.6;
    const h = 10.2;
    const r = 2.0;
    // stripes up the tower, so it reads as a stick of rock from the square
    const bands = 9;
    for (let i = 0; i < bands; i++) {
      const c = i % 2 ? CANDY.pinkPale : ICING;
      g.add(part(cylGeo, flat(c, 0.4), r, h / bands, r, x, (h / bands) * (i + 0.5), z));
    }
    boxes.push(bx(x, h / 2, z, r * 1.7, h, r * 1.7));
    // a ring of icing under the roof and a window looking over the square
    icingRun(g, [x - r, h - 0.3, z], [x + r, h - 0.3, z], 0.28);
    const pane = part(cylGeo, flat(CANDY.yellow, 0.14), 0.7, 0.12, 0.7, x, 6.4, z + r - 0.02);
    pane.rotation.x = Math.PI / 2;
    g.add(pane);
    swirlCone(g, x, z, h, r + 0.5, 3.1, s > 0 ? CANDY.mint : CANDY.lilac);
  }
  // bunting between the towers, over the door
  const mat = [CANDY.pink, CANDY.yellow, CANDY.mint, CANDY.lilac, CANDY.orange];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const x = (t - 0.5) * (w + 2.2);
    const sag = Math.sin(t * Math.PI) * 0.9;
    const flagM = part(null, flat(mat[i % mat.length]!, 0.35), 0.34, 0.44, 0.06, x, 7.4 - sag, d / 2 - 1.5, false);
    flagM.rotation.z = Math.cos(t * Math.PI) * 0.35;
    g.add(flagM);
  }
}

/** The sugar garden: a low cane fence round the front lawn and a few sweets in it. */
function garden(g: THREE.Group) {
  const { w, d } = CANDY_HOUSE;
  const x0 = -w / 2 - 1.2;
  const x1 = w / 2 + 1.2;
  const z1 = d / 2 + 5.4;
  const post = (x: number, z: number, i: number) => {
    const c = candyCane(0.95, 0.08, i % 2 ? CANDY.mint : CANDY.pink);
    c.position.set(x, 0, z);
    g.add(c);
  };
  let i = 0;
  for (let x = x0; x <= x1 + 0.01; x += 1.5) {
    // leave the gate open where the path runs to the door
    if (Math.abs(x) < 1.8) continue;
    post(x, z1, i++);
  }
  for (let z = d / 2 + 0.6; z <= z1 - 0.01; z += 1.5) {
    post(x0, z, i++);
    post(x1, z, i++);
  }
  for (const [gx, gz, k] of [
    [-4.2, d / 2 + 3.2, 0],
    [4.0, d / 2 + 3.6, 2],
    [-2.6, d / 2 + 4.6, 4],
    [3.0, d / 2 + 1.8, 1],
  ] as const) {
    const r = 0.55;
    g.add(part(sphereGeo, flat(GUMDROPS[k]!, 0.2), r, r * 1.1, r, gx, r * 0.55, gz, false));
  }
}

/** The palace wing: a wafer hall across the back of the house under a golden dome. */
function palaceWing(g: THREE.Group, boxes: AABB[]) {
  const { w, d } = CANDY_HOUSE;
  const ww = w - 2;
  const wd = 7;
  const wh = 5.4;
  const z = -d / 2 - wd / 2 + 0.2;
  g.add(part(null, baked(WAFER, 4), ww, wh, wd, 0, wh / 2, z));
  // wafer grid pressed into the walls, so it reads as a wafer and not a box
  for (let i = 1; i < 6; i++) {
    const x = -ww / 2 + (ww / 6) * i;
    g.add(part(null, flat("#d49a4a", 0.6), 0.08, wh - 0.4, 0.06, x, wh / 2, z - wd / 2 - 0.03, false));
  }
  icingRun(g, [-ww / 2, wh, z - wd / 2], [ww / 2, wh, z - wd / 2], 0.26);
  icingRun(g, [-ww / 2, wh, z + wd / 2], [ww / 2, wh, z + wd / 2], 0.26);
  // round candy windows down each side
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const pane = part(cylGeo, flat(i ? CANDY.mint : CANDY.pink, 0.14), 0.6, 0.1, 0.6, sx * (ww / 2 + 0.02), 3.1, z - 1.5 + i * 3);
      pane.rotation.z = Math.PI / 2;
      g.add(pane);
    }
  }
  // the golden dome, and a cherry on it
  const dome = part(sphereGeo, lam("#ffd84a", { flat: true, roughness: 0.25, emissive: "#8a6a10" }), 2.6, 2.2, 2.6, 0, wh, z);
  g.add(dome);
  g.add(part(sphereGeo, flat(CHERRY, 0.2), 0.45, 0.45, 0.45, 0, wh + 2.4, z, false));
  boxes.push(bx(0, wh / 2, z, ww, wh, wd));
}

/** Rainbow palace: crowns on the towers, a rainbow over the gate, lights along the fence. */
function rainbowTrim(g: THREE.Group) {
  const { w, d } = CANDY_HOUSE;
  const gold = lam("#ffd84a", { flat: true, roughness: 0.25, emissive: "#8a6a10" });
  for (const s of [-1, 1]) {
    const x = s * (w / 2 + 1.1);
    const z = d / 2 - 1.6;
    const top = 10.2 + 3.1;
    g.add(part(cylGeo, gold, 0.5, 0.35, 0.5, x, top + 0.1, z, false));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.add(part(cone4Geo, gold, 0.14, 0.4, 0.14, x + Math.cos(a) * 0.42, top + 0.45, z + Math.sin(a) * 0.42, false));
    }
  }
  // the rainbow over the garden gate
  const gateZ = d / 2 + 5.4;
  ["#ff6b6b", "#ffae5c", "#ffe36b", "#6fe3c4", "#7ec8ff", "#b98cff"].forEach((c, i) => {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(2.4 - i * 0.16, 0.09, 8, 36, Math.PI), flat(c, 0.3));
    arc.position.set(0, 0, gateZ);
    arc.castShadow = true;
    g.add(arc);
  });
  // fairy lights along the fence tops
  const cols = ["#ff93c4", "#ffe36b", "#7ec8ff", "#6fe3c4", "#b98cff"];
  const x0 = -w / 2 - 1.2;
  const x1 = w / 2 + 1.2;
  let k = 0;
  const bulb = (x: number, z: number) => {
    const m = new THREE.Mesh(sphereGeo, glowMaterial(cols[k++ % cols.length]!, 1.3, 0.3));
    m.scale.setScalar(0.09);
    m.position.set(x, 1.05, z);
    g.add(m);
  };
  for (let x = x0; x <= x1 + 0.01; x += 0.75) if (Math.abs(x) >= 1.8) bulb(x, gateZ);
  for (let z = d / 2 + 0.6; z <= gateZ; z += 0.75) {
    bulb(x0, z);
    bulb(x1, z);
  }
}

/**
 * Her house at the given stage. Solid parts are on `userData.boxes`; the
 * doorway is left open, because the doorstep in front of it is what takes her
 * inside.
 */
export function makeCandyHouse(stage: HouseStage): THREE.Group {
  const g = new THREE.Group();
  g.name = `candy-house:${stage}`;
  const boxes: AABB[] = [];
  groundFloor(g, boxes);
  porch(g, stage > 1);
  if (stage === 1) {
    gable(g, CANDY_HOUSE.w, CANDY_HOUSE.d, CANDY_HOUSE.h, 1.7);
  } else {
    upperStorey(g, stage >= 3);
    garden(g);
    if (stage >= 3) towers(g, boxes);
    if (stage >= 4) palaceWing(g, boxes);
    if (stage >= 5) rainbowTrim(g);
  }
  g.userData.boxes = boxes;
  return g;
}
