import * as THREE from "three";
import { beveledBox } from "./beveled";
import { lam } from "./meshes";
import { LAVA_POOL, LAVA_SURFACE, slab, type LavaCourse, type LavaTheme, type Piece, type PlanStep } from "./lava";

/**
 * The Floor is Chocolate: Sugar Rush Park's jumping course.
 *
 * Sloan finished park 1's Floor is Lava, so this is not that course repainted.
 * It runs on the same engine, keeps its five rules (nothing solid rotates, the
 * liquid never hurts her, every gap measured against her real jump, a landing
 * long enough to catch a full-speed one, and a collider that looks like what it
 * is), and then asks her different questions:
 *
 *  1. **Gumdrop Hops** — a warm-up that climbs. Park 1's first section is five
 *     flat hops on one tier; this one rises 3.0m to 4.0m as it zig-zags, so the
 *     first thing she learns is that up is a direction here.
 *  2. **The Liquorice Beams** — narrow, and it turns a corner in the middle of
 *     the narrow bit, then ends with a 3.9m run-up jump off the end of a beam.
 *     Park 1's beams are straight and its longest jump is 3.6m off a wide pad.
 *  3. **The Marshmallow Bog** — three marshmallows that sink *under her weight*
 *     rather than on a timer. Park 1's sinking stones are a rhythm to read and
 *     they have solid ground on both sides; these are a "keep moving", and
 *     standing still on one for two and a half seconds puts her in the
 *     chocolate.
 *  4. **The Chocolate Ferry** — a barge that carries her nine metres down the
 *     course and goes back empty. Park 1's rafts slide across her path; this is
 *     a thing she has to catch, ride, and get off, and the far bank cannot be
 *     jumped to at all.
 *  5. **The Peppermint Wheels** — humbug discs that spin as they slide, each on
 *     its own beat, and she has to land on one that is moving. Park 1 never
 *     asks her to land on something that is not sitting still.
 *  6. **The Wafer Climb** — a wafer lift up to a biscuit tower 6.6m over the
 *     chocolate, and then a three-metre drop off the far side onto a long
 *     landing. Park 1 stays between 1.9m and 3.5m the whole way.
 *  7. **The Last Leap** — small gumdrops, 3.4m to 3.9m gaps, one of them
 *     moving, and a podium she has to jump early for.
 *
 * **Three checkpoints**, at the end of sections 2, 4 and 6. Falling in the
 * chocolate brings her back to the last candy flag she lit, not to the start:
 * that is what makes a course this long fair to ask of her, and it is what she
 * asked for by name.
 */

/* ------------------------------------------------------------- the sweets */

/**
 * The park's palette, copied rather than imported: this file is reached from
 * features.ts, and sugar-rush.ts reaches back to features.ts through its
 * models, so importing it here would read a half-built park.
 */
const C = {
  choc: "#6b4226",
  chocDark: "#4a2c17",
  chocLight: "#8a5a34",
  biscuit: "#d9a05b",
  biscuitLight: "#e8bd7d",
  cream: "#f7ead3",
  icing: "#f6f1e8",
  sugar: "#e9d7b6",
  cane: "#e8384f",
  pink: "#ff6aa8",
  blush: "#ffb7d5",
  sun: "#ffc83a",
  mint: "#6fe3c4",
  lilac: "#b06aff",
  orange: "#ff8a3a",
  licorice: "#2a2430",
} as const;

/** Gumdrops go round the rainbow rather than picking a colour at random. */
const GUMDROP = [C.pink, C.sun, C.mint, C.lilac, C.orange, C.cane];

/**
 * Cylinders, cached by size the way `beveledBox` is. Nothing disposes these,
 * which is exactly why they are shared: a gumdrop the same size as another
 * gumdrop is the same geometry.
 */
