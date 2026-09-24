import * as THREE from "three";
import { beveledBox } from "./beveled";
import { boxGeo, coneGeo, cylGeo, lam, sphereGeo, type FaceRig } from "./meshes";

/**
 * The twenty-five hidden candies of Sugar Rush Park (sixteen to begin with;
 * nine more after Dalton asked for a longer hunt).
 *
 * These stand in for the dumplings of the first park, so `makeCandy` is a
 * drop-in replacement for `makeDumpling`: same root scale, same userData keys,
 * the same face rig that `animateFace` drives, and the same "accent parts keep
 * their own colour" split that `applyFinish` relies on. Nothing in
 * world-build.ts, runtime.ts, the journal or the minimap needs to know which
 * park it is looking at.
 *
 * The whole job of these shapes is to be named from across a lawn. A child
 * sees the sweet first and the face second, so each one leans on the single
 * feature that says what it is — the cane's hook, the bear's ears, the pop's
 * stick, the jawbreaker's stripes — and nothing else competes with it. Small
 * moulded detail is wasted here; it disappears at four metres on a TV.
 *
 * Everything is built from the shared primitives in meshes.ts. The three
 * geometries at the top of this file are the exceptions, and they are created
 * once for the whole module, not once per candy.
 */

export type CandyKind =
  | "chocolate drop"
  | "candy cane"
  | "sour worm"
  | "gummy bear"
  | "jellybean"
  | "lollipop"
  | "marshmallow"
  | "bubblegum"
  | "licorice twist"
  | "peppermint"
  | "toffee"
  | "rock candy"
  | "cotton candy"
  | "caramel"
  | "fudge"
  | "jawbreaker"
  | "gumdrop"
  | "candy corn"
  | "donut"
  | "cupcake"
  | "macaron"
  | "ice pop"
  | "choco coin"
  | "sugar star"
  | "cookie";

/**
 * Names, colours and journal blurbs.
 *
 * Bright and saturated, and spread right around the wheel: the hunt shows
 * these as little coloured chips in the journal and as one dot on the minimap,
 * so two candies that share a hue are two candies a kid cannot tell apart on
 * the page. The three pinks are pulled apart by lightness as well as shape,
 * and the four browns are a near-black, a mid amber, a golden and a cocoa.
 *
 * `accent` is load-bearing, not decoration: applyFinish repaints every part
 * that is not the accent colour, so the accent is what survives a gold or
 * rainbow treatment and keeps the candy recognisable as itself.
 */
export const CANDIES: readonly {
  kind: CandyKind;
  name: string;
  color: string;
  accent: string;
  blurb: string;
}[] = [
  {
    kind: "chocolate drop",
    name: "Choco Drop",
    color: "#5a3418",
    accent: "#f7e2b0",
    blurb: "A little chocolate teardrop with a paper flag poking out the top.",
  },
  {
    kind: "candy cane",
    name: "Cane Twist",
    color: "#fff6f0",
    accent: "#e8384f",
    blurb: "Red stripes all the way up and a hook to hang it by.",
  },
  {
    kind: "sour worm",
    name: "Sour Wiggle",
    color: "#8ce03f",
    accent: "#ffd23f",
    blurb: "Wiggly, sugary and far too sour. It stands up to say hello.",
  },
  {
    kind: "gummy bear",
    name: "Gummy Bear",
    color: "#ff5a36",
    accent: "#ffb3a0",
    blurb: "Round ears, stubby arms and a shiny tummy.",
  },
  {
    kind: "jellybean",
    name: "Jelly Bean",
    color: "#9b5cff",
    accent: "#f0e4ff",
    blurb: "A fat little bean, polished like a pebble.",
  },
  {
    kind: "lollipop",
    name: "Swirl Pop",
    color: "#ff2f8e",
    accent: "#fff6f0",
    blurb: "A swirl on a stick that goes round and round and round.",
  },
  {
    kind: "marshmallow",
    name: "Marshmallow",
    color: "#fff3e6",
    accent: "#ffb3cd",
    blurb: "Soft, squishy and the only candy here that is not shiny.",
  },
  {
    kind: "bubblegum",
    name: "Bubble Gum",
    color: "#ff86c8",
    accent: "#ffd9ef",
    blurb: "Chewed pink gum, blowing one enormous bubble.",
  },
  {
    kind: "licorice twist",
    name: "Licorice Twist",
    // not true black: at #2e2540 the eyes and the smile vanished into it
    color: "#3d3163",
    accent: "#ff3d7f",
    blurb: "Two ropes wound round each other, one dark and one pink.",
  },
  {
    kind: "peppermint",
    name: "Peppermint",
    color: "#f4fff8",
    accent: "#23b26a",
    blurb: "A round mint with green stripes spinning out like a pinwheel.",
  },
  {
    kind: "toffee",
    name: "Toffee Chew",
    color: "#c87a2a",
    accent: "#ffd98a",
    blurb: "Still in its wrapper, twisted shut at both ends.",
  },
  {
    kind: "rock candy",
    name: "Rock Candy",
    color: "#3fd6ea",
    accent: "#ffffff",
    blurb: "Sugar grown into sharp blue crystals all over a stick.",
  },
  {
    kind: "cotton candy",
    name: "Cotton Candy",
    color: "#ffc2e8",
    accent: "#8fd9ff",
    blurb: "A cloud of spun sugar, pink one side and blue the other.",
  },
  {
    kind: "caramel",
    name: "Caramel Chew",
    color: "#e8a03c",
    accent: "#a85e18",
    blurb: "A soft golden cube with sauce drizzled over the top.",
  },
  {
    kind: "fudge",
    name: "Fudge Square",
    color: "#5b3524",
    accent: "#f0d8b8",
    blurb: "A thick cocoa slab with a cream swirl cut into it.",
  },
  {
    kind: "jawbreaker",
    name: "Jawbreaker",
    color: "#5b6bff",
    accent: "#ffe14d",
    blurb: "The biggest one. Striped in layers, and far too big for a mouth.",
  },
  {
    kind: "gumdrop",
    name: "Gum Drop",
    color: "#1fa84f",
    accent: "#eafff0",
    blurb: "A green dome rolled in sugar that sparkles when it turns.",
  },
  {
    kind: "candy corn",
    name: "Candy Corn",
    color: "#ff8a1f",
    accent: "#fff3d6",
    blurb: "Yellow at the bottom, orange in the middle and white at the tip.",
  },
  {
    kind: "donut",
    name: "Sprinkle Donut",
    color: "#5ec8ff",
    accent: "#f0c07a",
    blurb: "A ring of dough with blue icing and sprinkles on top.",
  },
  {
    kind: "cupcake",
    name: "Mini Cupcake",
    color: "#8ff0c8",
    accent: "#ff86b3",
    blurb: "Mint frosting in a pink paper case, with a cherry on top.",
  },
  {
    kind: "macaron",
    name: "Macaron",
    color: "#2ec4b6",
    accent: "#fff4e0",
    blurb: "Two little shells with a cream filling squashed between them.",
  },
  {
    kind: "ice pop",
    name: "Ice Pop",
    color: "#3a6bff",
    accent: "#ffffff",
    blurb: "A frozen blue lolly on a wooden stick, with a bite out of the corner.",
  },
  {
    kind: "choco coin",
    name: "Choco Coin",
    color: "#ffcc33",
    accent: "#6b4226",
    blurb: "Chocolate money in shiny gold foil, peeled back a little.",
  },
  {
    kind: "sugar star",
    name: "Sugar Star",
    color: "#ffe23a",
    accent: "#fffbe0",
    blurb: "A five-pointed star of sugar that twinkles. It lives up high.",
  },
  {
    kind: "cookie",
    name: "Choc Chip Cookie",
    color: "#d9a066",
    accent: "#4a2e1c",
    blurb: "Crunchy round the edges, soft in the middle, chocolate chips everywhere.",
  },
];

