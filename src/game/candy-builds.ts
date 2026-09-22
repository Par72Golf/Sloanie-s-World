import * as THREE from "three";
import { beveledBox } from "./beveled";
import { boxGeo, coneGeo, cone4Geo, cylGeo, lam, mesh, signBoard, sphereGeo, WHEEL_BOARD, type FerrisWheel } from "./meshes";

/**
 * The buildings and rides of Sugar Rush Park.
 *
 * Everything here is a lump of confectionery at architectural scale, which is
 * the whole joke: a seven-year-old should be able to name what each one is
 * made of from across the lawn, before she can read any sign. That drives most
 * of the decisions below — silhouette first (a gumdrop is a dome, a cupcake is
 * a fluted cup, a gingerbread house has scalloped icing on every edge), colour
 * second, detail last, and no detail smaller than a fist.
 *
 * Conventions every function in this file keeps:
 *   - the group's origin is on the ground, in the middle of the footprint
 *   - +z is the front: doors, counters, boarding steps and signs face that way
 *   - anything solid puts its local-space AABBs on `group.userData.boxes`, as
 *     {minX,maxX,minY,maxY,minZ,maxZ}, so world-build can turn them into the
 *     same axis-aligned colliders everything else in the park uses. Colliders
 *     ignore rotation (colliders.ts), so nothing solid here is ever rotated.
 *   - nothing is scaled at the group level. Scale is baked into the parts, so
 *     a box on userData is in the same units as the mesh next to it.
 *   - every scatter takes a seed, so the park looks the same every morning.
 *
 * Walkable surfaces follow the lookout stair in cave.ts: a tread is a block
 * standing on the ground, not a slab floating over a hole, so there is nothing
 * to fall into and the step up is always the same height.
 */

/* ------------------------------------------------------------------ palette */

const RED = "#e8384f";
const PINK = "#ff6aa8";
const YELLOW = "#ffc83a";
const MINT = "#6fe3c4";
const LILAC = "#b06aff";
const ORANGE = "#ff8a3a";
const CHOC = "#6b4226";
const CHOC_LIGHT = "#8a5a34";
const CHOC_DARK = "#4a2e1c";
const CREAM = "#f7ead3";
// Royal icing. The pure white the palette asks for (#fbf7f2) is not in the
// park's texture table, so it renders flat, and a flat white roof slab in full
// sun blooms out into a glowing blob — three gingerbread cottages in a row
// looked like three lightbulbs. This one is the table's warm white, which
// carries the plaster grain and holds its shape in the sun.
const ICING = "#f6f1e8";
const GINGER = "#a9703c";
const GINGER_DARK = "#8f5c2e";
const WAFER = "#e8b86a";
const WAFER_DARK = "#c9913f";
const CHERRY = "#d6253f";
const LIQUORICE = "#3a2a26";
const GUMDROPS = [RED, PINK, YELLOW, MINT, LILAC, ORANGE];

/* ------------------------------------------------------------- small helpers */

export type CandyBox = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

/** A solid box from its centre and size, positioned exactly as mesh() is. */
function bx(x: number, y: number, z: number, sx: number, sy: number, sz: number): CandyBox {
  return {
    minX: x - sx / 2,
    maxX: x + sx / 2,
    minY: y - sy / 2,
    maxY: y + sy / 2,
    minZ: z - sz / 2,
    maxZ: z + sz / 2,
  };
}

/** Candy is moulded sugar, not timber: no procedural wood grain on any of it. */
const flat = (c: string, roughness = 0.42) => lam(c, { flat: true, roughness });

/** Gingerbread is the one thing in the park that wants a baked surface. */
const baked = (c: string, repeat = 3) => lam(c, { tex: "dough", repeat, roughness: 0.78 });

/**
 * Chocolate.
 *
 * The chocolate browns are in the texture table as bark, which is right for a
 * tree trunk and made a 24m factory wall read as a barn door — vertical grain,
 * knots and all. They cannot be left flat either: a plain material blooms out
 * white across a slab that size. Dough is the answer, tinted brown: a soft
 * mottle with its normal map already damped, so chocolate catches the light
 * without growing a wood grain.
 */
const choc = (c: string, repeat = 6) => lam(c, { tex: "dough", repeat, roughness: 0.5 });

/** mesh(), for the parts that must be chocolate rather than timber. */
function cm(
  geo: THREE.BufferGeometry,
  color: string,
  sx: number,
  sy: number,
  sz: number,
  x: number,
  y: number,
  z: number,
  shadow = true,
) {
  return part(geo === boxGeo ? null : geo, choc(color), sx, sy, sz, x, y, z, shadow);
}

/**
 * mesh() with the material chosen by the caller: for stripe textures, baked
 * gingerbread and shared glass, where lam()'s colour lookup is not what we
 * want. Boxes get a real beveled geometry at their true size, exactly as
 * mesh() does, so a striped wall has the same moulded edge as its neighbour.
 */
function part(
  geo: THREE.BufferGeometry | null,
  mat: THREE.Material,
  sx: number,
  sy: number,
  sz: number,
  x: number,
  y: number,
  z: number,
  shadow = true,
) {
  const o = new THREE.Mesh(geo ?? beveledBox(sx, sy, sz), mat);
  if (geo) o.scale.set(sx, sy, sz);
  o.position.set(x, y, z);
  o.castShadow = shadow;
  o.receiveShadow = true;
  return o;
}

/** Add a child and turn it, without the `add()` returns-the-parent trap. */
function turned<T extends THREE.Object3D>(parent: THREE.Object3D, o: T, rx = 0, ry = 0, rz = 0): T {
  o.rotation.set(rx, ry, rz);
  parent.add(o);
  return o;
}

/**
 * Shared primitives at the segment counts this file actually needs. The park's
 * shared cylGeo is 10-sided, which is right for a fence post and wrong for a
 * six-metre lollipop stick or a gumball globe seen from three metres away.
 */
const cyl16 = new THREE.CylinderGeometry(1, 1, 1, 16);
const cyl24 = new THREE.CylinderGeometry(1, 1, 1, 24);
/** Open-ended, for skirts and canopies you see the inside of. */
const tube24 = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);
const coneOpen24 = new THREE.ConeGeometry(1, 1, 24, 1, true);
const tri3 = new THREE.ConeGeometry(1, 1, 3);
const sphere16 = new THREE.SphereGeometry(1, 16, 12);
/** A fluted cupcake case: twenty sides, wider at the top, open so the seat shows. */
const caseGeo = new THREE.CylinderGeometry(1, 0.72, 1, 20, 1, true);
/** Eighty triangles a ball: the gumball globe holds ninety-odd of these. */
const ballGeo = new THREE.SphereGeometry(1, 8, 6);
/** One rim shared by both sides of every gumdrop wheel. */
const rimGeo = new THREE.TorusGeometry(1, 0.11, 8, 48);
const ringGeo = new THREE.TorusGeometry(0.22, 0.045, 10, 24);

/** Deterministic noise. */
function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ------------------------------------------------------------ stripe canvas */

const stripeCache = new Map<string, THREE.CanvasTexture>();

/**
 * Stripes that run along u, so they wrap round a barrel and band a flat slab.
 *
 * A candy stripe has to be a texture. Building a twelve-metre chimney out of
 * forty alternating rings would be forty draw calls of nothing, and the stripe
 * would still be the wrong width wherever the part is scaled.
 */
function stripeTexture(a: string, b: string, count: number, repeatY = 1) {
  const key = `s|${a}|${b}|${count}|${repeatY}`;
  const found = stripeCache.get(key);
  if (found) return found;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 32;
  const g = c.getContext("2d")!;
  for (let i = 0; i < count; i++) {
    g.fillStyle = i % 2 ? b : a;
    g.fillRect((i * 256) / count, 0, 256 / count + 1, 32);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, repeatY);
  stripeCache.set(key, t);
  return t;
}

/**
 * Barber-pole stripes for candy canes: parallelograms sheared exactly one
 * canvas width per canvas height, so the diagonal joins up where the texture
 * wraps round the cylinder instead of showing a seam down one side.
 */
function caneTexture(a: string, b: string, bands = 6, repeatY = 1) {
  const key = `c|${a}|${b}|${bands}|${repeatY}`;
  const found = stripeCache.get(key);
  if (found) return found;
  const N = 128;
  const c = document.createElement("canvas");
  c.width = N;
  c.height = N;
  const g = c.getContext("2d")!;
  g.fillStyle = a;
  g.fillRect(0, 0, N, N);
  g.fillStyle = b;
  const w = N / bands / 2;
  for (let i = 0; i < bands; i++) {
    const x0 = (i * N) / bands;
    for (const off of [-N, 0, N]) {
      g.beginPath();
      g.moveTo(x0 + off, 0);
      g.lineTo(x0 + off + w, 0);
      g.lineTo(x0 + off + w + N, N);
      g.lineTo(x0 + off + N, N);
      g.closePath();
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, repeatY);
  stripeCache.set(key, t);
  return t;
}

const stripeMats = new Map<string, THREE.MeshStandardMaterial>();
/** One material per texture, so twenty striped posts are still one material. */
function striped(tex: THREE.CanvasTexture, roughness = 0.4, side: THREE.Side = THREE.FrontSide) {
  const key = `${tex.uuid}|${roughness}|${side}`;
  let m = stripeMats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: tex, roughness, metalness: 0.03, envMapIntensity: 0.85, side });
    stripeMats.set(key, m);
  }
  return m;
}

/* ------------------------------------------------------------------- icing */

/**
 * A run of icing scallops along an edge: the cheapest thing that makes a brown
 * box read as gingerbread rather than a shed. Flattened spheres, no shadows,
 * because at this size they are paint.
 */
function icingRun(
  g: THREE.Group,
  from: [number, number, number],
  to: [number, number, number],
  r = 0.22,
  color = ICING,
) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const n = Math.max(2, Math.round(Math.hypot(dx, dy, dz) / (r * 1.6)));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    g.add(mesh(sphereGeo, color, r, r * 0.8, r, from[0] + dx * t, from[1] + dy * t, from[2] + dz * t, false));
  }
}

/**
 * A candy cane: a striped post with a hook on top. The hook is four short
 * segments swept through a half turn rather than a torus, because a torus at
 * this size costs more triangles than the whole post and reads the same.
 */
function candyCane(height: number, r = 0.14, a = RED, b = ICING) {
  const g = new THREE.Group();
  const mat = striped(caneTexture(b, a, 5, Math.max(1, Math.round(height / (r * 12)))));
  g.add(part(cyl16, mat, r, height, r, 0, height / 2, 0));
  // the hook is a circle of radius hr centred level with the top of the post:
  // walking phi from 0 to a bit past PI carries it up, over and back down, and
  // a cylinder's +y axis lines up with the tangent at -phi
  const hr = r * 2.6;
  const segs = 5;
  const span = Math.PI * 1.12;
  for (let i = 0; i < segs; i++) {
    const phi = ((i + 0.5) / segs) * span;
    const seg = part(cyl16, mat, r, (hr * span) / segs + r * 0.6, r, hr - hr * Math.cos(phi), height + hr * Math.sin(phi), 0);
    seg.rotation.z = -phi;
    g.add(seg);
  }
  return g;
}

/* ============================================================== candy door */

/**
 * A front door for a sweet house: a wafer leaf with an icing panel on each
 * face and a gumdrop knob, hinged at its own origin and hanging along +x, so
 * turning the group about y swings it on its hinge. Shut at rotation 0.
 *
 * Every house in the park used to have a wafer leaf propped at an angle off
 * the wall beside the doorway, not hung from anything, and from the path it
 * read as a shutter: the houses looked like they had holes where their doors
 * should be. The house decides whether its door opens (userData.opens, the
 * angle it swings to) — the runtime does the swinging.
 */
