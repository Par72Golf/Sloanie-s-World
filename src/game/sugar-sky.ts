import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { lam } from "./meshes";
import { registerModel } from "./models";
import { noOutline } from "./scenery";
import type { Prop } from "./types";

/**
 * Sugar Rush Park's sky and its air.
 *
 * The dome is already raspberry-to-sugar (sugar-level.ts) but an empty gradient
 * over half the frame reads as a backdrop, not a place. This module fills it:
 * cotton-candy clouds at three heights, a rainbow standing behind the north of
 * the park, and the light the park is lit with.
 *
 * Everything comes out of one door, `skyProps()`, because a level is a list of
 * props and anything that needs a second call to be wired up is a thing someone
 * forgets to wire up. The engine's own `cloud` prop only knows one cloud and it
 * is white, so the tinted ones and the rainbow are registered as `model`s here
 * (models.ts is built for exactly this) and placed as ordinary props. Neither
 * registers a collider box: nothing in the sky is solid.
 */

/* ------------------------------------------------------------------ light */

/**
 * Candyland's light. Park 1's numbers are the comparison, and each of these is
 * a deliberate step away from them:
 *
 *  - the hemisphere's sky half goes from ice blue to blossom and its ground
 *    half from grass green to warm sugar, so upward faces pick up the pink sky
 *    and everything else is bounced off sweets rather than off a lawn
 *  - the sun loses a little intensity and gains warmth: at 2.0 the icing roofs,
 *    the sugar paths and the smooth mint ground sat right on the bloom
 *    threshold, and this park has far more big pale surface than park 1 does
 *  - the fill turns from cool blue to pink for the same reason the hemisphere
 *    did; a blue fill in a pink world greys the shadow side, and grey is the
 *    one thing a candy park cannot have
 *  - ambient and exposure give back a little of the brightness the sun gave
 *    away, but only a little: ambient is what flattens a shadow, so it is the
 *    last thing raised and the first thing questioned
 *  - the environment light is the only number that goes *down*, 0.42 to 0.30.
 *    It is a white reflection on every surface at once and it answers to
 *    nothing, which is what was turning the marshmallow fields into a sheet:
 *    park 1's numbers put a bloom halo round every marshmallow out there.
 *
 * The ratio of sun to everything else is what keeps a shadow readable: 2.0 to
 * 1.71 in park 1, 1.82 to 1.82 here. Softer, still a shadow — a warmer set
 * with the sun down at 1.72 was prettier in a still and lost the shadow the
 * candy-cane arches cast across the sugar path, which is the thing that tells
 * her the arch is in front of the path and not painted on it.
 */
