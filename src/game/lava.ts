import * as THREE from "three";
import { sfx } from "./audio";
import { beveledBox } from "./beveled";
import { makeAccessory } from "./accessories";
import type { AABB, Capsule } from "./collision";
import { mergeStatic } from "./merge";
import { lam, signBoard } from "./meshes";
import { makeBubble } from "./quest-mesh";
import { useGame } from "./store";
import { PLAYER_W } from "./tuning";

/**
 * The Floor is Lava course.
 *
 * A long jumping course out on the big lawn south of the campground: five
 * sections that snake west, back east and west again over a lava lake, from a
 * start deck by the campground path to a prize podium at the far end. It gets
 * harder as it goes: wide stones, then a bridge and narrow beams, then sliding
 * rafts and a lift, then stones that sink, then a precision finish with a
 * plank that gives way under her.
 *
 * Five rules shape every number in here.
 *
 * 1. **Nothing that is solid ever rotates.** Colliders are axis-aligned boxes
 *    that ignore rotation (`colliders.ts`), so a mesh that tilts and a box that
 *    does not are a lie: the first version of this course had "rolling logs"
 *    whose visible surface swung 0.73m away from the box she was standing on,
 *    and they played as planks you fall through. Everything solid here moves by
 *    translation only — sliding, rising, orbiting on an arm, dropping away —
 *    and its box is recomputed from the same function that positions its mesh,
 *    every physics step. `tools/lava.ts` checks the two agree at 200 phases of
 *    every moving piece.
 *
 * 2. **The lava never hurts her, but falling in costs the run.** The lava has
 *    no collider at all; the moment she is over the pool below `FALL_Y` she is
 *    put back on the start deck facing the course, with a friendly line and a
 *    sound. Nothing is damaged and nothing else is lost — but the attempt is
 *    over, which is what makes the course worth doing. The clock restarts with
 *    her; only a finished crossing sets a best time.
 *
 * 3. **Every gap is measured against her real jump, per section.** She peaks at
 *    2.73m and carries 6.23m at walking speed (`jumpHeight`/`jumpReach` in
 *    tuning.ts). Section 1 uses 2.2m gaps (2.8x her reach), and it tightens to
 *    3.6m (1.7x) in the last section. The tool measures all of them and prints
 *    the take-off window each jump allows, which is the honest measure of how
 *    hard a jump is.
 *
 * 4. **A landing piece is long enough to catch a full-speed jump.** A child who
 *    holds the stick forward and taps jump at the edge flies the whole 6.23m.
 *    In the early sections the pads are long enough that this lands on them; in
 *    the last section they deliberately are not, and she has to jump early.
 *    The tool reports which is which rather than assuming.
 *
 * 5. **A collider always looks like what it is.** Full-height pieces are drawn
 *    as columns from the ground; the bridge, the rafts and the lift are drawn
 *    as slabs exactly as thick as their boxes, so an undershot jump passes
 *    under them into the lava instead of hitting an invisible wall.
 *
 * Like `HomeWorld`, this builds its own meshes and pushes its own colliders
 * into the world's collider list, so nothing in levels.ts knows it exists.
 */

const TAU = Math.PI * 2;

/* ------------------------------------------------------------ the heights */

/** Top of the lava slab. Taller than a grass blade, so none pokes through. */
export const LAVA_SURFACE = 0.7;
/**
 * Below this, over the lava, she is falling. The lowest thing she can stand on
 * is the lower tier at 1.9m, so there is a 0.45m band she can only be in on the
 * way down, and a further 0.75m of clear air under that before the lava.
 */
export const FALL_Y = 1.45;
/** The two tiers the course runs on. */
const LOW = 1.9;
const MID = 3.0;
/**
 * The rock kerb round the pool. Taller than the 0.62m step-up so she cannot
 * stroll in over it, lower than FALL_Y so it is not a ledge to walk round the
 * course on.
 */
const RIM_TOP = 1.3;
const RIM_T = 0.9;

const BUBBLES = 22;

const FALL_LINES = [
  "Whoops! Hot floor! Start again.",
  "Splat! Back to the start. You'll get it!",
  "Too hot! Have another go.",
  "Into the lava! Try again from the start.",
];

/* -------------------------------------------------------------- the pieces */

export type Motion =
  | { kind: "static" }
  /** slides side to side across the route */
  | { kind: "slide"; travel: number; period: number; phase: number }
  /** rises and falls on the spot */
  | { kind: "lift"; travel: number; period: number; phase: number }
  /** rides round a circle on an arm, carrying her from one side to the other */
  | { kind: "orbit"; r: number; period: number; phase: number }
  /** sinks out of reach and comes back up */
  | { kind: "sink"; drop: number; period: number; phase: number }
  /** gives way a moment after she stands on it, then comes back */
  | { kind: "give" };

export type Kind = "deck" | "pad" | "beam" | "bridge" | "podium";

export type Piece = {
  id: string;
  kind: Kind;
  index: number;
  section: number;
  /** resting centre and top */
  cx: number;
  cz: number;
  /** size in x and in z */
  w: number;
  d: number;
  top: number;
  /** the underside of the solid: 0 for a column, higher for a slab */
  base: number;
  /** clear air along the route between this piece and the one before it */
  gap: number;
  /** which way the route runs across this piece */
  dir: Dir;
  motion: Motion;
};

export type Dir = "E" | "W" | "N" | "S";
const DX: Record<Dir, number> = { E: 1, W: -1, N: 0, S: 0 };
const DZ: Record<Dir, number> = { E: 0, W: 0, N: -1, S: 1 };
/** across the route, to the right of the way she is going */
const AX: Record<Dir, number> = { E: 0, W: 0, N: -1, S: 1 };
const AZ: Record<Dir, number> = { E: 1, W: -1, N: 0, S: 0 };

type PlanStep = {
  id: string;
  kind?: Kind;
  /** size along the route, and across it */
  len: number;
  wide: number;
  /** clear air along the route before this piece */
  gap?: number;
  /** step the route sideways by this much before placing it (a zig-zag) */
  off?: number;
  top?: number;
  /** turn before placing it */
  turn?: Dir;
  motion?: Motion;
  section?: number;
  /** drawn as a slab this thick instead of a column from the ground */
  slab?: number;
};

/**
 * The route, piece by piece, as a cursor that walks and turns. `gap` is the
 * clear air she jumps; `len` is how far the piece runs along the route, so
 * these numbers are literally the gaps and the landing room the tool measures.
 *
 * The difficulty curve is in the gaps and in the landing length: section 1 is
 * 2.2m gaps onto 5m pads; section 5 is 3.6m gaps onto 2.6m pads.
 */
let START: { x: number; z: number; dir: Dir } = { x: 107.5, z: 124, dir: "W" };
/** Where the course starts when a park does not say otherwise: park 1's. */
const START_HOME: { x: number; z: number; dir: Dir } = { ...START };

