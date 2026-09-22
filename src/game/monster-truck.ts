import * as THREE from "three";
import { beveledBox } from "./beveled";
import { TRUCK, TYRE_STACK, YARD, YARD_SOLIDS } from "./emmett-base";
import { lam } from "./meshes";

/**
 * Emmett's monster truck and its dirt yard.
 *
 * The truck faces +x with its wheels on the ground: 1.6m lugged tyres on their
 * sides (the tractor's way, not upright barrels), a lifted chassis with yellow
 * coil-over springs showing between the wheels, a blue body with orange and
 * yellow flames painted on the side panels, a roll bar with a light bar, big
 * headlights, a ladder up the +z side, and a flat cab roof with a hatch where
 * a small boy can sit. A hand-painted "EMMETT'S TRUCK" board hangs on each
 * side of the bed.
 *
 * Dimensions come from TRUCK in emmett-base.ts, which also builds the
 * colliders, so the roof he sits on is the roof she lands on. No colliders
 * here. Canvas textures are skipped when there is no document (headless
 * tools), falling back to flat colours.
 */

export type TruckRig = { group: THREE.Group; wheels: THREE.Group[]; body: THREE.Group };

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const cylCache = new Map<number, THREE.CylinderGeometry>();
const cylGeo = (segments: number) => {
  let g = cylCache.get(segments);
  if (!g) cylCache.set(segments, (g = new THREE.CylinderGeometry(1, 1, 1, segments)));
  return g;
};
const flat = (c: string, roughness = 0.5) => lam(c, { flat: true, roughness });
const glow = (c: string, emissive: string) => lam(c, { flat: true, roughness: 0.3, emissive });

const BLUE = "#2f7fd8";
const BLUE_DARK = "#235fa6";
const BLACK = "#26282c";
const RUBBER = "#2a2724";
const CHROME = "#c8ced4";
const YELLOW = "#ffc53d";
const ORANGE = "#ff7a1a";

/**
 * Sugar Rush Park's alternative skin: a candy truck. Same rig, same shapes,
 * only the colours and two textures change. Palette from the park spec.
 */
const CANDY_BODY = "#ff6aa8"; // pink
const CANDY_BODY_DARK = "#e8384f"; // red
const CANDY_CHOCOLATE = "#6b4226";
const CANDY_LIQUORICE = "#2a2430";
const CANDY_CREAM = "#f7ead3";
const CANDY_YELLOW = "#ffc83a";
const CANDY_MINT = "#6fe3c4";
const CANDY_LILAC = "#b06aff";
/** The park's wet-candy gloss. */
const glossy = (c: string, roughness = 0.16) => lam(c, { flat: true, roughness });

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  return g ? [c, g] : null;
}

