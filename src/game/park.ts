import type { BoxProp, CylinderProp, Prop } from "./types";
import { SPLASH_BUCKET, SPLASH_FLOWERS, SPLASH_RADIUS } from "./splash";

/**
 * Park zone builders. Everything here composes from the primitive prop kinds
 * the world builder already understands, so no engine changes are needed.
 *
 * Convention: flat surfaces are collide:false so she can walk on them, anything
 * with real height collides. Rotated props stay flat, because colliders are
 * axis-aligned boxes and a rotated collider would be wrong.
 */

function box(
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  color: string,
  collide = true,
  extra?: Partial<BoxProp>,
): BoxProp {
  return { kind: "box", pos: [x, y, z], size: [sx, sy, sz], color, collide, ...extra };
}

function cyl(
  x: number,
  y: number,
  z: number,
  r: number,
  h: number,
  color: string,
  collide = true,
): CylinderProp {
  return { kind: "cyl", pos: [x, y, z], r, h, color, collide };
}

/**
 * Flat surfaces are stacked by top-face height. Two overlapping surfaces that
 * share a top face will z-fight, so every class gets its own band.
 */
const TOP = {
  lawn: 0.03,
  apron: 0.05,
  drive: 0.08,
  path: 0.10,
  court: 0.13,
  inner: 0.16,
  line: 0.19,
  mark: 0.22,
};

/** Flat slab described by the height of its visible top face. */
function surf(
  x: number,
  top: number,
  z: number,
  sx: number,
  sz: number,
  color: string,
  h = 0.12,
  extra?: Partial<BoxProp>,
): BoxProp {
  return { kind: "box", pos: [x, top - h / 2, z], size: [sx, h, sz], color, collide: false, ...extra };
}

/** Flat disc described the same way. */
function disc(x: number, top: number, z: number, r: number, color: string, h = 0.12): CylinderProp {
  return { kind: "cyl", pos: [x, top - h / 2, z], r, h, color, collide: false };
}

const C = {
  courtBlue: "#3f7fa8",
  courtGreen: "#4a9a68",
  line: "#f2f4ef",
  fence: "#8fa3a8",
  dirt: "#b07a4a",
  sand: "#e0c48a",
  rubber: "#5a7f9a",
  rubberWarm: "#c4674a",
  chrome: "#b8c2c8",
  water: "#6cbcd8",
  wood: "#8a5a32",
  woodLight: "#c49a62",
  paint: "#d45a4a",
};

/* ------------------------------------------------------------------ tennis */

export function tennisCourts(cx: number, cz: number, count = 2): Prop[] {
  const p: Prop[] = [];
  const cw = 11; // court width
  const cl = 24; // court length
  const gap = 3.5;
  const totalW = count * cw + (count - 1) * gap;

  // surround apron
  p.push(surf(cx, TOP.apron, cz, totalW + 6, cl + 7, C.courtGreen));

  for (let i = 0; i < count; i++) {
    const x = cx - totalW / 2 + cw / 2 + i * (cw + gap);

    // playing surface
    p.push(surf(x, TOP.court, cz, cw, cl, C.courtBlue));

    // boundary lines
    p.push(surf(x, TOP.line, cz - cl / 2 + 0.1, cw, 0.2, C.line, 0.05));
    p.push(surf(x, TOP.line, cz + cl / 2 - 0.1, cw, 0.2, C.line, 0.05));
    p.push(surf(x - cw / 2 + 0.1, TOP.line, cz, 0.2, cl, C.line, 0.05));
    p.push(surf(x + cw / 2 - 0.1, TOP.line, cz, 0.2, cl, C.line, 0.05));
    // service boxes
    p.push(surf(x, TOP.mark, cz - cl / 4, cw - 2.4, 0.18, C.line, 0.05));
    p.push(surf(x, TOP.mark, cz + cl / 4, cw - 2.4, 0.18, C.line, 0.05));
    p.push(surf(x, TOP.mark, cz, 0.18, cl / 2, C.line, 0.05));

    // net: posts plus a sagging band, plus the white tape along the top
    p.push(box(x - cw / 2 - 0.3, 0.55, cz, 0.28, 1.1, 0.28, "#5a6a70"));
    p.push(box(x + cw / 2 + 0.3, 0.55, cz, 0.28, 1.1, 0.28, "#5a6a70"));
    p.push(box(x, 0.46, cz, cw + 0.6, 0.86, 0.14, "#3a4448", false));
    p.push(box(x, 0.9, cz, cw + 0.6, 0.1, 0.14, C.line, false));

    // a ball or two left behind
    p.push(cyl(x + 3.2, 0.14, cz + 7.4, 0.16, 0.28, "#d8e84a", false));
  }

  // chain-link surround, low enough to see over but reads as a fence
  const fw = totalW + 6;
  const fl = cl + 7;
  const fh = 3.2;
  const t = 0.16;
  const MESH = 0.72; // opaque enough to read as a fence from a distance
  p.push(box(cx, fh / 2, cz - fl / 2, fw, fh, t, C.fence, true, { opacity: MESH }));
  p.push(box(cx, fh / 2, cz + fl / 2, fw, fh, t, C.fence, true, { opacity: MESH }));
  p.push(box(cx + fw / 2, fh / 2, cz, t, fh, fl, C.fence, true, { opacity: MESH }));
  // gate on the park-facing side
  p.push(box(cx - fw / 2, fh / 2, cz + fl / 4, t, fh, fl / 2, C.fence, true, { opacity: MESH }));
  // solid top and mid rails so the edge of the fence is always visible
  for (const [z, len] of [
    [cz - fl / 2, fw],
    [cz + fl / 2, fw],
  ] as [number, number][]) {
    p.push(box(cx, fh, z, len, 0.22, t + 0.14, "#6f8288", false));
    p.push(box(cx, fh * 0.55, z, len, 0.14, t + 0.1, "#6f8288", false));
  }
  p.push(box(cx + fw / 2, fh, cz, t + 0.14, 0.22, fl, "#6f8288", false));
  p.push(box(cx + fw / 2, fh * 0.55, cz, t + 0.1, 0.14, fl, "#6f8288", false));
  p.push(box(cx - fw / 2, fh, cz + fl / 4, t + 0.14, 0.22, fl / 2, "#6f8288", false));
  // posts read as solid so the fence does not look like floating glass
  for (let i = -2; i <= 2; i++) {
    p.push(box(cx + (i * fw) / 4, fh / 2, cz - fl / 2, 0.26, fh, 0.26, "#6f8288"));
    p.push(box(cx + (i * fw) / 4, fh / 2, cz + fl / 2, 0.26, fh, 0.26, "#6f8288"));
  }

  // courtside bench
  p.push(box(cx, 0.42, cz + fl / 2 - 2.2, 3.2, 0.2, 0.7, C.woodLight));
  p.push(box(cx - 1.4, 0.21, cz + fl / 2 - 2.2, 0.2, 0.42, 0.6, "#6a7a80"));
  p.push(box(cx + 1.4, 0.21, cz + fl / 2 - 2.2, 0.2, 0.42, 0.6, "#6a7a80"));

  return p;
}

/* --------------------------------------------------------------- baseball */

