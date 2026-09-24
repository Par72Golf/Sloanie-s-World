import * as THREE from "three";
import { sfx } from "./audio";
import type { AABB } from "./collision";
import { glowMaterial } from "./furniture";
import { boxGeo, cylGeo, lam, mesh, sphereGeo } from "./meshes";
import { makePet, animatePet, type PetKind, type PetRig } from "./pets";
import { candyHouseSpots } from "./sugar-home";
import { CANDY_HOME_SPOTS } from "./sugar-home-mesh";
import { anyFurnitureSolid, HOUSE_KITS } from "./furniture-kits";
import { useHome } from "./home-store";
import { CREATURE_SPOTS } from "./sugar-rush";
import { makeWalker, placeWalker, followHer, followLead, separateHerd, waitOffLava, LEAD_BACK, TRAIN_GAP, type Walker } from "./quest";
import { useGame } from "./store";

/**
 * The candy princess's three creatures, and the trouble each one is in.
 *
 * They are not three more things lying on the grass. Each is stuck, and each
 * is stuck in a way that asks her to do a different thing with the only three
 * verbs she has — walk, jump and Collect:
 *
 *   the jellybean puppy   is up a lollipop tree, so she has to CLIMB the
 *                         spiral of gumdrop steps round its trunk
 *   the marshmallow bunny is out in the bog, so she has to HOP the three
 *                         sinking pads before they go under
 *   the gummy bear        is set in a puddle of toffee, so she has to STOMP
 *                         on it until it cracks
 *
 * None of them can be failed. The bog pads sink and come back up, the toffee
 * keeps whatever cracks she has put in it, and nothing here can hurt her or
 * put her back anywhere. The worst that happens is she has another go.
 *
 * Once freed they follow her for good, in a little train, using the same
 * follow code Farmer Joe's pets use in park 1 (quest.ts).
 */

const CANDY = {
  amber: "#e8a33a",
  amberDeep: "#c9762a",
  mallow: "#f6f1e8",
  mallowPink: "#ffd4e6",
  bean: "#ff6aa8",
  toffee: "#c9924e",
  toffeeDark: "#a8762f",
  icing: "#f6f1e8",
  pink: "#ff6aa8",
  mint: "#6fe3c4",
  lilac: "#b06aff",
  red: "#e8384f",
  choc: "#6b4226",
};

const gloss = (c: string, roughness = 0.16) => lam(c, { flat: true, roughness });

export type CreatureId = "beanpuppy" | "mallowbunny" | "gummybear";

export const CREATURES: {
  id: CreatureId;
  name: string;
  kind: PetKind;
  coat: string;
  at: [number, number];
  region: string;
  hint: string;
}[] = [
  {
    id: "beanpuppy",
    name: "the jellybean puppy",
    kind: "puppy",
    coat: CANDY.bean,
    at: CREATURE_SPOTS[0]!,
    region: "the Lollipop Forest",
    hint: "He is up a lollipop tree in the woods and cannot get down.",
  },
  {
    id: "mallowbunny",
    name: "the marshmallow bunny",
    kind: "bunny",
    coat: CANDY.mallow,
    at: CREATURE_SPOTS[1]!,
    region: "Marshmallow Fields",
    hint: "She is stuck out in the middle of the marshmallow bog.",
  },
  {
    id: "gummybear",
    name: "the gummy bear",
    kind: "puppy",
    coat: CANDY.amber,
    at: CREATURE_SPOTS[2]!,
    region: "Gumdrop Meadow",
    hint: "He is set fast in a puddle of toffee out on the meadow. Jump on the toffee to crack it.",
  },
];

/** How near she has to be to pick one up. */
export const FREE_R = 2.2;
/** and to the basket by her door to send them in, or call them back out */
const BASKET_R = 2.4;

/**
 * Where they curl up indoors, in her room's frame. All three are in the
 * bedroom round the rug, which is the one room she has from the start: a pet
 * that only appears once she has bought the third upgrade is a pet she does
 * not believe lives there.
 */
const INDOORS: [number, number, number][] = [
  [-1.9, 0, 1.7],
  [1.5, 0, 2.0],
  [2.4, 0, -0.6],
];

/**
 * And while she is outside, which is nearly always: in and round the basket by
 * her door, the one she left them at, relative to the basket. The first real
 * play left them at home and never saw them again — the room is 150m up, so
 * a creature that only lives there has simply vanished from the park.
 */
