import type { AccessoryId } from "./accessories";
import type { BoxProp, Prop } from "./types";

/**
 * The carnival, on the lawn beside the ferris wheel where the lookout hill
 * used to be. Everything sits inside the hill's old footprint, which is still
 * reserved in the placement map, so adding it moves nothing else in the park.
 *
 * Four booths along the back, facing south, and a carousel in front. Each
 * booth and the carousel's brass ring awards a wearable prize; the prize
 * booth hands out a giant teddy once the other four are won. The games are
 * overlay panels (overlays.tsx); this module is the shared layout, the prize
 * table and the rules, so the runtime, the panels and the tools agree.
 */

export type BoothGame = "rings" | "ducks" | "moles" | "prizes";

export type Booth = {
  game: BoothGame;
  name: string;
  /** centre of the booth's footprint; the counter faces south (-z) */
  x: number;
  z: number;
  w: number;
  awning: [string, string];
  /** what winning it gives; the prize booth gives the teddy */
  prize: AccessoryId;
  /** one line on the booth panel's start screen */
  pitch: string;
};

const BACK_Z = 64.5;
const DEPTH = 3;

export const BOOTHS: Booth[] = [
  {
    game: "rings",
    name: "Ring Toss",
    x: -26,
    z: BACK_Z,
    w: 5.5,
    awning: ["#e8455f", "#fff4e8"],
    prize: "balloon",
    pitch: "Drop the ring when it's over the glowing bottle. Ring 3 of 5 to win!",
  },
  {
    game: "ducks",
    name: "Duck Pond",
    x: -19.5,
    z: BACK_Z,
    w: 5.5,
    awning: ["#4f93c4", "#fff4e8"],
    prize: "duckhat",
    pitch: "Every duck hides a picture. Flip two at a time and find all the matching pairs.",
  },
  {
    game: "moles",
    name: "Whack-a-Mole",
    x: -13,
    z: BACK_Z,
    w: 5.5,
    awning: ["#3fa35c", "#fff4e8"],
    prize: "starglasses",
    pitch: "Bonk the moles! Golden moles are worth 3. Don't bonk the bunny!",
  },
  {
    game: "prizes",
    name: "Prizes",
    x: -6.5,
    z: BACK_Z,
    w: 5.5,
    awning: ["#b98ce0", "#fff4e8"],
    prize: "teddy",
    pitch: "Win every carnival game and the Giant Teddy is yours.",
  },
];

/** The four prizes that count toward the teddy, and where each is won. */
export const GAME_PRIZES: { prize: AccessoryId; where: string }[] = [
  { prize: "balloon", where: "Ring Toss" },
  { prize: "duckhat", where: "Duck Pond" },
  { prize: "starglasses", where: "Whack-a-Mole" },
  { prize: "unicorn", where: "the carousel's gold ring" },
];

/** The prize booth's shop: every item is wearable or holdable. Prices in tickets. */
export const SHOP: { id: AccessoryId; price: number }[] = [
  { id: "pinwheel", price: 5 },
  { id: "catears", price: 6 },
  { id: "heartglasses", price: 6 },
  { id: "lollipop", price: 6 },
  { id: "bunnyears", price: 8 },
  { id: "cottoncandy", price: 8 },
  { id: "wand", price: 10 },
  { id: "tiara", price: 12 },
  { id: "cape", price: 12 },
  { id: "wings", price: 15 },
];

/** Where she stands to play a booth: just in front of its counter. */
export function boothStand(b: Booth): [number, number] {
  return [b.x, b.z - DEPTH / 2 - 1.2];
}

export const CAROUSEL = {
  x: -16,
  z: 53,
  /** turning platform */
  radius: 5,
  /** where the horses stand */
  seatRadius: 3.7,
  horses: 6,
  /** low fence round the ride, with a shut gate on the south side */
  fence: 6.4,
  /** seconds per turn, and turns per ride */
  period: 8,
  laps: 4,
  /** the brass-ring arm reaches in from the east, at this angle */
  armAngle: 0,
  /** the ring is gold on this pass (1-based); silver otherwise */
  goldPass: 3,
  /** half the arc, in radians, over which a passing ring can be grabbed */
  grabHalfAngle: 0.46,
};

/** Standing here and pressing Collect boards the carousel. */
export function carouselGate(): [number, number] {
  return [CAROUSEL.x, CAROUSEL.z - CAROUSEL.fence - 0.9];
}

/* ---------------------------------------------------------------- rules */

export const RING_TOSS = {
  rings: 5,
  toWin: 3,
  bottles: 5,
  /** seconds for the ring to sweep across and back, per throw */
  periods: [3.8, 3.5, 3.3, 3.1, 3.0],
};

