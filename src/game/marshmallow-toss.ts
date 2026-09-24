import * as THREE from "three";
import { create } from "zustand";
import { sfx } from "./audio";
import type { AABB } from "./collision";
import { mergeStatic } from "./merge";
import { lam, signBoard } from "./meshes";
import { useGame } from "./store";
import { SUGAR } from "./sugar-rush";

/**
 * Marshmallow Toss: the fairground booth in Sugar Rush where she lobs
 * marshmallows into mugs of hot chocolate.
 *
 * Played in the park, not in a panel. This is mini golf's shape: one class
 * that builds its own meshes, pushes its own colliders into the world's list,
 * takes her controls while she is playing and hands them back, with a thin HUD
 * (`marshmallow-toss-ui.tsx`) reading `tossPose` every frame. Nothing in
 * levels.ts, colliders.ts or park.ts knows the booth exists.
 *
 * **The throw.** Hold Collect, a meter fills, let go and the marshmallow
 * leaves her hand at a fixed 44 degrees with a speed the meter picked. There
 * is no aiming: the lane is straight, the three mugs are dead ahead, and the
 * only thing she controls is when she lets go. One axis to learn is what makes
 * it winnable for a seven-year-old, and the arc preview draws the whole flight
 * before she commits, so nothing about it is a guess.
 *
 * **Why the maths is this simple.** Her hand and the rim of every mug are at
 * exactly the same height (`handY === plinth + mugH`), so the flight is the
 * textbook one: `range = v^2 sin(2θ) / g`. Every number below — where to put
 * the notch on the meter, how wide the window is, what speed a mug is hit at —
 * falls straight out of that, and `tools/toss.ts` measures the real windows by
 * replaying this exact code rather than trusting the formula.
 *
 * **It has to be missable.** Full power carries 2.3m past the far mug and no
 * power falls 1m short of the near one, so both ends of the meter are real
 * mistakes — and a marshmallow that clips a rim hard knocks the mug over,
 * which is the loudest possible way of being told you threw too hard. A tipped
 * mug rights itself, a missed throw costs nothing, and a go with nothing in it
 * still pays tickets, because losing is not allowed to cost her anything.
 */

/* ---------------------------------------------------------------- tuning */

/**
 * The booth, in world metres. It stands on the fairground apron west of the
 * gumdrop wheel, on the one piece of clear ground there: the bunting lines run
 * at z 102 and z 113.5, the stall row at z 120, the loop path at x -111..-105,
 * and this sits inside all of them. The lane runs east (+x), so the wheel and
 * the stalls are the view down it.
 */
export const TOSS = {
  /** the throwing line */
  x: SUGAR.fair.x - 23.5,
  z: SUGAR.fair.z - 10.5,
  /** how far down the lane each mug stands, nearest first */
  mugD: [5.5, 8, 11],
  /** the mat, as distances along the lane from the line, and its width */
  matD0: -3.2,
  matD1: 13.6,
  matW: 6.4,
  /** the top of the mat: clear of the apron (0.05) and the loop path (0.1) */
  matTop: 0.16,
  /** the chocolate plinth a mug stands on */
  plinth: 0.7,
  /** the mug itself */
  mugH: 0.7,
  mugR: 0.62,
  mouthR: 0.52,
  /** where the counter and its posts stand, in lane distance */
  counterD: -1.7,
  postD: -0.85,
  postDz: 1.6,
  /** where she is put when a go starts */
  standD: -0.75,
} as const;

/** The mouth of a mug, and the height her hand lets go at. They are equal. */
export const MOUTH_Y = TOSS.plinth + TOSS.mugH;
export const HAND_Y = MOUTH_Y;

/** The footprint the booth owns, so nothing else is scattered into the lane. */
export const TOSS_SITE = {
  minX: TOSS.x + TOSS.matD0 - 1,
  maxX: TOSS.x + TOSS.matD1 + 1,
  minZ: TOSS.z - TOSS.matW / 2 - 1,
  maxZ: TOSS.z + TOSS.matW / 2 + 1,
};

export const G = 9.8;
/** A proper lob. Steep enough to drop into a mug, flat enough to read. */
export const ANGLE = (44 * Math.PI) / 180;
const SIN2 = Math.sin(2 * ANGLE);

/**
 * The slowest and fastest a marshmallow can leave her hand, and how long the
 * meter takes to fill. The span is deliberately narrow — just the three mugs
 * plus a metre short and two long — because the width of the timing window is
 * the catch radius divided by how fast the speed is changing, and a meter that
 * swept 6 to 20 m/s would give the far mug a window of under a tenth of a
 * second. See `tools/toss.ts` for the measured numbers.
 */
export const MIN_V = 6.6;
export const MAX_V = 11.4;
/**
 * 3.4s, from 2.8: the first real play found the windows (a quarter to two
 * fifths of a second) too tight to learn in three goes. A slower meter widens
 * every window by the same fifth.
 */
export const CHARGE_TIME = 3.4;
/**
 * Marshmallows in a go. Three for three mugs meant one miss and the tray was
 * gone, and a go was over in half a minute; six gives her room to miss, learn
 * the meter and still fill the tray, and the ones she has left when the tray
 * is full are worth tickets.
 */
export const THROWS = 6;
/** a tap rather than a hold throws at the near mug */
export const TAP_POWER = 0.155;

