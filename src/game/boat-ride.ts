import * as THREE from "three";
import { sfx } from "./audio";
import { makeChocolateBoat } from "./candy-builds";
import type { AABB } from "./collision";
import { glowMaterial } from "./furniture";
import { lam, mesh, signBoard, sphereGeo } from "./meshes";
import { RIVER_PATH } from "./sugar-rush";
import { useGame } from "./store";

/**
 * The chocolate river boat: a ride down the spine of the park.
 *
 * The river already exists as a spline the whole park was laid out around, so
 * the ride is the one thing here that needed no route designing — the boat
 * simply follows it, from a jetty a short walk east of the plaza all the way
 * to the lake, about a hundred and sixty metres and half a minute.
 *
 * There is no way to get off early, for the same reason the ferris wheel has
 * none: both banks are chocolate, and a child who hops out mid-river is a
 * child standing in a river. It ends at a landing stage at the lake and puts
 * her down on it.
 *
 * While she is aboard her capsule is stamped onto the seat every frame, the
 * way the wheel does it. The physics still runs underneath and is simply
 * overwritten, which is cheaper and far less fragile than trying to switch it
 * off for one passenger.
 */

const C = {
  wafer: "#e8b86a",
  waferDark: "#c9913f",
  icing: "#f6f1e8",
  cane: "#e8384f",
  pink: "#ff6aa8",
  mint: "#6fe3c4",
};

const gloss = (c: string, roughness = 0.2) => lam(c, { flat: true, roughness });

/** Where she gets on, as an index into the river's own samples, and the pace. */
const BOARD_AT = 96;
/** samples a second; the river is sampled every 2.5m, so this is about 5.5 m/s */
const PACE = 2.2;
const NEAR_R = 2.6;
/** how far off the middle of the river the jetty stands */
const JETTY_OUT = 1.2;

/** The river point at `i`, and the direction it is flowing there. */
function at(i: number) {
  const n = RIVER_PATH.length;
  const a = RIVER_PATH[Math.max(0, Math.min(n - 1, Math.floor(i)))]!;
  const b = RIVER_PATH[Math.max(0, Math.min(n - 1, Math.floor(i) + 1))]!;
  const f = i - Math.floor(i);
  const x = a.x + (b.x - a.x) * f;
  const z = a.z + (b.z - a.z) * f;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x, z, w: a.w, dx: dx / len, dz: dz / len };
}

/** A jetty: a wafer deck on cane piles, standing out over the chocolate. */
function makeJetty(): THREE.Group {
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.22, 4.6), gloss(C.wafer, 0.55));
  board.position.y = 0.52;
  board.castShadow = true;
  board.receiveShadow = true;
  g.add(board);
  for (const sx of [-1.2, 1.2]) {
    for (const sz of [-1.8, 0, 1.8]) {
      const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.62, 8), gloss(C.icing, 0.35));
      pile.position.set(sx, 0.31, sz);
      g.add(pile);
    }
  }
  // a candy-cane bollard at each corner, so the edge of the deck is obvious
  for (const sx of [-1.25, 1.25]) {
    for (const sz of [-2.1, 2.1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.8, 8), gloss(C.cane, 0.3));
      post.position.set(sx, 1.0, sz);
      g.add(post);
      g.add(mesh(sphereGeo, C.icing, 0.14, 0.14, 0.14, sx, 1.44, sz, false));
    }
  }
  return g;
}

export class BoatRide {
  private group = new THREE.Group();
  private boat: THREE.Group;
  private ring: THREE.Mesh;
  private solids: (AABB & { label: string })[] = [];
  /** where along the river the boat is, or null when it is moored */
  private at: number | null = null;
  private moored = { x: 0, z: 0, yaw: 0 };
  private board = { x: 0, z: 0 };
  private land = { x: 0, z: 0 };
  private t = 0;

