import { CANDIES } from "./candies";
import { candyAccessorySpots } from "./candy-accessories";
import { CHOC_SITE } from "./choc-course";
import { yardFootprint, yardProps } from "./emmett-base";

/** The build yard's square (build-yard.ts draws it), padded by `pad` metres. */
function buildYardSquare(pad: number) {
  const b = SUGAR.buildYard;
  const h = b.cells / 2 + pad;
  return { minX: b.x - h, maxX: b.x + h, minZ: b.z - h, maxZ: b.z + h };
}
import { SKY_LIGHTING, skyProps } from "./sugar-sky";
import { bunting, regionGates, regionSigns } from "./sugar-signs";
import { gumdropHills, sugarBerms } from "./sugar-terrain";
import type { DumplingDef, Hide, LevelDef } from "./types";
import {
  CANDY,
  NO_PLANT,
  SUGAR,
  SUGAR_BOUNDS,
  SUGAR_DEN,
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
 * The twenty-five candies. Ids have to be unique across the whole game, not just
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
     * Out on the fairground apron west of the ferris wheel. There is one
     * Collect key: standing inside the wheel's boarding circle it boards the
     * wheel, and a sweet inside that circle is a sweet she cannot pick up, so
     * tools/buttons.ts keeps every sweet clear of every button. It was first
     * moved to (-104, 90), which cleared the button but put it hard against
     * the fairground fence where the flood fill could not stand — this spot is
     * open ground with nothing within a metre and a half.
     */
    pos: [-112, 0.55, 96],
    hide: "medium",
    region: "the fairground",
    hint: "On the fairground, west of the big wheel.",
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
  /*
   * The nine more, added when Dalton asked for twenty-five: into the parts of
   * the park the first sixteen left empty — the summit, the lake's far shore,
   * behind the factory, the north by the maze, and out along the candy wall —
   * so the longer hunt is a hunt round more of the park, not more sweets in
   * the same places.
   */
  "sugar star": {
    id: "sugarstar",
    // on the summit, on the floor clear of the telescope, the cherry and the
    // way in from the stairs: the climb's reward
    pos: [-112.2, 17.35, -124.93],
    hide: "hard",
    region: "the top of Ice Cream Mountain",
    hint: "Right at the very top of Ice Cream Mountain, by the telescope.",
  },
  gumdrop: {
    id: "gumdome",
    pos: [30, 0.55, -110],
    hide: "medium",
    region: "the Licorice Maze",
    hint: "By the Licorice Maze sign, on the path up to the maze.",
  },
  "candy corn": {
    id: "candycorn",
    pos: [-135, 0.55, -60],
    hide: "hard",
    region: "the west wall",
    hint: "Out by the candy wall on the west side, between the forest and the mountain.",
  },
  donut: {
    id: "sprinkledonut",
    pos: [30, 0.55, 140],
    hide: "hard",
    region: "the south wall",
    hint: "Past Marshmallow Fields, right out by the candy wall to the south.",
  },
  cupcake: {
    id: "minicupcake",
    pos: [-96, 0.55, 132],
    hide: "medium",
    region: "the fairground",
    hint: "Next to the Cupcake Carousel, at the back of the fairground.",
  },
  macaron: {
    id: "macaron",
    pos: [-58, 0.55, 104],
    hide: "easy",
    region: "Marshmallow Fields",
    hint: "Among the marshmallows, on the side nearest the forest.",
  },
  "ice pop": {
    id: "icepop",
    pos: [-18, 0.55, -80],
    hide: "medium",
    region: "the candy factory",
    hint: "Round the back of the candy factory.",
  },
  "choco coin": {
    id: "chococoin",
    pos: [146, 0.55, 118],
    hide: "medium",
    region: "the chocolate lake",
    hint: "On the far side of the chocolate lake, near the candy wall.",
  },
  cookie: {
    id: "chipcookie",
    pos: [145, 0.55, -50],
    hide: "hard",
    region: "the east wall",
    hint: "Along the candy wall to the east, north of Gingerbread Village.",
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

/**
 * Where Emmett hides a sweet he has won. Without this list he wins the round,
 * says he is taking one, and then nothing happens at all: `emmettTakesOne`
 * needs somewhere to put it and gives up when there is nowhere.
 *
 * Eight landmarks, one per region, so the hint she gets back is a place she can
 * picture. Each one is clear ground she can stand on, and far enough from every
 * button that the nudge cannot drop a sweet inside one (tools/buttons.ts).
 */
const REHIDE: { name: string; say: string; pos: [number, number, number] }[] = [
  { name: "Peppermint Plaza", say: "I left it on the plaza!", pos: [6, 0.55, 10] },
  { name: "Gingerbread Village", say: "It's on the village square!", pos: [122, 0.55, 12] },
  { name: "the Lollipop Forest", say: "I hid it in the lollipop woods!", pos: [-96, 0.55, 8] },
  { name: "the fairground", say: "It's out at the fair!", pos: [-110, 0.55, 98] },
  { name: "Marshmallow Fields", say: "I dropped it on the marshmallows!", pos: [-30, 0.55, 112] },
  { name: "the foot of Ice Cream Mountain", say: "It's down at the ice cream mountain!", pos: [-106, 0.55, -110] },
  { name: "Gumdrop Meadow", say: "I took it out to the meadow!", pos: [70, 0.55, 70] },
  { name: "the chocolate lake", say: "It's by the chocolate lake!", pos: [114, 0.55, 132] },
];

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
    /*
     * The solid pieces in Emmett's den: the two tyre stacks, the kicker ramp
     * and the toy box. Park 1 has carried these since it was built; Sugar Rush
     * never did, so all four were drawn and none was solid — she walked
     * straight through them. The origin is passed rather than defaulted
     * because this list is built at import, before the yard has been moved.
     */
    ...yardProps(SUGAR_DEN, "candy"),
    ...regionGates(),
    ...regionSigns(),
    ...bunting(),
    ...boundaryProps(),
    ...skyProps(),
  ];
  // The truck yard's dirt is drawn by the yard itself, not a prop, and at the
  // patches' own height: one patch landed on it and the two flickered.
  props.unshift(...frostingProps(spots, props, [yardFootprint(SUGAR_DEN), buildYardSquare(1)]));

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
    // her build yard: her builds are not on his map, and she builds in peace
    emmettKeepOut: [buildYardSquare(2)],
    rehideSpots: REHIDE,
  };
}
