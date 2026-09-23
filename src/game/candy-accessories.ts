import * as THREE from "three";
import { beveledBox } from "./beveled";
import { lam } from "./meshes";
import { SUGAR } from "./sugar-rush";
import type { AccessoryDef, AccessoryId, Slot } from "./accessories";
import type { LevelDef } from "./types";

/**
 * Sugar Rush Park's own things to find and wear.
 *
 * Park 1's accessories live in accessories.ts and are built the same way: an
 * item is a small group of boxes and balls in the frame of the rig group it
 * hangs off — her head (head centre ~ (0, 0.32, 0.03), hair top ~ 0.6, face
 * front ~ z 0.29), her torso (shoulders ~ y 0.44, back ~ z -0.2) or her hand
 * (origin = the fist, the arm running up +y; applyWorn mirrors x for the left
 * hand, which is the one she carries things in).
 *
 * Everything here has to read at third-person distance on a TV, which rules
 * out detail: a candy crown is a band of icing with six fat gumdrops on it, not
 * filigree. The shapes are big, the colours are the park's, and each item says
 * what it is from ten metres behind her.
 *
 * accessories.ts folds these into the game's one list of accessories, so the
 * wardrobe, the pickup code and the bag thumbnails need to know nothing about
 * which park an item came from.
 */

export type CandyAccessoryId =
  | "candypack"
  | "candycrown"
  | "cupcakehat"
  | "gumdropclips"
  | "peppermintshades"
  | "rainbowwings"
  | "canecrook"
  // the sweet shop at the fairground sells these; they are not hidden anywhere
  | "gumballhat"
  | "licoricebow"
  | "bubblegum"
  | "cottoncloud"
  | "bigswirl";

/** The park's palette, the same colours sugar-rush.ts builds the world from. */
const C = {
  cane: "#e8384f",
  icing: "#f6f1e8",
  cream: "#f7ead3",
  pink: "#ff6aa8",
  blush: "#ff93c4",
  sun: "#ffc83a",
  mint: "#6fe3c4",
  lilac: "#b06aff",
  orange: "#ff8a3a",
  choc: "#6b4226",
  licorice: "#2a2430",
  cherry: "#d81f3c",
  lime: "#7fd94a",
  sky: "#69c8ff",
} as const;

/** What the sweet shop sells, in the order it lays them out. Prices in tickets. */
export const SWEET_SHOP: { id: CandyAccessoryId; price: number }[] = [
  { id: "licoricebow", price: 5 },
  { id: "bubblegum", price: 6 },
  { id: "bigswirl", price: 8 },
  { id: "cottoncloud", price: 10 },
  { id: "gumballhat", price: 14 },
];

export const CANDY_ACCESSORIES: AccessoryDef[] = [
  {
    id: "candypack",
    name: "Candy satchel",
    slot: "back",
    hint: "Behind the candy stall on the far side of the sweet shop street, south of where you start.",
  },
  {
    id: "candycrown",
    name: "Candy crown",
    slot: "head",
    hint: "On the edge of the village square, beside the gingerbread houses.",
  },
  {
    id: "cupcakehat",
    name: "Cupcake hat",
    slot: "head",
    hint: "At the fairground, past the east end of the row of candy stalls.",
  },
  {
    id: "gumdropclips",
    name: "Gumdrop clips",
    slot: "hair",
    hint: "Up among the gumdrop hills in the meadow.",
  },
  {
    id: "peppermintshades",
    name: "Peppermint shades",
    slot: "face",
    hint: "At the foot of Ice Cream Mountain, where the walk up begins.",
  },
  {
    id: "rainbowwings",
    name: "Rainbow candy wings",
    slot: "back",
    hint: "In the big clearing, deep in the Lollipop Forest.",
  },
  {
    id: "canecrook",
    name: "Candy cane crook",
    slot: "hand",
    hint: "Outside the Licorice Maze, by the way in.",
  },

  // the sweet shop's five. Nothing is hidden in the park for these, so the
  // hint says where to buy them instead of where to look.
  {
    id: "licoricebow",
    name: "Liquorice bow",
    slot: "hair",
    hint: "Buy it at the sweet shop on the fairground.",
    reward: "the sweet shop",
  },
  {
    id: "bubblegum",
    name: "Bubblegum bubble",
    slot: "face",
    hint: "Buy it at the sweet shop on the fairground.",
    reward: "the sweet shop",
  },
  {
    id: "bigswirl",
    name: "Giant swirl lolly",
    slot: "hand",
    hint: "Buy it at the sweet shop on the fairground.",
    reward: "the sweet shop",
  },
  {
    id: "cottoncloud",
    name: "Candy floss cloud",
    slot: "back",
    hint: "Buy it at the sweet shop on the fairground.",
    reward: "the sweet shop",
  },
  {
    id: "gumballhat",
    name: "Gumball machine hat",
    slot: "head",
    hint: "Buy it at the sweet shop on the fairground.",
    reward: "the sweet shop",
  },
];