export function makeCandyDoor(w: number, h: number, knob = GUMDROPS[1]!): THREE.Group {
  const g = new THREE.Group();
  g.name = "door-hinge";
  g.userData.width = w;
  g.add(mesh(boxGeo, WAFER, w, h, 0.1, w / 2, h / 2, 0));
  for (const face of [-1, 1]) {
    g.add(mesh(boxGeo, ICING, w * 0.62, h * 0.32, 0.03, w / 2, h * 0.7, face * 0.06, false));
    g.add(mesh(boxGeo, ICING, w * 0.62, h * 0.28, 0.03, w / 2, h * 0.3, face * 0.06, false));
    g.add(mesh(sphereGeo, knob, 0.075, 0.075, 0.075, w - 0.16, h * 0.48, face * 0.1, false));
  }
  return g;
}

/* ======================================================== gingerbread house */

/**
 * A gingerbread cottage she can walk into.
 *
 * The front wall is built as two piers with a lintel over them, so the door is
 * a real 1.3m hole rather than a painted one — she will try the door, and a
 * house that turns out to be solid is a lie a seven-year-old notices at once.
 * Nothing inside is solid, so the shell is only ever six colliders and the
 * biscuit floor is thin enough to walk straight onto.
 *
 * Variants: 0 a gabled cottage with a stick-of-rock chimney, 1 a two-storey
 * with a second row of windows, 2 a squat one under a soft-serve swirl.
 */
export function makeGingerbreadHouse(w = 5.5, d = 5, variant = 0, seed = 20260921) {
  const g = new THREE.Group();
  const rand = seeded(seed + variant * 77);
  const H = variant === 1 ? 4.4 : variant === 2 ? 2.9 : 3.3;
  const t = 0.35; // wall thickness
  const DOOR_W = 1.3;
  const DOOR_H = 2.1;
  const half = DOOR_W / 2;
  const fz = d / 2 - t / 2;
  const pierW = w / 2 - half;
  const wallMat = baked(GINGER, 3);

  // ---- the shell. The drawn wall IS the collider box, so there is never a
  // lip she can stand on that is not on screen.
  const boxes: CandyBox[] = [];
  const solid = (sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
    g.add(part(null, wallMat, sx, sy, sz, x, y, z));
    boxes.push(bx(x, y, z, sx, sy, sz));
  };
  solid(w, H, t, 0, H / 2, -d / 2 + t / 2); // back
  solid(t, H, d, -w / 2 + t / 2, H / 2, 0); // west
  solid(t, H, d, w / 2 - t / 2, H / 2, 0); // east
  solid(pierW, H, t, -(half + pierW / 2), H / 2, fz); // front, west of the door
  solid(pierW, H, t, half + pierW / 2, H / 2, fz); // front, east of the door
  solid(DOOR_W, H - DOOR_H, t, 0, (DOOR_H + H) / 2, fz); // lintel over the door

  // a biscuit floor inside: 0.1m, so she steps on without a collider
  g.add(part(null, baked(GINGER_DARK, 2), w - t * 2 + 0.1, 0.1, d - t * 2 + 0.1, 0, 0.05, 0, false));

  // ---- roof
  const eave = H;
  if (variant === 2) {
    // soft-serve: three stacked cones and a cherry, which from the path reads
    // as a swirl of icing dolloped on top of the walls
    for (let i = 0; i < 4; i++) {
      const s = 1 - i * 0.22;
      g.add(mesh(coneGeo, ICING, w * 0.56 * s, 0.95, d * 0.56 * s, 0, eave + 0.3 + i * 0.6, 0));
    }
    g.add(mesh(sphereGeo, CHERRY, 0.32, 0.32, 0.32, 0, eave + 2.75, 0, false));
    icingRun(g, [-w / 2, eave + 0.08, d / 2], [w / 2, eave + 0.08, d / 2], 0.24);
    icingRun(g, [-w / 2, eave + 0.08, -d / 2], [w / 2, eave + 0.08, -d / 2], 0.24);
  } else {
    // gabled: two icing slabs and a ridge, the treehouse roof recipe
    const pitch = 0.64;
    const slabW = w * 0.66;
    for (const s of [-1, 1]) {
      const slab = mesh(boxGeo, ICING, slabW, 0.2, d + 0.7, (s * slabW) / 2 - s * 0.1, eave + 0.72, 0);
      slab.rotation.z = -s * pitch;
      g.add(slab);
      // piped courses down the slope: the tiles of a gingerbread roof
      for (let i = 0; i < 3; i++) {
        const c = mesh(boxGeo, i % 2 ? PINK : MINT, 0.24, 0.07, d + 0.72, s * (0.5 + i * 0.75), eave + 0.66 - i * 0.5, 0, false);
        c.rotation.z = -s * pitch;
        g.add(c);
      }
    }
    g.add(mesh(boxGeo, ICING, 0.42, 0.26, d + 0.9, 0, eave + 1.5, 0, false));
    // gable ends, so you cannot see straight through the roof from the side
    for (const s of [-1, 1]) {
      g.add(part(tri3, wallMat, w * 0.56, 1.5, 0.22, 0, eave + 0.72, (s * (d + 0.55)) / 2));
    }
    icingRun(g, [-w / 2 - 0.25, eave + 0.05, d / 2 + 0.32], [w / 2 + 0.25, eave + 0.05, d / 2 + 0.32], 0.26);
    icingRun(g, [-w / 2 - 0.25, eave + 0.05, -d / 2 - 0.32], [w / 2 + 0.25, eave + 0.05, -d / 2 - 0.32], 0.26);
    if (variant === 0) {
      g.add(part(cyl16, striped(caneTexture(ICING, RED, 4, 3)), 0.36, 1.5, 0.36, w * 0.26, eave + 1.7, -d * 0.16));
      g.add(mesh(sphereGeo, ICING, 0.44, 0.3, 0.44, w * 0.26, eave + 2.5, -d * 0.16, false));
    }
  }

  // ---- the door: a candy-cane frame round the hole, wafer leaf standing ajar
  for (const s of [-1, 1]) {
    const post = candyCane(DOOR_H + 0.15, 0.13);
    post.position.set(s * (half + 0.13), 0, d / 2 + 0.06);
    post.rotation.y = s > 0 ? 0 : Math.PI;
    g.add(post);
  }
  turned(g, part(cyl16, striped(caneTexture(ICING, RED, 5, 2)), 0.13, DOOR_W + 0.42, 0.13, 0, DOOR_H + 0.22, d / 2 + 0.06, false), 0, 0, Math.PI / 2);
  // the door, hung from the west jamb and shut: she can walk in, so the
  // runtime swings it open as she comes up the path (updateDoors)
  const door = makeCandyDoor(DOOR_W - 0.06, DOOR_H - 0.04);
  door.position.set(-half + 0.03, 0.02, d / 2 - 0.08);
  door.userData.opens = 1.55;
  g.add(door);

  // ---- windows: icing frames round a boiled-sweet pane
  const panes: [number, number][] = variant === 1 ? [[-1, 1.5], [1, 1.5], [-1, 3.3], [1, 3.3]] : [[-1, 1.5], [1, 1.5]];
  for (const [s, y] of panes) {
    if (y + 0.6 > H) continue;
    const px = s * (half + pierW / 2);
    g.add(mesh(boxGeo, ICING, 1.0, 1.0, 0.1, px, y, d / 2 + 0.03, false));
    g.add(mesh(boxGeo, s > 0 ? MINT : YELLOW, 0.78, 0.78, 0.06, px, y, d / 2 + 0.09, false));
    g.add(mesh(boxGeo, ICING, 0.09, 0.8, 0.08, px, y, d / 2 + 0.13, false));
    g.add(mesh(boxGeo, ICING, 0.8, 0.09, 0.08, px, y, d / 2 + 0.13, false));
  }

  // ---- gumdrop buttons, pressed into every wall
  for (let i = 0; i < 5; i++) {
    const along = (i / 4 - 0.5) * 2;
    const r = 0.2 + rand() * 0.1;
    const yFront = DOOR_H + 0.45 + rand() * Math.max(0.1, H - DOOR_H - 0.7);
    if (yFront + r < H) {
      g.add(mesh(sphereGeo, GUMDROPS[i % GUMDROPS.length]!, r, r * 0.9, r * 0.6, along * (w * 0.42), yFront, d / 2 + 0.08, false));
    }
    g.add(mesh(sphereGeo, GUMDROPS[(i + 2) % GUMDROPS.length]!, r, r * 0.9, r * 0.6, along * (w * 0.42), H * 0.45 + rand() * H * 0.4, -d / 2 - 0.08, false));
    for (const s of [-1, 1]) {
      const rr = 0.2 + rand() * 0.1;
      g.add(mesh(sphereGeo, GUMDROPS[(i + s + 6) % GUMDROPS.length]!, rr * 0.6, rr * 0.9, rr, s * (w / 2 + 0.08), H * 0.45 + rand() * H * 0.4, along * (d * 0.36), false));
    }
  }

  // boiled sweets pressed into the front path, leading the eye to the door
  for (let i = 0; i < 3; i++) {
    g.add(mesh(cylGeo, GUMDROPS[(i * 2) % GUMDROPS.length]!, 0.34, 0.07, 0.34, (i - 1) * 0.6, 0.04, d / 2 + 1.0 + i * 0.12, false));
  }

  g.userData.boxes = boxes;
  g.userData.doorWidth = DOOR_W;
  g.userData.doorHeight = DOOR_H;
  return g;
}

/* ============================================================ candy factory */

/** The chocolate river's channel through the factory, in the factory's frame. */
export const FACTORY_CHANNEL = {
  /** clear between local x -2.5 and +2.5: a five-metre slot */
  width: 5,
  halfWidth: 2.5,
  /** the channel runs along z, open at both ends of the sixteen-metre depth */
  fromZ: -8,
  toZ: 8,
  /** soffit of the arch over it: 5.2m of clear headroom above the bank */
  lintelY: 5.2,
};

/**
 * The park's landmark: a chocolate factory 24m wide, 16m deep and 12m to the
 * top of its tower, with the chocolate river running straight through it.
 *
 * It is two solid blocks with a five-metre slot between them rather than a
 * hollow shell, because the only part of it she is ever inside is the river
 * tunnel. Four colliders instead of eight, and the channel is guaranteed clear
 * because it is the gap between the blocks, not a hole someone remembered to
 * leave in a wall.
 *
 * The channel: 5m wide, centred on local x 0, running the full 16m along z,
 * open at both ends, arch soffit at y 5.2. Float the water at about y 0.3 and
 * a boat has four and a half metres of headroom going through.
 *
 * From the far side of the park it is: brown slab, two striped chimneys
 * puffing, two lollipops the size of trees. That is the whole design.
 */
