import * as THREE from "three";
import { beveledBox } from "./beveled";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { texturesFor, type TexKind } from "./textures";
import { SPLASH_BUCKET, SPLASH_FLOWERS, SPLASH_RADIUS, splashJets, type Jet } from "./splash";
import { CAVE, CAVE_MAP, CAVE_SPOTS, caveCellCenter, caveEntrance } from "./cave";

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const sphereGeo = new THREE.SphereGeometry(1, 14, 12);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 10);
const coneGeo = new THREE.ConeGeometry(1, 1, 8);
const cone4Geo = new THREE.ConeGeometry(1, 1, 4);

const mats = new Map<string, THREE.MeshStandardMaterial>();

export function lam(
  color: string,
  extras?: {
    transparent?: boolean;
    opacity?: number;
    emissive?: string;
    roughness?: number;
    /** Tiling for the procedural texture, in repeats across the face. */
    repeat?: number;
    /** Opt out of texturing for small painted details. */
    flat?: boolean;
    /** Force a texture kind for colours that are not in the table. */
    tex?: TexKind;
  },
) {
  const rep = extras?.flat ? 0 : Math.max(1, Math.min(8, Math.round(extras?.repeat ?? 1)));
  const key = `${color}|${extras?.opacity ?? 1}|${extras?.emissive ?? ""}|${extras?.roughness ?? 0.58}|${rep}|${extras?.tex ?? ""}`;
  let m = mats.get(key);
  if (!m) {
    const tex = rep ? texturesFor(color, rep, extras?.tex) : null;
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: extras?.roughness ?? 0.42,
      envMapIntensity: 0.85,
      metalness: 0.04,
      transparent: extras?.transparent ?? (extras?.opacity != null && extras.opacity < 1),
      opacity: extras?.opacity ?? 1,
      emissive: extras?.emissive ? new THREE.Color(extras.emissive) : undefined,
      emissiveIntensity: extras?.emissive ? 0.4 : 0,
      map: tex?.map ?? null,
      normalMap: tex?.normal ?? null,
      normalScale: tex?.normal ? new THREE.Vector2(0.7, 0.7) : undefined,
    });
    mats.set(key, m);
  }
  return m;
}

export function mesh(
  geo: THREE.BufferGeometry,
  color: string,
  sx: number,
  sy: number,
  sz: number,
  x: number,
  y: number,
  z: number,
  shadow = true,
) {
  // boxes get a real beveled geometry at their true size; everything else
  // (spheres, cylinders, cones) still scales a shared primitive
  const box = geo === boxGeo;
  const o = new THREE.Mesh(box ? beveledBox(sx, sy, sz) : geo, lam(color));
  if (!box) o.scale.set(sx, sy, sz);
  o.position.set(x, y, z);
  o.castShadow = shadow;
  o.receiveShadow = true;
  return o;
}

const smileGeo = new THREE.TorusGeometry(1, 0.16, 6, 14, Math.PI);
const bandGeo = new THREE.TorusGeometry(1, 0.06, 6, 20, Math.PI);

/**
 * Sloan.
 *
 * Built to read as a kid rather than a doll: an oval head on a neck, ears,
 * eyebrows and a real smile instead of blush dots, a T-shirt-and-skirt outfit
 * with skin legs, socks and sneakers, and hands with a thumb. Every part is a
 * flat-shaded plastic; the old version pulled textures by colour and ended
 * up with brickwork on her dress.
 *
 * She holds a black iPod classic in her right hand and wears white wired
 * headphones. The cord runs earcup -> shoulder -> down the right arm, split
 * into pieces parented to the head, torso and arm, so it follows the
 * animation without any per-frame work.
 *
 * The rig keys on userData are what animateGirl drives; keep them.
 */
export function makeGirl(skin: string, hair: string, dress: string) {
  const root = new THREE.Group();
  const sock = "#fff8f0";
  const sneaker = "#f7f4ee";
  const sole = "#e2ddd3";
  const iris = "#5a3a1e";
  const white = "#f9f6f2";
  const brow = "#3a2a1c";
  const lip = "#c9605c";
  const cord = "#f0f0f0";
  const cups = "#2a2a2e";
  const flat = (c: string, extras?: Parameters<typeof lam>[1]) => lam(c, { flat: true, ...extras });
  // flat-shaded part helper: same signature as mesh(), no texture lookup
  const part = (
    geo: THREE.BufferGeometry,
    color: string,
    sx: number,
    sy: number,
    sz: number,
    x: number,
    y: number,
    z: number,
    shadow = true,
    roughness = 0.55,
  ) => {
    const box = geo === boxGeo;
    const o = new THREE.Mesh(box ? beveledBox(sx, sy, sz) : geo, flat(color, { roughness }));
    if (!box) o.scale.set(sx, sy, sz);
    o.position.set(x, y, z);
    o.castShadow = shadow;
    o.receiveShadow = true;
    return o;
  };

  const hips = new THREE.Group();
  hips.position.y = 0.72;
  root.add(hips);

  const makeLeg = (side: number) => {
    const g = new THREE.Group();
    g.position.set(side * 0.13, 0, 0);
    // thigh and shin in skin, a sock, and a sneaker with a sole and a tongue
    g.add(part(cylGeo, skin, 0.105, 0.36, 0.105, 0, -0.16, 0));
    g.add(part(cylGeo, sock, 0.1, 0.16, 0.1, 0, -0.42, 0));
    g.add(part(boxGeo, sneaker, 0.19, 0.11, 0.3, 0, -0.58, 0.06));
    g.add(part(boxGeo, sole, 0.2, 0.04, 0.31, 0, -0.65, 0.06, false));
    g.add(part(boxGeo, dress, 0.1, 0.03, 0.12, 0, -0.52, 0.12, false));
    return g;
  };
  const leftLeg = makeLeg(-1);
  const rightLeg = makeLeg(1);
  hips.add(leftLeg, rightLeg);

  // Everything above the waist hangs off a torso pivot, so she can lean into
  // turns, twist as she walks and breathe.
  const torso = new THREE.Group();
  torso.position.y = 0.95;
  root.add(torso);

  // skirt, then a T-shirt body with a rounded shoulder line
  const skirt = new THREE.Mesh(coneGeo, flat(dress, { roughness: 0.6 }));
  skirt.scale.set(0.46, 0.42, 0.42);
  skirt.position.y = -0.06;
  skirt.castShadow = true;
  skirt.receiveShadow = true;
  torso.add(skirt);
  // upper body parts are tagged so first person can hide everything from the
  // shoulders up (and the arms), leaving the skirt and legs when she looks down
  const fp = <T extends THREE.Object3D>(o: T): T => {
    o.userData.fpHide = true;
    return o;
  };
  torso.add(fp(part(boxGeo, dress, 0.44, 0.46, 0.26, 0, 0.26, 0)));
  torso.add(fp(part(sphereGeo, dress, 0.25, 0.1, 0.16, 0, 0.5, 0)));
  // neck
  torso.add(fp(part(cylGeo, skin, 0.075, 0.14, 0.075, 0, 0.6, 0.02)));

  const makeArm = (side: number) => {
    const g = new THREE.Group();
    g.position.set(side * 0.29, 0.44, 0);
    g.add(part(cylGeo, dress, 0.085, 0.16, 0.085, 0, -0.05, 0)); // short sleeve
    g.add(part(cylGeo, skin, 0.07, 0.4, 0.07, 0, -0.3, 0)); // arm
    g.add(part(sphereGeo, skin, 0.075, 0.085, 0.07, 0, -0.53, 0)); // hand
    g.add(part(sphereGeo, skin, 0.03, 0.045, 0.03, side * -0.06, -0.5, 0.03, false)); // thumb
    return g;
  };
  const leftArm = fp(makeArm(-1));
  const rightArm = fp(makeArm(1));
  torso.add(leftArm, rightArm);

  // ---- iPod classic in the right hand -----------------------------------
  {
    const ip = makeIpod();
    ip.position.set(0.03, -0.56, 0.08);
    ip.rotation.set(-0.5, 0.15, 0);
    rightArm.add(ip);
    // cord along the arm: shoulder to hand
    const along = part(cylGeo, cord, 0.008, 0.5, 0.008, 0.03, -0.29, 0.07, false, 0.7);
    rightArm.add(along);
  }

  const head = fp(new THREE.Group());
  head.position.set(0, 0.67, 0);
  // oval head with a softer jaw, and ears
  head.add(part(sphereGeo, skin, 0.29, 0.325, 0.28, 0, 0.32, 0.03));
  head.add(part(sphereGeo, skin, 0.24, 0.2, 0.23, 0, 0.2, 0.05, false));
  head.add(part(sphereGeo, skin, 0.05, 0.065, 0.03, -0.29, 0.3, 0.02, false));
  head.add(part(sphereGeo, skin, 0.05, 0.065, 0.03, 0.29, 0.3, 0.02, false));
  // nose
  head.add(part(sphereGeo, skin, 0.04, 0.035, 0.04, 0, 0.26, 0.29, false));

  // hair: cap, fringe and side sweeps
  head.add(part(sphereGeo, hair, 0.315, 0.2, 0.3, 0, 0.5, -0.02));
  head.add(part(sphereGeo, hair, 0.27, 0.25, 0.16, 0, 0.4, -0.2));
  head.add(part(boxGeo, hair, 0.4, 0.09, 0.14, 0, 0.53, 0.15));
  head.add(part(boxGeo, hair, 0.14, 0.12, 0.1, -0.15, 0.49, 0.2));
  head.add(part(boxGeo, hair, 0.14, 0.12, 0.1, 0.15, 0.49, 0.2));
  head.add(part(sphereGeo, hair, 0.09, 0.2, 0.14, -0.27, 0.36, -0.02));
  head.add(part(sphereGeo, hair, 0.09, 0.2, 0.14, 0.27, 0.36, -0.02));

  const makeBraid = (side: number) => {
    const g = new THREE.Group();
    g.position.set(side * 0.27, 0.36, -0.12);
    g.rotation.z = side * 0.16;
    g.add(part(sphereGeo, dress, 0.07, 0.045, 0.07, 0, 0.04, 0.02, false));
    const sizes = [0.085, 0.082, 0.078, 0.072, 0.064, 0.052];
    sizes.forEach((s, i) => {
      g.add(part(sphereGeo, hair, s, s * 1.08, s, 0, -0.1 - i * 0.14, i % 2 === 0 ? 0.02 : -0.02));
    });
    return g;
  };
  const braidL = makeBraid(-1);
  const braidR = makeBraid(1);
  head.add(braidL, braidR);

  // eyes: smaller whites, brown iris, dark pupil, one catchlight
  const makeEye = (side: number) => {
    const g = new THREE.Group();
    g.position.set(side * 0.1, 0.32, 0.26);
    g.add(part(sphereGeo, white, 0.055, 0.06, 0.03, 0, 0, 0, false));
    g.add(part(sphereGeo, iris, 0.034, 0.036, 0.024, 0, -0.003, 0.016, false));
    g.add(part(sphereGeo, "#1a1008", 0.016, 0.016, 0.012, 0, -0.003, 0.03, false));
    g.add(part(sphereGeo, "#fff", 0.009, 0.009, 0.006, 0.01, 0.012, 0.032, false));
    return g;
  };
  const eyeL = makeEye(-1);
  const eyeR = makeEye(1);
  head.add(eyeL, eyeR);
  // eyebrows, angled a touch
  const browL = part(boxGeo, brow, 0.09, 0.018, 0.02, -0.1, 0.4, 0.27, false);
  browL.rotation.z = 0.12;
  const browR = part(boxGeo, brow, 0.09, 0.018, 0.02, 0.1, 0.4, 0.27, false);
  browR.rotation.z = -0.12;
  head.add(browL, browR);
  // smile: a half torus, open side up
  const smile = new THREE.Mesh(smileGeo, flat(lip, { roughness: 0.5 }));
  smile.scale.set(0.05, 0.035, 0.03);
  smile.position.set(0, 0.2, 0.27);
  smile.rotation.z = Math.PI;
  smile.castShadow = false;
  head.add(smile);

  // ---- headphones -------------------------------------------------------
  {
    const band = new THREE.Mesh(bandGeo, flat(cups, { roughness: 0.4 }));
    band.scale.set(0.33, 0.33, 0.33);
    band.position.set(0, 0.34, 0.0);
    band.castShadow = false;
    head.add(band);
    for (const side of [-1, 1]) {
      const cup = part(cylGeo, cups, 0.075, 0.05, 0.075, side * 0.32, 0.3, 0.02, false, 0.4);
      cup.rotation.z = Math.PI / 2;
      head.add(cup);
      const pad = part(cylGeo, "#4a4a50", 0.06, 0.012, 0.06, side * 0.295, 0.3, 0.02, false, 0.6);
      pad.rotation.z = Math.PI / 2;
      head.add(pad);
    }
    // cord from the right earcup down toward the shoulder
    const drop = part(cylGeo, cord, 0.008, 0.3, 0.008, 0.33, 0.14, 0.04, false, 0.7);
    drop.rotation.z = -0.15;
    head.add(drop);
  }
  // cord across the shoulder to the arm
  {
    const across = fp(part(cylGeo, cord, 0.008, 0.2, 0.008, 0.32, 0.54, 0.05, false, 0.7));
    across.rotation.z = -0.5;
    torso.add(across);
  }
  torso.add(head);

  root.userData.torso = torso;
  root.userData.hips = hips;
  root.userData.skirt = skirt;
  root.userData.leftLeg = leftLeg;
  root.userData.rightLeg = rightLeg;
  root.userData.leftArm = leftArm;
  root.userData.rightArm = rightArm;
  root.userData.eyeL = eyeL;
  root.userData.eyeR = eyeR;
  root.userData.head = head;
  root.userData.braidL = braidL;
  root.userData.braidR = braidR;
  return root;
}

/** Show or hide the parts that would sit inside a first-person camera. */
export function setFirstPersonBody(root: THREE.Group, firstPerson: boolean) {
  root.traverse((o) => {
    if (o.userData.fpHide) o.visible = !firstPerson;
  });
}

// ---- iPod classic -----------------------------------------------------------
// Real proportions (61.8 x 103.5 x 10.5mm) at about twice the size, so it reads
// on a TV across the room. Local frame: x right, y up, the face toward +z.
export const IPOD = { w: 0.12, h: 0.2, d: 0.024 };
const IPOD_FONT = "system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";