/**
 * Module-level extras, on top of the primitives meshes.ts exports. Built once
 * and shared by every candy in the park; never dispose them.
 *
 * - `smileGeo` is the resting mouth. meshes.ts keeps its own copy private, and
 *   the face has to match the dumpling's exactly for animateFace to drive it.
 * - `puffGeo` is for the parts that are small or lumpy — cheeks, glints,
 *   cotton candy fluff. sphereGeo is 14x12; at the size of a blush dot that is
 *   three hundred triangles nobody can see, and a puff wants seven of them.
 * - `shardGeo` is the one shape that is not a scaled primitive: rock candy
 *   needs a facet that catches light like a crystal, and a cone reads as a
 *   party hat instead.
 */
const smileGeo = new THREE.TorusGeometry(1, 0.16, 6, 14, Math.PI);
const puffGeo = new THREE.SphereGeometry(1, 8, 6);
const shardGeo = new THREE.OctahedronGeometry(1, 0);
/** the donut's ring, and the sugar star's star: once, for the whole park */
const ringGeo = new THREE.TorusGeometry(1, 0.46, 10, 24);
const starGeo = (() => {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? 0.42 : 1;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const e = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 });
  e.translate(0, 0, -0.25);
  return e;
})();

/** Sweets are wet-looking. The park's default roughness reads as chalk. */
const GLOSS = 0.16;

/**
 * Where the runtime actually leaves a face.
 *
 * animateFace turns the face toward her, clamped to 1.15 radians. It measures
 * that angle against the group's own rotation.y — which the hunt winds up
 * forever and never wraps — so within the thirty metres where it bothers to
 * look at her, the clamp is always in force: the face swings 1.15 radians
 * round the axis and stays there. (Checked in the running game: the one
 * dumpling near her sits at -1.15, every distant one at 0.)
 *
 * On a round dumpling nobody notices, which is why it has never mattered. On a
 * fudge square it is the difference between a face and two eyes drifting past
 * a corner, so the candies that have a flat front are built turned by the same
 * angle and the face lands square on it.
 */
const FACE_PARK = -1.15;

/**
 * A sub-group for candies with a front: everything inside it is built facing
 * +Z as usual and comes out pointing where the face will be.
 */
