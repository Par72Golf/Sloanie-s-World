import * as THREE from "three";
import { beveledBox } from "./beveled";
import { lam } from "./meshes";

/**
 * Sloan's clubhouse furniture: the catalogue and a mesh builder for every piece.
 *
 * The room (home-mesh.ts) has fixed decoration spots. Each spot has a small set
 * of pieces she owns or can buy, and she cycles through them. The look is a
 * cosy cabin: warm wood, bright primary and nature colours, outdoors, space and
 * animal themes. Everything is primitives plus a few canvas textures.
 *
 * Frames. Every piece is built in its spot's local frame, facing +z into the
 * room:
 *   - floor pieces (bed, rug, lamp, plant, table, petbed): origin is the centre
 *     of the footprint on the floor. The footprint (SOLID below) is the same
 *     for every option at a spot, so the room's colliders do not depend on
 *     which one is out, except the pet bed's height (see furnitureSolid).
 *   - wall pieces (curtains, picture): origin is the item's centre on the wall
 *     surface; everything sits at z 0..0.3 in front of it.
 *   - wallpaper and floor are not meshes: surfaceMaterial(id) is applied to
 *     the room's walls or floor, and makeFurniture returns an empty group.
 *
 * Nothing here allocates per call except Object3D wrappers: geometries,
 * materials and canvas textures are cached, so swapping furniture never needs
 * a dispose. Without a DOM (headless tools) canvas textures are skipped and the
 * materials fall back to a plain colour.
 */

export type SpotId = "bed" | "rug" | "wallpaper" | "floor" | "curtains" | "lamp" | "plant" | "table" | "picture" | "petbed";
export type FurnitureId = string;
export type FurnitureDef = {
  id: FurnitureId;
  name: string;
  spot: SpotId;
  /**
   * how she gets it: "starter" (owned from the start), "shop" (tickets), a
   * reward key, or "prize" (won from a gumball machine; only the candy house
   * has any)
   */
  source: "starter" | "shop" | "crown" | "stickers30" | "pet" | "prize";
  price?: number;
};

export const SPOTS: { id: SpotId; name: string }[] = [
  { id: "bed", name: "Bed" },
  { id: "rug", name: "Rug" },
  { id: "wallpaper", name: "Wallpaper" },
  { id: "floor", name: "Floor" },
  { id: "curtains", name: "Curtains" },
  { id: "lamp", name: "Lamp" },
  { id: "plant", name: "Plant" },
  { id: "table", name: "Table" },
  { id: "picture", name: "Picture" },
  { id: "petbed", name: "Pet bed" },
];

export const FURNITURE: FurnitureDef[] = [
  { id: "bed_cabin", name: "Log cabin bed", spot: "bed", source: "starter" },
  { id: "bed_rocket", name: "Rocket ship bed", spot: "bed", source: "shop", price: 25 },
  { id: "bed_treehouse", name: "Treehouse bunk bed", spot: "bed", source: "shop", price: 20 },

  { id: "rug_braided", name: "Round braided rug", spot: "rug", source: "starter" },
  { id: "rug_map", name: "Treasure map rug", spot: "rug", source: "shop", price: 10 },
  { id: "rug_paws", name: "Paw print rug", spot: "rug", source: "shop", price: 8 },

  { id: "wall_cream", name: "Warm cream", spot: "wallpaper", source: "starter" },
  { id: "wall_wood", name: "Wood panels", spot: "wallpaper", source: "shop", price: 5 },
  { id: "wall_sky", name: "Sky and clouds", spot: "wallpaper", source: "shop", price: 6 },
  { id: "wall_leaves", name: "Forest leaves", spot: "wallpaper", source: "shop", price: 7 },
  { id: "wall_space", name: "Starry space", spot: "wallpaper", source: "shop", price: 8 },

  { id: "floor_honey", name: "Honey wood planks", spot: "floor", source: "starter" },
  { id: "floor_dark", name: "Dark wood", spot: "floor", source: "shop", price: 4 },
  { id: "floor_grass", name: "Grass green carpet", spot: "floor", source: "shop", price: 5 },
  { id: "floor_stone", name: "Stone tiles", spot: "floor", source: "shop", price: 6 },
  { id: "floor_check", name: "Blue checkerboard", spot: "floor", source: "shop", price: 8 },

  { id: "curtains_plaid", name: "Red plaid curtains", spot: "curtains", source: "starter" },
  { id: "curtains_forest", name: "Forest curtains", spot: "curtains", source: "shop", price: 10 },
  { id: "curtains_stars", name: "Starry night curtains", spot: "curtains", source: "shop", price: 12 },

  { id: "lamp_lantern", name: "Camping lantern", spot: "lamp", source: "starter" },
  { id: "lamp_lava", name: "Lava lamp", spot: "lamp", source: "shop", price: 12 },
  { id: "lamp_mushroom", name: "Glowing mushroom lamp", spot: "lamp", source: "shop", price: 15 },

  { id: "plant_fern", name: "Potted fern", spot: "plant", source: "starter" },
  { id: "plant_cactus", name: "Cactus family", spot: "plant", source: "shop", price: 8 },
  { id: "plant_sunflower", name: "Sunflower pot", spot: "plant", source: "shop", price: 10 },

  { id: "table_craft", name: "Craft table", spot: "table", source: "starter" },
  { id: "table_picnic", name: "Picnic table", spot: "table", source: "shop", price: 15 },
  { id: "table_desk", name: "Desk with a globe", spot: "table", source: "shop", price: 18 },

  { id: "picture_dumpling", name: "Dumpling painting", spot: "picture", source: "starter" },
  { id: "picture_crown", name: "Golden crown trophy", spot: "picture", source: "crown" },
  { id: "picture_stickers", name: "Sticker collage poster", spot: "picture", source: "stickers30" },

  { id: "petbed_cushion", name: "Comfy cushion", spot: "petbed", source: "starter" },
  { id: "petbed_basket", name: "Cosy basket", spot: "petbed", source: "pet" },
  { id: "petbed_doghouse", name: "Little doghouse", spot: "petbed", source: "shop", price: 15 },
];

const BY_ID = new Map(FURNITURE.map((f) => [f.id, f]));

export function furnitureDef(id: FurnitureId): FurnitureDef | undefined {
  return BY_ID.get(id);
}

/** Every option for a spot, in catalogue order (starter first). */
export function furnitureFor(spot: SpotId): FurnitureDef[] {
  return FURNITURE.filter((f) => f.spot === spot);
}

/** The piece each spot starts with. */
export function starterFurniture(): Record<SpotId, FurnitureId> {
  const out = {} as Record<SpotId, FurnitureId>;
  for (const s of SPOTS) out[s.id] = furnitureFor(s.id).find((f) => f.source === "starter")!.id;
  return out;
}

/**
 * Solid footprint per floor spot in its local frame, centred on the anchor:
 * w along local x, d along local z, h = top of the solid. Every option at the
 * spot is built inside w x d. Tops are above the 0.62m step-up where a kid
 * would expect to bump (bed 0.70 at the quilt, table 0.72 at the top), and
 * the pet bed's top follows the piece so there is never an invisible ledge.
 */
const SOLID: Partial<Record<SpotId, { w: number; d: number; h: number }>> = {
  bed: { w: 2.1, d: 1.3, h: 0.7 },
  lamp: { w: 0.5, d: 0.5, h: 1.0 },
  plant: { w: 0.56, d: 0.56, h: 1.0 },
  table: { w: 1.2, d: 0.9, h: 0.72 },
  petbed: { w: 0.9, d: 0.8, h: 0.24 },
};
const SOLID_TOP: Record<string, number> = {
  petbed_cushion: 0.24,
  petbed_basket: 0.36,
  petbed_doghouse: 0.86,
};

/** The solid box of a piece in its spot's local frame, or null if it has none. */
export function furnitureSolid(id: FurnitureId): { w: number; d: number; h: number } | null {
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
  /** a frustum, radii normalised so the wider end is 1 */
  frustum: (top: number, bottom: number) =>
    cached(`fr|${top}|${bottom}`, () => new THREE.CylinderGeometry(top, bottom, 1, 16)),
  cone: () => cached("cone", () => new THREE.ConeGeometry(1, 1, 12)),
  torus: () => cached("torus", () => new THREE.TorusGeometry(1, 0.25, 8, 24)),
  ring: () => cached("ring", () => new THREE.TorusGeometry(1, 0.1, 6, 20)),
  arch: () => cached("arch", () => new THREE.TorusGeometry(1, 0.07, 6, 12, Math.PI)),
  star: () =>
    cached("star", () => {
      const s = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 0.45 : 1;
        const a = Math.PI / 2 + (i * Math.PI) / 5;
        if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      return new THREE.ShapeGeometry(s);
    }),
  gable: () =>
    cached("gable", () => {
      const s = new THREE.Shape();
      s.moveTo(-0.5, 0);
      s.lineTo(0.5, 0);
      s.lineTo(0, 1);
      return new THREE.ShapeGeometry(s);
    }),
};

