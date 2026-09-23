import * as THREE from "three";
import { sfx } from "./audio";
import type { AABB } from "./collision";
import { glowMaterial } from "./furniture";
import { boxGeo, cylGeo, lam, mesh, signBoard, sphereGeo } from "./meshes";
import { SUGAR } from "./sugar-rush";
import { useGame } from "./store";

/**
 * The cupcake carousel, on its own green through the fairground's north arch.
 *
 * Park 1 has a carousel, but it is written at park 1's coordinates with a gold
 * ring to grab and a prize hanging off it, and porting all of that would have
 * brought the whole carnival with it. This is a plainer thing built for this
 * park: six cupcakes on a turning floor, rising and falling, for half a
 * minute. No ring, no prize, nothing to win. Some rides are only rides.
 *
 * She rides it the way she rides the boat and the wheel: her capsule is
 * stamped onto the seat after the physics has run, so nothing about her
 * movement code has to know this exists.
 */

const C = {
  icing: "#f6f1e8",
  cream: "#f7ead3",
  wafer: "#e8b86a",
  choc: "#6b4226",
  cane: "#e8384f",
  pink: "#ff6aa8",
  blush: "#ff93c4",
  mint: "#6fe3c4",
  lilac: "#b06aff",
  sun: "#ffc83a",
  orange: "#ff8a3a",
  cherry: "#d6253f",
};

const gloss = (c: string, roughness = 0.2) => lam(c, { flat: true, roughness });

/** Where it stands, and how big it is. */
export const CAROUSEL = {
  x: SUGAR.fair.x,
  z: SUGAR.fair.z + 32,
  /** the turning floor */
  floor: 5.0,
  floorTop: 0.45,
  /** the ring the cupcakes sit on */
  seats: 3.4,
  count: 6,
  /** the canopy */
  roof: 5.6,
  roofY: 4.3,
  /** where she stands to get on, as a distance out from the middle */
  standD: 7.0,
  seconds: 34,
} as const;

export const NEAR_R = 2.4;
/** a full turn every so many seconds */
const TURN = 11;

/** One cupcake seat: a fluted case, a swirl of frosting and a cherry. */
function makeCupcake(colour: string): THREE.Group {
  const g = new THREE.Group();
  const caseGeo = new THREE.CylinderGeometry(0.72, 0.52, 0.72, 14);
  const cup = new THREE.Mesh(caseGeo, gloss(C.icing, 0.4));
  cup.position.y = 0.36;
  cup.castShadow = true;
  g.add(cup);
  // the flutes: thin bars round the case, which is what makes it a cupcake
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const flute = mesh(boxGeo, C.blush, 0.1, 0.72, 0.1, Math.cos(a) * 0.62, 0.36, Math.sin(a) * 0.62, false);
    flute.rotation.y = -a;
    g.add(flute);
  }
  // the frosting she sits in: a scooped seat rather than a dome
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.7, 0.3, 14), gloss(colour, 0.25));
  seat.position.y = 0.86;
  seat.castShadow = true;
  g.add(seat);
  const back = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.16, 6, 18, Math.PI * 1.15), gloss(colour, 0.25));
  back.rotation.x = -Math.PI / 2;
  back.rotation.z = Math.PI * 0.42;
  back.position.y = 1.12;
  g.add(back);
  g.add(mesh(sphereGeo, C.cherry, 0.16, 0.16, 0.16, 0, 1.3, -0.5, false));
  // sprinkles round the frosting
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const s = mesh(boxGeo, [C.mint, C.sun, C.lilac, C.cane][i % 4]!, 0.09, 0.05, 0.05, Math.cos(a) * 0.62, 1.0, Math.sin(a) * 0.62, false);
    s.rotation.y = -a;
    g.add(s);
  }
  return g;
}

export class CarouselRide {
  private group = new THREE.Group();
  private turner = new THREE.Group();
  private seats: THREE.Group[] = [];
  private ring: THREE.Mesh;
  private solids: (AABB & { label: string })[] = [];
  private t = 0;
  private spin = 0;
  /** which seat she is in, or null */
  private seat: number | null = null;
  private left = 0;

  constructor(
    private scene: THREE.Scene,
    private worldColliders: AABB[],
  ) {
    const { x, z } = CAROUSEL;

    // a cream apron, so it does not stand on bare grass
    const apron = new THREE.Mesh(new THREE.CylinderGeometry(CAROUSEL.floor + 2.6, CAROUSEL.floor + 2.6, 0.1, 30), lam(C.cream, { flat: true, roughness: 0.85 }));
    apron.position.set(x, 0.05, z);
    apron.receiveShadow = true;
    this.group.add(apron);

    // the turning floor: solid, and low enough to step onto
    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(CAROUSEL.floor, CAROUSEL.floor - 0.2, CAROUSEL.floorTop, 28),
      gloss(C.wafer, 0.5),
    );
    floor.position.y = CAROUSEL.floorTop / 2;
    floor.receiveShadow = true;
    this.turner.add(floor);
    const kerb = new THREE.Mesh(new THREE.TorusGeometry(CAROUSEL.floor - 0.06, 0.13, 6, 30), gloss(C.cane, 0.3));
    kerb.rotation.x = Math.PI / 2;
    kerb.position.y = CAROUSEL.floorTop;
    this.turner.add(kerb);
    this.solids.push({
      minX: x - CAROUSEL.floor,
      maxX: x + CAROUSEL.floor,
      minY: 0,
      maxY: CAROUSEL.floorTop,
      minZ: z - CAROUSEL.floor,
      maxZ: z + CAROUSEL.floor,
      label: "carousel floor",
    });

