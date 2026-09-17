import type * as THREE from "three";

/**
 * Sloan's dances, one per iPod music channel.
 *
 * Layered on top of animateGirl: that pass poses her every frame, then this one
 * blends the rig toward a dance pose by `weight`. Every move is a function of
 * the beat count, so the steps land on the music and the same beat always gives
 * the same pose (nothing here keeps state between frames).
 *
 * Rig facts this relies on (read from makeGirl / animateGirl, and checked
 * numerically):
 * - She faces local +z. `leftArm`/`leftLeg` sit at -x, `rightArm`/`rightLeg`
 *   (the iPod hand) at +x.
 * - Arms pivot at the shoulder, legs at the hip, all hanging down -y.
 *   rotation.x negative swings a limb forward (arm -PI/2 points straight ahead,
 *   about -2.5 is overhead); positive swings it back.
 * - rotation.z positive moves the hand/foot toward +x: that is inward for the
 *   left limbs and outward for the right ones.
 * - torso.rotation.x positive leans forward, head.rotation.x positive nods down.
 * - The torso hangs off the root, not the hips, so a hop moves both, while a
 *   "knee bend" dips only the torso: the skirt hides the hip joint.
 * - Legs are rigid from hip to sole, so the sole corners are what touch the
 *   ground; a final pass lifts her if a pose would sink a corner.
 */
export type DanceId = "pop" | "rock" | "hiphop" | "latin" | "calm";

const PI = Math.PI;
const TAU = PI * 2;

// leg geometry from makeGirl: sole bottom 0.67 below the hip, sole box 0.2 wide
// and running from 0.095 behind to 0.215 in front of the leg line
const LEG = 0.67;
const SOLE_HALF_X = 0.1;
const TOE_Z = 0.215;
const HEEL_Z = 0.095;
/** Sole height in the root frame at rest (hips 0.72 - 0.67). */
const GROUND = 0.05;
/** How far a tipped sole corner may sink below the rest ground. */
const SINK = 0.015;

// ---- the pose buffer --------------------------------------------------------
// One module-level object, rewritten every call, so there is no per-frame
// allocation. Values are dance targets; see applyDance for how each blends.
const P = {
  // additive offsets (metres)
  lift: 0, // hips and torso together: a hop or a rise onto toes
  dip: 0, // torso only: a knee bend into the skirt
  // position shifts from rest (metres); the legs counter-rotate so feet stay put
  hipsX: 0,
  torsoX: 0,
  // joints animateGirl writes every frame: absolute targets
  hipsRY: 0,
  torsoRX: 0,
  torsoRY: 0,
  torsoRZ: 0,
  headRX: 0,
  headRY: 0,
  lLegX: 0,
  rLegX: 0,
  lArmX: 0,
  lArmZ: 0,
  rArmX: 0,
  rArmZ: 0,
  braidLZ: 0,
  braidRZ: 0,
  braidX: 0,
  // joints animateGirl never touches: targets relative to makeGirl's rest (0)
  headRZ: 0,
  lLegZ: 0,
  rLegZ: 0,
  lArmY: 0,
  rArmY: 0,
  skirtRZ: 0,
  // extra root yaw, unweighted
  yaw: 0,
};

function resetPose() {
  P.lift = 0;
  P.dip = 0;
  P.hipsX = 0;
  P.torsoX = 0;
  P.hipsRY = 0;
  P.torsoRX = 0;
  P.torsoRY = 0;
  P.torsoRZ = 0;
  P.headRX = 0;
  P.headRY = 0;
  P.lLegX = 0;
  P.rLegX = 0;
  P.lArmX = 0;
  P.lArmZ = -0.1;
  P.rArmX = 0;
  P.rArmZ = 0.1;
  P.braidLZ = -0.2;
  P.braidRZ = 0.2;
  P.braidX = 0;
  P.headRZ = 0;
  P.lLegZ = 0;
  P.rLegZ = 0;
  P.lArmY = 0;
  P.rArmY = 0;
  P.skirtRZ = 0;
  P.yaw = 0;
}

