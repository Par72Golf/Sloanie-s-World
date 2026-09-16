/**
 * Live world state for the minimap.
 *
 * The player moves 60 times a second. Pushing that through the store would
 * re-render the whole HUD every frame, so the runtime writes here instead and
 * the minimap reads it on its own animation frame. Nothing else re-renders.
 */

export type Marker = { x: number; z: number; on: boolean };

export const worldPose = {
  /** Player position and facing, in world units. */
  x: 0,
  z: 0,
  yaw: 0,
  /** Emmett, when he is out. */
  emmettX: 0,
  emmettZ: 0,
  emmettOut: false,
  /** Juice boxes, with `on` false while they are respawning. */
  juice: [] as Marker[],
  /** Dumplings she has already found, so the map shows progress not answers. */
  found: [] as Marker[],
  /** Bumped whenever the level changes, so the static layer is redrawn. */
  levelGen: 0,
};

export function resetPose() {
  worldPose.juice = [];
  worldPose.found = [];
  worldPose.emmettOut = false;
  worldPose.levelGen++;
}
