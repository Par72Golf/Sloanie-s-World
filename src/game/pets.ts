import * as THREE from "three";
import { lam } from "./meshes";

/**
 * Pet companions: a puppy, a kitten and a bunny.
 *
 * Built like the rest of the game, from primitives with flat plastic
 * materials, in a chibi proportion: a head as wide as the body, big glossy
 * eyes with two catchlights, short stubby legs. Each has a silhouette that
 * reads at camera distance: floppy ears and a stub tail (puppy), pointy ears
 * and a long question-mark tail (kitten), tall ears with one flopped over and
 * big back feet (bunny).
 *
 * Rig: group (owned by the runtime) > spin (happy spins, planting, squash) >
 * body (pitch, tremble) > head / legs / tail / neck. animatePet only writes
 * to spin and below.
 *
 * Planting: after posing, the lowest of a handful of sample points (paws,
 * belly, rump, chest, chin) is found in group space and spin is lifted so it
 * sits on y = 0. That keeps every pose, including sitting and curling up,
 * on the ground without hand-tuned offsets per mode.
 */

export type PetKind = "puppy" | "kitten" | "bunny";

export const PETS: { kind: PetKind; name: string; blurb: string; colors: string[] }[] = [
  { kind: "puppy", name: "Puppy", blurb: "A waggy, huggy best friend!", colors: ["#e0a45e", "#f6f0e6", "#6b4a39"] },
  { kind: "kitten", name: "Kitten", blurb: "Soft, curious and full of purrs.", colors: ["#f2a04e", "#9aa1ab", "#35303a"] },
  { kind: "bunny", name: "Bunny", blurb: "A hoppy, floppy snuggle buddy!", colors: ["#f6f2ec", "#c89a70", "#9c9aa6"] },
];

export type PetMode = "follow" | "sit" | "lost" | "happy" | "sniff";

// ---- shared geometry ------------------------------------------------------

const SPH_HI = new THREE.SphereGeometry(1, 20, 14);
const SPH = new THREE.SphereGeometry(1, 14, 10);
const SPH_M = new THREE.SphereGeometry(1, 10, 7);
const SPH_S = new THREE.SphereGeometry(1, 8, 6);
const SPH_XS = new THREE.SphereGeometry(1, 6, 4);
const CONE = new THREE.ConeGeometry(1, 1, 7);
const BOX = new THREE.BoxGeometry(1, 1, 1);
// half ring, open side up after a half turn: a little smile arc
const ARC = new THREE.TorusGeometry(1, 0.3, 4, 8, Math.PI);

const capsules = new Map<string, THREE.BufferGeometry>();
/** A capsule running from y = +len/2 to -len/2 overall (caps included). */
function capsule(r: number, len: number) {
  const k = `${r.toFixed(3)}|${len.toFixed(3)}`;
  let g = capsules.get(k);
  if (!g) {
    g = new THREE.CapsuleGeometry(r, Math.max(0.002, len - 2 * r), 2, 8);
    capsules.set(k, g);
  }
  return g;
}
const tapers = new Map<string, THREE.BufferGeometry>();
function taper(rTop: number, rBottom: number, h: number) {
  const k = `${rTop.toFixed(3)}|${rBottom.toFixed(3)}|${h.toFixed(3)}`;
  let g = tapers.get(k);
  if (!g) {
    g = new THREE.CylinderGeometry(rTop, rBottom, h, 8, 1);
    tapers.set(k, g);
  }
  return g;
}

// ---- materials --------------------------------------------------------------

const mat = (c: string, roughness = 0.6) => lam(c, { flat: true, roughness });
const EYE_DARK = "#1d140f";
const PINK = "#f6b3c6";
const NOSE_PINK = "#ee8ea8";
const BLUSH = "#f7a1b6";
const MOUTH = "#5a3a36";
const catchlight = () => lam("#ffffff", { flat: true, roughness: 0.3, emissive: "#ffffff" });

function shade(hex: string, dl: number) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, dl);
  return `#${c.getHexString()}`;
}
function lightness(hex: string) {
  const hsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(hex).getHSL(hsl);
  return hsl.l;
}

type Style = {
  coat: string;
  accent: string; // muzzle, chest, socks
  ears: string;
  patch: string | null; // puppy eye patch and back spots
  stripes: string | null; // kitten tabby marks
  iris: string | null; // kitten iris
  socks: boolean;
};

function styleFor(kind: PetKind, coat: string): Style {
  const c = coat.toLowerCase();
  if (kind === "puppy") {
    if (c === "#f6f0e6") return { coat, accent: "#fffaf2", ears: "#8a5a3b", patch: "#8a5a3b", stripes: null, iris: null, socks: false };
    if (c === "#6b4a39") return { coat, accent: "#f3dcc0", ears: "#4a3226", patch: null, stripes: null, iris: null, socks: true };
    if (c === "#e0a45e") return { coat, accent: "#fff1dc", ears: "#b77838", patch: null, stripes: null, iris: null, socks: true };
    const light = lightness(coat) > 0.8;
    return { coat, accent: light ? "#fffaf2" : "#fff1dc", ears: shade(coat, light ? -0.45 : -0.14), patch: light ? shade(coat, -0.45) : null, stripes: null, iris: null, socks: !light };
  }
  if (kind === "kitten") {
    if (c === "#f2a04e") return { coat, accent: "#fff4e6", ears: coat, patch: null, stripes: "#cf7428", iris: "#86cc5a", socks: true };
    if (c === "#9aa1ab") return { coat, accent: "#f4f4f6", ears: coat, patch: null, stripes: "#6c7380", iris: "#f0b43a", socks: true };
    if (c === "#35303a") return { coat, accent: "#f4f0ec", ears: coat, patch: null, stripes: null, iris: "#bfe05a", socks: true };
    return { coat, accent: "#fff4e6", ears: coat, patch: null, stripes: shade(coat, -0.18), iris: "#86cc5a", socks: true };
  }
  if (c === "#f6f2ec") return { coat, accent: "#ffffff", ears: coat, patch: null, stripes: null, iris: null, socks: false };
  if (c === "#c89a70") return { coat, accent: "#fbf1e4", ears: coat, patch: null, stripes: null, iris: null, socks: true };
  if (c === "#9c9aa6") return { coat, accent: "#eeeef3", ears: coat, patch: null, stripes: null, iris: null, socks: true };
  return { coat, accent: "#fbf1e4", ears: coat, patch: null, stripes: null, iris: null, socks: lightness(coat) < 0.8 };
}

// ---- rig types --------------------------------------------------------------

type Leg = {
  pivot: THREE.Group;
  limb: THREE.Mesh;
  paw: THREE.Group;
  len: number;
  front: boolean;
  side: number;
  pawR: number;
  pawZ: number;
  pivotPt: Pt;
  pawPt: Pt;
  /** pose inputs for setLeg: hip angle and retraction (0 = full length) */
  angle: number;
  ret: number;
  /** current length factor (1 = as built) */
  s: number;
  /** stretch this frame so a planted paw reaches the ground, metres */
  ext: number;
};

type Pt = { x: number; y: number; z: number };
type Sample = Pt & { obj: THREE.Object3D; r: number };