const BY_BASKET: [number, number, number][] = [
  [0, 0.38, 0],
  [1.35, 0, 0.5],
  [-1.3, 0, 0.6],
];

/* ------------------------------------------------------------- the rigs */

/**
 * Make a pet look like a sweet: every material it draws with, cloned so the
 * park's shared cache is untouched, and given the wet look confectionery has.
 * The park's default roughness on a pet reads as felt.
 */
function candify(rig: PetRig, roughness = 0.18) {
  const swapped = new Map<THREE.Material, THREE.Material>();
  rig.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const out = mats.map((mat) => {
      let c = swapped.get(mat);
      if (!c) {
        c = (mat as THREE.MeshStandardMaterial).clone();
        (c as THREE.MeshStandardMaterial).roughness = roughness;
        swapped.set(mat, c);
      }
      return c;
    });
    m.material = Array.isArray(m.material) ? out : out[0]!;
  });
}

/**
 * The gummy bear, built on the puppy: round ears instead of folded ones and
 * no tail, which between them is the whole difference in silhouette. Writing
 * a fourth pet kind would mean touching park 1's pet list, and a bear is a
 * puppy with different ears.
 */
function bearify(rig: PetRig) {
  for (const ear of rig.ears) {
    ear.clear();
    const disc = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), gloss(CANDY.amberDeep));
    disc.scale.z = 0.55;
    ear.add(disc);
  }
  for (const t of rig.tail) t.visible = false;
  // a gummy bear is a chunky thing
  rig.torsoScale.set(rig.torsoScale.x * 1.12, rig.torsoScale.y * 1.1, rig.torsoScale.z * 1.05);
}

/**
 * Park 1's pets are sized to be looked at from a metre away at Farmer Joe's.
 * These have to be spotted from a path across a field, so they are a third
 * bigger. The rig scales as a whole, so every animation still lands.
 */
const CREATURE_SCALE = 1.35;

function makeCreature(def: (typeof CREATURES)[number]): PetRig {
  const rig = makePet(def.kind, def.coat);
  if (def.id === "gummybear") bearify(rig);
  candify(rig, def.id === "mallowbunny" ? 0.72 : 0.16);
  rig.group.scale.setScalar(CREATURE_SCALE);
  return rig;
}

/* ------------------------------------------------ the three predicaments */

/** A solid box added to the world, and remembered so it can be taken away. */
type Solid = AABB & { label: string };

const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, label: string): Solid => ({
  minX: x - sx / 2,
  maxX: x + sx / 2,
  minY: y,
  maxY: y + sy,
  minZ: z - sz / 2,
  maxZ: z + sz / 2,
  label,
});

/**
 * The lollipop tree the puppy is up: a trunk, a spiral of gumdrop treads and a
 * wide platform at the top.
 *
 * Every tread is a block standing on the ground, never a slab floating over a
 * hole, so there is nothing under the stair to fall into. The first cut of it
 * put the treads 1.9m apart, which made the climb nine jumps in a row — and
 * missing the eighth after making seven is the sort of thing that ends a
 * game. They touch now, so she walks up.
 */
export const CLIMB = {
  steps: 12,
  /** each tread is this much above the one before, against the 0.62m she can step */
  rise: 0.42,
  /** the radius the treads sit on, and how wide each one is */
  ring: 2.3,
  tread: 1.24,
  /** how far round the trunk the stair goes */
  sweep: Math.PI * 2,
} as const;

/** Where tread `i` stands, in the tree's frame. */
export function treadAt(i: number): { x: number; z: number; top: number } {
  const a = (i / CLIMB.steps) * CLIMB.sweep;
  return { x: Math.cos(a) * CLIMB.ring, z: Math.sin(a) * CLIMB.ring, top: (i + 1) * CLIMB.rise };
}

