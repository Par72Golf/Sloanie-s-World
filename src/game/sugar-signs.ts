import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CANDY, makeLollipopTree } from "./candy-scenery";
import { boxGeo, cone4Geo, cylGeo, mesh, signBoard, sphereGeo } from "./meshes";
import { registerModel, type ModelBox } from "./models";
import { model } from "./sugar-models";
import { SUGAR } from "./sugar-rush";
import type { Prop } from "./types";

/**
 * Sugar Rush Park: gates, name boards and bunting.
 *
 * Stage 2 gave the park ten places. Walking it, a seven-year-old cannot tell
 * where one ends and the next begins — the ground is one mint sheet, the paths
 * are one cream ribbon, and nothing anywhere says a name out loud. This module
 * is the three things that fix that, in the order she meets them:
 *
 *   1. a **name board** beside the path she is already on, at the turn-off,
 *      telling her what is down there;
 *   2. a **gate** at the mouth of the place itself, built out of whatever that
 *      place is made of, with the name across it, so arriving is a thing that
 *      happens to her;
 *   3. **bunting** over the two places that are meant to feel like a party.
 *
 * The board and the gate carry the same words, so they are kept thirty metres
 * apart and never share a frame: at fifteen the pair read as one sign printed
 * twice. Far apart they are two different jobs — the board is the choice, the
 * gate is the arrival.
 *
 * Everything here is a registered model placed as a `model` prop, so the mesh
 * and its collider come from one entry and the level only has to spread three
 * arrays into its prop list.
 *
 * ## Where things can stand
 *
 * There is no placement map in this park: the regions scatter their own
 * planting with `clearGround(x, z, pad)`, which rejects anything within `pad`
 * of a path, and every caller passes pad 2 or more. So the one strip of ground
 * guaranteed to stay empty is the 2m verge either side of every path — and
 * that is exactly where a name board wants to be anyway. Every board below
 * stands 1.2m to 1.8m off a path edge with its face turned across the path,
 * so she reads it broadside as she walks by and nothing can ever be planted
 * on top of it. `plantingProps` puts its avenue trees 3.4m off the edge, well
 * clear behind them.
 */

/* ------------------------------------------------------------- vocabulary */

const LICORICE = "#2a2430";
const GINGER = "#b3763c";
const ICING = "#f6f1e8";
const CREAM = "#f7ead3";
const WAFER = "#e8c88a";
const WAFER_DARK = "#c99a58";
const CHOC = "#6b4226";
/** The gumdrop colours a bunting string and a gate's trim cycle through. */
const PARTY = [CANDY.red, CANDY.yellow, CANDY.mint, CANDY.lilac, CANDY.pink, CANDY.orange];

const box = (minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number): ModelBox => ({
  minX,
  maxX,
  minY,
  maxY,
  minZ,
  maxZ,
});

/** A candy-cane post: alternating cylinders, because a striped one needs a texture. */
function stripePost(g: THREE.Group, x: number, z: number, height: number, r: number, flip = 0) {
  const n = Math.max(2, Math.round(height / 0.34));
  const h = height / n;
  for (let i = 0; i < n; i++) {
    g.add(mesh(cylGeo, (i + flip) % 2 ? CANDY.white : CANDY.red, r, h, r, x, (i + 0.5) * h, z));
  }
}

/* ------------------------------------------------------------ the lettering */

/**
 * The painted face of `signBoard`, on its own.
 *
 * `signBoard` is how every other sign in the game is lettered — the carnival
 * arch, the cave mouth, her house — and using it here means Sugar Rush cannot
 * drift into a second typeface. What it hands back is a box with six
 * materials, which is six draw calls, five of them the same brown as the body.
 * So we keep the one material carrying the canvas and drop the box; the board
 * below is built round it with the same trick park 1's `boardMesh` uses.
 */