export function makeCandyFactory() {
  const g = new THREE.Group();
  const W = 24;
  const D = 16;
  const BODY = 9;
  const TOWER = 12;
  const ch = FACTORY_CHANNEL.halfWidth;
  const lintelY = FACTORY_CHANNEL.lintelY;

  const boxes: CandyBox[] = [];
  const block = (color: string, sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
    g.add(cm(boxGeo, color, sx, sy, sz, x, y, z));
    boxes.push(bx(x, y, z, sx, sy, sz));
  };

  // ---- the two halves, the arch over the river, and the tower
  const halfW = W / 2 - ch;
  for (const s of [-1, 1]) block(CHOC, halfW, BODY, D, s * (ch + halfW / 2), BODY / 2, 0);
  block(CHOC, ch * 2, BODY - lintelY, D, 0, (lintelY + BODY) / 2, 0);
  block(CHOC_LIGHT, 11, TOWER - BODY, 8, 0, (BODY + TOWER) / 2, -2);

  // ---- the moulded-slab look. A scored grid read as planking from thirty
  // metres, which made the whole thing a barn; raised squares standing proud
  // of the wall with a gap between them read as a bar of chocolate instead.
  const ROWS = [1.6, 4.4, 7.2];
  const SQ = 2.4;
  const square = (sx: number, x: number, y: number, z: number, along: "x" | "z") => {
    const d = along === "x" ? [sx, SQ, 0.22] : [0.22, SQ, sx];
    g.add(cm(boxGeo, CHOC_LIGHT, d[0]!, d[1]!, d[2]!, x, y, z, false));
  };
  // a boiled-sweet window: cream frame, coloured pane, two glazing bars
  const window = (x: number, y: number, z: number, pane: string) => {
    g.add(mesh(boxGeo, CREAM, 2.6, 1.7, 0.2, x, y, z, false));
    g.add(mesh(boxGeo, pane, 2.2, 1.3, 0.12, x, y, z + 0.1, false));
    g.add(mesh(boxGeo, CREAM, 0.14, 1.35, 0.1, x, y, z + 0.16, false));
    g.add(mesh(boxGeo, CREAM, 2.25, 0.14, 0.1, x, y, z + 0.16, false));
  };
  const FZ = D / 2 + 0.11;
  for (const s of [-1, 1]) {
    // the front, where the doors and windows go
    for (const [ci, cx] of [4.6, 7.4, 10.2].entries()) {
      for (const [ri, ry] of ROWS.entries()) {
        const isDoor = ci === 0 && ri === 0;
        const isWindow = (ci === 0 && ri > 0) || (ci === 1 && ri === 1);
        if (isDoor) {
          g.add(cm(boxGeo, CHOC_DARK, 2.2, 2.9, 0.2, s * cx, 1.45, FZ, false));
          g.add(mesh(boxGeo, CREAM, 2.6, 0.24, 0.26, s * cx, 3.02, FZ, false));
          g.add(mesh(boxGeo, WAFER, 0.96, 2.7, 0.12, s * cx - 0.55, 1.4, FZ + 0.1, false));
          g.add(mesh(boxGeo, WAFER, 0.96, 2.7, 0.12, s * cx + 0.55, 1.4, FZ + 0.1, false));
        } else if (isWindow) {
          window(s * cx, ry, FZ, ri === 2 ? YELLOW : MINT);
        } else {
          square(SQ, s * cx, ry, FZ, "x");
        }
      }
    }
    // the back and the two ends are plain chocolate all over
    for (const cx of [4.6, 7.4, 10.2]) for (const ry of ROWS) square(SQ, s * cx, ry, -FZ, "x");
    for (const cz of [-5.4, -1.8, 1.8, 5.4]) for (const ry of ROWS) square(2.8, (s * W) / 2 + s * 0.11, ry, cz, "z");
  }
  // cream cornices, and icing dripping off the front eave
  g.add(mesh(boxGeo, CREAM, W + 0.5, 0.4, D + 0.5, 0, BODY + 0.1, 0, false));
  g.add(mesh(boxGeo, CREAM, 11.6, 0.34, 8.6, 0, TOWER + 0.05, -2, false));
  icingRun(g, [-W / 2 - 0.2, BODY + 0.3, D / 2 + 0.28], [W / 2 + 0.2, BODY + 0.3, D / 2 + 0.28], 0.32);

  // ---- the tunnel she rides through: striped walls, a string of lamps and
  // two conveyors crossing overhead, so the trip is not four seconds of brown
  const tunnelMat = striped(stripeTexture(RED, ICING, 18, 1));
  for (const s of [-1, 1]) {
    g.add(part(null, tunnelMat, 0.16, 4.6, D - 0.3, s * (ch - 0.08), 2.4, 0, false));
  }
  for (let i = -2; i <= 2; i++) {
    g.add(mesh(cylGeo, CREAM, 0.05, 0.5, 0.05, 0, lintelY - 0.05, i * 3.1, false));
    g.add(mesh(sphereGeo, YELLOW, 0.26, 0.26, 0.26, 0, lintelY - 0.42, i * 3.1, false));
  }
  for (const z of [-4.4, 4.4]) {
    g.add(cm(boxGeo, CHOC_DARK, ch * 2 + 0.6, 0.18, 0.7, 0, 4.3, z, false));
    for (let k = 0; k < 4; k++) {
      g.add(mesh(sphereGeo, GUMDROPS[(k + (z > 0 ? 2 : 0)) % GUMDROPS.length]!, 0.22, 0.22, 0.22, -1.8 + k * 1.2, 4.62, z, false));
    }
  }
  // a low kerb along each bank, so the channel has an edge from the water
  for (const s of [-1, 1]) {
    g.add(mesh(boxGeo, CREAM, 0.3, 0.3, D - 0.3, s * (ch - 0.3), 0.15, 0, false));
  }

  // ---- chimneys: sticks of rock, with their puffs frozen mid-rise. The puffs
  // deliberately do not animate — fifty-five drifting clouds is already the
  // sky's whole budget, and from the ground a still puff reads as steam.
  const caneMat = striped(caneTexture(ICING, RED, 5, 5));
  for (const s of [-1, 1]) {
    const cx = s * 7.4;
    const cz = 3.6;
    g.add(part(cyl16, caneMat, 1.15, 4.6, 1.15, cx, BODY + 2.3, cz));
    g.add(mesh(cylGeo, CREAM, 1.4, 0.36, 1.4, cx, BODY + 4.75, cz, false));
    // puffs climbing away from the stack and swelling as they go
    const puffs: [number, number, number][] = [
      [0.1, 0.7, 1.0],
      [0.5, 1.7, 1.3],
      [0.2, 2.9, 1.7],
      [0.9, 4.3, 2.1],
    ];
    for (const [dx, dy, r] of puffs) {
      const px = cx + dx * s;
      const py = BODY + 5.0 + dy;
      g.add(mesh(sphereGeo, "#fdfbf7", r, r * 0.78, r, px, py, cz + dy * 0.3, false));
      g.add(mesh(sphereGeo, "#fdfbf7", r * 0.72, r * 0.62, r * 0.72, px + r * 0.75 * s, py + 0.18, cz + dy * 0.3, false));
      g.add(mesh(sphereGeo, "#fdfbf7", r * 0.6, r * 0.55, r * 0.6, px - r * 0.6 * s, py - 0.1, cz + dy * 0.3 + r * 0.4, false));
    }
  }

  // ---- roof conveyor feeding the tower: rollers, belt, crates of sweets
  const beltZ = 4.8;
  g.add(cm(boxGeo, CHOC_DARK, 16, 0.2, 1.3, 0, BODY + 0.85, beltZ, false));
  for (let i = 0; i < 9; i++) {
    turned(g, mesh(cylGeo, "#b8c2c8", 0.2, 1.5, 0.2, -7.4 + i * 1.85, BODY + 1.02, beltZ, false), 0, 0, Math.PI / 2);
  }
  for (const s of [-1, 1]) g.add(cm(boxGeo, CHOC_DARK, 16, 0.5, 0.12, 0, BODY + 0.62, beltZ + s * 0.72, false));
  for (let i = 0; i < 5; i++) {
    g.add(mesh(boxGeo, i % 2 ? PINK : MINT, 0.9, 0.7, 0.9, -6 + i * 3, BODY + 1.47, beltZ, false));
    g.add(mesh(boxGeo, ICING, 1.0, 0.1, 1.0, -6 + i * 3, BODY + 1.85, beltZ, false));
  }

  // ---- signage. The board started up on the tower, where it was too far back
  // and too small to read; over the tunnel arch it is the first thing you see
  // walking up, and the tower carries a lollipop clock instead.
  const sign = signBoard("CANDY FACTORY", 6.6, 1.5);
  sign.position.set(0, 7.3, FZ + 0.1);
  g.add(sign);
  g.add(mesh(boxGeo, CREAM, 7.2, 0.24, 0.3, 0, 6.4, FZ + 0.12, false));
  turned(g, mesh(cylGeo, PINK, 1.5, 0.3, 1.5, 0, TOWER - 1.5, 2.2), Math.PI / 2, 0, 0);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 3;
    const r = 0.22 + (i / 12) * 1.15;
    turned(g, mesh(cylGeo, ICING, 0.18, 0.06, 0.18, Math.cos(a) * r, TOWER - 1.5 + Math.sin(a) * r, 2.34, false), Math.PI / 2, 0, 0);
  }
  for (const s of [-1, 1]) {
    const lp = new THREE.Group();
    lp.position.set(s * 10.4, 0, D / 2 + 2.6);
    lp.add(part(cyl16, striped(caneTexture(ICING, "#e0d8cc", 4, 6)), 0.18, 6.4, 0.18, 0, 3.2, 0));
    const head = s > 0 ? PINK : MINT;
    turned(lp, mesh(cylGeo, head, 2.1, 0.34, 2.1, 0, 7.3, 0), Math.PI / 2, 0, 0);
    // the swirl: a spiral of icing discs across the face, which is what makes
    // a flat pink disc read as a lollipop from thirty metres
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 4;
      const r = 0.25 + (i / 16) * 1.6;
      turned(lp, mesh(cylGeo, ICING, 0.2, 0.06, 0.2, Math.cos(a) * r, 7.3 + Math.sin(a) * r, 0.2, false), Math.PI / 2, 0, 0);
    }
    g.add(lp);
  }

  // ---- candy-cane bollards at each mouth of the channel
  for (const s of [-1, 1]) {
    for (const zs of [-1, 1]) {
      const c = candyCane(1.5, 0.11);
      c.position.set(s * (ch + 0.5), 0, (zs * D) / 2 + zs * 0.9);
      g.add(c);
    }
  }

  g.userData.boxes = boxes;
  g.userData.channel = { ...FACTORY_CHANNEL };
  return g;
}

/* ======================================================= ice cream mountain */

/**
 * The mountain, as stacked scoops with a wide flat ring round each one.
 *
 * The first attempt was a true helix of treads cut into a ball of ice cream,
 * and it did not survive being looked at: a tread has to be a block standing
 * on something solid (cave.ts) or there is a hole under it, and a ball is
 * widest in the middle, so every block on the lower half stood a metre and a
 * half out of the ice cream as a fin.
 *
 * Terraces fix it, but only with room to spare. The second attempt had three
 * rings two metres wide, and since a flight of stairs is two metres wide too,
 * every flight was jammed between the drum it climbed and the lumpy rim of the
 * one it stood on. Walking it, she wedged against an invisible corner on the
 * fourth step. So: two drums, rings three metres wide, and the rule that a
 * flight never overlaps the drum it is climbing toward — with a landing at the
 * top of each flight to bridge the last step onto the ring.
 */
const TIERS = [{ r: 9.4, top: 4.2, color: "#ff9ec4" }]; // strawberry
/** The upper drum is one collider but two colours, so it reads as two scoops. */
const DECK = { r: 5.0, top: 8.4, seam: 6.3, lower: "#6fd8bd", color: "#f4dc9e" };