// ---- small helpers (module-level, no closures per frame) ---------------------
function clamp01(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function smooth(e0: number, e1: number, x: number) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
/** 0 outside [a, b], 1 inside, with `edge`-beat smooth ramps inside the range. */
function win(p: number, a: number, b: number, edge: number) {
  return smooth(a, a + edge, p) * (1 - smooth(b - edge, b, p));
}
/** A sin-squared hump over [a, a + len], peaking in the middle. */
function bump(p: number, a: number, len: number) {
  if (p <= a || p >= a + len) return 0;
  const s = Math.sin((PI * (p - a)) / len);
  return s * s;
}
/** Position within an n-beat phrase, always in [0, n). */
function phrase(b: number, n: number) {
  const r = b % n;
  return r < 0 ? r + n : r;
}
/** 1 on every beat, 0 halfway between: down-on-the-beat bounces. */
function onBeat(b: number) {
  return (1 + Math.cos(TAU * b)) / 2;
}

/**
 * Lowest sole corner of a leg below its hip pivot (negative), for a leg with
 * rotation (x, 0, z) in three's XYZ order: y = (px sin z + py cos z) cos x - pz sin x.
 */
function soleLow(rx: number, rz: number) {
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const tilt = sx > 0 ? TOE_Z * sx : HEEL_Z * -sx;
  return -LEG * Math.cos(rz) * cx - SOLE_HALF_X * Math.abs(Math.sin(rz) * cx) - tilt;
}

// the windmill writes its joint angles here rather than returning a tuple
let millX = 0;
let millZ = 0;
/**
 * Left arm pointing along a circle in front of her: out, up, across, down.
 * The arm direction d is turned into XYZ Euler angles with y = 0 using
 * d = (sin z, -cos z cos x, -cos z sin x). Because the circle always leans
 * forward (dz > 0), x stays inside (-PI, 0) and never wraps.
 */
function windmill(phi: number) {
  const s = Math.sin(phi);
  const dx = -s * (s > 0 ? 1 : 0.5); // outward is -x for the left arm; small inward half
  const dy = -Math.cos(phi);
  const dz = 0.75;
  const n = Math.sqrt(dx * dx + dy * dy + dz * dz);
  millZ = Math.asin(dx / n);
  millX = Math.atan2(-dz, -dy);
}

// ---- the dances -------------------------------------------------------------

/** Pop: a skipping hop on every beat, fists pumping up in turn, head bobbing; a cheer wave at the end of each 8. */
function pop(b: number) {
  const s2 = Math.sin(PI * b); // + for beat 0-1, - for beat 1-2
  const hop = Math.abs(s2); // 0 on the beat (landed), 1 in between (up)
  const kickL = s2 > 0 ? s2 : 0;
  const kickR = s2 < 0 ? -s2 : 0;
  const p8 = phrase(b, 8);
  const cheer = win(p8, 5.75, 8, 0.6);

  P.lift = 0.075 * Math.pow(hop, 0.7);
  const land = 1 - hop;
  P.dip = -0.025 * land * land * land; // a little squash as she lands

  // the kicking foot flicks back behind her
  P.lLegX = 0.55 * kickL - 0.1 * kickR;
  P.rLegX = 0.55 * kickR - 0.1 * kickL;

  // pump: the free arm right up, the iPod arm to about shoulder height;
  // cheer: both up in a V, waving side to side
  P.lArmX = lerp(-0.3 - 2.15 * kickL, -2.4, cheer);
  P.lArmZ = lerp(-0.22, -0.45 + 0.25 * s2, cheer);
  P.rArmX = lerp(-0.3 - 1.35 * kickR, -2.0, cheer);
  P.rArmZ = lerp(0.25, 0.55 + 0.25 * s2, cheer);

  P.torsoRX = lerp(-0.04, -0.1, cheer);
  P.torsoRY = 0.1 * s2 * (1 - cheer);
  P.torsoRZ = lerp(0.07, 0.14, cheer) * s2;
  P.headRX = lerp(0.13 * land - 0.04, -0.15, cheer);
  P.headRY = 0.15 * Math.sin((PI * b) / 4) * (1 - cheer);
  P.headRZ = 0.1 * s2;
  P.braidLZ = -0.22 + 0.2 * s2;
  P.braidRZ = 0.22 + 0.2 * s2;
  P.braidX = 0.2 * land;
  P.skirtRZ = 0.06 * s2;
}

/** Rock: wide stance, knee-bend bounce and head nod on the beat, left arm strumming eighths across her tummy, iPod hand out on the guitar neck; a big windmill every 8 beats. */
function rock(b: number) {
  const c = onBeat(b);
  const p8 = phrase(b, 8);
  const strum = Math.sin(4 * PI * b); // down-up twice a beat

  // after the windmill the first beat of the phrase lands extra hard
  const slam = bump(p8, 7.6, 0.8) + bump(p8 + 8, 7.6, 0.8);
  const t = clamp01((p8 - 6) / 1.5);
  const mill = win(p8, 5.75, 7.8, 0.3);
  windmill(TAU * t * t * (3 - 2 * t));

  P.dip = -0.035 * c - 0.01 * slam;
  P.lLegZ = -0.14;
  P.rLegZ = 0.14;
  P.lLegX = 0.12;
  // a little rock kick forward before the windmill
  P.rLegX = -0.18 - 0.35 * bump(p8, 3, 1);

  P.lArmX = lerp(-0.62 + 0.2 * strum, millX, mill);
  P.lArmZ = lerp(0.5 + 0.08 * strum, millZ, mill);
  P.rArmX = -1.1 + 0.06 * c;
  P.rArmZ = 0.55 + 0.08 * Math.sin((PI * b) / 2);

  P.torsoRX = lerp(0.12 + 0.07 * c, -0.06, mill) + 0.08 * slam;
  P.torsoRY = -0.12;
  P.torsoRZ = lerp(0, -0.1, mill);
  P.hipsRY = -0.08;
  P.headRX = lerp(0.05 + 0.25 * c, -0.12, mill) + 0.12 * slam;
  P.headRZ = 0.06 * Math.sin(PI * b);
  P.braidX = 0.35 * (1 - c) * (1 - mill);
  P.braidLZ = -0.22 - 0.12 * c;
  P.braidRZ = 0.22 + 0.12 * c;
}

/** Hip hop: step-touch side to side with a knee bounce, grooving arms then a wave through arms and shoulders; a spin with arms tucked and a point to the sky every 16 beats. */
function hiphop(b: number) {
  const c = onBeat(b);
  const p16 = phrase(b, 16);
  const s = Math.cos((PI * b) / 2);
  const side = s * (1.5 - 0.5 * s * s); // settles on each side for a beat

  const wave = win(p16, 3.75, 8, 0.3) + win(p16, 11.75, 13.9, 0.3);
  const t = clamp01((p16 - 14) / 1.25);
  const spinning = win(p16, 13.75, 15.4, 0.25);
  // point up as the spin ends, then ease back down into the groove on the 1
  const point = smooth(15.05, 15.3, p16) * (1 - smooth(15.5, 16, p16));

  P.dip = -0.03 * c * (1 - spinning);
  P.lift = 0.04 * bump(p16, 14, 1.25);
  P.hipsX = 0.05 * side * (1 - spinning);
  P.torsoX = 0.06 * side * (1 - spinning);
  // the trailing leg reaches out to the side
  P.lLegZ = -0.2 * (side > 0 ? side : 0) * (1 - spinning);
  P.rLegZ = 0.2 * (side < 0 ? -side : 0) * (1 - spinning);

  // groove: arms swing opposite to the step, dropping on each beat
  const gLX = -0.45 + 0.35 * side;
  const gRX = -0.45 - 0.35 * side;
  const gLZ = -0.3 + 0.1 * c;
  const gRZ = 0.3 - 0.1 * c;
  // wave: left hand, left shoulder, right shoulder, right hand
  const w1 = Math.sin(PI * b);
  const w4 = Math.sin(PI * b - 3);
  const wLZ = -1.25 - 0.35 * w1;
  const wRZ = 1.25 + 0.35 * w4;

  let lx = lerp(gLX, -0.35, wave);
  let lz = lerp(gLZ, wLZ, wave);
  let rx = lerp(gRX, -0.35, wave);
  let rz = lerp(gRZ, wRZ, wave);
  // spin: arms tucked in front of her chest
  lx = lerp(lx, -0.9, spinning);
  lz = lerp(lz, 0.35, spinning);
  rx = lerp(rx, -0.9, spinning);
  rz = lerp(rz, -0.35, spinning);
  // and a point to the sky to finish
  P.lArmX = lerp(lx, -2.3, point);
  P.lArmZ = lerp(lz, -0.5, point);
  P.rArmX = lerp(rx, -0.3, point);
  P.rArmZ = lerp(rz, 0.35, point);

  const shoulders = 0.12 * (Math.sin(PI * b - 2) - Math.sin(PI * b - 1));
  P.torsoRZ = lerp(0.08 * side, shoulders, wave) * (1 - spinning);
  P.torsoRY = 0.18 * side * (1 - wave) * (1 - spinning);
  P.torsoRX = 0.08 * c * (1 - spinning);
  P.hipsRY = -0.1 * side * (1 - spinning);
  P.headRX = lerp(0.14 * c - 0.02, -0.18, point);
  P.headRY = -0.2 * side * (1 - spinning) * (1 - point);
  P.headRZ = 0.1 * shoulders * wave;
  P.braidLZ = -0.2 - 0.25 * spinning;
  P.braidRZ = 0.2 + 0.25 * spinning;
  P.braidX = 0.15 * (1 - c);

  const e = t * t * t * (t * (t * 6 - 15) + 10);
  // a whole turn is the same as none, so once it is done the yaw drops back to 0
  P.yaw = p16 >= 14 && t < 1 ? TAU * e : 0;
}

/** Latin: salsa hip sway, forward and back basic steps then side taps, arms out with hands swaying; a small turn out and back every 8. */
function latin(b: number) {
  const p8 = phrase(b, 8);
  const hx = -0.045 * Math.cos(PI * b); // hips settle to a side on every beat
  const sway = Math.sin(PI * b);
  const dir = Math.floor(b / 8) & 1 ? 1 : -1;
  const turn = bump(p8, 6, 2);

  P.hipsX = hx;
  P.torsoX = hx * 0.4;
  P.hipsRY = -3 * hx;
  P.torsoRY = 1.2 * hx + 0.15 * dir * turn;
  P.torsoRZ = -2.2 * hx;
  P.skirtRZ = 3 * hx;
  P.dip = -0.015 * onBeat(b);

  // basic: left forward on 1, right back on 5; side taps on 3 and 7
  P.lLegX = -0.3 * bump(p8, 0, 2);
  P.rLegX = 0.3 * bump(p8, 4, 2);
  P.lLegZ = -0.15 * bump(p8, 2, 2);
  P.rLegZ = 0.15 * bump(p8, 6, 2);

  // arms out and a little forward, hands rolling with the hips
  P.lArmX = -0.55 + 0.15 * sway;
  P.lArmZ = -0.9 - 0.2 * Math.cos(PI * b);
  P.lArmY = 0.4 * sway;
  P.rArmX = -0.55 - 0.15 * sway;
  P.rArmZ = 0.9 - 0.2 * Math.cos(PI * b);
  P.rArmY = -0.4 * sway;

  P.torsoRX = -0.05;
  P.headRX = -0.06;
  P.headRY = 0.25 * dir * turn - 0.6 * hx;
  P.headRZ = 1.8 * hx;
  P.braidLZ = -0.2 + 4 * hx;
  P.braidRZ = 0.2 + 4 * hx;

  P.yaw = 0.55 * dir * turn;
}

/** Calm: a slow 8-beat sway with arms floating out like wings, head tilted, rising onto her toes every 4. */
function calm(b: number) {
  const sway = Math.sin((PI * b) / 4);
  const wing = Math.sin((PI * b) / 2);
  const rise = (1 - Math.cos((PI * b) / 2)) / 2;

  P.lift = 0.03 * rise;
  P.hipsX = 0.025 * sway;
  P.torsoX = 0.035 * sway;
  P.lLegX = 0.05 * rise;
  P.rLegX = 0.05 * rise;

  P.lArmZ = -1.05 - 0.18 * wing;
  P.lArmX = -0.25 + 0.1 * sway;
  P.lArmY = 0.3 * Math.sin((PI * b) / 4 + 0.5);
  P.rArmZ = 1.05 + 0.18 * Math.sin((PI * b) / 2 - 0.6);
  P.rArmX = -0.25 - 0.1 * sway;
  P.rArmY = -0.3 * Math.sin((PI * b) / 4 + 0.5);

  P.torsoRZ = -0.09 * sway;
  P.torsoRX = -0.04 * rise;
  P.torsoRY = 0.08 * Math.sin((PI * b) / 4 - 0.8);
  P.hipsRY = -0.05 * sway;
  P.headRX = -0.08;
  P.headRY = 0.1 * sway;
  P.headRZ = 0.12 + 0.08 * sway;
  P.braidLZ = -0.2 + 0.08 * sway;
  P.braidRZ = 0.2 + 0.08 * sway;
  P.skirtRZ = -0.05 * sway;
}

/**
 * Pose Sloan for a dance. Call every frame AFTER animateGirl(...). `beat` is a
 * float beat count (1.0 per beat) and `weight` 0..1 blends from whatever
 * animateGirl posed toward the dance (ease in over ~0.4s, out when she walks).
 *
 * Never moves or rotates the root. Joints animateGirl rewrites each frame blend
 * from their current value; the few it never touches (leg and arm twist/splay,
 * head tilt, skirt swish, hips/torso side shift) blend from makeGirl's rest
 * pose, so a call at weight 0 puts those back to rest. Allocation-free.
 *
 * Returns the extra yaw (radians) the dance wants on the root this frame (0 for
 * most; hip hop spins a full turn, latin turns a little), already multiplied by
 * weight. The runtime adds it to the root's rotation.y. A hip hop spin cut
 * short by a fade-out snaps back by the unweighted remainder, since a partial
 * full turn cannot end where it began.
 */
export function applyDance(root: THREE.Group, dance: DanceId, beat: number, weight: number): number {
  const u = root.userData;
  const hips = u.hips as THREE.Group | undefined;
  const torso = u.torso as THREE.Group | undefined;
  const head = u.head as THREE.Group | undefined;
  const lLeg = u.leftLeg as THREE.Group | undefined;
  const rLeg = u.rightLeg as THREE.Group | undefined;
  const lArm = u.leftArm as THREE.Group | undefined;
  const rArm = u.rightArm as THREE.Group | undefined;
  if (!hips || !torso || !head || !lLeg || !rLeg || !lArm || !rArm) return 0;
  const skirt = u.skirt as THREE.Object3D | undefined;
  const braidL = u.braidL as THREE.Group | undefined;
  const braidR = u.braidR as THREE.Group | undefined;

  const w = weight > 0 ? (weight < 1 ? weight : 1) : 0; // NaN -> 0
  const b = Number.isFinite(beat) ? beat : 0;

  resetPose();
  switch (dance) {
    case "pop":
      pop(b);
      break;
    case "rock":
      rock(b);
      break;
    case "hiphop":
      hiphop(b);
      break;
    case "latin":
      latin(b);
      break;
    case "calm":
      calm(b);
      break;
  }

  // lowest sole corner as animateGirl left her, so the ground rule below only
  // ever limits what the dance adds
  const before =
    hips.position.y + Math.min(soleLow(lLeg.rotation.x, lLeg.rotation.z), soleLow(rLeg.rotation.x, rLeg.rotation.z));

  // joints animateGirl owns: lerp(current, target, w)
  hips.rotation.y += (P.hipsRY - hips.rotation.y) * w;
  torso.rotation.x += (P.torsoRX - torso.rotation.x) * w;
  torso.rotation.y += (P.torsoRY - torso.rotation.y) * w;
  torso.rotation.z += (P.torsoRZ - torso.rotation.z) * w;
  head.rotation.x += (P.headRX - head.rotation.x) * w;
  head.rotation.y += (P.headRY - head.rotation.y) * w;
  lLeg.rotation.x += (P.lLegX - lLeg.rotation.x) * w;
  rLeg.rotation.x += (P.rLegX - rLeg.rotation.x) * w;
  lArm.rotation.x += (P.lArmX - lArm.rotation.x) * w;
  lArm.rotation.z += (P.lArmZ - lArm.rotation.z) * w;
  rArm.rotation.x += (P.rArmX - rArm.rotation.x) * w;
  rArm.rotation.z += (P.rArmZ - rArm.rotation.z) * w;
  if (braidL && braidR) {
    braidL.rotation.z += (P.braidLZ - braidL.rotation.z) * w;
    braidR.rotation.z += (P.braidRZ - braidR.rotation.z) * w;
    braidL.rotation.x += (P.braidX - braidL.rotation.x) * w;
    braidR.rotation.x += (P.braidX - braidR.rotation.x) * w;
  }

  // joints animateGirl leaves alone: rest (0) toward target
  // shifting the hips sideways would drag the feet, so the legs lean back under
  const counter = Math.asin(P.hipsX / LEG);
  lLeg.rotation.z = (P.lLegZ - counter) * w;
  rLeg.rotation.z = (P.rLegZ - counter) * w;
  lArm.rotation.y = P.lArmY * w;
  rArm.rotation.y = P.rArmY * w;
  head.rotation.z = P.headRZ * w;
  if (skirt) skirt.rotation.z = P.skirtRZ * w;
  hips.position.x = P.hipsX * w;
  torso.position.x = P.torsoX * w;

  // vertical: offsets on top of animateGirl's heights
  const lift = P.lift * w;
  hips.position.y += lift;
  torso.position.y += lift + P.dip * w;

  // never sink a sole more than SINK below the ground (or below where
  // animateGirl already had it)
  const floor = Math.min(GROUND - SINK, before);
  const low =
    hips.position.y + Math.min(soleLow(lLeg.rotation.x, lLeg.rotation.z), soleLow(rLeg.rotation.x, rLeg.rotation.z));
  if (low < floor) {
    const up = floor - low;
    hips.position.y += up;
    torso.position.y += up;
  }

  return P.yaw * w;
}
