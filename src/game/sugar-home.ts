import * as THREE from "three";
import { sfx } from "./audio";
import { CANDY_HOUSE, makeCandyHouse, stageInfo, type HouseStage } from "./candy-house";
import { CANDY_HOME_ENTRY, CANDY_HOME_SPOTS, CANDY_ROOMS, candyHomeColliders, makeCandyHome, spotsForStage, type CandyHomeRig } from "./sugar-home-mesh";
import { glowMaterial, type SpotId } from "./furniture";
import { signBoard } from "./meshes";
import { useHome } from "./home-store";
import { useGame } from "./store";
import type { AABB } from "./collision";

/**
 * Her gingerbread house in Sugar Rush Park.
 *
 * The same idea as her clubhouse in park one (home.ts): the house stands on
 * the village square, and the room she decorates is built high above it, so
 * the minimap still shows her at home while she is inside. What is different
 * is that this house grows. A builder's board stands by the porch; paying at
 * it puts up the next stage outside and opens another room inside, and both
 * the house and the room are rebuilt on the spot so she sees what she bought.
 */

/** The plot on the village square. Replaced when the park loads. */
export const CANDY_HOUSE_AT = { x: 130, z: -13 };
/** where she stands to go in, and where she is put down when she comes out */
const DOOR_OUT: [number, number] = [CANDY_HOUSE_AT.x, CANDY_HOUSE_AT.z + CANDY_HOUSE.d / 2 + 1.4];
/** the builder's board, at the garden gate */
const BOARD_AT: [number, number] = [CANDY_HOUSE_AT.x - 3.4, CANDY_HOUSE_AT.z + CANDY_HOUSE.d / 2 + 2.4];
/** the room's origin in the world: straight above the house */
const ROOM: [number, number, number] = [CANDY_HOUSE_AT.x, 150, CANDY_HOUSE_AT.z];
const NEAR_SPOT = 1.7;

export function setCandyHouseOrigin(o: { x: number; z: number } = { x: 130, z: -13 }) {
  CANDY_HOUSE_AT.x = o.x;
  CANDY_HOUSE_AT.z = o.z;
  DOOR_OUT[0] = o.x;
  DOOR_OUT[1] = o.z + CANDY_HOUSE.d / 2 + 1.4;
  BOARD_AT[0] = o.x - 3.4;
  BOARD_AT[1] = o.z + CANDY_HOUSE.d / 2 + 2.4;
  ROOM[0] = o.x;
  ROOM[2] = o.z;
}

/** The ticket price of the next stage, or null when the castle is finished. */
export function nextStage(stage: number): { stage: HouseStage; price: number; name: string; room: string } | null {
  if (stage >= 3) return null;
  const next = stageInfo(stage + 1);
  return { stage: next.stage, price: next.price, name: next.name, room: next.room };
}

export class SugarHomeWorld {
  rig: CandyHomeRig;
  private house: THREE.Group;
  private colliders: AABB[] = [];
  private sign: THREE.Mesh;
  private board: THREE.Group;
  private doorGlow: THREE.Mesh;
  private lastPlaced = "";
  private stage: HouseStage;

  constructor(
    private scene: THREE.Scene,
    private worldColliders: AABB[],
  ) {
    const home = useHome.getState();
    this.stage = Math.min(3, Math.max(1, home.stage)) as HouseStage;
    this.rig = makeCandyHome(this.stage, home.placed);
    this.rig.group.position.set(...ROOM);
    scene.add(this.rig.group);
    this.house = makeCandyHouse(this.stage);
    this.house.position.set(CANDY_HOUSE_AT.x, 0, CANDY_HOUSE_AT.z);
    scene.add(this.house);
    this.rebuildColliders();

    this.sign = signBoard(`${useGame.getState().playerName || "Sloan"}'s House`, 3.6, 0.8);
    this.sign.position.set(CANDY_HOUSE_AT.x, 3.5, CANDY_HOUSE_AT.z + CANDY_HOUSE.d / 2 + 0.3);
    scene.add(this.sign);

    this.board = this.makeBoard();
    scene.add(this.board);

    this.doorGlow = new THREE.Mesh(
      new THREE.TorusGeometry(0.75, 0.055, 8, 28),
      new THREE.MeshStandardMaterial({ color: "#fff0b0", emissive: new THREE.Color("#ffc84a"), emissiveIntensity: 1.3 }),
    );
    this.doorGlow.rotation.x = Math.PI / 2;
    this.doorGlow.position.set(DOOR_OUT[0], 0.12, DOOR_OUT[1]);
    scene.add(this.doorGlow);
  }

