import type { AABB } from "./collision";
import type { BoxProp, Prop } from "./types";

/**
 * Emmett's home base: his monster truck, parked in a little dirt yard on the
 * east lawn inside the ring wall, between the walkway at x 40 and the east
 * gate. Pure data, no DOM and no three.js, so the tools and the runtime agree.
 *
 * Everything is authored in the yard's own frame (nose of the truck toward
 * local +x, yard 18m along local x by 14m along local z) and turned into the
 * world by `baseToWorld`. The truck's yaw is a multiple of PI/2 so every box
 * stays axis-aligned (colliders ignore rotation).
 *
 * The truck art is monster-truck.ts; it reads TRUCK and YARD_SOLIDS from here
 * so the meshes and the colliders cannot drift apart.
 * tools/emmett-base.ts proves the placement.
 */

/** Truck dimensions in its own frame: nose +x, wheels on the ground at y 0. */
export const TRUCK = {
  /** tyre radius (1.6m tyres) and width */
  wheelR: 0.8,
  wheelW: 0.7,
  /** wheel centres at x ±wheelX, z ±wheelZ */
  wheelX: 1.8,
  wheelZ: 1.3,
  /** outermost reach of a tyre with its lugs, radially (the lugs are the 1.6m), and of a hub cap along the axle */
  tyreReach: 0.8,
  hubReach: 1.73,
  /** bumper face to bumper face, halved */
  halfLength: 2.78,
  /** lower body: sides at z ±bodyHalfW, from bodyBottom to deckTop (hood and bed floor) */
  bodyHalfW: 1.15,
  bodyBottom: 1.8,
  deckTop: 2.5,
  /** the ladder sits on the +z side, its rails out to this z */
  ladderZ: 1.3,
  /** cab from cabMinX to cabMaxX; the flat roof slab tops out at roofTop */
  cabMinX: -1.0,
  cabMaxX: 0.9,
  cabHalfW: 1.1,
  roofTop: 3.15,
  /** where he sits on the roof (local x, z), behind the hatch */
  seat: [-0.45, 0] as [number, number],
} as const;

/** The dirt yard in the truck's frame, and the laps Emmett pedals round the truck. */
export const YARD = {
  /** along local x (the truck's length) and local z */
  length: 18,
  width: 14,
  /**
   * Radius of his home laps round the truck centre. Clears the truck's corners
   * (3.3m) by a trike length, and every solid yard prop by at least a metre.
   */
  loop: 5,
};

/**
 * Solid yard pieces, in the yard's frame. Each is a box collider that sits
 * wholly inside its drawn shape in makeTruckYard, so the world builder's own
 * box for it is hidden and the collider matches what she sees.
 *   tyres: a stack of `count` tyres centred at (x, z); the core box is 0.92m square
 *   ramp:  a kicker ramp rising toward +x from x - len/2 to x + len/2, `h` tall at the lip
 *   toybox: a toy box `w` along x, `d` along z, `h` tall
 */
export type YardSolid =
  | { kind: "tyres"; x: number; z: number; count: 2 | 3 }
  | { kind: "ramp"; x: number; z: number; len: number; w: number; h: number }
  | { kind: "toybox"; x: number; z: number; w: number; d: number; h: number };

export const YARD_SOLIDS: YardSolid[] = [
  { kind: "tyres", x: -7.3, z: -5.1, count: 3 },
  { kind: "tyres", x: -7.5, z: 4.9, count: 2 },
  { kind: "ramp", x: 5.8, z: -5.3, len: 2.4, w: 1.3, h: 0.6 },
  { kind: "toybox", x: 7.3, z: 5.0, w: 1.3, d: 0.8, h: 0.7 },
];

/** Tyre stack art: tyre centre-line radius, tube radius and vertical pitch. */
export const TYRE_STACK = { ring: 0.52, tube: 0.3, pitch: 0.5, core: 0.92 };

