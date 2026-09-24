import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { beveledBox } from "./beveled";
import { canvasMaterial, glowMaterial, type Draw, type FurnitureId, type SpotId } from "./furniture";
import { lam } from "./meshes";

/**
 * The gingerbread house in Sugar Rush Park: its furniture catalogue and a mesh
 * builder for every piece.
 *
 * Same ten spots, same frames and the same footprints as the clubhouse in park
 * one (furniture.ts), so the room, its colliders and the decorate panel can be
 * reused wholesale; only the things standing in the spots change. Everything
 * here is made of sweets.
 *
 * Both kids decorate. Every spot offers something obviously for a girl,
 * something obviously for a boy, and at least one that is neither, and the
 * free starter is always the neutral one so nobody opens the panel and finds
 * the other one's room already set up. The pairs are drawn broadly on purpose
 * (ruffles, hearts and icing against wheels, speed stripes and mud) because
 * they have to read from the sofa, on a TV, in half a second.
 *
 * Every spot also has one prize piece that cannot be bought, only won from a
 * gumball machine in the park (candyPrizeFurniture). The prizes are the
 * showiest thing at their spot, so the panel's dark "Prize" tile is worth
 * wondering about.
 *
 * Frames, repeated from furniture.ts because they are what keeps a piece off
 * the wall and out of the floor:
 *   - floor pieces (bed, rug, lamp, plant, table, petbed): origin at the centre
 *     of the footprint on the floor, front facing +z.
 *   - wall pieces (curtains, picture): origin at the item's centre on the wall,
 *     everything in front of it at z 0..0.3.
 *   - wallpaper and floor are materials, not meshes: candySurfaceMaterial(id)
 *     goes on the room's walls or floor and makeCandyFurniture returns an
 *     empty group.
 *
 * Nothing allocates per call but Object3D wrappers: geometries, materials and
 * canvas textures are cached, so swapping a piece never needs a dispose.
 */

/**
 * How she gets a piece: "starter" is free and out from the first visit, "shop"
 * costs tickets, and "prize" can only be won from the park's gumball machines,
 * so there is always something left to hope for after the shop is bought out.
 */
type CandySource = "starter" | "shop" | "prize";

type CandyEntry = {
  id: string;
  name: string;
  spot: SpotId;
  source: CandySource;
  price?: number;
};

/**
 * The first pieces are priced like park one: a surface is 4-7, soft
 * furnishings 8-12, a piece of furniture 15-22. The second wave, added once
 * the fairground was paying out properly, is dearer and spread wider so there
 * is always a next thing to save for: a surface 15-18, rugs and pet beds about
 * 20, lamps, plants and curtains 24-34, pictures 40, tables 60-70, and the two
 * big beds 95 and 120. Prize pieces have no price at all.
 *
 * Within each spot the list reads starter, shop pieces, then prizes, which is
 * the order the decorate panel shows them in.
 *
 * Written `as const` so the id union below is the catalogue itself; adding a
 * piece here is the only place an id is ever spelled out.
 */
const CATALOGUE = [
  { id: "candy_bed_marshmallow", name: "Marshmallow bunk bed", spot: "bed", source: "starter" },
  { id: "candy_bed_gumdrop", name: "Gumdrop canopy bed", spot: "bed", source: "shop", price: 22 },
  { id: "candy_bed_racer", name: "Chocolate racing car bed", spot: "bed", source: "shop", price: 22 },
  { id: "candy_bed_cupcake", name: "Cupcake bed", spot: "bed", source: "shop", price: 95 },
  { id: "candy_bed_train", name: "Gingerbread train bed", spot: "bed", source: "shop", price: 120 },
  { id: "candy_bed_cloud", name: "Cotton candy cloud bed", spot: "bed", source: "prize" },

  { id: "candy_rug_peppermint", name: "Round peppermint rug", spot: "rug", source: "starter" },
  { id: "candy_rug_swirl", name: "Rainbow swirl rug", spot: "rug", source: "shop", price: 8 },
  { id: "candy_rug_tracks", name: "Liquorice tyre-track rug", spot: "rug", source: "shop", price: 8 },
  { id: "candy_rug_jellybean", name: "Jelly bean rug", spot: "rug", source: "shop", price: 10 },
  { id: "candy_rug_gumdrop", name: "Gumdrop dot rug", spot: "rug", source: "shop", price: 20 },
  { id: "candy_rug_checkers", name: "Candy checkers rug", spot: "rug", source: "shop", price: 25 },
  { id: "candy_rug_heart", name: "Heart cookie rug", spot: "rug", source: "prize" },

  { id: "candy_wall_cane", name: "Candy cane stripes", spot: "wallpaper", source: "starter" },
  { id: "candy_wall_icing", name: "Pink polka icing", spot: "wallpaper", source: "shop", price: 6 },
  { id: "candy_wall_speed", name: "Blue racing stripes", spot: "wallpaper", source: "shop", price: 6 },
  { id: "candy_wall_choc", name: "Chocolate bar squares", spot: "wallpaper", source: "shop", price: 7 },
  { id: "candy_wall_clouds", name: "Cotton candy clouds", spot: "wallpaper", source: "shop", price: 15 },
  { id: "candy_wall_stars", name: "Starry night frosting", spot: "wallpaper", source: "shop", price: 18 },
  { id: "candy_wall_gummies", name: "Gummy bear parade", spot: "wallpaper", source: "prize" },

  { id: "candy_floor_mints", name: "Checkerboard mints", spot: "floor", source: "starter" },
  { id: "candy_floor_sugar", name: "Pink sugar tiles", spot: "floor", source: "shop", price: 5 },
  { id: "candy_floor_track", name: "Liquorice race track", spot: "floor", source: "shop", price: 5 },
  { id: "candy_floor_choc", name: "Chocolate planks", spot: "floor", source: "shop", price: 6 },
  { id: "candy_floor_waffle", name: "Waffle cone floor", spot: "floor", source: "shop", price: 15 },
  { id: "candy_floor_sprinkles", name: "Sprinkle frosting floor", spot: "floor", source: "shop", price: 18 },
  { id: "candy_floor_jelly", name: "Jelly tiles", spot: "floor", source: "prize" },

  { id: "candy_curtains_awning", name: "Sweet shop awning", spot: "curtains", source: "starter" },
  { id: "candy_curtains_lace", name: "Icing lace curtains", spot: "curtains", source: "shop", price: 10 },
  { id: "candy_curtains_flags", name: "Racing flag bunting", spot: "curtains", source: "shop", price: 10 },
  { id: "candy_curtains_rainbow", name: "Rainbow ribbon curtains", spot: "curtains", source: "shop", price: 30 },
  { id: "candy_curtains_space", name: "Space sweets curtains", spot: "curtains", source: "shop", price: 32 },
  { id: "candy_curtains_beads", name: "Gumdrop bead curtains", spot: "curtains", source: "prize" },

  { id: "candy_lamp_gumball", name: "Gumball lamp", spot: "lamp", source: "starter" },
  { id: "candy_lamp_lollipop", name: "Lollipop lamp", spot: "lamp", source: "shop", price: 12 },
  { id: "candy_lamp_rocket", name: "Rocket lolly lamp", spot: "lamp", source: "shop", price: 14 },
  { id: "candy_lamp_candle", name: "Candy candle", spot: "lamp", source: "shop", price: 9 },
  { id: "candy_lamp_star", name: "Star night light", spot: "lamp", source: "shop", price: 24 },
  { id: "candy_lamp_traffic", name: "Traffic light lamp", spot: "lamp", source: "shop", price: 28 },
  { id: "candy_lamp_jellyfish", name: "Jellyfish gummy lamp", spot: "lamp", source: "prize" },

  { id: "candy_plant_lollitree", name: "Lollipop tree", spot: "plant", source: "starter" },
  { id: "candy_plant_cupcake", name: "Cupcake flower pot", spot: "plant", source: "shop", price: 9 },
  { id: "candy_plant_cactus", name: "Gummy cactus", spot: "plant", source: "shop", price: 9 },
  { id: "candy_plant_sunflower", name: "Cookie sunflower", spot: "plant", source: "shop", price: 26 },
  { id: "candy_plant_flytrap", name: "Gummy flytrap", spot: "plant", source: "shop", price: 34 },
  { id: "candy_plant_cottontree", name: "Cotton candy tree", spot: "plant", source: "prize" },

  { id: "candy_table_liquorice", name: "Liquorice allsort table", spot: "table", source: "starter" },
  { id: "candy_table_cupcake", name: "Cupcake tea table", spot: "table", source: "shop", price: 16 },
  { id: "candy_table_crate", name: "Sweet crate workbench", spot: "table", source: "shop", price: 15 },
  { id: "candy_table_donut", name: "Donut table", spot: "table", source: "shop", price: 60 },
  { id: "candy_table_race", name: "Race track table", spot: "table", source: "shop", price: 70 },
  { id: "candy_table_macaron", name: "Macaron table", spot: "table", source: "prize" },

  { id: "candy_picture_lollipop", name: "Giant lollipop", spot: "picture", source: "starter" },
  { id: "candy_picture_princess", name: "Candy princess portrait", spot: "picture", source: "shop", price: 12 },
  { id: "candy_picture_truck", name: "Monster truck poster", spot: "picture", source: "shop", price: 12 },
  { id: "candy_picture_unicorn", name: "Unicorn painting", spot: "picture", source: "shop", price: 40 },
  { id: "candy_picture_dino", name: "Gummy dino poster", spot: "picture", source: "shop", price: 40 },
  { id: "candy_picture_sweets", name: "Sweetie collection box", spot: "picture", source: "prize" },

  { id: "candy_petbed_biscuit", name: "Biscuit basket", spot: "petbed", source: "starter" },
  { id: "candy_petbed_marshmallow", name: "Marshmallow pet bed", spot: "petbed", source: "shop", price: 10 },
  { id: "candy_petbed_tyre", name: "Liquorice tyre bed", spot: "petbed", source: "shop", price: 10 },
  { id: "candy_petbed_donut", name: "Donut pet bed", spot: "petbed", source: "shop", price: 18 },
  { id: "candy_petbed_cupcake", name: "Cupcake case bed", spot: "petbed", source: "shop", price: 22 },
  { id: "candy_petbed_royal", name: "Royal pet cushion", spot: "petbed", source: "prize" },
] as const satisfies readonly CandyEntry[];

export type CandyFurnitureId = (typeof CATALOGUE)[number]["id"];
export type CandyFurnitureDef = { id: CandyFurnitureId; name: string; spot: SpotId; source: CandySource; price?: number };
export const CANDY_FURNITURE: readonly CandyFurnitureDef[] = CATALOGUE;

// keyed by plain string: ids come back out of the save as strings
const BY_ID = new Map<string, CandyFurnitureDef>(CANDY_FURNITURE.map((f) => [f.id, f]));

export function candyFurnitureDef(id: string): CandyFurnitureDef | undefined {
  return BY_ID.get(id);
}

/** Whether a saved string is a piece in this catalogue (narrows for the builders). */
export function isCandyFurnitureId(id: string): id is CandyFurnitureId {
  return BY_ID.has(id);
}

/** Every option for a spot, in catalogue order (starter first). */
export function candyFurnitureFor(spot: SpotId): CandyFurnitureDef[] {
  return CANDY_FURNITURE.filter((f) => f.spot === spot);
}

/** The piece each spot starts with. */
export function starterCandyFurniture(): Record<SpotId, CandyFurnitureId> {
  const out = {} as Record<SpotId, CandyFurnitureId>;
  for (const f of CANDY_FURNITURE) if (f.source === "starter") out[f.spot] = f.id;
  return out;
}

/**
 * The pieces only a gumball machine gives out, in catalogue order. The
 * machines pick from this list; nothing here decides which one or when.
 */
export function candyPrizeFurniture(): FurnitureId[] {
  return CANDY_FURNITURE.filter((f) => f.source === "prize").map((f) => f.id);
}

/**
 * Solid footprint per floor spot, in the spot's local frame, centred on the
 * anchor. Identical to park one's so a room built for either catalogue has the
 * same colliders: every option at a spot is built inside w x d, and the top is
 * where a kid's hand expects to meet it. Only the pet bed's height follows the
 * piece, so she never walks into an invisible ledge over a flat one.
 */
const SOLID: Partial<Record<SpotId, { w: number; d: number; h: number }>> = {
  bed: { w: 2.1, d: 1.3, h: 0.7 },
  lamp: { w: 0.5, d: 0.5, h: 1.0 },
  plant: { w: 0.56, d: 0.56, h: 1.0 },
  table: { w: 1.2, d: 0.9, h: 0.72 },
  petbed: { w: 0.9, d: 0.8, h: 0.24 },
};
/**
 * A pet bed's top is also where her creature sits in it (candy-creatures.ts),
 * so every one needs its own entry, measured at the rim or cushion, not at a
 * crown or cherry sticking up off one corner. That is also why every pet bed
 * here is open on top: a roofed one would put the pet on the roof.
 */
const SOLID_TOP: Record<string, number> = {
  candy_petbed_biscuit: 0.28,
  candy_petbed_marshmallow: 0.18,
  candy_petbed_tyre: 0.26,
  candy_petbed_donut: 0.22,
  candy_petbed_cupcake: 0.28,
  candy_petbed_royal: 0.22,
};

/** The solid box of a piece in its spot's local frame, or null if it has none. */
export function candyFurnitureSolid(id: string): { w: number; d: number; h: number } | null {
  const def = BY_ID.get(id);
  if (!def) return null;
  const s = SOLID[def.spot];
  if (!s) return null;
  return { ...s, h: SOLID_TOP[id] ?? s.h };
}

// ---------------------------------------------------------------------------
// shared geometry and materials

type V3 = [number, number, number];

const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

const G = {
  box: () => cached("box", () => new THREE.BoxGeometry(1, 1, 1)),
  plane: () => cached("plane", () => new THREE.PlaneGeometry(1, 1)),
  sphere: () => cached("sphere", () => new THREE.SphereGeometry(1, 12, 8)),
  sphereLo: () => cached("sphereLo", () => new THREE.SphereGeometry(1, 8, 6)),
  dome: () => cached("dome", () => new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2)),
  cyl: () => cached("cyl", () => new THREE.CylinderGeometry(1, 1, 1, 16)),
  cylLo: () => cached("cylLo", () => new THREE.CylinderGeometry(1, 1, 1, 8)),
  cylHi: () => cached("cylHi", () => new THREE.CylinderGeometry(1, 1, 1, 32)),
  frustum: (top: number, bottom: number) =>
    cached(`fr|${top}|${bottom}`, () => new THREE.CylinderGeometry(top, bottom, 1, 16)),
  cone: () => cached("cone", () => new THREE.ConeGeometry(1, 1, 12)),
  torus: () => cached("torus", () => new THREE.TorusGeometry(1, 0.25, 8, 24)),
  ring: () => cached("ring", () => new THREE.TorusGeometry(1, 0.1, 6, 20)),
  /** a heart about 2 units across, for the girls' pieces */
  heart: () =>
    cached("heart", () => {
      const s = new THREE.Shape();
      s.moveTo(0, -0.95);
      s.bezierCurveTo(1.35, 0.2, 0.72, 1.15, 0, 0.45);
      s.bezierCurveTo(-0.72, 1.15, -1.35, 0.2, 0, -0.95);
      return new THREE.ShapeGeometry(s, 10);
    }),
  /** a pennant hanging point-down, for bunting */
  pennant: () =>
    cached("pennant", () => {
      const s = new THREE.Shape();
      s.moveTo(-0.5, 0.5);
      s.lineTo(0.5, 0.5);
      s.lineTo(0, -0.5);
      return new THREE.ShapeGeometry(s);
    }),
  /**
   * The heart with a unit of depth along +z, for a heart that has to stand up
   * as a thing (a cookie) rather than be painted on one.
   */
  heartSlab: () =>
    cached("heartSlab", () => {
      const s = new THREE.Shape();
      s.moveTo(0, -0.95);
      s.bezierCurveTo(1.35, 0.2, 0.72, 1.15, 0, 0.45);
      s.bezierCurveTo(-0.72, 1.15, -1.35, 0.2, 0, -0.95);
      return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 10 });
    }),
  /**
   * A chunky five-point star about 2 units across and 0.5 deep, centred on
   * its middle. Rounded off by the bevel so it reads as a moulded sweet, not a
   * sheriff's badge.
   */
  star: () =>
    cached("star", () => {
      const s = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 0.46 : 0.9;
        const a = Math.PI / 2 + (i * Math.PI) / 5;
        if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      const geo = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 2 });
      geo.translate(0, 0, -0.15);
      return geo;
    }),
  /** half a ring, standing up over the x axis, for rainbows */
  arch: () => cached("arch", () => new THREE.TorusGeometry(1, 0.08, 6, 20, Math.PI)),
  /**
   * One of six jellyfish tentacles in the lamp's own frame: a gummy worm
   * wiggling from under the bell (y 0.64) down to the dish (y 0.06), swinging
   * in and out and a little sideways as it goes.
   */
  tentacle: (i: number) =>
    cached(`tentacle|${i}`, () => {
      const a0 = (i / 6) * Math.PI * 2 + 0.3;
      const pts = [
        [0.13, 0.64, 0],
        [0.17, 0.5, 0.18],
        [0.11, 0.36, -0.12],
        [0.16, 0.21, 0.14],
        [0.12, 0.06, 0],
      ].map(([r, y, da]) => new THREE.Vector3(Math.cos(a0 + da!) * r!, y!, Math.sin(a0 + da!) * r!));
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.02, 6, false);
    }),
  /** a very fat half ring, the crook of a candy cane */
  hook: () => cached("hook", () => new THREE.TorusGeometry(1, 0.42, 6, 12, Math.PI)),
  /** a fat half ring, turned upside down to be a smile on a face */
  smile: () => cached("smile", () => new THREE.TorusGeometry(1, 0.22, 6, 12, Math.PI).rotateZ(Math.PI)),
  /**
   * One string of a bead curtain: n beads 0.1m apart hanging down the y axis
   * from 0, merged, so a whole curtain of them is a couple of dozen draw calls
   * rather than a couple of hundred.
   */
  beads: (n: number) =>
    cached(`beads|${n}`, () => {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < n; i++) {
        // low-poly on purpose: there are a couple of hundred of them
        const b = new THREE.SphereGeometry(0.045, 6, 4);
        b.scale(1, 1.1, 1);
        b.translate(0, -0.05 - i * 0.1, 0);
        parts.push(b);
      }
      return mergeGeometries(parts)!;
    }),
};

// Sweets are either dusted (marshmallow, icing, wafer) or wet-looking (boiled
// sweets, gummies, chocolate). Roughness does most of the work of telling them
// apart, so there are two helpers rather than one.
const col = (c: string, roughness = 0.6) => lam(c, { flat: true, roughness });
const wet = (c: string) => lam(c, { flat: true, roughness: 0.14 });
const clear = (c: string, opacity = 0.55) => lam(c, { flat: true, roughness: 0.1, opacity, transparent: true });

