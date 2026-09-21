import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { beveledBox } from "./beveled";
import { boxGeo, coneGeo, cylGeo, lam, mesh, sphereGeo } from "./meshes";
import { noOutline } from "./scenery";
import type { AABB } from "./collision";

/**
 * Sugar Rush Park scenery.
 *
 * Same rules as the rest of the park's props: flat-shaded chunky plastic,
 * built out of the shared primitives in meshes.ts, no textures, no asset
 * files. The difference is the palette and that a lot of these are *big* —
 * a lollipop is a tree here, a gumdrop is a boulder — so they have to read
 * from across a field on a TV, not just up close.
 *
 * Anything a kid can bump into reports its solid parts in local space on
 * `group.userData.boxes` as `AABB[]`. The caller offsets and rotates them
 * into the world when it builds colliders; nothing here knows where it is.
 * Pure decoration (sprinkles, cotton candy, the soda can pickup) has no
 * boxes at all, so the caller can tell the two apart by presence.
 *
 * Every function is deterministic. Where a shape wants variety it takes a
 * seed, never Math.random().
 */

export type SceneryBoxes = AABB[];

/** Bright saturated candy. Kept in one place so the park stays one world. */
export const CANDY = {
  red: "#e8384f",
  pink: "#ff6aa8",
  pinkPale: "#ff93c4",
  yellow: "#ffc83a",
  mint: "#6fe3c4",
  lilac: "#b06aff",
  orange: "#ff8a3a",
  chocolate: "#6b4226",
  chocolateLight: "#8a5a34",
  cream: "#f7ead3",
  white: "#fbf7f2",
} as const;

/** Sweets are wet-looking; the park's default roughness reads as chalk. */
const GLOSS = 0.16;
function glossy(color: string, roughness = GLOSS) {
  // flat: no procedural texture. Brick on a gumdrop is exactly the failure
  // mode makeGirl's comment warns about.
  return lam(color, { flat: true, roughness });
}