function texture(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

type P = THREE.Object3D;

/** A box: beveled at its true size for the big moulded parts, a scaled unit cube for trim. */
function box(parent: P, color: string | THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, bevel = false, shadow = true) {
  const m = new THREE.Mesh(bevel ? beveledBox(sx, sy, sz) : unitBox, typeof color === "string" ? flat(color) : color);
  if (!bevel) m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** A cylinder of radius r and length h along an axis. */
function cyl(parent: P, color: string | THREE.Material, r: number, h: number, x: number, y: number, z: number, axis: "x" | "y" | "z" = "y", segments = 12, shadow = false) {
  const m = new THREE.Mesh(cylGeo(segments), typeof color === "string" ? flat(color, 0.35) : color);
  m.scale.set(r, h, r);
  if (axis === "x") m.rotation.z = Math.PI / 2;
  if (axis === "z") m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** A tube built from short alternating red/cream segments, for a candy-cane striped rail. */
function caneStripe(parent: P, r: number, len: number, x: number, y: number, z: number, axis: "x" | "y" | "z", segments = 10, shadow = true) {
  const bands = Math.max(4, Math.round(len / 0.14));
  const bandLen = len / bands;
  for (let i = 0; i < bands; i++) {
    const color = i % 2 === 0 ? CANDY_BODY_DARK : CANDY_CREAM;
    const off = -len / 2 + bandLen * (i + 0.5);
    let px = x;
    let py = y;
    let pz = z;
    if (axis === "y") py = y + off;
    else if (axis === "x") px = x + off;
    else pz = z + off;
    cyl(parent, glossy(color), r, bandLen + 0.004, px, py, pz, axis, segments, shadow);
  }
}

/* ---------------------------------------------------------------- paint */

/** Side panel paint: blue with flames licking back from the nose (u = 1 is the front). */
function flamePanel(): THREE.Texture | null {
  const cg = canvas(1024, 128);
  if (!cg) return null;
  const [c, g] = cg;
  const W = c.width;
  const H = c.height;
  g.fillStyle = BLUE;
  g.fillRect(0, 0, W, H);
  // tongues from the front edge, each a teardrop curling up at the tip
  const tongues: [number, number, number][] = [
    // centre y (0..1), length (fraction of the panel), half height (fraction)
    [0.24, 0.5, 0.2],
    [0.5, 0.64, 0.24],
    [0.76, 0.44, 0.2],
    [0.38, 0.34, 0.16],
    [0.64, 0.3, 0.16],
  ];
  const layer = (color: string, grow: number) => {
    g.fillStyle = color;
    for (const [yc, len, hh] of tongues) {
      const L = W * len * grow;
      const y = H * yc;
      const h = H * hh * (0.55 + grow * 0.45);
      const tipX = W - L;
      const tipY = y - h * 0.9;
      g.beginPath();
      g.moveTo(W + 4, y - h);
      g.bezierCurveTo(W - L * 0.35, y - h * 1.15, W - L * 0.75, y - h * 0.2, tipX, tipY);
      g.bezierCurveTo(W - L * 0.62, y + h * 0.35, W - L * 0.3, y + h * 1.05, W + 4, y + h);
      g.closePath();
      g.fill();
    }
  };
  layer("#d8322c", 1);
  layer(ORANGE, 0.86);
  layer("#ffd23a", 0.62);
  // pinstripes top and bottom
  g.fillStyle = "#f4f7fb";
  g.fillRect(0, 6, W, 5);
  g.fillRect(0, H - 11, W, 5);
  return texture(c);
}

/** Candy side panel: a chocolate wafer bar, scored into fingers, with a drizzle of cream icing. */
function waferPanel(): THREE.Texture | null {
  const cg = canvas(1024, 128);
  if (!cg) return null;
  const [c, g] = cg;
  const W = c.width;
  const H = c.height;
  g.fillStyle = "#8a5a34"; // light chocolate base
  g.fillRect(0, 0, W, H);
  // wafer score lines dividing it into fingers
  g.fillStyle = "#6b4226";
  const fingers = 9;
  const seg = W / fingers;
  for (let i = 1; i < fingers; i++) g.fillRect(i * seg - 4, 0, 8, H);
  // top and bottom chocolate edge
  g.fillStyle = "rgba(42, 24, 10, 0.4)";
  g.fillRect(0, 4, W, 8);
  g.fillRect(0, H - 12, W, 8);
  // a cream icing drizzle streaming back, like the flame it replaces
  g.strokeStyle = "#f7ead3";
  g.lineWidth = 6;
  g.beginPath();
  for (let x = 0; x <= W; x += 16) {
    const y = H * 0.52 + Math.sin(x * 0.018) * H * 0.22;
    if (x === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  g.strokeStyle = "#ff6aa8";
  g.lineWidth = 4;
  g.beginPath();
  for (let x = 0; x <= W; x += 16) {
    const y = H * 0.46 + Math.sin(x * 0.018 + 1.1) * H * 0.16;
    if (x === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  return texture(c);
}

/** The hand-painted sign: wobbly letters in every colour of the paint box. Candy: the park's sweet palette on a cream board. */
function signPaint(candy = false, owner = "EMMETT'S"): THREE.Texture | null {
  const cg = canvas(512, 240);
  if (!cg) return null;
  const [c, g] = cg;
  g.fillStyle = candy ? CANDY_CREAM : "#f3e2bd";
  g.fillRect(0, 0, c.width, c.height);
  // wood grain (or, in candy, faint wafer scoring)
  g.fillStyle = candy ? "#e9d9b8" : "#e2cc9e";
  for (let y = 14; y < c.height; y += 26) g.fillRect(0, y, c.width, 4);
  // a painted border, a bit uneven
  g.strokeStyle = candy ? CANDY_BODY_DARK : "#d8322c";
  g.lineWidth = 12;
  g.lineJoin = "round";
  g.beginPath();
  g.moveTo(14, 16);
  g.lineTo(c.width - 12, 12);
  g.lineTo(c.width - 16, c.height - 14);
  g.lineTo(12, c.height - 18);
  g.closePath();
  g.stroke();
  const colours = candy
    ? ["#e8384f", "#ff8a3a", "#b06aff", "#6fe3c4", "#ff6aa8", "#6b4226"]
    : ["#d8322c", "#2f7fd8", "#2f9a4a", ORANGE, "#8a4ac4", "#e8455f"];
  const lines = [owner, "TRUCK"];
  let n = 0;
  lines.forEach((text, row) => {
    const size = row === 0 ? 80 : 96;
    g.font = `900 ${size}px "Comic Sans MS", "Chalkboard SE", "Marker Felt", system-ui, sans-serif`;
    g.textBaseline = "middle";
    g.textAlign = "center";
    const widths = [...text].map((ch) => g.measureText(ch).width + 4);
    const total = widths.reduce((a, b) => a + b, 0);
    let x = (c.width - total) / 2;
    const y = row === 0 ? 76 : 170;
    [...text].forEach((ch, i) => {
      const w = widths[i]!;
      g.save();
      g.translate(x + w / 2, y + Math.sin(n * 2.3) * 5);
      g.rotate(Math.sin(n * 1.7 + 0.5) * 0.12);
      g.lineWidth = 7;
      g.strokeStyle = "#3a2a1c";
      g.strokeText(ch, 0, 0);
      g.fillStyle = colours[n % colours.length]!;
      g.fillText(ch, 0, 0);
      g.restore();
      x += w;
      n++;
    });
  });
  return texture(c);
}

/* ---------------------------------------------------------------- parts */

const tyreGeo = new THREE.CylinderGeometry(1, 1, 1, 24);
let springGeo: THREE.TubeGeometry | null = null;
const SPRING_REST = 0.72;

/** A coil spring of height SPRING_REST, bottom at y 0. */
function coil() {
  if (!springGeo) {
    const turns = 5;
    const r = 0.14;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= turns * 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, (i / (turns * 12)) * SPRING_REST, Math.sin(a) * r));
    }
    springGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 8, 0.034, 5, false);
  }
  return springGeo;
}

/** A big wheel on its side, axle along z; `side` is +1 for the +z wheels. Candy: a liquorice tyre with a candy-yellow rim. */
function wheel(x: number, z: number, side: number, candy = false) {
  const T = TRUCK;
  const w = new THREE.Group();
  w.position.set(x, T.wheelR, z);
  const tyreColor = candy ? CANDY_LIQUORICE : RUBBER;
  const rimColor = candy ? CANDY_YELLOW : YELLOW;
  const hubColor = candy ? CANDY_CREAM : CHROME;
  const centreColor = candy ? CANDY_CHOCOLATE : BLACK;
  const tyreMat = candy ? glossy(tyreColor, 0.2) : flat(tyreColor, 0.95);
  // the lugs make up the last 8cm of the radius, so the tread stands on the ground
  const lugH = 0.12;
  const core = T.tyreReach - 0.08;
  const tyre = new THREE.Mesh(tyreGeo, tyreMat);
  tyre.scale.set(core, T.wheelW, core);
  tyre.rotation.x = Math.PI / 2;
  tyre.castShadow = true;
  tyre.receiveShadow = true;
  w.add(tyre);
  // chunky staggered tread lugs, outer reach T.tyreReach
  const lugs = 14;
  const rubber = tyreMat;
  for (const row of [-1, 1]) {
    for (let i = 0; i < lugs; i++) {
      const a = ((i + (row > 0 ? 0.5 : 0)) / lugs) * Math.PI * 2;
      const lug = new THREE.Mesh(unitBox, rubber);
      lug.scale.set(0.24, lugH, T.wheelW * 0.47);
      const rr = T.tyreReach - lugH / 2;
      lug.position.set(Math.cos(a) * rr, Math.sin(a) * rr, row * T.wheelW * 0.25);
      lug.rotation.z = a + Math.PI / 2;
      lug.castShadow = false;
      w.add(lug);
    }
  }
  // outside: a rim with bolts and a hub cap, reaching T.hubReach from the truck's centre line
  const face = T.wheelW / 2;
  const hubOut = T.hubReach - T.wheelZ;
  cyl(w, candy ? glossy(rimColor) : rimColor, T.wheelR * 0.58, 0.07, 0, 0, side * (face - 0.015), "z", 20);
  cyl(w, candy ? glossy(hubColor) : hubColor, 0.17, hubOut - face + 0.01, 0, 0, side * ((hubOut + face) / 2 - 0.005), "z", 12);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    box(w, candy ? glossy(hubColor) : hubColor, 0.06, 0.06, 0.03, Math.cos(a) * 0.35, Math.sin(a) * 0.35, side * (face + 0.03), false, false);
  }
  // inside: a dark wheel centre
  cyl(w, candy ? glossy(centreColor) : centreColor, T.wheelR * 0.5, 0.06, 0, 0, -side * (face - 0.02), "z", 16);
  return w;
}

/**
 * Emmett's monster truck. `look` picks the skin: "park" (default) is the
 * truck as it has always been; "candy" is Sugar Rush Park's sweets-only
 * repaint — same rig, same wheel/body shapes and hierarchy, only the
 * materials (and two side-panel/sign textures) change, so
 * `animateMonsterTruck` keeps working unmodified.
 */
export function makeMonsterTruck(look: "park" | "candy" = "park", owner = "EMMETT'S"): TruckRig {
  const T = TRUCK;
  const candy = look === "candy";
  // Shadow the palette constants used below: every box()/cyl() call in this
  // function keeps its exact geometry, count and place, only its colour
  // changes when candy is true.
  const BLUE = candy ? CANDY_BODY : "#2f7fd8";
  const BLUE_DARK = candy ? CANDY_BODY_DARK : "#235fa6";
  const BLACK = candy ? CANDY_CHOCOLATE : "#26282c";
  const CHROME = candy ? CANDY_CREAM : "#c8ced4";
  const YELLOW = candy ? CANDY_YELLOW : "#ffc53d";
  const group = new THREE.Group();
  group.name = "monster truck";
  const body = new THREE.Group();
  body.name = "truck body";
  group.add(body);

  /* ---- running gear: stays put while the body bounces */
  const wheels: THREE.Group[] = [];
  for (const x of [-T.wheelX, T.wheelX]) {
    for (const side of [-1, 1]) {
      const w = wheel(x, side * T.wheelZ, side, candy);
      group.add(w);
      wheels.push(w);
    }
    // axle and differential
    cyl(group, candy ? glossy(CANDY_CHOCOLATE) : "#5a6470", 0.09, (T.wheelZ - T.wheelW / 2) * 2 + 0.1, x, T.wheelR, 0, "z", 10, true);
    const diff = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), candy ? glossy(CANDY_CHOCOLATE) : flat("#5a6470", 0.35));
    diff.scale.set(0.24, 0.22, 0.2);
    diff.position.set(x, T.wheelR, 0.12);
    group.add(diff);
  }

  // coil-overs between the wheels, on arms from each axle, so the lift shows from the side
  const springs: THREE.Mesh[] = [];
  const springMat = candy ? glossy(CANDY_YELLOW, 0.2) : flat("#ffd23a", 0.35);
  const frameBottom = T.bodyBottom - 0.22;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * 0.95;
      const z = sz * 0.75;
      // trailing arm from the axle to the spring seat
      box(group, candy ? glossy(CANDY_CHOCOLATE) : "#5a6470", T.wheelX - 0.95 + 0.1, 0.1, 0.1, sx * (T.wheelX + 0.95) / 2, T.wheelR, z, false, true);
      box(group, candy ? glossy(CANDY_CHOCOLATE) : "#5a6470", 0.34, 0.06, 0.34, x, T.wheelR + 0.08, z, false, false);
      const s = new THREE.Mesh(coil(), springMat);
      s.position.set(x, T.wheelR + 0.11, z);
      s.scale.y = (frameBottom - (T.wheelR + 0.11)) / SPRING_REST;
      s.castShadow = true;
      s.userData.rest = s.scale.y;
      s.userData.x = x;
      s.userData.z = z;
      group.add(s);
      springs.push(s);
      // shock body inside the coil
      cyl(group, CHROME, 0.05, frameBottom - T.wheelR - 0.1, x, (frameBottom + T.wheelR + 0.1) / 2, z, "y", 8);
    }
  }
  group.userData.springs = springs;

  /* ---- chassis and body: everything that rides on the springs */
  for (const z of [-0.6, 0.6]) box(body, BLACK, T.halfLength * 2 - 0.5, 0.22, 0.16, 0, frameBottom + 0.11, z, false, true);
  for (const x of [-2.1, 0.95, -0.95, 2.1]) box(body, BLACK, 0.16, 0.2, 1.36, x, frameBottom + 0.11, 0, false, false);
  // spring top mounts under the frame
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(body, BLACK, 0.34, 0.08, 0.34, sx * 0.95, frameBottom - 0.02, sz * 0.75, false, false);

  const lowerLen = 5.25;
  const lowerX = 0.025;
  const lowerH = T.deckTop - T.bodyBottom;
  box(body, BLUE, lowerLen, lowerH, T.bodyHalfW * 2, lowerX, T.bodyBottom + lowerH / 2, 0, true, true);

  // flame panels on both sides; the -z side's paint is mirrored so the flames still stream back
  const panelW = 5.05;
  const panelH = 0.5;
  const panelGeo = new THREE.PlaneGeometry(panelW, panelH);
  const flames = candy ? waferPanel() : flamePanel();
  for (const side of [-1, 1]) {
    let mat: THREE.Material = flat(BLUE);
    if (flames) {
      const map = side > 0 ? flames : flames.clone();
      if (side < 0) {
        map.wrapS = THREE.RepeatWrapping;
        map.repeat.x = -1;
        map.offset.x = 1;
        map.needsUpdate = true;
      }
      mat = new THREE.MeshStandardMaterial({ map, roughness: candy ? 0.25 : 0.4, metalness: 0.05 });
    }
    const p = new THREE.Mesh(panelGeo, mat);
    p.position.set(lowerX, T.bodyBottom + lowerH / 2, side * (T.bodyHalfW + 0.015));
    if (side < 0) p.rotation.y = Math.PI;
    p.receiveShadow = true;
    body.add(p);
  }

  // hood scoop, grille, headlights, bull bar, bumpers
  const front = lowerX + lowerLen / 2;
  box(body, CHROME, 0.8, 0.22, 0.8, 1.75, T.deckTop + 0.08, 0, true, true);
  box(body, BLACK, 0.03, 0.12, 0.6, 2.16, T.deckTop + 0.1, 0, false, false);
  box(body, BLACK, 0.04, 0.42, 1.1, front + 0.02, 2.15, 0, false, false);
  for (let i = 0; i < 4; i++) box(body, CHROME, 0.03, 0.4, 0.06, front + 0.05, 2.15, -0.39 + i * 0.26, false, false);
  // headlights: warm bulbs normally, a boiled sweet (mint/pink) in candy mode
  for (const z of [-0.82, 0.82]) {
    cyl(body, CHROME, 0.21, 0.12, front + 0.05, 2.28, z, "x", 18);
    const lens = candy ? glow(z < 0 ? CANDY_MINT : CANDY_BODY, z < 0 ? CANDY_MINT : CANDY_BODY) : glow("#fff4c8", "#fff0b0");
    cyl(body, lens, 0.16, 0.03, front + 0.12, 2.28, z, "x", 18);
  }
  box(body, BLACK, 0.22, 0.28, 2.5, T.halfLength - 0.11, T.bodyBottom + 0.12, 0, true, true);
  box(body, BLACK, 0.22, 0.28, 2.5, -T.halfLength + 0.11, T.bodyBottom + 0.12, 0, true, true);
  for (const z of [-0.8, 0.8]) box(body, candy ? glossy(CANDY_BODY_DARK) : "#d8322c", 0.1, 0.1, 0.16, T.halfLength - 0.04, T.bodyBottom + 0.12, z, false, false);
  for (const z of [-0.35, 0.35]) cyl(body, CHROME, 0.04, 0.46, T.halfLength - 0.03, 2.29, z, "y", 8);
  cyl(body, CHROME, 0.04, 0.78, T.halfLength - 0.03, 2.52, 0, "z", 8);
  // tail lights
  for (const z of [-0.85, 0.85])
    box(body, candy ? glow(CANDY_BODY_DARK, CANDY_BODY_DARK) : glow("#e83a3a", "#c01818"), 0.04, 0.16, 0.3, lowerX - lowerLen / 2 - 0.01, 2.3, z, false, false);

  // fender flares over each tyre
  for (const x of [-T.wheelX, T.wheelX]) {
    for (const side of [-1, 1]) {
      const z = side * 1.4;
      box(body, BLACK, 1.8, 0.1, 0.62, x, T.bodyBottom + 0.03, z, false, true);
      box(body, BLACK, 0.3, 0.1, 0.62, x - 0.88, T.bodyBottom - 0.12, z, false, false).rotation.z = 1.1;
      box(body, BLACK, 0.3, 0.1, 0.62, x + 0.88, T.bodyBottom - 0.12, z, false, false).rotation.z = -1.1;
    }
  }
  // mud flaps behind the rear tyres
  for (const side of [-1, 1]) box(body, BLACK, 0.04, 0.5, 0.52, -T.halfLength + 0.08, 1.45, side * 1.38, false, false);

  // cab, windows, roof and hatch
  const cabX = (T.cabMinX + T.cabMaxX) / 2;
  const cabLen = T.cabMaxX - T.cabMinX;
  const cabH = T.roofTop - 0.08 - (T.deckTop - 0.05);
  box(body, BLUE, cabLen, cabH, (T.cabHalfW - 0.05) * 2, cabX, T.deckTop - 0.05 + cabH / 2, 0, true, true);
  // candy glass: a lilac boiled-sweet tint instead of smoked window
  const glass = candy ? lam(CANDY_LILAC, { flat: true, roughness: 0.12 }) : lam("#1f3346", { flat: true, roughness: 0.1 });
  const winY = 2.86;
  box(body, glass, 0.03, 0.4, 1.8, T.cabMaxX + 0.005, winY, 0, false, false);
  box(body, glass, 0.03, 0.36, 1.6, T.cabMinX - 0.005, winY, 0, false, false);
  for (const side of [-1, 1]) {
    box(body, glass, 1.5, 0.4, 0.03, cabX, winY, side * (T.cabHalfW - 0.04), false, false);
    // a glint so the glass reads as glass
    box(body, candy ? "#f0e6ff" : "#8fb4d4", 0.5, 0.05, 0.01, cabX + 0.3, winY + 0.1, side * (T.cabHalfW - 0.005), false, false);
    box(body, CHROME, 0.14, 0.04, 0.03, cabX + 0.35, 2.55, side * (T.bodyHalfW + 0.02), false, false);
    // mirrors
    box(body, BLACK, 0.06, 0.2, 0.14, T.cabMaxX - 0.1, 2.85, side * (T.cabHalfW + 0.12), false, false);
  }
  const roof = box(body, YELLOW, cabLen + 0.12, 0.1, T.cabHalfW * 2 + 0.04, cabX, T.roofTop - 0.05, 0, true, true);
  roof.name = "roof";
  const hatchX = 0.38;
  box(body, candy ? glossy(CANDY_YELLOW) : "#e0a92a", 0.62, 0.06, 0.62, hatchX, T.roofTop + 0.01, 0, true, false).name = "roof hatch";
  box(body, CHROME, 0.2, 0.04, 0.05, hatchX, T.roofTop + 0.06, 0, false, false).name = "hatch handle";
  for (const z of [-0.55, 0, 0.55])
    box(body, candy ? glow("#ff8a3a", "#ff8a3a") : glow("#ffb03a", "#ff9a1a"), 0.08, 0.05, 0.14, T.cabMaxX - 0.03, T.roofTop + 0.02, z, false, false);

  // bed: side walls and tailgate on the deck
  const bedMin = lowerX - lowerLen / 2;
  const bedLen = T.cabMinX - bedMin;
  for (const side of [-1, 1]) box(body, BLUE_DARK, bedLen - 0.04, 0.34, 0.08, bedMin + bedLen / 2, T.deckTop + 0.16, side * (T.bodyHalfW - 0.05), false, true);
  box(body, BLUE_DARK, 0.08, 0.34, (T.bodyHalfW - 0.09) * 2, bedMin + 0.06, T.deckTop + 0.16, 0, false, true);

  // roll bar with a light bar, behind the cab; candy: a candy-cane striped rail
  const rollX = T.cabMinX - 0.3;
  const rollTop = 3.55;
  if (candy) {
    for (const z of [-0.95, 0.95]) caneStripe(body, 0.06, rollTop - T.deckTop, rollX, (rollTop + T.deckTop) / 2, z, "y", 10, true);
    caneStripe(body, 0.06, 2.02, rollX, rollTop, 0, "z", 10, true);
  } else {
    for (const z of [-0.95, 0.95]) cyl(body, YELLOW, 0.06, rollTop - T.deckTop, rollX, (rollTop + T.deckTop) / 2, z, "y", 10, true);
    cyl(body, YELLOW, 0.06, 2.02, rollX, rollTop, 0, "z", 10, true);
  }
  const brace = cyl(body, candy ? glossy(CANDY_YELLOW) : YELLOW, 0.045, 1.5, rollX, (rollTop + T.deckTop) / 2, 0, "y", 8);
  brace.rotation.x = 1.02;
  box(body, BLACK, 0.12, 0.12, 1.4, rollX, rollTop + 0.12, 0, false, false);
  for (const z of [-0.5, -0.17, 0.17, 0.5])
    cyl(body, candy ? glow(CANDY_YELLOW, CANDY_YELLOW) : glow("#fff4c8", "#fff0b0"), 0.07, 0.04, rollX + 0.07, rollTop + 0.12, z, "x", 12);

  // exhaust stacks at the back corners of the cab
  for (const side of [-1, 1]) {
    cyl(body, CHROME, 0.065, 1.25, T.cabMinX - 0.12, 2.2 + 0.625, side * 1.22, "y", 10, true);
    cyl(body, BLACK, 0.075, 0.08, T.cabMinX - 0.12, 3.46, side * 1.22, "y", 10);
  }

  // the hand-painted sign on each side of the bed
  const paint = signPaint(candy, owner);
  const signMat = paint ? new THREE.MeshStandardMaterial({ map: paint, roughness: 0.85 }) : flat(candy ? CANDY_CREAM : "#f3e2bd");
  const edge = flat(candy ? CANDY_CHOCOLATE : "#8a5a32");
  for (const side of [-1, 1]) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.54, 0.04), [edge, edge, edge, edge, signMat, edge]);
    sign.name = `${owner} TRUCK sign`;
    sign.position.set(-1.85, T.bodyBottom + lowerH / 2, side * (T.bodyHalfW + 0.04));
    if (side < 0) sign.rotation.y = Math.PI;
    sign.castShadow = false;
    sign.receiveShadow = true;
    body.add(sign);
    // two nails
    for (const x of [-0.5, 0.5]) box(body, "#5a6470", 0.04, 0.04, 0.02, -1.85 + x, 2.34, side * (T.bodyHalfW + 0.065), false, false);
  }

  // ladder up the +z side, beside the cab door, with hoops over the roof edge
  const ladder = new THREE.Group();
  ladder.name = "ladder";
  ladder.position.set(-0.1, 0, T.ladderZ - 0.04);
  body.add(ladder);
  const ladderTop = T.roofTop + 0.2;
  const ladderBottom = 0.08;
  for (const x of [-0.22, 0.22]) {
    box(ladder, CHROME, 0.06, ladderTop - ladderBottom, 0.06, x, (ladderTop + ladderBottom) / 2, 0, false, true);
    // stand-offs to the body and the cab
    box(ladder, CHROME, 0.05, 0.05, 0.14, x, 2.2, -0.08, false, false);
    box(ladder, CHROME, 0.05, 0.05, 0.24, x, 2.6, -0.13, false, false);
  }
  for (let y = 0.35; y < T.roofTop; y += 0.32) box(ladder, CHROME, 0.44, 0.05, 0.05, 0, y, 0, false, false);
  box(ladder, CHROME, 0.5, 0.06, 0.06, 0, ladderTop, 0, false, false);

  return { group, wheels, body };
}