function facing(g: THREE.Group) {
  const shell = new THREE.Group();
  shell.rotation.y = FACE_PARK;
  g.add(shell);
  return shell;
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
 * A candy part. Same shape as mesh() in meshes.ts, with two differences: the
 * material is always flat (a procedural brick texture on a gumdrop is the
 * failure mode makeGirl's comment warns about) and glossy by default, and
 * small details can opt out of the shadow pass — sixteen candies with thirty
 * shadow casters each is a lot of depth-map work for a bevel nobody sees.
 */
function part(
  geo: THREE.BufferGeometry,
  color: string,
  sx: number,
  sy: number,
  sz: number,
  x: number,
  y: number,
  z: number,
  shadow = true,
  roughness = GLOSS,
) {
  const box = geo === boxGeo;
  const m = new THREE.Mesh(
    box ? beveledBox(sx, sy, sz) : geo,
    lam(color, { flat: true, roughness }),
  );
  if (!box) m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

/** A highlight or a wrapper that must keep its own colour through a finish. */
function keepColour<T extends THREE.Object3D>(o: T) {
  o.userData.noFinish = true;
  o.castShadow = false;
  return o;
}

type FaceOpts = {
  /** Height of the face's pivot. The eyes sit 0.1 above it, the mouth 0.05 below. */
  y: number;
  /**
   * How far the face stands off the candy's centre line, in candy units.
   *
   * animateFace swings the whole face group up to 1.15 radians to glance at
   * her, so the face orbits the candy's vertical axis at this radius. On a
   * round candy that is just the body radius and the face stays painted on.
   * On a flat one — a pop, a mint, a fudge square — it has to be the radius at
   * the *widest* angle it will reach, or the eyes swing inside the shape and
   * the candy goes blank. Floating a little proud at the front is the safe
   * way to be wrong; sinking is not.
   */
  out: number;
  /** Face size. 1 is the dumpling's; smaller for the narrow sweets. */
  s?: number;
  /** Half the gap between the eyes, in candy units. */
  eyeX?: number;
};

/**
 * The face, identical in build and proportion to makeDumpling's.
 *
 * Every part is marked noFinish: gold eyeballs are not cute, and the rainbow
 * shader would paint over the smile. The layout inside the group is fixed
 * rather than a parameter, because animateFace writes absolute numbers into
 * it — eye scale, the happy mouth's scale, the tongue's height — so the only
 * honest way to make a face smaller is to scale the group it lives in.
 */
function addFace(g: THREE.Group, o: FaceOpts): FaceRig {
  const s = o.s ?? 1;
  const face = new THREE.Group();
  face.position.y = o.y;
  face.scale.setScalar(s);
  // start where it will spend its life, so the first frame and the long shots
  // past thirty metres are not the only two that look wrong
  face.rotation.y = FACE_PARK;
  g.add(face);

  // positions are given in candy units and divided back out, so a caller only
  // ever thinks about where the candy's surface is
  const r = o.out / s;
  const ex = (o.eyeX ?? 0.16 * s) / s;
  const dark = "#3a2b20";
  const flat = (c: string, roughness: number) => lam(c, { roughness, flat: true });

  const eyes: THREE.Mesh[] = [];
  const cheeks: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    const eye = keepColour(new THREE.Mesh(sphereGeo, flat(dark, 0.3)));
    eye.scale.set(0.075, 0.1, 0.05);
    eye.position.set(sx * ex, 0.1, r - 0.06);
    face.add(eye);
    eyes.push(eye);

    const glint = keepColour(new THREE.Mesh(puffGeo, flat("#ffffff", 0.2)));
    glint.scale.set(0.028, 0.032, 0.02);
    glint.position.set(sx * (ex + 0.025), 0.14, r - 0.02);
    face.add(glint);

    const cheek = keepColour(
      new THREE.Mesh(
        puffGeo,
        lam("#f08a8a", { roughness: 0.6, opacity: 0.75, transparent: true, flat: true }),
      ),
    );
    cheek.scale.set(0.085, 0.055, 0.045);
    cheek.position.set(sx * (ex + 0.105), 0, r - 0.06);
    cheek.visible = false;
    face.add(cheek);
    cheeks.push(cheek);
  }

  // an arc, not a dot: a dot does not carry across a TV room
  const mouthCalm = keepColour(new THREE.Mesh(smileGeo, flat(dark, 0.4)));
  mouthCalm.scale.set(0.095, 0.075, 0.12);
  mouthCalm.position.set(0, -0.02, r + 0.005);
  mouthCalm.rotation.z = Math.PI;
  face.add(mouthCalm);

  const mouthHappy = keepColour(new THREE.Mesh(sphereGeo, flat("#7a3a34", 0.45)));
  mouthHappy.scale.set(0.11, 0.09, 0.06);
  mouthHappy.position.set(0, -0.05, r - 0.015);
  mouthHappy.visible = false;
  face.add(mouthHappy);

  const tongue = keepColour(new THREE.Mesh(sphereGeo, flat("#e8697d", 0.5)));
  tongue.scale.set(0.06, 0.035, 0.04);
  tongue.position.set(0, -0.09, r + 0.035);
  tongue.visible = false;
  face.add(tongue);

  const rig: FaceRig = { face, eyes, cheeks, mouthCalm, mouthHappy, tongue };
  g.userData.face = rig;
  return rig;
}

/**
 * A white catchlight, the tell that something is boiled sugar and not clay.
 *
 * These belong on the candy's right, away from FACE_PARK: a highlight on the
 * left sits exactly where the face ends up and a pale blob lands over an eye.
 */
function sheen(w: number, h: number, x: number, y: number, z: number) {
  const m = keepColour(
    new THREE.Mesh(
      puffGeo,
      lam("#ffffff", { roughness: 0.15, opacity: 0.4, transparent: true, flat: true }),
    ),
  );
  m.scale.set(w, h, 0.05);
  m.position.set(x, y, z);
  return m;
}

// ---------------------------------------------------------------------------
// The sixteen.
//
// All of them are built to the dumpling's envelope: about 0.55 across, sitting
// from y -0.34 up to roughly y 0.45, and then the whole group is scaled by
// 1.28 at the end. The runtime bobs them on that origin and the celebration
// resets the scale to a hard-coded 1.28, so the envelope is a contract, not a
// preference.
// ---------------------------------------------------------------------------

function chocolateDrop(color: string, accent: string) {
  const g = new THREE.Group();
  // A round belly with cones stacked on it. Cones all the way down — even
  // stepped ones — came out as a witch's hat, because the thing that says
  // chocolate drop is the bulge at the bottom, not the point at the top.
  const body = part(sphereGeo, color, 0.4, 0.31, 0.4, 0, -0.04, 0);
  g.add(body);
  g.add(part(coneGeo, color, 0.31, 0.34, 0.31, 0, 0.21, 0));
  // the little twisted tip, offset so it does not read as a spike
  g.add(part(coneGeo, color, 0.14, 0.22, 0.14, 0.02, 0.44, 0.01));
  // Paper flag. It has to be this big: at half the size it was a pale pixel
  // against the sky and the drop read as a plain cone.
  const flag = part(boxGeo, accent, 0.11, 0.26, 0.025, 0.08, 0.63, 0);
  flag.rotation.z = -0.3;
  g.add(flag);
  g.add(sheen(0.11, 0.1, 0.22, 0.06, 0.26));
  g.userData.body = body;
  addFace(g, { y: -0.08, out: 0.41, s: 0.86, eyeX: 0.15 });
  return g;
}

function candyCane(color: string, accent: string) {
  const g = new THREE.Group();
  const R = 0.16;
  // The shaft stays on the group's axis even though that hangs the hook out to
  // one side. Centring the mass instead would put the face over thin air:
  // the face group can only pivot about the axis, so the axis has to be inside
  // the candy. The lopsided sweep as it spins looks like a cane swinging.
  const body = part(cylGeo, color, R, 0.56, R, 0, -0.06, 0);
  g.add(body, part(sphereGeo, color, R, R * 0.8, R, 0, -0.33, 0, false));

  // stripes as tilted discs: a straight band reads as a barber pole, a tilted
  // one wraps like a real cane, and three of them is enough at four metres
  for (let i = 0; i < 3; i++) {
    const s = part(cylGeo, accent, R + 0.012, 0.11, R + 0.012, 0, -0.26 + i * 0.19, 0, false);
    s.rotation.z = 0.42;
    g.add(s);
  }

  // Hook: a half turn of overlapping beads, curling away from the side the
  // face sits on. Short cylinders were the first attempt and the bend came out
  // as a striped paper fan — every segment showed a flat end cap through the
  // next one. A bead has no cap to show, and the low-poly sphere is a third
  // the triangles of a shared one this small needs.
  const HOOK = 0.17;
  for (let i = 0; i <= 11; i++) {
    const a = (i / 11) * Math.PI;
    g.add(
      part(
        puffGeo,
        i % 3 === 1 ? accent : color,
        R,
        R,
        R,
        HOOK - Math.cos(a) * HOOK,
        0.2 + Math.sin(a) * HOOK,
        0,
        i < 6,
      ),
    );
  }

  g.userData.body = body;
  addFace(g, { y: -0.04, out: 0.2, s: 0.62, eyeX: 0.1 });
  return g;
}

function sourWorm(color: string, accent: string) {
  const g = new THREE.Group();
  // A worm reared up rather than coiled on the ground: the head has to end up
  // on the group's axis for the face to sit on it, and a standing wiggle keeps
  // the ribs side-on where you can count them.
  let body: THREE.Mesh | null = null;
  const SEGS = 9;
  for (let i = 0; i < SEGS; i++) {
    const t = i / (SEGS - 1);
    const y = -0.32 + t * 0.5;
    const x = Math.sin(t * 5.2) * 0.13 * (1 - t * 0.7);
    const r = 0.1 + Math.sin(t * Math.PI) * 0.07;
    // two segments of one colour then two of the other: alternating every rib
    // turns to mush at distance, pairs stay readable
    const seg = part(cylGeo, i % 4 < 2 ? color : accent, r, 0.12, r, x, y, 0);
    seg.rotation.z = Math.cos(t * 5.2) * 0.5;
    g.add(seg);
    if (i === 4) body = seg;
  }
  // head, a size bigger so the face has somewhere to live
  const head = part(sphereGeo, color, 0.2, 0.19, 0.2, 0, 0.27, 0);
  g.add(head);
  // sugar crust, the thing that makes it sour rather than just a gummy worm
  const sugar = rng(17);
  for (let i = 0; i < 9; i++) {
    const a = sugar() * Math.PI * 2;
    const y = -0.3 + sugar() * 0.6;
    g.add(
      keepColour(part(puffGeo, "#ffffff", 0.035, 0.035, 0.035, Math.cos(a) * 0.16, y, Math.sin(a) * 0.16, false, 0.8)),
    );
  }
  g.userData.body = body ?? head;
  addFace(g, { y: 0.26, out: 0.21, s: 0.66, eyeX: 0.105 });
  return g;
}

function gummyBear(color: string, accent: string) {
  const g = new THREE.Group();
  const f = facing(g);
  // ears and stubby limbs are the whole identification; the body underneath is
  // deliberately plain so they stand out
  const body = part(sphereGeo, color, 0.29, 0.31, 0.26, 0, -0.04, 0);
  const head = part(sphereGeo, color, 0.25, 0.23, 0.23, 0, 0.26, 0.01);
  f.add(body, head);
  for (const sx of [-1, 1]) {
    f.add(part(sphereGeo, color, 0.1, 0.1, 0.06, sx * 0.19, 0.42, 0));
    f.add(part(sphereGeo, color, 0.12, 0.1, 0.11, sx * 0.31, 0.04, 0.03));
    f.add(part(sphereGeo, color, 0.13, 0.1, 0.13, sx * 0.16, -0.31, 0.04));
  }
  // the pale pressed tummy every gummy bear has
  f.add(part(sphereGeo, accent, 0.17, 0.17, 0.12, 0, -0.06, 0.2, false));
  f.add(sheen(0.07, 0.1, 0.17, 0.12, 0.2));
  g.userData.body = body;
  addFace(g, { y: 0.27, out: 0.24, s: 0.78, eyeX: 0.1 });
  return g;
}

function jellybean(color: string, accent: string) {
  const g = new THREE.Group();
  const f = facing(g);
  // Long, low and tilted. The first pass was near enough spherical and read as
  // a plum: the only thing that says jellybean at this size is an outline half
  // as tall as it is wide, lying over on its side.
  const body = part(sphereGeo, color, 0.45, 0.25, 0.28, 0, -0.06, 0);
  body.rotation.z = 0.2;
  const bulge = part(sphereGeo, color, 0.3, 0.22, 0.26, 0.11, 0.03, 0);
  bulge.rotation.z = 0.2;
  f.add(body, bulge);
  // the pale scar where the bean was snapped off its neighbour on the belt
  f.add(part(sphereGeo, accent, 0.08, 0.08, 0.08, -0.36, -0.14, 0.02, false));
  f.add(sheen(0.16, 0.06, 0.13, 0.1, 0.2));
  g.userData.body = body;
  addFace(g, { y: -0.05, out: 0.29, s: 0.82, eyeX: 0.14 });
  return g;
}

function lollipop(color: string, accent: string) {
  const g = new THREE.Group();
  const f = facing(g);
  f.add(part(cylGeo, "#f7f0e4", 0.055, 0.5, 0.055, 0, -0.2, 0));
  // Thicker than a real pop on purpose. A true disc vanishes edge-on as the
  // candy turns, and the face — which swings up to 66 degrees round the axis —
  // would spend half its time hanging off the rim.
  const body = part(cylGeo, color, 0.33, 0.24, 0.33, 0, 0.2, 0);
  body.rotation.x = Math.PI / 2;
  f.add(body);
  // The swirl, as two spiral arms cut into short straight chords. Dots along
  // the same curve were the first attempt and they read as spots on a
  // toadstool; the arm has to be continuous to say "swirl". Each chord is a
  // thin box, which beveledBox builds as a plain twelve-triangle box, and the
  // handful of lengths involved share their geometry.
  for (const side of [1, -1]) {
    for (let arm = 0; arm < 2; arm++) {
      const a0 = arm * Math.PI;
      let px = Math.cos(a0) * 0.05;
      let py = Math.sin(a0) * 0.05;
      for (let i = 1; i <= 10; i++) {
        const t = i / 10;
        const a = a0 + t * Math.PI * 1.9;
        const r = 0.05 + t * 0.26;
        const nx = Math.cos(a) * r * side;
        const ny = Math.sin(a) * r;
        const len = Math.hypot(nx - px, ny - py) + 0.03;
        const seg = part(boxGeo, accent, len, 0.06, 0.03, (px + nx) / 2, 0.2 + (py + ny) / 2, side * 0.13, false);
        seg.rotation.z = Math.atan2(ny - py, nx - px);
        f.add(seg);
        px = nx;
        py = ny;
      }
    }
  }
  g.userData.body = body;
  addFace(g, { y: 0.17, out: 0.17, s: 0.78, eyeX: 0.12 });
  return g;
}

function marshmallow(color: string, accent: string) {
  const g = new THREE.Group();
  // The one matte candy in the set. Next to fifteen wet-looking sweets a
  // chalky finish is as good an identifier as the shape.
  const body = part(cylGeo, color, 0.32, 0.5, 0.32, 0, -0.06, 0, true, 0.95);
  g.add(body);
  g.add(part(sphereGeo, color, 0.32, 0.11, 0.32, 0, 0.19, 0, true, 0.95));
  g.add(part(sphereGeo, color, 0.32, 0.1, 0.32, 0, -0.31, 0, false, 0.95));
  // pink band, so it is not a white cylinder that could be anything
  g.add(part(cylGeo, accent, 0.331, 0.09, 0.331, 0, 0.1, 0, false, 0.9));
  // dusting of sugar on the flat top
  const dust = rng(41);
  for (let i = 0; i < 7; i++) {
    const a = dust() * Math.PI * 2;
    const r = dust() * 0.24;
    g.add(keepColour(part(puffGeo, "#ffffff", 0.04, 0.02, 0.04, Math.cos(a) * r, 0.24, Math.sin(a) * r, false, 0.9)));
  }
  g.userData.body = body;
  addFace(g, { y: -0.06, out: 0.33, s: 0.95, eyeX: 0.15 });
  return g;
}

function bubblegum(color: string, accent: string) {
  const g = new THREE.Group();
  const f = facing(g);
  // the gum itself stays low and squat, so the bubble above it is plainly the
  // bigger of the two; two balls of a size read as a snowman
  const body = part(sphereGeo, color, 0.36, 0.24, 0.32, 0, -0.12, 0);
  f.add(body, part(sphereGeo, color, 0.2, 0.13, 0.18, 0, 0.06, 0.02));
  // The bubble goes up and not out. Out of the mouth is where a bubble belongs
  // and where it covers the whole face, which is the one thing these must not
  // lose. Transparent and marked noFinish, because the finish pass turns an
  // unmarked transparent part into an opaque lump of body colour.
  const bubble = keepColour(
    new THREE.Mesh(sphereGeo, lam(color, { flat: true, roughness: 0.08, opacity: 0.45, transparent: true })),
  );
  bubble.scale.set(0.33, 0.33, 0.33);
  // up and *forward*, over the forehead. Straight above the gum it was a ball
  // balanced on a ball; leaning out over the face it reads as being blown.
  bubble.position.set(0, 0.42, 0.15);
  f.add(bubble, part(cylGeo, accent, 0.1, 0.06, 0.1, 0, 0.12, 0.1, false));
  f.add(sheen(0.1, 0.12, 0.16, 0.47, 0.22));
  g.userData.body = body;
  addFace(g, { y: -0.09, out: 0.33, s: 0.8, eyeX: 0.13 });
  return g;
}

function licoriceTwist(color: string, accent: string) {
  const g = new THREE.Group();
  // Two ropes winding round each other. One rope would be a stick; the second
  // one in the accent colour is what makes the twist visible at distance.
  let body: THREE.Mesh | null = null;
  const SEGS = 11;
  for (let rope = 0; rope < 2; rope++) {
    for (let i = 0; i < SEGS; i++) {
      const t = i / (SEGS - 1);
      const a = t * Math.PI * 2.1 + rope * Math.PI;
      const seg = part(
        cylGeo,
        rope ? accent : color,
        0.125,
        0.12,
        0.125,
        Math.cos(a) * 0.14,
        -0.32 + t * 0.62,
        Math.sin(a) * 0.14,
        i % 2 === 0,
      );
      seg.rotation.z = -Math.cos(a) * 0.45;
      seg.rotation.x = Math.sin(a) * 0.45;
      g.add(seg);
      if (rope === 0 && i === 5) body = seg;
    }
  }
  // the ends pinched together, or the twist looks like two separate snakes
  g.add(part(sphereGeo, color, 0.13, 0.1, 0.13, 0, -0.34, 0, false));
  g.add(part(sphereGeo, accent, 0.12, 0.09, 0.12, 0, 0.34, 0, false));
  g.userData.body = body!;
  addFace(g, { y: 0.02, out: 0.27, s: 0.7, eyeX: 0.11 });
  return g;
}

function peppermint(color: string, accent: string) {
  const g = new THREE.Group();
  const f = facing(g);
  // A fat puck rather than a true disc: thin enough to be a mint, deep enough
  // that it does not disappear edge-on as the hunt spins it.
  const body = part(cylGeo, color, 0.36, 0.27, 0.36, 0, 0.02, 0);
  body.rotation.x = Math.PI / 2;
  f.add(body);
  // pinwheel: three bars through the middle give six spokes, on both faces,
  // with matching bites out of the rim so it reads from the side too
  for (const side of [1, -1]) {
    for (let i = 0; i < 3; i++) {
      const bar = part(boxGeo, accent, 0.075, 0.66, 0.03, 0, 0.02, side * 0.14, false);
      bar.rotation.z = (i / 3) * Math.PI;
      f.add(bar);
    }
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const rim = part(boxGeo, accent, 0.08, 0.06, 0.29, Math.cos(a) * 0.34, 0.02 + Math.sin(a) * 0.34, 0, false);
    rim.rotation.z = a;
    f.add(rim);
  }
  g.userData.body = body;
  addFace(g, { y: 0, out: 0.18, s: 0.8, eyeX: 0.13 });
  return g;
}

function toffee(color: string, accent: string) {
  const g = new THREE.Group();
  // A wrapped sweet, pinched and flared at both ends: the only candy here that
  // is still in its paper, which is what distinguishes it from the caramel and
  // the fudge at a glance. A cylinder was the first try and it read as a
  // parcel, because a cylinder seen side-on is a rectangle; a pillow with bows
  // on it cannot be anything else.
  const f = facing(g);
  const body = part(sphereGeo, color, 0.34, 0.27, 0.27, 0, -0.02, 0);
  f.add(body);
  for (const sx of [-1, 1]) {
    // the gather where the wrapper is pinched shut
    const gather = part(coneGeo, accent, 0.26, 0.2, 0.26, sx * 0.32, -0.02, 0);
    gather.rotation.z = (sx * Math.PI) / 2;
    f.add(gather);
    // and the paper beyond it, flaring back out into a bow. Small cones here
    // read as fins on an egg; it takes a flare nearly as wide as the sweet
    // before a kid sees a wrapper.
    const twist = part(coneGeo, accent, 0.22, 0.24, 0.22, sx * 0.49, 0, 0);
    twist.rotation.z = (-sx * Math.PI) / 2;
    twist.rotation.y = sx * 0.4;
    f.add(twist);
    // the crimped end, which stops the bow looking like a spike
    const crimp = part(cylGeo, accent, 0.19, 0.04, 0.19, sx * 0.6, 0, 0, false);
    crimp.rotation.z = Math.PI / 2;
    f.add(crimp);
  }
  f.add(sheen(0.06, 0.12, 0.14, 0.11, 0.22));
  g.userData.body = body;
  addFace(g, { y: -0.02, out: 0.28, s: 0.8, eyeX: 0.12 });
  return g;
}

function rockCandy(color: string, accent: string) {
  const g = new THREE.Group();
  g.add(part(cylGeo, "#f7f0e4", 0.04, 0.72, 0.04, 0, -0.02, 0));
  // Crystals, not lumps: octahedra grown out of the stick at angles, which is
  // the one thing that separates rock candy from a sphere of sugar.
  const r = rng(7);
  let body: THREE.Mesh | null = null;
  // sixteen smallish ones rather than a dozen big ones: fewer and larger and
  // it reads as one lump of blue rock, not sugar grown on a string
  for (let i = 0; i < 16; i++) {
    const a = r() * Math.PI * 2;
    const y = -0.28 + (i / 16) * 0.56 + r() * 0.04;
    const len = 0.08 + r() * 0.07;
    const rad = 0.16 + r() * 0.06;
    const c = i % 4 === 0 ? accent : color;
    const shard = part(shardGeo, c, len, len * 1.5, len, Math.cos(a) * rad * 0.6, y, Math.sin(a) * rad * 0.6, i % 2 === 0, 0.08);
    shard.rotation.set(r() * 0.9, a, r() * 0.9);
    g.add(shard);
    if (i === 8) body = shard;
  }
  g.userData.body = body!;
  addFace(g, { y: 0.01, out: 0.27, s: 0.72, eyeX: 0.11 });
  return g;
}

function cottonCandy(color: string, accent: string) {
  const g = new THREE.Group();
  // paper cone, so the puff has somewhere to have come from
  g.add(part(coneGeo, "#f7f0e4", 0.12, 0.3, 0.12, 0, -0.22, 0));
  // Matte and lumpy. Spun sugar is the opposite of the glossy sweets, and the
  // uneven outline is what stops it reading as a pom-pom.
  const r = rng(23);
  let body: THREE.Mesh | null = null;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + r() * 0.5;
    const rad = i < 3 ? 0.08 : 0.2 + r() * 0.06;
    const y = 0.02 + (i < 3 ? 0 : Math.cos(a * 1.7) * 0.12) + r() * 0.06;
    const s = 0.17 + r() * 0.08;
    // a few blue clumps through the pink, the way a stall winds two colours on
    const puff = part(puffGeo, i % 3 === 2 ? accent : color, s, s * 0.95, s, Math.cos(a) * rad, y, Math.sin(a) * rad, i % 2 === 0, 0.95);
    g.add(puff);
    if (i === 1) body = puff;
  }
  g.userData.body = body!;
  // out here is the outside of the fluff, not the middle of it: a face set at
  // the usual body radius is simply inside the puff and gone
  addFace(g, { y: -0.02, out: 0.44, s: 0.88, eyeX: 0.14 });
  return g;
}

function caramel(color: string, accent: string) {
  const g = new THREE.Group();
  // A soft cube. beveledBox gives it the rounded edges of something that has
  // sagged a little in the sun, which is what tells it from the hard sweets.
  const f = facing(g);
  const body = part(boxGeo, color, 0.52, 0.4, 0.44, 0, -0.1, 0);
  f.add(body);
  // Sauce poured over the top and running down the corners. The drips do the
  // work: a plain cube with a dark lid was a parcel, a cube with sauce sliding
  // off it is something you would eat.
  f.add(part(boxGeo, accent, 0.5, 0.08, 0.42, 0, 0.12, 0, false));
  f.add(part(boxGeo, accent, 0.11, 0.22, 0.09, 0.23, -0.01, 0.13, false));
  f.add(part(boxGeo, accent, 0.09, 0.15, 0.09, -0.19, 0.03, 0.17, false));
  f.add(part(boxGeo, accent, 0.09, 0.18, 0.09, -0.17, 0, -0.18, false));
  f.add(sheen(0.08, 0.06, 0.19, 0.08, 0.18));
  g.userData.body = body;
  addFace(g, { y: -0.08, out: 0.24, s: 0.84, eyeX: 0.13 });
  return g;
}

function fudge(color: string, accent: string) {
  const g = new THREE.Group();
  // A slab cut off a tray: square sides and a pale cream layer running right
  // through the middle of it, which is the tell. Three cream blobs sitting on
  // top read as a hat instead, so they are now a seam you can see on every
  // side of the square.
  const f = facing(g);
  const body = part(boxGeo, color, 0.54, 0.34, 0.46, 0, -0.17, 0);
  f.add(body);
  f.add(part(boxGeo, accent, 0.55, 0.1, 0.47, 0, 0.04, 0, false));
  f.add(part(boxGeo, color, 0.5, 0.2, 0.43, 0, 0.19, 0));
  // one lick of cream swirled onto the top, flat enough to stay a marble
  for (let i = 0; i < 3; i++) {
    f.add(part(cylGeo, accent, 0.1, 0.03, 0.1, -0.13 + i * 0.13, 0.3, 0.05 - i * 0.06, false));
  }
  g.userData.body = body;
  addFace(g, { y: -0.16, out: 0.25, s: 0.8, eyeX: 0.13 });
  return g;
}

function jawbreaker(color: string, accent: string) {
  const g = new THREE.Group();
  // The biggest of the sixteen, and it should look it — a jawbreaker that is
  // the same size as a jellybean is just a ball.
  const body = part(sphereGeo, color, 0.39, 0.39, 0.39, 0, 0.02, 0);
  g.add(body);
  // layers, the way one looks when it has been sucked down through a colour
  for (let i = 0; i < 3; i++) {
    const y = 0.02 + (i - 1) * 0.21;
    const rad = Math.sqrt(Math.max(0.04, 0.39 * 0.39 - (y - 0.02) * (y - 0.02))) + 0.008;
    g.add(part(cylGeo, i === 1 ? accent : "#ffffff", rad, 0.055, rad, 0, y, 0, false));
  }
  // a stripe over the crown, sunk into the sphere: proud of it, it read as a
  // lid on a jar
  g.add(part(cylGeo, accent, 0.17, 0.04, 0.17, 0, 0.36, 0, false));
  g.add(sheen(0.11, 0.09, 0.18, 0.2, 0.28));
  g.userData.body = body;
  addFace(g, { y: -0.01, out: 0.39, s: 1, eyeX: 0.16 });
  return g;
}

// ------------------------------------------------------------ the nine more

function gumdrop(color: string, accent: string) {
  const g = new THREE.Group();
  const body = part(sphereGeo, color, 0.37, 0.4, 0.37, 0, -0.04, 0);
  g.add(body);
  g.add(part(cylGeo, color, 0.37, 0.2, 0.37, 0, -0.22, 0));
  // the sugar coat: a scatter of crystals, which is what says gumdrop and not jelly
  const r = rng(11);
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2;
    const up = 0.15 + r() * 0.8;
    const rad = 0.37 * Math.cos(up * 0.9) + 0.01;
    g.add(keepColour(part(puffGeo, accent, 0.035, 0.035, 0.035, Math.cos(a) * rad, -0.04 + Math.sin(up) * 0.38, Math.sin(a) * rad, false)));
  }
  g.add(sheen(0.09, 0.07, 0.16, 0.16, 0.26));
  g.userData.body = body;
  addFace(g, { y: -0.08, out: 0.36, s: 0.95, eyeX: 0.15 });
  return g;
}