export const MARSH_R = 0.16;
/**
 * How far off the middle of a mug the marshmallow may be when it reaches the
 * rim and still drop in. It is the mouth, not the mouth minus the marshmallow:
 * a marshmallow is squashy and a rim is round, and one that lands half on the
 * edge rolls in. The same reasoning as mini golf's cup being wider than its
 * ball.
 */
export const CATCH_R = 0.59;
/**
 * The last of the help: on the way down, a marshmallow inside this much of a
 * mug is drawn towards it, hard enough to turn a rim-clip into a splash and no
 * harder. Capped in metres per second squared, so it reads as the marshmallow
 * catching the rim rather than steering.
 */
const ASSIST_R = 1.3;
const ASSIST_K = 7;
const ASSIST_MAX = 6.5;
/** Hit a mug at this speed or more and it goes over. */
export const TIP_V = 8.4;

/** Range of a throw at speed `v`, from her hand to the height of a rim. */
export function rangeFor(v: number) {
  return (v * v * SIN2) / G;
}
/** The speed that carries exactly `d` metres. */
export function speedFor(d: number) {
  return Math.sqrt((d * G) / SIN2);
}
export function powerToSpeed(power: number) {
  return MIN_V + (MAX_V - MIN_V) * Math.max(0, Math.min(1, power));
}
/** Where the meter has to be to land in the mug `d` metres away. */
export function powerFor(d: number) {
  return (speedFor(d) - MIN_V) / (MAX_V - MIN_V);
}

/* --------------------------------------------------------------- physics */

/** A marshmallow in flight: distance down the lane, height, and velocity. */
export type Marsh = { d: number; h: number; vd: number; vh: number };

/** A mug, as the physics sees it. */
export type MugState = { d: number; filled: boolean; tip: number };

export type TossHit =
  | { kind: "in"; mug: number; speed: number }
  /** struck a mug: `low` means it hit the side rather than the rim, so it was short */
  | { kind: "hit"; mug: number; speed: number; tip: boolean; low: boolean }
  | { kind: "ground"; speed: number };

export function launch(power: number): Marsh {
  const v = powerToSpeed(power);
  return { d: 0, h: HAND_Y, vd: v * Math.cos(ANGLE), vh: v * Math.sin(ANGLE) };
}

/**
 * One step of the flight. Pure, and takes the mugs, so `tools/toss.ts` can
 * replay whole throws with exactly the code the game runs.
 *
 * Returns the moment it stops being in the air, or null while it still is.
 */
export function stepMarsh(m: Marsh, mugs: MugState[], dt: number): TossHit | null {
  // the rim assist, on the way down and only near a mug that is still standing
  if (m.vh < 0 && m.h > MOUTH_Y && m.h < MOUTH_Y + 1.6) {
    for (const mug of mugs) {
      if (mug.tip > 0.02) continue;
      const gap = mug.d - m.d;
      if (Math.abs(gap) > ASSIST_R) continue;
      m.vd += Math.max(-ASSIST_MAX, Math.min(ASSIST_MAX, gap * ASSIST_K)) * dt;
      break;
    }
  }

  const h0 = m.h;
  m.vh -= G * dt;
  m.d += m.vd * dt;
  m.h += m.vh * dt;
  const speed = Math.hypot(m.vd, m.vh);

  // crossing the height of the rims, on the way down: in, or off the rim
  if (m.vh < 0 && h0 >= MOUTH_Y && m.h < MOUTH_Y) {
    for (let i = 0; i < mugs.length; i++) {
      const mug = mugs[i]!;
      if (mug.tip > 0.02) continue;
      const gap = Math.abs(m.d - mug.d);
      if (gap < CATCH_R && !mug.filled) return { kind: "in", mug: i, speed };
      if (gap < TOSS.mugR + MARSH_R) return { kind: "hit", mug: i, speed, tip: speed >= TIP_V, low: false };
    }
  }
  // below the rims: it has run into the side of a mug, or its plinth
  if (m.h < MOUTH_Y && m.h > TOSS.matTop + MARSH_R) {
    for (let i = 0; i < mugs.length; i++) {
      const mug = mugs[i]!;
      if (mug.tip > 0.02) continue;
      const wide = m.h > TOSS.plinth ? TOSS.mugR : 0.55;
      if (Math.abs(m.d - mug.d) < wide + MARSH_R) {
        return { kind: "hit", mug: i, speed, tip: speed >= TIP_V && m.h > TOSS.plinth, low: true };
      }
    }
  }
  if (m.h <= TOSS.matTop + MARSH_R) {
    m.h = TOSS.matTop + MARSH_R;
    return { kind: "ground", speed };
  }
  return null;
}

const SUB = 1 / 240;

/** How long a throw may stay in the air before it is put down as a miss. */
const MAX_FLIGHT = 6;

/**
 * A marshmallow that has hit a mug, bounced off and is on its way to the mat.
 *
 * The push clear is the part that matters. The bounce is only about 0.6 m/s
 * upward, which lifts it a couple of centimetres, so without moving it out of
 * the mug's width it lands back on the same wall on the next step, bounces
 * again, and never reaches the mat. That hung the whole game: the throw never
 * finished, so the card never came and the marshmallow was spent. It is pushed
 * to just outside the widest collision `stepMarsh` tests, and bounced *away*
 * from the mug rather than always back toward her, so an overshoot carries on
 * past instead of turning round into it.
 */