const PINK = "#f78fc0";
const ICING = "#ffd9e8";
const CREAM = "#fdf4e6";
const MARSH = "#fbf1e4";
const CHOC = "#5a3420";
const MILK = "#8a5433";
const WAFER = "#e8c48a";
const LIQ = "#2b2530";
const RED = "#e8404a";
const BLUE = "#3f8fe0";
const LIME = "#93d84a";
const LEMON = "#ffd54a";
const GRAPE = "#9a6ad8";
const MINT = "#8fe3c8";
const ORANGE = "#ff9a3c";
const CANDY = [RED, LEMON, LIME, BLUE, GRAPE, ORANGE, PINK];

function addMesh(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material | THREE.Material[],
  s: V3,
  p: V3,
  r?: V3,
  shadow = true,
) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(s[0], s[1], s[2]);
  m.position.set(p[0], p[1], p[2]);
  if (r) m.rotation.set(r[0], r[1], r[2]);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** A beveled part at its true size (the soft-edged sweet look); never scaled. */
function bev(parent: THREE.Object3D, mat: string | THREE.Material, s: V3, p: V3, r?: V3, shadow = true) {
  return addMesh(parent, beveledBox(s[0], s[1], s[2]), typeof mat === "string" ? col(mat) : mat, [1, 1, 1], p, r, shadow);
}

/** A plain box scaled from the shared unit cube, for small and thin details. */
function box(parent: THREE.Object3D, mat: string | THREE.Material, s: V3, p: V3, r?: V3, shadow = false) {
  return addMesh(parent, G.box(), typeof mat === "string" ? col(mat) : mat, s, p, r, shadow);
}

// ---------------------------------------------------------------------------
// canvas art
//
// Texture keys all start with "candy-" so they never collide with park one's
// cache, which is shared through canvasMaterial.

function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function ellipse(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

/** Draw fn at (x, y) and at its wrapped copies, so tiles meet seamlessly. */
function wrapped(w: number, h: number, x: number, y: number, fn: (x: number, y: number) => void) {
  for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) fn(x + dx, y + dy);
}

function heartPath(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.beginPath();
  g.moveTo(x, y + s * 0.85);
  g.bezierCurveTo(x + s * 1.3, y - s * 0.2, x + s * 0.7, y - s * 1.1, x, y - s * 0.4);
  g.bezierCurveTo(x - s * 0.7, y - s * 1.1, x - s * 1.3, y - s * 0.2, x, y + s * 0.85);
  g.closePath();
}

function candyStarPath(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, rot = 0) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.48 : r;
    const a = -Math.PI / 2 + rot + (i * Math.PI) / 5;
    if (i === 0) g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    else g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
}

/**
 * A gummy bear standing up, `s` about half its height. Drawn from circles
 * only, with a pale shine on the tummy and head, because the shine is what
 * says gummy rather than teddy.
 */
function gummyBear(g: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  g.fillStyle = color;
  for (const [dx, dy, rx, ry] of [
    [-0.42, -1.02, 0.2, 0.2],
    [0.42, -1.02, 0.2, 0.2],
    [0, -0.7, 0.5, 0.44],
    [0, 0.25, 0.56, 0.62],
    [-0.52, -0.05, 0.2, 0.3],
    [0.52, -0.05, 0.2, 0.3],
    [-0.32, 0.86, 0.24, 0.2],
    [0.32, 0.86, 0.24, 0.2],
  ] as const) {
    ellipse(g, x + dx * s, y + dy * s, rx * s, ry * s);
    g.fill();
  }
  g.fillStyle = "rgba(255,255,255,0.45)";
  ellipse(g, x - 0.16 * s, y + 0.08 * s, 0.14 * s, 0.24 * s, 0.3);
  g.fill();
  ellipse(g, x - 0.2 * s, y - 0.86 * s, 0.1 * s, 0.07 * s);
  g.fill();
  g.fillStyle = "rgba(40,20,30,0.55)";
  for (const dx of [-0.17, 0.17]) {
    ellipse(g, x + dx * s, y - 0.72 * s, 0.06 * s, 0.07 * s);
    g.fill();
  }
}

/** Scattered hundreds-and-thousands, the quickest way to say "sweet". */
function sprinkles(g: CanvasRenderingContext2D, w: number, h: number, seed: number, n: number, len = 10) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * w;
    const y = r() * h;
    const rot = r() * Math.PI;
    g.fillStyle = CANDY[Math.floor(r() * CANDY.length)]!;
    wrapped(w, h, x, y, (px, py) => {
      g.save();
      g.translate(px, py);
      g.rotate(rot);
      g.fillRect(-len / 2, -len * 0.18, len, len * 0.36);
      g.restore();
    });
  }
}

/**
 * Diagonal stripes at exactly 45 degrees on a square tile, which is what makes
 * a candy cane: wrapped round a cylinder the diagonal becomes a helix, so a
 * pole only needs one material instead of a stack of rings.
 */
function caneDraw(base: string, stripe: string, bands = 2): Draw {
  return (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = stripe;
    g.lineWidth = (w / bands) * 0.38;
    g.lineCap = "butt";
    for (let i = -bands; i <= bands * 2; i++) {
      const x = (i * w) / bands;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + h, h);
      g.stroke();
    }
  };
}

/** A candy cane pole. `turns` is how many times the stripe wraps over the part. */
function caneMat(base: string, stripe: string, turns: number) {
  const key = `candy-cane|${base}|${stripe}|${turns}`;
  return canvasMaterial(key, base, 64, 64, caneDraw(base, stripe), { roughness: 0.3, repeat: [1, turns] });
}

/** The pleated paper case every cupcake in here stands in. */
function caseMat(base: string, fold: string) {
  return canvasMaterial(`candy-case|${base}`, base, 128, 32, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fold;
    for (let i = 0; i < 16; i++) g.fillRect((i * w) / 16, 0, w / 32, h);
  }, { roughness: 0.75, repeat: [1, 1] });
}

