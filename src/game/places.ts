import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { boxGeo, coneGeo, cylGeo, lam, mesh, sphereGeo } from "./meshes";
import type { BoxProp, Prop } from "./types";

/**
 * The five places that fill the lawns inside the ring of walkways.
 *
 * Why this file exists: those lawns were empty except for leftovers from v1
 * (three crude picnic tables and three coloured mats west of the plaza, a 20m
 * blue stripe with a plank across it north-east of it, a green mat with five
 * cubes on it south-east, a brown mat with four more, and an isolated kiosk on
 * the lawn west of the carousel). None of it could be named by a seven-year-old.
 * levels.ts no longer builds any of it; this builds places worth walking to.
 *
 * Split the way plaza.ts is split: the `*Props` functions are the level data,
 * which world-build.ts both makes solid and *draws*; the `make*` functions add
 * only what has no prop behind it (roofs, flowers, canopies, detail) and add no
 * colliders. Nothing here draws a shape a prop already draws, because addBox
 * tiles its texture by the prop's size and a redrawn copy would be a second
 * material as well as a second set of triangles.
 *
 * Two rules this file is written against:
 *  - nothing solid goes over her head. A collider above her flips the camera
 *    into its indoor mode (camera.ts), so canopies, roofs and the rose arch's
 *    hoop are decoration with only their legs as props.
 *  - a colour-and-size the park does not already use costs a draw call, since
 *    the static merge buckets by material. Sizes here are chosen so the flat
 *    lawns land on the same texture repeat as park.ts's picnic lawn, and every
 *    colour is one the plaza, the walkways or park.ts already wears.
 *
 * The ducks and the kites are the exception: each is one merged mesh with its
 * own vertex-shader material, one draw call for the whole flock, animated with
 * no per-frame work and no allocation.
 */

/** A/B switch for measuring what these places cost: ?noplaces=1 on the URL. */
export const NO_PLACES =
  typeof location !== "undefined" && /[?&]noplaces=1/.test(location.search);

/* ------------------------------------------------------------ where things are */

/** The kite field, on the big lawn west of the plaza. */
export const KITE_FIELD = { x: -23, z: 17, w: 22, d: 16 };
/** The duck pond, on the lawn north-east of the plaza. */
export const DUCK_POND = { x: 14.8, z: -15, r: 6.5 };
/** The flower garden, on the lawn beside the carnival midway. */
export const FLOWER_GARDEN = { x: 13, z: 31, w: 15, d: 13 };
/** The story circle, on the lawn beside the north road. */
export const STORY_CIRCLE = { x: -8.5, z: -14, r: 3.4 };
/** The fairground green, across the walkway from the carousel. */
export const FAIR_GREEN = { x: -39, z: 51, w: 16, d: 13 };

/* ------------------------------------------------------------------- helpers */

/**
 * Flat surfaces are stacked by the height of their top face; park.ts keeps the
 * master table and these are the two bands used here. Two overlapping surfaces
 * in the same band z-fight.
 */
const TOP = { lawn: 0.03, path: 0.1 };

const BENCH = "#c49a62";
const LEG = "#6a7a80";
const WOOD = "#8a5a32";
const DECK = "#c4a06a";
const PLANTER = "#c9825a";
const RIM = "#b06a48";
const SOIL = "#5a4632";
const STEM = "#3f9a6b";
const LAWN = "#63ac5e";
const MOWN = "#72b968";
const GRAVEL = "#d8c49a";
const HEDGE = "#3f7a42";
const HEDGE_TOP = "#4f9a52";
const STONE = "#a09890";
const HAY = "#e0c48a";
const CREAM = "#fff4e8";
const RED = "#e8455f";
const GOLD = "#ffc53d";
const BLUE = "#4f93c4";
const GREEN = "#2f7d5b";

function box(
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  color: string,
  collide = true,
): BoxProp {
  return { kind: "box", pos: [x, y, z], size: [sx, sy, sz], color, collide };
}

/** Flat slab described by the height of its visible top face. */
function surf(x: number, top: number, z: number, sx: number, sz: number, color: string, h = 0.12): BoxProp {
  return { kind: "box", pos: [x, top - h / 2, z], size: [sx, h, sz], color, collide: false };
}

/**
 * A park bench, the same shape as the plaza's. Seat and back are props (so it
 * is solid and casts a shadow); the legs are 0.2m props, under the solidity
 * rule's threshold, so they are drawn but never walls.
 */
function bench(x: number, z: number, along: "x" | "z", facing: number): Prop[] {
  const w = along === "x" ? 3.0 : 0.8;
  const d = along === "x" ? 0.8 : 3.0;
  const out: Prop[] = [box(x, 0.45, z, w, 0.2, d, BENCH)];
  if (along === "x") out.push(box(x, 0.85, z - facing * 0.32, w, 0.7, 0.16, BENCH, false));
  else out.push(box(x - facing * 0.32, 0.85, z, 0.16, 0.7, d, BENCH, false));
  for (const s of [-1, 1]) {
    const lx = along === "x" ? x + s * 1.3 : x;
    const lz = along === "x" ? z : z + s * 1.3;
    out.push(box(lx, 0.22, lz, along === "x" ? 0.2 : 0.6, 0.45, along === "x" ? 0.6 : 0.2, LEG, false));
  }
  return out;
}

