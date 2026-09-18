import * as THREE from "three";
import { sfx } from "./audio";
import { beveledBox } from "./beveled";
import { makeAccessory } from "./accessories";
import type { AABB, Capsule } from "./collision";
import { mergeStatic } from "./merge";
import { lam, signBoard } from "./meshes";
import { PLAYER_W } from "./tuning";
import { makeBubble } from "./quest-mesh";
import { useGame } from "./store";

/**
 * The Floor is Lava course.
 *
 * A jumping course on the open lawn north of the mountain, beside the road out
 * to the cave: a start deck, a stepping-stone island, two rolling logs, a
 * rope bridge, a rock island, two rafts that slide north and south, and a
 * prize podium at the far end, all over a glowing lava pool.
 *
 * Five rules shape every number in here.
 *
 * 1. **The lava never hurts her.** It is a visual slab with no collider. The
 *    moment she is inside the pool's footprint below `FALL_Y` she is lifted
 *    back onto the last platform she stood on, with a friendly line and a
 *    sound. No damage, no lost progress, nothing resets.
 *
 * 2. **Every gap is far inside her jump, and so is every overshoot.** A jump
 *    peaks at 2.73m and carries her 6.23m at walking speed (`jumpHeight` and
 *    `jumpReach` in tuning.ts). Every gap here is 1.8m, so she has three and a
 *    half times the reach she needs. That reach is also why every landing
 *    piece is at least 4.6m long: a child who holds the stick forward and taps
 *    jump at the edge flies the whole 6.23m, which lands her 4.4m onto the
 *    next piece rather than over it and into the lava. `tools/lava.ts` checks
 *    both ends of that: the gap she means to clear, and the overshoot she does
 *    not mean to make.
 *
 * 3. **Colliders ignore rotation, so nothing that rotates is a collider.**
 *    The logs roll about their own long axis and the bridge planks sag, but
 *    what is solid is the axis-aligned box each one sits in. Only the two
 *    ferries move their colliders, they slide along z alone, and the two AABB
 *    objects are mutated in place rather than rebuilt, so a physics step never
 *    walks the world's collider list.
 *
 * 4. **A collider always looks like what it is.** The full-height pieces (the
 *    deck, the stones, the podium) are drawn as columns from the ground; the
 *    bridge planks, the logs and the ferries are thin, so an undershot jump
 *    passes under them into the lava instead of hitting an invisible wall.
 *
 * Like `HomeWorld`, this builds its own meshes and pushes its own colliders
 * into the world's collider list, so nothing in levels.ts knows it exists.
 */

const TAU = Math.PI * 2;

/** West edge of the start deck, and the line the course runs along. */
const X0 = 41.0;
const CZ = -95;

/** Top of the lava slab. Taller than a grass blade, so none pokes through. */
export const LAVA_SURFACE = 0.7;
/**
 * Below this, over the lava, she is falling. The lowest thing she can stand on
 * is the bridge at its sag, 2.03m, and the lava's own surface is at 0.7m, so
 * there is a metre of clear air she can only be in on the way down.
 */
export const FALL_Y = 1.7;
/**
 * The rock kerb round the pool. It has to be tall enough to stop her strolling
 * in over it (taller than the 0.62m step-up) and lower than FALL_Y, so that
 * landing on it counts as falling in. If it were a wall she could stand on she
 * could walk the whole way round to the podium without jumping once.
 */
const RIM_TOP = 1.5;
const RIM_T = 0.8;

const POOL_HALF_D = 9;

const BUBBLES = 14;

const FALL_LINES = [
  "Whoops! Hot floor! Back you go.",
  "The lava bounced you out. Try again!",
  "Too hot! Here you are, safe and sound.",
  "Splat! No harm done. Keep jumping!",
];

type Kind = "deck" | "stone" | "bridge" | "log" | "ferry" | "podium";

type PlanStep = {
  id: string;
  kind: Kind;
  /** size along x and along z */
  w: number;
  d: number;
  /** the surface she stands on */
  top: number;
  /** clear air between this piece and the one before it, in metres */
  gap: number;
};

/**
 * The course, west to east. Heights only ever climb by 0.2m between
 * neighbours, which is nothing against a 2.7m jump: the interest is meant to
 * be the gaps and the rolling ground, never a leap of faith upward. Every
 * landing piece is long enough to catch a full-speed jump (see rule 2).
 */