function candyCorn(color: string, accent: string) {
  const g = new THREE.Group();
  // three bands, and the order is the whole candy: yellow, orange, white tip
  const body = part(coneGeo, color, 0.36, 0.86, 0.36, 0, 0.0, 0);
  g.add(body);
  g.add(keepColour(part(cylGeo, "#ffd23f", 0.35, 0.2, 0.35, 0, -0.33, 0)));
  g.add(part(coneGeo, accent, 0.13, 0.28, 0.13, 0, 0.3, 0, false));
  g.userData.body = body;
  addFace(g, { y: -0.14, out: 0.27, s: 0.8, eyeX: 0.12 });
  return g;
}

function donut(color: string, accent: string) {
  const g = new THREE.Group();
  // lying flat, as a donut does, with the icing on top and the dough showing
  // round the edge
  const dough = part(ringGeo, accent, 0.32, 0.32, 0.32, 0, -0.1, 0);
  dough.rotation.x = Math.PI / 2;
  g.add(keepColour(dough));
  const icing = part(ringGeo, color, 0.31, 0.31, 0.2, 0, -0.03, 0, false);
  icing.rotation.x = Math.PI / 2;
  g.add(icing);
  const r = rng(5);
  const bits = ["#ff5a8a", "#ffe14d", "#ffffff", "#9b5cff"];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + r() * 0.2;
    const s = part(boxGeo, bits[i % bits.length]!, 0.08, 0.025, 0.025, Math.cos(a) * 0.32, 0.06, Math.sin(a) * 0.32, false);
    s.rotation.y = r() * 3;
    g.add(keepColour(s));
  }
  g.userData.body = icing;
  addFace(g, { y: -0.1, out: 0.47, s: 0.75, eyeX: 0.12 });
  return g;
}