let ipodScreenTex: THREE.CanvasTexture | null = null;
/** The screen: the classic main menu with the blue selection bar. */
export function ipodScreenTexture() {
  if (ipodScreenTex) return ipodScreenTex;
  const W = 256;
  const H = 192;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f7f8fa";
  g.fillRect(0, 0, W, H);
  // title bar
  const bar = g.createLinearGradient(0, 0, 0, 32);
  bar.addColorStop(0, "#ffffff");
  bar.addColorStop(1, "#c6ccd5");
  g.fillStyle = bar;
  g.fillRect(0, 0, W, 32);
  g.fillStyle = "#8f97a3";
  g.fillRect(0, 32, W, 2);
  g.fillStyle = "#1d2330";
  g.font = `bold 20px ${IPOD_FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("iPod", W / 2, 17);
  // play glyph and battery
  g.fillStyle = "#2f74d8";
  g.beginPath();
  g.moveTo(11, 9);
  g.lineTo(23, 17);
  g.lineTo(11, 25);
  g.closePath();
  g.fill();
  g.strokeStyle = "#4a5160";
  g.lineWidth = 2;
  g.strokeRect(W - 40, 10, 26, 14);
  g.fillStyle = "#4a5160";
  g.fillRect(W - 14, 14, 3, 6);
  g.fillStyle = "#4cb84a";
  g.fillRect(W - 37, 13, 20, 8);
  // menu, first row selected
  const items = ["Music", "Photos", "Videos", "Shuffle Songs", "Settings", "Now Playing"];
  const top = 34;
  const row = 26;
  items.forEach((t, i) => {
    const y = top + i * row;
    if (i === 0) {
      const sel = g.createLinearGradient(0, y, 0, y + row);
      sel.addColorStop(0, "#7cb8f7");
      sel.addColorStop(1, "#2767d0");
      g.fillStyle = sel;
      g.fillRect(0, y, W, row);
    }
    g.fillStyle = i === 0 ? "#ffffff" : "#1d2330";
    g.font = `bold 18px ${IPOD_FONT}`;
    g.textAlign = "left";
    g.fillText(t, 12, y + row / 2 + 1);
    if (i < items.length - 1) {
      g.font = `bold 22px ${IPOD_FONT}`;
      g.textAlign = "right";
      g.fillText("›", W - 12, y + row / 2);
    }
  });
  ipodScreenTex = new THREE.CanvasTexture(c);
  ipodScreenTex.colorSpace = THREE.SRGBColorSpace;
  ipodScreenTex.anisotropy = 4;
  return ipodScreenTex;
}

/** The click wheel: a dark ring with MENU and the transport glyphs. */
function ipodWheelTexture() {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const g = c.getContext("2d")!;
  const m = S / 2;
  const ring = g.createRadialGradient(m, m * 0.7, 10, m, m, m);
  ring.addColorStop(0, "#44464c");
  ring.addColorStop(1, "#2a2b30");
  g.fillStyle = ring;
  g.beginPath();
  g.arc(m, m, m, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#d4d7dd";
  g.font = `bold 30px ${IPOD_FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("MENU", m, 38);
  const tri = (x: number, y: number, dir: number, s: number) => {
    g.beginPath();
    g.moveTo(x - dir * s, y - s);
    g.lineTo(x + dir * s, y);
    g.lineTo(x - dir * s, y + s);
    g.closePath();
    g.fill();
  };
  // next |>>  and  <<| previous
  tri(208, m, 1, 11);
  tri(226, m, 1, 11);
  g.fillRect(236, m - 11, 5, 22);
  tri(48, m, -1, 11);
  tri(30, m, -1, 11);
  g.fillRect(15, m - 11, 5, 22);
  // play / pause
  tri(m - 12, 220, 1, 11);
  g.fillRect(m + 6, 209, 5, 22);
  g.fillRect(m + 15, 209, 5, 22);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

type IpodParts = {
  front: THREE.BufferGeometry;
  back: THREE.BufferGeometry;
  screen: THREE.BufferGeometry;
  wheel: THREE.BufferGeometry;
  button: THREE.BufferGeometry;
  jackRing: THREE.BufferGeometry;
  jackHole: THREE.BufferGeometry;
  hold: THREE.BufferGeometry;
  mats: Record<"front" | "chrome" | "screen" | "wheel" | "button" | "hole", THREE.Material>;
};
let ipodParts: IpodParts | null = null;
function ipodKit(): IpodParts {
  if (ipodParts) return ipodParts;
  const { w, h, d } = IPOD;
  const wheelMap = ipodWheelTexture();
  ipodParts = {
    // black anodised front half, chrome back half: two rounded slabs
    front: new RoundedBoxGeometry(w, h, d * 0.62, 4, 0.008),
    back: new RoundedBoxGeometry(w - 0.002, h - 0.002, d * 0.62, 4, 0.009),
    screen: new THREE.PlaneGeometry(0.094, 0.0705),
    wheel: new THREE.CircleGeometry(0.037, 64),
    button: new THREE.CylinderGeometry(0.0125, 0.0125, 0.0024, 40),
    jackRing: new THREE.CylinderGeometry(0.0046, 0.0046, 0.003, 20),
    jackHole: new THREE.CylinderGeometry(0.0026, 0.0026, 0.0034, 16),
    hold: new RoundedBoxGeometry(0.016, 0.004, 0.007, 2, 0.0015),
    mats: {
      front: new THREE.MeshStandardMaterial({ color: "#16171a", roughness: 0.3, metalness: 0.1 }),
      chrome: new THREE.MeshStandardMaterial({ color: "#d5d9df", roughness: 0.18, metalness: 0.85 }),
      // unlit, and grey rather than white so the bloom pass leaves it alone
      screen: new THREE.MeshBasicMaterial({ map: ipodScreenTexture(), color: "#c9c9c9" }),
      wheel: new THREE.MeshStandardMaterial({ map: wheelMap, roughness: 0.5, metalness: 0.05 }),
      button: new THREE.MeshStandardMaterial({ color: "#1f2024", roughness: 0.28, metalness: 0.1 }),
      hole: new THREE.MeshBasicMaterial({ color: "#050505" }),
    },
  };
  return ipodParts;
}

/**
 * An iPod classic, shared by Sloan's third-person hand and the first-person
 * viewmodel. `userData.jack` is the headphone socket in the local frame, for
 * whoever routes the cord.
 */
export function makeIpod(shadow = false): THREE.Group {
  const { h, d } = IPOD;
  const k = ipodKit();
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = false;
    g.add(m);
    return m;
  };
  add(k.front, k.mats.front, 0, 0, d * 0.19);
  add(k.back, k.mats.chrome, 0, 0, -d * 0.19);
  const face = d / 2;
  add(k.screen, k.mats.screen, 0, 0.047, face + 0.0006);
  add(k.wheel, k.mats.wheel, 0, -0.047, face + 0.0006);
  add(k.button, k.mats.button, 0, -0.047, face + 0.0012).rotation.x = Math.PI / 2;
  add(k.jackRing, k.mats.chrome, -0.036, h / 2, 0);
  add(k.jackHole, k.mats.hole, -0.036, h / 2, 0);
  add(k.hold, k.mats.chrome, 0.036, h / 2 + 0.0008, 0);
  g.userData.jack = new THREE.Vector3(-0.036, h / 2, 0);
  return g;
}

export type Hands = { group: THREE.Group; left: THREE.Group; right: THREE.Group };

type V3 = [number, number, number];
const Y_UP = new THREE.Vector3(0, 1, 0);

/**
 * A smooth tapered limb through a list of joints: a sphere at every joint and
 * an open cone between each pair, with matching radii, so there are no seams
 * to line up. A finger is just its knuckle positions, which is far easier to
 * pose than chained Euler rotations.
 */
function limb(out: THREE.BufferGeometry[], points: V3[], radii: number[]) {
  points.forEach((pt, i) => {
    const r = radii[Math.min(i, radii.length - 1)]!;
    out.push(new THREE.SphereGeometry(r, 16, 12).translate(...pt));
    if (i === 0) return;
    const a = new THREE.Vector3(...points[i - 1]!);
    const b = new THREE.Vector3(...pt);
    const len = a.distanceTo(b);
    if (len < 1e-5) return;
    const ra = radii[Math.min(i - 1, radii.length - 1)]!;
    const cone = new THREE.CylinderGeometry(r, ra, len, 16, 1, true);
    const q = new THREE.Quaternion().setFromUnitVectors(Y_UP, b.clone().sub(a).normalize());
    cone.applyMatrix4(new THREE.Matrix4().compose(a.add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
    out.push(cone);
  });
}

/** A scaled sphere (palms, nails). */
function blob(out: THREE.BufferGeometry[], at: V3, scale: V3, rot: V3 = [0, 0, 0]) {
  const geo = new THREE.SphereGeometry(1, 20, 14);
  geo.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(...at),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
      new THREE.Vector3(...scale),
    ),
  );
  out.push(geo);
}

function merged(parts: THREE.BufferGeometry[], mat: THREE.Material) {
  const geo = mergeGeometries(parts);
  if (!geo) throw new Error("hands: geometry merge failed");
  parts.forEach((p) => p.dispose());
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = false;
  m.receiveShadow = false;
  m.userData.ownsGeometry = true;
  return m;
}

/** A camera-space point expressed in a child group's own frame. */
function toLocal(obj: THREE.Object3D, p: V3): V3 {
  obj.updateMatrix();
  const v = new THREE.Vector3(...p).applyMatrix4(obj.matrix.clone().invert());
  return [v.x, v.y, v.z];
}

const handSkinMats = new Map<string, THREE.MeshStandardMaterial>();
function handSkin(skin: string) {
  let m = handSkinMats.get(skin);
  if (!m) {
    // a little self-light so the hands never go muddy on the shadow side
    m = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.62, metalness: 0, emissive: skin, emissiveIntensity: 0.14 });
    handSkinMats.set(skin, m);
  }
  return m;
}
const nailMat = new THREE.MeshStandardMaterial({ color: "#f6d3c2", roughness: 0.35, emissive: "#f6d3c2", emissiveIntensity: 0.1 });
const cordMat = new THREE.MeshStandardMaterial({ color: "#f2f2f2", roughness: 0.5 });

/**
 * First-person hands. Built in camera space (forward is -z) and parented to
 * nothing; the runtime copies the camera's transform onto the group each frame
 * and adds bob and sway.
 *
 * The right hand holds the iPod the way you hold a phone: the device lies in
 * the palm, the fingers wrap its left edge with their tips showing on the
 * front, and the thumb reaches over the right edge onto the click wheel. The
 * right group IS the iPod's frame, so the grip is written in the device's own
 * coordinates. The left hand is a loose half-fist in the bottom-left corner, back of
 * the hand toward the eye. Both forearms run to an elbow below the frame so
 * nothing floats.
 */
export function makeHands(skin: string, _dress: string): Hands {
  const group = new THREE.Group();
  const skinMat = handSkin(skin);

  // ---- right hand, in the iPod's frame --------------------------------------
  const right = new THREE.Group();
  right.position.set(0.17, -0.19, -0.55);
  right.rotation.set(-0.22, -0.26, 0.1);
  right.add(makeIpod());
  {
    const { w, d } = IPOD;
    const edge = -w / 2;
    const face = d / 2;
    const s: THREE.BufferGeometry[] = [];
    // palm behind the device, its heel showing past the right edge
    blob(s, [0.022, -0.056, -face - 0.018], [0.058, 0.05, 0.02]);
    // fingers, index at the top: behind, round the left edge, tips on the face
    const rows = [-0.02, -0.044, -0.068, -0.09];
    const size = [1, 1.02, 0.97, 0.85];
    rows.forEach((y, i) => {
      const k = size[i]!;
      const r = 0.0122 * k;
      limb(
        s,
        [
          [-0.012, y, -face - 0.018],
          [edge + 0.004, y, -face - 0.014],
          [edge - r - 0.002, y + 0.002, -0.001],
          [edge + 0.006, y + 0.004, face + r * 0.85],
        ],
        [r * 1.05, r, r * 0.95, r * 0.88],
      );
    });
    // thumb: from the heel, round the right edge, tip resting on the wheel
    const tr = 0.0145;
    limb(
      s,
      [
        [0.066, -0.05, -face - 0.012],
        [w / 2 + tr + 0.002, -0.04, 0.0],
        [0.05, -0.04, face + tr * 0.9],
        [0.024, -0.05, face + tr * 0.8],
      ],
      [0.019, tr * 1.08, tr, tr * 0.9],
    );
    // wrist and forearm down to an elbow below the frame
    const wrist: V3 = [0.09, -0.064, -face - 0.02];
    limb(s, [wrist, toLocal(right, [0.33, -0.66, -0.2])], [0.028, 0.038]);
    right.add(merged(s, skinMat));

    const nail: THREE.BufferGeometry[] = [];
    blob(nail, [0.02, -0.0505, face + tr * 0.8 + 0.0122], [0.0085, 0.0075, 0.0026]);
    right.add(merged(nail, nailMat));

    // headphone cord: up out of the jack, over, and down out of the frame
    const jack = (right.children[0]!.userData.jack as THREE.Vector3).toArray() as V3;
    const pts: V3[] = [
      jack,
      [jack[0], jack[1] + 0.02, jack[2]],
      [jack[0] - 0.012, jack[1] + 0.036, jack[2] + 0.004],
      [jack[0] - 0.034, jack[1] + 0.028, jack[2] + 0.01],
      toLocal(right, [0.06, -0.16, -0.5]),
      toLocal(right, [0.02, -0.34, -0.44]),
      toLocal(right, [-0.02, -0.7, -0.34]),
    ];
    const curve = new THREE.CatmullRomCurve3(
      pts.map((p) => new THREE.Vector3(...p)),
      false,
      "centripetal",
    );
    const cord = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.0024, 8, false), cordMat);
    cord.userData.ownsGeometry = true;
    right.add(cord);
  }
  group.add(right);

  // ---- left hand: a loose half-fist held forward, knuckles toward the eye -------
  const left = new THREE.Group();
  left.position.set(-0.26, -0.3, -0.55);
  // fingers pointing away, so the eye sees knuckles rather than a raised palm
  left.rotation.set(-1.15, 0.3, -0.35);
  {
    const s: THREE.BufferGeometry[] = [];
    blob(s, [0, 0, 0], [0.05, 0.054, 0.022]);
    const xs = [0.031, 0.011, -0.009, -0.029];
    const len = [1, 1.08, 1.02, 0.86];
    xs.forEach((x, i) => {
      const k = len[i]!;
      const r = 0.0122 * (i === 3 ? 0.88 : 1);
      limb(
        s,
        [
          [x, 0.036, 0.002],
          [x, 0.036 + 0.032 * k, -0.008],
          [x * 0.95, 0.036 + 0.042 * k, -0.036 * k],
          [x * 0.9, 0.036 + 0.026 * k, -0.052 * k],
        ],
        [r * 1.05, r, r * 0.95, r * 0.88],
      );
    });
    limb(
      s,
      [
        [0.036, -0.02, -0.012],
        [0.054, 0.006, -0.026],
        [0.048, 0.03, -0.042],
        [0.032, 0.046, -0.05],
      ],
      [0.018, 0.0155, 0.0135, 0.0122],
    );
    limb(s, [[0, -0.052, 0], toLocal(left, [-0.36, -0.68, -0.22])], [0.027, 0.038]);
    left.add(merged(s, skinMat));
  }
  group.add(left);

  return { group, left, right };
}

/** Free the per-build geometry of a hands viewmodel that is being replaced. */
export function disposeHands(h: Hands) {
  h.group.traverse((o) => {
    if (o.userData.ownsGeometry) (o as THREE.Mesh).geometry.dispose();
  });
}

export type GirlMood = "none" | "cheer" | "boost" | "sad";

/**
 * Sloan's animation.
 *
 * She is on screen every frame, so the idle matters more than the walk. The
 * old version froze every joint the instant she stopped moving and never
 * reacted to anything that happened in the game.
 */