/** The swirl on a lollipop and on the rainbow rug: arms spiralling out. */
function swirlDraw(colors: string[], turns: number, bg: string): Draw {
  return (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) / 2;
    g.lineCap = "round";
    g.lineWidth = (R / turns / colors.length) * 1.5;
    colors.forEach((c, j) => {
      g.strokeStyle = c;
      g.beginPath();
      for (let k = 0; k <= 120; k++) {
        const t = k / 120;
        const a = t * turns * Math.PI * 2 + (j / colors.length) * Math.PI * 2;
        const rr = t * R;
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr;
        if (k === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    });
  };
}

const SWIRL_PINK = ["#ffffff", PINK, "#ffffff", "#ff5fa2"];
const SWIRL_RAINBOW = [RED, ORANGE, LEMON, LIME, BLUE, GRAPE];

function swirlMat(key: string, colors: string[], turns: number, bg = "#ffffff") {
  return canvasMaterial(`candy-swirl|${key}`, colors[1] ?? bg, 256, 256, swirlDraw(colors, turns, bg), { roughness: 0.22 });
}

// ---------------------------------------------------------------------------
// wallpaper and floor

type Surface = { fallback: string; tile: [number, number]; size: [number, number]; draw: Draw; roughness: number };

const SURFACES: Record<string, Surface> = {
  // neutral: the stripe is wide enough to read as a candy cane from across the
  // room rather than dissolving into pink
  candy_wall_cane: {
    fallback: "#f8e9ee",
    tile: [0.9, 0.9],
    size: [128, 128],
    roughness: 0.55,
    draw: caneDraw("#fdf6f0", "#e8404a"),
  },
  // girls': icing with polka dots and the odd heart, tiled small so the dots
  // stay dot-sized at her eye level rather than becoming beach balls
  candy_wall_icing: {
    fallback: "#ffd9e8",
    tile: [0.7, 0.7],
    size: [128, 128],
    roughness: 0.7,
    draw: (g, w, h) => {
      g.fillStyle = "#ffd9e8";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#fff6fa";
      for (const [x, y] of [
        [0.25, 0.25],
        [0.75, 0.75],
      ] as const) {
        g.beginPath();
        g.arc(x * w, y * h, w * 0.085, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = "#ff5fa2";
      heartPath(g, w * 0.75, h * 0.25, w * 0.07);
      g.fill();
      heartPath(g, w * 0.25, h * 0.75, w * 0.07);
      g.fill();
    },
  },
  // boys': bold speed stripes down the wall with a chequer band, the one thing
  // in the room that is going somewhere
  candy_wall_speed: {
    fallback: "#4aa0ea",
    tile: [1.2, 1.2],
    size: [256, 256],
    roughness: 0.6,
    draw: (g, w, h) => {
      g.fillStyle = "#4aa0ea";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#2f6fc0";
      g.fillRect(w * 0.1, 0, w * 0.16, h);
      g.fillRect(w * 0.62, 0, w * 0.1, h);
      g.fillStyle = "#fdf6f0";
      g.fillRect(w * 0.28, 0, w * 0.06, h);
      g.fillRect(w * 0.74, 0, w * 0.04, h);
      // a chequered flag ribbon, two squares tall so it wraps cleanly
      const c = w * 0.05;
      for (let i = 0; i < w / c; i++) {
        g.fillStyle = i % 2 ? "#fdf6f0" : "#241f28";
        g.fillRect(i * c, h * 0.42, c, c);
        g.fillStyle = i % 2 ? "#241f28" : "#fdf6f0";
        g.fillRect(i * c, h * 0.42 + c, c, c);
      }
    },
  },
  candy_wall_choc: {
    fallback: "#7a4a2c",
    tile: [0.6, 0.6],
    size: [128, 128],
    roughness: 0.34,
    draw: (g, w, h) => {
      g.fillStyle = "#4a2a18";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2; i++)
        for (let j = 0; j < 2; j++) {
          const x = i * (w / 2);
          const y = j * (h / 2);
          g.fillStyle = "#8a5433";
          g.fillRect(x + 4, y + 4, w / 2 - 8, h / 2 - 8);
          g.fillStyle = "#a06a44";
          g.fillRect(x + 4, y + 4, w / 2 - 8, 5);
          g.fillStyle = "#6b3d24";
          g.fillRect(x + 4, y + h / 2 - 9, w / 2 - 8, 5);
        }
    },
  },
  // girls': a pastel sky with puffs of pink and blue floss drifting across it,
  // one of each per tile so the colours never clump on one wall
  candy_wall_clouds: {
    fallback: "#dcecff",
    tile: [1.4, 1.4],
    size: [256, 256],
    roughness: 0.85,
    draw: (g, w, h) => {
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#e3f1ff");
      sky.addColorStop(0.5, "#fbe6f3");
      sky.addColorStop(1, "#e3f1ff");
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      for (const [x, y, s, c] of [
        [0.28, 0.3, 0.1, "#ffc2e0"],
        [0.76, 0.74, 0.09, "#bfe3ff"],
      ] as const) {
        g.fillStyle = c;
        wrapped(w, h, x * w, y * h, (px, py) => {
          g.beginPath();
          g.arc(px - s * w, py, s * w * 0.75, 0, Math.PI * 2);
          g.arc(px, py - s * w * 0.4, s * w, 0, Math.PI * 2);
          g.arc(px + s * w, py, s * w * 0.8, 0, Math.PI * 2);
          g.fill();
        });
      }
      g.fillStyle = "#ffffff";
      for (const [x, y] of [
        [0.72, 0.2],
        [0.2, 0.78],
        [0.5, 0.52],
      ] as const) {
        heartPath(g, x * w, y * h, w * 0.025);
        g.fill();
      }
    },
  },
  // boys': midnight-blue frosting piped with gold sugar stars and a lemon moon
  candy_wall_stars: {
    fallback: "#27336b",
    tile: [1.2, 1.2],
    size: [256, 256],
    roughness: 0.6,
    draw: (g, w, h) => {
      g.fillStyle = "#27336b";
      g.fillRect(0, 0, w, h);
      const r = rng(233);
      for (let i = 0; i < 60; i++) {
        g.fillStyle = r() < 0.5 ? "rgba(255,246,208,0.8)" : "rgba(191,227,255,0.7)";
        const x = r() * w;
        const y = r() * h;
        wrapped(w, h, x, y, (px, py) => g.fillRect(px, py, 2, 2));
      }
      for (const [x, y, s, c] of [
        [0.2, 0.22, 0.07, LEMON],
        [0.62, 0.4, 0.05, "#fff3d6"],
        [0.36, 0.72, 0.06, ORANGE],
        [0.84, 0.86, 0.045, LEMON],
      ] as const) {
        g.fillStyle = c;
        wrapped(w, h, x * w, y * h, (px, py) => {
          candyStarPath(g, px, py, s * w, x * 3);
          g.fill();
        });
      }
      // a crescent moon: a lemon disc with the sky bitten out of it
      g.fillStyle = "#fff1b0";
      g.beginPath();
      g.arc(w * 0.8, h * 0.18, w * 0.08, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#27336b";
      g.beginPath();
      g.arc(w * 0.835, h * 0.16, w * 0.07, 0, Math.PI * 2);
      g.fill();
    },
  },
  // neutral prize: a parade of gummy bears marching along the wall, a row of
  // five colours so the tile never repeats a bear next to its twin
  candy_wall_gummies: {
    fallback: "#fff4e4",
    tile: [1.3, 1.3],
    size: [256, 256],
    roughness: 0.5,
    draw: (g, w, h) => {
      g.fillStyle = "#fff4e4";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#ffe3ef";
      // the line each row marches along, just under their feet
      for (let i = 0; i < 2; i++) g.fillRect(0, i * (h / 2) + h * 0.3, w, h * 0.04);
      const cols = [RED, ORANGE, LEMON, LIME, BLUE, GRAPE];
      for (let row = 0; row < 2; row++)
        for (let i = 0; i < 3; i++) {
          const x = (i + (row ? 0.5 : 0)) * (w / 3) + w / 6;
          const y = row * (h / 2) + h * 0.22;
          const c = cols[(i + row * 3) % cols.length]!;
          wrapped(w, h, x, y, (px, py) => gummyBear(g, px, py, w * 0.075, c));
        }
    },
  },

  // neutral starter: mint humbugs laid like lino, 0.5m squares
  candy_floor_mints: {
    fallback: "#a6e6cf",
    tile: [1, 1],
    size: [128, 128],
    roughness: 0.4,
    draw: (g, w, h) => {
      g.fillStyle = "#f2fbf7";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#6fd2b0";
      g.fillRect(0, 0, w / 2, h / 2);
      g.fillRect(w / 2, h / 2, w / 2, h / 2);
      // a mint swirl in the middle of each square
      for (const [x, y, c] of [
        [0.25, 0.25, "#f2fbf7"],
        [0.75, 0.75, "#f2fbf7"],
        [0.75, 0.25, "#6fd2b0"],
        [0.25, 0.75, "#6fd2b0"],
      ] as const) {
        g.strokeStyle = c;
        g.lineWidth = 3;
        g.beginPath();
        for (let k = 0; k <= 40; k++) {
          const t = k / 40;
          const a = t * Math.PI * 3;
          const rr = t * w * 0.14;
          const px = x * w + Math.cos(a) * rr;
          const py = y * h + Math.sin(a) * rr;
          if (k === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.stroke();
      }
    },
  },
  // girls': small sugar tiles, white grout, a glitter of sugar grains
  candy_floor_sugar: {
    fallback: "#ffc7dd",
    tile: [0.8, 0.8],
    size: [256, 256],
    roughness: 0.5,
    draw: (g, w, h) => {
      g.fillStyle = "#fff4f8";
      g.fillRect(0, 0, w, h);
      const shades = ["#ffc7dd", "#ffb3d2", "#ffd5e6", "#f9a8cf"];
      let k = 0;
      for (let i = 0; i < 2; i++)
        for (let j = 0; j < 2; j++) {
          g.fillStyle = shades[k++ % 4]!;
          g.fillRect(i * (w / 2) + 5, j * (h / 2) + 5, w / 2 - 10, h / 2 - 10);
        }
      const r = rng(61);
      for (let i = 0; i < 400; i++) {
        g.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.8)" : "rgba(255,140,190,0.5)";
        g.fillRect(Math.floor(r() * w), Math.floor(r() * h), 2, 2);
      }
    },
  },
  // boys': a liquorice race track, centre line and all, so the whole floor is
  // somewhere to push a car
  candy_floor_track: {
    fallback: "#332c3a",
    tile: [2, 2],
    size: [256, 256],
    roughness: 0.55,
    draw: (g, w, h) => {
      g.fillStyle = "#332c3a";
      g.fillRect(0, 0, w, h);
      const r = rng(71);
      for (let i = 0; i < 600; i++) {
        g.fillStyle = r() < 0.5 ? "#3d3546" : "#292330";
        g.fillRect(Math.floor(r() * w), Math.floor(r() * h), 3, 3);
      }
      g.fillStyle = "#463d50";
      g.fillRect(0, h * 0.06, w, 6);
      g.fillRect(0, h * 0.94 - 6, w, 6);
      g.fillStyle = "#fdf6f0";
      for (let i = 0; i < 2; i++) g.fillRect(i * (w / 2) + w * 0.12, h * 0.5 - 5, w * 0.26, 10);
    },
  },
  candy_floor_choc: {
    fallback: "#6b3d24",
    tile: [1.6, 1.6],
    size: [256, 256],
    roughness: 0.38,
    draw: (g, w, h) => {
      const r = rng(83);
      const rows = 6;
      const rh = h / rows;
      const shades = ["#6b3d24", "#7c4a2c", "#5c3320"];
      for (let i = 0; i < rows; i++) {
        let x = -r() * w * 0.5;
        while (x < w) {
          const len = w * (0.4 + r() * 0.3);
          g.fillStyle = shades[Math.floor(r() * 3)]!;
          for (const dx of [0, w]) g.fillRect(x - dx, i * rh, len, rh);
          x += len;
        }
        g.fillStyle = "#3f2415";
        g.fillRect(0, i * rh, w, 3);
      }
    },
  },
  // neutral: the diamond grid off an ice cream cone. The lines run at exactly
  // 45 degrees on a square tile, so they meet themselves across every edge.
  candy_floor_waffle: {
    fallback: "#e0a85a",
    tile: [0.9, 0.9],
    size: [256, 256],
    roughness: 0.7,
    draw: (g, w, h) => {
      g.fillStyle = "#e6b066";
      g.fillRect(0, 0, w, h);
      const n = 4;
      const step = w / n;
      for (const [c, lw, off] of [
        ["#b77a3a", step * 0.2, 0],
        ["#f2c98a", step * 0.05, step * 0.13],
      ] as const) {
        g.strokeStyle = c;
        g.lineWidth = lw;
        for (let i = -n; i <= n * 2; i++) {
          g.beginPath();
          g.moveTo(i * step + off, 0);
          g.lineTo(i * step + off + h, h);
          g.moveTo(i * step + off, 0);
          g.lineTo(i * step + off - h, h);
          g.stroke();
        }
      }
    },
  },
  // girls': pink frosting spread thick, with sprinkles all over it
  candy_floor_sprinkles: {
    fallback: "#ffc7dd",
    tile: [0.9, 0.9],
    size: [256, 256],
    roughness: 0.6,
    draw: (g, w, h) => {
      g.fillStyle = "#ffc7dd";
      g.fillRect(0, 0, w, h);
      // the palette-knife swirls in the frosting, faint so the sprinkles lead
      const r = rng(241);
      g.strokeStyle = "rgba(255,255,255,0.35)";
      g.lineWidth = 6;
      for (let i = 0; i < 7; i++) {
        const x = r() * w;
        const y = r() * h;
        const rr = w * (0.06 + r() * 0.06);
        const a = r() * Math.PI * 2;
        wrapped(w, h, x, y, (px, py) => {
          g.beginPath();
          g.arc(px, py, rr, a, a + 3.6);
          g.stroke();
        });
      }
      sprinkles(g, w, h, 251, 110, 14);
    },
  },
  // neutral prize: glossy jelly squares in every flavour, each with a shine
  // across one corner, the way light sits on a real one
  candy_floor_jelly: {
    fallback: "#ff9aa8",
    tile: [1.2, 1.2],
    size: [256, 256],
    roughness: 0.18,
    draw: (g, w, h) => {
      g.fillStyle = "#fff1f7";
      g.fillRect(0, 0, w, h);
      const n = 3;
      const c = w / n;
      const cols = [RED, LEMON, BLUE, LIME, GRAPE, ORANGE, PINK, MINT, RED];
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const x = i * c + 4;
          const y = j * c + 4;
          g.fillStyle = cols[(i * 4 + j * 2) % cols.length]!;
          g.beginPath();
          g.roundRect(x, y, c - 8, c - 8, 12);
          g.fill();
          g.fillStyle = "rgba(255,255,255,0.45)";
          g.beginPath();
          g.roundRect(x + 8, y + 8, (c - 8) * 0.45, 9, 5);
          g.fill();
          g.beginPath();
          g.roundRect(x + 8, y + 8, 9, (c - 8) * 0.3, 5);
          g.fill();
        }
    },
  },
};

/**
 * The material for a candy wallpaper or floor id. The room's wall and floor
 * geometry carries UVs in metres, so a surface's tile size is its repeat.
 */
export function candySurfaceMaterial(id: CandyFurnitureId): THREE.Material {
  const key = SURFACES[id] ? id : BY_ID.get(id)?.spot === "floor" ? "candy_floor_mints" : "candy_wall_cane";
  const s = SURFACES[key]!;
  return canvasMaterial(`candy-surface|${key}`, s.fallback, s.size[0], s.size[1], s.draw, {
    roughness: s.roughness,
    repeat: [1 / s.tile[0], 1 / s.tile[1]],
  });
}

// ---------------------------------------------------------------------------
// beds: 2.1 x 1.3, headboard at local -x, quilt top at 0.70, same as park one

const QUILT_TOP = 0.7;

function pillow(g: THREE.Group, x: number, y: number, color = MARSH) {
  bev(g, color, [0.36, 0.14, 0.78], [x, y, 0], [0, 0, 0.12]);
}

const quiltSprinkle = () =>
  canvasMaterial("candy-quilt-sprinkle", MINT, 256, 256, (g, w, h) => {
    g.fillStyle = "#8fe3c8";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#5fcfae";
    for (let i = 0; i < 6; i += 2) g.fillRect((i * w) / 6, 0, w / 6, h);
    g.fillStyle = "#fdf6f0";
    for (let i = 1; i < 6; i += 2) g.fillRect((i * w) / 6 + w / 24, 0, w / 24, h);
    sprinkles(g, w, h, 13, 70, 18);
  }, { roughness: 0.85 });

const quiltHearts = () =>
  canvasMaterial("candy-quilt-hearts", PINK, 256, 256, (g, w, h) => {
    g.fillStyle = "#ffc2dc";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#fff1f7";
    for (let j = 0; j < 3; j++)
      for (let i = 0; i < 3; i++) {
        const x = (i + (j % 2 ? 0.8 : 0.3)) * (w / 3);
        const y = (j + 0.5) * (h / 3);
        wrapped(w, h, x, y, (px, py) => {
          heartPath(g, px, py, w * 0.1);
          g.fill();
        });
      }
    g.strokeStyle = "rgba(255,255,255,0.55)";
    g.lineWidth = 3;
    for (let i = 0; i <= 3; i++) {
      g.beginPath();
      g.moveTo((i * w) / 3, 0);
      g.lineTo((i * w) / 3, h);
      g.moveTo(0, (i * h) / 3);
      g.lineTo(w, (i * h) / 3);
      g.stroke();
    }
  }, { roughness: 0.85 });

const quiltRace = () =>
  canvasMaterial("candy-quilt-race", "#2f6fc0", 256, 256, (g, w, h) => {
    g.fillStyle = "#2f6fc0";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#e8404a";
    g.fillRect(0, h * 0.34, w, h * 0.12);
    g.fillStyle = "#fdf6f0";
    g.fillRect(0, h * 0.48, w, h * 0.05);
    const c = w / 16;
    for (let i = 0; i < 16; i++) {
      g.fillStyle = i % 2 ? "#fdf6f0" : "#241f28";
      g.fillRect(i * c, h * 0.72, c, c);
      g.fillStyle = i % 2 ? "#241f28" : "#fdf6f0";
      g.fillRect(i * c, h * 0.72 + c, c, c);
    }
  }, { roughness: 0.85 });

/** Neutral starter: two bunks of stacked marshmallows, wafer boards, a liquorice ladder. */
function bedMarshmallow() {
  const g = new THREE.Group();
  const post = col(MARSH, 0.85);
  const seam = col("#ffd3e2", 0.85);
  for (const x of [-0.94, 0.94])
    for (const z of [-0.54, 0.54]) {
      addMesh(g, G.cyl(), post, [0.1, 2.24, 0.1], [x, 1.12, z]);
      // the pinch marks between one marshmallow and the next: five bands is
      // enough for the stack to read without forty little cylinders
      for (const y of [0.4, 0.82, 1.24, 1.66, 2.08])
        addMesh(g, G.cyl(), seam, [0.107, 0.04, 0.107], [x, y, z], undefined, false);
      addMesh(g, G.sphere(), wet(CANDY[x + z > 0 ? 1 : 4]!), [0.095, 0.095, 0.095], [x, 2.26, z], undefined, false);
    }
  const board = col(WAFER, 0.8);
  const sheet = col(CREAM, 0.85);
  const quilt = quiltSprinkle();
  // lower bunk
  bev(g, board, [1.96, 0.18, 1.1], [0, 0.35, 0]);
  bev(g, sheet, [1.82, 0.18, 1.04], [0, 0.53, 0]);
  bev(g, quilt, [1.3, 0.09, 1.08], [0.24, QUILT_TOP - 0.045, 0]);
  pillow(g, -0.62, 0.68, "#ffd3e2");
  // upper bunk
  bev(g, board, [1.96, 0.18, 1.1], [0, 1.45, 0]);
  bev(g, sheet, [1.82, 0.14, 1.04], [0, 1.62, 0]);
  bev(g, quilt, [1.3, 0.08, 1.08], [0.24, 1.73, 0]);
  pillow(g, -0.62, 1.76, "#ffe9a8");
  // guard rails, the front one short so she can climb in
  const railCane = caneMat("#fdf6f0", "#ff5fa2", 20);
  addMesh(g, G.cyl(), railCane, [0.04, 1.82, 0.04], [0, 2.0, -0.54], [0, 0, Math.PI / 2]);
  addMesh(g, G.cyl(), railCane, [0.04, 1.3, 0.04], [-0.26, 2.0, 0.54], [0, 0, Math.PI / 2]);
  // ladder: liquorice rails, wafer rungs
  for (const x of [0.5, 0.86]) box(g, LIQ, [0.06, 1.9, 0.06], [x, 0.95, 0.61], undefined, true);
  for (const y of [0.35, 0.75, 1.15, 1.55]) box(g, WAFER, [0.36, 0.06, 0.07], [0.68, y, 0.61], undefined, true);
  return g;
}

/** Girls': candy cane four-poster, gumdrop finials, an icing valance and a heart headboard. */
function bedGumdrop() {
  const g = new THREE.Group();
  const cane = caneMat("#fdf6f0", "#ff5fa2", 9);
  for (const x of [-0.94, 0.94])
    for (const z of [-0.54, 0.54]) addMesh(g, G.cyl(), cane, [0.075, 1.9, 0.075], [x, 0.95, z]);
  const rail = col(ICING, 0.7);
  for (const z of [-0.54, 0.54]) bev(g, rail, [1.96, 0.07, 0.07], [0, 1.92, z]);
  for (const x of [-0.94, 0.94]) bev(g, rail, [0.07, 0.07, 1.15], [x, 1.92, 0]);
  // the valance: a row of icing scallops hanging off the canopy, which is what
  // makes a four-poster read as a four-poster from the far side of the room
  const scallop = col("#fff1f7", 0.7);
  for (let i = 0; i < 9; i++) {
    const x = -0.84 + i * 0.21;
    for (const z of [-0.54, 0.54]) addMesh(g, G.sphereLo(), scallop, [0.11, 0.09, 0.05], [x, 1.86, z], undefined, false);
  }
  for (let i = 0; i < 5; i++) {
    const z = -0.48 + i * 0.24;
    for (const x of [-0.94, 0.94]) addMesh(g, G.sphereLo(), scallop, [0.05, 0.09, 0.12], [x, 1.86, z], undefined, false);
  }
  // gumdrops on the posts, sugared by being matt against the wet rest
  CANDY.slice(0, 4).forEach((c, i) => {
    const x = i < 2 ? -0.94 : 0.94;
    const z = i % 2 ? -0.54 : 0.54;
    addMesh(g, G.sphere(), col(c, 0.55), [0.1, 0.11, 0.1], [x, 1.98, z], undefined, false);
  });
  // chocolate base, marshmallow mattress, hearts quilt
  bev(g, CHOC, [1.86, 0.3, 1.16], [0, 0.15, 0]);
  bev(g, col(MARSH, 0.85), [1.76, 0.22, 1.1], [0, 0.41, 0]);
  bev(g, quiltHearts(), [1.32, 0.12, 1.14], [0.2, QUILT_TOP - 0.06, 0]);
  bev(g, "#ff5fa2", [0.22, 0.13, 1.15], [0.76, QUILT_TOP - 0.055, 0], undefined, false);
  pillow(g, -0.6, 0.6, "#ffd3e2");
  addMesh(g, G.heart(), col("#ff5fa2", 0.5), [0.12, 0.12, 1], [-0.58, 0.67, 0.3], [-Math.PI / 2, 0, 0.3], false);
  // heart headboard, a flat panel facing down the bed
  addMesh(g, G.heart(), col("#ff5fa2", 0.5), [0.46, 0.46, 1], [-0.92, 1.06, 0], [0, Math.PI / 2, 0], false);
  addMesh(g, G.heart(), col("#fff1f7", 0.6), [0.38, 0.38, 1], [-0.9, 1.06, 0], [0, Math.PI / 2, 0], false);
  return g;
}

/** Boys': a chocolate bar on liquorice tyres, nose into the room, spoiler at the head. */
function bedRacer() {
  const g = new THREE.Group();
  const choc = col(CHOC, 0.32);
  const milk = col(MILK, 0.32);
  bev(g, choc, [1.92, 0.24, 1.0], [0, 0.3, 0]);
  // the chocolate bar's segments, only on the side that faces the room
  for (let i = 0; i < 5; i++) box(g, "#6b3d24", [0.02, 0.2, 0.02], [-0.72 + i * 0.36, 0.3, 0.505]);
  bev(g, milk, [1.86, 0.1, 1.04], [0, 0.44, 0]);
  // wheels: torus geometry already turns about z, so no rotation is needed
  for (const x of [-0.6, 0.62])
    for (const z of [-0.54, 0.54]) {
      addMesh(g, G.torus(), col(LIQ, 0.5), [0.18, 0.18, 0.18], [x, 0.225, z]);
      addMesh(g, G.cylLo(), col("#c9a23c", 0.25), [0.09, 0.03, 0.09], [x, 0.225, z + Math.sign(z) * 0.055], [Math.PI / 2, 0, 0], false);
    }
  // cockpit: wafer seat, racing quilt, headrest pillow at the head end
  bev(g, col(WAFER, 0.7), [1.14, 0.14, 0.88], [-0.18, 0.56, 0]);
  bev(g, quiltRace(), [1.08, 0.1, 0.92], [-0.14, QUILT_TOP - 0.05, 0]);
  pillow(g, -0.68, 0.7, "#e8404a");
  // nose cone into the room, a boiled sweet windscreen, a spoiler at the head
  addMesh(g, G.cone(), wet(RED), [0.17, 0.4, 0.46], [0.82, 0.4, 0], [0, 0, -Math.PI / 2]);
  addMesh(g, G.cone(), col(LEMON, 0.4), [0.07, 0.1, 0.14], [1.0, 0.4, 0], [0, 0, -Math.PI / 2], false);
  bev(g, clear("#7fd6f0", 0.5), [0.1, 0.26, 0.84], [0.42, 0.63, 0], [0, 0, -0.35], false);
  for (const z of [-0.42, 0.42]) box(g, LIQ, [0.07, 0.3, 0.07], [-0.92, 0.72, z], undefined, true);
  bev(g, col(RED, 0.35), [0.26, 0.06, 1.0], [-0.92, 0.88, 0], [0, 0, 0.12]);
  // the number roundel, on the side she walks past
  const num = canvasMaterial("candy-racer-3", "#fdf6f0", 128, 128, (c, w, h) => {
    c.fillStyle = "#fdf6f0";
    c.beginPath();
    c.arc(w / 2, h / 2, w * 0.46, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#e8404a";
    c.font = "bold 92px system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("3", w / 2, h / 2 + 6);
  });
  addMesh(g, G.plane(), num, [0.3, 0.3, 1], [-0.1, 0.32, 0.515], undefined, false);
  // flame stripe along the flank
  box(g, ORANGE, [0.7, 0.05, 0.02], [0.3, 0.2, 0.505]);
  return g;
}

const quiltFrosting = () =>
  canvasMaterial("candy-quilt-frosting", ICING, 256, 256, (g, w, h) => {
    g.fillStyle = "#ffd9e8";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#fff1f7";
    g.beginPath();
    g.arc(w / 2, h / 2, w * 0.36, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#ffc2dc";
    g.beginPath();
    g.arc(w / 2, h / 2, w * 0.2, 0, Math.PI * 2);
    g.fill();
    sprinkles(g, w, h, 263, 80, 16);
  }, { roughness: 0.8 });

const quiltGingham = () =>
  canvasMaterial("candy-quilt-gingham", RED, 256, 256, (g, w, h) => {
    g.fillStyle = "#fdf6f0";
    g.fillRect(0, 0, w, h);
    const c = w / 8;
    g.fillStyle = "rgba(232,64,74,0.55)";
    for (let i = 0; i < 8; i += 2) {
      g.fillRect(i * c, 0, c, h);
      g.fillRect(0, i * c, w, c);
    }
  }, { roughness: 0.9 });

const quiltPastel = () =>
  canvasMaterial("candy-quilt-pastel", "#dcecff", 256, 256, (g, w, h) => {
    const bands = ["#ffc2e0", "#ffe3b0", "#fff4b8", "#c8f2d8", "#bfe3ff", "#e0ccff"];
    bands.forEach((c, i) => {
      g.fillStyle = c;
      g.fillRect(0, (i * h) / bands.length, w, h / bands.length + 1);
    });
    g.fillStyle = "rgba(255,255,255,0.7)";
    for (let i = 0; i < 6; i++) {
      candyStarPath(g, ((i % 3) + 0.5 + (i > 2 ? 0.5 : 0)) * (w / 3), (i > 2 ? 0.75 : 0.25) * h, w * 0.04, i);
      g.fill();
    }
  }, { roughness: 0.9 });

/**
 * Girls': the whole bed is a cupcake. The case is the frame, the frosting is
 * the mattress, and the headboard is a wall of piped icing with a cherry on.
 */
function bedCupcake() {
  const g = new THREE.Group();
  // an oval cake so it fills a bed's footprint instead of a round one's
  addMesh(g, G.frustum(1, 0.86), caseMat("#ff8fc0", "#e0679f"), [1.0, 0.42, 0.6], [0, 0.21, 0]);
  addMesh(g, G.cyl(), col("#8a5433", 0.6), [0.98, 0.06, 0.58], [0, 0.44, 0], undefined, false);
  // the frosting overhang, then the mattress of frosting on top of it
  addMesh(g, G.cylHi(), col(ICING, 0.72), [1.03, 0.1, 0.63], [0, 0.5, 0]);
  addMesh(g, G.cylHi(), [col("#fff1f7", 0.72), quiltFrosting(), col("#fff1f7", 0.72)], [0.96, 0.14, 0.58], [0, 0.61, 0]);
  // piped scallops round the rim, where the frosting meets the case
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    addMesh(g, G.sphereLo(), col("#fff1f7", 0.72), [0.09, 0.07, 0.09], [Math.cos(a) * 0.95, 0.55, Math.sin(a) * 0.55], undefined, false);
  }
  pillow(g, -0.58, 0.74, "#fff1f7");
  // headboard: a slab of icing with a row of piped blobs and the cherry on top
  bev(g, col(ICING, 0.72), [0.14, 0.72, 1.14], [-0.96, 0.78, 0]);
  for (let i = 0; i < 5; i++) addMesh(g, G.sphereLo(), col("#fff1f7", 0.72), [0.08, 0.1, 0.13], [-0.96, 1.15, -0.46 + i * 0.23], undefined, false);
  addMesh(g, G.sphere(), wet(RED), [0.14, 0.14, 0.14], [-0.9, 1.36, 0]);
  addMesh(g, G.sphereLo(), col("#ffffff", 0.3), [0.03, 0.04, 0.03], [-0.84, 1.42, 0.08], undefined, false);
  addMesh(g, G.cylLo(), col("#6fbf4a", 0.7), [0.012, 0.16, 0.012], [-0.9, 1.54, 0.02], [0.3, 0, 0], false);
  return g;
}

/** Boys': a gingerbread steam engine. Her head goes in the cab; the funnel is at her feet. */
function bedTrain() {
  const g = new THREE.Group();
  const ginger = col("#b8743a", 0.7);
  const icing = col("#fdf6f0", 0.5);
  bev(g, ginger, [2.0, 0.22, 1.1], [0, 0.27, 0]);
  // icing piped along the chassis, only on the sides she can see
  for (const z of [-0.555, 0.555]) box(g, icing, [1.96, 0.03, 0.012], [0, 0.36, z]);
  // cookie wheels with an icing rim and a gumdrop hub
  for (const x of [-0.66, -0.06, 0.54])
    for (const z of [-0.575, 0.575]) {
      addMesh(g, G.cyl(), col("#c98f47", 0.75), [0.2, 0.05, 0.2], [x, 0.2, z], [Math.PI / 2, 0, 0]);
      addMesh(g, G.ring(), icing, [0.15, 0.15, 0.15], [x, 0.2, z + Math.sign(z) * 0.026], undefined, false);
      addMesh(g, G.sphereLo(), wet(CANDY[(x > 0 ? 0 : 3) + (z > 0 ? 1 : 0)]!), [0.04, 0.04, 0.03], [x, 0.2, z + Math.sign(z) * 0.03], undefined, false);
    }
  // the bed: a wafer mattress in the tender, a gingham quilt, a pillow by the cab
  bev(g, col(CREAM, 0.85), [1.32, 0.24, 1.0], [0.1, 0.5, 0]);
  bev(g, quiltGingham(), [1.0, 0.1, 1.04], [0.24, QUILT_TOP - 0.05, 0]);
  pillow(g, -0.36, 0.68, "#fdf6f0");
  // the cab at the head end, with a window each side and a chocolate roof
  bev(g, ginger, [0.44, 1.2, 1.1], [-0.8, 0.98, 0]);
  bev(g, col(CHOC, 0.35), [0.5, 0.08, 1.24], [-0.8, 1.62, 0]);
  for (const z of [-0.555, 0.555]) {
    box(g, icing, [0.28, 0.3, 0.012], [-0.8, 1.2, z]);
    box(g, clear("#7fd6f0", 0.8), [0.22, 0.24, 0.014], [-0.8, 1.2, z]);
    for (let i = 0; i < 3; i++) addMesh(g, G.sphereLo(), wet(CANDY[i + 1]!), [0.04, 0.04, 0.02], [-0.92 + i * 0.12, 0.7, z], undefined, false);
  }
  // the funnel at the foot, and a puff of marshmallow steam coming out of it
  addMesh(g, G.cyl(), col(LIQ, 0.45), [0.09, 0.5, 0.09], [0.88, 0.63, 0]);
  addMesh(g, G.frustum(1, 0.6), col(RED, 0.35), [0.14, 0.12, 0.14], [0.88, 0.94, 0]);
  addMesh(g, G.sphereLo(), col(MARSH, 0.9), [0.14, 0.12, 0.14], [0.86, 1.12, 0]);
  addMesh(g, G.sphereLo(), col(MARSH, 0.9), [0.1, 0.09, 0.1], [0.8, 1.3, 0.06]);
  addMesh(g, G.sphereLo(), col(MARSH, 0.9), [0.07, 0.06, 0.07], [0.74, 1.44, 0.1]);
  // a lamp on the front of the engine, glowing the way the gumball lamp does
  addMesh(g, G.cyl(), glowMaterial("#fff3d6", 0.9, 0.3), [0.06, 0.03, 0.06], [1.0, 0.27, 0], [0, 0, Math.PI / 2], false);
  return g;
}

/** Neutral prize: a cotton candy cloud to sleep on, a rainbow over the pillow. */
function bedCloud() {
  const g = new THREE.Group();
  const pink = col("#ffc2e0", 0.95);
  const blue = col("#bfe3ff", 0.95);
  // the cloud floats on four stubby candy cane legs
  const cane = caneMat("#fdf6f0", "#ff5fa2", 2);
  for (const x of [-0.78, 0.78]) for (const z of [-0.36, 0.36]) addMesh(g, G.cyl(), cane, [0.05, 0.14, 0.05], [x, 0.07, z]);
  // the body: two rows of fat floss puffs, pink and blue in turn
  for (let i = 0; i < 4; i++)
    for (const z of [-0.28, 0.28]) {
      const x = -0.72 + i * 0.48;
      addMesh(g, G.sphere(), (i + (z > 0 ? 1 : 0)) % 2 ? pink : blue, [0.32, 0.25, 0.33], [x, 0.36, z]);
    }
  addMesh(g, G.cylHi(), col(MARSH, 0.9), [0.94, 0.12, 0.55], [0, 0.56, 0]);
  bev(g, quiltPastel(), [1.26, 0.1, 1.06], [0.2, QUILT_TOP - 0.05, 0]);
  pillow(g, -0.6, 0.72, "#fff1f7");
  // a cloud for a headboard, and a boiled-sweet rainbow arching over it
  for (const [y, z, s, m] of [
    [0.86, -0.34, 0.26, pink],
    [0.92, 0.32, 0.28, blue],
    [1.14, 0, 0.3, pink],
  ] as const)
    addMesh(g, G.sphere(), m, [0.18, s, s], [-0.86, y, z]);
  [RED, LEMON, LIME, BLUE].forEach((c, i) =>
    addMesh(g, G.arch(), wet(c), [0.56 - i * 0.08, 0.56 - i * 0.08, 0.7], [-0.9, 1.0, 0], [0, Math.PI / 2, 0], false),
  );
  // sugar sparkles hanging in the air round it, lit so they twinkle
  for (const [x, y, z] of [
    [-0.3, 1.2, 0.5],
    [0.4, 1.05, -0.45],
    [0.85, 0.95, 0.4],
  ] as const)
    addMesh(g, G.star(), glowMaterial("#fff3d6", 0.9, 0.3), [0.05, 0.05, 0.05], [x, y, z], undefined, false);
  return g;
}

// ---------------------------------------------------------------------------
// rugs: flat, centred, top at 0.02

function roundRug(key: string, draw: Draw, rx: number, rz: number, edge: string) {
  const g = new THREE.Group();
  const top = canvasMaterial(`candy-rug|${key}`, edge, 512, 512, draw, { roughness: 0.8 });
  addMesh(g, G.cylHi(), [col(edge, 0.8), top, col(edge, 0.8)], [rx, 0.02, rz], [0, 0.01, 0], undefined, false);
  return g;
}

function flatRug(key: string, draw: Draw, w: number, d: number, edge: string, size: [number, number] = [512, 340]) {
  const g = new THREE.Group();
  const top = canvasMaterial(`candy-rug|${key}`, edge, size[0], size[1], draw, { roughness: 0.8 });
  const side = col(edge, 0.8);
  addMesh(g, G.box(), [side, side, top, side, side, side], [w, 0.02, d], [0, 0.01, 0], undefined, false);
  return g;
}

/** Neutral starter: a giant peppermint, the pinwheel kind. */
function rugPeppermint() {
  return roundRug(
    "peppermint",
    (g, w, h) => {
      g.fillStyle = "#fdf6f0";
      g.fillRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      g.fillStyle = "#e8404a";
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.beginPath();
        g.moveTo(cx, cy);
        g.arc(cx, cy, w * 0.46, a, a + 0.34);
        g.closePath();
        g.fill();
      }
      g.strokeStyle = "#e8404a";
      g.lineWidth = w * 0.05;
      g.beginPath();
      g.arc(cx, cy, w * 0.44, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = "#fdf6f0";
      g.beginPath();
      g.arc(cx, cy, w * 0.1, 0, Math.PI * 2);
      g.fill();
    },
    1.15,
    1.15,
    "#e8404a",
  );
}

/** Girls': the swirl off a lollipop, blown up to rug size. */
function rugSwirl() {
  return roundRug("swirl", swirlDraw([...SWIRL_RAINBOW, "#ffffff"], 2.6, "#fff1f7"), 1.2, 1.2, "#ff5fa2");
}

/** Boys': liquorice with two tyre tracks and a dusting of icing sugar. */
function rugTracks() {
  return flatRug(
    "tracks",
    (g, w, h) => {
      g.fillStyle = "#332c3a";
      g.fillRect(0, 0, w, h);
      const r = rng(97);
      for (let i = 0; i < 500; i++) {
        g.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)";
        g.fillRect(r() * w, r() * h, 3, 3);
      }
      for (const y of [h * 0.3, h * 0.68]) {
        g.fillStyle = "#453c50";
        g.fillRect(0, y - h * 0.09, w, h * 0.18);
        g.fillStyle = "#241f28";
        for (let i = 0; i < 22; i++) g.fillRect(i * (w / 22) + 4, y - h * 0.09, w / 44, h * 0.18);
      }
      g.strokeStyle = "#e8404a";
      g.lineWidth = 10;
      g.strokeRect(6, 6, w - 12, h - 12);
    },
    2.4,
    1.6,
    "#241f28",
  );
}

/** Neutral: jelly beans tipped out on the floor. */
function rugJellybean() {
  return flatRug(
    "jellybean",
    (g, w, h) => {
      g.fillStyle = "#fff8ec";
      g.fillRect(0, 0, w, h);
      const r = rng(109);
      for (let i = 0; i < 90; i++) {
        const x = r() * w;
        const y = r() * h;
        const rot = r() * Math.PI;
        g.fillStyle = CANDY[Math.floor(r() * CANDY.length)]!;
        ellipse(g, x, y, 22, 14, rot);
        g.fill();
        g.fillStyle = "rgba(255,255,255,0.55)";
        ellipse(g, x - Math.cos(rot) * 6, y - Math.sin(rot) * 6 - 3, 7, 4, rot);
        g.fill();
      }
      g.strokeStyle = "#ffb3d2";
      g.lineWidth = 12;
      g.strokeRect(8, 8, w - 16, h - 16);
    },
    2.2,
    1.5,
    "#ffb3d2",
  );
}

/** Neutral: rings of sugared gumdrops on cream, like the top of a party cake. */
function rugGumdrop() {
  return roundRug(
    "gumdrop",
    (g, w, h) => {
      g.fillStyle = "#fff8ec";
      g.fillRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      let k = 0;
      for (const [ring, n, s] of [
        [0.4, 22, 0.034],
        [0.28, 15, 0.034],
        [0.16, 8, 0.034],
        [0, 1, 0.05],
      ] as const) {
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + ring * 4;
          const x = cx + Math.cos(a) * ring * w;
          const y = cy + Math.sin(a) * ring * w;
          g.fillStyle = CANDY[k++ % CANDY.length]!;
          // a gumdrop from above: a round sweet with a sugary rim
          g.beginPath();
          g.arc(x, y, s * w, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = "rgba(255,255,255,0.5)";
          g.beginPath();
          g.arc(x - s * w * 0.3, y - s * w * 0.3, s * w * 0.35, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.strokeStyle = "#93d84a";
      g.lineWidth = w * 0.03;
      g.beginPath();
      g.arc(cx, cy, w * 0.475, 0, Math.PI * 2);
      g.stroke();
    },
    1.1,
    1.1,
    "#93d84a",
  );
}

/** Boys': a draughts board in cherry and liquorice, a few sweets left mid-game. */
function rugCheckers() {
  return flatRug(
    "checkers",
    (g, w, h) => {
      const n = 8;
      const c = w / n;
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          g.fillStyle = (i + j) % 2 ? "#2b2530" : "#e8404a";
          g.fillRect(i * c, j * c, c, c);
        }
      // the pieces are round sweets sitting on the dark squares only
      for (const [i, j, colr] of [
        [1, 0, "#fdf6f0"],
        [3, 0, "#fdf6f0"],
        [0, 1, "#fdf6f0"],
        [4, 3, "#fdf6f0"],
        [6, 7, LEMON],
        [2, 5, LEMON],
        [7, 6, LEMON],
        [5, 4, LEMON],
      ] as const) {
        const x = (i + 0.5) * c;
        const y = (j + 0.5) * c;
        g.fillStyle = colr;
        g.beginPath();
        g.arc(x, y, c * 0.36, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "rgba(0,0,0,0.25)";
        g.lineWidth = 3;
        g.beginPath();
        g.arc(x, y, c * 0.24, 0, Math.PI * 2);
        g.stroke();
      }
      g.strokeStyle = "#fdf6f0";
      g.lineWidth = 10;
      g.strokeRect(5, 5, w - 10, h - 10);
    },
    1.9,
    1.9,
    "#2b2530",
    [512, 512],
  );
}

/**
 * Girls' prize: one enormous heart cookie with pink icing, a white piped edge
 * and sprinkles. It is a real heart outline rather than a heart painted on a
 * mat, because that is what makes it a prize.
 */
function rugHeart() {
  const g = new THREE.Group();
  // the heart lies flat with its point towards the room and the slab's depth
  // up; the outline's middle is a little below its origin, hence the nudge back
  const flatHeart = (m: THREE.Material, s: number, y0: number, t: number) =>
    addMesh(g, G.heartSlab(), m, [s, s, t], [0, y0, -0.13 * s], [-Math.PI / 2, 0, 0], false);
  flatHeart(col("#d9a95e", 0.8), 1.12, 0, 0.012);
  flatHeart(col("#ff8fc0", 0.6), 1.0, 0.012, 0.006);
  flatHeart(col("#fff1f7", 0.6), 0.84, 0.018, 0.002);
  flatHeart(col(ICING, 0.6), 0.78, 0.02, 0.001);
  const r = rng(271);
  for (let i = 0; i < 26; i++) {
    const x = (r() - 0.5) * 1.1;
    const z = (r() - 0.5) * 0.9 - 0.05;
    // keep them on the icing: inside a circle that sits within the heart
    if (Math.hypot(x, z + 0.1) > 0.45) continue;
    box(g, CANDY[i % CANDY.length]!, [0.06, 0.006, 0.02], [x, 0.024, z], [0, r() * Math.PI, 0]);
  }
  return g;
}

// ---------------------------------------------------------------------------
// curtains: origin at the window centre on the wall (the window is 1.6 x 1.2)

function curtains(fabric: THREE.Material, tie: string, rod: THREE.Material, finial: THREE.Material) {
  const g = new THREE.Group();
  addMesh(g, G.cyl(), rod, [0.035, 2.3, 0.035], [0, 0.8, 0.16], [0, 0, Math.PI / 2], false);
  for (const s of [-1, 1]) {
    addMesh(g, G.sphere(), finial, [0.07, 0.07, 0.07], [s * 1.18, 0.8, 0.16], undefined, false);
    box(g, tie, [0.04, 0.1, 0.16], [s * 1.0, 0.8, 0.08]);
    // four folds a side, alternating in depth so the light catches them
    for (let i = 0; i < 4; i++) {
      const x = s * (1.07 - i * 0.14);
      const z = i % 2 ? 0.1 : 0.075;
      bev(g, fabric, [0.16, 1.56, 0.06], [x, -0.03, z], undefined, false);
    }
    box(g, tie, [0.62, 0.07, 0.15], [s * 0.86, -0.28, 0.09]);
  }
  return g;
}

const CURTAIN_W = 96;
const CURTAIN_H = 936;

/** Neutral starter: the red and white awning off a sweet shop window. */
function curtainsAwning() {
  const fabric = canvasMaterial("candy-curtain-awning", "#e8404a", CURTAIN_W, CURTAIN_H, (g, w, h) => {
    g.fillStyle = "#fdf6f0";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#e8404a";
    g.fillRect(0, 0, w * 0.5, h);
    // the scalloped hem, which is the bit that says awning rather than curtain
    g.fillStyle = "#fdf6f0";
    g.beginPath();
    g.arc(w * 0.5, h - w * 0.1, w * 0.45, 0, Math.PI * 2);
    g.fill();
  });
  return curtains(fabric, "#e8404a", caneMat("#fdf6f0", "#e8404a", 26), col(LEMON, 0.45));
}

/** Girls': piped icing lace over a pink pane, with heart tie-backs. */
function curtainsLace() {
  const fabric = canvasMaterial("candy-curtain-lace", "#fff1f7", CURTAIN_W, CURTAIN_H, (g, w, h) => {
    g.fillStyle = "#fff1f7";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#ffc2dc";
    for (let y = 0; y < h; y += w * 0.7) {
      // rows of piped scallops and a dot between each pair
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.arc(w * (0.18 + i * 0.32), y, w * 0.13, 0, Math.PI);
        g.fill();
      }
      g.beginPath();
      g.arc(w * 0.5, y + w * 0.34, w * 0.05, 0, Math.PI * 2);
      g.fill();
    }
  });
  const g = curtains(fabric, "#ff5fa2", caneMat("#fff1f7", "#ffc2dc", 26), col("#ff5fa2", 0.5));
  for (const s of [-1, 1])
    addMesh(g, G.heart(), col("#ff5fa2", 0.5), [0.1, 0.1, 1], [s * 0.86, -0.28, 0.2], undefined, false);
  return g;
}

/** Boys': chequered flag panels with a row of pennants across the rod. */
function curtainsFlags() {
  const fabric = canvasMaterial("candy-curtain-flags", "#fdf6f0", CURTAIN_W, CURTAIN_H, (g, w, h) => {
    const c = w / 3;
    for (let j = 0; j * c < h; j++)
      for (let i = 0; i < 3; i++) {
        g.fillStyle = (i + j) % 2 ? "#241f28" : "#fdf6f0";
        g.fillRect(i * c, j * c, c, c);
      }
  });
  const g = curtains(fabric, "#241f28", caneMat("#241f28", "#fdf6f0", 26), col(RED, 0.4));
  // bunting: the pennants hang just in front of the rod, alternating colours
  for (let i = 0; i < 9; i++) {
    const x = -0.96 + i * 0.24;
    addMesh(g, G.pennant(), col(i % 2 ? RED : LEMON, 0.5), [0.2, 0.24, 1], [x, 0.66, 0.2], undefined, false);
  }
  return g;
}

/** Girls': sour rainbow belts hung side by side, with a sugar dusting and heart finials. */
function curtainsRainbow() {
  const fabric = canvasMaterial("candy-curtain-rainbow", "#ffc2e0", CURTAIN_W, CURTAIN_H, (g, w, h) => {
    const bands = [RED, ORANGE, LEMON, LIME, BLUE, GRAPE];
    const bh = w * 0.9;
    for (let i = 0; i * bh < h; i++) {
      g.fillStyle = bands[i % bands.length]!;
      g.fillRect(0, i * bh, w, bh + 1);
    }
    const r = rng(281);
    g.fillStyle = "rgba(255,255,255,0.55)";
    for (let i = 0; i < 260; i++) g.fillRect(r() * w, r() * h, 2, 2);
  });
  const g = curtains(fabric, "#ff5fa2", caneMat("#fdf6f0", "#ff5fa2", 26), col("#ff5fa2", 0.5));
  for (const s of [-1, 1]) addMesh(g, G.heart(), col("#ff5fa2", 0.5), [0.09, 0.09, 1], [s * 1.18, 0.8, 0.235], undefined, false);
  return g;
}

/** Boys': night-sky curtains printed with rocket lollies, and glowing stars hung off the rod. */
function curtainsSpace() {
  const fabric = canvasMaterial("candy-curtain-space", "#27336b", CURTAIN_W, CURTAIN_H, (g, w, h) => {
    g.fillStyle = "#27336b";
    g.fillRect(0, 0, w, h);
    const r = rng(293);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = r() < 0.5 ? "#fff6d0" : "#bfe3ff";
      g.fillRect(r() * w, r() * h, 2, 2);
    }
    // a rocket lolly every so often, nose up, alternating with a star
    for (let y = w * 0.9, i = 0; y < h; y += w * 1.5, i++) {
      if (i % 2) {
        g.fillStyle = LEMON;
        candyStarPath(g, w * 0.5, y, w * 0.24, 0.2);
        g.fill();
        continue;
      }
      const x = w * 0.5;
      g.fillStyle = "#e8c48a";
      g.fillRect(x - 3, y + w * 0.28, 6, w * 0.16);
      g.fillStyle = BLUE;
      g.fillRect(x - w * 0.14, y, w * 0.28, w * 0.3);
      g.fillStyle = "#fdf6f0";
      g.fillRect(x - w * 0.14, y - w * 0.12, w * 0.28, w * 0.12);
      g.fillStyle = RED;
      g.beginPath();
      g.moveTo(x - w * 0.14, y - w * 0.12);
      g.lineTo(x + w * 0.14, y - w * 0.12);
      g.lineTo(x, y - w * 0.36);
      g.fill();
    }
  });
  const g = curtains(fabric, LEMON, caneMat(LIQ, "#fdf6f0", 26), glowMaterial(LEMON, 0.5));
  // three sugar stars dangling in front of the glass on liquorice laces
  for (const [x, drop] of [
    [-0.45, 0.32],
    [0.1, 0.5],
    [0.55, 0.26],
  ] as const) {
    box(g, LIQ, [0.012, drop, 0.012], [x, 0.8 - drop / 2, 0.2]);
    addMesh(g, G.star(), glowMaterial("#ffd54a", 0.7, 0.3), [0.08, 0.08, 0.08], [x, 0.8 - drop - 0.07, 0.2], undefined, false);
  }
  return g;
}

/**
 * Neutral prize: a bead curtain of gumdrops on strings, tied back at the sides
 * like fabric, with a short fringe of them along the top of the window. Each
 * string is one mesh (G.beads) and one colour.
 */
function curtainsBeads() {
  const g = new THREE.Group();
  addMesh(g, G.cyl(), caneMat("#fdf6f0", GRAPE, 26), [0.035, 2.3, 0.035], [0, 0.8, 0.16], [0, 0, Math.PI / 2], false);
  const cols = [RED, ORANGE, LEMON, LIME, BLUE, GRAPE, PINK];
  for (const s of [-1, 1]) {
    addMesh(g, G.sphere(), wet(s > 0 ? LIME : PINK), [0.07, 0.07, 0.07], [s * 1.18, 0.8, 0.16], undefined, false);
    box(g, "#fdf6f0", [0.04, 0.1, 0.16], [s * 1.0, 0.8, 0.08]);
    // the long strings, 1.6m each, hanging from the rod
    for (let i = 0; i < 5; i++) {
      const x = s * (1.12 - i * 0.1);
      addMesh(g, G.beads(16), wet(cols[(i + (s > 0 ? 3 : 0)) % cols.length]!), [1, 1, 1], [x, 0.78, 0.15 - (i % 2) * 0.03], undefined, false);
    }
    // the tie-back: a gummy ring gathering the strings
    addMesh(g, G.torus(), wet(s > 0 ? PINK : LIME), [0.2, 0.06, 0.1], [s * 0.9, -0.28, 0.13], [Math.PI / 2, 0, 0], false);
  }
  // the fringe across the top of the window: short strings, long and short in turn
  for (let i = 0; i < 9; i++) {
    const x = -0.64 + i * 0.16;
    addMesh(g, G.beads(i % 2 ? 3 : 4), wet(cols[i % cols.length]!), [0.85, 1, 0.85], [x, 0.78, 0.17], undefined, false);
  }
  return g;
}

// ---------------------------------------------------------------------------
// lamps: 0.5 footprint, under 1m, all glow is emissive (no real lights)

/** Neutral starter: a ball of gumballs with a light inside, on a sweet machine base. */
function lampGumball() {
  const g = new THREE.Group();
  addMesh(g, G.frustum(0.62, 1), col(RED, 0.35), [0.2, 0.16, 0.2], [0, 0.08, 0]);
  addMesh(g, G.cyl(), col(LIQ, 0.4), [0.055, 0.3, 0.055], [0, 0.29, 0]);
  addMesh(g, G.cyl(), col("#c9a23c", 0.25), [0.07, 0.04, 0.07], [0, 0.45, 0], undefined, false);
  // the glow lives at the centre; the gumballs sit on a shell around it, so the
  // light leaks between them the way it does through a real machine
  addMesh(g, G.sphere(), glowMaterial("#fff3d6", 1.2, 0.3), [0.15, 0.15, 0.15], [0, 0.66, 0], undefined, false);
  let k = 0;
  for (const el of [-0.6, -0.2, 0.2, 0.6]) {
    const n = Math.abs(el) > 0.4 ? 3 : 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + el;
      const r = Math.cos(el) * 0.185;
      addMesh(g, G.sphereLo(), wet(CANDY[k++ % CANDY.length]!), [0.062, 0.062, 0.062], [Math.cos(a) * r, 0.66 + Math.sin(el) * 0.185, Math.sin(a) * r], undefined, false);
    }
  }
  addMesh(g, G.sphereLo(), wet(GRAPE), [0.062, 0.062, 0.062], [0, 0.85, 0], undefined, false);
  addMesh(g, G.cone(), col(RED, 0.35), [0.11, 0.11, 0.11], [0, 0.9, 0], undefined, false);
  return g;
}

/** Girls': a swirl lollipop as tall as the lantern it replaces, with a bow. */
function lampLollipop() {
  const g = new THREE.Group();
  addMesh(g, G.frustum(0.8, 1), caseMat("#ffb3d2", "#ff8fc0"), [0.2, 0.14, 0.2], [0, 0.07, 0]);
  addMesh(g, G.dome(), col("#fff1f7", 0.7), [0.19, 0.12, 0.19], [0, 0.13, 0]);
  addMesh(g, G.sphereLo(), wet(RED), [0.045, 0.045, 0.045], [0, 0.27, 0], undefined, false);
  addMesh(g, G.cyl(), col(CREAM, 0.5), [0.022, 0.5, 0.022], [0, 0.5, 0]);
  // the disc faces the room; a slightly larger glow disc behind it haloes the
  // swirl, because a canvas texture cannot be emissive on its own
  const swirl = swirlMat("lolly-pink", SWIRL_PINK, 3);
  addMesh(g, G.cylHi(), glowMaterial("#ff9ac8", 0.75, 0.3), [0.215, 0.05, 0.215], [0, 0.79, -0.01], [Math.PI / 2, 0, 0], false);
  addMesh(g, G.cylHi(), [col("#ff5fa2", 0.25), swirl, swirl], [0.2, 0.05, 0.2], [0, 0.79, 0.015], [Math.PI / 2, 0, 0]);
  // bow at the foot of the disc
  for (const s of [-1, 1]) addMesh(g, G.sphereLo(), col("#ff5fa2", 0.5), [0.07, 0.05, 0.03], [s * 0.07, 0.56, 0.05], [0, 0, s * 0.5], false);
  addMesh(g, G.sphereLo(), col("#ff5fa2", 0.5), [0.03, 0.03, 0.03], [0, 0.56, 0.06], undefined, false);
  return g;
}

/** Boys': a rocket ice lolly standing on its stick, lit from inside. */
function lampRocket() {
  const g = new THREE.Group();
  bev(g, CHOC, [0.26, 0.08, 0.26], [0, 0.04, 0]);
  addMesh(g, G.cyl(), col(LIQ, 0.5), [0.09, 0.06, 0.09], [0, 0.11, 0]);
  addMesh(g, G.box(), col(WAFER, 0.8), [0.05, 0.28, 0.015], [0, 0.26, 0]);
  addMesh(g, G.cyl(), glowMaterial("#3f8fe0", 0.7, 0.3), [0.105, 0.22, 0.105], [0, 0.49, 0]);
  addMesh(g, G.cyl(), glowMaterial("#fff3d6", 0.7, 0.3), [0.105, 0.12, 0.105], [0, 0.66, 0]);
  addMesh(g, G.cone(), glowMaterial("#ff6a4a", 0.8, 0.3), [0.105, 0.28, 0.105], [0, 0.86, 0]);
  // three fins, so it is a rocket and not a lolly
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    addMesh(g, G.pennant(), col(LIQ, 0.5), [0.14, 0.2, 1], [Math.cos(a) * 0.11, 0.44, Math.sin(a) * 0.11], [0, a + Math.PI / 2, Math.PI], false);
  }
  return g;
}

/** Neutral: a fat striped candle with a sugar flame. */
function lampCandle() {
  const g = new THREE.Group();
  addMesh(g, G.cylHi(), col("#fff1f7", 0.6), [0.22, 0.03, 0.22], [0, 0.015, 0]);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    addMesh(g, G.sphereLo(), wet(CANDY[i % CANDY.length]!), [0.035, 0.035, 0.035], [Math.cos(a) * 0.18, 0.05, Math.sin(a) * 0.18], undefined, false);
  }
  addMesh(g, G.cyl(), caneMat("#fdf6f0", "#93d84a", 5), [0.1, 0.62, 0.1], [0, 0.36, 0]);
  // wax drips over the rim: three blobs at different heights
  for (const [a, drop] of [
    [0.4, 0.09],
    [2.3, 0.05],
    [4.4, 0.12],
  ] as const) {
    addMesh(g, G.sphereLo(), col(CREAM, 0.6), [0.03, 0.06 + drop, 0.03], [Math.cos(a) * 0.098, 0.64 - drop, Math.sin(a) * 0.098], undefined, false);
  }
  addMesh(g, G.cylLo(), col(LIQ, 0.6), [0.008, 0.05, 0.008], [0, 0.69, 0], undefined, false);
  addMesh(g, G.sphere(), glowMaterial("#ffd27a", 1.4, 0.3), [0.05, 0.08, 0.05], [0, 0.75, 0], undefined, false);
  addMesh(g, G.cone(), glowMaterial("#fff3d6", 1.1, 0.3), [0.035, 0.07, 0.035], [0, 0.81, 0], undefined, false);
  return g;
}

/** Neutral: a sugar star on a candy cane stick, with a sleepy face, glowing like a night light. */
function lampStar() {
  const g = new THREE.Group();
  // a big gumdrop for a base, sugared, so it will not tip
  addMesh(g, G.cylHi(), col(GRAPE, 0.6), [0.22, 0.05, 0.22], [0, 0.025, 0]);
  addMesh(g, G.dome(), col(GRAPE, 0.6), [0.2, 0.16, 0.2], [0, 0.05, 0]);
  addMesh(g, G.cyl(), caneMat("#fdf6f0", "#3f8fe0", 4), [0.025, 0.52, 0.025], [0, 0.46, 0]);
  addMesh(g, G.star(), glowMaterial("#ffd54a", 0.9, 0.35), [0.2, 0.2, 0.2], [0, 0.78, 0]);
  // the face on the side facing the room: closed eyes and a small smile
  const ink = col(LIQ, 0.5);
  for (const s of [-1, 1]) box(g, ink, [0.045, 0.01, 0.01], [s * 0.05, 0.8, 0.052], [0, 0, s * -0.25]);
  addMesh(g, G.smile(), ink, [0.03, 0.03, 0.03], [0, 0.77, 0.055], undefined, false);
  for (const s of [-1, 1]) addMesh(g, G.sphereLo(), col("#ff8fc0", 0.6), [0.022, 0.015, 0.008], [s * 0.085, 0.765, 0.05], undefined, false);
  return g;
}

/** Boys': a liquorice traffic light, a glowing gumball for each of stop, wait and go. */
function lampTraffic() {
  const g = new THREE.Group();
  bev(g, CHOC, [0.4, 0.07, 0.4], [0, 0.035, 0]);
  box(g, "#fdf6f0", [0.3, 0.012, 0.3], [0, 0.071, 0]);
  addMesh(g, G.cyl(), caneMat(LIQ, LEMON, 4), [0.035, 0.42, 0.035], [0, 0.28, 0]);
  bev(g, col(LIQ, 0.4), [0.2, 0.5, 0.16], [0, 0.73, 0]);
  bev(g, col(LEMON, 0.45), [0.22, 0.04, 0.18], [0, 0.99, 0]);
  for (const [y, c] of [
    [0.88, "#ff4a4a"],
    [0.73, "#ffc83a"],
    [0.58, "#5ae06a"],
  ] as const) {
    addMesh(g, G.sphere(), glowMaterial(c, 0.9, 0.2), [0.055, 0.055, 0.04], [0, y, 0.075], undefined, false);
    // a visor over each light, the thing that makes it a traffic light
    box(g, LIQ, [0.13, 0.015, 0.06], [0, y + 0.065, 0.1], [0.3, 0, 0]);
  }
  return g;
}

/**
 * Neutral prize: a gummy jellyfish floating over a mint dish, lit from inside,
 * its tentacles sour worms curling down to hold it up.
 */
function lampJellyfish() {
  const g = new THREE.Group();
  addMesh(g, G.cylHi(), wet(MINT), [0.23, 0.05, 0.23], [0, 0.025, 0]);
  addMesh(g, G.cylHi(), col("#fdf6f0", 0.4), [0.19, 0.012, 0.19], [0, 0.056, 0], undefined, false);
  // the bell: a lit core inside a clear gummy dome, so it glows through
  addMesh(g, G.sphere(), glowMaterial("#ff9ad0", 0.9, 0.3), [0.14, 0.1, 0.14], [0, 0.73, 0], undefined, false);
  addMesh(g, G.dome(), clear("#ff8fc0", 0.6), [0.22, 0.24, 0.22], [0, 0.66, 0]);
  addMesh(g, G.torus(), wet("#ff8fc0"), [0.19, 0.19, 0.12], [0, 0.66, 0], [Math.PI / 2, 0, 0], false);
  // six sour worms curling down from the rim to the dish, holding it up
  for (let i = 0; i < 6; i++) addMesh(g, G.tentacle(i), wet(CANDY[i % CANDY.length]!), [1, 1, 1], [0, 0, 0], undefined, false);
  // a friendly face on the front of the bell
  for (const s of [-1, 1]) {
    addMesh(g, G.sphereLo(), col(LIQ, 0.3), [0.025, 0.03, 0.02], [s * 0.07, 0.76, 0.19], undefined, false);
    addMesh(g, G.sphereLo(), col("#ffffff", 0.3), [0.008, 0.008, 0.008], [s * 0.07 + 0.008, 0.77, 0.208], undefined, false);
  }
  addMesh(g, G.smile(), col(LIQ, 0.5), [0.035, 0.035, 0.035], [0, 0.73, 0.212], [-0.3, 0, 0], false);
  return g;
}

// ---------------------------------------------------------------------------
// plants: within 0.56, and tall enough to be seen over the bed

/** Neutral starter: a little tree that grew lollipops. */
function plantLollitree() {
  const g = new THREE.Group();
  addMesh(g, G.frustum(1, 0.78), col(CHOC, 0.35), [0.24, 0.4, 0.24], [0, 0.2, 0]);
  addMesh(g, G.cyl(), col(MILK, 0.35), [0.26, 0.06, 0.26], [0, 0.42, 0]);
  addMesh(g, G.cyl(), col("#3f2415", 0.9), [0.22, 0.03, 0.22], [0, 0.455, 0], undefined, false);
  addMesh(g, G.cyl(), caneMat("#e8c48a", "#8a5433", 7), [0.05, 0.5, 0.05], [0, 0.7, 0]);
  const swirl = swirlMat("lolly-rainbow", SWIRL_RAINBOW, 2.4);
  const disc: [number, number, number][] = [
    [0, 1.02, 0.03],
    [-0.17, 0.93, -0.04],
    [0.17, 0.95, 0.02],
    [-0.09, 1.08, -0.14],
    [0.11, 1.05, 0.13],
  ];
  for (const [x, y, z] of disc) {
    addMesh(g, G.cylLo(), col(CREAM, 0.5), [0.014, 0.16, 0.014], [x * 0.6, y - 0.12, z * 0.6], [0, 0, -x * 1.2], false);
    addMesh(g, G.cylHi(), [col("#d8d0c0", 0.3), swirl, swirl], [0.1, 0.03, 0.1], [x, y, z], [Math.PI / 2, 0, 0]);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.6;
    addMesh(g, G.sphere(), col(CANDY[i]!, 0.55), [0.065, 0.07, 0.065], [Math.cos(a) * 0.16, 0.88 + (i % 2) * 0.12, Math.sin(a) * 0.16], undefined, false);
  }
  return g;
}

/** Girls': a cupcake with candy flowers growing out of the icing. */
function plantCupcake() {
  const g = new THREE.Group();
  addMesh(g, G.frustum(1, 0.7), caseMat("#ff8fc0", "#e0679f"), [0.26, 0.34, 0.26], [0, 0.17, 0]);
  addMesh(g, G.dome(), col("#fff1f7", 0.72), [0.27, 0.16, 0.27], [0, 0.33, 0]);
  // piped swirl: three rounds, each smaller and turned a little
  addMesh(g, G.cyl(), col("#fff1f7", 0.72), [0.2, 0.08, 0.2], [0, 0.42, 0]);
  addMesh(g, G.cyl(), col("#ffe3ef", 0.72), [0.14, 0.07, 0.14], [0, 0.48, 0]);
  addMesh(g, G.sphereLo(), wet(RED), [0.045, 0.045, 0.045], [0.06, 0.54, 0.02], undefined, false);
  const r = rng(131);
  for (let i = 0; i < 10; i++) {
    const a = r() * Math.PI * 2;
    const rr = 0.08 + r() * 0.13;
    box(g, CANDY[i % CANDY.length]!, [0.03, 0.012, 0.012], [Math.cos(a) * rr, 0.47, Math.sin(a) * rr], [0, a, 0]);
  }
  // three flowers: marshmallow petals round a gumdrop
  const flower = (x: number, z: number, h: number, c: string) => {
    addMesh(g, G.cylLo(), col("#6fbf4a", 0.7), [0.014, h, 0.014], [x, 0.45 + h / 2, z], undefined, false);
    const y = 0.45 + h;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      addMesh(g, G.sphereLo(), col(c, 0.75), [0.045, 0.022, 0.045], [x + Math.cos(a) * 0.05, y, z + Math.sin(a) * 0.05], undefined, false);
    }
    addMesh(g, G.sphereLo(), col(LEMON, 0.55), [0.03, 0.03, 0.03], [x, y + 0.012, z], undefined, false);
    addMesh(g, G.sphereLo(), col("#6fbf4a", 0.7), [0.05, 0.015, 0.03], [x + 0.05, 0.45 + h * 0.55, z], [0, 0, -0.4], false);
  };
  flower(0.0, -0.04, 0.42, "#fff1f7");
  flower(-0.12, 0.07, 0.3, "#ff8fc0");
  flower(0.13, 0.06, 0.24, "#ffe3ef");
  return g;
}

