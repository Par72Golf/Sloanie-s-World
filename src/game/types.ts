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
  noJump?: { minX: number; maxX: number; minZ: number; maxZ: number; why: string }[];
  /** Accessories hidden in this park, ground level: id and where. */
  accessories?: { id: string; pos: [number, number, number]; region: string }[];
  /** A ferris wheel, centred here; the boarding platform is 4m to +z. */
  ride?: { x: number; z: number };
  /** Splash pad centre: the animated spray arches and the little slide go here. */
  splash?: { x: number; z: number };
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
