import * as THREE from "three";
import { sfx } from "./audio";
import { lam } from "./meshes";
import { GOLF, GOLF_BLOCKS } from "./park";
import { useGame } from "./store";

/**
 * Mini golf: the course as the ball sees it, and the world module that owns
 * the ball, the aim line, the windmill's sails and the rolling log.
 *
 * Every number comes from `GOLF` and `GOLF_BLOCKS` in park.ts, which is also
 * what draws the course, so the ball can never bounce off something that is
 * not there. Lane-local coordinates all through: `dx` across the lane, `dz`
 * along it, the tee at `+GOLF.teeDz` and the cup at `GOLF.cupDz`.
 *
 * The physics is a rolling circle on a flat rectangle. It is deliberately not
 * a simulator: friction is generous, the borders are springy, the cup is far
 * wider than the ball and a putt that is nearly in gets nudged the rest of the
 * way, because the point is that a seven-year-old sinks it in two or three.
 *
 * `stepBall` is pure and takes the course clock, so `tools/minigolf.ts` can
 * play whole rounds headlessly with exactly the code the game runs.
 */

const TAU = Math.PI * 2;

/** The ball, in lane-local metres and metres per second. */
export type Ball = { x: number; z: number; vx: number; vz: number };

export type StepResult = "roll" | "stop" | "sunk";

export const BALL_R = 0.105;
/** the fastest and slowest a putt can leave the club */
export const MIN_V = 1.5;
export const MAX_V = 8.8;
/**
 * How far off straight-at-the-cup she can aim. Wide enough to play sideways
 * and even a little backwards: a ball that stops tucked behind hole 1's wall
 * needs more than ninety degrees to get round it.
 */
export const AIM_LIMIT = 2;
/** a tap instead of a held button putts at this power */
export const TAP_POWER = 0.42;
/** seconds to fill the meter */
export const CHARGE_TIME = 1.15;

/** rolling resistance: a constant part plus a speed-proportional part */
const ROLL_A = 0.45;
const ROLL_K = 0.35;
/** below this the ball has stopped */
const STOP_V = 0.16;
/** how much bounce comes back off the wooden borders and off the obstacles */
const WALL_E = 0.6;
const BLOCK_E = 0.72;
/**
 * The sails and the log are soft: they deaden the ball instead of flinging it
 * back up the green. A springy moving obstacle turned both of those holes into
 * pinball, and the ball spent whole strokes being batted about.
 */
const MOVER_E = 0.34;
/** the ball drops in inside this radius, if it is not flying */
const CUP_SPEED = 3.6;
/** within this of the cup a slow ball is steered towards it */
const ASSIST_R = 1.7;
const ASSIST = 3.4;
/** a moving obstacle never adds more than this to the ball */
const NUDGE_MAX = 2.6;
/** the ball is in a sail's way below this height */
const SAIL_LOW = BALL_R * 2;

/**
 * What can get between the camera and the ball on a green. Lane-local, with
 * the height of the top. It is exactly what the ball can hit, because nothing
 * on a green is allowed to be tall and wide: see the note on GOLF.windmill.
 */
export type GolfSolid = { minX: number; maxX: number; minZ: number; maxZ: number; top: number };

const SOLIDS: GolfSolid[][] = GOLF_BLOCKS.map((blocks, hole) => {
  const out = blocks.map((o) => ({
    minX: o.dx - o.w / 2,
    maxX: o.dx + o.w / 2,
    minZ: o.dz - o.d / 2,
    maxZ: o.dz + o.d / 2,
    top: o.h,
  }));
  return out;
});

/** Everything on a green that a sightline has to clear. */
export function golfSolids(hole: number): GolfSolid[] {
  return SOLIDS[hole] ?? [];
}

/** The first thing to aim at on a hole, in lane-local coordinates. */
export function golfSight(hole: number): [number, number] {
  return GOLF.sight[hole] ?? [0, GOLF.cupDz];
}

export function golfPar() {
  return GOLF.par * GOLF.holes;
}

