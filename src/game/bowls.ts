import * as THREE from "three";
import { sfx } from "./audio";
import type { AABB } from "./collision";
import { mergeStatic } from "./merge";
import { lam, signBoard } from "./meshes";
import type { GrassField } from "./scenery";
import { useGame } from "./store";

/**
 * Sloanie's Bowls Club: two skittle lanes on a clipped green, a clubhouse, a
 * scoreboard, benches and a hedge round the lot.
 *
 * Everything here is self-contained. `BOWLS` is the only geometry table, the
 * physics below is pure, and `BowlsWorld` builds its own meshes and pushes its
 * own colliders into the world's list the way `HomeWorld` does — nothing in
 * levels.ts, park.ts or colliders.ts knows the club exists.
 *
 * **Why skittles and not jack-and-bowls.** Real lawn bowls scores by which
 * bowl finished nearest the jack, which means comparing two distances you
 * cannot see from behind the mat. Nine pins either fall or they do not, the
 * HUD can show which ones are left as nine dots, and "how many did you knock
 * over?" is a question a six-year-old can answer from across the room. So the
 * club plays skittles on a bowling green: the place reads as lawn bowls, the
 * scoring reads as bowling.
 *
 * Lane-local coordinates all through, exactly like mini golf: `x` across the
 * lane, `z` along it, the mat at `+matDz` and the pins around `pinDz`, so
 * every lane is played northwards (-z). Positive aim is the player's right,
 * which down a lane running towards -z is +x.
 *
 * `stepBowls` is pure, so `tools/bowls.ts` can roll tens of thousands of
 * bowls headlessly with exactly the code the game runs.
 */

/* ------------------------------------------------------------- the club */

export const BOWLS = {
  /**
   * The green's centre. It is the clear lawn on the west side of the east
   * spine, between the picnic area and the campground: 2.2m off the walkway
   * at x 114, so she walks straight into it, and nothing else in the park is
   * within 10m of it (tools/bowls.ts `scan` found the spot and re-checks it).
   */
  x: 97,
  z: 92,
  /** the clipped green, centred on (x, z) */
  greenW: 26,
  greenD: 26,
  /** two rinks side by side, as offsets across the green */
  laneDx: [-3.2, 3.2],
  laneNames: ["Clubhouse Rink", "Hedge Rink"],
  /** the playable rink is |x| <= halfW and |z| <= halfD */
  halfW: 1.35,
  halfD: 8.5,
  /** the wooden kerb round a rink: thickness and height, inner face on the edge */
  kerbT: 0.35,
  kerbH: 0.3,
  /** surface tops: the green, then the rink a band above it (no z-fighting) */
  turfTop: 0.06,
  laneTop: 0.1,
  /** the mat she bowls from, and the centre of the pin diamond */
  matDz: 7.2,
  pinDz: -5.6,
  /** centre-to-centre spacing of the diamond, across and along */
  pinGap: 0.36,
  /** the hedge round the green, and the gateway in its east side */
  hedgeH: 1.15,
  hedgeT: 0.6,
  gateDz: 5.5,
  gateW: 4.4,
  /** two bowls a turn, three turns, nine pins: 27 is a perfect game */
  turns: 3,
  perTurn: 2,
  pins: 9,
  /** where she arrives from: the walkway at x 114 */
  greenColor: "#5aab5f",
  rinkColor: "#4f9e57",
};

/** Where the green sits when a park does not say otherwise: park 1's. */
const BOWLS_HOME = { x: BOWLS.x, z: BOWLS.z };

/**
 * Move the club. Everything else here is rink-local, so the green, the kerbs,
 * the hedge, the clubhouse and the physics all follow the centre.
 */
export function setBowlsOrigin(o: { x: number; z: number } = BOWLS_HOME) {
  BOWLS.x = o.x;
  BOWLS.z = o.z;
}

export const MAX_SCORE = BOWLS.turns * BOWLS.pins;

/** Radii and heights of the things that roll and fall. */
export const BOWL_R = 0.16;
export const PIN_R = 0.105;
export const PIN_H = 0.52;
/**
 * A pin that has been knocked over is lying down, so it sweeps much further
 * than it stood. This is what makes the diamond generous: a pin toppled by
 * the head pin reaches its neighbours even though they are 0.51m apart.
 */
export const PIN_FALL_R = 0.3;

/** the fastest and slowest a bowl can leave the mat */
export const MIN_V = 6.4;
export const MAX_V = 10.5;
/** how far off straight down the rink the arrow ever points */
export const AIM_LIMIT = 0.2;
/**
 * The aim is a timing game, not a steering one: the arrow swings from side to
 * side on its own and she presses to stop it.
 *
 * The swing is a triangle wave, not a sine, so the arrow crosses the middle at
 * exactly the speed it moves anywhere else. A sine dawdles at the ends and
 * races through the middle, which would make straight the one line she could
 * never catch.
 *
 * The rate is the whole difficulty. At 0.36 rad/s the arrow takes 2.2s to go
 * over and back across the full 23 degrees, and it spends about 0.28s of each
 * pass within the 3 degrees either side of straight that clears most of the
 * diamond — a window a seven-year-old hits often, and misses often enough to
 * care. The first turn of a game swings slower, to let her find the rhythm;
 * it never speeds up after that, because a game that gets harder as it goes
 * is a game she loses at the end.
 *
 * tools/bowls.ts plays 400 games at each of four thumbs: pressing at random
 * scores about 11 of 27, a sloppy quarter-second-late thumb about 16, a
 * child who is really watching about 20, and a sharp one about 24.
 */
export const SWEEP_SPEED = 0.36;
export const SWEEP_SPEED_FIRST = 0.26;
export function sweepSpeed(turn: number) {
  return turn <= 0 ? SWEEP_SPEED_FIRST : SWEEP_SPEED;
}