type PetState = {
  seed: number;
  mode: number;
  modeT: number;
  // blended pose
  pitch: number;
  headPitch: number;
  headYaw: number;
  headRoll: number;
  legF: number;
  legB: number;
  retF: number;
  retB: number;
  reachF: number;
  reachB: number;
  earDown: number;
  earBack: number;
  tailLift: number;
  tailCurl: number;
  tailSide: number;
  tailWag: number;
  tongue: number;
  eyeOpen: number;
  blink: number;
  tremble: number;
  gait: number;
  air: number;
  happyW: number;
  spinY: number;
  spinDir: number;
  // per-frame scratch shared with the helpers, so only objects cross calls
  speed: number;
  dt: number;
  tt: number;
  k: number;
  kFast: number;
  air01: number;
  bodyRoll: number;
  earFlop: number;
  plant: number;
  bp: number;
  sy: number;
  lift: number;
  // clocks
  phase: number;
  wagPh: number;
  happyT: number;
};

export type PetRig = {
  group: THREE.Group;
  kind: PetKind;
  coat: string;
  spin: THREE.Group;
  body: THREE.Group;
  torso: THREE.Mesh;
  torsoScale: THREE.Vector3;
  bodyY: number;
  head: THREE.Group;
  neck: THREE.Group;
  /** front left, front right, back left, back right */
  legs: Leg[];
  ears: THREE.Group[];
  /** bunny only: the upper half of each ear, so one can flop */
  earTips: THREE.Group[];
  /** puppy and bunny: one pivot; kitten: a chain of segments, base first */
  tail: THREE.Group[];
  eyes: THREE.Group[];
  nose: THREE.Group;
  noseY: number;
  tongue: THREE.Group | null;
  samples: Sample[];
  st: PetState;
};

// ---- build helpers ------------------------------------------------------------

