import * as THREE from "three";
import { sfx } from "./audio";
import type { AABB } from "./collision";
import { FURNITURE, type SpotId } from "./furniture";
import { HOME, HOME_ENTRY, HOME_SPOTS, homeColliders, makeHome, type HomeRig } from "./home-mesh";
import { signBoard } from "./meshes";
import { useHome } from "./home-store";
import { useGame } from "./store";

/**
 * Sloan's house. Her front door is on the fourth house of the south street;
 * pressing Collect there takes her inside a room built high above the house
 * (so the minimap still shows her at home), with its own floor, walls and
 * ceiling as colliders. Inside, each decoration spot has a marker; Collect
 * at a spot opens the decorate panel. The doormat takes her back out.
 */

/** The house on the street that is hers: its centre, and the door on its north face. */
export const HOUSE = { x: -9, z: 110 };
const DOOR_OUT: [number, number] = [HOUSE.x, HOUSE.z - 4.6];
/** the room's origin in the world: straight above the house */
const ROOM: [number, number, number] = [HOUSE.x, 150, HOUSE.z];
const NEAR_SPOT = 1.7;

export class HomeWorld {
  rig: HomeRig;
  private colliders: AABB[] = [];
  private sign: THREE.Mesh;
  private doorGlow: THREE.Mesh;
  private lastPlaced = "";

  constructor(
    private scene: THREE.Scene,
    private worldColliders: AABB[],
  ) {
    this.rig = makeHome(useHome.getState().placed);
    this.rig.group.position.set(...ROOM);
    scene.add(this.rig.group);
    this.rebuildColliders();

    // outside: a name board over her front door and a glowing doorstep
    this.sign = signBoard(`${useGame.getState().playerName || "Sloan"}'s House`, 3.2, 0.7);
    this.sign.position.set(HOUSE.x, 3.35, HOUSE.z - 3.35);
    this.sign.rotation.y = Math.PI;
    scene.add(this.sign);
    this.doorGlow = new THREE.Mesh(
      new THREE.TorusGeometry(0.7, 0.05, 8, 28),
      new THREE.MeshStandardMaterial({ color: "#fff0b0", emissive: new THREE.Color("#ffc84a"), emissiveIntensity: 1.3 }),
    );
    this.doorGlow.rotation.x = Math.PI / 2;
    this.doorGlow.position.set(DOOR_OUT[0], 0.1, DOOR_OUT[1]);
    scene.add(this.doorGlow);
  }

  /**
   * The room's solids in world space, plus a floor and a ceiling. The pet
   * bed's size depends on which one is placed, so this reruns when the
   * furniture changes.
   */
  private rebuildColliders() {
    for (const c of this.colliders) {
      const i = this.worldColliders.indexOf(c);
      if (i >= 0) this.worldColliders.splice(i, 1);
    }
    this.colliders = [];
    const [ox, oy, oz] = ROOM;
    for (const b of homeColliders(useHome.getState().placed)) {
      this.colliders.push({ minX: b.minX + ox, maxX: b.maxX + ox, minY: b.minY + oy, maxY: b.maxY + oy, minZ: b.minZ + oz, maxZ: b.maxZ + oz });
    }
    const hw = HOME.width / 2 + 0.5;
    const hd = HOME.depth / 2 + 0.5;
    this.colliders.push({ minX: ox - hw, maxX: ox + hw, minY: oy - 0.4, maxY: oy, minZ: oz - hd, maxZ: oz + hd });
    this.colliders.push({ minX: ox - hw, maxX: ox + hw, minY: oy + HOME.height, maxY: oy + HOME.height + 0.4, minZ: oz - hd, maxZ: oz + hd });
    this.worldColliders.push(...this.colliders);
  }

  dispose() {
    this.scene.remove(this.rig.group, this.sign, this.doorGlow);
    for (const c of this.colliders) {
      const i = this.worldColliders.indexOf(c);
      if (i >= 0) this.worldColliders.splice(i, 1);
    }
  }