export const EMMETT_BASE = {
  /** yard centre and truck position; yaw -PI/2 turns the nose south (+z) */
  x: 50.5,
  z: -9,
  yaw: -Math.PI / 2,
  /** where Emmett sits on the roof while hanging out, world coords (y = roof top) */
  roofSeat: [0, 0, 0] as [number, number, number],
  /** where his tricycle parks beside the truck, world coords on the ground */
  trikePark: [0, 0, 0] as [number, number, number],
  /** where Sloan stands to talk to him, world coords on the ground */
  talkSpot: [0, 0, 0] as [number, number, number],
  /** radius of his home laps round (x, z) */
  loop: YARD.loop,
};

/** Where a park puts the yard: its centre and the truck's quarter turn. */
export type BaseOrigin = { x: number; z: number; yaw: number };

/** Where the yard sits when a park does not say otherwise: park 1's. */
const BASE_HOME = { x: EMMETT_BASE.x, z: EMMETT_BASE.z, yaw: EMMETT_BASE.yaw };

/** sin and cos of a frame's yaw, snapped to exact integers (the yaw is a quarter turn). */
function yawTrig(o: { yaw: number }): [number, number] {
  return [Math.round(Math.sin(o.yaw)), Math.round(Math.cos(o.yaw))];
}

/** A point in the yard's frame to world x, z (the same turn three.js applies for rotation.y = yaw). */
export function baseToWorld(lx: number, lz: number, o: BaseOrigin = EMMETT_BASE): [number, number] {
  const [s, c] = yawTrig(o);
  return [o.x + lx * c + lz * s, o.z - lx * s + lz * c];
}

/** A box in the yard's frame (centre and size along local x and z) to a world rect. */
function rectToWorld(cx: number, cz: number, sx: number, sz: number, o: BaseOrigin = EMMETT_BASE) {
  const [x, z] = baseToWorld(cx, cz, o);
  const quarter = Math.abs(yawTrig(o)[0]) === 1;
  const wx = quarter ? sz : sx;
  const wz = quarter ? sx : sz;
  return { minX: x - wx / 2, maxX: x + wx / 2, minZ: z - wz / 2, maxZ: z + wz / 2 };
}

/**
 * Move the yard. The three spots he uses are world coordinates he is steered
 * to every frame, so they are recomputed here rather than at use; keep the yaw
 * a multiple of PI/2 or the truck's colliders stop being axis-aligned.
 */
export function setEmmettBase(o: BaseOrigin = BASE_HOME) {
  EMMETT_BASE.x = o.x;
  EMMETT_BASE.z = o.z;
  EMMETT_BASE.yaw = o.yaw;
  const [sx, sz] = baseToWorld(TRUCK.seat[0], TRUCK.seat[1]);
  EMMETT_BASE.roofSeat = [sx, TRUCK.roofTop, sz];
  // his trike beside the ladder's foot, behind the rear wheel on the ladder side
  const [px, pz] = baseToWorld(-2.2, 2.7);
  EMMETT_BASE.trikePark = [px, 0, pz];
  // out beyond his laps on the ladder side, looking up at him on the roof
  const [tx, tz] = baseToWorld(0.4, 6.1);
  EMMETT_BASE.talkSpot = [tx, 0, tz];
}

setEmmettBase();

/** Local-frame collider boxes for the truck: [cx, cy, cz, sx, sy, sz]. */
function truckBoxesLocal(): [number, number, number, number, number, number][] {
  const T = TRUCK;
  const top = T.wheelR + T.tyreReach;
  const out: [number, number, number, number, number, number][] = [];
  // lower body from the ground to the deck (the chassis, springs and axles are in there too);
  // wide enough for the ladder on the +z side
  out.push([0, T.deckTop / 2, 0, T.halfLength * 2, T.deckTop, T.ladderZ * 2]);
  // the cab, whose flat roof is where he sits
  out.push([(T.cabMinX + T.cabMaxX) / 2, (T.deckTop + T.roofTop) / 2, 0, T.cabMaxX - T.cabMinX, T.roofTop - T.deckTop, T.cabHalfW * 2]);
  // each wheel pair, axle to hub caps
  for (const wx of [-T.wheelX, T.wheelX]) out.push([wx, top / 2, 0, T.tyreReach * 2, top, T.hubReach * 2]);
  return out;
}

