import * as THREE from "three";
import { LEVEL, PIECE } from "./build-pieces";
import { useBuild } from "./build-store";
import type { AABB } from "./collision";
import { lam, signBoard } from "./meshes";
import { Placer, type Aim, type PlaceArea } from "./placer";
import { SUGAR } from "./sugar-rush";

/**
 * The build yard: a square of Sugar Rush where she builds whatever she likes,
 * with the pieces in build-pieces.ts and the placing in placer.ts.
 *
 * Emmett does not come in (sugar-level.ts keeps him out): her builds are not
 * on his map, and nobody wants to be tagged halfway up their own castle.
 */

const Y = SUGAR.buildYard;
export const YARD_CELLS = Y.cells;
const X0 = Y.x - Y.cells / 2;
const Z0 = Y.z - Y.cells / 2;
/** 12m: tall enough for a proper tower, short enough to stay in the camera */
export const MAX_LEVEL = 24;

export const YARD_AREA: PlaceArea = {
  x0: X0,
  z0: Z0,
  y0: 0,
  cols: Y.cells,
  rows: Y.cells,
  maxLevel: MAX_LEVEL,
  fits: () => true,
  catalogue: PIECE,
  store: useBuild,
};

/** The yard's square in world metres, padded by `pad`. */
export function buildYardRect(pad = 0) {
  return { minX: X0 - pad, maxX: X0 + Y.cells + pad, minZ: Z0 - pad, maxZ: Z0 + Y.cells + pad };
}

function gridTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fbe9d2";
  g.fillRect(0, 0, 128, 128);
  // a waffle: each square a metre, so she can see where a piece will go
  g.strokeStyle = "#e9c89e";
  g.lineWidth = 6;
  g.strokeRect(3, 3, 122, 122);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(Y.cells, Y.cells);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class BuildYard {
  private group = new THREE.Group();
  private placer: Placer;

  constructor(
    private scene: THREE.Scene,
    worldColliders: AABB[],
  ) {
    this.placer = new Placer(scene, worldColliders, YARD_AREA);
    // the floor: a waffle-gridded mat, 4cm up so it clears the lawn and
    // shares a height with nothing else in the park
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(Y.cells, Y.cells),
      new THREE.MeshStandardMaterial({ map: gridTexture(), roughness: 0.9 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(Y.x, 0.04, Y.z);
    floor.receiveShadow = true;
    this.group.add(floor);
    // an icing kerb round it, low enough to step over, open in the middle of each side
    const kerb = lam("#ff93c4", { flat: true, roughness: 0.35 });
    const half = Y.cells / 2;
    const len = (Y.cells - 3) / 2;
    for (const [dx, dz, along] of [
      [0, -half, true],
      [0, half, true],
      [-half, 0, false],
      [half, 0, false],
    ] as const) {
      for (const s of [-1, 1]) {
        // two runs per side with a 3m gap between them
        const m = new THREE.Mesh(new THREE.BoxGeometry(along ? len : 0.3, 0.16, along ? 0.3 : len), kerb);
        m.position.set(Y.x + dx + (along ? s * (len / 2 + 1.5) : 0), 0.08, Y.z + dz + (along ? 0 : s * (len / 2 + 1.5)));
        m.receiveShadow = true;
        this.group.add(m);
      }
    }
    const sign = signBoard("Build Yard", 4, 0.8);
    sign.position.set(Y.x, 2.4, Y.z + half + 0.6);
    this.group.add(sign);
    scene.add(this.group);
  }

  dispose() {
    this.placer.dispose();
    this.scene.remove(this.group);
    useBuild.getState().setBuilding(false);
    useBuild.getState().setInYard(false);
  }

  update(dt: number, her: { x: number; y: number; z: number; yaw: number }, paused: boolean, aim?: Aim) {
    if (!(dt > 0)) return;
    const store = useBuild.getState();
    const r = buildYardRect(0.5);
    const inYard = her.x > r.minX && her.x < r.maxX && her.z > r.minZ && her.z < r.maxZ && her.y < MAX_LEVEL * LEVEL + 2;
    store.setInYard(inYard);
    if (!inYard && store.building) store.setBuilding(false);
    this.placer.update(dt, her, store.building && !paused, aim);
  }
}
