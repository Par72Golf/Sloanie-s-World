import * as THREE from "three";
import { sfx } from "./audio";
import { glowMaterial } from "./furniture";
import { lam, mesh, signBoard, sphereGeo } from "./meshes";
import { SUGAR } from "./sugar-rush";
import { useGame } from "./store";

/**
 * The sweet shop on the fairground: where her tickets go in this park.
 *
 * Her house already takes tickets — furniture, and the three stages she
 * builds it up through — but the fairground had nowhere to spend anything,
 * so winning at the marshmallow booth paid in a currency with no shop
 * attached to it. This is that shop.
 *
 * It sells five things to wear, and unlike the seven hidden round the park
 * none of these is findable: the only way to a gumball machine hat is to earn
 * it. The stall itself is one of the fairground's own candy stalls, dressed
 * with a board and a jar of sweets on the counter, so it looks like it has
 * always been there rather than like a shop that landed on the grass.
 */

/**
 * The stall it trades from, and where she stands to be served.
 *
 * A candy stall serves over the counter on its +z face — the box at z 0.8..1.3
 * with its top at 1.08 — and has a blank back wall at -z. The first cut of
 * this put her behind the stall talking to the wall.
 */
export const SHOP_AT = { x: SUGAR.fair.x + 6, z: SUGAR.fair.z + 16 };
const COUNTER_TOP = 1.08;
export const STAND = { x: SHOP_AT.x, z: SHOP_AT.z + 3.2 };
export const NEAR_R = 2.6;

const gloss = (c: string, roughness = 0.16) => lam(c, { flat: true, roughness });

export class SweetShop {
  private group = new THREE.Group();

  constructor(private scene: THREE.Scene) {
    const board = signBoard("Sweet Shop", 3.4, 0.74);
    board.position.set(SHOP_AT.x, 3.5, SHOP_AT.z + 1.9);
    this.group.add(board);

    // a jar of boiled sweets on the counter, so the stall reads as a shop
    const jar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.3, 0.62, 14),
      lam("#e8f6ff", { flat: true, roughness: 0.06, transparent: true, opacity: 0.4 }),
    );
    jar.position.set(SHOP_AT.x - 1.1, COUNTER_TOP + 0.31, SHOP_AT.z + 1.05);
    this.group.add(jar);
    const sweets = ["#e8384f", "#ffc83a", "#6fe3c4", "#b06aff", "#ff8a3a", "#ff6aa8"];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 * 1.6;
      const r = 0.08 + (i % 3) * 0.08;
      this.group.add(
        mesh(sphereGeo, sweets[i % sweets.length]!, 0.09, 0.09, 0.09, SHOP_AT.x - 1.1 + Math.cos(a) * r, COUNTER_TOP + 0.13 + (i % 4) * 0.1, SHOP_AT.z + 1.05 + Math.sin(a) * r, false),
      );
    }
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.09, 14), gloss("#e8384f", 0.3));
    lid.position.set(SHOP_AT.x - 1.1, COUNTER_TOP + 0.66, SHOP_AT.z + 1.05);
    this.group.add(lid);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.06, 8, 26), glowMaterial("#ffd84a", 1.1, 0.3));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(STAND.x, 0.12, STAND.z);
    ring.name = "shop-ring";
    this.group.add(ring);

    scene.add(this.group);
  }

  dispose() {
    this.scene.remove(this.group);
    useGame.getState().setSweetShop(false);
  }

  near(x: number, y: number, z: number) {
    if (useGame.getState().sweetShop) return false;
    return y < 2 && Math.hypot(x - STAND.x, z - STAND.z) < NEAR_R;
  }

  tryInteract(x: number, y: number, z: number) {
    if (!this.near(x, y, z)) return false;
    sfx.click();
    useGame.getState().setSweetShop(true);
    return true;
  }

  update(t: number) {
    const ring = this.group.getObjectByName("shop-ring");
    if (ring) ring.rotation.z = t * 0.6;
  }
}