/** Idle: the body bobs on its springs; excited, it hops and rocks. Wheels stay still. Allocation-free. */
export function animateMonsterTruck(rig: TruckRig, t: number, excited: boolean): void {
  const b = rig.body;
  let dy: number;
  let roll: number;
  let pitch: number;
  if (excited) {
    dy = Math.abs(Math.sin(t * 5.2)) * 0.09 - 0.02;
    roll = Math.sin(t * 2.6) * 0.022;
    pitch = Math.cos(t * 5.2) * 0.012;
  } else {
    dy = Math.sin(t * 1.7) * 0.022;
    roll = Math.sin(t * 0.9 + 1) * 0.004;
    pitch = 0;
  }
  b.position.y = dy;
  b.rotation.x = roll;
  b.rotation.z = pitch;
  // springs stretch to meet the frame where the body now is
  const springs = rig.group.userData.springs as THREE.Mesh[] | undefined;
  if (!springs) return;
  const sr = Math.sin(roll);
  const sp = Math.sin(pitch);
  for (let i = 0; i < springs.length; i++) {
    const s = springs[i]!;
    const u = s.userData;
    s.scale.y = u.rest + (dy - u.z * sr + u.x * sp) / SPRING_REST;
  }
}

/* ---------------------------------------------------------------- the yard */