export function baseballDiamond(cx: number, cz: number, flip = false): Prop[] {
  const p: Prop[] = [];
  const f = flip ? -1 : 1;
  const Z = (off: number) => cz + f * off;

  // outfield apron
  p.push(surf(cx, TOP.lawn, Z(-6), 56, 52, "#58a85c"));

  // infield: a square turned 45 degrees is the diamond
  p.push(surf(cx, TOP.apron, Z(-9), 19, 19, C.dirt, 0.12, { ry: Math.PI / 4 }));
  // grass centre of the infield
  p.push(surf(cx, TOP.court, Z(-9), 11.5, 11.5, "#61b065", 0.12, { ry: Math.PI / 4 }));

  // bases
  const bases: [number, number][] = [
    [cx, Z(0)],
    [cx + 9.2, Z(-9.2)],
    [cx, Z(-18.4)],
    [cx - 9.2, Z(-9.2)],
  ];
  for (const [bx, bz] of bases) {
    p.push(surf(bx, TOP.mark, bz, 1.3, 1.3, C.line, 0.06));
  }
  // home plate dirt circle and the mound
  p.push(disc(cx, TOP.inner, Z(0.6), 3.4, C.dirt));
  p.push(disc(cx, TOP.inner + 0.18, Z(-9.2), 2.6, C.dirt, 0.34));
  p.push(surf(cx, TOP.inner + 0.24, Z(-9.2), 0.7, 0.5, C.line, 0.05));

  // foul lines running out from home
  for (const s of [-1, 1]) {
    for (let i = 1; i < 22; i++) {
      p.push(
        surf(cx + s * i * 1.1, TOP.line, Z(-i * 1.1), 0.9, 0.16, C.line, 0.05, {
          ry: (s * Math.PI) / 4,
        }),
      );
    }
  }

  // backstop
  const bh = 4.2;
  p.push(box(cx, bh / 2, Z(5.4), 14, bh, 0.16, C.fence, true, { opacity: 0.72 }));
  p.push(box(cx - 7, bh / 2, Z(3.4), 0.16, bh, 4.4, C.fence, true, { opacity: 0.72 }));
  p.push(box(cx + 7, bh / 2, Z(3.4), 0.16, bh, 4.4, C.fence, true, { opacity: 0.72 }));
  // rails and a padded top cap, so it reads solid from home plate
  p.push(box(cx, bh, Z(5.4), 14.4, 0.26, 0.34, "#6f8288", false));
  p.push(box(cx, bh * 0.55, Z(5.4), 14.4, 0.16, 0.26, "#6f8288", false));
  p.push(box(cx - 7, bh - 0.04, Z(3.2), 0.34, 0.26, 4.2, "#6f8288", false));
  p.push(box(cx + 7, bh - 0.04, Z(3.2), 0.34, 0.26, 4.2, "#6f8288", false));
  p.push(box(cx, bh + 0.2, Z(5.4), 14.4, 0.2, 0.42, "#c4574a", false));
  for (let i = -3; i <= 3; i++) {
    p.push(box(cx + i * 2.3, bh / 2, Z(5.4), 0.24, bh, 0.24, "#6f8288"));
  }

  // dugouts
  for (const s of [-1, 1]) {
    const dx = cx + s * 12;
    p.push(surf(dx, TOP.court, Z(1.5), 7, 2.6, "#cfc6b4"));
    p.push(box(dx, 0.5, Z(2.4), 7, 0.9, 0.3, C.wood));
    p.push(box(dx, 0.45, Z(1.1), 6, 0.2, 0.8, C.woodLight));
    p.push(box(dx, 1.9, Z(1.5), 7.4, 0.2, 3, "#4f93c4"));
    p.push(box(dx - 3.3, 1.05, Z(1.5), 0.22, 1.8, 0.22, "#8a9aa4"));
    p.push(box(dx + 3.3, 1.05, Z(1.5), 0.22, 1.8, 0.22, "#8a9aa4"));
  }

  // bleachers behind the backstop
  // Rows step back and up, away from the field. They previously marched toward
  // home plate and the last row sat inside the backstop.
  for (let i = 0; i < 4; i++) {
    const z = Z(8.6 + i * 0.95);
    p.push(box(cx, 0.4 + i * 0.44, z, 12, 0.18, 0.85, "#b8a890"));
    p.push(box(cx, (0.4 + i * 0.44) / 2, z + (flip ? 0.42 : -0.42), 12, 0.4 + i * 0.44, 0.14, "#8a9aa4"));
  }
  // side rails so the stand reads as a structure
  for (const sx of [-1, 1]) {
    p.push(box(cx + sx * 6.1, 1.5, Z(10.5), 0.16, 1.1, 4.4, "#6f8288", false));
  }

  return p;
}

/* -------------------------------------------------------------- splash pad */

/**
 * Splash pad, reworked bigger. Three arches in a row whose spray the runtime
 * animates in sequence (makeSprayArches; the posts here are the solid part),
 * twelve ground jets in two rings, a tipping bucket, flower sprinklers and a
 * little slide (a composite mesh placed by world-build at cx+10, cz-7).
 */
export function splashPad(cx: number, cz: number): Prop[] {
  const p: Prop[] = [];

  // Ground under the pad. The painted deck, the ground jets, the tipping
  // bucket and the flower sprinklers are an animated composite on top
  // (makeSplashPad, placed by level.splash); this disc keeps the grass off
  // and draws the pad on the minimap.
  p.push(disc(cx, TOP.apron, cz, SPLASH_RADIUS, "#9fd0dc"));

  // three arches in a row across the pad; the spray itself is animated
  for (const ax of [-6, 0, 6]) {
    for (const s of [-1, 1]) {
      p.push(cyl(cx + ax + s * 3, 1.6, cz, 0.3, 3.2, C.paint));
      p.push(box(cx + ax + s * 2.1, 3.15, cz, 2.2, 0.3, 0.3, C.paint));
    }
    p.push(box(cx + ax, 3.4, cz, 2.6, 0.3, 0.3, C.paint));
  }

  // the tipping bucket's pole (the bucket and arm are animated)
  p.push(cyl(cx + SPLASH_BUCKET.x, 1.9, cz + SPLASH_BUCKET.z, 0.28, 3.8, C.chrome));

  // toddler sprinkler flowers: stem and petals solid, spray animated
  for (const [fx, fz, col] of SPLASH_FLOWERS) {
    p.push(cyl(cx + fx, 0.75, cz + fz, 0.16, 1.5, "#4a8a5a"));
    p.push(cyl(cx + fx, 1.55, cz + fz, 0.85, 0.22, col, true));
    p.push(cyl(cx + fx, 1.68, cz + fz, 0.3, 0.14, "#f7f3e4", false));
  }

  // changing bench and a towel rail
  p.push(box(cx + 9.5, 0.45, cz + 2, 0.8, 0.2, 4, C.woodLight));
  p.push(box(cx + 9.5, 0.22, cz + 0.4, 0.6, 0.45, 0.2, C.chrome));
  p.push(box(cx + 9.5, 0.22, cz + 3.6, 0.6, 0.45, 0.2, C.chrome));

  return p;
}

/* -------------------------------------------------------------- campground */

/**
 * Three tents around a fire ring (the fire itself is a composite placed by
 * world-build at cx, cz), a picnic table, a cooler, a hammock slung between
 * two posts, and a woodpile.
 */
export function campground(cx: number, cz: number): Prop[] {
  const p: Prop[] = [];
  p.push(surf(cx, TOP.lawn, cz, 30, 26, "#6aae5c"));
  // trampled dirt around the fire
  p.push(disc(cx, TOP.apron, cz, 3.6, "#a08a6a"));
  p.push({ kind: "tent", x: cx - 7, z: cz - 4, color: "#e8734a" });
  p.push({ kind: "tent", x: cx + 7, z: cz - 5, color: "#4f93c4" });
  p.push({ kind: "tent", x: cx + 1, z: cz + 8, color: "#3fa35c" });
  // log seats around the fire (axis-aligned so their colliders match)
  for (const [lx, lz, w, d] of [
    [cx - 3, cz, 0.6, 1.8],
    [cx + 3, cz, 0.6, 1.8],
    [cx, cz - 3, 1.8, 0.6],
  ] as [number, number, number, number][]) {
    p.push(box(lx, 0.25, lz, w, 0.5, d, C.wood));
  }
  // picnic table
  const tx = cx - 9;
  const tz = cz + 6;
  p.push(box(tx, 0.75, tz, 2.6, 0.18, 1.3, C.woodLight));
  p.push(box(tx, 0.45, tz - 1.1, 2.6, 0.16, 0.6, C.woodLight));
  p.push(box(tx, 0.45, tz + 1.1, 2.6, 0.16, 0.6, C.woodLight));
  p.push(box(tx - 1.1, 0.37, tz, 0.2, 0.75, 1.2, C.wood));
  p.push(box(tx + 1.1, 0.37, tz, 0.2, 0.75, 1.2, C.wood));
  // cooler and lantern
  p.push(box(tx + 2.4, 0.3, tz + 0.2, 0.8, 0.6, 0.55, "#4f93c4"));
  p.push(box(tx + 2.4, 0.64, tz + 0.2, 0.82, 0.08, 0.57, "#f7f3ee", false));
  p.push(box(tx - 0.4, 0.98, tz, 0.3, 0.28, 0.3, "#d8d0c4", false));
  // hammock between two posts
  const hx = cx + 10;
  const hz = cz + 5;
  p.push(box(hx - 2.2, 1.0, hz, 0.3, 2.0, 0.3, C.wood));
  p.push(box(hx + 2.2, 1.0, hz, 0.3, 2.0, 0.3, C.wood));
  p.push(box(hx, 0.82, hz, 3.2, 0.14, 1.0, "#e8c46a"));
  p.push(box(hx - 1.9, 1.2, hz, 0.6, 0.06, 0.06, "#f7f3ee", false));
  p.push(box(hx + 1.9, 1.2, hz, 0.6, 0.06, 0.06, "#f7f3ee", false));
  // woodpile
  for (let i = 0; i < 3; i++) {
    p.push(box(cx - 10 + i * 0.05, 0.22 + i * 0.36, cz - 8, 1.6 - i * 0.3, 0.36, 0.45, i % 2 ? "#7a5232" : C.wood));
  }
  return p;
}

/* ---------------------------------------------------------------- pavilion */

/**
 * Open roofed shelter: six posts and a big roof, tables underneath. The roof
 * is a solid slab well above her head, so the camera treats it as indoors
 * (short boom) while she is under it, which is the right call.
 */
