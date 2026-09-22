import { CANDIES } from "./candies";
import { candyAccessorySpots } from "./candy-accessories";
import { CHOC_SITE } from "./choc-course";
import { SKY_LIGHTING, skyProps } from "./sugar-sky";
import { bunting, regionGates, regionSigns } from "./sugar-signs";
import { gumdropHills, sugarBerms } from "./sugar-terrain";
import type { DumplingDef, Hide, LevelDef } from "./types";
import {
  CANDY,
  NO_PLANT,
  SUGAR,
  SUGAR_BOUNDS,
  WHEEL,
  boundaryProps,
  gardenProps,
  factoryProps,
  fairProps,
  boostSpots,
  forestProps,
  frostingProps,
  marshmallowProps,
  mazeProps,
  pathProps,
  plantingProps,
  mountainProps,
  plazaArches,
  villageProps,
  plazaProps,
  riverProps,
  riverWater,
  startDistrictProps,
  startWater,
} from "./sugar-rush";

/**
 * Sugar Rush Park, the second full-size park.
 *
 * Stage 1 is the blockout: the ground, the chocolate river, the candy-cane loop,
 * the plaza and the boundary. The landmarks and the games arrive on top of this
 * in later stages, hung off the region centres in sugar-rush.ts.
 *
 * The park is locked until she finishes park 1, which is what makes it safe to
 * ship half-built: she cannot reach it by accident.
 */

/**
 * The sixteen candies. Ids have to be unique across the whole game, not just
 * this park: a dumpling that runs off is remembered in one flat record keyed by
 * id, so a clash would move park 1's collectible when this one moved.
 */
/**
 * Where each sweet hides, in the order candies.ts lists them. The name and the
 * colours come from there so there is one description of a sweet in the game;
 * this table is only about where it is and how to find it.
 */
const SPOTS: Record<string, { id: string; pos: [number, number, number]; hide: Hide; region: string; hint: string }> = {
  "chocolate drop": {
    id: "chocdrop",
    pos: [-30, 0.55, -48],
    hide: "easy",
    region: "the candy factory",
    hint: "By the factory doors, where the chocolate comes out.",
  },
  "candy cane": {
    id: "canetwist",
    pos: [18, 0.55, 32],
    hide: "easy",
    region: "Peppermint Plaza",
    hint: "Just off the plaza, where the path runs east.",
  },
  "sour worm": {
    id: "sourwiggle",
    pos: [66, 0.55, 62],
    hide: "medium",
    region: "Gumdrop Meadow",
    hint: "Out in the meadow with the gumdrop hills.",
  },
  "gummy bear": {
    id: "gummybear",
    pos: [-100, 0.55, 30],
    hide: "easy",
    region: "the Lollipop Forest",
    hint: "In the clearing in the lollipop woods.",
  },
  jellybean: {
    id: "jellybean",
    pos: [140, 0.55, 2],
    hide: "medium",
    region: "Gingerbread Village",
    hint: "Among the gingerbread houses, by the village square.",
  },
  lollipop: {
    id: "lollyswirl",
    pos: [-120, 0.55, -20],
    hide: "medium",
    region: "the Lollipop Forest",
    hint: "North end of the lollipop woods.",
  },
  marshmallow: {
    id: "marshpillow",
    pos: [-30, 0.55, 124],
    hide: "easy",
    region: "Marshmallow Fields",
    hint: "Out on the soft white fields.",
  },
  bubblegum: {
    id: "bubblegum",
    /*
     * South-west of the ferris wheel, not beside it. There is one Collect key:
     * standing inside the wheel's boarding circle it boards the wheel, and a
     * sweet inside that circle is a sweet she cannot pick up. tools/buttons.ts
     * keeps every sweet clear of every button.
     */
    pos: [-104, 0.55, 90],
    hide: "medium",
    region: "the fairground",
    hint: "On the grass south of the big wheel.",
  },
  "licorice twist": {
    id: "licoricetwist",
    pos: [84, 0.55, -74],
    hide: "hard",
    region: "the Licorice Maze",
    hint: "Right in the middle of the black and red hedges.",
  },
  peppermint: {
    id: "peppermint",
    pos: [6, 0.55, -30],
    hide: "easy",
    region: "the north path",
    hint: "Near the river, north of the plaza.",
  },
  toffee: {
    id: "toffeechew",
    pos: [118, 0.55, 100],
    hide: "medium",
    region: "the chocolate river, near the lake",
    hint: "On the bank where the river swings round toward the lake.",
  },
  "rock candy": {
    id: "rockcandy",
    pos: [-124, 0.55, -106],
    hide: "hard",
    region: "Ice Cream Mountain",
    hint: "At the foot of the mountain of scoops.",
  },
  "cotton candy": {
    id: "cottonpuff",
    pos: [94, 0.55, 84],
    hide: "medium",
    region: "Gumdrop Meadow",
    hint: "On the far side of the meadow.",
  },
  caramel: {
    id: "caramelcube",
    pos: [116, 0.55, 26],
    hide: "medium",
    region: "Gingerbread Village",
    hint: "By the village square.",
  },
  fudge: {
    id: "fudgeblock",
    pos: [120, 0.55, 56],
    hide: "hard",
    region: "Emmett's den",
    hint: "Just outside Emmett's den, where he keeps his monster truck.",
  },
  jawbreaker: {
    id: "jawbreaker",
    pos: [42, 0.55, -8],
    hide: "hard",
    region: "the chocolate river",
    hint: "Beside the river, east of the plaza.",
  },
};