/**
 * The two tiers above the deck, which are what make this a peak instead of a
 * wide sundae. Radius is the whole budget: a tier has to hold a drum plus a
 * flight that clears it, and a flight is not walkable under about 1.5m, so the
 * deck's five metres pay for exactly two more: 5.0 -> 3.4 -> 1.8. A third
 * would be a pole, not a place to stand on.
 *
 * Each one is also a scoop in its own right — bubblegum, then a lemon-and-
 * raspberry horn — so from the grass the mountain is four sweets stacked, not
 * one sweet with scaffolding on it.
 */
const SCOOP = { r: 3.4, top: 13.0, seam: 10.7, lower: "#8fd0ff", color: "#c9a2ff" };
const PEAK = { r: 1.8, top: 16.8, seam: 15.0, lower: "#ffd24d", color: "#ff6f91" };

/**
 * Where each flight starts, how far round it sweeps and how many steps it
 * takes. The lower two are twelve steps of 0.35m; the upper two are fewer and
 * slightly taller (0.46m and 0.475m) because there is less radius to spiral
 * round up there — both still well under her 0.62m step-up.
 *
 * Each radius keeps the treads clear of the drum they climb toward (a tread
 * buried in a 4m wall is a step she cannot take) and inside the lumpy rim of
 * the ring they stand on. The upper two overlap their drum by 5cm on purpose:
 * up there the gap between the last tread and the ring would be the width of
 * her foot, and a stair that stops short of the floor is a stair she falls
 * off, so they are built to touch instead and need no landing.
 */
const FLIGHTS = [
  { fromY: 0, toY: TIERS[0]!.top, toR: TIERS[0]!.r, r: 10.6, tread: 2.0, a0: Math.PI / 2, span: 1.56, n: 12, landing: 2.6 },
  { fromY: TIERS[0]!.top, toY: DECK.top, toR: DECK.r, r: 6.6, tread: 1.7, a0: (260 * Math.PI) / 180, span: 1.7, n: 12, landing: 2.6 },
  { fromY: DECK.top, toY: SCOOP.top, toR: SCOOP.r, r: 4.15, tread: 1.5, a0: 0.35, span: 2.7, n: 10, landing: 0 },
  // starts where the flight below it arrives, so the two read as one spiral
  { fromY: SCOOP.top, toY: PEAK.top, toR: PEAK.r, r: 2.55, tread: 1.5, a0: 3.1, span: 2.9, n: 8, landing: 0 },
];

/** Where the looking glass stands on the summit, in the model's own frame. */
const GLASS_ANGLE = 0.927; // toward Peppermint Plaza, from the mountain's corner
const GLASS_RADIUS = 0.82;

export const ICE_CREAM_MOUNTAIN = {
  /** four flights: 12 + 12 of 0.35m, then 10 of 0.46m and 8 of 0.475m */
  steps: FLIGHTS.reduce((n, f) => n + f.n, 0),
  rise: 0.35,
  /** the mid terrace, which used to be the top */
  deckY: DECK.top,
  deckRadius: DECK.r,
  /** the walkable ring on top of the lower scoop */
  ringY: TIERS[0]!.top,
  ringRadius: TIERS[0]!.r,
  /** the ring on top of the bubblegum scoop, between the last two flights */
  scoopY: SCOOP.top,
  scoopRadius: SCOOP.r,
  /** the summit she climbs to, and how wide the floor up there is */
  summitY: PEAK.top,
  summitRadius: PEAK.r,
  /** the climb starts at ground level on the +z side and turns anticlockwise */
  startAngle: Math.PI / 2,
  startRadius: FLIGHTS[0]!.r,
  /**
   * The four flights, so a check can walk the route rather than guess at it.
   * Anything walking the climb has to follow the spiral tread by tread: aim
   * straight at the top of a flight instead and you cut the corner into the
   * drum, which is what a child does not do and a straight-line test does.
   */
  flights: FLIGHTS as readonly { fromY: number; toY: number; r: number; a0: number; span: number; n: number }[],
  /** it arrives on the deck here, and the slide leaves opposite */
  arriveAngle: FLIGHTS[1]!.a0 + FLIGHTS[1]!.span - Math.PI * 2,
  slideAngle: (214 * Math.PI) / 180,
  /** where the last flight steps onto the summit, so the rail leaves a gap */
  summitArriveAngle: FLIGHTS[3]!.a0 + FLIGHTS[3]!.span - Math.PI * 2,
  /**
   * The looking glass, relative to the middle of the mountain. Anything that
   * wants to know where she has to stand to use it adds the mountain's own
   * position to this; the eyepiece is where her eye goes, not the tripod foot.
   */
  glass: {
    x: Math.cos(GLASS_ANGLE) * GLASS_RADIUS,
    y: PEAK.top,
    z: Math.sin(GLASS_ANGLE) * GLASS_RADIUS,
    /** the way the barrel points when nobody has turned it */
    facing: GLASS_ANGLE,
    /** her eye at the eyepiece, above the summit floor */
    eyeY: PEAK.top + 1.55,
  },
};

/**
 * A round floor as axis-aligned boxes, since colliders ignore rotation.
 *
 * The disc is sliced into bands along z, each band only as wide as the circle
 * is at its outer edge, so no box ever reaches past the drum that is drawn
 * over it. Boxes that did reach past were the bug that stopped the climb: an
 * invisible corner of the ice cream, out in the air where the stair runs.
 *
 * Inscribing costs a strip under the last band, at the far north and south of
 * the ring, which is why the bands are kept under a metre: the strip is then
 * narrower than the scoop's lumpy rim that stands on it, so she can never walk
 * onto the part with nothing underneath.
 *
 * The two tiers above the deck ask for a finer band than the default. They are
 * small enough that a 0.8m band would leave most of a metre of drawn floor
 * with nothing under it at the north and south tips, and up there the fall is
 * the whole mountain.
 */
function discBoxes(r: number, minY: number, maxY: number, band = 0.8): CandyBox[] {
  const bands = Math.max(6, Math.ceil((2 * r) / band));
  const out: CandyBox[] = [];
  for (let i = 0; i < bands; i++) {
    const z0 = -r + (2 * r * i) / bands;
    const z1 = -r + (2 * r * (i + 1)) / bands;
    const w = Math.sqrt(Math.max(0, r * r - Math.max(Math.abs(z0), Math.abs(z1)) ** 2));
    if (w < 0.4) continue;
    out.push({ minX: -w, maxX: w, minY, maxY, minZ: z0, maxZ: z1 });
  }
  return out;
}

/**
 * The looking glass on the summit: a candy-cane tripod with a barrel of rock
 * candy on it, aimed out across the park.
 *
 * None of it is solid. She has to be able to stand at the eyepiece, and on a
 * floor three and a half metres across a collider round the tripod would be
 * something to get wedged against with a sixteen-metre drop behind her.
 *
 * Built along +x and turned by the group, the way the slide is, so the caller
 * gives it an angle rather than a direction vector.
 */
function makeLookingGlassMesh(x: number, y: number, z: number, facing: number) {
  const t = new THREE.Group();
  t.position.set(x, y, z);
  t.rotation.y = -facing;

  // a sugar roundel under it, so from the last step it is obvious this is a
  // thing to stand at rather than a thing to look at
  turned(t, mesh(cyl24, ICING, 1.6, 0.06, 1.6, 0, 0.11, 0, false));

  // three candy-cane legs, splayed the way a tripod's are: each leans out at
  // the foot and meets its neighbours at the hub
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const leg = mesh(cylGeo, i === 0 ? RED : ICING, 0.12, 1.3, 0.12, Math.cos(a) * 0.24, 0.68, Math.sin(a) * 0.24, false);
    leg.rotation.z = 0.36 * Math.cos(a);
    leg.rotation.x = -0.36 * Math.sin(a);
    t.add(leg);
  }
  t.add(mesh(sphereGeo, YELLOW, 0.44, 0.44, 0.44, 0, 1.34, 0, false));

  /*
   * The barrel, tipped a little down, because from sixteen metres up
   * everything worth looking at is below the horizon.
   *
   * It is deliberately large — two metres of it, half a metre thick. The
   * first one was built to scale beside a seven-year-old and disappeared
   * among the candy canes of the rail: on a summit this small, the one thing
   * she climbed up here to use has to be the one thing she sees.
   */
  const arm = new THREE.Group();
  arm.position.set(0, 1.5, 0);
  arm.rotation.z = -0.13;
  t.add(arm);
  const along = (o: THREE.Object3D) => turned(arm, o, 0, 0, Math.PI / 2);
  along(mesh(cyl16, PINK, 0.48, 1.5, 0.48, 0.16, 0, 0, false));
  along(mesh(cyl16, LILAC, 0.4, 0.62, 0.4, -0.52, 0, 0, false));
  along(mesh(cyl16, YELLOW, 0.53, 0.14, 0.53, 0.56, 0, 0, false));
  along(mesh(cyl16, YELLOW, 0.53, 0.14, 0.53, -0.24, 0, 0, false));
  // the wide end, with a mint lens in it, and the eyepiece at the near end
  along(mesh(cyl16, YELLOW, 0.66, 0.2, 0.66, 1.0, 0, 0, false));
  along(mesh(cyl16, MINT, 0.58, 0.05, 0.58, 1.1, 0, 0, false));
  along(mesh(cyl16, LIQUORICE, 0.3, 0.3, 0.3, -0.95, 0, 0, false));
  return t;
}

/**
 * The angles a lumpy rim has to leave open for a flight that sweeps `span`
 * radians from `a0`.
 *
 * lobeRing and the whipped-cream rim each open a half-radian window round a
 * single angle, which is the right size for a stair arriving at a point. The
 * two upper flights do not arrive at a point: they spiral round most of the
 * ledge they stand on, and a rim of ice cream down the length of one is a rim
 * she walks face-first into. Half-radian steps butt their windows together
 * into one continuous opening.
 */
function arcGap(a0: number, span: number): number[] {
  const out: number[] = [];
  for (let a = a0; a < a0 + span; a += 0.5) out.push(a);
  out.push(a0 + span);
  return out;
}

/**
 * The tallest thing in the park: four scoops she can climb, with a looking
 * glass on the summit at 16.8m and a chocolate-sauce slide back down.
 *
 * Every tread is a block standing on what is under it, the way the lookout
 * stair in cave.ts is built, so there is no hole to fall into and every step
 * is between 0.35m and 0.48m — heights she clears without jumping, with room
 * under her 0.62m step-up. A flight is kept clear of the drum it climbs
 * toward, and the lower two get a landing at the top to bridge the last step
 * onto the ring, because a stair that stops twenty centimetres short of the
 * floor is a stair she falls off. The upper two are built to touch their drum
 * instead: that high up there is no radius to spare for a landing.
 *
 * Heights: the climb starts at ground level at local (0, 0, 10.6), on the +z
 * side facing the path; then the ring at 4.2, the terrace at 8.4, the
 * bubblegum ring at 13.0 and the summit at 16.8, with the cherry over it
 * topping out near 19.7. Each tier's lumpy rim is its railing — except where
 * a flight fills the ledge, where the flight itself is the edge.
 *
 * The four flights wind the same way all the way up, so from anywhere at the
 * foot the route reads as one spiral: there is never a moment on the mountain
 * where the next set of steps is behind her.
 *
 * The slide is decoration, not a collider: the game has no chute-riding code,
 * and a solid ramp would be a second way to the top that skips the climb.
 */
