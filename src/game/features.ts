import { PARK_DIRECTORIES, PARK_NAME_SIGNS, type Directory, type NameSign } from "./signs";
import { walkwayRects } from "./walkways";
import type { NavRect } from "./navgrid";
import type { LevelDef, ModelProp } from "./types";

/**
 * Where each park puts the features it shares with the other parks.
 *
 * Mini golf, the bowls club, the lava course, her house, the zoo, the truck
 * yard and the carnival were each pinned to one set of world coordinates
 * inside their own module, and the runtime switched them on with
 * `level.id === "picnic"`. That was fine while there was one real park. A
 * second park needs the same games somewhere else, so the coordinates move
 * out here, keyed by level id, and the runtime asks whether the level has the
 * feature instead of asking which park it is.
 *
 * Keyed by id rather than carried on LevelDef so the park files stay a list of
 * what is in the park; this is the map of where. A park with no entry has none
 * of it, which is what the two v1 leftover levels want.
 *
 * Each module keeps its own table of numbers and its own default origin — the
 * comments explaining why the bowls green is at (97, 92) belong with the green.
 * What lives here is only the override, and `picnic`'s entries are the same
 * numbers those defaults already hold, so nothing in park 1 moves.
 */

export type Origin = { x: number; z: number };

/** A turned frame: the origin plus the yaw the module's local axes are laid out on. */
export type TurnedOrigin = Origin & { yaw: number };

export type LevelFeatures = {
  /** mini golf (park.ts GOLF, minigolf.ts): the centre of the five lanes */
  golf?: Origin;
  /** the bowls club (bowls.ts BOWLS): the centre of the green */
  bowls?: Origin;
  /** floor is lava (lava.ts): the start deck, and the way the route sets off */
  lava?: { x: number; z: number; dir: "N" | "S" | "E" | "W" };
  /** her house (home.ts HOUSE): the house on the street that is hers */
  home?: Origin;
  /** the zoo (zoo.ts ZOO): centre of the fence lines, and its half turn */
  zoo?: TurnedOrigin;
  /** Emmett's truck yard (emmett-base.ts EMMETT_BASE): yard centre and the truck's yaw */
  emmettBase?: TurnedOrigin;
  /** the carnival (carnival.ts): the carousel's centre, with the booth row hung off it */
  carnival?: Origin;
  /** the park's signage: direction posts and name boards (signs.ts) */
  signs?: { directories: Directory[]; names: NameSign[] };
  /**
   * Ground Emmett would rather ride on: the park's path network. It is only a
   * step cost, so a real shortcut across the grass still wins. navgrid caches
   * a grid on this array's identity, so it has to be one array built once per
   * park, never rebuilt per frame.
   */
  prefer?: readonly NavRect[];
  /**
   * Composite models the builder places on top of the park's props. These are
   * `model` props in everything but where they are written down; they live
   * here because levels.ts describes the park and this describes the fittings.
   */
  landmarks?: readonly ModelProp[];
  /**
   * The kite field, duck pond, flower garden, story circle and fairground
   * green (places.ts). Still authored at park 1's own coordinates inside that
   * module, so this says whether the park has them, not where they are.
   */
  places?: boolean;
  /** The arrival plaza round the spawn (plaza.ts), likewise park 1's own. */
  plaza?: boolean;
};

/**
 * Park 1's path network, built once. Emmett's grid is cached on this exact
 * array, so handing out a fresh copy per level load would rebuild the grid
 * every time she walked back into the park.
 */
export const PARK_WALKWAYS: readonly NavRect[] = walkwayRects(0);

const NONE: LevelFeatures = {};

const FEATURES: Record<string, LevelFeatures> = {
  picnic: {
    golf: { x: 20, z: -132 },
    bowls: { x: 97, z: 92 },
    lava: { x: 107.5, z: 124, dir: "W" },
    home: { x: -9, z: 110 },
    zoo: { x: -15, z: -136, yaw: Math.PI },
    emmettBase: { x: 50.5, z: -9, yaw: -Math.PI / 2 },
    carnival: { x: -16, z: 53 },
    signs: { directories: PARK_DIRECTORIES, names: PARK_NAME_SIGNS },
    prefer: PARK_WALKWAYS,
    landmarks: [
      { kind: "model", id: "slide", x: 22, z: 8 },
      { kind: "model", id: "gazebo", x: 8, z: -6 },
      // standing in the big pond
      { kind: "model", id: "fountain", x: 0, z: -42 },
      // at the top of the existing stairs, its open front and rope ladder
      // turned to face them
      { kind: "model", id: "treehouse", x: 54.2, z: -53, ry: Math.PI },
    ],
    places: true,
    plaza: true,
  },
  village: {
    landmarks: [{ kind: "model", id: "fountain", x: 0, z: 0 }],
  },
};

export function featuresFor(level: LevelDef): LevelFeatures {
  return FEATURES[level.id] ?? NONE;
}