function part(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  color: string | THREE.Material,
  sx: number,
  sy: number,
  sz: number,
  x: number,
  y: number,
  z: number,
  shadow = false,
  roughness = 0.6,
) {
  const m = new THREE.Mesh(geo, typeof color === "string" ? mat(color, roughness) : color);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function group(parent: THREE.Object3D, x: number, y: number, z: number) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

type Ellipsoid = { cy: number; cz: number; rx: number; ry: number; rz: number };

/** A group sitting on the front surface of an ellipsoid at (x, y offset), turned to follow it. */
function onSurface(parent: THREE.Object3D, e: Ellipsoid, x: number, dy: number, sink: number) {
  const u = x / e.rx;
  const v = dy / e.ry;
  const z = e.cz + e.rz * Math.sqrt(Math.max(0, 1 - u * u - v * v)) - sink;
  const g = group(parent, x, e.cy + dy, z);
  g.rotation.order = "YXZ";
  g.rotation.y = Math.asin(THREE.MathUtils.clamp(u, -1, 1)) * 0.9;
  g.rotation.x = -Math.asin(THREE.MathUtils.clamp(v, -1, 1)) * 0.8;
  return g;
}

/** Big glossy eye: dark ball (or iris + pupil), a big and a small catchlight. */
function addEye(head: THREE.Group, e: Ellipsoid, side: number, ex: number, ey: number, w: number, h: number, d: number, iris: string | null) {
  const g = onSurface(head, e, side * ex, ey, d * 0.35);
  if (iris) {
    part(g, SPH_M, iris, w, h, d, 0, 0, 0, false, 0.2);
    part(g, SPH_S, EYE_DARK, w * 0.56, h * 0.8, d * 0.6, 0, -h * 0.02, d * 0.55, false, 0.12);
  } else {
    part(g, SPH_M, EYE_DARK, w, h, d, 0, 0, 0, false, 0.12);
  }
  const cl = catchlight();
  part(g, SPH_XS, cl, w * 0.36, h * 0.3, d * 0.35, w * 0.3, h * 0.38, d * 0.82);
  part(g, SPH_XS, cl, w * 0.15, h * 0.13, d * 0.25, -w * 0.33, -h * 0.4, d * 0.78);
  return g;
}

function addBlush(head: THREE.Group, e: Ellipsoid, side: number, ex: number, ey: number, s: number) {
  const g = onSurface(head, e, side * ex, ey, 0.004);
  part(g, SPH_XS, BLUSH, s, s * 0.6, s * 0.35, 0, 0, 0, false, 0.8);
}

function addSmile(parent: THREE.Object3D, x: number, y: number, z: number, r: number) {
  const m = part(parent, ARC, MOUTH, r, r, r, x, y, z, false, 0.7);
  m.rotation.z = Math.PI;
  return m;
}

type LegSpec = { x: number; y: number; z: number; len: number; r: number; paw: [number, number, number]; pawZ: number };

function addLeg(body: THREE.Group, s: LegSpec, side: number, front: boolean, limbColor: string, pawColor: string): Leg {
  const pivot = group(body, side * s.x, s.y, s.z);
  const limb = part(pivot, capsule(s.r, s.len), limbColor, 1, 1, 1, 0, -s.len / 2, 0, true);
  const paw = group(pivot, 0, -s.len, 0);
  part(paw, SPH_M, pawColor, s.paw[0], s.paw[1], s.paw[2], 0, 0, s.pawZ, false);
  return {
    pivot,
    limb,
    paw,
    len: s.len,
    front,
    side,
    pawR: s.paw[1],
    pawZ: s.pawZ,
    pivotPt: { x: 0, y: 0, z: 0 },
    pawPt: { x: 0, y: 0, z: s.pawZ },
    angle: 0.5,
    ret: 0.5,
    s: 1,
    ext: 0.5,
  };
}

function newState(): PetState {
  return {
    seed: Math.random() * 50,
    mode: -1,
    modeT: 0,
    pitch: 0,
    headPitch: 0,
    headYaw: 0,
    headRoll: 0,
    legF: 0,
    legB: 0,
    retF: 0,
    retB: 0,
    reachF: 1,
    reachB: 1,
    earDown: 0,
    earBack: 0,
    tailLift: 0,
    tailCurl: 0,
    tailSide: 0,
    tailWag: 0,
    tongue: 0,
    eyeOpen: 1,
    blink: 1,
    tremble: 0,
    gait: 0,
    air: 0,
    happyW: 0,
    spinY: 0,
    spinDir: 1,
    speed: 0.5,
    dt: 0.5,
    tt: 0.5,
    k: 0.5,
    kFast: 0.5,
    air01: 0.5,
    bodyRoll: 0.5,
    earFlop: 0.5,
    plant: 0.5,
    bp: 0.5,
    sy: 1.5,
    lift: 0.5,
    phase: 0,
    wagPh: 0,
    happyT: 0,
  };
}

type Base = {
  root: THREE.Group;
  spin: THREE.Group;
  body: THREE.Group;
  torso: THREE.Mesh;
  head: THREE.Group;
  neck: THREE.Group;
  legs: Leg[];
  samples: Sample[];
};

function base(
  bodyY: number,
  torso: [number, number, number],
  coat: string,
  neckAt: [number, number, number],
  headAt: [number, number],
  front: LegSpec,
  back: LegSpec,
  pawColor: string,
): Base {
  const root = new THREE.Group();
  const spin = group(root, 0, 0, 0);
  const body = group(spin, 0, bodyY, 0);
  const t = part(body, SPH, coat, torso[0], torso[1], torso[2], 0, 0, 0, true);
  const neck = group(body, neckAt[0], neckAt[1], neckAt[2]);
  const head = group(body, 0, headAt[0], headAt[1]);
  head.rotation.order = "YXZ";
  const legs = [
    addLeg(body, front, -1, true, coat, pawColor),
    addLeg(body, front, 1, true, coat, pawColor),
    addLeg(body, back, -1, false, coat, pawColor),
    addLeg(body, back, 1, false, coat, pawColor),
  ];
  const samples: Sample[] = [];
  for (const l of legs) {
    const spec = l.front ? front : back;
    samples.push({ obj: l.paw, x: 0, y: 0, z: spec.pawZ, r: spec.paw[1] });
  }
  samples.push({ obj: body, x: 0, y: -torso[1], z: 0, r: 0 });
  samples.push({ obj: body, x: 0, y: -torso[1] * 0.62, z: -torso[2] * 0.78, r: 0 });
  samples.push({ obj: body, x: 0, y: -torso[1] * 0.62, z: torso[2] * 0.78, r: 0 });
  return { root, spin, body, torso: t, head, neck, legs, samples };
}

/** A chubby thigh on a back leg; it is what she sits on, so it joins the ground samples. */
function haunch(b: Base, l: Leg, color: string, sx: number, sy: number, sz: number, x: number, y: number, z: number) {
  part(l.pivot, SPH_M, color, sx, sy, sz, x, y, z, true);
  b.samples.push({ obj: l.pivot, x, y, z, r: Math.max(sy, sz) });
}

function finish(
  kind: PetKind,
  coat: string,
  b: Base,
  bodyY: number,
  parts: {
    ears: THREE.Group[];
    earTips: THREE.Group[];
    tail: THREE.Group[];
    eyes: THREE.Group[];
    nose: THREE.Group;
    tongue: THREE.Group | null;
  },
): PetRig {
  b.root.name = `pet-${kind}`;
  return {
    group: b.root,
    kind,
    coat,
    spin: b.spin,
    body: b.body,
    torso: b.torso,
    torsoScale: b.torso.scale.clone(),
    bodyY,
    head: b.head,
    neck: b.neck,
    legs: b.legs,
    ears: parts.ears,
    earTips: parts.earTips,
    tail: parts.tail,
    eyes: parts.eyes,
    nose: parts.nose,
    noseY: parts.nose.position.y,
    tongue: parts.tongue,
    samples: b.samples,
    st: newState(),
  };
}

// ---- puppy --------------------------------------------------------------------

function makePuppy(coat: string): PetRig {
  const s = styleFor("puppy", coat);
  const bodyY = 0.23;
  const paws = s.socks ? s.accent : s.coat;
  const b = base(
    bodyY,
    [0.15, 0.135, 0.2],
    s.coat,
    [0, 0.085, 0.15],
    [0.12, 0.15],
    { x: 0.085, y: -0.06, z: 0.12, len: 0.135, r: 0.042, paw: [0.048, 0.035, 0.058], pawZ: 0.014 },
    { x: 0.09, y: -0.06, z: -0.12, len: 0.135, r: 0.045, paw: [0.05, 0.035, 0.06], pawZ: 0.014 },
    paws,
  );
  const { body, head } = b;
  // cream bib on the chest and a chubby haunch on each back leg
  part(body, SPH_M, s.accent, 0.11, 0.1, 0.11, 0, -0.025, 0.105);
  for (const l of b.legs) if (!l.front) haunch(b, l, s.coat, 0.068, 0.08, 0.085, l.side * 0.012, -0.005, -0.005);
  if (s.patch) {
    part(body, SPH_M, s.patch, 0.075, 0.04, 0.085, 0.06, 0.1, -0.06).rotation.z = -0.55;
    part(body, SPH_M, s.patch, 0.06, 0.035, 0.065, -0.07, 0.095, 0.05).rotation.z = 0.6;
  }

  const e: Ellipsoid = { cy: 0.1, cz: 0.04, rx: 0.175, ry: 0.16, rz: 0.155 };
  part(head, SPH_HI, s.coat, e.rx, e.ry, e.rz, 0, e.cy, e.cz, true);
  // muzzle with a black button nose
  part(head, SPH_M, s.accent, 0.088, 0.066, 0.078, 0, 0.038, 0.168);
  const nose = group(head, 0, 0.074, 0.238);
  part(nose, SPH_M, "#2b1f1c", 0.034, 0.024, 0.022, 0, 0, 0, false, 0.25);
  part(nose, SPH_XS, catchlight(), 0.009, 0.006, 0.006, 0.01, 0.012, 0.018);
  addSmile(head, -0.017, 0.028, 0.24, 0.017);
  addSmile(head, 0.017, 0.028, 0.24, 0.017);
  const tongue = group(head, 0, 0.022, 0.232);
  part(tongue, SPH_S, "#f07a92", 0.026, 0.01, 0.042, 0, 0, 0.03, false, 0.45);
  tongue.visible = false;

  if (s.patch) {
    const p = onSurface(head, e, 0.075, 0.03, 0.012);
    part(p, SPH_M, s.patch, 0.06, 0.066, 0.03, 0, 0, 0);
  }
  const eyes = [addEye(head, e, -1, 0.074, 0.028, 0.036, 0.046, 0.02, null), addEye(head, e, 1, 0.074, 0.028, 0.036, 0.046, 0.02, null)];
  addBlush(head, e, -1, 0.118, -0.03, 0.03);
  addBlush(head, e, 1, 0.118, -0.03, 0.03);

  // floppy ears hanging from the top corners of the head
  const ears: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const ear = group(head, side * 0.13, 0.205, 0.02);
    const m = part(ear, SPH_M, s.ears, 0.058, 0.115, 0.028, side * 0.018, -0.09, 0, true);
    m.rotation.z = side * 0.12;
    ears.push(ear);
  }

  // stubby tail with a light tip
  const tail = group(body, 0, 0.07, -0.18);
  part(tail, taper(0.017, 0.03, 0.15), s.coat, 1, 1, 1, 0, 0.075, 0);
  part(tail, SPH_S, s.socks ? s.accent : s.coat, 0.021, 0.026, 0.021, 0, 0.15, 0);

  b.samples.push({ obj: head, x: 0, y: -0.03, z: 0.17, r: 0 }); // chin
  b.samples.push({ obj: head, x: 0, y: e.cy - e.ry * 0.9, z: 0.03, r: 0 }); // under the head
  return finish("puppy", coat, b, bodyY, { ears, earTips: [], tail: [tail], eyes, nose, tongue });
}

// ---- kitten ---------------------------------------------------------------------