/** A tuft of flowers on a bed or a bank; decoration, nothing solid. */
function flowerTuft(g: THREE.Group, x: number, y: number, z: number, seed: number, scale = 1) {
  const cols = [RED, GOLD, "#d47a8a", CREAM, "#b98ce0"];
  for (let i = 0; i < 5; i++) {
    const a = ((i + seed) / 5) * Math.PI * 2;
    const rr = 0.24 * scale * (0.5 + (((i + seed) * 7) % 5) / 8);
    const fx = x + Math.cos(a) * rr;
    const fz = z + Math.sin(a) * rr;
    const fy = y + 0.2 * scale + (((i + seed) * 3) % 4) * 0.05 * scale;
    g.add(mesh(cylGeo, STEM, 0.035 * scale, 0.26 * scale, 0.035 * scale, fx, fy - 0.1 * scale, fz, false));
    g.add(
      mesh(sphereGeo, cols[(i + seed) % cols.length]!, 0.12 * scale, 0.1 * scale, 0.12 * scale, fx, fy + 0.08 * scale, fz, false),
    );
  }
}

/* ----------------------------------------------------------------- kite field */

/** Where each flying kite is tied down. The strings run up from these. */
const KITE_ANCHORS: [number, number][] = [
  [-29.5, 20.5],
  [-27.0, 13.0],
  [-20.5, 21.5],
  [-17.5, 12.5],
  [-24.5, 10.0],
  [-14.5, 18.0],
];

/**
 * Kites need sky, so the kite field is mostly empty on purpose: a mown lawn
 * with a knoll to stand on at the west end, a rack of spare kites, two
 * benches and a windsock that shows the wind. Six kites are already up
 * (makeFlyingKites), so the field reads as a kite field from across the park.
 */
export function kiteFieldProps(): Prop[] {
  const { x, z, w, d } = KITE_FIELD;
  const out: Prop[] = [];

  // Two slabs, not one: pathOccupancy() reserves any flat prop under 12m on
  // its short side, so a striped lawn would read to the placement map as a
  // dozen little paths, and a single 22m slab would land on its own texture
  // repeat and so its own draw call. At 11 x 16 both halves tile like the
  // picnic lawn in park.ts and merge with it.
  for (const s of [-1, 1]) out.push(surf(x + s * (w / 4), TOP.lawn, z, w / 2, d, LAWN));

  // the knoll: two tiers, both inside the 0.62m step-up so she can walk up
  const kx = x - 6.5;
  const kz = z + 2.5;
  // its base starts at the top of the lawn slab, not at y 0: a tier that
  // starts underground intersects the slab and the layout checker says so
  // one colour and one texture repeat for both tiers, so they share a bucket
  // in the merge; the lighter crown on top is decoration
  out.push(box(kx, 0.28, kz, 8.6, 0.5, 7.0, "#6fa85e"));
  out.push(box(kx, 0.78, kz, 6.6, 0.5, 5.2, "#6fa85e"));
  // the windsock pole on top of it
  out.push(box(kx, 2.43, kz, 0.2, 3.3, 0.2, DECK));

  // the kite rack: two legs and a rail, with spare kites leaning on it
  const rx = x + 7.0;
  const rz = z + 6.0;
  for (const s of [-1, 1]) out.push(box(rx + s * 1.5, 0.6, rz, 0.22, 1.2, 0.22, WOOD));
  out.push(box(rx, 1.16, rz, 3.4, 0.18, 0.22, WOOD));

  out.push(...bench(x + 2.6, z - 6.2, "x", -1));
  out.push(...bench(x - 2.2, z + 6.6, "x", 1));

  // the pegs the flying kites are tied to, so every string ends on something
  for (const [px, pz] of KITE_ANCHORS) out.push(box(px, 0.16, pz, 0.3, 0.32, 0.3, WOOD, false));
  return out;
}

export function makeKiteField() {
  const g = new THREE.Group();
  const { x, z, w, d } = KITE_FIELD;

  // mowing stripes, every other one, 2cm over the lawn slabs so they cannot
  // z-fight them; decoration, so they all share one material with every other
  // mown patch in the park
  const stripes = 7;
  const sd = d / stripes;
  for (let i = 0; i < stripes; i += 2) {
    g.add(mesh(boxGeo, MOWN, w, 0.06, sd, x, 0.02, z - d / 2 + sd * (i + 0.5), false));
  }

  const kx = x - 6.5;
  const kz = z + 2.5;
  g.add(mesh(boxGeo, MOWN, 6.4, 0.06, 5.0, kx, 1.0, kz, false));
  // daisies over the knoll so it reads as a grassy mound, not a step
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    flowerTuft(g, kx + Math.cos(a) * 1.5, 1.03, kz + Math.sin(a) * 1.2, i, 0.8);
  }

  // windsock: striped rings tapering downwind off the top of the pole
  for (let i = 0; i < 4; i++) {
    const r = 0.36 - i * 0.06;
    g.add(mesh(boxGeo, i % 2 ? CREAM : RED, r * 2, r * 2, 0.62, kx + 0.34 + i * 0.6, 3.88, kz, false));
  }
  g.add(mesh(sphereGeo, GOLD, 0.16, 0.16, 0.16, kx, 4.23, kz, false));

  // four spare kites leaning on the rack
  const rx = x + 7.0;
  const rz = z + 6.0;
  [RED, BLUE, GOLD, "#b98ce0"].forEach((c, i) => {
    const k = new THREE.Group();
    k.add(mesh(boxGeo, c, 0.9, 1.3, 0.06, 0, 0, 0, false));
    k.add(mesh(boxGeo, CREAM, 0.12, 1.34, 0.08, 0, 0, 0.02, false));
    k.position.set(rx - 1.2 + i * 0.8, 0.72, rz + 0.34);
    k.rotation.x = -0.32;
    k.rotation.z = (i % 2 ? 1 : -1) * 0.12;
    g.add(k);
  });

  // a reel of string standing on every peg
  for (const [px, pz] of KITE_ANCHORS) g.add(mesh(cylGeo, CREAM, 0.13, 0.22, 0.13, px, 0.43, pz, false));

  return g;
}