export function animateGirl(
  root: THREE.Group,
  moving: boolean,
  onGround: boolean,
  t: number,
  dt: number,
  opts?: { speed01?: number; turn?: number; mood?: GirlMood; moodT?: number },
) {
  const u = root.userData;
  const torso = u.torso as THREE.Group;
  const head = u.head as THREE.Group;
  const hips = u.hips as THREE.Group;
  const lLeg = u.leftLeg as THREE.Group;
  const rLeg = u.rightLeg as THREE.Group;
  const lArm = u.leftArm as THREE.Group;
  const rArm = u.rightArm as THREE.Group;

  // her own clock, so she is not locked to the same global sine as everything else
  u.clock = (u.clock ?? Math.random() * 40) + dt;
  const own = u.clock as number;

  const pace = opts?.speed01 ?? (moving ? 1 : 0);
  const turn = opts?.turn ?? 0;
  const mood = opts?.mood ?? "none";
  const moodT = opts?.moodT ?? 0;

  // ---- gait -------------------------------------------------------------
  // stride rate rises with speed, so the juice boost actually reads as running
  const rate = 7 + pace * 7;
  u.walkT = (u.walkT ?? 0) + dt * rate * (pace > 0.05 ? 1 : 0);
  const w = u.walkT as number;
  const swing = Math.sin(w) * (0.3 + pace * 0.45);

  // ---- idle -------------------------------------------------------------
  const idle = 1 - Math.min(1, pace * 3);
  const breath = Math.sin(own * 1.5) * 0.02 * idle;
  // slow weight shift from one foot to the other, on a long cycle
  const shift = Math.sin(own * 0.6) * idle;
  // every so often she glances around
  const glanceCycle = (own * 0.35) % 1;
  const glance = idle * (glanceCycle > 0.82 ? Math.sin((glanceCycle - 0.82) * 19.6) : 0);

  lLeg.rotation.x = swing + shift * 0.04;
  rLeg.rotation.x = -swing - shift * 0.04;
  lArm.rotation.x = -swing * 0.75;
  rArm.rotation.x = swing * 0.75;
  // arms hang slightly out from the body and lift as she speeds up
  lArm.rotation.z = 0.06 + pace * 0.1 + shift * 0.02;
  rArm.rotation.z = -0.06 - pace * 0.1 - shift * 0.02;

  hips.rotation.y = Math.sin(w) * 0.06 * pace;
  hips.position.y = 0.72 + shift * 0.012;

  torso.rotation.y = -Math.sin(w) * 0.09 * pace;
  // lean forward as she runs, and into the turn
  torso.rotation.x = pace * 0.13 + breath;
  torso.rotation.z = THREE.MathUtils.lerp(torso.rotation.z, -turn * 0.28, 0.14);
  torso.position.y = 0.95 + (moving ? Math.abs(Math.sin(w)) * 0.04 : breath * 1.6);

  head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, glance * 0.8 + turn * 0.25, 0.12);
  head.rotation.x = -pace * 0.08;
  head.position.y = 0.67;

  if (!onGround) {
    // tuck on the way up, reach on the way down
    lLeg.rotation.x = 0.5;
    rLeg.rotation.x = -0.25;
    lArm.rotation.x = -0.9;
    rArm.rotation.x = -0.9;
    lArm.rotation.z = 0.5;
    rArm.rotation.z = -0.5;
    torso.rotation.x = 0.1;
  }

  // ---- reactions --------------------------------------------------------
  if (mood !== "none" && moodT > 0) {
    const k = Math.min(1, moodT);
    if (mood === "cheer") {
      // both arms up, a little hop in the spine, head tipped back
      const pump = Math.sin(moodT * 11) * 0.25;
      lArm.rotation.x = -2.5 + pump;
      rArm.rotation.x = -2.5 - pump;
      lArm.rotation.z = 0.55;
      rArm.rotation.z = -0.55;
      torso.rotation.x = -0.18;
      head.rotation.x = -0.22;
      torso.position.y = 0.95 + Math.abs(Math.sin(moodT * 8)) * 0.06;
    } else if (mood === "sad") {
      // shoulders down, head down, arms slack
      torso.rotation.x = 0.26 * k;
      head.rotation.x = 0.32 * k;
      lArm.rotation.x = 0.18;
      rArm.rotation.x = 0.18;
      lArm.rotation.z = 0.02;
      rArm.rotation.z = -0.02;
    } else if (mood === "boost") {
      // arms swept back, deep forward lean
      torso.rotation.x = 0.3;
      lArm.rotation.z = 0.34;
      rArm.rotation.z = -0.34;
      head.rotation.x = -0.1;
    }
  }

  // ---- blink and braids -------------------------------------------------
  const blinkCycle = (own + 2.3) % 3.6;
  const squish = blinkCycle < 0.12 ? 0.12 : 1;
  (u.eyeL as THREE.Group).scale.y = squish;
  (u.eyeR as THREE.Group).scale.y = squish;

  // braids trail behind her and swing wider the faster she goes
  const braidSwing = Math.sin(own * 2.4) * (0.035 + pace * 0.12);
  const braidLag = -turn * 0.35;
  (u.braidL as THREE.Group).rotation.z = -0.2 + braidSwing + braidLag;
  (u.braidR as THREE.Group).rotation.z = 0.2 - braidSwing + braidLag;
  (u.braidL as THREE.Group).rotation.x = pace * 0.25;
  (u.braidR as THREE.Group).rotation.x = pace * 0.25;
}

export function makeDumpling(color: string, accent: string) {
  const g = new THREE.Group();
  const dough = { roughness: 0.46, tex: "dough" as const };

  // plump body, slightly wider than tall
  const body = new THREE.Mesh(sphereGeo, lam(color, dough));
  body.scale.set(0.56, 0.44, 0.56);
  body.position.y = 0.02;
  body.castShadow = true;

  // a flatter base so it sits rather than floats
  const base = new THREE.Mesh(sphereGeo, lam(color, { ...dough, roughness: 0.55 }));
  base.scale.set(0.5, 0.16, 0.5);
  base.position.y = -0.18;

  // the shoulder the pleats are gathered onto
  const shoulder = new THREE.Mesh(sphereGeo, lam(color, dough));
  shoulder.scale.set(0.42, 0.22, 0.42);
  shoulder.position.y = 0.26;
  shoulder.castShadow = true;

  g.add(base, body, shoulder);

  // ring of pleats, each tilted into the next so they swirl toward the knot
  const PLEATS = 11;
  for (let i = 0; i < PLEATS; i++) {
    const a = (i / PLEATS) * Math.PI * 2;
    const fold = new THREE.Mesh(sphereGeo, lam(color, { ...dough, roughness: 0.42 }));
    fold.scale.set(0.1, 0.17, 0.2);
    fold.position.set(Math.cos(a) * 0.3, 0.3, Math.sin(a) * 0.3);
    fold.rotation.y = -a;
    fold.rotation.z = 0.5;
    fold.castShadow = true;
    g.add(fold);

    // the little valley between each pair of pleats
    const gap = new THREE.Mesh(sphereGeo, lam(color, { ...dough, roughness: 0.6 }));
    const ga = a + Math.PI / PLEATS;
    gap.scale.set(0.05, 0.1, 0.1);
    gap.position.set(Math.cos(ga) * 0.28, 0.26, Math.sin(ga) * 0.28);
    gap.rotation.y = -ga;
    g.add(gap);
  }

  // twisted knot on top
  const knot = new THREE.Mesh(sphereGeo, lam(accent, { roughness: 0.4, tex: "dough" }));
  knot.scale.set(0.17, 0.13, 0.17);
  knot.position.y = 0.42;
  knot.castShadow = true;
  const twist = new THREE.Mesh(sphereGeo, lam(accent, { roughness: 0.38 }));
  twist.scale.set(0.09, 0.1, 0.09);
  twist.position.y = 0.52;
  twist.rotation.y = 0.6;
  g.add(knot, twist);

  // steam-sheen and a herb leaf
  const shine = new THREE.Mesh(
    sphereGeo,
    lam("#fff6ee", { roughness: 0.2, opacity: 0.45, transparent: true, flat: true }),
  );
  shine.scale.set(0.16, 0.11, 0.09);
  shine.position.set(0.18, 0.2, 0.38);
  shine.castShadow = false;

  const leaf = new THREE.Mesh(coneGeo, lam("#5a9a4a", { roughness: 0.7, flat: true }));
  leaf.scale.set(0.09, 0.18, 0.06);
  leaf.position.set(0.1, 0.56, 0.02);
  leaf.rotation.z = 0.55;

  g.add(shine, leaf);

  // ---- face -------------------------------------------------------------
  // Its own group so it can turn to look at her. Everything in here is marked
  // noFinish, or the gold and rainbow treatments would paint over the eyes.
  const face = new THREE.Group();
  face.position.y = 0.04;
  g.add(face);

  const dark = "#3a2b20";
  const mark = (m: THREE.Mesh) => {
    m.userData.noFinish = true;
    m.castShadow = false;
    return m;
  };

  const eyes: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    const eye = mark(new THREE.Mesh(sphereGeo, lam(dark, { roughness: 0.3, flat: true })));
    eye.scale.set(0.075, 0.1, 0.05);
    eye.position.set(sx * 0.16, 0.1, 0.49);
    face.add(eye);
    eyes.push(eye);

    const glint = mark(new THREE.Mesh(sphereGeo, lam("#ffffff", { roughness: 0.2, flat: true })));
    glint.scale.set(0.028, 0.032, 0.02);
    glint.position.set(sx * 0.185, 0.14, 0.53);
    face.add(glint);
  }

  const cheeks: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    const cheek = mark(
      new THREE.Mesh(sphereGeo, lam("#f08a8a", { roughness: 0.6, opacity: 0.75, transparent: true, flat: true })),
    );
    cheek.scale.set(0.075, 0.05, 0.04);
    cheek.position.set(sx * 0.29, 0.0, 0.42);
    cheek.visible = false;
    face.add(cheek);
    cheeks.push(cheek);
  }

  // resting mouth: small and closed
  const mouthCalm = mark(new THREE.Mesh(sphereGeo, lam(dark, { roughness: 0.4, flat: true })));
  mouthCalm.scale.set(0.055, 0.03, 0.04);
  mouthCalm.position.set(0, -0.03, 0.5);
  face.add(mouthCalm);

  // delighted mouth: open, with a tongue
  const mouthHappy = mark(new THREE.Mesh(sphereGeo, lam("#7a3a34", { roughness: 0.45, flat: true })));
  mouthHappy.scale.set(0.11, 0.09, 0.06);
  mouthHappy.position.set(0, -0.05, 0.49);
  mouthHappy.visible = false;
  face.add(mouthHappy);

  const tongue = mark(new THREE.Mesh(sphereGeo, lam("#e8697d", { roughness: 0.5, flat: true })));
  tongue.scale.set(0.06, 0.035, 0.04);
  tongue.position.set(0, -0.09, 0.51);
  tongue.visible = false;
  face.add(tongue);

  g.userData.body = body;
  g.userData.face = { face, eyes, cheeks, mouthCalm, mouthHappy, tongue };
  g.scale.setScalar(1.28);
  return g;
}

export type FaceRig = {
  face: THREE.Group;
  eyes: THREE.Mesh[];
  cheeks: THREE.Mesh[];
  mouthCalm: THREE.Mesh;
  mouthHappy: THREE.Mesh;
  tongue: THREE.Mesh;
};

/**
 * Drive a dumpling face.
 *
 * @param seed   per-dumpling offset so they do not all blink in unison
 * @param happy  true during the catch celebration
 * @param lookAt angle to turn toward, or null to face forward
 */
export function animateFace(
  rig: FaceRig,
  t: number,
  seed: number,
  happy: boolean,
  lookAt: number | null,
) {
  // blink: a quick squash roughly every four seconds
  const cycle = (t + seed * 1.7) % 4.2;
  const blinking = cycle < 0.13;
  const openY = happy ? 0.62 : 1;
  const y = blinking ? 0.12 : openY;
  for (const e of rig.eyes) {
    e.scale.y = THREE.MathUtils.lerp(e.scale.y, 0.1 * y, blinking ? 0.55 : 0.25);
    // a touch wider when delighted
    e.scale.x = THREE.MathUtils.lerp(e.scale.x, happy ? 0.088 : 0.075, 0.2);
  }

  rig.mouthCalm.visible = !happy;
  rig.mouthHappy.visible = happy;
  rig.tongue.visible = happy;
  for (const c of rig.cheeks) c.visible = happy;

  if (happy) {
    // a little "aah" wobble while it shows off
    const pulse = 1 + Math.sin(t * 9 + seed) * 0.12;
    rig.mouthHappy.scale.set(0.11 * pulse, 0.09 * pulse, 0.06);
    rig.tongue.position.y = -0.09 - Math.sin(t * 9 + seed) * 0.008;
  }

  if (lookAt == null) {
    rig.face.rotation.y = THREE.MathUtils.lerp(rig.face.rotation.y, 0, 0.08);
  } else {
    // clamped, so it glances at her rather than spinning its face around
    const want = THREE.MathUtils.clamp(lookAt, -1.15, 1.15);
    rig.face.rotation.y = THREE.MathUtils.lerp(rig.face.rotation.y, want, 0.12);
  }
}

export function makeTree(variant = 0, scale = 1) {
  const g = new THREE.Group();
  const trunkC = variant === 1 ? "#7a4a2a" : "#5c3a22";
  const leafC = variant === 2 ? "#3f8a48" : variant === 1 ? "#6bb85a" : "#4e9a46";
  const leafDark = variant === 2 ? "#2f6e38" : variant === 1 ? "#4e9448" : "#3d7a38";
  const trunk = mesh(cylGeo, trunkC, 0.22, 2.2, 0.22, 0, 1.1, 0);
  g.add(trunk);
  g.add(mesh(cylGeo, trunkC, 0.12, 0.8, 0.12, 0.22, 1.7, 0.08));
  if (variant === 2) {
    g.add(mesh(coneGeo, leafDark, 1.55, 2.2, 1.55, 0, 2.9, 0));
    g.add(mesh(coneGeo, leafC, 1.4, 2.0, 1.4, 0, 3.15, 0));
    g.add(mesh(coneGeo, leafC, 1.1, 1.4, 1.1, 0, 3.9, 0));
    g.add(mesh(coneGeo, "#7ec85a", 0.75, 1.0, 0.75, 0, 4.5, 0));
  } else {
    g.add(mesh(sphereGeo, leafDark, 1.05, 0.9, 1.05, 0, 2.85, 0));
    g.add(mesh(sphereGeo, leafC, 1.05, 0.95, 1.05, 0, 3.05, 0));
    g.add(mesh(sphereGeo, leafC, 0.78, 0.7, 0.78, 0.48, 3.15, 0.18));
    g.add(mesh(sphereGeo, leafC, 0.7, 0.62, 0.7, -0.44, 3.2, -0.2));
    g.add(mesh(sphereGeo, "#7ec85a", 0.5, 0.42, 0.5, 0.12, 3.55, 0.32));
    if (variant === 1) {
      g.add(mesh(sphereGeo, "#d45a4a", 0.12, 0.12, 0.12, 0.55, 2.85, 0.4, false));
      g.add(mesh(sphereGeo, "#d45a4a", 0.1, 0.1, 0.1, -0.35, 3.05, 0.5, false));
    }
  }
  g.scale.setScalar(scale);
  return g;
}

export function makeHouse(body: string, roof: string, w = 6, d = 5) {
  const g = new THREE.Group();
  g.add(mesh(boxGeo, body, w, 4.2, d, 0, 2.1, 0));
  g.add(mesh(boxGeo, "#fff6ee", w + 0.12, 0.16, d + 0.12, 0, 3.95, 0, false));
  const roofM = new THREE.Mesh(cone4Geo, lam(roof, { roughness: 0.7 }));
  roofM.scale.set(w * 0.78, 2.4, d * 0.78);
  roofM.position.y = 5.2;
  roofM.rotation.y = Math.PI / 4;
  roofM.castShadow = true;
  g.add(roofM);
  g.add(mesh(boxGeo, "#8a5040", 0.7, 1.2, 0.7, w * 0.28, 5.7, -d * 0.12));
  g.add(mesh(boxGeo, "#5a3a28", 1.1, 2, 0.12, 0, 1.05, d * 0.5 + 0.02, false));
  g.add(mesh(boxGeo, "#c4a070", 1.18, 0.12, 0.14, 0, 2.08, d * 0.5 + 0.04, false));
  g.add(mesh(boxGeo, "#f2e28a", 0.9, 0.9, 0.08, -w * 0.22, 2.6, d * 0.5 + 0.02, false));
  g.add(mesh(boxGeo, "#f2e28a", 0.9, 0.9, 0.08, w * 0.22, 2.6, d * 0.5 + 0.02, false));
  g.add(mesh(boxGeo, "#d8c49a", 1.05, 0.12, 0.1, -w * 0.22, 3.1, d * 0.5 + 0.03, false));
  g.add(mesh(boxGeo, "#d8c49a", 1.05, 0.12, 0.1, w * 0.22, 3.1, d * 0.5 + 0.03, false));
  g.add(mesh(boxGeo, "#c4b48a", w + 0.8, 0.18, 1.4, 0, 0.1, d * 0.5 + 0.4, false));
  g.add(mesh(boxGeo, "#b8a078", w + 0.5, 0.12, 0.2, 0, 0.22, d * 0.5 + 1.0, false));
  return g;
}