const sugarCandies: DumplingDef[] = CANDIES.map((c) => {
  const spot = SPOTS[c.kind]!;
  return {
    id: spot.id,
    name: c.name,
    color: c.color,
    accent: c.accent,
    pos: spot.pos,
    hide: spot.hide,
    region: spot.region,
    hint: spot.hint,
    candy: c.kind,
  };
});

export function sugarRushPark(): LevelDef {
  // every candy keeps a clear circle round it, so nothing is ever planted on top
  /*
   * Every point the park must not plant on: the candies, and the three places
   * the princess's creatures are stuck. A lollipop tree she has to climb is
   * no use with three more lollipop trees grown round it.
   */
  const spots = [...sugarCandies.map((d) => [d.pos[0], d.pos[2]] as [number, number]), ...NO_PLANT];
  // the frosting goes on last, because it has to see what is already down
  const props = [
    ...riverProps(),
    ...pathProps(),
    ...plazaProps(),
    ...plazaArches(),
    ...forestProps(spots),
    // the meadow is terraced hills now, not a field of scattered domes
    ...gumdropHills(spots),
    ...sugarBerms(spots),
    ...marshmallowProps(spots),
    ...mazeProps(),
    ...factoryProps(),
    ...mountainProps(),
    ...villageProps(),
    ...fairProps(),
    ...startDistrictProps(spots),
    ...gardenProps(),
    ...plantingProps(spots),
    ...regionGates(),
    ...regionSigns(),
    ...bunting(),
    ...boundaryProps(),
    ...skyProps(),
  ];
  props.unshift(...frostingProps(spots, props));

  return {
    id: "sugar",
    name: "Sugar Rush Park",
    tagline: "A candy world: a chocolate river, a lollipop forest and a mountain of ice cream.",
    sky: "#ffd6ef",
    /*
     * A candy sky: raspberry at the top, through blossom, to a warm sugar
     * horizon. The fog is the horizon colour, so distance fades into the sky
     * instead of greying out against it.
     */
    skyColors: { top: "#f3a8d8", mid: "#ffd3ea", horizon: "#fff0d8" },
    fogColor: "#ffdfee",
    lighting: SKY_LIGHTING,
    fogFar: 185,
    grass: CANDY.grass,
    // sprinkles in the turf instead of park 1's daisies
    groundSpecks: ["#ff9ec8", "#ffffff", "#9fd8ff", "#ffe08a"],
    /*
     * No blades of grass here. Park 1's waving grass is what makes a lawn look
     * alive, but at candy colours a field of pale spikes reads as fur, and this
     * ground is meant to be a smooth mint sweet. The frosting patches in
     * sugar-rush.ts give the surface its variation instead.
     */
    grassDensity: 0,
    path: CANDY.sugar,
    spawn: SUGAR.spawn,
    spawnYaw: 0,
    bounds: SUGAR_BOUNDS,
    groundY: 0,
    props,
    dumplings: sugarCandies,
    water: [...riverWater(), ...startWater()],
    juice: boostSpots(spots, props, [CHOC_SITE]),
    // her candy satchel and six things to wear, hidden the way park 1's are
    accessories: candyAccessorySpots(),
    boost: "cotton",
    ride: WHEEL,
    // Emmett's den, east of the loop and south of the village
    emmettBase: true,
  };
}