/* ---------------------------------------------------------------- duck pond */

/**
 * The duck pond. The water itself is a level `water` zone (levels.ts): that is
 * what the runtime treats as water and what makes world-build add the sandy
 * shelf, the stone bank, the cattails and the lily pads. Here are the jetty
 * she walks out on, the duck house, the reeds on the near bank, a feed bin
 * and two benches.
 */
export function duckPondProps(): Prop[] {
  const { x, z, r } = DUCK_POND;
  const out: Prop[] = [];

  // The water. A `cyl` prop in one of the six liquid colours is what
  // world-build hands to the animated water shader, and the only kind of prop
  // that does. Two discs like the big pond's: one alone over the pale sandy
  // shelf reads as ice rather than water.
  out.push({ kind: "cyl", pos: [x, -0.12, z], r: r + 0.3, h: 0.42, color: "#5aa8c8", collide: false });
  out.push({ kind: "cyl", pos: [x, 0.08, z], r: r - 0.2, h: 0.18, color: "#6cb8d4", collide: false });

  // the jetty, reaching over the west edge of the water. Its top is 0.27, the
  // same band as the big pond's dock, so the step onto it is a step.
  out.push(box(9.5, 0.16, z, 5.4, 0.22, 2.6, DECK));
  for (const s of [-1, 1]) out.push(box(11.7, 0.5, z + s * 1.1, 0.24, 0.9, 0.24, WOOD, false));

  // the duck house, on the bank south-east of the water
  out.push(box(x + 3.4, 0.5, z + r + 1.1, 1.5, 1.0, 1.2, CREAM));

  // west of the jetty, facing the water. Its x is chosen so she never
  // settles on it at one of tools/walk.ts's grid points and then walks off
  // it straight into the side of the jetty.
  out.push(...bench(5.0, z - 3.6, "z", 1));
  out.push(...bench(x + 0.4, z + r + 2.4, "x", 1));

  // the feed bin beside the jetty, so the jetty has a reason to be there
  out.push(box(7.0, 0.42, z - 3.0, 0.9, 0.84, 0.9, PLANTER));
  return out;
}

export function makeDuckPond() {
  const g = new THREE.Group();
  const { x, z, r } = DUCK_POND;

  // plank lines across the jetty deck, and a ball on each post
  for (let i = 0; i < 5; i++) {
    g.add(mesh(boxGeo, WOOD, 5.44, 0.04, 0.06, 9.5, 0.26, z - 1.05 + i * 0.52, false));
  }
  for (const s of [-1, 1]) {
    g.add(mesh(sphereGeo, GOLD, 0.16, 0.16, 0.16, 11.7, 1.02, z + s * 1.1, false));
    // piles under the far end, so the deck is not floating over the water
    g.add(mesh(boxGeo, WOOD, 0.2, 0.6, 0.2, 11.5, 0.0, z + s * 0.95, false));
  }

  // the duck house: a pitched roof, a round door and a ramp to the water
  const hx = x + 3.4;
  const hz = z + r + 1.1;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.25, 0.62, 4), lam(RED, { flat: true, roughness: 0.6 }));
  roof.rotation.y = Math.PI / 4;
  roof.position.set(hx, 1.3, hz);
  roof.castShadow = true;
  g.add(roof);
  g.add(mesh(cylGeo, WOOD, 0.3, 0.1, 0.3, hx, 1.02, hz - 0.62, false));
  const ramp = mesh(boxGeo, DECK, 0.7, 0.1, 2.0, hx, 0.3, hz - 1.5, false);
  ramp.rotation.x = 0.3;
  g.add(ramp);

  // reeds on the near bank, where the pond edge's own cattails do not reach
  for (let i = 0; i < 6; i++) {
    const a = Math.PI * 1.15 + (i / 6) * Math.PI * 0.6;
    const rr = r + 1.1 + ((i * 29) % 3) * 0.3;
    const rx = x + Math.cos(a) * rr;
    const rz = z + Math.sin(a) * rr;
    const h = 0.8 + ((i * 17) % 5) * 0.12;
    g.add(mesh(boxGeo, STEM, 0.05, h, 0.05, rx, h / 2, rz, false));
    g.add(mesh(boxGeo, "#6a4a2a", 0.1, 0.26, 0.1, rx, h + 0.08, rz, false));
  }

  // the feed bin's lid, with a scoop of corn on it
  g.add(mesh(boxGeo, RIM, 1.02, 0.12, 1.02, 7.0, 0.9, z - 3.0, false));
  for (let i = 0; i < 5; i++) {
    g.add(mesh(sphereGeo, GOLD, 0.08, 0.08, 0.08, 6.8 + (i % 3) * 0.16, 1.0, z - 3.16 + (i % 2) * 0.22, false));
  }

  return g;
}

/* ------------------------------------------------------------ flower garden */

/**
 * A walled flower garden beside the midway: four raised beds round a
 * birdbath, gravel paths between them, a rose arch on the midway side and a
 * hedge on the other three, so it reads as a room rather than a patch. The
 * ladybug sticker (collectibles.ts) sits on the north-west bed.
 */