export function pavilion(cx: number, cz: number): Prop[] {
  const p: Prop[] = [];
  p.push(surf(cx, TOP.apron, cz, 14, 11, "#cfc6b4"));
  for (const x of [-5.5, 0, 5.5]) {
    for (const z of [-4, 4]) {
      p.push(box(cx + x, 1.7, cz + z, 0.36, 3.4, 0.36, C.wood));
    }
  }
  p.push(box(cx, 3.55, cz, 14.5, 0.3, 11.5, "#a05040"));
  p.push(box(cx, 4.05, cz, 9, 0.7, 6, "#8a4030", false));
  p.push(box(cx, 4.5, cz, 3.5, 0.2, 2.5, "#8a4030", false));
  for (const x of [-4, 4]) {
    p.push(box(cx + x, 0.75, cz, 2.6, 0.18, 1.3, C.woodLight));
    p.push(box(cx + x, 0.45, cz - 1.1, 2.6, 0.16, 0.6, C.woodLight));
    p.push(box(cx + x, 0.45, cz + 1.1, 2.6, 0.16, 0.6, C.woodLight));
    p.push(box(cx + x - 1.1, 0.37, cz, 0.2, 0.75, 1.2, C.wood));
    p.push(box(cx + x + 1.1, 0.37, cz, 0.2, 0.75, 1.2, C.wood));
  }
  // noticeboard on one post
  p.push(box(cx - 5.5, 1.6, cz - 4.4, 1.2, 0.9, 0.08, "#e8d7b8", false));
  return p;
}

/* -------------------------------------------------------------------- pool */

/**
 * Outdoor pool behind the houses. A raised deck with a rim, water inside it
 * (liquid colour, so no collider; the level adds water zones so she swims
 * slowly), lane ropes, a diving board, a lifeguard chair, loungers, a kiddie
 * pool and a changing hut.
 */
export function swimmingPool(cx: number, cz: number): Prop[] {
  const p: Prop[] = [];
  p.push(surf(cx, TOP.apron, cz, 34, 22, "#dcd6c8"));
  // rim around a 20x10 pool, as four low walls she can step over
  const w = 20;
  const d = 10;
  p.push(box(cx, 0.25, cz - d / 2 - 0.3, w + 1.2, 0.5, 0.6, "#c8dbe8"));
  p.push(box(cx, 0.25, cz + d / 2 + 0.3, w + 1.2, 0.5, 0.6, "#c8dbe8"));
  p.push(box(cx - w / 2 - 0.3, 0.25, cz, 0.6, 0.5, d, "#c8dbe8"));
  p.push(box(cx + w / 2 + 0.3, 0.25, cz, 0.6, 0.5, d, "#c8dbe8"));
  // water, slightly below the rim
  p.push(box(cx, 0.2, cz, w, 0.4, d, "#5aa8c8", false));
  p.push(box(cx, 0.42, cz, w - 0.4, 0.04, d - 0.4, "#6cb8d4", false));
  // lane ropes
  for (let i = -1; i <= 1; i++) {
    p.push(box(cx, 0.47, cz + i * 2.5, w - 0.6, 0.06, 0.08, i === 0 ? "#e8455f" : "#ffc53d", false));
  }
  // diving board at the deep end
  p.push(box(cx - w / 2 - 2.2, 0.55, cz, 0.5, 1.1, 0.5, C.chrome));
  p.push(box(cx - w / 2 - 1.2, 1.15, cz, 3.2, 0.12, 0.6, "#4f93c4"));
  p.push(box(cx - w / 2 - 2.6, 0.75, cz, 0.4, 0.3, 0.4, C.chrome, false));
  // ladders
  for (const s of [-1, 1]) {
    p.push(box(cx + w / 2 + 0.9, 0.6, cz + s * 3, 0.08, 1.2, 0.08, C.chrome, false));
    p.push(box(cx + w / 2 + 0.9, 0.6, cz + s * 3 + 0.5, 0.08, 1.2, 0.08, C.chrome, false));
  }
  // lifeguard chair
  p.push(box(cx + 6, 1.4, cz - d / 2 - 3, 0.9, 2.8, 0.9, "#f7f3ee"));
  p.push(box(cx + 6, 3.0, cz - d / 2 - 3, 1.2, 0.5, 1.1, "#e8455f", false));
  p.push(box(cx + 6, 2.5, cz - d / 2 - 3.3, 0.14, 1.0, 0.14, "#e8455f", false));
  // loungers along the far side
  for (let i = 0; i < 4; i++) {
    const lx = cx - 7 + i * 4.5;
    p.push(box(lx, 0.3, cz + d / 2 + 3, 0.9, 0.2, 2.2, "#f7f3ee"));
    p.push(box(lx, 0.65, cz + d / 2 + 3.9, 0.9, 0.5, 0.2, "#f7f3ee", false));
    p.push(box(lx, 0.42, cz + d / 2 + 3, 0.8, 0.06, 2.0, i % 2 ? "#4f93c4" : "#ffc53d", false));
  }
  // kiddie pool
  p.push(disc(cx + 12, TOP.inner, cz + 7, 2.6, "#c8dbe8", 0.4));
  p.push(disc(cx + 12, TOP.inner + 0.02, cz + 7, 2.2, "#9fd4ea", 0.3));
  // changing hut
  p.push({ kind: "house", x: cx + 13, z: cz - 7, body: "#f3eadc", roof: "#4f93c4", w: 5, d: 4 });
  return p;
}

/* --------------------------------------------------------------------- gym */

/**
 * Kids' ninja course, built to be played on rather than looked at: two
 * trampolines (walk on to bounce, tap jump as she lands for a big one), a
 * tyre run, stepping posts that climb and fall, a balance beam, and a
 * climbing wall of chunky steps up to a lookout platform with a fireman's
 * pole. Every step is under the 0.62m step-up, so nothing needs a precise
 * jump. Thin rails and the pole are non-colliding and under 0.35m.
 */
export function outdoorGym(cx: number, cz: number): Prop[] {
  const p: Prop[] = [];
  p.push(surf(cx, TOP.apron, cz, 26, 18, C.rubber));

  // trampolines, west end
  p.push({ kind: "trampoline", x: cx - 8.5, z: cz - 4, w: 3.6, d: 3.6 });
  p.push({ kind: "trampoline", x: cx - 8.5, z: cz + 3, w: 3.6, d: 3.6 });

  // tyre run: two staggered rows along the north edge
  for (let i = 0; i < 5; i++) {
    p.push({ kind: "tyre", x: cx - 3.5 + i * 1.6, z: cz - 6.6, r: 0.62 });
    p.push({ kind: "tyre", x: cx - 2.7 + i * 1.6, z: cz - 5.1, r: 0.62 });
  }

  // stepping posts: up, over the tall one, and down again
  // Wide enough to land on at running speed (a cyl collides at 1.6r across),
  // and each one no more than a step-up above the last, so she can walk the
  // whole row or hop between them.
  const posts = [0.3, 0.55, 0.8, 1.05, 0.8, 0.55, 0.3];
  const postCol = ["#ffc53d", "#e8455f", "#3fa35c", "#4f93c4", "#3fa35c", "#e8455f", "#ffc53d"];
  posts.forEach((h, i) => {
    p.push(cyl(cx - 3.8 + i * 1.45, h / 2, cz + 0.2, 0.66, h, postCol[i]!));
  });

  // balance beam on two low trestles, south edge
  p.push(box(cx - 1, 0.28, cz + 5.6, 7.5, 0.56, 0.36, C.wood));
  p.push(box(cx - 4.2, 0.12, cz + 5.6, 0.3, 0.24, 1.2, C.woodLight, false));
  p.push(box(cx + 2.2, 0.12, cz + 5.6, 0.3, 0.24, 1.2, C.woodLight, false));

  // climbing tower, east end: steps rise west to east onto a 2.4m deck
  const tx = cx + 9;
  const tz = cz - 1;
  const hold = ["#e8455f", "#ffc53d", "#3fa35c", "#4f93c4", "#d47a96"];
  [0.6, 1.2, 1.8].forEach((h, i) => {
    const sx = tx - 3.3 + i * 0.9;
    p.push(box(sx, h / 2, tz, 0.9, h, 3, "#f0e6d2"));
    // chunky holds on each riser (decoration only)
    for (let k = 0; k < 3; k++) {
      p.push(box(sx - 0.47, h - 0.3, tz - 1 + k, 0.1, 0.18, 0.24, hold[(i + k) % hold.length]!, false));
    }
  });
  // deck on four posts, open underneath
  p.push(box(tx, 2.25, tz, 3, 0.3, 3, C.woodLight));
  for (const [ox, oz] of [
    [-1.35, -1.35],
    [1.35, -1.35],
    [-1.35, 1.35],
    [1.35, 1.35],
  ]) {
    p.push(box(tx + ox, 1.05, tz + oz, 0.22, 2.1, 0.22, C.paint));
  }
  // rails on the three open sides, and a flag
  p.push(box(tx, 2.95, tz - 1.45, 3, 0.08, 0.08, C.chrome, false));
  p.push(box(tx, 2.95, tz + 1.45, 3, 0.08, 0.08, C.chrome, false));
  p.push(box(tx + 1.45, 2.95, tz, 0.08, 0.08, 3, C.chrome, false));
  p.push(box(tx + 1.35, 3.4, tz - 1.35, 0.1, 2.0, 0.1, C.chrome, false));
  p.push(box(tx + 1.35, 4.1, tz - 1.0, 0.04, 0.5, 0.7, "#e8455f", false));
  // fireman's pole off the south side of the deck
  p.push(cyl(tx + 0.6, 1.7, tz + 2.1, 0.06, 3.4, C.chrome, false));
  p.push(box(tx + 0.6, 2.3, tz + 1.75, 0.08, 0.08, 0.7, C.chrome, false));

  // water fountain and a bench where the shed used to be
  p.push(cyl(cx - 11, 0.5, cz + 7.6, 0.28, 1.0, "#8a9aa4"));
  p.push(cyl(cx - 11, 1.02, cz + 7.6, 0.36, 0.08, C.chrome, false));
  p.push(box(cx - 7.5, 0.25, cz + 7.8, 2.4, 0.18, 0.7, "#4f93c4"));
  p.push(box(cx - 7.5, 0.1, cz + 7.8, 2.0, 0.2, 0.4, C.chrome, false));
  return p;
}

