import * as THREE from "three";
import { glowMaterial } from "./furniture";
import type { PieceDef } from "./build-pieces";
import { makeBuildStore } from "./build-store";
import { useHome } from "./home-store";
import { boxGeo, coneGeo, cylGeo, lam, mesh, sphereGeo } from "./meshes";
import type { PlaceArea } from "./placer";
import { CANDY_ROOMS } from "./sugar-home-mesh";

/**
 * Things she puts anywhere in her house: toys, cushions, a piano, a fish tank.
 *
 * The decorate spots choose what the room is built with — which bed, which
 * rug, which wallpaper. These are what she arranges round it, where she likes,
 * the way the build yard works (placer.ts): the Animal Crossing part, and how
 * the playroom and the studio get furnished at all. Eight she starts with, ten
 * she buys with tickets as she puts the first one down, and six only come out
 * of a gumball machine.
 */

/** made once and shared: every piece is drawn again after each change */
const TRACK = new THREE.TorusGeometry(0.36, 0.025, 6, 28);
const WATER = new THREE.BoxGeometry(0.86, 0.5, 0.46);
const ARCS = [0, 1, 2, 3, 4].map((i) => new THREE.TorusGeometry(0.42 - i * 0.05, 0.03, 6, 20, Math.PI));

const g = (...parts: THREE.Object3D[]) => {
  const out = new THREE.Group();
  out.add(...parts);
  return out;
};
const glow = (geo: THREE.BufferGeometry, color: string, s: number, x: number, y: number, z: number, k = 1.2) => {
  const m = new THREE.Mesh(geo, glowMaterial(color, k, 0.3));
  m.scale.setScalar(s);
  m.position.set(x, y, z);
  return m;
};

function bear(c: string, ear = c) {
  return g(
    mesh(sphereGeo, c, 0.26, 0.28, 0.22, 0, 0.28, 0),
    mesh(sphereGeo, c, 0.19, 0.19, 0.19, 0, 0.66, 0),
    mesh(sphereGeo, ear, 0.07, 0.07, 0.05, -0.14, 0.82, 0),
    mesh(sphereGeo, ear, 0.07, 0.07, 0.05, 0.14, 0.82, 0),
    mesh(sphereGeo, "#fff4e0", 0.08, 0.06, 0.05, 0, 0.62, 0.16, false),
    mesh(sphereGeo, "#3a2a26", 0.025, 0.025, 0.02, -0.07, 0.72, 0.17, false),
    mesh(sphereGeo, "#3a2a26", 0.025, 0.025, 0.02, 0.07, 0.72, 0.17, false),
    mesh(sphereGeo, c, 0.09, 0.14, 0.09, -0.24, 0.34, 0.05),
    mesh(sphereGeo, c, 0.09, 0.14, 0.09, 0.24, 0.34, 0.05),
  );
}