/** Dirt with speckles, and the ruts of Emmett's laps round the truck. */
/**
 * The yard, in the colours of the park it stands in.
 *
 * Everything in Sugar Rush got candified when the park was built except the
 * ground Emmett parks on, which stayed the picnic park's dirt: a patch of
 * brown mud with tyre ruts sitting on spearmint. Same yard, same shapes, same
 * colliders — a crushed-biscuit apron with cocoa crumbs and sprinkles in it,
 * licorice tyres, a wafer ramp and a candy toy box.
 */
export type YardFlavour = "park" | "candy";

type YardLook = {
  /** the apron: base, the two crumb colours, the rut, and the flecks in it */
  ground: string;
  crumbs: [string, string];
  rut: string;
  flecks: string[];
  /** the stacked tyres, and the odd one out on the two-high stack */
  tyre: string;
  tyreTop: string;
  /** the kicker ramp: its deck, its side stringers, and the two lip stripes */
  ramp: string;
  rampEdge: string;
  lip: [string, string];
  /** the toy box: chest, lid band, corner straps, and the ball on top */
  chest: string;
  chestTrim: string;
  strap: string;
  ball: string;
  /** the cones round the outside, and the flag at the end */
  cone: string;
  coneBase: string;
  flagPole: string;
  flag: [string, string];
};

