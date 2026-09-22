import * as THREE from "three";
import { create } from "zustand";
import { sfx } from "./audio";
import { beveledBox } from "./beveled";
import type { AABB } from "./collision";
import { cylGeo, lam, mesh, signBoard, sphereGeo } from "./meshes";
import { CandyQuest } from "./candy-quest";
import { SUGAR } from "./sugar-rush";
import { useGame } from "./store";

/**
 * Inside the chocolate factory.
 *
 * Built the way her house is (home.ts): the shell of the factory out in the
 * park stays a solid landmark, and the inside is a separate room standing
 * high above it, so it cannot be seen from the park and the minimap still
 * shows her at the factory. Walking up to either front door and pressing
 * Collect teleports her up; the WAY OUT door puts her back on the doorstep
 * she came in by.
 *
 * The room is a 30 x 16m hall, which is deliberately bigger than the building
 * outside: the point of going in is to have somewhere to run about. The
 * machinery is pushed to the edges — the mixing vat and the moulding line
 * down the far side, the silos and crates along the near wall, the control
 * desk on the east wall — so the middle stays clear.
 *
 * Nothing in here casts a shadow. The sun's shadow camera follows her at
 * ground level, four hundred metres below, so a cast shadow up here is either
 * missing or wrong; flat-lit with bright candy colours is what the room is
 * designed around.
 */

/* ---------------------------------------------------------------- palette */

const CHOC = "#5d3a22";
const CHOC_LIGHT = "#8a5a34";
const CHOC_DARK = "#3e2617";
/** the river's brown, same as the park's chocolate water */
const RIVER = "#6e3f1e";
const CREAM = "#f7ead3";
/** the warm white that does not bloom; trim only, never a whole surface */
const ICING = "#f6f1e8";
const WAFER = "#e8b86a";
const TOFFEE = "#c9924e";
const STEEL = "#b8c2c8";
const RED = "#e8384f";
const PINK = "#ff6aa8";
const YELLOW = "#ffc83a";
const MINT = "#6fe3c4";
const LILAC = "#b06aff";
const ORANGE = "#ff8a3a";
const SWEETS = [RED, PINK, YELLOW, MINT, LILAC, ORANGE];

/** Candy is moulded sugar: no procedural wood grain on any of it. */
const flat = (c: string, roughness = 0.42) => lam(c, { flat: true, roughness });
/**
 * Chocolate wants the dough mottle, or a wall this size blooms out white.
 *
 * Everything large in here also carries a dim emissive of its own colour. The
 * sun is four hundred metres below with its shadow camera following her on
 * the ground, so it only ever rakes this room from one side: without the lift
 * a chocolate wall facing away from it, and the whole underside of the
 * ceiling, come out flat black. The lift is the room's own lamplight.
 */
const choc = (c: string, lift: string, repeat = 5) => lam(c, { tex: "dough", repeat, roughness: 0.5, emissive: lift });
/** A painted surface with the same lamplight lift. */
const lit = (c: string, lift: string, roughness = 0.5) => lam(c, { flat: true, roughness, emissive: lift });

/* ---------------------------------------------------------------- the room */

/** Inside span: x -15..15, z -6.4..10, floor at y 0, ceiling at 7. */
const IN = { x0: -15, x1: 15, z0: -6.4, z1: 10, h: 7 };
const WALL = 0.5;
/** the river wall: she looks through it, she never gets past it */
const GALLERY_Z = -6.4;
/** the chocolate's surface in the trench behind the river wall */
const RIVER_Y = 0.05;
/** where she lands coming in, and the doorstep she leaves from */
const ENTRY = { spawn: [0, 0, 7.8] as [number, number, number], door: [0, 0, 8.9] as [number, number, number], yaw: 0 };
/** the big lever on the control desk */
const LEVER_AT: [number, number] = [12.6, 4];

/**
 * The room's origin: straight above the factory, at a height nothing else in
 * the game uses (park 1's house room sits at 150).
 */
const ROOM: [number, number, number] = [SUGAR.factory.x, 420, SUGAR.factory.z];

/**
 * The factory's two front doors, in world space.
 *
 * makeCandyFactory draws them at local (+-4.6, 1.45, +8.11) on its +z face,
 * and factoryProps stands the building at (-18, -58) turned a quarter
 * (ry = PI/2). A quarter turn sends local (x, z) to world (z, -x), so the
 * front ends up facing east and both doors land on the x = -10 wall, one
 * either side of the river channel.
 */
const DOOR_X = SUGAR.factory.x + 8.11;
/** she stands this far out from the wall to be offered the way in */
const STEP_X = SUGAR.factory.x + 9.1;
const DOOR_Z: [number, number] = [SUGAR.factory.z - 4.6, SUGAR.factory.z + 4.6];

export type FactoryNear = "door" | "exit" | "lever" | null;

/**
 * What the UI needs to know about the factory: whether she is inside (the
 * camera goes first person, as it does in her house and the caves) and what
 * pressing Collect would do. Its own little store so the house's store never
 * has to share — park 2 gets her own gingerbread house later, and both would
 * have been writing the same field.
 */
type FactoryStore = {
  inside: boolean;
  near: FactoryNear;
  setInside: (v: boolean) => void;
  setNear: (v: FactoryNear) => void;
};