function box(minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number): AABB {
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

/** Local-space AABB around a centred upright prop. */
function footprint(halfX: number, height: number, halfZ = halfX): AABB {
  return box(-halfX, halfX, 0, height, -halfZ, halfZ);
}

/** mulberry32: small, fast, and the same numbers on every machine. */
function rng(seed: number) {
  let a = (seed | 0) + 0x6d2b79f5;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Extra shared primitives, on top of the ones meshes.ts exports. Like those,
 * these are built once at module level and must never be disposed: hundreds
 * of props in the park point at them.
 *
 * The low-poly sphere is here because sphereGeo (14x12, ~300 triangles) is
 * generous for a marshmallow and absurd for a cotton candy puff, and we need
 * seven of those per puff.
 */
const puffGeo = new THREE.SphereGeometry(1, 8, 6);
const shardGeo = new THREE.OctahedronGeometry(1, 0);
const speckGeo = new THREE.OctahedronGeometry(1, 0);

/**
 * Cache for the geometries that genuinely cannot be a scaled primitive: the
 * swirl on a lollipop's face, the gumdrop's silhouette, the merged puff
 * clusters. Each is built once for a given shape and then shared by every
 * prop that wants it, so "one new BufferGeometry" means one in the park, not
 * one per instance.
 */
const geoCache = new Map<string, THREE.BufferGeometry>();
function cachedGeo(key: string, build: () => THREE.BufferGeometry) {
  let g = geoCache.get(key);
  if (!g) {
    g = build();
    geoCache.set(key, g);
  }
  return g;
}

/**
 * A spiral drawn as geometry, because the whole park is texture-free and a
 * swirl is the one thing that says "candy" from fifty metres.
 *
 * It lives in the XY plane with outer radius 1 and its depth along Z, so it
 * drops straight onto a disc that has been laid into the same plane. The arm
 * narrows toward the rim: a constant-width spiral looks like a clock spring,
 * a tapering one looks poured.
 */
function swirlGeometry(arms: number, turns: number, band: number, depth: number, r0 = 0.1) {
  return cachedGeo(`swirl|${arms}|${turns}|${band}|${depth}|${r0}`, () => {
    const parts: THREE.BufferGeometry[] = [];
    // chords per arm, in proportion to how far it actually bends. A lollipop
    // arm wraps twice and needs the steps; a peppermint arm is a 90-degree
    // flick and looked identical at six, for a fifth of the triangles.
    const STEPS = Math.max(5, Math.min(26, Math.round(4 + turns * 10)));
    for (let a = 0; a < arms; a++) {
      const a0 = (a / arms) * Math.PI * 2;
      let px = Math.cos(a0) * r0;
      let py = Math.sin(a0) * r0;
      for (let s = 1; s <= STEPS; s++) {
        const t = s / STEPS;
        const r = r0 + t * (1 - r0);
        const th = a0 + t * turns * Math.PI * 2;
        const x = Math.cos(th) * r;
        const y = Math.sin(th) * r;
        const dx = x - px;
        const dy = y - py;
        const len = Math.hypot(dx, dy);
        // slight overlap so the straight chords butt into each other and the
        // arm reads as one continuous ribbon instead of a dashed line
        const seg = new THREE.BoxGeometry(len * 1.14, band * (1 - t * 0.4), depth);
        seg.rotateZ(Math.atan2(dy, dx));
        seg.translate((x + px) / 2, (y + py) / 2, 0);
        parts.push(seg);
        px = x;
        py = y;
      }
    }
    const merged = mergeGeometries(parts, false)!;
    for (const p of parts) p.dispose();
    return merged;
  });
}

/**
 * Width of a spiral arm that just clears its own next wrap.
 *
 * Getting this wrong is not subtle: the first version used a flat 0.3 for
 * every variant, the ribbon crossed over itself four times on the way out,
 * and a lollipop looked like a ball of wool.
 */
function spiralBand(arms: number, turns: number, r0: number) {
  return ((1 - r0) / (turns * arms)) * 0.66;
}

/**
 * A disc with enough sides to look round. cylGeo is ten-sided, which is right
 * for a fencepost and reads as a stop sign on a 3m lollipop head.
 */
function discGeometry() {
  return cachedGeo("disc22", () => new THREE.CylinderGeometry(1, 1, 1, 22));
}

/**
 * A thin decorative slab: the shared unit cube, scaled, with no bevel.
 *
 * mesh(boxGeo, ...) builds a real beveled box, which is the right thing for
 * anything chunky and costs about 270 triangles. On a 6cm-thick deck plank or
 * a stripe raked across a hedge the bevel is a sub-pixel detail, and a maze
 * of forty hedges was paying 2,400 triangles a wall for it. Twelve will do.
 */
function slat(
  color: string,
  sx: number,
  sy: number,
  sz: number,
  x: number,
  y: number,
  z: number,
  shadow = false,
) {
  const m = new THREE.Mesh(boxGeo, glossy(color));
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------------------
// 1. Lollipop trees
// ---------------------------------------------------------------------------

type PopVariant = {
  /** Radius of the candy disc, metres. */
  r: number;
  /** Ground to the top of the disc, metres. */
  height: number;
  base: string;
  swirl: string;
  arms: number;
  turns: number;
  /** Lean, radians. A whole avenue of upright sticks looks like fenceposts. */
  tilt: number;
};

const POPS: PopVariant[] = [
  { r: 1.15, height: 4.2, base: CANDY.pink, swirl: CANDY.white, arms: 2, turns: 2.1, tilt: 0 },
  { r: 0.95, height: 3.3, base: CANDY.yellow, swirl: CANDY.red, arms: 3, turns: 1.6, tilt: 0.09 },
  { r: 1.5, height: 5.6, base: CANDY.mint, swirl: CANDY.lilac, arms: 2, turns: 2.4, tilt: -0.06 },
  { r: 0.8, height: 2.6, base: CANDY.orange, swirl: CANDY.white, arms: 2, turns: 1.9, tilt: 0.14 },
];

/** One disc thickness for every variant, so the swirl cache keys on shape alone. */
const POP_THICK = 0.34;

/**
 * The park's trees. Four variants so a stand of them is not a wallpaper
 * pattern, sized 2.6m to 5.6m before `scale` — small ones line a path, big
 * ones make shade over the picnic lawn.
 *
 * Four meshes each: stick, disc, swirl, shine. The stick is the only solid
 * part, so she runs under the head — which is the point of a tree, but note
 * that variant 3's disc starts at 1m and she is 1.62m tall, so the small ones
 * belong beside a path rather than across it.
 *
 * userData.boxes: one thin box around the stick.
 */
export function makeLollipopTree(variant = 0, scale = 1) {
  const g = new THREE.Group();
  const v = POPS[Math.abs(Math.round(variant)) % POPS.length]!;
  const cy = v.height - v.r;

  const stickR = Math.max(0.07, v.r * 0.1);
  g.add(mesh(cylGeo, CANDY.white, stickR, cy + v.r * 0.6, stickR, 0, (cy + v.r * 0.6) / 2, 0));

  // the head is a child group so the lean tips disc and swirl together
  const head = new THREE.Group();
  head.position.y = cy;
  head.rotation.z = v.tilt;
  g.add(head);

  const disc = new THREE.Mesh(discGeometry(), glossy(v.base));
  disc.scale.set(v.r, POP_THICK, v.r);
  disc.rotation.x = Math.PI / 2;
  disc.castShadow = true;
  disc.receiveShadow = true;
  head.add(disc);

  // the swirl is a touch deeper than the disc so one mesh serves both faces
  const band = spiralBand(v.arms, v.turns, 0.08);
  const sw = new THREE.Mesh(swirlGeometry(v.arms, v.turns, band, POP_THICK * 1.1, 0.08), glossy(v.swirl));
  sw.scale.set(v.r * 0.94, v.r * 0.94, 1);
  sw.castShadow = false;
  sw.receiveShadow = true;
  head.add(sw);

  // one small off-centre highlight, the same trick makeLollipop uses to make
  // a flat disc look like wet glass
  const shine = new THREE.Mesh(puffGeo, glossy(CANDY.white, 0.1));
  shine.scale.set(v.r * 0.13, v.r * 0.16, 0.04);
  shine.position.set(-v.r * 0.4, v.r * 0.45, POP_THICK * 0.6);
  shine.rotation.z = 0.7;
  shine.castShadow = false;
  head.add(shine);

  g.scale.setScalar(scale);
  g.userData.boxes = [footprint(stickR * 1.5 * scale, cy * scale)] satisfies SceneryBoxes;
  return g;
}

/** Ground-to-top height of a lollipop tree variant, before scale. */
export function lollipopTreeHeight(variant = 0) {
  return POPS[Math.abs(Math.round(variant)) % POPS.length]!.height;
}

// ---------------------------------------------------------------------------
// 2. Gumdrops
// ---------------------------------------------------------------------------

/**
 * The gumdrop silhouette: widest right at the foot, sides that draw in the
 * whole way up, and only the last fifth rounded over. A scaled sphere reads
 * as a ball and a cone reads as a hat; only the profile reads as a gumdrop,
 * so this is a lathe — one geometry, built once, used by every gumdrop in
 * the park at whatever size.
 *
 * The first attempt was a squashed dome (1m tall, 1.5m across) and every one
 * of them looked like a blob of jelly. Tall and narrow is what reads.
 *
 * Unit shape: 1m tall, radius 1 at the foot.
 */
function gumdropGeometry() {
  return cachedGeo("gumdrop", () => {
    const pts = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.9, 0),
      new THREE.Vector2(1.0, 0.07),
      new THREE.Vector2(0.96, 0.24),
      new THREE.Vector2(0.88, 0.46),
      new THREE.Vector2(0.77, 0.66),
      new THREE.Vector2(0.6, 0.82),
      new THREE.Vector2(0.34, 0.95),
      new THREE.Vector2(0, 1),
    ];
    return new THREE.LatheGeometry(pts, 16);
  });
}

/**
 * The sugar coating, as one merged shell of little crystals sitting on the
 * unit gumdrop's surface. Per-speck meshes would be sixteen draw calls on a
 * prop we want hundreds of; merged it is one, and the specks are octahedra
 * (eight triangles) because at this size they are two pixels of sparkle.
 */
function gumdropSugarGeometry() {
  return cachedGeo("gumdrop-sugar", () => {
    const r = rng(9021);
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 34; i++) {
      // up the profile, following the silhouette so a crystal sits on the
      // skin instead of hovering off the shoulder
      const t = 0.06 + r() * 0.86;
      // 0.94 sinks each crystal halfway into the skin, so it reads as
      // sugar stuck to the sweet and not as a spike growing out of it
      const rad = (1 - t * t * 0.66) * 0.94;
      const a = r() * Math.PI * 2;
      const s = 0.05 + r() * 0.038;
      const g = speckGeo.clone();
      g.scale(s, s, s);
      g.translate(Math.cos(a) * rad, t, Math.sin(a) * rad);
      parts.push(g);
    }
    const merged = mergeGeometries(parts, false)!;
    for (const p of parts) p.dispose();
    return merged;
  });
}

