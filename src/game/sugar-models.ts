import {
  CANDY,
  makeCandyCaneArch,
  makeCandyCaneBridge,
  makeCandyCanePost,
  makeCandyCornSpike,
  makeChocolateFountain,
  makeCottonCandyPuff,
  makeGumdrop,
  makeLicoriceHedge,
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
  registerModel(`candy-tree${v}`, [box(-r, r, 0, h, -r, r)], (_variant, scale) => makeLollipopTree(v, scale));
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
  const half = span / 2;
  const deck = half - 2.4;
  const out = [box(-1.2, 1.2, 0, 0.9, -deck, deck)];
  for (const s of [1, -1]) {
    out.push(box(-1.2, 1.2, 0, 0.6, Math.min(s * deck, s * (deck + 0.7)), Math.max(s * deck, s * (deck + 0.7))));
    out.push(box(-1.2, 1.2, 0, 0.3, Math.min(s * (deck + 0.7), s * half), Math.max(s * (deck + 0.7), s * half)));
  }
  out.push(box(-1.22, -0.98, 0.9, 1.85, -(deck + 0.1), deck + 0.1));
  out.push(box(0.98, 1.22, 0.9, 1.85, -(deck + 0.1), deck + 0.1));
  return out;
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
registerModel("choc-fountain", [box(-1.2, 1.2, 0, 0.42, -1.2, 1.2)], () => makeChocolateFountain());
// nothing to bump into on these: they are dressing, and a collider on a sweet
// lying in the grass is just something to trip over
registerModel("swirl-mint", [], (_v, scale) => makeSwirlMint(scale));
registerModel("rock-candy", [], (_v, scale) => makeRockCandyCluster(scale));
registerModel("cotton-candy", [], (_v, scale) => makeCottonCandyPuff(scale));
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

registerModel("candy-factory", rows(FACTORY), () => makeCandyFactory());
registerModel("ice-cream-mountain", rows(MOUNTAIN), () => makeIceCreamMountain());
registerModel("choc-boat", rows(BOAT), () => makeChocolateBoat());
registerModel("gumball-machine", rows(GUMBALL), (_v, scale) => makeGumballMachine(scale));
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