const PLAN: PlanStep[] = [
  // ---- the start deck, on the lawn at the east end ----------------------
  { id: "deck", kind: "deck", len: 8.5, wide: 9.0, top: MID, section: 0 },

  // ---- 1. First Hops: wide stones, gentle gaps, nothing moving ----------
  { id: "s1a", len: 4.6, wide: 5.0, gap: 2.0, top: MID + 0.1, section: 1 },
  { id: "s1b", len: 4.6, wide: 5.0, gap: 2.2, top: MID + 0.2, section: 1 },
  { id: "s1c", len: 4.6, wide: 5.0, gap: 2.2, off: 1.6, top: MID + 0.1, section: 1 },
  { id: "s1d", len: 4.6, wide: 5.0, gap: 2.2, off: -1.6, top: MID + 0.2, section: 1 },
  { id: "halfway", len: 5.2, wide: 6.0, gap: 2.2, top: MID + 0.2, section: 1 },

  // ---- 2. The Bridge and the Beams: narrow, static, a broken run-up ------
  // one flat deck with one collider: the planks are drawn on it, never tilted
  { id: "bridge", kind: "bridge", len: 7.5, wide: 2.6, gap: 2.4, top: MID + 0.2, section: 2, slab: 0.32 },
  { id: "beam1", kind: "beam", len: 5.5, wide: 1.5, gap: 2.6, off: 1.2, top: MID + 0.3, section: 2, slab: 0.5 },
  { id: "beam2", kind: "beam", len: 5.5, wide: 1.5, gap: 2.8, off: -2.4, top: MID + 0.4, section: 2, slab: 0.5 },
  { id: "corner", len: 4.8, wide: 5.0, gap: 2.6, off: 1.2, top: MID + 0.3, section: 2 },

  // ---- down to the lower tier and round to the way back ------------------
  { id: "dropA", len: 4.4, wide: 4.4, gap: 2.4, top: LOW + 0.4, turn: "S", section: 3 },
  { id: "dropB", len: 4.0, wide: 4.4, gap: 2.4, top: LOW, section: 3 },

  // ---- 3. The Movers: wait for it, ride it, and ride the lift back up ----
  { id: "raftA", len: 4.6, wide: 4.6, gap: 2.8, top: LOW, turn: "E", section: 3, slab: 1.0,
    motion: { kind: "slide", travel: 3.4, period: 6.4, phase: 0 } },
  { id: "raftB", len: 4.6, wide: 4.6, gap: 2.8, top: LOW + 0.1, section: 3, slab: 1.0,
    motion: { kind: "slide", travel: 3.4, period: 6.4, phase: Math.PI } },
  { id: "arm", len: 4.0, wide: 4.0, gap: 2.8, top: LOW + 0.2, section: 3, slab: 1.0,
    motion: { kind: "orbit", r: 3.4, period: 10.5, phase: 0 } },
  { id: "lift", len: 4.6, wide: 4.6, gap: 2.8, top: LOW + 0.1, section: 3, slab: 1.0,
    motion: { kind: "lift", travel: 1.3, period: 7.6, phase: 0 } },
  { id: "ledge", len: 4.8, wide: 5.2, gap: 2.6, top: MID + 0.3, section: 3 },

  // ---- 4. The Sinking Stones: cross while they are up -------------------
  // Each sinker has solid ground on both sides on purpose. Two in a row meant
  // she had to arrive on the first one inside a window that let her leave it
  // again before it went, and that window came out at a fifth of a second.
  // Isolated, each one is a clean "wait for it to come up, hop on, hop off".
  { id: "sink1", len: 3.2, wide: 3.4, gap: 2.8, top: MID + 0.3, section: 4, slab: 1.1,
    motion: { kind: "sink", drop: 2.4, period: 5.6, phase: 0 } },
  { id: "rest", len: 5.0, wide: 5.2, gap: 2.8, top: MID + 0.3, section: 4 },
  { id: "turnC", len: 4.0, wide: 4.6, gap: 2.6, turn: "S", top: MID + 0.3, section: 4 },
  { id: "sink2", len: 3.2, wide: 3.4, gap: 2.8, off: 1.4, turn: "W", top: MID + 0.3, section: 4, slab: 1.1,
    motion: { kind: "sink", drop: 2.4, period: 5.6, phase: 2.6 } },
  { id: "rest2", len: 5.0, wide: 5.2, gap: 2.8, off: -1.4, top: MID + 0.3, section: 4 },

  // ---- 5. The Last Leap: small pads, long gaps, a plank that gives way ---
  { id: "leapA", len: 3.0, wide: 3.2, gap: 3.2, top: MID + 0.3, section: 5 },
  { id: "leapB", len: 2.8, wide: 3.2, gap: 3.4, off: -1.9, top: MID + 0.4, section: 5 },
  { id: "plank", len: 3.4, wide: 2.2, gap: 3.4, off: 1.9, top: MID + 0.4, section: 5, slab: 0.4,
    motion: { kind: "give" } },
  { id: "leapC", len: 2.8, wide: 3.2, gap: 3.4, top: MID + 0.4, section: 5 },
  { id: "podium", kind: "podium", len: 6.4, wide: 6.6, gap: 3.6, top: MID + 0.5, section: 5 },
];

export const SECTION_NAMES = [
  "the start",
  "First Hops",
  "The Bridge and the Beams",
  "The Movers",
  "The Sinking Stones",
  "The Last Leap",
];

/** How far the give-way plank falls, and its timings. */
const GIVE_ARM = 0.75;
const GIVE_FALL = 6;
const GIVE_BACK = 3.2;

/**
 * Walk the plan from a start point into absolute pieces. Everything below
 * hangs off the result, so moving the course is a matter of walking it again
 * (setLavaStart), not of offsetting a hundred numbers at use.
 */
function buildPieces(start: { x: number; z: number; dir: Dir }): Piece[] {
  const out: Piece[] = [];
  let { x, z, dir } = start;
  let section = 0;
  PLAN.forEach((p, index) => {
    if (p.turn) {
      // turn about the piece already placed: the new lane is centred on it and
      // starts at its far edge in the new direction
      const prev = out[out.length - 1]!;
      dir = p.turn;
      x = prev.cx + (DX[dir] * prev.w) / 2;
      z = prev.cz + (DZ[dir] * prev.d) / 2;
    }
    if (p.off) {
      x += AX[dir] * p.off;
      z += AZ[dir] * p.off;
    }
    const gap = p.gap ?? 0;
    x += DX[dir] * gap;
    z += DZ[dir] * gap;
    const cx = x + (DX[dir] * p.len) / 2;
    const cz = z + (DZ[dir] * p.len) / 2;
    x += DX[dir] * p.len;
    z += DZ[dir] * p.len;
    const along = dir === "E" || dir === "W";
    const top = p.top ?? MID;
    section = p.section ?? section;
    out.push({
      id: p.id,
      kind: p.kind ?? "pad",
      index,
      section,
      cx,
      cz,
      w: along ? p.len : p.wide,
      d: along ? p.wide : p.len,
      top,
      base: p.slab ? top - p.slab : 0,
      gap,
      dir,
      motion: p.motion ?? { kind: "static" },
    });
    // an orbiting platform hands her off at the far side of its circle
    if (p.motion?.kind === "orbit") {
      x += DX[dir] * p.motion.r * 2;
      z += DZ[dir] * p.motion.r * 2;
    }
  });
  return out;
}