const cylCache = new Map<string, THREE.BufferGeometry>();
function cyl(rTop: number, rBottom: number, h: number, seg = 14, from = 0, sweep = Math.PI * 2) {
  const q = (n: number) => Math.round(n * 50) / 50;
  const k = `${q(rTop)}|${q(rBottom)}|${q(h)}|${seg}|${q(from)}|${q(sweep)}`;
  let g = cylCache.get(k);
  if (!g) {
    g = new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, false, from, sweep);
    cylCache.set(k, g);
  }
  return g;
}

/** A cylinder described, like `slab`, by the height of its visible top face. */
function puck(color: string, cx: number, cz: number, rTop: number, rBottom: number, top: number, bottom: number, flat = false) {
  const h = Math.max(0.02, top - bottom);
  const m = new THREE.Mesh(cyl(rTop, rBottom, h), lam(color, flat ? { flat: true } : { repeat: 2 }));
  m.position.set(cx, bottom + h / 2, cz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** The radius that fits inside a piece's footprint. */
const fit = (p: { w: number; d: number }) => Math.min(p.w, p.d) / 2;

/* ---------------------------------------------------------- the dressings */

/**
 * Every one of these draws a top face at exactly the piece's top and keeps the
 * rest of itself inside the piece's footprint, because the box does not know
 * about any of it. `y0` is where the solid starts: the ground for a column,
 * the underside of the slab for anything she can jump under.
 */
type Dress = (g: THREE.Group, p: Piece, y0: number) => void;

/** A shortbread slab: chocolate chips in the sides, a paler baked top. */
const biscuit: Dress = (g, p, y0) => {
  g.add(slab(C.biscuit, p.cx, p.cz, p.w, p.d, p.top - 0.12, y0, 3));
  g.add(slab(C.biscuitLight, p.cx, p.cz, p.w - 0.3, p.d - 0.3, p.top + 0.03, p.top - 0.14, 2));
  // chips, always well under the top face so none of them reads as a ledge
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.5;
    g.add(
      slab(
        C.chocDark,
        p.cx + Math.cos(a) * (p.w / 2 - 0.22),
        p.cz + Math.sin(a) * (p.d / 2 - 0.22),
        0.5,
        0.5,
        p.top - 0.4 - (k % 2) * 0.25,
        p.top - 0.75 - (k % 2) * 0.25,
        1,
      ),
    );
  }
};

/** A gumdrop: a sugared dome flattened off at the top, on a jelly body. */
const gumdrop: Dress = (g, p, y0) => {
  const r = fit(p);
  const color = GUMDROP[p.index % GUMDROP.length]!;
  g.add(puck(color, p.cx, p.cz, r * 0.97, r * 0.62, p.top - 0.1, y0));
  // the sugar the sweet is rolled in, and the flat the engine says is its top
  g.add(puck(C.icing, p.cx, p.cz, r * 0.93, r * 0.99, p.top + 0.03, p.top - 0.12, true));
};

/** A liquorice beam: black, with the red stripe of an allsort across it. */
const liquorice: Dress = (g, p, y0) => {
  const along = p.dir === "E" || p.dir === "W";
  const len = along ? p.w : p.d;
  const wide = along ? p.d : p.w;
  g.add(slab(C.licorice, p.cx, p.cz, p.w, p.d, p.top - 0.05, y0, 2));
  const n = Math.max(3, Math.round(len / 1.5));
  for (let i = 0; i < n; i++) {
    const o = -len / 2 + ((i + 0.5) * len) / n;
    g.add(
      slab(
        i % 2 ? C.cane : C.icing,
        p.cx + (along ? o : 0),
        p.cz + (along ? 0 : o),
        along ? (len / n) * 0.55 : wide,
        along ? wide : (len / n) * 0.55,
        p.top + 0.03,
        p.top - 0.07,
        1,
      ),
    );
  }
};

/** A chocolate bar: the squares, and the ridge round the edge of the slab. */
const chocbar: Dress = (g, p, y0) => {
  g.add(slab(C.chocDark, p.cx, p.cz, p.w, p.d, p.top - 0.08, y0, 2));
  const nx = Math.max(2, Math.round(p.w / 1.3));
  const nz = Math.max(2, Math.round(p.d / 1.3));
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      g.add(
        slab(
          C.choc,
          p.cx - p.w / 2 + ((i + 0.5) * p.w) / nx,
          p.cz - p.d / 2 + ((j + 0.5) * p.d) / nz,
          (p.w / nx) * 0.82,
          (p.d / nz) * 0.82,
          p.top + 0.03,
          p.top - 0.1,
          1,
        ),
      );
    }
  }
};