export function makeCloud(scale = 1) {
  const g = new THREE.Group();
  const c = lam("#f7fbff", { roughness: 0.92, opacity: 0.94, transparent: true });
  const add = (x: number, y: number, z: number, s: number) => {
    const m = new THREE.Mesh(sphereGeo, c);
    m.scale.set(s, s * 0.72, s * 0.9);
    m.position.set(x, y, z);
    m.castShadow = false;
    g.add(m);
  };
  add(0, 0, 0, 1.5);
  add(1.4, 0.12, 0.2, 1.15);
  add(-1.3, 0.08, -0.18, 1.05);
  add(0.25, 0.55, -0.35, 0.95);
  add(-0.5, 0.35, 0.45, 0.8);
  add(0.9, 0.28, -0.7, 0.7);
  g.scale.setScalar(scale);
  g.userData.cloudDrift = true;
  return g;
}

export function makeLollipop(candy: string) {
  const g = new THREE.Group();
  g.add(mesh(cylGeo, "#f0e8dc", 0.08, 2.4, 0.08, 0, 1.2, 0, false));
  g.add(mesh(sphereGeo, candy, 0.7, 0.7, 0.22, 0, 2.5, 0));
  g.add(mesh(sphereGeo, "#fff6ee", 0.28, 0.28, 0.08, 0.18, 2.62, 0.16, false));
  return g;
}

/**
 * Tiered stone fountain. Basin with a coping rim you can sit on, a carved
 * pedestal, two bowls, arcing jets and falling sheets of water.
 */
export function makeFountain() {
  const g = new THREE.Group();
  const stone = "#d9d2c6";
  const shade = "#bdb4a4";
  const wet = "#9fd4ea";

  // basin: floor, water, and a rim built from blocks so it reads as masonry
  g.add(mesh(cylGeo, shade, 3.2, 0.3, 3.2, 0, 0.15, 0));
  g.add(mesh(cylGeo, "#6cb4d4", 2.95, 0.26, 2.95, 0, 0.42, 0, false));
  const rimBlocks = 16;
  for (let i = 0; i < rimBlocks; i++) {
    const a = (i / rimBlocks) * Math.PI * 2;
    const b = mesh(boxGeo, i % 2 ? stone : shade, 0.68, 0.46, 0.5, Math.cos(a) * 3.1, 0.35, Math.sin(a) * 3.1);
    b.rotation.y = -a;
    g.add(b);
  }

  // pedestal
  g.add(mesh(cylGeo, stone, 1.15, 0.28, 1.15, 0, 0.6, 0));
  g.add(mesh(cylGeo, shade, 0.62, 1.2, 0.62, 0, 1.3, 0));
  // fluting
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.add(mesh(cylGeo, stone, 0.1, 1.1, 0.1, Math.cos(a) * 0.58, 1.3, Math.sin(a) * 0.58, false));
  }

  // lower bowl
  g.add(mesh(cylGeo, stone, 1.7, 0.16, 1.7, 0, 1.98, 0));
  g.add(mesh(cylGeo, shade, 1.55, 0.14, 1.55, 0, 2.08, 0, false));
  g.add(mesh(cylGeo, "#7ec4de", 1.42, 0.1, 1.42, 0, 2.13, 0, false));
  // water sheeting over the lip
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.add(mesh(boxGeo, wet, 0.26, 1.5, 0.1, Math.cos(a) * 1.66, 1.3, Math.sin(a) * 1.66, false));
  }

  // upper stem and bowl
  g.add(mesh(cylGeo, shade, 0.34, 0.9, 0.34, 0, 2.6, 0));
  g.add(mesh(cylGeo, stone, 0.95, 0.14, 0.95, 0, 3.1, 0));
  g.add(mesh(cylGeo, "#7ec4de", 0.8, 0.1, 0.8, 0, 3.18, 0, false));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    g.add(mesh(boxGeo, wet, 0.2, 0.95, 0.09, Math.cos(a) * 0.9, 2.65, Math.sin(a) * 0.9, false));
  }

  // finial and the jet plume
  g.add(mesh(sphereGeo, stone, 0.26, 0.3, 0.26, 0, 3.35, 0, false));
  g.add(mesh(cylGeo, wet, 0.11, 1.5, 0.11, 0, 4.2, 0, false));
  g.add(mesh(sphereGeo, "#e4f6ff", 0.3, 0.26, 0.3, 0, 4.95, 0, false));
  // arcs falling back into the basin
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    for (let k = 0; k < 4; k++) {
      const t = k / 3;
      const r = 0.4 + t * 2.2;
      const y = 4.7 - t * t * 3.4;
      g.add(mesh(sphereGeo, wet, 0.13, 0.13, 0.13, Math.cos(a) * r, y, Math.sin(a) * r, false));
    }
  }

  return g;
}

/**
 * Pond dressing: a shallow shelf, a stone and sand bank, cattails, lily pads
 * and a couple of rocks. The water plane itself is built by the world builder.
 */
export function makePondEdge(r: number) {
  const g = new THREE.Group();

  // sandy shelf just under the surface, then a stone bank ring
  g.add(mesh(cylGeo, "#cbb894", r * 1.02, 0.14, r * 1.02, 0, -0.03, 0, false));
  const rocks = Math.max(14, Math.round(r * 2.4));
  for (let i = 0; i < rocks; i++) {
    const a = (i / rocks) * Math.PI * 2;
    const rr = r + 0.5 + ((i * 37) % 5) * 0.12;
    const s = 0.5 + ((i * 53) % 7) * 0.09;
    const rock = mesh(
      sphereGeo,
      i % 3 === 0 ? "#9a948a" : i % 3 === 1 ? "#b0a89a" : "#877f74",
      s,
      s * 0.62,
      s * 0.9,
      Math.cos(a) * rr,
      0.1,
      Math.sin(a) * rr,
    );
    rock.rotation.y = a;
    g.add(rock);
  }

  // cattails in clumps on one side
  for (let i = 0; i < 18; i++) {
    const a = Math.PI * 0.15 + (i / 18) * Math.PI * 0.8;
    const rr = r - 0.4 + ((i * 29) % 4) * 0.3;
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;
    const h = 1.1 + ((i * 17) % 5) * 0.16;
    g.add(mesh(cylGeo, "#5a8a4a", 0.045, h, 0.045, x, h / 2, z, false));
    g.add(mesh(cylGeo, "#6a4a2a", 0.09, 0.34, 0.09, x, h + 0.12, z, false));
    g.add(mesh(boxGeo, "#5f9450", 0.06, 0.8, 0.02, x + 0.12, h * 0.5, z, false));
  }

  // lily pads with the odd flower
  for (let i = 0; i < 11; i++) {
    const a = (i * 2.399) % (Math.PI * 2);
    const rr = (r - 1.6) * (0.25 + ((i * 41) % 9) / 12);
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;
    const s = 0.4 + ((i * 23) % 5) * 0.08;
    g.add(mesh(cylGeo, i % 2 ? "#3f8a4a" : "#4f9a52", s, 0.05, s, x, 0.12, z, false));
    if (i % 4 === 0) {
      g.add(mesh(sphereGeo, "#f0a8c4", 0.15, 0.16, 0.15, x + 0.1, 0.22, z, false));
      g.add(mesh(sphereGeo, "#fff0f6", 0.08, 0.09, 0.08, x + 0.1, 0.3, z, false));
    }
  }

  // two bigger rocks breaking the surface
  g.add(mesh(sphereGeo, "#8d867c", 1.1, 0.7, 0.95, r * 0.42, 0.22, -r * 0.5));
  g.add(mesh(sphereGeo, "#a09890", 0.7, 0.5, 0.65, r * 0.55, 0.16, -r * 0.34));

  return g;
}

/**
 * Treehouse: a real trunk coming up through the deck, plank floor, railings,
 * a pitched shingle roof, a window hole and a rope ladder.
 */
export function makeTreehouse() {
  const g = new THREE.Group();
  const plank = "#c49a62";
  const dark = "#8a5a32";
  const roof = "#b8453c";

  // trunk and the boughs that hold the deck up
  g.add(mesh(cylGeo, dark, 0.62, 5.6, 0.62, 0, 2.8, 0));
  for (const [x, z] of [
    [-1.5, -1.2],
    [1.5, -1.2],
    [-1.5, 1.2],
    [1.5, 1.2],
  ] as [number, number][]) {
    const brace = mesh(boxGeo, dark, 0.26, 1.9, 0.26, x * 0.62, 2.55, z * 0.62, true);
    brace.rotation.z = x > 0 ? -0.5 : 0.5;
    brace.rotation.x = z > 0 ? -0.4 : 0.4;
    g.add(brace);
  }

  // deck: individual planks so it reads as boards, not a slab
  for (let i = 0; i < 9; i++) {
    g.add(mesh(boxGeo, i % 2 ? plank : "#b98d58", 5.2, 0.16, 0.52, 0, 3.55, -2.3 + i * 0.58));
  }
  g.add(mesh(boxGeo, dark, 5.4, 0.2, 0.3, 0, 3.4, -2.6, false));
  g.add(mesh(boxGeo, dark, 5.4, 0.2, 0.3, 0, 3.4, 2.6, false));

  // railings with balusters, open on the ladder side
  const rail = (x: number, z: number, w: number, d: number) => {
    g.add(mesh(boxGeo, plank, w, 0.14, d, x, 4.5, z, false));
    const n = Math.max(3, Math.round(Math.max(w, d) / 0.55));
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const bx = w > d ? x - w / 2 + t * w : x;
      const bz = d > w ? z - d / 2 + t * d : z;
      g.add(mesh(boxGeo, plank, 0.12, 0.86, 0.12, bx, 4.06, bz, false));
    }
  };
  // front is the entrance, so the rail stops short on both sides
  rail(-1.95, -2.5, 1.3, 0.16);
  rail(1.95, -2.5, 1.3, 0.16);
  rail(-2.5, 0.6, 0.16, 3.8);
  rail(2.5, 0.6, 0.16, 3.8);

  // walls at the back, with a window cut by leaving a gap
  g.add(mesh(boxGeo, plank, 5.2, 1.9, 0.18, 0, 4.6, 2.5));
  g.add(mesh(boxGeo, plank, 0.18, 1.9, 1.6, -2.5, 4.6, 1.8, false));
  g.add(mesh(boxGeo, dark, 1.5, 0.12, 0.24, -1.2, 4.3, 2.42, false));
  g.add(mesh(boxGeo, dark, 1.5, 0.12, 0.24, -1.2, 5.1, 2.42, false));

  // pitched roof from two slabs plus a ridge
  const left = mesh(boxGeo, roof, 3.4, 0.18, 5.6, -1.25, 6.2, 0.2);
  left.rotation.z = 0.62;
  g.add(left);
  const right = mesh(boxGeo, roof, 3.4, 0.18, 5.6, 1.25, 6.2, 0.2);
  right.rotation.z = -0.62;
  g.add(right);
  g.add(mesh(boxGeo, "#8a332c", 0.4, 0.26, 5.8, 0, 6.95, 0.2, false));
  // shingle courses
  for (let i = 0; i < 4; i++) {
    const l = mesh(boxGeo, "#a33c34", 0.5, 0.06, 5.7, -0.6 - i * 0.62, 6.62 - i * 0.44, 0.2, false);
    l.rotation.z = 0.62;
    g.add(l);
    const rr = mesh(boxGeo, "#a33c34", 0.5, 0.06, 5.7, 0.6 + i * 0.62, 6.62 - i * 0.44, 0.2, false);
    rr.rotation.z = -0.62;
    g.add(rr);
  }

  // rope ladder down the front
  for (const s of [-1, 1]) {
    g.add(mesh(cylGeo, "#d8c49a", 0.05, 3.5, 0.05, s * 0.45, 1.75, -2.75, false));
  }
  for (let i = 0; i < 7; i++) {
    g.add(mesh(boxGeo, dark, 1.1, 0.1, 0.16, 0, 0.5 + i * 0.48, -2.75, false));
  }

  // canopy above so it actually sits in a tree
  g.add(mesh(sphereGeo, "#4f9a52", 3.4, 2.2, 3.4, 0, 8.4, 0));
  g.add(mesh(sphereGeo, "#5aa85c", 2.4, 1.7, 2.4, -2.2, 7.6, 1.4));
  g.add(mesh(sphereGeo, "#478a48", 2.2, 1.5, 2.2, 2.4, 7.4, -1.2));

  return g;
}

/**
 * Cave mouth: a dark arched opening with a rock lip, stalactites and a recess
 * behind it, so there is somewhere to actually walk into.
 */