/**
 * A gumdrop boulder. `scale` is its height in metres (0.6 for a kerbstone,
 * 3 for something she has to walk around); the footprint is 1.14x that.
 *
 * Two meshes, about 450 triangles.
 *
 * userData.boxes: one box inset from the true width, so she can stand close
 * to the side of it without an invisible corner pushing her away.
 */
export function makeGumdrop(color = CANDY.red, scale = 1) {
  const g = new THREE.Group();

  const dome = new THREE.Mesh(gumdropGeometry(), glossy(color, 0.12));
  dome.scale.set(0.57, 1, 0.57);
  dome.castShadow = true;
  dome.receiveShadow = true;
  g.add(dome);

  const sugar = new THREE.Mesh(gumdropSugarGeometry(), lam(CANDY.white, { flat: true, roughness: 0.95 }));
  sugar.scale.set(0.57, 1, 0.57);
  sugar.castShadow = false;
  sugar.receiveShadow = true;
  g.add(sugar);

  g.scale.setScalar(scale);
  g.userData.boxes = [footprint(0.48 * scale, 0.94 * scale)] satisfies SceneryBoxes;
  return g;
}

// ---------------------------------------------------------------------------
// 3. Candy canes: posts and arches
// ---------------------------------------------------------------------------

const CANE_R = 0.13;
/** Stripe pitch. Short enough to read as candy cane, long enough to stay cheap. */
const STRIPE = 0.26;

/** Stack of alternating cylinder segments from y0 upward. `flip` offsets the colours. */
function stripeStack(g: THREE.Group, x: number, z: number, y0: number, height: number, r: number, flip = 0) {
  const n = Math.max(2, Math.round(height / STRIPE));
  const h = height / n;
  for (let i = 0; i < n; i++) {
    g.add(mesh(cylGeo, (i + flip) % 2 ? CANDY.white : CANDY.red, r, h, r, x, y0 + (i + 0.5) * h, z));
  }
  return n;
}

/**
 * A striped post: path edging, fence posts, sign poles, the legs of anything
 * else in the park. Horizontal bands rather than a true helix because a helix
 * costs a custom geometry per height and, from more than a few metres away,
 * looks identical.
 *
 * Footprint 0.26m; `height` is the top of the cap.
 *
 * userData.boxes: one box the full height.
 */
export function makeCandyCanePost(height = 2.2) {
  const g = new THREE.Group();
  const shaft = Math.max(0.3, height - CANE_R);
  stripeStack(g, 0, 0, 0, shaft, CANE_R);
  g.add(mesh(sphereGeo, CANDY.white, CANE_R, CANE_R, CANE_R, 0, shaft, 0));
  g.userData.boxes = [footprint(CANE_R, height)] satisfies SceneryBoxes;
  return g;
}

/**
 * A candy cane archway to walk through: gateways, the top of a path, the
 * entrance to the maze. `width` is the outside span, `height` the top of the
 * arc. The legs are stripe stacks and the crown is fourteen segments laid
 * round a semicircle, with the colours carrying on from the legs so the
 * stripe never doubles up at the joint.
 *
 * userData.boxes: the two legs only. The crown is overhead by design — she
 * runs under it — so it gets no collider, and a caller that wants a very
 * short arch should keep her out of it some other way.
 */