function climbTree(x: number, z: number, solids: Solid[]): { group: THREE.Group; top: number } {
  const g = new THREE.Group();
  const STEPS = CLIMB.steps;
  const RISE = CLIMB.rise;
  const R = CLIMB.ring;
  g.add(mesh(cylGeo, CANDY.icing, 0.34, STEPS * RISE + 1.4, 0.34, x, (STEPS * RISE + 1.4) / 2, z));
  void R;
  solids.push(box(x, 0, z, 0.68, STEPS * RISE + 1.4, 0.68, "lollipop trunk"));
  const drops = [CANDY.pink, CANDY.mint, CANDY.lilac, CANDY.red, "#ffc83a", "#ff8a3a"];
  for (let i = 0; i < STEPS; i++) {
    const t = treadAt(i);
    const sx = x + t.x;
    const sz = z + t.z;
    const top = t.top;
    // the step is a gumdrop standing on the ground, so there is nothing under
    // it to fall into, and its collider is the block it is drawn as
    const h = top;
    const drop = new THREE.Mesh(new THREE.CylinderGeometry(CLIMB.tread / 2, CLIMB.tread / 2 + 0.1, h, 12), gloss(drops[i % drops.length]!, 0.2));
    drop.position.set(sx, h / 2, sz);
    drop.castShadow = true;
    drop.receiveShadow = true;
    g.add(drop);
    solids.push(box(sx, 0, sz, CLIMB.tread, h, CLIMB.tread, "gumdrop step"));
  }
  const topY = STEPS * RISE;
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.34, 20), gloss(CANDY.pink, 0.2));
  deck.position.set(x, topY + 0.17, z);
  deck.receiveShadow = true;
  g.add(deck);
  solids.push(box(x, topY, z, 4.2, 0.34, 4.2, "lollipop deck"));
  // the swirl above, drawn only: she is standing under it, not on it
  const swirl = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.1, 0.5, 22), gloss(CANDY.red, 0.2));
  swirl.position.set(x, topY + 3.1, z);
  g.add(swirl);
  const eye = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.28, 6, 22), gloss(CANDY.icing, 0.2));
  eye.rotation.x = Math.PI / 2;
  eye.position.set(x, topY + 3.37, z);
  g.add(eye);
  return { group: g, top: topY + 0.34 };
}

/** One pad of the bog: a marshmallow that goes down while she stands on it. */
type Pad = { mesh: THREE.Mesh; solid: Solid; x: number; z: number; sunk: number };

/**
 * The bog: a soft round hollow with three pads across it and an island in the
 * middle. A pad carries her for about a second and a half and then it is
 * under; step off and it comes back up. Going under is not a fall — the bog
 * floor is 40cm down and she walks out of it — so the only cost of getting it
 * wrong is doing it again.
 */
function bog(x: number, z: number, solids: Solid[]): { group: THREE.Group; pads: Pad[]; island: number } {
  const g = new THREE.Group();
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(7.4, 7.4, 0.12, 28), lam("#ffeaf3", { flat: true, roughness: 0.9 }));
  dish.position.set(x, 0.06, z);
  dish.receiveShadow = true;
  g.add(dish);
  // sugar dusted round the rim, so the edge of the bog reads from a distance
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    g.add(mesh(sphereGeo, CANDY.mallowPink, 0.36, 0.22, 0.36, x + Math.cos(a) * 7.3, 0.1, z + Math.sin(a) * 7.3, false));
  }
  const pads: Pad[] = [];
  for (let i = 0; i < 3; i++) {
    const t = (i + 1) / 4;
    const px = x + Math.cos(Math.PI * 1.15) * 7.4 * (1 - t);
    const pz = z + Math.sin(Math.PI * 1.15) * 7.4 * (1 - t);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.25, 0.6, 16), lam(CANDY.mallow, { flat: true, roughness: 0.82 }));
    m.position.set(px, 0.3, pz);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    const solid = box(px, 0, pz, 2.6, 0.6, 2.6, "bog pad");
    solids.push(solid);
    pads.push({ mesh: m, solid, x: px, z: pz, sunk: 0 });
  }
  // pink, not white: a marshmallow bunny on a marshmallow island is an island
  const isl = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.8, 0.62, 18), lam(CANDY.mallowPink, { flat: true, roughness: 0.82 }));
  isl.position.set(x, 0.31, z);
  isl.castShadow = true;
  isl.receiveShadow = true;
  g.add(isl);
  solids.push(box(x, 0, z, 3.7, 0.62, 3.7, "bog island"));
  return { group: g, pads, island: 0.62 };
}

/**
 * The basket by her front door: a wafer bed with a cushion in it. Standing at
 * it with creatures at her heels sends them inside to live; standing at it
 * with them indoors calls them back out. One object, one press, right next to
 * the door she already knows.
 */