function cupcake(color: string, accent: string) {
  const g = new THREE.Group();
  // the paper case, ridged, then a swirl of frosting and a cherry
  g.add(keepColour(part(cylGeo, accent, 0.3, 0.32, 0.3, 0, -0.22, 0)));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.add(keepColour(part(boxGeo, accent, 0.05, 0.3, 0.03, Math.cos(a) * 0.3, -0.22, Math.sin(a) * 0.3, false)));
  }
  const body = part(sphereGeo, color, 0.36, 0.26, 0.36, 0, 0.02, 0);
  g.add(body);
  g.add(part(sphereGeo, color, 0.24, 0.2, 0.24, 0, 0.2, 0));
  g.add(keepColour(part(sphereGeo, "#e8203c", 0.08, 0.08, 0.08, 0, 0.36, 0)));
  g.add(sheen(0.08, 0.06, 0.14, 0.1, 0.26));
  g.userData.body = body;
  addFace(g, { y: -0.2, out: 0.31, s: 0.75, eyeX: 0.12 });
  return g;
}

function macaron(color: string, accent: string) {
  const g = new THREE.Group();
  const body = part(cylGeo, color, 0.36, 0.17, 0.36, 0, 0.12, 0);
  g.add(body);
  g.add(part(sphereGeo, color, 0.36, 0.08, 0.36, 0, 0.2, 0));
  g.add(part(cylGeo, color, 0.36, 0.17, 0.36, 0, -0.14, 0));
  // the filling, a little proud of the shells, is the tell
  g.add(keepColour(part(cylGeo, accent, 0.33, 0.09, 0.33, 0, -0.01, 0, false)));
  g.add(sheen(0.1, 0.04, 0.12, 0.17, 0.3));
  g.userData.body = body;
  addFace(g, { y: -0.14, out: 0.37, s: 0.72, eyeX: 0.12 });
  return g;
}

