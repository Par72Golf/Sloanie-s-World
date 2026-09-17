import type { AABB } from "./collision";
import type { BoxProp, CylinderProp, Prop } from "./types";

/**
 * Sloanie's Zoo: six fenced enclosures round a loop walk, in the clear lawn
 * between Farmer Joe's farm and the mini golf. Pure data, no DOM and no
 * three.js, so the tools, the colliders and the meshes agree.
 *
 * Everything is authored in the zoo's own frame: x across (-14..14), z deep
 * (-12..12), the fence lines on whole numbers, the entrance arch in the middle
 * of the local -z fence. The frame is turned a half turn into the world, so
 * the arch opens onto the +z side, where the ring road, the farm spur and the
 * walkway that runs past the farm are. A half turn keeps every collider
 * axis-aligned.
 *
 * In the zoo's own frame (the world is this turned by a half turn, so local
 * -z is the +z side of the park, where the ring road and the farm spur are):
 *
 *            the way in (the road side of the park)              local -z
 *     +--------+------====ARCH====------+--------+   z -12
 *     |        |       plaza            |        |
 *     | zebra  |     +---------+        | monkey |
 *     |        |     | penguin |        |        |
 *     |        |     +---------+        |        |   (island z -5.5..-0.5)
 *     +--------+----+---------+---------+--------+   z 3
 *     | giraffe     | elephant|  lion            |
 *     +-------------+---------+------------------+   z 12
 *    x -14    -8   -4         4          8      14
 *
 * The walk is a loop round the penguin island: 6.5m of plaza, 4m either
 * side, 3.5m behind. Each enclosure has a plaque on its walk-side fence and
 * a standing spot in front of it.
 *
 * Fences are 1.1m: she cannot step onto them (0.62m step-up) and the camera
 * looks over them, but she jumps 2.7m, so the level needs the ZOO_NO_JUMP zone
 * (the carousel does the same). tools/zoo.ts proves the arithmetic.
 *
 * The art is zoo-mesh.ts; tools/zoo.ts proves the placement.
 */

/**
 * Zoo centre in the world, its fence-line size, and its half turn. The frame
 * is authored with the entrance on local -z and turned by PI into the world,
 * so the arch faces +z: the ring road, the farm spur and the walkway that
 * comes down past the farm are all on that side. A half turn keeps every box
 * axis-aligned (colliders ignore rotation).
 */
export const ZOO = { x: -15, z: -136, w: 28, d: 24, yaw: Math.PI };

/** Fence height and collider thickness; the arch posts. */
export const FENCE = { h: 1.1, t: 0.16 };
export const ARCH = { postX: 3.3, post: 0.5, postH: 4.2, z: -(ZOO.d / 2 - FENCE.t / 2) };

/** Ground tops: the walk (between TOP.apron and TOP.drive) and enclosure floors a band higher. */
export const GROUND = { walkTop: 0.06, penTop: 0.09, walk: "#d8c49a" };

export type AnimalId = "penguin" | "zebra" | "monkey" | "giraffe" | "elephant" | "lion";

export type Enclosure = {
  id: AnimalId;
  /** plaque title */
  name: string;
  /** fence-line rect in the zoo frame */
  rect: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** floor colour inside the fence */
  floor: string;
  /** plaque centre on its fence line (zoo frame) and the way it faces (rotation.y: 0 faces +z) */
  plaque: { x: number; z: number; yaw: number };
  /** fun facts, said one at a time in turn */
  facts: string[];
};

const PI = Math.PI;