export function flowerGardenProps(): Prop[] {
  const { x, z, w, d } = FLOWER_GARDEN;
  const out: Prop[] = [];
  out.push(surf(x, TOP.lawn, z, w, d, LAWN));

  // gravel cross paths, 7cm over the lawn: their own band, so no z-fight
  out.push(surf(x, TOP.path, z, 2.6, d - 1.4, GRAVEL));
  for (const s of [-1, 1]) out.push(surf(x + s * 4.05, TOP.path, z, 5.5, 2.6, GRAVEL));

  // four raised beds, one per quadrant. 0.5m high: a step, never a wall.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      out.push(box(x + sx * 4.1, 0.25, z + sz * 3.7, 4.4, 0.5, 3.8, PLANTER));
    }
  }

  // the birdbath in the middle
  out.push(box(x, 0.45, z, 0.9, 0.9, 0.9, CREAM));

  // hedge on three sides; the midway side is the way in
  // in 5m lengths, so every piece tiles the same way and the three walls are
  // one bucket in the merge rather than two
  const hh = 1.0;
  for (let i = 0; i < 3; i++) {
    const hx = x - w / 2 + 2.5 + i * 5;
    out.push(box(hx, hh / 2, z - d / 2 + 0.4, 5, hh, 0.8, HEDGE));
    out.push(box(hx, hh / 2, z + d / 2 - 0.4, 5, hh, 0.8, HEDGE));
  }
  for (const s of [-1, 1]) out.push(box(x + w / 2 - 0.4, hh / 2, z + s * 2.85, 0.8, hh, 5.0, HEDGE));

  // the rose arch over the entrance. Only the legs are solid: an arch across
  // the top would be a ceiling and the camera would duck indoors under it.
  const ax = x - w / 2 - 0.4;
  for (const s of [-1, 1]) out.push(box(ax, 1.3, z + s * 1.5, 0.24, 2.6, 0.24, GREEN));

  out.push(...bench(x - 4.0, z, "z", -1));
  return out;
}

export function makeFlowerGarden() {
  const g = new THREE.Group();
  const { x, z, w, d } = FLOWER_GARDEN;

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const bx = x + sx * 4.1;
      const bz = z + sz * 3.7;
      g.add(mesh(boxGeo, RIM, 4.56, 0.12, 3.96, bx, 0.5, bz, false));
      g.add(mesh(boxGeo, SOIL, 3.9, 0.1, 3.3, bx, 0.54, bz, false));
      for (let i = 0; i < 9; i++) {
        flowerTuft(g, bx - 1.5 + (i % 3) * 1.5, 0.58, bz - 1.1 + Math.floor(i / 3) * 1.1, i + (sx > 0 ? 3 : 0) + (sz > 0 ? 5 : 0));
      }
    }
  }

  // the birdbath's dish, with a sparrow on the rim
  g.add(mesh(cylGeo, STONE, 0.85, 0.16, 0.85, x, 0.98, z, false));
  g.add(mesh(cylGeo, "#9fd4ea", 0.7, 0.08, 0.7, x, 1.05, z, false));
  g.add(mesh(sphereGeo, "#8a5a3a", 0.14, 0.16, 0.2, x + 0.62, 1.16, z, false));

  // a lighter crown along each hedge, the same trim park.ts's hedges wear
  const hh = 1.0;
  for (const [hx, hz, hw, hd] of [
    [x, z - d / 2 + 0.4, w, 0.8],
    [x, z + d / 2 - 0.4, w, 0.8],
    [x + w / 2 - 0.4, z, 0.8, d - 1.6],
  ] as [number, number, number, number][]) {
    g.add(mesh(boxGeo, HEDGE_TOP, hw * 0.96, 0.16, hd * 0.9, hx, hh + 0.06, hz, false));
  }

  // the rose arch: a drawn hoop between the two solid legs, roses along it
  const ax = x - w / 2 - 0.4;
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.11, 6, 18, Math.PI), lam(GREEN, { flat: true, roughness: 0.7 }));
  hoop.rotation.y = Math.PI / 2;
  hoop.position.set(ax, 2.6, z);
  g.add(hoop);
  for (let i = 0; i <= 7; i++) {
    const a = (i / 7) * Math.PI;
    g.add(mesh(sphereGeo, i % 2 ? "#d47a8a" : CREAM, 0.16, 0.16, 0.16, ax, 2.6 + Math.sin(a) * 1.5, z + Math.cos(a) * 1.5, false));
  }

  return g;
}

/* -------------------------------------------------------------- story circle */

/** A ring of log seats round a lantern stump, beside the north road. */
export function storyCircleProps(): Prop[] {
  const { x, z, r } = STORY_CIRCLE;
  const out: Prop[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.35;
    const lx = x + Math.cos(a) * r;
    const lz = z + Math.sin(a) * r;
    const alongX = Math.abs(Math.sin(a)) > 0.5;
    out.push(box(lx, 0.25, lz, alongX ? 2.0 : 0.6, 0.5, alongX ? 0.6 : 2.0, WOOD));
  }
  out.push(box(x, 0.3, z, 1.0, 0.6, 1.0, DECK));
  return out;
}

export function makeStoryCircle() {
  const g = new THREE.Group();
  const { x, z, r } = STORY_CIRCLE;
  // a mown ring under the logs; decoration, so it shares the kite field's
  // material rather than buying one of its own
  g.add(mesh(cylGeo, MOWN, r + 1.6, 0.06, r + 1.6, x, 0.02, z, false));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.35;
    const lx = x + Math.cos(a) * r;
    const lz = z + Math.sin(a) * r;
    const alongX = Math.abs(Math.sin(a)) > 0.5;
    g.add(mesh(boxGeo, DECK, alongX ? 1.9 : 0.5, 0.08, alongX ? 0.5 : 1.9, lx, 0.52, lz, false));
  }
  // a storm lantern standing on the stump
  g.add(mesh(boxGeo, "#3a3531", 0.3, 0.1, 0.3, x, 0.65, z, false));
  g.add(mesh(boxGeo, GOLD, 0.22, 0.34, 0.22, x, 0.87, z, false));
  g.add(mesh(boxGeo, "#3a3531", 0.3, 0.1, 0.3, x, 1.08, z, false));
  g.add(mesh(boxGeo, "#3a3531", 0.06, 0.3, 0.06, x, 1.26, z, false));
  // toadstools, because a story circle should have them
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 1.1;
    const mx = x + Math.cos(a) * (r + 1.1);
    const mz = z + Math.sin(a) * (r + 1.1);
    g.add(mesh(cylGeo, CREAM, 0.08, 0.26, 0.08, mx, 0.13, mz, false));
    g.add(mesh(sphereGeo, RED, 0.22, 0.14, 0.22, mx, 0.3, mz, false));
  }
  return g;
}