/**
 * Where the arrow points `t` seconds into a swing, in radians. `t` 0 is
 * straight down the rink and turning to her right; it is pure, so
 * tools/bowls.ts samples the same swing the game draws.
 */
export function sweepAim(t: number, speed: number) {
  const span = AIM_LIMIT * 2;
  const period = (span * 2) / speed;
  const u = (((t + period / 4) % period) + period) % period;
  const x = u * speed;
  return x < span ? -AIM_LIMIT + x : AIM_LIMIT - (x - span);
}
/** a tap instead of a held button bowls at this power */
export const TAP_POWER = 0.45;
/** seconds to fill the meter */
export const CHARGE_TIME = 1.1;

/** rolling resistance on clipped grass: a constant part and a speed part */
const ROLL_A = 0.55;
const ROLL_K = 0.2;
/**
 * A bowl still going after this many seconds is braked hard. Nothing on a
 * rink can trap a bowl, but a full-power bowl ricocheting between the kerbs
 * can take eight seconds to die, and a seven-year-old has stopped watching by
 * then. The brake also guarantees every roll terminates, which tools/bowls.ts
 * leans on.
 */
const LONG_ROLL = 4.5;
const LONG_BRAKE = 2.6;
/** below this the bowl (or a sliding pin) has stopped */
const STOP_V = 0.2;
const PIN_STOP_V = 0.25;
/**
 * The kerbs are the ditch: a bowl that reaches one is all but dead.
 *
 * They used to bounce at 0.45, and that quietly removed the whole point of
 * aiming — a bowl sent fifteen degrees wide hit the kerb, came back across
 * and still ploughed through the diamond, so pressing the button at random
 * scored as well as timing it. At 0.15 a wide bowl dies where it lands, which
 * is both what a real rink does and what makes the swinging arrow matter.
 */
const WALL_E = 0.15;
/** a pin that hits a kerb barely comes back */
const PIN_WALL_E = 0.25;
/** how much of its speed the bowl loses into a pin it hits */
const BOWL_LOSS = 0.5;
/** how much of the bowl's blow a pin takes away with it, and the floor under it */
const KNOCK = 0.9;
const KNOCK_MIN = 1.6;
/** a toppling pin passes this much of itself on to the next pin */
const CHAIN = 0.62;
const CHAIN_LOSS = 0.35;
/** a fallen pin slides on grass and stops quickly */
const PIN_A = 3.4;
const PIN_K = 1.5;

/**
 * The nine pins, in lane-local metres: the classic skittle diamond, point
 * towards the mat.
 *
 *            o            (back)
 *          o   o
 *        o   o   o
 *          o   o
 *            o            (nearest the mat)
 *
 * Adjacent pins are `pinGap * sqrt(2)` apart, which is 0.51m; two of them
 * leave a 0.30m gap and the bowl is 0.32m across, so a bowl that reaches the
 * diamond at all cannot thread it without touching something. That is on
 * purpose: tools/bowls.ts checks the arithmetic.
 */
export const PIN_SPOTS: [number, number][] = (() => {
  const g = BOWLS.pinGap;
  const rel: [number, number][] = [
    [0, 2 * g],
    [-g, g],
    [g, g],
    [-2 * g, 0],
    [0, 0],
    [2 * g, 0],
    [-g, -g],
    [g, -g],
    [0, -2 * g],
  ];
  return rel.map(([dx, dz]) => [dx, BOWLS.pinDz + dz] as [number, number]);
})();

/** Where a rink's mat and pin diamond are in the world. */
export function laneWorld(i: number) {
  const x = BOWLS.x + (BOWLS.laneDx[i] ?? 0);
  return { x, matZ: BOWLS.z + BOWLS.matDz, pinZ: BOWLS.z + BOWLS.pinDz };
}

/** Lane-local to world. */
export function toWorld(i: number, dx: number, dz: number): [number, number] {
  return [BOWLS.x + (BOWLS.laneDx[i] ?? 0) + dx, BOWLS.z + dz];
}

/** The green's footprint in the world, for the grass mask and the tools. */
export function greenRect(pad = 0) {
  return {
    minX: BOWLS.x - BOWLS.greenW / 2 - pad,
    maxX: BOWLS.x + BOWLS.greenW / 2 + pad,
    minZ: BOWLS.z - BOWLS.greenD / 2 - pad,
    maxZ: BOWLS.z + BOWLS.greenD / 2 + pad,
  };
}

export function powerToSpeed(power: number) {
  const p = Math.max(0, Math.min(1, power));
  return MIN_V + (MAX_V - MIN_V) * p;
}

/**
 * Which way a bowl goes for this aim, as a unit vector. Unlike mini golf the
 * aim is measured from straight down the rink, because the bowl always starts
 * on the mat: there is no second stroke from wherever it stopped.
 *
 * Standing on the mat looking at the pins (towards -z), her right hand is +x,
 * so positive aim is +x. Right d-pad, right arrow and a rightward drag all
 * mean the same thing, and there is one place for it to be right.
 */
export function aimDir(aim: number, out: { x: number; z: number }) {
  out.x = Math.sin(aim);
  out.z = -Math.cos(aim);
  return out;
}

/* ------------------------------------------------------------ the physics */

export type Bowl = { x: number; z: number; vx: number; vz: number };
export type Pin = { x: number; z: number; vx: number; vz: number; down: boolean; angle: number };
export type Rack = Pin[];

export function newRack(): Rack {
  return PIN_SPOTS.map(([x, z]) => ({ x, z, vx: 0, vz: 0, down: false, angle: 0 }));
}

/** Stand every pin back up on its spot. */
export function resetRack(rack: Rack) {
  for (let i = 0; i < rack.length; i++) {
    const p = rack[i]!;
    const [x, z] = PIN_SPOTS[i]!;
    p.x = x;
    p.z = z;
    p.vx = 0;
    p.vz = 0;
    p.down = false;
    p.angle = 0;
  }
}