export const ENCLOSURES: Enclosure[] = [
  {
    id: "penguin",
    name: "Penguins",
    rect: { minX: -4, maxX: 4, minZ: -5.5, maxZ: -0.5 },
    floor: "#eef6fa",
    plaque: { x: 0, z: -5.5, yaw: PI },
    facts: [
      "Penguins can't fly, but they zoom through the water like little rockets!",
      "Penguin dads keep the eggs warm on their feet!",
      "Some penguins slide on their tummies. It's called tobogganing!",
    ],
  },
  {
    id: "zebra",
    name: "Zebra",
    rect: { minX: -14, maxX: -8, minZ: -12, maxZ: 3 },
    floor: "#e0c48a",
    plaque: { x: -8, z: -3.5, yaw: PI / 2 },
    facts: [
      "Every zebra has its very own stripes. No two are the same!",
      "A baby zebra knows its mom by her stripes!",
      "Zebras sleep standing up!",
    ],
  },
  {
    id: "monkey",
    name: "Monkeys",
    rect: { minX: 8, maxX: 14, minZ: -12, maxZ: 3 },
    floor: "#8fbf62",
    plaque: { x: 8, z: -3.5, yaw: -PI / 2 },
    facts: [
      "Some monkeys can hang on with their tails, like a fifth hand!",
      "Monkeys groom each other to show they're friends!",
      "A group of monkeys is called a troop!",
    ],
  },
  {
    id: "giraffe",
    name: "Giraffe",
    rect: { minX: -14, maxX: -4, minZ: 3, maxZ: 12 },
    floor: "#e0c48a",
    plaque: { x: -6, z: 3, yaw: PI },
    facts: [
      "Giraffes are the tallest animals in the whole world!",
      "A giraffe's tongue is purple and as long as your arm!",
      "Giraffes only need about half an hour of sleep a day!",
    ],
  },
  {
    id: "elephant",
    name: "Elephant",
    rect: { minX: -4, maxX: 4, minZ: 3, maxZ: 12 },
    floor: "#b07a4a",
    plaque: { x: 0, z: 3, yaw: PI },
    facts: [
      "An elephant's trunk can pick up a single peanut!",
      "Elephants flap their big ears to cool down!",
      "Elephants give each other trunk hugs!",
    ],
  },
  {
    id: "lion",
    name: "Lion",
    rect: { minX: 4, maxX: 14, minZ: 3, maxZ: 12 },
    floor: "#cbb894",
    plaque: { x: 6, z: 3, yaw: PI },
    facts: [
      "A lion's roar can be heard 8 kilometres away!",
      "Lions nap for up to 20 hours a day. Big sleepy cats!",
      "Lion cubs are born with spots!",
    ],
  },
];

/** How far out from the plaque's fence she stands to read it. */
export const SPOT_OUT = 1.3;
/** Standing within this of a spot counts as at the plaque. */
export const SPOT_R = 1.8;

/** Zoo frame to world (the half turn: local +x and +z point at world -x and -z). */
export function zooToWorld(lx: number, lz: number): [number, number] {
  return [ZOO.x - lx, ZOO.z - lz];
}

/** World to the zoo frame. */
export function worldToZoo(x: number, z: number): [number, number] {
  return [ZOO.x - x, ZOO.z - z];
}

/** Where she stands to read an enclosure's plaque, zoo frame. */
export function plaqueSpotLocal(e: Enclosure): [number, number] {
  return [e.plaque.x + Math.sin(e.plaque.yaw) * SPOT_OUT, e.plaque.z + Math.cos(e.plaque.yaw) * SPOT_OUT];
}

/** Where she stands to read an enclosure's plaque, world. */
export function plaqueSpot(e: Enclosure): [number, number] {
  const [x, z] = plaqueSpotLocal(e);
  return zooToWorld(x, z);
}

/**
 * Every fence line in the zoo frame: a straight run along x (at z) or along z
 * (at x). Lines along x run their full length; lines along z are trimmed by
 * half a fence at each end where they butt into a line along x, so no two
 * colliders overlap.
 */
export type FenceLine = { along: "x" | "z"; at: number; from: number; to: number };

const H = ZOO.w / 2;
const D = ZOO.d / 2;
const A = ARCH.postX - ARCH.post / 2;
/**
 * The perimeter's centre lines are half a fence inside the zoo rect, so every
 * collider (fences are FENCE.t thick) lies inside the footprint: the zoo can
 * then sit 2m from the farm's and the mini golf's keepClear rects and mean it.
 */
const OX = H - FENCE.t / 2;
const OZ = D - FENCE.t / 2;
const T = FENCE.t / 2;

export const FENCE_LINES: FenceLine[] = [
  // north, either side of the arch posts
  { along: "x", at: -OZ, from: -OX - T, to: -A },
  { along: "x", at: -OZ, from: A, to: OX + T },
  // south
  { along: "x", at: OZ, from: -OX - T, to: OX + T },
  // the back row's front, across the whole zoo
  { along: "x", at: 3, from: -OX + T, to: OX - T },
  // the penguin island, front and back
  { along: "x", at: -5.5, from: -4 - T, to: 4 + T },
  { along: "x", at: -0.5, from: -4 - T, to: 4 + T },
  // west and east outer fences
  { along: "z", at: -OX, from: -OZ + T, to: 3 - T },
  { along: "z", at: -OX, from: 3 + T, to: OZ - T },
  { along: "z", at: OX, from: -OZ + T, to: 3 - T },
  { along: "z", at: OX, from: 3 + T, to: OZ - T },
  // zebra and monkey walk-side fences
  { along: "z", at: -8, from: -OZ + T, to: 3 - T },
  { along: "z", at: 8, from: -OZ + T, to: 3 - T },
  // back row dividers
  { along: "z", at: -4, from: 3 + T, to: OZ - T },
  { along: "z", at: 4, from: 3 + T, to: OZ - T },
  // the island's sides
  { along: "z", at: -4, from: -5.5 + T, to: -0.5 - T },
  { along: "z", at: 4, from: -5.5 + T, to: -0.5 - T },
];