function boardPaint(text: string, w: number, h: number): THREE.Material {
  const b = signBoard(text, w, h);
  b.geometry.dispose();
  // BoxGeometry material order is +x, -x, +y, -y, +z, -z: index 4 is the face
  // signBoard draws on.
  return (b.material as THREE.Material[])[4]!;
}

/**
 * A board with the same lettering on both faces: one material, one mesh, two
 * quads. A board she can only read from one side is a board she walks past
 * half the time, and this costs nothing extra to make double-sided.
 */
function paintedBoard(text: string, w: number, h: number, depth: number) {
  const g = new THREE.Group();
  g.add(mesh(boxGeo, CHOC, w, h, depth, 0, 0, 0));
  // the paint stands 12mm proud of the body so nothing behind it — posts,
  // frame, lintel — can ever stand over a letter
  const zf = depth / 2 + 0.012;
  const front = new THREE.PlaneGeometry(w - 0.06, h - 0.06);
  front.translate(0, 0, zf);
  const back = new THREE.PlaneGeometry(w - 0.06, h - 0.06);
  back.rotateY(Math.PI);
  back.translate(0, 0, -zf);
  const geo = mergeGeometries([front, back], false)!;
  front.dispose();
  back.dispose();
  const paint = new THREE.Mesh(geo, boardPaint(text, w, h));
  paint.receiveShadow = true;
  g.add(paint);
  return g;
}

/* ------------------------------------------------------------- name boards */

/**
 * The board is 5m wide and its bottom edge is level with her eyes.
 *
 * `signBoard` shrinks a name until it fits 88% of the board's width, so the
 * letters on a 5m board are ~0.39m tall for the longest name in the park
 * ("Gingerbread Village") and ~0.55m for the shortest. At 12m that is the
 * height of a road sign seen from a car, which is what a TV across a living
 * room needs.
 */
const BOARD = { w: 5, h: 1.2, y: 2.2, depth: 0.34, postDx: 2.05, postH: 2.45, postR: 0.15 };

function makeNameSign(text: string) {
  const g = new THREE.Group();
  const { w, h, y, depth, postDx, postH, postR } = BOARD;
  // 2.45m, so each post stops *inside* the board it carries. Park 1 put its
  // posts through the top of the board and had to come back and shorten them.
  for (const s of [-1, 1]) stripePost(g, s * postDx, 0, postH, postR, s < 0 ? 0 : 1);

  const board = paintedBoard(text, w, h, depth);
  board.position.y = y;
  g.add(board);

  // The frame is four bars, not a backing plate: a plate behind the board
  // would be a second flat face 20mm from the painted one, and two surfaces
  // that close flicker against each other.
  const fd = depth - 0.06;
  for (const s of [-1, 1]) {
    g.add(mesh(boxGeo, ICING, w + 0.5, 0.22, fd, 0, y + s * (h / 2 + 0.11), 0));
    g.add(mesh(boxGeo, ICING, 0.24, h + 0.44, fd, s * (w / 2 + 0.12), y, 0));
    g.add(mesh(sphereGeo, s < 0 ? CANDY.pink : CANDY.mint, 0.3, 0.28, 0.3, s * (w / 2 + 0.12), y + h / 2 + 0.33, 0, false));
  }
  // icing running off the top rail: the one detail that stops it reading as a
  // municipal noticeboard in a park made of sweets
  for (let i = 0; i < 9; i++) {
    const x = -w / 2 + ((i + 0.5) / 9) * w;
    const drop = 0.13 + (i % 2) * 0.09;
    g.add(mesh(sphereGeo, ICING, 0.16, 0.16 + drop, 0.16, x, y + h / 2 + 0.16, 0, false));
  }
  return g;
}

/* ------------------------------------------------------------------ gates */

/**
 * A gate's name banner.
 *
 * It hangs *in* the opening at about 3.1m, not on the lintel. On the lintel is
 * where it wants to go and where it was first put, and on a gate built out of
 * sweets the lintel is never a flat plank: the licorice beam swallowed the
 * board whole, the icing drips hung over the letters, and the lollipop swag
 * cut the name in half. Down here it is clear of all of them, it is still well
 * above her head, and it is nearer her eye than the top of a 4.5m arch.
 */