export function makeCaveMouth(width = 5, height = 3.6, depth = 7.5) {
  const g = new THREE.Group();
  const rock = "#6a655d";
  const rockLight = "#847d73";
  const rockDark = "#4a4741";
  const inner = "#231f1c";

  // ---- the hollow: floor, back wall, sides, ceiling.
  // Interiors are near-black and rough so a glowing dumpling actually reads.
  const floor = mesh(boxGeo, "#332f2a", width + 0.6, 0.24, depth, 0, 0.12, -depth / 2, false);
  g.add(floor);
  g.add(mesh(boxGeo, inner, width + 1.2, height + 0.6, 0.5, 0, height / 2, -depth, false));
  g.add(mesh(boxGeo, rockDark, 0.7, height + 0.4, depth, -width / 2 - 0.2, height / 2, -depth / 2, false));
  g.add(mesh(boxGeo, rockDark, 0.7, height + 0.4, depth, width / 2 + 0.2, height / 2, -depth / 2, false));
  g.add(mesh(boxGeo, rockDark, width + 1.6, 0.7, depth, 0, height + 0.2, -depth / 2, false));

  // the passage narrows as it goes in, which sells the depth
  for (let i = 1; i <= 4; i++) {
    const t = i / 5;
    const w = width * (1 - t * 0.45);
    const h = height * (1 - t * 0.3);
    const z = -depth * t;
    for (const sx of [-1, 1]) {
      const lump = mesh(sphereGeo, i % 2 ? rock : rockDark, 0.9, h * 0.6, 1.2, (sx * w) / 2, h * 0.45, z, false);
      lump.rotation.y = sx * 0.4;
      g.add(lump);
    }
    g.add(mesh(sphereGeo, rockDark, w * 0.55, 0.55, 1.1, 0, h + 0.1, z, false));
  }

  // ---- arched mouth, built from overlapping boulders so the rim is irregular
  const steps = 11;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const a = Math.PI * t;
    const x = Math.cos(a) * (width / 2 + 0.45);
    const y = Math.sin(a) * (height + 0.35);
    const s = 0.7 + Math.sin(a) * 0.5 + ((i * 17) % 5) * 0.06;
    const b = mesh(sphereGeo, i % 3 === 0 ? rockLight : i % 3 === 1 ? rock : rockDark, s, s * 0.85, 0.95, x, Math.max(0.35, y), 0.25);
    b.rotation.y = a;
    b.rotation.z = (i % 2 ? 1 : -1) * 0.3;
    g.add(b);
  }

  // boulders and rubble at the entrance
  g.add(mesh(sphereGeo, rockLight, 1.5, 1.05, 1.3, -width / 2 - 1.1, 0.5, 1.2));
  g.add(mesh(sphereGeo, rock, 1.05, 0.8, 0.95, width / 2 + 1.0, 0.4, 1.4));
  g.add(mesh(sphereGeo, rockDark, 0.7, 0.5, 0.65, width / 2 + 1.8, 0.24, 0.4, false));
  for (let i = 0; i < 7; i++) {
    const a = -0.6 + (i / 6) * 2.2;
    g.add(
      mesh(
        sphereGeo,
        i % 2 ? rock : rockLight,
        0.3 + (i % 3) * 0.1,
        0.2,
        0.28,
        Math.cos(a) * (width / 2 + 0.9),
        0.14,
        1.9 + (i % 3) * 0.4,
        false,
      ),
    );
  }

  // ---- stalactites above, stalagmites below
  for (let i = 0; i < 8; i++) {
    const x = -width / 2 + 0.7 + (i * (width - 1.4)) / 7;
    const h = 0.5 + ((i * 31) % 6) * 0.17;
    const t = new THREE.Mesh(coneGeo, lam(rockLight, { flat: true }));
    t.scale.set(0.2, h, 0.2);
    t.rotation.x = Math.PI;
    t.position.set(x, height - h / 2, -0.7 - (i % 4) * 1.5);
    g.add(t);
  }
  for (let i = 0; i < 5; i++) {
    const t = new THREE.Mesh(coneGeo, lam(rock, { flat: true }));
    const h = 0.4 + (i % 3) * 0.2;
    t.scale.set(0.26, h, 0.26);
    t.position.set(-1.4 + i * 0.75, h / 2 + 0.2, -1.8 - i * 1.1);
    g.add(t);
  }

  // (pillars and the pool used to live here; the chamber now has a baffle
  // wall, steps and a raised ledge, and more rock in the middle made the
  // room hard to read)

  // ---- a few crystals, so the dark has something to catch the glow
  for (let i = 0; i < 14; i++) {
    const c = new THREE.Mesh(
      coneGeo,
      lam("#7fd8e8", { emissive: "#3fa8c8", roughness: 0.25, flat: true }),
    );
    const h = 0.28 + (i % 3) * 0.14;
    c.scale.set(0.12, h, 0.12);
    const sx = i % 2 ? 1 : -1;
    c.position.set(sx * (width / 2 - 0.6), 0.4 + (i % 4) * 0.8, -1.5 - (i % 7) * (depth / 8));
    c.rotation.z = sx * 0.4;
    g.add(c);
  }

  return g;
}

export function makeGazebo() {
  const g = new THREE.Group();
  const posts = [
    [-1.6, -1.6],
    [1.6, -1.6],
    [-1.6, 1.6],
    [1.6, 1.6],
  ];
  for (const [x, z] of posts) {
    g.add(mesh(cylGeo, "#e8d7b8", 0.12, 2.6, 0.12, x, 1.3, z));
    g.add(mesh(cylGeo, "#d4c09a", 0.16, 0.12, 0.16, x, 2.62, z, false));
  }
  g.add(mesh(cone4Geo, "#d45a4a", 2.6, 1.3, 2.6, 0, 3.1, 0));
  g.add(mesh(cone4Geo, "#c44a42", 1.4, 0.55, 1.4, 0, 3.7, 0));
  g.add(mesh(cylGeo, "#efe4d0", 2.1, 0.12, 2.1, 0, 0.06, 0, false));
  g.add(mesh(cylGeo, "#e2d2b4", 2.2, 0.08, 2.2, 0, 2.62, 0, false));
  return g;
}

export function makeSlide() {
  const g = new THREE.Group();
  g.add(mesh(boxGeo, "#f0c44a", 2.2, 2.6, 2.2, 0, 1.3, 0));
  g.add(mesh(boxGeo, "#e8b83a", 2.3, 0.12, 2.3, 0, 2.64, 0, false));
  const ramp = mesh(boxGeo, "#4f93c4", 1.4, 0.18, 4.2, 0, 1.2, 2.4);
  ramp.rotation.x = -0.55;
  g.add(ramp);
  g.add(mesh(boxGeo, "#d45a4a", 0.16, 0.7, 3.6, -0.7, 1.45, 2.2));
  g.add(mesh(boxGeo, "#d45a4a", 0.16, 0.7, 3.6, 0.7, 1.45, 2.2));
  g.add(mesh(boxGeo, "#e8d7b8", 0.4, 2.4, 0.4, -0.7, 2.4, -0.7));
  g.add(mesh(boxGeo, "#e8d7b8", 0.4, 0.18, 0.18, -0.7, 3.5, -0.2));
  g.add(mesh(boxGeo, "#e8d7b8", 0.4, 0.18, 0.18, -0.7, 3.2, 0.15));
  g.add(mesh(cylGeo, "#f0c44a", 0.22, 0.16, 0.22, 0.7, 2.72, 0.7, false));
  return g;
}

export function grassTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#4fa056";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2200; i++) {
    const shade = Math.random();
    g.fillStyle = shade > 0.66 ? "#6fbf62" : shade > 0.33 ? "#4e9a4e" : "#3f8a44";
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    g.fillRect(x, y, 1 + Math.random() * 2, 3 + Math.random() * 5);
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = Math.random() > 0.5 ? "#e8c46a" : "#d45a4a";
    g.beginPath();
    g.arc(Math.random() * 256, Math.random() * 256, 1.2, 0, Math.PI * 2);
    g.fill();
  }
  for (let y = 18; y < 256; y += 32) {
    for (let x = 18; x < 256; x += 32) {
      g.fillStyle = "rgba(255,255,255,0.16)";
      g.beginPath();
      g.arc(x, y, 5, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(255,255,255,0.1)";
      g.lineWidth = 1;
      g.beginPath();
      g.arc(x, y, 7, 0, Math.PI * 2);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(56, 56);
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

export function pathTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#d4c094";
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 220; i++) {
    g.fillStyle = Math.random() > 0.5 ? "#c4b086" : "#e4d4b0";
    g.beginPath();
    g.ellipse(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 4, 1.5 + Math.random() * 3, Math.random(), 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(6, 28);
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

export function makeSky() {
  const geo = new THREE.SphereGeometry(340, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color("#6eb6e8") },
      uMid: { value: new THREE.Color("#b7dcfa") },
      uHorizon: { value: new THREE.Color("#f3e2c4") },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 uTop;
      uniform vec3 uMid;
      uniform vec3 uHorizon;
      void main() {
        float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(uHorizon, uMid, smoothstep(0.38, 0.55, h));
        col = mix(col, uTop, smoothstep(0.58, 0.92, h));
        float sun = pow(max(0.0, dot(normalize(vDir), normalize(vec3(0.35, 0.62, -0.4)))), 48.0);
        col += vec3(1.0, 0.92, 0.7) * sun * 0.55;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

export function makeWaterMaterial(hex: string) {
  const deep = new THREE.Color(hex).lerp(new THREE.Color("#7eb8d8"), 0.35);
  const shallow = new THREE.Color("#dff4ff");
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: deep },
      uShallow: { value: shallow },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: `
      varying vec3 vWorld;
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      void main() {
        float w = sin(vWorld.x * 0.55 + uTime * 1.3) * 0.5 + cos(vWorld.z * 0.48 + uTime * 1.05) * 0.5;
        vec3 col = mix(uDeep, uShallow, 0.45 + 0.45 * w);
        float spark = pow(max(0.0, sin(vWorld.x * 2.4 + uTime * 2.8) * sin(vWorld.z * 2.1 + 0.7)), 10.0);
        col += vec3(0.75, 0.88, 0.92) * spark;
        gl_FragColor = vec4(col, 0.72);
      }
    `,
  });
}

export { boxGeo, sphereGeo, cylGeo, coneGeo, cone4Geo };

export type FerrisWheel = {
  group: THREE.Group;
  /** rotates about z; gondolas hang from it */
  hub: THREE.Group;
  gondolas: THREE.Group[];
  radius: number;
  hubY: number;
  /** where she stands to board, in the wheel's local frame */
  boardLocal: THREE.Vector3;
  /** the wheel's own frame: origin at the ground under the hub */
  origin: THREE.Vector3;
};

const wheelRimGeo = new THREE.TorusGeometry(1, 0.11, 8, 48);

/**
 * A ferris wheel she can ride. The wheel turns in the x-y plane about a
 * z axis; two A-frames hold the hub, two rims carry eight gondolas that
 * counter-rotate every frame so they hang level. Colliders for the foot pads,
 * the fence and the boarding platform are in colliders.ts; the moving parts
 * have none, and the whole thing is kept out of the static merge.
 */
export function makeFerrisWheel(radius = 6, hubY = 7.8, count = 8): FerrisWheel {
  const group = new THREE.Group();
  const frame = "#d45a4a";
  const steel = "#5a6470";
  const pale = "#f4f0ea";
  const flat = (c: string, roughness = 0.5) => lam(c, { flat: true, roughness });

  // A-frames: slanted legs from foot pads up to the hub, on both sides
  const legLen = Math.hypot(3.6, hubY);
  const legTilt = Math.atan2(3.6, hubY);
  for (const z of [-2.2, 2.2]) {
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(cylGeo, flat(frame));
      leg.scale.set(0.22, legLen, 0.22);
      leg.position.set(s * 1.8, hubY / 2, z);
      leg.rotation.z = s * legTilt;
      leg.castShadow = true;
      group.add(leg);
      const pad = mesh(boxGeo, steel, 0.9, 0.5, 0.9, s * 3.6, 0.25, z);
      group.add(pad);
    }
    // a brace between the legs part way up
    group.add(mesh(boxGeo, frame, 3.2, 0.18, 0.18, 0, hubY * 0.55, z, false));
  }
  // axle through both A-frames
  const axle = new THREE.Mesh(cylGeo, flat(steel, 0.35));
  axle.scale.set(0.28, 5.4, 0.28);
  axle.position.set(0, hubY, 0);
  axle.rotation.x = Math.PI / 2;
  group.add(axle);

  // the rotating hub
  const hub = new THREE.Group();
  hub.position.set(0, hubY, 0);
  group.add(hub);
  for (const z of [-1.4, 1.4]) {
    const rim = new THREE.Mesh(wheelRimGeo, flat(frame));
    rim.scale.set(radius, radius, 1);
    rim.position.z = z;
    rim.castShadow = true;
    hub.add(rim);
    const cap = new THREE.Mesh(cylGeo, flat(pale, 0.35));
    cap.scale.set(0.55, 0.3, 0.55);
    cap.position.z = z;
    cap.rotation.x = Math.PI / 2;
    hub.add(cap);
  }
  const gondolas: THREE.Group[] = [];
  const colours = ["#4f93c4", "#ffc53d", "#3fa35c", "#e8455f", "#d47a96", "#7ec4e8", "#d4894a", "#b8e0c8"];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    // spokes on both rims
    for (const z of [-1.4, 1.4]) {
      const spoke = new THREE.Mesh(cylGeo, flat(frame));
      spoke.scale.set(0.09, radius, 0.09);
      spoke.position.set((Math.cos(a) * radius) / 2, (Math.sin(a) * radius) / 2, z);
      spoke.rotation.z = a - Math.PI / 2;
      hub.add(spoke);
    }
    // hanger bar across the two rims, and the gondola pivoting from its middle
    const bar = new THREE.Mesh(cylGeo, flat(steel, 0.35));
    bar.scale.set(0.08, 2.8, 0.08);
    bar.position.set(Math.cos(a) * radius, Math.sin(a) * radius, 0);
    bar.rotation.x = Math.PI / 2;
    hub.add(bar);

    const g = new THREE.Group();
    g.position.set(Math.cos(a) * radius, Math.sin(a) * radius, 0);
    const c = colours[i % colours.length]!;
    // hangers, bucket, roof
    g.add(mesh(boxGeo, steel, 0.08, 0.8, 0.08, -0.6, -0.4, 0, false));
    g.add(mesh(boxGeo, steel, 0.08, 0.8, 0.08, 0.6, -0.4, 0, false));
    g.add(mesh(boxGeo, c, 1.6, 0.9, 1.4, 0, -1.25, 0));
    g.add(mesh(boxGeo, "#f7f3ee", 1.4, 0.1, 1.2, 0, -0.85, 0, false)); // rail top
    g.add(mesh(boxGeo, c, 1.75, 0.12, 1.55, 0, -0.05, 0, false)); // roof
    g.userData.seatY = -1.7; // where her feet go, relative to the pivot
    hub.add(g);
    gondolas.push(g);
  }

  // fence around the sweep, open on the +z side where the platform is
  const fenceY = 0.45;
  const fh = 0.9;
  group.add(mesh(boxGeo, pale, 14.4, fh, 0.12, 0, fenceY, -3.2, false));
  group.add(mesh(boxGeo, pale, 0.12, fh, 6.4, -7.2, fenceY, 0, false));
  group.add(mesh(boxGeo, pale, 0.12, fh, 6.4, 7.2, fenceY, 0, false));
  group.add(mesh(boxGeo, pale, 5.4, fh, 0.12, -4.5, fenceY, 3.2, false));
  group.add(mesh(boxGeo, pale, 5.4, fh, 0.12, 4.5, fenceY, 3.2, false));
  // boarding platform, with a step, in the fence gap
  group.add(mesh(boxGeo, steel, 3.2, 0.6, 1.6, 0, 0.3, 4.0));
  group.add(mesh(boxGeo, steel, 3.2, 0.3, 0.8, 0, 0.15, 5.2));
  group.add(mesh(boxGeo, "#ffc53d", 3.2, 0.08, 1.6, 0, 0.62, 4.0, false));

  return {
    group,
    hub,
    gondolas,
    radius,
    hubY,
    boardLocal: new THREE.Vector3(0, 0.6, 4.0),
    origin: new THREE.Vector3(),
  };
}

/** A-frame camping tent: pyramid on a groundsheet with a dark door flap. */
export function makeTent(color: string) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(cone4Geo, lam(color, { flat: true, roughness: 0.75 }));
  body.scale.set(1.75, 2.2, 1.75);
  body.position.y = 1.1;
  body.rotation.y = Math.PI / 4;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  g.add(mesh(boxGeo, "#6a5a48", 2.8, 0.08, 2.8, 0, 0.04, 0, false));
  const door = mesh(boxGeo, "#2f2a26", 0.8, 1.05, 0.08, 0, 0.5, 1.02, false);
  door.rotation.x = -Math.atan2(1.25, 2.2);
  g.add(door);
  // guy-line pegs
  for (const [x, z] of [
    [-1.7, 0],
    [1.7, 0],
    [0, -1.7],
  ]) {
    g.add(mesh(cylGeo, "#8a7a68", 0.05, 0.25, 0.05, x, 0.12, z, false));
  }
  return g;
}

/**
 * A little red farm tractor, nose toward +x: big lugged rear wheels and small
 * front ones lying on their sides with yellow rims, a hood with a grille and
 * headlights, an exhaust stack, fenders, a seat and steering wheel, and a
 * sun roof on a roll frame. About 3.6m long, 2.5m wide and 2.7m tall.
 */