function makeKitten(coat: string): PetRig {
  const s = styleFor("kitten", coat);
  const bodyY = 0.2;
  const b = base(
    bodyY,
    [0.115, 0.11, 0.17],
    s.coat,
    [0, 0.075, 0.13],
    [0.09, 0.13],
    { x: 0.064, y: -0.05, z: 0.1, len: 0.124, r: 0.03, paw: [0.036, 0.026, 0.044], pawZ: 0.012 },
    { x: 0.068, y: -0.05, z: -0.1, len: 0.124, r: 0.032, paw: [0.037, 0.026, 0.046], pawZ: 0.012 },
    s.socks ? s.accent : s.coat,
  );
  const { body, head } = b;
  part(body, SPH_M, s.accent, 0.08, 0.08, 0.085, 0, -0.02, 0.1);
  for (const l of b.legs) if (!l.front) haunch(b, l, s.coat, 0.05, 0.068, 0.07, l.side * 0.01, -0.005, 0);
  if (s.stripes) {
    for (let i = 0; i < 3; i++) {
      part(body, SPH_XS, s.stripes, 0.085, 0.022, 0.02, 0, 0.098 - Math.abs(i - 1) * 0.006, -0.07 + i * 0.065);
    }
  }

  const e: Ellipsoid = { cy: 0.1, cz: 0.03, rx: 0.17, ry: 0.145, rz: 0.145 };
  part(head, SPH_HI, s.coat, e.rx, e.ry, e.rz, 0, e.cy, e.cz, true);
  // fluffy cheeks widen the lower face
  part(head, SPH_M, s.coat, 0.07, 0.055, 0.06, -0.1, 0.05, 0.075);
  part(head, SPH_M, s.coat, 0.07, 0.055, 0.06, 0.1, 0.05, 0.075);
  // little muzzle, pink nose, ":3" mouth
  part(head, SPH_M, s.accent, 0.034, 0.028, 0.03, -0.024, 0.05, 0.158);
  part(head, SPH_M, s.accent, 0.034, 0.028, 0.03, 0.024, 0.05, 0.158);
  const nose = group(head, 0, 0.078, 0.176);
  part(nose, SPH_S, NOSE_PINK, 0.019, 0.013, 0.012, 0, 0, 0, false, 0.35);
  addSmile(head, -0.013, 0.043, 0.186, 0.013);
  addSmile(head, 0.013, 0.043, 0.186, 0.013);
  // whiskers
  const wc = lightness(s.coat) < 0.45 ? "#f4f0ec" : "#fffdf8";
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const w = group(head, side * 0.045, 0.058, 0.17);
      w.rotation.y = side * -0.35;
      w.rotation.z = side * (i - 1) * 0.18;
      part(w, BOX, wc, 0.13, 0.005, 0.005, side * 0.065, 0, 0, false, 0.5);
    }
  }
  if (s.stripes) {
    for (let i = -1; i <= 1; i++) {
      const g = onSurface(head, e, i * 0.03, 0.105 - Math.abs(i) * 0.012, 0.006);
      part(g, SPH_XS, s.stripes, 0.011, 0.034, 0.01, 0, 0, 0);
    }
  }
  const eyes = [addEye(head, e, -1, 0.07, 0.022, 0.038, 0.045, 0.02, s.iris), addEye(head, e, 1, 0.07, 0.022, 0.038, 0.045, 0.02, s.iris)];
  addBlush(head, e, -1, 0.115, -0.03, 0.026);
  addBlush(head, e, 1, 0.115, -0.03, 0.026);

  // pointy ears with pink insides
  const ears: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const ear = group(head, side * 0.095, 0.19, 0.0);
    const outer = part(ear, CONE, s.ears, 0.058, 0.115, 0.03, 0, 0.055, 0, true);
    outer.rotation.y = Math.PI / 7;
    part(ear, CONE, PINK, 0.036, 0.08, 0.012, 0, 0.042, 0.018, false, 0.7);
    ears.push(ear);
  }

  // long tail: a chain of segments so it can curl into a question mark
  const tail: THREE.Group[] = [];
  const SEG = 0.058;
  const N = 7;
  let parent: THREE.Object3D = body;
  let at = new THREE.Vector3(0, 0.055, -0.155);
  for (let i = 0; i < N; i++) {
    const g = group(parent, at.x, at.y, at.z);
    const r0 = 0.024 - i * 0.0012;
    const r1 = r0 - 0.0012;
    const c = s.stripes && i % 2 === 1 ? s.stripes : s.coat;
    part(g, taper(r1, r0, SEG), c, 1, 1, 1, 0, SEG / 2, 0);
    part(g, SPH_XS, c, r0, r0, r0, 0, 0, 0);
    tail.push(g);
    parent = g;
    at = new THREE.Vector3(0, SEG, 0);
  }
  part(tail[N - 1]!, SPH_S, s.stripes ?? s.coat, 0.018, 0.02, 0.018, 0, SEG, 0);

  b.samples.push({ obj: head, x: 0, y: 0.02, z: 0.14, r: 0 }); // chin
  b.samples.push({ obj: head, x: 0, y: e.cy - e.ry * 0.9, z: 0.03, r: 0 });
  return finish("kitten", coat, b, bodyY, { ears, earTips: [], tail, eyes, nose, tongue: null });
}

// ---- bunny ------------------------------------------------------------------------

function makeBunny(coat: string): PetRig {
  const s = styleFor("bunny", coat);
  const bodyY = 0.16;
  const feet = s.socks ? s.accent : s.coat;
  const b = base(
    bodyY,
    [0.13, 0.12, 0.15],
    s.coat,
    [0, 0.08, 0.1],
    [0.09, 0.11],
    { x: 0.06, y: -0.05, z: 0.1, len: 0.09, r: 0.026, paw: [0.03, 0.02, 0.04], pawZ: 0.012 },
    { x: 0.1, y: -0.06, z: -0.05, len: 0.078, r: 0.03, paw: [0.042, 0.022, 0.09], pawZ: 0.04 },
    feet,
  );
  const { body, head } = b;
  b.torso.position.z = 0.02;
  // round rump makes the pear shape; belly and chest fluff
  part(body, SPH, s.coat, 0.145, 0.135, 0.12, 0, -0.01, -0.06, true);
  part(body, SPH_M, s.accent, 0.09, 0.08, 0.08, 0, -0.03, 0.1);
  for (const l of b.legs) if (!l.front) haunch(b, l, s.coat, 0.055, 0.075, 0.085, l.side * 0.012, 0.005, 0);
  b.samples.push({ obj: body, x: 0, y: -0.145, z: -0.06, r: 0 });

  // cotton tail
  const tail = group(body, 0, 0.03, -0.18);
  part(tail, SPH_M, s.accent, 0.055, 0.055, 0.05, 0, 0, 0, true, 0.9);

  const e: Ellipsoid = { cy: 0.08, cz: 0.03, rx: 0.14, ry: 0.125, rz: 0.13 };
  part(head, SPH_HI, s.coat, e.rx, e.ry, e.rz, 0, e.cy, e.cz, true);
  // chubby cheeks, muzzle puffs, pink nose, one buck tooth
  part(head, SPH_M, s.coat, 0.06, 0.05, 0.052, -0.068, 0.035, 0.085);
  part(head, SPH_M, s.coat, 0.06, 0.05, 0.052, 0.068, 0.035, 0.085);
  part(head, SPH_M, s.accent, 0.03, 0.025, 0.028, -0.02, 0.045, 0.148);
  part(head, SPH_M, s.accent, 0.03, 0.025, 0.028, 0.02, 0.045, 0.148);
  const nose = group(head, 0, 0.07, 0.168);
  part(nose, SPH_S, NOSE_PINK, 0.019, 0.014, 0.012, 0, 0, 0, false, 0.35);
  part(head, BOX, "#ffffff", 0.018, 0.02, 0.006, 0, 0.018, 0.158, false, 0.3);
  const eyes = [addEye(head, e, -1, 0.068, 0.018, 0.034, 0.042, 0.02, null), addEye(head, e, 1, 0.068, 0.018, 0.034, 0.042, 0.02, null)];
  addBlush(head, e, -1, 0.098, -0.02, 0.024);
  addBlush(head, e, 1, 0.098, -0.02, 0.024);

  // long ears in two halves; the right one flops over at the middle
  const ears: THREE.Group[] = [];
  const earTips: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const ear = group(head, side * 0.045, 0.18, -0.01);
    part(ear, SPH_M, s.ears, 0.036, 0.075, 0.02, 0, 0.065, 0, true);
    part(ear, SPH_M, PINK, 0.021, 0.06, 0.008, 0, 0.068, 0.013, false, 0.7);
    const tip = group(ear, 0, 0.12, 0);
    part(tip, SPH_M, s.ears, 0.038, 0.07, 0.019, 0, 0.06, 0, true);
    part(tip, SPH_M, PINK, 0.022, 0.052, 0.008, 0, 0.056, 0.012, false, 0.7);
    ears.push(ear);
    earTips.push(tip);
  }

  b.samples.push({ obj: head, x: 0, y: 0.0, z: 0.13, r: 0 });
  b.samples.push({ obj: head, x: 0, y: e.cy - e.ry * 0.9, z: 0.03, r: 0 });
  return finish("bunny", coat, b, bodyY, { ears, earTips, tail: [tail], eyes, nose, tongue: null });
}

