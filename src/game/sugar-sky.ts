import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { lam } from "./meshes";
import { noOutline } from "./scenery";
import type { Prop } from "./types";

/**
 * Sugar Rush Park's sky and its air.
 *
 * The dome is already raspberry-to-sugar (sugar-level.ts) but an empty gradient
 * over half the frame reads as a backdrop, not a place. This module fills it:
 * cotton-candy clouds at three heights, a rainbow behind the north-west corner,
 * and the light the park is lit with.
 *
 * Two doors because the prop vocabulary only knows one cloud, and it is white:
 *  - `skyProps()` gives the engine the white ones as ordinary `cloud` props, so
 *    they drift and are excluded from the merge exactly like park 1's.
 *  - `makeCandySkyExtras()` builds the pink, blue and lilac ones itself, merged
 *    into one mesh per colour, plus the rainbow.
 * Both read from the same scatter, so the two layers never sit on top of each
 * other even though they are built by different calls.
 */

/* ------------------------------------------------------------------ light */

/**
 * Candyland's light. Park 1's numbers are the comparison, and each of these is
 * a deliberate step away from them:
 *
 *  - the hemisphere's sky half goes from ice blue to blossom and its ground
 *    half from grass green to warm sugar, so upward faces pick up the pink sky
 *    and everything else is bounced off sweets rather than off a lawn
 *  - the sun loses a little intensity and gains warmth: at 2.0 the icing roofs
 *    and the cream aprons sat right on the bloom threshold, and this park has a
 *    lot more pale surface than park 1 does
 *  - the fill turns from cool blue to pink for the same reason the hemisphere
 *    did; a blue fill in a pink world greys the shadow side
 *  - ambient and exposure make up the brightness the sun gave away, but only
 *    just: ambient is what flattens shadows, so it is the last thing raised
 *
 * The ratio of sun to everything else is what keeps a shadow readable. It is
 * 2.0 : 1.71 in park 1 and 1.85 : 1.85 here — softer, still a shadow.
 */
export const SKY_LIGHTING = {
  hemiSky: "#ffdcef",
  hemiGround: "#e0c08c",
  hemiIntensity: 1.12,
  sunColor: "#ffeccb",
  sunIntensity: 1.85,
  fillColor: "#ffc6dd",
  fillIntensity: 0.34,
  ambientColor: "#fff2e6",
  ambientIntensity: 0.39,
  exposure: 1.06,
};

/* ----------------------------------------------------------------- clouds */

/** Deterministic: she has to get the same sky every time she loads the park. */
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
 * world-build.ts hangs a sun disc and its halo here in every park. A cloud
 * through the middle of it looks like a mistake, so the scatter keeps clear.
 */
const SUN = { x: 70, y: 62, z: -48, keep: 30 };

/** Clouds spill well past the ±160 bounds, so the horizon has some too. */
const SPREAD = 235;

/**
 * Three decks. The low one is the one that does the work: at 30-38m it sits
 * behind the factory and the mountain instead of above everything, which is
 * what gives the park a middle distance. Nothing she can climb reaches 20m and
 * the fattest low cloud hangs its belly at 25m, so none of it is in her way.
 *
 * `clearOfPark` holds the low deck out over the fields and the fence line. A
 * fat cloud hanging straight over the plaza is a ceiling on her arrival, and
 * from the fly camera it looks like the park is being rained on.
 */
const DECKS = [
  { count: 16, minY: 30, maxY: 38, minS: 3.0, maxS: 4.2, spacing: 46, clearOfPark: 90 },
  { count: 17, minY: 44, maxY: 58, minS: 4.0, maxS: 6.0, spacing: 46, clearOfPark: 0 },
  { count: 13, minY: 62, maxY: 80, minS: 5.0, maxS: 7.5, spacing: 50, clearOfPark: 0 },
];

/**
 * 0 is white and goes through the engine; 1-3 are built here. Barely tinted on
 * purpose: at full candy saturation a lilac cloud read as a grape gumdrop stuck
 * to the sky. These are white with a sweet in them.
 */
const TINTS = ["#f7fbff", "#ffd7e8", "#d2e9ff", "#e3d8fb"];

type Puff = { x: number; y: number; z: number; s: number; tint: number; shape: number };

/**
 * The whole scatter, both layers. Generated in one pass and split by tint by
 * the two exported builders: they are called separately, so the only way they
 * can agree about where the gaps are is to be dealt from the same deck.
 */