export const DUCK_POND = {
  pairs: 6,
  /** turns (two flips) allowed; perfect play is 6, guessing blind is ~15 */
  turns: 14,
};

export const WHACK = {
  seconds: 30,
  goal: 12,
  holes: 6,
  /**
   * How long a mole stays up, easing from the first value to the second.
   * Slowed after playtesting: 1.5s down to 0.95s was too quick to enjoy.
   */
  upStart: 2.2,
  upEnd: 1.45,
  /** gap before the next pop, in seconds (random between the two) */
  gapMin: 0.7,
  gapMax: 1.2,
};

/** Ring toss: the ring's position across the row (0..1) at time t. */
export function ringSweep(t: number, period: number) {
  const k = (((t / period) % 1) + 1) % 1;
  return k < 0.5 ? k * 2 : 2 - k * 2;
}

/** Ring toss: which bottle (0-based) the ring is over at x, if any. */
export function bottleUnder(x: number, bottles = RING_TOSS.bottles) {
  const i = Math.floor(x * bottles);
  const centre = (i + 0.5) / bottles;
  // anywhere over the bottle counts; only the thin gap between two misses
  return Math.abs(x - centre) <= 0.47 / bottles ? Math.min(bottles - 1, i) : -1;
}

/** A shuffled duck deck: each picture twice. */
export function duckDeck(pictures: string[], pairs = DUCK_POND.pairs, rand = Math.random) {
  const deck = [...pictures.slice(0, pairs), ...pictures.slice(0, pairs)];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}

/* ---------------------------------------------------------------- props */

function slab(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, collide = true): BoxProp {
  return { kind: "box", pos: [x, y, z], size: [sx, sy, sz], color, collide };
}

/**
 * The solid parts: booth backs, sides and counters, the carousel's base and
 * centre column, and its fence. Awnings, signs, the games on the counters,
 * the turning platform, horses and lights are the composite in meshes.ts.
 */
export function carnivalProps(): Prop[] {
  const p: Prop[] = [];
  for (const b of BOOTHS) {
    const front = b.z - DEPTH / 2;
    // back wall and sides
    p.push(slab(b.x, 1.4, b.z + DEPTH / 2 - 0.1, b.w, 2.8, 0.2, "#f3eadc"));
    p.push(slab(b.x - b.w / 2 + 0.1, 1.4, b.z, 0.2, 2.8, DEPTH, "#f3eadc"));
    p.push(slab(b.x + b.w / 2 - 0.1, 1.4, b.z, 0.2, 2.8, DEPTH, "#f3eadc"));
    // counter across the front, waist high for her
    p.push(slab(b.x, 0.5, front + 0.3, b.w - 0.4, 1.0, 0.6, b.awning[0]));
    p.push(slab(b.x, 1.04, front + 0.3, b.w - 0.3, 0.08, 0.7, "#fff4e8", false));
  }
  // carousel: a low base she cannot step onto from the fence gap, and a column
  p.push({ kind: "cyl", pos: [CAROUSEL.x, 0.2, CAROUSEL.z], r: CAROUSEL.radius + 0.2, h: 0.4, color: "#d8c49a", collide: true });
  p.push({ kind: "cyl", pos: [CAROUSEL.x, 2.3, CAROUSEL.z], r: 0.7, h: 4.6, color: "#ffc53d", collide: true });
  // fence: four sides of posts and rails, with the gate gap on the south side
  const f = CAROUSEL.fence;
  const fh = 0.9;
  p.push(slab(CAROUSEL.x, fh / 2, CAROUSEL.z + f, f * 2, fh, 0.14, "#e8455f"));
  p.push(slab(CAROUSEL.x - f, fh / 2, CAROUSEL.z, 0.14, fh, f * 2, "#e8455f"));
  p.push(slab(CAROUSEL.x + f, fh / 2, CAROUSEL.z, 0.14, fh, f * 2, "#e8455f"));
  p.push(slab(CAROUSEL.x - f / 2 - 0.9, fh / 2, CAROUSEL.z - f, f - 1.8, fh, 0.14, "#e8455f"));
  p.push(slab(CAROUSEL.x + f / 2 + 0.9, fh / 2, CAROUSEL.z - f, f - 1.8, fh, 0.14, "#e8455f"));
  // the gate, shut: she boards by pressing Collect at it, not by walking in
  p.push(slab(CAROUSEL.x, fh / 2, CAROUSEL.z - f, 3.6, fh, 0.14, "#ffc53d"));
  // the brass-ring arm's post, outside the fence on the east
  p.push(slab(CAROUSEL.x + f + 0.8, 1.4, CAROUSEL.z, 0.3, 2.8, 0.3, "#c8a040"));
  return p;
}
