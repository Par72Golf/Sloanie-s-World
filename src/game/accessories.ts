import * as THREE from "three";
import { beveledBox } from "./beveled";
import { lam } from "./meshes";

/**
 * Accessories: things to find around the park and wear.
 *
 * Each has a slot; one item per slot at a time. Pickups are the same mesh
 * floating over a glowing ring. Worn items attach to Sloan's head or torso
 * group and are tagged so applyWorn can strip them before re-dressing her.
 *
 * Positions are in the head group's frame (head centre ~ (0, 0.32, 0.03),
 * hair top ~ 0.6) or the torso group's frame (shoulders ~ y 0.44).
 */

export type AccessoryId =
  | "sunglasses"
  | "partyhat"
  | "bow"
  | "backpack"
  | "flowercrown"
  | "crown"
  // carnival prizes
  | "balloon"
  | "duckhat"
  | "starglasses"
  | "unicorn"
  | "teddy"
  // prize booth shop
  | "catears"
  | "wings"
  | "heartglasses"
  | "tiara"
  | "cape"
  | "bunnyears"
  // held in her right hand
  | "wand"
  | "lollipop"
  | "cottoncandy"
  | "pinwheel";
export type Slot = "head" | "hair" | "face" | "back" | "hand";

export type AccessoryDef = {
  id: AccessoryId;
  name: string;
  slot: Slot;
  /** shown on the wardrobe card before it is found */
  hint: string;
  /** true for items awarded rather than found */
  reward?: string;
};

export const ACCESSORIES: AccessoryDef[] = [
  { id: "sunglasses", name: "Sunglasses", slot: "face", hint: "Somewhere splashy." },
  { id: "partyhat", name: "Party hat", slot: "head", hint: "Where the tennis balls fly." },
  { id: "bow", name: "Big bow", slot: "hair", hint: "By the sandbox." },
  { id: "backpack", name: "Backpack", slot: "back", hint: "Out on the ball field." },
  { id: "flowercrown", name: "Flower crown", slot: "head", hint: "By the hammock at the campground." },
  { id: "crown", name: "Golden crown", slot: "head", hint: "Find every dumpling in the park.", reward: "every dumpling in the park" },
  { id: "balloon", name: "Heart balloon", slot: "hand", hint: "Win at Ring Toss.", reward: "Ring Toss" },
  { id: "duckhat", name: "Duck hat", slot: "head", hint: "Win at the Duck Pond.", reward: "the Duck Pond" },
  { id: "starglasses", name: "Star glasses", slot: "face", hint: "Win at Whack-a-Mole.", reward: "Whack-a-Mole" },
  // a head item, not hair: it sits where the hats do, so it swaps with them
  { id: "unicorn", name: "Unicorn headband", slot: "head", hint: "Grab the gold ring on the carousel.", reward: "the carousel" },
  { id: "teddy", name: "Giant teddy", slot: "back", hint: "Win every carnival game.", reward: "the prize booth" },
  { id: "catears", name: "Cat ears", slot: "head", hint: "Buy it at the prize booth.", reward: "the prize booth shop" },
  { id: "wings", name: "Butterfly wings", slot: "back", hint: "Buy it at the prize booth.", reward: "the prize booth shop" },
  { id: "heartglasses", name: "Heart glasses", slot: "face", hint: "Buy it at the prize booth.", reward: "the prize booth shop" },
  { id: "tiara", name: "Sparkly tiara", slot: "head", hint: "Buy it at the prize booth.", reward: "the prize booth shop" },
  { id: "cape", name: "Hero cape", slot: "back", hint: "Buy it at the prize booth.", reward: "the prize booth shop" },
  { id: "bunnyears", name: "Bunny ears", slot: "head", hint: "Buy it at the prize booth.", reward: "the prize booth shop" },
  { id: "wand", name: "Star wand", slot: "hand", hint: "Buy it at the prize booth.", reward: "the prize booth shop" },
  { id: "lollipop", name: "Giant lollipop", slot: "hand", hint: "Buy it at the prize booth.", reward: "the prize booth shop" },
  { id: "cottoncandy", name: "Cotton candy", slot: "hand", hint: "Buy it at the prize booth.", reward: "the prize booth shop" },
  { id: "pinwheel", name: "Pinwheel", slot: "hand", hint: "Buy it at the prize booth.", reward: "the prize booth shop" },
];

export const SLOTS: Slot[] = ["head", "hair", "face", "back", "hand"];

export type Worn = Record<Slot, AccessoryId | null>;

export const NOTHING_WORN: Worn = { head: null, hair: null, face: null, back: null, hand: null };

export function accessory(id: AccessoryId): AccessoryDef {
  return ACCESSORIES.find((a) => a.id === id)!;
}

const flat = (c: string, roughness = 0.5) => lam(c, { flat: true, roughness });
const sphereGeo = new THREE.SphereGeometry(1, 14, 12);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
const coneGeo = new THREE.ConeGeometry(1, 1, 12);
const ringGeo = new THREE.TorusGeometry(1, 0.08, 8, 24);