export function bounceOffMug(m: Marsh, mug: MugState) {
  const side = m.d < mug.d ? -1 : 1;
  m.d = mug.d + side * (TOSS.mugR + MARSH_R + 0.03);
  m.vd = side * Math.abs(m.vd) * 0.35;
  m.vh = Math.abs(m.vh) * 0.25 + 0.6;
}

/**
 * A whole throw, hit and bounce and all, in substeps: how long the marshmallow
 * is in the air before it is on the mat or in a mug. A throw that never settles
 * is a game that never ends, so the tool sweeps this over the whole meter.
 */
export function settleTime(power: number, mugs: MugState[]): { seconds: number; kind: string } {
  const m = launch(power);
  let t = 0;
  let bounced = false;
  for (let i = 0; i < 12000; i++) {
    const hit = stepMarsh(m, mugs, SUB);
    t += SUB;
    if (!hit) continue;
    if (hit.kind === "in" || hit.kind === "ground") return { seconds: t, kind: hit.kind };
    // a mug: it bounces off once and then has to reach the mat
    bounceOffMug(m, mugs[hit.mug]!);
    bounced = true;
  }
  return { seconds: t, kind: bounced ? "stuck after a bounce" : "never landed" };
}

/** What one throw at this power does. Used by the tool and by the arc preview. *//** What one throw at this power does. Used by the tool and by the arc preview. */
export function throwOnce(power: number, mugs: MugState[]) {
  const m = launch(power);
  const path: [number, number][] = [[m.d, m.h]];
  for (let i = 0; i < 4000; i++) {
    const hit = stepMarsh(m, mugs, SUB);
    if (i % 6 === 0) path.push([m.d, m.h]);
    if (hit) {
      path.push([m.d, m.h]);
      return { hit, path, d: m.d };
    }
  }
  return { hit: { kind: "ground", speed: 0 } as TossHit, path, d: m.d };
}

/** Three fresh mugs. */
export function freshMugs(): MugState[] {
  return TOSS.mugD.map((d) => ({ d, filled: false, tip: 0 }));
}

/* --------------------------------------------------------------- scoring */

/** Tickets for a go: the mugs, and when the tray is full, two for each marshmallow still in hand. */
export function tossTickets(mugs: number, spare = 0) {
  return 2 + mugs * 3 + (mugs >= 3 ? 5 + spare * 2 : 0);
}

export function tossLine(mugs: number, spare = 0) {
  if (mugs >= 3 && spare > 0) return `All three mugs with ${spare} marshmallow${spare === 1 ? "" : "s"} to spare! Bonus tickets!`;
  if (mugs >= 3) return "All three mugs! That is the whole tray, cocoa everywhere!";
  if (mugs === 2) return "Two out of three! One more and the tray is yours.";
  if (mugs === 1) return "One in! Watch the arc and let go a touch sooner or later.";
  return "So close! Hold the button until the arrow sits on the mug, then let go.";
}

/* ----------------------------------------------------------- the pose */

export type TossThrow = "in" | "miss" | "tip";

/** What the HUD reads, every frame, without touching a store. */
export type TossPose = {
  active: boolean;
  state: "ready" | "charge" | "fly" | "settle";
  /** 0..1 */
  power: number;
  /** which marshmallow she is on, 0-based, and how many are left */
  thrown: number;
  left: number;
  /** the mug the notch on the meter points at, or -1 when they are all full */
  target: number;
  /** where the meter has to be for that mug */
  targetPower: number;
  /** how wide the window is, either side, for the band on the meter */
  targetBand: number;
  filled: [boolean, boolean, boolean];
  throws: TossThrow[];
  /** how far the arc preview says it will land, in metres */
  preview: number;
};

export const tossPose: TossPose = {
  active: false,
  state: "ready",
  power: 0,
  thrown: 0,
  left: THROWS,
  target: 0,
  targetPower: powerFor(TOSS.mugD[0]!),
  targetBand: 0.05,
  filled: [false, false, false],
  throws: [],
  preview: 0,
};

/** What the HUD's buttons, keys and pad feed in; the world reads it. */
export const tossInput = {
  /** A / Space / the big button is held */
  charge: false,
  /** one-shot: leave the booth */
  quit: false,
};

export function resetTossInput() {
  tossInput.charge = false;
  tossInput.quit = false;
}

/* ------------------------------------------------------------- the store */

export type TossCard = {
  mugs: number;
  throws: TossThrow[];
  tickets: number;
  line: string;
};

type TossStore = {
  /** she is standing on the mat */
  near: boolean;
  playing: boolean;
  card: TossCard | null;
  setNear: (near: boolean) => void;
  setPlaying: (playing: boolean) => void;
  setCard: (card: TossCard | null) => void;
};

/**
 * The booth's own little store, the way the house has one. Everything the
 * overlay needs is here, so store.ts does not grow a fourth copy of the
 * near/playing/card triple.
 */
export const useToss = create<TossStore>((set) => ({
  near: false,
  playing: false,
  card: null,
  setNear: (near) => set((s) => (s.near === near ? s : { near })),
  setPlaying: (playing) => set({ playing, near: false }),
  setCard: (card) => set({ card }),
}));

/* ------------------------------------------------------------ the meshes */

/** Lane distance and offset across the lane, to world x and z. */
function toWorld(d: number, across = 0): [number, number] {
  return [TOSS.x + d, TOSS.z + across];
}