export const useChocFactory = create<FactoryStore>((set, get) => ({
  inside: false,
  near: null,
  setInside: (v) => {
    if (get().inside !== v) set({ inside: v });
  },
  setNear: (v) => {
    if (get().near !== v) set({ near: v });
  },
}));

/* ------------------------------------------------------------- tiny makers */

/** A beveled box in a material of my choosing, placed as meshes.ts places one. */
function bm(mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number) {
  const m = new THREE.Mesh(beveledBox(sx, sy, sz), mat);
  m.position.set(x, y, z);
  m.castShadow = false;
  m.receiveShadow = true;
  return m;
}

/** The rim of a vat: a ring lying flat, so what is in the vat still shows. */
const RIM = new THREE.TorusGeometry(1, 0.055, 6, 22).rotateX(Math.PI / 2);

/** A scaled primitive in a material of my choosing: mesh()'s non-box branch. */
function pm(geo: THREE.BufferGeometry, mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = false;
  m.receiveShadow = true;
  return m;
}

/**
 * A cylinder lying on its side along x, for rollers and pipe runs. `r` is the
 * radius: mesh() scales a unit cylinder, so every scale in this file is a
 * radius, not a width.
 */
function roller(color: string, r: number, len: number, x: number, y: number, z: number) {
  const m = mesh(cylGeo, color, r, len, r, x, y, z, false);
  m.rotation.z = Math.PI / 2;
  return m;
}

export class ChocFactoryInside {
  private group = new THREE.Group();
  private colliders: AABB[] = [];
  /** solids in room-local space, turned into world colliders on construction */
  private local: AABB[] = [];
  private outside = new THREE.Group();

  /* the moving parts */
  private belt: THREE.Object3D[] = [];
  private rams: THREE.Object3D[] = [];
  private drips: THREE.Object3D[] = [];
  private buckets: THREE.Object3D[] = [];
  private swirls: THREE.Object3D[] = [];
  private bulges: THREE.Object3D[] = [];
  private needles: THREE.Object3D[] = [];
  private levers: THREE.Object3D[] = [];
  private paddle = new THREE.Group();
  private vatChoc = new THREE.Group();
  private bigLever = new THREE.Group();
  /** own materials, because pulsing a lam() material would pulse the whole park */
  private lampMats: THREE.MeshStandardMaterial[] = [];
  private ringMats: THREE.MeshStandardMaterial[] = [];
  /**
   * Geometry and materials this room made for itself. Everything else it draws
   * with comes out of the shared caches in beveled.ts and meshes.ts, and
   * freeing any of that would take the rest of the park's props down with it.
   */
  private owned: THREE.BufferGeometry[] = [];
  private ownedMats: THREE.Material[] = [];

  /** machine time, which the big lever speeds up; not the clock */
  private phase = 0;
  private lastT = 0;
  private fastUntil = 0;
  /** which doorstep she came in by, so WAY OUT puts her back on it */
  private cameInBy = 0;

  constructor(
    private scene: THREE.Scene,
    private worldColliders: AABB[],
  ) {
    this.buildShell();
    this.buildRiver();
    this.buildVat();
    this.buildLine();
    this.buildPipes();
    this.buildPanel();
    this.buildStores();
    this.buildDoor();

    this.group.position.set(...ROOM);
    scene.add(this.group);

    const [ox, oy, oz] = ROOM;
    for (const b of this.local) {
      this.colliders.push({ minX: b.minX + ox, maxX: b.maxX + ox, minY: b.minY + oy, maxY: b.maxY + oy, minZ: b.minZ + oz, maxZ: b.maxZ + oz });
    }
    worldColliders.push(...this.colliders);

    this.buildOutside();
    scene.add(this.outside);
  }

  /** Record a solid in room-local space. */
  private solid(minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number) {
    this.local.push({ minX, maxX, minY, maxY, minZ, maxZ });
  }

  private add(...o: THREE.Object3D[]) {
    this.group.add(...o);
  }

  /* -------------------------------------------------------------- the shell */