/* -------------------------------------------------------------------- farm */

/**
 * Little farm: red barn, fenced paddock with a trough and hay bales, vegetable
 * beds in rows, a scarecrow, a tractor and a windmill pump.
 */
export function farm(cx: number, cz: number): Prop[] {
  const p: Prop[] = [];
  p.push(surf(cx, TOP.lawn, cz, 52, 36, "#8fbf62"));
  p.push({ kind: "house", x: cx - 16, z: cz - 8, body: "#c9442f", roof: "#6a3a28", w: 10, d: 8 });
  // paddock: posts solid, rails thin
  const px = cx + 8;
  const pz = cz - 6;
  const pw = 22;
  const pd = 14;
  const post = (x: number, z: number) => p.push(box(x, 0.5, z, 0.22, 1.0, 0.22, C.wood));
  for (let i = 0; i <= 8; i++) {
    post(px - pw / 2 + (i * pw) / 8, pz - pd / 2);
    post(px - pw / 2 + (i * pw) / 8, pz + pd / 2);
  }
  for (let i = 1; i < 5; i++) {
    post(px - pw / 2, pz - pd / 2 + (i * pd) / 5);
    post(px + pw / 2, pz - pd / 2 + (i * pd) / 5);
  }
  for (const y of [0.4, 0.8]) {
    p.push(box(px, y, pz - pd / 2, pw, 0.08, 0.08, C.woodLight, false));
    p.push(box(px, y, pz + pd / 2, pw, 0.08, 0.08, C.woodLight, false));
    // the gate side has a gap in the middle so she can walk in
    p.push(box(px - pw / 2, y, pz - pd / 4 - 0.75, 0.08, 0.08, pd / 2 - 1.5, C.woodLight, false));
    p.push(box(px - pw / 2, y, pz + pd / 4 + 0.75, 0.08, 0.08, pd / 2 - 1.5, C.woodLight, false));
    p.push(box(px + pw / 2, y, pz, 0.08, 0.08, pd, C.woodLight, false));
  }
  p.push(surf(px, TOP.apron, pz, pw - 1, pd - 1, "#c7a97a"));
  p.push(box(px + 6, 0.3, pz + 3, 2.2, 0.6, 0.8, C.chrome));
  p.push(box(px + 6, 0.55, pz + 3, 2.0, 0.06, 0.6, "#6cb8d4", false));
  for (const [hx, hz] of [
    [px - 5, pz - 3],
    [px - 3.6, pz - 3],
    [px - 4.3, pz - 3.9],
  ]) {
    p.push(box(hx, 0.45, hz, 1.3, 0.9, 1.0, "#e8c46a"));
  }
  // vegetable beds
  for (let i = 0; i < 4; i++) {
    const bz = cz + 8 + i * 2.4;
    p.push(box(cx - 14, 0.16, bz, 16, 0.32, 1.2, "#7a5232"));
    p.push(box(cx - 14, 0.42, bz, 15, 0.22, 0.6, i % 2 ? "#3fa35c" : "#e8734a", false));
  }
  // scarecrow
  p.push(box(cx - 4, 1.2, cz + 12, 0.16, 2.4, 0.16, C.wood));
  p.push(box(cx - 4, 1.9, cz + 12, 1.6, 0.16, 0.16, C.wood, false));
  p.push(box(cx - 4, 1.6, cz + 12, 0.7, 0.9, 0.4, "#4f93c4", false));
  p.push(box(cx - 4, 2.35, cz + 12, 0.45, 0.45, 0.45, "#e8c46a", false));
  p.push(box(cx - 4, 2.68, cz + 12, 0.9, 0.12, 0.9, "#8a5a32", false));
  // tractor: a real model (makeTractor). As cylinder props its wheels stood
  // upright like barrels, because a cyl prop cannot be laid on its side.
  p.push({ kind: "tractor", x: cx + 6, z: cz + 11 });
  // windmill pump
  p.push(box(cx + 20, 3.2, cz + 8, 0.6, 6.4, 0.6, "#8a9aa4"));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    p.push(box(cx + 20 + Math.cos(a) * 1.2, 6.6 + Math.sin(a) * 1.2, cz + 8.5, 0.3, 0.3, 0.1, "#f7f3ee", false));
  }
  return p;
}

/* --------------------------------------------------------------- mini golf */

/**
 * The mini golf course, as one table of numbers.
 *
 * `minigolf.ts` builds the ball's world out of exactly these values and
 * `miniGolf()` below draws from them, so what she can see and what the ball
 * hits can never drift apart. Lane-local coordinates are used throughout:
 * `dx` across the lane, `dz` along it, with the tee at `+teeDz` and the cup
 * at `cupDz` (negative), so every hole is played northwards.
 *
 * Five holes, five different questions: an easy gate to warm up, a windmill
 * to time, a dogleg to think round, two gates to pick between, and a rolling
 * log to dodge. Everything the ball hits is knee high or lower, except the
 * windmill, which is an open frame she can see straight through.
 */
export const GOLF = {
  /** where levels.ts puts the course; setGolfOrigin moves it for another park */
  x: 20,
  z: -132,
  holes: 5,
  /** lane centres, as offsets from the course centre */
  laneDx: [-14, -7, 0, 7, 14],
  /** the playable green is |dx| <= halfW and |dz| <= halfD */
  halfW: 2.5,
  halfD: 9,
  /** the wooden border: thickness and height, its inner face on the green's edge */
  wallT: 0.4,
  wallH: 0.36,
  /** the tee mat and the cup, along the lane */
  teeDz: 7.5,
  cupDz: -7,
  cupR: 0.45,
  par: 3,
  apronW: 36,
  apronD: 24,
  green: "#4fa056",
  flags: ["#e8455f", "#ffc53d", "#4f93c4", "#3fa35c", "#b98ce0"],
  names: ["Straight Away", "The Windmill", "The Dogleg", "Twin Gates", "Rolling Log"],
  /**
   * The first thing to aim at on each hole: the gate, the doorway, the corner.
   * On the dogleg the cup is round a wall and cannot be seen from the tee,
   * which is fine, but this has to be in plain sight (tools/minigolf.ts).
   */
  sight: [
    [0, 0],
    [0, 0.9],
    [1.7, 1.5],
    [1.25, -1],
    [0, 1.8],
  ] as [number, number][],
  /**
   * Hole 2's windmill: two knee-high kerbs making a doorway, a frame of thin
   * posts and a beam over it, and the sails turning in the opening. A sail
   * sweeping the bottom of its turn covers the middle of the doorway, so the
   * short way through is a matter of timing; it can never shut the hole,
   * because a sail only reaches about 0.9m sideways while its tip is down in
   * the grass and the ways round the kerbs are 1.25m wide.
   *
   * Nothing here is both tall and wide, and that is the point. A ball sitting
   * just behind anything taller than knee height cannot be seen from behind at
   * any sane camera height, which is what a solid windmill tower did: it filled
   * the screen with roof. The posts and beam are thin enough not to be built as
   * colliders at all, and the sails are thin and always moving.
   */
  windmill: {
    hole: 1,
    /** the sails' plane, in front of the frame */
    dz: 0.9,
    legDx: 1,
    legW: 0.5,
    legD: 0.5,
    /** the kerb the ball hits */
    legH: 0.45,
    /** the frame over it: thin posts up to this, then a beam */
    postH: 2.2,
    postW: 0.16,
    beamH: 0.16,
    hubY: 2.05,
    /** hub to sail tip; the tip just brushes the grass at the bottom */
    sail: 1.95,
    sailW: 0.44,
    sailT: 0.16,
    /** seconds for one turn */
    period: 6,
  },
  /**
   * Hole 5's rolling log, which trundles from side to side across the lane and
   * gives the ball a shove. Its swing is longer than its half-length, so the
   * middle of the lane opens up twice a pass, and both ends stay clear of the
   * borders, so there is always a gap and nothing to be pinned against.
   */
  log: {
    hole: 4,
    dz: 1.8,
    halfLen: 0.85,
    r: 0.26,
    travel: 1.25,
    period: 5,
  },
};