export const HOUSE_ITEMS: PieceDef[] = [
  /* ------------------------------------------------------------ starters */
  { id: "teddy", name: "Teddy bear", icon: "🧸", h: 2, colored: true, solid: 0.26, make: (c) => bear(c) },
  {
    id: "beanbag",
    name: "Beanbag",
    icon: "🛋️",
    h: 1,
    colored: true,
    solid: 0.42,
    make: (c) => g(mesh(sphereGeo, c, 0.46, 0.3, 0.46, 0, 0.3, 0), mesh(sphereGeo, c, 0.36, 0.3, 0.2, 0, 0.5, -0.24)),
  },
  {
    id: "cushions",
    name: "Cushion pile",
    icon: "🟪",
    h: 1,
    make: () =>
      g(
        mesh(boxGeo, "#ff93c4", 0.62, 0.16, 0.62, 0, 0.08, 0),
        mesh(boxGeo, "#6fe3c4", 0.54, 0.16, 0.54, 0.04, 0.24, -0.02),
        mesh(boxGeo, "#ffe36b", 0.46, 0.16, 0.46, -0.03, 0.4, 0.03),
      ),
  },
  {
    id: "blocks",
    name: "Toy blocks",
    icon: "🔤",
    h: 1,
    make: () =>
      g(
        mesh(boxGeo, "#e8384f", 0.24, 0.24, 0.24, -0.16, 0.12, -0.1),
        mesh(boxGeo, "#7ec8ff", 0.24, 0.24, 0.24, 0.12, 0.12, -0.12),
        mesh(boxGeo, "#ffe36b", 0.24, 0.24, 0.24, -0.02, 0.12, 0.16),
        mesh(boxGeo, "#6fe3c4", 0.24, 0.24, 0.24, -0.03, 0.36, -0.1),
      ),
  },
  {
    id: "balloons",
    name: "Balloons",
    icon: "🎈",
    h: 4,
    make: () => {
      const out = g();
      ["#ff6b6b", "#ffe36b", "#7ec8ff", "#b98cff"].forEach((c, i) => {
        const a = (i / 4) * Math.PI * 2;
        out.add(mesh(sphereGeo, c, 0.17, 0.21, 0.17, Math.cos(a) * 0.14, 1.6 + (i % 2) * 0.18, Math.sin(a) * 0.14));
        out.add(mesh(cylGeo, "#ffffff", 0.006, 1.5, 0.006, Math.cos(a) * 0.07, 0.8, Math.sin(a) * 0.07, false));
      });
      out.add(mesh(boxGeo, "#c98a4b", 0.14, 0.08, 0.14, 0, 0.04, 0));
      return out;
    },
  },
  {
    id: "stool",
    name: "Mushroom stool",
    icon: "🍄",
    h: 1,
    colored: true,
    solid: 0.28,
    make: (c) =>
      g(mesh(cylGeo, "#fff4e0", 0.14, 0.34, 0.14, 0, 0.17, 0), mesh(sphereGeo, c, 0.32, 0.14, 0.32, 0, 0.36, 0), mesh(sphereGeo, "#ffffff", 0.05, 0.03, 0.05, 0.12, 0.47, 0.06, false)),
  },
  {
    id: "bookshelf",
    name: "Bookshelf",
    icon: "📚",
    h: 4,
    turns: true,
    boxes: [{ x0: -0.45, x1: 0.45, z0: -0.2, z1: 0.2, y0: 0, y1: 1.8 }],
    make: () => {
      const out = g(mesh(boxGeo, "#c98a4b", 0.9, 1.8, 0.4, 0, 0.9, 0));
      const books = ["#e8384f", "#7ec8ff", "#ffe36b", "#6fe3c4", "#b98cff", "#ff93c4"];
      for (let row = 0; row < 3; row++)
        for (let i = 0; i < 5; i++)
          out.add(mesh(boxGeo, books[(i + row) % books.length]!, 0.13, 0.36 - (i % 2) * 0.06, 0.28, -0.3 + i * 0.15, 0.36 + row * 0.55, 0.04, false));
      return out;
    },
  },
  {
    id: "toychest",
    name: "Toy chest",
    icon: "🧰",
    h: 2,
    colored: true,
    turns: true,
    boxes: [{ x0: -0.42, x1: 0.42, z0: -0.28, z1: 0.28, y0: 0, y1: 0.6 }],
    make: (c) =>
      g(
        mesh(boxGeo, c, 0.84, 0.46, 0.56, 0, 0.23, 0),
        mesh(boxGeo, "#fff4e0", 0.88, 0.14, 0.6, 0, 0.53, 0),
        mesh(sphereGeo, "#ffd84a", 0.05, 0.05, 0.03, 0, 0.4, 0.29, false),
      ),
  },

  /* --------------------------------------------------- bought with tickets */
  {
    id: "dollhouse",
    name: "Dollhouse",
    icon: "🏠",
    h: 3,
    price: 40,
    turns: true,
    solid: 0.4,
    make: () => {
      const roof = mesh(coneGeo, "#e8384f", 0.52, 0.45, 0.52, 0, 1.05, 0);
      roof.rotation.y = Math.PI / 4;
      return g(
        mesh(boxGeo, "#ffd1e6", 0.72, 0.82, 0.62, 0, 0.41, 0),
        roof,
        mesh(boxGeo, "#7ec8ff", 0.18, 0.18, 0.02, -0.18, 0.55, 0.32, false),
        mesh(boxGeo, "#7ec8ff", 0.18, 0.18, 0.02, 0.18, 0.55, 0.32, false),
        mesh(boxGeo, "#c98a4b", 0.16, 0.26, 0.02, 0, 0.13, 0.32, false),
      );
    },
  },
  {
    id: "train",
    name: "Toy train",
    icon: "🚂",
    h: 1,
    price: 30,
    turns: true,
    make: () => {
      const track = new THREE.Mesh(TRACK, lam("#7a4a2e", { flat: true }));
      track.rotation.x = -Math.PI / 2;
      track.position.y = 0.02;
      const train = g(
        mesh(boxGeo, "#e8384f", 0.2, 0.14, 0.12, 0, 0.1, 0),
        mesh(boxGeo, "#e8384f", 0.08, 0.1, 0.1, -0.06, 0.2, 0),
        mesh(cylGeo, "#3a2a26", 0.03, 0.08, 0.03, 0.06, 0.2, 0),
      );
      train.position.set(0, 0, 0.36);
      // round and round the track
      const spinner = g(train);
      spinner.userData.spin = true;
      return g(track, spinner);
    },
  },
  {
    id: "fishtank",
    name: "Fish tank",
    icon: "🐠",
    h: 3,
    price: 60,
    turns: true,
    boxes: [{ x0: -0.45, x1: 0.45, z0: -0.25, z1: 0.25, y0: 0, y1: 1.3 }],
    make: () => {
      const water = new THREE.Mesh(WATER, lam("#7ec8ff", { transparent: true, opacity: 0.45, flat: true, roughness: 0.05 }));
      water.position.y = 1.02;
      return g(
        mesh(boxGeo, "#c98a4b", 0.9, 0.76, 0.5, 0, 0.38, 0),
        water,
        mesh(sphereGeo, "#ffae5c", 0.08, 0.05, 0.03, -0.15, 1.05, 0, false),
        mesh(sphereGeo, "#ff93c4", 0.07, 0.05, 0.03, 0.18, 0.95, 0.05, false),
        mesh(coneGeo, "#6fe3c4", 0.05, 0.3, 0.05, 0.28, 0.93, -0.1, false),
      );
    },
  },
  {
    id: "piano",
    name: "Candy piano",
    icon: "🎹",
    h: 3,
    price: 90,
    turns: true,
    boxes: [{ x0: -0.48, x1: 0.48, z0: -0.3, z1: 0.3, y0: 0, y1: 1.2 }],
    make: () => {
      const out = g(mesh(boxGeo, "#ff93c4", 0.96, 1.2, 0.36, 0, 0.6, -0.12), mesh(boxGeo, "#ff93c4", 0.96, 0.1, 0.3, 0, 0.72, 0.18));
      for (let i = 0; i < 8; i++) out.add(mesh(boxGeo, "#ffffff", 0.1, 0.03, 0.2, -0.38 + i * 0.11, 0.78, 0.2, false));
      for (let i = 0; i < 5; i++) out.add(mesh(boxGeo, "#3a2a26", 0.06, 0.04, 0.12, -0.33 + i * 0.16, 0.8, 0.16, false));
      return out;
    },
  },
  {
    id: "tent",
    name: "Play tent",
    icon: "⛺",
    h: 3,
    price: 45,
    colored: true,
    make: (c) => {
      const tent = mesh(coneGeo, c, 0.5, 1.2, 0.5, 0, 0.6, 0);
      tent.rotation.y = Math.PI / 4;
      return g(tent, mesh(sphereGeo, "#ffe36b", 0.06, 0.06, 0.06, 0, 1.24, 0, false));
    },
  },
  {
    id: "discoball",
    name: "Disco ball",
    icon: "🪩",
    h: 4,
    price: 50,
    make: () => {
      const ball = glow(sphereGeo, "#e8f4ff", 0.26, 0, 1.6, 0, 0.4);
      ball.userData.spin = true;
      return g(mesh(cylGeo, "#d8dde4", 0.03, 1.35, 0.03, 0, 0.68, 0), mesh(cylGeo, "#d8dde4", 0.2, 0.05, 0.2, 0, 0.03, 0), ball);
    },
  },
  {
    id: "rockinghorse",
    name: "Rocking horse",
    icon: "🐴",
    h: 2,
    price: 35,
    colored: true,
    turns: true,
    boxes: [{ x0: -0.2, x1: 0.2, z0: -0.4, z1: 0.4, y0: 0, y1: 0.8 }],
    make: (c) =>
      g(
        mesh(boxGeo, "#c98a4b", 0.08, 0.06, 0.8, -0.14, 0.05, 0),
        mesh(boxGeo, "#c98a4b", 0.08, 0.06, 0.8, 0.14, 0.05, 0),
        mesh(boxGeo, c, 0.24, 0.24, 0.56, 0, 0.5, 0),
        mesh(boxGeo, c, 0.18, 0.34, 0.16, 0, 0.74, 0.3),
        mesh(boxGeo, c, 0.16, 0.14, 0.24, 0, 0.88, 0.4),
        mesh(boxGeo, "#fff4e0", 0.04, 0.3, 0.14, 0, 0.8, 0.18, false),
      ),
  },
  {
    id: "telescope",
    name: "Telescope",
    icon: "🔭",
    h: 3,
    price: 55,
    turns: true,
    solid: 0.22,
    make: () => {
      const tube = mesh(cylGeo, "#7ec8ff", 0.09, 0.8, 0.09, 0, 1.1, 0.1);
      tube.rotation.x = -0.7;
      return g(
        mesh(cylGeo, "#c98a4b", 0.025, 1.0, 0.025, -0.12, 0.5, 0),
        mesh(cylGeo, "#c98a4b", 0.025, 1.0, 0.025, 0.12, 0.5, 0),
        mesh(cylGeo, "#c98a4b", 0.025, 1.0, 0.025, 0, 0.5, -0.14),
        tube,
      );
    },
  },
  {
    id: "slide",
    name: "Mini slide",
    icon: "🛝",
    h: 3,
    price: 70,
    colored: true,
    turns: true,
    // solid only as the ladder end: the chute is a step down she can walk off
    boxes: [{ x0: -0.3, x1: 0.3, z0: -0.5, z1: -0.1, y0: 0, y1: 1.0 }],
    make: (c) => {
      const chute = mesh(boxGeo, c, 0.5, 0.06, 1.0, 0, 0.55, 0.2);
      chute.rotation.x = 0.8;
      return g(mesh(boxGeo, "#fff4e0", 0.6, 1.0, 0.4, 0, 0.5, -0.3), chute);
    },
  },
  {
    id: "clock",
    name: "Candy clock",
    icon: "🕰️",
    h: 4,
    price: 25,
    turns: true,
    boxes: [{ x0: -0.25, x1: 0.25, z0: -0.2, z1: 0.2, y0: 0, y1: 1.9 }],
    make: () =>
      g(
        mesh(boxGeo, "#7a4a2e", 0.5, 1.9, 0.36, 0, 0.95, 0),
        mesh(cylGeo, "#fff4e0", 0.18, 0.04, 0.18, 0, 1.55, 0.19).rotateX(Math.PI / 2),
        mesh(boxGeo, "#3a2a26", 0.02, 0.12, 0.02, 0, 1.58, 0.22, false),
        mesh(sphereGeo, "#ffd84a", 0.07, 0.07, 0.03, 0, 0.7, 0.19, false),
      ),
  },

  /* ------------------------------------------ gumball machine prizes */
  {
    id: "unicornplush",
    name: "Unicorn plush",
    icon: "🦄",
    h: 2,
    prize: true,
    solid: 0.28,
    make: () => {
      const b = bear("#fff4ff", "#ffb7d5");
      b.add(mesh(coneGeo, "#ffd84a", 0.04, 0.2, 0.04, 0, 0.92, 0.06, false));
      return b;
    },
  },
  {
    id: "rainbowlamp",
    name: "Rainbow lamp",
    icon: "🌈",
    h: 3,
    prize: true,
    solid: 0.2,
    make: () => {
      const out = g(mesh(cylGeo, "#fff4e0", 0.18, 0.08, 0.18, 0, 0.04, 0), mesh(cylGeo, "#fff4e0", 0.03, 0.7, 0.03, 0, 0.4, 0));
      ["#ff6b6b", "#ffae5c", "#ffe36b", "#6fe3c4", "#7ec8ff"].forEach((c, i) => {
        const arc = new THREE.Mesh(ARCS[i]!, glowMaterial(c, 0.9, 0.3));
        arc.position.y = 0.78;
        out.add(arc);
      });
      return out;
    },
  },
  {
    id: "playhouse",
    name: "Castle playhouse",
    icon: "🏰",
    h: 4,
    prize: true,
    colored: true,
    turns: true,
    // open at the front: she can stand inside it
    boxes: [
      { x0: -0.5, x1: 0.5, z0: -0.5, z1: -0.4, y0: 0, y1: 1.6 },
      { x0: -0.5, x1: -0.4, z0: -0.5, z1: 0.5, y0: 0, y1: 1.6 },
      { x0: 0.4, x1: 0.5, z0: -0.5, z1: 0.5, y0: 0, y1: 1.6 },
    ],
    make: (c) => {
      const out = g(mesh(boxGeo, c, 1, 1.6, 0.1, 0, 0.8, -0.45), mesh(boxGeo, c, 0.1, 1.6, 1, -0.45, 0.8, 0), mesh(boxGeo, c, 0.1, 1.6, 1, 0.45, 0.8, 0));
      for (const x of [-0.4, 0, 0.4]) out.add(mesh(boxGeo, c, 0.18, 0.2, 0.18, x, 1.7, -0.45));
      out.add(mesh(cylGeo, "#fff4e0", 0.02, 0.6, 0.02, 0.45, 2.0, 0.45));
      out.add(mesh(boxGeo, "#e8384f", 0.02, 0.18, 0.28, 0.45, 2.18, 0.3, false));
      return out;
    },
  },
  {
    id: "trophy",
    name: "Golden trophy",
    icon: "🏆",
    h: 2,
    prize: true,
    solid: 0.22,
    make: () => {
      const gold = lam("#ffd84a", { flat: true, roughness: 0.2, emissive: "#8a6a10" });
      const part = (geo: THREE.BufferGeometry, sx: number, sy: number, sz: number, y: number) => {
        const m = new THREE.Mesh(geo, gold);
        m.scale.set(sx, sy, sz);
        m.position.y = y;
        return m;
      };
      return g(mesh(boxGeo, "#7a4a2e", 0.34, 0.16, 0.34, 0, 0.08, 0), part(cylGeo, 0.05, 0.3, 0.05, 0.3), part(sphereGeo, 0.18, 0.2, 0.18, 0.6));
    },
  },
  {
    id: "starprojector",
    name: "Star projector",
    icon: "🌟",
    h: 1,
    prize: true,
    make: () => {
      const out = g(mesh(sphereGeo, "#3a3060", 0.22, 0.18, 0.22, 0, 0.18, 0));
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const star = glow(sphereGeo, "#fff3b0", 0.035, Math.cos(a) * 0.14, 0.3 + (i % 2) * 0.04, Math.sin(a) * 0.14, 1.5);
        out.add(star);
      }
      out.userData.spin = true;
      return out;
    },
  },
  {
    id: "gumballmini",
    name: "Mini gumball machine",
    icon: "🍬",
    h: 3,
    prize: true,
    solid: 0.26,
    make: () => {
      const globe = new THREE.Mesh(sphereGeo, lam("#eaf6ff", { flat: true, transparent: true, opacity: 0.35, roughness: 0.05 }));
      globe.scale.setScalar(0.28);
      globe.position.y = 1.02;
      const out = g(mesh(cylGeo, "#d6253f", 0.24, 0.72, 0.24, 0, 0.36, 0), globe, mesh(sphereGeo, "#c8a040", 0.08, 0.08, 0.08, 0, 1.33, 0, false));
      ["#ff93c4", "#6fe3c4", "#ffe36b", "#b98cff", "#7ec8ff"].forEach((c, i) => {
        const a = i * 1.3;
        out.add(mesh(sphereGeo, c, 0.07, 0.07, 0.07, Math.cos(a) * 0.13, 0.9 + (i % 3) * 0.08, Math.sin(a) * 0.13, false));
      });
      return out;
    },
  },
];