  private buildShell() {
    const w = IN.x1 - IN.x0;
    const d = IN.z1 - IN.z0;
    const cz = (IN.z0 + IN.z1) / 2;

    // floor: toffee, with a loose check of lighter squares. A pale floor is
    // what keeps a room made of dark chocolate readable from the doorway.
    this.add(bm(choc(TOFFEE, "#3a2a14", 8), w, 0.6, d, 0, -0.3, cz));
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        if ((i + j) % 2) continue;
        this.add(bm(flat(WAFER, 0.7), 4.6, 0.06, 4.6, -12.5 + i * 5, 0.02, -4.4 + j * 5.2));
      }
    }
    this.solid(IN.x0 - WALL, IN.x1 + WALL, -0.6, 0, GALLERY_Z, IN.z1 + WALL);

    // ceiling and its beams
    // a wafer ceiling rather than a chocolate one: the underside never sees
    // the sun, and a dark slab up there turns the whole room into a cellar
    this.add(bm(choc(WAFER, "#8a6528", 8), w + WALL * 2, 0.5, d + 4 + WALL * 2, 0, IN.h + 0.25, cz - 2));
    for (let i = 0; i < 5; i++) this.add(bm(lit(CREAM, "#6a5c40", 0.6), w, 0.32, 0.5, 0, IN.h - 0.16, -5 + i * 3.8));
    // lamps, so the light in here has somewhere to have come from
    const shade = lit(CREAM, "#7a6a48", 0.6);
    const bulb = lam("#ffe9a8", { flat: true, emissive: "#ffcf5c" });
    for (const [x, z] of [[-10, 2], [-3, -4], [4, 4], [11, -2], [11, 7]] as [number, number][]) {
      this.add(pm(cylGeo, shade, 0.8, 0.5, 0.8, x, 6.5, z));
      this.add(pm(cylGeo, bulb, 0.62, 0.14, 0.62, x, 6.21, z));
    }
    this.solid(IN.x0 - WALL, IN.x1 + WALL, IN.h, IN.h + 0.5, -10.5, IN.z1 + WALL);

    // the four outer walls. The end walls are in two pieces each, so the river
    // trench runs out through an arch rather than into a dead end.
    const wallMat = choc(CHOC_LIGHT, "#4a2e1c", 6);
    this.add(bm(wallMat, w + WALL * 2, IN.h, WALL, 0, IN.h / 2, IN.z1 + WALL / 2));
    this.solid(IN.x0 - WALL, IN.x1 + WALL, 0, IN.h, IN.z1, IN.z1 + WALL);
    this.add(bm(wallMat, w + WALL * 2, IN.h, WALL, 0, IN.h / 2, -10.2));
    for (const s of [-1, 1]) {
      const x = s * (IN.x1 + WALL / 2);
      this.add(bm(wallMat, WALL, IN.h, IN.z1 - GALLERY_Z + WALL, x, IN.h / 2, (IN.z1 + GALLERY_Z + WALL) / 2));
      this.add(bm(wallMat, WALL, IN.h - 2.4, 3.5, x, 2.4 + (IN.h - 2.4) / 2, -8.15));
      // written out rather than mirrored with s: a collider whose min is
      // greater than its max is silently never hit, and she walks out
      this.solid(s > 0 ? IN.x1 : IN.x0 - WALL, s > 0 ? IN.x1 + WALL : IN.x0, 0, IN.h, -10.5, IN.z1 + WALL);
    }

    // moulded slabs standing proud of the wall: the same trick as the outside,
    // which is what makes a brown wall read as a bar of chocolate
    for (const zs of [IN.z1 - 0.02, -6.42]) {
      for (let i = 0; i < 8; i++) {
        for (const y of [1.5, 4.3]) {
          const x = -13.1 + i * 3.75;
          if (Math.abs(x) < 2.6 || (zs < 0 && y < 3)) continue;
          this.add(bm(lit(CHOC, "#33200f", 0.55), 2.8, 2.2, 0.22, x, y, zs));
        }
      }
    }
  }

  /* ------------------------------------------ the river through the channel */

  private buildRiver() {
    // The trench behind the wall is the same channel the boat rides through
    // downstairs; from in here you look down into it through three windows.
    const z0 = -9.9;
    const z1 = GALLERY_Z - WALL;
    this.add(bm(choc(CHOC_DARK, "#2a180c", 4), 31, 1.2, z1 - z0, 0, -1, (z0 + z1) / 2));
    // the chocolate itself is lifted hardest: it sits in a trench behind a
    // wall, where nothing else would ever reach it
    this.add(bm(lit(RIVER, "#6a4020", 0.3), 31, 0.6, z1 - z0 - 0.5, 0, RIVER_Y - 0.3, (z0 + z1) / 2));
    // A cream kerb down each bank, and icing swirls on the surface instead of
    // a lighter brown. Brown chocolate in a brown trench behind a brown wall
    // was one unreadable smear; the cream is what draws the line.
    for (const z of [z1 - 0.2, z0 + 0.2]) this.add(bm(lit(CREAM, "#7a6a48", 0.6), 31, 0.34, 0.4, 0, RIVER_Y + 0.1, z));
    this.add(bm(lit(CHOC_LIGHT, "#5a3418", 0.5), 31, 2.4, 0.3, 0, 1.2, z0 + 0.15));
    for (let i = 0; i < 7; i++) {
      const s = mesh(cylGeo, ICING, 0.7, 0.08, 0.7, -15 + i * 4.3, RIVER_Y + 0.05, -8.4 + (i % 3) * 0.6, false);
      s.userData.k = i;
      this.swirls.push(s);
      this.add(s);
    }
    // gumdrops bobbing down it, so the current has something to carry
    for (let i = 0; i < 3; i++) {
      const s = mesh(sphereGeo, SWEETS[i * 2]!, 0.4, 0.35, 0.4, 0, RIVER_Y + 0.28, -8.2 + i * 0.5, false);
      s.userData.k = i + 0.5;
      s.userData.bob = RIVER_Y + 0.28;
      this.swirls.push(s);
      this.add(s);
    }

    // the river wall: a low sill, four piers, a head band, and glass in the
    // three gaps. The collider runs all the way to the ceiling so a boosted
    // jump cannot drop her into the chocolate.
    const m = choc(CHOC_LIGHT, "#4a2e1c", 4);
    const zc = GALLERY_Z - WALL / 2;
    this.add(bm(m, 31, 0.36, WALL, 0, 0.18, zc));
    this.add(bm(m, 31, 0.6, WALL, 0, 2.6, zc));
    const piers: [number, number][] = [
      [-15, -10.8],
      [-7.2, -1.8],
      [1.8, 7.2],
      [10.8, 15],
    ];
    for (const [a, b] of piers) this.add(bm(m, b - a, 1.94, WALL, (a + b) / 2, 1.33, zc));
    for (const x of [-9, 0, 9]) {
      // no glass: a tinted pane turned the chocolate below into a green
      // smear, and the wall behind it is already solid to the ceiling
      // cream frame, so the opening reads as a window and not a hole
      this.add(bm(lit(CREAM, "#7a6a48", 0.6), 3.9, 0.16, 0.26, x, 0.42, zc + 0.16));
      this.add(bm(lit(CREAM, "#7a6a48", 0.6), 3.9, 0.16, 0.26, x, 2.32, zc + 0.16));
      for (const s of [-1, 1]) this.add(bm(lit(CREAM, "#7a6a48", 0.6), 0.16, 2, 0.26, x + s * 1.87, 1.33, zc + 0.16));
    }
    this.solid(IN.x0 - WALL, IN.x1 + WALL, 0, IN.h, GALLERY_Z - WALL, GALLERY_Z);

    const board = this.board("THE CHOCOLATE RIVER", 6, 0.9);
    board.position.set(0, 3.5, GALLERY_Z - 0.2);
    this.add(board);
  }

  /* ------------------------------------------------------------ mixing vat */

  private buildVat() {
    const cx = -10.5;
    // The vat and the belt both stand clear of the river wall: the walkway
    // behind them is how she gets to the windows, and a machine parked
    // against that wall would have shut the whole gallery off.
    const cz = -1.2;
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    g.add(pm(cylGeo, lit(CHOC_LIGHT, "#4a2e1c", 0.45), 2.9, 2.2, 2.9, 0, 1.1, 0));
    // a ring, not a disc: a plate across the top hid the chocolate from
    // anyone standing on the steps, which is the whole reason for the steps
    g.add(pm(RIM, flat(STEEL, 0.35), 2.95, 2.95, 2.95, 0, 2.2, 0));
    // a hoop of gumdrop rivets, because a plain drum is just a bin
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.add(mesh(sphereGeo, SWEETS[i % SWEETS.length]!, 0.2, 0.2, 0.2, Math.cos(a) * 2.9, 1.35, Math.sin(a) * 2.9, false));
    }
    // the chocolate itself, in a group that turns
    // filled to the brim, and the brim is the top of the drum: a surface set
    // down inside a solid cylinder is hidden by the cylinder's own end cap
    this.vatChoc.position.set(0, 2.24, 0);
    this.vatChoc.add(pm(cylGeo, lit(RIVER, "#5a3418", 0.3), 2.76, 0.14, 2.76, 0, 0, 0));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      this.vatChoc.add(mesh(cylGeo, ICING, 0.34, 0.1, 0.34, Math.cos(a) * 1.85, 0.06, Math.sin(a) * 1.85, false));
    }
    g.add(this.vatChoc);
    // the stirrer: a shaft and two paddles, turning the other way to the swirl
    this.paddle.position.set(0, 2.9, 0);
    this.paddle.add(mesh(cylGeo, STEEL, 0.17, 2.4, 0.17, 0, 1.2, 0, false));
    for (const a of [0, Math.PI / 2]) {
      const arm = bm(flat(STEEL, 0.35), 5.2, 0.3, 0.26, 0, -0.42, 0);
      arm.rotation.y = a;
      this.paddle.add(arm);
    }
    g.add(this.paddle);
    this.add(g);
    this.solid(cx - 2.9, cx + 2.9, 0, 2.2, cz - 2.9, cz + 2.9);

    // three treads and a deck, so she can climb up and look in. Treads are
    // blocks standing on the floor, never slabs over a hole (cave.ts's rule).
    const steps: [number, number, number][] = [
      [0.4, 3.6, 4.3],
      [0.8, 2.9, 3.6],
      [1.2, 1.7, 2.9],
    ];
    for (const [top, a, b] of steps) {
      this.add(bm(flat(WAFER, 0.6), 5, top, b - a, cx, top / 2, (a + b) / 2));
      this.solid(cx - 2.5, cx + 2.5, 0, top, a, b);
    }
    const board = this.board("MIXING VAT", 3.4, 0.8);
    board.position.set(cx, 4.4, cz + 3.1);
    this.add(board);
  }

  /* ---------------------------------------- the belt and the moulding press */

  private buildLine() {
    const z = -3;
    const x0 = -2;
    const x1 = 14.2;
    const len = x1 - x0;
    const cx = (x0 + x1) / 2;
    this.add(bm(flat(CHOC_DARK, 0.5), len, 0.22, 1.6, cx, 0.94, z));
    for (const s of [-1, 1]) this.add(bm(flat(CREAM, 0.6), len, 0.5, 0.14, cx, 0.72, z + s * 0.8));
    for (let i = 0; i < 6; i++) this.add(bm(flat(STEEL, 0.4), 0.3, 0.85, 0.3, x0 + 0.8 + i * ((len - 1.6) / 5), 0.42, z));
    for (let i = 0; i < 9; i++) this.add(roller(STEEL, 0.13, 1.5, x0 + 0.6 + i * ((len - 1.2) / 8), 1.08, z));

    // the sweets riding it. Twelve is enough to read as a stream and cheap
    // enough to move by hand every frame.
    for (let i = 0; i < 12; i++) {
      const c = SWEETS[i % SWEETS.length]!;
      const s =
        i % 3 === 0
          ? mesh(sphereGeo, c, 0.24, 0.24, 0.24, 0, 1.26, z, false)
          : bm(flat(c, 0.35), 0.5, 0.34, 0.5, 0, 1.3, z);
      s.userData.k = i;
      this.belt.push(s);
      this.add(s);
    }
    // wide enough to swallow the press legs, so she never clips a post
    this.solid(x0, x1, 0, 1.05, z - 1.25, z + 1.15);

    // three presses straddling the belt, stamping sweets as they pass
    for (const [i, px] of [4, 7.6, 11.2].entries()) {
      for (const s of [-1, 1]) this.add(bm(flat(STEEL, 0.4), 0.34, 2.7, 0.34, px, 1.35, z + s * 1));
      this.add(bm(flat(CHOC_LIGHT, 0.5), 1.9, 0.4, 2.5, px, 2.9, z));
      const ram = new THREE.Group();
      ram.position.set(px, 2.05, z);
      ram.add(bm(flat(SWEETS[i]!, 0.35), 1.4, 0.8, 1.4, 0, 0.4, 0));
      ram.add(bm(flat(CREAM, 0.6), 1.6, 0.22, 1.6, 0, -0.05, 0));
      ram.userData.k = i;
      this.rams.push(ram);
      this.add(ram);
    }

    // the end of the line: a chute into a crate of finished sweets
    this.add(bm(flat(CHOC_LIGHT, 0.5), 1.4, 1.5, 1.6, 14.1, 1.55, z));
    this.add(bm(flat(WAFER, 0.6), 2.2, 1.1, 2.2, 13.6, 0.55, z + 2.6));
    for (let i = 0; i < 5; i++) {
      this.add(mesh(sphereGeo, SWEETS[(i + 2) % SWEETS.length]!, 0.22, 0.22, 0.22, 13.0 + (i % 3) * 0.6, 1.25, z + 2.1 + Math.floor(i / 3) * 0.7, false));
    }
    const board = this.board("MOULDING LINE", 4, 0.9);
    board.position.set(4, 4.6, z + 0.9);
    this.add(board);
  }

  /* ------------------------------------------------- pipes, drips, buckets */

  private buildPipes() {
    const z = -1.2;
    // the main run along the ceiling, with three bulges that swell as the
    // chocolate goes past: a pipe that does nothing reads as a girder
    this.add(roller(CHOC_LIGHT, 0.38, 29, 0, 5.4, z));
    for (const x of [-6, 1, 8]) {
      const b = mesh(sphereGeo, CHOC, 0.55, 0.55, 0.55, x, 5.4, z, false);
      b.userData.k = x;
      this.bulges.push(b);
      this.add(b);
    }
    for (const x of [-14.2, 13.2]) this.add(mesh(cylGeo, CHOC_LIGHT, 0.5, 1.6, 0.5, x, 6.2, z, false));

    // two down-spouts, one into the vat and one into a kettle
    const spouts: [number, number, number][] = [
      [-10.5, 3.6, 2.4],
      [6, 2.2, 1.6],
    ];
    for (const [x, bottom, land] of spouts) {
      this.add(mesh(cylGeo, CHOC_LIGHT, 0.26, 5.4 - bottom, 0.26, x, (5.4 + bottom) / 2, z, false));
      this.add(mesh(cylGeo, STEEL, 0.36, 0.24, 0.36, x, bottom, z, false));
      for (let i = 0; i < 3; i++) {
        const d = mesh(sphereGeo, RIVER, 0.16, 0.2, 0.16, x, bottom, z, false);
        d.userData.top = bottom - 0.2;
        d.userData.land = land;
        d.userData.k = i / 3;
        this.drips.push(d);
        this.add(d);
      }
    }
    // the kettle the second spout fills
    this.add(mesh(cylGeo, CHOC_DARK, 1.1, 1.6, 1.1, 6, 0.8, z, false));
    this.add(mesh(cylGeo, RIVER, 1.0, 0.1, 1.0, 6, 1.58, z, false));
    this.add(pm(RIM, flat(STEEL, 0.35), 1.1, 1.1, 1.1, 6, 1.58, z));
    this.solid(4.9, 7.1, 0, 1.6, z - 1.1, z + 1.1);

    // a bucket line crossing the room overhead, so the roof is not a lid
    this.add(bm(flat(STEEL, 0.4), 29, 0.16, 0.3, 0, 6.1, 4.6));
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Group();
      b.add(bm(flat(STEEL, 0.4), 0.1, 0.55, 0.1, 0, 0.28, 0));
      b.add(bm(flat(SWEETS[(i * 2) % SWEETS.length]!, 0.4), 1, 0.7, 0.9, 0, -0.35, 0));
      b.add(mesh(sphereGeo, CREAM, 0.42, 0.14, 0.38, 0, -0.06, 0, false));
      b.position.set(0, 5.9, 4.6);
      b.userData.k = i / 5;
      this.buckets.push(b);
      this.add(b);
    }
  }

  /* ---------------------------------------------------------- control desk */

  private buildPanel() {
    const x = 13.7;
    const g = new THREE.Group();
    g.position.set(x, 0, 4);
    g.add(bm(choc(CHOC_LIGHT, "#4a2e1c", 3), 1.7, 1.1, 5, 0, 0.55, 0));
    const top = bm(flat(CREAM, 0.6), 1.9, 0.22, 5, -0.1, 1.2, 0);
    top.rotation.z = 0.22;
    g.add(top);

    // dials with needles that sweep, on the face she walks up to
    for (let i = 0; i < 4; i++) {
      const dz = -1.65 + i * 1.1;
      const face = pm(cylGeo, lit(ICING, "#6a6050", 0.5), 0.28, 0.1, 0.28, -0.87, 0.72, dz);
      face.rotation.z = Math.PI / 2;
      g.add(face);
      const n = bm(flat(RED, 0.4), 0.04, 0.22, 0.04, -0.94, 0.72, dz);
      const pivot = new THREE.Group();
      pivot.position.set(-0.94, 0.72, dz);
      n.position.set(0, 0.09, 0);
      pivot.add(n);
      pivot.userData.k = i;
      this.needles.push(pivot);
      g.add(pivot);
    }

    // three small levers that rock on their own, and one big one she pulls
    for (let i = 0; i < 3; i++) {
      const l = new THREE.Group();
      l.position.set(-0.2, 1.3, -1.5 + i * 1.1);
      l.add(bm(flat(STEEL, 0.35), 0.12, 0.9, 0.12, 0, 0.45, 0));
      l.add(mesh(sphereGeo, SWEETS[(i + 1) % SWEETS.length]!, 0.19, 0.19, 0.19, 0, 0.9, 0, false));
      l.userData.k = i;
      this.levers.push(l);
      g.add(l);
    }
    this.bigLever.position.set(-0.3, 1.25, 2.1);
    this.bigLever.add(bm(flat(RED, 0.35), 0.18, 1.5, 0.18, 0, 0.75, 0));
    this.bigLever.add(mesh(sphereGeo, YELLOW, 0.27, 0.27, 0.27, 0, 1.5, 0, false));
    g.add(this.bigLever);
    g.add(bm(flat(CHOC_DARK, 0.5), 0.5, 0.3, 1.4, -0.4, 1.12, 2.1));

    // blinking lamps. Own materials: pulsing a lam() material would pulse
    // every sweet in the park that shares its colour.
    for (let i = 0; i < 4; i++) {
      const c = i % 2 ? MINT : YELLOW;
      const m = new THREE.MeshStandardMaterial({ color: c, emissive: new THREE.Color(c), emissiveIntensity: 1, roughness: 0.4 });
      this.lampMats.push(m);
      const l = new THREE.Mesh(sphereGeo, m);
      l.scale.set(0.17, 0.17, 0.17);
      l.position.set(-0.52, 2.55, -1.8 + i * 1.2);
      g.add(l);
    }
    g.add(bm(lit(CHOC, "#4a2e1c", 0.5), 0.34, 1.7, 5, -0.4, 1.95, 0));
    this.add(g);
    this.solid(x - 0.95, x + 0.95, 0, 1.4, 4 - 2.5, 4 + 2.5);

    const board = this.board("SWEET CONTROL", 4.2, 1);
    board.position.set(IN.x1 - 0.12, 3.6, 4);
    board.rotation.y = -Math.PI / 2;
    this.add(board);
  }

  /* ------------------------------------------- silos, crates, the middle */

  private buildStores() {
    // four glass silos of sweets along the near wall, two each side of the door
    for (const [i, x] of [-12.6, -8.8, 8.8, 12.6].entries()) {
      const z = 8.5;
      this.add(mesh(cylGeo, STEEL, 1.2, 0.4, 1.2, x, 0.2, z, false));
      this.add(bm(lam(SWEETS[i]!, { flat: true, opacity: 0.3 }), 2, 3.4, 2, x, 2.1, z));
      this.add(mesh(cylGeo, CREAM, 1.25, 0.3, 1.25, x, 3.9, z, false));
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        this.add(mesh(sphereGeo, SWEETS[(i + k) % SWEETS.length]!, 0.3, 0.3, 0.3, x + Math.cos(a) * 0.52, 0.9 + k * 0.4, z + Math.sin(a) * 0.52, false));
      }
      this.solid(x - 1.1, x + 1.1, 0, 3.9, z - 1.1, z + 1.1);
    }

    // a stack of crates in the far corner, to give the eye something there
    const crates: [number, number, number, number][] = [
      [-13.4, 0.6, 4.6, 1.2],
      [-13.4, 1.8, 4.6, 1.2],
      [-13.4, 0.6, 6.2, 1.2],
    ];
    for (const [x, y, z, s] of crates) {
      this.add(bm(flat(WAFER, 0.7), s, s, s, x, y, z));
      this.add(bm(flat(CREAM, 0.6), s + 0.1, 0.12, s + 0.1, x, y + s / 2, z));
    }
    this.solid(-14, -12.8, 0, 2.4, 4, 5.2);
    this.solid(-14, -12.8, 0, 1.2, 5.6, 6.8);

    // a chocolate-drop medallion on the open floor: the middle stays clear to
    // run in, but it should not be a blank slab either
    this.add(mesh(cylGeo, PINK, 2.4, 0.06, 2.4, 1, 0.05, 3.5, false));
    this.add(mesh(cylGeo, CREAM, 1.95, 0.06, 1.95, 1, 0.07, 3.5, false));
    // a chocolate drop inlaid in the floor, kept low: anything she can walk
    // through should not be tall enough to look like something she cannot
    this.add(mesh(cylGeo, CHOC, 1.45, 0.06, 1.45, 1, 0.09, 3.5, false));
  }

  /* ------------------------------------------------------------ the way out */

  private buildDoor() {
    const [dx, , dz] = ENTRY.door;
    const z = IN.z1 - 0.02;
    this.add(bm(flat(CHOC_DARK, 0.5), 2.6, 3.1, 0.22, dx, 1.55, z));
    for (const s of [-1, 1]) this.add(bm(flat(WAFER, 0.6), 1.1, 2.9, 0.12, dx + s * 0.62, 1.5, z - 0.12));
    this.add(bm(flat(CREAM, 0.6), 3, 0.28, 0.3, dx, 3.24, z - 0.06));
    const board = this.board("WAY OUT", 3, 0.8);
    board.position.set(dx, 4.1, z - 0.2);
    board.rotation.y = Math.PI;
    this.add(board);
    // a glowing ring on the floor at the door, the same cue as her front door
    this.add(this.glowRing(dx, 0.06, dz));
  }

  /**
   * A name board, remembered so dispose() can free it: signBoard bakes a
   * canvas texture and a geometry per board, neither of them shared.
   */
  private board(text: string, w: number, h: number) {
    const b = signBoard(text, w, h);
    this.owned.push(b.geometry);
    for (const m of b.material as THREE.Material[]) {
      const map = (m as THREE.MeshStandardMaterial).map;
      if (map instanceof THREE.CanvasTexture) this.ownedMats.push(m);
    }
    return b;
  }

  /** The doorstep marker: a torus that breathes, in its own material. */
  private glowRing(x: number, y: number, z: number) {
    const m = new THREE.MeshStandardMaterial({
      color: "#fff0b0",
      emissive: new THREE.Color("#ffc84a"),
      emissiveIntensity: 1.3,
      roughness: 0.4,
    });
    this.ringMats.push(m);
    const geo = new THREE.TorusGeometry(0.7, 0.05, 8, 28);
    this.owned.push(geo);
    const o = new THREE.Mesh(geo, m);
    o.rotation.x = Math.PI / 2;
    o.position.set(x, y, z);
    return o;
  }

  /**
   * Out in the park: a glowing doorstep and a small board over each of the
   * factory's two front doors, so it is obvious they open.
   */
  private buildOutside() {
    for (const z of DOOR_Z) {
      this.outside.add(this.glowRing(STEP_X - 0.2, 0.1, z));
      const board = this.board("WAY IN", 2.4, 0.62);
      board.position.set(DOOR_X + 0.2, 3.6, z);
      board.rotation.y = Math.PI / 2;
      this.outside.add(board);
    }
  }

  /* ------------------------------------------------------------- the frame */

  /** True while she is standing in the room. */
  get inside() {
    return useChocFactory.getState().inside;
  }

  /**
   * What Collect would do where she is standing: go in at either front door,
   * go out at the WAY OUT door, or pull the big lever on the control desk.
   */
  near(x: number, y: number, z: number): FactoryNear {
    const [lx, ly, lz] = [x - ROOM[0], y - ROOM[1], z - ROOM[2]];
    const inRoom = lx > IN.x0 && lx < IN.x1 && lz > GALLERY_Z && lz < IN.z1 && ly > -1 && ly < IN.h;
    if (inRoom) {
      // tight, so the way out is not offered the instant she steps in
      if (Math.hypot(lx - ENTRY.door[0], lz - ENTRY.door[2]) < 1) return "exit";
      if (Math.hypot(lx - LEVER_AT[0], lz - LEVER_AT[1]) < 1.7) return "lever";
      return null;
    }
    if (y > 2.2) return null;
    for (const dz of DOOR_Z) if (Math.hypot(x - STEP_X, z - dz) < 1.8) return "door";
    return null;
  }

  /**
   * Move everything that moves, and work out what Collect would do. Called
   * every frame whether or not she is inside — the machines are meant to be
   * already running when she walks in.
   */
  update(t: number, her: { x: number; y: number; z: number }) {
    const dt = Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;

    const lz = her.z - ROOM[2];
    const inRoom = Math.abs(her.x - ROOM[0]) < IN.x1 + WALL && lz > GALLERY_Z - 1 && lz < IN.z1 + WALL && Math.abs(her.y - ROOM[1] - IN.h / 2) < IN.h;
    useChocFactory.getState().setInside(inRoom);
    useChocFactory.getState().setNear(this.near(her.x, her.y, her.z));

    // The park is 1,800 props; a room she is not in must not cost anything.
    if (!inRoom) {
      this.group.visible = false;
      for (const m of this.ringMats) m.emissiveIntensity = 1 + Math.sin(t * 3) * 0.3;
      return;
    }
    this.group.visible = true;

    const fast = t < this.fastUntil;
    this.phase += dt * (fast ? 3.2 : 1);
    const p = this.phase;

    // the belt: sweets run the length of it and come round again
    for (const s of this.belt) {
      const k = s.userData.k as number;
      const u = ((p * 0.14 + k / 12) % 1 + 1) % 1;
      s.position.x = -2 + u * 16.2;
      s.position.y = 1.3 + (s.userData.k % 3 === 0 ? 0.06 : 0);
    }
    // the presses: a quick stamp and a slow lift, not a sine, so it bites
    for (const r of this.rams) {
      const k = r.userData.k as number;
      const u = ((p * 0.84 + k * 0.33) % 1 + 1) % 1;
      r.position.y = 2.05 - 0.62 * (u < 0.25 ? u / 0.25 : Math.max(0, 1 - (u - 0.25) / 0.45));
    }
    // chocolate falling from the spouts
    for (const d of this.drips) {
      const top = d.userData.top as number;
      const land = d.userData.land as number;
      const u = ((p * 0.7 + (d.userData.k as number)) % 1 + 1) % 1;
      d.position.y = top - (top - land) * u * u;
      d.scale.set(0.16 + u * 0.05, 0.2 - u * 0.06, 0.16 + u * 0.05);
    }
    for (const b of this.buckets) {
      const u = ((p * 0.09 + (b.userData.k as number)) % 1 + 1) % 1;
      b.position.x = -14 + u * 28;
      b.rotation.z = Math.sin(p * 1.6 + u * 9) * 0.08;
    }
    for (const s of this.swirls) {
      const k = s.userData.k as number;
      const u = ((p * 0.05 + k / 7) % 1 + 1) % 1;
      s.position.x = -15.5 + u * 31;
      const bob = s.userData.bob as number | undefined;
      if (bob != null) s.position.y = bob + Math.sin(p * 2 + k * 3) * 0.07;
      s.rotation.y = p * 0.4 + k;
    }
    for (const b of this.bulges) {
      const k = (b.userData.k as number) * 0.4;
      b.scale.setScalar(1 + Math.sin(p * 3.4 - k) * 0.22);
    }
    this.paddle.rotation.y = -p * 0.9;
    this.vatChoc.rotation.y = p * 0.45;
    for (const l of this.levers) l.rotation.z = Math.sin(p * 1.3 + (l.userData.k as number) * 2) * 0.34;
    for (const n of this.needles) n.rotation.x = Math.sin(p * 1.1 + (n.userData.k as number)) * 0.9;
    this.bigLever.rotation.z = fast ? -0.55 : 0.35;
    for (const [i, m] of this.lampMats.entries()) {
      m.emissiveIntensity = 0.25 + (Math.sin(p * (fast ? 7 : 2.6) + i * 1.6) > 0 ? 0.9 : 0);
    }
    for (const m of this.ringMats) m.emissiveIntensity = 1 + Math.sin(t * 3) * 0.3;
  }

  /** Collect pressed. Returns where to put her, or true if it did something else. */
  tryInteract(x: number, y: number, z: number): { teleport: [number, number, number]; yaw: number } | boolean {
    const near = this.near(x, y, z);
    if (near === "door") {
      sfx.click();
      // remember which of the two doors, so the way out is the way she came
      this.cameInBy = Math.hypot(z - DOOR_Z[0]) < Math.hypot(z - DOOR_Z[1]) ? 0 : 1;
      useGame.getState().setEmmettNotice("Inside the chocolate factory! Pull the big lever to speed it all up.");
      const [sx, sy, sz] = ENTRY.spawn;
      return { teleport: [ROOM[0] + sx, ROOM[1] + sy + 0.05, ROOM[2] + sz], yaw: ENTRY.yaw };
    }
    if (near === "exit") {
      sfx.click();
      // out onto the doorstep, facing east away from the wall
      return { teleport: [STEP_X + 1.4, 0.1, DOOR_Z[this.cameInBy] ?? DOOR_Z[0]!], yaw: -Math.PI / 2 };
    }
    if (near === "lever") {
      const st = useGame.getState();
      /*
       * The first pull is the one that matters: the factory has been stopped
       * and the whole river has been running white because of it. It will not
       * start without the three things the princess is missing, and the lever
       * says which ones are still out there rather than just refusing.
       */
      if (!st.factoryFixed) {
        const missing = CandyQuest.missing(st.candyParts);
        if (missing.length) {
          sfx.wrong();
          st.setEmmettNotice(
            `The machines will not start: ${missing.map((m) => m.name).join(", ")} ${missing.length === 1 ? "is" : "are"} still missing.`,
          );
          return true;
        }
        sfx.win();
        st.fixFactory();
        st.setEmmettNotice("The factory is running again — look at the river!");
        this.fastUntil = this.lastT + 8;
        return true;
      }
      sfx.boing();
      this.fastUntil = this.lastT + 8;
      st.setEmmettNotice("Full speed! The whole factory is running fast.");
      return true;
    }
    return false;
  }

  dispose() {
    this.scene.remove(this.group, this.outside);
    for (const c of this.colliders) {
      const i = this.worldColliders.indexOf(c);
      if (i >= 0) this.worldColliders.splice(i, 1);
    }
    this.colliders = [];
    for (const g of this.owned) g.dispose();
    for (const m of [...this.lampMats, ...this.ringMats, ...this.ownedMats]) {
      const map = (m as THREE.MeshStandardMaterial).map;
      if (map instanceof THREE.CanvasTexture) map.dispose();
      m.dispose();
    }
    this.owned = [];
    this.ownedMats = [];
    useChocFactory.getState().setInside(false);
    useChocFactory.getState().setNear(null);
  }
}