const col = (c: string, roughness = 0.6) => lam(c, { flat: true, roughness });

const glowCache = new Map<string, THREE.MeshStandardMaterial>();
/** A self-lit plastic for lamps, gems and markers; bloom picks the bright ones up. */
export function glowMaterial(color: string, intensity = 1, roughness = 0.5) {
  const k = `${color}|${intensity}|${roughness}`;
  let m = glowCache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness, metalness: 0 });
    glowCache.set(k, m);
  }
  return m;
}

function add(
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

/** A beveled part at its true size (the Roblox edge); never scaled. */
function bev(parent: THREE.Object3D, mat: string | THREE.Material, s: V3, p: V3, r?: V3, shadow = true) {
  return add(parent, beveledBox(s[0], s[1], s[2]), typeof mat === "string" ? col(mat) : mat, [1, 1, 1], p, r, shadow);
}

/** A plain box scaled from the shared unit cube, for small and thin details. */
function box(parent: THREE.Object3D, mat: string | THREE.Material, s: V3, p: V3, r?: V3, shadow = false) {
  return add(parent, G.box(), typeof mat === "string" ? col(mat) : mat, s, p, r, shadow);
}

// ---------------------------------------------------------------------------
// canvas textures

export type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;

const texCache = new Map<string, THREE.CanvasTexture | null>();
function canvasTex(key: string, w: number, h: number, draw: Draw, wrap = false): THREE.CanvasTexture | null {
  if (texCache.has(key)) return texCache.get(key)!;
  let t: THREE.CanvasTexture | null = null;
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    if (g) {
      draw(g, w, h);
      t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    }
  }
  texCache.set(key, t);
  return t;
}

const texMatCache = new Map<string, THREE.Material>();
/** A material carrying a cached canvas texture, or the fallback colour headless. */
export function canvasMaterial(
  key: string,
  fallback: string,
  w: number,
  h: number,
  draw: Draw,
  opts: { roughness?: number; basic?: boolean; repeat?: [number, number] } = {},
): THREE.Material {
  let m = texMatCache.get(key);
  if (m) return m;
  const map = canvasTex(key, w, h, draw, !!opts.repeat);
  if (map && opts.repeat) map.repeat.set(opts.repeat[0], opts.repeat[1]);
  if (opts.basic) {
    // unlit, a touch under white so bloom leaves it alone
    m = new THREE.MeshBasicMaterial({ map, color: map ? "#e6e6e6" : fallback });
  } else {
    m = new THREE.MeshStandardMaterial({ map, color: map ? "#ffffff" : fallback, roughness: opts.roughness ?? 0.85, metalness: 0 });
  }
  texMatCache.set(key, m);
  return m;
}

function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Draw fn at (x, y) and at its wrapped copies, so tiles meet seamlessly. */
function wrapped(w: number, h: number, x: number, y: number, fn: (x: number, y: number) => void) {
  for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) fn(x + dx, y + dy);
}

function starPath(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, rot = 0) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = -Math.PI / 2 + rot + (i * Math.PI) / 5;
    const px = cx + Math.cos(a) * rr;
    const py = cy + Math.sin(a) * rr;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
}

