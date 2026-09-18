export type Phase =
  | "title"
  | "playing"
  | "quiz"
  | "paused"
  | "complete"
  | "victory";

export type Hide = "easy" | "medium" | "hard";

export type TempBand =
  | "freezing"
  | "cold"
  | "chilly"
  | "lukewarm"
  | "warm"
  | "hot"
  | "burning";

export type Vec3 = [number, number, number];

export type BoxProp = {
  kind: "box";
  pos: Vec3;
  size: Vec3;
  color: string;
  collide?: boolean;
  ry?: number;
  opacity?: number;
};

export type CylinderProp = {
  kind: "cyl";
  pos: Vec3;
  r: number;
  h: number;
  color: string;
  collide?: boolean;
};

export type TreeProp = {
  kind: "tree";
  x: number;
  z: number;
  variant?: 0 | 1 | 2;
  scale?: number;
};

export type HouseProp = {
  kind: "house";
  x: number;
  z: number;
  body: string;
  roof: string;
  ry?: number;
  w?: number;
  d?: number;
};

export type CloudProp = {
  kind: "cloud";
  pos: Vec3;
  scale?: number;
};

export type LollipopProp = {
  kind: "lollipop";
  x: number;
  z: number;
  candy: string;
};

export type TentProp = {
  kind: "tent";
  x: number;
  z: number;
  color: string;
};

/** A farm tractor model, nose toward +x (or turned a quarter with ry). */
export type TractorProp = {
  kind: "tractor";
  x: number;
  z: number;
  /** 0 or ±PI/2 only: colliders are axis-aligned */
  ry?: number;
};

/** A rectangular trampoline: walk onto the mat and she bounces. */
export type TrampolineProp = {
  kind: "trampoline";
  x: number;
  z: number;
  w: number;
  d: number;
};

/** A tyre lying flat, for tyre runs. */
export type TyreProp = {
  kind: "tyre";
  x: number;
  z: number;
  r: number;
};

export type Prop =
  | TrampolineProp
  | TyreProp
  | TractorProp
  | BoxProp
  | CylinderProp
  | TreeProp
  | HouseProp
  | CloudProp
  | LollipopProp
  | TentProp;

/** The pet she earns in the lost pet quest. */
export type PetKindId = "puppy" | "kitten" | "bunny";
export type PetSave = { kind: PetKindId; coat: string; name: string };
/**
 * Farmer Joe's three rescues, one chapter each, all three ending with a pet.
 *
 *   chapter 0  the treat hunt: 5 treats, the paw prints, the mountain cave
 *   chapter 1  the feather trail from the farm to the heart of the hedge maze
 *   chapter 2  hide and seek: three hiding places on the farm
 *
 * `stage` is where she is inside the chapter she is on. "treats" is the
 * gather step of chapter 0 and "seek" the one of chapter 2; both fill
 * `treats` with the indices found. Every chapter ends at Farmer Joe himself.
 */
export type QuestStage = "none" | "treats" | "trail" | "seek" | "escort" | "choose" | "done";
export type QuestSave = {
  stage: QuestStage;
  /** indices found in this chapter's gather step (treats, or hiding places) */
  treats: number[];
  /** which rescue she is on: 0, 1, 2, and 3 once all three are hers */
  chapter: number;
  /** the pet this chapter is about, once it is known */
  seek: PetKindId | null;
};

export type WaterZone = {
  kind: "water";
  x: number;
  z: number;
  r: number;
  /**
   * A built pool rather than a pond: she still swims slowly in it, but it
   * gets no rocky bank, cattails, lily pads or foam ring. Without this the
   * swimming pool was dressed as a pond, rocks and reeds in the lanes.
   */
  pool?: boolean;
};

import type { Finish } from "./finishes";

export type DumplingDef = {
  id: string;
  name: string;
  color: string;
  accent: string;
  pos: Vec3;
  hide: Hide;
  region: string;
  hint: string;
  /** Alternate hiding spots, so a replay is not a memory test. */
  alts?: { pos: Vec3; region: string; hint: string }[];
  /** Visual treatment. Rarer finishes belong on the harder hiding spots. */
  finish?: Finish;
};

export type LevelDef = {
  id: string;
  name: string;
  tagline: string;
  sky: string;
  fogFar: number;
  grass: string;
  path: string;
  spawn: Vec3;
  spawnYaw: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  groundY: number;
  voidY?: number;
  islands?: boolean;
  props: Prop[];
  dumplings: DumplingDef[];
  water?: WaterZone[];
  /** Which set of hiding spots to use: 0 is the authored one. */
  layout?: number;
  /** Juice box pickup spots, ground level. */
  juice?: [number, number][];
  /** Areas Emmett will not ride into: maze corridors, walled gardens. */
  emmettKeepOut?: { minX: number; maxX: number; minZ: number; maxZ: number }[];
  /** Landmarks Emmett rehides a dumpling to, so a loss is never a mystery. */
  rehideSpots?: { name: string; say: string; pos: Vec3 }[];
  /**
   * Areas where jumping is disabled. Must extend past the thing being
   * protected by at least her jump reach, or she can jump onto it from outside.
   * tools/maze.ts checks this for the hedge maze.
   */
  noJump?: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    why: string;
    /**
     * Landing above this height inside the zone means she is standing on top
     * of something she should not be on (a hedge). She is put back where she
     * jumped from, so the zone itself only has to cover the thing, not every
     * spot a running jump could start from.
     */
    keepOff?: number;
  }[];
  /** Accessories hidden in this park, ground level: id and where. */
  accessories?: { id: string; pos: [number, number, number]; region: string }[];
  /** A ferris wheel, centred here; the boarding platform is 4m to +z. */
  ride?: { x: number; z: number };
  /** Splash pad centre: the animated spray arches and the little slide go here. */
  splash?: { x: number; z: number };
  /** The mountain cave's footprint: inside it, first person is forced. */
  caveZone?: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** The carnival (carnival.ts): booths, the carousel and their games. */
  carnival?: boolean;
  /** Emmett's monster truck yard (emmett-base.ts): he lives and laps there. */
  emmettBase?: boolean;
  /** The little zoo beside the farm (zoo.ts): enclosures, animals and plaques. */
  zoo?: boolean;
  /** Campfire position: flames flicker and there is a warm light. */
  campfire?: { x: number; z: number };
};

export type QuizQ = {
  prompt: string;
  answer: number;
  choices: number[];
  visual?: number[];
};

export type DressId = "coral" | "sky" | "mint" | "rose" | "apricot";
export type HairId = "brown" | "black" | "blonde" | "auburn" | "pink";

export const DRESS: Record<DressId, string> = {
  coral: "#d45a4a",
  sky: "#4f93c4",
  mint: "#3f9a6b",
  rose: "#c46b8a",
  apricot: "#d4894a",
};

export const HAIR: Record<HairId, string> = {
  brown: "#4a2e1c",
  black: "#1c1614",
  blonde: "#d4a054",
  auburn: "#8b3a2a",
  pink: "#d07a96",
};

export const TEMP_LABEL: Record<TempBand, string> = {
  freezing: "Freezing",
  cold: "Cold",
  chilly: "Chilly",
  lukewarm: "Lukewarm",
  warm: "Warm",
  hot: "Hot",
  burning: "Burning",
};