const YARD_LOOKS: Record<YardFlavour, YardLook> = {
  park: {
    ground: "#a57a4c",
    crumbs: ["#8e6640", "#bb9062"],
    rut: "rgba(110, 76, 44, 0.55)",
    flecks: ["#c9c0b0", "#8a857c"],
    tyre: RUBBER,
    tyreTop: ORANGE,
    ramp: "#c89a5a",
    rampEdge: "#8a5a32",
    lip: [YELLOW, BLACK],
    chest: "#d8453a",
    chestTrim: "#ffd23a",
    strap: "#2f7fd8",
    ball: "#2f9a4a",
    cone: ORANGE,
    coneBase: BLACK,
    flagPole: CHROME,
    flag: ["#1c1c20", "#f4f7fb"],
  },
  candy: {
    // crushed biscuit dusted with cocoa, which is what a candy yard is churned
    // out of: warmer and lighter than the park's mud, so it reads on mint
    ground: "#c08f62",
    crumbs: ["#94663c", "#dcb68a"],
    rut: "rgba(74, 46, 24, 0.6)",
    // sprinkles where the picnic yard has pebbles
    flecks: ["#ff6aa8", "#6fe3c4", "#ffc83a", "#b06aff", "#f7ead3"],
    tyre: CANDY_LIQUORICE,
    tyreTop: CANDY_BODY,
    ramp: "#e8cf9e",
    rampEdge: CANDY_CHOCOLATE,
    lip: [CANDY_BODY, CANDY_CREAM],
    chest: CANDY_BODY,
    chestTrim: CANDY_CREAM,
    strap: CANDY_LILAC,
    ball: CANDY_MINT,
    cone: CANDY_BODY,
    coneBase: CANDY_LIQUORICE,
    flagPole: CANDY_CREAM,
    flag: [CANDY_BODY_DARK, CANDY_CREAM],
  },
};