function icePop(color: string, accent: string) {
  const g = new THREE.Group();
  const f = facing(g);
  const body = part(boxGeo, color, 0.4, 0.62, 0.17, 0, 0.08, 0);
  f.add(body);
  // two white stripes, and a bite out of the top corner
  f.add(part(boxGeo, accent, 0.41, 0.06, 0.18, 0, 0.18, 0, false));
  f.add(part(boxGeo, accent, 0.41, 0.06, 0.18, 0, -0.06, 0, false));
  f.add(keepColour(part(sphereGeo, "#fff8f0", 0.1, 0.1, 0.1, 0.19, 0.38, 0, false)));
  f.add(keepColour(part(boxGeo, "#e8c28a", 0.09, 0.3, 0.05, 0, -0.34, 0)));
  g.userData.body = body;
  addFace(g, { y: 0.02, out: 0.14, s: 0.75, eyeX: 0.11 });
  return g;
}

function chocoCoin(color: string, accent: string) {
  const g = new THREE.Group();
  const f = facing(g);
  const body = part(cylGeo, color, 0.36, 0.14, 0.36, 0, 0.02, 0, true, 0.1);
  body.rotation.x = Math.PI / 2;
  f.add(body);
  // a raised rim on both faces, and the foil peeled back at the top to show
  // the chocolate: that peel is what says it is a sweet and not money
  for (const side of [1, -1]) {
    const rim = part(ringGeo, color, 0.3, 0.3, 0.05, 0, 0.02, side * 0.07, false, 0.1);
    f.add(rim);
  }
  f.add(keepColour(part(sphereGeo, accent, 0.2, 0.1, 0.075, 0, 0.3, 0, false)));
  f.add(sheen(0.12, 0.08, -0.12, 0.14, 0.09));
  g.userData.body = body;
  addFace(g, { y: -0.02, out: 0.12, s: 0.72, eyeX: 0.11 });
  return g;
}