/** A marshmallow: a soft pink cylinder dusted with icing sugar. */
const marshmallow: Dress = (g, p, y0) => {
  const r = fit(p);
  g.add(puck(C.blush, p.cx, p.cz, r * 0.99, r * 0.95, p.top - 0.09, y0));
  g.add(puck(C.icing, p.cx, p.cz, r * 0.9, r * 0.96, p.top + 0.03, p.top - 0.11, true));
};

/** A wafer: biscuit, cream, biscuit, with the waffle pressed into the top. */
const wafer: Dress = (g, p, y0) => {
  // a wafer is a wafer whether it is a slab she jumps under or a column from
  // the chocolate, so the layers are a fixed thickness and anything taller
  // than that is stacked wafer underneath
  const yb = Math.max(y0, p.top - 1.1);
  if (yb > y0 + 0.02) g.add(slab(C.biscuit, p.cx, p.cz, p.w, p.d, yb, y0, 3));
  g.add(slab(C.biscuit, p.cx, p.cz, p.w, p.d, yb + 0.42, yb, 2));
  g.add(slab(C.cream, p.cx, p.cz, p.w - 0.16, p.d - 0.16, yb + 0.72, yb + 0.42, 1));
  g.add(slab(C.biscuit, p.cx, p.cz, p.w, p.d, p.top - 0.06, yb + 0.72, 2));
  const n = 4;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      g.add(
        slab(
          C.biscuitLight,
          p.cx - p.w / 2 + ((i + 0.5) * p.w) / n,
          p.cz - p.d / 2 + ((j + 0.5) * p.d) / n,
          (p.w / n) * 0.78,
          (p.d / n) * 0.78,
          p.top + 0.03,
          p.top - 0.08,
          1,
        ),
      );
    }
  }
};

/** A peppermint humbug: white, with six red wedges round it. */
const peppermint: Dress = (g, p, y0) => {
  const r = fit(p);
  g.add(puck(C.icing, p.cx, p.cz, r * 0.99, r * 0.99, p.top - 0.08, y0));
  for (let k = 0; k < 6; k += 2) {
    const a = (k / 6) * Math.PI * 2;
    const wedge = new THREE.Mesh(cyl(r * 0.95, r * 0.95, 0.12, 8, a, Math.PI / 3), lam(C.cane, { flat: true }));
    wedge.position.set(p.cx, p.top - 0.03, p.cz);
    g.add(wedge);
  }
};

/** The prize podium: a cream sponge with a band of icing under its top. */
const cake: Dress = (g, p, y0) => {
  g.add(slab(C.cream, p.cx, p.cz, p.w, p.d, p.top - 0.55, y0, 3));
  g.add(slab(C.choc, p.cx, p.cz, p.w - 0.06, p.d - 0.06, p.top - 0.12, p.top - 0.55, 2));
  g.add(slab(C.blush, p.cx, p.cz, p.w - 0.5, p.d - 0.5, p.top + 0.03, p.top - 0.14, 1));
};

const DRESS: Record<string, Dress> = {
  biscuit,
  gumdrop,
  liquorice,
  chocbar,
  marshmallow,
  wafer,
  peppermint,
  cake,
};

/* ----------------------------------------------------------- the dressing */

/**
 * The theme. `drawStatic` gets world coordinates and a column from the ground;
 * `drawMover` gets the piece's own frame, where the top face is y = 0, so the
 * same dressing is written once against a piece that has been moved to the
 * origin. `local` is that piece.
 */