export function makeIceCreamMountain(seed = 20260921) {
  const g = new THREE.Group();
  const rand = seeded(seed);
  const boxes: CandyBox[] = [];
  const M = ICE_CREAM_MOUNTAIN;

  /**
   * One scoop: a drum with the flat top she walks on, a lumpy rim of lobes
   * that doubles as the railing, and sauce running over the edge. The drum
   * flares very slightly toward its base so it looks squashed onto whatever it
   * sits on; the flare is drawn outside the collider, never inside it, so
   * there is no invisible wall along the ring.
   */
  const drum = (r: number, fromY: number, toY: number, color: string) => {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.04, toY - fromY, 24), flat(color, 0.5));
    d.position.y = (fromY + toY) / 2;
    d.castShadow = true;
    d.receiveShadow = true;
    g.add(d);
  };
  const lobeRing = (r: number, y: number, color: string, rise: boolean, phase: number, ...openAt: number[]) => {
    const n = Math.max(14, Math.round(r * 2.4));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + phase;
      // leave the rim open where the flight below arrives, or the last step of
      // the climb is a lobe of ice cream in the face
      if (openAt.some((o) => Math.abs(Math.atan2(Math.sin(a - o), Math.cos(a - o))) < 0.5)) continue;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      g.add(mesh(sphereGeo, color, 1.05, 0.9, 1.05, x, y, z));
      if (rise) g.add(mesh(sphereGeo, color, 0.72, 0.66, 0.72, x, y + 0.74, z, false));
    }
  };
  const sauce = (r: number, y: number, count: number, phase: number) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + phase;
      const len = 0.9 + rand() * 1.3;
      g.add(cm(sphereGeo, "#5a3520", 1.0, 0.3, 1.0, Math.cos(a) * (r - 0.3), y + 0.12, Math.sin(a) * (r - 0.3), false));
      g.add(cm(sphereGeo, "#5a3520", 0.45, len, 0.45, Math.cos(a) * (r + 0.02), y - len * 0.5, Math.sin(a) * (r + 0.02), false));
    }
  };
  const sprinkles = (rOut: number, rIn: number, y: number, count: number) => {
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      const rr = rIn + rand() * (rOut - rIn);
      const sp = mesh(boxGeo, GUMDROPS[Math.floor(rand() * GUMDROPS.length)]!, 0.14, 0.12, 0.42, Math.cos(a) * rr, y + 0.06, Math.sin(a) * rr, false);
      sp.rotation.y = rand() * 3;
      g.add(sp);
    }
  };

  // ---- the lower scoop: strawberry, with the ring on top
  const T0 = TIERS[0]!;
  drum(T0.r, 0, T0.top, T0.color);
  for (const b of discBoxes(T0.r, 0, T0.top)) boxes.push(b);
  lobeRing(T0.r, T0.top, T0.color, true, 0, FLIGHTS[0]!.a0 + FLIGHTS[0]!.span, M.slideAngle);
  // a second row halfway down the side: without it the drum is a drum, and the
  // whole mountain reads as a layer cake
  lobeRing(T0.r - 0.35, T0.top - 1.9, T0.color, false, 0.3);
  sauce(T0.r, T0.top, 7, 0.3);
  sprinkles(T0.r - 1.4, DECK.r + 0.7, T0.top, 22);

  // ---- the upper drum: mint, then vanilla, with the deck on top
  drum(DECK.r, 0, DECK.seam, DECK.lower);
  drum(DECK.r, DECK.seam, DECK.top, DECK.color);
  for (const b of discBoxes(DECK.r, 0, DECK.top)) boxes.push(b);
  lobeRing(DECK.r, DECK.seam, DECK.lower, false, 0.5);
  lobeRing(DECK.r, DECK.top, DECK.color, true, 0.2, FLIGHTS[1]!.a0 + FLIGHTS[1]!.span);
  sauce(DECK.r, DECK.seam, 5, 1.1);
  sauce(DECK.r, DECK.top, 5, 0.2);

  // ---- the bubblegum scoop on the terrace, and the horn above it. Both
  // stand on what is already solid under them, so their colliders start at
  // the floor they sit on rather than at the grass: a box from y 0 here would
  // be a second, wider mountain hidden inside the first.
  drum(SCOOP.r, DECK.top, SCOOP.seam, SCOOP.lower);
  drum(SCOOP.r, SCOOP.seam, SCOOP.top, SCOOP.color);
  for (const b of discBoxes(SCOOP.r, DECK.top, SCOOP.top, 0.45)) boxes.push(b);
  lobeRing(SCOOP.r, SCOOP.seam, SCOOP.lower, false, 0.9);
  lobeRing(SCOOP.r, SCOOP.top, SCOOP.color, true, 0.4, ...arcGap(FLIGHTS[3]!.a0, FLIGHTS[3]!.span));
  sauce(SCOOP.r, SCOOP.top, 5, 0.7);

  drum(PEAK.r, SCOOP.top, PEAK.seam, PEAK.lower);
  drum(PEAK.r, PEAK.seam, PEAK.top, PEAK.color);
  for (const b of discBoxes(PEAK.r, SCOOP.top, PEAK.top, 0.32)) boxes.push(b);
  sauce(PEAK.r, PEAK.seam, 4, 1.4);

  // ---- the flights, and the landing that joins the lower two to their ring
  for (const f of FLIGHTS) {
    const n = f.n;
    const base = f.fromY;
    for (let k = 1; k <= n; k++) {
      const top = base + ((f.toY - base) * k) / n;
      const a = f.a0 + (f.span * (k - 1)) / (n - 1);
      const x = Math.cos(a) * f.r;
      const z = Math.sin(a) * f.r;
      // A tread is a block standing on whatever is under it — the ground for
      // the first flight, the ledge below for the rest. Running the second
      // flight's blocks all the way down to the grass (which is what "a block
      // standing on the ground" reads as if you take it literally) left eight
      // wafer slabs up to eight metres tall standing on the strawberry scoop,
      // and from the path the mountain had a plank wall down one side.
      const foot = f.fromY > 0 ? f.fromY - 0.3 : 0;
      boxes.push(bx(x, (foot + top) / 2, z, f.tread, top - foot, f.tread));
      // drawn as a slim riser under a full-width tread, because twelve
      // full-width blocks side by side are a wall, not a flight of stairs
      g.add(mesh(boxGeo, WAFER_DARK, f.tread * 0.62, top - foot - 0.3, f.tread * 0.62, x, (foot + top - 0.3) / 2, z));
      g.add(mesh(boxGeo, k % 2 ? WAFER : "#dcae62", f.tread, 0.34, f.tread, x, top - 0.17, z));
      // A nosing on each tread, so the flight is legible from the grass. It is
      // cream, not icing white: a flat white strip in full sun blooms out into
      // a glowing bar and the stair looked like it was on fire.
      turned(g, mesh(boxGeo, CREAM, f.tread * 0.95, 0.12, 0.26, x + Math.cos(a) * (f.tread / 2 - 0.22), top + 0.06, z + Math.sin(a) * (f.tread / 2 - 0.22), false), 0, -a, 0);
    }
    // the landing: level with the ring, reaching from under the last tread to
    // well inside the drum, so there is no gap to step over at the top. The
    // upper flights ask for none, because their treads already touch the drum
    // and a landing up there would roof over the step below it.
    if (f.landing <= 0) continue;
    const la = f.a0 + f.span;
    const lx = Math.cos(la) * (f.toR - 0.3);
    const lz = Math.sin(la) * (f.toR - 0.3);
    g.add(mesh(boxGeo, CREAM, f.landing, 0.5, f.landing, lx, f.toY - 0.25, lz, false));
    boxes.push(bx(lx, f.toY - 0.3, lz, f.landing, 0.6, f.landing));
  }

  // ---- the deck: whipped cream round the rim, with gaps where the flight
  // arrives and where the slide leaves, and a cherry in the middle
  const dr = DECK.r;
  const deckTop = DECK.top;
  turned(g, mesh(cyl24, WAFER, dr - 0.05, 0.14, dr - 0.05, 0, deckTop + 0.07, 0, false));
  for (let i = -3; i <= 3; i++) {
    g.add(mesh(boxGeo, WAFER_DARK, dr * 1.6, 0.05, 0.12, 0, deckTop + 0.15, i * (dr / 3.6), false));
    g.add(mesh(boxGeo, WAFER_DARK, 0.12, 0.05, dr * 1.6, i * (dr / 3.6), deckTop + 0.15, 0, false));
  }
  const rimN = 14;
  // the cream rim is only wanted where she can actually reach the edge: over
  // the third flight's sweep the stair fills the ledge from the drum to within
  // a handspan of the drop, so the rim there would be decoration poking
  // through the steps rather than anything she could fall past
  const deckGaps = [M.arriveAngle, ...arcGap(FLIGHTS[2]!.a0, FLIGHTS[2]!.span)];
  for (let i = 0; i < rimN; i++) {
    const a = (i / rimN) * Math.PI * 2;
    const gap = (to: number) => Math.abs(Math.atan2(Math.sin(a - to), Math.cos(a - to)));
    if (deckGaps.some((to) => gap(to) < 0.5) || gap(M.slideAngle) < 0.55) continue;
    const x = Math.cos(a) * (dr - 0.5);
    const z = Math.sin(a) * (dr - 0.5);
    g.add(mesh(sphereGeo, ICING, 0.85, 0.8, 0.85, x, deckTop + 0.4, z));
    g.add(mesh(sphereGeo, ICING, 0.6, 0.58, 0.6, x, deckTop + 1.0, z, false));
  }
  // sprinkles only on the ring of terrace she can walk on; the middle of it is
  // under the bubblegum scoop now
  sprinkles(dr - 0.35, SCOOP.r + 0.1, deckTop, 12);

  // ---- the bubblegum ring at 13.0: the same sprinkles, and a cream rim on
  // the quarter of it the last flight does not stand on
  sprinkles(SCOOP.r - 0.25, PEAK.r + 0.15, SCOOP.top, 9);

  // ---- the summit. A wafer floor with a candy-cane rail round it, open where
  // the stair arrives, and the cherry that used to sit on the terrace moved up
  // here where it is the highest thing in the park.
  const sy = PEAK.top;
  turned(g, mesh(cyl24, WAFER, PEAK.r - 0.04, 0.14, PEAK.r - 0.04, 0, sy + 0.07, 0, false));
  for (let i = -2; i <= 2; i++) {
    g.add(mesh(boxGeo, WAFER_DARK, PEAK.r * 1.7, 0.05, 0.1, 0, sy + 0.15, i * (PEAK.r / 2.6), false));
    g.add(mesh(boxGeo, WAFER_DARK, 0.1, 0.05, PEAK.r * 1.7, i * (PEAK.r / 2.6), sy + 0.15, 0, false));
  }
  /*
   * The rail, and it is solid, unlike every other rim on the mountain. Those
   * stand on ledges three metres wide with the drum's own shoulder outside
   * them; this one is a ring of candy canes round a floor she can cross in
   * two steps, with sixteen metres under it. The posts are close enough
   * together that she cannot fit between two of them, so the ring stops her
   * even though it is made of separate boxes, and the gap where the stair
   * arrives is the one way on and off.
   */
  const railN = 16;
  const railR = PEAK.r - 0.2;
  const sa = M.summitArriveAngle;
  const caneAt = (a: number, r: number, y: number, red: boolean) => {
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    g.add(mesh(cylGeo, red ? RED : ICING, 0.17, 1.0, 0.17, x, y + 0.5, z, false));
    // a small cap, not a ball: big ones turned the rail into birthday candles
    g.add(mesh(sphereGeo, red ? ICING : RED, 0.18, 0.14, 0.18, x, y + 1.02, z, false));
    boxes.push(bx(x, y + 0.5, z, 0.34, 1.0, 0.34));
  };
  for (let i = 0; i < railN; i++) {
    const a = (i / railN) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a - sa), Math.cos(a - sa))) < 0.45) continue;
    caneAt(a, railR, sy, i % 2 === 1);
  }
  /*
   * Two gateposts, set a little proud of the ring, narrowing the way out to
   * the width of the top tread. Without them the doorway was wide enough to
   * leave at a slant, which walked her past the end of the stair and off the
   * side of the mountain.
   *
   * The stair itself gets no rail, here or lower down: a tread is 1.5m and
   * she is 0.68m across, so a parapet on one would leave a gap she cannot
   * walk through. The summit is railed because it is the one place up here
   * she is meant to stand still in.
   */
  for (const s of [-1, 1]) caneAt(sa + s * 0.38, railR + 0.15, sy, s > 0);
  // the hoop across the tops of the canes, drawn only: it is above the boxes
  // that already stop her, and a collider up there would only bump her head
  turned(g, part(tube24, flat(ICING, 0.45), railR, 0.1, railR, 0, sy + 0.94, 0, false));

  // the cherry, pushed out to the rail on the far side so the middle of the
  // floor stays hers and it never stands between her and the glass
  const cx = Math.cos(M.summitArriveAngle + Math.PI) * 1.05;
  const cz = Math.sin(M.summitArriveAngle + Math.PI) * 1.05;
  g.add(mesh(sphereGeo, ICING, 0.85, 0.55, 0.85, cx, sy + 0.3, cz, false));
  g.add(mesh(sphereGeo, ICING, 0.64, 0.44, 0.64, cx, sy + 0.62, cz, false));
  g.add(mesh(sphere16, CHERRY, 0.8, 0.8, 0.8, cx, sy + 1.24, cz));
  g.add(mesh(sphereGeo, "#ff7a86", 0.22, 0.22, 0.22, cx - 0.25, sy + 1.62, cz + 0.29, false));
  const stalk = mesh(cylGeo, "#4e8a3c", 0.08, 1.3, 0.08, cx + 0.19, sy + 2.22, cz, false);
  stalk.rotation.z = -0.36;
  g.add(stalk);
  g.add(mesh(sphereGeo, "#7ec86a", 0.46, 0.12, 0.26, cx + 0.58, sy + 2.76, cz, false));

  // the looking glass itself
  g.add(makeLookingGlassMesh(M.glass.x, sy, M.glass.z, M.glass.facing));

  // ---- The slide, in two stages with a landing on the ring between them.
  // One straight chute from the deck to the grass would have to fly over a
  // rim five metres up and four out, which at any angle a child would ride
  // puts the bottom end nineteen metres from the middle of the mountain; the
  // first try just tunnelled through the strawberry scoop instead. Two short
  // flights down the terraces is both shorter and more fun. Decoration only,
  // as the doc comment says, so none of it is a collider.
  const slide = new THREE.Group();
  slide.rotation.y = -M.slideAngle;
  g.add(slide);
  const tilt = 0.95;
  const stage = (fromY: number, toY: number, fromR: number) => {
    const drop = fromY - toY;
    const len = drop / Math.sin(tilt);
    const run = drop / Math.tan(tilt);
    const chute = new THREE.Group();
    chute.position.set(fromR + run / 2, (fromY + toY) / 2, 0);
    chute.rotation.z = -tilt;
    chute.add(cm(boxGeo, "#5a3520", len + 0.5, 0.3, 1.9, 0, 0, 0));
    for (const sgn of [-1, 1]) chute.add(cm(boxGeo, CHOC_LIGHT, len + 0.5, 0.5, 0.2, 0, 0.34, sgn * 0.95, false));
    slide.add(chute);
    return fromR + run;
  };
  // deck to the ring, then a chocolate puddle to land in, then ring to grass
  const midR = stage(DECK.top, T0.top, dr - 0.4);
  slide.add(cm(boxGeo, "#5a3520", 2.4, 0.3, 2.1, midR + 0.9, T0.top + 0.15, 0, false));
  const footR = stage(T0.top, 0, T0.r - 0.2);
  slide.add(cm(boxGeo, "#5a3520", 2.4, 0.42, 2.1, footR + 0.8, 0.21, 0, false));
  slide.add(mesh(cyl24, ICING, 2.5, 0.28, 2.5, footR + 2.3, 0.14, 0, false));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    slide.add(mesh(sphereGeo, ICING, 0.65, 0.55, 0.65, footR + 2.3 + Math.cos(a) * 2.2, 0.3, Math.sin(a) * 2.2, false));
  }

  g.userData.boxes = boxes;
  g.userData.deckY = deckTop;
  g.userData.deckRadius = dr;
  g.userData.ringY = T0.top;
  g.userData.rampStart = [Math.cos(M.startAngle) * M.startRadius, 0, Math.sin(M.startAngle) * M.startRadius];
  return g;
}