export const HOUSE_ITEM = new Map(HOUSE_ITEMS.map((p) => [p.id, p]));
export const HOUSE_PRIZE_ITEMS = HOUSE_ITEMS.filter((p) => p.prize).map((p) => p.id);

/** What she has put round her house, saved in its own slot. */
export const useHouseBuild = makeBuildStore("sloanies-world-house-items-v1", HOUSE_ITEMS);

/**
 * Her rooms as a placing grid: every whole square inside a room she has built,
 * in the room's frame from the west end of the tower room to the east end of
 * the kitchen, and from the back of the playroom to the front of the studio.
 */
const MIN_X = Math.min(...CANDY_ROOMS.map((r) => r.rect.x0));
const MAX_X = Math.max(...CANDY_ROOMS.map((r) => r.rect.x1));
const MIN_Z = Math.min(...CANDY_ROOMS.map((r) => r.rect.z0));
const MAX_Z = Math.max(...CANDY_ROOMS.map((r) => r.rect.z1));

export function houseArea(room: [number, number, number]): PlaceArea {
  return {
    x0: room[0] + MIN_X,
    z0: room[2] + MIN_Z,
    y0: room[1],
    cols: Math.ceil(MAX_X - MIN_X),
    rows: Math.ceil(MAX_Z - MIN_Z),
    // 3.24m is where the ceiling beams start; a stack stops under them
    maxLevel: 6,
    fits: (gx, gz) => {
      const x0 = MIN_X + gx;
      const z0 = MIN_Z + gz;
      const stage = useHome.getState().stage;
      return CANDY_ROOMS.some((r) => r.stage <= stage && x0 >= r.rect.x0 && x0 + 1 <= r.rect.x1 && z0 >= r.rect.z0 && z0 + 1 <= r.rect.z1);
    },
    catalogue: HOUSE_ITEM,
    store: useHouseBuild,
  };
}