/**
 * One solid thing on a green, in lane-local coordinates. `round` ones are
 * circles of radius w/2 (the mushroom); the rest are boxes.
 */
export type GolfBlock = {
  dx: number;
  dz: number;
  w: number;
  d: number;
  h: number;
  color: string;
  round?: boolean;
};

/**
 * What stands on each green. The windmill's sails and the rolling log move,
 * so they are not here; nor is the windmill's beam, which is over her head.
 */
export const GOLF_BLOCKS: GolfBlock[][] = [
  // 1 · a wide gate straight ahead: the warm-up
  [
    { dx: -1.75, dz: 0, w: 1.5, d: 0.5, h: 0.45, color: "#a05040" },
    { dx: 1.75, dz: 0, w: 1.5, d: 0.5, h: 0.45, color: "#a05040" },
  ],
  // 2 · the windmill frame's legs; the sails sweep the doorway between them
  [
    { dx: -GOLF.windmill.legDx, dz: 0, w: GOLF.windmill.legW, d: GOLF.windmill.legD, h: GOLF.windmill.legH, color: "#f3eadc" },
    { dx: GOLF.windmill.legDx, dz: 0, w: GOLF.windmill.legW, d: GOLF.windmill.legD, h: GOLF.windmill.legH, color: "#f3eadc" },
  ],
  // 3 · a dogleg: the cup is round the corner, up the right-hand side
  [
    { dx: -0.8, dz: 1.5, w: 3.4, d: 0.4, h: 0.45, color: "#ffc53d" },
    { dx: -1.5, dz: -3.5, w: 1, d: 1, h: 0.55, color: "#ffc53d", round: true },
  ],
  // 4 · round the mushroom, then pick a gate and thread it
  [
    { dx: 0, dz: 3.6, w: 1.1, d: 1.1, h: 0.55, color: "#e8455f", round: true },
    { dx: 0, dz: -1, w: 1.4, d: 0.5, h: 0.5, color: "#4f93c4" },
    { dx: -2.15, dz: -1, w: 0.7, d: 0.5, h: 0.5, color: "#4f93c4" },
    { dx: 2.15, dz: -1, w: 0.7, d: 0.5, h: 0.5, color: "#4f93c4" },
  ],
  // 5 · nothing standing still: the rolling log does all the work
  [],
];

/** Where the course sits when a park does not say otherwise: park 1's. */
const GOLF_HOME = { x: GOLF.x, z: GOLF.z };

/**
 * Move the course. The greens themselves are props, baked by miniGolf(cx, cz)
 * when the park is authored; this is what minigolf.ts reads to put the ball,
 * the flags and the camera on those same greens, so the two have to be given
 * the same centre.
 */
export function setGolfOrigin(o: { x: number; z: number } = GOLF_HOME) {
  GOLF.x = o.x;
  GOLF.z = o.z;
}

/** Five mini-golf holes side by side, with low borders, obstacles and flags. */
export function miniGolf(cx: number, cz: number): Prop[] {
  const p: Prop[] = [];
  const g = GOLF;
  const inW = g.halfW * 2;
  const inD = g.halfD * 2;
  p.push(surf(cx, TOP.apron, cz, g.apronW, g.apronD, "#d8c49a"));
  for (let i = 0; i < g.holes; i++) {
    const hx = cx + g.laneDx[i]!;
    p.push(surf(hx, TOP.court, cz, inW, inD, g.green));
    // borders, their inner faces exactly on the edge of the playable green
    p.push(box(hx - g.halfW - g.wallT / 2, g.wallH / 2, cz, g.wallT, g.wallH, inD + g.wallT * 2, C.wood));
    p.push(box(hx + g.halfW + g.wallT / 2, g.wallH / 2, cz, g.wallT, g.wallH, inD + g.wallT * 2, C.wood));
    p.push(box(hx, g.wallH / 2, cz - g.halfD - g.wallT / 2, inW, g.wallH, g.wallT, C.wood));
    p.push(box(hx, g.wallH / 2, cz + g.halfD + g.wallT / 2, inW, g.wallH, g.wallT, C.wood));
    // tee mat and the hole with its flag
    p.push(surf(hx, TOP.line, cz + g.teeDz, 1.2, 1.2, "#2f6f8f", 0.05));
    p.push(disc(hx, TOP.line, cz + g.cupDz, g.cupR, "#2f2a26", 0.05));
    p.push(box(hx, 0.9, cz + g.cupDz, 0.06, 1.8, 0.06, C.chrome, false));
    p.push(box(hx + 0.35, 1.55, cz + g.cupDz, 0.6, 0.35, 0.05, g.flags[i]!, false));
    // the tee marker, so she can tell the holes apart
    p.push(box(hx - 1.5, 0.3, cz + g.teeDz, 0.5, 0.6, 0.12, g.flags[i]!));
    // whatever stands on this green
    for (const b of GOLF_BLOCKS[i] ?? []) {
      if (b.round) p.push(cyl(hx + b.dx, b.h / 2, cz + b.dz, b.w / 2, b.h, b.color));
      else p.push(box(hx + b.dx, b.h / 2, cz + b.dz, b.w, b.h, b.d, b.color));
    }
  }
  // The windmill's frame: thin posts and a beam over the two kerbs, with the
  // hub the sails turn on. All of it under 0.35m thick, so world-build leaves
  // it out of the colliders and it is never a wall or a wall of a view.
  {
    const w = g.windmill;
    const hx = cx + g.laneDx[w.hole]!;
    const span = w.legDx * 2 + w.postW;
    for (const s of [-1, 1]) {
      p.push(box(hx + s * w.legDx, (w.legH + w.postH) / 2, cz, w.postW, w.postH - w.legH, w.postW, "#a05040", false));
    }
    p.push(box(hx, w.postH + w.beamH / 2, cz, span, w.beamH, w.postW, "#a05040", false));
    // the post the hub hangs from, in front of the beam, and the hub itself
    p.push(box(hx, (w.hubY + w.postH + w.beamH) / 2, cz + w.dz - 0.28, 0.16, w.postH + w.beamH - w.hubY, 0.16, "#a05040", false));
    p.push(cyl(hx, w.hubY, cz + w.dz, 0.17, 0.3, "#c8a040", false));
  }
  // the log's run: a sandy strip so it is clear where the log will come from
  {
    const l = g.log;
    const hx = cx + g.laneDx[l.hole]!;
    p.push(surf(hx, TOP.inner, cz + l.dz, inW, l.r * 2 + 0.5, C.sand, 0.05));
  }
  // kiosk, clear of the lanes on the entrance side
  // Kiosk, south of the lanes on the entrance side. It sits in the gap between
  // two lanes' camera lines on purpose: the putting camera hangs back over the
  // apron, and a kiosk in line with a tee put the camera inside its wall.
  p.push({ kind: "house", x: cx + 10.5, z: cz + 11.5, body: "#ffc53d", roof: "#d45a4a", w: 4, d: 3 });
  return p;
}

/* -------------------------------------------------------------- soccer pitch */

export function soccerPitch(cx: number, cz: number): Prop[] {
  const p: Prop[] = [];
  const w = 40;
  const d = 26;
  p.push(surf(cx, TOP.lawn, cz, w + 6, d + 6, "#63ac5e"));
  p.push(surf(cx, TOP.apron, cz, w, d, "#5fb05a"));
  // lines
  p.push(surf(cx, TOP.line, cz - d / 2 + 0.1, w, 0.2, C.line, 0.05));
  p.push(surf(cx, TOP.line, cz + d / 2 - 0.1, w, 0.2, C.line, 0.05));
  p.push(surf(cx - w / 2 + 0.1, TOP.line, cz, 0.2, d, C.line, 0.05));
  p.push(surf(cx + w / 2 - 0.1, TOP.line, cz, 0.2, d, C.line, 0.05));
  p.push(surf(cx, TOP.line, cz, 0.2, d, C.line, 0.05));
  p.push(disc(cx, TOP.line, cz, 4, C.line, 0.05));
  p.push(disc(cx, TOP.mark, cz, 3.8, "#5fb05a", 0.05));
  // goals: posts solid, crossbar and net thin
  for (const s of [-1, 1]) {
    const gx = cx + (s * w) / 2;
    p.push(box(gx, 1.2, cz - 3, 0.16, 2.4, 0.16, C.line));
    p.push(box(gx, 1.2, cz + 3, 0.16, 2.4, 0.16, C.line));
    p.push(box(gx, 2.4, cz, 0.12, 0.12, 6.2, C.line, false));
    p.push(box(gx + s * 0.9, 1.2, cz, 0.06, 2.4, 6.2, "#e8f0f4", false, { opacity: 0.5 }));
    p.push(box(gx + s * 0.9, 2.4, cz, 1.9, 0.06, 6.2, "#e8f0f4", false, { opacity: 0.5 }));
  }
  // benches and corner flags
  for (const s of [-1, 1]) {
    p.push(box(cx + s * 8, 0.45, cz + d / 2 + 4, 4, 0.16, 0.6, C.woodLight));
    p.push(box(cx + s * 8 - 1.7, 0.2, cz + d / 2 + 4, 0.2, 0.4, 0.5, C.wood));
    p.push(box(cx + s * 8 + 1.7, 0.2, cz + d / 2 + 4, 0.2, 0.4, 0.5, C.wood));
    for (const t of [-1, 1]) {
      p.push(box(cx + (s * w) / 2, 0.8, cz + (t * d) / 2, 0.06, 1.6, 0.06, C.chrome, false));
      p.push(box(cx + (s * w) / 2 + 0.25, 1.45, cz + (t * d) / 2, 0.5, 0.3, 0.04, "#e8455f", false));
    }
  }
  return p;
}