function scatter(): Puff[] {
  const rnd = rng(20260921);
  const out: Puff[] = [];
  for (const d of DECKS) {
    let made = 0;
    let guard = 0;
    while (made < d.count && guard++ < d.count * 80) {
      const x = (rnd() * 2 - 1) * SPREAD;
      const z = (rnd() * 2 - 1) * SPREAD;
      const y = d.minY + rnd() * (d.maxY - d.minY);
      const s = d.minS + rnd() * (d.maxS - d.minS);
      const tint = rnd() < 0.44 ? 0 : 1 + Math.floor(rnd() * 3);
      const shape = Math.floor(rnd() * 3) % 3;
      if (Math.hypot(x - SUN.x, y - SUN.y, z - SUN.z) < SUN.keep + s * 3) continue;
      if (Math.hypot(x, z) < d.clearOfPark) continue;
      // only clouds at roughly the same height crowd each other; two decks
      // apart they read as one in front of the other, which is the point
      let clear = true;
      for (const p of out) {
        if (Math.abs(p.y - y) < 15 && Math.hypot(p.x - x, p.z - z) < d.spacing) {
          clear = false;
          break;
        }
      }
      if (!clear) continue;
      out.push({ x, y, z, s, tint, shape });
      made++;
    }
  }
  return out;
}

/** The white ones, as ordinary cloud props: drift and no shadow come free. */
export function skyProps(): Prop[] {
  return scatter()
    .filter((p) => p.tint === 0)
    .map((p) => ({ kind: "cloud", pos: [p.x, p.y, p.z], scale: p.s }) as Prop);
}

/**
 * Puff clusters, as [x, y, z, radius] in unit space. Three of them so a sky
 * full of these does not read as one shape stamped out forty times. All are
 * wider than they are tall and lumpier than a weather cloud: spun sugar on a
 * stick, not cumulus.
 */
const SHAPES: [number, number, number, number][][] = [
  [
    [0, 0, 0, 1.5],
    [1.4, 0.12, 0.2, 1.15],
    [-1.3, 0.08, -0.18, 1.05],
    [0.25, 0.55, -0.35, 0.95],
    [-0.5, 0.35, 0.45, 0.8],
    [0.9, 0.28, -0.7, 0.7],
  ],
  [
    [0, 0, 0, 1.3],
    [1.65, -0.05, 0.1, 1.0],
    [-1.6, 0.05, 0.15, 0.95],
    [0.8, 0.45, -0.3, 0.9],
    [-0.75, 0.4, -0.25, 0.85],
    [2.7, -0.15, -0.1, 0.62],
  ],
  [
    [-0.7, 0, 0, 1.35],
    [0.85, 0.05, 0.15, 1.2],
    [0.1, 0.7, -0.1, 1.0],
    [-1.7, 0.2, -0.3, 0.8],
    [1.75, 0.3, -0.35, 0.72],
    [-0.2, -0.25, 0.75, 0.65],
  ],
];

/**
 * Low-poly on purpose. A cloud is supposed to be lumpy, so the facets are the
 * look rather than a corner cut, and forty of these at a smooth tessellation
 * would be a hundred thousand triangles hanging in the air doing nothing.
 */
const puffGeo = new THREE.SphereGeometry(1, 10, 7);

function cloudGeometry(shape: number, s: number) {
  const parts = SHAPES[shape]!.map(([x, y, z, r]) => {
    const g = puffGeo.clone();
    g.scale(r * s, r * s * 0.72, r * s * 0.9);
    g.translate(x * s, y * s, z * s);
    return g;
  });
  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return merged;
}

/* ---------------------------------------------------------------- rainbow */

/**
 * Six candy stripes, outside in. Softened from the real thing: a saturated
 * spectrum over a pink sky came out as a decal, and the park's own rule is that
 * the big areas are pastel and the saturated colours are accents.
 */
const STRIPES = ["#ff92a6", "#ffb875", "#ffe488", "#8fe7c3", "#9bcfff", "#cfaaf7"];

const RAINBOW = {
  /**
   * Due north and past the fence. She spawns at (0, 34) facing the plaza, which
   * is facing north, so this is the first thing she sees. It was over the
   * north-west corner first, which put the plaza-to-Ice-Cream-Mountain sightline
   * exactly along the band's plane: from the one place she looks at it from
   * most, an edge-on rainbow is no rainbow at all.
   */
  cx: -34,
  cy: -8,
  cz: -164,
  inner: 118,
  outer: 154,
  /** a bit more than half a circle, so the feet are already below the horizon */
  span: (202 * Math.PI) / 180,
  segs: 56,
  rows: 24,
  peak: 0.5,
};

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * The band, as one strip of quads with the colour and the alpha in the
 * vertices.
 *
 * Six separate rings was the obvious build and the wrong one: hard edges made
 * it a hoop, and six coplanar transparent meshes flickered against each other
 * whichever way they sorted. One geometry with a colour ramp across it has soft
 * stripe joins, fades out at both edges of the band and at both feet, and
 * cannot sort against itself.
 */