/** Build a pet facing +z, feet on y=0, origin at its feet centre. coat is one of PETS[..].colors (default first). */
export function makePet(kind: PetKind, coat?: string): PetRig {
  const def = PETS.find((p) => p.kind === kind) ?? PETS[0]!;
  const c = coat ?? def.colors[0]!;
  const rig = kind === "kitten" ? makeKitten(c) : kind === "bunny" ? makeBunny(c) : makePuppy(c);
  animatePet(rig, "follow", 0, 0, 0);
  return rig;
}

/** Optional accessory anchor so a bow/bandana can be attached later: a Group positioned at the neck. */
export function petNeck(rig: PetRig): THREE.Group {
  return rig.neck;
}

// ---- animation ------------------------------------------------------------------

const MODE_CODE: Record<PetMode, number> = { follow: 0, sit: 1, lost: 2, happy: 3, sniff: 4 };
const TAU = Math.PI * 2;
const _v = new THREE.Vector3();

function smooth(a: number, b: number, x: number) {
  let u = (x - a) / (b - a);
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  return u * u * (3 - 2 * u);
}

/*
 * The helpers below take only objects and write their results into the rig,
 * because a double passed to or returned from a call V8 does not inline gets
 * boxed on the heap. Measured: ~700 bytes a frame before this, none after.
 */

/** Group-space position of a local point on obj, left in _v (walks the parent chain). */
function toGroup(rig: PetRig, obj: THREE.Object3D, p: Pt) {
  _v.set(p.x, p.y, p.z);
  let o: THREE.Object3D | null = obj;
  while (o && o !== rig.group) {
    o.updateMatrix();
    _v.applyMatrix4(o.matrix);
    o = o.parent;
  }
}

/** st.lift = the lift that puts the lowest ground sample on y = 0 (spin must be at y = 0). */
function plantLift(rig: PetRig) {
  const st = rig.st;
  let low = Infinity;
  const S = rig.samples;
  for (let i = 0; i < S.length; i++) {
    const s = S[i]!;
    toGroup(rig, s.obj, s);
    const y = _v.y - s.r * st.sy;
    if (y < low) low = y;
  }
  st.lift = low < 1e9 ? -low : 0;
}

/** Pose a leg from leg.angle, leg.ret and leg.ext, with the body pitched st.bp. */
function setLeg(leg: Leg, st: PetState) {
  const s = 1 - leg.ret * 0.5 + leg.ext / leg.len;
  leg.s = s;
  leg.pivot.rotation.x = leg.angle;
  leg.limb.position.y = -leg.len * s * 0.5;
  leg.limb.scale.y = s;
  leg.paw.position.y = -leg.len * s;
  // keep the pads roughly level with the ground
  leg.paw.rotation.x = -(leg.angle + st.bp) * 0.85;
}

const FOLLOW = 0;
const SIT = 1;
const LOST = 2;
const HAPPY = 3;
const SNIFF = 4;

/**
 * Animate one frame. speed: its ground speed m/s (0..~7; it runs to keep up with her), t: seconds (game clock), dt: frame seconds.
 * follow: walk/trot/run cycle scaled by speed (puppy bounds, kitten prances, bunny hops), idle breathing + tail/ear motion when speed ~0.
 * sit: sits down, tail wag (puppy) / tail curl (kitten) / nose twitch (bunny), looks around.
 * lost: scared/sad: curled up small, trembling slightly, ears down, occasional peek up (used while it's hiding in a dark cave before she finds it).
 * happy: excited jumping/spinning on the spot (used when she finds it and when she pets it) — keep the group's world position unchanged; bounce via inner parts.
 * sniff: nose to ground, walking slowly, tail up (used when it's sniffing toward something).
 * Must be allocation-free per frame and must not change rig.group.position or rig.group.rotation.y (the runtime owns those); animate child parts only.
 */
export function animatePet(rig: PetRig, mode: PetMode, speed: number, t: number, dt: number): void {
  const st = rig.st;
  st.dt = dt > 0 ? (dt > 0.1 ? 0.1 : dt) : 0;
  st.tt = (Number.isFinite(t) ? t : 0) + st.seed;
  const code = MODE_CODE[mode] ?? FOLLOW;
  // the very first call snaps straight into the pose instead of blending from zero
  const first = st.mode === -1;
  if (code !== st.mode) {
    st.mode = code;
    st.modeT = 0;
  }
  st.modeT += st.dt;
  st.k = first ? 1 : 1 - Math.exp(-st.dt * 7);
  st.kFast = first ? 1 : 1 - Math.exp(-st.dt * 16);
  // gait size follows a smoothed speed, so a sudden change never pops the stride or hop
  const v = speed > 0 ? (speed > 12 ? 12 : speed) : 0;
  st.speed += (v - st.speed) * (first ? 1 : 1 - Math.exp(-st.dt * 10));

  blendPose(rig);
  happyBounce(rig);
  poseAndPlant(rig);
  gaitLayer(rig);
  animateEars(rig);
  animateTail(rig);
  animateFaceParts(rig);
}