/* ------------------------------------------------------------------- woods */

/**
 * Dense trees in a band, seeded, skipping anything that lands inside `avoid`
 * rectangles (the trail and the clearing). Returns only tree props.
 */
export function forest(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  count: number,
  seed: number,
  avoid: { minX: number; maxX: number; minZ: number; maxZ: number }[],
): Prop[] {
  const out: Prop[] = [];
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  const placed: [number, number][] = [];
  let guard = 0;
  while (out.length < count && guard < count * 30) {
    guard++;
    const x = minX + rand() * (maxX - minX);
    const z = minZ + rand() * (maxZ - minZ);
    if (avoid.some((r) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ)) continue;
    if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 3.4)) continue;
    placed.push([x, z]);
    out.push({ kind: "tree", x, z, variant: (out.length % 3) as 0 | 1 | 2, scale: 0.9 + rand() * 0.6 });
  }
  return out;
}

/* -------------------------------------------------------------- playground */

export function playground(cx: number, cz: number): Prop[] {
  const p: Prop[] = [];

  // safety surfacing, two tones
  p.push(surf(cx, TOP.apron, cz, 34, 26, C.rubber));
  p.push(surf(cx - 6, TOP.court, cz + 3, 16, 13, C.rubberWarm));

  // --- swing set: A-frames, top rail, four swings
  const sx = cx - 11;
  for (const s of [-1, 1]) {
    const z = cz + s * 3.4;
    p.push(box(sx - 3.2, 1.6, z, 0.3, 3.3, 0.3, C.paint));
    p.push(box(sx + 3.2, 1.6, z, 0.3, 3.3, 0.3, C.paint));
  }
  p.push(box(sx, 3.2, cz, 7.2, 0.3, 0.3, "#4f93c4", false));
  p.push(box(sx - 3.2, 3.15, cz, 0.3, 0.3, 7.2, "#4f93c4", false));
  p.push(box(sx + 3.2, 3.15, cz, 0.3, 0.3, 7.2, "#4f93c4", false));
  for (let i = 0; i < 4; i++) {
    const swx = sx - 2.4 + i * 1.6;
    p.push(box(swx - 0.35, 2.0, cz, 0.07, 2.1, 0.07, "#8a9aa4", false));
    p.push(box(swx + 0.35, 2.0, cz, 0.07, 2.1, 0.07, "#8a9aa4", false));
    p.push(box(swx, 0.95, cz, 0.9, 0.12, 0.45, i < 2 ? "#2f3a40" : "#f0c44a"));
  }

  // --- climbing tower with monkey bars and a fireman pole
  const tx = cx + 5;
  p.push(box(tx, 1.6, cz - 2, 4.4, 0.35, 4.4, "#d4894a"));
  for (const [ox, oz] of [
    [-2, -2],
    [2, -2],
    [-2, 2],
    [2, 2],
  ] as [number, number][]) {
    p.push(box(tx + ox, 0.8, cz - 2 + oz, 0.34, 1.6, 0.34, C.wood));
  }
  // roof
  p.push(box(tx, 3.4, cz - 2, 4.8, 0.3, 4.8, "#d45a4a"));
  for (const [ox, oz] of [
    [-2, -2],
    [2, -2],
    [-2, 2],
    [2, 2],
  ] as [number, number][]) {
    p.push(box(tx + ox, 2.6, cz - 2 + oz, 0.26, 1.7, 0.26, C.wood, false));
  }
  // guard rails
  p.push(box(tx, 2.1, cz - 4.2, 4.4, 0.7, 0.16, "#f0c44a"));
  p.push(box(tx - 2.2, 2.1, cz - 2, 0.16, 0.7, 4.4, "#f0c44a"));

  // monkey bars running off the tower
  p.push(box(tx + 6, 2.4, cz - 2.9, 0.26, 2.2, 0.26, "#4f93c4"));
  p.push(box(tx + 6, 2.4, cz - 1.1, 0.26, 2.2, 0.26, "#4f93c4"));
  p.push(box(tx + 4.2, 3.4, cz - 2.9, 4.4, 0.2, 0.2, "#4f93c4"));
  p.push(box(tx + 4.2, 3.4, cz - 1.1, 4.4, 0.2, 0.2, "#4f93c4"));
  for (let i = 0; i < 6; i++) {
    p.push(box(tx + 2.4 + i * 0.75, 3.4, cz - 2, 0.12, 0.12, 1.9, C.chrome, false));
  }
  // fireman pole
  p.push(cyl(tx - 2.6, 1.7, cz + 0.4, 0.13, 3.4, C.chrome, false));

  // --- steps up to the tower
  // They used to climb in +z, away from the platform, so you arrived at the
  // top facing open air. They now ascend toward the deck edge at cz - 2 + 2.2.
  for (let i = 0; i < 5; i++) {
    const top = (i + 1) * 0.355;
    p.push(
      box(
        tx - 0.2,
        top / 2,
        cz + 2.6 - i * 0.5,
        2.2,
        top,
        0.52,
        i % 2 ? C.woodLight : "#b98d58",
      ),
    );
  }
  // low rails either side of the run
  for (const sx2 of [-1, 1]) {
    p.push(box(tx - 0.2 + sx2 * 1.2, 1.15, cz + 1.4, 0.14, 0.9, 2.6, "#f0c44a", false));
  }

  // --- sandbox
  p.push(surf(cx + 13, TOP.inner, cz + 7, 8, 7, C.sand));
  p.push(box(cx + 13, 0.3, cz + 3.6, 8.4, 0.42, 0.4, C.wood));
  p.push(box(cx + 13, 0.3, cz + 10.4, 8.4, 0.42, 0.4, C.wood));
  p.push(box(cx + 9.1, 0.3, cz + 7, 0.4, 0.42, 7.2, C.wood));
  p.push(box(cx + 16.9, 0.3, cz + 7, 0.4, 0.42, 7.2, C.wood));
  p.push(cyl(cx + 11.4, 0.28, cz + 6.2, 0.55, 0.36, "#4f93c4", true));
  p.push(box(cx + 14.6, 0.26, cz + 8.4, 0.7, 0.3, 0.7, "#f0c44a"));

  // --- seesaw
  p.push(box(cx - 13, 0.4, cz + 9, 0.7, 0.8, 0.7, C.paint));
  p.push(box(cx - 13, 0.9, cz + 9, 0.4, 0.22, 6.4, "#f0c44a"));
  p.push(box(cx - 13, 1.15, cz + 11.6, 0.8, 0.3, 0.7, "#4f93c4"));
  p.push(box(cx - 13, 0.72, cz + 6.4, 0.8, 0.3, 0.7, "#4f93c4"));

  // --- spring riders
  for (const [rx, rz, col] of [
    [cx - 4, cz + 10, "#d45a4a"],
    [cx - 1, cz + 10.5, "#3f9a6b"],
  ] as [number, number, string][]) {
    p.push(cyl(rx, 0.28, rz, 0.16, 0.56, C.chrome, false));
    p.push(box(rx, 0.75, rz, 1.3, 0.5, 0.6, col));
    p.push(box(rx + 0.5, 1.05, rz, 0.5, 0.45, 0.5, col));
    p.push(box(rx, 0.95, rz, 0.16, 0.16, 0.9, "#2f3a40", false));
  }

  // --- benches for parents, facing in
  for (const [bx, bz] of [
    [cx - 6, cz - 11],
    [cx + 6, cz - 11],
  ] as [number, number][]) {
    p.push(box(bx, 0.45, bz, 3.4, 0.2, 0.75, C.woodLight));
    p.push(box(bx, 0.85, bz - 0.35, 3.4, 0.7, 0.16, C.woodLight));
    p.push(box(bx - 1.5, 0.22, bz, 0.2, 0.45, 0.7, "#6a7a80"));
    p.push(box(bx + 1.5, 0.22, bz, 0.2, 0.45, 0.7, "#6a7a80"));
  }

  // bin
  p.push(cyl(cx + 17, 0.55, cz - 8, 0.6, 1.1, "#4a6a58"));

  return p;
}