  constructor(
    private scene: THREE.Scene,
    private worldColliders: AABB[],
  ) {
    const start = at(BOARD_AT);
    const end = at(RIVER_PATH.length - 3);

    // the two jetties: one where she gets on, one where she gets off
    for (const [p, tag] of [
      [start, "board"],
      [end, "land"],
    ] as const) {
      const off = p.w / 2 + JETTY_OUT;
      // the jetty stands on the left bank, square to the flow
      const jx = p.x - p.dz * off;
      const jz = p.z + p.dx * off;
      const jetty = makeJetty();
      jetty.position.set(jx, 0, jz);
      jetty.rotation.y = Math.atan2(p.dx, p.dz);
      this.group.add(jetty);
      this.solids.push({
        minX: jx - 1.6,
        maxX: jx + 1.6,
        minY: 0,
        maxY: 0.62,
        minZ: jz - 2.4,
        maxZ: jz + 2.4,
        label: `boat jetty ${tag}`,
      });
      if (tag === "board") {
        this.board = { x: jx, z: jz };
        this.moored = { x: p.x, z: p.z, yaw: Math.atan2(p.dx, p.dz) };
      } else {
        this.land = { x: jx, z: jz };
      }
    }

    const sign = signBoard("Chocolate River Boat", 4.4, 0.8);
    sign.position.set(this.board.x, 3.0, this.board.z);
    sign.rotation.y = Math.atan2(start.dx, start.dz) + Math.PI / 2;
    this.group.add(sign);

    this.boat = makeChocolateBoat();
    this.boat.position.set(this.moored.x, 0.12, this.moored.z);
    this.boat.rotation.y = this.moored.yaw;
    this.group.add(this.boat);

    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.055, 8, 24), glowMaterial("#ffd84a", 1.1, 0.3));
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.set(this.board.x, 0.72, this.board.z);
    this.group.add(this.ring);

    this.worldColliders.push(...this.solids);
    scene.add(this.group);
  }

  dispose() {
    this.scene.remove(this.group);
    for (const s of this.solids) {
      const i = this.worldColliders.indexOf(s);
      if (i >= 0) this.worldColliders.splice(i, 1);
    }
    this.solids = [];
  }

  get riding() {
    return this.at != null;
  }

  /** Standing on the jetty with the boat moored at it. */
  near(x: number, y: number, z: number) {
    if (this.riding) return false;
    return y < 2.2 && Math.hypot(x - this.board.x, z - this.board.z) < NEAR_R;
  }

  tryInteract(x: number, y: number, z: number) {
    if (!this.near(x, y, z)) return false;
    sfx.click();
    this.at = BOARD_AT;
    useGame.getState().setRiding(true);
    useGame.getState().setEmmettNotice("All aboard! Down the chocolate river to the lake.");
    return true;
  }

  /**
   * Move the boat, and the passenger with it. Called after physics, so the
   * capsule it stamps is the last word on where she is this frame.
   */
  update(dt: number, cap: { x: number; y: number; z: number }) {
    // a frame can arrive with a negative delta when the page's own loop and a
    // stepped test frame interleave, and anything integrating time then runs
    // backwards; the park's older movers guard the same way
    if (!(dt > 0)) return;
    this.t += dt;
    this.ring.visible = !this.riding;
    this.ring.rotation.z = this.t * 0.6;

    if (this.at == null) {
      // moored: rocking gently at the jetty
      this.boat.position.set(this.moored.x, 0.12 + Math.sin(this.t * 1.3) * 0.03, this.moored.z);
      this.boat.rotation.y = this.moored.yaw;
      this.boat.rotation.z = Math.sin(this.t * 0.9) * 0.02;
      return;
    }

    this.at += dt * PACE;
    const last = RIVER_PATH.length - 3;
    if (this.at >= last) {
      this.at = null;
      useGame.getState().setRiding(false);
      useGame.getState().setEmmettNotice("The chocolate lake! Off you hop.");
      cap.x = this.land.x;
      cap.y = 0.64;
      cap.z = this.land.z;
      return;
    }
    const p = at(this.at);
    this.boat.position.set(p.x, 0.12 + Math.sin(this.t * 2.2) * 0.04, p.z);
    this.boat.rotation.y = Math.atan2(p.dx, p.dz);
    this.boat.rotation.z = Math.sin(this.t * 1.6) * 0.035;
    cap.x = p.x;
    cap.y = 1.05;
    cap.z = p.z;
  }
}