type Slab = { x: number; y: number; z: number; w: number; h: number; d: number; color: string; flat?: boolean };

/** Everything that does not move: the mat, the counter, the posts, the plinths. */
function boothSlabs(): Slab[] {
  const out: Slab[] = [];
  const midD = (TOSS.matD0 + TOSS.matD1) / 2;
  const [mx, mz] = toWorld(midD);
  // the mat: cream sugar, a hand above the apron so neither flickers
  out.push({ x: mx, y: TOSS.matTop - 0.06, z: mz, w: TOSS.matD1 - TOSS.matD0, h: 0.12, d: TOSS.matW, color: "#f7ead3", flat: true });
  // the throwing line
  const [lx, lz] = toWorld(0);
  out.push({ x: lx, y: TOSS.matTop + 0.015, z: lz, w: 0.4, h: 0.04, d: TOSS.matW, color: "#e8384f", flat: true });
  // a pale pink lane stripe under each mug, so the distances read from the line
  for (const d of TOSS.mugD) {
    const [sx, sz] = toWorld(d);
    out.push({ x: sx, y: TOSS.matTop + 0.01, z: sz, w: 0.3, h: 0.03, d: TOSS.matW, color: "#ff93c4", flat: true });
  }
  // the counter she throws over: one box, open on every side, and low enough
  // (0.55 against a 0.62 step-up) that it can never pen her in
  const [cx, cz] = toWorld(TOSS.counterD);
  out.push({ x: cx, y: 0.275, z: cz, w: 1.0, h: 0.55, d: 2.8, color: "#8a5a34" });
  out.push({ x: cx, y: 0.575, z: cz, w: 1.12, h: 0.06, d: 2.92, color: "#6b4226", flat: true });
  // the chocolate plinths
  for (const d of TOSS.mugD) {
    const [px, pz] = toWorld(d);
    // stopping 2cm under the top slab, not flush with it: two tops at one
    // height flicker through each other
    out.push({ x: px, y: (TOSS.plinth - 0.02) / 2, z: pz, w: 1.1, h: TOSS.plinth - 0.02, d: 1.1, color: "#6b4226" });
    out.push({ x: px, y: TOSS.plinth - 0.03, z: pz, w: 1.18, h: 0.06, d: 1.18, color: "#8a5a34", flat: true });
  }
  return out;
}

/** The two candy-cane posts that carry the sign. */
function postPositions(): [number, number][] {
  return [toWorld(TOSS.postD, -TOSS.postDz), toWorld(TOSS.postD, TOSS.postDz)];
}

/** The colliders the booth adds: the counter, the two posts, the three plinths. */
export function tossColliders(): AABB[] {
  const out: AABB[] = [];
  const [cx, cz] = toWorld(TOSS.counterD);
  out.push({ minX: cx - 0.5, maxX: cx + 0.5, minY: 0, maxY: 0.55, minZ: cz - 1.4, maxZ: cz + 1.4 });
  for (const [px, pz] of postPositions()) {
    out.push({ minX: px - 0.17, maxX: px + 0.17, minY: 0, maxY: 2.4, minZ: pz - 0.17, maxZ: pz + 0.17 });
  }
  for (const d of TOSS.mugD) {
    const [px, pz] = toWorld(d);
    out.push({ minX: px - 0.55, maxX: px + 0.55, minY: 0, maxY: TOSS.plinth, minZ: pz - 0.55, maxZ: pz + 0.55 });
  }
  return out;
}

const GLOSS = { flat: true, roughness: 0.16 } as const;

/** One mug of hot chocolate, built about the middle of its base. */
function makeMug(geos: THREE.BufferGeometry[]) {
  const g = new THREE.Group();
  const wall = new THREE.CylinderGeometry(TOSS.mugR, TOSS.mugR * 0.9, TOSS.mugH, 22, 1, true);
  geos.push(wall);
  const wallMat = lam("#f6f1e8", GLOSS).clone();
  wallMat.side = THREE.DoubleSide;
  const body = new THREE.Mesh(wall, wallMat);
  body.position.y = TOSS.mugH / 2;
  body.castShadow = true;
  g.add(body);

  const base = new THREE.CylinderGeometry(TOSS.mugR * 0.9, TOSS.mugR * 0.9, 0.09, 20);
  geos.push(base);
  const baseM = new THREE.Mesh(base, lam("#f6f1e8", GLOSS));
  baseM.position.y = 0.045;
  g.add(baseM);

  const rim = new THREE.TorusGeometry(TOSS.mugR, 0.06, 8, 26);
  geos.push(rim);
  const rimM = new THREE.Mesh(rim, lam("#ff6aa8", GLOSS));
  rimM.rotation.x = Math.PI / 2;
  rimM.position.y = TOSS.mugH;
  g.add(rimM);

  const band = new THREE.TorusGeometry(TOSS.mugR * 0.96, 0.055, 8, 26);
  geos.push(band);
  const bandM = new THREE.Mesh(band, lam("#6fe3c4", GLOSS));
  bandM.rotation.x = Math.PI / 2;
  bandM.position.y = TOSS.mugH * 0.42;
  g.add(bandM);

  // the handle, out to the side so it is never in the way of a throw
  const handle = new THREE.TorusGeometry(0.26, 0.07, 8, 18);
  geos.push(handle);
  const handleM = new THREE.Mesh(handle, lam("#f6f1e8", GLOSS));
  handleM.rotation.y = Math.PI / 2;
  handleM.position.set(0, TOSS.mugH * 0.55, TOSS.mugR * 0.92);
  handleM.castShadow = true;
  g.add(handleM);

  // the chocolate itself
  const cocoa = new THREE.CircleGeometry(TOSS.mouthR + 0.04, 24);
  geos.push(cocoa);
  const cocoaM = new THREE.Mesh(cocoa, lam("#6e3f1e", { flat: true, roughness: 0.22 }));
  cocoaM.rotation.x = -Math.PI / 2;
  cocoaM.position.y = TOSS.mugH - 0.13;
  g.add(cocoaM);

  return { group: g, cocoa: cocoaM };
}