const wheelGeo = new THREE.CylinderGeometry(1, 1, 1, 28);
export function makeTractor() {
  const g = new THREE.Group();
  const red = "#c9442f";
  const tyre = "#2a2724";
  const rim = "#f0c44a";
  const steel = "#5a6470";
  const flat = (c: string, roughness = 0.55) => lam(c, { flat: true, roughness });
  const add = (o: THREE.Mesh, shadow = true) => {
    o.castShadow = shadow;
    o.receiveShadow = true;
    g.add(o);
    return o;
  };
  // a wheel on its side: axle along z
  const wheel = (x: number, z: number, r: number, w: number, lugs: number) => {
    const y = r;
    const t = add(new THREE.Mesh(wheelGeo, flat(tyre, 0.9)));
    t.scale.set(r, w, r);
    t.rotation.x = Math.PI / 2;
    t.position.set(x, y, z);
    // chunky tread lugs round the rim
    for (let i = 0; i < lugs; i++) {
      const a = (i / lugs) * Math.PI * 2;
      const lug = add(new THREE.Mesh(beveledBox(r * 0.22, 0.09, w * 0.9), flat(tyre, 0.9)), false);
      lug.position.set(x + Math.cos(a) * (r + 0.02), y + Math.sin(a) * (r + 0.02), z);
      lug.rotation.z = a + Math.PI / 2;
    }
    // rim and hub on the outside face
    const side = Math.sign(z);
    const rimM = add(new THREE.Mesh(wheelGeo, flat(rim, 0.4)), false);
    rimM.scale.set(r * 0.62, 0.06, r * 0.62);
    rimM.rotation.x = Math.PI / 2;
    rimM.position.set(x, y, z + side * (w / 2 + 0.01));
    const hub = add(new THREE.Mesh(wheelGeo, flat(steel, 0.35)), false);
    hub.scale.set(r * 0.2, 0.1, r * 0.2);
    hub.rotation.x = Math.PI / 2;
    hub.position.set(x, y, z + side * (w / 2 + 0.05));
  };
  wheel(-0.85, 0.98, 0.78, 0.5, 14);
  wheel(-0.85, -0.98, 0.78, 0.5, 14);
  wheel(1.2, 0.8, 0.44, 0.3, 10);
  wheel(1.2, -0.8, 0.44, 0.3, 10);

  // chassis, engine and hood
  add(mesh(boxGeo, "#3a3632", 3.0, 0.3, 0.7, 0.2, 0.55, 0));
  add(mesh(boxGeo, red, 1.9, 0.75, 0.95, 0.75, 1.05, 0));
  add(mesh(boxGeo, "#2f2a26", 0.08, 0.6, 0.8, 1.72, 1.02, 0, false)); // grille
  for (const z of [-0.3, 0.3]) {
    add(mesh(boxGeo, "#fff4c8", 0.06, 0.16, 0.2, 1.76, 1.22, z, false)); // headlights
  }
  // exhaust stack with a cap
  const stack = add(new THREE.Mesh(wheelGeo, flat("#a8b0b8", 0.3)), false);
  stack.scale.set(0.07, 0.9, 0.07);
  stack.position.set(1.2, 1.85, 0.3);
  add(mesh(boxGeo, "#3a3632", 0.2, 0.06, 0.2, 1.2, 2.32, 0.3, false));

  // rear body, fenders over the big wheels, seat and steering wheel
  add(mesh(boxGeo, red, 1.2, 0.6, 1.1, -0.75, 1.0, 0));
  for (const z of [-0.98, 0.98]) {
    add(mesh(boxGeo, red, 1.5, 0.1, 0.62, -0.85, 1.66, z, false));
    add(mesh(boxGeo, red, 0.1, 0.5, 0.62, -0.12, 1.42, z, false));
  }
  add(mesh(boxGeo, "#2f2a26", 0.55, 0.14, 0.6, -0.95, 1.4, 0, false)); // seat
  add(mesh(boxGeo, "#2f2a26", 0.12, 0.6, 0.6, -1.25, 1.7, 0, false)); // seat back
  const column = add(new THREE.Mesh(wheelGeo, flat(steel, 0.35)), false);
  column.scale.set(0.04, 0.55, 0.04);
  column.position.set(-0.25, 1.62, 0);
  column.rotation.z = 0.6;
  const steer = add(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 8, 20), flat("#2f2a26", 0.5)), false);
  steer.position.set(-0.38, 1.85, 0);
  steer.rotation.y = Math.PI / 2;
  steer.rotation.x = 0.95;

  // roll frame and a little sun roof
  for (const z of [-0.62, 0.62]) {
    add(mesh(boxGeo, steel, 0.1, 1.0, 0.1, -1.4, 2.0, z, false));
    add(mesh(boxGeo, steel, 0.1, 1.0, 0.1, -0.1, 2.0, z, false));
  }
  add(mesh(boxGeo, "#f7f3ee", 1.6, 0.1, 1.5, -0.75, 2.55, 0));
  return g;
}

/**
 * Rectangular backyard trampoline, mat at TRAMPOLINE_TOP: black mat, a ring
 * of springs, a padded blue border and short legs. Centred on its footprint.
 */
export function makeTrampoline(w: number, d: number) {
  const g = new THREE.Group();
  const top = 0.55;
  const pad = 0.34;
  const flat = (c: string, roughness = 0.55) => lam(c, { flat: true, roughness });
  // legs
  for (const [x, z] of [
    [-w / 2 + 0.15, -d / 2 + 0.15],
    [w / 2 - 0.15, -d / 2 + 0.15],
    [-w / 2 + 0.15, d / 2 - 0.15],
    [w / 2 - 0.15, d / 2 - 0.15],
  ] as const) {
    g.add(mesh(boxGeo, "#5a6470", 0.12, top - 0.1, 0.12, x, (top - 0.1) / 2, z, false));
  }
  // padded border, four pieces so the mat shows through the middle
  g.add(mesh(boxGeo, "#3a8fd0", w, 0.12, pad, 0, top - 0.03, -d / 2 + pad / 2));
  g.add(mesh(boxGeo, "#3a8fd0", w, 0.12, pad, 0, top - 0.03, d / 2 - pad / 2));
  g.add(mesh(boxGeo, "#3a8fd0", pad, 0.12, d - pad * 2, -w / 2 + pad / 2, top - 0.03, 0));
  g.add(mesh(boxGeo, "#3a8fd0", pad, 0.12, d - pad * 2, w / 2 - pad / 2, top - 0.03, 0));
  // mat, a touch lower than the pads
  const mat = new THREE.Mesh(new THREE.BoxGeometry(w - pad * 2, 0.04, d - pad * 2), flat("#1e1f22", 0.8));
  mat.position.y = top - 0.07;
  mat.receiveShadow = true;
  g.add(mat);
  // springs peeking out between mat and pad
  const n = Math.max(3, Math.round((w - pad * 2) / 0.45));
  const m = Math.max(3, Math.round((d - pad * 2) / 0.45));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + pad + ((i + 0.5) * (w - pad * 2)) / n;
    g.add(mesh(boxGeo, "#c8d0d6", 0.04, 0.03, 0.14, x, top - 0.06, -d / 2 + pad + 0.02, false));
    g.add(mesh(boxGeo, "#c8d0d6", 0.04, 0.03, 0.14, x, top - 0.06, d / 2 - pad - 0.02, false));
  }
  for (let i = 0; i < m; i++) {
    const z = -d / 2 + pad + ((i + 0.5) * (d - pad * 2)) / m;
    g.add(mesh(boxGeo, "#c8d0d6", 0.14, 0.03, 0.04, -w / 2 + pad + 0.02, top - 0.06, z, false));
    g.add(mesh(boxGeo, "#c8d0d6", 0.14, 0.03, 0.04, w / 2 - pad - 0.02, top - 0.06, z, false));
  }
  return g;
}

const tyreGeo = new THREE.TorusGeometry(1, 0.42, 12, 28);
/** A tyre lying flat on the ground, outer radius r. */
export function makeTyre(r: number) {
  const g = new THREE.Group();
  const t = new THREE.Mesh(tyreGeo, lam("#2a2724", { flat: true, roughness: 0.9 }));
  const s = r / 1.42;
  t.scale.set(s, s, s * 0.9);
  t.rotation.x = Math.PI / 2;
  t.position.y = 0.42 * s * 0.9;
  t.castShadow = true;
  t.receiveShadow = true;
  g.add(t);
  return g;
}

export type Campfire = { group: THREE.Group; flames: THREE.Mesh[]; light: THREE.PointLight };

/** Stone ring, logs, and emissive flames that flicker (animated by the runtime). */
export function makeCampfire(): Campfire {
  const g = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const s = mesh(cylGeo, i % 2 ? "#8a8a86" : "#a09c94", 0.32, 0.34, 0.28, Math.cos(a) * 1.15, 0.17, Math.sin(a) * 1.15);
    s.rotation.y = a;
    g.add(s);
  }
  for (const [x, z, ry] of [
    [0.25, -0.1, 0.4],
    [-0.2, 0.2, -0.9],
    [0.05, 0.3, 1.7],
  ]) {
    const log = mesh(cylGeo, "#6a4a32", 0.14, 1.1, 0.14, x, 0.24, z, false);
    log.rotation.set(0.35, ry, Math.PI / 2 - 0.3);
    g.add(log);
  }
  const flames: THREE.Mesh[] = [];
  const flameCols = ["#ffb347", "#ff8a3c", "#ffd36a"];
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(
      coneGeo,
      new THREE.MeshStandardMaterial({
        color: flameCols[i],
        emissive: new THREE.Color(flameCols[i]),
        emissiveIntensity: 1.8,
        roughness: 0.6,
      }),
    );
    const s = 0.34 - i * 0.07;
    f.scale.set(s, 0.9 - i * 0.15, s);
    f.position.set((i - 1) * 0.16, 0.45 + i * 0.12, (i % 2) * 0.1 - 0.05);
    f.castShadow = false;
    g.add(f);
    flames.push(f);
  }
  const light = new THREE.PointLight("#ffa040", 1.4, 9);
  light.position.set(0, 1.0, 0);
  g.add(light);
  return { group: g, flames, light };
}

/* ------------------------------------------------------------ mountain cave */

/** Deterministic random for decoration, so the cave looks the same every load. */
function seeded(seed: number) {
  let v = seed % 2147483647;
  if (v <= 0) v += 2147483646;
  return () => {
    v = (v * 16807) % 2147483647;
    return (v - 1) / 2147483646;
  };
}

const rockGeos: THREE.BufferGeometry[] = [];
/** A few lumpy low-poly boulder shapes, shared. */
function rockGeo(i: number) {
  if (!rockGeos.length) {
    for (let k = 0; k < 4; k++) {
      const geo = new THREE.IcosahedronGeometry(1, 1);
      const rand = seeded(9173 + k * 131);
      const bump = new Map<string, number>();
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const v = new THREE.Vector3();
      for (let n = 0; n < pos.count; n++) {
        v.fromBufferAttribute(pos, n);
        const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
        let b = bump.get(key);
        if (b == null) {
          b = 0.78 + rand() * 0.38;
          bump.set(key, b);
        }
        v.multiplyScalar(b);
        pos.setXYZ(n, v.x, v.y, v.z);
      }
      geo.computeVertexNormals();
      rockGeos.push(geo);
    }
  }
  return rockGeos[i % rockGeos.length]!;
}

const rockMats = new Map<string, THREE.MeshStandardMaterial>();
function rockMat(color: string, emissive?: string, glow = 0) {
  const key = `${color}|${emissive ?? ""}|${glow}`;
  let m = rockMats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.92,
      metalness: 0,
      flatShading: true,
      emissive: emissive ? new THREE.Color(emissive) : undefined,
      emissiveIntensity: glow,
    });
    rockMats.set(key, m);
  }
  return m;
}