const CANDY_IDS = new Set<string>(CANDY_ACCESSORIES.map((a) => a.id));

/** True for an id this file owns. */
export function isCandyAccessory(id: string): id is CandyAccessoryId {
  return CANDY_IDS.has(id);
}

/* ------------------------------------------------------------ where they are */

/**
 * Where each one is hidden, derived from the region centres so that moving a
 * region in sugar-rush.ts moves its accessory with it.
 *
 * The rules these have to pass (tools/spread.ts, tools/collectibles.ts): at
 * least 4m from anything else hidden, never on a path, in the river or inside
 * a model, and reachable on foot from the spawn without jumping. y is 0, the
 * park's ground: the pickup floats 1.05m over it, the same as park 1's.
 *
 * A function rather than a table because it reads SUGAR: the park's module
 * reaches this file again through the accessory list, and a table would be
 * built while sugar-rush.ts was still being evaluated if anything imported
 * this file first — SUGAR would be undefined and the park would not load.
 */
export function candyAccessorySpots(): NonNullable<LevelDef["accessories"]> {
  return [
    // beside the candy stall at the west end of the sweet shop street, the
    // first street north of where she starts
    {
      id: "candypack",
      pos: [SUGAR.plaza.x - 26, 0, SUGAR.plaza.z + 30],
      region: "the sweet shop street",
    },
    // the south-west corner of the gingerbread village's square
    {
      id: "candycrown",
      pos: [SUGAR.village.x - 12, 0, SUGAR.village.z + 15],
      region: "Gingerbread Village",
    },
    // off the east end of the fairground apron, past the stall row
    {
      id: "cupcakehat",
      pos: [SUGAR.fair.x + 29, 0, SUGAR.fair.z + 14],
      region: "the fairground",
    },
    // out in the gumdrop hills
    {
      id: "gumdropclips",
      pos: [SUGAR.meadow.x - 14, 0, SUGAR.meadow.z - 6],
      region: "Gumdrop Meadow",
    },
    // the foot of the mountain, on the side the climb starts from
    {
      id: "peppermintshades",
      pos: [SUGAR.mountain.x + 10, 0, SUGAR.mountain.z + 11],
      region: "Ice Cream Mountain",
    },
    // the edge of the clearing in the heart of the wood
    {
      id: "rainbowwings",
      pos: [SUGAR.forest.x + 9.5, 0, SUGAR.forest.z - 6],
      region: "the Lollipop Forest",
    },
    // out on the grass west of the maze, where the hedges start
    {
      id: "canecrook",
      pos: [SUGAR.maze.x - 28, 0, SUGAR.maze.z + 4],
      region: "the Licorice Maze",
    },
  ];
}

/* ----------------------------------------------------------------- the meshes */

const flat = (c: string, roughness = 0.5) => lam(c, { flat: true, roughness });
const glossy = (c: string) => lam(c, { flat: true, roughness: 0.18 });
const sphereGeo = new THREE.SphereGeometry(1, 14, 12);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
const coneGeo = new THREE.ConeGeometry(1, 1, 12);
const ringGeo = new THREE.TorusGeometry(1, 0.08, 8, 24);