export function standing(rack: Rack) {
  let n = 0;
  for (const p of rack) if (!p.down) n++;
  return n;
}

export function pinsDown(rack: Rack) {
  return rack.length - standing(rack);
}

/** Put the bowl on the mat. */
export function matBowl(b: Bowl) {
  b.x = 0;
  b.z = BOWLS.matDz;
  b.vx = 0;
  b.vz = 0;
}

/** Send the bowl away. */
export function roll(b: Bowl, power: number, aim: number) {
  const d = { x: 0, z: 0 };
  aimDir(aim, d);
  const v = powerToSpeed(power);
  b.vx = d.x * v;
  b.vz = d.z * v;
}

/** Knock a standing pin over, with the blow that did it. */
function topple(p: Pin, nx: number, nz: number, speed: number) {
  p.down = true;
  const s = Math.max(KNOCK_MIN, speed);
  p.vx = nx * s;
  p.vz = nz * s;
  p.angle = Math.atan2(nx, nz);
}

/** Keep a circle of radius r inside the rink, bouncing off the kerbs. */
function contain(o: { x: number; z: number; vx: number; vz: number }, r: number, e: number) {
  const lx = BOWLS.halfW - r;
  const lz = BOWLS.halfD - r;
  let hit = false;
  if (o.x < -lx) {
    o.x = -lx;
    if (o.vx < 0) o.vx = -o.vx * e;
    hit = true;
  } else if (o.x > lx) {
    o.x = lx;
    if (o.vx > 0) o.vx = -o.vx * e;
    hit = true;
  }
  if (o.z < -lz) {
    o.z = -lz;
    if (o.vz < 0) o.vz = -o.vz * e;
    hit = true;
  } else if (o.z > lz) {
    o.z = lz;
    if (o.vz > 0) o.vz = -o.vz * e;
    hit = true;
  }
  return hit;
}

export type StepResult = "roll" | "stop";

/**
 * One slice of a roll: the bowl, then every pin that is on the move.
 *
 * `rolled` is how long this bowl has been going, in seconds; past `LONG_ROLL`
 * the grass is treated as much heavier, which is what guarantees every roll
 * ends. Returns "stop" once the bowl and every pin have come to rest.
 *
 * `onHit` is called for each pin knocked down, so the game can make a noise
 * without the physics knowing what a noise is.
 */
export function stepBowls(b: Bowl, rack: Rack, dt: number, rolled: number, onHit?: (n: number) => void): StepResult {
  let left = dt;
  let guard = 0;
  while (left > 1e-6 && guard++ < 64) {
    const sp = Math.hypot(b.vx, b.vz);
    // never step further than a fraction of the bowl, so nothing is tunnelled
    const step = Math.min(left, sp > 0.001 ? (BOWL_R * 0.5) / sp : left, 1 / 120);
    left -= step;
    rolled += step;
    const brake = rolled > LONG_ROLL ? LONG_BRAKE : 1;

    // the bowl: friction, then move, then the kerbs
    if (sp > 0) {
      const drop = (ROLL_A + ROLL_K * sp) * brake * step;
      const k = sp > drop ? (sp - drop) / sp : 0;
      b.vx *= k;
      b.vz *= k;
    }
    b.x += b.vx * step;
    b.z += b.vz * step;
    contain(b, BOWL_R, WALL_E);

    // the bowl against the pins that are still standing
    for (const p of rack) {
      if (p.down) continue;
      const dx = p.x - b.x;
      const dz = p.z - b.z;
      const rr = BOWL_R + PIN_R;
      const d2 = dx * dx + dz * dz;
      if (d2 > rr * rr) continue;
      const d = Math.sqrt(d2);
      const nx = d > 1e-6 ? dx / d : 0;
      const nz = d > 1e-6 ? dz / d : -1;
      // push them apart so the same contact is never resolved twice
      b.x = p.x - nx * rr;
      b.z = p.z - nz * rr;
      const along = b.vx * nx + b.vz * nz;
      if (along > 0) {
        b.vx -= nx * along * BOWL_LOSS;
        b.vz -= nz * along * BOWL_LOSS;
      }
      topple(p, nx, nz, Math.abs(along) * KNOCK);
      onHit?.(1);
    }

    // pins that are moving: friction, move, kerbs, and what they knock into
    for (const p of rack) {
      if (!p.down) continue;
      const ps = Math.hypot(p.vx, p.vz);
      if (ps <= 0) continue;
      const drop = (PIN_A + PIN_K * ps) * brake * step;
      const k = ps > drop ? (ps - drop) / ps : 0;
      p.vx *= k;
      p.vz *= k;
      p.x += p.vx * step;
      p.z += p.vz * step;
      contain(p, PIN_FALL_R, PIN_WALL_E);
      if (Math.hypot(p.vx, p.vz) < PIN_STOP_V) {
        p.vx = 0;
        p.vz = 0;
        continue;
      }
      for (const q of rack) {
        if (q === p || q.down) continue;
        const dx = q.x - p.x;
        const dz = q.z - p.z;
        const rr = PIN_FALL_R + PIN_R;
        const d2 = dx * dx + dz * dz;
        if (d2 > rr * rr) continue;
        const d = Math.sqrt(d2);
        const nx = d > 1e-6 ? dx / d : 0;
        const nz = d > 1e-6 ? dz / d : -1;
        const along = p.vx * nx + p.vz * nz;
        topple(q, nx, nz, Math.abs(along) * CHAIN);
        p.vx -= nx * along * CHAIN_LOSS;
        p.vz -= nz * along * CHAIN_LOSS;
        onHit?.(1);
      }
    }

    if (Math.hypot(b.vx, b.vz) < STOP_V) {
      b.vx = 0;
      b.vz = 0;
      let moving = false;
      for (const p of rack) if (p.vx || p.vz) moving = true;
      if (!moving) return "stop";
    }
  }
  return "roll";
}