/** A fence line's collider box in the zoo frame: [cx, cy, cz, sx, sy, sz]. */
export function fenceBoxLocal(f: FenceLine): [number, number, number, number, number, number] {
  const mid = (f.from + f.to) / 2;
  const len = f.to - f.from;
  return f.along === "x" ? [mid, FENCE.h / 2, f.at, len, FENCE.h, FENCE.t] : [f.at, FENCE.h / 2, mid, FENCE.t, FENCE.h, len];
}

/** The arch posts' collider boxes in the zoo frame. */
export function archBoxesLocal(): [number, number, number, number, number, number][] {
  return [-1, 1].map((s) => [s * ARCH.postX, ARCH.postH / 2, ARCH.z, ARCH.post, ARCH.postH, ARCH.post]);
}

/**
 * Axis-aligned colliders for every fence run and both arch posts, world
 * coords, with a label each. For colliders.ts: the drawn fences and posts are
 * zoo-mesh.ts, so these are not props.
 */
export function zooColliders(): (AABB & { label: string })[] {
  const out: (AABB & { label: string })[] = [];
  const add = ([cx, cy, cz, sx, sy, sz]: [number, number, number, number, number, number], label: string) => {
    const [x, z] = zooToWorld(cx, cz);
    out.push({ minX: x - sx / 2, maxX: x + sx / 2, minY: cy - sy / 2, maxY: cy + sy / 2, minZ: z - sz / 2, maxZ: z + sz / 2, label });
  };
  FENCE_LINES.forEach((f, i) => add(fenceBoxLocal(f), `zoo fence ${i}`));
  archBoxesLocal().forEach((b, i) => add(b, `zoo arch post ${i}`));
  return out;
}

/** The zoo's fence-line footprint in the world, grown by `pad`. */
export function zooFootprint(pad = 0) {
  return {
    minX: ZOO.x - H - pad,
    maxX: ZOO.x + H + pad,
    minZ: ZOO.z - D - pad,
    maxZ: ZOO.z + D + pad,
  };
}

/**
 * No jumping in or near the zoo. A boosted running jump lands on a 1.1m top
 * from 10.2m out (tuning.ts jumpReach at WALK x BOOST_MULTIPLIER), so the zone
 * is the fence line grown by 10.5m. Without it she would hop the fences, and
 * inside an enclosure she could not jump back out.
 */
export const ZOO_NO_JUMP = { ...zooFootprint(10.5), why: "the zoo" };

/** The penguin pool, zoo frame: centre and radius (inside the island). */
export const POOL = { x: 0.9, z: -3, r: 1.25 };

/**
 * Flat props for levels.ts: the walk slab under the whole zoo and each
 * enclosure's floor, plus the penguin pool as a water cylinder. They mask the
 * grass, get merged with the park, and are all floor-height (tops under 0.1m).
 */
export function zooProps(): Prop[] {
  const out: Prop[] = [];
  const slab = (x: number, z: number, sx: number, sz: number, top: number, color: string): BoxProp => {
    const h = 0.12;
    const [wx, wz] = zooToWorld(x, z);
    return { kind: "box", pos: [wx, top - h / 2, wz], size: [sx, h, sz], color, collide: false };
  };
  out.push(slab(0, 0, ZOO.w + 0.6, ZOO.d + 0.6, GROUND.walkTop, GROUND.walk));
  for (const e of ENCLOSURES) {
    const r = e.rect;
    const inset = FENCE.t / 2;
    out.push(slab((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2, r.maxX - r.minX - inset * 2, r.maxZ - r.minZ - inset * 2, GROUND.penTop, e.floor));
  }
  const [px, pz] = zooToWorld(POOL.x, POOL.z);
  const pool: CylinderProp = { kind: "cyl", pos: [px, GROUND.penTop + 0.02, pz], r: POOL.r, h: 0.06, color: "#6cb8d4", collide: false };
  out.push(pool);
  return out;
}

/** Enclosure containing a zoo-frame point (strictly inside its fence), or null. */
export function enclosureAtLocal(lx: number, lz: number, inset = 0): Enclosure | null {
  for (const e of ENCLOSURES) {
    const r = e.rect;
    if (lx > r.minX + inset && lx < r.maxX - inset && lz > r.minZ + inset && lz < r.maxZ - inset) return e;
  }
  return null;
}