const PLAN: PlanStep[] = [
  { id: "deck", kind: "deck", w: 8.0, d: 10.0, top: 2.0, gap: 0 },
  { id: "stones", kind: "stone", w: 6.4, d: 4.6, top: 2.15, gap: 1.8 },
  { id: "logs", kind: "log", w: 6.4, d: 2.6, top: 2.35, gap: 1.8 },
  { id: "bridge", kind: "bridge", w: 8.0, d: 2.2, top: 2.35, gap: 1.8 },
  // she walks straight off the bridge onto the island, so there is no gap: a
  // breather in the middle of the course
  { id: "island", kind: "stone", w: 4.6, d: 4.6, top: 2.35, gap: 0 },
  { id: "ferryA", kind: "ferry", w: 6.0, d: 6.0, top: 2.5, gap: 1.8 },
  { id: "ferryB", kind: "ferry", w: 6.0, d: 6.0, top: 2.7, gap: 1.8 },
  { id: "podium", kind: "podium", w: 6.5, d: 6.5, top: 2.9, gap: 1.8 },
];

export type Piece = {
  id: string;
  kind: Kind;
  index: number;
  /** centre when it is at rest; a ferry swings about this */
  cx: number;
  cz: number;
  w: number;
  d: number;
  top: number;
  /** the underside of the solid: 0 for a column, higher for a thin platform */
  base: number;
  /** clear air to the piece before it */
  gap: number;
};

/**
 * What each kind's solid looks like from the side. The deck, the stones and
 * the podium are rock columns standing in the lava, so they are solid from the
 * ground up. The bridge is planks with air under them. The logs sit on a
 * plinth and the rafts float in the lava, so both start at the lava's surface.
 */
function baseOf(kind: Kind, top: number) {
  if (kind === "bridge") return top - PLANK_T;
  if (kind === "log" || kind === "ferry") return LAVA_SURFACE;
  return 0;
}
const PLANK_T = 0.26;

/**
 * The course laid out along x. Each piece starts `gap` metres past the end of
 * the one before it, so the gaps in PLAN are literally the gaps she jumps.
 */
export const PIECES: Piece[] = (() => {
  const out: Piece[] = [];
  let x = X0;
  PLAN.forEach((p, index) => {
    x += p.gap;
    out.push({
      id: p.id,
      kind: p.kind,
      index,
      cx: x + p.w / 2,
      cz: CZ,
      w: p.w,
      d: p.d,
      top: p.top,
      base: baseOf(p.kind, p.top),
      gap: p.gap,
    });
    x += p.w;
  });
  return out;
})();

export function piece(id: string): Piece {
  return PIECES.find((p) => p.id === id)!;
}

const DECK = piece("deck");
const PODIUM = piece("podium");
const BRIDGE = piece("bridge");

/** The lava, from the deck's east edge to the podium's west edge. */
export const LAVA_POOL = {
  minX: DECK.cx + DECK.w / 2,
  maxX: PODIUM.cx - PODIUM.w / 2,
  minZ: CZ - POOL_HALF_D,
  maxZ: CZ + POOL_HALF_D,
};

/** The whole site, for anything that wants to keep clear of it. */
export function lavaFootprint(pad = 0) {
  return {
    minX: DECK.cx - DECK.w / 2 - pad,
    maxX: PODIUM.cx + PODIUM.w / 2 + stepCount(PODIUM.top) * 0.7 + pad,
    minZ: LAVA_POOL.minZ - RIM_T - pad,
    maxZ: LAVA_POOL.maxZ + RIM_T + pad,
  };
}

/** Where she walks in, at the foot of the steps up to the deck. */
export const LAVA_START: [number, number] = [DECK.cx, DECK.cz - DECK.d / 2 - 3.0];

/* ---------------------------------------------------------------- ferries */

/** How far a raft slides each way, and how long a round trip takes. */
const FERRY_TRAVEL = 1.8;
const FERRY_PERIOD = 6.6;

/**
 * A raft's centre at time t. Both rafts run in the same phase on purpose: the
 * hop from one to the next is then the same 1.8m jump whenever she takes it.
 *
 * The travel (1.8m) is far less than half a raft's depth (3.0m), so the line
 * she runs along is on the raft at every moment of the swing, whatever the
 * phase. That is the whole difference between a moving platform a
 * seven-year-old enjoys and one that punishes her for arriving at the wrong
 * moment: the raft carries her sideways, which is the fun of it, but it is
 * never the reason she misses. `tools/lava.ts` checks it at 120 phases.
 */