/* ----------------------------------------------------------- fairground green */

const FAIR_POLES: [number, number][] = [
  [-45.6, 46.6],
  [-33.0, 46.6],
  [-45.6, 55.4],
  [-33.0, 55.4],
];
const FAIR_TABLES: [number, number][] = [
  [-41.6, 53.4],
  [-35.6, 49.0],
];
const FAIR_BALES: [number, number][] = [
  [-43.6, 50.4],
  [-41.8, 50.4],
  [-35.4, 54.6],
  [-33.6, 54.6],
];
const FAIR_RUGS: [number, number, string][] = [
  [-38.0, 53.2, "#d47a8a"],
  [-44.2, 54.6, BLUE],
  [-33.6, 50.6, "#d45a4a"],
];
/** The refreshment tent, west end of the green. */
const FAIR_TENT: [number, number] = [-43.2, 47.4];

/**
 * The lawn across the walkway from the carousel held one kiosk and nothing
 * else. It is where you sit down after the rides now: a striped refreshment
 * tent, bunting on striped poles, rugs with baskets, two parasol tables and
 * hay bales.
 *
 * Everything stays west of x -31, so the carnival's own approach corridor
 * (the `keepClear` rect at (-16, 40) in levels.ts) is untouched and none of
 * the carnival's props move.
 */
export function fairGreenProps(): Prop[] {
  const { x, z, w, d } = FAIR_GREEN;
  const out: Prop[] = [];
  out.push(surf(x, TOP.lawn, z, w, d, LAWN));

  // the refreshment tent: one solid block, dressed with stripes below
  out.push(box(FAIR_TENT[0], 1.1, FAIR_TENT[1], 3.6, 2.2, 3.6, CREAM));
  out.push(box(FAIR_TENT[0], 0.6, FAIR_TENT[1] + 2.3, 2.6, 1.2, 0.5, DECK));

  // bunting poles round the green
  for (const [px, pz] of FAIR_POLES) out.push(box(px, 1.6, pz, 0.22, 3.2, 0.22, RED));

  // parasol tables: the top is a real prop, the canopy over it is drawn
  for (const [px, pz] of FAIR_TABLES) {
    out.push(box(px, 0.75, pz, 1.5, 0.14, 1.5, DECK));
    out.push(box(px, 1.4, pz, 0.18, 2.8, 0.18, WOOD, false));
  }

  // hay bales to sit on, all inside the step-up
  for (const [px, pz] of FAIR_BALES) out.push(box(px, 0.3, pz, 1.6, 0.6, 0.95, HAY));

  out.push(...bench(x + 5.6, z + 3.4, "z", 1));
  return out;
}