function sugarStar(color: string, accent: string) {
  const g = new THREE.Group();
  const f = facing(g);
  const body = part(starGeo, color, 0.42, 0.42, 0.3, 0, 0.02, 0);
  f.add(body);
  // twinkles round it
  for (const [x, y] of [
    [0.36, 0.34],
    [-0.4, 0.2],
    [0.3, -0.34],
  ] as const) {
    f.add(keepColour(part(shardGeo, accent, 0.05, 0.08, 0.05, x, y, 0.05, false)));
  }
  g.userData.body = body;
  addFace(g, { y: -0.04, out: 0.13, s: 0.7, eyeX: 0.1 });
  return g;
}

function cookie(color: string, accent: string) {
  const g = new THREE.Group();
  const f = facing(g);
  const body = part(cylGeo, color, 0.37, 0.14, 0.37, 0, 0.02, 0, true, 0.6);
  body.rotation.x = Math.PI / 2;
  f.add(body);
  // chips on both faces, set in rather than stuck on
  const r = rng(3);
  for (const side of [1, -1]) {
    for (let i = 0; i < 7; i++) {
      const a = r() * Math.PI * 2;
      const d = 0.08 + r() * 0.22;
      f.add(part(puffGeo, accent, 0.05, 0.05, 0.03, Math.cos(a) * d, 0.02 + Math.sin(a) * d, side * 0.07, false, 0.4));
    }
  }
  g.userData.body = body;
  addFace(g, { y: -0.02, out: 0.12, s: 0.72, eyeX: 0.11 });
  return g;
}

