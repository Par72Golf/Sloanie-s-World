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

export type Prop =
  | BoxProp
  | CylinderProp
  | TreeProp
  | HouseProp
  | CloudProp
  | LollipopProp;

export type WaterZone = {
  kind: "water";
  x: number;
  z: number;
  r: number;
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
  /** Juice box pickup spots, ground level. */
  juice?: [number, number][];
  /** Areas Emmett will not ride into: maze corridors, walled gardens. */
  emmettKeepOut?: { minX: number; maxX: number; minZ: number; maxZ: number }[];
  /** Landmarks Emmett rehides a dumpling to, so a loss is never a mystery. */
  rehideSpots?: { name: string; say: string; pos: Vec3 }[];
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