export let PIECES: Piece[] = buildPieces(START);

export function piece(id: string): Piece {
  return PIECES.find((p) => p.id === id)!;
}

export let DECK = piece("deck");
export let PODIUM = piece("podium");
let BRIDGE = piece("bridge");

/** The lava lake: everything the route crosses, with a margin all round. */
function buildPool() {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of PIECES) {
    if (p === DECK) continue;
    const reach = p.motion.kind === "slide" ? p.motion.travel : p.motion.kind === "orbit" ? p.motion.r : 0;
    // a one-sided slide only ever goes one way, but the lake may as well cover
    // both: it is cheap and it keeps the shape of the lake simple
    minX = Math.min(minX, p.cx - p.w / 2 - reach);
    maxX = Math.max(maxX, p.cx + p.w / 2 + reach);
    minZ = Math.min(minZ, p.cz - p.d / 2 - reach);
    maxZ = Math.max(maxZ, p.cz + p.d / 2 + reach);
  }
  // a margin of lava all round the route, kept tight: the lawn this sits on
  // is 86m x 34m and the course uses nearly all of it
  return { minX: minX - 1.8, maxX: DECK.cx - DECK.w / 2, minZ: minZ - 1.8, maxZ: maxZ + 1.8 };
}

export let LAVA_POOL = buildPool();

/** The whole site, for anything that wants to keep clear of it. */
export function lavaFootprint(pad = 0) {
  const flight = stepCount(DECK.top) * 0.8;
  const exit = PODIUM.cx - PODIUM.w / 2 - PODIUM_EXIT;
  return {
    minX: Math.min(LAVA_POOL.minX - RIM_T, exit - 1) - pad,
    maxX: DECK.cx + DECK.w / 2 + flight + pad,
    minZ: LAVA_POOL.minZ - RIM_T - pad,
    maxZ: LAVA_POOL.maxZ + RIM_T + pad,
  };
}

/** Where she walks in: the lawn at the foot of the steps up to the deck. */
export let LAVA_START: [number, number] = [DECK.cx + DECK.w / 2 + 3.4, DECK.cz];

/* ------------------------------------------------------- where things are */

/**
 * The live state of the course: the clock every timed motion reads, and the
 * give-way plank's own little state machine. Pure, so `tools/lava.ts` runs
 * exactly what the game runs.
 */
export type LavaState = {
  t: number;
  /** seconds she has been standing on the give-way plank */
  held: number;
  /** seconds since it gave way; -1 while it is still up */
  away: number;
};

export function newLavaState(): LavaState {
  return { t: 0, held: 0, away: -1 };
}

/** Advance the clock and the give-way plank. `on` is the piece she is on. */
export function stepLavaState(s: LavaState, dt: number, on: number | null) {
  s.t += dt;
  const plank = piece("plank");
  if (s.away >= 0) {
    s.away += dt;
    if (s.away > GIVE_BACK) {
      s.away = -1;
      s.held = 0;
    }
    return;
  }
  if (on === plank.index) {
    s.held += dt;
    if (s.held > GIVE_ARM) s.away = 0;
  } else {
    s.held = Math.max(0, s.held - dt * 0.6);
  }
}

/** How far a give-way plank has dropped, given its state. */
function giveDrop(s: LavaState) {
  if (s.away < 0) return 0;
  // it lets go quickly and stays gone until it swings back up
  return Math.min(GIVE_FALL, s.away * s.away * 26);
}

/** Where a piece is, and how high its top is, right now. */
export function pieceAt(p: Piece, s: LavaState): { x: number; z: number; top: number } {
  const m = p.motion;
  if (m.kind === "static") return { x: p.cx, z: p.cz, top: p.top };
  if (m.kind === "slide") {
    // one-sided: it rests on the line she runs along and slides away from it
    // and back. Two-sided travel would have swung the rafts under the podium
    // on the lane behind them, and a raft has to have its own empty water.
    const o = -m.travel * 0.5 * (1 - Math.cos((s.t / m.period) * TAU + m.phase));
    return { x: p.cx + AX[p.dir] * o, z: p.cz + AZ[p.dir] * o, top: p.top };
  }
  if (m.kind === "lift") {
    const o = m.travel * 0.5 * (1 - Math.cos((s.t / m.period) * TAU + m.phase));
    return { x: p.cx, z: p.cz, top: p.top + o };
  }
  if (m.kind === "orbit") {
    // the pivot sits r along the route from its resting place, so at angle 0 it
    // is where the plan put it and at angle PI it is 2r further on
    const th = (s.t / m.period) * TAU + m.phase;
    const px = p.cx + DX[p.dir] * m.r;
    const pz = p.cz + DZ[p.dir] * m.r;
    return {
      x: px - DX[p.dir] * m.r * Math.cos(th) + AX[p.dir] * m.r * Math.sin(th),
      z: pz - DZ[p.dir] * m.r * Math.cos(th) + AZ[p.dir] * m.r * Math.sin(th),
      top: p.top,
    };
  }
  if (m.kind === "sink") {
    return { x: p.cx, z: p.cz, top: p.top - m.drop * sinkFall(s.t, m.period, m.phase) };
  }
  return { x: p.cx, z: p.cz, top: p.top - giveDrop(s) };
}

/**
 * A sinking stone: 0 while it is up, 1 while it is down, with a quick slide in
 * between.
 *
 * It is up for more than three quarters of the cycle, and consecutive stones
 * are only half a second apart in phase. Both numbers matter: at 60% up and a
 * two-second stagger, the moment when one stone is up AND the next is still up
 * a jump later lasted a fifth of a second, which is not a rhythm, it is a
 * lottery. As set, that moment is 2.4 seconds long out of every 5.6.
 */
export function sinkFall(t: number, period: number, phase: number) {
  const u = (((t / period + phase / TAU) % 1) + 1) % 1;
  const UP = 0.78;
  const EDGE = 0.09;
  if (u < UP - EDGE) return 0;
  if (u < UP) return (u - (UP - EDGE)) / EDGE;
  if (u < 1 - EDGE) return 1;
  return 1 - (u - (1 - EDGE)) / EDGE;
}

/** The solid box a piece presents right now. */
export function pieceBox(p: Piece, s: LavaState): AABB {
  const a = pieceAt(p, s);
  const thick = p.top - p.base;
  return {
    minX: a.x - p.w / 2,
    maxX: a.x + p.w / 2,
    minY: p.base === 0 ? 0 : a.top - thick,
    maxY: a.top,
    minZ: a.z - p.d / 2,
    maxZ: a.z + p.d / 2,
  };
}