/**
 * One hidden candy.
 *
 * A drop-in replacement for makeDumpling(color, accent): same 1.28 root scale,
 * `userData.body` and `userData.face`, a face rig animateFace can drive, and
 * an accent/body material split applyFinish can repaint.
 */
export function makeCandy(kind: CandyKind, color: string, accent: string): THREE.Group {
  let g: THREE.Group;
  switch (kind) {
    case "chocolate drop":
      g = chocolateDrop(color, accent);
      break;
    case "candy cane":
      g = candyCane(color, accent);
      break;
    case "sour worm":
      g = sourWorm(color, accent);
      break;
    case "gummy bear":
      g = gummyBear(color, accent);
      break;
    case "jellybean":
      g = jellybean(color, accent);
      break;
    case "lollipop":
      g = lollipop(color, accent);
      break;
    case "marshmallow":
      g = marshmallow(color, accent);
      break;
    case "bubblegum":
      g = bubblegum(color, accent);
      break;
    case "licorice twist":
      g = licoriceTwist(color, accent);
      break;
    case "peppermint":
      g = peppermint(color, accent);
      break;
    case "toffee":
      g = toffee(color, accent);
      break;
    case "rock candy":
      g = rockCandy(color, accent);
      break;
    case "cotton candy":
      g = cottonCandy(color, accent);
      break;
    case "caramel":
      g = caramel(color, accent);
      break;
    case "fudge":
      g = fudge(color, accent);
      break;
    case "jawbreaker":
      g = jawbreaker(color, accent);
      break;
    case "gumdrop":
      g = gumdrop(color, accent);
      break;
    case "candy corn":
      g = candyCorn(color, accent);
      break;
    case "donut":
      g = donut(color, accent);
      break;
    case "cupcake":
      g = cupcake(color, accent);
      break;
    case "macaron":
      g = macaron(color, accent);
      break;
    case "ice pop":
      g = icePop(color, accent);
      break;
    case "choco coin":
      g = chocoCoin(color, accent);
      break;
    case "sugar star":
      g = sugarStar(color, accent);
      break;
    case "cookie":
      g = cookie(color, accent);
      break;
  }
  // the celebration hard-codes this number when it puts the candy back, so it
  // has to be the dumpling's
  g.scale.setScalar(1.28);
  return g;
}