function makeBasket(): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.8, 0.3, 16), gloss(CANDY.toffee, 0.4));
  base.position.y = 0.15;
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.11, 6, 20), gloss(CANDY.toffeeDark, 0.35));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.3;
  g.add(rim);
  const cushion = new THREE.Mesh(new THREE.SphereGeometry(0.72, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), lam(CANDY.mallowPink, { flat: true, roughness: 0.8 }));
  cushion.scale.y = 0.3;
  cushion.position.y = 0.3;
  g.add(cushion);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.add(mesh(sphereGeo, [CANDY.pink, CANDY.mint, CANDY.lilac, CANDY.red, "#ffc83a"][i]!, 0.1, 0.12, 0.1, Math.cos(a) * 0.9, 0.42, Math.sin(a) * 0.9, false));
  }
  return g;
}

/** The toffee the bear is set in, and the cracks she puts in it. */
function toffee(x: number, z: number): { group: THREE.Group; cracks: THREE.Object3D[] } {
  const g = new THREE.Group();
  const pool = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.25, 0.22, 24), gloss(CANDY.toffee, 0.1));
  pool.position.set(x, 0.11, z);
  pool.receiveShadow = true;
  g.add(pool);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.32, 0.16, 6, 26), gloss(CANDY.toffeeDark, 0.14));
  rim.rotation.x = Math.PI / 2;
  rim.position.set(x, 0.2, z);
  g.add(rim);
  // three cracks, shown one at a time as she stomps
  const cracks: THREE.Object3D[] = [];
  for (let i = 0; i < 3; i++) {
    const crack = new THREE.Group();
    const a = (i / 3) * Math.PI * 2 + 0.4;
    for (let j = 0; j < 4; j++) {
      const len = 0.9 + j * 0.5;
      const bar = mesh(boxGeo, "#8a5a1e", len, 0.05, 0.13, x + Math.cos(a + j * 0.42) * (0.5 + j * 0.55), 0.24, z + Math.sin(a + j * 0.42) * (0.5 + j * 0.55), false);
      bar.rotation.y = -(a + j * 0.42) + Math.PI / 2;
      crack.add(bar);
    }
    crack.visible = false;
    g.add(crack);
    cracks.push(crack);
  }
  return { group: g, cracks };
}

/* ------------------------------------------------------------- the world */

type Held = {
  def: (typeof CREATURES)[number];
  rig: PetRig;
  walker: Walker;
  /** the glowing ring under one that is still stuck */
  ring: THREE.Mesh;
  /** where it sits while stuck */
  home: [number, number, number];
};

export class CandyCreatures {
  private group = new THREE.Group();
  private held: Held[] = [];
  private pads: Pad[] = [];
  private cracks: THREE.Object3D[] = [];
  private stomps = 0;
  /** told her to jump on the toffee, so it is said once a visit, not every frame */
  private toldToStomp = false;
  private wasGrounded = true;
  private basket = makeBasket();
  private mySolids: Solid[] = [];
  private toffeeAt: [number, number] = [0, 0];