/** Pick this mode's pose and ease every pose value toward it. */
function blendPose(rig: PetRig) {
  const st = rig.st;
  const kind = rig.kind;
  const isPuppy = kind === "puppy";
  const isKitten = kind === "kitten";
  const isBunny = kind === "bunny";
  const tt = st.tt;
  const speed = st.speed;
  const mode = st.mode;

  const moving = smooth(0.05, 1.2, speed);
  let pitch = 0;
  let hp = 0;
  let hy = 0;
  let hr = 0;
  let legF = 0;
  let legB = 0;
  let retF = 0;
  let retB = 0;
  let reachF = 1;
  let reachB = 1;
  let earDown = 0;
  let earBack = 0;
  let tailLift = isPuppy ? -0.75 : isKitten ? -0.3 : 0;
  let tailCurl = isKitten ? 0.28 : 0;
  let tailSide = 0;
  let wag = isPuppy ? 0.3 : isKitten ? 0.14 : 0.08;
  let wagRate = isPuppy ? 8 : isKitten ? 2.2 : 3;
  let tongue = 0;
  let eyeOpen = 1;
  let tremble = 0;
  let gait = 0;

  if (mode === FOLLOW) {
    gait = moving;
    const idle = 1 - moving;
    // a slow look-around that lingers at each side instead of sweeping evenly
    const la = (Math.sin(tt * 0.5) + 0.35 * Math.sin(tt * 1.37 + 1)) / 1.35;
    hy = idle * Math.sign(la) * Math.pow(Math.abs(la), 0.55) * 0.45;
    hp = idle * Math.sin(tt * 0.9) * 0.05;
    hr = idle * Math.sin(tt * 0.37) * 0.08;
    const run = smooth(2.5, 6, speed);
    earBack = run * 0.45;
    if (isPuppy) {
      wag = 0.3 + 0.2 * moving;
      wagRate = 8 + speed;
      tongue = smooth(3, 4.5, speed); // panting when running
    } else if (isKitten) {
      tailLift = -0.3 - 0.75 * run;
      tailCurl = 0.3 * (1 - run);
    } else {
      // loaf pose when still: legs tucked a touch
      retF = idle * 0.25;
      retB = idle * 0.15;
    }
  } else if (mode === SIT) {
    const la = (Math.sin(tt * 0.65) + 0.35 * Math.sin(tt * 1.78 + 1)) / 1.35;
    hy = Math.sign(la) * Math.pow(Math.abs(la), 0.55) * 0.6;
    hr = Math.sin(tt * 0.6) * 0.12;
    if (isPuppy) {
      pitch = -0.55;
      legF = 0.55;
      legB = -0.62;
      retB = 0.1;
      hp = 0.42;
      tailLift = -0.95; // world -1.5: just above horizontal, wagging along the floor
      wag = 0.6;
      wagRate = 12;
    } else if (isKitten) {
      pitch = -0.62;
      legF = 0.62;
      legB = -0.66;
      retB = 0.1;
      hp = 0.5;
      tailLift = -0.82; // lies back along the floor, then curls round her side
      tailCurl = 0;
      tailSide = 0.34;
      wag = 0.1;
      wagRate = 2.6;
    } else {
      // up on her haunches, front paws held at her chest
      pitch = -0.95;
      legF = -0.45;
      retF = 0.45;
      reachF = 0;
      legB = 0.75;
      hp = 0.8;
      earBack = -0.05;
    }
  } else if (mode === LOST) {
    // curled up tight; peeks up every few seconds, then tucks back down
    const cyc = (st.modeT + st.seed * 0.37) % 5;
    const peek = cyc > 3.4 ? Math.sin(((cyc - 3.4) / 1.6) * Math.PI) : 0;
    const pk = peek * peek * (3 - 2 * peek);
    pitch = 0.1;
    reachF = 0;
    reachB = 0;
    legF = -1.4;
    legB = isBunny ? -0.1 : -1.3;
    retF = 0.35;
    retB = 0.35;
    hp = (isBunny ? 0.5 : 0.6) - pk * 0.75;
    hy = pk * Math.sin(tt * 2.4) * 0.5;
    earDown = 1 - pk * 0.45;
    eyeOpen = 0.62 + pk * 0.5;
    tremble = 1 - pk * 0.6;
    tailLift = isPuppy ? -2.4 : isKitten ? -2.2 : 0;
    tailCurl = 0;
    tailSide = isKitten ? 0.42 : 0;
    wag = isKitten ? 0.05 : 0.02;
    wagRate = 3;
  } else if (mode === HAPPY) {
    hp = -0.25; // looking up at her
    hr = Math.sin(tt * 5) * 0.22;
    eyeOpen = 0.55; // smiling eyes
    earDown = -0.4;
    tongue = 1;
    if (isPuppy) {
      wag = 0.85;
      wagRate = 20;
    } else if (isKitten) {
      tailLift = -0.05;
      tailCurl = 0.35;
      wag = 0.05;
      wagRate = 30;
    } else {
      wag = 0.35;
      wagRate = 22;
    }
  } else {
    gait = smooth(0.05, 0.8, speed) * 0.65;
    // front end crouched down rather than tipping the whole body, so the back paws stay planted
    pitch = isBunny ? 0.2 : 0.22;
    retF = isBunny ? 0.2 : 0.5;
    hp = (isBunny ? 0.85 : 1.1) + Math.sin(tt * 13) * 0.035;
    hy = Math.sin(tt * 1.3) * 0.3;
    earBack = isBunny ? 0.45 : -0.15;
    if (isPuppy) {
      tailLift = -0.25;
      wag = 0.22;
      wagRate = 7;
    } else if (isKitten) {
      tailLift = -0.08;
      tailCurl = 0.3;
    }
  }

  const k = st.k;
  const kFast = st.kFast;
  st.pitch += (pitch - st.pitch) * k;
  st.headPitch += (hp - st.headPitch) * k;
  st.headYaw += (hy - st.headYaw) * k;
  st.headRoll += (hr - st.headRoll) * k;
  st.legF += (legF - st.legF) * k;
  st.legB += (legB - st.legB) * k;
  st.retF += (retF - st.retF) * k;
  st.retB += (retB - st.retB) * k;
  st.reachF += (reachF - st.reachF) * k;
  st.reachB += (reachB - st.reachB) * k;
  st.earDown += (earDown - st.earDown) * k;
  st.earBack += (earBack - st.earBack) * k;
  st.tailLift += (tailLift - st.tailLift) * k;
  st.tailCurl += (tailCurl - st.tailCurl) * k;
  st.tailSide += (tailSide - st.tailSide) * k;
  st.tailWag += (wag - st.tailWag) * k;
  st.tongue += ((isPuppy ? tongue : 0) - st.tongue) * kFast;
  st.eyeOpen += (eyeOpen - st.eyeOpen) * kFast;
  st.tremble += (tremble - st.tremble) * k;
  st.gait += (gait - st.gait) * k;
  st.wagPh = (st.wagPh + st.dt * wagRate) % TAU;

  // gait clock
  let freq = kind === "puppy" ? 1.8 + speed * 0.45 : kind === "kitten" ? 1.7 + speed * 0.45 : 1.8 + speed * 0.3;
  if (mode === SNIFF) freq *= 0.8;
  if (st.gait > 0.002) st.phase = (st.phase + st.dt * TAU * freq) % TAU;
}