function localCopy(p: Piece): Piece {
  return { ...p, cx: 0, cz: 0, top: 0 };
}

export const CHOC_THEME: LavaTheme = {
  noun: "chocolate",
  title: "FLOOR IS CHOCOLATE",
  bubble: ["Jump the whole course!", "Light the candy flags!"],
  notice:
    "The floor is chocolate! Jump the whole course to the prize. Light a candy flag and falling in only sends you back to the flag.",
  fallLines: [
    "Splosh! Into the chocolate. Back to the start!",
    "Chocolatey! Have another go from the start.",
    "Whoops! Chocolate everywhere. Start again!",
  ],
  checkpointFallLines: [
    "Splosh! Back to your candy flag.",
    "Into the chocolate — the flag caught you!",
    "Whoops! Your flag brought you back.",
  ],
  checkpointLine: "Candy flag lit!",
  // Park 2 has no accessory of its own yet: every hand accessory in
  // accessories.ts is already a carnival prize. Give this theme a `prize` id
  // and the podium hands it over exactly as park 1's does.
  prize: null,
  // Chocolate is not molten rock: it takes its colour from the light rather
  // than making its own, so the glow is only enough to keep it warm in shade
  // and it stays well under the bloom threshold.
  liquid: { color: C.choc, glow: "#5a2f12", glowIntensity: 0.45, crust: C.chocDark },
  rock: C.sugar,
  rockDark: C.chocDark,
  stone: C.biscuit,
  cap: C.biscuitLight,
  wood: C.cane,
  woodDark: C.icing,
  rope: C.licorice,
  trim: C.cane,
  gold: C.sun,
  edge: C.sun,
  edgeGive: C.cane,
  sectionCap: [C.biscuitLight, C.blush, C.mint, C.sun, C.lilac, C.orange, C.pink, C.cane],
  drawStatic(g, p) {
    const dress = DRESS[p.skin];
    if (!dress) return false;
    dress(g, p, p.base);
    return true;
  },
  drawMover(f, p) {
    const dress = DRESS[p.skin];
    if (!dress) return false;
    dress(f, localCopy(p), -(p.top - p.base));
    return true;
  },
  trophyMesh() {
    // a giant wrapped chocolate bar, standing on its end
    const g = new THREE.Group();
    const bar = new THREE.Mesh(beveledBox(1.5, 2.2, 0.45), lam(C.sun, { repeat: 1 }));
    g.add(bar);
    const wrap = new THREE.Mesh(beveledBox(1.56, 0.8, 0.5), lam(C.cane, { flat: true }));
    wrap.position.y = -0.4;
    g.add(wrap);
    for (const s of [-1, 1]) {
      const nib = new THREE.Mesh(beveledBox(0.34, 0.34, 0.5), lam(C.choc, { flat: true }));
      nib.position.set(s * 0.45, 1.25, 0);
      g.add(nib);
    }
    return g;
  },
  decor(g) {
    // marshmallow swirls afloat on the chocolate, purely so the surface is not
    // a flat brown sheet. They sit in the liquid, below anything standable.
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 30; i++) {
      const r = 0.6 + rnd() * 0.9;
      const x = LAVA_POOL.minX + rnd() * (LAVA_POOL.maxX - LAVA_POOL.minX);
      const z = LAVA_POOL.minZ + rnd() * (LAVA_POOL.maxZ - LAVA_POOL.minZ);
      g.add(puck(i % 3 ? C.icing : C.blush, x, z, r, r * 0.9, LAVA_SURFACE + 0.05, LAVA_SURFACE - 0.14, true));
    }
  },
};

/* ------------------------------------------------------------- the route */

const SINK = { kind: "squash", drop: 3.0, down: 2.5, up: 1.6 } as const;