/* ========================================================= cupcake carousel */

export type CupcakeCarousel = {
  group: THREE.Group;
  /** turns with the ride; `hub` and `spin` are the same object */
  hub: THREE.Group;
  spin: THREE.Group;
  /** the cupcakes; `seats` and `horses` are the same array */
  seats: THREE.Group[];
  horses: THREE.Group[];
  ring: THREE.Mesh;
  gold: THREE.Material;
  silver: THREE.Material;
  bulbs: THREE.Mesh[];
  radius: number;
  seatRadius: number;
};

/**
 * The carousel, with giant cupcakes where the horses go.
 *
 * Shaped to be a drop-in for CarnivalRig (carnival-mesh.ts) so the ride code in
 * runtime.ts drives it unchanged: `spin` is what turns, each seat carries
 * `userData.angle`, each sits at y 1.35 so updateCarousel's bob
 * (`1.35 + sin(...) * 0.18`) lands right, and the brass-ring arm reaches in
 * from +x at angle 0 with a ring whose material is swapped between `gold` and
 * `silver`. `hub` and `seats` are aliases of `spin` and `horses` for callers
 * who prefer the ferris wheel's names.
 *
 * One difference from the carnival's: that one is built at CAROUSEL.x/z in
 * world space, this one at its own origin, so whoever places it sets
 * group.position and keeps the matching constants in step.
 */
export function makeCupcakeCarouselRig(radius = 5, seatRadius = 3.7, seats = 6): CupcakeCarousel {
  const group = new THREE.Group();
  const bulbs: THREE.Mesh[] = [];
  const bulbCols = [YELLOW, PINK, MINT, LILAC];

  // ---- base: a wafer plinth with a striped skirt, the carnival carousel's
  // proportions exactly, so its fence and gate colliders transfer across
  group.add(mesh(cyl24, WAFER, radius + 0.3, 0.44, radius + 0.3, 0, 0.22, 0));
  group.add(part(tube24, striped(stripeTexture(RED, YELLOW, 24), 0.6, THREE.DoubleSide), radius + 0.32, 0.3, radius + 0.32, 0, 0.2, 0, false));
  group.add(part(cyl24, striped(caneTexture(YELLOW, ICING, 6, 6)), 0.78, 4.7, 0.78, 0, 2.35, 0));

  const spin = new THREE.Group();
  group.add(spin);

  // deck, canopy and everything on it turn with the ride
  spin.add(mesh(cyl24, "#d8b07a", radius, 0.1, radius, 0, 0.45, 0, false));
  const canopy = part(coneOpen24, striped(stripeTexture(PINK, ICING, 16), 0.6, THREE.DoubleSide), radius + 1, 1.9, radius + 1, 0, 5.65, 0);
  spin.add(canopy);
  // a cherry finial, so it is a cupcake from the very tip down
  spin.add(mesh(sphereGeo, CHERRY, 0.45, 0.45, 0.45, 0, 6.85, 0, false));
  spin.add(mesh(cylGeo, "#4e8a3c", 0.05, 0.6, 0.05, 0, 7.3, 0, false));
  // sprinkles round the canopy rim: the carnival's scallops, in candy
  const scallops = 24;
  for (let i = 0; i < scallops; i++) {
    const a = (i / scallops) * Math.PI * 2;
    turned(
      spin,
      mesh(boxGeo, GUMDROPS[i % GUMDROPS.length]!, 0.5, 0.16, 0.16, Math.cos(a) * (radius + 1), 4.62, Math.sin(a) * (radius + 1), false),
      0,
      -a,
      0,
    );
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.1;
    const bulb = new THREE.Mesh(
      sphereGeo,
      new THREE.MeshStandardMaterial({ color: bulbCols[i % 4], emissive: new THREE.Color(bulbCols[i % 4]), emissiveIntensity: 1.2 }),
    );
    bulb.scale.setScalar(0.1);
    bulb.position.set(Math.cos(a) * (radius + 0.95), 4.75, Math.sin(a) * (radius + 0.95));
    spin.add(bulb);
    bulbs.push(bulb);
  }

  // ---- the cupcakes
  // The frosting is tinted, not white: pale cream on a sunlit ride blows out
  // to a flat glowing lump and every cupcake looked like the same cupcake.
  const cases: [string, string][] = [
    [PINK, "#ffd4e6"],
    [MINT, "#c4f2e4"],
    [LILAC, "#e2d2ff"],
    [YELLOW, "#ffeaae"],
    [ORANGE, "#ffd9bc"],
    [RED, "#ffcdd2"],
  ];
  const holders: THREE.Group[] = [];
  const poleMat = striped(caneTexture("#ffd76a", ICING, 4, 8));
  for (let i = 0; i < seats; i++) {
    const a = (i / seats) * Math.PI * 2;
    spin.add(part(cyl16, poleMat, 0.05, 4.2, 0.05, Math.cos(a) * seatRadius, 2.55, Math.sin(a) * seatRadius, false));

    const holder = new THREE.Group();
    holder.position.set(Math.cos(a) * seatRadius, 1.35, Math.sin(a) * seatRadius);
    // the open side of the case faces out, so climbing in is obvious from the
    // fence, the way the carnival's horses face along the direction of travel
    holder.rotation.y = -a;
    const [wrap, frost] = cases[i % cases.length]!;
    holder.add(cupcakeSeat(wrap, frost));
    holder.userData.angle = a;
    // her feet go here, relative to the pivot: the same key the wheel uses
    holder.userData.seatY = -0.25;
    spin.add(holder);
    holders.push(holder);
  }

  // ---- brass-ring arm, reaching in from +x at angle 0, as the ride code wants
  const armFrom = seatRadius + 0.5;
  const armTo = radius + 1.9;
  group.add(mesh(boxGeo, "#c8a040", armTo - armFrom, 0.12, 0.12, (armFrom + armTo) / 2, 2.75, 0, false));
  const post = candyCane(2.9, 0.1);
  post.position.set(armTo, 0, 0);
  group.add(post);
  const gold = new THREE.MeshStandardMaterial({ color: "#ffd23a", emissive: new THREE.Color("#ffb400"), emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.25 });
  const silver = new THREE.MeshStandardMaterial({ color: "#d8dde4", metalness: 0.7, roughness: 0.25 });
  const ring = new THREE.Mesh(ringGeo, silver);
  ring.position.set(armFrom, 2.45, 0);
  ring.rotation.y = Math.PI / 2;
  group.add(ring);

  return { group, hub: spin, spin, seats: holders, horses: holders, ring, gold, silver, bulbs, radius, seatRadius };
}

/**
 * One cupcake seat, built round the fact that she rides with her feet at local
 * y -0.25: the sponge is just under that and the frosting wraps three sides at
 * her shoulder, so it reads as a seat rather than a tub she has fallen into.
 */
