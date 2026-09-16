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

export type AccessoryId = "sunglasses" | "partyhat" | "bow" | "backpack" | "flowercrown" | "crown";
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
  { id: "crown", name: "Golden crown", slot: "head", hint: "Find every dumpling in the park.", reward: "all twelve dumplings" },
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