/** Boys': a gummy cactus rolled in sugar, in a chocolate trough. */
function plantCactus() {
  const g = new THREE.Group();
  bev(g, CHOC, [0.52, 0.26, 0.38], [0, 0.13, 0]);
  box(g, MILK, [0.54, 0.04, 0.4], [0, 0.26, 0]);
  box(g, "#f4ecd8", [0.44, 0.02, 0.3], [0, 0.29, 0]);
  const green = wet("#4ec46a");
  const lime = wet("#8fdc5a");
  addMesh(g, G.cyl(), green, [0.1, 0.52, 0.1], [0, 0.55, -0.02]);
  addMesh(g, G.sphere(), green, [0.1, 0.1, 0.1], [0, 0.81, -0.02]);
  addMesh(g, G.cyl(), green, [0.045, 0.18, 0.045], [0.15, 0.66, -0.02]);
  addMesh(g, G.sphere(), green, [0.045, 0.045, 0.045], [0.15, 0.75, -0.02]);
  addMesh(g, G.cyl(), green, [0.045, 0.11, 0.045], [0.1, 0.57, -0.02], [0, 0, Math.PI / 2], false);
  addMesh(g, G.cyl(), lime, [0.07, 0.3, 0.07], [-0.17, 0.45, 0.04]);
  addMesh(g, G.sphere(), lime, [0.07, 0.07, 0.07], [-0.17, 0.6, 0.04]);
  // sugar crystals instead of spines: the same idea, and edible
  const r = rng(149);
  for (let i = 0; i < 22; i++) {
    const a = r() * Math.PI * 2;
    const y = 0.34 + r() * 0.45;
    const main = r() < 0.7;
    const cx = main ? 0 : -0.17;
    const cz = main ? -0.02 : 0.04;
    const rr = (main ? 0.1 : 0.07) + 0.005;
    box(g, "#fdf6f0", [0.018, 0.018, 0.018], [cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr], [a, a, 0]);
  }
  return g;
}