export function makeCandyCaneArch(width = 4, height = 3.6) {
  const g = new THREE.Group();
  const R = Math.max(0.6, width / 2 - CANE_R);
  const legTop = Math.max(0.6, height - R);

  const nLeft = stripeStack(g, -R, 0, 0, legTop, CANE_R);
  stripeStack(g, R, 0, 0, legTop, CANE_R);

  const SEGS = 14;
  for (let i = 0; i < SEGS; i++) {
    const th = Math.PI - ((i + 0.5) / SEGS) * Math.PI;
    const x = Math.cos(th) * R;
    const y = legTop + Math.sin(th) * R;
    // arc length of one segment, plus a little so neighbours overlap at the
    // outside of the bend instead of leaving a gap
    const segLen = ((Math.PI * R) / SEGS) * 1.12;
    const m = mesh(cylGeo, (i + nLeft) % 2 ? CANDY.red : CANDY.white, CANE_R, segLen, CANE_R, x, y, 0);
    m.rotation.z = th;
    g.add(m);
  }
  g.userData.boxes = [
    box(-R - CANE_R, -R + CANE_R, 0, legTop, -CANE_R, CANE_R),
    box(R - CANE_R, R + CANE_R, 0, legTop, -CANE_R, CANE_R),
  ] satisfies SceneryBoxes;
  return g;
}

// ---------------------------------------------------------------------------
// 4. Candy cane bridge
// ---------------------------------------------------------------------------

/** Walking surface of the bridge deck, metres above the group's origin. */
export const BRIDGE_DECK_Y = 0.9;
/** Deck width across the walk direction. */
export const BRIDGE_DECK_W = 2.4;
/** Depth of the stepped approach at each end. */
const BRIDGE_APPROACH = 1.4;

/**
 * A bridge over the chocolate river. She walks along +z; `span` is the whole
 * length including both approaches.
 *
 * The collision system is axis-aligned boxes, so a curved deck is not on the
 * table: the walking surface is dead flat at BRIDGE_DECK_Y (0.9m) with two
 * 0.3m steps at each end. 0.3 is half the engine's step-up, so she walks on
 * without jumping and without the camera hitching. What makes it read as an
 * arched bridge is the one part nobody has to walk on: the stringers under
 * the deck are deep at the banks and shallow at mid-span, so from the water
 * the soffit is a proper arch even though the deck above it is a plank.
 *
 * userData.boxes: the deck slab, four steps, and a wall down each side under
 * the railing so she cannot walk off into the river.
 */
export function makeCandyCaneBridge(span = 9) {
  const g = new THREE.Group();
  const s = Math.max(5, span);
  const half = s / 2;
  const hx = BRIDGE_DECK_W / 2;
  const deckEnd = half - BRIDGE_APPROACH;
  const boxes: SceneryBoxes = [];

  // deck: a nougat slab, planked across the walk direction in alternating
  // pink and white so she can see herself making progress along it
  g.add(mesh(boxGeo, CANDY.cream, BRIDGE_DECK_W, 0.22, deckEnd * 2, 0, BRIDGE_DECK_Y - 0.11, 0));
  const planks = Math.max(4, Math.round(deckEnd * 2 / 0.8));
  for (let i = 0; i < planks; i++) {
    const z = -deckEnd + ((i + 0.5) / planks) * deckEnd * 2;
    g.add(slat(i % 2 ? CANDY.pinkPale : CANDY.white, BRIDGE_DECK_W - 0.08, 0.05, (deckEnd * 2) / planks - 0.1, 0, BRIDGE_DECK_Y + 0.005, z));
  }
  boxes.push(box(-hx, hx, 0, BRIDGE_DECK_Y, -deckEnd, deckEnd));

  // steps: two each end, 0.3 rise, riser striped so the step is obvious
  for (const dir of [1, -1]) {
    for (let k = 0; k < 2; k++) {
      const top = 0.6 - k * 0.3;
      const z0 = deckEnd + k * 0.7;
      const z1 = z0 + 0.7;
      const cz = ((z0 + z1) / 2) * dir;
      g.add(mesh(boxGeo, CANDY.cream, BRIDGE_DECK_W, top, 0.7, 0, top / 2, cz));
      // a stripe on the nose of each tread, so the step is visible from above
      // as well as from the side — she is running at this at full speed
      g.add(slat(k % 2 ? CANDY.red : CANDY.pink, BRIDGE_DECK_W - 0.06, 0.06, 0.12, 0, top - 0.01, (z1 - 0.07) * dir));
      boxes.push(box(-hx, hx, 0, top, Math.min(z0 * dir, z1 * dir), Math.max(z0 * dir, z1 * dir)));
    }
  }

  // arched stringers under each edge: the bridge's whole "arch" lives here
  const RIBS = 15;
  for (const sx of [-1, 1]) {
    for (let i = 0; i < RIBS; i++) {
      const t = (i + 0.5) / RIBS;
      const z = -deckEnd + t * deckEnd * 2;
      // deepest at the banks, shallowest mid-span, so the underside is the
      // arch the flat deck cannot be. Over a river this is the whole reason
      // the thing reads as a bridge and not a boardwalk, so it is not subtle.
      const drop = 0.12 + Math.pow(Math.abs(Math.cos(t * Math.PI)), 1.5) * 0.82;
      g.add(
        mesh(
          boxGeo,
          i % 2 ? CANDY.red : CANDY.white,
          0.26,
          drop,
          (deckEnd * 2) / RIBS + 0.06,
          sx * (hx - 0.12),
          BRIDGE_DECK_Y - 0.22 - drop / 2,
          z,
        ),
      );
    }
  }

  // railings: striped posts with a rolled top rail
  const RAIL_TOP = BRIDGE_DECK_Y + 0.95;
  const posts = Math.max(3, Math.round((deckEnd * 2) / 1.1));
  for (const sx of [-1, 1]) {
    const px = sx * (hx - 0.1);
    for (let i = 0; i <= posts; i++) {
      const z = -deckEnd + (i / posts) * deckEnd * 2;
      stripeStack(g, px, z, BRIDGE_DECK_Y, 0.9, 0.09, i % 2);
    }
    const rail = mesh(cylGeo, CANDY.red, 0.1, deckEnd * 2 + 0.2, 0.1, px, RAIL_TOP - 0.06, 0);
    rail.rotation.x = Math.PI / 2;
    g.add(rail);
    g.add(slat(CANDY.white, 0.09, 0.1, deckEnd * 2, px, BRIDGE_DECK_Y + 0.42, 0));
    boxes.push(box(px - 0.12, px + 0.12, BRIDGE_DECK_Y, RAIL_TOP, -deckEnd - 0.1, deckEnd + 0.1));
  }

  g.userData.boxes = boxes;
  g.userData.deckY = BRIDGE_DECK_Y;
  return g;
}

