import {
  CANDY,
  makeCandyCaneArch,
  candyCaneBridgeBoxes,
  makeCandyCaneBridge,
  makeCandyCanePost,
  makeCandyCornSpike,
  makeChocolateFountain,
  FLOSS_STICK,
  makeCandyFlossTree,
  makeGumdrop,
  makeLicoriceHedge,
  lollipopHead,
  makeLollipopTree,
  makeMarshmallow,
  makeRockCandyCluster,
  makeSodaCan,
  makeSwirlMint,
} from "./candy-scenery";
import {
  makeCandyFactory,
  makeCandyShopStall,
  makeChocolateBoat,
  makeGingerbreadHouse,
  makeGumballMachine,
  makeIceCreamMountain,
} from "./candy-builds";
import {
  BOAT,
  FACTORY,
  GINGERBREAD_0,
  GINGERBREAD_1,
  GINGERBREAD_2,
  GUMBALL,
  MOUNTAIN,
  STALL,
  type Row,
} from "./sugar-model-boxes";
import { makeChocolateRiver, makeRibbonPath } from "./candy-river";
import { FOREST_SPUR, FOREST_TRAIL, RIVER_PATH, SUGAR } from "./sugar-rush";
import { registerModel, type ModelBox } from "./models";
import type { ModelProp } from "./types";

/**
 * Sugar Rush Park's models, registered so the level can place them as props and
 * the collider builder can ask what they are solid at without building them.
 *
 * The boxes here are the ones the factories actually produce — read out of the
 * built groups in the running game and written down, because the factories need
 * a browser (they draw their textures on a canvas) and the collider side runs in
 * node. If a model's shape changes, these have to change with it.
 */

const box = (minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number): ModelBox => ({
  minX,
  maxX,
  minY,
  maxY,
  minZ,
  maxZ,
});

/* --------------------------------------------------------------- trees */

/**
 * One id per variant rather than one id with four variants: the trunks are
 * different heights, and a single box would leave an invisible pole standing
 * over the short ones.
 */
const TREE_TRUNK: [number, number][] = [
  [0.173, 3.05],
  [0.143, 2.35],
  [0.225, 4.1],
  [0.12, 1.8],
];
TREE_TRUNK.forEach(([r, h], v) => {
  // the stick, and the candy disc on top of it in three bands that follow its
  // round edge. The disc faces +z, so the park only ever turns these by
  // quarters: a thin slab at any other angle becomes a square invisible wall.
  const { cy, r: R, thick } = lollipopHead(v);
  const t = thick / 2 + 0.03;
  registerModel(
    `candy-tree${v}`,
    [
      box(-r, r, 0, h, -r, r),
      box(-R, R, cy - 0.7 * R, cy + 0.7 * R, -t, t),
      box(-0.71 * R, 0.71 * R, cy - R, cy - 0.7 * R, -t, t),
      box(-0.71 * R, 0.71 * R, cy + 0.7 * R, cy + R, -t, t),
    ],
    (_variant, scale) => makeLollipopTree(v, scale),
  );
});

export const TREE_IDS = TREE_TRUNK.map((_, v) => `candy-tree${v}`);

/* ------------------------------------------------------------- bridges */

/**
 * Bridge decks are the one thing in this park she walks *over* the river on, so
 * the boxes have to be right: a flat deck at 0.9m with a pair of 0.3m steps at
 * each end (half a step-up), and a rail down each side.
 */
export const BRIDGE_DECK_Y = 0.9;

function bridgeBoxes(span: number): ModelBox[] {
  // the drawing's own colliders, so the two cannot drift apart again
  return candyCaneBridgeBoxes(span);
}

/** The spans the park uses. A bridge is placed by id, so each span is its own. */
export const BRIDGE_SPANS = [12, 18, 26, 32] as const;
for (const span of BRIDGE_SPANS) {
  registerModel(`cane-bridge${span}`, bridgeBoxes(span), () => makeCandyCaneBridge(span));
}

/** The shortest bridge that covers `len` metres of water. */
export function bridgeFor(len: number) {
  const span = BRIDGE_SPANS.find((s) => s >= len) ?? BRIDGE_SPANS[BRIDGE_SPANS.length - 1]!;
  return { id: `cane-bridge${span}`, span };
}

/* -------------------------------------------------------------- hedges */

/** Maze walls come in whole metres; the boxes are the slab, stripes overhang. */
export const HEDGE_LENGTHS = [4, 6, 8, 12] as const;
for (const len of HEDGE_LENGTHS) {
  registerModel(
    `licorice-hedge${len}`,
    [box(-len / 2, len / 2, 0, 1.8, -0.31, 0.31)],
    () => makeLicoriceHedge(len, 1.8),
  );
}

/* ------------------------------------------------------- everything else */