const ARC_DOTS = 22;
const DROPS = 14;

type Mug = {
  state: MugState;
  group: THREE.Group;
  cocoa: THREE.Mesh;
  /** the marshmallow bobbing in it once it is filled */
  float: THREE.Mesh;
  /** the tipped-over animation, 0 upright, 1 flat, and how long it has left */
  tipT: number;
};

type Drop = { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number };

export class TossWorld {
  group = new THREE.Group();
  private statics = new THREE.Group();
  private geometries: THREE.BufferGeometry[] = [];
  private colliders: AABB[] = [];
  private mugs: Mug[] = [];
  private marsh: THREE.Mesh;
  private supply: THREE.Mesh[] = [];
  private arc: THREE.InstancedMesh;
  private ring: THREE.Mesh;
  private drops: THREE.InstancedMesh;
  private dropState: Drop[] = [];
  private sign: THREE.Mesh | null = null;

  private m: Marsh = { d: 0, h: HAND_Y, vd: 0, vh: 0 };
  private held = 0;
  private settle = 0;
  private squash = 0;
  private bounces = 0;
  /** seconds this throw has been in the air, so nothing can fly for ever */
  private flight = 0;
  private clock = 0;
  private lastNear = false;
  private m4 = new THREE.Matrix4();
  private v3 = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private s3 = new THREE.Vector3(1, 1, 1);