// ---------------------------------------------------------------------------
// 5. Licorice hedge
// ---------------------------------------------------------------------------

const LICORICE = "#17121a";
/** Front-to-back thickness of a hedge segment. */
export const HEDGE_DEPTH = 0.62;

/**
 * One wall of the licorice maze. Runs along X, `length` long and `height`
 * tall, centred on the origin.
 *
 * The twist is faked: a glossy near-black slab with red ribbons raked across
 * both faces at a constant angle. All the ribbons lean the same way, which is
 * what makes it read as a rope that has been twisted rather than a fence with
 * diagonal braces. A red rope runs along the top and dark rolled ends cap the
 * segment, so a maze junction never shows a raw slab edge and the top line of
 * the maze stays visible from across the park.
 *
 * About a dozen meshes for a 4m segment, so a forty-wall maze stays cheap.
 *
 * userData.boxes: one box, the slab itself — `length` x `height` x 0.62.
 * The raked stripes overhang the top by about 0.25m, which is what stops the
 * wall's top line looking machine-cut; the collider ignores them.
 */
export function makeLicoriceHedge(length = 4, height = 1.8) {
  const g = new THREE.Group();
  const L = Math.max(0.6, length);
  const H = Math.max(0.5, height);
  const d = HEDGE_DEPTH;

  g.add(mesh(boxGeo, LICORICE, L, H, d, 0, H / 2, 0));

  // rolled top, and rolled ends so a corner join looks moulded
  const top = mesh(cylGeo, CANDY.red, d * 0.42, L, d * 0.42, 0, H, 0);
  top.rotation.z = Math.PI / 2;
  g.add(top);
  for (const sx of [-1, 1]) g.add(mesh(cylGeo, "#2a1f2e", d * 0.42, H, d * 0.42, (sx * L) / 2, H / 2, 0));

  const twists = Math.max(2, Math.round(L / 0.55));
  for (let i = 0; i < twists; i++) {
    const x = -L / 2 + ((i + 0.5) / twists) * L;
    // 0.34rad leans far enough to read as a twist, not so far that the
    // ribbon runs off the end of a short segment
    const rib = slat(CANDY.red, 0.18, H * 1.12, d + 0.05, x, H / 2, 0);
    rib.rotation.z = 0.34;
    g.add(rib);
  }

  g.userData.boxes = [box(-L / 2, L / 2, 0, H, -d / 2, d / 2)] satisfies SceneryBoxes;
  return g;
}

// ---------------------------------------------------------------------------
// 6. Marshmallows
// ---------------------------------------------------------------------------

/**
 * A marshmallow is a short cylinder whose top and bottom edges are rolled
 * right over, and nothing else gets that silhouette: a bevelled box reads as
 * a sugar cube and a plain cylinder reads as a drum. So it is a lathe, one
 * geometry shared by every marshmallow in the park.
 *
 * Unit shape: 1m tall, radius 1.
 */
function marshmallowGeometry() {
  return cachedGeo("marshmallow", () => {
    const pts = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.74, 0),
      new THREE.Vector2(0.94, 0.05),
      new THREE.Vector2(1.0, 0.16),
      new THREE.Vector2(1.0, 0.84),
      new THREE.Vector2(0.94, 0.95),
      new THREE.Vector2(0.74, 1.0),
      new THREE.Vector2(0, 1),
    ];
    return new THREE.LatheGeometry(pts, 16);
  });
}

