import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { glowMaterial } from "./furniture";
import { cone4Geo, coneGeo, cylGeo, lam, mesh, sphereGeo } from "./meshes";

/**
 * The pieces she builds with in the build yard (build-yard.ts).
 *
 * Every piece fills one square of the yard's one-metre grid and stacks on
 * whatever is in that square already. Heights are counted in half-metre
 * levels: a block is one level, so a staircase of blocks is a staircase of
 * half-metre steps she can climb without jumping (her step-up is 0.62m), and
 * anything she builds, she can stand on top of.
 *
 * `solid` is what she collides with, in the square's own frame: a half-width
 * and a height in levels, centred on the square, or a list of boxes for the
 * pieces that are hollow (the doorway she walks through, the fence across one
 * edge). Pieces with no `solid` are decoration she walks through: flowers, a
 * star, a rainbow overhead.
 *
 * `prize` pieces are not in the palette until a gumball machine gives her one
 * (gumballs.ts); starters are always there.
 */

export const LEVEL = 0.5;

export const BUILD_COLORS = [
  { id: "pink", name: "Strawberry", hex: "#ff93c4" },
  { id: "mint", name: "Mint", hex: "#6fe3c4" },
  { id: "lemon", name: "Lemon", hex: "#ffe36b" },
  { id: "grape", name: "Grape", hex: "#b98cff" },
  { id: "blue", name: "Blueberry", hex: "#7ec8ff" },
  { id: "orange", name: "Orange", hex: "#ffae5c" },
  { id: "choc", name: "Chocolate", hex: "#7a4a2e" },
  { id: "vanilla", name: "Vanilla", hex: "#fff4e0" },
] as const;

type Box = { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number };

export type PieceDef = {
  id: string;
  name: string;
  /** shown on the palette button */
  icon: string;
  /** height in half-metre levels: the next piece in the square stacks on top of it */
  h: number;
  /** takes the colour she has picked */
  colored?: boolean;
  /** turns with the Turn button (the rest look the same any way round) */
  turns?: boolean;
  /** solid as a centred square this wide (half-width, metres) and the piece's full height... */
  solid?: number;
  /** ...or as these boxes, in metres in the square's frame before it is turned */
  boxes?: Box[];
  prize?: boolean;
  /** tickets to buy it, for the pieces that are sold rather than given */
  price?: number;
  make: (color: string) => THREE.Group;
};

/**
 * Geometry made once and shared: the yard redraws every piece after each
 * change, and a fresh geometry per piece per redraw would pile up on the GPU.
 */
const cache = new Map<string, THREE.BufferGeometry>();
function once(key: string, make: () => THREE.BufferGeometry) {
  let geo = cache.get(key);
  if (!geo) cache.set(key, (geo = make()));
  return geo;
}

/**
 * A box for build pieces: the same moulded edge as everywhere else in the park,
 * but one segment round it instead of two. A build is hundreds of these, and
 * at two segments a block was 300 triangles and a big afternoon's building
 * doubled the triangles on screen.
 */
function blk(color: string, sx: number, sy: number, sz: number, x: number, y: number, z: number, shadow = true) {
  const key = `blk|${sx.toFixed(3)}|${sy.toFixed(3)}|${sz.toFixed(3)}`;
  const geo = once(key, () => new RoundedBoxGeometry(sx, sy, sz, 1, Math.min(0.06, Math.min(sx, sy, sz) / 3)));
  const m = new THREE.Mesh(geo, lam(color));
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

const g = (...parts: THREE.Object3D[]) => {
  const out = new THREE.Group();
  // add() with nothing in it warns, and a group is often started empty
  if (parts.length) out.add(...parts);
  return out;
};
const lit = (color: string, strength = 1.2) => glowMaterial(color, strength, 0.3);
const flagMats = new Map<string, THREE.Material>();
function flagMaterial(c: string) {
  let m = flagMats.get(c);
  if (!m) flagMats.set(c, (m = new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide, roughness: 0.5 })));
  return m;
}
function glowing(geo: THREE.BufferGeometry, color: string, sx: number, sy: number, sz: number, x: number, y: number, z: number) {
  const m = new THREE.Mesh(geo, lit(color));
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  return m;
}