function cupcakeSeat(wrap: string, frost: string) {
  const c = new THREE.Group();
  c.add(part(caseGeo, striped(stripeTexture(wrap, "#ffffff", 14)), 0.95, 1.0, 0.95, 0, -0.55, 0));
  c.add(mesh(cylGeo, wrap, 0.7, 0.08, 0.7, 0, -1.03, 0, false)); // the case bottom
  c.add(mesh(cylGeo, "#d8b07a", 0.86, 0.14, 0.86, 0, -0.32, 0, false)); // sponge: the seat
  // frosting swirled round the back and sides, open toward +x (outward)
  for (let i = 0; i < 9; i++) {
    const a = 0.95 + (i / 8) * (Math.PI * 1.5);
    const r = 0.8;
    c.add(mesh(sphereGeo, frost, 0.36, 0.34, 0.36, Math.cos(a) * r, -0.02, Math.sin(a) * r));
    c.add(mesh(sphereGeo, frost, 0.26, 0.26, 0.26, Math.cos(a) * r * 0.82, 0.32, Math.sin(a) * r * 0.82, false));
  }
  c.add(mesh(sphereGeo, frost, 0.42, 0.34, 0.42, -0.38, 0.55, 0, false));
  c.add(mesh(sphereGeo, CHERRY, 0.22, 0.22, 0.22, -0.38, 0.85, 0, false));
  for (let i = 0; i < 8; i++) {
    const a = 1.05 + (i / 7) * (Math.PI * 1.35);
    const s = mesh(boxGeo, GUMDROPS[i % GUMDROPS.length]!, 0.1, 0.1, 0.24, Math.cos(a) * 0.72, 0.2, Math.sin(a) * 0.72, false);
    s.rotation.set(0.6, a, 0.4);
    c.add(s);
  }
  return c;
}

/* =========================================================== gumdrop wheel */

/**
 * The ferris wheel, with gumdrops for gondolas.
 *
 * Returns exactly what makeFerrisWheel returns, because runtime.ts's ride code
 * reads all of it: `hub.rotation.z` is the wheel angle, `gondolas` are children
 * of the hub in order round the rim starting at angle 0 (tryBoard recomputes
 * each one's angle as `i / count * 2PI + hub.rotation.z`), `levelGondolas`
 * counter-rotates them so they hang level, `userData.seatY` is where her feet
 * go relative to the pivot, and she boards and steps off at
 * `origin + boardLocal`. The A-frames are candy canes and the rims are strung
 * with sugar beads, but the machine underneath is the same one.
 */
export function makeGumdropWheelRig(radius = 6, hubY = 7.8, count = 8): FerrisWheel {
  const group = new THREE.Group();
  const steel = "#b8c2c8";
  const pale = ICING;
  const caneMat = striped(caneTexture(ICING, RED, 5, 10));

  // A-frames: candy-cane legs on liquorice pads
  const legLen = Math.hypot(3.6, hubY);
  const legTilt = Math.atan2(3.6, hubY);
  for (const z of [-2.2, 2.2]) {
    for (const s of [-1, 1]) {
      const leg = part(cyl16, caneMat, 0.22, legLen, 0.22, s * 1.8, hubY / 2, z);
      leg.rotation.z = s * legTilt;
      group.add(leg);
      group.add(mesh(boxGeo, LIQUORICE, 0.9, 0.5, 0.9, s * 3.6, 0.25, z));
    }
    turned(group, part(cyl16, caneMat, 0.16, 3.2, 0.16, 0, hubY * 0.55, z, false), 0, 0, Math.PI / 2);
  }
  turned(group, mesh(cylGeo, steel, 0.28, 5.4, 0.28, 0, hubY, 0), Math.PI / 2, 0, 0);

  const hub = new THREE.Group();
  hub.position.set(0, hubY, 0);
  group.add(hub);
  for (const z of [-1.4, 1.4]) {
    const rim = new THREE.Mesh(rimGeo, flat(PINK, 0.4));
    rim.scale.set(radius, radius, 1);
    rim.position.z = z;
    rim.castShadow = true;
    hub.add(rim);
    // sugar beads threaded along the rim: sixteen a side is enough to read as
    // a string of sweets and cheap enough not to matter
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + 0.2;
      hub.add(mesh(sphereGeo, i % 2 ? ICING : YELLOW, 0.2, 0.2, 0.2, Math.cos(a) * radius, Math.sin(a) * radius, z, false));
    }
    turned(hub, mesh(cylGeo, pale, 0.55, 0.3, 0.55, 0, 0, z, false), Math.PI / 2, 0, 0);
  }

  const gondolas: THREE.Group[] = [];
  const colours = [RED, YELLOW, MINT, LILAC, PINK, ORANGE, "#4fd0e8", "#9ae86a"];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    for (const z of [-1.4, 1.4]) {
      const spoke = mesh(cylGeo, pale, 0.09, radius, 0.09, (Math.cos(a) * radius) / 2, (Math.sin(a) * radius) / 2, z, false);
      spoke.rotation.z = a - Math.PI / 2;
      hub.add(spoke);
    }
    turned(hub, mesh(cylGeo, steel, 0.08, 2.8, 0.08, Math.cos(a) * radius, Math.sin(a) * radius, 0, false), Math.PI / 2, 0, 0);

    const g = new THREE.Group();
    g.position.set(Math.cos(a) * radius, Math.sin(a) * radius, 0);
    const c = colours[i % colours.length]!;
    g.add(mesh(boxGeo, steel, 0.08, 0.8, 0.08, -0.6, -0.4, 0, false));
    g.add(mesh(boxGeo, steel, 0.08, 0.8, 0.08, 0.6, -0.4, 0, false));
    // the gumdrop: a dome on a short straight skirt with the top sliced flat,
    // so there is visibly somewhere to sit, and a band of sugar crust round it
    g.add(mesh(sphere16, c, 1.0, 0.95, 0.95, 0, -1.28, 0));
    g.add(mesh(cylGeo, c, 1.0, 0.55, 0.95, 0, -1.55, 0, false));
    g.add(mesh(cylGeo, "#f4efe6", 0.92, 0.1, 0.88, 0, -1.72, 0, false)); // the seat
    for (let k = 0; k < 12; k++) {
      const t = (k / 12) * Math.PI * 2;
      g.add(mesh(sphereGeo, "#fdf8ee", 0.12, 0.12, 0.12, Math.cos(t) * 0.98, -1.5, Math.sin(t) * 0.92, false));
    }
    g.add(mesh(boxGeo, "#f7f3ee", 1.4, 0.1, 1.2, 0, -0.85, 0, false)); // grab rail
    g.userData.seatY = -1.7;
    hub.add(g);
    gondolas.push(g);
  }

  // fence and boarding platform on the same footprint as the park's wheel, so
  // the colliders already in colliders.ts fit this one unchanged
  const fenceY = 0.45;
  const fh = 0.9;
  group.add(mesh(boxGeo, pale, 14.4, fh, 0.12, 0, fenceY, -3.2, false));
  group.add(mesh(boxGeo, pale, 0.12, fh, 6.4, -7.2, fenceY, 0, false));
  group.add(mesh(boxGeo, pale, 0.12, fh, 6.4, 7.2, fenceY, 0, false));
  group.add(mesh(boxGeo, pale, 5.4, fh, 0.12, -4.5, fenceY, 3.2, false));
  group.add(mesh(boxGeo, pale, 5.4, fh, 0.12, 4.5, fenceY, 3.2, false));
  for (const x of [-7.2, -1.8, 1.8, 7.2]) {
    const c = candyCane(1.6, 0.1);
    c.position.set(x, 0, 3.2);
    group.add(c);
  }
  group.add(mesh(boxGeo, "#d8b07a", 3.2, 0.6, 1.6, 0, 0.3, 4.0));
  group.add(mesh(boxGeo, "#d8b07a", 3.2, 0.3, 0.8, 0, 0.15, 5.2));
  group.add(mesh(boxGeo, YELLOW, 3.2, 0.08, 1.6, 0, 0.62, 4.0, false));

  return {
    group,
    hub,
    gondolas,
    radius,
    hubY,
    boardLocal: new THREE.Vector3(0, WHEEL_BOARD.y, WHEEL_BOARD.dz),
    origin: new THREE.Vector3(),
  };
}

/* ============================================================ chocolate boat */

/**
 * The chocolate river boat: a bar of chocolate hollowed out into a punt, big
 * enough for her to stand up in.
 *
 * 3.6m long, 2.0m wide, sides 0.85m above the floor — a rail she can see over
 * and not fall out of. The floor is flat at y 0.45 and solid right across the
 * cockpit, so standing on it is the same problem for the engine as standing on
 * any other box in the park.
 */
export function makeChocolateBoat() {
  const g = new THREE.Group();
  const L = 3.6;
  const W = 2.0;
  const FLOOR = 0.45;
  const SIDE = 0.85;
  const t = 0.22;
  const boxes: CandyBox[] = [];
  const solid = (color: string, sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
    g.add(cm(boxGeo, color, sx, sy, sz, x, y, z));
    boxes.push(bx(x, y, z, sx, sy, sz));
  };

  // hull: solid from the waterline up to the floor, so there is no gap under her
  solid(CHOC, W, FLOOR, L, 0, FLOOR / 2, 0);
  for (const s of [-1, 1]) solid(CHOC, t, SIDE, L, s * (W / 2 - t / 2), FLOOR + SIDE / 2, 0);
  solid(CHOC, W, SIDE, t, 0, FLOOR + SIDE / 2, -L / 2 + t / 2); // stern
  solid(CHOC, W, SIDE, t, 0, FLOOR + SIDE / 2, L / 2 - t / 2); // bow transom

  // ---- the chocolate-bar look: moulded squares down both sides, cream rail
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      g.add(cm(boxGeo, CHOC_LIGHT, 0.08, 0.5, 0.62, s * (W / 2 + 0.02), FLOOR + SIDE / 2, -1.25 + i * 0.83, false));
    }
    g.add(mesh(boxGeo, CREAM, 0.14, 0.16, L + 0.1, s * (W / 2 + 0.02), FLOOR + SIDE - 0.04, 0, false));
  }
  // a short chamfered prow, so the boat has a front from thirty metres away.
  // A full-length one read as a shovel blade from the bank.
  turned(g, part(cone4Geo, flat(CHOC), W * 0.6, 0.85, 0.8, 0, FLOOR + 0.3, L / 2 + 0.26), Math.PI / 2, 0, Math.PI / 4);
  g.add(mesh(boxGeo, CHOC_LIGHT, W * 0.45, 0.5, 0.1, 0, FLOOR + 0.5, L / 2 + 0.14, false));
  g.add(mesh(sphereGeo, CHERRY, 0.28, 0.28, 0.28, 0, FLOOR + 0.95, L / 2 + 0.22, false));

  // ---- a wafer bench across the stern and a liquorice mat on the floor
  g.add(mesh(boxGeo, WAFER, W - t * 2 - 0.1, 0.16, 0.6, 0, FLOOR + 0.44, -L / 2 + 0.62, false));
  for (const s of [-1, 1]) g.add(mesh(boxGeo, WAFER_DARK, 0.16, 0.36, 0.5, s * 0.55, FLOOR + 0.18, -L / 2 + 0.62, false));
  g.add(mesh(boxGeo, LIQUORICE, W - t * 2 - 0.2, 0.05, 1.6, 0, FLOOR + 0.03, 0.25, false));

  // ---- a wafer paddle stowed along the port side, and a sweet in the bow
  const paddle = mesh(boxGeo, WAFER, 0.1, 0.1, 2.2, -W / 2 + 0.3, FLOOR + 0.94, 0.1, false);
  paddle.rotation.x = 0.1;
  g.add(paddle);
  g.add(mesh(boxGeo, WAFER_DARK, 0.36, 0.06, 0.7, -W / 2 + 0.3, FLOOR + 1.05, 1.3, false));
  g.add(mesh(sphereGeo, PINK, 0.3, 0.3, 0.3, 0.45, FLOOR + 0.22, 1.15, false));

  // a cream bow-wave skirt, so the hull does not meet the water in a hard line
  g.add(mesh(boxGeo, CREAM, W + 0.16, 0.16, L + 0.12, 0, 0.12, 0, false));

  g.userData.boxes = boxes;
  g.userData.floorY = FLOOR;
  g.userData.length = L;
  g.userData.width = W;
  return g;
}