// 5.6 wide, not 6.4: at 6.4 the ends of the board ran behind the gate's own
// uprights and a letter went dark as soon as you stepped off the centre line.
const BANNER = { w: 5.6, h: 1.05, y: 3.1 };

function gateBanner(text: string, y = BANNER.y) {
  const g = paintedBoard(text, BANNER.w, BANNER.h, 0.3);
  g.position.y = y;
  return g;
}

/**
 * The five gates.
 *
 * Each one is made of the sweet its region is made of, because "an entrance
 * you can see you are going through" has to also say *which* place you are
 * going into — five identical arches in five colours would not. They all leave
 * at least 7.2m clear between their uprights, against a 6m path, so nothing
 * here can ever be the reason she cannot get somewhere.
 */

/** Clear opening: uprights this far out from the middle, on both sides. */
const GATE_HALF = 4.5;

/** The Licorice Maze: twisted black rope and catherine-wheel sweets. */
function makeLicoriceGate(name: string) {
  const g = new THREE.Group();
  const H = 4.4;
  const slabs = 11;
  for (const s of [-1, 1]) {
    for (let i = 0; i < slabs; i++) {
      const y = ((i + 0.5) * H) / slabs;
      const m = mesh(boxGeo, i % 2 ? LICORICE : CANDY.red, 1.05, H / slabs + 0.02, 1.05, s * GATE_HALF, y, 0);
      // a rope of licorice is a stack that turns as it climbs; a cylinder
      // cannot twist and a real twisted mesh is not worth the triangles
      m.rotation.y = i * 0.26 * s;
      g.add(m);
    }
  }
  g.add(mesh(boxGeo, LICORICE, GATE_HALF * 2 + 1.9, 0.55, 0.85, 0, H + 0.28, 0));
  g.add(mesh(boxGeo, CANDY.red, GATE_HALF * 2 + 1.2, 0.16, 0.92, 0, H - 0.05, 0));
  // catherine wheels along the top: the sweet the maze's hedges are striped in
  for (let i = -1; i <= 1; i++) {
    for (const [r, c] of [
      [0.62, CANDY.red],
      [0.34, LICORICE],
      [0.14, CANDY.red],
    ] as [number, string][]) {
      const m = mesh(cylGeo, c, r, 0.3 + (0.62 - r) * 0.06, r, i * 3.1, H + 1.2, 0);
      m.rotation.x = Math.PI / 2;
      g.add(m);
    }
  }
  g.add(gateBanner(name));
  return g;
}

/** Gingerbread Village: two gingerbread piers under a run of piped icing. */
function makeIcingGate(name: string) {
  const g = new THREE.Group();
  const H = 3.6;
  for (const s of [-1, 1]) {
    g.add(mesh(boxGeo, GINGER, 1.5, H, 1.3, s * GATE_HALF, H / 2, 0));
    g.add(mesh(boxGeo, ICING, 1.75, 0.3, 1.55, s * GATE_HALF, H + 0.15, 0));
    g.add(mesh(sphereGeo, s < 0 ? CANDY.pink : CANDY.lilac, 0.46, 0.44, 0.46, s * GATE_HALF, H + 0.52, 0));
    // piped buttons down the front of each pier, both faces
    for (const f of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        g.add(mesh(sphereGeo, ICING, 0.17, 0.17, 0.09, s * GATE_HALF, 0.75 + i * 0.78, f * 0.68, false));
      }
    }
  }
  // 1.0 above the piers, not 0.75: the drips hanging off the underside are
  // 0.7 long and at the lower beam they hung down over the name.
  const lintelY = H + 1.0;
  g.add(mesh(boxGeo, CREAM, GATE_HALF * 2 + 2, 0.62, 1.0, 0, lintelY, 0));
  // icing dripping off the underside of the lintel, which is what makes a
  // beam read as icing rather than as a plank painted cream
  for (let i = 0; i < 15; i++) {
    const x = -GATE_HALF - 0.8 + (i / 14) * (GATE_HALF * 2 + 1.6);
    const drop = 0.18 + (i % 3) * 0.12;
    g.add(mesh(sphereGeo, ICING, 0.3, 0.26 + drop, 0.3, x, lintelY - 0.31, 0, false));
  }
  for (let i = 0; i < 5; i++) {
    const x = -3.6 + i * 1.8;
    g.add(mesh(sphereGeo, PARTY[i % PARTY.length]!, 0.4, 0.38, 0.4, x, lintelY + 0.5, 0, false));
  }
  g.add(gateBanner(name, 3.05));
  return g;
}