/** A chocolate flowerpot with an icing band and a crumb-soil top, shared by the new plants. */
function chocPot(g: THREE.Group, band: string) {
  addMesh(g, G.frustum(1, 0.76), col(MILK, 0.35), [0.25, 0.36, 0.25], [0, 0.18, 0]);
  addMesh(g, G.cyl(), col(band, 0.5), [0.265, 0.07, 0.265], [0, 0.34, 0]);
  addMesh(g, G.cyl(), col("#3f2415", 0.9), [0.23, 0.02, 0.23], [0, 0.37, 0], undefined, false);
}

/** Neutral: a sunflower whose face is a chocolate chip cookie. */
function plantSunflower() {
  const g = new THREE.Group();
  chocPot(g, LEMON);
  addMesh(g, G.cyl(), wet("#4ec46a"), [0.024, 0.46, 0.024], [0, 0.6, 0]);
  // two gummy leaves off the stem
  for (const s of [-1, 1]) addMesh(g, G.sphereLo(), wet("#6fd06a"), [0.11, 0.025, 0.05], [s * 0.1, 0.55 + (s > 0 ? 0.08 : 0), 0], [0, 0, s * 0.45], false);
  // the head faces the room, tipped back a little to look up at her
  const head = new THREE.Group();
  head.position.set(0, 0.9, 0.02);
  head.rotation.x = -0.25;
  g.add(head);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    addMesh(head, G.sphereLo(), col(i % 2 ? LEMON : "#ffc23a", 0.5), [0.055, 0.03, 0.022], [Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0], [0, 0, a]);
  }
  addMesh(head, G.cylHi(), col("#d9a95e", 0.8), [0.13, 0.05, 0.13], [0, 0, 0.005], [Math.PI / 2, 0, 0]);
  const r = rng(307);
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2;
    const rr = 0.02 + r() * 0.08;
    addMesh(head, G.sphereLo(), col(CHOC, 0.4), [0.018, 0.018, 0.012], [Math.cos(a) * rr, Math.sin(a) * rr, 0.032], undefined, false);
  }
  return g;
}