/** Axis-aligned colliders for the truck (body block, cab, each wheel pair), world coords. */
export function truckColliders(o: BaseOrigin = EMMETT_BASE): AABB[] {
  return truckBoxesLocal().map(([cx, cy, cz, sx, sy, sz]) => {
    const r = rectToWorld(cx, cz, sx, sz, o);
    return { minX: r.minX, maxX: r.maxX, minY: cy - sy / 2, maxY: cy + sy / 2, minZ: r.minZ, maxZ: r.maxZ };
  });
}

/** The yard's collider boxes in its own frame: [cx, cy, cz, sx, sy, sz] with a label. */
export function yardBoxesLocal(): { box: [number, number, number, number, number, number]; label: string }[] {
  const out: { box: [number, number, number, number, number, number]; label: string }[] = [];
  for (const s of YARD_SOLIDS) {
    if (s.kind === "tyres") {
      // core hidden inside the stack: the top shows through the tyres' hole as the dark inside
      const h = TYRE_STACK.pitch * (s.count - 1) + TYRE_STACK.tube * 2 - 0.15;
      out.push({ box: [s.x, h / 2, s.z, TYRE_STACK.core, h, TYRE_STACK.core], label: `tyre stack (${s.count})` });
    } else if (s.kind === "ramp") {
      // steps under the sloped deck: each tops out 2cm under the slope at its low end
      const n = 6;
      const seg = s.len / n;
      for (let k = 1; k < n; k++) {
        const top = (s.h * k) / n - 0.02;
        const cx = s.x - s.len / 2 + seg * (k + 0.5);
        out.push({ box: [cx, top / 2, s.z, seg * 0.98, top, s.w - 0.06], label: `ramp step ${k}` });
      }
    } else {
      out.push({ box: [s.x, (s.h - 0.02) / 2, s.z, s.w - 0.04, s.h - 0.02, s.d - 0.04], label: "toy box" });
    }
  }
  return out;
}

/**
 * Solid yard pieces as box props in world coords, for the world builder to add
 * to the level: their colliders come from colliders.ts like everything else.
 * The builder also draws a box for each; every one is sized to sit inside the
 * tyre stack, ramp or toy box that makeTruckYard draws over it.
 */
export function yardProps(o: BaseOrigin = EMMETT_BASE, flavour: "park" | "candy" = "park"): Prop[] {
  // each of these sits inside the shape makeTruckYard draws over it, so the
  // colour only shows if something has gone wrong — but a brown box peeking
  // out of a wafer ramp would still be the wrong brown
  const HIDDEN = {
    park: { tyre: "#2a2724", ramp: "#b88a50", box: "#d8453a" },
    candy: { tyre: "#2a2430", ramp: "#d4b483", box: "#ff6aa8" },
  }[flavour];
  return yardBoxesLocal().map(({ box: [cx, cy, cz, sx, sy, sz], label }): BoxProp => {
    const r = rectToWorld(cx, cz, sx, sz, o);
    const color = label.startsWith("tyre") ? HIDDEN.tyre : label.startsWith("ramp") ? HIDDEN.ramp : HIDDEN.box;
    return {
      kind: "box",
      pos: [(r.minX + r.maxX) / 2, cy, (r.minZ + r.maxZ) / 2],
      size: [r.maxX - r.minX, sy, r.maxZ - r.minZ],
      color,
      collide: true,
    };
  });
}

/** The 18m x 14m dirt yard as a world rect, for a keepClear entry in levels.ts. */
export function yardFootprint(o: BaseOrigin = EMMETT_BASE) {
  return rectToWorld(0, 0, YARD.length, YARD.width, o);
}