/** The Lollipop Forest: two of the wood's own trees, grown far too big. */
function makeLollipopGate(name: string) {
  const g = new THREE.Group();
  const HALF = 5.2;
  const SCALE = 1.8;
  for (const s of [-1, 1]) {
    // the wood's tallest variety at nearly twice its own size: a gate made of
    // the thing on the other side of it
    const tree = makeLollipopTree(2, SCALE);
    tree.position.x = s * HALF;
    g.add(tree);
  }
  // a candy-ribbon swag between the sticks, so the two read as one gate rather
  // than as two trees that happen to line up
  const y0 = 5.6;
  const SEGS = 16;
  const span = HALF * 2 - 1.6;
  let px = -span / 2;
  let py = y0;
  for (let i = 1; i <= SEGS; i++) {
    const t = i / SEGS;
    const x = -span / 2 + t * span;
    const y = y0 - 1.15 * Math.sin(t * Math.PI);
    const len = Math.hypot(x - px, y - py);
    const m = mesh(boxGeo, i % 2 ? CANDY.white : CANDY.pink, len * 1.08, 0.24, 0.24, (x + px) / 2, (y + py) / 2, 0);
    m.rotation.z = Math.atan2(y - py, x - px);
    g.add(m);
    if (i % 4 === 2) g.add(mesh(sphereGeo, PARTY[i % PARTY.length]!, 0.34, 0.32, 0.34, x, y - 0.42, 0, false));
    px = x;
    py = y;
  }
  g.add(gateBanner(name));
  return g;
}

/** Ice Cream Mountain: stacked wafers, a chocolate lintel and two cherries. */
function makeWaferGate(name: string) {
  const g = new THREE.Group();
  const slabs = 9;
  const slabH = 0.42;
  const H = slabs * slabH;
  for (const s of [-1, 1]) {
    for (let i = 0; i < slabs; i++) {
      const m = mesh(boxGeo, i % 2 ? WAFER : WAFER_DARK, 1.7, slabH + 0.02, 1.7, s * GATE_HALF, (i + 0.5) * slabH, 0);
      // each biscuit sits a little askew, the way a stack of wafers does
      m.rotation.y = (i % 2 ? 0.055 : -0.055) * s;
      g.add(m);
    }
    g.add(mesh(boxGeo, CHOC, 1.8, 0.2, 1.8, s * GATE_HALF, H + 0.1, 0));
  }
  const lintelY = H + 0.62;
  g.add(mesh(boxGeo, WAFER, GATE_HALF * 2 + 1.9, 0.62, 1.9, 0, lintelY, 0));
  // the waffle grid, raised 0.12 off the lintel's top so the two faces are
  // nowhere near close enough to fight
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 2; j++) {
      g.add(
        mesh(boxGeo, WAFER_DARK, 1.42, 0.14, 0.72, -4.45 + i * 1.78, lintelY + 0.38, -0.42 + j * 0.84, false),
      );
    }
  }
  // chocolate drizzle down the face
  for (let i = 0; i < 4; i++) {
    g.add(mesh(boxGeo, CHOC, 0.18, 0.42, 2.0, -3 + i * 2, lintelY - 0.4, 0, false));
  }
  // The cherries sit on top of the lintel, not on the towers: on the towers
  // they were at the lintel's own height and the beam ate them.
  for (const s of [-1, 1]) {
    g.add(mesh(cylGeo, "#4e7a3a", 0.05, 0.5, 0.05, s * GATE_HALF, lintelY + 0.55, 0, false));
    g.add(mesh(sphereGeo, "#e03a4e", 0.42, 0.4, 0.42, s * GATE_HALF, lintelY + 1.0, 0));
  }
  g.add(gateBanner(name, 3.15));
  return g;
}