function rainbowGeometry() {
  const { inner, outer, span, segs, rows } = RAINBOW;
  const cols = segs + 1;
  const pos = new Float32Array(cols * (rows + 1) * 3);
  const col = new Float32Array(cols * (rows + 1) * 4);
  const idx: number[] = [];
  const c = new THREE.Color();
  const ramp = STRIPES.map((s) => new THREE.Color(s));
  const start = -(span - Math.PI) / 2;

  for (let r = 0; r <= rows; r++) {
    // u runs 0 at the outer edge to 1 at the inner one, red outside
    const u = r / rows;
    const radius = outer + (inner - outer) * u;
    const f = u * (ramp.length - 1);
    const i = Math.min(ramp.length - 2, Math.floor(f));
    c.copy(ramp[i]!).lerp(ramp[i + 1]!, smooth(0, 1, f - i));
    const edge = smooth(0, 0.16, u) * (1 - smooth(0.84, 1, u));
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const a = start + t * span;
      const k = (r * cols + s) * 3;
      pos[k] = Math.cos(a) * radius;
      pos[k + 1] = Math.sin(a) * radius;
      pos[k + 2] = 0;
      const foot = smooth(0, 0.18, t) * (1 - smooth(0.82, 1, t));
      const m = (r * cols + s) * 4;
      col[m] = c.r;
      col[m + 1] = c.g;
      col[m + 2] = c.b;
      col[m + 3] = edge * foot * RAINBOW.peak;
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let s = 0; s < segs; s++) {
      const a = r * cols + s;
      idx.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 4));
  g.setIndex(idx);
  return g;
}

function makeRainbow() {
  const m = new THREE.Mesh(
    rainbowGeometry(),
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      // 150m out, well past the fog's far plane: fogged, it would be the fog
      // colour and nothing else. It is a backdrop, so it opts out.
      fog: false,
    }),
  );
  m.position.set(RAINBOW.cx, RAINBOW.cy, RAINBOW.cz);
  // face the middle of the park, so the band is broadside from the plaza and
  // from the whole eastern half rather than edge-on
  m.rotation.y = Math.atan2(0 - RAINBOW.cx, 20 - RAINBOW.cz);
  // after the dome, before the park: depth still lets the land cover the feet
  m.renderOrder = -9;
  m.castShadow = false;
  m.receiveShadow = false;
  m.frustumCulled = false;
  noOutline(m);
  return m;
}

/* ------------------------------------------------------------------ build */

/**
 * The coloured clouds and the rainbow.
 *
 * One mesh per tint, not one per cloud: this runs on a laptop driving a TV
 * beside seventeen hundred other props, and the sky is the one part of the park
 * she never walks into, so it can afford exactly nothing. Four draw calls.
 */
export function makeCandySkyExtras(): THREE.Group {
  const group = new THREE.Group();
  group.name = "candySky";

  const byTint = new Map<number, THREE.BufferGeometry[]>();
  for (const p of scatter()) {
    if (p.tint === 0) continue;
    const g = cloudGeometry(p.shape, p.s);
    g.translate(p.x, p.y, p.z);
    const list = byTint.get(p.tint);
    if (list) list.push(g);
    else byTint.set(p.tint, [g]);
  }

  for (const [tint, parts] of byTint) {
    const merged = mergeGeometries(parts, false)!;
    for (const p of parts) p.dispose();
    // opaque: a cloud has no business being see-through, and transparency here
    // would only buy depth-sorting bugs between the tints
    const m = new THREE.Mesh(merged, lam(TINTS[tint]!, { flat: true, roughness: 0.95 }));
    // clouds never cast: park 1's do not either, and a puff shadow crawling
    // across the plaza is a mystery to a seven-year-old, not weather
    m.castShadow = false;
    m.receiveShadow = false;
    // one mesh spanning the whole sky has a bounding sphere the size of the
    // sky; culling it is a test that can only ever say yes
    m.frustumCulled = false;
    noOutline(m);
    group.add(m);
  }

  group.add(makeRainbow());
  return group;
}