/** Happy: bounces with a full spin every few seconds, all inside the spin group. */
function happyBounce(rig: PetRig) {
  const st = rig.st;
  const H = rig.kind === "puppy" ? 0.1 : rig.kind === "kitten" ? 0.09 : 0.13;
  if (st.mode === HAPPY) {
    st.happyT += st.dt;
    const CYCLE = 3;
    const c = st.happyT % CYCLE;
    let air = 0;
    let spin = 0;
    if (c < 1.1) {
      air = Math.abs(Math.sin((c / 0.55) * Math.PI)) * H;
    } else if (c < 1.85) {
      const u = (c - 1.1) / 0.75;
      air = Math.sin(u * Math.PI) * H * 1.7;
      const dir = Math.floor(st.happyT / CYCLE) % 2 === 0 ? 1 : -1;
      spin = u * u * (3 - 2 * u) * TAU * dir;
    } else {
      air = Math.abs(Math.sin(((c - 1.85) / 0.575) * Math.PI)) * H;
    }
    st.air = air;
    st.spinY = spin;
    if (spin !== 0) st.spinDir = spin > 0 ? 1 : -1;
    st.happyW += (1 - st.happyW) * st.kFast;
  } else {
    st.happyT = 0;
    st.air -= st.air * st.kFast;
    // interrupted mid-spin: finish the turn it is making (or undo one barely begun)
    const a = st.spinY;
    if (a !== 0) {
      const goal = a * st.spinDir > 0.6 ? TAU * st.spinDir : 0;
      const step = 9 * st.dt;
      const d = goal - a;
      st.spinY = d > step ? a + step : d < -step ? a - step : 0;
    }
    st.happyW -= st.happyW * st.kFast;
  }
  const a01 = st.air / H;
  st.air01 = a01 < 0 ? 0 : a01 > 1 ? 1 : a01;
}

/** Body, head and still leg pose; plant it on the floor and stretch stance legs down to it. */
function poseAndPlant(rig: PetRig) {
  const st = rig.st;
  const tt = st.tt;
  const body = rig.body;

  // tremble when scared
  body.position.x = Math.sin(tt * 43) * 0.0035 * st.tremble;
  body.position.y = rig.bodyY;
  st.bodyRoll = Math.sin(tt * 57) * 0.025 * st.tremble;

  // breathing: quick shallow breaths when scared, excited or running
  const breathRate = st.tremble > 0.3 ? 6 : st.mode === HAPPY || st.speed > 3 ? 8 : 2.2;
  const breath = 1 + Math.sin(tt * breathRate) * (0.018 + 0.01 * st.tremble);
  const ts = rig.torso.scale;
  ts.x = rig.torsoScale.x * breath;
  ts.y = rig.torsoScale.y * breath;
  ts.z = rig.torsoScale.z;

  // squash on landing and stretch in the air while bouncing for joy
  const l = st.air / 0.03;
  const land = 1 - (l > 1 ? 1 : l);
  const sy = 1 + st.happyW * (0.07 * st.air01 - 0.08 * land);
  const sxz = 1 + (1 - sy) * 0.5;
  const spin = rig.spin;
  spin.scale.x = sxz;
  spin.scale.y = sy;
  spin.scale.z = sxz;
  spin.rotation.y = st.spinY;
  spin.position.y = 0;

  body.rotation.x = st.pitch;
  body.rotation.z = st.bodyRoll;
  const head = rig.head;
  head.rotation.x = st.headPitch;
  head.rotation.y = st.headYaw;
  head.rotation.z = st.headRoll;

  st.bp = st.pitch;
  st.sy = sy;
  const L = rig.legs;
  for (let i = 0; i < 4; i++) {
    const leg = L[i]!;
    leg.ext = 0;
    leg.angle = leg.front ? st.legF : st.legB;
    leg.ret = leg.front ? st.retF : st.retB;
    setLeg(leg, st);
  }
  plantLift(rig);
  st.plant = st.lift;

  // any stance paw left hanging (sitting, crouching) stretches down to the floor
  spin.position.y = st.plant;
  for (let i = 0; i < 4; i++) {
    const leg = L[i]!;
    const w = leg.front ? st.reachF : st.reachB;
    if (w < 0.01) continue;
    toGroup(rig, leg.pivot, leg.pivotPt);
    const pivotY = _v.y;
    toGroup(rig, leg.paw, leg.pawPt);
    const pawY = _v.y;
    const gap = pawY - leg.pawR * sy;
    const down = (pivotY - pawY) / (leg.len * leg.s);
    if (gap > 0.001 && down > 0.2) {
      const want = gap / down;
      const cap = leg.len * 0.45;
      leg.ext = (want < cap ? want : cap) * w;
      setLeg(leg, st);
    }
  }
  spin.position.y = 0;
}

/** Walk, trot, bound, prance or hop on top of the planted pose, then set the final height. */
function gaitLayer(rig: PetRig) {
  const st = rig.st;
  const kind = rig.kind;
  const body = rig.body;
  const L = rig.legs;
  const ph = st.phase;
  const G = st.gait;
  const speed = st.speed;
  const air01 = st.air01;
  let bodyPitch = st.pitch;
  let extraAir = 0;
  st.earFlop = 0;

  if (kind === "bunny") {
    const sn = Math.sin(ph);
    const up = sn > 0 ? sn : 0;
    const hopH = Math.min(0.2, 0.045 + speed * 0.025);
    extraAir = G * hopH * Math.pow(up, 0.8);
    const kick = G * (sn > 0 ? 1 : 0.25);
    const takeoff = G * -0.22 * Math.cos(ph);
    const fl = st.legF - 0.6 * air01 + kick * (sn > 0 ? -0.7 : 0.3) * sn;
    const bl = st.legB + 0.6 * air01 + kick * (sn > 0 ? 0.95 : 0.2) * sn;
    // legs reach and kick through the hop; the body tips nose-up on take-off
    bodyPitch += takeoff;
    body.rotation.x = bodyPitch;
    st.bp = bodyPitch;
    for (let i = 0; i < 4; i++) {
      const leg = L[i]!;
      leg.angle = leg.front ? fl : bl;
      leg.ret = leg.front ? st.retF : st.retB;
      setLeg(leg, st);
    }
    // re-plant on the hop pose so the feet land flat; the hop height goes on top
    if (G > 0.001) {
      plantLift(rig);
      st.plant += (st.lift - st.plant) * Math.min(1, G * 3);
    }
    st.earFlop = G * 0.5 * up;
    // binky twist in the air
    body.rotation.z = st.bodyRoll + st.happyW * Math.sin(st.happyT * 9) * 0.3 * air01;
  } else {
    const isPuppy = kind === "puppy";
    // puppy: trot blends into a bound; kitten: a four-beat prance into a gallop
    const b = isPuppy ? smooth(2.5, 5, speed) : smooth(3, 5.5, speed);
    const PI = Math.PI;
    const oFL = isPuppy ? 0 : (PI / 2) * (1 - b);
    const oFR = isPuppy ? PI + (0.35 - PI) * b : PI * 1.5 + (0.3 - PI * 1.5) * b;
    const oBL = isPuppy ? PI : PI * b;
    const oBR = isPuppy ? (PI + 0.35) * b : PI + 0.3 * b;
    const lift = isPuppy ? 0.4 : 0.55;
    const amp = G * Math.min(0.9, 0.22 + 0.13 * speed) * (st.mode === SNIFF ? 0.7 : 1);
    const rock = G * b * 0.14 * Math.sin(ph + 0.6);
    bodyPitch += rock;
    body.rotation.x = bodyPitch;
    body.rotation.z = st.bodyRoll + (isPuppy ? 0 : Math.sin(ph) * 0.05 * G * (1 - b));
    extraAir = G * b * 0.035 * Math.abs(Math.sin(ph));
    // kittens keep their heads level while they prance
    rig.head.rotation.x = st.headPitch + (isPuppy ? -rock * 0.5 : -rock - Math.sin(ph * 2) * 0.03 * G);
    st.earFlop = G * (0.12 + 0.12 * b) * Math.sin(ph * 2 - 1);
    // legs splay out while bouncing for joy
    const splayF = -0.55 * air01 + (isPuppy ? Math.sin(st.tt * 18) * 0.25 * air01 : 0);
    const splayB = 0.55 * air01;
    st.bp = bodyPitch;
    for (let i = 0; i < 4; i++) {
      const leg = L[i]!;
      const a = ph + (i === 0 ? oFL : i === 1 ? oFR : i === 2 ? oBL : oBR);
      const c = -Math.cos(a);
      if (leg.front) {
        leg.angle = st.legF + splayF + amp * Math.sin(a);
        leg.ret = Math.min(1, st.retF + G * lift * (c > 0 ? c : 0));
      } else {
        leg.angle = st.legB + splayB + amp * Math.sin(a);
        leg.ret = Math.min(1, st.retB + G * lift * (c > 0 ? c : 0));
      }
      setLeg(leg, st);
    }
    // walking: re-plant on whichever paws are down, which gives the natural bob
    if (G > 0.001) {
      plantLift(rig);
      st.plant += (st.lift - st.plant) * Math.min(1, G * 3);
    }
  }
  rig.spin.position.y = st.plant + st.air + extraAir;
}

