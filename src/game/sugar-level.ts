import type { DumplingDef, LevelDef } from "./types";
import {
  CANDY,
  SUGAR,
  SUGAR_BOUNDS,
  boundaryProps,
  pathProps,
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
const sugarCandies: DumplingDef[] = [
  {
    id: "chocdrop",
    name: "Choco Drop",
    color: "#6b4226",
    accent: "#a9743f",
    pos: [-20, 0.55, -50],
    hide: "easy",
    region: "the candy factory",
    hint: "By the factory doors, where the chocolate comes out.",
  },
  {
    id: "canetwist",
    name: "Cane Twist",
    color: "#e8384f",
    accent: "#fbf7f2",
    pos: [10, 0.55, 8],
    hide: "easy",
    region: "Peppermint Plaza",
    hint: "On the plaza, near the peppermint swirl.",
  },
  {
    id: "sourwiggle",
    name: "Sour Wiggle",
    color: "#a8e84a",
    accent: "#ffe45a",
    pos: [70, 0.55, 70],
    hide: "medium",
    region: "Gumdrop Meadow",
    hint: "Out in the meadow with the gumdrop hills.",
  },
  {
    id: "gummybear",
    name: "Gummy Bear",
    color: "#ff8a3a",
    accent: "#ffc83a",
    pos: [-100, 0.55, 20],
    hide: "easy",
    region: "the Lollipop Forest",
    hint: "In the clearing in the lollipop woods.",
  },
  {
    id: "jellybean",
    name: "Jelly Bean",
    color: "#b06aff",
    accent: "#ff93c4",
    pos: [112, 0.55, 4],
    hide: "medium",
    region: "Gingerbread Village",
    hint: "Among the gingerbread houses.",
  },
  {
    id: "lollyswirl",
    name: "Lolly Swirl",
    color: "#ff6aa8",
    accent: "#6fe3c4",
    pos: [-120, 0.55, -20],
    hide: "medium",
    region: "the Lollipop Forest",
    hint: "North end of the lollipop woods.",
  },
  {
    id: "marshpillow",
    name: "Marsh Pillow",
    color: "#fbf7f2",
    accent: "#ff93c4",
    pos: [-30, 0.55, 112],
    hide: "easy",
    region: "Marshmallow Fields",
    hint: "Out on the soft white fields.",
  },
  {
    id: "bubblegum",
    name: "Bubble Gum",
    color: "#ff93c4",
    accent: "#ffffff",
    pos: [-100, 0.55, 96],
    hide: "medium",
    region: "the fairground",
    hint: "Near the rides.",
  },
  {
    id: "licoricetwist",
    name: "Licorice Twist",
    color: "#2a2430",
    accent: "#e8384f",
    pos: [88, 0.55, -90],
    hide: "hard",
    region: "the Licorice Maze",
    hint: "Somewhere in the black and red hedges.",
  },
  {
    id: "peppermint",
    name: "Pepper Mint",
    color: "#fbf7f2",
    accent: "#e8384f",
    pos: [8, 0.55, -34],
    hide: "easy",
    region: "the north path",
    hint: "Beside the path north out of the plaza.",
  },
  {
    id: "toffeechew",
    name: "Toffee Chew",
    color: "#c98a3a",
    accent: "#6b4226",
    pos: [110, 0.55, 118],
    hide: "medium",
    region: "the chocolate lake",
    hint: "On the shore where the river ends.",
  },
  {
    id: "rockcandy",
    name: "Rock Candy",
    color: "#6fe3c4",
    accent: "#ffffff",
    pos: [-96, 0.55, -104],
    hide: "hard",
    region: "Ice Cream Mountain",
    hint: "At the foot of the mountain of scoops.",
  },
  {
    id: "cottonpuff",
    name: "Cotton Puff",
    color: "#ffb8e0",
    accent: "#9fd8ff",
    pos: [86, 0.55, 92],
    hide: "medium",
    region: "Gumdrop Meadow",
    hint: "On the far side of the meadow.",
  },
  {
    id: "caramelcube",
    name: "Caramel Cube",
    color: "#d89a4a",
    accent: "#8a5a34",
    pos: [124, 0.55, 22],
    hide: "medium",
    region: "Gingerbread Village",
    hint: "By the village square.",
  },
  {
    id: "fudgeblock",
    name: "Fudge Block",
    color: "#8a5a34",
    accent: "#f7ead3",
    pos: [118, 0.55, 52],
    hide: "hard",
    region: "Emmett's den",
    hint: "Over where Emmett hangs out.",
  },
  {
    id: "jawbreaker",
    name: "Jawbreaker",
    color: "#ff5a7a",
    accent: "#9fd8ff",
    pos: [34, 0.55, -2],
    hide: "hard",
    region: "the chocolate river",
    hint: "Beside the river, east of the plaza.",
  },
];

export function sugarRushPark(): LevelDef {
  const props = [
    ...riverProps(),
    ...pathProps(),
    ...plazaProps(),
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