/**
 * Boys': a gummy venus flytrap with googly eyes, two heads snapping at nothing.
 * Jaws are squashed spheres with a red jelly mouth between them and sugar
 * teeth on the rims, which is all a flytrap needs to read at this size.
 */
function plantFlytrap() {
  const g = new THREE.Group();
  chocPot(g, LIME);
  const green = wet("#4ec46a");
  const trap = (x: number, y: number, z: number, yaw: number, s: number) => {
    // the stalk leans from the middle of the pot to the head
    const rise = y - 0.37;
    addMesh(g, G.cylLo(), green, [0.022, Math.hypot(x, rise, z), 0.022], [x / 2, 0.37 + rise / 2, z / 2], [Math.atan2(z, rise), 0, -Math.atan2(x, rise)], false);
    const h = new THREE.Group();
    h.position.set(x, y, z);
    h.rotation.y = yaw;
    h.scale.setScalar(s);
    g.add(h);
    addMesh(h, G.sphere(), green, [0.13, 0.045, 0.11], [0, 0, 0]);
    addMesh(h, G.sphere(), wet(RED), [0.115, 0.03, 0.095], [0, 0.03, 0.01], undefined, false);
    addMesh(h, G.sphere(), green, [0.13, 0.045, 0.11], [0, 0.1, -0.03], [-0.5, 0, 0]);
    const white = col("#fdf6f0", 0.4);
    for (let i = 0; i < 5; i++) {
      const tx = -0.08 + i * 0.04;
      addMesh(h, G.cone(), white, [0.012, 0.035, 0.012], [tx, 0.04, 0.09], undefined, false);
      addMesh(h, G.cone(), white, [0.012, 0.035, 0.012], [tx, 0.125, 0.07], [Math.PI, 0, 0], false);
    }
    for (const sx of [-1, 1]) {
      addMesh(h, G.sphereLo(), white, [0.03, 0.03, 0.03], [sx * 0.05, 0.17, -0.02], undefined, false);
      addMesh(h, G.sphereLo(), col(LIQ, 0.3), [0.014, 0.014, 0.014], [sx * 0.05, 0.175, 0.005], undefined, false);
    }
  };
  trap(-0.08, 0.86, 0.02, 0.35, 1);
  trap(0.13, 0.66, 0.06, -0.5, 0.8);
  // a baby one low down, just coming up
  addMesh(g, G.sphere(), green, [0.05, 0.03, 0.04], [-0.1, 0.42, 0.12], [-0.4, 0, 0], false);
  return g;
}

/** Neutral prize: a little tree with cotton candy clouds for leaves on a twisted chocolate trunk. */
function plantCottonTree() {
  const g = new THREE.Group();
  chocPot(g, "#ffc2e0");
  const trunk = caneMat(CHOC, MILK, 3);
  addMesh(g, G.cyl(), trunk, [0.04, 0.4, 0.04], [0, 0.56, 0]);
  addMesh(g, G.cyl(), trunk, [0.025, 0.2, 0.025], [0.08, 0.76, 0], [0, 0, -0.7], false);
  addMesh(g, G.cyl(), trunk, [0.025, 0.2, 0.025], [-0.08, 0.72, 0.02], [0, 0, 0.7], false);
  // the floss: pink and blue puffs, matt as spun sugar is, the biggest on top
  const pink = col("#ffc2e0", 0.95);
  const blue = col("#bfe3ff", 0.95);
  for (const [x, y, z, r, m] of [
    [0, 0.95, 0, 0.17, pink],
    [0.16, 0.84, 0.03, 0.11, blue],
    [-0.15, 0.8, 0.02, 0.12, blue],
    [0.06, 0.88, -0.14, 0.11, pink],
    [-0.06, 1.06, 0.06, 0.1, blue],
    [0.02, 0.84, 0.14, 0.1, pink],
  ] as const)
    addMesh(g, G.sphere(), m, [r, r * 0.9, r], [x, y, z]);
  // a few sugar pearls caught in it
  for (const [x, y, z] of [
    [0.1, 1.0, 0.1],
    [-0.14, 0.9, 0.09],
    [0.19, 0.88, -0.02],
  ] as const)
    addMesh(g, G.sphereLo(), glowMaterial("#fff3d6", 0.5, 0.3), [0.018, 0.018, 0.018], [x, y, z], undefined, false);
  return g;
}

// ---------------------------------------------------------------------------
// tables: 1.2 x 0.9, top at 0.72

/** Neutral starter: an allsort slab on twisted liquorice legs. */
function tableLiquorice() {
  const g = new THREE.Group();
  bev(g, col(LIQ, 0.45), [1.2, 0.07, 0.9], [0, 0.685, 0]);
  // the allsort's layers, stacked under the top where they catch the light
  bev(g, col("#fdf6f0", 0.7), [1.18, 0.04, 0.88], [0, 0.63, 0], undefined, false);
  bev(g, col(PINK, 0.6), [1.18, 0.04, 0.88], [0, 0.59, 0], undefined, false);
  bev(g, col(LIQ, 0.45), [1.18, 0.04, 0.88], [0, 0.55, 0], undefined, false);
  const rope = caneMat(LIQ, "#5a4f66", 6);
  for (const x of [-0.5, 0.5]) for (const z of [-0.35, 0.35]) addMesh(g, G.cyl(), rope, [0.055, 0.53, 0.055], [x, 0.265, z]);
  // a bowl of jelly beans, a striped cup and a stack of chocolate coins
  addMesh(g, G.frustum(1, 0.55), col("#fff1f7", 0.4), [0.15, 0.1, 0.15], [-0.28, 0.77, 0.06]);
  const r = rng(167);
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2;
    const rr = r() * 0.09;
    addMesh(g, G.sphereLo(), wet(CANDY[i % CANDY.length]!), [0.035, 0.022, 0.025], [-0.28 + Math.cos(a) * rr, 0.82 + (i % 2) * 0.02, 0.06 + Math.sin(a) * rr], [0, a, 0], false);
  }
  addMesh(g, G.cyl(), caneMat("#fdf6f0", BLUE, 4), [0.055, 0.13, 0.055], [0.3, 0.785, -0.18]);
  addMesh(g, G.cylLo(), col(LIME, 0.4), [0.01, 0.2, 0.01], [0.32, 0.86, -0.17], [0.2, 0, 0.15], false);
  [0, 0.022, 0.044].forEach((dy, i) =>
    addMesh(g, G.cylLo(), col("#c9a23c", 0.22), [0.06, 0.011, 0.06], [0.34 + i * 0.01, 0.727 + dy, 0.24], [0, i, 0], false),
  );
  return g;
}

/** Girls': a giant cupcake with a frosted table top, laid for tea. */
function tableCupcake() {
  const g = new THREE.Group();
  addMesh(g, G.frustum(0.62, 1), caseMat("#ff8fc0", "#e0679f"), [0.34, 0.46, 0.34], [0, 0.23, 0]);
  addMesh(g, G.dome(), col(ICING, 0.72), [0.36, 0.2, 0.36], [0, 0.44, 0]);
  // an elliptical top, so a round cake still fits the 1.2 x 0.9 footprint
  const sprinkleTop = canvasMaterial("candy-tabletop-sprinkle", ICING, 256, 256, (c, w, h) => {
    c.fillStyle = "#fff1f7";
    c.beginPath();
    c.arc(w / 2, h / 2, w * 0.49, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#ffd9e8";
    c.beginPath();
    c.arc(w / 2, h / 2, w * 0.4, 0, Math.PI * 2);
    c.fill();
    sprinkles(c, w, h, 179, 70, 14);
  });
  addMesh(g, G.cylHi(), [col(ICING, 0.6), sprinkleTop, col(ICING, 0.6)], [0.56, 0.05, 0.42], [0, 0.695, 0]);
  // scalloped icing round the rim
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    addMesh(g, G.sphereLo(), col("#fff1f7", 0.7), [0.06, 0.05, 0.05], [Math.cos(a) * 0.52, 0.665, Math.sin(a) * 0.38], [0, -a, 0], false);
  }
  // two teacups of pink lemonade and a slice of cake on a plate
  for (const [x, z] of [
    [-0.3, 0.12],
    [0.26, -0.14],
  ] as const) {
    addMesh(g, G.cylHi(), col("#fff1f7", 0.35), [0.11, 0.012, 0.11], [x, 0.727, z], undefined, false);
    addMesh(g, G.frustum(1, 0.7), col("#fff1f7", 0.35), [0.07, 0.09, 0.07], [x, 0.777, z]);
    addMesh(g, G.cylHi(), wet("#ff8fc0"), [0.06, 0.012, 0.06], [x, 0.815, z], undefined, false);
    addMesh(g, G.ring(), col("#fff1f7", 0.35), [0.04, 0.04, 0.04], [x + 0.08, 0.777, z], [0, Math.PI / 2, 0], false);
  }
  addMesh(g, G.cylHi(), col("#fff1f7", 0.35), [0.13, 0.012, 0.13], [0.06, 0.727, 0.16], undefined, false);
  bev(g, col("#ffe3ef", 0.8), [0.16, 0.1, 0.1], [0.06, 0.785, 0.16], [0, 0.4, 0], false);
  bev(g, col(CHOC, 0.4), [0.16, 0.03, 0.1], [0.06, 0.845, 0.16], [0, 0.4, 0], false);
  addMesh(g, G.sphereLo(), wet(RED), [0.025, 0.025, 0.025], [0.06, 0.87, 0.16], undefined, false);
  return g;
}

/** Boys': a crate of sweets with a wafer worktop, the lid left off. */
function tableCrate() {
  const g = new THREE.Group();
  const plank = col(MILK, 0.42);
  const dark = col(CHOC, 0.42);
  for (const z of [-0.3, 0, 0.3]) bev(g, col(WAFER, 0.75), [1.2, 0.06, 0.26], [0, 0.69, z]);
  for (const z of [-0.4, 0.4]) {
    bev(g, plank, [1.16, 0.18, 0.05], [0, 0.55, z], undefined, false);
    bev(g, plank, [1.16, 0.18, 0.05], [0, 0.3, z], undefined, false);
  }
  for (const x of [-0.55, 0.55]) {
    bev(g, plank, [0.05, 0.18, 0.82], [x, 0.55, 0], undefined, false);
    bev(g, plank, [0.05, 0.18, 0.82], [x, 0.3, 0], undefined, false);
  }
  for (const x of [-0.545, 0.545]) for (const z of [-0.395, 0.395]) bev(g, dark, [0.08, 0.66, 0.08], [x, 0.33, z]);
  // a chalked plank on the front, a jar of gobstoppers, coins and a wrapped sweet
  const label = canvasMaterial("candy-crate-label", WAFER, 256, 72, (c, w, h) => {
    c.fillStyle = "#e8c48a";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#5a3420";
    c.font = "bold 40px system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("SWEETS", w / 2, h / 2 + 2);
  });
  addMesh(g, G.plane(), label, [0.56, 0.16, 1], [0, 0.48, 0.432], undefined, false);
  addMesh(g, G.cyl(), clear("#dff0f6", 0.45), [0.12, 0.2, 0.12], [-0.32, 0.82, -0.1]);
  const r = rng(191);
  for (let i = 0; i < 7; i++)
    addMesh(g, G.sphereLo(), wet(CANDY[i % CANDY.length]!), [0.05, 0.05, 0.05], [-0.32 + (r() - 0.5) * 0.1, 0.76 + i * 0.02, -0.1 + (r() - 0.5) * 0.1], undefined, false);
  addMesh(g, G.cyl(), col(LIQ, 0.4), [0.125, 0.02, 0.125], [-0.32, 0.93, -0.1], undefined, false);
  [0, 0.024, 0.048, 0.072].forEach((dy, i) =>
    addMesh(g, G.cylLo(), col("#c9a23c", 0.22), [0.065, 0.012, 0.065], [0.3, 0.732 + dy, -0.22], [0, i * 0.4, 0], false),
  );
  addMesh(g, G.sphere(), wet(BLUE), [0.07, 0.07, 0.07], [0.3, 0.79, 0.18], undefined, false);
  for (const s of [-1, 1]) addMesh(g, G.cone(), col("#fdf6f0", 0.5), [0.05, 0.07, 0.05], [0.3 + s * 0.11, 0.79, 0.18], [0, 0, s * Math.PI / 2], false);
  return g;
}

/**
 * A torus lying flat, sized by its outside radii along x and z and its height.
 * TorusGeometry's tube is a quarter of its radius, so the outside edge is 1.25
 * units out and the tube is 0.5 units thick.
 */
function flatRing(g: THREE.Group, m: THREE.Material, rx: number, rz: number, h: number, y: number, shadow = true) {
  return addMesh(g, G.torus(), m, [rx / 1.25, rz / 1.25, h / 0.5], [0, y, 0], [Math.PI / 2, 0, 0], shadow);
}

/** Neutral: a strawberry-iced donut the size of a table, a sugar-glass top in the hole. */
function tableDonut() {
  const g = new THREE.Group();
  addMesh(g, G.cylHi(), col(MILK, 0.35), [0.3, 0.06, 0.26], [0, 0.03, 0]);
  addMesh(g, G.cyl(), caneMat(CHOC, "#fdf6f0", 5), [0.08, 0.52, 0.08], [0, 0.32, 0]);
  flatRing(g, col("#e0a060", 0.7), 0.6, 0.45, 0.2, 0.62);
  flatRing(g, wet("#ff8fc0"), 0.58, 0.43, 0.12, 0.67);
  // the hole is 0.6 of the way out: glaze it over with a sugar-glass disc
  addMesh(g, G.cylHi(), clear("#e8f6ff", 0.5), [0.37, 0.02, 0.28], [0, 0.7, 0], undefined, false);
  const r = rng(317);
  for (let i = 0; i < 34; i++) {
    const a = r() * Math.PI * 2;
    const rr = 0.8 + r() * 0.13;
    box(g, CANDY[i % CANDY.length]!, [0.045, 0.012, 0.014], [Math.cos(a) * 0.5 * rr, 0.728, Math.sin(a) * 0.37 * rr], [0, r() * Math.PI, 0]);
  }
  // a mug of hot chocolate with a marshmallow in it, on the glass
  addMesh(g, G.cyl(), col("#fdf6f0", 0.4), [0.06, 0.12, 0.06], [0.05, 0.77, 0.05]);
  addMesh(g, G.cyl(), col(CHOC, 0.3), [0.052, 0.01, 0.052], [0.05, 0.826, 0.05], undefined, false);
  bev(g, col(MARSH, 0.85), [0.04, 0.03, 0.04], [0.06, 0.835, 0.04], [0, 0.4, 0.2], false);
  addMesh(g, G.ring(), col("#fdf6f0", 0.4), [0.035, 0.035, 0.035], [0.12, 0.77, 0.05], [0, Math.PI / 2, 0], false);
  return g;
}