export function makeFairGreen() {
  const g = new THREE.Group();
  const { x, z, w, d } = FAIR_GREEN;

  // mowing stripes over the lawn slab, the same trick as the kite field
  const stripes = 5;
  const sd = d / stripes;
  for (let i = 0; i < stripes; i += 2) {
    g.add(mesh(boxGeo, MOWN, w, 0.06, sd, x, 0.02, z - d / 2 + sd * (i + 0.5), false));
  }

  // the tent: red stripes painted on the cream block, a scalloped cone roof
  const [tx, tz] = FAIR_TENT;
  for (let i = 0; i < 3; i++) {
    const o = -1.1 + i * 1.1;
    g.add(mesh(boxGeo, RED, 0.62, 2.2, 0.06, tx + o, 1.1, tz - 1.83, false));
    g.add(mesh(boxGeo, RED, 0.62, 2.2, 0.06, tx + o, 1.1, tz + 1.83, false));
    g.add(mesh(boxGeo, RED, 0.06, 2.2, 0.62, tx - 1.83, 1.1, tz + o, false));
    g.add(mesh(boxGeo, RED, 0.06, 2.2, 0.62, tx + 1.83, 1.1, tz + o, false));
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.5, 8), lam(RED, { flat: true, roughness: 0.6 }));
  roof.position.set(tx, 2.95, tz);
  roof.castShadow = true;
  g.add(roof);
  g.add(mesh(sphereGeo, GOLD, 0.3, 0.34, 0.3, tx, 3.9, tz, false));
  // two big jars on the counter
  g.add(mesh(boxGeo, GOLD, 0.34, 0.4, 0.34, tx - 0.7, 1.4, tz + 2.3, false));
  g.add(mesh(boxGeo, BLUE, 0.34, 0.4, 0.34, tx + 0.7, 1.4, tz + 2.3, false));

  // collars and a finial on each striped pole
  for (const [px, pz] of FAIR_POLES) {
    g.add(mesh(boxGeo, CREAM, 0.26, 0.3, 0.26, px, 1.0, pz, false));
    g.add(mesh(boxGeo, CREAM, 0.26, 0.3, 0.26, px, 2.0, pz, false));
    g.add(mesh(sphereGeo, GOLD, 0.2, 0.2, 0.2, px, 3.35, pz, false));
  }

  // bunting between the poles. The flags use the same flat material as the
  // plaza's, so both sets merge into one mesh per colour for the whole park.
  const strings = new Map<string, THREE.BufferGeometry[]>();
  const ring = [FAIR_POLES[0]!, FAIR_POLES[1]!, FAIR_POLES[3]!, FAIR_POLES[2]!];
  for (let i = 0; i < ring.length; i++) {
    bunting([ring[i]![0], 3.1, ring[i]![1]], [ring[(i + 1) % ring.length]![0], 3.1, ring[(i + 1) % ring.length]![1]], strings);
  }
  for (const [color, geos] of strings) {
    const merged = mergeGeometries(geos.map(forMerge), false);
    for (const gg of geos) gg.dispose();
    if (!merged) continue;
    const m = new THREE.Mesh(merged, lam(color, { flat: true, roughness: 0.75 }));
    m.castShadow = false;
    m.receiveShadow = true;
    g.add(m);
  }

  // rugs with a basket and something to eat on each
  for (const [rx, rz, col] of FAIR_RUGS) {
    g.add(mesh(boxGeo, col, 2.6, 0.06, 2.2, rx, 0.05, rz, false));
    g.add(mesh(boxGeo, CREAM, 2.2, 0.03, 0.3, rx, 0.09, rz, false));
    g.add(mesh(boxGeo, PLANTER, 0.7, 0.44, 0.5, rx + 0.8, 0.28, rz - 0.6, false));
    g.add(mesh(boxGeo, RIM, 0.76, 0.1, 0.56, rx + 0.8, 0.52, rz - 0.6, false));
    g.add(mesh(sphereGeo, RED, 0.16, 0.16, 0.16, rx - 0.6, 0.2, rz + 0.4, false));
    g.add(mesh(sphereGeo, GOLD, 0.14, 0.14, 0.14, rx - 0.3, 0.19, rz + 0.55, false));
  }

  // parasols over the tables, and a stool on each side
  FAIR_TABLES.forEach(([px, pz], i) => {
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.6, 8), lam(i % 2 ? GOLD : BLUE, { flat: true, roughness: 0.6 }));
    canopy.position.set(px, 2.9, pz);
    canopy.castShadow = true;
    g.add(canopy);
    g.add(mesh(sphereGeo, CREAM, 0.14, 0.14, 0.14, px, 3.24, pz, false));
    for (const s of [-1, 1]) g.add(mesh(cylGeo, DECK, 0.42, 0.44, 0.42, px + s * 1.5, 0.22, pz, false));
  });

  // a band of string round each bale
  for (const [px, pz] of FAIR_BALES) g.add(mesh(boxGeo, "#d4b07a", 1.66, 0.1, 0.2, px, 0.62, pz, false));

  return g;
}

/** A string of triangular flags between two points, sagging in the middle. */
/**
 * mergeGeometries refuses a batch whose members do not carry identical
 * attributes, and the shared primitives vary (some arrive with uv2, some
 * without uv). Trim every one to position, normal and uv first.
 */
function forMerge(gIn: THREE.BufferGeometry) {
  // an indexed member mixed with non-indexed ones fails the whole batch
  const g = gIn.index ? gIn.toNonIndexed() : gIn;
  for (const name of Object.keys(g.attributes)) {
    if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    const n = g.attributes.position!.count;
    g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  return g;
}

function bunting(
  from: [number, number, number],
  to: [number, number, number],
  out: Map<string, THREE.BufferGeometry[]>,
) {
  const colors = [RED, GOLD, BLUE, "#3fa35c", CREAM];
  const span = Math.hypot(to[0] - from[0], to[2] - from[2]);
  const n = Math.max(3, Math.round(span / 1.5));
  const sag = Math.min(1.2, span * 0.08);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = from[0] + (to[0] - from[0]) * t;
    const zz = from[2] + (to[2] - from[2]) * t;
    const y = from[1] + (to[1] - from[1]) * t - Math.sin(t * Math.PI) * sag;
    const geo = new THREE.ConeGeometry(0.22, 0.5, 3);
    geo.rotateX(Math.PI);
    geo.rotateY(Math.atan2(to[0] - from[0], to[2] - from[2]));
    geo.translate(x, y - 0.25, zz);
    const col = colors[i % colors.length]!;
    const list = out.get(col) ?? [];
    list.push(geo);
    out.set(col, list);
  }
}

/* ------------------------------------------------------- the animated things */

/**
 * The ducks and the kites move every frame without costing a frame: each is
 * one merged geometry carrying per-vertex animation data, drawn with one
 * material whose vertex shader does the work. The runtime already ticks a
 * `uTime` uniform on every material in `world.waterMats` (that is what drives
 * the pond shader), so world-build puts these two in the same list and nothing
 * in the game loop has to know about them.
 *
 * They are kept out of the static merge, which strips every attribute except
 * position, normal and uv; one draw call each is the point anyway. Neither
 * casts a shadow, because the shadow pass would draw them where they are not.
 */
export type Animated = { mesh: THREE.Mesh; material: THREE.Material };

function animatedMaterial(cacheKey: string, inject: string, side: THREE.Side) {
  const uniforms = { uTime: { value: 0 } };
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.72,
    metalness: 0.02,
    flatShading: true,
    side,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform float uTime;
         attribute vec3 aAnchor;
         attribute vec2 aWave;`,
      )
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${inject}`);
  };
  // a unique program, so the injection is never shared with a plain material
  m.customProgramCacheKey = () => cacheKey;
  (m as unknown as { uniforms: { uTime: { value: number } } }).uniforms = uniforms;
  return m;
}