function marshmallow(r: number, h: number, color: string) {
  // matte, and no procedural texture: a marshmallow is the one sweet in the
  // park that must not shine
  const m = new THREE.Mesh(marshmallowGeometry(), lam(color, { flat: true, roughness: 0.95 }));
  m.scale.set(r, h, r);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * A pile of marshmallows: three rolled cylinders stacked slightly off true,
 * and a square one tipped over at the foot so the pile has both shapes in it.
 * 1.72m tall, 2.1m across at scale 1.
 *
 * Stacked dead straight it looked like packaging, so every piece is nudged
 * and turned — the point is that somebody left them in a heap.
 *
 * userData.boxes: one box around the pile. The first marshmallow tops out at
 * 0.55m, under the engine's step-up, so she can climb it, which is the only
 * reason to build a pile rather than one big one.
 */
export function makeMarshmallow(scale = 1) {
  const g = new THREE.Group();

  const base = marshmallow(0.62, 0.55, CANDY.white);
  base.position.set(-0.1, 0.275, 0.04);
  g.add(base);

  const mid = marshmallow(0.55, 0.5, CANDY.pinkPale);
  mid.position.set(0.06, 0.8, -0.05);
  mid.rotation.z = 0.05;
  g.add(mid);

  const top = marshmallow(0.44, 0.42, CANDY.cream);
  top.position.set(-0.04, 1.28, 0.08);
  top.rotation.set(0.06, 0.5, -0.07);
  g.add(top);

  // the square one, on its side against the pile. beveledBox directly rather
  // than through mesh(), which would hand it the standard textured material.
  const cube = new THREE.Mesh(beveledBox(0.62, 0.62, 0.62), lam(CANDY.white, { flat: true, roughness: 0.95 }));
  cube.position.set(0.92, 0.3, 0.22);
  cube.rotation.set(0, 0.6, 0.12);
  cube.castShadow = true;
  cube.receiveShadow = true;
  g.add(cube);

  g.scale.setScalar(scale);
  g.userData.boxes = [box(-0.78 * scale, 1.28 * scale, 0, 1.72 * scale, -0.68 * scale, 0.68 * scale)] satisfies SceneryBoxes;
  return g;
}

// ---------------------------------------------------------------------------
// 7. Small sweets: candy corn, mints, rock candy, cotton candy
// ---------------------------------------------------------------------------

/**
 * A candy corn bollard, 1.8m at scale 1. Three nested cones rather than three
 * stacked frustums: each cone's tip is swallowed by the one above it, which
 * costs three meshes instead of a custom lathe and gives the same three hard
 * colour bands.
 *
 * userData.boxes: one box. These line paths, so she should bump off them.
 */
export function makeCandyCornSpike(scale = 1) {
  const g = new THREE.Group();
  g.add(mesh(coneGeo, CANDY.yellow, 0.5, 1.25, 0.5, 0, 0.625, 0));
  g.add(mesh(coneGeo, CANDY.orange, 0.37, 1.05, 0.37, 0, 1.055, 0));
  g.add(mesh(coneGeo, CANDY.white, 0.2, 0.58, 0.2, 0, 1.51, 0));
  g.scale.setScalar(scale);
  g.userData.boxes = [footprint(0.44 * scale, 1.5 * scale)] satisfies SceneryBoxes;
  return g;
}

/**
 * A peppermint. Returned lying flat — a 1.8m paving slab 0.14m thick, which
 * is what most of them are here — with the swirl on the top face. Stand one
 * up with `group.rotation.x = -Math.PI / 2` and it becomes a wheel leaning on
 * a wall or a sign blank.
 *
 * No userData.boxes. Flat it is walked over, and the moment the caller tips
 * it upright any box we handed out would be pointing the wrong way, so a
 * standing mint needs a collider from whoever stood it up.
 */
export function makeSwirlMint(scale = 1) {
  const g = new THREE.Group();
  const R = 0.9;
  const T = 0.14;

  const disc = new THREE.Mesh(discGeometry(), glossy(CANDY.white, 0.2));
  disc.scale.set(R, T, R);
  disc.position.y = T / 2;
  disc.castShadow = true;
  disc.receiveShadow = true;
  g.add(disc);

  // six short arms, barely curved: a peppermint pinwheel, not a lollipop spiral
  const sw = new THREE.Mesh(swirlGeometry(6, 0.24, 0.24, T * 1.1, 0.06), glossy(CANDY.red, 0.2));
  sw.rotation.x = -Math.PI / 2;
  sw.scale.set(R * 0.93, R * 0.93, 1);
  sw.position.y = T / 2;
  sw.castShadow = false;
  sw.receiveShadow = true;
  g.add(sw);

  g.scale.setScalar(scale);
  return g;
}

const ROCK_COLOURS = [CANDY.lilac, CANDY.mint, CANDY.pinkPale, CANDY.yellow, "#7ec8ff", CANDY.pink];

/**
 * Rock candy: a cream stick with crystal shards growing off its top half,
 * 1.35m at scale 1. The shards are octahedra, eight triangles apiece, which
 * is exactly what a sugar crystal is shaped like anyway — the cheapest
 * primitive in the file happens to be the right one.
 *
 * Decoration; no boxes.
 */
export function makeRockCandyCluster(scale = 1) {
  const g = new THREE.Group();
  g.add(mesh(cylGeo, CANDY.cream, 0.05, 1.35, 0.05, 0, 0.675, 0, false));

  const r = rng(4417);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + r() * 0.5;
    // crystals only on the top half: the bare stick below is what says
    // "on a stick" rather than "a rock"
    const y = 0.58 + (i / 9) * 0.62;
    const s = 0.075 + r() * 0.06;
    const m = new THREE.Mesh(shardGeo, glossy(ROCK_COLOURS[i % ROCK_COLOURS.length]!, 0.1));
    // elongated along its own Y then tipped outward, so the cluster looks
    // grown rather than glued
    m.scale.set(s, s * 2.2, s);
    m.position.set(Math.cos(a) * 0.09, y, Math.sin(a) * 0.09);
    m.rotation.set(Math.cos(a) * 0.5, a, -Math.sin(a) * 0.5);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }

  g.scale.setScalar(scale);
  return g;
}

/** Merged puff cluster for cotton candy, one geometry per colour half. */
function puffCluster(key: string, blobs: [number, number, number, number][]) {
  return cachedGeo(`puff|${key}`, () => {
    const parts = blobs.map(([x, y, z, s]) => {
      const g = puffGeo.clone();
      g.scale(s, s * 0.86, s * 0.94);
      g.translate(x, y, z);
      return g;
    });
    const merged = mergeGeometries(parts, false)!;
    for (const p of parts) p.dispose();
    return merged;
  });
}