/** Where a hole's tee mat and cup are in the world. */
export function holeWorld(i: number) {
  const x = GOLF.x + GOLF.laneDx[i]!;
  return { x, teeZ: GOLF.z + GOLF.teeDz, cupZ: GOLF.z + GOLF.cupDz };
}

/** Lane-local to world. */
export function toWorld(i: number, dx: number, dz: number): [number, number] {
  return [GOLF.x + GOLF.laneDx[i]! + dx, GOLF.z + dz];
}

export function powerToSpeed(power: number) {
  const p = Math.max(0, Math.min(1, power));
  return MIN_V + (MAX_V - MIN_V) * p;
}

/** The windmill's sails: the angle of sail 0, in radians. */
export function sailAngle(t: number) {
  return (t / GOLF.windmill.period) * TAU;
}

/** The rolling log's centre across the lane, and how fast it is moving. */
export function logX(t: number) {
  return GOLF.log.travel * Math.sin((t / GOLF.log.period) * TAU);
}
export function logVX(t: number) {
  return GOLF.log.travel * (TAU / GOLF.log.period) * Math.cos((t / GOLF.log.period) * TAU);
}

/* ------------------------------------------------------------- collisions */

/**
 * Where the last `sailRect` put a sail's footprint. Shared and reused, so a
 * frame of physics allocates nothing; tools/minigolf.ts reads it too, rather
 * than keeping its own copy of the sail geometry.
 */
export const sailBounds = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, vx: 0 };

function bounce(b: Ball, nx: number, nz: number, e: number, sx: number, sz: number) {
  const rvx = b.vx - sx;
  const rvz = b.vz - sz;
  const dot = rvx * nx + rvz * nz;
  if (dot >= 0) return;
  b.vx = sx + rvx - (1 + e) * dot * nx;
  b.vz = sz + rvz - (1 + e) * dot * nz;
  // a moving obstacle shoves, it does not launch
  const sp = Math.hypot(b.vx, b.vz);
  if (sp > MAX_V) {
    b.vx = (b.vx / sp) * MAX_V;
    b.vz = (b.vz / sp) * MAX_V;
  }
}

/** Circle against an axis-aligned rectangle that may be sliding along x. */
function hitRect(b: Ball, minX: number, maxX: number, minZ: number, maxZ: number, e: number, sx: number) {
  const px = b.x < minX ? minX : b.x > maxX ? maxX : b.x;
  const pz = b.z < minZ ? minZ : b.z > maxZ ? maxZ : b.z;
  const dx = b.x - px;
  const dz = b.z - pz;
  const d2 = dx * dx + dz * dz;
  if (d2 > BALL_R * BALL_R) return false;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    const nx = dx / d;
    const nz = dz / d;
    b.x = px + nx * BALL_R;
    b.z = pz + nz * BALL_R;
    bounce(b, nx, nz, e, sx, 0);
  } else {
    // the centre is inside: push it out through the nearest face, so nothing
    // that sweeps over the ball (the log, a sail) can ever swallow it
    const dl = b.x - minX;
    const dr = maxX - b.x;
    const db = b.z - minZ;
    const dt = maxZ - b.z;
    const m = Math.min(dl, dr, db, dt);
    if (m === dl) {
      b.x = minX - BALL_R;
      bounce(b, -1, 0, e, sx, 0);
    } else if (m === dr) {
      b.x = maxX + BALL_R;
      bounce(b, 1, 0, e, sx, 0);
    } else if (m === db) {
      b.z = minZ - BALL_R;
      bounce(b, 0, -1, e, sx, 0);
    } else {
      b.z = maxZ + BALL_R;
      bounce(b, 0, 1, e, sx, 0);
    }
  }
  return true;
}