function animateEars(rig: PetRig) {
  const st = rig.st;
  const tt = st.tt;
  const air01 = st.air01;
  const earFlop = st.earFlop;
  const E = rig.ears;
  const twitchC = (tt * 0.23) % 1;
  const twitch = twitchC < 0.05 ? Math.sin((twitchC / 0.05) * Math.PI) : 0;
  for (let i = 0; i < E.length; i++) {
    const ear = E[i]!;
    const side = i === 0 ? -1 : 1;
    if (rig.kind === "puppy") {
      const d = st.earDown;
      const flop = earFlop + 0.45 * air01 * st.happyW - 0.18 * d;
      ear.rotation.z = side * (0.26 + flop);
      ear.rotation.x = 0.32 * (d < 0 ? 0 : d > 1 ? 1 : d) + st.earBack * 0.6 - 0.1 * air01;
      ear.rotation.y = side * 0.1 * twitch * (i === 1 ? 1 : 0);
    } else if (rig.kind === "kitten") {
      const down = st.earDown > 0 ? st.earDown : 0;
      const perk = st.earDown < 0 ? -st.earDown : 0;
      // flattened out sideways when scared ("airplane ears"), perked when happy
      ear.rotation.z = -side * (0.22 + down * 0.95 - 0.12 * perk);
      ear.rotation.x = st.earBack * 0.6 + down * 0.3;
      ear.rotation.y = side * (twitch * 0.5 * (i === 0 ? 1 : 0) + Math.sin(tt * 0.8 + i) * 0.08);
    } else {
      const down = st.earDown > 0 ? st.earDown : 0;
      // laid flat back along her body when scared, swept back by each hop
      ear.rotation.x = -0.12 - st.earBack - down * 1.75 - earFlop * 0.8 + Math.sin(tt * 18) * 0.12 * air01 * st.happyW;
      ear.rotation.z = -side * (0.14 + down * 0.25 + 0.1 * air01);
      ear.rotation.y = side * (Math.sin(tt * 0.7 + i * 2) * 0.25 + twitch * 0.4) * (1 - down);
      const tip = rig.earTips[i]!;
      if (i === 1) {
        // the floppy one
        tip.rotation.z = -(1.45 - 0.35 * air01 - down * 0.5) + Math.sin(tt * 3) * 0.06;
        tip.rotation.x = 0.1 * earFlop;
      } else {
        tip.rotation.z = Math.sin(tt * 1.7) * 0.05;
        tip.rotation.x = -0.12 - earFlop * 0.4 - down * 0.15;
      }
    }
  }
}

function animateTail(rig: PetRig) {
  const st = rig.st;
  const T = rig.tail;
  const air01 = st.air01;
  if (rig.kind === "puppy") {
    const tail = T[0]!;
    tail.rotation.x = st.tailLift + (st.mode === SNIFF ? 0 : -0.1 * air01);
    tail.rotation.z = Math.sin(st.wagPh) * st.tailWag;
  } else if (rig.kind === "kitten") {
    const n = T.length;
    T[0]!.rotation.x = st.tailLift;
    T[0]!.rotation.z = Math.sin(st.wagPh) * st.tailWag * 0.6 + st.tailSide * 0.3;
    const quiver = st.happyW * Math.sin(st.tt * 34) * 0.05;
    for (let i = 1; i < n; i++) {
      const w = i / (n - 1);
      const seg = T[i]!;
      // curl grows toward the tip: the question mark
      seg.rotation.x = -st.tailCurl * w * w * 1.6 + 0.04 * (1 - w) * st.gait;
      seg.rotation.z = st.tailSide * (0.5 + w * 0.5) + Math.sin(st.wagPh - i * 0.7) * st.tailWag * (0.5 + w) + quiver * w;
    }
  } else {
    const tail = T[0]!;
    tail.rotation.y = Math.sin(st.wagPh) * st.tailWag;
    tail.rotation.x = -0.2 * air01;
  }
}

function animateFaceParts(rig: PetRig) {
  const st = rig.st;
  const tt = st.tt;
  const isBunny = rig.kind === "bunny";

  // blink every few seconds (not while squinting with joy)
  const blinkC = (tt * 0.27) % 1;
  const blinkT = blinkC < 0.035 && st.mode !== HAPPY ? 0.08 : 1;
  st.blink += (blinkT - st.blink) * (blinkT < 1 ? 0.6 : st.kFast);
  const open = st.eyeOpen * st.blink;
  const eyeY = open > 0.06 ? open : 0.06;
  for (let i = 0; i < rig.eyes.length; i++) rig.eyes[i]!.scale.y = eyeY;

  // nose twitches: bunnies in bursts (all the time when sitting or scared), everyone when sniffing
  const sniffing = st.mode === SNIFF ? 1 : 0;
  const burst = isBunny ? (Math.sin(tt * 0.9) > 0.1 || st.mode === SIT || st.tremble > 0.3 ? 1 : 0) : sniffing;
  const noseAmp = isBunny ? 0.005 : 0.003;
  rig.nose.position.y = rig.noseY + burst * Math.sin(tt * 30) * noseAmp;
  rig.nose.scale.x = 1 + burst * Math.sin(tt * 30 + 1) * 0.12;

  const tg = rig.tongue;
  if (tg) {
    const amt = st.tongue;
    tg.visible = amt > 0.04;
    tg.scale.z = amt > 0.05 ? amt : 0.05;
    tg.rotation.x = 0.55 + Math.sin(tt * 15) * 0.12 * amt;
  }
}