function box(color: string, sx: number, sy: number, sz: number, x: number, y: number, z: number, roughness = 0.5) {
  const m = new THREE.Mesh(beveledBox(sx, sy, sz), flat(color, roughness));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
function ball(color: string, r: number, x: number, y: number, z: number, sy = r, sz = r) {
  const m = new THREE.Mesh(sphereGeo, flat(color));
  m.scale.set(r, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// ---- prize booth shop items: cached geometry and materials ---------------

/** A flat material that renders both faces, for open shells like the cape. */
const sidedMats = new Map<string, THREE.Material>();
function sided(color: string, roughness = 0.5) {
  const key = `${color}|${roughness}`;
  let m = sidedMats.get(key);
  if (!m) {
    m = flat(color, roughness).clone();
    m.side = THREE.DoubleSide;
    sidedMats.set(key, m);
  }
  return m;
}

/** An extruded 2D shape, centred on z so it pokes out evenly both sides. */
function slab(shape: THREE.Shape, depth: number, curveSegments = 10) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

// half-torus headband that hooks over the top of her head (cat, bunny ears)
const headbandGeo = new THREE.TorusGeometry(1, 0.07, 8, 24, Math.PI);

// cat ear: a chunky triangle with a rounded tip, base on y = 0
const catEarShape = (w: number, h: number) => {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(-w * 0.12, h * 0.9);
  s.quadraticCurveTo(0, h * 1.05, w * 0.12, h * 0.9);
  s.lineTo(w / 2, 0);
  s.closePath();
  return s;
};
const catEarGeo = slab(catEarShape(0.2, 0.2), 0.04);
const catEarInnerGeo = slab(catEarShape(0.12, 0.13), 0.02);

// heart lens, roughly centred on the origin, 0.18 wide
const heartShape = new THREE.Shape();
heartShape.moveTo(0, -0.08);
heartShape.bezierCurveTo(-0.02, -0.05, -0.09, -0.02, -0.09, 0.03);
heartShape.bezierCurveTo(-0.09, 0.08, -0.035, 0.095, 0, 0.05);
heartShape.bezierCurveTo(0.035, 0.095, 0.09, 0.08, 0.09, 0.03);
heartShape.bezierCurveTo(0.09, -0.02, 0.02, -0.05, 0, -0.08);
const heartGeo = new THREE.ExtrudeGeometry(heartShape, { depth: 0.02, bevelEnabled: false, curveSegments: 8 });

// butterfly wings, root at the origin, reaching out along +x
const upperWingShape = new THREE.Shape();
upperWingShape.moveTo(0, 0);
upperWingShape.bezierCurveTo(0.06, 0.34, 0.44, 0.48, 0.44, 0.24);
upperWingShape.bezierCurveTo(0.44, 0.04, 0.22, -0.03, 0, 0);
const lowerWingShape = new THREE.Shape();
lowerWingShape.moveTo(0, 0);
lowerWingShape.bezierCurveTo(0.26, 0.02, 0.36, -0.2, 0.24, -0.3);
lowerWingShape.bezierCurveTo(0.12, -0.38, 0.0, -0.2, 0, 0);
const upperWingGeo = slab(upperWingShape, 0.02, 12);
const lowerWingGeo = slab(lowerWingShape, 0.02, 12);

// five-point star, flat on z, used on the cape
const starShape = new THREE.Shape();
for (let i = 0; i < 10; i++) {
  const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
  const r = i % 2 === 0 ? 0.1 : 0.045;
  if (i === 0) starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  else starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
}
starShape.closePath();
const capeStarGeo = new THREE.ExtrudeGeometry(starShape, { depth: 0.015, bevelEnabled: false });

// Cape: a subdivided plane bent in the torso frame. Top edge at the shoulders
// (y 0.5) close to her back, flaring wider and further back to just above the
// skirt hem, with the side edges wrapping forward around her body.
const CAPE_TOP = 0.5;
const CAPE_BOTTOM = -0.02;
const capeGeo = (() => {
  const geo = new THREE.PlaneGeometry(1, 1, 8, 8);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) + 0.5; // 0 left .. 1 right
    const v = pos.getY(i) + 0.5; // 0 bottom .. 1 top
    const halfW = 0.26 + (0.17 - 0.26) * v;
    const x = (u - 0.5) * 2 * halfW;
    const y = CAPE_BOTTOM + v * (CAPE_TOP - CAPE_BOTTOM);
    const across = (u - 0.5) * 2;
    const z = -0.27 + 0.095 * v + across * across * 0.045 + Math.sin(u * Math.PI * 3) * 0.012 * (1 - v);
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
})();
const capeStrapGeo = new THREE.TorusGeometry(1, 0.15, 6, 14, Math.PI);

// ---- held items: cached geometry --------------------------------------------
// Built in the frame of her right hand (origin = hand centre, arm running up
// +y from it). Sticks lean forward (+z) off the fist so they clear her forearm.

const wandStarGeo = slab(starShape, 0.045);

/** Archimedean spiral in the xy plane, for the lollipop swirl. */
class SpiralCurve extends THREE.Curve<THREE.Vector3> {
  constructor(
    private turns: number,
    private r0: number,
    private r1: number,
  ) {
    super();
  }
  override getPoint(t: number, target = new THREE.Vector3()) {
    const a = t * this.turns * Math.PI * 2;
    const r = this.r0 + (this.r1 - this.r0) * t;
    return target.set(Math.cos(a) * r, Math.sin(a) * r, 0);
  }
}
const LOLLY_R = 0.17;
const lollySwirlGeo = new THREE.TubeGeometry(new SpiralCurve(2.6, 0.012, LOLLY_R - 0.02), 160, 0.016, 6, false);

// pinwheel blade: a chunky curled petal from the hub out to one corner
const bladeShape = new THREE.Shape();
bladeShape.moveTo(0, 0);
bladeShape.lineTo(-0.03, 0.17);
bladeShape.quadraticCurveTo(0.1, 0.18, 0.14, 0.07);
bladeShape.closePath();
const pinwheelBladeGeo = slab(bladeShape, 0.014, 8);

/** The item as worn: built in the frame of the group it attaches to. */
export function makeAccessory(id: AccessoryId): { mesh: THREE.Group; attach: "head" | "torso" | "hand" } {
  const g = new THREE.Group();
  g.userData.accessory = id;
  switch (id) {
    case "sunglasses": {
      const dark = "#1a1a1e";
      for (const s of [-1, 1]) {
        g.add(box(dark, 0.11, 0.075, 0.02, s * 0.1, 0.32, 0.285, 0.15));
        g.add(box(dark, 0.02, 0.014, 0.26, s * 0.21, 0.335, 0.16, 0.3));
      }
      g.add(box(dark, 0.05, 0.014, 0.014, 0, 0.335, 0.292, 0.3));
      return { mesh: g, attach: "head" };
    }
    case "partyhat": {
      const hat = new THREE.Mesh(coneGeo, flat("#4f93c4", 0.45));
      hat.scale.set(0.15, 0.36, 0.15);
      hat.position.set(0.02, 0.8, -0.02);
      hat.rotation.z = -0.12;
      hat.castShadow = true;
      g.add(hat);
      // stripes as thin rings up the cone
      for (let i = 0; i < 3; i++) {
        const r = new THREE.Mesh(ringGeo, flat("#ffc53d", 0.45));
        const k = 0.11 - i * 0.03;
        r.scale.set(k, k, k);
        r.rotation.x = Math.PI / 2;
        r.position.set(0.02 + i * 0.012, 0.7 + i * 0.08, -0.02);
        r.rotation.z = -0.12;
        g.add(r);
      }
      g.add(ball("#fff6ee", 0.05, 0.06, 0.985, -0.02));
      return { mesh: g, attach: "head" };
    }
    case "bow": {
      // big enough to read from the third-person camera, up on the crown of
      // the head and a little to one side
      const c = "#e8455f";
      const bow = new THREE.Group();
      bow.add(ball(c, 0.14, -0.13, 0, 0, 0.09, 0.07));
      bow.add(ball(c, 0.14, 0.13, 0, 0, 0.09, 0.07));
      bow.add(ball("#c9304a", 0.06, 0, 0, 0.02));
      bow.add(ball(c, 0.05, -0.08, -0.1, 0, 0.09, 0.04));
      bow.add(ball(c, 0.05, 0.08, -0.1, 0, 0.09, 0.04));
      bow.position.set(0.17, 0.66, 0.02);
      bow.rotation.set(0.2, 0, -0.35);
      g.add(bow);
      return { mesh: g, attach: "head" };
    }
    case "backpack": {
      const c = "#4f93c4";
      g.add(box(c, 0.3, 0.34, 0.15, 0, 0.25, -0.22));
      g.add(box("#3a78a8", 0.31, 0.12, 0.16, 0, 0.37, -0.215));
      g.add(box("#ffc53d", 0.06, 0.03, 0.03, 0, 0.32, -0.3));
      for (const s of [-1, 1]) {
        const strap = box("#3a78a8", 0.05, 0.3, 0.05, s * 0.13, 0.36, -0.1);
        strap.rotation.x = -0.35;
        g.add(strap);
      }
      return { mesh: g, attach: "torso" };
    }
    case "flowercrown": {
      const ring = new THREE.Mesh(ringGeo, flat("#3fa35c", 0.7));
      ring.scale.set(0.27, 0.27, 0.27);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, 0.58, 0.0);
      g.add(ring);
      const petals = ["#e8455f", "#ffc53d", "#fff6ee", "#d47a96", "#ffc53d", "#e8455f", "#fff6ee", "#d47a96"];
      petals.forEach((p, i) => {
        const a = (i / petals.length) * Math.PI * 2;
        g.add(ball(p, 0.045, Math.cos(a) * 0.27, 0.6, Math.sin(a) * 0.27, 0.035, 0.045));
      });
      return { mesh: g, attach: "head" };
    }
    case "balloon": {
      // held in her right hand (origin = hand centre): a string rising about
      // 1.3m to a red heart balloon floating above and a little behind her head
      const red = "#e8455f";
      const shiny = lam(red, { flat: true, roughness: 0.2 });
      const heart = new THREE.Group();
      for (const s of [-1, 1]) {
        const lobe = new THREE.Mesh(sphereGeo, shiny);
        lobe.scale.set(0.17, 0.17, 0.12);
        lobe.position.set(s * 0.11, 0.05, 0);
        heart.add(lobe);
      }
      const tip = new THREE.Mesh(coneGeo, shiny);
      tip.scale.set(0.24, 0.3, 0.12);
      tip.rotation.z = Math.PI;
      tip.position.y = -0.14;
      heart.add(tip);
      heart.position.set(-0.1, 1.5, -0.38);
      heart.rotation.z = -0.15;
      g.add(heart);
      // string from the fist to the heart's tip, as a unit cylinder stretched
      // and turned along that line
      const from = new THREE.Vector3(0, 0.02, 0);
      const to = new THREE.Vector3(-0.14, 1.22, -0.38);
      const dir = to.clone().sub(from);
      const string = new THREE.Mesh(cylGeo, flat("#f7f3ee", 0.8));
      string.scale.set(0.006, dir.length(), 0.006);
      string.position.copy(from).add(to).multiplyScalar(0.5);
      string.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      g.add(string);
      g.add(ball(red, 0.02, 0, 0.02, 0.05)); // knot peeking out of her fist
      return { mesh: g, attach: "hand" };
    }
    case "duckhat": {
      // a rubber duck sitting on top of her head
      const yellow = "#ffd23a";
      g.add(ball(yellow, 0.2, 0, 0.68, -0.02, 0.13, 0.24));
      g.add(ball(yellow, 0.12, 0, 0.86, 0.14));
      const beak = new THREE.Mesh(coneGeo, flat("#ff8a3d", 0.45));
      beak.scale.set(0.05, 0.1, 0.035);
      beak.rotation.x = Math.PI / 2;
      beak.position.set(0, 0.84, 0.28);
      g.add(beak);
      for (const s of [-1, 1]) g.add(ball("#1a1a1e", 0.02, s * 0.06, 0.89, 0.24));
      g.add(ball(yellow, 0.07, 0, 0.74, -0.26, 0.05, 0.05));
      return { mesh: g, attach: "head" };
    }
    case "starglasses": {
      // pink star frames with dark lenses
      const star = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
        const r = i % 2 === 0 ? 0.085 : 0.04;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) star.moveTo(x, y);
        else star.lineTo(x, y);
      }
      star.closePath();
      const geo = new THREE.ExtrudeGeometry(star, { depth: 0.02, bevelEnabled: false });
      for (const s of [-1, 1]) {
        const frame = new THREE.Mesh(geo, flat("#f06aa8", 0.35));
        frame.position.set(s * 0.1, 0.32, 0.28);
        g.add(frame);
        const lens = new THREE.Mesh(geo, flat("#2a1a3a", 0.15));
        lens.scale.set(0.6, 0.6, 1);
        lens.position.set(s * 0.1, 0.325, 0.3);
        g.add(lens);
        g.add(box("#f06aa8", 0.02, 0.014, 0.26, s * 0.21, 0.335, 0.16, 0.3));
      }
      g.add(box("#f06aa8", 0.05, 0.014, 0.014, 0, 0.335, 0.295, 0.3));
      return { mesh: g, attach: "head" };
    }
    case "unicorn": {
      // headband with a gold spiral horn and two pink ears
      const band = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 8, 24, Math.PI), flat("#fff4f8", 0.5));
      band.scale.set(0.3, 0.3, 0.3);
      band.position.set(0, 0.36, 0.05);
      g.add(band);
      const horn = new THREE.Mesh(coneGeo, lam("#ffd76a", { flat: true, roughness: 0.25 }));
      horn.scale.set(0.055, 0.3, 0.055);
      horn.position.set(0, 0.8, 0.12);
      horn.rotation.x = 0.25;
      g.add(horn);
      for (let i = 0; i < 3; i++) {
        const r = new THREE.Mesh(ringGeo, flat("#fff4f8", 0.4));
        const k = 0.045 - i * 0.012;
        r.scale.set(k, k, k);
        r.rotation.x = Math.PI / 2 + 0.25;
        r.position.set(0, 0.7 + i * 0.07, 0.1 + i * 0.018);
        g.add(r);
      }
      for (const s of [-1, 1]) {
        const ear = new THREE.Mesh(coneGeo, flat("#f5a8c8", 0.5));
        ear.scale.set(0.07, 0.14, 0.04);
        ear.position.set(s * 0.19, 0.7, 0.02);
        ear.rotation.z = -s * 0.35;
        g.add(ear);
      }
      return { mesh: g, attach: "head" };
    }
    case "teddy": {
      // a big teddy riding on her back, paws over her shoulders
      const fur = "#b87a4a";
      const pale = "#e8c49a";
      g.add(ball(fur, 0.19, 0, 0.24, -0.27, 0.22, 0.15));
      g.add(ball(fur, 0.15, 0, 0.6, -0.3));
      g.add(ball(pale, 0.07, 0, 0.56, -0.16, 0.05, 0.04));
      g.add(ball("#2a1a10", 0.022, 0, 0.59, -0.12));
      for (const s of [-1, 1]) {
        g.add(ball(fur, 0.06, s * 0.12, 0.74, -0.3, 0.06, 0.03));
        g.add(ball("#2a1a10", 0.018, s * 0.05, 0.64, -0.17));
        const paw = ball(fur, 0.06, s * 0.2, 0.46, -0.05, 0.12, 0.06);
        paw.rotation.x = -0.6;
        g.add(paw);
        g.add(ball(fur, 0.07, s * 0.14, 0.05, -0.24, 0.09, 0.07));
      }
      g.add(ball("#e8455f", 0.05, 0, 0.47, -0.17, 0.03, 0.03));
      return { mesh: g, attach: "torso" };
    }
    case "crown": {
      const gold = "#ffc53d";
      const band = new THREE.Mesh(cylGeo, lam(gold, { flat: true, roughness: 0.25 }));
      band.scale.set(0.21, 0.1, 0.21);
      band.position.set(0, 0.62, -0.01);
      band.castShadow = true;
      g.add(band);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const spike = new THREE.Mesh(coneGeo, lam(gold, { flat: true, roughness: 0.25 }));
        spike.scale.set(0.05, 0.12, 0.05);
        spike.position.set(Math.cos(a) * 0.19, 0.72, Math.sin(a) * 0.19 - 0.01);
        g.add(spike);
      }
      g.add(ball("#e8455f", 0.035, 0, 0.64, 0.2));
      return { mesh: g, attach: "head" };
    }
    // ---- prize booth shop ------------------------------------------------
    case "catears": {
      // black headband a touch forward of the headphones, two triangle ears
      // with pink insides facing forward, tipped slightly outward
      const black = "#2f2a36";
      const band = new THREE.Mesh(headbandGeo, flat(black, 0.35));
      band.scale.set(0.32, 0.32, 0.32);
      band.position.set(0, 0.39, 0.07);
      g.add(band);
      for (const s of [-1, 1]) {
        const ear = new THREE.Group();
        const outer = new THREE.Mesh(catEarGeo, flat(black, 0.35));
        outer.castShadow = true;
        ear.add(outer);
        const inner = new THREE.Mesh(catEarInnerGeo, flat("#f5a8c8", 0.5));
        inner.position.set(0, 0.025, 0.022);
        ear.add(inner);
        ear.position.set(s * 0.17, 0.63, 0.07);
        ear.rotation.set(-0.1, 0, -s * 0.3);
        g.add(ear);
      }
      return { mesh: g, attach: "head" };
    }
    case "bunnyears": {
      // white headband, two tall white ears with pink insides, one flopping
      // a little further out than the other
      const white = "#fbf8f4";
      const band = new THREE.Mesh(headbandGeo, flat(white, 0.5));
      band.scale.set(0.32, 0.32, 0.32);
      band.position.set(0, 0.39, 0.07);
      g.add(band);
      for (const s of [-1, 1]) {
        const ear = new THREE.Group();
        ear.add(ball(white, 0.075, 0, 0.24, 0, 0.25, 0.04));
        ear.add(ball("#f5a8c8", 0.042, 0, 0.23, 0.028, 0.18, 0.02));
        ear.add(ball(white, 0.05, 0, 0.02, 0, 0.04, 0.04)); // root on the band
        ear.position.set(s * 0.11, 0.67, 0.07);
        ear.rotation.set(-0.15, 0, -s * (s > 0 ? 0.32 : 0.18));
        g.add(ear);
      }
      return { mesh: g, attach: "head" };
    }
    case "tiara": {
      // silver arc across the front of her hair with five points, the tall
      // middle one set with a big pink gem
      const silver = lam("#e3e8f2", { flat: true, roughness: 0.2 });
      const band = new THREE.Mesh(headbandGeo, silver);
      band.scale.set(0.28, 0.28, 0.28);
      band.rotation.x = Math.PI / 2; // lies flat, arc round the front (+z)
      band.position.set(0, 0.6, -0.01);
      g.add(band);
      const points = [
        { a: Math.PI / 2, h: 0.17 },
        { a: Math.PI / 2 - 0.5, h: 0.11 },
        { a: Math.PI / 2 + 0.5, h: 0.11 },
        { a: Math.PI / 2 - 1.0, h: 0.07 },
        { a: Math.PI / 2 + 1.0, h: 0.07 },
      ];
      for (const { a, h } of points) {
        const pivot = new THREE.Group();
        pivot.position.set(Math.cos(a) * 0.28, 0.6, Math.sin(a) * 0.28 - 0.01);
        pivot.rotation.y = Math.PI / 2 - a;
        const spike = new THREE.Mesh(coneGeo, silver);
        spike.scale.set(0.035 + h * 0.15, h, 0.025);
        spike.position.y = h / 2;
        spike.rotation.x = 0.2;
        spike.castShadow = true;
        pivot.add(spike);
        const tip = new THREE.Mesh(sphereGeo, silver);
        tip.scale.setScalar(0.018);
        tip.position.set(0, h * 0.98, Math.sin(0.2) * h * 0.5);
        pivot.add(tip);
        if (h < 0.15) {
          const gem = new THREE.Mesh(sphereGeo, lam("#ff7ab8", { flat: true, roughness: 0.15 }));
          gem.scale.set(0.02, 0.024, 0.014);
          gem.position.set(0, 0.03, 0.02);
          pivot.add(gem);
        } else {
          const gem = new THREE.Mesh(sphereGeo, lam("#ff4f9a", { flat: true, roughness: 0.12 }));
          gem.scale.set(0.042, 0.052, 0.026);
          gem.position.set(0, 0.06, 0.03);
          gem.rotation.x = 0.2;
          pivot.add(gem);
        }
        g.add(pivot);
      }
      return { mesh: g, attach: "head" };
    }
    case "heartglasses": {
      // red heart frames with dark rose lenses, placed like the star glasses
      const red = "#e8303f";
      for (const s of [-1, 1]) {
        const frame = new THREE.Mesh(heartGeo, flat(red, 0.35));
        frame.position.set(s * 0.105, 0.32, 0.28);
        g.add(frame);
        const lens = new THREE.Mesh(heartGeo, flat("#4a1624", 0.15));
        lens.scale.set(0.65, 0.65, 1);
        lens.position.set(s * 0.105, 0.325, 0.3);
        g.add(lens);
        g.add(box(red, 0.02, 0.014, 0.26, s * 0.21, 0.335, 0.16, 0.3));
      }
      g.add(box(red, 0.04, 0.014, 0.014, 0, 0.335, 0.295, 0.3));
      return { mesh: g, attach: "head" };
    }
    case "wings": {
      // two pairs of butterfly wings on her back, swept back so they show
      // from the camera behind her: pink uppers, purple lowers, with inset
      // panels and yellow spots that show on both faces
      const pink = "#f06aa8";
      const purple = "#9b62d6";
      const yellow = "#ffd23a";
      g.add(ball("#5b3a8c", 0.045, 0, 0.3, -0.19, 0.15, 0.045)); // body
      for (const s of [-1, 1]) {
        const side = new THREE.Group();
        side.position.set(s * 0.03, 0.32, -0.2);
        side.rotation.y = s > 0 ? 0.35 : Math.PI - 0.35;
        const upper = new THREE.Mesh(upperWingGeo, flat(pink, 0.45));
        upper.castShadow = true;
        side.add(upper);
        const upperPanel = new THREE.Mesh(upperWingGeo, flat(purple, 0.45));
        upperPanel.scale.set(0.55, 0.55, 1.4);
        upperPanel.position.set(0.02, 0.01, 0);
        side.add(upperPanel);
        const lower = new THREE.Mesh(lowerWingGeo, flat(purple, 0.45));
        lower.castShadow = true;
        lower.position.y = -0.02;
        side.add(lower);
        const lowerPanel = new THREE.Mesh(lowerWingGeo, flat(pink, 0.45));
        lowerPanel.scale.set(0.55, 0.55, 1.4);
        lowerPanel.position.set(0.02, -0.03, 0);
        side.add(lowerPanel);
        const spots: [string, number, number, number][] = [
          [yellow, 0.055, 0.32, 0.25],
          [yellow, 0.03, 0.33, 0.13],
          [purple, 0.025, 0.39, 0.29],
          [yellow, 0.035, 0.22, -0.17],
        ];
        for (const [c, r, x, y] of spots) {
          const spot = new THREE.Mesh(cylGeo, flat(c, 0.45));
          spot.scale.set(r, 0.034, r);
          spot.rotation.x = Math.PI / 2;
          spot.position.set(x, y, 0);
          side.add(spot);
        }
        g.add(side);
      }
      return { mesh: g, attach: "torso" };
    }
    case "cape": {
      // short red cape hanging from the shoulders, a yellow star on the back,
      // straps over each shoulder with gold buttons at the front
      const red = "#e0303c";
      const cape = new THREE.Mesh(capeGeo, sided(red, 0.6));
      cape.castShadow = true;
      g.add(cape);
      // star sits just behind the cape's centre line, tilted with the cloth
      const vMid = 0.5;
      const zMid = -0.27 + 0.095 * vMid;
      const star = new THREE.Mesh(capeStarGeo, flat("#ffd23a", 0.4));
      star.position.set(0, CAPE_BOTTOM + vMid * (CAPE_TOP - CAPE_BOTTOM), zMid - 0.016);
      star.rotation.set(Math.atan2(0.095, CAPE_TOP - CAPE_BOTTOM), Math.PI, 0);
      g.add(star);
      // collar roll along the top edge
      const collar = new THREE.Mesh(cylGeo, flat("#b8243a", 0.55));
      collar.scale.set(0.03, 0.36, 0.03);
      collar.rotation.z = Math.PI / 2;
      collar.position.set(0, CAPE_TOP, -0.18);
      g.add(collar);
      for (const s of [-1, 1]) {
        const strap = new THREE.Mesh(capeStrapGeo, flat("#b8243a", 0.55));
        strap.scale.set(0.15, 0.1, 0.15);
        strap.rotation.y = Math.PI / 2;
        strap.position.set(s * 0.14, 0.49, -0.015);
        g.add(strap);
        g.add(ball("#ffc53d", 0.03, s * 0.14, 0.47, 0.14, 0.03, 0.015));
      }
      return { mesh: g, attach: "torso" };
    }
    // ---- held in her right hand ----------------------------------------------
    case "wand": {
      // pink stick leaning forward out of her fist, a big glowing gold star on
      // top with a ring of little sparkles
      const stick = new THREE.Group();
      stick.rotation.x = 0.6;
      const rod = new THREE.Mesh(cylGeo, flat("#f06aa8", 0.35));
      rod.scale.set(0.018, 0.56, 0.018);
      rod.position.y = 0.17;
      rod.castShadow = true;
      stick.add(rod);
      stick.add(ball("#ffd23a", 0.028, 0, -0.1, 0)); // end cap below the fist
      const gold = lam("#ffd23a", { flat: true, roughness: 0.2, emissive: "#ffb400" });
      const star = new THREE.Mesh(wandStarGeo, gold);
      star.scale.setScalar(1.3);
      star.position.y = 0.5;
      star.castShadow = true;
      stick.add(star);
      const sparkle = lam("#fffbe6", { flat: true, roughness: 0.2, emissive: "#fff2a8" });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        const sp = new THREE.Mesh(sphereGeo, sparkle);
        sp.scale.setScalar(i % 2 ? 0.014 : 0.022);
        sp.position.set(Math.cos(a) * 0.19, 0.5 + Math.sin(a) * 0.19, 0);
        stick.add(sp);
      }
      g.add(stick);
      return { mesh: g, attach: "hand" };
    }
    case "lollipop": {
      // white stick, a big white disc with a red spiral swirl showing on both
      // faces, and a red rim
      const stick = new THREE.Group();
      stick.rotation.x = 0.5;
      const rod = new THREE.Mesh(cylGeo, flat("#fbf8f4", 0.5));
      rod.scale.set(0.016, 0.5, 0.016);
      rod.position.y = 0.15;
      rod.castShadow = true;
      stick.add(rod);
      const candy = new THREE.Group();
      candy.position.y = 0.4 + LOLLY_R;
      candy.rotation.x = -0.5; // stand the disc upright, facing forward and back
      const disc = new THREE.Mesh(cylGeo, flat("#fff6ee", 0.3));
      disc.scale.set(LOLLY_R, 0.04, LOLLY_R);
      disc.rotation.x = Math.PI / 2;
      disc.castShadow = true;
      candy.add(disc);
      const red = flat("#e8303f", 0.3);
      const swirl = new THREE.Mesh(lollySwirlGeo, red);
      swirl.scale.z = 1.6; // tube radius 0.016 * 1.6 pokes past both faces
      candy.add(swirl);
      const rim = new THREE.Mesh(ringGeo, red);
      rim.scale.set(LOLLY_R, LOLLY_R, LOLLY_R * 1.6);
      candy.add(rim);
      stick.add(candy);
      g.add(stick);
      return { mesh: g, attach: "hand" };
    }
    case "cottoncandy": {
      // striped paper cone in her fist, a big fluffy pink cloud on top
      const cone = new THREE.Group();
      cone.rotation.x = 0.55;
      const paper = new THREE.Mesh(coneGeo, flat("#f7f1e6", 0.7));
      paper.scale.set(0.07, 0.34, 0.07);
      paper.rotation.z = Math.PI; // point down through the fist
      paper.position.y = 0.05;
      paper.castShadow = true;
      cone.add(paper);
      const stripe = new THREE.Mesh(ringGeo, flat("#6fb6e8", 0.6));
      stripe.scale.set(0.052, 0.052, 0.052);
      stripe.rotation.x = Math.PI / 2;
      stripe.position.y = 0.12;
      cone.add(stripe);
      const pink = "#ff9ccf";
      const pale = "#ffc4e3";
      const puffs: [string, number, number, number, number][] = [
        [pink, 0.15, 0, 0.36, 0.02],
        [pale, 0.11, -0.1, 0.3, 0.05],
        [pink, 0.11, 0.1, 0.31, 0.04],
        [pale, 0.1, 0.05, 0.47, 0.03],
        [pink, 0.09, -0.07, 0.46, 0.06],
        [pale, 0.1, 0.0, 0.33, 0.12],
        [pink, 0.08, 0.02, 0.25, 0.08],
      ];
      for (const [c, r, x, y, z] of puffs) cone.add(ball(c, r, x, y, z));
      g.add(cone);
      return { mesh: g, attach: "hand" };
    }
    case "pinwheel": {
      // green stick with a four-blade pinwheel at the top facing forward; the
      // blade group is tagged so the runtime can spin it about its z axis
      const stick = new THREE.Group();
      stick.rotation.x = 0.35;
      const rod = new THREE.Mesh(cylGeo, flat("#3fa35c", 0.5));
      rod.scale.set(0.016, 0.62, 0.016);
      rod.position.y = 0.19;
      rod.castShadow = true;
      stick.add(rod);
      const blades = new THREE.Group();
      blades.userData.spin = true;
      blades.position.set(0, 0.5, 0.035);
      blades.rotation.x = -0.35; // undo the stick's lean so it faces straight ahead
      const colours = ["#e8455f", "#ffc53d", "#4f93c4", "#3fa35c"];
      colours.forEach((c, i) => {
        const blade = new THREE.Mesh(pinwheelBladeGeo, flat(c, 0.45));
        blade.rotation.z = (i * Math.PI) / 2;
        blade.castShadow = true;
        blades.add(blade);
      });
      blades.add(ball("#fff6ee", 0.03, 0, 0, 0.012, 0.03, 0.02)); // hub pin
      stick.add(blades);
      g.add(stick);
      return { mesh: g, attach: "hand" };
    }
  }
}