  /** The builder's board: a lollipop sign saying what the next stage costs. */
  private makeBoard(): THREE.Group {
    const g = new THREE.Group();
    const next = nextStage(this.stage);
    const text = next ? `Build: ${next.name} — ${next.price} tickets` : "Your candy castle is finished!";
    const plate = signBoard(text, 3.4, 0.62);
    plate.position.set(0, 1.55, 0);
    g.add(plate);
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 1.5, 10),
      new THREE.MeshStandardMaterial({ color: "#f6f1e8", roughness: 0.4 }),
    );
    post.position.y = 0.75;
    post.castShadow = true;
    g.add(post);
    if (next) {
      const glow = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 8, 24), glowMaterial("#ffd84a", 1.1, 0.3));
      glow.rotation.x = Math.PI / 2;
      glow.position.y = 0.1;
      glow.name = "board-glow";
      g.add(glow);
    }
    g.position.set(BOARD_AT[0], 0, BOARD_AT[1]);
    g.rotation.y = Math.PI;
    return g;
  }

  private rebuildColliders() {
    for (const c of this.colliders) {
      const i = this.worldColliders.indexOf(c);
      if (i >= 0) this.worldColliders.splice(i, 1);
    }
    this.colliders = [];
    const [ox, oy, oz] = ROOM;
    for (const b of candyHomeColliders(this.stage, useHome.getState().placed)) {
      this.colliders.push({ minX: b.minX + ox, maxX: b.maxX + ox, minY: b.minY + oy, maxY: b.maxY + oy, minZ: b.minZ + oz, maxZ: b.maxZ + oz });
    }
    // the house itself, out on the square
    for (const b of (this.house.userData.boxes ?? []) as AABB[]) {
      this.colliders.push({
        minX: b.minX + CANDY_HOUSE_AT.x,
        maxX: b.maxX + CANDY_HOUSE_AT.x,
        minY: b.minY,
        maxY: b.maxY,
        minZ: b.minZ + CANDY_HOUSE_AT.z,
        maxZ: b.maxZ + CANDY_HOUSE_AT.z,
      });
    }
    this.worldColliders.push(...this.colliders);
  }

  /** Put up the next stage: new house outside, new room inside, same door. */
  private build(stage: HouseStage) {
    this.stage = stage;
    this.scene.remove(this.rig.group, this.house, this.board);
    this.rig = makeCandyHome(stage, useHome.getState().placed);
    this.rig.group.position.set(...ROOM);
    this.scene.add(this.rig.group);
    this.house = makeCandyHouse(stage);
    this.house.position.set(CANDY_HOUSE_AT.x, 0, CANDY_HOUSE_AT.z);
    this.scene.add(this.house);
    this.board = this.makeBoard();
    this.scene.add(this.board);
    this.lastPlaced = "";
    this.rebuildColliders();
  }

  dispose() {
    this.scene.remove(this.rig.group, this.house, this.sign, this.board, this.doorGlow);
    for (const c of this.colliders) {
      const i = this.worldColliders.indexOf(c);
      if (i >= 0) this.worldColliders.splice(i, 1);
    }
  }

  private roomLocal(x: number, y: number, z: number): [number, number, number] {
    return [x - ROOM[0], y - ROOM[1], z - ROOM[2]];
  }

  /** Update markers and what Collect would do. Returns true while she's inside. */
  update(t: number, her: { x: number; y: number; z: number }) {
    const home = useHome.getState();
    if (home.stage !== this.stage) this.build(Math.min(3, Math.max(1, home.stage)) as HouseStage);

    const key = JSON.stringify(home.placed);
    if (key !== this.lastPlaced) {
      this.lastPlaced = key;
      for (const [spot, id] of Object.entries(home.placed)) this.rig.setSpot(spot as SpotId, id);
      this.rebuildColliders();
    }

    const [lx, ly, lz] = this.roomLocal(her.x, her.y, her.z);
    const inside =
      ly > -1 &&
      ly < 3.4 &&
      CANDY_ROOMS.some((r) => r.stage <= this.stage && lx > r.rect.x0 - 0.5 && lx < r.rect.x1 + 0.5 && lz > r.rect.z0 - 0.5 && lz < r.rect.z1 + 0.5);
    if (inside !== home.inside) home.setInside(inside);

    let near: "door" | "exit" | "upgrade" | SpotId | null = null;
    if (inside) {
      const [ex, , ez] = CANDY_HOME_ENTRY.door;
      if (Math.hypot(lx - ex, lz - ez) < 0.8) near = "exit";
      let best = near === "exit" ? 0 : NEAR_SPOT;
      for (const spot of spotsForStage(this.stage)) {
        const def = CANDY_HOME_SPOTS[spot];
        const fx = def.pos[0] + Math.sin(def.yaw) * 1;
        const fz = def.pos[2] + Math.cos(def.yaw) * 1;
        const d = Math.hypot(lx - fx, lz - fz);
        if (d < best) {
          best = d;
          near = spot;
        }
      }
      for (const [spot, marker] of Object.entries(this.rig.markers)) {
        if (!marker) continue;
        marker.visible = !home.panel;
        marker.position.y = (marker.userData.baseY ?? (marker.userData.baseY = marker.position.y)) + Math.sin(t * 2.4 + spot.length) * 0.06;
      }
    } else if (her.y < 1.6) {
      const toDoor = Math.hypot(her.x - DOOR_OUT[0], her.z - DOOR_OUT[1]);
      const toBoard = Math.hypot(her.x - BOARD_AT[0], her.z - BOARD_AT[1]);
      // the board wins a tie, because the doorstep is wide and she has to be
      // able to reach the builder without the door swallowing every press
      if (toBoard < 1.8 && nextStage(this.stage) && toBoard <= toDoor) near = "upgrade";
      else if (toDoor < 1.8) near = "door";
    }
    this.doorGlow.visible = !inside;
    (this.doorGlow.material as THREE.MeshStandardMaterial).emissiveIntensity = 1 + Math.sin(t * 3) * 0.3;
    const glow = this.board.getObjectByName("board-glow");
    if (glow) glow.visible = !inside;
    home.setNear(near);
    return inside;
  }

  /** Collect pressed: go in, go out, decorate, or open the builder's board. */
  tryInteract(): { teleport: [number, number, number]; yaw: number } | boolean {
    const home = useHome.getState();
    if (home.near === "door") {
      sfx.click();
      const [sx, sy, sz] = CANDY_HOME_ENTRY.spawn;
      useGame.getState().setEmmettNotice("Welcome home! Walk up to a glowing spot to decorate.");
      return { teleport: [ROOM[0] + sx, ROOM[1] + sy + 0.05, ROOM[2] + sz], yaw: CANDY_HOME_ENTRY.yaw };
    }
    if (home.near === "exit") {
      sfx.click();
      return { teleport: [DOOR_OUT[0], 0.1, DOOR_OUT[1] + 2.4], yaw: Math.PI };
    }
    if (home.near === "upgrade") {
      sfx.click();
      home.setUpgrading(true);
      return true;
    }
    if (home.near) {
      sfx.click();
      home.setPanel(home.near);
      return true;
    }
    return false;
  }
}