/** Circle against a standing circle (the mushrooms). */
function hitCircle(b: Ball, cx: number, cz: number, r: number, e: number) {
  const dx = b.x - cx;
  const dz = b.z - cz;
  const rr = r + BALL_R;
  const d2 = dx * dx + dz * dz;
  if (d2 > rr * rr) return false;
  const d = Math.sqrt(d2);
  const nx = d > 1e-6 ? dx / d : 1;
  const nz = d > 1e-6 ? dz / d : 0;
  b.x = cx + nx * rr;
  b.z = cz + nz * rr;
  bounce(b, nx, nz, e, 0, 0);
  return true;
}

/**
 * The part of a windmill sail that is down in the grass, as a rectangle
 * across the lane, plus how fast that part is sliding sideways. Returns false
 * when the sail is too high to matter. A sail only reaches sideways while its
 * tip is low, which is why it can never close the hole: the widest it ever
 * gets is about 0.9m either side of the doorway's middle, and the ways round
 * the tower are 1.2m wide.
 */
export function sailRect(k: number, t: number) {
  const w = GOLF.windmill;
  const a = sailAngle(t) + (k * Math.PI) / 2;
  const sa = Math.sin(a);
  if (sa > -1e-3) return false;
  const s0 = (w.hubY - SAIL_LOW) / -sa;
  if (s0 >= w.sail) return false;
  const ca = Math.cos(a);
  const x1 = s0 * ca;
  const x2 = w.sail * ca;
  const half = (w.sailW / 2) * Math.abs(sa);
  sailBounds.minX = Math.min(x1, x2) - half;
  sailBounds.maxX = Math.max(x1, x2) + half;
  sailBounds.minZ = w.dz - w.sailT / 2 - 0.02;
  sailBounds.maxZ = w.dz + w.sailT / 2 + 0.02;
  // the sweep speed of the low part, sideways
  const omega = TAU / w.period;
  const s = (s0 + w.sail) / 2;
  sailBounds.vx = Math.max(-NUDGE_MAX, Math.min(NUDGE_MAX, -omega * s * sa * Math.sign(ca || 1)));
  return true;
}

/* ------------------------------------------------------------ the physics */

/**
 * One slice of ball. `t` is the course clock, which drives the sails and the
 * log, so a headless replay of the same clock gives the same round.
 */
export function stepBall(b: Ball, hole: number, dt: number, t: number): StepResult {
  const blocks = GOLF_BLOCKS[hole] ?? [];
  const hasMill = GOLF.windmill.hole === hole;
  const hasLog = GOLF.log.hole === hole;
  let left = dt;
  let guard = 0;
  while (left > 1e-6 && guard++ < 64) {
    const sp = Math.hypot(b.vx, b.vz);
    // never step further than a third of the ball, so nothing is tunnelled
    const step = Math.min(left, sp > 0.001 ? (BALL_R * 0.6) / sp : left, 1 / 120);
    left -= step;

    // friction first, so a putt always comes to rest
    if (sp > 0) {
      const drop = (ROLL_A + ROLL_K * sp) * step;
      const k = sp > drop ? (sp - drop) / sp : 0;
      b.vx *= k;
      b.vz *= k;
    }

    // a slow ball near the cup is helped the rest of the way in
    const gx = -b.x;
    const gz = GOLF.cupDz - b.z;
    const gd = Math.hypot(gx, gz);
    const now = Math.hypot(b.vx, b.vz);
    if (gd < ASSIST_R && gd > 1e-4 && now > 0.02 && now < CUP_SPEED) {
      const pull = ASSIST * (1 - gd / ASSIST_R) * step;
      b.vx += (gx / gd) * pull;
      b.vz += (gz / gd) * pull;
    }

    b.x += b.vx * step;
    b.z += b.vz * step;

    // the wooden borders: a hard boundary, so the ball can never leave
    const lim = GOLF.halfW - BALL_R;
    if (b.x < -lim) {
      b.x = -lim;
      if (b.vx < 0) b.vx = -b.vx * WALL_E;
    } else if (b.x > lim) {
      b.x = lim;
      if (b.vx > 0) b.vx = -b.vx * WALL_E;
    }
    const limz = GOLF.halfD - BALL_R;
    if (b.z < -limz) {
      b.z = -limz;
      if (b.vz < 0) b.vz = -b.vz * WALL_E;
    } else if (b.z > limz) {
      b.z = limz;
      if (b.vz > 0) b.vz = -b.vz * WALL_E;
    }

    for (const o of blocks) {
      if (o.round) hitCircle(b, o.dx, o.dz, o.w / 2, BLOCK_E);
      else hitRect(b, o.dx - o.w / 2, o.dx + o.w / 2, o.dz - o.d / 2, o.dz + o.d / 2, BLOCK_E, 0);
    }
    if (hasMill) {
      for (let k = 0; k < 4; k++) {
        if (sailRect(k, t)) hitRect(b, sailBounds.minX, sailBounds.maxX, sailBounds.minZ, sailBounds.maxZ, MOVER_E, sailBounds.vx);
      }
    }
    if (hasLog) {
      const l = GOLF.log;
      const cx = logX(t);
      hitRect(b, cx - l.halfLen, cx + l.halfLen, l.dz - l.r, l.dz + l.r, MOVER_E, logVX(t));
    }

    // in the cup: close enough and not flying past
    const dcup = Math.hypot(b.x, b.z - GOLF.cupDz);
    const speed = Math.hypot(b.vx, b.vz);
    if (dcup < GOLF.cupR && speed < CUP_SPEED) {
      b.vx = 0;
      b.vz = 0;
      b.x = 0;
      b.z = GOLF.cupDz;
      return "sunk";
    }
    if (speed < STOP_V) {
      b.vx = 0;
      b.vz = 0;
      return "stop";
    }
    t += step;
  }
  return Math.hypot(b.vx, b.vz) < STOP_V ? "stop" : "roll";
}