export const PIECES: PieceDef[] = [
  /* ---------------------------------------------------------- starters */
  {
    id: "block",
    name: "Block",
    icon: "🧱",
    h: 1,
    colored: true,
    solid: 0.5,
    make: (c) => g(blk(c, 1, LEVEL, 1, 0, LEVEL / 2, 0)),
  },
  {
    id: "tall",
    name: "Tall block",
    icon: "⬜",
    h: 2,
    colored: true,
    solid: 0.5,
    make: (c) => g(blk(c, 1, 1, 1, 0, 0.5, 0)),
  },
  {
    id: "window",
    name: "Window",
    icon: "🪟",
    h: 2,
    colored: true,
    solid: 0.5,
    make: (c) => {
      const out = g(blk(c, 1, 0.16, 1, 0, 0.08, 0), blk(c, 1, 0.16, 1, 0, 0.92, 0));
      for (const [x, z] of [
        [-0.42, -0.42],
        [0.42, -0.42],
        [-0.42, 0.42],
        [0.42, 0.42],
      ] as const)
        out.add(blk(c, 0.16, 0.7, 0.16, x, 0.5, z));
      // solid pale glass, not see-through: transparent parts cannot be merged,
      // so every window in a build was a draw call of its own
      const glass = new THREE.Mesh(once("glass", () => new THREE.BoxGeometry(0.86, 0.68, 0.86)), lam("#cfeeff", { flat: true, roughness: 0.05, emissive: "#9fd8ff" }));
      glass.position.y = 0.5;
      out.add(glass);
      return out;
    },
  },
  {
    // She walks through it: two posts and a lintel, the opening 0.76m wide
    // against her 0.68, so a house she builds can have a door.
    id: "doorway",
    name: "Doorway",
    icon: "🚪",
    h: 5,
    colored: true,
    turns: true,
    boxes: [
      { x0: -0.5, x1: -0.38, z0: -0.5, z1: 0.5, y0: 0, y1: 2.5 },
      { x0: 0.38, x1: 0.5, z0: -0.5, z1: 0.5, y0: 0, y1: 2.5 },
      { x0: -0.5, x1: 0.5, z0: -0.5, z1: 0.5, y0: 2.05, y1: 2.5 },
    ],
    make: (c) =>
      g(
        blk(c, 0.12, 2.5, 1, -0.44, 1.25, 0),
        blk(c, 0.12, 2.5, 1, 0.44, 1.25, 0),
        blk(c, 1, 0.45, 1, 0, 2.275, 0),
        mesh(sphereGeo, "#ffffff", 0.1, 0.1, 0.1, 0, 2.0, 0.5, false),
      ),
  },
  {
    // A roof you cannot quite stand on: drawn as a wedge, solid as the lower
    // half of it, so it caps a wall and is a step, never a slide.
    id: "roof",
    name: "Roof",
    icon: "🔺",
    h: 2,
    colored: true,
    turns: true,
    solid: 0.5,
    make: (c) => {
      const geo = once("roof", () => {
        const shape = new THREE.Shape();
        shape.moveTo(-0.5, 0);
        shape.lineTo(0.5, 0);
        shape.lineTo(0, 1);
        shape.closePath();
        const e = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
        e.translate(0, 0, -0.5);
        return e;
      });
      const m = new THREE.Mesh(geo, lam(c, { flat: true, roughness: 0.4 }));
      m.castShadow = true;
      m.receiveShadow = true;
      return g(m);
    },
  },
  {
    id: "fence",
    name: "Fence",
    icon: "🎋",
    h: 2,
    turns: true,
    boxes: [{ x0: -0.5, x1: 0.5, z0: -0.08, z1: 0.08, y0: 0, y1: 0.9 }],
    make: () =>
      g(
        blk("#fff4e0", 1, 0.12, 0.08, 0, 0.75, 0),
        blk("#fff4e0", 1, 0.12, 0.08, 0, 0.35, 0),
        mesh(cylGeo, "#e8384f", 0.07, 0.9, 0.07, -0.44, 0.45, 0),
        mesh(cylGeo, "#e8384f", 0.07, 0.9, 0.07, 0.44, 0.45, 0),
      ),
  },
  {
    id: "lollipop",
    name: "Lollipop",
    icon: "🍭",
    h: 5,
    colored: true,
    boxes: [{ x0: -0.1, x1: 0.1, z0: -0.1, z1: 0.1, y0: 0, y1: 2.5 }],
    make: (c) => {
      // the sweet stands on edge, like a real lollipop, not flat like a plate
      const disc = mesh(cylGeo, c, 0.48, 0.14, 0.48, 0, 2.0, 0);
      const swirl = mesh(cylGeo, "#ffffff", 0.3, 0.15, 0.3, 0, 2.0, 0, false);
      disc.rotation.x = swirl.rotation.x = Math.PI / 2;
      return g(mesh(cylGeo, "#fff4e0", 0.06, 1.7, 0.06, 0, 0.85, 0), disc, swirl);
    },
  },
  {
    id: "cane",
    name: "Candy cane",
    icon: "🍬",
    h: 4,
    boxes: [{ x0: -0.1, x1: 0.1, z0: -0.1, z1: 0.1, y0: 0, y1: 2 }],
    make: () => {
      const out = g();
      for (let i = 0; i < 8; i++) out.add(mesh(cylGeo, i % 2 ? "#ffffff" : "#e8384f", 0.09, 0.22, 0.09, 0, 0.11 + i * 0.22, 0));
      const hook = new THREE.Mesh(once("hook", () => new THREE.TorusGeometry(0.2, 0.09, 8, 16, Math.PI)), lam("#e8384f", { flat: true }));
      hook.position.set(0.2, 1.76, 0);
      out.add(hook);
      return out;
    },
  },
  {
    id: "gumdrop",
    name: "Gumdrop",
    icon: "🟣",
    h: 2,
    colored: true,
    solid: 0.36,
    make: (c) => g(mesh(sphereGeo, c, 0.45, 0.62, 0.45, 0, 0.3, 0), mesh(cylGeo, c, 0.45, 0.3, 0.45, 0, 0.15, 0)),
  },
  {
    id: "cupcake",
    name: "Cupcake",
    icon: "🧁",
    h: 2,
    colored: true,
    solid: 0.4,
    make: (c) =>
      g(
        mesh(cylGeo, "#f6f1e8", 0.4, 0.5, 0.4, 0, 0.25, 0),
        mesh(sphereGeo, c, 0.46, 0.34, 0.46, 0, 0.58, 0),
        mesh(sphereGeo, "#e8384f", 0.1, 0.1, 0.1, 0, 0.94, 0, false),
      ),
  },
  {
    id: "donut",
    name: "Donut",
    icon: "🍩",
    h: 1,
    colored: true,
    solid: 0.45,
    make: (c) => {
      const ring = new THREE.Mesh(once("donut", () => new THREE.TorusGeometry(0.3, 0.17, 10, 20)), lam(c, { flat: true, roughness: 0.3 }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.18;
      ring.castShadow = true;
      return g(ring);
    },
  },
  {
    id: "flower",
    name: "Flower",
    icon: "🌸",
    h: 1,
    colored: true,
    make: (c) => {
      const out = g(mesh(cylGeo, "#4e8a3c", 0.03, 0.4, 0.03, 0, 0.2, 0, false), mesh(sphereGeo, "#ffe36b", 0.07, 0.07, 0.07, 0, 0.42, 0, false));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        out.add(mesh(sphereGeo, c, 0.09, 0.04, 0.09, Math.cos(a) * 0.11, 0.42, Math.sin(a) * 0.11, false));
      }
      return out;
    },
  },
  {
    id: "lamp",
    name: "Lamp",
    icon: "💡",
    h: 4,
    colored: true,
    boxes: [{ x0: -0.1, x1: 0.1, z0: -0.1, z1: 0.1, y0: 0, y1: 1.9 }],
    make: (c) => g(mesh(cylGeo, c, 0.06, 1.7, 0.06, 0, 0.85, 0), glowing(sphereGeo, "#fff3b0", 0.22, 0.22, 0.22, 0, 1.85, 0)),
  },
  {
    id: "bench",
    name: "Bench",
    icon: "🪑",
    h: 2,
    turns: true,
    boxes: [{ x0: -0.48, x1: 0.48, z0: -0.25, z1: 0.25, y0: 0, y1: 0.45 }],
    make: () =>
      g(
        blk("#c98a4b", 0.96, 0.1, 0.5, 0, 0.42, 0),
        blk("#c98a4b", 0.96, 0.4, 0.08, 0, 0.72, -0.22),
        blk("#7a4a2e", 0.08, 0.4, 0.4, -0.4, 0.2, 0),
        blk("#7a4a2e", 0.08, 0.4, 0.4, 0.4, 0.2, 0),
      ),
  },
  {
    id: "tree",
    name: "Cotton candy tree",
    icon: "🌳",
    h: 6,
    colored: true,
    boxes: [{ x0: -0.14, x1: 0.14, z0: -0.14, z1: 0.14, y0: 0, y1: 1.5 }],
    make: (c) =>
      g(
        mesh(cylGeo, "#b98a5a", 0.12, 1.5, 0.12, 0, 0.75, 0),
        mesh(sphereGeo, c, 0.62, 0.55, 0.62, 0, 1.9, 0),
        mesh(sphereGeo, c, 0.45, 0.42, 0.45, 0.3, 2.35, 0.1),
        mesh(sphereGeo, c, 0.42, 0.4, 0.42, -0.28, 2.3, -0.12),
      ),
  },
  {
    id: "flag",
    name: "Flag",
    icon: "🚩",
    h: 5,
    colored: true,
    turns: true,
    boxes: [{ x0: -0.06, x1: 0.06, z0: -0.06, z1: 0.06, y0: 0, y1: 2.5 }],
    make: (c) => {
      const geo = once("flag", () => {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(0.7, 0.22);
        shape.lineTo(0, 0.44);
        shape.closePath();
        return new THREE.ShapeGeometry(shape);
      });
      const flag = new THREE.Mesh(geo, flagMaterial(c));
      flag.position.set(0.04, 1.95, 0);
      return g(mesh(cylGeo, "#f6f1e8", 0.04, 2.5, 0.04, 0, 1.25, 0), flag);
    },
  },
  {
    id: "star",
    name: "Star",
    icon: "⭐",
    h: 2,
    colored: true,
    make: (c) => {
      const geo = once("star", () => {
        const shape = new THREE.Shape();
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
          const r = i % 2 ? 0.16 : 0.4;
          if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        shape.closePath();
        const e = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
        e.translate(0, 0, -0.06);
        return e;
      });
      const star = new THREE.Mesh(geo, glowMaterial(c, 0.8, 0.3));
      star.position.y = 0.55;
      star.userData.spin = true;
      return g(star);
    },
  },

  /* ------------------------------------------ gumball machine prizes */
  {
    id: "rainbow",
    name: "Rainbow",
    icon: "🌈",
    h: 4,
    prize: true,
    turns: true,
    make: () => {
      const out = g();
      ["#ff6b6b", "#ffae5c", "#ffe36b", "#6fe3c4", "#7ec8ff", "#b98cff"].forEach((col, i) => {
        const arc = new THREE.Mesh(once(`arc${i}`, () => new THREE.TorusGeometry(0.9 - i * 0.08, 0.045, 6, 24, Math.PI)), lam(col, { flat: true, roughness: 0.3 }));
        arc.position.y = 0.2;
        out.add(arc);
      });
      return out;
    },
  },
  {
    id: "fountain",
    name: "Chocolate fountain",
    icon: "⛲",
    h: 3,
    prize: true,
    solid: 0.46,
    make: () =>
      g(
        mesh(cylGeo, "#f6f1e8", 0.48, 0.35, 0.48, 0, 0.18, 0),
        mesh(cylGeo, "#6b4226", 0.4, 0.06, 0.4, 0, 0.36, 0, false),
        mesh(cylGeo, "#f6f1e8", 0.08, 0.8, 0.08, 0, 0.75, 0),
        mesh(cylGeo, "#f6f1e8", 0.26, 0.1, 0.26, 0, 1.15, 0),
        mesh(sphereGeo, "#6b4226", 0.2, 0.28, 0.2, 0, 1.28, 0),
      ),
  },
  {
    id: "bear",
    name: "Gummy bear statue",
    icon: "🐻",
    h: 3,
    colored: true,
    prize: true,
    solid: 0.34,
    make: (c) => {
      const mat = lam(c, { transparent: true, opacity: 0.85, roughness: 0.12, flat: true });
      const out = g();
      const part = (sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
        const m = new THREE.Mesh(sphereGeo, mat);
        m.scale.set(sx, sy, sz);
        m.position.set(x, y, z);
        out.add(m);
      };
      part(0.34, 0.42, 0.3, 0, 0.45, 0);
      part(0.26, 0.26, 0.26, 0, 1.0, 0);
      part(0.1, 0.1, 0.1, -0.18, 1.2, 0);
      part(0.1, 0.1, 0.1, 0.18, 1.2, 0);
      part(0.1, 0.16, 0.1, -0.32, 0.55, 0.05);
      part(0.1, 0.16, 0.1, 0.32, 0.55, 0.05);
      return out;
    },
  },
  {
    id: "unicorn",
    name: "Unicorn statue",
    icon: "🦄",
    h: 4,
    prize: true,
    turns: true,
    // long and narrow: solid along its body, not as a square
    boxes: [{ x0: -0.22, x1: 0.22, z0: -0.45, z1: 0.45, y0: 0, y1: 1.4 }],
    make: () =>
      g(
        blk("#fff4ff", 0.5, 0.4, 0.8, 0, 0.75, 0),
        mesh(cylGeo, "#fff4ff", 0.07, 0.55, 0.07, -0.16, 0.28, -0.28),
        mesh(cylGeo, "#fff4ff", 0.07, 0.55, 0.07, 0.16, 0.28, -0.28),
        mesh(cylGeo, "#fff4ff", 0.07, 0.55, 0.07, -0.16, 0.28, 0.28),
        mesh(cylGeo, "#fff4ff", 0.07, 0.55, 0.07, 0.16, 0.28, 0.28),
        blk("#fff4ff", 0.28, 0.5, 0.3, 0, 1.15, 0.38),
        blk("#fff4ff", 0.28, 0.24, 0.4, 0, 1.36, 0.58),
        mesh(coneGeo, "#ffd84a", 0.06, 0.34, 0.06, 0, 1.62, 0.62),
        blk("#ff93c4", 0.06, 0.5, 0.22, 0, 1.2, 0.2),
        blk("#b98cff", 0.06, 0.4, 0.2, 0, 0.8, -0.46),
      ),
  },
  {
    id: "golden",
    name: "Golden gumball",
    icon: "🟡",
    h: 3,
    prize: true,
    solid: 0.4,
    make: () => {
      const ball = new THREE.Mesh(sphereGeo, glowMaterial("#ffd84a", 0.6, 0.15));
      ball.scale.setScalar(0.5);
      ball.position.y = 0.95;
      return g(mesh(cylGeo, "#c4172f", 0.35, 0.45, 0.35, 0, 0.22, 0), ball);
    },
  },
  {
    id: "heart",
    name: "Heart",
    icon: "💖",
    h: 2,
    colored: true,
    prize: true,
    make: (c) => {
      const geo = once("heart", () => {
        const shape = new THREE.Shape();
        shape.moveTo(0, -0.3);
        shape.bezierCurveTo(-0.5, 0.05, -0.3, 0.42, 0, 0.18);
        shape.bezierCurveTo(0.3, 0.42, 0.5, 0.05, 0, -0.3);
        const e = new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
        e.translate(0, 0, -0.07);
        return e;
      });
      const h = new THREE.Mesh(geo, glowMaterial(c, 0.5, 0.3));
      h.position.y = 0.6;
      h.userData.spin = true;
      return g(h);
    },
  },
  {
    id: "crown",
    name: "Crown",
    icon: "👑",
    h: 2,
    prize: true,
    solid: 0.4,
    make: () => {
      const out = g(mesh(cylGeo, "#ffd84a", 0.4, 0.35, 0.4, 0, 0.18, 0));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        out.add(mesh(cone4Geo, "#ffd84a", 0.1, 0.3, 0.1, Math.cos(a) * 0.34, 0.5, Math.sin(a) * 0.34));
        out.add(mesh(sphereGeo, ["#e8384f", "#7ec8ff", "#6fe3c4"][i % 3]!, 0.06, 0.06, 0.06, Math.cos(a) * 0.4, 0.2, Math.sin(a) * 0.4, false));
      }
      return out;
    },
  },
  {
    id: "icecream",
    name: "Ice cream cone",
    icon: "🍦",
    h: 4,
    colored: true,
    prize: true,
    solid: 0.3,
    make: (c) => {
      const cone = mesh(coneGeo, "#e8b86a", 0.3, 1.1, 0.3, 0, 0.55, 0);
      cone.rotation.x = Math.PI;
      return g(cone, mesh(sphereGeo, c, 0.38, 0.36, 0.38, 0, 1.3, 0), mesh(sphereGeo, "#e8384f", 0.08, 0.08, 0.08, 0, 1.72, 0, false));
    },
  },
  {
    id: "tower",
    name: "Castle tower",
    icon: "🏰",
    h: 6,
    colored: true,
    prize: true,
    solid: 0.5,
    make: (c) => {
      const out = g(blk(c, 1, 2.6, 1, 0, 1.3, 0));
      for (const [x, z] of [
        [-0.38, -0.38],
        [0.38, -0.38],
        [-0.38, 0.38],
        [0.38, 0.38],
      ] as const)
        out.add(blk(c, 0.24, 0.3, 0.24, x, 2.75, z));
      return out;
    },
  },
  {
    id: "lights",
    name: "Fairy lights",
    icon: "✨",
    h: 1,
    prize: true,
    make: () => {
      const out = g();
      ["#ff93c4", "#ffe36b", "#7ec8ff", "#6fe3c4", "#b98cff"].forEach((col, i) => {
        out.add(glowing(sphereGeo, col, 0.07, 0.07, 0.07, -0.4 + i * 0.2, 0.3 + Math.sin(i * 1.3) * 0.06, 0));
      });
      return out;
    },
  },
  {
    id: "rocket",
    name: "Candy rocket",
    icon: "🚀",
    h: 6,
    colored: true,
    prize: true,
    solid: 0.32,
    make: (c) =>
      g(
        mesh(cylGeo, "#f6f1e8", 0.3, 1.8, 0.3, 0, 1.1, 0),
        mesh(coneGeo, c, 0.3, 0.6, 0.3, 0, 2.3, 0),
        blk(c, 0.9, 0.5, 0.08, 0, 0.45, 0),
        blk(c, 0.08, 0.5, 0.9, 0, 0.45, 0),
        mesh(sphereGeo, "#7ec8ff", 0.12, 0.12, 0.06, 0, 1.5, 0.29, false),
      ),
  },
];