/* ------------------------------------------------- sandcastle corner (east) */

/**
 * The little play corner on the lawn east of the spawn plaza.
 *
 * It used to be a heap: an 8x8 pad with the slide standing in the middle of
 * it, a stray yellow tower, a blue mat floating at 0.7m, a second pad 10m away
 * with a raised plate on two legs, and a flight of stairs to a deck that went
 * nowhere. Nothing was arranged around anything else. This lays the same
 * ground out as one place: a framed sandpit the slide lands in, a bark path in
 * from the gate, a bench, and a picket-and-bush edge so it reads as a corner
 * of the park rather than props dropped on grass.
 *
 * Three fixed points it has to live with:
 *  - the slide is a composite mesh `world-build.ts` places at (22, 8), with
 *    its collider in `colliders.ts`. Its chute runs south and reaches the
 *    ground at about (22, 12.2), so the sand goes under that: she lands in it.
 *  - the walkway spur SANDJ -> SAND (`walkways.ts`) ends at (32, 9.4) facing
 *    south, so the gate is on the east side, on that line.
 *  - a pet treat sits at (22, 12.6) (`collectibles.ts`). Nothing solid goes
 *    near it; the sand under it is flat.
 *
 * Heights are chosen against the 0.62m step-up: the sandpit frame tops out at
 * 0.4 and the fence rails at 0.45, so no edge here can pen her in anywhere.
 * The pickets are 0.16m thick and non-colliding for the same reason the stair
 * handrails are — a thin solid prop is an unexplained wall.
 *
 * Every colour is one the park already uses near the spawn, so the static
 * merge does not gain a material (and therefore a draw call) for any of it.
 */
export function playCorner(): Prop[] {
  const p: Prop[] = [];

  // Palette note: the static merge buckets by material, shadow flag and 80m
  // cell, so a colour nothing else uses near the spawn costs a draw call no
  // matter how few props wear it. Everything here is either already in this
  // cell or shared between several pieces, and the path takes the walkway's
  // own sand colour so it merges straight into the network it leads off.
  const FENCE = "#efe4d0";
  const PATH = "#d8c49a";
  const DARKWOOD = "#8a5a32";
  const CASTLE = "#c4a06a";
  const BUSH = "#3f9a6b";

  // --- the sandpit: 8 x 6.4, with the slide's chute coming down into it
  const px = 22;
  const pz = 13.8;
  const hw = 4.0;
  const hd = 3.2;
  p.push(surf(px, TOP.inner, pz, hw * 2, hd * 2, C.sand));

  // frame boards, 0.4 high so she can sit on them and step over them
  const t = 0.36;
  const fy = 0.2;
  const fh = 0.4;
  p.push(box(px, fy, pz + hd + t / 2, hw * 2 + t * 2, fh, t, C.woodLight));
  p.push(box(px - hw - t / 2, fy, pz, t, fh, hd * 2, C.woodLight));
  p.push(box(px + hw + t / 2, fy, pz, t, fh, hd * 2, C.woodLight));
  // the north board is split: the slide chute comes down through the gap,
  // which doubles as the way she walks in
  const gap = 1.2;
  const nz = pz - hd - t / 2;
  for (const s of [-1, 1] as const) {
    const inner = px + s * gap;
    const outer = px + s * (hw + t);
    p.push(box((inner + outer) / 2, fy, nz, Math.abs(outer - inner), fh, t, C.woodLight));
  }
  // A darker block at each corner so the frame reads as built, not painted on.
  // Flush with the boards on purpose: a corner post standing 16cm proud is one
  // more ledge to walk off, and stepping off it left her pinned against the
  // fence rail while she fell (tools/walk.ts).
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      p.push(box(px + sx * (hw + t / 2), fy, pz + sz * (hd + t / 2), 0.52, fh, 0.52, DARKWOOD));
    }
  }

  // --- half-built sandcastle, west end of the pit
  const cx = 19.6;
  const cz = 14.4;
  p.push(box(cx, TOP.inner + 0.16, cz, 1.7, 0.32, 1.7, CASTLE));
  p.push(box(cx, TOP.inner + 0.44, cz, 1.05, 0.24, 1.05, CASTLE));
  p.push(box(cx - 0.4, TOP.inner + 0.7, cz - 0.38, 0.44, 0.28, 0.44, CASTLE));
  p.push(box(cx + 0.4, TOP.inner + 0.7, cz + 0.38, 0.44, 0.28, 0.44, CASTLE));
  // flag: pole and pennant are decoration, thin and non-colliding
  p.push(box(cx, TOP.inner + 0.84, cz, 0.12, 0.56, 0.12, "#d45a4a", false));
  p.push(box(cx + 0.25, TOP.inner + 1.04, cz, 0.42, 0.26, 0.05, "#d45a4a", false));

  // --- bucket and spade, left where a seven-year-old would leave them
  p.push(box(24.3, TOP.inner + 0.21, 15.4, 0.6, 0.42, 0.6, "#4f93c4"));
  p.push(box(24.3, TOP.inner + 0.46, 15.4, 0.66, 0.1, 0.1, FENCE, false));
  p.push(box(23.3, TOP.inner + 0.45, 14.2, 0.12, 0.9, 0.12, "#d45a4a", false));
  p.push(box(23.3, TOP.inner + 0.08, 14.2, 0.34, 0.16, 0.26, FENCE, false));

  // --- footprints leading away from the bottom of the slide. Big enough to be
  // wide props, which means the same material and shadow flag as the castle:
  // one bucket in the merge rather than two. Their tops are 6cm over the sand,
  // well clear of the 3cm floor tolerance, so she walks over them.
  for (const [fx, fz] of [
    // the first print starts clear of the pet treat that hovers at (22, 12.6):
    // standing it on a 6cm pad changes the floor the treat is measured against
    [22.6, 13.25],
    [21.8, 13.8],
    [22.3, 14.5],
    [21.6, 15.1],
    [21.0, 15.6],
  ] as [number, number][]) {
    p.push(surf(fx, TOP.mark, fz, 0.42, 0.54, CASTLE, 0.08));
  }

  // --- the path in from the gate, then south down the side of the pit. Its
  // top is 0.12: 2.5cm over the walkway slab and 2cm under its edging, so it
  // meets the spur without z-fighting either.
  const PATH_TOP = 0.12;
  p.push(surf(28.75, PATH_TOP, 9.4, 4.3, 2.4, PATH));
  p.push(surf(px + hw + t + 1.2, PATH_TOP, 14.0, 2.4, 7.2, PATH));

  // --- the gate, on the line the walkway spur arrives on
  for (const gz of [8.1, 10.7]) p.push(box(30.2, 0.95, gz, 0.4, 1.9, 0.4, DARKWOOD));
  // the crossbeam's underside is at 1.78, over her 1.62 head, so it is solid
  // only in the sense that it merges with the posts; nothing can touch it
  p.push(box(30.2, 2.02, 9.4, 0.32, 0.24, 3.0, DARKWOOD));

  // --- picket fence. The rail is the only solid part and its top is 0.45, so
  // the edge is something she steps over rather than something that traps her.
  const fence = (x1: number, z1: number, x2: number, z2: number) => {
    const alongX = Math.abs(x2 - x1) > Math.abs(z2 - z1);
    const len = Math.abs(alongX ? x2 - x1 : z2 - z1);
    p.push(
      box(
        (x1 + x2) / 2,
        0.34,
        (z1 + z2) / 2,
        alongX ? len + 0.2 : 0.2,
        0.22,
        alongX ? 0.2 : len + 0.2,
        FENCE,
      ),
    );
    const n = Math.max(1, Math.round(len / 2.8));
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      p.push(
        box(
          x1 + (x2 - x1) * f,
          0.46,
          z1 + (z2 - z1) * f,
          alongX ? 0.28 : 0.16,
          0.92,
          alongX ? 0.16 : 0.28,
          FENCE,
          false,
        ),
      );
    }
  };
  // north, along the road; the run stops short of the name board and the gate
  fence(15.6, 5.8, 28.2, 5.8);
  // West and south face the open lawn. They stand a clear 1.9m off the sandpit
  // frame: walking off a 0.4m rim she is in the air for about 1.2m, and a rail
  // any closer pins her against it while she falls (tools/walk.ts calls that an
  // invisible wall, and it feels like one). Runs also start inside the corners
  // so two of them never drop a picket on the same spot.
  fence(15.6, 7.0, 15.6, 19.0);
  fence(16.8, 19.6, 26.8, 19.6);
  // east, between the gate and the tree that already stands at (30, 16)
  fence(30.2, 11.4, 30.2, 14.8);

  // --- bushes fill the corners the fence runs leave open
  for (const [bx, bz, bw] of [
    [16.3, 6.5, 1.3],
    [16.2, 18.4, 1.2],
    [29.6, 6.6, 1.2],
    [29.9, 15.0, 1.1],
    [29.2, 18.3, 1.3],
  ] as [number, number, number][]) {
    p.push(box(bx, bw * 0.42, bz, bw, bw * 0.84, bw, BUSH));
  }

  // --- a bench at the end of the path, looking back at the sandpit
  p.push(box(27.6, 0.44, 18.1, 2.4, 0.18, 0.72, C.woodLight));
  p.push(box(27.6, 0.86, 18.42, 2.4, 0.66, 0.16, C.woodLight));
  p.push(box(26.6, 0.22, 18.1, 0.2, 0.44, 0.72, DARKWOOD));
  p.push(box(28.6, 0.22, 18.1, 0.2, 0.44, 0.72, DARKWOOD));

  return p;
}