/** Where the ball starts each hole. */
export function teeBall(b: Ball) {
  b.x = 0;
  b.z = GOLF.teeDz;
  b.vx = 0;
  b.vz = 0;
}

/**
 * Which way the ball will go for this aim, as a unit vector.
 *
 * `aim` is measured from straight-at-the-cup and, crucially, in the frame the
 * player is actually looking from: standing behind the ball looking down the
 * hole, **positive aim is to her right**. Down a lane that runs towards -z
 * that means +x, which is what the right d-pad, the right arrow key and a
 * rightward drag all mean. This used to be `atan2(gx, gz) + aim` fed through
 * `(sin, cos)`, which rotates the other way, so every control was mirrored.
 *
 * `putt()` and the aim line on the green both come through here, so there is
 * one place for this to be right and no pair of signs that can cancel out.
 */
export function aimDir(bx: number, bz: number, aim: number, out: { x: number; z: number }) {
  const gx = -bx;
  const gz = GOLF.cupDz - bz;
  const d = Math.hypot(gx, gz) || 1;
  const ux = gx / d;
  const uz = gz / d;
  const c = Math.cos(aim);
  const s = Math.sin(aim);
  out.x = ux * c - uz * s;
  out.z = uz * c + ux * s;
  return out;
}

/** Shared scratch, so aiming and putting allocate nothing per frame. */
const dir = { x: 0, z: 0 };

/**
 * Hit the ball. Aiming is the same on every stroke wherever the ball has
 * ended up, because the aim is always measured from the line to the cup.
 */
export function putt(b: Ball, power: number, aim: number) {
  aimDir(b.x, b.z, aim, dir);
  const v = powerToSpeed(power);
  b.vx = dir.x * v;
  b.vz = dir.z * v;
}

/* --------------------------------------------------------- round bookkeeping */

/** Tickets for a finished round: generous, and never fewer than three. */
export function golfTickets(total: number, aces: number, par = golfPar()) {
  return Math.max(3, par * 2 - total) + aces * 2;
}

