import type * as THREE from "three";
import {
  CANDY_FURNITURE,
  candyFurnitureDef,
  candyFurnitureSolid,
  candySurfaceMaterial,
  isCandyFurnitureId,
  makeCandyFurniture,
  starterCandyFurniture,
} from "./candy-furniture";
import {
  FURNITURE,
  furnitureDef,
  furnitureSolid,
  makeFurniture,
  starterFurniture,
  surfaceMaterial,
  type FurnitureDef,
  type FurnitureId,
  type SpotId,
} from "./furniture";

/**
 * The two houses' furniture catalogues, behind one door.
 *
 * She has a clubhouse in Sunny Picnic Park and a gingerbread house in Sugar
 * Rush Park. They are the same ten decoration spots with the same footprints,
 * so the room, its colliders, the decorate panel and the thumbnail studio can
 * all be shared — but a log cabin bed has no business in a house made of
 * sweets, so each house has its own catalogue and its own save.
 *
 * Everything that used to reach straight for `FURNITURE` now asks a kit, and
 * anything handed a bare id (a thumbnail, a saved string) can ask which kit
 * owns it. Ids never clash: park one's are `bed_cabin`, this park's are all
 * `candy_`-prefixed.
 */

export type HouseKitId = "clubhouse" | "candy";

export type HouseKit = {
  id: HouseKitId;
  /** localStorage slot: one house's furniture never touches the other's */
  saveKey: string;
  catalogue: FurnitureDef[];
  starters: () => Record<SpotId, FurnitureId>;
  def: (id: FurnitureId) => FurnitureDef | undefined;
  make: (id: FurnitureId) => THREE.Group;
  surface: (id: FurnitureId) => THREE.Material;
  solid: (id: FurnitureId) => { w: number; d: number; h: number } | null;
};

export const HOUSE_KITS: Record<HouseKitId, HouseKit> = {
  clubhouse: {
    id: "clubhouse",
    saveKey: "sloanies-world-home-v1",
    catalogue: FURNITURE,
    starters: starterFurniture,
    def: furnitureDef,
    make: makeFurniture,
    surface: surfaceMaterial,
    solid: furnitureSolid,
  },
  candy: {
    id: "candy",
    saveKey: "sloanies-world-candy-home-v1",
    catalogue: CANDY_FURNITURE as unknown as FurnitureDef[],
    starters: starterCandyFurniture,
    def: candyFurnitureDef,
    make: (id) => makeCandyFurniture(id as Parameters<typeof makeCandyFurniture>[0]),
    surface: (id) => candySurfaceMaterial(id as Parameters<typeof candySurfaceMaterial>[0]),
    solid: candyFurnitureSolid,
  },
};

/** Which house a piece belongs to, by its id alone. */
export function kitFor(id: FurnitureId): HouseKit {
  return isCandyFurnitureId(id) ? HOUSE_KITS.candy : HOUSE_KITS.clubhouse;
}

/** Look a piece up in whichever catalogue has it. */
export function anyFurnitureDef(id: FurnitureId): FurnitureDef | undefined {
  return kitFor(id).def(id);
}

/** Build a piece from whichever catalogue has it (for previews and thumbnails). */
export function anyMakeFurniture(id: FurnitureId): THREE.Group {
  return kitFor(id).make(id);
}

/** The wallpaper or floor material for a piece from either catalogue. */
export function anySurfaceMaterial(id: FurnitureId): THREE.Material {
  return kitFor(id).surface(id);
}

/** The solid footprint of a piece from either catalogue. */
export function anyFurnitureSolid(id: FurnitureId) {
  return kitFor(id).solid(id);
}