type Part = { geo: THREE.BufferGeometry; color: THREE.Color; anchor: THREE.Vector3; wave: [number, number] };

/** Bake one primitive into world space and tag it with its animation data. */
function part(geo: THREE.BufferGeometry, m: THREE.Matrix4, color: string, anchor: THREE.Vector3, wave: [number, number]): Part {
  const src = geo.clone();
  const g = src.index ? src.toNonIndexed() : src;
  g.applyMatrix4(m);
  /*
   * Every part has to carry exactly the same attributes or mergeGeometries
   * refuses the batch (it was failing at index 1 and the kites never drew).
   * The shared primitives differ: some arrive with uv2 or without uv at all,
   * depending on which helper built them.
   */
  for (const name of Object.keys(g.attributes)) {
    if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    const n = g.attributes.position!.count;
    g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  return { geo: g, color: new THREE.Color(color), anchor: anchor.clone(), wave };
}

function bakeParts(parts: Part[]) {
  for (const p of parts) {
    const n = p.geo.attributes.position!.count;
    const col = new Float32Array(n * 3);
    const anc = new Float32Array(n * 3);
    const wav = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      col[i * 3] = p.color.r;
      col[i * 3 + 1] = p.color.g;
      col[i * 3 + 2] = p.color.b;
      anc[i * 3] = p.anchor.x;
      anc[i * 3 + 1] = p.anchor.y;
      anc[i * 3 + 2] = p.anchor.z;
      wav[i * 2] = p.wave[0];
      wav[i * 2 + 1] = p.wave[1];
    }
    p.geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    p.geo.setAttribute("aAnchor", new THREE.BufferAttribute(anc, 3));
    p.geo.setAttribute("aWave", new THREE.BufferAttribute(wav, 2));
  }
  const merged = mergeGeometries(
    parts.map((p) => p.geo),
    false,
  );
  for (const p of parts) p.geo.dispose();
  return merged;
}

function trs(px: number, py: number, pz: number, sx: number, sy: number, sz: number, rx = 0) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(px, py, pz),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)),
    new THREE.Vector3(sx, sy, sz),
  );
}

/**
 * The kites over the kite field. Each one swings about the peg it is tied to,
 * and the string swings with it, so it reads as one kite on one line rather
 * than a shape sliding past a stick.
 */
export function makeFlyingKites(): Animated | null {
  const parts: Part[] = [];
  const cols = [RED, BLUE, GOLD, "#3fa35c", "#d47a8a", "#b98ce0"];
  const dir = new THREE.Vector3();
  const mid = new THREE.Vector3();

  KITE_ANCHORS.forEach(([ax, az], i) => {
    const anchor = new THREE.Vector3(ax, 0.32, az);
    const wave: [number, number] = [i * 1.7, 0.4 + (i % 3) * 0.07];
    const lean = 0.4 + (i % 3) * 0.07;
    const around = (i / KITE_ANCHORS.length) * Math.PI * 2 + 0.6;
    const h = 9.5 + (i % 4) * 1.9;
    const K = new THREE.Vector3(ax + Math.cos(around) * h * lean, 0.32 + h, az + Math.sin(around) * h * lean);

    // the string, a thin box from the peg up to the kite
    dir.subVectors(K, anchor);
    const len = dir.length();
    const up = dir.clone().normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    mid.copy(anchor).addScaledVector(dir, 0.5);
    parts.push(part(boxGeo, new THREE.Matrix4().compose(mid, q, new THREE.Vector3(0.05, len, 0.05)), "#efe4d0", anchor, wave));

    // the sail: a diamond across the line, with two spars and a tail
    const right = new THREE.Vector3(0, 1, 0).cross(up).normalize();
    const fwd = new THREE.Vector3().crossVectors(right, up);
    const basis = new THREE.Matrix4().makeBasis(right, up, fwd).setPosition(K);
    const col = cols[i % cols.length]!;
    const w = 0.85;
    const a = 1.15;
    const b = 1.65;
    const sail = new THREE.BufferGeometry();
    sail.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, a, 0, -w, 0, 0.16, 0, -b, 0, 0, a, 0, 0, -b, 0, w, 0, 0.16], 3),
    );
    // it needs a uv even though nothing samples one: mergeGeometries refuses a
    // set of geometries whose attributes do not match, and the first version
    // of this shipped with no kites in the sky at all because of it
    sail.setAttribute("uv", new THREE.Float32BufferAttribute([0.5, 1, 0, 0.5, 0.5, 0, 0.5, 1, 0.5, 0, 1, 0.5], 2));
    sail.computeVertexNormals();
    parts.push(part(sail, basis, col, anchor, wave));
    sail.dispose();
    parts.push(part(boxGeo, basis.clone().multiply(trs(0, -0.25, 0.03, 0.1, 2.8, 0.06)), CREAM, anchor, wave));
    parts.push(part(boxGeo, basis.clone().multiply(trs(0, 0, 0.03, 1.7, 0.1, 0.06)), CREAM, anchor, wave));
    for (let t = 1; t <= 5; t++) {
      parts.push(
        part(
          boxGeo,
          basis.clone().multiply(trs(Math.sin(t * 1.3) * 0.34, -b - t * 0.55, 0, 0.34, 0.2, 0.08)),
          t % 2 ? CREAM : col,
          anchor,
          wave,
        ),
      );
    }
  });

  const merged = bakeParts(parts);
  if (!merged) return null;
  const material = animatedMaterial(
    "sloanie-kites",
    `
     float kt = uTime * aWave.y + aWave.x;
     float sx = sin(kt) * 0.15 + sin(kt * 0.57 + 1.3) * 0.06;
     float sz = cos(kt * 0.83 + 0.6) * 0.13 + sin(kt * 1.31) * 0.04;
     vec3 rel = transformed - aAnchor;
     float c1 = cos(sx), s1 = sin(sx);
     rel = vec3(rel.x, rel.y * c1 - rel.z * s1, rel.y * s1 + rel.z * c1);
     float c2 = cos(sz), s2 = sin(sz);
     rel = vec3(rel.x * c2 - rel.y * s2, rel.x * s2 + rel.y * c2, rel.z);
     transformed = aAnchor + rel;
     transformed.y += sin(kt * 1.6) * 0.14;`,
    THREE.DoubleSide,
  );
  const m = new THREE.Mesh(merged, material);
  m.castShadow = false;
  m.receiveShadow = false;
  m.frustumCulled = false;
  return { mesh: m, material };
}