/* --------------------------------------------------------- bookkeeping */

/** Tickets for a finished game: generous, and never fewer than three. */
export function bowlsTickets(score: number, perfect: boolean) {
  return 3 + Math.round(score * 0.45) + (perfect ? 4 : 0);
}

/** The line on the scorecard. */
export function bowlsLine(score: number) {
  if (score >= MAX_SCORE) return "A perfect game! Every single pin, every single turn!";
  if (score >= 22) return "Wow! You cleared nearly everything!";
  if (score >= 16) return "Brilliant bowling! That's a proper score.";
  if (score >= 10) return "Nice bowling! The pins never saw it coming.";
  if (score >= 4) return "Good rolling! Have another go and beat it.";
  if (score >= 1) return "You knocked some over! Try stopping the arrow dead straight.";
  return "Tricky one! Watch the arrow swing and press the moment it points straight.";
}

/* ------------------------------------------------------------- the world */

/** What the bowling overlay reads, every frame, without touching the store. */
export type BowlsPose = {
  active: boolean;
  /** which rink, 0 or 1 */
  lane: number;
  /** 0-based turn */
  turn: number;
  /** bowls already delivered this turn */
  delivered: number;
  /**
   * sweep: the arrow is swinging and a press stops it.
   * set:   the line is chosen and she is about to pull the power.
   * charge/roll/tally: as before.
   */
  state: "sweep" | "set" | "charge" | "roll" | "tally";
  /** radians from straight down the rink */
  aim: number;
  /** 0..1 */
  power: number;
  /** which pins are still up */
  standing: boolean[];
  /** pins knocked down this turn */
  turnPins: number;
  /** finished turns */
  scores: number[];
  total: number;
};

export const bowlsPose: BowlsPose = {
  active: false,
  lane: 0,
  turn: 0,
  delivered: 0,
  state: "sweep",
  aim: 0,
  power: 0,
  standing: PIN_SPOTS.map(() => true),
  turnPins: 0,
  scores: [],
  total: 0,
};

/**
 * What the buttons, keys and pad feed in. The overlay owns the input while
 * she is bowling (it claims the pad) and writes here; the world reads it.
 */
export const bowlsInput = {
  /**
   * A / Space / the big button is held. One button does the whole shot: the
   * first press stops the swinging arrow, the next hold fills the power.
   * There is no left and right any more, so there is nothing to confuse the
   * timing with.
   */
  charge: false,
  /** one-shot: leave the green */
  quit: false,
};

export function resetBowlsInput() {
  bowlsInput.charge = false;
  bowlsInput.quit = false;
}

/** Where the bowling camera sits and looks, in world space. */
export type BowlsCam = { px: number; py: number; pz: number; tx: number; ty: number; tz: number };

/**
 * Behind the mat, looking straight down the rink at the pins.
 *
 * It follows the bowl down the green and stops seven metres short of the
 * diamond, dropping as it goes, so the pins start small at the end of a long
 * rink and are close and low by the time they are hit. Nothing on a rink is
 * taller than a 0.3m kerb, so unlike mini golf there is no height to work
 * out; tools/bowls.ts still checks the view against the park's real colliders.
 */
export function bowlsCamera(lane: number, bowlZ: number, out: BowlsCam): BowlsCam {
  const w = laneWorld(lane);
  const far = BOWLS.matDz + 4.8;
  const near = BOWLS.pinDz + 7;
  const dz = Math.max(near, Math.min(far, bowlZ + 4.8));
  const t = (dz - near) / Math.max(1e-6, far - near);
  out.px = w.x;
  out.py = 2.7 + t * 1.2;
  out.pz = BOWLS.z + dz;
  out.tx = w.x;
  out.ty = 0.45;
  out.tz = w.pinZ;
  return out;
}

const DOTS = 16;
const box = new THREE.BoxGeometry(1, 1, 1);

/**
 * Blank the grass instances standing inside a rectangle.
 *
 * The grass exclusion mask is built from the level's props before the world is
 * merged, and the club is built afterwards (it has to be: it owns its own
 * meshes), so the only way to stop 0.85m blades growing through a clipped
 * green is to fold the instances away. Scaling an instance to zero costs one
 * matrix write and nothing per frame.
 */
export function mowGrass(field: GrassField | null | undefined, r: { minX: number; maxX: number; minZ: number; maxZ: number }) {
  if (!field) return 0;
  const m = new THREE.Matrix4();
  let mowed = 0;
  field.group.traverse((o) => {
    const im = o as THREE.InstancedMesh;
    if (!im.isInstancedMesh) return;
    for (let i = 0; i < im.count; i++) {
      im.getMatrixAt(i, m);
      const x = m.elements[12]!;
      const z = m.elements[14]!;
      if (x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) continue;
      if (m.elements[0] === 0 && m.elements[5] === 0) continue;
      m.set(0, 0, 0, x, 0, 0, 0, -50, 0, 0, 0, z, 0, 0, 0, 1);
      im.setMatrixAt(i, m);
      mowed++;
    }
    im.instanceMatrix.needsUpdate = true;
  });
  return mowed;
}

/**
 * Everything the club builds, as plain boxes in world space. Kept as data so
 * tools/bowls.ts can check the layout without a renderer: `solid` ones become
 * colliders, the rest are decoration.
 *
 * `y` is the centre height, like every other box in this project.
 */
export type ClubBox = {
  label: string;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: string;
  solid: boolean;
  /** flat surfaces are never solid and never cast shadows */
  flat?: boolean;
};