/** Boys': a wafer table printed with a race track, two jelly cars on the start line. */
function tableRace() {
  const g = new THREE.Group();
  const trackTop = canvasMaterial("candy-tabletop-track", "#6fbf4a", 256, 192, (c, w, h) => {
    c.fillStyle = "#6fbf4a";
    c.fillRect(0, 0, w, h);
    // the track: an oval of liquorice with a white edge and a dashed middle
    c.lineJoin = "round";
    const lane = (lw: number, color: string, dash: number[] = []) => {
      c.strokeStyle = color;
      c.lineWidth = lw;
      c.setLineDash(dash);
      c.beginPath();
      c.roundRect(w * 0.14, h * 0.18, w * 0.72, h * 0.64, h * 0.3);
      c.stroke();
    };
    lane(h * 0.24, "#fdf6f0");
    lane(h * 0.2, "#332c3a");
    lane(3, "#ffd54a", [10, 8]);
    c.setLineDash([]);
    // a chequered start line across the bottom straight
    const s = h * 0.05;
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 2; j++) {
        c.fillStyle = (i + j) % 2 ? "#241f28" : "#fdf6f0";
        c.fillRect(w * 0.5 + j * s, h * 0.72 + i * s, s, s);
      }
    // gumdrop trees in the infield
    for (const [x, y, colr] of [
      [0.4, 0.45, RED],
      [0.5, 0.55, LEMON],
      [0.6, 0.45, BLUE],
    ] as const) {
      c.fillStyle = colr;
      c.beginPath();
      c.arc(w * x, h * y, h * 0.06, 0, Math.PI * 2);
      c.fill();
    }
  });
  const edge = col(WAFER, 0.75);
  addMesh(g, G.box(), [edge, edge, trackTop, edge, edge, edge], [1.2, 0.06, 0.9], [0, 0.69, 0]);
  box(g, "#c9985a", [1.18, 0.02, 0.88], [0, 0.65, 0], undefined, true);
  for (const x of [-0.54, 0.54]) for (const z of [-0.39, 0.39]) bev(g, col(CHOC, 0.35), [0.09, 0.64, 0.09], [x, 0.32, z]);
  // two cars on the grid: a jelly body, a boiled-sweet bubble, liquorice wheels
  const car = (x: number, z: number, color: string) => {
    bev(g, wet(color), [0.14, 0.04, 0.08], [x, 0.745, z]);
    addMesh(g, G.dome(), clear("#bfe3ff", 0.7), [0.035, 0.03, 0.03], [x - 0.01, 0.765, z], undefined, false);
    for (const dx of [-0.045, 0.045]) for (const dz of [-0.045, 0.045]) addMesh(g, G.cylLo(), col(LIQ, 0.5), [0.02, 0.014, 0.02], [x + dx, 0.74, z + dz], [Math.PI / 2, 0, 0], false);
  };
  car(0.04, 0.3, RED);
  car(0.04, 0.18, BLUE);
  // a chequered flag stuck in the corner
  box(g, "#fdf6f0", [0.012, 0.3, 0.012], [0.5, 0.87, -0.34], undefined, true);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 2; j++) box(g, (i + j) % 2 ? LIQ : "#fdf6f0", [0.04, 0.04, 0.006], [0.46 - i * 0.04, 0.98 - j * 0.04, -0.34]);
  return g;
}

/**
 * Girls' prize: a macaron as big as a table. Two shells, a cream filling, and
 * the ruffled "foot" round each shell that tells a macaron from a burger.
 */
function tableMacaron() {
  const g = new THREE.Group();
  const shell = col("#ffb3d2", 0.55);
  const foot = col("#ffc7dd", 0.9);
  addMesh(g, G.cylHi(), shell, [0.56, 0.2, 0.42], [0, 0.1, 0]);
  flatRing(g, foot, 0.58, 0.44, 0.08, 0.24);
  addMesh(g, G.cylHi(), col(CREAM, 0.7), [0.53, 0.14, 0.4], [0, 0.35, 0]);
  flatRing(g, foot, 0.58, 0.44, 0.08, 0.46);
  addMesh(g, G.cylHi(), shell, [0.56, 0.1, 0.42], [0, 0.55, 0]);
  addMesh(g, G.dome(), shell, [0.56, 0.12, 0.42], [0, 0.6, 0]);
  // on top, a cake stand of three little macarons and a heart
  addMesh(g, G.cylHi(), col("#fdf6f0", 0.35), [0.16, 0.012, 0.16], [0.14, 0.72, -0.08], undefined, false);
  addMesh(g, G.cylLo(), col("#fdf6f0", 0.35), [0.02, 0.08, 0.02], [0.14, 0.76, -0.08], undefined, false);
  addMesh(g, G.cylHi(), col("#fdf6f0", 0.35), [0.14, 0.01, 0.14], [0.14, 0.8, -0.08], undefined, false);
  [MINT, LEMON, GRAPE].forEach((c, i) => {
    const a = (i / 3) * Math.PI * 2;
    const x = 0.14 + Math.cos(a) * 0.07;
    const z = -0.08 + Math.sin(a) * 0.07;
    addMesh(g, G.cylHi(), col(c, 0.55), [0.045, 0.018, 0.045], [x, 0.815, z], undefined, false);
    addMesh(g, G.cylHi(), col(CREAM, 0.7), [0.04, 0.012, 0.04], [x, 0.83, z], undefined, false);
    addMesh(g, G.cylHi(), col(c, 0.55), [0.045, 0.018, 0.045], [x, 0.845, z], undefined, false);
  });
  addMesh(g, G.heart(), col("#ff5fa2", 0.5), [0.07, 0.07, 1], [-0.22, 0.725, 0.12], [-Math.PI / 2, 0, 0.4], false);
  return g;
}

// ---------------------------------------------------------------------------
// pictures: origin at the picture centre on the wall, hanging at eye level

/** Neutral starter: a lollipop the size of a dinner plate, stick and all. */
function pictureLollipop() {
  const g = new THREE.Group();
  const swirl = swirlMat("lolly-rainbow", SWIRL_RAINBOW, 2.4);
  addMesh(g, G.cylHi(), [col("#d8d0c0", 0.3), swirl, swirl], [0.32, 0.07, 0.32], [0, 0.12, 0.07], [Math.PI / 2, 0, 0]);
  addMesh(g, G.box(), col(CREAM, 0.5), [0.06, 0.42, 0.05], [0, -0.28, 0.07]);
  // the bow sits on the stick below the disc; tucked up behind it, only the two
  // tips showed and they read as cherries
  for (const s of [-1, 1]) addMesh(g, G.sphereLo(), col(RED, 0.5), [0.09, 0.06, 0.04], [s * 0.09, -0.27, 0.09], [0, 0, s * 0.6], false);
  addMesh(g, G.sphereLo(), col(RED, 0.5), [0.035, 0.035, 0.035], [0, -0.27, 0.1], undefined, false);
  return g;
}