/** Is this piece somewhere she could be standing right now? */
export function pieceUsable(p: Piece, s: LavaState) {
  return pieceAt(p, s).top > FALL_Y;
}

/* ----------------------------------------------------- steps on and off */

export type Step = { cx: number; cz: number; w: number; d: number; top: number };

/** Enough steps that every rise is well under the 0.62m step-up. */
export const stepCount = (top: number) => Math.ceil(top / 0.5);

/**
 * A flight of steps running away from a piece along `sign` * its own direction:
 * -1 for the deck (back the way she came in, onto the lawn) and +1 for the
 * podium (keep walking and you walk down off it).
 */
function stairs(p: Piece, sign: number, wide: number, tread: number): Step[] {
  const out: Step[] = [];
  const n = stepCount(p.top);
  const dx = DX[p.dir] * sign;
  const dz = DZ[p.dir] * sign;
  const x0 = p.cx + (dx * p.w) / 2;
  const z0 = p.cz + (dz * p.d) / 2;
  for (let i = 0; i < n; i++) {
    const o = (n - 1 - i) * tread + tread / 2;
    out.push({
      cx: x0 + dx * o,
      cz: z0 + dz * o,
      w: dx ? tread : wide,
      d: dz ? tread : wide,
      top: ((i + 1) / n) * p.top,
    });
  }
  return out;
}

/**
 * The steps up to the start deck. They are as wide as the deck, so its whole
 * back face is stair: there is no lip beside them to step off backwards, which
 * a seven-year-old turning round on the spot would find within a minute.
 */
export function deckSteps(): Step[] {
  return stairs(DECK, -1, DECK.d, 0.8);
}

/**
 * The winner's stair: a broad flight off the podium's far side, carrying on
 * the way the course was already going, out over the kerb and down onto the
 * bank.
 *
 * The podium stands out in the lake, and for a while the way down was to hop
 * off and be caught by the lava. That is the right answer everywhere else on
 * the course and the wrong one here: being told "Whoops! Hot floor! Start
 * again" one second after winning takes the win straight back off her. The
 * treads are long because the stair has to reach the bank, and every riser is
 * still half a metre.
 */
const PODIUM_EXIT = 10.6;

export function podiumSteps(): Step[] {
  return stairs(PODIUM, 1, PODIUM.d, PODIUM_EXIT / stepCount(PODIUM.top));
}

/**
 * Rock parapets along the faces of the deck and the podium that are not a way
 * on or off. They are 0.95m: too tall to walk over (the step-up is 0.62m) and
 * low enough to see the course over and to jump if she really wants to. Every
 * face of both is now a stair, a parapet, or — on the deck's front face only —
 * the course itself, which is meant to be a drop and looks like one.
 */
const PARAPET_H = 0.95;
const PARAPET_T = 0.45;

export type Rail = {
  cx: number;
  cz: number;
  w: number;
  d: number;
  top: number;
  base: number;
  /** the surface it guards */
  over: number;
  /** a kerb is low enough to step over; a rail is not */
  kerb?: boolean;
  post?: boolean;
};

/** The kerb on the podium's arrival face: under the 0.62m step-up on purpose. */
const KERB_H = 0.4;
const KERB_T = 0.45;

/**
 * Rails sit just OUTSIDE the surface they guard, not on top of it. On top,
 * the podium's near rail caught her at the lip of the jump that wins the
 * course and threw her off; outside, the whole landing is still hers and the
 * rail only ever stops her walking.
 */
export function parapets(): Rail[] {
  const out: Rail[] = [];
  const wall = (cx: number, cz: number, w: number, d: number, over: number, ux: number, uz: number) => {
    const along = ux !== 0;
    out.push({
      cx: cx + (ux * (w + PARAPET_T)) / 2,
      cz: cz + (uz * (d + PARAPET_T)) / 2,
      w: along ? PARAPET_T : w + PARAPET_T * 2,
      d: along ? d + PARAPET_T * 2 : PARAPET_T,
      top: over + PARAPET_H,
      base: Math.max(0, over - 0.35),
      over,
    });
  };
  const face = (p: Piece, ux: number, uz: number) => wall(p.cx, p.cz, p.w, p.d, p.top, ux, uz);
  // the deck: its back is all stair and its front is the course, so the two
  // sides are what needs a rail
  const dAx = DX[DECK.dir];
  const dAz = DZ[DECK.dir];
  face(DECK, dAz, dAx);
  face(DECK, -dAz, -dAx);
  // the podium: every face but the stair off the far side, including the one
  // she flies in over — a 0.95m rail against a 2.7m jump
  const pAx = DX[PODIUM.dir];
  const pAz = DZ[PODIUM.dir];
  face(PODIUM, pAz, pAx);
  face(PODIUM, -pAz, -pAx);
  // The face she flies in over cannot carry a rail: a rail there is exactly
  // tall enough to catch the lip of the jump that wins the course and throw
  // her back off it. It gets a kerb she can step over and a rock post at each
  // corner instead, so the edge reads as an edge without ever blocking a
  // landing. This is the one way off either platform that is a drop, and it is
  // the way she came in, back down the course.
  const ex = -pAx;
  const ez = -pAz;
  out.push({
    cx: PODIUM.cx + (ex * (PODIUM.w + KERB_T)) / 2,
    cz: PODIUM.cz + (ez * (PODIUM.d + KERB_T)) / 2,
    w: ex ? KERB_T : PODIUM.w,
    d: ez ? PODIUM.d : KERB_T,
    top: PODIUM.top + KERB_H,
    base: PODIUM.top - 0.35,
    over: PODIUM.top,
    kerb: true,
  });
  for (const side of [-1, 1]) {
    out.push({
      cx: PODIUM.cx + (ex * (PODIUM.w + KERB_T)) / 2 + (ez ? (side * PODIUM.w) / 2 : 0),
      cz: PODIUM.cz + (ez * (PODIUM.d + KERB_T)) / 2 + (ex ? (side * PODIUM.d) / 2 : 0),
      w: 0.6,
      d: 0.6,
      top: PODIUM.top + 1.5,
      base: PODIUM.top - 0.35,
      over: PODIUM.top,
      post: true,
    });
  }
  // and a rail down both sides of every stair, tread by tread. Without these,
  // walking out diagonally slid her along a parapet, onto the stair, and
  // straight off the side of it into the lava.
  for (const [owner, steps] of [
    [DECK, deckSteps()],
    [PODIUM, podiumSteps()],
  ] as [Piece, Step[]][]) {
    const acrossZ = DX[owner.dir] !== 0;
    for (const st of steps) {
      // the tread that lands on the grass is left open, so the stair actually
      // joins the lawn instead of being walled off from it; every tread still
      // out over the lake keeps its rail
      const overLake =
        st.cx + st.w / 2 > LAVA_POOL.minX &&
        st.cx - st.w / 2 < LAVA_POOL.maxX &&
        st.cz + st.d / 2 > LAVA_POOL.minZ &&
        st.cz - st.d / 2 < LAVA_POOL.maxZ;
      if (!overLake && st.top < 1.2) continue;
      for (const side of [-1, 1]) {
        wall(st.cx, st.cz, st.w, st.d, st.top, acrossZ ? 0 : side, acrossZ ? side : 0);
      }
    }
  }
  return out;
}