export function ferryZ(t: number) {
  return CZ + FERRY_TRAVEL * Math.sin((t / FERRY_PERIOD) * TAU);
}

/** Where a piece actually is at time t: only the ferries move. */
export function pieceAt(p: Piece, t: number): { x: number; z: number } {
  return { x: p.cx, z: p.kind === "ferry" ? ferryZ(t) : p.cz };
}

/** The solid box a piece presents at time t. */
export function pieceBox(p: Piece, t: number): AABB {
  const { x, z } = pieceAt(p, t);
  return { minX: x - p.w / 2, maxX: x + p.w / 2, minY: p.base, maxY: p.top, minZ: z - p.d / 2, maxZ: z + p.d / 2 };
}

/* ----------------------------------------------------- steps on and off */

type Step = { cx: number; cz: number; w: number; d: number; top: number };

/** Enough steps that every rise is well under the 0.62m step-up. */
const stepCount = (top: number) => Math.ceil(top / 0.5);

/** The steps up to the start deck from the lawn, on its north side. */
export function deckSteps(): Step[] {
  const out: Step[] = [];
  const n = stepCount(DECK.top);
  const zTop = DECK.cz - DECK.d / 2;
  for (let i = 0; i < n; i++) {
    out.push({ cx: DECK.cx, cz: zTop - (n - i) * 0.8 + 0.4, w: 5.0, d: 0.8, top: ((i + 1) / n) * DECK.top });
  }
  return out;
}

/** The steps down off the podium's east side, so she is never stranded. */
export function podiumSteps(): Step[] {
  const out: Step[] = [];
  const n = stepCount(PODIUM.top);
  const xEast = PODIUM.cx + PODIUM.w / 2;
  for (let i = 0; i < n; i++) {
    out.push({ cx: xEast + (n - 1 - i) * 0.7 + 0.35, cz: PODIUM.cz, w: 0.7, d: 3.6, top: ((i + 1) / n) * PODIUM.top });
  }
  return out;
}

/* ------------------------------------------------------------- the bridge */

const PLANKS = 11;
/** The sag: the middle planks dip this far below the two ends. */
const BRIDGE_SAG = 0.32;

export function bridgePlanks(): Step[] {
  const pitch = BRIDGE.w / PLANKS;
  const out: Step[] = [];
  for (let i = 0; i < PLANKS; i++) {
    const u = (i + 0.5) / PLANKS;
    out.push({
      cx: BRIDGE.cx - BRIDGE.w / 2 + (i + 0.5) * pitch,
      cz: BRIDGE.cz,
      w: pitch * 0.84,
      d: BRIDGE.d,
      top: BRIDGE.top - Math.sin(u * Math.PI) * BRIDGE_SAG,
    });
  }
  return out;
}

/* ---------------------------------------------------------------- the rim */

/**
 * The rock rim round the pool, as segments, with the deck's and the podium's
 * own z spans left out: they are the two ways in. Its top is under FALL_Y, so
 * landing on it counts as falling in rather than as a place to perch.
 */
export function rimSegments(): { cx: number; cz: number; w: number; d: number }[] {
  const p = LAVA_POOL;
  const out: { cx: number; cz: number; w: number; d: number }[] = [];
  const outerMinX = p.minX - RIM_T;
  const outerMaxX = p.maxX + RIM_T;
  for (const cz of [p.minZ - RIM_T / 2, p.maxZ + RIM_T / 2]) {
    const span = outerMaxX - outerMinX;
    const n = Math.ceil(span / 8);
    for (let i = 0; i < n; i++) {
      const w = span / n;
      out.push({ cx: outerMinX + (i + 0.5) * w, cz, w, d: RIM_T });
    }
  }
  for (const [cx, gate] of [
    [p.minX - RIM_T / 2, DECK],
    [p.maxX + RIM_T / 2, PODIUM],
  ] as [number, Piece][]) {
    for (const [z0, z1] of [
      [p.minZ, gate.cz - gate.d / 2],
      [gate.cz + gate.d / 2, p.maxZ],
    ] as [number, number][]) {
      if (z1 - z0 < 0.2) continue;
      out.push({ cx, cz: (z0 + z1) / 2, w: RIM_T, d: z1 - z0 });
    }
  }
  return out;
}

/* ---------------------------------------------------------- the colliders */

function boxOf(cx: number, cz: number, w: number, d: number, top: number, base = 0): AABB {
  return { minX: cx - w / 2, maxX: cx + w / 2, minY: base, maxY: top, minZ: cz - d / 2, maxZ: cz + d / 2 };
}