/* --------------------------------------------------------------- housing */

export function houseRow(
  startX: number,
  z: number,
  count: number,
  spacing: number,
  facing: 1 | -1,
): Prop[] {
  const p: Prop[] = [];
  const bodies = ["#e0cbb0", "#cfe0e8", "#e8d8b8", "#d8c4d0", "#cfe0cf", "#eed8c4"];
  const roofs = ["#8a4a3a", "#50606a", "#7a5a3a", "#6a4a5a", "#4a6a4a", "#9a5a3a"];

  for (let i = 0; i < count; i++) {
    const x = startX + i * spacing;
    const body = bodies[i % bodies.length]!;
    const roof = roofs[i % roofs.length]!;
    // the house mesh has its door and windows on the +z face, so turn it to
    // look at its own driveway rather than at the boundary wall
    p.push({ kind: "house", x, z, body, roof, w: 7.5, d: 6.5, ry: facing === 1 ? Math.PI : 0 });

    // driveway running toward the park
    p.push(surf(x, TOP.drive, z - facing * 6, 3.4, 6, "#b6b0a6"));
    // front path
    p.push(surf(x, TOP.court, z - facing * 3.6, 1.4, 2.2, "#d8c49a"));
    // mailbox
    p.push(box(x + 2.2, 0.55, z - facing * 6.4, 0.16, 1.1, 0.16, C.wood));
    p.push(box(x + 2.2, 1.2, z - facing * 6.4, 0.5, 0.35, 0.8, i % 2 ? "#4f93c4" : "#d45a4a"));
    // hedge between lots, alongside the house rather than out in the street
    if (i < count - 1) {
      p.push(box(x + spacing / 2, 0.6, z, 0.9, 1.2, 9, "#4a8a4a"));
    }
    // back yard tree
    p.push({ kind: "tree", x: x - 2.8, z: z + facing * 4.5, variant: (i % 3) as 0 | 1 | 2, scale: 0.9 });
  }

  return p;
}

/* -------------------------------------------------- berms and sight blocks */

/**
 * A grassy mound. Stacked shrinking slabs read as a hill from a distance and
 * give a solid wall that breaks line of sight without needing real terrain.
 */
export function berm(
  x: number,
  z: number,
  w: number,
  d: number,
  h = 4,
  ry = 0,
): Prop[] {
  const p: Prop[] = [];
  const layers = Math.max(3, Math.round(h / 0.9));
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);
    const shrink = 1 - t * 0.55;
    const shade = ["#6fa85e", "#68a058", "#5f9852", "#58904c"][i % 4]!;
    p.push(
      box(
        x,
        (h / layers) * (i + 0.5),
        z,
        w * shrink,
        h / layers + 0.02,
        d * shrink,
        shade,
        i === 0,
        { ry },
      ),
    );
  }
  return p;
}

/** A dense line of trees, used to wall off a zone. */
export function treeLine(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  count: number,
  scale = 1.1,
): Prop[] {
  const p: Prop[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    const jx = (((i * 37) % 11) / 11 - 0.5) * 2.4;
    const jz = (((i * 53) % 13) / 13 - 0.5) * 2.4;
    p.push({
      kind: "tree",
      x: x1 + (x2 - x1) * t + jx,
      z: z1 + (z2 - z1) * t + jz,
      variant: (i % 3) as 0 | 1 | 2,
      scale: scale * (0.85 + ((i * 29) % 7) / 20),
    });
  }
  return p;
}

/** Hedge wall, cheaper than trees and fully solid. */
export function hedge(x: number, z: number, w: number, d: number, h = 1.8): Prop[] {
  return [
    box(x, h / 2, z, w, h, d, "#3f7a42"),
    box(x, h + 0.08, z, w * 0.94, 0.18, d * 0.94, "#4f9a52", false),
  ];
}

/* ------------------------------------------------------------ park detail */

export function parkPath(x: number, z: number, w: number, d: number): Prop[] {
  return [surf(x, TOP.path, z, w, d, "#d8c49a")];
}

export function picnicArea(cx: number, cz: number, tables = 3): Prop[] {
  const p: Prop[] = [];
  p.push(surf(cx, TOP.lawn, cz, 16, 12, "#63ac5e"));
  for (let i = 0; i < tables; i++) {
    const x = cx - 5 + i * 5;
    const z = cz + (i % 2 ? 2.4 : -2.4);
    p.push(box(x, 0.75, z, 2.6, 0.18, 1.3, C.woodLight));
    p.push(box(x, 0.45, z - 1.1, 2.6, 0.16, 0.6, C.woodLight));
    p.push(box(x, 0.45, z + 1.1, 2.6, 0.16, 0.6, C.woodLight));
    p.push(box(x - 1.1, 0.37, z, 0.2, 0.75, 1.2, C.wood));
    p.push(box(x + 1.1, 0.37, z, 0.2, 0.75, 1.2, C.wood));
  }
  // barbecue
  p.push(box(cx + 7, 0.5, cz + 4, 0.3, 1, 0.3, "#5a5a5a"));
  p.push(box(cx + 7, 1.1, cz + 4, 1.4, 0.3, 1, "#3a3a3a", false));
  // bin
  p.push(cyl(cx - 7, 0.55, cz + 4, 0.6, 1.1, "#4a6a58"));
  return p;
}

export function basketballCourt(cx: number, cz: number): Prop[] {
  const p: Prop[] = [];
  p.push(surf(cx, TOP.apron, cz, 17, 28, "#9a6a4a"));
  p.push(surf(cx, TOP.court, cz, 16, 27, "#b07a52"));
  p.push(surf(cx, TOP.line, cz, 15.4, 0.2, C.line, 0.05));
  p.push(disc(cx, TOP.line, cz, 2.4, C.line, 0.05));
  p.push(disc(cx, TOP.mark, cz, 2.1, "#b07a52", 0.05));
  for (const s of [-1, 1]) {
    const hz = cz + s * 12.5;
    p.push(box(cx, 1.7, hz, 0.3, 3.4, 0.3, "#6a7a80"));
    p.push(box(cx, 3.3, hz - s * 0.5, 1.8, 1.1, 0.16, C.line, false));
    p.push(cyl(cx, 2.95, hz - s * 1.2, 0.45, 0.1, "#e07040", false));
  }
  return p;
}

/* ------------------------------------------------------- park boundary */

/**
 * Solid outer wall. She can jump onto anything inside the park, but the
 * boundary has to hold, so this is tall enough that no jump from adjacent
 * geometry clears it, and it is continuous with no gaps.
 */
export function boundaryWall(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  h = 6,
): Prop[] {
  const out: Prop[] = [];
  const t = 1.5;
  const stone = "#b3a894";
  const cap = "#9b8f7c";
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const w = maxX - minX;
  const d = maxZ - minZ;

  // continuous runs, overlapped at the corners so there is no seam to slip through
  for (const z of [minZ, maxZ]) {
    out.push(box(cx, h / 2, z, w + t * 2, h, t, stone));
    out.push(box(cx, h + 0.2, z, w + t * 2, 0.4, t + 0.5, cap, false));
  }
  for (const x of [minX, maxX]) {
    out.push(box(x, h / 2, cz, t, h, d + t * 2, stone));
    out.push(box(x, h + 0.2, cz, t + 0.5, 0.4, d + t * 2, cap, false));
  }

  // piers, purely so it reads as a wall rather than a slab
  const pierEvery = 14;
  for (let i = -Math.floor(w / 2 / pierEvery); i <= Math.floor(w / 2 / pierEvery); i++) {
    for (const z of [minZ, maxZ]) {
      out.push(box(cx + i * pierEvery, h / 2, z, 1.6, h + 0.6, t + 0.6, cap, false));
    }
  }
  for (let i = -Math.floor(d / 2 / pierEvery); i <= Math.floor(d / 2 / pierEvery); i++) {
    for (const x of [minX, maxX]) {
      out.push(box(x, h / 2, cz + i * pierEvery, t + 0.6, h + 0.6, 1.6, cap, false));
    }
  }

  return out;
}