/* =========================================================== gumball machine */

/**
 * A gumball machine the size of a garden shed: red base, glass globe, gumballs.
 *
 * The balls are one InstancedMesh of about a hundred eighty-triangle spheres,
 * tinted per instance. A hundred separate meshes would be a hundred draw calls
 * for the one detail nobody looks at twice, and the static merge skips
 * instanced meshes (merge.ts), so they stay one call for good.
 *
 * Scale is baked into the parts rather than set on the group, so the boxes on
 * userData are in the same units as everything else in this file. At scale 1
 * it stands 4.5m tall on a 2.2m base; scale 0.7 gives a 3m one.
 */
export function makeGumballMachine(scale = 1, seed = 20260921) {
  const g = new THREE.Group();
  const s = scale;
  const rand = seeded(seed);
  const boxes: CandyBox[] = [];

  // ---- base: a stepped red pedestal. A square collider under a round base is
  // fine; she bumps the corner of a two-metre machine and never notices.
  g.add(mesh(cyl24, "#c4172f", 1.1 * s, 0.22 * s, 1.1 * s, 0, 0.11 * s, 0));
  g.add(mesh(cyl24, RED, 0.95 * s, 1.5 * s, 0.95 * s, 0, 0.97 * s, 0));
  g.add(mesh(cyl24, "#c4172f", 1.05 * s, 0.2 * s, 1.05 * s, 0, 1.82 * s, 0, false));
  boxes.push(bx(0, 0.96 * s, 0, 1.75 * s, 1.92 * s, 1.75 * s));

  // the business end, all of it at a child's height: chute, flap, coin knob
  g.add(mesh(boxGeo, "#8a0f22", 0.7 * s, 0.6 * s, 0.24 * s, 0, 0.62 * s, 0.85 * s, false));
  g.add(mesh(boxGeo, LIQUORICE, 0.5 * s, 0.4 * s, 0.1 * s, 0, 0.58 * s, 0.97 * s, false));
  turned(g, mesh(cylGeo, "#d8dde4", 0.26 * s, 0.14 * s, 0.26 * s, 0, 1.35 * s, 0.9 * s, false), Math.PI / 2, 0, 0);
  const knob = mesh(boxGeo, "#d8dde4", 0.1 * s, 0.34 * s, 0.1 * s, 0, 1.35 * s, 1.02 * s, false);
  knob.rotation.z = 0.5;
  g.add(knob);

  // ---- globe: one transparent sphere, a brass collar and a knurled lid
  const R = 1.25 * s;
  const globeY = 3.0 * s;
  g.add(mesh(cyl24, "#c8a040", 0.8 * s, 0.22 * s, 0.8 * s, 0, 1.95 * s, 0, false));
  const glass = new THREE.Mesh(sphere16, lam("#eaf6ff", { flat: true, opacity: 0.3, transparent: true, roughness: 0.06 }));
  glass.scale.setScalar(R);
  glass.position.y = globeY;
  g.add(glass);
  g.add(mesh(cyl24, "#c8a040", 0.46 * s, 0.3 * s, 0.46 * s, 0, globeY + R - 0.04 * s, 0, false));
  g.add(mesh(sphereGeo, "#c8a040", 0.22 * s, 0.22 * s, 0.22 * s, 0, globeY + R + 0.2 * s, 0, false));

  // ---- the gumballs, on a jittered lattice inside the globe. A lattice packs
  // them evenly in one pass; rejection sampling a hundred non-overlapping
  // positions can run long, and this has to be the same every load anyway.
  const br = 0.17 * s;
  const step = br * 2.1;
  const inner = R - br * 1.15;
  const spots: [number, number, number][] = [];
  const n = Math.ceil(inner / step);
  for (let ix = -n; ix <= n; ix++) {
    for (let iy = -n; iy <= n; iy++) {
      for (let iz = -n; iz <= n; iz++) {
        const px = ix * step + (rand() - 0.5) * step * 0.3;
        const py = iy * step + (ix % 2 ? step * 0.4 : 0) + (rand() - 0.5) * step * 0.3;
        const pz = iz * step + (iy % 2 ? step * 0.4 : 0) + (rand() - 0.5) * step * 0.3;
        if (px * px + py * py + pz * pz > inner * inner) continue;
        spots.push([px, py, pz]);
      }
    }
  }
  const balls = new THREE.InstancedMesh(ballGeo, lam("#ffffff", { flat: true, roughness: 0.22 }), spots.length);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  const palette = [...GUMDROPS, "#4fd0e8", "#9ae86a", "#ffffff"];
  spots.forEach(([px, py, pz], i) => {
    m4.makeScale(br, br, br);
    m4.setPosition(px, globeY + py, pz);
    balls.setMatrixAt(i, m4);
    col.set(palette[Math.floor(rand() * palette.length)]!);
    balls.setColorAt(i, col);
  });
  balls.instanceMatrix.needsUpdate = true;
  if (balls.instanceColor) balls.instanceColor.needsUpdate = true;
  balls.castShadow = true;
  g.add(balls);

  g.userData.boxes = boxes;
  g.userData.ballCount = spots.length;
  g.userData.height = globeY + R + 0.35 * s;
  return g;
}

/* ========================================================== candy shop stall */

/**
 * A market stall for the prize shop and the game booths, cut to the same
 * pattern as the carnival's (carnival-mesh.ts): a striped awning sloping to
 * the front, a counter at 1.08m, a name board over the top.
 *
 * It faces +z, unlike the carnival's booths, which face -z — everything in
 * this file fronts +z so a row of them lays out without a rotation table. The
 * back, the sides and the counter are solid; the awning and its candy-cane
 * posts are not, so she can reach the counter from either end.
 */
export function makeCandyShopStall(awningColor = PINK, name = "SWEETS", seed = 20260921) {
  const g = new THREE.Group();
  const rand = seeded(seed);
  const W = 4.0;
  const D = 2.6;
  const front = D / 2;
  const boxes: CandyBox[] = [];
  const solid = (color: string, sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
    g.add(mesh(boxGeo, color, sx, sy, sz, x, y, z));
    boxes.push(bx(x, y, z, sx, sy, sz));
  };

  // ---- back, sides and the counter she leans on
  solid(WAFER, W, 2.4, 0.2, 0, 1.2, -D / 2 + 0.1);
  for (const s of [-1, 1]) solid(WAFER, 0.2, 2.4, D - 0.2, s * (W / 2 - 0.1), 1.2, 0);
  solid(WAFER_DARK, W, 1.08, 0.5, 0, 0.54, front - 0.25);
  g.add(mesh(boxGeo, CREAM, W + 0.2, 0.12, 0.7, 0, 1.14, front - 0.25, false));
  // a striped valance under the counter, so it is not a bare brown slab
  g.add(part(null, striped(stripeTexture(awningColor, ICING, 12)), W, 0.9, 0.08, 0, 0.5, front + 0.03, false));

  // ---- awning: striped, sloping down toward the front, scalloped edge
  const awning = part(null, striped(stripeTexture(awningColor, ICING, 10), 0.7), W + 0.5, 0.1, D + 0.9, 0, 3.15, 0.25);
  awning.rotation.x = 0.22;
  g.add(awning);
  const scallops = 9;
  for (let i = 0; i < scallops; i++) {
    g.add(
      mesh(
        sphereGeo,
        i % 2 ? ICING : awningColor,
        (W + 0.5) / scallops / 2 + 0.02,
        0.2,
        0.06,
        -(W + 0.5) / 2 + ((i + 0.5) * (W + 0.5)) / scallops,
        2.83,
        front + 0.64,
        false,
      ),
    );
  }
  for (const s of [-1, 1]) {
    const c = candyCane(2.35, 0.09, awningColor);
    c.position.set(s * (W / 2 - 0.08), 0, front + 0.12);
    g.add(c);
  }

  // ---- name board and bunting
  const sign = signBoard(name, Math.min(W - 0.3, 0.6 + name.length * 0.36), 0.75);
  sign.position.set(0, 3.9, 0.4);
  g.add(sign);
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const f = mesh(boxGeo, GUMDROPS[i % GUMDROPS.length]!, 0.2, 0.26, 0.05, -W / 2 + t * W, 2.6 - Math.sin(t * Math.PI) * 0.22, front + 0.5, false);
    f.rotation.z = (t - 0.5) * 0.5;
    g.add(f);
  }

  // ---- the goods: jars on a back shelf, trays of sweets on the counter
  g.add(mesh(boxGeo, WAFER_DARK, W - 0.5, 0.1, 0.6, 0, 1.55, -D / 2 + 0.55, false));
  const jarGlass = lam("#eaf6ff", { flat: true, opacity: 0.32, transparent: true, roughness: 0.06 });
  for (let i = 0; i < 4; i++) {
    const x = -W / 2 + 0.7 + i * ((W - 1.4) / 3);
    g.add(part(cyl16, jarGlass, 0.24, 0.56, 0.24, x, 1.9, -D / 2 + 0.55, false));
    g.add(mesh(cylGeo, GUMDROPS[Math.floor(rand() * GUMDROPS.length)]!, 0.2, 0.4, 0.2, x, 1.82, -D / 2 + 0.55, false));
    g.add(mesh(cylGeo, RED, 0.26, 0.08, 0.26, x, 2.22, -D / 2 + 0.55, false));
  }
  for (let i = 0; i < 3; i++) {
    const x = -1.1 + i * 1.1;
    g.add(mesh(boxGeo, ICING, 0.7, 0.1, 0.5, x, 1.25, front - 0.25, false));
    for (let k = 0; k < 5; k++) {
      g.add(mesh(sphereGeo, GUMDROPS[Math.floor(rand() * GUMDROPS.length)]!, 0.11, 0.11, 0.11, x - 0.24 + k * 0.12, 1.37, front - 0.25 + (rand() - 0.5) * 0.3, false));
    }
  }
  // a lollipop stand at one end, so there is something above counter height
  const stand = new THREE.Group();
  stand.position.set(W / 2 - 0.55, 1.2, front - 0.3);
  const stickMat = striped(caneTexture(ICING, "#e0d8cc", 3, 4));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    stand.add(part(cyl16, stickMat, 0.03, 0.8, 0.03, Math.cos(a) * 0.12, 0.4, Math.sin(a) * 0.12, false));
    turned(stand, mesh(cylGeo, GUMDROPS[i % GUMDROPS.length]!, 0.18, 0.05, 0.18, Math.cos(a) * 0.12, 0.85, Math.sin(a) * 0.12, false), Math.PI / 2, 0, 0);
  }
  g.add(stand);

  g.userData.boxes = boxes;
  g.userData.counterY = 1.08;
  return g;
}