/** The whole club as boxes: green, rinks, kerbs, hedge, clubhouse, benches. */
export function clubBoxes(): ClubBox[] {
  const B = BOWLS;
  const out: ClubBox[] = [];
  const add = (label: string, x: number, y: number, z: number, w: number, h: number, d: number, color: string, solid: boolean, flat = false) =>
    out.push({ label, x, y, z, w, h, d, color, solid, flat });

  // the clipped green, in mown stripes so it reads as a bowling green
  const stripes = 13;
  const sw = B.greenW / stripes;
  for (let i = 0; i < stripes; i++) {
    const x = B.x - B.greenW / 2 + sw * (i + 0.5);
    add("green", x, B.turfTop / 2, B.z, sw, B.turfTop, B.greenD, i % 2 ? B.greenColor : "#64b468", false, true);
  }

  for (let i = 0; i < B.laneDx.length; i++) {
    const lx = B.x + B.laneDx[i]!;
    const inW = B.halfW * 2;
    const inD = B.halfD * 2;
    // the rink itself, a band above the green
    add(`rink ${i + 1}`, lx, B.laneTop / 2, B.z, inW, B.laneTop, inD, B.rinkColor, false, true);
    // kerbs, their inner faces exactly on the edge of the playable rink
    for (const s of [-1, 1]) {
      add(`kerb ${i + 1}`, lx + s * (B.halfW + B.kerbT / 2), B.kerbH / 2, B.z, B.kerbT, B.kerbH, inD + B.kerbT * 2, "#a5713f", true);
      add(`kerb ${i + 1}`, lx, B.kerbH / 2, B.z + s * (B.halfD + B.kerbT / 2), inW, B.kerbH, B.kerbT, "#a5713f", true);
    }
    // the mat, and a painted line across the rink she must not cross
    const [mx, mz] = toWorld(i, 0, B.matDz);
    add(`mat ${i + 1}`, mx, B.laneTop + 0.025, mz, 1.3, 0.05, 1.3, "#2f6f8f", false, true);
    add(`foot line ${i + 1}`, mx, B.laneTop + 0.02, mz - 1.05, inW, 0.04, 0.12, "#f2f2f2", false, true);
    // a sanded circle under the pins, so it is obvious where they belong
    const [px, pz] = toWorld(i, 0, B.pinDz);
    add(`pin deck ${i + 1}`, px, B.laneTop + 0.02, pz, 2.1, 0.04, 2.1, "#e0c48a", false, true);
  }

  // the hedge: three closed sides and an east side with a gateway in it
  const hx = B.greenW / 2;
  const hz = B.greenD / 2;
  const t = B.hedgeT;
  const hy = B.hedgeH / 2;
  add("hedge north", B.x, hy, B.z - hz, B.greenW + t, B.hedgeH, t, "#2f7a3e", true);
  add("hedge south", B.x, hy, B.z + hz, B.greenW + t, B.hedgeH, t, "#2f7a3e", true);
  add("hedge west", B.x - hx, hy, B.z, t, B.hedgeH, B.greenD, "#2f7a3e", true);
  // east: two runs with the gateway between them
  {
    const g0 = B.gateDz - B.gateW / 2;
    const g1 = B.gateDz + B.gateW / 2;
    const northRun = g0 - -hz;
    const southRun = hz - g1;
    add("hedge east", B.x + hx, hy, B.z + (-hz + g0) / 2, t, B.hedgeH, northRun, "#2f7a3e", true);
    add("hedge east", B.x + hx, hy, B.z + (g1 + hz) / 2, t, B.hedgeH, southRun, "#2f7a3e", true);
    // gate posts and a board over them (the board is out of reach, so not solid)
    for (const s of [-1, 1]) {
      add("gate post", B.x + hx, 1.35, B.z + B.gateDz + s * (B.gateW / 2 - 0.2), 0.4, 2.7, 0.4, "#8a5a32", true);
    }
    add("gate beam", B.x + hx, 2.85, B.z + B.gateDz, 0.3, 0.3, B.gateW, "#8a5a32", false);
  }

  // The clubhouse, on the west apron. It is well up the green, away from the
  // mats: a counter sticking out level with rink 1's mat closed the walk to it
  // down to nothing, which tools/bowls.ts caught in the flood fill.
  {
    const cx = B.x - 9.2;
    const cz = B.z - 4.5;
    add("clubhouse", cx, 1.4, cz, 5.4, 2.8, 4.2, "#fff0d2", true);
    add("clubhouse roof", cx, 3.0, cz, 6.2, 0.45, 5.0, "#d45a4a", false);
    add("clubhouse roof", cx, 3.4, cz, 4.6, 0.4, 3.6, "#c24d40", false);
    add("clubhouse door", cx, 1.05, cz + 2.16, 1.1, 2.1, 0.12, "#8a5a32", false);
    add("clubhouse window", cx - 1.6, 1.75, cz + 2.16, 1.0, 0.9, 0.12, "#bfe4f2", false);
    add("clubhouse window", cx + 1.6, 1.75, cz + 2.16, 1.0, 0.9, 0.12, "#bfe4f2", false);
    // the tea counter runs along the clubhouse's south wall, not out into the walk
    add("clubhouse counter", cx, 0.5, cz + 2.75, 3.2, 1.0, 0.7, "#e8b84a", true);
  }

  // benches: two on each apron, facing the rinks and clear of the gateway walk
  for (const [bx, bz] of [
    [B.x + 8.5, B.z - 6.0],
    [B.x + 8.5, B.z - 1.5],
    [B.x - 8.0, B.z + 4.5],
    [B.x - 8.0, B.z + 9.0],
  ] as [number, number][]) {
    add("bench", bx, 0.45, bz, 0.6, 0.16, 2.6, "#d9a55b", true);
    for (const s of [-1, 1]) add("bench leg", bx, 0.19, bz + s * 1.0, 0.5, 0.38, 0.2, "#8a5a32", false);
    add("bench back", bx - 0.26, 0.78, bz, 0.12, 0.5, 2.6, "#d9a55b", false);
  }

  // the scoreboard, in the strip between the rinks at the pin end, where it
  // is in view down both rinks and out of either camera's sightline
  {
    const sx = B.x;
    const sz = B.z + B.pinDz - 1.2;
    add("scoreboard post", sx - 1.0, 1.1, sz, 0.22, 2.2, 0.22, "#8a5a32", false);
    add("scoreboard post", sx + 1.0, 1.1, sz, 0.22, 2.2, 0.22, "#8a5a32", false);
    add("scoreboard", sx, 2.4, sz, 2.6, 1.5, 0.22, "#2f4f3f", true);
    add("scoreboard trim", sx, 3.2, sz, 2.8, 0.18, 0.3, "#e8b84a", false);
  }

  // a rack of spare bowls inside the gateway, so the place looks used
  {
    const rx = B.x + 10.8;
    const rz = B.z + B.gateDz - 3.2;
    add("bowls rack", rx, 0.35, rz, 0.8, 0.7, 2.2, "#8a5a32", true);
    for (let i = 0; i < 4; i++) add("spare bowl", rx, 0.82, rz - 0.8 + i * 0.52, 0.3, 0.3, 0.3, "#20242e", false);
  }
  return out;
}