/** The fairground: a striped canvas valance on two barley-sugar poles. */
function makeCanvasGate(name: string) {
  const g = new THREE.Group();
  const H = 5;
  for (const s of [-1, 1]) {
    stripePost(g, s * GATE_HALF, 0, H, 0.24, s < 0 ? 0 : 1);
    g.add(mesh(sphereGeo, CANDY.yellow, 0.34, 0.32, 0.34, s * GATE_HALF, H + 0.3, 0));
  }
  // The canopy is thirteen panels rather than one striped slab, because the
  // park has no textures: a stripe here is a separate box or it is nothing.
  const PANELS = 13;
  const span = GATE_HALF * 2 + 1.6;
  const top = 4.5;
  for (let i = 0; i < PANELS; i++) {
    const t = (i + 0.5) / PANELS;
    const x = -span / 2 + t * span;
    // a shallow crown, so the canvas looks slung rather than nailed on
    const y = top + Math.sin(t * Math.PI) * 0.3;
    const c = i % 2 ? CREAM : CANDY.red;
    g.add(mesh(boxGeo, c, span / PANELS + 0.02, 0.92, 0.62, x, y, 0));
    // the scalloped hem under it
    g.add(mesh(sphereGeo, c, span / PANELS / 2, 0.42, 0.34, x, y - 0.48, 0, false));
  }
  // pennants along the ridge
  for (let i = 0; i < 12; i++) {
    const t = (i + 0.5) / 12;
    const x = -span / 2 + t * span;
    const y = top + Math.sin(t * Math.PI) * 0.3;
    const f = mesh(cone4Geo, PARTY[i % PARTY.length]!, 0.26, 0.5, 0.05, x, y + 0.78, 0, false);
    f.rotation.y = Math.PI / 4;
    g.add(f);
  }
  g.add(gateBanner(name, 3.2));
  return g;
}

/* ---------------------------------------------------------------- bunting */

/**
 * One string of flags, hung between two points 12m apart.
 *
 * Built with its two ends at local y 0 and everything sagging below, so the
 * prop's `y` is simply the height it is tied on at. Nothing here is solid: a
 * collider on a hanging flag is a wall at head height.
 */
const BUNTING_SPAN = 12;
const BUNTING_SAG = 0.45;

function makeBunting(span: number) {
  const g = new THREE.Group();
  const sag = (t: number) => -BUNTING_SAG * 4 * t * (1 - t);
  const SEGS = 14;
  let px = -span / 2;
  let py = 0;
  for (let i = 1; i <= SEGS; i++) {
    const t = i / SEGS;
    const x = -span / 2 + t * span;
    const y = sag(t);
    const len = Math.hypot(x - px, y - py);
    const m = mesh(boxGeo, CREAM, len * 1.06, 0.07, 0.07, (x + px) / 2, (y + py) / 2, 0, false);
    m.rotation.z = Math.atan2(y - py, x - px);
    g.add(m);
    px = x;
    py = y;
  }
  // Nine flags to a span, each 0.68m across. Smaller and closer read as a
  // dotted line from the far side of the plaza; this reads as a party.
  const FLAGS = 9;
  for (let i = 0; i < FLAGS; i++) {
    const t = (i + 0.5) / FLAGS;
    const x = -span / 2 + t * span;
    const y = sag(t);
    const f = mesh(cone4Geo, PARTY[i % PARTY.length]!, 0.34, 0.55, 0.04, x, y - 0.3, 0, false);
    // point down: a pennant hangs off the cord, it does not stand on it
    f.rotation.x = Math.PI;
    f.rotation.y = Math.PI / 4;
    g.add(f);
  }
  return g;
}