function ellipse(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

function paw(g: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  ellipse(g, 0, s * 0.35, s * 0.55, s * 0.45);
  g.fill();
  for (const [tx, ty] of [
    [-0.62, -0.35],
    [-0.22, -0.72],
    [0.22, -0.72],
    [0.62, -0.35],
  ] as const) {
    ellipse(g, tx * s, ty * s, s * 0.2, s * 0.26);
    g.fill();
  }
  g.restore();
}

function dumplingArt(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.fillStyle = "#fbf1dc";
  g.strokeStyle = "#caa97a";
  g.lineWidth = s * 0.05;
  g.beginPath();
  g.moveTo(x - s, y + s * 0.35);
  g.quadraticCurveTo(x - s * 0.9, y - s * 0.75, x, y - s * 0.8);
  g.quadraticCurveTo(x + s * 0.9, y - s * 0.75, x + s, y + s * 0.35);
  g.quadraticCurveTo(x, y + s * 0.7, x - s, y + s * 0.35);
  g.fill();
  g.stroke();
  // pleats
  for (let i = -2; i <= 2; i++) {
    g.beginPath();
    g.moveTo(x + i * s * 0.22, y - s * 0.75);
    g.quadraticCurveTo(x + i * s * 0.28, y - s * 0.45, x + i * s * 0.2, y - s * 0.3);
    g.stroke();
  }
  g.fillStyle = "#2a2220";
  ellipse(g, x - s * 0.32, y, s * 0.07, s * 0.1);
  g.fill();
  ellipse(g, x + s * 0.32, y, s * 0.07, s * 0.1);
  g.fill();
  g.fillStyle = "#f2a48c";
  ellipse(g, x - s * 0.55, y + s * 0.15, s * 0.12, s * 0.07);
  g.fill();
  ellipse(g, x + s * 0.55, y + s * 0.15, s * 0.12, s * 0.07);
  g.fill();
  g.strokeStyle = "#2a2220";
  g.lineWidth = s * 0.045;
  g.beginPath();
  g.arc(x, y + s * 0.08, s * 0.14, 0.15 * Math.PI, 0.85 * Math.PI);
  g.stroke();
}

function plaid(base: string, band: string, line: string, period: number): Draw {
  return (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    g.globalAlpha = 0.55;
    g.fillStyle = band;
    for (let p = 0; p < Math.max(w, h); p += period) {
      g.fillRect(p, 0, period * 0.38, h);
      g.fillRect(0, p, w, period * 0.38);
    }
    g.globalAlpha = 0.9;
    g.fillStyle = line;
    for (let p = period * 0.7; p < Math.max(w, h); p += period) {
      g.fillRect(p, 0, Math.max(2, period * 0.05), h);
      g.fillRect(0, p, w, Math.max(2, period * 0.05));
    }
    g.globalAlpha = 1;
  };
}

function starry(base: string, seed: number, moon: boolean): Draw {
  return (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const r = rng(seed);
    const unit = Math.min(w, h);
    for (let i = 0; i < (w * h) / 900; i++) {
      g.fillStyle = r() < 0.5 ? "#fff6d0" : "#cfe0ff";
      const x = r() * w;
      const y = r() * h;
      wrapped(w, h, x, y, (px, py) => {
        g.beginPath();
        g.arc(px, py, 1 + r() * 1.6, 0, Math.PI * 2);
        g.fill();
      });
    }
    const big = Math.max(3, Math.round((w * h) / 9000));
    for (let i = 0; i < big; i++) {
      const x = r() * w;
      const y = r() * h;
      const s = unit * (0.04 + r() * 0.04);
      const rot = r();
      g.fillStyle = "#ffd84a";
      wrapped(w, h, x, y, (px, py) => {
        starPath(g, px, py, s, rot);
        g.fill();
      });
    }
    if (moon) {
      const x = w * 0.5;
      const y = h * 0.2;
      const s = unit * 0.28;
      g.fillStyle = "#fff1b0";
      g.beginPath();
      g.arc(x, y, s, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = base;
      g.beginPath();
      g.arc(x + s * 0.45, y - s * 0.2, s * 0.85, 0, Math.PI * 2);
      g.fill();
    }
  };
}

function pines(base: string, seed: number): Draw {
  return (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const r = rng(seed);
    const s = w * 0.28;
    for (let row = 0; row * s * 1.6 < h; row++) {
      const x = (row % 2 ? 0.25 : 0.72) * w;
      const y = s * 1.1 + row * s * 1.6;
      g.fillStyle = "#6e4a2a";
      g.fillRect(x - s * 0.08, y, s * 0.16, s * 0.3);
      g.fillStyle = r() < 0.5 ? "#3f7a4a" : "#2f6a3e";
      for (let t = 0; t < 3; t++) {
        g.beginPath();
        g.moveTo(x - s * (0.55 - t * 0.12), y - t * s * 0.35);
        g.lineTo(x + s * (0.55 - t * 0.12), y - t * s * 0.35);
        g.lineTo(x, y - t * s * 0.35 - s * 0.55);
        g.fill();
      }
      // a toadstool between the trees
      const mx = (row % 2 ? 0.75 : 0.22) * w;
      const my = y + s * 0.05;
      g.fillStyle = "#fbf1dc";
      g.fillRect(mx - s * 0.05, my - s * 0.12, s * 0.1, s * 0.16);
      g.fillStyle = "#d8412f";
      g.beginPath();
      g.arc(mx, my - s * 0.12, s * 0.16, Math.PI, 0);
      g.fill();
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.arc(mx - s * 0.05, my - s * 0.19, s * 0.03, 0, Math.PI * 2);
      g.arc(mx + s * 0.06, my - s * 0.17, s * 0.025, 0, Math.PI * 2);
      g.fill();
    }
  };
}

const PLAID_RED = plaid("#b8322b", "#5e1a17", "#f0c75a", 72);
const PLAID_QUILT = plaid("#c23a2f", "#5e1a17", "#f3e2b8", 64);
const PLAID_GREEN = plaid("#3f7a4a", "#1f3f2a", "#e8c35a", 64);

// ---------------------------------------------------------------------------
// wallpaper and floor

type Surface = { fallback: string; tile: [number, number]; size: [number, number]; draw: Draw; roughness: number };

function planks(base: string, dark: string, light: string, seed: number): Draw {
  return (g, w, h) => {
    const r = rng(seed);
    const rows = 8;
    const rh = h / rows;
    for (let i = 0; i < rows; i++) {
      const y = i * rh;
      let x = -r() * w * 0.5;
      while (x < w) {
        const len = w * (0.35 + r() * 0.3);
        const shade = r();
        g.fillStyle = shade < 0.33 ? base : shade < 0.66 ? light : dark;
        g.globalAlpha = 1;
        // draw wrapped so the tile meets itself
        for (const dx of [0, w]) {
          g.fillStyle = shade < 0.33 ? base : shade < 0.66 ? light : dark;
          g.fillRect(x - dx, y, len, rh);
          g.globalAlpha = 0.18;
          g.fillStyle = "#3a2412";
          for (let k = 0; k < 3; k++) g.fillRect(x - dx, y + rh * (0.25 + k * 0.25), len, 1.5);
          g.globalAlpha = 0.5;
          g.fillRect(x - dx, y, 3, rh);
          g.globalAlpha = 1;
        }
        x += len;
      }
      g.globalAlpha = 0.55;
      g.fillStyle = "#3a2412";
      g.fillRect(0, y, w, 2.5);
      g.globalAlpha = 1;
    }
  };
}

const SURFACES: Record<string, Surface> = {
  wall_cream: {
    fallback: "#f4e6ca",
    tile: [0.5, 0.5],
    size: [128, 128],
    roughness: 0.9,
    draw: (g, w, h) => {
      g.fillStyle = "#f6e9cf";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#e2c99a";
      for (const [x, y] of [
        [0.25, 0.25],
        [0.75, 0.75],
      ]) {
        g.beginPath();
        g.arc(x! * w, y! * h, w * 0.035, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = "#9cbf8a";
      for (const [x, y] of [
        [0.75, 0.25],
        [0.25, 0.75],
      ]) {
        ellipse(g, x! * w - 3, y! * h, w * 0.045, w * 0.022, -0.6);
        g.fill();
        ellipse(g, x! * w + 3, y! * h, w * 0.045, w * 0.022, 0.6);
        g.fill();
      }
    },
  },
  wall_wood: {
    fallback: "#c08a52",
    tile: [1.2, 1.2],
    size: [256, 256],
    roughness: 0.75,
    draw: (g, w, h) => {
      const r = rng(7);
      const n = 6;
      const bw = w / n;
      for (let i = 0; i < n; i++) {
        g.fillStyle = ["#c68d52", "#b97f47", "#cf9a5e"][i % 3]!;
        g.fillRect(i * bw, 0, bw, h);
        g.globalAlpha = 0.15;
        g.fillStyle = "#4a2c14";
        for (let k = 0; k < 4; k++) {
          const x = i * bw + bw * (0.15 + r() * 0.7);
          g.fillRect(x, 0, 1.5, h);
        }
        g.globalAlpha = 1;
        if (r() < 0.6) {
          g.fillStyle = "#8a5a32";
          ellipse(g, i * bw + bw * (0.3 + r() * 0.4), r() * h, bw * 0.08, bw * 0.14);
          g.fill();
        }
        g.fillStyle = "#6b4222";
        g.fillRect(i * bw, 0, 3, h);
      }
    },
  },
  wall_sky: {
    fallback: "#9fd3f0",
    tile: [3.4, 3.4],
    size: [512, 512],
    roughness: 0.9,
    draw: (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#6fb8ea");
      grad.addColorStop(1, "#cfeaf8");
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      const r = rng(11);
      g.fillStyle = "#ffffff";
      for (let i = 0; i < 5; i++) {
        const x = (i / 5) * w + r() * 40;
        const y = h * (0.12 + r() * 0.55);
        const s = w * (0.05 + r() * 0.03);
        for (const dx of [-w, 0, w]) {
          g.beginPath();
          g.arc(x + dx - s, y, s * 0.8, 0, Math.PI * 2);
          g.arc(x + dx, y - s * 0.5, s, 0, Math.PI * 2);
          g.arc(x + dx + s, y, s * 0.85, 0, Math.PI * 2);
          g.fill();
          g.fillRect(x + dx - s, y, s * 2, s * 0.8);
        }
      }
    },
  },
  wall_leaves: {
    fallback: "#cfe3bd",
    tile: [1, 1],
    size: [256, 256],
    roughness: 0.9,
    draw: (g, w, h) => {
      g.fillStyle = "#d6e8c4";
      g.fillRect(0, 0, w, h);
      const r = rng(23);
      for (let i = 0; i < 16; i++) {
        const x = r() * w;
        const y = r() * h;
        const rot = r() * Math.PI * 2;
        const c = ["#6aa35a", "#4f8a4a", "#8bbd6a", "#d9923a"][Math.floor(r() * 4)]!;
        wrapped(w, h, x, y, (px, py) => {
          g.fillStyle = c;
          ellipse(g, px, py, w * 0.05, w * 0.022, rot);
          g.fill();
          g.strokeStyle = "#35603a";
          g.lineWidth = 1.2;
          g.beginPath();
          g.moveTo(px - Math.cos(rot) * w * 0.05, py - Math.sin(rot) * w * 0.05);
          g.lineTo(px + Math.cos(rot) * w * 0.05, py + Math.sin(rot) * w * 0.05);
          g.stroke();
        });
      }
    },
  },
  wall_space: {
    fallback: "#1f2d57",
    tile: [1.7, 1.7],
    size: [256, 256],
    roughness: 0.9,
    draw: (g, w, h) => {
      starry("#1f2d57", 31, false)(g, w, h);
      // a ringed planet
      const x = w * 0.7;
      const y = h * 0.65;
      g.fillStyle = "#f08a3c";
      g.beginPath();
      g.arc(x, y, w * 0.09, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#ffd27a";
      g.lineWidth = w * 0.02;
      ellipse(g, x, y, w * 0.16, w * 0.04, -0.3);
      g.stroke();
      g.fillStyle = "#7fc8a0";
      g.beginPath();
      g.arc(w * 0.22, h * 0.3, w * 0.05, 0, Math.PI * 2);
      g.fill();
    },
  },
  floor_honey: {
    fallback: "#d59d5a",
    tile: [2, 2],
    size: [512, 512],
    roughness: 0.62,
    draw: planks("#d9a15c", "#c48a48", "#e3b273", 3),
  },
  floor_dark: {
    fallback: "#7a4f2e",
    tile: [2, 2],
    size: [512, 512],
    roughness: 0.6,
    draw: planks("#7c5130", "#6a4326", "#8c5f3a", 5),
  },
  floor_grass: {
    fallback: "#6cb86a",
    tile: [1, 1],
    size: [128, 128],
    roughness: 1,
    draw: (g, w, h) => {
      g.fillStyle = "#6cb86a";
      g.fillRect(0, 0, w, h);
      const r = rng(41);
      for (let i = 0; i < 700; i++) {
        g.fillStyle = r() < 0.5 ? "#5aa45a" : "#80c77a";
        g.fillRect(Math.floor(r() * w), Math.floor(r() * h), 2, 2);
      }
    },
  },
  floor_stone: {
    fallback: "#cfc5b4",
    tile: [1.2, 1.2],
    size: [256, 256],
    roughness: 0.85,
    draw: (g, w, h) => {
      g.fillStyle = "#a89d8a";
      g.fillRect(0, 0, w, h);
      const shades = ["#d9d0c0", "#cbc0ad", "#e3dccd", "#c4b9a6"];
      const gap = 5;
      const cell = w / 2;
      let k = 0;
      for (let i = 0; i < 2; i++)
        for (let j = 0; j < 2; j++) {
          g.fillStyle = shades[k++ % 4]!;
          const x = i * cell + gap;
          const y = j * cell + gap + (i % 2 ? cell * 0.5 : 0);
          for (const dy of [0, -h]) {
            g.beginPath();
            g.roundRect(x, y + dy, cell - gap * 2, cell - gap * 2, 14);
            g.fill();
          }
        }
    },
  },
  floor_check: {
    fallback: "#8fb0dc",
    tile: [1, 1],
    size: [128, 128],
    roughness: 0.55,
    draw: (g, w, h) => {
      g.fillStyle = "#f4f1e8";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#4a7fc1";
      g.fillRect(0, 0, w / 2, h / 2);
      g.fillRect(w / 2, h / 2, w / 2, h / 2);
    },
  },
};

/**
 * The material for a wallpaper or floor id. The room's wall and floor
 * geometry carries UVs in metres, so each surface's tile size is its texture
 * repeat. Cached per id.
 */
export function surfaceMaterial(id: FurnitureId): THREE.Material {
  const key = SURFACES[id] ? id : BY_ID.get(id)?.spot === "floor" ? "floor_honey" : "wall_cream";
  const s = SURFACES[key]!;
  return canvasMaterial(`surface|${key}`, s.fallback, s.size[0], s.size[1], s.draw, {
    roughness: s.roughness,
    repeat: [1 / s.tile[0], 1 / s.tile[1]],
  });
}

// ---------------------------------------------------------------------------
// beds: 2.1 x 1.3, headboard at local -x, quilt top at 0.70

const QUILT_TOP = 0.7;

function pillow(g: THREE.Group, x: number, y: number, color = "#fbf6ea") {
  bev(g, color, [0.36, 0.14, 0.78], [x, y, 0], [0, 0, 0.12]);
}

function bedCabin() {
  const g = new THREE.Group();
  const log = col("#a0673a", 0.8);
  const end = col("#dcb47c", 0.7);
  // corner posts, taller at the head, with pale end-grain caps
  for (const [x, h] of [
    [-0.94, 1.25],
    [0.94, 0.95],
  ] as const) {
    for (const z of [-0.54, 0.54]) {
      add(g, G.cyl(), log, [0.1, h, 0.1], [x, h / 2, z]);
      add(g, G.cyl(), end, [0.085, 0.02, 0.085], [x, h + 0.01, z], undefined, false);
    }
  }
  // side rails
  for (const z of [-0.54, 0.54]) add(g, G.cyl(), log, [0.1, 1.8, 0.1], [0, 0.3, z], [0, 0, Math.PI / 2]);
  // log headboard and footboard
  for (const y of [0.55, 0.78, 1.01]) add(g, G.cyl(), log, [0.1, 1.0, 0.1], [-0.94, y, 0], [Math.PI / 2, 0, 0]);
  for (const y of [0.5, 0.72]) add(g, G.cyl(), log, [0.1, 1.0, 0.1], [0.94, y, 0], [Math.PI / 2, 0, 0]);
  bev(g, "#f4ecd8", [1.76, 0.2, 1.1], [0, 0.5, 0]);
  const quilt = canvasMaterial("quilt-plaid", "#c23a2f", 256, 256, PLAID_QUILT, { roughness: 0.9 });
  bev(g, quilt, [1.3, 0.1, 1.16], [0.2, QUILT_TOP - 0.05, 0]);
  bev(g, "#e8b04a", [0.24, 0.11, 1.17], [0.72, QUILT_TOP - 0.05, 0], undefined, false);
  pillow(g, -0.64, 0.66);
  return g;
}

function bedRocket() {
  const g = new THREE.Group();
  const hull = "#eef1f5";
  const red = "#d8412f";
  // hull, nose cone pointing into the room end, red band
  bev(g, hull, [1.5, 0.52, 1.2], [-0.25, 0.36, 0]);
  add(g, G.cone(), col(red, 0.45), [0.32, 0.55, 0.6], [0.775, 0.36, 0], [0, 0, -Math.PI / 2]);
  box(g, red, [0.14, 0.54, 1.22], [0.2, 0.36, 0]);
  // stubby thruster feet
  for (const x of [-0.85, 0.35]) for (const z of [-0.45, 0.45]) add(g, G.cylLo(), col("#5a6470", 0.4), [0.08, 0.1, 0.08], [x, 0.05, z], undefined, false);
  // mattress and a starry quilt
  bev(g, "#f4ecd8", [1.4, 0.1, 1.08], [-0.25, 0.65, 0]);
  const quilt = canvasMaterial("quilt-stars", "#243b6b", 256, 256, starry("#2a4a86", 5, false), { roughness: 0.9 });
  bev(g, quilt, [1.0, 0.08, 1.12], [0.0, QUILT_TOP - 0.04, 0]);
  pillow(g, -0.72, 0.74, "#ffd84a");
  // tall tail at the head end with fins
  bev(g, red, [0.16, 1.3, 1.2], [-0.97, 0.65, 0]);
  for (const z of [-0.6, 0.6]) box(g, "#3a6fb0", [0.46, 0.66, 0.05], [-0.72, 0.92, z], [0, 0, 0.35], true);
  add(g, G.star(), glowMaterial("#ffd84a", 0.35), [0.16, 0.16, 1], [-0.885, 1.02, 0], [0, Math.PI / 2, 0], false);
  // portholes on the side facing the room
  for (const x of [-0.55, -0.05]) {
    add(g, G.cyl(), col("#b8c0c8", 0.35), [0.15, 0.03, 0.15], [x, 0.36, 0.605], [Math.PI / 2, 0, 0], false);
    add(g, G.cyl(), glowMaterial("#7fc8f0", 0.25, 0.2), [0.11, 0.03, 0.11], [x, 0.36, 0.625], [Math.PI / 2, 0, 0], false);
  }
  return g;
}

function bedTreehouse() {
  const g = new THREE.Group();
  const wood = "#8a5a32";
  for (const x of [-0.98, 0.98]) for (const z of [-0.58, 0.58]) bev(g, wood, [0.14, 2.24, 0.14], [x, 1.12, z]);
  const forest = canvasMaterial("quilt-forest", "#3f7a4a", 256, 256, PLAID_GREEN, { roughness: 0.9 });
  // lower bunk
  bev(g, "#b07a45", [1.96, 0.2, 1.1], [0, 0.35, 0]);
  bev(g, "#f4ecd8", [1.82, 0.16, 1.04], [0, 0.53, 0]);
  bev(g, forest, [1.3, 0.09, 1.08], [0.24, QUILT_TOP - 0.045, 0]);
  pillow(g, -0.62, 0.68);
  // upper bunk with rails
  bev(g, "#b07a45", [1.96, 0.2, 1.1], [0, 1.45, 0]);
  bev(g, "#f4ecd8", [1.82, 0.14, 1.04], [0, 1.62, 0]);
  bev(g, canvasMaterial("quilt-plaid", "#c23a2f", 256, 256, PLAID_QUILT, { roughness: 0.9 }), [1.3, 0.08, 1.08], [0.24, 1.73, 0]);
  pillow(g, -0.62, 1.76);
  box(g, wood, [1.82, 0.09, 0.07], [0, 2.0, -0.58], undefined, true);
  box(g, wood, [1.3, 0.09, 0.07], [-0.26, 2.0, 0.58], undefined, true);
  // ladder at the foot end
  for (const x of [0.5, 0.86]) box(g, "#c89660", [0.07, 1.9, 0.06], [x, 0.95, 0.61], undefined, true);
  for (const y of [0.35, 0.75, 1.15, 1.55]) box(g, "#c89660", [0.36, 0.06, 0.06], [0.68, y, 0.61]);
  // leafy gable roof and a few leaf clumps on the ridge
  const leaf = col("#5a9a4a", 0.8);
  for (const s of [-1, 1]) {
    const p = add(g, beveledBox(2.2, 0.08, 0.78), leaf, [1, 1, 1], [0, 2.43, s * 0.31], [s * 0.6, 0, 0]);
    p.castShadow = true;
  }
  for (const x of [-0.7, 0.05, 0.75]) add(g, G.sphereLo(), col(x > 0 ? "#6aae5c" : "#4f8a4a", 0.85), [0.26, 0.2, 0.24], [x, 2.66, 0]);
  return g;
}

// ---------------------------------------------------------------------------
// rugs: flat, centred, top at 0.02

function rugBraided() {
  const g = new THREE.Group();
  const top = canvasMaterial("rug-braided", "#c9794a", 512, 512, (c, w, h) => {
    const colors = ["#b5543a", "#e0a84a", "#3f7f7a", "#efe3c8", "#5f8a4a"];
    const rings = 11;
    for (let i = rings; i > 0; i--) {
      c.fillStyle = colors[i % colors.length]!;
      c.beginPath();
      c.arc(w / 2, h / 2, (i / rings) * (w / 2), 0, Math.PI * 2);
      c.fill();
      // braid ticks
      c.strokeStyle = "rgba(40,20,10,0.25)";
      c.lineWidth = 2;
      const rr = ((i - 0.5) / rings) * (w / 2);
      const n = Math.max(8, Math.round(rr / 5));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        c.beginPath();
        c.moveTo(w / 2 + Math.cos(a) * (rr - 6), h / 2 + Math.sin(a) * (rr - 6));
        c.lineTo(w / 2 + Math.cos(a + 0.08) * (rr + 6), h / 2 + Math.sin(a + 0.08) * (rr + 6));
        c.stroke();
      }
    }
  });
  add(g, G.cylHi(), [col("#8a4a2e"), top, col("#8a4a2e")], [1.2, 0.02, 1.2], [0, 0.01, 0], undefined, false);
  return g;
}

function rugMap() {
  const g = new THREE.Group();
  const top = canvasMaterial("rug-map", "#e6d2a0", 512, 336, (c, w, h) => {
    c.fillStyle = "#7cc0d8";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#e9d6a4";
    c.beginPath();
    c.moveTo(w * 0.12, h * 0.3);
    c.bezierCurveTo(w * 0.2, h * 0.05, w * 0.55, h * 0.1, w * 0.62, h * 0.25);
    c.bezierCurveTo(w * 0.8, h * 0.2, w * 0.92, h * 0.5, w * 0.8, h * 0.75);
    c.bezierCurveTo(w * 0.6, h * 0.95, w * 0.3, h * 0.9, w * 0.18, h * 0.72);
    c.bezierCurveTo(w * 0.05, h * 0.6, w * 0.06, h * 0.45, w * 0.12, h * 0.3);
    c.fill();
    c.fillStyle = "#e9d6a4";
    ellipse(c, w * 0.9, h * 0.15, w * 0.05, h * 0.06);
    c.fill();
    // hills and palms
    c.fillStyle = "#7aa35a";
    for (const [x, y] of [
      [0.3, 0.35],
      [0.38, 0.3],
      [0.7, 0.6],
    ]) {
      c.beginPath();
      c.moveTo(x! * w - 28, y! * h + 18);
      c.lineTo(x! * w, y! * h - 22);
      c.lineTo(x! * w + 28, y! * h + 18);
      c.fill();
    }
    c.fillStyle = "#8a5a32";
    c.fillRect(w * 0.55, h * 0.45, 5, 30);
    c.fillStyle = "#4f8a4a";
    for (let k = 0; k < 5; k++) {
      ellipse(c, w * 0.55 + 2 + Math.cos(k * 1.25) * 14, h * 0.45 + Math.sin(k * 1.25) * 6, 16, 5, k * 1.25);
      c.fill();
    }
    // dotted trail to the X
    c.strokeStyle = "#c0392b";
    c.lineWidth = 5;
    c.setLineDash([10, 9]);
    c.beginPath();
    c.moveTo(w * 0.2, h * 0.62);
    c.bezierCurveTo(w * 0.35, h * 0.8, w * 0.45, h * 0.4, w * 0.62, h * 0.55);
    c.bezierCurveTo(w * 0.7, h * 0.62, w * 0.72, h * 0.72, w * 0.66, h * 0.78);
    c.stroke();
    c.setLineDash([]);
    c.lineWidth = 9;
    c.beginPath();
    c.moveTo(w * 0.63, h * 0.73);
    c.lineTo(w * 0.7, h * 0.84);
    c.moveTo(w * 0.7, h * 0.73);
    c.lineTo(w * 0.63, h * 0.84);
    c.stroke();
    // compass
    c.fillStyle = "#fbf1dc";
    c.beginPath();
    c.arc(w * 0.1, h * 0.84, 26, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#c0392b";
    starPath(c, w * 0.1, h * 0.84, 22);
    c.fill();
    c.strokeStyle = "#6b4222";
    c.lineWidth = 8;
    c.strokeRect(4, 4, w - 8, h - 8);
  });
  add(g, G.box(), [col("#6b4222"), col("#6b4222"), top, col("#6b4222"), col("#6b4222"), col("#6b4222")], [2.6, 0.02, 1.7], [0, 0.01, 0], undefined, false);
  return g;
}

function rugPaws() {
  const g = new THREE.Group();
  const top = canvasMaterial("rug-paws", "#8fb98a", 512, 512, (c, w, h) => {
    c.fillStyle = "#5f8a4a";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#8fb98a";
    c.beginPath();
    c.arc(w / 2, h / 2, w * 0.46, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#f6ecd6";
    const trail = 9;
    for (let i = 0; i < trail; i++) {
      const t = i / (trail - 1);
      const a = t * Math.PI * 1.5 + 0.3;
      const rr = w * (0.12 + t * 0.25);
      const x = w / 2 + Math.cos(a) * rr + (i % 2 ? 10 : -10);
      const y = h / 2 + Math.sin(a) * rr;
      paw(c, x, y, 22, a + Math.PI);
    }
  });
  add(g, G.cylHi(), [col("#5f8a4a"), top, col("#5f8a4a")], [1.25, 0.02, 0.95], [0, 0.01, 0], undefined, false);
  return g;
}

// ---------------------------------------------------------------------------
// curtains: origin at the window centre on the wall (window 1.6 x 1.2)

function curtains(fabric: THREE.Material, tie: string, rod: string, finial: THREE.Material) {
  const g = new THREE.Group();
  add(g, G.cyl(), col(rod, 0.4), [0.03, 2.3, 0.03], [0, 0.8, 0.16], [0, 0, Math.PI / 2], false);
  for (const s of [-1, 1]) {
    add(g, G.sphere(), finial, [0.06, 0.06, 0.06], [s * 1.18, 0.8, 0.16], undefined, false);
    box(g, rod, [0.04, 0.1, 0.16], [s * 1.0, 0.8, 0.08]);
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

function curtainsPlaid() {
  return curtains(canvasMaterial("curtain-plaid", "#b8322b", CURTAIN_W, CURTAIN_H, PLAID_RED), "#5e1a17", "#8a5a32", col("#8a5a32", 0.5));
}
function curtainsStars() {
  return curtains(
    canvasMaterial("curtain-stars", "#243b6b", CURTAIN_W, CURTAIN_H, starry("#243b6b", 17, true)),
    "#f0c44a",
    "#c9a45a",
    glowMaterial("#ffd84a", 0.4),
  );
}
function curtainsForest() {
  return curtains(canvasMaterial("curtain-forest", "#f3ead3", CURTAIN_W, CURTAIN_H, pines("#f3ead3", 29)), "#3f7a4a", "#8a5a32", col("#6aae5c", 0.6));
}

// ---------------------------------------------------------------------------
// lamps: 0.5 footprint, glowing parts are emissive (no real lights)

function lampLantern() {
  const g = new THREE.Group();
  add(g, G.cyl(), col("#7a5230", 0.9), [0.24, 0.5, 0.24], [0, 0.25, 0]);
  add(g, G.cyl(), col("#dcb47c", 0.7), [0.215, 0.02, 0.215], [0, 0.505, 0], undefined, false);
  const metal = col("#2f5d3a", 0.45);
  bev(g, metal, [0.26, 0.06, 0.26], [0, 0.545, 0]);
  add(g, G.cyl(), glowMaterial("#ffd27a", 1.1, 0.3), [0.1, 0.26, 0.1], [0, 0.705, 0], undefined, false);
  for (const [x, z] of [
    [-0.1, -0.1],
    [0.1, -0.1],
    [-0.1, 0.1],
    [0.1, 0.1],
  ] as const) box(g, metal, [0.03, 0.28, 0.03], [x, 0.71, z]);
  add(g, G.cone(), metal, [0.17, 0.12, 0.17], [0, 0.9, 0]);
  add(g, G.arch(), col("#5a6470", 0.35), [0.08, 0.08, 0.08], [0, 0.96, 0], undefined, false);
  return g;
}

function lampMushroom() {
  const g = new THREE.Group();
  add(g, G.cyl(), col("#6aae5c", 0.9), [0.24, 0.05, 0.24], [0, 0.025, 0]);
  add(g, G.frustum(0.7, 1), glowMaterial("#f5ecd6", 0.25, 0.6), [0.17, 0.66, 0.17], [0, 0.38, 0]);
  add(g, G.cyl(), glowMaterial("#fff3d6", 0.5), [0.36, 0.03, 0.36], [0, 0.715, 0], undefined, false);
  add(g, G.dome(), glowMaterial("#ff7a59", 0.55, 0.45), [0.38, 0.3, 0.38], [0, 0.72, 0]);
  const spot = glowMaterial("#fff8e6", 0.9);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const el = i % 2 ? 0.55 : 0.9;
    const x = Math.cos(a) * Math.cos(el) * 0.38;
    const z = Math.sin(a) * Math.cos(el) * 0.38;
    const y = 0.72 + Math.sin(el) * 0.3;
    add(g, G.sphereLo(), spot, [0.055, 0.03, 0.055], [x, y, z], [Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5], false);
  }
  add(g, G.sphereLo(), spot, [0.06, 0.03, 0.06], [0, 1.02, 0], undefined, false);
  return g;
}

function lampLava() {
  const g = new THREE.Group();
  const metal = col("#2e6f7a", 0.3);
  add(g, G.frustum(0.6, 1), metal, [0.2, 0.36, 0.2], [0, 0.18, 0]);
  add(g, G.frustum(1, 0.69), glowMaterial("#b04ad8", 0.6, 0.2), [0.16, 0.36, 0.16], [0, 0.54, 0], undefined, false);
  add(g, G.frustum(0.56, 1), glowMaterial("#b04ad8", 0.6, 0.2), [0.16, 0.3, 0.16], [0, 0.87, 0], undefined, false);
  add(g, G.frustum(0.55, 1), metal, [0.09, 0.14, 0.09], [0, 1.09, 0]);
  const blob = glowMaterial("#ff9a3c", 1.1, 0.3);
  for (const [x, y, z, s] of [
    [0.04, 0.48, 0.1, 0.07],
    [-0.08, 0.66, -0.05, 0.08],
    [0.07, 0.86, 0.03, 0.06],
    [-0.03, 0.95, 0.06, 0.045],
    [0.0, 0.4, -0.1, 0.06],
  ] as const) add(g, G.sphereLo(), blob, [s, s * 1.25, s], [x, y, z], undefined, false);
  return g;
}

// ---------------------------------------------------------------------------
// plants: pot within 0.56, leaves within 0.55 of the centre

function plantFern() {
  const g = new THREE.Group();
  const clay = col("#c8693e", 0.8);
  add(g, G.frustum(1, 0.72), clay, [0.25, 0.42, 0.25], [0, 0.21, 0]);
  add(g, G.cyl(), clay, [0.27, 0.08, 0.27], [0, 0.43, 0]);
  add(g, G.cyl(), col("#4a3322", 1), [0.24, 0.02, 0.24], [0, 0.47, 0], undefined, false);
  const leafA = col("#4f8a4a", 0.8);
  const leafB = col("#6aae5c", 0.8);
  const frond = (angle: number, tilt: number, len: number, mat: THREE.Material) => {
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.48, 0);
    pivot.rotation.set(0, angle, 0);
    const arm = new THREE.Group();
    arm.rotation.x = tilt;
    pivot.add(arm);
    add(arm, G.sphereLo(), mat, [0.085, 0.025, len / 2], [0, 0, len / 2]);
    g.add(pivot);
  };
  for (let i = 0; i < 8; i++) frond((i / 8) * Math.PI * 2, -0.75, 0.52, i % 2 ? leafA : leafB);
  for (let i = 0; i < 5; i++) frond((i / 5) * Math.PI * 2 + 0.3, -1.2, 0.42, leafB);
  return g;
}

function cactusFace(g: THREE.Group, x: number, y: number, z: number) {
  const ink = col("#1e1a16", 0.4);
  for (const s of [-1, 1]) add(g, G.sphereLo(), ink, [0.014, 0.018, 0.01], [x + s * 0.03, y, z], undefined, false);
  add(g, G.sphereLo(), col("#f2a48c"), [0.016, 0.01, 0.008], [x, y - 0.03, z], undefined, false);
}

function plantCactus() {
  const g = new THREE.Group();
  bev(g, "#3f8f9a", [0.56, 0.28, 0.4], [0, 0.14, 0]);
  box(g, "#4a3322", [0.5, 0.02, 0.34], [0, 0.285, 0]);
  const green = col("#5a9a4a", 0.7);
  const light = col("#7cbf5c", 0.7);
  // big one with an arm
  add(g, G.cyl(), green, [0.1, 0.5, 0.1], [0, 0.53, -0.02]);
  add(g, G.sphere(), green, [0.1, 0.1, 0.1], [0, 0.78, -0.02]);
  add(g, G.cyl(), green, [0.045, 0.16, 0.045], [0.14, 0.62, -0.02]);
  add(g, G.sphere(), green, [0.045, 0.045, 0.045], [0.14, 0.7, -0.02]);
  add(g, G.cyl(), green, [0.045, 0.1, 0.045], [0.09, 0.54, -0.02], [0, 0, Math.PI / 2]);
  cactusFace(g, 0, 0.62, 0.085);
  // medium
  add(g, G.cyl(), light, [0.075, 0.3, 0.075], [-0.18, 0.43, 0.02]);
  add(g, G.sphere(), light, [0.075, 0.075, 0.075], [-0.18, 0.58, 0.02]);
  cactusFace(g, -0.18, 0.47, 0.09);
  // little round one with a flower
  add(g, G.sphere(), light, [0.1, 0.09, 0.1], [0.17, 0.37, 0.05]);
  cactusFace(g, 0.17, 0.38, 0.145);
  const petal = col("#ff8a3d", 0.5);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    add(g, G.sphereLo(), petal, [0.03, 0.015, 0.03], [0.17 + Math.cos(a) * 0.03, 0.465, 0.05 + Math.sin(a) * 0.03], undefined, false);
  }
  add(g, G.sphereLo(), col("#ffd84a"), [0.018, 0.018, 0.018], [0.17, 0.47, 0.05], undefined, false);
  return g;
}

function sunflower(g: THREE.Group, x: number, z: number, h: number, lean: number) {
  const stem = col("#4f8a4a", 0.8);
  add(g, G.cylLo(), stem, [0.018, h, 0.018], [x - (Math.sin(lean) * h) / 2, 0.4 + (Math.cos(lean) * h) / 2, z], [0, 0, lean], false);
  const tipX = x - Math.sin(lean) * h;
  const tipY = 0.4 + Math.cos(lean) * h;
  add(g, G.sphereLo(), stem, [0.08, 0.015, 0.035], [x - Math.sin(lean) * h * 0.4 + 0.06, 0.4 + h * 0.4, z], [0, 0, -0.4], false);
  const head = new THREE.Group();
  head.position.set(tipX, tipY, z + 0.02);
  head.rotation.x = -0.25;
  g.add(head);
  add(head, G.cyl(), col("#6b4222", 0.9), [0.075, 0.04, 0.075], [0, 0, 0.02], [Math.PI / 2, 0, 0]);
  const petal = col("#ffc53d", 0.6);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    add(head, G.sphereLo(), petal, [0.035, 0.07, 0.012], [Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0.005], [0, 0, a - Math.PI / 2], false);
  }
}

function plantSunflower() {
  const g = new THREE.Group();
  add(g, G.frustum(1, 0.85), col("#3a6fb0", 0.5), [0.22, 0.4, 0.22], [0, 0.2, 0]);
  add(g, G.cyl(), col("#f4f1e8", 0.5), [0.225, 0.06, 0.225], [0, 0.3, 0], undefined, false);
  add(g, G.cyl(), col("#4a3322", 1), [0.2, 0.02, 0.2], [0, 0.4, 0], undefined, false);
  sunflower(g, 0, -0.03, 0.85, 0);
  sunflower(g, -0.08, 0.06, 0.62, 0.22);
  sunflower(g, 0.09, 0.05, 0.5, -0.3);
  return g;
}

// ---------------------------------------------------------------------------
// tables: 1.2 x 0.9, top at 0.72

function tableCraft() {
  const g = new THREE.Group();
  bev(g, "#dcb47c", [1.2, 0.08, 0.9], [0, 0.68, 0]);
  const legs = ["#d8412f", "#3a6fb0", "#f0c44a", "#4f8a4a"];
  let k = 0;
  for (const x of [-0.52, 0.52]) for (const z of [-0.37, 0.37]) bev(g, legs[k++]!, [0.1, 0.64, 0.1], [x, 0.32, z]);
  // paper with a drawing of the sun
  box(g, "#fbf8f0", [0.34, 0.01, 0.25], [-0.22, 0.725, 0.08], [0, 0.2, 0]);
  add(g, G.cylLo(), col("#ffc53d"), [0.05, 0.01, 0.05], [-0.25, 0.732, 0.07], undefined, false);
  box(g, "#bfe3f5", [0.26, 0.01, 0.2], [0.05, 0.725, -0.2], [0, -0.3, 0]);
  // crayon cup
  add(g, G.cyl(), col("#3f8f9a", 0.5), [0.06, 0.13, 0.06], [0.38, 0.785, -0.22]);
  ["#d8412f", "#f0c44a", "#3a6fb0", "#4f8a4a"].forEach((c, i) => {
    const a = (i / 4) * Math.PI * 2;
    add(g, G.cylLo(), col(c), [0.012, 0.18, 0.012], [0.38 + Math.cos(a) * 0.025, 0.86, -0.22 + Math.sin(a) * 0.025], [Math.sin(a) * 0.15, 0, Math.cos(a) * 0.15], false);
  });
  // paint palette and a glue stick
  add(g, G.cyl(), col("#e8d0a8", 0.6), [0.12, 0.015, 0.09], [0.3, 0.73, 0.2], undefined, false);
  ["#d8412f", "#3a6fb0", "#ffc53d", "#6aae5c"].forEach((c, i) =>
    add(g, G.cylLo(), col(c, 0.3), [0.022, 0.01, 0.022], [0.24 + i * 0.045, 0.742, 0.19 + (i % 2) * 0.03], undefined, false),
  );
  add(g, G.cylLo(), col("#f4f1e8"), [0.025, 0.1, 0.025], [-0.45, 0.77, -0.25]);
  add(g, G.cylLo(), col("#d8412f"), [0.026, 0.03, 0.026], [-0.45, 0.835, -0.25], undefined, false);
  return g;
}

function tableDesk() {
  const g = new THREE.Group();
  const wood = "#b5793f";
  bev(g, wood, [1.2, 0.08, 0.72], [0, 0.68, -0.09]);
  bev(g, "#3a6fb0", [0.42, 0.64, 0.66], [0.37, 0.32, -0.09]);
  for (const y of [0.46, 0.18]) {
    box(g, "#5b8fd0", [0.36, 0.22, 0.02], [0.37, y, 0.245]);
    add(g, G.sphereLo(), col("#f0c44a", 0.4), [0.03, 0.03, 0.02], [0.37, y, 0.262], undefined, false);
  }
  for (const z of [-0.39, 0.21]) bev(g, wood, [0.08, 0.64, 0.08], [-0.54, 0.32, z]);
  // books
  const books: [string, number, number][] = [
    ["#d8412f", 0.26, 0.06],
    ["#4f8a4a", 0.22, 0.05],
    ["#f0c44a", 0.28, 0.07],
    ["#3f8f9a", 0.24, 0.05],
  ];
  let bx = -0.52;
  for (const [c, h, t] of books) {
    box(g, c, [t, h, 0.18], [bx + t / 2, 0.72 + h / 2, -0.33], undefined, true);
    bx += t + 0.005;
  }
  box(g, "#f4ecd8", [0.26, 0.03, 0.2], [-0.2, 0.735, -0.05], [0, 0.35, 0]);
  // globe
  const globe = canvasMaterial("globe", "#4f93c4", 256, 128, (c, w, h) => {
    c.fillStyle = "#4f93c4";
    c.fillRect(0, 0, w, h);
    const r = rng(53);
    c.fillStyle = "#6aae5c";
    for (let i = 0; i < 9; i++) {
      const x = r() * w;
      const y = h * (0.2 + r() * 0.6);
      wrapped(w, 0, x, y, (px, py) => {
        ellipse(c, px, py, 10 + r() * 22, 6 + r() * 14, r() * 3);
        c.fill();
      });
    }
    c.fillStyle = "#f4f1e8";
    c.fillRect(0, 0, w, 8);
    c.fillRect(0, h - 8, w, 8);
  });
  add(g, G.cyl(), col("#6b4222", 0.5), [0.08, 0.03, 0.08], [0.25, 0.735, -0.22]);
  add(g, G.cylLo(), col("#c9a45a", 0.35), [0.012, 0.12, 0.012], [0.25, 0.8, -0.22], undefined, false);
  add(g, G.ring(), col("#c9a45a", 0.35), [0.15, 0.15, 0.15], [0.25, 0.99, -0.22], [0, Math.PI / 2, 0.4], false);
  add(g, G.sphere(), globe, [0.13, 0.13, 0.13], [0.25, 0.99, -0.22], [0, 0, 0.4]);
  // stool tucked under the front
  add(g, G.cylLo(), col("#8a5a32", 0.7), [0.03, 0.4, 0.03], [-0.15, 0.2, 0.15], undefined, false);
  add(g, G.cyl(), col("#d8412f", 0.6), [0.17, 0.06, 0.17], [-0.15, 0.43, 0.15]);
  return g;
}

function tablePicnic() {
  const g = new THREE.Group();
  const wood = "#b5793f";
  for (const z of [-0.17, 0, 0.17]) bev(g, wood, [1.2, 0.06, 0.16], [0, 0.69, z]);
  for (const z of [-0.35, 0.35]) bev(g, wood, [1.2, 0.06, 0.2], [0, 0.42, z]);
  for (const x of [-0.46, 0.46]) {
    // A-frame legs and the bench cross bar
    for (const s of [-1, 1]) box(g, "#8a5a32", [0.07, 0.76, 0.07], [x, 0.37, s * 0.2], [s * 0.5, 0, 0], true);
    box(g, "#8a5a32", [0.06, 0.06, 0.86], [x, 0.36, 0], undefined, true);
    box(g, "#8a5a32", [0.06, 0.06, 0.36], [x, 0.63, 0]);
  }
  const cloth = canvasMaterial("gingham", "#d8554a", 256, 256, (c, w, h) => {
    c.fillStyle = "#fbf6ea";
    c.fillRect(0, 0, w, h);
    const n = 8;
    c.fillStyle = "rgba(216,65,47,0.55)";
    for (let i = 0; i < n; i += 2) {
      c.fillRect((i * w) / n, 0, w / n, h);
      c.fillRect(0, (i * h) / n, w, h / n);
    }
  });
  box(g, cloth, [0.62, 0.01, 0.5], [0, 0.725, 0], [0, 0.15, 0]);
  // picnic basket and a jug of lemonade
  bev(g, "#c9975a", [0.26, 0.14, 0.18], [0.3, 0.8, -0.08]);
  add(g, G.arch(), col("#a8763e", 0.8), [0.1, 0.1, 0.1], [0.3, 0.87, -0.08], undefined, false);
  add(g, G.cyl(), col("#f4d35e", 0.3), [0.06, 0.18, 0.06], [-0.3, 0.82, 0.05]);
  add(g, G.cylLo(), col("#f4f1e8", 0.3), [0.062, 0.03, 0.062], [-0.3, 0.925, 0.05], undefined, false);
  add(g, G.sphereLo(), col("#d8412f", 0.5), [0.05, 0.05, 0.05], [-0.1, 0.77, -0.12], undefined, false);
  return g;
}

// ---------------------------------------------------------------------------
// pictures: origin at the picture centre on the wall

function pictureDumpling() {
  const g = new THREE.Group();
  bev(g, "#a0673a", [0.95, 0.8, 0.06], [0, 0, 0.03]);
  const art = canvasMaterial("art-dumpling", "#9fd3f0", 512, 416, (c, w, h) => {
    const sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#7cc4ee");
    sky.addColorStop(1, "#d6f0fb");
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#ffd84a";
    c.beginPath();
    c.arc(w * 0.82, h * 0.2, 36, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#7cbf5c";
    ellipse(c, w * 0.25, h * 1.02, w * 0.5, h * 0.3);
    c.fill();
    c.fillStyle = "#5a9a4a";
    ellipse(c, w * 0.85, h * 1.05, w * 0.55, h * 0.32);
    c.fill();
    dumplingArt(c, w * 0.5, h * 0.62, 120);
  });
  add(g, G.plane(), art, [0.8, 0.65, 1], [0, 0, 0.062], undefined, false);
  return g;
}

function pictureCrown() {
  const g = new THREE.Group();
  bev(g, "#5a3a22", [0.8, 0.92, 0.06], [0, 0, 0.03]);
  box(g, "#243b6b", [0.64, 0.62, 0.02], [0, 0.07, 0.07]);
  const gold = glowMaterial("#f4c542", 0.28, 0.3);
  // a half-relief crown: band, three points with balls, gems
  add(g, G.cyl(), gold, [0.17, 0.13, 0.07], [0, -0.02, 0.15], undefined, false);
  for (const x of [-0.12, 0, 0.12]) {
    add(g, G.cone(), gold, [0.05, 0.16, 0.03], [x, 0.12, 0.2], undefined, false);
    add(g, G.sphereLo(), gold, [0.028, 0.028, 0.028], [x, 0.21, 0.2], undefined, false);
  }
  const gems = [glowMaterial("#e8455f", 0.6, 0.2), glowMaterial("#4f93c4", 0.6, 0.2), glowMaterial("#6aae5c", 0.6, 0.2)];
  [-0.09, 0, 0.09].forEach((x, i) => add(g, G.sphereLo(), gems[i]!, [0.028, 0.028, 0.02], [x, -0.02, 0.225], undefined, false));
  // ribbon tails and a brass plate
  for (const s of [-1, 1]) box(g, "#3a6fb0", [0.07, 0.22, 0.015], [s * 0.07, -0.2, 0.09], [0, 0, s * 0.25]);
  box(g, gold, [0.4, 0.09, 0.02], [0, -0.36, 0.07]);
  return g;
}

function pictureStickers() {
  const g = new THREE.Group();
  bev(g, "#a0673a", [1.1, 0.8, 0.05], [0, 0, 0.025]);
  const art = canvasMaterial("art-stickers", "#c99a62", 512, 356, (c, w, h) => {
    c.fillStyle = "#c99a62";
    c.fillRect(0, 0, w, h);
    const r = rng(97);
    c.fillStyle = "rgba(90,58,34,0.25)";
    for (let i = 0; i < 500; i++) c.fillRect(r() * w, r() * h, 2, 2);
    const colors = ["#d8412f", "#3a6fb0", "#ffc53d", "#4f8a4a", "#f08a3c", "#8a5ad8", "#3f8f9a"];
    const cols = 6;
    const rows = 4;
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const x = ((i + 0.5) / cols) * w + (r() - 0.5) * 24;
        const y = ((j + 0.5) / rows) * h + (r() - 0.5) * 18;
        const s = 26 + r() * 10;
        const kind = Math.floor(r() * 6);
        const color = colors[Math.floor(r() * colors.length)]!;
        c.save();
        c.translate(x, y);
        c.rotate((r() - 0.5) * 0.7);
        c.lineJoin = "round";
        c.lineWidth = 9;
        c.strokeStyle = "#ffffff";
        c.fillStyle = color;
        if (kind === 0) {
          starPath(c, 0, 0, s);
          c.stroke();
          c.fill();
        } else if (kind === 1) {
          c.beginPath();
          c.arc(0, 0, s * 0.85, 0, Math.PI * 2);
          c.stroke();
          c.fill();
          c.fillStyle = "#1e1a16";
          c.beginPath();
          c.arc(-s * 0.3, -s * 0.15, 3, 0, Math.PI * 2);
          c.arc(s * 0.3, -s * 0.15, 3, 0, Math.PI * 2);
          c.fill();
          c.strokeStyle = "#1e1a16";
          c.lineWidth = 3;
          c.beginPath();
          c.arc(0, s * 0.05, s * 0.35, 0.2 * Math.PI, 0.8 * Math.PI);
          c.stroke();
        } else if (kind === 2) {
          for (let k = 0; k < 3; k++) {
            c.strokeStyle = k === 0 ? "#ffffff" : ["#d8412f", "#ffc53d", "#3a6fb0"][k - 1]!;
            c.lineWidth = k === 0 ? 30 : 7;
            c.beginPath();
            c.arc(0, s * 0.4, s * (0.85 - (k === 0 ? 0.15 : (k - 1) * 0.22)), Math.PI, 0);
            c.stroke();
          }
        } else if (kind === 3) {
          c.fillStyle = "#ffffff";
          c.beginPath();
          c.arc(0, 0, s, 0, Math.PI * 2);
          c.fill();
          dumplingArt(c, 0, s * 0.1, s * 0.75);
        } else if (kind === 4) {
          c.fillStyle = "#ffffff";
          paw(c, 0, 0, s * 0.8, 0);
          c.save();
          c.scale(0.8, 0.8);
          c.fillStyle = color;
          paw(c, 0, 0, s * 0.8, 0);
          c.restore();
        } else {
          c.beginPath();
          c.moveTo(-s * 0.2, -s);
          c.lineTo(s * 0.5, -s * 0.2);
          c.lineTo(0, -s * 0.1);
          c.lineTo(s * 0.3, s);
          c.lineTo(-s * 0.5, s * 0.05);
          c.lineTo(0, 0);
          c.closePath();
          c.stroke();
          c.fillStyle = "#ffc53d";
          c.fill();
        }
        c.restore();
      }
  });
  add(g, G.plane(), art, [0.98, 0.68, 1], [0, 0, 0.052], undefined, false);
  const pin = col("#d8412f", 0.3);
  for (const [x, y] of [
    [-0.45, 0.3],
    [0.45, 0.3],
    [-0.45, -0.3],
    [0.45, -0.3],
  ] as const) add(g, G.sphereLo(), pin, [0.025, 0.025, 0.025], [x, y, 0.065], undefined, false);
  return g;
}

// ---------------------------------------------------------------------------
// pet beds: 0.9 x 0.8

function bone(g: THREE.Group, x: number, y: number, z: number, rot: number) {
  const b = new THREE.Group();
  b.position.set(x, y, z);
  b.rotation.y = rot;
  g.add(b);
  const white = col("#fbf6ea", 0.5);
  add(b, G.cylLo(), white, [0.022, 0.16, 0.022], [0, 0, 0], [0, 0, Math.PI / 2], false);
  for (const sx of [-0.08, 0.08]) for (const sz of [-0.022, 0.022]) add(b, G.sphereLo(), white, [0.03, 0.03, 0.03], [sx, 0, sz], undefined, false);
}

function petbedCushion() {
  const g = new THREE.Group();
  add(g, G.cyl(), col("#3f7f9a", 0.9), [0.4, 0.14, 0.35], [0, 0.07, 0]);
  add(g, G.torus(), col("#e8b04a", 0.9), [0.34, 0.3, 0.34], [0, 0.155, 0], [Math.PI / 2, 0, 0]);
  const pad = col("#f6ecd6", 0.8);
  add(g, G.sphereLo(), pad, [0.08, 0.01, 0.065], [0.02, 0.14, 0.05], undefined, false);
  for (let i = 0; i < 4; i++) add(g, G.sphereLo(), pad, [0.03, 0.01, 0.03], [-0.09 + i * 0.06, 0.14, -0.04 - (i === 1 || i === 2 ? 0.03 : 0)], undefined, false);
  bone(g, 0.28, 0.035, 0.29, 0.5);
  return g;
}

function petbedBasket() {
  const g = new THREE.Group();
  const wicker = ["#c9975a", "#a8763e", "#c9975a"];
  add(g, G.cyl(), col("#a8763e", 0.9), [0.34, 0.06, 0.3], [0, 0.03, 0]);
  [0.085, 0.19, 0.29].forEach((y, i) => add(g, G.torus(), col(wicker[i]!, 0.9), [0.34, 0.3, 0.34], [0, y, 0], [Math.PI / 2, 0, 0]));
  add(g, G.cyl(), canvasMaterial("quilt-plaid", "#c23a2f", 256, 256, PLAID_QUILT, { roughness: 0.9 }), [0.3, 0.12, 0.26], [0, 0.12, 0], undefined, false);
  add(g, G.arch(), col("#a8763e", 0.9), [0.3, 0.34, 0.3], [0, 0.33, 0], undefined, true);
  // a little blanket hanging over the front rim
  bev(g, "#3f8f9a", [0.3, 0.14, 0.04], [-0.1, 0.25, 0.31], [0.2, 0, 0], false);
  bone(g, 0.12, 0.2, -0.04, -0.4);
  return g;
}

function petbedDoghouse() {
  const g = new THREE.Group();
  const red = "#c9442f";
  bev(g, red, [0.8, 0.6, 0.7], [0, 0.3, 0]);
  const roof = col("#5a6470", 0.7);
  for (const s of [-1, 1]) add(g, beveledBox(0.54, 0.06, 0.78), roof, [1, 1, 1], [s * 0.21, 0.76, 0], [0, 0, -s * 0.62]);
  // front and back gables
  add(g, G.gable(), col(red), [0.8, 0.3, 1], [0, 0.6, 0.351], undefined, false);
  add(g, G.gable(), col(red), [0.8, 0.3, 1], [0, 0.6, -0.351], [0, Math.PI, 0], false);
  // arched doorway with a cushion peeking out, and a bone sign
  const dark = col("#2a2220", 0.9);
  box(g, dark, [0.3, 0.3, 0.02], [0, 0.17, 0.355]);
  add(g, G.cyl(), dark, [0.15, 0.02, 0.15], [0, 0.32, 0.355], [Math.PI / 2, 0, 0], false);
  box(g, "#e8b04a", [0.3, 0.05, 0.03], [0, 0.03, 0.37], undefined, false);
  bev(g, "#f4ecd8", [0.3, 0.12, 0.03], [0, 0.72, 0.37], undefined, false);
  bone(g, 0, 0.72, 0.395, 0);
  return g;
}

const BUILDERS: Record<string, () => THREE.Group> = {
  bed_cabin: bedCabin,
  bed_rocket: bedRocket,
  bed_treehouse: bedTreehouse,
  rug_braided: rugBraided,
  rug_map: rugMap,
  rug_paws: rugPaws,
  curtains_plaid: curtainsPlaid,
  curtains_stars: curtainsStars,
  curtains_forest: curtainsForest,
  lamp_lantern: lampLantern,
  lamp_mushroom: lampMushroom,
  lamp_lava: lampLava,
  plant_fern: plantFern,
  plant_cactus: plantCactus,
  plant_sunflower: plantSunflower,
  table_craft: tableCraft,
  table_desk: tableDesk,
  table_picnic: tablePicnic,
  picture_dumpling: pictureDumpling,
  picture_crown: pictureCrown,
  picture_stickers: pictureStickers,
  petbed_cushion: petbedCushion,
  petbed_basket: petbedBasket,
  petbed_doghouse: petbedDoghouse,
};

/**
 * Build one furniture piece in the spot's local frame (origin = spot anchor on
 * the floor or wall, facing +z into the room). Wallpaper, floor and unknown
 * ids return an empty group. Geometry and materials are shared: remove the
 * group, never dispose its contents.
 */
export function makeFurniture(id: FurnitureId): THREE.Group {
  const build = BUILDERS[id];
  const g = build ? build() : new THREE.Group();
  g.name = `furniture:${id}`;
  g.userData.furniture = id;
  return g;
}