/** A sign board with painted words on a canvas. */
export function signBoard(text: string, w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = Math.round((512 * h) / w);
  const g = c.getContext("2d")!;
  g.fillStyle = "#8a5a32";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#a8743f";
  for (let y = 0; y < c.height; y += 22) g.fillRect(0, y, c.width, 3);
  g.fillStyle = "#fff4d6";
  g.font = `bold ${Math.round(c.height * 0.52)}px system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, c.width / 2, c.height / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), [
    lam("#6a4a32", { flat: true }),
    lam("#6a4a32", { flat: true }),
    lam("#6a4a32", { flat: true }),
    lam("#6a4a32", { flat: true }),
    new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }),
    lam("#6a4a32", { flat: true }),
  ]);
  return m;
}

/**
 * The mountain around the tunnels, and everything inside them. The solid
 * rock and roofs are props (cave.ts); this is decoration only and adds no
 * colliders, so every boulder is kept within a short bulge of the rock face
 * it sits on, and nothing inside hangs lower than 2.2m or stands out into a
 * tunnel by more than about 0.35m.
 */
export function makeMountainCave() {
  const g = new THREE.Group();
  const rand = seeded(20260917);
  const { x0, z0, cell, height } = CAVE;
  const rows = CAVE_MAP.length;
  const cols = CAVE_MAP[0]!.length;
  const minX = x0;
  const maxX = x0 + cols * cell;
  const maxZ = z0;
  const minZ = z0 - rows * cell;
  const at = (r: number, c: number) => CAVE_MAP[r]?.[c];
  const rockCols = ["#7d766c", "#6a655d", "#8a8378", "#726b61"];
  // The rock shapes bulge between 0.78 and 1.16 of their radius, so anything
  // placed against a face is positioned from the 0.78 minimum. ry null spins
  // it freely; a number keeps its scaled axes lined up with the world.
  const boulder = (
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    color?: string,
    ry: number | null = null,
    tilt = 0.4,
  ) => {
    const m = new THREE.Mesh(rockGeo(Math.floor(rand() * 4)), rockMat(color ?? rockCols[Math.floor(rand() * rockCols.length)]!));
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.rotation.set((rand() - 0.5) * tilt, ry ?? rand() * Math.PI * 2, (rand() - 0.5) * tilt);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const [ex] = caveEntrance();

  // ---- outside: cliffs of overlapping boulders over the rock faces ----------
  // Each row sits in front of the flat collider face and bulges out past it by
  // `out`; the lowest row bulges least, since she can walk up to it.
  const tiers = [
    { y: 1.5, sy: 2.0, out: 0.55, depth: 2.2 },
    { y: 4.2, sy: 2.2, out: 1.1, depth: 2.4 },
    { y: 6.9, sy: 2.1, out: 0.9, depth: 2.4 },
    { y: 9.2, sy: 1.6, out: 0.3, depth: 2.2 },
  ];
  const edge = (along: "x" | "z", face: number, from: number, to: number, out: number) => {
    for (const t of tiers) {
      for (let a = from + 1.2; a < to - 0.8; a += 2.6 + rand() * 0.8) {
        // keep the entrance open: skip rows that would hang below its lintel
        if (along === "x" && out > 0 && t.y - t.sy < 3.6 && Math.abs(a - ex) < 3.2) continue;
        const sx = 2.1 + rand() * 0.9;
        const centre = face + out * (t.out - t.depth);
        const sy = t.sy * (0.9 + rand() * 0.3);
        if (along === "x") boulder(a, t.y, centre, sx, sy, t.depth, undefined, 0);
        else boulder(centre, t.y, a, t.depth, sy, sx, undefined, 0);
      }
    }
  };
  edge("x", maxZ, minX, maxX, 1);
  edge("x", minZ, minX, maxX, -1);
  edge("z", minX, minZ, maxZ, -1);
  edge("z", maxX, minZ, maxZ, 1);
  // corners
  for (const [cx, cz] of [
    [minX + 1.5, maxZ - 1.5],
    [maxX - 1.5, maxZ - 1.5],
    [minX + 1.5, minZ + 1.5],
    [maxX - 1.5, minZ + 1.5],
  ]) {
    boulder(cx, 3, cz, 2.6, 3.6, 2.6);
    boulder(cx + Math.sign((minX + maxX) / 2 - cx) * 2, 7, cz + Math.sign((minZ + maxZ) / 2 - cz) * 2, 2.8, 3, 2.8);
  }
  // grassy top with a scatter of rocks and pines
  const top = new THREE.Mesh(boxGeo, lam("#6aae5c", { flat: true, roughness: 0.9 }));
  top.scale.set(maxX - minX - 7, 0.6, maxZ - minZ - 7);
  top.position.set((minX + maxX) / 2, height + 0.25, (minZ + maxZ) / 2);
  top.receiveShadow = true;
  g.add(top);
  for (let i = 0; i < 9; i++) {
    const x = minX + 7 + rand() * (maxX - minX - 14);
    const z = minZ + 7 + rand() * (maxZ - minZ - 14);
    boulder(x, height + 0.9, z, 2 + rand() * 2.4, 1.2 + rand(), 2 + rand() * 2.4);
  }
  for (let i = 0; i < 7; i++) {
    const x = minX + 6 + rand() * (maxX - minX - 12);
    const z = minZ + 6 + rand() * (maxZ - minZ - 12);
    const s = 0.8 + rand() * 0.5;
    const trunk = mesh(cylGeo, "#6a4a32", 0.22 * s, 1.4 * s, 0.22 * s, x, height + 0.55 + 0.7 * s, z);
    g.add(trunk);
    for (let k = 0; k < 3; k++) {
      g.add(mesh(coneGeo, k % 2 ? "#3f8a4a" : "#4f9a54", (1.9 - k * 0.45) * s, 1.8 * s, (1.9 - k * 0.45) * s, x, height + 0.55 + (1.9 + k * 1.05) * s, z));
    }
  }

  // ---- the entrance: a rock arch, timber frame, sign and lanterns ----------
  const ez = maxZ;
  boulder(ex - 2.6, 2, ez + 0.5, 1.4, 2.4, 1.6, "#8a8378", 0.2);
  boulder(ex + 2.6, 2, ez + 0.5, 1.4, 2.4, 1.6, "#7d766c", -0.2);
  // the arch stone sits above the sign board, which hangs over the timber frame
  boulder(ex, 5.6, ez + 0.4, 3.8, 1.1, 1.7, "#8a8378", 0.05);
  for (const s of [-1, 1]) g.add(mesh(boxGeo, "#6a4a32", 0.3, 3.3, 0.3, ex + s * 1.35, 1.65, ez + 0.2));
  g.add(mesh(boxGeo, "#6a4a32", 3.2, 0.32, 0.36, ex, 3.3, ez + 0.2));
  const sign = signBoard("CAVE", 2.4, 0.8);
  sign.position.set(ex, 3.9, ez + 1.25);
  g.add(sign);
  const lanternGlass = rockMat("#ffcf6a", "#ffb640", 1.4);
  const lantern = (x: number, y: number, z: number) => {
    g.add(mesh(boxGeo, "#3a3632", 0.3, 0.06, 0.3, x, y + 0.25, z, false));
    const glass = new THREE.Mesh(boxGeo, lanternGlass);
    glass.scale.set(0.22, 0.34, 0.22);
    glass.position.set(x, y, z);
    g.add(glass);
    g.add(mesh(boxGeo, "#3a3632", 0.3, 0.06, 0.3, x, y - 0.2, z, false));
  };
  lantern(ex - 1.35, 2.5, ez + 0.5);
  lantern(ex + 1.35, 2.5, ez + 0.5);

  // ---- inside --------------------------------------------------------------
  const HEAD: Record<string, number> = { ".": 3.2, N: 3.2, C: 5, M: 5, G: 6.5 };
  const crystal = [rockMat("#b98ce0", "#9a5ad8", 0.9), rockMat("#7fd8f0", "#3ab8e0", 0.9), rockMat("#f28bc4", "#e0508f", 0.8)];
  const shroomCaps = [rockMat("#5fe0c8", "#2fc0a8", 1.0), rockMat("#ff9ad0", "#f060a8", 0.9), rockMat("#a8f06a", "#78d040", 0.8)];
  const stalMat = rockMat("#8a8378");
  let lanternCount = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = at(r, c);
      if (!ch || ch === "#") continue;
      const [cx, cz] = caveCellCenter(r, c);
      const head = HEAD[ch]!;
      // Rocky walls: overlapping boulders tiled over each rock face around the
      // cell, floor to ceiling, so the flat collider face barely shows. Each
      // bulges at most ~0.25m into the tunnel, which keeps the first-person
      // camera (0.34m from a wall at the closest) out of the rock.
      const face = cell / 2;
      for (const [dr, dc, nx, nz] of [
        [-1, 0, 0, 1],
        [1, 0, 0, -1],
        [0, -1, -1, 0],
        [0, 1, 1, 0],
      ] as const) {
        const n = at(r + dr, c + dc);
        if (n && n !== "#") continue;
        if (r === 0 && dr === -1) continue; // the open mouth
        // A sphere of radius R showing only its outer b metres has a visible
        // cap about sqrt(2Rb) across; at R 1.8 and b 0.22 that is ~1.8m, so a
        // 1.1m grid of them overlaps with no flat wall between.
        const levels = Math.max(3, Math.ceil(head / 1.1));
        for (let lv = 0; lv < levels; lv++) {
          for (const along of [-1.05, 0, 1.05]) {
            // wide and tall along the wall, shallow out of it: the front shows
            // between 0.1 and ~0.37m past the collider face
            const rad = 1.6 + rand() * 0.4;
            const depth = 0.55;
            const bulge = 0.1 + rand() * 0.06;
            const off = face + depth * 0.78 - bulge;
            const jitter = along + (rand() - 0.5) * 0.25;
            const y = ((lv + 0.5) / levels) * head + (rand() - 0.5) * 0.3;
            const bx = cx + nx * off + (nz !== 0 ? jitter : 0);
            const bz = cz + nz * off + (nx !== 0 ? jitter : 0);
            if (nz !== 0) boulder(bx, y, bz, rad, rad * 0.8, depth, undefined, 0, 0.12);
            else boulder(bx, y, bz, depth, rad * 0.8, rad, undefined, 0, 0.12);
          }
        }
        // lanterns along the tunnel walls to light the way
        if ((ch === "." || ch === "N") && lanternCount++ % 3 === 0) {
          lantern(cx + nx * (face - 0.3), 2.0, cz + nz * (face - 0.3));
        }
      }
      // ceiling: flattened boulders hanging a little below the roof slab
      for (const ox of [-1, 0, 1]) {
        for (const oz of [-1, 0, 1]) {
          const rad = 1.3 + rand() * 0.3;
          // hangs 0.15 to ~0.45m below the roof slab
          boulder(cx + ox + (rand() - 0.5) * 0.3, head + rad * 0.5 * 0.78 - 0.15, cz + oz + (rand() - 0.5) * 0.3, rad, rad * 0.5, rad, undefined, null, 0.1);
        }
      }
      // stalactites
      const drips = ch === "G" ? 5 : ch === "." || ch === "N" ? 1 : 3;
      for (let k = 0; k < drips; k++) {
        const len = 0.4 + rand() * (head - 2.4 > 1 ? 1 : 0.6);
        const st = new THREE.Mesh(coneGeo, stalMat);
        st.scale.set(0.18 + rand() * 0.14, len, 0.18 + rand() * 0.14);
        st.rotation.x = Math.PI;
        st.position.set(cx + (rand() - 0.5) * 2.2, head - len / 2, cz + (rand() - 0.5) * 2.2);
        g.add(st);
      }
      if (ch === "C") {
        // crystal clusters hugging the floor at the grotto's edges
        for (let k = 0; k < 4; k++) {
          const px = cx + (rand() < 0.5 ? -1 : 1) * (1.05 + rand() * 0.3);
          const pz = cz + (rand() - 0.5) * 2.2;
          for (let q = 0; q < 3; q++) {
            const cr = new THREE.Mesh(cone4Geo, crystal[(k + q) % crystal.length]);
            const h = 0.5 + rand() * 0.9;
            cr.scale.set(0.12 + rand() * 0.1, h, 0.12 + rand() * 0.1);
            cr.position.set(px + (rand() - 0.5) * 0.4, h / 2 + 0.04, pz + (rand() - 0.5) * 0.4);
            cr.rotation.set((rand() - 0.5) * 0.7, rand() * 3, (rand() - 0.5) * 0.7);
            g.add(cr);
          }
        }
      }
      if (ch === "M") {
        for (let k = 0; k < 5; k++) {
          const px = cx + (rand() - 0.5) * 2.4;
          const pz = cz + (rand() - 0.5) * 2.4;
          const s = 0.5 + rand() * 0.7;
          g.add(mesh(cylGeo, "#efe6d0", 0.08 * s, 0.5 * s, 0.08 * s, px, 0.25 * s + 0.04, pz, false));
          const cap = new THREE.Mesh(sphereGeo, shroomCaps[k % shroomCaps.length]);
          cap.scale.set(0.34 * s, 0.18 * s, 0.34 * s);
          cap.position.set(px, 0.5 * s + 0.04, pz);
          g.add(cap);
        }
      }
      if (ch === "G") {
        // the odd stalagmite, only in cells against a wall so the floor stays open
        const walled = [at(r - 1, c), at(r + 1, c), at(r, c - 1), at(r, c + 1)].some((n) => !n || n === "#");
        if (walled && rand() < 0.45) {
          const h = 0.7 + rand() * 1.0;
          const sg = new THREE.Mesh(coneGeo, stalMat);
          sg.scale.set(0.28 + rand() * 0.15, h, 0.28 + rand() * 0.15);
          sg.position.set(cx + (rand() < 0.5 ? -1 : 1) * 1.1, h / 2 + 0.04, cz + (rand() < 0.5 ? -1 : 1) * 1.1);
          g.add(sg);
        }
        // a few glowing crystals so the big room has colour too
        if (rand() < 0.35) {
          const cr = new THREE.Mesh(cone4Geo, crystal[Math.floor(rand() * crystal.length)]);
          const h = 0.5 + rand() * 0.6;
          cr.scale.set(0.14, h, 0.14);
          cr.position.set(cx + (rand() - 0.5) * 2, h / 2 + 0.04, cz + (rand() - 0.5) * 2);
          cr.rotation.z = (rand() - 0.5) * 0.5;
          g.add(cr);
        }
      }
    }
  }
  // lanterns on the cavern ledge, either side of the prize
  const [lx, , lz] = CAVE_SPOTS.ledge;
  lantern(lx - 1.6, 1.55, lz - 0.6);
  lantern(lx + 1.8, 1.55, lz - 0.6);
  return g;
}

export type SplashRig = {
  group: THREE.Group;
  jets: { def: Jet; column: THREE.Mesh; cap: THREE.Mesh; cooldown: number }[];
  bucket: { pivot: THREE.Group; sheet: THREE.Mesh; pourX: number; pourZ: number; poured: boolean };
  sprinklers: { drops: THREE.Mesh[]; x: number; z: number }[];
};

/** The painted deck: aqua with a pale rim, a sun in the middle, and a bright target under every jet. */
function splashDeckTexture(jets: Jet[]) {
  const S = 1024;
  const R = SPLASH_RADIUS + 0.2;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const g = c.getContext("2d")!;
  const px = (x: number) => ((x / (2 * R)) + 0.5) * S;
  const m = (r: number) => (r / (2 * R)) * S;
  g.fillStyle = "#eaf6f7";
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#8ed6e4";
  g.beginPath();
  g.arc(S / 2, S / 2, m(R - 0.8), 0, Math.PI * 2);
  g.fill();
  // soft speckle so it reads as a surface, not a flat colour
  for (let i = 0; i < 1400; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * m(R - 0.9);
    g.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.18)" : "rgba(40,120,150,0.10)";
    g.fillRect(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 3, 3);
  }
  // sun
  g.fillStyle = "#ffd65a";
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.beginPath();
    g.moveTo(S / 2 + Math.cos(a - 0.12) * m(1.7), S / 2 + Math.sin(a - 0.12) * m(1.7));
    g.lineTo(S / 2 + Math.cos(a) * m(2.7), S / 2 + Math.sin(a) * m(2.7));
    g.lineTo(S / 2 + Math.cos(a + 0.12) * m(1.7), S / 2 + Math.sin(a + 0.12) * m(1.7));
    g.fill();
  }
  g.beginPath();
  g.arc(S / 2, S / 2, m(1.6), 0, Math.PI * 2);
  g.fill();
  // targets
  const rings = ["#e8455f", "#ffc53d", "#3fa35c", "#4f93c4", "#b98ce0", "#ff8a3d"];
  jets.forEach((j, i) => {
    const x = px(j.x);
    const z = px(j.z);
    const col = rings[i % rings.length]!;
    for (const [r, fill] of [
      [1.25, col],
      [0.9, "#ffffff"],
      [0.55, col],
    ] as [number, string][]) {
      g.fillStyle = fill;
      g.beginPath();
      g.arc(x, z, m(r), 0, Math.PI * 2);
      g.fill();
    }
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/**
 * The splash pad's live parts, in the pad's local frame: a painted round
 * deck, ground jets whose water columns the runtime raises in a chase, a
 * tipping bucket on an arm that fills and dumps, and droplets circling each
 * sprinkler flower. The solid bits (arch posts, bucket pole, flower stems,
 * bench) are props in park.ts.
 */
export function makeSplashPad(): SplashRig {
  const group = new THREE.Group();
  const jets = splashJets();
  const deck = new THREE.Mesh(
    new THREE.CircleGeometry(SPLASH_RADIUS + 0.2, 72),
    // matte and a touch grey, so the pale rim and targets stay under the bloom
    // threshold instead of haloing the whole pad
    new THREE.MeshStandardMaterial({ map: splashDeckTexture(jets), color: "#c4c4c4", roughness: 0.8, metalness: 0 }),
  );
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = 0.062;
  deck.receiveShadow = true;
  group.add(deck);

  const water = lam("#e2f6ff", { transparent: true, opacity: 0.62, flat: true, roughness: 0.15 });
  const nozzleGeo = new THREE.CylinderGeometry(0.2, 0.24, 0.05, 16);
  const columnGeo = new THREE.CylinderGeometry(0.1, 0.2, 1, 12);
  const capGeo = new THREE.SphereGeometry(1, 12, 8);
  const rigJets: SplashRig["jets"] = jets.map((def) => {
    const nozzle = new THREE.Mesh(nozzleGeo, lam("#c8d0d6", { flat: true, roughness: 0.3 }));
    nozzle.position.set(def.x, 0.085, def.z);
    group.add(nozzle);
    const column = new THREE.Mesh(columnGeo, water);
    column.position.set(def.x, 0.5, def.z);
    column.castShadow = false;
    column.visible = false;
    group.add(column);
    const cap = new THREE.Mesh(capGeo, water);
    cap.position.set(def.x, 1, def.z);
    cap.scale.set(0.35, 0.22, 0.35);
    cap.castShadow = false;
    cap.visible = false;
    group.add(cap);
    return { def, column, cap, cooldown: 0 };
  });

  // tipping bucket: an arm off the pole top, the bucket hanging from a pivot
  const bx = SPLASH_BUCKET.x;
  const bz = SPLASH_BUCKET.z;
  group.add(mesh(boxGeo, "#b8c2c8", SPLASH_BUCKET.arm + 0.4, 0.16, 0.16, bx + SPLASH_BUCKET.arm / 2, 3.86, bz, false));
  const pivot = new THREE.Group();
  pivot.position.set(bx + SPLASH_BUCKET.arm, 3.7, bz);
  const bucketGeo = new THREE.CylinderGeometry(0.95, 0.7, 1.1, 24, 1, true);
  const bucketMat = new THREE.MeshStandardMaterial({ color: "#f0c44a", roughness: 0.45, side: THREE.DoubleSide });
  const bucket = new THREE.Mesh(bucketGeo, bucketMat);
  bucket.position.y = -0.6;
  bucket.castShadow = true;
  pivot.add(bucket);
  const base = new THREE.Mesh(new THREE.CircleGeometry(0.7, 24), bucketMat);
  base.rotation.x = Math.PI / 2;
  base.position.y = -1.15;
  pivot.add(base);
  const fill = new THREE.Mesh(new THREE.CircleGeometry(0.88, 24), lam("#6cc4e0", { flat: true, roughness: 0.2 }));
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = -0.15;
  pivot.add(fill);
  const rimBand = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.05, 6, 24), lam("#d8a832", { flat: true }));
  rimBand.rotation.x = Math.PI / 2;
  rimBand.position.y = -0.05;
  pivot.add(rimBand);
  group.add(pivot);
  // the pour: a thick sheet of water from the tipped lip to the ground
  const pourX = bx + SPLASH_BUCKET.arm + 1.05;
  const sheet = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.75, 1, 16, 1, true), water);
  sheet.position.set(pourX, 1.6, bz);
  sheet.scale.set(1, 3.2, 1);
  sheet.visible = false;
  sheet.castShadow = false;
  group.add(sheet);

  // droplets circling each sprinkler flower
  const dropGeo = new THREE.SphereGeometry(0.09, 8, 6);
  const sprinklers = SPLASH_FLOWERS.map(([x, z]) => {
    const drops: THREE.Mesh[] = [];
    for (let i = 0; i < 8; i++) {
      const d = new THREE.Mesh(dropGeo, water);
      d.castShadow = false;
      group.add(d);
      drops.push(d);
    }
    return { drops, x, z };
  });

  return { group, jets: rigJets, bucket: { pivot, sheet, pourX, pourZ: bz, poured: false }, sprinklers };
}

export type SprayArches = { group: THREE.Group; columns: THREE.Mesh[][] };

/**
 * Three arches in a row over the splash pad, each with a curtain of spray
 * whose height the runtime pulses in sequence. Posts are props with
 * colliders; this is only the moving water.
 */
export function makeSprayArches(count = 3, spacing = 6): SprayArches {
  const g = new THREE.Group();
  const columns: THREE.Mesh[][] = [];
  const water = lam("#d6f2ff", { transparent: true, opacity: 0.55, flat: true, roughness: 0.2 });
  for (let a = 0; a < count; a++) {
    const x = (a - (count - 1) / 2) * spacing;
    const set: THREE.Mesh[] = [];
    for (let i = -2; i <= 2; i++) {
      const c = new THREE.Mesh(cylGeo, water);
      c.scale.set(0.09, 3.0, 0.09);
      c.position.set(x + i * 1.0, 1.7, 0);
      c.castShadow = false;
      g.add(c);
      set.push(c);
    }
    columns.push(set);
  }
  return { group: g, columns };
}

/** Keep every gondola hanging level as the hub turns. */
export function levelGondolas(wheel: FerrisWheel) {
  for (const g of wheel.gondolas) g.rotation.z = -wheel.hub.rotation.z;
}

/**
 * Emmett: a small boy on a tricycle, black cap, red sunglasses.
 * Returns the root plus the parts that need animating.
 */
export function makeEmmett() {
  const root = new THREE.Group();
  const skin = "#e5ab80";
  const hair = "#4a2f1e";
  const shirt = "#4f93c4";
  const shorts = "#33527a";
  const frame = "#d43a3a";
  const rubber = "#2a2a2e";
  const chrome = "#c8ced4";
  const cap = "#22242a";
  const shades = "#d8322c";

  // ---- tricycle
  const trike = new THREE.Group();
  root.add(trike);

  const frontWheel = new THREE.Group();
  frontWheel.position.set(0, 0.34, 0.52);
  const fw = mesh(cylGeo, rubber, 0.34, 0.12, 0.34, 0, 0, 0);
  fw.rotation.z = Math.PI / 2;
  frontWheel.add(fw);
  const hubF = mesh(cylGeo, chrome, 0.12, 0.14, 0.12, 0, 0, 0);
  hubF.rotation.z = Math.PI / 2;
  frontWheel.add(hubF);
  // spokes so the spin reads
  for (let i = 0; i < 3; i++) {
    const sp = mesh(boxGeo, chrome, 0.05, 0.6, 0.05, 0, 0, 0, false);
    sp.rotation.x = (i / 3) * Math.PI;
    frontWheel.add(sp);
  }
  trike.add(frontWheel);

  const backWheels: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(s * 0.34, 0.22, -0.34);
    const w = mesh(cylGeo, rubber, 0.22, 0.1, 0.22, 0, 0, 0);
    w.rotation.z = Math.PI / 2;
    g.add(w);
    const hub = mesh(cylGeo, chrome, 0.08, 0.12, 0.08, 0, 0, 0);
    hub.rotation.z = Math.PI / 2;
    g.add(hub);
    trike.add(g);
    backWheels.push(g);
  }

  // frame: front fork down to the wheel, spine back to the axle
  const fork = mesh(boxGeo, frame, 0.1, 0.58, 0.1, 0, 0.52, 0.5);
  fork.rotation.x = -0.3;
  trike.add(fork);
  trike.add(mesh(boxGeo, frame, 0.14, 0.12, 0.92, 0, 0.3, 0.02));
  trike.add(mesh(boxGeo, frame, 0.76, 0.1, 0.12, 0, 0.24, -0.34));

  // seat
  trike.add(mesh(boxGeo, frame, 0.34, 0.12, 0.4, 0, 0.44, -0.2));
  trike.add(mesh(sphereGeo, frame, 0.19, 0.08, 0.14, 0, 0.5, -0.22, false));

  // handlebars
  const bars = new THREE.Group();
  bars.position.set(0, 0.82, 0.44);
  bars.add(mesh(boxGeo, chrome, 0.62, 0.08, 0.08, 0, 0, 0));
  bars.add(mesh(cylGeo, rubber, 0.07, 0.18, 0.07, -0.3, 0, 0, false));
  bars.add(mesh(cylGeo, rubber, 0.07, 0.18, 0.07, 0.3, 0, 0, false));
  const grip1 = bars.children[1] as THREE.Mesh;
  const grip2 = bars.children[2] as THREE.Mesh;
  grip1.rotation.z = Math.PI / 2;
  grip2.rotation.z = Math.PI / 2;
  // streamers, because it is a kid's trike
  bars.add(mesh(boxGeo, "#f0c44a", 0.05, 0.05, 0.3, -0.38, 0, -0.12, false));
  bars.add(mesh(boxGeo, "#f0c44a", 0.05, 0.05, 0.3, 0.38, 0, -0.12, false));
  trike.add(bars);

  // pedals on the front wheel
  const pedals = new THREE.Group();
  pedals.position.set(0, 0.34, 0.52);
  for (const s of [-1, 1]) {
    const arm = mesh(boxGeo, chrome, 0.06, 0.3, 0.06, s * 0.26, s * 0.12, 0, false);
    pedals.add(arm);
    pedals.add(mesh(boxGeo, rubber, 0.16, 0.06, 0.2, s * 0.26, s * 0.26, 0, false));
  }
  trike.add(pedals);

  // ---- boy
  const body = new THREE.Group();
  body.position.set(0, 0.56, -0.14);
  root.add(body);

  body.add(mesh(cylGeo, shirt, 0.25, 0.42, 0.2, 0, 0.2, 0));
  body.add(mesh(sphereGeo, shirt, 0.26, 0.14, 0.21, 0, 0.4, 0, false));
  body.add(mesh(cylGeo, shorts, 0.24, 0.16, 0.2, 0, -0.04, 0));

  // legs reach forward to the pedals
  const legs: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(s * 0.15, -0.06, 0.04);
    const thigh = mesh(cylGeo, skin, 0.1, 0.3, 0.1, 0, -0.06, 0.16);
    thigh.rotation.x = 1.0;
    leg.add(thigh);
    const shin = mesh(cylGeo, skin, 0.09, 0.28, 0.09, 0, -0.26, 0.3);
    shin.rotation.x = 0.3;
    leg.add(shin);
    leg.add(mesh(sphereGeo, "#f4f0ea", 0.11, 0.08, 0.16, 0, -0.4, 0.4, false));
    body.add(leg);
    legs.push(leg);
  }

  // arms out to the handlebars
  const arms: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 0.28, 0.34, 0);
    const upper = mesh(cylGeo, shirt, 0.08, 0.26, 0.08, 0, -0.02, 0.14);
    upper.rotation.x = 1.15;
    arm.add(upper);
    const fore = mesh(cylGeo, skin, 0.07, 0.24, 0.07, 0, -0.06, 0.36);
    fore.rotation.x = 1.35;
    arm.add(fore);
    arm.add(mesh(sphereGeo, skin, 0.08, 0.08, 0.08, 0, -0.1, 0.5, false));
    body.add(arm);
    arms.push(arm);
  }

  // head
  const head = new THREE.Group();
  head.position.set(0, 0.62, 0.02);
  head.add(mesh(sphereGeo, skin, 0.27, 0.27, 0.26, 0, 0.12, 0.02));
  head.add(mesh(sphereGeo, hair, 0.28, 0.14, 0.26, 0, 0.26, -0.02, false));
  head.add(mesh(sphereGeo, skin, 0.045, 0.04, 0.04, 0, 0.08, 0.26, false));
  head.add(mesh(sphereGeo, "#d98a6a", 0.07, 0.055, 0.055, -0.16, 0.05, 0.19, false));
  head.add(mesh(sphereGeo, "#d98a6a", 0.07, 0.055, 0.055, 0.16, 0.05, 0.19, false));
  // mouth: a grin by default, an open whoop when he wins, a flat line when he does not
  const grin = mesh(boxGeo, "#8a4a42", 0.16, 0.04, 0.03, 0, -0.03, 0.26, false);
  head.add(grin);
  const whoop = mesh(sphereGeo, "#7a3a34", 0.13, 0.12, 0.06, 0, -0.05, 0.25, false);
  whoop.visible = false;
  head.add(whoop);
  const flat = mesh(boxGeo, "#8a4a42", 0.13, 0.03, 0.03, 0, -0.06, 0.26, false);
  flat.visible = false;
  head.add(flat);

  // red sunglasses
  head.add(mesh(boxGeo, shades, 0.4, 0.11, 0.05, 0, 0.14, 0.24, false));
  head.add(mesh(boxGeo, shades, 0.06, 0.05, 0.22, -0.2, 0.15, 0.13, false));
  head.add(mesh(boxGeo, shades, 0.06, 0.05, 0.22, 0.2, 0.15, 0.13, false));
  head.add(mesh(boxGeo, "#2a2a2e", 0.34, 0.07, 0.02, 0, 0.14, 0.27, false));
  // a highlight on the lenses so they read as glass, not a painted bar
  head.add(mesh(boxGeo, "#ff9a90", 0.08, 0.025, 0.02, -0.12, 0.17, 0.275, false));
  head.add(mesh(boxGeo, "#ff9a90", 0.05, 0.02, 0.02, 0.14, 0.16, 0.275, false));

  // black cap, brim forward
  head.add(mesh(sphereGeo, cap, 0.3, 0.2, 0.29, 0, 0.3, -0.01, false));
  head.add(mesh(boxGeo, cap, 0.34, 0.04, 0.24, 0, 0.24, 0.22, false));
  head.add(mesh(sphereGeo, cap, 0.06, 0.05, 0.06, 0, 0.44, -0.02, false));

  body.add(head);

  // where a stolen dumpling rides
  const carry = new THREE.Group();
  carry.position.set(0, 1.35, -0.1);
  body.add(carry);

  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });

  return { root, frontWheel, backWheels, pedals, body, head, legs, bars, arms, carry, grin, whoop, flat };
}

export type EmmettRig = ReturnType<typeof makeEmmett>;

/** Pedalling, wheel spin, and a bit of lean while turning. */
export type EmmettMood = "ride" | "win" | "lose";

/** Pedalling, wheel spin, lean, and a face that does something. */
export function animateEmmett(
  rig: EmmettRig,
  speed: number,
  t: number,
  turn: number,
  opts?: { mood?: EmmettMood; lookAt?: number | null },
) {
  const mood = opts?.mood ?? "ride";
  const spin = speed * 1.9;
  rig.frontWheel.rotation.x -= spin * 0.016;
  for (const w of rig.backWheels) w.rotation.x -= spin * 0.024;
  rig.pedals.rotation.x -= spin * 0.016;
  for (let i = 0; i < rig.legs.length; i++) {
    rig.legs[i]!.rotation.x = Math.sin(t * spin + i * Math.PI) * 0.34;
  }

  rig.body.rotation.z = THREE.MathUtils.lerp(rig.body.rotation.z, -turn * 0.3, 0.12);
  rig.body.position.y = 0.56 + Math.sin(t * spin * 2) * 0.015;
  rig.bars.rotation.y = THREE.MathUtils.lerp(rig.bars.rotation.y, -turn * 0.5, 0.15);

  rig.grin.visible = mood === "ride";
  rig.whoop.visible = mood === "win";
  rig.flat.visible = mood === "lose";

  const [armL, armR] = rig.arms;

  if (mood === "win") {
    // one fist up, wheelie, head tipped back
    const pump = Math.sin(t * 12) * 0.3;
    if (armL) {
      armL.rotation.x = -2.2 + pump;
      armL.rotation.z = 0.5;
    }
    if (armR) armR.rotation.x = 0;
    rig.body.rotation.x = -0.22;
    rig.head.rotation.x = -0.2;
    rig.root.rotation.x = -0.14 + Math.sin(t * 6) * 0.03;
  } else if (mood === "lose") {
    // slumped over the handlebars
    if (armL) {
      armL.rotation.x = 0.1;
      armL.rotation.z = 0;
    }
    if (armR) armR.rotation.x = 0.1;
    rig.body.rotation.x = 0.3;
    rig.head.rotation.x = 0.3;
    rig.root.rotation.x = 0;
  } else {
    if (armL) {
      armL.rotation.x = THREE.MathUtils.lerp(armL.rotation.x, 0, 0.12);
      armL.rotation.z = THREE.MathUtils.lerp(armL.rotation.z, 0, 0.12);
    }
    if (armR) armR.rotation.x = THREE.MathUtils.lerp(armR.rotation.x, 0, 0.12);
    rig.body.rotation.x = THREE.MathUtils.lerp(rig.body.rotation.x, 0, 0.12);
    rig.root.rotation.x = THREE.MathUtils.lerp(rig.root.rotation.x, 0, 0.12);
    // he looks over at her while he rides
    const look = opts?.lookAt;
    const want = look == null ? 0 : THREE.MathUtils.clamp(look, -1.0, 1.0);
    rig.head.rotation.y = THREE.MathUtils.lerp(rig.head.rotation.y, want, 0.1);
    rig.head.rotation.x = THREE.MathUtils.lerp(rig.head.rotation.x, 0, 0.12);
  }

  // whatever he is carrying bounces along with him
  rig.carry.rotation.y += 0.03;
  rig.carry.position.y = 1.35 + Math.sin(t * 7) * 0.04;
}

/** Juice box pickup: carton, straw, and a foil tab. */
export function makeJuiceBox(flavour = "#d4494f") {
  const g = new THREE.Group();
  g.add(mesh(boxGeo, flavour, 0.34, 0.5, 0.24, 0, 0.25, 0));
  g.add(mesh(boxGeo, "#f2ead8", 0.35, 0.16, 0.25, 0, 0.16, 0, false));
  g.add(mesh(boxGeo, "#f2ead8", 0.36, 0.06, 0.26, 0, 0.44, 0, false));
  const straw = mesh(cylGeo, "#f7f3ee", 0.035, 0.34, 0.035, 0.08, 0.64, 0, false);
  straw.rotation.z = 0.16;
  g.add(straw);
  g.add(mesh(cylGeo, "#f7f3ee", 0.035, 0.12, 0.035, 0.14, 0.8, 0, false));
  return g;
}