/** A pole to hang bunting from where there is no lamp post to use. */
const BUNTING_POLE = { h: 4.4, r: 0.17, tie: 4 };

function makeBuntingPole() {
  const g = new THREE.Group();
  stripePost(g, 0, 0, BUNTING_POLE.h, BUNTING_POLE.r);
  g.add(mesh(sphereGeo, CANDY.yellow, 0.28, 0.26, 0.28, 0, BUNTING_POLE.h + 0.2, 0));
  return g;
}

/* ------------------------------------------------------- the registrations */

/** Every place in the park, with the name it is called and where its middle is. */
export const REGION_NAMES: { id: string; name: string; x: number; z: number }[] = [
  { id: "plaza", name: "Peppermint Plaza", x: SUGAR.plaza.x, z: SUGAR.plaza.z },
  { id: "garden", name: "Candy Garden", x: -44, z: -8 },
  { id: "forest", name: "Lollipop Forest", x: SUGAR.forest.x, z: SUGAR.forest.z },
  { id: "factory", name: "Candy Factory", x: SUGAR.factory.x, z: SUGAR.factory.z },
  { id: "mountain", name: "Ice Cream Mountain", x: SUGAR.mountain.x, z: SUGAR.mountain.z },
  { id: "maze", name: "Licorice Maze", x: SUGAR.maze.x, z: SUGAR.maze.z },
  { id: "village", name: "Gingerbread Village", x: SUGAR.village.x, z: SUGAR.village.z },
  { id: "meadow", name: "Gumdrop Meadow", x: SUGAR.meadow.x, z: SUGAR.meadow.z },
  { id: "marshmallow", name: "Marshmallow Fields", x: SUGAR.marshmallow.x, z: SUGAR.marshmallow.z },
  { id: "fair", name: "Candy Fairground", x: SUGAR.fair.x, z: SUGAR.fair.z },
  { id: "lake", name: "Chocolate Lake", x: SUGAR.lake.x, z: SUGAR.lake.z },
];

const NAME_OF = new Map(REGION_NAMES.map((r) => [r.id, r.name]));
const nameOf = (id: string) => NAME_OF.get(id) ?? id;

/**
 * Where each board stands, and which way its face is turned.
 *
 * `ry` is the yaw that turns the board's painted face toward the reader, the
 * same convention `yawFor` uses in signs.ts: 0 faces +z (a reader to the
 * south), PI faces -z, PI/2 faces +x, -PI/2 faces -x. Both faces are painted,
 * so this only decides which way the board lies; what it has to be is square
 * across the path she is walking on.
 */