/** Strip any worn accessories from her and attach the current set. */
export function applyWorn(girl: THREE.Group, worn: Worn) {
  const head = girl.userData.head as THREE.Group;
  const torso = girl.userData.torso as THREE.Group;
  const rightArm = girl.userData.rightArm as THREE.Group | undefined;
  for (const grp of [head, torso, rightArm]) {
    if (!grp) continue;
    for (const child of [...grp.children]) {
      if (child.userData.accessory) grp.remove(child);
    }
  }
  let holding = false;
  for (const slot of SLOTS) {
    const id = worn[slot];
    if (!id) continue;
    const { mesh, attach } = makeAccessory(id);
    if (attach === "hand") {
      if (!rightArm) continue;
      // hand items are built around the hand centre; the hand ball sits at
      // (0, -0.53, 0) in the arm group, which pivots at the shoulder
      const grip = new THREE.Group();
      grip.userData.accessory = id;
      grip.position.set(0, -0.53, 0);
      grip.add(mesh);
      rightArm.add(grip);
      holding = true;
    } else {
      (attach === "head" ? head : torso).add(mesh);
    }
  }
  // Holding something hides the iPod she otherwise carries. makeGirl adds the
  // arm's own parts in order: sleeve, arm, hand, thumb (children 0-3), then
  // the iPod group and the cord along the arm (4 and 5). Neither of those has
  // a name to find it by yet, so toggle every non-accessory child from index 4
  // on. Accessories are always appended after the built-in parts, so the
  // indices hold. TODO: switch to a name lookup once the iPod is named.
  if (rightArm) {
    rightArm.children.forEach((child, i) => {
      if (i >= 4 && !child.userData.accessory) child.visible = !holding;
    });
  }
}

/** The item as a pickup: bigger, over a glowing ring, ready to spin. */
export function makePickup(id: AccessoryId): THREE.Group {
  const g = new THREE.Group();
  const { mesh } = makeAccessory(id);
  // centre the item on its own origin so it spins in place
  const bb = new THREE.Box3().setFromObject(mesh);
  const c = bb.getCenter(new THREE.Vector3());
  mesh.position.sub(c);
  mesh.scale.setScalar(1.7);
  mesh.position.y += 1.05;
  g.add(mesh);
  const ring = new THREE.Mesh(
    ringGeo,
    new THREE.MeshStandardMaterial({
      color: "#ffe08a",
      emissive: new THREE.Color("#ffd34a"),
      emissiveIntensity: 1.6,
      roughness: 0.4,
    }),
  );
  ring.scale.set(0.55, 0.55, 0.55);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.08;
  g.add(ring);
  g.userData.ring = ring;
  g.userData.item = mesh;
  return g;
}