/** Girls': a portrait of the candy princess in an icing frame. */
function picturePrincess() {
  const g = new THREE.Group();
  bev(g, col("#ff8fc0", 0.6), [0.95, 0.85, 0.06], [0, 0, 0.03]);
  // the frame is scalloped like piped icing rather than moulded like wood
  for (let i = 0; i < 7; i++) {
    const x = -0.42 + i * 0.14;
    for (const y of [0.4, -0.4]) addMesh(g, G.sphereLo(), col("#fff1f7", 0.7), [0.07, 0.07, 0.04], [x, y, 0.05], undefined, false);
  }
  for (let i = 0; i < 5; i++) {
    const y = -0.32 + i * 0.16;
    for (const x of [-0.45, 0.45]) addMesh(g, G.sphereLo(), col("#fff1f7", 0.7), [0.07, 0.07, 0.04], [x, y, 0.05], undefined, false);
  }
  const art = canvasMaterial("candy-art-princess", "#ffd9e8", 512, 448, (c, w, h) => {
    const sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#ffe9f3");
    sky.addColorStop(1, "#c6f2e3");
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);
    // candy hills and a lollipop tree behind her
    c.fillStyle = "#8fe3c8";
    ellipse(c, w * 0.2, h * 1.05, w * 0.45, h * 0.3);
    c.fill();
    ellipse(c, w * 0.85, h * 1.08, w * 0.4, h * 0.3);
    c.fill();
    c.fillStyle = "#fdf6f0";
    c.fillRect(w * 0.82, h * 0.42, 8, h * 0.4);
    c.fillStyle = "#ff8fc0";
    c.beginPath();
    c.arc(w * 0.835, h * 0.4, w * 0.075, 0, Math.PI * 2);
    c.fill();
    // her dress: a cupcake, scallops and all
    c.fillStyle = "#ff5fa2";
    c.beginPath();
    c.moveTo(w * 0.36, h * 0.92);
    c.lineTo(w * 0.44, h * 0.5);
    c.lineTo(w * 0.56, h * 0.5);
    c.lineTo(w * 0.64, h * 0.92);
    c.closePath();
    c.fill();
    c.fillStyle = "#fff1f7";
    for (let i = 0; i < 5; i++) {
      c.beginPath();
      c.arc(w * (0.38 + i * 0.06), h * 0.9, w * 0.032, Math.PI, 0);
      c.fill();
    }
    c.fillStyle = "#ffc2dc";
    c.beginPath();
    c.ellipse(w * 0.5, h * 0.5, w * 0.09, h * 0.06, 0, Math.PI, 0);
    c.fill();
    // head, hair and a sugar crown
    c.fillStyle = "#f6d3c2";
    c.beginPath();
    c.arc(w * 0.5, h * 0.35, w * 0.075, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#8a5433";
    c.beginPath();
    c.arc(w * 0.5, h * 0.33, w * 0.085, Math.PI, 0);
    c.fill();
    c.fillRect(w * 0.415, h * 0.33, w * 0.04, h * 0.16);
    c.fillRect(w * 0.545, h * 0.33, w * 0.04, h * 0.16);
    c.fillStyle = "#2a2220";
    c.beginPath();
    c.arc(w * 0.475, h * 0.36, 5, 0, Math.PI * 2);
    c.arc(w * 0.525, h * 0.36, 5, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#c9605c";
    c.lineWidth = 4;
    c.beginPath();
    c.arc(w * 0.5, h * 0.375, w * 0.025, 0.15 * Math.PI, 0.85 * Math.PI);
    c.stroke();
    c.fillStyle = "#ffd54a";
    c.beginPath();
    c.moveTo(w * 0.44, h * 0.28);
    for (let i = 0; i < 3; i++) {
      c.lineTo(w * (0.46 + i * 0.04), h * 0.22);
      c.lineTo(w * (0.48 + i * 0.04), h * 0.28);
    }
    c.closePath();
    c.fill();
    // her lollipop sceptre
    c.strokeStyle = "#fdf6f0";
    c.lineWidth = 7;
    c.beginPath();
    c.moveTo(w * 0.68, h * 0.78);
    c.lineTo(w * 0.68, h * 0.55);
    c.stroke();
    c.fillStyle = "#ff5fa2";
    c.beginPath();
    c.arc(w * 0.68, h * 0.5, w * 0.055, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#fff1f7";
    heartPath(c, w * 0.68, h * 0.5, w * 0.022);
    c.fill();
    sprinkles(c, w, h, 211, 26, 12);
  });
  addMesh(g, G.plane(), art, [0.78, 0.68, 1], [0, 0, 0.062], undefined, false);
  return g;
}

/** Boys': a monster truck poster, taped to a liquorice board. */
function pictureTruck() {
  const g = new THREE.Group();
  bev(g, col(LIQ, 0.45), [1.06, 0.8, 0.05], [0, 0, 0.025]);
  const art = canvasMaterial("candy-art-truck", "#4aa0ea", 512, 356, (c, w, h) => {
    const sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#2f6fc0");
    sky.addColorStop(1, "#9fd8f4");
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#ffd54a";
    c.beginPath();
    c.arc(w * 0.12, h * 0.16, w * 0.05, 0, Math.PI * 2);
    c.fill();
    // chocolate ramp and a chocolate-crumb floor
    c.fillStyle = "#5a3420";
    c.beginPath();
    c.moveTo(0, h);
    c.lineTo(0, h * 0.72);
    c.lineTo(w * 0.42, h * 0.95);
    c.lineTo(w, h * 0.78);
    c.lineTo(w, h);
    c.closePath();
    c.fill();
    c.fillStyle = "#7c4a2c";
    for (let i = 0; i < 40; i++) c.fillRect((i * 37) % w, h * 0.82 + ((i * 53) % 40), 9, 6);
    // the truck, mid jump
    c.save();
    c.translate(w * 0.52, h * 0.5);
    c.rotate(-0.18);
    c.fillStyle = "#241f28";
    // the wheels are deliberately bigger than the body is tall; that is the
    // whole point of a monster truck
    for (const x of [-w * 0.18, w * 0.18]) {
      c.beginPath();
      c.arc(x, h * 0.19, w * 0.125, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#e8404a";
      c.beginPath();
      c.arc(x, h * 0.19, w * 0.05, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#241f28";
    }
    c.fillStyle = "#e8404a";
    c.beginPath();
    c.roundRect(-w * 0.24, -h * 0.1, w * 0.48, h * 0.2, 12);
    c.fill();
    c.fillStyle = "#fdf6f0";
    c.fillRect(-w * 0.24, -h * 0.02, w * 0.48, h * 0.035);
    c.fillStyle = "#3f2415";
    c.beginPath();
    c.roundRect(-w * 0.1, -h * 0.24, w * 0.24, h * 0.15, 10);
    c.fill();
    c.fillStyle = "#9fd8f4";
    c.fillRect(-w * 0.06, -h * 0.21, w * 0.16, h * 0.08);
    c.fillStyle = "#c9a23c";
    c.fillRect(-w * 0.02, -h * 0.3, w * 0.05, h * 0.06);
    c.restore();
    // a plume of icing sugar off the back wheel
    c.fillStyle = "rgba(255,255,255,0.75)";
    for (const [x, y, r] of [
      [0.24, 0.72, 0.05],
      [0.16, 0.66, 0.035],
      [0.3, 0.64, 0.03],
    ] as const) {
      c.beginPath();
      c.arc(x * w, y * h, r * w, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = "#fdf6f0";
    c.font = "bold 46px system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";
    c.textAlign = "center";
    c.strokeStyle = "#241f28";
    c.lineWidth = 8;
    c.strokeText("SUGAR RUSH", w / 2, h * 0.16);
    c.fillText("SUGAR RUSH", w / 2, h * 0.16);
  });
  addMesh(g, G.plane(), art, [0.94, 0.66, 1], [0, 0, 0.055], undefined, false);
  // chocolate-button bolts at the corners
  for (const x of [-0.46, 0.46]) for (const y of [-0.33, 0.33]) addMesh(g, G.cylLo(), col(MILK, 0.35), [0.035, 0.02, 0.035], [x, y, 0.06], [Math.PI / 2, 0, 0], false);
  return g;
}

/** A frame of four candy cane bars round a w x h picture, with a gumdrop at each corner. */
function caneFrame(g: THREE.Group, w: number, h: number, stripe: string, corner: string) {
  const bar = (len: number) => caneMat("#fdf6f0", stripe, Math.round(len * 8));
  for (const s of [-1, 1]) {
    addMesh(g, G.cyl(), bar(w), [0.04, w, 0.04], [0, (s * h) / 2, 0.05], [0, 0, Math.PI / 2], false);
    addMesh(g, G.cyl(), bar(h), [0.04, h, 0.04], [(s * w) / 2, 0, 0.05], undefined, false);
  }
  for (const x of [-1, 1]) for (const y of [-1, 1]) addMesh(g, G.sphere(), wet(corner), [0.055, 0.055, 0.055], [(x * w) / 2, (y * h) / 2, 0.05], undefined, false);
}

/** Girls': a unicorn under a rainbow, in a pink candy cane frame. */
function pictureUnicorn() {
  const g = new THREE.Group();
  bev(g, col("#fff1f7", 0.7), [0.92, 0.74, 0.04], [0, 0, 0.02]);
  const art = canvasMaterial("candy-art-unicorn", "#e3f1ff", 512, 412, (c, w, h) => {
    const sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#d6ecff");
    sky.addColorStop(1, "#fbe6f3");
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);
    // the rainbow, then candy-floss clouds sitting on both ends of it
    c.lineWidth = w * 0.035;
    [RED, ORANGE, LEMON, LIME, BLUE, GRAPE].forEach((colr, i) => {
      c.strokeStyle = colr;
      c.beginPath();
      c.arc(w * 0.5, h * 0.78, w * (0.42 - i * 0.035), Math.PI, 0);
      c.stroke();
    });
    c.fillStyle = "#ffffff";
    for (const x of [0.12, 0.88]) {
      c.beginPath();
      c.arc(w * x - 30, h * 0.76, 28, 0, Math.PI * 2);
      c.arc(w * x, h * 0.72, 38, 0, Math.PI * 2);
      c.arc(w * x + 30, h * 0.77, 26, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = "#8fe3c8";
    ellipse(c, w * 0.5, h * 1.02, w * 0.62, h * 0.16);
    c.fill();
    // the unicorn, side on and facing right: body, legs, neck and head
    const ux = w * 0.47;
    const uy = h * 0.66;
    c.fillStyle = "#ffffff";
    c.strokeStyle = "#d9b8e8";
    c.lineWidth = 4;
    for (const lx of [-0.1, -0.05, 0.06, 0.11]) {
      c.beginPath();
      c.roundRect(ux + lx * w - 9, uy, 18, h * 0.2, 8);
      c.fill();
      c.stroke();
    }
    ellipse(c, ux, uy, w * 0.15, h * 0.1);
    c.fill();
    c.stroke();
    c.beginPath();
    c.moveTo(ux + w * 0.08, uy - h * 0.04);
    c.lineTo(ux + w * 0.14, uy - h * 0.24);
    c.lineTo(ux + w * 0.2, uy - h * 0.2);
    c.lineTo(ux + w * 0.15, uy);
    c.closePath();
    c.fill();
    ellipse(c, ux + w * 0.2, uy - h * 0.25, w * 0.07, h * 0.06, 0.4);
    c.fill();
    c.stroke();
    // the horn, twisted gold, and the mane and tail in rainbow locks
    c.fillStyle = "#ffd54a";
    c.beginPath();
    c.moveTo(ux + w * 0.19, uy - h * 0.3);
    c.lineTo(ux + w * 0.23, uy - h * 0.46);
    c.lineTo(ux + w * 0.22, uy - h * 0.29);
    c.closePath();
    c.fill();
    [PINK, GRAPE, BLUE, "#ff5fa2"].forEach((colr, i) => {
      c.fillStyle = colr;
      c.beginPath();
      c.arc(ux + w * (0.12 - i * 0.012), uy - h * (0.28 - i * 0.07), w * 0.035, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.arc(ux - w * (0.16 + i * 0.012), uy - h * (0.02 - i * 0.045), w * 0.03, 0, Math.PI * 2);
      c.fill();
    });
    c.fillStyle = "#2a2220";
    c.beginPath();
    c.arc(ux + w * 0.215, uy - h * 0.265, 5, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#ffb3d2";
    ellipse(c, ux + w * 0.24, uy - h * 0.22, 9, 6);
    c.fill();
    sprinkles(c, w, h * 0.5, 331, 18, 10);
  });
  addMesh(g, G.plane(), art, [0.86, 0.69, 1], [0, 0, 0.042], undefined, false);
  caneFrame(g, 0.9, 0.72, "#ff5fa2", "#ff5fa2");
  return g;
}

/** Boys': a gummy T. rex poster, roaring at a lollipop, on a wafer board. */
function pictureDino() {
  const g = new THREE.Group();
  bev(g, col(WAFER, 0.75), [1.04, 0.8, 0.05], [0, 0, 0.025]);
  const art = canvasMaterial("candy-art-dino", "#ffd54a", 512, 380, (c, w, h) => {
    c.fillStyle = "#ffe89a";
    c.fillRect(0, 0, w, h);
    // sunburst behind him, for the poster look
    c.fillStyle = "#ffd54a";
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      c.beginPath();
      c.moveTo(w * 0.42, h * 0.55);
      c.arc(w * 0.42, h * 0.55, w, a, a + 0.24);
      c.closePath();
      c.fill();
    }
    c.fillStyle = "#b88a4a";
    c.fillRect(0, h * 0.86, w, h * 0.14);
    const green = "#3fbf5a";
    const x = w * 0.38;
    const y = h * 0.52;
    c.fillStyle = green;
    // tail, body, legs, head: all round, because he is a gummy
    c.beginPath();
    c.moveTo(x - w * 0.1, y - h * 0.04);
    c.quadraticCurveTo(x - w * 0.3, y + h * 0.02, x - w * 0.36, y + h * 0.26);
    c.quadraticCurveTo(x - w * 0.22, y + h * 0.12, x - w * 0.06, y + h * 0.14);
    c.fill();
    ellipse(c, x, y + h * 0.05, w * 0.15, h * 0.17, -0.3);
    c.fill();
    c.beginPath();
    c.roundRect(x - w * 0.06, y + h * 0.12, w * 0.07, h * 0.24, 10);
    c.roundRect(x + w * 0.05, y + h * 0.12, w * 0.07, h * 0.24, 10);
    c.fill();
    ellipse(c, x + w * 0.14, y - h * 0.2, w * 0.12, h * 0.1, -0.15);
    c.fill();
    // an open mouth mid-roar, with sugar teeth
    c.fillStyle = "#c0343d";
    c.beginPath();
    c.moveTo(x + w * 0.16, y - h * 0.16);
    c.lineTo(x + w * 0.27, y - h * 0.2);
    c.lineTo(x + w * 0.26, y - h * 0.1);
    c.closePath();
    c.fill();
    c.fillStyle = "#fdf6f0";
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.moveTo(x + w * (0.18 + i * 0.03), y - h * (0.17 + i * 0.01));
      c.lineTo(x + w * (0.195 + i * 0.03), y - h * (0.13 + i * 0.01));
      c.lineTo(x + w * (0.21 + i * 0.03), y - h * (0.175 + i * 0.01));
      c.fill();
    }
    // a little arm, an eye, and gumdrop spikes down his back
    c.fillStyle = green;
    c.beginPath();
    c.roundRect(x + w * 0.1, y - h * 0.02, w * 0.07, h * 0.035, 6);
    c.fill();
    c.fillStyle = "#ffffff";
    c.beginPath();
    c.arc(x + w * 0.15, y - h * 0.24, 11, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#2a2220";
    c.beginPath();
    c.arc(x + w * 0.155, y - h * 0.24, 5, 0, Math.PI * 2);
    c.fill();
    [RED, ORANGE, LEMON, BLUE].forEach((colr, i) => {
      c.fillStyle = colr;
      c.beginPath();
      c.arc(x - w * (0.02 + i * 0.06), y - h * (0.14 - i * 0.05), w * 0.024, 0, Math.PI * 2);
      c.fill();
    });
    c.fillStyle = "rgba(255,255,255,0.35)";
    ellipse(c, x - w * 0.04, y, w * 0.05, h * 0.08, -0.3);
    c.fill();
    // the lollipop he is roaring at
    c.fillStyle = "#fdf6f0";
    c.fillRect(w * 0.85, h * 0.46, 7, h * 0.4);
    c.fillStyle = "#ff5fa2";
    c.beginPath();
    c.arc(w * 0.855, h * 0.42, w * 0.06, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#fdf6f0";
    c.font = "bold 52px system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";
    c.textAlign = "center";
    c.strokeStyle = "#241f28";
    c.lineWidth = 8;
    c.strokeText("ROAR!", w * 0.72, h * 0.2);
    c.fillText("ROAR!", w * 0.72, h * 0.2);
  });
  addMesh(g, G.plane(), art, [0.94, 0.7, 1], [0, 0, 0.052], undefined, false);
  // red and yellow jelly tape across two corners
  for (const [x, y, rz, colr] of [
    [-0.45, 0.35, 0.7, RED],
    [0.45, -0.35, 0.7, LEMON],
  ] as const)
    box(g, clear(colr, 0.75), [0.2, 0.05, 0.006], [x, y, 0.056], [0, 0, rz]);
  return g;
}

/**
 * Neutral prize: a collector's box of real sweets, nine of them in a grid in a
 * chocolate case, the way a museum pins butterflies. Every sweet is 3D, so it
 * is the one picture in the house that looks different from the side.
 */
function pictureSweets() {
  const g = new THREE.Group();
  bev(g, col(CHOC, 0.4), [0.9, 0.8, 0.06], [0, 0, 0.03]);
  bev(g, col("#fdf1e0", 0.8), [0.78, 0.68, 0.02], [0, 0, 0.065]);
  // the case sides stand forward of the backing, like a shadow box
  for (const s of [-1, 1]) {
    bev(g, col(MILK, 0.35), [0.9, 0.06, 0.14], [0, s * 0.37, 0.07]);
    bev(g, col(MILK, 0.35), [0.06, 0.8, 0.14], [s * 0.42, 0, 0.07]);
  }
  const at = (i: number, j: number): V3 => [-0.24 + i * 0.24, 0.2 - j * 0.2, 0.1];
  const cell = (i: number, j: number) => {
    const p = at(i, j);
    const holder = new THREE.Group();
    holder.position.set(p[0], p[1], p[2]);
    g.add(holder);
    return holder;
  };
  // a wrapped sweet: a boiled sweet with twisted ends
  let c = cell(0, 0);
  addMesh(c, G.sphere(), wet(RED), [0.05, 0.04, 0.035], [0, 0, 0]);
  for (const s of [-1, 1]) addMesh(c, G.cone(), clear("#ffd9e8", 0.8), [0.03, 0.05, 0.02], [s * 0.07, 0, 0], [0, 0, (s * Math.PI) / 2], false);
  // a gumdrop
  c = cell(1, 0);
  addMesh(c, G.dome(), col(LIME, 0.6), [0.05, 0.06, 0.035], [0, -0.03, 0]);
  // a chocolate coin in gold foil
  c = cell(2, 0);
  addMesh(c, G.cylHi(), col("#e0b53a", 0.25), [0.05, 0.015, 0.05], [0, 0, 0], [Math.PI / 2, 0, 0]);
  addMesh(c, G.ring(), col("#c9a23c", 0.25), [0.038, 0.038, 0.1], [0, 0, 0.008], undefined, false);
  // a jelly bean
  c = cell(0, 1);
  addMesh(c, G.sphere(), wet(GRAPE), [0.065, 0.032, 0.03], [0, 0, 0], [0, 0, 0.4]);
  // a mini lollipop
  c = cell(1, 1);
  addMesh(c, G.box(), col(CREAM, 0.5), [0.012, 0.07, 0.01], [0, -0.04, 0]);
  addMesh(c, G.cylHi(), [col("#d8d0c0", 0.3), swirlMat("lolly-pink", SWIRL_PINK, 3), col("#d8d0c0", 0.3)], [0.045, 0.02, 0.045], [0, 0.02, 0], [Math.PI / 2, 0, 0]);
  // a liquorice allsort
  c = cell(2, 1);
  [PINK, LIQ, "#fdf6f0", LIQ].forEach((colr, k) => box(c, colr, [0.07, 0.017, 0.035], [0, -0.025 + k * 0.017, 0], undefined, true));
  // a heart gummy
  c = cell(0, 2);
  addMesh(c, G.heartSlab(), wet("#ff5fa2"), [0.045, 0.045, 0.025], [0, 0, -0.01], undefined, false);
  // a candy cane
  c = cell(1, 2);
  addMesh(c, G.cyl(), caneMat("#fdf6f0", RED, 3), [0.012, 0.1, 0.012], [0, -0.01, 0]);
  addMesh(c, G.hook(), caneMat("#fdf6f0", RED, 3), [0.028, 0.028, 0.028], [-0.028, 0.04, 0], undefined, false);
  // a gold sugar star, the rarest in the box
  c = cell(2, 2);
  addMesh(c, G.star(), glowMaterial("#ffd54a", 0.5, 0.3), [0.05, 0.05, 0.05], [0, 0, 0], undefined, false);
  return g;
}

// ---------------------------------------------------------------------------
// pet beds: 0.9 x 0.8

/** A candy bone, the one thing every pet bed in both parks agrees on. */
function candyBone(g: THREE.Group, x: number, y: number, z: number, rot: number) {
  const b = new THREE.Group();
  b.position.set(x, y, z);
  b.rotation.y = rot;
  g.add(b);
  const white = col("#fdf6f0", 0.4);
  addMesh(b, G.cylLo(), white, [0.022, 0.16, 0.022], [0, 0, 0], [0, 0, Math.PI / 2], false);
  for (const sx of [-0.08, 0.08]) for (const sz of [-0.022, 0.022]) addMesh(b, G.sphereLo(), white, [0.03, 0.03, 0.03], [sx, 0, sz], undefined, false);
  return b;
}

/** Neutral starter: a biscuit basket with chocolate chips and a jam cushion. */
function petbedBiscuit() {
  const g = new THREE.Group();
  addMesh(g, G.cyl(), col("#d9a95e", 0.8), [0.4, 0.09, 0.34], [0, 0.045, 0]);
  addMesh(g, G.torus(), col("#c98f47", 0.8), [0.35, 0.3, 0.35], [0, 0.15, 0], [Math.PI / 2, 0, 0]);
  const r = rng(223);
  for (let i = 0; i < 10; i++) {
    const a = r() * Math.PI * 2;
    const rr = 0.33 + r() * 0.05;
    addMesh(g, G.sphereLo(), col(CHOC, 0.45), [0.035, 0.03, 0.035], [Math.cos(a) * rr * 0.95, 0.19 + r() * 0.06, Math.sin(a) * rr * 0.82], undefined, false);
  }
  addMesh(g, G.cyl(), col("#e0677f", 0.75), [0.31, 0.1, 0.26], [0, 0.14, 0], undefined, false);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    box(g, CANDY[i % CANDY.length]!, [0.03, 0.01, 0.012], [Math.cos(a) * 0.12, 0.19, Math.sin(a) * 0.1], [0, a, 0]);
  }
  candyBone(g, 0.26, 0.05, 0.28, 0.5);
  return g;
}

/** Girls': a ring of marshmallows round a soft pink cushion. */
function petbedMarshmallow() {
  const g = new THREE.Group();
  addMesh(g, G.cyl(), col("#ffe3ef", 0.85), [0.36, 0.06, 0.3], [0, 0.03, 0]);
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    addMesh(g, G.cyl(), col(i % 2 ? MARSH : "#ffc2dc", 0.85), [0.085, 0.14, 0.085], [Math.cos(a) * 0.34, 0.1, Math.sin(a) * 0.28]);
  }
  addMesh(g, G.cyl(), col("#fff1f7", 0.8), [0.29, 0.09, 0.24], [0, 0.075, 0], undefined, false);
  addMesh(g, G.heart(), col("#ff5fa2", 0.55), [0.09, 0.09, 1], [0, 0.125, 0.02], [-Math.PI / 2, 0, 0.2], false);
  candyBone(g, 0.0, 0.13, -0.14, -0.3);
  return g;
}

/** Boys': a liquorice tyre off the race track with a cushion dropped in. */
function petbedTyre() {
  const g = new THREE.Group();
  addMesh(g, G.torus(), col(LIQ, 0.5), [0.33, 0.29, 0.33], [0, 0.16, 0], [Math.PI / 2, 0, 0]);
  // tread blocks, which is what tells a tyre from a doughnut at this size
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    box(g, "#453c50", [0.07, 0.05, 0.05], [Math.cos(a) * 0.405, 0.16, Math.sin(a) * 0.355], [0, -a, 0], true);
  }
  addMesh(g, G.cyl(), col("#3f3848", 0.6), [0.3, 0.05, 0.26], [0, 0.03, 0]);
  addMesh(g, G.cyl(), col(RED, 0.7), [0.28, 0.1, 0.24], [0, 0.1, 0], undefined, false);
  for (const s of [-1, 1]) box(g, "#c0343d", [0.24, 0.02, 0.04], [0, 0.15, s * 0.08]);
  candyBone(g, 0.02, 0.16, 0.0, 0.35);
  return g;
}

/** Neutral: a chocolate-glazed donut to curl up in, with a custard cushion in the hole. */
function petbedDonut() {
  const g = new THREE.Group();
  flatRing(g, col("#e0a060", 0.7), 0.44, 0.39, 0.2, 0.1);
  flatRing(g, wet(CHOC), 0.43, 0.38, 0.12, 0.15, false);
  addMesh(g, G.cylHi(), col("#ffe9a8", 0.85), [0.27, 0.1, 0.24], [0, 0.07, 0], undefined, false);
  const r = rng(353);
  for (let i = 0; i < 22; i++) {
    const a = r() * Math.PI * 2;
    const rr = 0.82 + r() * 0.12;
    box(g, CANDY[i % CANDY.length]!, [0.04, 0.01, 0.012], [Math.cos(a) * 0.35 * rr, 0.206, Math.sin(a) * 0.31 * rr], [0, r() * Math.PI, 0]);
  }
  candyBone(g, 0.05, 0.13, 0.04, -0.4);
  return g;
}

/** Girls': a paper cupcake case with a frosting rim and a cherry, the cushion inside iced pink. */
function petbedCupcake() {
  const g = new THREE.Group();
  addMesh(g, G.frustum(1, 0.82), caseMat("#8fe3c8", "#5fcfae"), [0.42, 0.22, 0.37], [0, 0.11, 0]);
  flatRing(g, col(ICING, 0.72), 0.44, 0.39, 0.1, 0.23);
  addMesh(g, G.cylHi(), col("#ffc2dc", 0.85), [0.33, 0.1, 0.28], [0, 0.17, 0], undefined, false);
  addMesh(g, G.heart(), col("#fff1f7", 0.6), [0.08, 0.08, 1], [0, 0.222, 0.03], [-Math.PI / 2, 0, 0], false);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    box(g, CANDY[i % CANDY.length]!, [0.04, 0.01, 0.012], [Math.cos(a) * 0.36, 0.28, Math.sin(a) * 0.32], [0, -a, 0]);
  }
  // the cherry sits on the back of the rim, out of the way of whoever is in it
  addMesh(g, G.sphere(), wet(RED), [0.05, 0.05, 0.05], [-0.2, 0.3, -0.28]);
  addMesh(g, G.cylLo(), col("#6fbf4a", 0.7), [0.008, 0.08, 0.008], [-0.2, 0.37, -0.28], [0.3, 0, 0], false);
  candyBone(g, 0.12, 0.23, 0.1, 0.6);
  return g;
}

/**
 * Prize: a velvet jelly cushion fit for a pet princess, gold tassels at the
 * corners and a sugar crown left on the back of it.
 */
function petbedRoyal() {
  const g = new THREE.Group();
  const gold = col("#e8b83a", 0.3);
  for (const x of [-0.34, 0.34]) for (const z of [-0.28, 0.28]) addMesh(g, G.sphereLo(), gold, [0.05, 0.04, 0.05], [x, 0.04, z]);
  bev(g, col("#c8304a", 0.9), [0.82, 0.14, 0.72], [0, 0.13, 0]);
  // the dip in the middle where the pet has been sitting
  addMesh(g, G.cylHi(), col("#b02840", 0.9), [0.26, 0.02, 0.22], [0, 0.2, 0], undefined, false);
  // piped gold edging along the top, and a tassel hanging off each corner
  for (const s of [-1, 1]) {
    box(g, gold, [0.8, 0.025, 0.025], [0, 0.2, s * 0.35]);
    box(g, gold, [0.025, 0.025, 0.7], [s * 0.4, 0.2, 0]);
  }
  for (const x of [-1, 1])
    for (const z of [-1, 1]) {
      addMesh(g, G.sphereLo(), gold, [0.03, 0.03, 0.03], [x * 0.41, 0.2, z * 0.355], undefined, false);
      addMesh(g, G.cone(), gold, [0.025, 0.08, 0.025], [x * 0.42, 0.14, z * 0.37], [Math.PI, 0, 0], false);
    }
  // the crown: a gold ring with sugar points and gumdrop jewels
  const crown = new THREE.Group();
  crown.position.set(-0.26, 0.19, -0.2);
  crown.rotation.set(0.15, 0.5, 0.1);
  g.add(crown);
  addMesh(crown, G.cyl(), gold, [0.08, 0.06, 0.08], [0, 0.03, 0]);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    addMesh(crown, G.cone(), gold, [0.022, 0.06, 0.022], [Math.cos(a) * 0.07, 0.09, Math.sin(a) * 0.07], undefined, false);
    addMesh(crown, G.sphereLo(), wet(CANDY[i]!), [0.015, 0.015, 0.015], [Math.cos(a) * 0.082, 0.03, Math.sin(a) * 0.082], undefined, false);
  }
  return g;
}

const BUILDERS: Record<string, () => THREE.Group> = {
  candy_bed_marshmallow: bedMarshmallow,
  candy_bed_gumdrop: bedGumdrop,
  candy_bed_racer: bedRacer,
  candy_rug_peppermint: rugPeppermint,
  candy_rug_swirl: rugSwirl,
  candy_rug_tracks: rugTracks,
  candy_rug_jellybean: rugJellybean,
  candy_curtains_awning: curtainsAwning,
  candy_curtains_lace: curtainsLace,
  candy_curtains_flags: curtainsFlags,
  candy_lamp_gumball: lampGumball,
  candy_lamp_lollipop: lampLollipop,
  candy_lamp_rocket: lampRocket,
  candy_lamp_candle: lampCandle,
  candy_plant_lollitree: plantLollitree,
  candy_plant_cupcake: plantCupcake,
  candy_plant_cactus: plantCactus,
  candy_table_liquorice: tableLiquorice,
  candy_table_cupcake: tableCupcake,
  candy_table_crate: tableCrate,
  candy_picture_lollipop: pictureLollipop,
  candy_picture_princess: picturePrincess,
  candy_picture_truck: pictureTruck,
  candy_petbed_biscuit: petbedBiscuit,
  candy_petbed_marshmallow: petbedMarshmallow,
  candy_petbed_tyre: petbedTyre,

  candy_bed_cupcake: bedCupcake,
  candy_bed_train: bedTrain,
  candy_bed_cloud: bedCloud,
  candy_rug_gumdrop: rugGumdrop,
  candy_rug_checkers: rugCheckers,
  candy_rug_heart: rugHeart,
  candy_curtains_rainbow: curtainsRainbow,
  candy_curtains_space: curtainsSpace,
  candy_curtains_beads: curtainsBeads,
  candy_lamp_star: lampStar,
  candy_lamp_traffic: lampTraffic,
  candy_lamp_jellyfish: lampJellyfish,
  candy_plant_sunflower: plantSunflower,
  candy_plant_flytrap: plantFlytrap,
  candy_plant_cottontree: plantCottonTree,
  candy_table_donut: tableDonut,
  candy_table_race: tableRace,
  candy_table_macaron: tableMacaron,
  candy_picture_unicorn: pictureUnicorn,
  candy_picture_dino: pictureDino,
  candy_picture_sweets: pictureSweets,
  candy_petbed_donut: petbedDonut,
  candy_petbed_cupcake: petbedCupcake,
  candy_petbed_royal: petbedRoyal,
};

/**
 * Build one candy piece in its spot's local frame (origin = the spot anchor on
 * the floor or wall, facing +z into the room). Wallpaper, floor and unknown ids
 * return an empty group. Geometry and materials are shared: remove the group,
 * never dispose its contents.
 */
export function makeCandyFurniture(id: CandyFurnitureId): THREE.Group {
  const build = BUILDERS[id];
  const g = build ? build() : new THREE.Group();
  g.name = `candy-furniture:${id}`;
  g.userData.furniture = id;
  return g;
}