/** Just the solid boxes, as world-space AABBs. */
export function bowlsColliders(): AABB[] {
  return clubBoxes()
    .filter((b) => b.solid)
    .map((b) => ({
      minX: b.x - b.w / 2,
      maxX: b.x + b.w / 2,
      minY: b.y - b.h / 2,
      maxY: b.y + b.h / 2,
      minZ: b.z - b.d / 2,
      maxZ: b.z + b.d / 2,
    }));
}

/**
 * Where she stands to bowl on a rink: beside the mat, just off the kerb,
 * facing the pins. Standing squarely behind the mat put her between the
 * camera and the bowl, so her head covered the rink she was aiming down —
 * mini golf places her off the tee for exactly the same reason.
 */
export const STAND_OFF = 2.2;
export function matStand(i: number): { x: number; z: number; yaw: number } {
  const w = laneWorld(i);
  return { x: w.x - STAND_OFF, z: w.matZ + 0.5, yaw: 0 };
}

/** Where a player walks in: the middle of the gateway, out on the walkway side. */
export function gateSpot(): [number, number] {
  return [BOWLS.x + BOWLS.greenW / 2 + 1.6, BOWLS.z + BOWLS.gateDz];
}

export class BowlsWorld {
  group = new THREE.Group();
  private statics = new THREE.Group();
  private bowl: THREE.Mesh;
  private pinBodies: THREE.InstancedMesh;
  private pinCollars: THREE.InstancedMesh;
  private dots: THREE.InstancedMesh;
  private sign: THREE.Mesh | null = null;
  private colliders: AABB[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private b: Bowl = { x: 0, z: BOWLS.matDz, vx: 0, vz: 0 };
  private racks: Rack[] = [newRack(), newRack()];
  private rolled = 0;
  private held = 0;
  /** how far into the swing the arrow is; it only ticks while she is aiming */
  private sweepT = 0;
  /**
   * A new bowl needs a fresh press. Holding A through a roll used to charge
   * the next bowl the moment the rink cleared, so letting go a second later
   * delivered a shot she never aimed.
   */
  private armed = true;
  private restT = 0;
  private clock = 0;
  private lastNear: number | null = null;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v3 = new THREE.Vector3();
  private s3 = new THREE.Vector3(1, 1, 1);
  private cam: BowlsCam = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0 };