/**
 * The route, piece by piece. `gap` is the clear air she jumps and `len` is how
 * far the piece runs along the route, so these numbers are the jumps and the
 * landing room, measured rather than guessed: see the notes at the top for
 * what each section is for.
 *
 * It runs west off the deck, south down the beams, east over the bog, south
 * again on the ferry, west along the wheels and the climb, and finishes going
 * north — a loop, so the podium is back within sight of where she started.
 */
export const CHOC_PLAN: PlanStep[] = [
  { id: "deck", kind: "deck", skin: "biscuit", len: 9.0, wide: 9.5, top: 3.0, section: 0 },

  // ---- 1. Gumdrop Hops: wide, but it climbs a metre as it zig-zags -------
  { id: "g1", skin: "gumdrop", len: 4.4, wide: 4.8, gap: 2.4, top: 3.1, section: 1 },
  { id: "g2", skin: "gumdrop", len: 4.4, wide: 4.8, gap: 2.7, off: 1.8, top: 3.4, section: 1 },
  { id: "g3", skin: "gumdrop", len: 4.4, wide: 4.8, gap: 2.9, off: -1.8, top: 3.7, section: 1 },
  { id: "brink", skin: "biscuit", len: 5.4, wide: 5.8, gap: 3.0, top: 4.0, section: 1 },

  // ---- 2. The Liquorice Beams: narrow, and entered sideways --------------
  // The course turns here, so the first beam is a 1.4m-wide thing she has to
  // land on after changing direction, not one she walks onto off a wide pad.
  // It ends with a 3.8m run-up jump taken off the end of a beam; park 1's
  // longest is 3.6m and it is taken off a pad three times as wide.
  { id: "beam1", kind: "beam", skin: "liquorice", len: 7.0, wide: 1.4, gap: 2.8, top: 4.0, turn: "S", section: 2, slab: 0.45 },
  { id: "hinge", skin: "biscuit", len: 3.6, wide: 4.0, gap: 2.6, top: 4.1, section: 2 },
  { id: "beam2", kind: "beam", skin: "liquorice", len: 6.4, wide: 1.4, gap: 2.8, off: -2.2, top: 4.1, section: 2, slab: 0.45 },
  { id: "beam3", kind: "beam", skin: "liquorice", len: 5.0, wide: 1.4, gap: 2.8, off: 2.2, top: 4.2, section: 2, slab: 0.45 },
  // the run-up jump: 3.8m, taken off the end of a beam, onto the first flag
  { id: "flag1", skin: "marshmallow", len: 6.2, wide: 6.6, gap: 3.8, top: 4.2, section: 2, checkpoint: true },

  // ---- 3. The Marshmallow Bog: they sink under her, not on a timer -------
  // Three seconds of standing on one puts her in the chocolate, so the whole
  // section is one held breath. The gaps are short on purpose: this is about
  // not stopping, not about how far she can jump.
  { id: "bog1", skin: "marshmallow", len: 3.8, wide: 4.2, gap: 2.4, top: 4.2, turn: "E", section: 3, slab: 1.3, motion: SINK },
  { id: "bog2", skin: "marshmallow", len: 3.8, wide: 4.2, gap: 2.4, off: 1.6, top: 4.2, section: 3, slab: 1.3, motion: SINK },
  { id: "bog3", skin: "marshmallow", len: 3.8, wide: 4.2, gap: 2.4, off: -1.6, top: 4.2, section: 3, slab: 1.3, motion: SINK },
  { id: "bank", skin: "biscuit", len: 5.4, wide: 5.8, gap: 2.6, top: 4.2, section: 3 },

  // ---- 4. The Chocolate Ferry: catch it, ride it, get off ----------------
  // The far quay is nine metres away. Nothing jumps that, so the only way on
  // is the barge, and the only way off is to still be on it when it arrives.
  { id: "quay", skin: "chocbar", len: 4.8, wide: 5.2, gap: 2.6, top: 4.2, turn: "S", section: 4 },
  { id: "ferry", skin: "chocbar", len: 5.2, wide: 5.4, gap: 3.0, top: 4.2, section: 4, slab: 1.1,
    motion: { kind: "shuttle", travel: 9.0, period: 12.5, phase: 0 } },
  { id: "far", skin: "biscuit", len: 4.8, wide: 5.2, gap: 3.0, top: 4.2, section: 4 },
  { id: "flag2", skin: "marshmallow", len: 6.2, wide: 6.6, gap: 3.0, top: 4.2, section: 4, checkpoint: true },

  // ---- 5. The Peppermint Wheels: land on something that is moving -------
  { id: "mint1", skin: "peppermint", len: 4.4, wide: 4.4, gap: 2.8, top: 4.4, turn: "W", section: 5, slab: 1.0, spin: 0.3,
    motion: { kind: "slide", travel: 4.2, period: 6.4, phase: 0 } },
  { id: "mint2", skin: "peppermint", len: 4.4, wide: 4.4, gap: 2.9, off: 1.8, top: 4.5, section: 5, slab: 1.0, spin: -0.26,
    motion: { kind: "slide", travel: 4.2, period: 6.4, phase: Math.PI } },
  { id: "mint3", skin: "peppermint", len: 4.4, wide: 4.4, gap: 2.9, off: -1.8, top: 4.6, section: 5, slab: 1.0, spin: 0.22,
    motion: { kind: "slide", travel: 4.0, period: 5.6, phase: 2.4 } },
  { id: "shelf", skin: "wafer", len: 5.2, wide: 5.6, gap: 3.0, top: 4.6, section: 5 },

  // ---- 6. The Wafer Climb: up a lift to a tower, and a drop off it ------
  { id: "rung", skin: "wafer", len: 4.2, wide: 4.4, gap: 2.8, top: 5.0, section: 6, slab: 0.9 },
  { id: "hoist", skin: "wafer", len: 4.6, wide: 4.8, gap: 2.8, top: 5.2, section: 6, slab: 1.0,
    motion: { kind: "lift", travel: 2.6, period: 8.5, phase: 0 } },
  { id: "tower", skin: "biscuit", len: 5.4, wide: 5.8, gap: 2.8, top: 6.6, section: 6 },
  // the drop: three metres down, onto a landing long enough to catch a jump
  // taken at full speed from that height
  { id: "flag3", skin: "marshmallow", len: 8.0, wide: 6.8, gap: 3.2, top: 3.4, section: 6, checkpoint: true },

  // ---- 7. The Last Leap: small gumdrops, long gaps, one of them moving ---
  { id: "leap1", skin: "gumdrop", len: 3.2, wide: 3.6, gap: 3.4, top: 3.5, turn: "N", section: 7 },
  { id: "leap2", skin: "gumdrop", len: 3.0, wide: 3.6, gap: 3.5, off: -2.0, top: 3.6, section: 7 },
  { id: "swing", skin: "peppermint", len: 3.6, wide: 3.8, gap: 3.4, off: 2.0, top: 3.7, section: 7, slab: 1.0, spin: 0.34,
    motion: { kind: "slide", travel: 3.4, period: 5.2, phase: 1.1 } },
  { id: "leap3", skin: "gumdrop", len: 3.0, wide: 3.6, gap: 3.5, top: 3.8, section: 7 },
  { id: "podium", kind: "podium", skin: "cake", len: 7.0, wide: 7.2, gap: 3.8, top: 4.2, section: 7 },
];

export const CHOC_SECTIONS = [
  "the start",
  "Gumdrop Hops",
  "The Liquorice Beams",
  "The Marshmallow Bog",
  "The Chocolate Ferry",
  "The Peppermint Wheels",
  "The Wafer Climb",
  "The Last Leap",
];

/**
 * Where it stands in Sugar Rush: on the open ground, running west off the deck
 * and looping round to finish facing back at it.
 */
export const CHOC_COURSE: LavaCourse = {
  x: 0,
  z: 0,
  dir: "W",
  plan: CHOC_PLAN,
  sections: CHOC_SECTIONS,
  theme: CHOC_THEME,
};