/**
 * The ducks on the duck pond: four adults, four ducklings, each going round
 * its own slow circle. The whole flock is one mesh; the shader turns each bird
 * about its own centre, which carries its heading with it, and bobs it.
 */
export function makeDucks(): Animated | null {
  const { x, z } = DUCK_POND;
  const parts: Part[] = [];
  const Y = 0.2;

  const duck = (cx: number, cz: number, radius: number, speed: number, phase: number, s: number, body: string, head: string) => {
    const anchor = new THREE.Vector3(cx, Y, cz);
    const wave: [number, number] = [phase, speed];
    // built due east of its centre facing +z, which is the tangent the
    // shader's rotation then carries it along
    const bx = cx + radius;
    const bz = cz;
    parts.push(part(sphereGeo, trs(bx, Y + 0.16 * s, bz, 0.34 * s, 0.26 * s, 0.46 * s), body, anchor, wave));
    parts.push(part(sphereGeo, trs(bx, Y + 0.34 * s, bz + 0.3 * s, 0.19 * s, 0.2 * s, 0.19 * s), head, anchor, wave));
    parts.push(part(boxGeo, trs(bx, Y + 0.26 * s, bz + 0.2 * s, 0.12 * s, 0.2 * s, 0.12 * s), head, anchor, wave));
    parts.push(part(coneGeo, trs(bx, Y + 0.32 * s, bz + 0.48 * s, 0.09 * s, 0.22 * s, 0.09 * s, Math.PI / 2), GOLD, anchor, wave));
    parts.push(part(boxGeo, trs(bx, Y + 0.22 * s, bz - 0.44 * s, 0.16 * s, 0.12 * s, 0.24 * s), body, anchor, wave));
    // a flat wake trailing behind, so they look like they are moving
    parts.push(part(boxGeo, trs(bx, Y + 0.005, bz - 0.8 * s, 0.5 * s, 0.02, 1.0 * s), "#dff4ff", anchor, wave));
  };

  duck(x - 1.2, z - 0.8, 2.6, 0.17, 0, 1, CREAM, "#3f8a4a");
  for (let i = 1; i <= 3; i++) duck(x - 1.2, z - 0.8, 2.6 - i * 0.2, 0.17, -i * 0.26, 0.55, "#f0e08a", "#e8c46a");
  duck(x + 1.9, z + 1.7, 2.1, -0.13, 1.1, 1, CREAM, "#8a5a3a");
  duck(x + 1.9, z + 1.7, 2.1, -0.13, 2.6, 0.95, "#e8d7b8", "#6a4a2a");
  duck(x + 1.9, z + 1.7, 1.8, -0.13, 4.0, 0.55, "#f0e08a", "#e8c46a");
  duck(x - 0.6, z + 2.8, 1.3, 0.24, 2.0, 0.9, CREAM, "#3f8a4a");

  const merged = bakeParts(parts);
  if (!merged) return null;
  const material = animatedMaterial(
    "sloanie-ducks",
    `
     float dt = uTime * aWave.y + aWave.x;
     float cd = cos(dt), sd = sin(dt);
     vec2 rel = transformed.xz - aAnchor.xz;
     transformed.xz = aAnchor.xz + vec2(rel.x * cd - rel.y * sd, rel.x * sd + rel.y * cd);
     transformed.y += sin(uTime * 1.9 + aWave.x * 2.0) * 0.045;`,
    THREE.FrontSide,
  );
  const m = new THREE.Mesh(merged, material);
  m.castShadow = false;
  m.receiveShadow = true;
  m.frustumCulled = false;
  return { mesh: m, material };
}

/* ------------------------------------------------------------------ the lot */

/** Every solid and every flat surface these five places put on the map. */
export function placeProps(): Prop[] {
  return [
    ...kiteFieldProps(),
    ...duckPondProps(),
    ...flowerGardenProps(),
    ...storyCircleProps(),
    ...fairGreenProps(),
  ];
}

/**
 * Everything drawn on top of those props. `live` is what must stay out of the
 * static merge and `mats` is what the runtime ticks a `uTime` uniform on.
 */
export function makePlaces() {
  const group = new THREE.Group();
  if (NO_PLACES) return { group, live: [] as THREE.Object3D[], mats: [] as THREE.Material[] };
  group.add(makeKiteField());
  group.add(makeDuckPond());
  group.add(makeFlowerGarden());
  group.add(makeStoryCircle());
  group.add(makeFairGreen());

  const live: THREE.Object3D[] = [];
  const mats: THREE.Material[] = [];
  for (const a of [makeFlyingKites(), makeDucks()]) {
    if (!a) continue;
    group.add(a.mesh);
    live.push(a.mesh);
    mats.push(a.material);
  }
  return { group, live, mats };
}