/* ---------------------------------------------------------------- the rim */

/**
 * The rock kerb round the pool, as segments, with the ways in and out left
 * out. Its top is under FALL_Y, so landing on it counts as falling in rather
 * than as somewhere to perch and walk round the course.
 */
export function rimSegments(): { cx: number; cz: number; w: number; d: number }[] {
  const p = LAVA_POOL;
  const out: { cx: number; cz: number; w: number; d: number }[] = [];
  const gates = [DECK, PODIUM];
  const holes = (along: "x" | "z", at: number) =>
    gates
      .filter((g) => Math.abs((along === "x" ? g.cz : g.cx) - at) < 30)
      .map((g) =>
        along === "x"
          ? ([g.cx - g.w / 2 - 0.4, g.cx + g.w / 2 + 0.4] as [number, number])
          : ([g.cz - g.d / 2 - 0.4, g.cz + g.d / 2 + 0.4] as [number, number]),
      );
  const run = (from: number, to: number, cut: [number, number][], place: (a: number, b: number) => void) => {
    let cuts = cut.filter((c) => c[1] > from && c[0] < to).sort((a, b) => a[0] - b[0]);
    let cur = from;
    for (const [a, b] of cuts) {
      if (a > cur) place(cur, Math.min(a, to));
      cur = Math.max(cur, b);
    }
    if (cur < to) place(cur, to);
  };
  const seg = (a: number, b: number, fixed: number, along: "x" | "z") => {
    const n = Math.max(1, Math.ceil((b - a) / 9));
    for (let i = 0; i < n; i++) {
      const s = a + ((b - a) * i) / n;
      const e = a + ((b - a) * (i + 1)) / n;
      if (along === "x") out.push({ cx: (s + e) / 2, cz: fixed, w: e - s, d: RIM_T });
      else out.push({ cx: fixed, cz: (s + e) / 2, w: RIM_T, d: e - s });
    }
  };
  const oMinX = p.minX - RIM_T;
  const oMaxX = p.maxX + RIM_T;
  for (const cz of [p.minZ - RIM_T / 2, p.maxZ + RIM_T / 2]) {
    run(oMinX, oMaxX, holes("x", cz), (a, b) => seg(a, b, cz, "x"));
  }
  for (const cx of [p.minX - RIM_T / 2, p.maxX + RIM_T / 2]) {
    run(p.minZ, p.maxZ, holes("z", cx), (a, b) => seg(a, b, cx, "z"));
  }
  return out;
}

/* ---------------------------------------------------------- the colliders */

function boxOf(cx: number, cz: number, w: number, d: number, top: number, base = 0): AABB {
  return { minX: cx - w / 2, maxX: cx + w / 2, minY: base, maxY: top, minZ: cz - d / 2, maxZ: cz + d / 2 };
}

/**
 * Everything solid on the site right now, with the moving pieces first so the
 * world class can hold on to those boxes and slide them in place rather than
 * rebuilding the list every physics step.
 */
export function lavaColliders(s: LavaState): AABB[] {
  const out: AABB[] = [];
  for (const p of PIECES) if (p.motion.kind !== "static") out.push(pieceBox(p, s));
  for (const p of PIECES) if (p.motion.kind === "static") out.push(pieceBox(p, s));
  for (const st of [...deckSteps(), ...podiumSteps()]) out.push(boxOf(st.cx, st.cz, st.w, st.d, st.top));
  for (const w of parapets()) out.push(boxOf(w.cx, w.cz, w.w, w.d, w.top, w.base));
  for (const r of rimSegments()) out.push(boxOf(r.cx, r.cz, r.w, r.d, RIM_TOP));
  return out;
}

export let MOVING = PIECES.filter((p) => p.motion.kind !== "static");

/**
 * Put the course on another park's lawn. Everything the route knows is
 * absolute, so the whole plan is walked again from the new start and each
 * derived table replaced; importers see the new values because these are
 * module bindings, not copies. Call it before anything builds the course.
 */
export function setLavaStart(s: { x: number; z: number; dir: Dir } = START_HOME) {
  START = { ...s };
  PIECES = buildPieces(START);
  DECK = piece("deck");
  PODIUM = piece("podium");
  BRIDGE = piece("bridge");
  LAVA_POOL = buildPool();
  LAVA_START = [DECK.cx + DECK.w / 2 + 3.4, DECK.cz];
  MOVING = PIECES.filter((p) => p.motion.kind !== "static");
}

/** Is (x, z) out over the lava? The kerb counts; the deck and podium do not. */
export function overLava(x: number, z: number) {
  const p = LAVA_POOL;
  if (x <= p.minX - RIM_T || x >= p.maxX + RIM_T || z <= p.minZ - RIM_T || z >= p.maxZ + RIM_T) return false;
  for (const g of [DECK, PODIUM]) {
    if (Math.abs(x - g.cx) < g.w / 2 + 0.05 && Math.abs(z - g.cz) < g.d / 2 + 0.05) return false;
  }
  for (const st of [...deckSteps(), ...podiumSteps()]) {
    if (Math.abs(x - st.cx) < st.w / 2 + 0.05 && Math.abs(z - st.cz) < st.d / 2 + 0.05) return false;
  }
  return true;
}

/** The piece she is standing on, if any. */
export function standingOn(x: number, y: number, z: number, s: LavaState): number | null {
  for (const p of PIECES) {
    const a = pieceAt(p, s);
    if (Math.abs(y - a.top) > 0.18) continue;
    // her capsule's own half width, because collision.ts calls her grounded
    // whenever any part of that footprint is over the box
    if (Math.abs(x - a.x) > p.w / 2 + PLAYER_W || Math.abs(z - a.z) > p.d / 2 + PLAYER_W) continue;
    return p.index;
  }
  return null;
}

/** Where a fall puts her: on the start deck, facing the first stone. */
export function startSpot(): { x: number; y: number; z: number; yaw: number } {
  const first = PIECES[1]!;
  return {
    x: DECK.cx + DECK.w * 0.26,
    y: DECK.top + 0.08,
    z: DECK.cz,
    yaw: Math.atan2(-(first.cx - DECK.cx), -(first.cz - DECK.cz)),
  };
}

/* ---------------------------------------------------------------- scoring */

/** Tickets for reaching the podium: a big first prize, a smaller one after. */
export function lavaTickets(first: boolean) {
  return first ? 20 : 6;
}