function dirtPaint(look: YardLook): THREE.Texture | null {
  const cg = canvas(512, 400);
  if (!cg) return null;
  const [c, g] = cg;
  const W = c.width;
  const H = c.height;
  g.fillStyle = look.ground;
  g.fillRect(0, 0, W, H);
  let s = 7;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  for (let i = 0; i < 900; i++) {
    g.fillStyle = look.crumbs[rnd() < 0.5 ? 0 : 1];
    const r = 1 + rnd() * 3;
    g.fillRect(rnd() * W, rnd() * H, r, r);
  }
  // ruts: the lap line and two tyre tracks either side of it
  const px = W / YARD.length;
  const pz = H / YARD.width;
  g.strokeStyle = look.rut;
  for (const off of [-0.28, 0.28]) {
    g.lineWidth = 0.16 * px;
    g.beginPath();
    g.ellipse(W / 2, H / 2, (YARD.loop + off) * px, (YARD.loop + off) * pz, 0, 0, Math.PI * 2);
    g.stroke();
  }
  // a few pebbles, or a scatter of sprinkles
  for (let i = 0; i < 40; i++) {
    g.fillStyle = look.flecks[Math.floor(rnd() * look.flecks.length)]!;
    g.beginPath();
    g.ellipse(rnd() * W, rnd() * H, 2 + rnd() * 3, 2 + rnd() * 2, rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  return texture(c);
}

function dirtPatch(look: YardLook) {
  const hx = YARD.length / 2;
  const hz = YARD.width / 2;
  const shape = new THREE.Shape();
  const n = 48;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // a rounded rectangle, nibbled a little at the edge so it does not look stamped
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const p = 5;
    const k = Math.pow(Math.pow(Math.abs(ca), p) + Math.pow(Math.abs(sa), p), -1 / p);
    const wobble = 0.93 + 0.05 * Math.sin(i * 2.7) + 0.02 * Math.sin(i * 5.3);
    const x = ca * k * hx * wobble;
    const y = sa * k * hz * wobble;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  const pos = geo.attributes.position!;
  const uv = geo.attributes.uv!;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + hx) / YARD.length, (pos.getY(i) + hz) / YARD.width);
  const map = dirtPaint(look);
  const mat = map ? new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0 }) : lam(look.ground, { flat: true, roughness: 1 });
  const m = new THREE.Mesh(geo, mat);
  m.name = "dirt patch";
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.03;
  m.receiveShadow = true;
  return m;
}