/** The line on the scorecard. */
export function golfLine(total: number, par = golfPar()) {
  const d = total - par;
  if (d <= -4) return "Unbelievable! You're a mini golf champion!";
  if (d < 0) return `${-d} under par! Brilliant putting!`;
  if (d === 0) return "Level par! Right on the number!";
  if (d <= 3) return "Great putting! So close to par.";
  if (d <= 7) return "Nice round! Play again and beat it.";
  return "You finished all five holes. That's what counts!";
}

/* ------------------------------------------------------------- the world */

/** What the putting overlay reads, every frame, without touching the store. */
export type GolfPose = {
  active: boolean;
  /** 0-based */
  hole: number;
  /** the hole she teed off on: a round runs from there to the last one */
  first: number;
  strokes: number;
  total: number;
  state: "aim" | "charge" | "roll" | "sunk";
  /** radians from straight-at-the-cup */
  aim: number;
  /** 0..1 */
  power: number;
  /** metres left to the cup */
  toCup: number;
  scores: number[];
};

export const golfPose: GolfPose = {
  active: false,
  hole: 0,
  first: 0,
  strokes: 0,
  total: 0,
  state: "aim",
  aim: 0,
  power: 0,
  toCup: 0,
  scores: [],
};

/**
 * What the buttons, keys and pad feed in. The overlay owns the input while
 * she is putting (it claims the pad), and writes here; the world reads it.
 */
export const golfInput = {
  /** -1, 0 or 1 while she is turning the aim */
  aim: 0,
  /** absolute aim, set by dragging a finger across the screen */
  aimTo: null as number | null,
  /** A / Space / the big button is held */
  charge: false,
  /** one-shot: leave the course */
  quit: false,
};

export function resetGolfInput() {
  golfInput.aim = 0;
  golfInput.aimTo = null;
  golfInput.charge = false;
  golfInput.quit = false;
}

/**
 * The lowest the camera can sit at (camX, camZ) and still see (tx, tz, ty)
 * over everything standing on this green. For each solid the segment crosses,
 * the tightest point is the far edge of the crossing, so the height there has
 * to clear the top with a little to spare.
 */
export function liftOver(hole: number, camX: number, camZ: number, tx: number, tz: number, ty: number) {
  // just enough to see over: a ball tucked right behind a wall needs a slope
  // of (wall - ball) / gap, and a generous margin on top of that sends the
  // camera tens of metres into the air
  const MARGIN = 0.18;
  let need = 0;
  const dx = tx - camX;
  const dz = tz - camZ;
  for (const o of golfSolids(hole)) {
    // clip the segment against the solid's footprint
    let s0 = 0;
    let s1 = 1;
    for (const [p, q, lo, hi] of [
      [dx, camX, o.minX, o.maxX],
      [dz, camZ, o.minZ, o.maxZ],
    ] as const) {
      if (Math.abs(p) < 1e-9) {
        if (q < lo || q > hi) {
          s0 = 1;
          s1 = 0;
        }
        continue;
      }
      const a = (lo - q) / p;
      const b = (hi - q) / p;
      s0 = Math.max(s0, Math.min(a, b));
      s1 = Math.min(s1, Math.max(a, b));
    }
    if (s1 <= s0 || s1 <= 0 || s0 >= 1) continue;
    const s = Math.min(s1, 0.999);
    // height(s) = camY * (1 - s) + ty * s must clear the top
    need = Math.max(need, (o.top + MARGIN - ty * s) / (1 - s));
  }
  return need;
}

/** Where the putting camera sits and looks, in world space. */
export type GolfCam = { px: number; py: number; pz: number; tx: number; ty: number; tz: number };

/**
 * The putting camera: behind the ball, high enough to look over everything on
 * the green rather than through it.
 *
 * The height is worked out, not guessed. `liftOver` gives the lowest camera
 * that clears the green's solids on the way to a spot, and the camera takes
 * the worst of the ball and the hole's first target (the gate, the doorway,
 * the corner). A guessed height is what put the windmill's roof across the
 * whole screen, and a dogleg would have hidden its corner just as badly.
 * Exported so tools/minigolf.ts can check the view from every tee.
 */