const SIGN_SITES: { id: string; x: number; z: number; ry: number; why: string }[] = [
  // On the lawn between the plaza and the east end of the village street, the
  // one window on the arrival side: the plaza apron runs into the street, and
  // the cottage row at z 31 walls the plaza off from it everywhere west of
  // x 7. clearGround keeps everything 20m off the plaza centre, so nothing can
  // ever be planted here.
  { id: "plaza", x: 10.5, z: 33.5, ry: 0, why: "read off the street, with the plaza behind it" },
  // north verge of the west spoke, in front of the garden's south hedge
  { id: "garden", x: -48.5, z: 15.5, ry: 0, why: "beside the west spoke, under the garden's south arch" },
  // South verge of the west spoke, on the opposite side to the garden board:
  // two 5.5m boards on one verge butt together and read as one billboard.
  { id: "forest", x: -30, z: 24.5, ry: Math.PI, why: "the turn-off for the wood, forty metres out" },
  // East verge of the north spoke, south of the factory so she reads it on the
  // way up, and 7m clear of the peppermint hidden at (6, -30).
  { id: "factory", x: 4.5, z: -40, ry: -Math.PI / 2, why: "on the walk north, before the building fills the view" },
  // south verge of the north loop run, thirty metres east of the wafer gate
  { id: "mountain", x: -36, z: -103.5, ry: Math.PI, why: "on the loop, walking west toward the scoops" },
  // south verge of the north loop run, thirty metres west of the licorice gate
  { id: "maze", x: 33, z: -103.5, ry: Math.PI, why: "where she turns south off the loop into the hedges" },
  // north verge of the east spoke, at the far end of the avenue into the village
  { id: "village", x: 85, z: 15.2, ry: 0, why: "the end of the east avenue, in sight of the roofs" },
  // west verge of the east loop run, facing the path across it
  { id: "meadow", x: 103.5, z: 78, ry: Math.PI / 2, why: "broadside to the east run, over the gumdrop hills" },
  // south verge of the south loop run, between two avenue trees. Not x -38:
  // that stood the board inside the trampoline at (-40, 110).
  { id: "marshmallow", x: -24, z: 112.5, ry: Math.PI, why: "where the loop passes the soft ground" },
  // east verge of the west loop run, thirty metres north of the canvas gate
  { id: "fair", x: -103.5, z: 56, ry: -Math.PI / 2, why: "coming south down the west run toward the wheel" },
  // east verge of the east run, at its south end, pointing on to the water
  { id: "lake", x: 112.5, z: 94, ry: -Math.PI / 2, why: "the last board before the loop's corner and the lake" },
];

for (const s of SIGN_SITES) {
  const { postDx, postH, postR } = BOARD;
  registerModel(
    `sugar-sign-${s.id}`,
    [-1, 1].map((k) =>
      box(k * postDx - postR, k * postDx + postR, 0, postH, -postR, postR),
    ),
    () => makeNameSign(nameOf(s.id)),
  );
}

/**
 * Where each gate stands.
 *
 * `ry` turns the gate so she walks through it along its local +z: 0 for a gate
 * straddling a path that runs north-south, PI/2 for one running east-west.
 * Every position was picked to keep both uprights at least 0.7m clear of the
 * 6m path and clear of what is already built there.
 */
const GATE_SITES: { id: string; x: number; z: number; ry: number; why: string }[] = [
  // the maze's one clean entrance: the gap left in its west wall at z -92,
  // standing 1.7m clear of the hedge line at x 62
  { id: "maze", x: 60, z: -92, ry: Math.PI / 2, why: "the gap in the maze's west wall" },
  // the 15m window between the two west-side gingerbread houses, which is how
  // the village square is entered from the loop
  { id: "village", x: 112.5, z: 10, ry: Math.PI / 2, why: "off the east run into the village square" },
  // across the west spoke where the forest trail leaves it, 3m short of the
  // trailhead at (-67, 19)
  { id: "forest", x: -70, z: 20, ry: Math.PI / 2, why: "across the spoke at the trailhead" },
  // Across the north loop run at the east end of the chocolate bridge. Not at
  // the mountain's own foot: `bridgeSites` puts a 26m bridge at x -83, its deck
  // runs -96.2..-70.2, and west of that the scoops start at x -95.6, so there
  // is no gap on that side wide enough to stand a gate in. Here the gate marks
  // the edge of the region and the bridge crossing is the arrival.
  { id: "mountain", x: -66, z: -108, ry: Math.PI / 2, why: "across the loop at the mountain end of the bridge" },
  // across the west loop run where it crosses into the fairground apron
  { id: "fair", x: -108, z: 84, ry: 0, why: "across the west run at the fairground's north edge" },
];

const GATE_BUILD: Record<string, (name: string) => THREE.Group> = {
  maze: makeLicoriceGate,
  village: makeIcingGate,
  forest: makeLollipopGate,
  mountain: makeWaferGate,
  fair: makeCanvasGate,
};

/**
 * What each gate is solid at: its two uprights and nothing else.
 *
 * The clear openings are 7.2m (wafer), 7.4m (icing), 7.8m (liquorice), 8.5m
 * (canvas) and 9.6m (lollipops), against a 6m path. The narrowest of them
 * still leaves 0.6m of spare path on each side, and the boxes are a little
 * tighter than the art so she is never stopped by an overhang she can see
 * daylight under.
 */
