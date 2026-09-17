import { caveCellCenter } from "./cave";

/**
 * Sticker book and pet quest layout for the picnic park (LEVELS[0]).
 *
 * Pure data: nothing here is wired into the game. Every position is proved by
 * tools/collectibles.ts through the real colliders and collision code: each
 * spot is walkable from the spawn without jumping, clear of solids and water,
 * and at least 4m from every dumpling (and its alternates), juice box,
 * accessory, sticker and treat. Hand-typed coordinates are wrong about a third
 * of the time on this project, so run the tool after changing any of them:
 *
 *   npx jiti tools/collectibles.ts
 *
 * Directions in hints: north is -z, east is +x. She starts at (0, 0, 22)
 * facing north.
 *
 * Pickup heights (y) are the floating centre: the surface she stands on plus
 * about 0.9m. The farmer, the pet's home and its hideout are floor heights.
 */

export type StickerSpot = { id: string; pos: [number, number, number]; area: string; hint: string };

/** Top of the cave's floor slabs (cave.ts lays them 0.04 thick on the ground). */
const CAVE_FLOOR = 0.04;

/** The floor at the centre of a cave cell (row, column of CAVE_MAP). */
function caveFloor(r: number, c: number): [number, number, number] {
  const [x, z] = caveCellCenter(r, c);
  return [x, CAVE_FLOOR, z];
}

/** A floating pickup over the centre of a cave cell. */
function caveSpot(r: number, c: number): [number, number, number] {
  const [x, y, z] = caveFloor(r, c);
  return [x, y + 0.9, z];
}

export const STICKER_SPOTS: StickerSpot[] = [
  {
    id: "frog",
    pos: [-11.8, 0.9, -39],
    area: "the big pond",
    hint: "A frog is sitting on the west bank of the big pond, north of where you start.",
  },
  {
    id: "dragonfly",
    pos: [-41.2, 0.9, -50],
    area: "the little pond",
    hint: "A dragonfly zips along the east edge of the little pond, just north of the hedge maze.",
  },
  {
    id: "goldfish",
    pos: [2.4, 1.17, -38.2],
    area: "the fountain",
    hint: "Walk to the very end of the wooden dock on the south side of the big pond. The goldfish is jumping by the fountain!",
  },
  {
    id: "butterfly",
    pos: [-55, 0.9, 24],
    area: "the secret garden",
    hint: "A butterfly is hiding in the secret garden with the tall hedges, west of the start.",
  },
  {
    id: "ladybug",
    // the flower bed moved off the midway when the walkways went in
    pos: [10, 1.07, 30],
    area: "the flower bed",
    hint: "A ladybug is crawling in the flower bed beside the path south of the plaza. Turn around!",
  },
  {
    id: "bee",
    pos: [48, 0.9, 52],
    area: "the orchard",
    hint: "Buzz buzz! The bee is right in the middle of the apple orchard.",
  },
  {
    id: "apple",
    pos: [41.4, 0.9, 58.6],
    area: "the orchard",
    hint: "An apple fell off a tree at the south-west side of the orchard.",
  },
  {
    id: "tractor",
    pos: [-50.5, 0.93, -121],
    area: "the farm",
    hint: "Up at the farm, far to the north, look beside the tractor.",
  },
  {
    id: "chicken",
    pos: [-50, 0.95, -139],
    area: "the farm paddock",
    hint: "A chicken got into the fenced paddock at the farm. Squeeze between the fence posts to get in.",
  },
  {
    id: "sunflower",
    pos: [-76, 0.93, -120.4],
    area: "the vegetable beds",
    hint: "A sunflower is growing between the vegetable rows at the farm. Walk in from the west end.",
  },
  {
    id: "horse",
    pos: [-24.2, 0.9, 52],
    area: "the carousel",
    hint: "A carousel horse sticker is outside the carousel fence, on its west side.",
  },
  {
    id: "balloon",
    pos: [-29.8, 0.9, 60.5],
    area: "the carnival booths",
    hint: "A balloon is floating at the west end of the carnival game booths.",
  },
  {
    id: "popcorn",
    pos: [-20.5, 0.9, 42],
    area: "the carnival entrance",
    hint: "Popcorn spilled by the big CARNIVAL sign. Walk south from the start to find it.",
  },
  {
    id: "ferriswheel",
    pos: [34.5, 0.9, 63.5],
    area: "the ferris wheel",
    hint: "Look just east of the steps up to the ferris wheel.",
  },
  {
    id: "mushroom",
    pos: caveSpot(7, 10),
    area: "the mushroom room",
    hint: "Deep in the mountain cave, a sticker glows in the room full of mushrooms.",
  },
  {
    id: "crystal",
    pos: caveSpot(3, 3),
    area: "the crystal grotto",
    hint: "Inside the mountain cave, find the sparkly crystal room.",
  },
  {
    id: "bat",
    pos: caveSpot(5, 6),
    area: "the cave tunnels",
    hint: "A sleepy bat is hanging out in a quiet tunnel inside the mountain cave.",
  },
  {
    id: "tent",
    pos: [126.5, 0.93, 137.5],
    area: "the campground",
    hint: "At the campground, look on the west side of the green tent.",
  },
  {
    id: "marshmallow",
    pos: [130.5, 0.95, 131],
    area: "the campfire",
    hint: "Somebody dropped a marshmallow by the campfire. Yum!",
  },
  {
    id: "owl",
    pos: [-125, 0.9, -40],
    area: "the west woods",
    hint: "An owl is hiding deep in the woods on the far west side of the park.",
  },
  {
    id: "squirrel",
    pos: [-136.5, 0.95, 16.5],
    area: "the woods clearing",
    hint: "A squirrel is playing in the sunny clearing in the middle of the west woods, by the log.",
  },
  {
    id: "baseball",
    pos: [0, 1.12, -77.6],
    area: "the ball field",
    hint: "Somebody left a baseball on second base at the ball field, north of the big pond.",
  },
  {
    id: "tennisball",
    pos: [104, 1.03, 21.5],
    area: "the tennis courts",
    hint: "A tennis ball bounced onto the east court. Go in through the gate on the west side.",
  },
  {
    id: "basketball",
    pos: [100, 1.03, -27],
    area: "the basketball court",
    hint: "The basketball rolled to the east side of the basketball court.",
  },
  {
    id: "soccerball",
    pos: [130, 1.12, -60],
    area: "the soccer pitch",
    hint: "The soccer ball is right on the centre spot of the soccer pitch, far to the east.",
  },
  {
    id: "golfflag",
    pos: [24, 1.03, -138.2],
    area: "the mini golf",
    hint: "At mini golf, far to the north, look by the blue flag.",
  },
  {
    id: "beachball",
    pos: [-44, 0.95, 127.5],
    area: "the swimming pool",
    hint: "A beach ball is on the pool deck, on the north side of the pool. Don't fall in!",
  },
  {
    id: "rainbow",
    pos: [-95, 0.95, 21.5],
    area: "the splash pad",
    hint: "A rainbow shines at the splash pad, just north of the middle arch.",
  },
  {
    id: "sneaker",
    pos: [9, 0.95, 139],
    area: "the ninja course",
    hint: "Somebody lost a sneaker at the ninja course, between the stepping posts and the balance beam.",
  },
  {
    id: "snail",
    pos: [-54, 0.9, -13.2],
    area: "the hedge maze",
    hint: "A slow little snail is inside the hedge maze, in a corridor near its west wall.",
  },
];