/**
 * Cotton candy on a paper cone, 1.6m at scale 1.
 *
 * Seven puffs, but only three meshes: the cone, and the pink and blue halves
 * of the cloud merged into one geometry each. The low-poly sphere is fine
 * here because a cotton candy silhouette is supposed to be lumpy.
 *
 * Decoration; no boxes. She should be able to run straight through a stand
 * of these.
 */
export function makeCottonCandyPuff(scale = 1) {
  const g = new THREE.Group();

  const cone = mesh(coneGeo, CANDY.cream, 0.17, 0.62, 0.17, 0, 0.31, 0);
  cone.rotation.x = Math.PI;
  g.add(cone);

  const pink = new THREE.Mesh(
    puffCluster("cc-pink", [
      [0, 0, 0, 0.42],
      [0.3, 0.16, 0.08, 0.32],
      [-0.26, 0.1, -0.12, 0.3],
      [0.05, 0.36, -0.06, 0.28],
    ]),
    lam(CANDY.pinkPale, { flat: true, roughness: 0.88 }),
  );
  pink.position.y = 0.92;
  pink.castShadow = true;
  pink.receiveShadow = true;
  g.add(pink);

  const blue = new THREE.Mesh(
    puffCluster("cc-blue", [
      [-0.3, 0.3, 0.14, 0.26],
      [0.28, 0.36, -0.16, 0.24],
      [-0.08, 0.5, -0.02, 0.22],
    ]),
    lam("#a8dcff", { flat: true, roughness: 0.88 }),
  );
  blue.position.y = 0.92;
  blue.castShadow = true;
  blue.receiveShadow = true;
  g.add(blue);

  g.scale.setScalar(scale);
  return g;
}

// ---------------------------------------------------------------------------
// 8. Soda can pickup
// ---------------------------------------------------------------------------

/**
 * The collectable in this park, standing in for the juice box. Same size as
 * makeJuiceBox (0.43m to the pull tab) so the pickup radius, the backpack
 * thumbnail and the bob animation all still feel right, and so a hidden one
 * is no easier or harder to spot than a juice box was. Side by side with a
 * juice box at 0.35 it looked like a shrunken version of the same pickup.
 *
 * `flavour` colours the barrel; the silver top and the white band are fixed,
 * because those are what say "can" at a glance from the other side of a lawn.
 *
 * No boxes: it is a pickup, she walks into it.
 */
export function makeSodaCan(flavour = CANDY.red) {
  const g = new THREE.Group();
  const silver = "#d9dde2";
  g.add(mesh(cylGeo, flavour, 0.135, 0.36, 0.135, 0, 0.19, 0));
  g.add(mesh(cylGeo, CANDY.white, 0.138, 0.1, 0.138, 0, 0.2, 0, false));
  g.add(mesh(cylGeo, silver, 0.142, 0.035, 0.142, 0, 0.388, 0, false));
  g.add(mesh(cylGeo, silver, 0.142, 0.035, 0.142, 0, 0.018, 0, false));
  g.add(mesh(cylGeo, silver, 0.108, 0.024, 0.108, 0, 0.414, 0, false));
  // pull tab, off to one side so the can has a front
  g.add(slat(silver, 0.072, 0.014, 0.036, 0.036, 0.427, 0));
  // two bubbles of fizz: tiny, but they catch the eye when the pickup bobs
  for (const [bx, by, bz, bs] of [
    [0.06, 0.5, 0.035, 0.028],
    [-0.035, 0.56, -0.025, 0.02],
  ] as const) {
    const b = new THREE.Mesh(puffGeo, glossy(CANDY.white, 0.1));
    b.scale.setScalar(bs);
    b.position.set(bx, by, bz);
    b.castShadow = false;
    g.add(b);
  }
  return g;
}

// ---------------------------------------------------------------------------
// 9. Chocolate fountain
// ---------------------------------------------------------------------------

/**
 * The centrepiece of the factory forecourt: three tiers, 3.15m to the top of
 * the finial, 3m across the basin.
 *
 * Built the same way as makeFountain in meshes.ts — a stone basin becomes a
 * cream-and-chocolate one, and the arcing water jets become sheets of
 * chocolate falling off every tier's lip. Those sheets are flat boxes round
 * the rim rather than anything clever: at this scale a curtain of chocolate
 * is a curtain, and boxes are free.
 *
 * userData.boxes: the basin only. Its top is 0.42m, under the step-up, so she
 * can climb onto the rim and stand in the middle of it, which is the first
 * thing any kid is going to try.
 */