function box(
  color: string,
  sx: number,
  sy: number,
  sz: number,
  x: number,
  y: number,
  z: number,
  roughness = 0.5,
) {
  const m = new THREE.Mesh(beveledBox(sx, sy, sz), flat(color, roughness));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function ball(
  color: string,
  r: number,
  x: number,
  y: number,
  z: number,
  sy = r,
  sz = r,
  mat?: THREE.Material,
) {
  const m = new THREE.Mesh(sphereGeo, mat ?? flat(color));
  m.scale.set(r, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** A sugared gumdrop: a glossy dome with a crust of sugar grains on it. */
function gumdrop(color: string, r: number, x: number, y: number, z: number) {
  const g = new THREE.Group();
  g.add(ball(color, r, 0, 0, 0, r * 1.15, r, glossy(color)));
  const grains = lam("#fff6ea", { flat: true, roughness: 0.9 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r * 13;
    const up = 0.35 + (i % 3) * 0.22;
    const s = new THREE.Mesh(sphereGeo, grains);
    s.scale.setScalar(r * 0.17);
    s.position.set(Math.cos(a) * r * 0.85, up * r, Math.sin(a) * r * 0.85);
    g.add(s);
  }
  g.position.set(x, y, z);
  return g;
}

/**
 * Red stripes wound round a white rod: a stack of tilted bands, which is what
 * a candy cane's spiral looks like from any distance you can see one at.
 *
 * The band has its own torus rather than the thin ringGeo: scaling a torus
 * scales its tube with it, and ringGeo shrunk to a 3cm rod gave stripes 2mm
 * thick, which is a white stick with a pink smudge on it.
 */
const stripeGeo = new THREE.TorusGeometry(1, 0.34, 6, 14);
function caneStripes(g: THREE.Group, from: THREE.Vector3, to: THREE.Vector3, r: number, n: number) {
  const red = flat(C.cane, 0.3);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const ring = new THREE.Mesh(stripeGeo, red);
    ring.scale.set(r * 0.92, r * 0.92, r * 0.5);
    ring.rotation.x = Math.PI / 2;
    ring.rotation.y = 0.5;
    ring.position.lerpVectors(from, to, t);
    g.add(ring);
  }
}

// One wing of the rainbow pair: a broad candy-slice shape rooted at the origin
// and reaching out along +x, drawn again at smaller scales for the bands.
const wingShape = new THREE.Shape();
wingShape.moveTo(0, -0.04);
wingShape.bezierCurveTo(0.16, 0.5, 0.52, 0.62, 0.58, 0.3);
wingShape.bezierCurveTo(0.64, 0.02, 0.4, -0.3, 0.16, -0.34);
wingShape.bezierCurveTo(0.06, -0.36, 0.0, -0.22, 0, -0.04);
const wingGeo = (() => {
  const geo = new THREE.ExtrudeGeometry(wingShape, {
    depth: 0.022,
    bevelEnabled: false,
    curveSegments: 14,
  });
  geo.translate(0, 0, -0.011);
  return geo;
})();

/** A flat sugar crystal, for sprinkles and the wings' dusting. */
const sprinkleGeo = beveledBox(0.018, 0.018, 0.05);

/** The item as worn, in the frame of the group it attaches to. */
export function makeCandyAccessory(
  id: AccessoryId,
): { mesh: THREE.Group; attach: "head" | "torso" | "hand" } | null {
  if (!isCandyAccessory(id)) return null;
  const g = new THREE.Group();
  g.userData.accessory = id;
  switch (id) {
    case "candycrown": {
      // a band of white icing round her head with a scalloped drip along the
      // bottom, six fat gumdrops standing on it and a candy heart at the front
      const band = new THREE.Mesh(cylGeo, flat(C.icing, 0.4));
      band.scale.set(0.215, 0.11, 0.215);
      band.position.set(0, 0.63, -0.01);
      band.castShadow = true;
      g.add(band);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        g.add(
          ball(C.icing, 0.045, Math.cos(a) * 0.215, 0.575, Math.sin(a) * 0.215 - 0.01, 0.05, 0.045),
        );
      }
      const drops = [C.cane, C.sun, C.mint, C.lilac, C.orange, C.blush];
      drops.forEach((c, i) => {
        const a = (i / drops.length) * Math.PI * 2 + 0.3;
        g.add(gumdrop(c, 0.055, Math.cos(a) * 0.185, 0.69, Math.sin(a) * 0.185 - 0.01));
      });
      // a pink candy heart over her forehead, the front of the crown
      const heart = new THREE.Group();
      for (const s of [-1, 1])
        heart.add(ball(C.pink, 0.038, s * 0.024, 0.012, 0, 0.038, 0.02, glossy(C.pink)));
      const tip = new THREE.Mesh(coneGeo, glossy(C.pink));
      tip.scale.set(0.072, 0.07, 0.04);
      tip.rotation.z = Math.PI;
      tip.position.y = -0.04;
      heart.add(tip);
      heart.position.set(0, 0.7, 0.2);
      g.add(heart);
      return { mesh: g, attach: "head" };
    }
    case "cupcakehat": {
      // a whole cupcake sitting on her head: a fluted wrapper, a fat swirl of
      // frosting, sprinkles and a cherry
      const wrapper = new THREE.Mesh(
        new THREE.CylinderGeometry(0.21, 0.155, 0.18, 16),
        flat(C.blush, 0.55),
      );
      wrapper.position.set(0, 0.66, -0.01);
      wrapper.castShadow = true;
      g.add(wrapper);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const rib = box(
          C.pink,
          0.028,
          0.18,
          0.028,
          Math.cos(a) * 0.188,
          0.66,
          Math.sin(a) * 0.188 - 0.01,
          0.55,
        );
        rib.rotation.y = -a;
        g.add(rib);
      }
      g.add(ball(C.cream, 0.208, 0, 0.75, -0.01, 0.05, 0.208)); // the cake's lip
      /*
       * The swirl. It was three fat white rounds to start with and read as a
       * chef's hat from behind her: too tall, and white at this size is just a
       * blob. Pink frosting, alternating shades so the turns show, and half the
       * height — the sweet has to sit ON her head, not replace it.
       */
      const icingA = glossy("#ffd9ea");
      const icingB = glossy("#ffb3d8");
      const swirl: [number, number, number, number][] = [
        [0.185, 0.81, 0.075, 0.0],
        [0.14, 0.875, 0.062, 0.7],
        [0.095, 0.925, 0.05, 1.4],
      ];
      swirl.forEach(([r, y, h, turn], i) => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r, h, 8, 20), i % 2 ? icingB : icingA);
        ring.rotation.x = Math.PI / 2;
        ring.rotation.z = turn;
        ring.position.set(Math.cos(turn) * 0.016, y, Math.sin(turn) * 0.016 - 0.01);
        ring.castShadow = true;
        g.add(ring);
      });
      g.add(ball("#ffd9ea", 0.075, 0, 0.96, -0.01, 0.055, 0.075, icingA));
      const sprinkles = [C.cane, C.sun, C.mint, C.lilac, C.sky, C.orange];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + 0.4;
        const r = 0.09 + (i % 3) * 0.045;
        const s = new THREE.Mesh(sprinkleGeo, flat(sprinkles[i % sprinkles.length]!, 0.4));
        s.scale.setScalar(2.2);
        s.position.set(Math.cos(a) * r, 0.855 + (i % 4) * 0.035, Math.sin(a) * r - 0.01);
        s.rotation.set(1.2 + i, a, 0.6);
        g.add(s);
      }
      g.add(ball(C.cherry, 0.055, 0, 1.02, -0.01, 0.055, 0.055, glossy(C.cherry)));
      const stalk = new THREE.Mesh(cylGeo, flat("#4a7a2a", 0.6));
      stalk.scale.set(0.009, 0.09, 0.009);
      stalk.position.set(0.018, 1.08, -0.01);
      stalk.rotation.z = -0.4;
      g.add(stalk);
      return { mesh: g, attach: "head" };
    }
    case "gumdropclips": {
      // a big sugared gumdrop over each ear on a licorice clip, with a little
      // one behind it: hair slot, so it sits below the hats
      for (const s of [-1, 1]) {
        const clip = box(C.licorice, 0.12, 0.03, 0.08, s * 0.205, 0.525, 0.02, 0.35);
        clip.rotation.z = -s * 0.35;
        g.add(clip);
        // big enough to see from behind her, and set out on the hair rather
        // than buried in it
        const big = gumdrop(s > 0 ? C.pink : C.lilac, 0.105, s * 0.25, 0.565, 0.03);
        big.rotation.z = -s * 0.55;
        g.add(big);
        const small = gumdrop(s > 0 ? C.sun : C.mint, 0.065, s * 0.225, 0.515, -0.085);
        small.rotation.z = -s * 0.65;
        g.add(small);
      }
      return { mesh: g, attach: "head" };
    }
    case "peppermintshades": {
      // round pink lenses in candy-cane rims, with licorice arms and a little
      // mint humbug where the arm meets the frame
      /*
       * Round lenses the size park 1's sunglasses use. The first pair was
       * twice this and read as a carnival mask, not a pair of glasses: on a
       * face this small, "chunky" is 6cm across, not 12.
       */
      const rimGeo = new THREE.TorusGeometry(0.062, 0.013, 8, 18);
      for (const s of [-1, 1]) {
        const lens = new THREE.Mesh(cylGeo, lam("#ff8fc4", { flat: true, roughness: 0.15 }));
        lens.scale.set(0.058, 0.016, 0.058);
        lens.rotation.x = Math.PI / 2;
        lens.position.set(s * 0.095, 0.325, 0.283);
        g.add(lens);
        // the rim, a candy cane bent into a circle: white with red stripes
        const rim = new THREE.Mesh(rimGeo, flat(C.icing, 0.35));
        rim.position.set(s * 0.095, 0.325, 0.29);
        g.add(rim);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + 0.3;
          const bar = box(
            C.cane,
            0.016,
            0.03,
            0.026,
            s * 0.095 + Math.cos(a) * 0.062,
            0.325 + Math.sin(a) * 0.062,
            0.29,
            0.3,
          );
          bar.rotation.z = a + Math.PI / 2;
          g.add(bar);
        }
        g.add(box(C.licorice, 0.018, 0.014, 0.26, s * 0.2, 0.335, 0.165, 0.3));
        g.add(ball(C.mint, 0.022, s * 0.185, 0.332, 0.268, 0.022, 0.014, glossy(C.mint)));
      }
      g.add(box(C.icing, 0.045, 0.014, 0.016, 0, 0.33, 0.29, 0.3));
      return { mesh: g, attach: "head" };
    }
    case "rainbowwings": {
      // two candy wings on her back, each a stack of rainbow bands with a
      // dusting of sugar: the silhouette is the wing, the bands are the rainbow
      const bands = ["#ff4f6d", C.orange, C.sun, C.lime, C.sky, C.lilac];
      for (const s of [-1, 1]) {
        const side = new THREE.Group();
        side.position.set(s * 0.05, 0.3, -0.2);
        side.rotation.y = s > 0 ? 0.42 : Math.PI - 0.42;
        side.rotation.z = s > 0 ? 0.15 : -0.15;
        // a shade smaller than park 1's butterfly wings, which is as big as a
        // pair of wings can be before they are wider than she is
        side.scale.setScalar(0.84);
        bands.forEach((c, i) => {
          const k = 1 - i * 0.145;
          const band = new THREE.Mesh(wingGeo, flat(c, 0.35));
          band.scale.set(k, k, 1 + i * 0.35);
          band.position.set(0.012 * i, 0.006 * i, 0);
          if (i === 0) band.castShadow = true;
          side.add(band);
        });
        // sugar crystals along the leading edge
        for (let i = 0; i < 5; i++) {
          const t = 0.2 + i * 0.16;
          const s2 = new THREE.Mesh(sprinkleGeo, lam("#fffaf2", { flat: true, roughness: 0.25 }));
          s2.scale.setScalar(1.4 + (i % 2) * 0.6);
          s2.position.set(0.1 + t * 0.42, 0.3 + Math.sin(t * 2.4) * 0.14, 0.03);
          s2.rotation.set(0, 0, i * 1.1);
          side.add(s2);
        }
        g.add(side);
      }
      // the clasp between them, a swirl sweet on her spine
      g.add(ball(C.icing, 0.05, 0, 0.32, -0.19, 0.075, 0.03, glossy(C.icing)));
      g.add(ball(C.pink, 0.028, 0, 0.32, -0.17, 0.045, 0.02, glossy(C.pink)));
      return { mesh: g, attach: "torso" };
    }
    case "canecrook": {
      // a candy cane as tall as she is, held like a shepherd's crook: a striped
      // rod leaning out of her fist and a hook curling forward at the top
      const cane = new THREE.Group();
      cane.rotation.x = 0.32;
      const white = flat(C.icing, 0.3);
      const R = 0.042;
      const rod = new THREE.Mesh(cylGeo, white);
      rod.scale.set(R, 0.98, R);
      rod.position.y = 0.26;
      rod.castShadow = true;
      cane.add(rod);
      caneStripes(cane, new THREE.Vector3(0, -0.21, 0), new THREE.Vector3(0, 0.71, 0), R, 9);
      // the hook: a half torus standing in the xy plane, curling forward
      const hookR = 0.19;
      const hook = new THREE.Group();
      hook.position.set(0, 0.75, 0);
      const arc = new THREE.Mesh(new THREE.TorusGeometry(hookR, R, 10, 22, Math.PI * 1.1), white);
      arc.rotation.y = Math.PI / 2;
      arc.rotation.z = -Math.PI / 2;
      arc.castShadow = true;
      hook.add(arc);
      for (let i = 0; i < 5; i++) {
        const a = 0.25 + (i / 5) * Math.PI * 0.95;
        const ring = new THREE.Mesh(stripeGeo, flat(C.cane, 0.3));
        ring.scale.set(R * 0.92, R * 0.92, R * 0.5);
        ring.position.set(0, hookR * Math.cos(a), hookR * Math.sin(a));
        ring.rotation.x = Math.PI / 2 - a;
        ring.rotation.y = 0.4;
        hook.add(ring);
      }
      cane.add(hook);
      // a bow of pink ribbon where she holds it
      const bow = new THREE.Group();
      for (const s of [-1, 1]) bow.add(ball(C.pink, 0.05, s * 0.05, 0, 0, 0.035, 0.028));
      bow.add(ball(C.blush, 0.022, 0, 0, 0.01));
      bow.position.set(0, 0.2, 0.035);
      cane.add(bow);
      g.add(cane);
      return { mesh: g, attach: "hand" };
    }
    case "candypack": {
      // The park's backpack: a box of chocolates worn on her back, tied with an
      // icing ribbon, on licorice straps, with a lollipop and a cane poking out
      // of the top so it reads as a bag full of sweets rather than a parcel.
      const bodyC = C.pink;
      g.add(box(bodyC, 0.32, 0.34, 0.17, 0, 0.25, -0.23));
      // the lid, a shade deeper, with a gumdrop clasp under it
      g.add(box("#e8508f", 0.335, 0.11, 0.185, 0, 0.385, -0.225));
      g.add(gumdrop(C.sun, 0.045, 0, 0.3, -0.325));
      // the ribbon: a band round the body and a bow on the back
      g.add(box(C.icing, 0.345, 0.055, 0.02, 0, 0.25, -0.317, 0.4));
      g.add(box(C.icing, 0.05, 0.35, 0.02, 0, 0.25, -0.317, 0.4));
      const bow = new THREE.Group();
      for (const s of [-1, 1]) {
        bow.add(ball(C.icing, 0.065, s * 0.065, 0, 0, 0.05, 0.035));
        bow.add(ball(C.icing, 0.03, s * 0.05, -0.075, 0, 0.055, 0.025));
      }
      bow.add(ball(C.cream, 0.03, 0, 0, 0.012));
      bow.position.set(0, 0.16, -0.325);
      g.add(bow);
      // licorice straps over her shoulders
      for (const s of [-1, 1]) {
        const strap = box(C.licorice, 0.05, 0.32, 0.05, s * 0.135, 0.36, -0.115, 0.4);
        strap.rotation.x = -0.35;
        g.add(strap);
      }
      // what is sticking out of it: a swirl lolly and a little candy cane
      const lolly = new THREE.Group();
      lolly.position.set(-0.1, 0.45, -0.26);
      lolly.rotation.set(0.3, 0, 0.35);
      const stick = new THREE.Mesh(cylGeo, flat(C.cream, 0.6));
      stick.scale.set(0.012, 0.2, 0.012);
      lolly.add(stick);
      const disc = new THREE.Mesh(cylGeo, glossy(C.icing));
      disc.scale.set(0.075, 0.025, 0.075);
      disc.rotation.x = Math.PI / 2;
      disc.position.y = 0.13;
      lolly.add(disc);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const arm = box(
          C.cane,
          0.028,
          0.03,
          0.07,
          Math.cos(a) * 0.04,
          0.13,
          Math.sin(a) * 0.04,
          0.25,
        );
        arm.rotation.y = -a;
        lolly.add(arm);
      }
      g.add(lolly);
      const mini = new THREE.Group();
      mini.position.set(0.11, 0.44, -0.26);
      mini.rotation.set(0.25, 0, -0.3);
      const miniRod = new THREE.Mesh(cylGeo, flat(C.icing, 0.3));
      miniRod.scale.set(0.02, 0.26, 0.02);
      miniRod.position.y = 0.06;
      mini.add(miniRod);
      caneStripes(mini, new THREE.Vector3(0, -0.05, 0), new THREE.Vector3(0, 0.17, 0), 0.02, 4);
      g.add(mini);
      return { mesh: g, attach: "torso" };
    }

    /* ------------------------------------------------ the sweet shop's five */

    case "licoricebow": {
      // a big liquorice allsort bow on the side of her head: two loops, two
      // tails and a knot, all of it striped the way an allsort is
      const bow = new THREE.Group();
      bow.position.set(-0.19, 0.58, 0.02);
      bow.rotation.set(0, -0.5, 0.25);
      for (const side of [-1, 1] as const) {
        const loop = new THREE.Mesh(ringGeo, glossy(C.licorice));
        loop.scale.setScalar(0.085);
        loop.position.set(0, side * 0.085, 0);
        loop.rotation.x = Math.PI / 2;
        bow.add(loop);
        const fill = new THREE.Mesh(cylGeo, glossy(C.cane));
        fill.scale.set(0.055, 0.03, 0.055);
        fill.position.set(0, side * 0.085, 0);
        bow.add(fill);
        const tail = box(C.licorice, 0.035, 0.13, 0.035, side * 0.035, -0.11, 0, 0.2);
        tail.rotation.z = side * 0.4;
        bow.add(tail);
      }
      bow.add(ball(C.cane, 0.045, 0, 0, 0, 0.045, 0.045, glossy(C.cane)));
      g.add(bow);
      return { mesh: g, attach: "head" };
    }

    case "bubblegum": {
      // a bubble blown out in front of her mouth, thin enough to see her
      // through it, with the gum itself still on her lip
      const bubble = new THREE.Mesh(
        sphereGeo,
        lam(C.blush, { flat: true, roughness: 0.08, transparent: true, opacity: 0.62 }),
      );
      bubble.scale.setScalar(0.135);
      bubble.position.set(0, 0.44, 0.24);
      g.add(bubble);
      const shine = new THREE.Mesh(sphereGeo, flat(C.icing, 0.1));
      shine.scale.set(0.035, 0.028, 0.02);
      shine.position.set(-0.05, 0.48, 0.35);
      g.add(shine);
      g.add(ball(C.pink, 0.035, 0, 0.415, 0.13, 0.026, 0.03, glossy(C.pink)));
      return { mesh: g, attach: "head" };
    }

    case "bigswirl": {
      // a swirl lolly nearly as wide as she is, on a stick she holds two-handed
      const stick = new THREE.Mesh(cylGeo, flat(C.icing, 0.35));
      stick.scale.set(0.022, 0.42, 0.022);
      stick.position.y = 0.2;
      g.add(stick);
      const disc = new THREE.Mesh(cylGeo, glossy(C.pink));
      disc.scale.set(0.24, 0.035, 0.24);
      disc.rotation.x = Math.PI / 2;
      disc.position.y = 0.52;
      disc.castShadow = true;
      g.add(disc);
      // the swirl, as a spiral of short bars laid on the face
      for (let i = 0; i < 26; i++) {
        const t = i / 26;
        const a = t * Math.PI * 4.6;
        const r = 0.035 + t * 0.19;
        const bar = box(i % 2 ? C.icing : C.cane, 0.05, 0.05, 0.022, Math.cos(a) * r, 0.52 + Math.sin(a) * r, 0.038, 0.18);
        bar.rotation.z = a;
        g.add(bar);
      }
      return { mesh: g, attach: "hand" };
    }

    case "cottoncloud": {
      // a cloud of candy floss riding on her back, pink one side, blue the
      // other, on a paper cone she has tucked through the straps
      const cone = new THREE.Mesh(coneGeo, flat(C.icing, 0.45));
      cone.scale.set(0.06, 0.2, 0.06);
      cone.position.set(0, 0.42, -0.14);
      cone.rotation.x = -0.25;
      g.add(cone);
      const puffs: [number, number, number, number, string][] = [
        [0, 0.66, -0.2, 0.16, C.blush],
        [-0.14, 0.61, -0.19, 0.12, C.sky],
        [0.14, 0.62, -0.2, 0.125, C.blush],
        [0.02, 0.74, -0.24, 0.11, C.sky],
        [-0.08, 0.72, -0.25, 0.095, C.blush],
      ];
      for (const [x, y, z, r, c] of puffs) {
        g.add(ball(c, r, x, y, z, r * 0.92, r * 0.9, lam(c, { flat: true, roughness: 0.85 })));
      }
      return { mesh: g, attach: "torso" };
    }

    case "gumballhat": {
      // a gumball machine worn as a hat: a red base, a glass dome and the
      // sweets loose inside it
      const base = new THREE.Mesh(cylGeo, flat(C.cane, 0.4));
      base.scale.set(0.2, 0.06, 0.2);
      base.position.y = 0.63;
      base.castShadow = true;
      g.add(base);
      const dome = new THREE.Mesh(
        sphereGeo,
        lam("#d8f0ff", { flat: true, roughness: 0.06, transparent: true, opacity: 0.42 }),
      );
      dome.scale.setScalar(0.19);
      dome.position.y = 0.76;
      g.add(dome);
      const balls = [C.cane, C.sun, C.mint, C.lilac, C.orange, C.pink, C.sky, C.lime];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 * 1.7;
        const r = 0.055 + (i % 3) * 0.045;
        g.add(ball(balls[i % balls.length]!, 0.042, Math.cos(a) * r, 0.7 + (i % 4) * 0.045, Math.sin(a) * r, 0.042, 0.042, glossy(balls[i % balls.length]!)));
      }
      const knob = new THREE.Mesh(cylGeo, flat(C.icing, 0.3));
      knob.scale.set(0.035, 0.03, 0.035);
      knob.rotation.x = Math.PI / 2;
      knob.position.set(0, 0.63, 0.2);
      g.add(knob);
      return { mesh: g, attach: "head" };
    }
  }
}
