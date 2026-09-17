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
  | "teddy";
export type Slot = "head" | "hair" | "face" | "back";

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
  { id: "flowercrown", name: "Flower crown", slot: "head", hint: "On the picnic lawn." },
  { id: "crown", name: "Golden crown", slot: "head", hint: "Find every dumpling in the park.", reward: "every dumpling in the park" },
  { id: "balloon", name: "Heart balloon", slot: "back", hint: "Win at Ring Toss.", reward: "Ring Toss" },
  { id: "duckhat", name: "Duck hat", slot: "head", hint: "Win at the Duck Pond.", reward: "the Duck Pond" },
  { id: "starglasses", name: "Star glasses", slot: "face", hint: "Win at Whack-a-Mole.", reward: "Whack-a-Mole" },
  // a head item, not hair: it sits where the hats do, so it swaps with them
  { id: "unicorn", name: "Unicorn headband", slot: "head", hint: "Grab the gold ring on the carousel.", reward: "the carousel" },
  { id: "teddy", name: "Giant teddy", slot: "back", hint: "Win every carnival game.", reward: "the prize booth" },
];

export const SLOTS: Slot[] = ["head", "hair", "face", "back"];

export type Worn = Record<Slot, AccessoryId | null>;

export const NOTHING_WORN: Worn = { head: null, hair: null, face: null, back: null };

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

/** The item as worn: built in the frame of the group it attaches to. */
export function makeAccessory(id: AccessoryId): { mesh: THREE.Group; attach: "head" | "torso" } {
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
      // a red heart balloon on a string, tied behind her shoulder
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
      heart.position.set(0.25, 1.75, -0.35);
      heart.rotation.z = -0.15;
      g.add(heart);
      const string = new THREE.Mesh(cylGeo, flat("#f7f3ee", 0.8));
      string.scale.set(0.006, 1.2, 0.006);
      string.position.set(0.19, 1.0, -0.26);
      string.rotation.set(-0.08, 0, -0.1);
      g.add(string);
      return { mesh: g, attach: "torso" };
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
  }
}

/** Strip any worn accessories from her and attach the current set. */
export function applyWorn(girl: THREE.Group, worn: Worn) {
  const head = girl.userData.head as THREE.Group;
  const torso = girl.userData.torso as THREE.Group;
  for (const grp of [head, torso]) {
    for (const child of [...grp.children]) {
      if (child.userData.accessory) grp.remove(child);
    }
  }
  for (const slot of SLOTS) {
    const id = worn[slot];
    if (!id) continue;
    const { mesh, attach } = makeAccessory(id);
    (attach === "head" ? head : torso).add(mesh);
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