    // the centre column, a stick of rock
    const bands = 10;
    for (let i = 0; i < bands; i++) {
      const seg = CAROUSEL.roofY / bands;
      this.turner.add(mesh(cylGeo, i % 2 ? C.cane : C.icing, 0.42, seg, 0.42, 0, seg * (i + 0.5), 0));
    }
    this.solids.push({
      minX: x - 0.45,
      maxX: x + 0.45,
      minY: 0,
      maxY: CAROUSEL.roofY,
      minZ: z - 0.45,
      maxZ: z + 0.45,
      label: "carousel column",
    });

    // the canopy: a fluted cupcake case upside down, scalloped round the edge
    const roof = new THREE.Mesh(new THREE.ConeGeometry(CAROUSEL.roof, 1.5, 24), gloss(C.pink, 0.3));
    roof.position.y = CAROUSEL.roofY + 0.75;
    this.turner.add(roof);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      this.turner.add(
        mesh(sphereGeo, i % 2 ? C.icing : C.blush, 0.36, 0.3, 0.36, Math.cos(a) * CAROUSEL.roof, CAROUSEL.roofY, Math.sin(a) * CAROUSEL.roof, false),
      );
    }
    this.turner.add(mesh(sphereGeo, C.cherry, 0.42, 0.42, 0.42, 0, CAROUSEL.roofY + 1.7, 0, false));

    // the cupcakes, each on its own pole
    const colours = [C.pink, C.mint, C.lilac, C.sun, C.orange, C.blush];
    for (let i = 0; i < CAROUSEL.count; i++) {
      const a = (i / CAROUSEL.count) * Math.PI * 2;
      const holder = new THREE.Group();
      holder.position.set(Math.cos(a) * CAROUSEL.seats, CAROUSEL.floorTop, Math.sin(a) * CAROUSEL.seats);
      holder.rotation.y = -a;
      const pole = mesh(cylGeo, C.icing, 0.07, CAROUSEL.roofY - CAROUSEL.floorTop, 0.07, 0, (CAROUSEL.roofY - CAROUSEL.floorTop) / 2, 0, false);
      holder.add(pole);
      const cake = makeCupcake(colours[i % colours.length]!);
      cake.position.y = 0.5;
      holder.add(cake);
      this.turner.add(holder);
      this.seats.push(cake);
    }

    this.turner.position.set(x, 0, z);
    this.group.add(this.turner);

    const sign = signBoard("Cupcake Carousel", 4.4, 0.82);
    sign.position.set(x, 2.6, z + CAROUSEL.standD - 0.6);
    sign.rotation.y = Math.PI;
    this.group.add(sign);

    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.06, 8, 26), glowMaterial("#ffd84a", 1.1, 0.3));
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.set(x, 0.16, z + CAROUSEL.standD);
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
    return this.seat != null;
  }

  /** The way her cupcake is travelling round, for her to face. */
  facing: [number, number] | null = null;

  near(x: number, y: number, z: number) {
    if (this.riding) return false;
    return y < 2.2 && Math.hypot(x - CAROUSEL.x, z - (CAROUSEL.z + CAROUSEL.standD)) < NEAR_R;
  }

  tryInteract(x: number, y: number, z: number) {
    if (!this.near(x, y, z)) return false;
    sfx.click();
    // whichever cupcake is nearest the way in, so she is not swung round to
    // the back of the ride before it starts
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.seats.length; i++) {
      const p = new THREE.Vector3();
      this.seats[i]!.getWorldPosition(p);
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    this.seat = best;
    this.left = CAROUSEL.seconds;
    useGame.getState().setRiding(true);
    useGame.getState().setEmmettNotice("Round and round on the cupcakes!");
    return true;
  }

  /** Turn the ride, and carry the passenger. Called from the physics step, before she is placed. */
  update(dt: number, cap: { x: number; y: number; z: number }) {
    if (!(dt > 0)) return;
    this.t += dt;
    this.ring.visible = !this.riding;
    this.ring.rotation.z = this.t * 0.6;

    // it turns whether or not she is on it, slowly when idle: a fairground
    // ride standing dead still reads as broken
    const pace = this.riding ? (Math.PI * 2) / TURN : (Math.PI * 2) / (TURN * 3.2);
    this.spin += dt * pace;
    this.turner.rotation.y = this.spin;

    // the cupcakes rise and fall, each a little behind the one before
    this.seats.forEach((cake, i) => {
      const phase = (i / this.seats.length) * Math.PI * 2;
      cake.position.y = 0.5 + Math.sin(this.t * 1.5 + phase) * (this.riding ? 0.42 : 0.16);
    });

    if (this.seat == null) return;
    this.left -= dt;
    const cake = this.seats[this.seat]!;
    const p = new THREE.Vector3();
    cake.getWorldPosition(p);
    cap.x = p.x;
    cap.y = p.y + 0.55;
    cap.z = p.z;
    // round the ride's centre, the way it turns
    this.facing = [p.z - CAROUSEL.z, -(p.x - CAROUSEL.x)];
    if (this.left <= 0) {
      this.seat = null;
      this.facing = null;
      useGame.getState().setRiding(false);
      useGame.getState().setEmmettNotice("Off you get! Ride again whenever you like.");
      cap.x = CAROUSEL.x;
      cap.y = 0.2;
      cap.z = CAROUSEL.z + CAROUSEL.standD;
    }
  }
}