export const STICKER_BOOK: { pos: [number, number, number]; hint: string } = {
  pos: [8, 0.9, -10],
  hint: "Your sticker book is by the gazebo, straight ahead to the north.",
};

export const PET_QUEST: {
  farmer: [number, number, number];
  treats: { pos: [number, number, number]; area: string; hint: string }[];
  pawTrail: [number, number][];
  hideout: [number, number, number];
  home: [number, number, number];
} = {
  // on the farm lawn by the barn's east wall, looking at the paddock
  farmer: [-69.8, 0.03, -138.5],
  treats: [
    {
      // in the sandpit at Sandcastle Corner, right where the slide lands.
      // y is floor + 0.9 and the floor here is the sand at 0.16, not grass.
      pos: [22.0, 1.06, 12.6],
      area: "the slide",
      hint: "Sniff sniff! A pet treat is in the sandpit at the bottom of the slide, east of where you start.",
    },
    {
      pos: [-106, 1.03, -26],
      area: "the swings",
      hint: "A pet treat fell by the swings at the big playground on the west side.",
    },
    {
      pos: [-63, 0.98, 103.5],
      area: "the houses",
      hint: "A pet treat is in front of the house at the west end of the street, far to the south.",
    },
    {
      pos: [132, 0.95, 55],
      area: "the pavilion",
      hint: "A pet treat is at the north edge of the big pavilion, far to the east.",
    },
    {
      pos: [54.2, 0.9, -36.5],
      area: "the treehouse",
      hint: "A pet treat is at the bottom of the treehouse stairs, north-east of the big pond.",
    },
  ],
  // from the pet's bed by the barn door, east through the paddock, past the
  // windmill, along the lawn south of the mini golf, to the cave's mouth
  pawTrail: [
    [-76, -134.5], [-72.1, -133.6], [-68.1, -133.1], [-64.1, -132.6], [-59.9, -132.5], [-55.6, -132.5],
    [-51.4, -132.5], [-47.1, -132.5], [-42.9, -132.5], [-39, -131.5], [-36, -128.5], [-33, -125.5],
    [-30, -122.5], [-27, -119.5], [-24, -116.5], [-21, -113.5], [-17, -113], [-12.8, -113],
    [-8.5, -113], [-4.3, -113], [0, -113], [4.2, -113], [8.5, -113], [12.7, -113],
    [16.9, -113], [21.2, -113], [25.4, -113], [29.7, -113], [33.9, -113], [38.2, -113],
    [42.4, -113], [46.5, -112.5], [50.5, -112], [54.5, -111.5], [58.8, -111.5], [63, -111.5],
    [67.3, -111.5], [71.5, -111.5],
  ],
  // the south-west corner of the great cavern, the far end of the tunnels
  // (63m walk from the entrance); clear of the ledge, grotto and nook spots
  hideout: caveFloor(8, 3),
  // the pet's bed by the barn door (the barn's door is on its south, +z, face)
  home: [-76, 0.03, -134.4],
};