export function makeChocolateFountain() {
  const g = new THREE.Group();
  const choc = CANDY.chocolate;
  const milk = CANDY.chocolateLight;
  const shell = CANDY.cream;

  // basin and the pool in it
  g.add(mesh(cylGeo, shell, 1.3, 0.34, 1.3, 0, 0.17, 0));
  g.add(mesh(cylGeo, milk, 1.16, 0.14, 1.16, 0, 0.4, 0, false));
  const RIM = 14;
  for (let i = 0; i < RIM; i++) {
    const a = (i / RIM) * Math.PI * 2;
    const b = mesh(boxGeo, i % 2 ? shell : CANDY.pinkPale, 0.42, 0.42, 0.24, Math.cos(a) * 1.28, 0.21, Math.sin(a) * 1.28);
    b.rotation.y = -a;
    g.add(b);
  }

  // column
  g.add(mesh(cylGeo, shell, 0.5, 0.16, 0.5, 0, 0.5, 0));
  g.add(mesh(cylGeo, shell, 0.2, 2.1, 0.2, 0, 1.55, 0));

  // three tiers, each a cream plate under a pool of chocolate, with the
  // chocolate sheeting over the edge onto the tier below
  const tiers: [number, number][] = [
    [1.02, 0.95],
    [1.78, 0.68],
    [2.44, 0.44],
  ];
  for (let t = 0; t < tiers.length; t++) {
    const [y, r] = tiers[t]!;
    g.add(mesh(cylGeo, shell, r, 0.14, r, 0, y, 0));
    g.add(mesh(cylGeo, choc, r * 0.92, 0.1, r * 0.92, 0, y + 0.1, 0, false));
    const drop = t === 0 ? 0.62 : 0.72;
    const sheets = 12 - t * 2;
    for (let i = 0; i < sheets; i++) {
      const a = (i / sheets) * Math.PI * 2 + t * 0.3;
      // wide enough that neighbours touch: a gappy ring reads as railings
      const s = slat(choc, (r * 2 * Math.PI) / sheets, drop, 0.1, Math.cos(a) * (r - 0.02), y - drop / 2 + 0.06, Math.sin(a) * (r - 0.02));
      s.rotation.y = -a;
      g.add(s);
    }
  }

  // finial: the chocolate welling up out of the top
  g.add(mesh(sphereGeo, choc, 0.26, 0.2, 0.26, 0, 2.62, 0, false));
  g.add(mesh(sphereGeo, milk, 0.17, 0.3, 0.17, 0, 2.85, 0, false));
  g.add(mesh(sphereGeo, CANDY.cream, 0.07, 0.07, 0.07, 0.06, 2.98, 0.04, false));

  // inset from the 1.42m rim: a square box at the full radius would stick
  // half a metre out past the basin at the corners and stop her walking round
  g.userData.boxes = [footprint(1.2, 0.42)] satisfies SceneryBoxes;
  return g;
}

// ---------------------------------------------------------------------------
// 10. Sprinkles
// ---------------------------------------------------------------------------

/**
 * One sprinkle: a stubby rod lying on its side, 10cm long. Four radial
 * segments (twelve triangles) because at that size it is a coloured dash on
 * the ground, and there will be thousands of them.
 *
 * The first pass made them 15cm, which read fine from across the park and
 * looked like dropped chocolate bars when she stood on them.
 *
 * Module level and never disposed, like the primitives in meshes.ts: every
 * scatter in the park shares this one geometry and this one material.
 */
let sprinkleGeo: THREE.BufferGeometry | null = null;
function sprinkleGeometry() {
  if (sprinkleGeo) return sprinkleGeo;
  const g = new THREE.CylinderGeometry(0.024, 0.024, 0.1, 4);
  g.rotateZ(Math.PI / 2);
  const n = g.attributes.position.count;
  // white base colour so vertexColors and instanceColor multiply cleanly,
  // the same arrangement the grass blades use
  g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 0.06);
  sprinkleGeo = g;
  return g;
}

let sprinkleMat: THREE.MeshStandardMaterial | null = null;
function sprinkleMaterial() {
  if (sprinkleMat) return sprinkleMat;
  sprinkleMat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.32,
    metalness: 0,
    vertexColors: true,
  });
  return sprinkleMat;
}

const SPRINKLE_COLOURS = [CANDY.red, CANDY.pink, CANDY.yellow, CANDY.mint, CANDY.lilac, CANDY.orange, CANDY.white].map(
  (h) => new THREE.Color(h),
);

/**
 * Sprinkles scattered on the ground in a disc, as a single InstancedMesh —
 * one draw call for the lot, the same deal the grass field makes. Use it on
 * the paths and the plaza where grass would be wrong: from standing height it
 * reads as hundreds-and-thousands, from across the park as a sugar dusting.
 *
 * Deterministic from `seed`, so a reload puts every sprinkle back where it
 * was and a saved game's screenshots keep matching.
 *
 * They lie almost flat and cast no shadow: a 10cm rod's shadow is a couple of
 * dark pixels that the shadow map has to draw, and there are thousands.
 *
 * Decoration; no boxes. The group carries userData.dispose for the
 * InstancedMesh — the geometry and material are shared and stay.
 */
export function makeSprinkleScatter(count = 300, radius = 6, seed = 1) {
  const g = new THREE.Group();
  const n = Math.max(0, Math.round(count));
  const inst = new THREE.InstancedMesh(sprinkleGeometry(), sprinkleMaterial(), Math.max(1, n));
  inst.castShadow = false;
  inst.receiveShadow = true;
  noOutline(inst);

  const r = rng(seed);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const col = new THREE.Color();
  const palette = SPRINKLE_COLOURS;

  for (let i = 0; i < n; i++) {
    // sqrt keeps the density even instead of piling up in the middle
    const rad = Math.sqrt(r()) * radius;
    const a = r() * Math.PI * 2;
    // a little roll and pitch so they are not a field of identical dashes
    e.set((r() - 0.5) * 0.5, r() * Math.PI * 2, (r() - 0.5) * 0.5);
    q.setFromEuler(e);
    p.set(Math.cos(a) * rad, 0.022, Math.sin(a) * rad);
    m.compose(p, q, one);
    inst.setMatrixAt(i, m);
    inst.setColorAt(i, col.copy(palette[Math.floor(r() * palette.length)] ?? palette[0]!));
  }
  inst.count = n;
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;

  // InstancedMesh culls on the source geometry's bounds, which are 6cm wide;
  // without this the whole scatter pops out of view as soon as the origin
  // leaves the frustum.
  inst.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), radius + 0.2);

  g.add(inst);
  g.userData.dispose = () => inst.dispose();
  return g;
}