  private roomLocal(x: number, y: number, z: number): [number, number, number] {
    return [x - ROOM[0], y - ROOM[1], z - ROOM[2]];
  }

  /** Update markers, reward furniture and what Collect would do. Returns true while she's inside. */
  update(t: number, her: { x: number; y: number; z: number }) {
    const home = useHome.getState();
    const st = useGame.getState();

    // furniture follows the store (the panel previews by placing)
    const key = JSON.stringify(home.placed);
    if (key !== this.lastPlaced) {
      this.lastPlaced = key;
      for (const [spot, id] of Object.entries(home.placed)) this.rig.setSpot(spot as SpotId, id);
      this.rebuildColliders();
    }

    // rewards
    for (const f of FURNITURE) {
      const earned =
        (f.source === "crown" && st.foundAccessories.includes("crown")) ||
        (f.source === "stickers30" && st.stickers.length >= 30) ||
        (f.source === "pet" && !!st.pet);
      if (earned && home.grant(f.id)) st.setEmmettNotice(`New for your house: ${f.name}!`);
    }

    const [lx, ly, lz] = this.roomLocal(her.x, her.y, her.z);
    const inside = Math.abs(lx) < HOME.width / 2 && Math.abs(lz) < HOME.depth / 2 && ly > -1 && ly < HOME.height;
    if (inside !== home.inside) home.setInside(inside);

    let near: "door" | "exit" | SpotId | null = null;
    if (inside) {
      const [ex, , ez] = HOME_ENTRY.door;
      // tight, so she isn't offered the way out the moment she steps in
      if (Math.hypot(lx - ex, lz - ez) < 0.8) near = "exit";
      let best = near === "exit" ? 0 : NEAR_SPOT;
      for (const [spot, def] of Object.entries(HOME_SPOTS) as [SpotId, (typeof HOME_SPOTS)[SpotId]][]) {
        // stand in front of a spot (1m out along the way it faces)
        const fx = def.pos[0] + Math.sin(def.yaw) * 1;
        const fz = def.pos[2] + Math.cos(def.yaw) * 1;
        const d = Math.hypot(lx - fx, lz - fz);
        if (d < best) {
          best = d;
          near = spot;
        }
      }
      for (const [spot, marker] of Object.entries(this.rig.markers)) {
        marker.visible = !home.panel;
        marker.position.y = (marker.userData.baseY ?? (marker.userData.baseY = marker.position.y)) + Math.sin(t * 2.4 + spot.length) * 0.06;
      }
    } else if (Math.hypot(her.x - DOOR_OUT[0], her.z - DOOR_OUT[1]) < 1.8 && her.y < 1.5) {
      near = "door";
    }
    this.doorGlow.visible = !inside;
    (this.doorGlow.material as THREE.MeshStandardMaterial).emissiveIntensity = 1 + Math.sin(t * 3) * 0.3;
    home.setNear(near);
    return inside;
  }

  /** Collect pressed: go in, go out, or decorate. Returns where to put her, or true if a panel opened. */
  tryInteract(): { teleport: [number, number, number]; yaw: number } | boolean {
    const home = useHome.getState();
    if (home.near === "door") {
      sfx.click();
      const [sx, sy, sz] = HOME_ENTRY.spawn;
      useGame.getState().setEmmettNotice("Welcome home! Walk up to a glowing spot to decorate.");
      return { teleport: [ROOM[0] + sx, ROOM[1] + sy + 0.05, ROOM[2] + sz], yaw: HOME_ENTRY.yaw };
    }
    if (home.near === "exit") {
      sfx.click();
      // step out onto the front path, facing the street
      return { teleport: [DOOR_OUT[0], 0.1, DOOR_OUT[1] - 2.4], yaw: 0 };
    }
    if (home.near) {
      sfx.click();
      home.setPanel(home.near);
      return true;
    }
    return false;
  }
}