  constructor(
    private scene: THREE.Scene,
    private worldColliders: AABB[],
    private groundY = 0,
  ) {
    const solids: Solid[] = [];
    const tree = climbTree(CREATURES[0]!.at[0], CREATURES[0]!.at[1], solids);
    this.group.add(tree.group);
    const marsh = bog(CREATURES[1]!.at[0], CREATURES[1]!.at[1], solids);
    this.group.add(marsh.group);
    this.pads = marsh.pads;
    const tof = toffee(CREATURES[2]!.at[0], CREATURES[2]!.at[1]);
    this.group.add(tof.group);
    this.cracks = tof.cracks;
    this.toffeeAt = [CREATURES[2]!.at[0], CREATURES[2]!.at[1]];

    const perch: [number, number, number][] = [
      [CREATURES[0]!.at[0], tree.top, CREATURES[0]!.at[1]],
      [CREATURES[1]!.at[0], marsh.island, CREATURES[1]!.at[1]],
      // set in the toffee: down to his middle, which is why he cannot get out
      // and still high enough that she can see him from the path
      [CREATURES[2]!.at[0], 0.02, CREATURES[2]!.at[1]],
    ];

    CREATURES.forEach((def, i) => {
      const rig = makeCreature(def);
      const walker = makeWalker(rig, def.kind);
      const home = perch[i]!;
      placeWalker(walker, home[0], home[1], home[2]);
      this.group.add(rig.group);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.055, 8, 22), glowMaterial("#ffd84a", 1.1, 0.3));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(home[0], home[1] + 0.08, home[2]);
      this.group.add(ring);
      this.held.push({ def, rig, walker, ring, home });
    });

    /*
     * The basket, off the corner of her porch. Far enough from the doorstep
     * that the two never both answer a press: the door is offered within
     * 1.8m and the basket within 2.4m, and these stand 5.2m apart. The
     * builder's board is on the other side of the porch for the same reason.
     */
    const spots = candyHouseSpots();
    this.basket.position.set(spots.door[0] + 5.0, 0, spots.door[1] + 1.6);
    this.group.add(this.basket);

    this.mySolids = solids;
    this.worldColliders.push(...solids);
    scene.add(this.group);
  }

  dispose() {
    this.scene.remove(this.group);
    for (const s of this.mySolids) {
      const i = this.worldColliders.indexOf(s);
      if (i >= 0) this.worldColliders.splice(i, 1);
    }
    this.mySolids = [];
  }

  /** Which ones are still stuck, for the princess to talk about. */
  static stillStuck(freed: readonly string[]) {
    return CREATURES.filter((c) => !freed.includes(c.id));
  }

  /** The one she is standing next to and could pick up, if any. */
  private reachable(x: number, y: number, z: number) {
    const freed = useGame.getState().candyCreatures;
    for (const h of this.held) {
      if (freed.includes(h.def.id)) continue;
      const at = h.walker.cap;
      if (Math.hypot(x - at.x, z - at.z) < FREE_R && Math.abs(y - at.y) < 2.4) {
        // the bear will not come out until the toffee is cracked
        if (h.def.id === "gummybear" && this.stomps < 3) return null;
        return h;
      }
    }
    return null;
  }

  near(x: number, y: number, z: number) {
    return this.reachable(x, y, z) != null;
  }

  /** At the basket, with something to put in it or something to call out of it. */
  atBasket(x: number, y: number, z: number): "in" | "out" | null {
    const st = useGame.getState();
    if (!st.candyCreatures.length || y > 2) return null;
    const b = this.basket.position;
    if (Math.hypot(x - b.x, z - b.z) > BASKET_R) return null;
    const out = st.candyCreatures.filter((c) => !st.creaturesHome.includes(c));
    return out.length ? "in" : "out";
  }

  tryInteract(x: number, y: number, z: number): boolean {
    const basket = this.atBasket(x, y, z);
    if (basket) {
      sfx.click();
      const st = useGame.getState();
      for (const id of st.candyCreatures) st.setCreatureHome(id, basket === "in");
      st.setEmmettNotice(
        basket === "in"
          ? "They live here now! You'll find them inside, by the rug."
          : "They're coming with you again!",
      );
      return true;
    }
    const h = this.reachable(x, y, z);
    if (!h) return false;
    sfx.win();
    const st = useGame.getState();
    st.freeCreature(h.def.id);
    h.ring.visible = false;
    const left = CandyCreatures.stillStuck(useGame.getState().candyCreatures);
    if (left.length) {
      st.setEmmettNotice(`You got ${h.def.name}! ${left.length} still stuck — the princess knows where.`);
    } else {
      // the whole set, which is the end of her errand and worth paying for
      st.addTickets(20);
      st.setEmmettNotice(`You got ${h.def.name}! All three are yours now — 20 tickets from the princess.`);
    }
    return true;
  }

  update(
    dt: number,
    t: number,
    her: { x: number; y: number; z: number; yaw: number; speed: number },
    grounded: boolean,
    colliders: AABB[],
  ) {
    const st = useGame.getState();
    const freed = st.candyCreatures;

    // ---- the bog: a pad goes down while she is on it and comes back up after
    for (const pad of this.pads) {
      const on = grounded && Math.hypot(her.x - pad.x, her.z - pad.z) < 1.5 && her.y < 1.2;
      pad.sunk = Math.max(0, Math.min(1, pad.sunk + (on ? dt / 1.5 : -dt / 0.9)));
      const drop = pad.sunk * 0.62;
      pad.mesh.position.y = 0.3 - drop;
      pad.solid.maxY = 0.6 - drop;
    }

    // ---- the toffee: she cracks it by landing on it
    if (this.stomps < 3) {
      const over = Math.hypot(her.x - this.toffeeAt[0], her.z - this.toffeeAt[1]) < 2.4 && her.y < 1.4;
      /*
       * Walking up to the bear and pressing Collect does nothing until the
       * toffee is cracked, and a button that does nothing reads as broken. So
       * the first time she stands on the toffee, say what it wants: jump.
       */
      if (over && !this.toldToStomp) {
        this.toldToStomp = true;
        st.setEmmettNotice("He is stuck fast in the toffee. Jump on it to crack it!");
      } else if (!over && Math.hypot(her.x - this.toffeeAt[0], her.z - this.toffeeAt[1]) > 9) {
        this.toldToStomp = false;
      }
      if (over && grounded && !this.wasGrounded) {
        this.stomps++;
        sfx.boing();
        for (let i = 0; i < this.stomps; i++) this.cracks[i]!.visible = true;
        st.setEmmettNotice(
          this.stomps >= 3
            ? "The toffee cracked! Grab the gummy bear."
            : `Crack! ${3 - this.stomps} more good ${3 - this.stomps === 1 ? "stomp" : "stomps"} should do it.`,
        );
      }
    }
    this.wasGrounded = grounded;

    // ---- the creatures themselves
    let lead: Walker | null = null;
    const train: Walker[] = [];
    for (const h of this.held) {
      const out = freed.includes(h.def.id);
      h.ring.visible = !out;
      if (!out) {
        // stuck: sit where they are, looking at her
        h.walker.heading = Math.atan2(her.x - h.walker.cap.x, her.z - h.walker.cap.z);
        h.walker.mode = h.def.id === "gummybear" && this.stomps > 0 ? "happy" : "sit";
        h.rig.group.position.set(h.home[0], h.home[1], h.home[2]);
        h.rig.group.rotation.y = h.walker.heading;
        animatePet(h.rig, h.walker.mode, 0, t, dt);
        continue;
      }
      if (st.creaturesHome.includes(h.def.id)) {
        // Living at home. Inside (her room is 150m above the house) they are
        // round the rug, the first of them in the pet bed once she has one;
        // outside they are curled up in and beside the basket by her door.
        const slot = st.creaturesHome.indexOf(h.def.id);
        const room = candyHouseSpots().room;
        h.rig.group.visible = true;
        if (her.y > room[1] - 20) {
          const home = useHome.getState();
          const bed = CANDY_HOME_SPOTS.petbed;
          if (slot === 0 && home.stage >= bed.stage) {
            const id = home.placed.petbed ?? HOUSE_KITS.candy.starters().petbed;
            const top = (id && anyFurnitureSolid(id)?.h) || 0.3;
            h.rig.group.position.set(room[0] + bed.pos[0], room[1] + Math.min(top, 0.5), room[2] + bed.pos[2]);
          } else {
            const at = INDOORS[slot % INDOORS.length]!;
            h.rig.group.position.set(room[0] + at[0], room[1] + at[1], room[2] + at[2]);
          }
        } else {
          const b = this.basket.position;
          const at = BY_BASKET[slot % BY_BASKET.length]!;
          h.rig.group.position.set(b.x + at[0], at[1], b.z + at[2]);
        }
        h.rig.group.rotation.y = Math.atan2(her.x - h.rig.group.position.x, her.z - h.rig.group.position.z);
        animatePet(h.rig, "sit", 0, t, dt);
        continue;
      }
      h.rig.group.visible = true;
      // the first walks a slot behind her, the rest in its wake
      h.walker.mode =
        waitOffLava(h.walker, train.length, her, dt, colliders, this.groundY) ??
        (lead ? followLead(h.walker, lead, her, dt, colliders, this.groundY) : followHer(h.walker, her, LEAD_BACK, 0, dt, colliders, this.groundY));
      lead = h.walker;
      train.push(h.walker);
    }
    if (train.length > 1) separateHerd(train, her);
    for (const h of this.held) {
      if (!freed.includes(h.def.id) || st.creaturesHome.includes(h.def.id)) continue;
      h.rig.group.position.set(h.walker.cap.x, h.walker.cap.y, h.walker.cap.z);
      h.rig.group.rotation.y = h.walker.heading;
      animatePet(h.rig, h.walker.mode, h.walker.speed, t, dt);
    }
    void TRAIN_GAP;
  }
}