const GATE_BOXES: Record<string, ModelBox[]> = {
  maze: [-1, 1].map((s) => box(s * GATE_HALF - 0.6, s * GATE_HALF + 0.6, 0, 4.4, -0.6, 0.6)),
  village: [-1, 1].map((s) => box(s * GATE_HALF - 0.78, s * GATE_HALF + 0.78, 0, 3.9, -0.68, 0.68)),
  forest: [-1, 1].map((s) => box(s * 5.2 - 0.41, s * 5.2 + 0.41, 0, 7.4, -0.41, 0.41)),
  mountain: [-1, 1].map((s) => box(s * GATE_HALF - 0.88, s * GATE_HALF + 0.88, 0, 3.88, -0.88, 0.88)),
  fair: [-1, 1].map((s) => box(s * GATE_HALF - 0.26, s * GATE_HALF + 0.26, 0, 5, -0.26, 0.26)),
};

for (const s of GATE_SITES) {
  registerModel(`sugar-gate-${s.id}`, GATE_BOXES[s.id]!, () => GATE_BUILD[s.id]!(nameOf(s.id)));
}

registerModel("sugar-bunting", [], () => makeBunting(BUNTING_SPAN));
registerModel(
  "sugar-bunting-pole",
  [box(-BUNTING_POLE.r, BUNTING_POLE.r, 0, BUNTING_POLE.h, -BUNTING_POLE.r, BUNTING_POLE.r)],
  () => makeBuntingPole(),
);

/* --------------------------------------------------------------- the props */

/** An entrance at the mouth of each of the five regions a path runs into. */
export function regionGates(): Prop[] {
  return GATE_SITES.map((s) => model(`sugar-gate-${s.id}`, s.x, s.z, { ry: s.ry }));
}

/** A painted name board at the turn-off for every place in the park. */
export function regionSigns(): Prop[] {
  return SIGN_SITES.map((s) => model(`sugar-sign-${s.id}`, s.x, s.z, { ry: s.ry }));
}

/**
 * Strings of flags: down the village street, and across the fairground.
 *
 * The street already has two rows of lamp posts 12m apart (`startDistrictProps`
 * puts them at z 35.6 and z 44.4), so the bunting is tied between them and
 * costs no new posts at all. The fairground has nothing to tie to, so it gets
 * two rows of its own poles: one across the apron in front of the stalls and
 * one south of the wheel, both of them running straight over the loop path, so
 * she walks under the flags to get in.
 */
export function bunting(): Prop[] {
  const out: Prop[] = [];

  /** Ties a run of flags between posts at `xs`, all at the same z. */
  const run = (xs: number[], z: number, tie: number) => {
    for (let i = 0; i + 1 < xs.length; i++) {
      out.push(model("sugar-bunting", (xs[i]! + xs[i + 1]!) / 2, z, { y: tie }));
    }
  };

  // the street: the lamps stand at y 0..3.2, so the cord is tied at 3.05 and
  // the lowest flag tip hangs at 2.05 — above her, and above Emmett
  run([-50, -38, -26, -14, -2, 10], 35.6, 3.05);
  run([-44, -32, -20, -8, 4, 16], 44.4, 3.05);

  // the fairground: poles at x -126..-78, straddling the west run (x -111..-105)
  // with 3m to spare on each side so nothing stands on the path
  const fairXs = [-126, -114, -102, -90, -78];
  // z 102, not 100: at 100 the pole at x -102 stood 4.5m from the bubblegum
  // hidden at (-100, 96), and nothing may be planted within 4m of a candy.
  for (const z of [102, 113.5]) {
    for (const x of fairXs) out.push(model("sugar-bunting-pole", x, z));
    run(fairXs, z, BUNTING_POLE.tie);
  }
  return out;
}