  constructor(
    private scene: THREE.Scene,
    private worldColliders: AABB[],
    /** puts her on a mat between turns */
    private place: (x: number, y: number, z: number, yaw: number) => void,
    grass?: GrassField | null,
  ) {
    // the green, the rinks and every piece of club furniture
    for (const b of clubBoxes()) {
      const m = new THREE.Mesh(box, lam(b.color, b.flat ? { flat: true } : undefined));
      m.scale.set(b.w, b.h, b.d);
      m.position.set(b.x, b.y, b.z);
      m.castShadow = !b.flat;
      m.receiveShadow = true;
      this.statics.add(m);
    }
    this.group.add(this.statics);

    // the club's name over the gateway
    try {
      this.sign = signBoard("Sloanie's Bowls Club", 4.0, 0.8);
      this.sign.position.set(BOWLS.x + BOWLS.greenW / 2, 3.45, BOWLS.z + BOWLS.gateDz);
      this.sign.rotation.y = Math.PI / 2;
      this.group.add(this.sign);
    } catch {
      this.sign = null;
    }

    // Bake the club down to a handful of draw calls. It is built after the
    // world merge (it owns its own meshes), so it has to merge itself.
    const merged = mergeStatic(this.statics);
    this.geometries = merged.geometries;

    // the bowl
    this.bowl = new THREE.Mesh(new THREE.SphereGeometry(BOWL_R, 16, 12), lam("#20242e", { flat: true, roughness: 0.35 }));
    this.bowl.castShadow = true;
    this.bowl.visible = false;
    this.group.add(this.bowl);

    // eighteen pins in two instanced meshes: one body, one red collar
    const count = BOWLS.laneDx.length * BOWLS.pins;
    const body = new THREE.CylinderGeometry(PIN_R * 0.42, PIN_R, PIN_H, 10);
    body.translate(0, PIN_H / 2, 0);
    this.pinBodies = new THREE.InstancedMesh(body, lam("#fdf6e6", { flat: true, roughness: 0.4 }), count);
    const collar = new THREE.CylinderGeometry(PIN_R * 0.68, PIN_R * 0.74, 0.09, 10);
    collar.translate(0, PIN_H * 0.72, 0);
    this.pinCollars = new THREE.InstancedMesh(collar, lam("#e8455f", { flat: true }), count);
    for (const im of [this.pinBodies, this.pinCollars]) {
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = false;
      this.group.add(im);
    }

    // the aim line
    this.dots = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.02, 10),
      lam("#fff6cf", { flat: true, emissive: "#ffd766", roughness: 0.4 }),
      DOTS,
    );
    this.dots.frustumCulled = false;
    this.dots.visible = false;
    this.group.add(this.dots);

    this.worldColliders.push(...(this.colliders = bowlsColliders()));
    mowGrass(grass, greenRect(0.4));
    scene.add(this.group);
    this.paintPins();
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
      if (m.isMesh && m.geometry !== box) m.geometry.dispose();
    });
    this.bowl.geometry.dispose();
    this.pinBodies.geometry.dispose();
    this.pinBodies.dispose();
    this.pinCollars.geometry.dispose();
    this.pinCollars.dispose();
    this.dots.geometry.dispose();
    this.dots.dispose();
    this.sign?.geometry.dispose();
    bowlsPose.active = false;
    resetBowlsInput();
  }

  get playing() {
    return bowlsPose.active;
  }

  /** Which mat she is standing on, if any. */
  near(x: number, y: number, z: number): number | null {
    if (bowlsPose.active || y > 1.4) return null;
    for (let i = 0; i < BOWLS.laneDx.length; i++) {
      const w = laneWorld(i);
      if (Math.hypot(x - w.x, z - w.matZ) < 2.8) return i;
    }
    return null;
  }

  /** Collect on a mat. Returns true when a game started. */
  tryInteract(x: number, y: number, z: number) {
    const i = this.near(x, y, z);
    if (i == null) return false;
    this.start(i);
    return true;
  }

  start(lane: number) {
    sfx.click();
    bowlsPose.active = true;
    bowlsPose.lane = lane;
    bowlsPose.turn = 0;
    bowlsPose.delivered = 0;
    bowlsPose.state = "sweep";
    bowlsPose.aim = 0;
    bowlsPose.power = 0;
    bowlsPose.turnPins = 0;
    bowlsPose.scores = [];
    bowlsPose.total = 0;
    this.held = 0;
    this.restT = 0;
    this.rolled = 0;
    this.sweepT = 0;
    // disarmed until she lets go, in case the Collect press shares a key
    this.armed = false;
    resetBowlsInput();
    for (const r of this.racks) resetRack(r);
    matBowl(this.b);
    this.bowl.visible = true;
    const st = useGame.getState();
    st.setBowlsPlaying(true);
    st.setBowlsNear(null);
    st.setEmmettNotice(`Turn 1 of ${BOWLS.turns} on the ${BOWLS.laneNames[lane]}. Stop the arrow straight, then bowl!`);
    this.stand();
  }

  private stand() {
    const s = matStand(bowlsPose.lane);
    this.place(s.x, BOWLS.laneTop + 0.05, s.z, s.yaw);
  }

  private rack() {
    return this.racks[bowlsPose.lane]!;
  }

  /** Stop playing, whether she quit or finished. */
  private end(card: boolean) {
    const st = useGame.getState();
    if (card) {
      const score = bowlsPose.total;
      const perfect = score >= MAX_SCORE;
      const best = st.bowlsBest;
      const isBest = best == null || score > best;
      const tickets = bowlsTickets(score, perfect);
      st.addTickets(tickets);
      if (isBest) st.setBowlsBest(score);
      st.setBowlsCard({
        turns: bowlsPose.scores.slice(),
        score,
        max: MAX_SCORE,
        tickets,
        best: best ?? null,
        isBest,
        perfect,
        line: bowlsLine(score),
      });
      sfx.win();
    }
    bowlsPose.active = false;
    bowlsPose.state = "sweep";
    this.bowl.visible = false;
    this.dots.visible = false;
    resetBowlsInput();
    st.setBowlsPlaying(false);
  }

  quit() {
    if (!bowlsPose.active) return;
    sfx.click();
    this.end(false);
    useGame.getState().setEmmettNotice("Come back to the mat any time!");
  }

  /** Begin the next turn, on the other rink. */
  private nextTurn() {
    const lane = (bowlsPose.lane + 1) % BOWLS.laneDx.length;
    resetRack(this.racks[lane]!);
    bowlsPose.lane = lane;
    bowlsPose.turn++;
    bowlsPose.delivered = 0;
    bowlsPose.turnPins = 0;
    bowlsPose.state = "sweep";
    bowlsPose.aim = 0;
    bowlsPose.power = 0;
    this.held = 0;
    this.rolled = 0;
    // a fresh turn starts with the arrow straight, swinging to her right
    this.sweepT = 0;
    matBowl(this.b);
    this.stand();
    useGame
      .getState()
      .setEmmettNotice(`Turn ${bowlsPose.turn + 1} of ${BOWLS.turns} on the ${BOWLS.laneNames[lane]}. Stop the arrow straight!`);
  }

  /** Every frame. */
  update(dt: number, her: { x: number; y: number; z: number }) {
    this.clock += dt;

    if (!bowlsPose.active) {
      const n = this.near(her.x, her.y, her.z);
      if (n !== this.lastNear) {
        this.lastNear = n;
        useGame.getState().setBowlsNear(n);
      }
      return;
    }
    this.lastNear = null;

    if (bowlsInput.quit) {
      bowlsInput.quit = false;
      this.quit();
      return;
    }

    // Behind a panel (a help card, the map, the pause screen) the arrow holds
    // still and nothing reads the button: the runtime keeps calling update so
    // the club stays drawn, so the hold has to happen here.
    const gs = useGame.getState();
    if (
      gs.phase !== "playing" ||
      gs.quiz != null ||
      gs.rps != null ||
      gs.carnival != null ||
      gs.questPanel != null ||
      gs.helpCard != null ||
      gs.journalOpen ||
      gs.mapOpen
    ) {
      return;
    }

    const rack = this.rack();

    if (bowlsPose.state === "sweep") {
      // the arrow swings on its own; a fresh press stops it where it is
      this.sweepT += dt;
      bowlsPose.aim = sweepAim(this.sweepT, sweepSpeed(bowlsPose.turn));
      if (!this.armed) {
        if (!bowlsInput.charge) this.armed = true;
      } else if (bowlsInput.charge) {
        this.armed = false;
        bowlsPose.state = "set";
        sfx.click();
      }
    } else if (bowlsPose.state === "set" || bowlsPose.state === "charge") {
      if (!this.armed) {
        // she is still holding the button that stopped the arrow
        if (!bowlsInput.charge) this.armed = true;
      } else if (bowlsInput.charge) {
        this.held += dt;
        bowlsPose.state = "charge";
        bowlsPose.power = Math.min(1, this.held / CHARGE_TIME);
      } else if (bowlsPose.state === "charge") {
        // a tap is a steady roll; a hold is whatever the meter reached
        const power = this.held < 0.13 ? TAP_POWER : bowlsPose.power;
        this.held = 0;
        bowlsPose.power = 0;
        bowlsPose.state = "roll";
        bowlsPose.delivered++;
        this.armed = false;
        this.rolled = 0;
        roll(this.b, power, bowlsPose.aim);
        sfx.jump();
      }
    } else if (bowlsPose.state === "roll") {
      const before = pinsDown(rack);
      const r = stepBowls(this.b, rack, dt, this.rolled);
      this.rolled += dt;
      const now = pinsDown(rack);
      if (now > before) sfx.collect();
      if (r === "stop") {
        bowlsPose.turnPins = now;
        const all = now >= BOWLS.pins;
        const last = bowlsPose.delivered >= BOWLS.perTurn;
        if (all || last) {
          bowlsPose.state = "tally";
          this.restT = 0;
          bowlsPose.scores.push(now);
          bowlsPose.total += now;
          sfx.correct();
          useGame
            .getState()
            .setEmmettNotice(
              all && bowlsPose.delivered === 1
                ? "ALL NINE with one bowl! Amazing!"
                : all
                  ? "All nine down! Brilliant!"
                  : `${now} pin${now === 1 ? "" : "s"} that turn.`,
            );
        } else {
          // the arrow picks the swing up from where she stopped it
          bowlsPose.state = "sweep";
          matBowl(this.b);
        }
      }
    } else if (bowlsPose.state === "tally") {
      this.restT += dt;
      if (this.restT > 1.8) {
        if (bowlsPose.turn + 1 >= BOWLS.turns) {
          this.end(true);
          return;
        }
        this.nextTurn();
      }
    }

    for (let i = 0; i < rack.length; i++) bowlsPose.standing[i] = !rack[i]!.down;

    // draw
    const [bx, bz] = toWorld(bowlsPose.lane, this.b.x, this.b.z);
    this.bowl.position.set(bx, BOWLS.laneTop + BOWL_R, bz);
    this.bowl.rotation.x -= (this.b.vz / BOWL_R) * dt * -1;
    this.bowl.rotation.z -= (this.b.vx / BOWL_R) * dt;
    this.paintPins();

    const aiming = bowlsPose.state === "sweep" || bowlsPose.state === "set" || bowlsPose.state === "charge";
    this.dots.visible = aiming;
    if (aiming) {
      const d = aimDir(bowlsPose.aim, { x: 0, z: 0 });
      // while it swings the line is long, so she can see where it points;
      // once it is stopped the length becomes the power meter
      const reach = bowlsPose.state === "sweep" ? 7.5 : 2.0 + (bowlsPose.state === "charge" ? bowlsPose.power : 0.4) * 5.5;
      for (let i = 0; i < DOTS; i++) {
        const s = 0.5 + (i * reach) / DOTS;
        const px = this.b.x + d.x * s;
        const pz = this.b.z + d.z * s;
        const inside = Math.abs(px) < BOWLS.halfW && Math.abs(pz) < BOWLS.halfD;
        const k = inside ? 1 - i / (DOTS * 1.7) : 0;
        const [wx, wz] = toWorld(bowlsPose.lane, px, pz);
        this.m4.makeScale(k, 1, k);
        this.m4.setPosition(wx, BOWLS.laneTop + 0.04, wz);
        this.dots.setMatrixAt(i, this.m4);
      }
      this.dots.instanceMatrix.needsUpdate = true;
    }
  }

  /** Both racks, standing or fallen, into the two instanced meshes. */
  private paintPins() {
    let n = 0;
    for (let l = 0; l < this.racks.length; l++) {
      const rack = this.racks[l]!;
      for (const p of rack) {
        const [wx, wz] = toWorld(l, p.x, p.z);
        if (p.down) {
          // lying flat, pointing the way it was knocked
          this.q.setFromAxisAngle(this.v3.set(Math.cos(p.angle), 0, -Math.sin(p.angle)), Math.PI / 2);
          this.v3.set(wx, BOWLS.laneTop + PIN_R, wz);
        } else {
          this.q.identity();
          this.v3.set(wx, BOWLS.laneTop, wz);
        }
        this.m4.compose(this.v3, this.q, this.s3);
        this.pinBodies.setMatrixAt(n, this.m4);
        this.pinCollars.setMatrixAt(n, this.m4);
        n++;
      }
    }
    this.pinBodies.instanceMatrix.needsUpdate = true;
    this.pinCollars.instanceMatrix.needsUpdate = true;
  }

  /** Where the camera watches from while she bowls (see bowlsCamera). */
  camera(pos: THREE.Vector3, target: THREE.Vector3) {
    const c = bowlsCamera(bowlsPose.lane, this.b.z, this.cam);
    pos.set(c.px, c.py, c.pz);
    target.set(c.tx, c.ty, c.tz);
  }
}
