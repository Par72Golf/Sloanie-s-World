import { CANDIES } from "./candies";
import type { DumplingDef, Hide, LevelDef } from "./types";
import {
  CANDY,
  SUGAR,
  SUGAR_BOUNDS,
  boundaryProps,
  forestProps,
  marshmallowProps,
  mazeProps,
  meadowProps,
  pathProps,
  plazaArches,
  plazaProps,
  riverProps,
  riverWater,
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
    pos: [-20, 0.55, -50],
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
    pos: [60, 0.55, 76],
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
    pos: [122, 0.55, -4],
    hide: "medium",
    region: "Gingerbread Village",
    hint: "Among the gingerbread houses.",
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
    pos: [-100, 0.55, 96],
    hide: "medium",
    region: "the fairground",
    hint: "Near the rides.",
  },
  "licorice twist": {
    id: "licoricetwist",
    pos: [90, 0.55, -92],
    hide: "hard",
    region: "the Licorice Maze",
    hint: "Right in the middle of the black and red hedges.",
  },
  peppermint: {
    id: "peppermint",
    pos: [16, 0.55, -42],
    hide: "easy",
    region: "the north path",
    hint: "Near the river, north of the plaza.",
  },
  toffee: {
    id: "toffeechew",
    pos: [118, 0.55, 100],
    hide: "medium",
    region: "the chocolate lake",
    hint: "On the shore where the river ends.",
  },
  "rock candy": {
    id: "rockcandy",
    pos: [-92, 0.55, -96],
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
    pos: [124, 0.55, 22],
    hide: "medium",
    region: "Gingerbread Village",
    hint: "By the village square.",
  },
  fudge: {
    id: "fudgeblock",
    pos: [118, 0.55, 52],
    hide: "hard",
    region: "Emmett's den",
    hint: "Over where Emmett hangs out.",
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
  const spots = sugarCandies.map((d) => [d.pos[0], d.pos[2]] as [number, number]);
  const props = [
    ...riverProps(),
    ...pathProps(),
    ...plazaProps(),
    ...plazaArches(),
    ...forestProps(spots),
    ...meadowProps(spots),
    ...marshmallowProps(spots),
    ...mazeProps(),
    ...boundaryProps(),
  ];

  return {
    id: "sugar",
    name: "Sugar Rush Park",
    tagline: "A candy world: a chocolate river, a lollipop forest and a mountain of ice cream.",
    sky: "#ffd6ef",
    fogFar: 165,
    grass: CANDY.grass,
    path: CANDY.sugar,
    spawn: SUGAR.spawn,
    spawnYaw: 0,
    bounds: SUGAR_BOUNDS,
    groundY: 0,
    props,
    dumplings: sugarCandies,
    water: riverWater(),
  };
}