export const PIECE = new Map(PIECES.map((p) => [p.id, p]));
export const PRIZE_PIECES = PIECES.filter((p) => p.prize).map((p) => p.id);

/**
 * How tall a piece is drawn, measured once. A rounded piece (a gumdrop, a
 * donut, a statue) is drawn shorter than the height the next piece stacks at,
 * and a collider to the full height left her standing in the air above it.
 */
const drawnTops = new Map<string, number>();
function drawnTop(p: PieceDef) {
  let t = drawnTops.get(p.id);
  if (t == null) {
    const box = new THREE.Box3().setFromObject(p.make("#ffffff"), true);
    t = box.isEmpty() ? p.h * LEVEL : Math.min(p.h * LEVEL, box.max.y);
    drawnTops.set(p.id, t);
  }
  return t;
}

/** A piece's colliders in metres, in its square's frame, turned by `r` quarter turns. */
export function pieceBoxes(p: PieceDef, r: number): Box[] {
  const raw: Box[] = p.boxes ?? (p.solid ? [{ x0: -p.solid, x1: p.solid, z0: -p.solid, z1: p.solid, y0: 0, y1: drawnTop(p) }] : []);
  // quarter turns, exactly: x,z -> z,-x each time
  return raw.map((b) => {
    let { x0, x1, z0, z1 } = b;
    for (let i = 0; i < ((r % 4) + 4) % 4; i++) [x0, x1, z0, z1] = [z0, z1, -x1, -x0];
    return { ...b, x0, x1, z0, z1 };
  });
}