export function lavaLine(seconds: number, best: number | null) {
  const t = `${seconds.toFixed(1)}s`;
  if (best == null) return `You crossed the whole lava course in ${t}!`;
  if (seconds < best) return `New best time: ${t}!`;
  return `Across in ${t}. Your best is ${best.toFixed(1)}s.`;
}

/* -------------------------------------------------------------- the world */

const ROCK = "#6f5a52";
const ROCK_DARK = "#4f403c";
const STONE = "#8d7a6e";
const CAP = "#b9a58f";
const WOOD = "#8a5a32";
const ROPE = "#c8a66a";
const GOLD = "#ffc53d";
/** each section's cap colour, warming towards the podium */
const SECTION_CAP = ["#b9a58f", "#c6ad8e", "#d3ab7e", "#dda06a", "#e58f56", "#ef7a3f"];

function slab(color: string, cx: number, cz: number, w: number, d: number, top: number, bottom = 0, repeat = 2) {
  const h = Math.max(0.02, top - bottom);
  const m = new THREE.Mesh(beveledBox(w, h, d), lam(color, { repeat }));
  m.position.set(cx, bottom + h / 2, cz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * Bake a group that moves as a whole down to one mesh per material, in its own
 * local space, before it is placed. The park-wide merge cannot touch these
 * because they move, so otherwise each part costs a draw call of its own.
 */
function bakeGroup(g: THREE.Group, out: THREE.BufferGeometry[]) {
  g.position.set(0, 0, 0);
  g.updateMatrixWorld(true);
  out.push(...mergeStatic(g).geometries);
}

export class LavaWorld {
  private group = new THREE.Group();
  private colliders: AABB[] = [];
  /** the moving pieces' boxes, mutated in place every physics step */
  private moveBoxes: AABB[] = [];
  private moveMesh: THREE.Group[] = [];
  private bubbles: THREE.InstancedMesh;
  private prize: THREE.Group;
  private trophy: THREE.Group;
  private speech: THREE.Mesh;
  private geometries: THREE.BufferGeometry[] = [];
  private lavaMat: THREE.MeshStandardMaterial;
  private m4 = new THREE.Matrix4();

  state = newLavaState();
  /** seconds since she left the deck, or null when no attempt is running */
  runT: number | null = null;
  private shownT = -1;
  private lastFall = -10;
  private toldAbout = false;
  private wonAt = -10;
  private onPiece: number | null = null;

  constructor(
    private scene: THREE.Scene,
    private worldColliders: AABB[],
    /** puts her back on the deck, facing the course */
    private place: (x: number, y: number, z: number, yaw: number) => void,
  ) {
    const g = this.group;
    // A bright base colour plus a bright emissive goes over 1.0 and the neutral
    // tone mapping desaturates it to pale pink. A dark base with all the light
    // coming from the emissive is what reads as molten rock, and it is over the
    // bloom threshold (0.78) so it blooms.
    this.lavaMat = new THREE.MeshStandardMaterial({
      color: "#3a0c02",
      emissive: new THREE.Color("#ff5a0a"),
      emissiveIntensity: 1.25,
      roughness: 0.95,
      metalness: 0,
    });

    // ---- the lava, its cooled crust and the kerb -------------------------
    const p = LAVA_POOL;
    const poolGeo = beveledBox(p.maxX - p.minX, LAVA_SURFACE, p.maxZ - p.minZ);
    const pool = new THREE.Mesh(poolGeo, this.lavaMat);
    pool.position.set((p.minX + p.maxX) / 2, LAVA_SURFACE / 2, (p.minZ + p.maxZ) / 2);
    g.add(pool);
    let seed = 11;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 46; i++) {
      const w = 1.6 + rnd() * 3.4;
      const d = 1.2 + rnd() * 2.6;
      const cx = p.minX + 1 + rnd() * (p.maxX - p.minX - 2);
      const cz = p.minZ + 1 + rnd() * (p.maxZ - p.minZ - 2);
      // never under a piece, where a dark island would read as somewhere to land
      if (PIECES.some((q) => Math.abs(cx - q.cx) < q.w / 2 + 3 && Math.abs(cz - q.cz) < q.d / 2 + 3)) continue;
      g.add(slab(ROCK_DARK, cx, cz, w, d, LAVA_SURFACE + 0.07, LAVA_SURFACE - 0.12, 1));
    }
    for (const r of rimSegments()) g.add(slab(ROCK, r.cx, r.cz, r.w, r.d, RIM_TOP, 0, 2));

    // ---- the pieces ------------------------------------------------------
    for (const pc of PIECES) {
      if (pc.motion.kind === "static") this.buildStatic(g, pc);
      else this.buildMover(g, pc);
    }
    for (const st of [...deckSteps(), ...podiumSteps()]) g.add(slab(STONE, st.cx, st.cz, st.w, st.d, st.top, 0, 2));
    for (const w of parapets()) {
      g.add(slab(ROCK, w.cx, w.cz, w.w, w.d, w.top, w.base, 2));
      g.add(slab(GOLD, w.cx, w.cz, w.w - 0.08, w.d - 0.08, w.top + 0.06, w.top - 0.05, 1));
    }

    // ---- the sign and the speech bubble at the start ---------------------
    // beside the steps rather than beyond them: the park's east edge is close
    const signX = DECK.cx + DECK.w / 2 + 2.2;
    const signZ = DECK.cz - 5.2;
    const sign = signBoard("FLOOR IS LAVA", 4.4, 1.0);
    sign.position.set(signX, 2.8, signZ);
    g.add(sign);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(beveledBox(0.24, 2.6, 0.24), lam(WOOD, { repeat: 2 }));
      post.position.set(signX + s * 1.9, 1.3, signZ);
      post.castShadow = true;
      g.add(post);
    }
    this.speech = makeBubble(["Jump the whole course!", "Fall in and start over."]);
    this.speech.position.set(signX, 5.2, signZ);
    this.speech.scale.setScalar(1.7);
    this.speech.userData.signX = signX;
    this.speech.userData.signZ = signZ;
    g.add(this.speech);

    // ---- the prize on the podium ----------------------------------------
    this.prize = new THREE.Group();
    const { mesh } = makeAccessory("dragontail");
    const bb = new THREE.Box3().setFromObject(mesh);
    mesh.position.sub(bb.getCenter(new THREE.Vector3()));
    mesh.scale.setScalar(2.6);
    this.prize.add(mesh);
    bakeGroup(this.prize, this.geometries);
    this.prize.position.set(PODIUM.cx, PODIUM.top + 1.5, PODIUM.cz);
    g.add(this.prize);

    this.trophy = new THREE.Group();
    const goldMat = lam(GOLD, { flat: true, roughness: 0.25 });
    const cupGeo = new THREE.CylinderGeometry(0.36, 0.17, 0.52, 12);
    const stemGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.22, 10);
    this.geometries.push(cupGeo, stemGeo);
    const cup = new THREE.Mesh(cupGeo, goldMat);
    cup.position.y = 0.55;
    cup.castShadow = true;
    this.trophy.add(cup);
    const stem = new THREE.Mesh(stemGeo, goldMat);
    stem.position.y = 0.2;
    this.trophy.add(stem);
    this.trophy.add(new THREE.Mesh(beveledBox(0.5, 0.16, 0.5), goldMat));
    bakeGroup(this.trophy, this.geometries);
    this.trophy.position.set(PODIUM.cx, PODIUM.top + 0.08, PODIUM.cz);
    this.trophy.visible = false;
    g.add(this.trophy);

    // ---- bubbles: one instanced mesh for the whole lake -------------------
    const bubbleGeo = new THREE.SphereGeometry(0.32, 8, 6);
    this.geometries.push(bubbleGeo);
    this.bubbles = new THREE.InstancedMesh(bubbleGeo, this.lavaMat, BUBBLES);
    this.bubbles.frustumCulled = false;
    g.add(this.bubbles);

    scene.add(g);

    const live = new Set<THREE.Object3D>([...this.moveMesh, this.bubbles, this.prize, this.trophy, this.speech]);
    this.geometries.push(...mergeStatic(g, { live }).geometries);

    this.colliders = lavaColliders(this.state);
    this.moveBoxes = this.colliders.slice(0, MOVING.length);
    this.worldColliders.push(...this.colliders);
    this.syncMeshes();
  }

  /** A piece that never moves: a rock column standing in the lava. */
  private buildStatic(g: THREE.Group, pc: Piece) {
    const cap = SECTION_CAP[pc.section] ?? CAP;
    if (pc.kind === "podium") {
      g.add(slab(STONE, pc.cx, pc.cz, pc.w, pc.d, pc.top, 0, 3));
      g.add(slab(GOLD, pc.cx, pc.cz, pc.w - 0.5, pc.d - 0.5, pc.top + 0.04, pc.top - 0.08, 1));
      return;
    }
    if (pc.kind === "bridge" || pc.kind === "beam") {
      this.buildDeckPiece(g, pc, cap);
      return;
    }
    g.add(slab(pc.kind === "deck" ? STONE : ROCK, pc.cx, pc.cz, pc.w, pc.d, pc.top, 0, 3));
    g.add(slab(cap, pc.cx, pc.cz, pc.w - 0.36, pc.d - 0.36, pc.top + 0.03, pc.top - 0.1, 1));
    if (pc.kind === "pad" && pc.index > 0) {
      // boulders round the flanks, always below the top face, so they are
      // decoration and never a surface she could half-stand on
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU + 0.4;
        const r = 0.5 + (k % 3) * 0.16;
        g.add(
          slab(
            ROCK_DARK,
            pc.cx + Math.cos(a) * (pc.w / 2 - 0.1),
            pc.cz + Math.sin(a) * (pc.d / 2 - 0.1),
            r * 2,
            r * 1.8,
            pc.top - 0.3 - (k % 2) * 0.2,
            LAVA_SURFACE - 0.1,
            1,
          ),
        );
      }
    }
  }

  /**
   * The bridge and the beams: a flat plank deck at exactly the height of its
   * one collider. The planks are drawn on it side by side and are never tilted
   * or sagged, because the box underneath cannot tilt or sag with them.
   */
  private buildDeckPiece(g: THREE.Group, pc: Piece, cap: string) {
    const along = pc.dir === "E" || pc.dir === "W";
    const len = along ? pc.w : pc.d;
    const wide = along ? pc.d : pc.w;
    const thick = pc.top - pc.base;
    const n = Math.max(3, Math.round(len / 0.62));
    const pitch = len / n;
    for (let i = 0; i < n; i++) {
      const o = -len / 2 + (i + 0.5) * pitch;
      const cx = pc.cx + (along ? o : 0);
      const cz = pc.cz + (along ? 0 : o);
      g.add(
        slab(i % 2 ? WOOD : "#7a4f2c", cx, cz, along ? pitch * 0.9 : wide, along ? wide : pitch * 0.9, pc.top, pc.top - thick, 1),
      );
    }
    // rope rails and posts: decoration, never solid, and clear of her head
    for (const s of [-1, 1]) {
      const rx = pc.cx + (along ? 0 : (s * wide) / 2);
      const rz = pc.cz + (along ? (s * wide) / 2 : 0);
      const rail = new THREE.Mesh(
        beveledBox(along ? len : 0.1, 0.1, along ? 0.1 : len),
        lam(ROPE, { flat: true }),
      );
      rail.position.set(rx, pc.top + 1.0, rz);
      g.add(rail);
      for (const e of [-1, 1]) {
        const post = new THREE.Mesh(beveledBox(0.22, 1.5, 0.22), lam(WOOD, { repeat: 1 }));
        post.position.set(
          rx + (along ? (e * len) / 2 - e * 0.15 : 0),
          pc.top + 0.5,
          rz + (along ? 0 : (e * len) / 2 - e * 0.15),
        );
        post.castShadow = true;
        g.add(post);
      }
    }
    g.add(slab(cap, pc.cx, pc.cz, pc.w - 0.2, pc.d - 0.2, pc.top + 0.02, pc.top - 0.02, 1));
  }

  /**
   * A piece that moves. Built at the origin and baked to a couple of meshes,
   * then placed every frame from exactly the function that places its box.
   */
  private buildMover(g: THREE.Group, pc: Piece) {
    const f = new THREE.Group();
    const thick = pc.top - pc.base;
    const cap = SECTION_CAP[pc.section] ?? CAP;
    const body = new THREE.Mesh(beveledBox(pc.w, thick, pc.d), lam(ROCK, { repeat: 3 }));
    body.position.y = -thick / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    f.add(body);
    const top = new THREE.Mesh(beveledBox(pc.w - 0.3, 0.14, pc.d - 0.3), lam(cap, { repeat: 2 }));
    top.position.y = -0.02;
    f.add(top);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
      const edge = new THREE.Mesh(
        beveledBox(dx ? 0.24 : pc.w - 0.3, 0.18, dz ? 0.24 : pc.d - 0.3),
        lam(pc.motion.kind === "give" ? "#e8553a" : "#ffd76a", { flat: true }),
      );
      edge.position.set(dx * (pc.w / 2 - 0.12), 0.03, dz * (pc.d / 2 - 0.12));
      f.add(edge);
    }
    bakeGroup(f, this.geometries);
    g.add(f);
    this.moveMesh.push(f);
  }

  dispose() {
    this.scene.remove(this.group);
    for (const c of this.colliders) {
      const i = this.worldColliders.indexOf(c);
      if (i >= 0) this.worldColliders.splice(i, 1);
    }
    this.colliders = [];
    this.moveBoxes = [];
    for (const geo of this.geometries) geo.dispose();
    this.geometries = [];
    this.lavaMat.dispose();
    this.bubbles.dispose();
    const st = useGame.getState();
    if (st.lavaTime !== null) st.setLavaTime(null);
  }

  /**
   * Called from physics(), at the fixed step. Advances every moving piece,
   * moves its box, and carries her with the one she is standing on the way the
   * ferris wheel and the carousel carry her in runtime.ts. Everything here
   * translates, so a carried step can never push her through a wall.
   */
  step(dt: number, cap: Capsule, grounded: boolean) {
    const before = MOVING.map((p) => pieceAt(p, this.state));
    const riding = grounded ? this.ridingIndex(cap, before) : -1;
    this.onPiece = standingOn(cap.x, cap.y, cap.z, this.state);
    stepLavaState(this.state, dt, this.onPiece);
    for (let i = 0; i < MOVING.length; i++) {
      const p = MOVING[i]!;
      const a = before[i]!;
      const b = pieceAt(p, this.state);
      const box = this.moveBoxes[i]!;
      const thick = p.top - p.base;
      box.minX = b.x - p.w / 2;
      box.maxX = b.x + p.w / 2;
      box.minZ = b.z - p.d / 2;
      box.maxZ = b.z + p.d / 2;
      box.minY = p.base === 0 ? 0 : b.top - thick;
      box.maxY = b.top;
      if (i === riding) {
        cap.x += b.x - a.x;
        cap.z += b.z - a.z;
        cap.y += b.top - a.top;
      }
    }
  }

  /** Which moving piece she is standing on, by its position before this step. */
  private ridingIndex(cap: Capsule, before: { x: number; z: number; top: number }[]) {
    for (let i = 0; i < MOVING.length; i++) {
      const p = MOVING[i]!;
      const a = before[i]!;
      if (Math.abs(cap.y - a.top) > 0.16) continue;
      if (Math.abs(cap.x - a.x) > p.w / 2 + cap.hw) continue;
      if (Math.abs(cap.z - a.z) > p.d / 2 + cap.hd) continue;
      return i;
    }
    return -1;
  }

  /**
   * Every frame, after the physics. Moves the meshes onto the course state,
   * runs the clock, puts her back on the deck when she falls in, and hands
   * over the prize at the podium.
   */
  update(dt: number, her: { x: number; y: number; z: number; yaw: number }, paused: boolean) {
    this.syncMeshes();
    const st = useGame.getState();

    const signX = this.speech.userData.signX as number;
    const near = Math.hypot(her.x - DECK.cx, her.z - DECK.cz) < 50;
    this.speech.visible = near;
    if (near) {
      this.speech.rotation.y = Math.atan2(her.x - signX, her.z - (this.speech.userData.signZ as number));
      this.speech.position.y = 5.2 + Math.sin(this.state.t * 1.6) * 0.07;
    }
    if (paused) return;

    // the first walk up to the sign explains it, once a session
    if (!this.toldAbout && Math.hypot(her.x - LAVA_START[0], her.z - LAVA_START[1]) < 9 && her.y < 1.2) {
      this.toldAbout = true;
      st.setEmmettNotice("The floor is lava! Jump the whole course to the prize. Fall in and you start again — it never hurts.");
    }

    const on = standingOn(her.x, her.y, her.z, this.state);
    if (on != null) {
      if (on === DECK.index) {
        if (this.runT != null) {
          this.runT = null;
          this.shownT = -1;
          st.setLavaTime(null);
        }
      } else if (this.runT == null && on !== PODIUM.index) {
        this.runT = 0;
        this.shownT = -1;
      }
    }

    if (this.runT != null) {
      this.runT += dt;
      // whole seconds only: the HUD must not re-render every frame
      const whole = Math.floor(this.runT);
      if (whole !== this.shownT) {
        this.shownT = whole;
        st.setLavaTime(whole);
      }
    }

    // fallen in: back to the start deck, ready to go again
    if (overLava(her.x, her.z) && her.y < FALL_Y && this.state.t - this.lastFall > 0.8) {
      this.lastFall = this.state.t;
      const s = startSpot();
      this.place(s.x, s.y, s.z, s.yaw);
      this.runT = null;
      this.shownT = -1;
      st.setLavaTime(null);
      // the plank comes back for the next attempt
      this.state.held = 0;
      this.state.away = -1;
      sfx.splash(true);
      st.setEmmettNotice(FALL_LINES[Math.floor(Math.random() * FALL_LINES.length)]!);
      return;
    }

    // the podium pays out once per crossing: it is `runT` that makes it once
    // per crossing rather than once every few seconds of standing there, and
    // it also means walking up the podium's own steps from the lawn is worth
    // nothing
    if (on === PODIUM.index && this.runT != null && this.state.t - this.wonAt > 2) {
      this.wonAt = this.state.t;
      const seconds = this.runT;
      this.runT = null;
      this.shownT = -1;
      st.setLavaTime(null);
      const first = !st.foundAccessories.includes("dragontail");
      const tickets = lavaTickets(first);
      const line = lavaLine(seconds, st.lavaBest);
      if (st.lavaBest == null || seconds < st.lavaBest) st.setLavaBest(Math.round(seconds * 10) / 10);
      st.addTickets(tickets);
      sfx.win();
      // winPrize writes its own notice and puts it on her, so the time goes first
      st.setEmmettNotice(`${line} +${tickets} tickets!`);
      if (first) st.winPrize("dragontail");
    }
  }

  /** The meshes onto the course state. Nothing here ever rotates. */
  private syncMeshes() {
    const s = this.state;
    for (let i = 0; i < MOVING.length; i++) {
      const p = MOVING[i]!;
      const a = pieceAt(p, s);
      this.moveMesh[i]!.position.set(a.x, a.top, a.z);
    }
    const won = useGame.getState().foundAccessories.includes("dragontail");
    this.prize.visible = !won;
    this.trophy.visible = won;
    this.prize.rotation.y = s.t * 1.1;
    this.prize.position.y = PODIUM.top + 1.5 + Math.sin(s.t * 1.8) * 0.12;
    this.trophy.rotation.y = s.t * 0.7;

    const p = LAVA_POOL;
    for (let i = 0; i < BUBBLES; i++) {
      const phase = (((s.t * 0.3 + i / BUBBLES) % 1) + 1) % 1;
      const sc = Math.sin(phase * Math.PI) * (0.35 + (i % 4) * 0.14);
      const bx = p.minX + ((i * 7.31) % 1) * (p.maxX - p.minX);
      const bz = p.minZ + ((i * 3.77) % 1) * (p.maxZ - p.minZ);
      this.m4.makeScale(sc, sc, sc);
      this.m4.setPosition(bx, LAVA_SURFACE - 0.12 + phase * 0.6, bz);
      this.bubbles.setMatrixAt(i, this.m4);
    }
    this.bubbles.instanceMatrix.needsUpdate = true;
  }
}