export function golfCamera(hole: number, bx: number, bz: number, out: GolfCam): GolfCam {
  const h = holeWorld(hole);
  const camX = bx * 0.3;
  const camZ = bz + 5.4;
  let y = 6.2;
  y = Math.max(y, liftOver(hole, camX, camZ, bx, bz, BALL_R));
  const [sx, sz] = golfSight(hole);
  y = Math.max(y, liftOver(hole, camX, camZ, sx, sz, 0.1));
  out.px = h.x + camX;
  out.py = Math.min(y, 11);
  out.pz = GOLF.z + camZ;
  // look a little way up the hole, never past its far border
  out.tx = h.x + bx * 0.35;
  out.ty = 0.25;
  out.tz = GOLF.z + Math.max(-GOLF.halfD + 0.5, Math.min(GOLF.halfD - 0.5, bz - 6));
  return out;
}

const AIM_SPEED = 1.15;
const DOTS = 14;

export class GolfWorld {
  group = new THREE.Group();
  private ball: THREE.Mesh;
  private dots: THREE.InstancedMesh;
  private rotor = new THREE.Group();
  private log: THREE.Mesh;
  private cupRing: THREE.Mesh;
  private b: Ball = { x: 0, z: 0, vx: 0, vz: 0 };
  private clock = 0;
  private held = 0;
  private restT = 0;
  private aces = 0;
  private lastNear: number | null = null;
  private m4 = new THREE.Matrix4();
  private cam: GolfCam = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0 };

  constructor(
    private scene: THREE.Scene,
    /** puts her on a tee between holes */
    private place: (x: number, y: number, z: number, yaw: number) => void,
  ) {
    const ballMat = lam("#fbfbfd", { flat: true, roughness: 0.3 });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 14, 10), ballMat);
    this.ball.castShadow = true;
    this.ball.visible = false;
    this.group.add(this.ball);

    this.dots = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.075, 0.075, 0.02, 10),
      lam("#fff6cf", { flat: true, emissive: "#ffd766", roughness: 0.4 }),
      DOTS,
    );
    this.dots.frustumCulled = false;
    this.dots.visible = false;
    this.group.add(this.dots);

    // a ring round the cup she is playing, so it is obvious where to aim
    this.cupRing = new THREE.Mesh(
      new THREE.TorusGeometry(GOLF.cupR + 0.09, 0.05, 6, 24),
      lam("#fff0b0", { flat: true, emissive: "#ffc84a", roughness: 0.4 }),
    );
    this.cupRing.rotation.x = Math.PI / 2;
    this.cupRing.visible = false;
    this.group.add(this.cupRing);

    // the windmill's four sails, on their hub in front of the tower
    const w = GOLF.windmill;
    const [mx, mz] = toWorld(w.hole, 0, w.dz);
    this.rotor.position.set(mx, w.hubY, mz);
    const sailGeo = new THREE.BoxGeometry(w.sail, w.sailW, w.sailT);
    const sailMat = lam("#4f93c4", { flat: true });
    for (let k = 0; k < 4; k++) {
      const pivot = new THREE.Group();
      pivot.rotation.z = (k * Math.PI) / 2;
      const m = new THREE.Mesh(sailGeo, sailMat);
      m.position.x = w.sail / 2;
      m.castShadow = true;
      pivot.add(m);
      this.rotor.add(pivot);
    }
    this.group.add(this.rotor);

    // the rolling log
    const l = GOLF.log;
    const logGeo = new THREE.CylinderGeometry(l.r, l.r, l.halfLen * 2, 12);
    logGeo.rotateZ(Math.PI / 2);
    this.log = new THREE.Mesh(logGeo, lam("#8a5a32", { repeat: 2 }));
    this.log.castShadow = true;
    const [lx, lz] = toWorld(l.hole, 0, l.dz);
    this.log.position.set(lx, l.r + 0.03, lz);
    this.group.add(this.log);

    scene.add(this.group);
  }

  dispose() {
    this.scene.remove(this.group);
    this.ball.geometry.dispose();
    this.dots.geometry.dispose();
    this.dots.dispose();
    this.cupRing.geometry.dispose();
    this.log.geometry.dispose();
    golfPose.active = false;
    resetGolfInput();
  }

  get playing() {
    return golfPose.active;
  }

  /** Which tee she is standing on, if any. */
  near(x: number, y: number, z: number): number | null {
    if (golfPose.active || y > 1.4) return null;
    for (let i = 0; i < GOLF.holes; i++) {
      const h = holeWorld(i);
      if (Math.hypot(x - h.x, z - h.teeZ) < 1.7) return i;
    }
    return null;
  }

  /** Collect on a tee mat. Returns true when a round started. */
  tryInteract(x: number, y: number, z: number) {
    const i = this.near(x, y, z);
    if (i == null) return false;
    this.start(i);
    return true;
  }

  start(hole: number) {
    sfx.click();
    golfPose.active = true;
    golfPose.hole = hole;
    golfPose.first = hole;
    golfPose.strokes = 0;
    golfPose.total = 0;
    golfPose.scores = [];
    golfPose.state = "aim";
    golfPose.aim = 0;
    golfPose.power = 0;
    this.aces = 0;
    this.held = 0;
    this.restT = 0;
    resetGolfInput();
    teeBall(this.b);
    this.ball.visible = true;
    this.cupRing.visible = true;
    const st = useGame.getState();
    st.setGolfPlaying(true);
    st.setGolfNear(null);
    st.setEmmettNotice(`Hole ${hole + 1}: ${GOLF.names[hole]}. Par ${GOLF.par}!`);
    this.standAtTee(hole);
  }

  private standAtTee(hole: number) {
    const h = holeWorld(hole);
    // just off the mat, on the apron side, facing up the hole
    this.place(h.x - 1.15, 0.05, h.teeZ + 0.5, 0);
  }

  /** Stop playing, whether she quit or finished. */
  private end(card: boolean) {
    const st = useGame.getState();
    if (card) {
      const total = golfPose.total;
      const played = golfPose.scores.length;
      const par = GOLF.par * played;
      // only a round from the first tee to the last counts for a best
      const full = golfPose.first === 0 && played === GOLF.holes;
      const best = st.golfBest;
      const isBest = full && (best == null || total < best);
      const tickets = golfTickets(total, this.aces, par);
      st.addTickets(tickets);
      if (isBest) st.setGolfBest(total);
      st.setGolfCard({
        from: golfPose.first,
        scores: golfPose.scores.slice(),
        total,
        par,
        tickets,
        best: best ?? null,
        isBest,
        full,
        line: golfLine(total, par),
      });
      sfx.win();
    }
    golfPose.active = false;
    golfPose.state = "aim";
    this.ball.visible = false;
    this.dots.visible = false;
    this.cupRing.visible = false;
    resetGolfInput();
    st.setGolfPlaying(false);
  }

  quit() {
    if (!golfPose.active) return;
    sfx.click();
    this.end(false);
    useGame.getState().setEmmettNotice("Come back to the tee any time!");
  }

  /** Every frame. The sails and the log turn whether or not she is playing. */
  update(dt: number, her: { x: number; y: number; z: number }) {
    this.clock += dt;
    const t = this.clock;
    this.rotor.rotation.z = sailAngle(t);
    const l = GOLF.log;
    const [lx] = toWorld(l.hole, logX(t), 0);
    this.log.position.x = lx;
    this.log.rotation.x = (logX(t) / l.r) * -1;

    if (!golfPose.active) {
      const n = this.near(her.x, her.y, her.z);
      if (n !== this.lastNear) {
        this.lastNear = n;
        useGame.getState().setGolfNear(n);
      }
      return;
    }
    this.lastNear = null;

    if (golfInput.quit) {
      golfInput.quit = false;
      this.quit();
      return;
    }

    const hole = golfPose.hole;

    if (golfPose.state === "aim" || golfPose.state === "charge") {
      if (golfInput.aimTo != null) golfPose.aim = golfInput.aimTo;
      else golfPose.aim += golfInput.aim * AIM_SPEED * dt;
      golfPose.aim = Math.max(-AIM_LIMIT, Math.min(AIM_LIMIT, golfPose.aim));
      golfInput.aimTo = null;

      if (golfInput.charge) {
        this.held += dt;
        golfPose.state = "charge";
        golfPose.power = Math.min(1, this.held / CHARGE_TIME);
      } else if (golfPose.state === "charge") {
        // a tap is a gentle putt; a hold is whatever the meter reached
        const power = this.held < 0.13 ? TAP_POWER : golfPose.power;
        this.held = 0;
        golfPose.power = 0;
        golfPose.state = "roll";
        golfPose.strokes++;
        golfPose.total++;
        putt(this.b, power, golfPose.aim);
        sfx.jump();
      }
    } else if (golfPose.state === "roll") {
      const r = stepBall(this.b, hole, dt, t);
      if (r === "sunk") {
        golfPose.state = "sunk";
        this.restT = 0;
        golfPose.scores.push(golfPose.strokes);
        if (golfPose.strokes === 1) this.aces++;
        sfx.correct();
        const s = golfPose.strokes;
        useGame
          .getState()
          .setEmmettNotice(
            s === 1 ? "HOLE IN ONE!!" : `In the hole! ${s} shots${s <= GOLF.par ? ", that's par or better!" : "."}`,
          );
      } else if (r === "stop") {
        golfPose.state = "aim";
        golfPose.aim = 0;
      }
    } else if (golfPose.state === "sunk") {
      this.restT += dt;
      if (this.restT > 1.6) {
        if (hole + 1 >= GOLF.holes) {
          this.end(true);
          return;
        }
        golfPose.hole = hole + 1;
        golfPose.strokes = 0;
        golfPose.state = "aim";
        golfPose.aim = 0;
        teeBall(this.b);
        this.standAtTee(hole + 1);
        useGame.getState().setEmmettNotice(`Hole ${hole + 2}: ${GOLF.names[hole + 1]}. Par ${GOLF.par}!`);
      }
    }

    // draw: ball, aim dots and the cup ring for the hole she is on
    const [bx, bz] = toWorld(golfPose.hole, this.b.x, this.b.z);
    this.ball.position.set(bx, BALL_R + 0.14, bz);
    golfPose.toCup = Math.hypot(this.b.x, this.b.z - GOLF.cupDz);
    const cw = holeWorld(golfPose.hole);
    this.cupRing.position.set(cw.x, 0.2, cw.cupZ);

    const aiming = golfPose.state === "aim" || golfPose.state === "charge";
    this.dots.visible = aiming;
    if (aiming) {
      const { x: dx, z: dz } = aimDir(this.b.x, this.b.z, golfPose.aim, dir);
      const reach = 1.0 + (golfPose.state === "charge" ? golfPose.power : 0.35) * 4.0;
      for (let i = 0; i < DOTS; i++) {
        const s = 0.42 + (i * reach) / DOTS;
        const px = this.b.x + dx * s;
        const pz = this.b.z + dz * s;
        const inside = Math.abs(px) < GOLF.halfW && Math.abs(pz) < GOLF.halfD;
        const k = inside ? 1 - i / (DOTS * 1.6) : 0;
        const [wx, wz] = toWorld(golfPose.hole, px, pz);
        this.m4.makeScale(k, 1, k);
        this.m4.setPosition(wx, 0.17, wz);
        this.dots.setMatrixAt(i, this.m4);
      }
      this.dots.instanceMatrix.needsUpdate = true;
    }
  }

  /** Where the camera watches from while she putts (see golfCamera). */
  camera(pos: THREE.Vector3, target: THREE.Vector3) {
    const c = golfCamera(golfPose.hole, this.b.x, this.b.z, this.cam);
    pos.set(c.px, c.py, c.pz);
    target.set(c.tx, c.ty, c.tz);
  }
}