export const SKY_LIGHTING = {
  hemiSky: "#ffd8ec",
  hemiGround: "#eec99a",
  hemiIntensity: 1.12,
  sunColor: "#ffeccb",
  sunIntensity: 1.82,
  fillColor: "#ffc9de",
  fillIntensity: 0.33,
  ambientColor: "#fff2e6",
  ambientIntensity: 0.37,
  exposure: 1.05,
  envIntensity: 0.3,
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
 * world-build.ts hangs a real sun in every park: a 4.2m disc with a 7.2m halo
 * at (70, 62, -48). It is an object in the world, not a mark on the dome, so a
 * cloud can be inside it. The scatter keeps a ball clear around it.
 */
const SUN = { x: 70, y: 62, z: -48, keep: 30 };

/**
 * The lowest a cloud's belly may hang. The gumdrop wheel's top car is at 17m
 * and Ice Cream Mountain's deck at 12; 20 is clear of both with room for the
 * wheel to turn, and low enough that a cloud still sits near the horizon from
 * across the park.
 */
const MIN_BELLY = 20;
/** how far below its centre the fattest puff of a unit cloud reaches */
const BELLY = 1.08;

/**
 * How far out clouds go. The fog ends at 185m and everything past it is flat
 * fog colour, so a cloud at 230m is a cloud nobody will ever see: it is drawn
 * as a pink smudge on a pink sky. The park is 320m across and she walks all of
 * it, so the scatter covers the park and a little beyond and lets the fog do
 * the fading, exactly as park 1 does.
 */
const SPREAD = 178;

/**
 * Three decks.
 *
 * The low one is the one that does the work, and it is low: 23 to 31m. From
 * eye level a cloud only sits near the horizon if it is low and far, and the
 * band just above the horizon is where a sky is read from. At 27m and 140m out
 * a puff sits at eleven degrees — under the top of the factory or Ice Cream
 * Mountain when either is between her and it, which is what gives the park a
 * middle distance instead of a gradient behind a cutout.
 *
 * The high deck pulls its scatter in to three quarters of the spread. Spread
 * evenly it was almost all near the fence, where at 60m up it is still only
 * twenty degrees above the horizon and reads as more middle distance; over the
 * park it is the part of the sky she sees when the camera tilts up.
 *
 * Counts are high for the same reason park 1 runs forty-eight: a handful of
 * big clouds reads as a handful of big clouds, and what makes a toy sky is a
 * scatter. They are fatter than park 1's because this is spun sugar, but they
 * are still small enough that a dozen are in frame at once.
 *
 * MIN_BELLY is what actually keeps the low deck out of her way, so these
 * numbers can be tuned for how the sky looks without anyone having to redo
 * the arithmetic. The plaza keeps a clear circle as well: a fat cloud parked
 * over the arrival is a ceiling on it, and from the fly camera it looks like
 * the park is being rained on.
 */
const DECKS = [
  { count: 22, minY: 23, maxY: 31, minS: 1.7, maxS: 2.8, spacing: 30, clearOfPark: 42, spread: 1, tints: [0, 2, 2, 3, 0, 2, 3, 1] },
  { count: 20, minY: 33, maxY: 46, minS: 2.3, maxS: 3.6, spacing: 34, clearOfPark: 0, spread: 0.92, tints: [0, 1, 2, 3, 1, 2, 0, 3] },
  { count: 17, minY: 52, maxY: 70, minS: 3.2, maxS: 4.8, spacing: 40, clearOfPark: 0, spread: 0.72, tints: [0, 1, 1, 3, 0, 1, 3, 1] },
];

/**
 * 0 is the engine's own white cloud; 1-3 are built here. Pastel, but not so
 * faint that they vanish: a barely-pink cloud on a pink sky is an empty sky,
 * which is what the first pass of this was.
 *
 * Which tint goes where is the deck's business, because what a cloud is seen
 * against changes down the dome. Low, against blossom and warm sugar, the blue
 * and the lilac are what read; high, against the raspberry top, the pink and
 * the white are. Putting pink low and blue high gave a sky of clouds you had
 * to look for.
 */
const TINTS = ["#fbfdff", "#ffbfda", "#c6e4ff", "#dcccfb"];

type Puff = { x: number; y: number; z: number; s: number; tint: number; shape: number };

/** The whole scatter, both the white ones and the tinted ones, in one pass. */
function scatter(): Puff[] {
  const rnd = rng(20260921);
  const out: Puff[] = [];
  for (const d of DECKS) {
    let made = 0;
    let guard = 0;
    while (made < d.count && guard++ < d.count * 80) {
      const x = (rnd() * 2 - 1) * SPREAD * d.spread;
      const z = (rnd() * 2 - 1) * SPREAD * d.spread;
      const y = d.minY + rnd() * (d.maxY - d.minY);
      const s = d.minS + rnd() * (d.maxS - d.minS);
      const tint = d.tints[Math.floor(rnd() * d.tints.length)]!;
      const shape = Math.floor(rnd() * 3) % 3;
      if (y - BELLY * s < MIN_BELLY) continue;
      if (Math.hypot(x - SUN.x, y - SUN.y, z - SUN.z) < SUN.keep + s * 3) continue;
      if (Math.hypot(x, z) < d.clearOfPark) continue;
      // only clouds at roughly the same height crowd each other; two decks
      // apart they read as one in front of the other, which is the point
      let clear = true;
      for (const p of out) {
        if (Math.abs(p.y - y) < 14 && Math.hypot(p.x - x, p.z - z) < d.spacing) {
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

/**
 * Puff clusters, as [x, y, z, radius] in unit space. Three of them, so a sky
 * full of these does not read as one shape stamped out forty times. All are
 * wider than they are tall and lumpier than a weather cloud: spun sugar on a
 * stick, not cumulus. Shape 0 is the engine's own cloud, so the white ones and
 * the tinted ones are the same family of thing.
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
 * The same sphere the engine's cloud is built from, at the same tessellation
 * and smooth-shaded. A faceted cloud beside a smooth one reads as a different
 * kind of object, and a quarter of this sky is the engine's own white clouds.
 */
const puffGeo = new THREE.SphereGeometry(1, 14, 12);

/** Unit-size, one per shape: the prop's scale is what makes a cloud big. */
const shapeGeo = new Map<number, THREE.BufferGeometry>();
function cloudGeometry(shape: number) {
  const hit = shapeGeo.get(shape);
  if (hit) return hit;
  const parts = (SHAPES[shape] ?? SHAPES[0]!).map(([x, y, z, r]) => {
    const g = puffGeo.clone();
    g.scale(r, r * 0.72, r * 0.9);
    g.translate(x, y, z);
    return g;
  });
  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  shapeGeo.set(shape, merged);
  return merged;
}

/** variant packs which of the three shapes and which of the three tints. */
const variantOf = (shape: number, tint: number) => shape * 4 + tint;

registerModel("candy-cloud", [], (variant) => {
  const shape = Math.floor(variant / 4) % SHAPES.length;
  const tint = variant % 4;
  const g = new THREE.Group();
  const m = new THREE.Mesh(
    cloudGeometry(shape),
    // the engine cloud's material with a sweet in it: the faint transparency
    // is what keeps a cloud from having a hard silhouette against the dome
    lam(TINTS[tint] ?? TINTS[0]!, { roughness: 0.92, opacity: 0.94, transparent: true }),
  );
  // clouds never cast: park 1's do not either, and a puff shadow crawling
  // across the plaza is a mystery to a seven-year-old, not weather
  m.castShadow = false;
  m.receiveShadow = false;
  noOutline(m);
  g.add(m);
  // the drift the engine's clouds have, and the flag the static merge reads to
  // leave them where they are
  g.userData.cloudDrift = true;
  return g;
});

/* ---------------------------------------------------------------- rainbow */

/**
 * Six candy stripes, outside in. Softened from the real thing: a saturated
 * spectrum over a pink sky came out as a decal, and the park's own rule is that
 * the big areas are pastel and the saturated colours are accents.
 */
const STRIPES = ["#ff92a6", "#ffb875", "#ffe488", "#8fe7c3", "#9bcfff", "#cfaaf7"];

/**
 * Standing behind the north of the park.
 *
 * She spawns at (0, 34) facing north up the plaza, so this is the first thing
 * she sees. It was over the north-west corner first, which put the
 * plaza-to-Ice-Cream-Mountain sightline along the band's own plane: from one of
 * the two places she looks at it from most, an edge-on rainbow is no rainbow.
 *
 * Far, and only as big as fits. A rainbow whose feet are inside the park is a
 * hoop someone put up, so the feet are past the fence and below the horizon —
 * but the first version had a 168m radius at 190m out, which put the whole
 * band outside a forward view: standing in the plaza there was nothing to see
 * but a colour wash along the very top of the frame. At a 106m radius and 192m
 * out the apex sits 22 degrees up and the feet 28 degrees to either side, so
 * the whole arc is in the picture from the plaza, from the village, from the
 * meadow and from the fairground.
 */
const RAINBOW = {
  cx: -20,
  cy: -30,
  cz: -172,
  inner: 82,
  outer: 106,
  /** a bit more than half a circle, so the feet are already below the horizon */
  span: (208 * Math.PI) / 180,
  segs: 60,
  rows: 26,
  /** peak alpha: any more and it stops being light and starts being paint */
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
    const edge = smooth(0, 0.18, u) * (1 - smooth(0.82, 1, u));
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const a = start + t * span;
      const k = (r * cols + s) * 3;
      pos[k] = Math.cos(a) * radius;
      pos[k + 1] = Math.sin(a) * radius;
      pos[k + 2] = 0;
      const foot = smooth(0, 0.2, t) * (1 - smooth(0.8, 1, t));
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

registerModel("candy-rainbow", [], () => {
  const g = new THREE.Group();
  const m = new THREE.Mesh(
    rainbowGeometry(),
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      // it stands past the fog's far plane, where everything is flat fog
      // colour. It is a backdrop, not a thing in the park, so it opts out.
      fog: false,
    }),
  );
  // after the dome, before the park: depth still lets the land cover the feet
  m.renderOrder = -9;
  m.castShadow = false;
  m.receiveShadow = false;
  // one mesh the size of the sky: culling it is a test that can only say yes
  m.frustumCulled = false;
  noOutline(m);
  g.add(m);
  return g;
});

/* ------------------------------------------------------------------ build */

/**
 * Everything that hangs in Sugar Rush's sky.
 *
 * The white clouds are the engine's own `cloud` prop, so they are the same
 * object park 1 hangs in its sky; the pink, blue and lilac ones are the
 * `candy-cloud` model registered above. Both drift, neither casts a shadow,
 * neither has a collider, and the lowest belly in the sky measures 20.7m —
 * over the gumdrop wheel's top car at 17.2m and well over the 12m deck of Ice
 * Cream Mountain, which is the highest she can get by climbing.
 *
 * Fifty-nine clouds and the rainbow: sixty draw calls, against park 1's
 * forty-eight clouds. They stay out of the static merge the way park 1's do,
 * because the merge would take the drift with it.
 */
export function skyProps(): Prop[] {
  const out: Prop[] = scatter().map((p) =>
    p.tint === 0
      ? ({ kind: "cloud", pos: [p.x, p.y, p.z], scale: p.s } as Prop)
      : ({
          kind: "model",
          id: "candy-cloud",
          x: p.x,
          y: p.y,
          z: p.z,
          scale: p.s,
          variant: variantOf(p.shape, p.tint),
        } as Prop),
  );
  out.push({
    kind: "model",
    id: "candy-rainbow",
    x: RAINBOW.cx,
    y: RAINBOW.cy,
    z: RAINBOW.cz,
    // broadside to the middle of the park, so the band is a band from the
    // plaza and from the whole eastern half rather than an edge-on line
    ry: Math.atan2(0 - RAINBOW.cx, 20 - RAINBOW.cz),
  });
  return out;
}