/**
 * Everything solid on the site at time t, in the order the world gets it. The
 * ferries are last so the world class can hold on to those two objects and
 * slide them in place.
 */
export function lavaColliders(t: number): AABB[] {
  const out: AABB[] = [];
  for (const p of PIECES) {
    if (p.kind === "ferry") continue;
    if (p.kind === "bridge") {
      for (const pl of bridgePlanks()) out.push(boxOf(pl.cx, pl.cz, pl.w, pl.d, pl.top, pl.top - PLANK_T));
      continue;
    }
    out.push(pieceBox(p, t));
  }
  for (const s of [...deckSteps(), ...podiumSteps()]) out.push(boxOf(s.cx, s.cz, s.w, s.d, s.top));
  for (const r of rimSegments()) out.push(boxOf(r.cx, r.cz, r.w, r.d, RIM_TOP));
  for (const p of PIECES) if (p.kind === "ferry") out.push(pieceBox(p, t));
  return out;
}

/** Is (x, z) out over the lava? The rim counts; the deck and podium do not. */
export function overLava(x: number, z: number) {
  const p = LAVA_POOL;
  if (x <= p.minX - RIM_T || x >= p.maxX + RIM_T || z <= p.minZ - RIM_T || z >= p.maxZ + RIM_T) return false;
  for (const pc of [DECK, PODIUM]) {
    if (Math.abs(x - pc.cx) < pc.w / 2 + 0.05 && Math.abs(z - pc.cz) < pc.d / 2 + 0.05) return false;
  }
  return true;
}

/* ------------------------------------------------ where she is, and safety */

/** Which platform she was last on, and where on it, so a fall puts her back. */
export type LavaSafe = { index: number; dx: number; dz: number };

/**
 * The piece she is standing on at time t, if any, with where on it. The spot
 * is kept a little inside the edge so that being put back there never drops
 * her straight off the side she fell from.
 *
 * Pure, so tools/lava.ts can run the fall-and-return rule the game runs.
 */
export function standingOn(x: number, y: number, z: number, t: number): LavaSafe | null {
  for (const pc of PIECES) {
    if (pc.kind === "bridge") continue;
    if (Math.abs(y - pc.top) > 0.18) continue;
    const at = pieceAt(pc, t);
    const dx = x - at.x;
    const dz = z - at.z;
    // her capsule's own half width, because collision.ts calls her grounded
    // whenever any part of that footprint is over the box
    if (Math.abs(dx) > pc.w / 2 + PLAYER_W || Math.abs(dz) > pc.d / 2 + PLAYER_W) continue;
    const lim = (s: number) => Math.max(0, s / 2 - 0.7);
    return {
      index: pc.index,
      dx: Math.max(-lim(pc.w), Math.min(lim(pc.w), dx)),
      dz: Math.max(-lim(pc.d), Math.min(lim(pc.d), dz)),
    };
  }
  // the bridge sags along its length, so it is matched as one piece
  if (
    Math.abs(x - BRIDGE.cx) <= BRIDGE.w / 2 + PLAYER_W &&
    Math.abs(z - BRIDGE.cz) <= BRIDGE.d / 2 + PLAYER_W &&
    y > BRIDGE.top - BRIDGE_SAG - 0.25 &&
    y < BRIDGE.top + 0.25
  ) {
    return { index: BRIDGE.index, dx: Math.max(-BRIDGE.w / 2 + 0.7, Math.min(BRIDGE.w / 2 - 0.7, x - BRIDGE.cx)), dz: 0 };
  }
  return null;
}

/** Where a remembered safe spot is at time t. */
export function safeSpotAt(safe: LavaSafe, t: number): [number, number, number] {
  const pc = PIECES[safe.index] ?? DECK;
  const at = pieceAt(pc, t);
  // the bridge's height varies along it; its sag is the floor to come back to
  const u = pc.kind === "bridge" ? 1 - Math.abs(safe.dx) / (pc.w / 2) : 0;
  const top = pc.top - Math.sin(u * Math.PI * 0.5) * BRIDGE_SAG;
  return [at.x + safe.dx, top + 0.08, at.z + safe.dz];
}

/* ---------------------------------------------------------------- scoring */

/** Tickets for reaching the podium: a big first prize, a small one after. */
export function lavaTickets(first: boolean) {
  return first ? 12 : 4;
}