  constructor(
    private scene: THREE.Scene,
    private worldColliders: AABB[],
    /** puts her behind the throwing line when a go starts */
    private place: (x: number, y: number, z: number, yaw: number) => void,
  ) {
    const unit = new THREE.BoxGeometry(1, 1, 1);
    this.geometries.push(unit);
    for (const s of boothSlabs()) {
      const mesh = new THREE.Mesh(unit, lam(s.color, s.flat ? GLOSS : { roughness: 0.4 }));
      mesh.scale.set(s.w, s.h, s.d);
      mesh.position.set(s.x, s.y, s.z);
      mesh.castShadow = !s.flat;
      mesh.receiveShadow = true;
      this.statics.add(mesh);
    }
    // the candy-cane posts
    const postGeo = new THREE.CylinderGeometry(0.17, 0.17, 2.4, 12);
    this.geometries.push(postGeo);
    const stripeGeo = new THREE.TorusGeometry(0.175, 0.055, 6, 14);
    this.geometries.push(stripeGeo);
    for (const [px, pz] of postPositions()) {
      const post = new THREE.Mesh(postGeo, lam("#f6f1e8", GLOSS));
      post.position.set(px, 1.2, pz);
      post.castShadow = true;
      this.statics.add(post);
      for (let k = 0; k < 6; k++) {
        const st = new THREE.Mesh(stripeGeo, lam("#e8384f", GLOSS));
        st.rotation.x = Math.PI / 2;
        st.position.set(px, 0.3 + k * 0.38, pz);
        this.statics.add(st);
      }
    }
    this.group.add(this.statics);

    // the booth's name, facing back up the fairground the way she walks in
    try {
      this.sign = signBoard("Marshmallow Toss", 3.4, 0.8);
      const [sx, sz] = toWorld(TOSS.postD);
      this.sign.position.set(sx, 2.55, sz);
      this.sign.rotation.y = Math.PI / 2;
      this.group.add(this.sign);
    } catch {
      this.sign = null;
    }

    const merged = mergeStatic(this.statics);
    this.geometries.push(...merged.geometries);

    // the three mugs, live because they tip over
    const marshGeo = new THREE.CylinderGeometry(MARSH_R, MARSH_R, MARSH_R * 1.7, 14);
    this.geometries.push(marshGeo);
    for (const st of freshMugs()) {
      const built = makeMug(this.geometries);
      const [mx, mz] = toWorld(st.d);
      built.group.position.set(mx, TOSS.plinth, mz);
      this.group.add(built.group);
      const float = new THREE.Mesh(marshGeo, lam("#f6f1e8", GLOSS));
      float.visible = false;
      built.group.add(float);
      this.mugs.push({ state: st, group: built.group, cocoa: built.cocoa, float, tipT: 0 });
    }

    // the marshmallow in flight
    this.marsh = new THREE.Mesh(marshGeo, lam("#ff93c4", GLOSS));
    this.marsh.castShadow = true;
    this.marsh.visible = false;
    this.group.add(this.marsh);

    // the six waiting on the counter, in two rows of three
    for (let i = 0; i < THROWS; i++) {
      const m = new THREE.Mesh(marshGeo, lam(i % 2 === 1 ? "#f6f1e8" : "#ff93c4", GLOSS));
      const [sx, sz] = toWorld(TOSS.counterD + (i < 3 ? -0.2 : 0.2), -0.75 + (i % 3) * 0.75);
      m.position.set(sx, 0.6 + MARSH_R * 0.85, sz);
      m.castShadow = true;
      this.group.add(m);
      this.supply.push(m);
    }

    // the arc preview
    const dot = new THREE.SphereGeometry(0.085, 8, 6);
    this.geometries.push(dot);
    this.arc = new THREE.InstancedMesh(dot, lam("#fff6cf", { flat: true, emissive: "#ffc83a", roughness: 0.4 }), ARC_DOTS);
    this.arc.frustumCulled = false;
    this.arc.visible = false;
    this.group.add(this.arc);

    // the ring on the mat where the preview says it will come down
    const ringGeo = new THREE.TorusGeometry(0.45, 0.06, 6, 22);
    this.geometries.push(ringGeo);
    this.ring = new THREE.Mesh(ringGeo, lam("#ffc83a", { flat: true, emissive: "#ff8a3a", roughness: 0.4 }));
    this.ring.rotation.x = Math.PI / 2;
    this.ring.visible = false;
    this.group.add(this.ring);

    // the chocolate splash
    const drop = new THREE.SphereGeometry(0.075, 6, 5);
    this.geometries.push(drop);
    this.drops = new THREE.InstancedMesh(drop, lam("#6b4226", { flat: true, roughness: 0.3 }), DROPS);
    this.drops.frustumCulled = false;
    this.drops.visible = false;
    this.group.add(this.drops);
    for (let i = 0; i < DROPS; i++) this.dropState.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0 });

    this.worldColliders.push(...(this.colliders = tossColliders()));
    scene.add(this.group);
  }

  dispose() {
    this.scene.remove(this.group);
    for (const c of this.colliders) {
      const i = this.worldColliders.indexOf(c);
      if (i >= 0) this.worldColliders.splice(i, 1);
    }
    this.colliders = [];
    for (const g of this.geometries) g.dispose();
    this.statics.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.arc.dispose();
    this.drops.dispose();
    this.sign?.geometry.dispose();
    tossPose.active = false;
    resetTossInput();
  }

  get playing() {
    return tossPose.active;
  }

  /** Is she standing at the booth? */
  near(x: number, y: number, z: number) {
    if (tossPose.active || y > 1.4) return false;
    const [lx, lz] = toWorld(TOSS.standD);
    return Math.hypot(x - lx, z - lz) < 3.2;
  }

  /** Collect on the mat. Returns true when a go started. */
  tryInteract(x: number, y: number, z: number) {
    if (!this.near(x, y, z)) return false;
    this.start();
    return true;
  }

  start() {
    sfx.click();
    tossPose.active = true;
    tossPose.state = "ready";
    tossPose.power = 0;
    tossPose.thrown = 0;
    tossPose.left = THROWS;
    tossPose.filled = [false, false, false];
    tossPose.throws = [];
    tossPose.preview = 0;
    this.held = 0;
    this.settle = 0;
    this.squash = 0;
    for (const mug of this.mugs) {
      mug.state.filled = false;
      mug.state.tip = 0;
      mug.tipT = 0;
      mug.float.visible = false;
    }
    this.aimAtNext();
    resetTossInput();
    this.marsh.visible = false;
    for (const s of this.supply) s.visible = true;
    const st = useGame.getState();
    useToss.getState().setPlaying(true);
    st.setEmmettNotice("Six marshmallows, three mugs. Hold to fill the meter!");
    const [sx, sz] = toWorld(TOSS.standD);
    // facing east, down the lane: yaw 0 looks -z, so a quarter turn the other way
    this.place(sx, 0.05, sz, -Math.PI / 2);
  }

  /** Point the notch on the meter at the nearest mug that is still empty. */
  private aimAtNext() {
    const i = this.mugs.findIndex((m) => !m.state.filled);
    tossPose.target = i;
    if (i < 0) return;
    const d = this.mugs[i]!.state.d;
    tossPose.targetPower = powerFor(d);
    // the window either side, in meter units: the catch radius over how far a
    // metre per second of throw moves the landing point, over the meter's span
    const v = speedFor(d);
    tossPose.targetBand = CATCH_R / ((2 * d) / v) / (MAX_V - MIN_V);
  }

  private end(card: boolean) {
    const st = useGame.getState();
    if (card) {
      const mugs = this.mugs.filter((m) => m.state.filled).length;
      const spare = tossPose.left;
      const tickets = tossTickets(mugs, spare);
      st.addTickets(tickets);
      useToss.getState().setCard({ mugs, throws: tossPose.throws.slice(), tickets, line: tossLine(mugs, spare) });
      if (mugs > 0) sfx.win();
    }
    tossPose.active = false;
    tossPose.state = "ready";
    this.marsh.visible = false;
    this.arc.visible = false;
    this.ring.visible = false;
    resetTossInput();
    useToss.getState().setPlaying(false);
  }

  quit() {
    if (!tossPose.active) return;
    sfx.click();
    this.end(false);
    useGame.getState().setEmmettNotice("The mugs will be here whenever you want another go!");
  }

  /** A chocolate splash out of a mug. */
  private splash(d: number) {
    const [x, z] = toWorld(d);
    for (let i = 0; i < DROPS; i++) {
      const a = (i / DROPS) * Math.PI * 2 + Math.random();
      const s = 1.1 + Math.random() * 1.6;
      this.dropState[i] = {
        x,
        y: MOUTH_Y - 0.1,
        z,
        vx: Math.cos(a) * s,
        vy: 2.2 + Math.random() * 1.8,
        vz: Math.sin(a) * s,
        life: 0.85,
      };
    }
    this.drops.visible = true;
  }

  private throwIt(power: number) {
    this.m = launch(power);
    this.marsh.visible = true;
    this.marsh.scale.set(1, 1, 1);
    this.squash = 0;
    this.bounces = 0;
    this.flight = 0;
    tossPose.state = "fly";
    const s = this.supply[tossPose.thrown];
    if (s) s.visible = false;
    sfx.jump();
  }

  /**
   * One word per throw on the card, not one per thing it touches.
   *
   * A marshmallow can clip a mug, bounce off and go on to reach the next one,
   * so `landed` runs more than once for a single throw. Whatever it does first
   * is the throw's result — except going in, which always wins, because the
   * mug count and the tickets already say it went in. Returns whether this is
   * the contact that decided it, so only that one speaks.
   */
  private record(word: "in" | "miss" | "tip"): boolean {
    if (tossPose.throws.length <= tossPose.thrown) {
      tossPose.throws.push(word);
      return true;
    }
    if (word === "in") tossPose.throws[tossPose.throws.length - 1] = "in";
    return false;
  }

  private landed(hit: TossHit) {
    const st = useGame.getState();
    if (hit.kind === "in") {
      const mug = this.mugs[hit.mug]!;
      mug.state.filled = true;
      mug.float.visible = true;
      tossPose.filled[hit.mug] = true;
      this.record("in");
      this.splash(mug.state.d);
      sfx.splash();
      sfx.correct();
      const n = tossPose.filled.filter(Boolean).length;
      st.setEmmettNotice(n === 3 ? "ALL THREE! Cocoa everywhere!" : `Splash! ${n} mug${n === 1 ? "" : "s"} done!`);
      this.marsh.visible = false;
      this.settle = 0.9;
      return;
    }
    if (hit.kind === "hit") {
      const mug = this.mugs[hit.mug]!;
      // the mug goes over whichever contact knocked it, but only the contact
      // that decides the throw gets a word on the card and a line on the HUD
      const first = this.record(hit.tip ? "tip" : "miss");
      if (hit.tip) {
        mug.state.tip = 1;
        mug.tipT = 1.9;
        sfx.boing();
        if (first) st.setEmmettNotice("Whoa, that knocked the mug over! A little softer.");
      } else {
        sfx.step();
        if (first) {
          st.setEmmettNotice(
            !hit.low
              ? "Off the rim! So close."
              : this.m.d < mug.state.d
                ? "Bonk! Just short of the mug — hold it a moment longer."
                : "Bonk! A touch too far — let go a moment sooner.",
          );
        }
      }
      bounceOffMug(this.m, mug.state);
      this.bounces = 2;
      return;
    }
    // the mat
    this.squash = 0.28;
    if (this.bounces < 2 && Math.abs(this.m.vh) > 1.4) {
      this.bounces++;
      this.m.vh = Math.abs(this.m.vh) * 0.36;
      this.m.vd *= 0.55;
      sfx.step();
      return;
    }
    if (this.record("miss")) {
      const d = this.m.d;
      const t = tossPose.target >= 0 ? this.mugs[tossPose.target]!.state.d : 0;
      st.setEmmettNotice(d < t ? "Just short! Hold it a moment longer." : "A bit far! Let go a moment sooner.");
    }
    this.settle = 0.7;
  }

  /** Every frame. The cocoa ripples and the mugs right themselves either way. */
  update(dt: number, her: { x: number; y: number; z: number }) {
    this.clock += dt;
    // the chocolate in every mug moves a little, playing or not
    for (let i = 0; i < this.mugs.length; i++) {
      const mug = this.mugs[i]!;
      mug.cocoa.position.y = TOSS.mugH - 0.13 + Math.sin(this.clock * 1.7 + i) * 0.012;
      if (mug.tipT > 0) {
        mug.tipT = Math.max(0, mug.tipT - dt);
        // over fast, back up slowly, so it reads as knocked and then set right
        const t = mug.tipT;
        mug.state.tip = t > 0.6 ? 1 : t / 0.6;
      } else {
        mug.state.tip = 0;
      }
      const tip = mug.state.tip;
      mug.group.rotation.z = -tip * (Math.PI / 2) * 0.92;
      mug.group.position.x = TOSS.x + mug.state.d + tip * 0.34;
      mug.group.position.y = TOSS.plinth + tip * 0.06;
      if (mug.float.visible) {
        mug.float.position.set(0, TOSS.mugH - 0.15 + Math.sin(this.clock * 2.4 + i) * 0.02, 0);
      }
    }
    this.stepDrops(dt);

    if (!tossPose.active) {
      const n = this.near(her.x, her.y, her.z);
      if (n !== this.lastNear) {
        this.lastNear = n;
        useToss.getState().setNear(n);
      }
      return;
    }
    this.lastNear = false;

    if (tossInput.quit) {
      tossInput.quit = false;
      this.quit();
      return;
    }

    const states = this.mugs.map((m) => m.state);

    if (tossPose.state === "ready" || tossPose.state === "charge") {
      if (tossInput.charge) {
        this.held += dt;
        tossPose.state = "charge";
        tossPose.power = Math.min(1, this.held / CHARGE_TIME);
      } else if (tossPose.state === "charge") {
        const power = this.held < 0.13 ? TAP_POWER : tossPose.power;
        this.held = 0;
        tossPose.power = 0;
        this.throwIt(power);
      }
    } else if (tossPose.state === "fly") {
      let hit: TossHit | null = null;
      // fixed substeps, so the flight is the same however the frame rate moves
      let left = Math.min(dt, 0.1);
      while (left > 0 && !hit) {
        const step = Math.min(SUB, left);
        left -= step;
        hit = stepMarsh(this.m, states, step);
      }
      /*
       * A lob is over in about a second and a half. If one is still in the air
       * after MAX_FLIGHT it is caught on something, and a throw that never ends
       * is a game that never ends: put it on the mat and count it as a miss.
       */
      this.flight += dt;
      if (!hit && this.flight > MAX_FLIGHT) {
        this.m.h = TOSS.matTop + MARSH_R;
        this.bounces = 2;
        hit = { kind: "ground", speed: Math.hypot(this.m.vd, this.m.vh) };
      }
      if (hit) this.landed(hit);
      if (tossPose.state === "fly" && this.settle > 0) tossPose.state = "settle";
    }

    if (this.settle > 0) {
      tossPose.state = "settle";
      this.settle -= dt;
      if (this.settle <= 0) {
        tossPose.thrown++;
        tossPose.left = THROWS - tossPose.thrown;
        this.marsh.visible = false;
        this.aimAtNext();
        // out of marshmallows, or the tray is full with some still in hand
        if (tossPose.thrown >= THROWS || tossPose.target < 0) {
          this.end(true);
          return;
        }
        tossPose.state = "ready";
      }
    }

    this.draw(dt);
  }

  private draw(dt: number) {
    // the marshmallow
    if (this.marsh.visible) {
      const [x, z] = toWorld(this.m.d);
      this.marsh.position.set(x, this.m.h, z);
      this.marsh.rotation.z = -this.m.d * 1.4;
      if (this.squash > 0) {
        this.squash = Math.max(0, this.squash - dt);
        const k = this.squash / 0.28;
        const sy = 1 - 0.55 * k;
        this.marsh.scale.set(1 + 0.4 * k, sy, 1 + 0.4 * k);
        this.marsh.position.y = TOSS.matTop + MARSH_R * sy;
        this.marsh.rotation.z = 0;
      } else {
        this.marsh.scale.set(1, 1, 1);
      }
    }

    // the arc preview and the landing ring
    const previewing = tossPose.state === "ready" || tossPose.state === "charge";
    this.arc.visible = previewing;
    this.ring.visible = previewing;
    if (previewing) {
      const power = tossPose.state === "charge" ? tossPose.power : TAP_POWER;
      const v = powerToSpeed(power);
      const vd = v * Math.cos(ANGLE);
      const vh = v * Math.sin(ANGLE);
      const flight = (2 * vh) / G;
      tossPose.preview = rangeFor(v);
      for (let i = 0; i < ARC_DOTS; i++) {
        const t = ((i + 1) / ARC_DOTS) * flight;
        const d = vd * t;
        const h = HAND_Y + vh * t - 0.5 * G * t * t;
        const [x, z] = toWorld(d);
        const k = 1 - i / (ARC_DOTS * 1.5);
        this.m4.compose(this.v3.set(x, h, z), this.q, this.s3.set(k, k, k));
        this.arc.setMatrixAt(i, this.m4);
      }
      this.arc.instanceMatrix.needsUpdate = true;
      const [rx, rz] = toWorld(tossPose.preview);
      this.ring.position.set(rx, MOUTH_Y + 0.02, rz);
      const pulse = 1 + Math.sin(this.clock * 7) * 0.06;
      this.ring.scale.set(pulse, pulse, 1);
    }
  }

  private stepDrops(dt: number) {
    let live = false;
    for (let i = 0; i < DROPS; i++) {
      const d = this.dropState[i]!;
      if (d.life <= 0) {
        this.m4.compose(this.v3.set(0, -50, 0), this.q, this.s3.set(0.001, 0.001, 0.001));
        this.drops.setMatrixAt(i, this.m4);
        continue;
      }
      live = true;
      d.life -= dt;
      d.vy -= 11 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      const k = Math.max(0.15, d.life / 0.85);
      this.m4.compose(this.v3.set(d.x, d.y, d.z), this.q, this.s3.set(k, k, k));
      this.drops.setMatrixAt(i, this.m4);
    }
    this.drops.instanceMatrix.needsUpdate = true;
    this.drops.visible = live;
  }

  /**
   * Where the camera watches from: off to the north side of the lane and a
   * little behind her, so the arc reads as an arc. Straight down the lane from
   * behind, which is what mini golf does, flattens a lob into a dot that grows.
   */
  camera(pos: THREE.Vector3, target: THREE.Vector3) {
    const [cx, cz] = toWorld(TOSS.standD - 2.6, -8.2);
    pos.set(cx, 4.6, cz);
    const [tx, tz] = toWorld(6.2);
    target.set(tx, 1.5, tz);
  }
}