/** Gumdrops come in the whole jar: the variant picks the colour. */
export const GUMDROP_COLOURS = [CANDY.red, CANDY.pink, CANDY.yellow, CANDY.mint, CANDY.lilac, CANDY.orange];
registerModel("gumdrop", [box(-0.48, 0.48, 0, 0.94, -0.48, 0.48)], (variant, scale) =>
  makeGumdrop(GUMDROP_COLOURS[variant % GUMDROP_COLOURS.length]!, scale),
);
registerModel("cane-post", [box(-0.13, 0.13, 0, 2.2, -0.13, 0.13)], () => makeCandyCanePost(2.2));
registerModel(
  "cane-arch",
  [box(-2, -1.74, 0, 1.73, -0.13, 0.13), box(1.74, 2, 0, 1.73, -0.13, 0.13)],
  () => makeCandyCaneArch(4, 3.6),
);
registerModel("marshmallow", [box(-0.78, 1.28, 0, 1.72, -0.68, 0.68)], (_v, scale) => makeMarshmallow(scale));
registerModel("candy-corn", [box(-0.44, 0.44, 0, 1.5, -0.44, 0.44)], (_v, scale) => makeCandyCornSpike(scale));
registerModel(
  "choc-fountain",
  [
    // the basin, which she can step up onto: it is a rim, not a wall
    box(-1.2, 1.2, 0, 0.42, -1.2, 1.2),
    // the chocolate curtain off the bottom tier, then the two tiers above it
    // and the column. The basin alone used to be the whole collider, and at
    // 0.42 it is under her step-up, so she walked straight into the fountain.
    box(-0.95, 0.95, 0.42, 1.12, -0.95, 0.95),
    box(-0.68, 0.68, 1.12, 1.85, -0.68, 0.68),
    box(-0.44, 0.44, 1.85, 2.5, -0.44, 0.44),
    box(-0.2, 0.2, 2.5, 2.62, -0.2, 0.2),
  ],
  () => makeChocolateFountain(),
);
// nothing to bump into on these: they are dressing, and a collider on a sweet
// lying in the grass is just something to trip over
registerModel("swirl-mint", [], (_v, scale) => makeSwirlMint(scale));
// rock candy stands 1.35m on a stick, crystals round the top half: solid, or
// she runs through a cluster of sugar crystals taller than her waist
registerModel("rock-candy", [box(-0.26, 0.26, 0, 1.35, -0.26, 0.26)], (_v, scale) => makeRockCandyCluster(scale));
// candy-floss trees: the stick is the only thing at her height
registerModel("cotton-candy", [box(-0.14, 0.14, 0, FLOSS_STICK, -0.14, 0.14)], () => makeCandyFlossTree());
registerModel("soda-can", [], () => makeSodaCan());

/** Shorthand for a model prop, since a park places hundreds of them. */
export function model(id: string, x: number, z: number, extra?: Partial<ModelProp>): ModelProp {
  return { kind: "model", id, x, z, ...extra };
}

/* ------------------------------------------------- the big landmarks */

/**
 * The buildings. Their boxes live in sugar-model-boxes.ts, read out of the real
 * meshes: to refresh them, open the park in a browser and dump
 * `makeX().userData.boxes` the way that file's comment describes.
 */
const rows = (list: Row[]): ModelBox[] =>
  list.map(([minX, maxX, minY, maxY, minZ, maxZ]) => box(minX, maxX, minY, maxY, minZ, maxZ));

registerModel("gingerbread0", rows(GINGERBREAD_0), (_v, scale) => makeGingerbreadHouse(5.5, 5, 0, 20260921 + scale * 7));
registerModel("gingerbread1", rows(GINGERBREAD_1), () => makeGingerbreadHouse(5.5, 5, 1));
registerModel("gingerbread2", rows(GINGERBREAD_2), () => makeGingerbreadHouse(5.5, 5, 2));
export const GINGERBREAD_IDS = ["gingerbread0", "gingerbread1", "gingerbread2"];

registerModel(
  "candy-factory",
  [
    ...rows(FACTORY),
    // the two candy-cane lampposts out front: drawn 6.4m tall and never solid
    box(-10.65, -10.15, 0, 6.4, 10.35, 10.85),
    box(10.15, 10.65, 0, 6.4, 10.35, 10.85),
    // and the walking-stick canes either side of the front and back doors
    box(-3.2, -2.8, 0, 1.6, 8.7, 9.1),
    box(2.8, 3.2, 0, 1.6, 8.7, 9.1),
    box(-3.2, -2.8, 0, 1.6, -9.1, -8.7),
    box(2.8, 3.2, 0, 1.6, -9.1, -8.7),
  ],
  () => makeCandyFactory(),
);
registerModel("ice-cream-mountain", rows(MOUNTAIN), () => makeIceCreamMountain());
registerModel("choc-boat", rows(BOAT), () => makeChocolateBoat());
// built at 1: placeModel scales the group, and the factory scaling itself as
// well drew the fairground's 1.6 machine at 2.56 — a metre bigger all round
// than the collider, which is what "walking into a candy stand" was
registerModel("gumball-machine", rows(GUMBALL), () => makeGumballMachine(1));
registerModel("candy-stall", rows(STALL), (variant) => makeCandyShopStall(STALL_AWNINGS[variant % STALL_AWNINGS.length]!));
const STALL_AWNINGS = [CANDY.pink, CANDY.mint, CANDY.yellow, CANDY.lilac];

/**
 * The river is a single mesh built from the park's own curve, so it is placed
 * at the origin rather than at a point: the geometry already knows where it is.
 */
registerModel("choc-river", [], () => makeChocolateRiver(RIVER_PATH, SUGAR.lake, SUGAR.factory));
// the wood's trails: ribbons, for the same reason the river is one
registerModel("forest-trail", [], () => makeRibbonPath(FOREST_TRAIL, 3.4, "#e9d7b6", 0.075));
registerModel("forest-spur", [], () => makeRibbonPath(FOREST_SPUR, 3, "#e9d7b6", 0.075));

/** The mountain's own numbers, for placing a candy on its deck or its ring. */
export { ICE_CREAM_MOUNTAIN, FACTORY_CHANNEL } from "./candy-builds";