const tyreRing = new THREE.TorusGeometry(TYRE_STACK.ring, TYRE_STACK.tube, 8, 18);
const coneGeo = new THREE.ConeGeometry(1, 1, 12);
const coneBand = new THREE.CylinderGeometry(0.088, 0.115, 0.1, 12, 1, true);

function cone(parent: P, x: number, z: number, look: YardLook) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  box(g, look.coneBase, 0.4, 0.04, 0.4, 0, 0.02, 0, false, false);
  const c = new THREE.Mesh(coneGeo, flat(look.cone, 0.45));
  c.scale.set(0.17, 0.52, 0.17);
  c.position.y = 0.3;
  c.castShadow = true;
  g.add(c);
  // white reflective band
  const band = new THREE.Mesh(coneBand, flat("#f4f7fb", 0.3));
  band.position.y = 0.3;
  g.add(band);
  parent.add(g);
}

/**
 * The yard round the truck, origin at the yard centre with the truck parked at
 * (0, 0, 0) nose +x. No colliders: the solid pieces (tyre stacks, the kicker
 * ramp, the toy box) are YARD_SOLIDS, whose colliders come from yardProps()
 * in emmett-base.ts; each drawn piece is tagged userData.solidCover and
 * encloses its collider box.
 */
export function makeTruckYard(flavour: YardFlavour = "park"): THREE.Group {
  const look = YARD_LOOKS[flavour];
  const yard = new THREE.Group();
  yard.name = "truck yard";
  yard.add(dirtPatch(look));

  for (const s of YARD_SOLIDS) {
    if (s.kind === "tyres") {
      for (let i = 0; i < s.count; i++) {
        const painted = s.count === 2 && i === s.count - 1;
        const t = new THREE.Mesh(tyreRing, flat(painted ? look.tyreTop : look.tyre, painted ? 0.5 : 0.95));
        t.rotation.x = Math.PI / 2;
        t.position.set(s.x, TYRE_STACK.tube + i * TYRE_STACK.pitch, s.z);
        t.castShadow = true;
        t.receiveShadow = true;
        if (i === s.count - 1) t.userData.solidCover = true;
        yard.add(t);
      }
    } else if (s.kind === "ramp") {
      const shape = new THREE.Shape();
      shape.moveTo(-s.len / 2, 0);
      shape.lineTo(s.len / 2, 0);
      shape.lineTo(s.len / 2, s.h);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: s.w, bevelEnabled: false });
      geo.translate(0, 0, -s.w / 2);
      const wedge = new THREE.Mesh(geo, flat(look.ramp, 0.7));
      wedge.position.set(s.x, 0, s.z);
      wedge.castShadow = true;
      wedge.receiveShadow = true;
      wedge.userData.solidCover = true;
      wedge.name = "kicker ramp";
      yard.add(wedge);
      // side stringers along the slope and a striped lip
      const slope = Math.atan2(s.h, s.len);
      const run = Math.hypot(s.h, s.len);
      for (const side of [-1, 1]) {
        const st = box(yard, look.rampEdge, run, 0.09, 0.04, s.x, s.h / 2 - 0.03, s.z + side * (s.w / 2 + 0.02), false, false);
        st.rotation.z = slope;
      }
      for (let i = 0; i < 5; i++) {
        box(yard, look.lip[i % 2 ? 1 : 0], 0.1, 0.04, s.w / 5, s.x + s.len / 2 - 0.05, s.h + 0.005, s.z - s.w / 2 + (i + 0.5) * (s.w / 5), false, false);
      }
      // a back brace under the lip
      box(yard, look.rampEdge, 0.06, s.h - 0.02, s.w - 0.1, s.x + s.len / 2 + 0.03, (s.h - 0.02) / 2, s.z, false, false);
    } else {
      const toy = new THREE.Group();
      toy.position.set(s.x, 0, s.z);
      yard.add(toy);
      const chest = box(toy, look.chest, s.w, s.h, s.d, 0, s.h / 2, 0, false, true);
      chest.userData.solidCover = true;
      chest.name = "toy box";
      box(toy, look.chestTrim, s.w + 0.06, 0.08, s.d + 0.06, 0, s.h + 0.04, 0, false, true);
      // blue corner straps and rope handles
      for (const x of [-1, 1]) {
        box(toy, look.strap, 0.08, s.h - 0.04, s.d + 0.04, x * (s.w / 2 - 0.12), s.h / 2, 0, false, false);
        box(toy, "#f3e2bd", 0.03, 0.06, 0.3, x * (s.w / 2 + 0.015), s.h * 0.62, 0, false, false);
      }
      // toys on the lid: a ball and a little toy monster truck
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), flat(look.ball, 0.35));
      ball.position.set(-0.35, s.h + 0.23, 0.1);
      ball.castShadow = true;
      toy.add(ball);
      box(toy, BLUE, 0.34, 0.12, 0.2, 0.25, s.h + 0.21, -0.05, false, true);
      box(toy, YELLOW, 0.14, 0.08, 0.16, 0.2, s.h + 0.31, -0.05, false, false);
      for (const wx of [0.13, 0.37]) for (const wz of [-0.17, 0.07]) cyl(toy, RUBBER, 0.07, 0.06, wx, s.h + 0.15, wz, "z", 10);
    }
  }

  // traffic cones outside his laps
  const cones: [number, number][] = [
    [3.2, -6.2],
    [-2.8, -6.3],
    [6.4, 2.6],
    [-6.6, 1.2],
    [-2.6, 6.3],
  ];
  for (const [x, z] of cones) cone(yard, x, z, look);

  // a checkered flag at the far end
  const flag = new THREE.Group();
  flag.name = "checkered flag";
  flag.position.set(-8.3, 0, 0);
  yard.add(flag);
  cyl(flag, look.flagPole, 0.04, 3, 0, 1.5, 0, "y", 8, true);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), flat(YELLOW, 0.3));
  knob.position.y = 3.05;
  flag.add(knob);
  const cell = 0.18;
  const black = flat(look.flag[0], 0.6);
  const white = flat(look.flag[1], 0.6);
  for (let col = 0; col < 5; col++) {
    for (let row = 0; row < 4; row++) {
      const q = new THREE.Mesh(unitBox, (col + row) % 2 ? black : white);
      q.scale.set(0.02, cell, cell);
      // the flag hangs out along +z from the pole, with a little ripple
      q.position.set(Math.sin(col * 1.3) * 0.05, 2.9 - (row + 0.5) * cell, 0.04 + (col + 0.5) * cell);
      flag.add(q);
    }
  }
  return yard;
}