export function lavaLine(seconds: number, best: number | null) {
  const t = `${seconds.toFixed(1)}s`;
  if (best == null) return `You crossed the lava in ${t}!`;
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
const LOG_C = "#7a4f2c";
const GOLD = "#ffc53d";

/**
 * Bake a group that moves as a whole (a raft, a log, the floating prize) down
 * to one mesh per material, in its own local space, before it is placed. The
 * park-wide merge cannot touch these because they move, so they would each
 * cost a draw call per part: the dragon tail alone is 23 of them.
 */
function bakeGroup(g: THREE.Group, out: THREE.BufferGeometry[]) {
  g.position.set(0, 0, 0);
  g.rotation.set(0, 0, 0);
  g.updateMatrixWorld(true);
  out.push(...mergeStatic(g).geometries);
}

function slab(color: string, cx: number, cz: number, w: number, d: number, top: number, bottom = 0, repeat = 2) {
  const h = Math.max(0.02, top - bottom);
  const m = new THREE.Mesh(beveledBox(w, h, d), lam(color, { repeat }));
  m.position.set(cx, bottom + h / 2, cz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export class LavaWorld {
  private group = new THREE.Group();
  private colliders: AABB[] = [];
  /** the two ferry AABBs, mutated in place every physics step */
  private ferryBoxes: AABB[] = [];
  private ferryPieces: Piece[] = [];
  private ferryMesh: THREE.Group[] = [];
  private logMesh: THREE.Group[] = [];
  private bubbles: THREE.InstancedMesh;
  private prize: THREE.Group;
  private trophy: THREE.Group;
  private speech: THREE.Mesh;
  private geometries: THREE.BufferGeometry[] = [];
  private lavaMat: THREE.MeshStandardMaterial;
  private m4 = new THREE.Matrix4();

  /** the course clock; the ferries, logs and bubbles are functions of it */
  clock = 0;
  safe: LavaSafe = { index: 0, dx: 0, dz: 0 };
  /** seconds since she left the deck, or null when she is not running */
  runT: number | null = null;
  private shownT = -1;
  private lastFall = -10;
  private toldAbout = false;
  private wonAt = -10;

  constructor(
    private scene: THREE.Scene,
    private worldColliders: AABB[],
    /** puts her back on a platform, keeping the way she is facing */
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

    // ---- the lava, its cooled crust and the rim --------------------------
    const p = LAVA_POOL;
    const poolGeo = beveledBox(p.maxX - p.minX, LAVA_SURFACE, p.maxZ - p.minZ);
    const pool = new THREE.Mesh(poolGeo, this.lavaMat);
    pool.position.set((p.minX + p.maxX) / 2, LAVA_SURFACE / 2, (p.minZ + p.maxZ) / 2);
    g.add(pool);
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 18; i++) {
      const w = 1.4 + rnd() * 3.2;
      const d = 1.0 + rnd() * 2.2;
      const cx = p.minX + 1 + rnd() * (p.maxX - p.minX - 2);
      const cz = p.minZ + 1 + rnd() * (p.maxZ - p.minZ - 2);
      // never near the line she runs along: a dark island there would read as
      // somewhere to land
      if (Math.abs(cz - CZ) < 3.2) continue;
      g.add(slab(ROCK_DARK, cx, cz, w, d, LAVA_SURFACE + 0.07, LAVA_SURFACE - 0.12, 1));
    }
    for (const r of rimSegments()) g.add(slab(ROCK, r.cx, r.cz, r.w, r.d, RIM_TOP, 0, 2));

    // ---- the platforms ---------------------------------------------------
    for (const pc of PIECES) {
      if (pc.kind === "bridge") this.buildBridge(g);
      else if (pc.kind === "log") this.buildLog(g, pc);
      else if (pc.kind === "ferry") this.buildFerry(g, pc);
      else if (pc.kind === "podium") {
        g.add(slab(STONE, pc.cx, pc.cz, pc.w, pc.d, pc.top, 0, 3));
        g.add(slab(GOLD, pc.cx, pc.cz, pc.w - 0.5, pc.d - 0.5, pc.top + 0.04, pc.top - 0.08, 1));
      } else {
        g.add(slab(pc.kind === "deck" ? STONE : ROCK, pc.cx, pc.cz, pc.w, pc.d, pc.top, 0, 3));
        // a bright cap, so the top of every stone reads from across the pool
        g.add(slab(CAP, pc.cx, pc.cz, pc.w - 0.36, pc.d - 0.36, pc.top + 0.03, pc.top - 0.1, 1));
        // boulders clustered round the flanks, always below the top face, so
        // they are decoration and never a surface she could half-stand on
        if (pc.kind === "stone") {
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * TAU + 0.4;
            const r = 0.55 + (k % 3) * 0.16;
            g.add(
              slab(
                ROCK_DARK,
                pc.cx + Math.cos(a) * (pc.w / 2 - 0.1),
                pc.cz + Math.sin(a) * (pc.d / 2 - 0.1),
                r * 2,
                r * 1.8,
                pc.top - 0.28 - (k % 2) * 0.18,
                LAVA_SURFACE - 0.1,
                1,
              ),
            );
          }
        }
      }
    }
    for (const s of [...deckSteps(), ...podiumSteps()]) g.add(slab(STONE, s.cx, s.cz, s.w, s.d, s.top, 0, 2));

    // ---- the sign and the speech bubble at the start ---------------------
    const signZ = DECK.cz - DECK.d / 2 - 3.9;
    const sign = signBoard("FLOOR IS LAVA", 4.0, 0.9);
    sign.position.set(DECK.cx, 2.7, signZ);
    // the board's text is on its +z face and she arrives from the north
    sign.rotation.y = Math.PI;
    g.add(sign);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(beveledBox(0.22, 2.4, 0.22), lam(WOOD, { repeat: 2 }));
      post.position.set(DECK.cx + s * 1.7, 1.2, signZ);
      post.castShadow = true;
      g.add(post);
    }
    this.speech = makeBubble(["Jump across the lava!", "Falling in is OK."]);
    this.speech.position.set(DECK.cx, 5.1, signZ);
    this.speech.scale.setScalar(1.6);
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

    // ---- bubbles: one instanced mesh for the whole pool -------------------
    const bubbleGeo = new THREE.SphereGeometry(0.3, 8, 6);
    this.geometries.push(bubbleGeo);
    this.bubbles = new THREE.InstancedMesh(bubbleGeo, this.lavaMat, BUBBLES);
    this.bubbles.frustumCulled = false;
    g.add(this.bubbles);

    scene.add(g);

    // everything that never moves is folded into a handful of draw calls
    const live = new Set<THREE.Object3D>([
      ...this.ferryMesh,
      ...this.logMesh,
      this.bubbles,
      this.prize,
      this.trophy,
      this.speech,
    ]);
    this.geometries.push(...mergeStatic(g, { live }).geometries);

    this.colliders = lavaColliders(0);
    this.ferryPieces = PIECES.filter((q) => q.kind === "ferry");
    this.ferryBoxes = this.colliders.slice(this.colliders.length - this.ferryPieces.length);
    this.worldColliders.push(...this.colliders);
    this.syncMeshes();
  }

  private buildBridge(g: THREE.Group) {
    for (const pl of bridgePlanks()) {
      g.add(slab(WOOD, pl.cx, pl.cz, pl.w, pl.d, pl.top, pl.top - PLANK_T, 1));
    }
    const pitch = BRIDGE.w / PLANKS;
    for (const s of [-1, 1]) {
      for (let i = 0; i < PLANKS; i++) {
        const u = (i + 0.5) / PLANKS;
        const rail = new THREE.Mesh(beveledBox(pitch + 0.06, 0.1, 0.1), lam(ROPE, { flat: true }));
        rail.position.set(
          BRIDGE.cx - BRIDGE.w / 2 + (i + 0.5) * pitch,
          BRIDGE.top - Math.sin(u * Math.PI) * BRIDGE_SAG + 0.95,
          BRIDGE.cz + s * (BRIDGE.d / 2 - 0.12),
        );
        g.add(rail);
      }
      for (const e of [-1, 1]) {
        const post = new THREE.Mesh(beveledBox(0.24, 1.6, 0.24), lam(WOOD, { repeat: 1 }));
        post.position.set(BRIDGE.cx + e * (BRIDGE.w / 2 - 0.16), BRIDGE.top + 0.6, BRIDGE.cz + s * (BRIDGE.d / 2 - 0.12));
        post.castShadow = true;
        g.add(post);
      }
    }
  }

  /**
   * Two logs end to end along the course, on a stone plinth that rises out of
   * the lava. They roll opposite ways about their own long axis; what is solid
   * is the plinth-and-log box under them, which never turns. Being flattened
   * (0.66m tall over a 2.6m footprint) means rolling barely moves their tops,
   * so what she stands on and what she sees never drift apart by more than a
   * few centimetres.
   */
  private buildLog(g: THREE.Group, pc: Piece) {
    const LOG_H = 0.66;
    // the plinth: exactly the collider's footprint, from the lava to the logs
    g.add(slab(ROCK, pc.cx, pc.cz, pc.w, pc.d, pc.top - LOG_H, LAVA_SURFACE - 0.05, 3));
    const half = pc.w / 2 - 0.1;
    const stripeMat = lam("#54331c", { flat: true });
    for (const side of [-1, 1]) {
      const roll = new THREE.Group();
      // a cylinder lying along x, flattened to the footprint's depth
      const geo = new THREE.CylinderGeometry(0.5, 0.5, half, 14);
      geo.rotateZ(Math.PI / 2);
      this.geometries.push(geo);
      const body = new THREE.Mesh(geo, lam(LOG_C, { repeat: 3 }));
      body.scale.set(1, LOG_H, pc.d);
      body.castShadow = true;
      roll.add(body);
      // bark ribs, so the roll reads on an otherwise smooth barrel
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        const rib = new THREE.Mesh(beveledBox(half * 0.94, 0.09, 0.18), stripeMat);
        rib.position.set(0, Math.sin(a) * (LOG_H / 2 - 0.02), Math.cos(a) * (pc.d / 2 - 0.05));
        rib.rotation.x = -a;
        roll.add(rib);
      }
      bakeGroup(roll, this.geometries);
      roll.position.set(pc.cx + (side * half) / 2, pc.top - LOG_H / 2, pc.cz);
      g.add(roll);
      this.logMesh.push(roll);
    }
  }

  /**
   * A raft of rock floating in the lava, sliding north and south. Its collider
   * is the same block from the lava's surface to its deck, so an undershot
   * jump hits its side and slides into the lava rather than through it.
   */
  private buildFerry(g: THREE.Group, pc: Piece) {
    const f = new THREE.Group();
    const h = pc.top - LAVA_SURFACE;
    const deck = new THREE.Mesh(beveledBox(pc.w, h, pc.d), lam(ROCK, { repeat: 3 }));
    deck.position.y = LAVA_SURFACE + h / 2;
    deck.castShadow = true;
    deck.receiveShadow = true;
    f.add(deck);
    // a pale top with a gold edge, so it reads as somewhere to land
    const cap = new THREE.Mesh(beveledBox(pc.w - 0.3, 0.14, pc.d - 0.3), lam(CAP, { repeat: 2 }));
    cap.position.y = pc.top - 0.02;
    f.add(cap);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
      const edge = new THREE.Mesh(
        beveledBox(dx ? 0.26 : pc.w - 0.3, 0.18, dz ? 0.26 : pc.d - 0.3),
        lam("#ffd76a", { flat: true }),
      );
      edge.position.set(dx * (pc.w / 2 - 0.13), pc.top + 0.02, dz * (pc.d / 2 - 0.13));
      f.add(edge);
    }
    bakeGroup(f, this.geometries);
    f.position.set(pc.cx, 0, pc.cz);
    g.add(f);
    this.ferryMesh.push(f);
  }

  dispose() {
    this.scene.remove(this.group);
    for (const c of this.colliders) {
      const i = this.worldColliders.indexOf(c);
      if (i >= 0) this.worldColliders.splice(i, 1);
    }
    this.colliders = [];
    this.ferryBoxes = [];
    for (const g of this.geometries) g.dispose();
    this.geometries = [];
    this.lavaMat.dispose();
    this.bubbles.dispose();
    const st = useGame.getState();
    if (st.lavaTime !== null) st.setLavaTime(null);
  }

  /**
   * Called from physics(), at the fixed step. Slides the two ferries and
   * carries her with the one she is standing on, the way the ferris wheel and
   * the carousel carry her in runtime.ts. They move along z only and their
   * lane is empty, so this can never push her through anything.
   */
  step(dt: number, cap: Capsule, grounded: boolean) {
    const before = ferryZ(this.clock);
    this.clock += dt;
    const after = ferryZ(this.clock);
    const dz = after - before;
    let riding = false;
    for (let i = 0; i < this.ferryBoxes.length; i++) {
      const pc = this.ferryPieces[i]!;
      const b = this.ferryBoxes[i]!;
      if (
        grounded &&
        Math.abs(cap.y - pc.top) < 0.14 &&
        cap.x - cap.hw < b.maxX &&
        cap.x + cap.hw > b.minX &&
        cap.z - cap.hd < b.maxZ &&
        cap.z + cap.hd > b.minZ
      ) {
        riding = true;
      }
      b.minZ = after - pc.d / 2;
      b.maxZ = after + pc.d / 2;
    }
    if (riding) cap.z += dz;
  }

  /** Where being put back from a fall lands her, right now. */
  safeSpot(): [number, number, number] {
    return safeSpotAt(this.safe, this.clock);
  }

  /**
   * Every frame, after the physics. Moves the meshes onto the course clock,
   * remembers the last platform she stood on, lifts her out of the lava, and
   * hands over the prize at the podium.
   */
  update(dt: number, her: { x: number; y: number; z: number; yaw: number }, paused: boolean) {
    this.syncMeshes();
    const st = useGame.getState();

    const signZ = this.speech.userData.signZ as number;
    const near = Math.hypot(her.x - DECK.cx, her.z - DECK.cz) < 45;
    this.speech.visible = near;
    if (near) {
      this.speech.rotation.y = Math.atan2(her.x - DECK.cx, her.z - signZ);
      this.speech.position.y = 5.1 + Math.sin(this.clock * 1.6) * 0.07;
    }
    if (paused) return;

    // the first walk up to the sign explains it, once a session
    if (!this.toldAbout && Math.hypot(her.x - LAVA_START[0], her.z - LAVA_START[1]) < 8 && her.y < 1) {
      this.toldAbout = true;
      st.setEmmettNotice("The floor is lava! Hop stone to stone to the prize. Falling in just pops you back, it never hurts.");
    }

    const on = standingOn(her.x, her.y, her.z, this.clock);
    if (on) {
      this.safe = on;
      if (on.index === DECK.index) {
        // back at the start: the clock is armed but not running
        if (this.runT != null) {
          this.runT = null;
          this.shownT = -1;
          st.setLavaTime(null);
        }
      } else if (this.runT == null && on.index < PODIUM.index) {
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

    // fallen in: lift her back out, gently
    if (overLava(her.x, her.z) && her.y < FALL_Y && this.clock - this.lastFall > 0.7) {
      this.lastFall = this.clock;
      const [x, y, z] = this.safeSpot();
      this.place(x, y, z, her.yaw);
      sfx.splash(true);
      st.setEmmettNotice(FALL_LINES[Math.floor(Math.random() * FALL_LINES.length)]!);
      return;
    }

    // The podium pays out once per crossing: tickets and a time every time, the
    // prize the first time. It is `runT` that makes it once per crossing and
    // not once every few seconds of standing there — the clock only starts when
    // she steps off the deck onto the course, so walking up the podium's own
    // steps from the lawn is worth nothing, and lingering on it is worth
    // nothing either. Without that it paid out every five seconds.
    if (on && on.index === PODIUM.index && this.runT != null && this.clock - this.wonAt > 2) {
      this.wonAt = this.clock;
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

  /** The meshes onto the course clock: ferries, logs, bubbles, the prize. */
  private syncMeshes() {
    const t = this.clock;
    const z = ferryZ(t);
    for (const f of this.ferryMesh) f.position.z = z;
    for (let i = 0; i < this.logMesh.length; i++) {
      // rolls about its own long axis, each one its own way; the box under it
      // never turns, so what is solid is exactly what the plinth looks like
      this.logMesh[i]!.rotation.x = Math.sin(t * (0.85 + i * 0.3) + i * 2.1) * (i % 2 ? -0.6 : 0.6);
    }
    const won = useGame.getState().foundAccessories.includes("dragontail");
    this.prize.visible = !won;
    this.trophy.visible = won;
    this.prize.rotation.y = t * 1.1;
    this.prize.position.y = PODIUM.top + 1.5 + Math.sin(t * 1.8) * 0.12;
    this.trophy.rotation.y = t * 0.7;

    const p = LAVA_POOL;
    for (let i = 0; i < BUBBLES; i++) {
      const phase = (((t * 0.3 + i / BUBBLES) % 1) + 1) % 1;
      const s = Math.sin(phase * Math.PI) * (0.35 + (i % 4) * 0.14);
      const bx = p.minX + ((i * 7.31) % 1) * (p.maxX - p.minX);
      const bz = p.minZ + ((i * 3.77) % 1) * (p.maxZ - p.minZ);
      this.m4.makeScale(s, s, s);
      this.m4.setPosition(bx, LAVA_SURFACE - 0.12 + phase * 0.6, bz);
      this.bubbles.setMatrixAt(i, this.m4);
    }
    this.bubbles.instanceMatrix.needsUpdate = true;
  }
}
