import * as THREE from "three";
import { boxGeo, lam, mesh } from "./meshes";
import type { Prop } from "./types";

/**
 * Park signage: fingerpost directories at the junctions and a painted name
 * board at the entrance to every area.
 *
 * Signs have been put up backwards on this project before, so there is one
 * rule here and everything else follows from it: a sign's `face` is the
 * direction a reader stands in, not the way the sign points. A board at the
 * north gate that she reads while walking north (so she is south of it) has
 * face "S". The arrows on a directory are then worked out from the face and
 * the world direction of each exit, never typed by hand.
 *
 * The boards are canvas textures on a box; the posts are thin solid props
 * (levels.ts places them) so they cast a shadow and stop her walking through,
 * without being wide enough to feel like an invisible wall.
 */

export type Dir = "N" | "S" | "E" | "W";

/** North is -z, east is +x. */
export const DIR_VEC: Record<Dir, [number, number]> = {
  N: [0, -1],
  S: [0, 1],
  E: [1, 0],
  W: [-1, 0],
};

export type Arrow = "up" | "left" | "right" | "down";

export type Directory = {
  x: number;
  z: number;
  /** which sides people read it from */
  faces: Dir[];
  /** where each arm of the junction goes */
  exits: { dir: Dir; label: string }[];
  /** post height to the bottom of the boards */
  h?: number;
};

export type NameSign = {
  x: number;
  z: number;
  /** the side she reads it from */
  face: Dir;
  name: string;
  /** a second line in smaller letters */
  sub?: string;
};

/** Arrow to draw for an exit, seen by a reader standing on `face`. */
export function arrowFor(face: Dir, exit: Dir): Arrow | null {
  const f = DIR_VEC[face];
  // she looks back along the face direction; right-hand vector from runtime.ts
  const fwd: [number, number] = [-f[0], -f[1]];
  const right: [number, number] = [f[1], -f[0]];
  const e = DIR_VEC[exit];
  const ahead = e[0] * fwd[0] + e[1] * fwd[1];
  const side = e[0] * right[0] + e[1] * right[1];
  if (ahead > 0.7) return "up";
  if (side > 0.7) return "right";
  if (side < -0.7) return "left";
  return null; // behind her: that is where she came from
}

/** Yaw that turns a group's +z face toward a reader standing on `face`. */
export function yawFor(face: Dir) {
  const [dx, dz] = DIR_VEC[face];
  return Math.atan2(dx, dz);
}

/* ------------------------------------------------------------- canvas art */

const FONT = "system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function drawArrow(g: CanvasRenderingContext2D, cx: number, cy: number, size: number, arrow: Arrow, color: string) {
  g.save();
  g.translate(cx, cy);
  const turn = arrow === "up" ? -Math.PI / 2 : arrow === "down" ? Math.PI / 2 : arrow === "left" ? Math.PI : 0;
  g.rotate(turn);
  g.fillStyle = color;
  const s = size / 2;
  g.beginPath();
  g.moveTo(s, 0);
  g.lineTo(s * 0.1, -s);
  g.lineTo(s * 0.1, -s * 0.42);
  g.lineTo(-s, -s * 0.42);
  g.lineTo(-s, s * 0.42);
  g.lineTo(s * 0.1, s * 0.42);
  g.lineTo(s * 0.1, s);
  g.closePath();
  g.fill();
  g.restore();
}

function canvasTexture(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** A directory face: one line per exit, each with a big arrow. */
function directoryCanvas(lines: { text: string; arrow: Arrow }[], w: number, h: number) {
  const px = 900;
  const c = document.createElement("canvas");
  c.width = px;
  c.height = Math.max(64, Math.round((px * h) / w));
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff6e4";
  g.fillRect(0, 0, c.width, c.height);
  // painted border
  g.strokeStyle = "#2f7d5b";
  g.lineWidth = c.height * 0.05;
  roundRect(g, g.lineWidth * 0.7, g.lineWidth * 0.7, c.width - g.lineWidth * 1.4, c.height - g.lineWidth * 1.4, c.height * 0.1);
  g.stroke();

  const rows = lines.length;
  const rowH = c.height / rows;
  lines.forEach((l, i) => {
    const cy = rowH * (i + 0.5);
    if (i > 0) {
      g.strokeStyle = "rgba(47,125,91,0.28)";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(c.width * 0.06, rowH * i);
      g.lineTo(c.width * 0.94, rowH * i);
      g.stroke();
    }
    const arrowSize = rowH * 0.62;
    const left = c.width * 0.05 + arrowSize / 2;
    drawArrow(g, left, cy, arrowSize, l.arrow, "#e8455f");
    g.fillStyle = "#3a2b1c";
    g.font = `bold ${Math.round(rowH * 0.5)}px ${FONT}`;
    g.textAlign = "left";
    g.textBaseline = "middle";
    let size = rowH * 0.5;
    const maxW = c.width - (left + arrowSize) - c.width * 0.06;
    while (g.measureText(l.text).width > maxW && size > 12) {
      size -= 2;
      g.font = `bold ${Math.round(size)}px ${FONT}`;
    }
    g.fillText(l.text, left + arrowSize * 0.85, cy + 2);
  });
  return canvasTexture(c);
}

/** A name plaque: one big word, optionally a smaller line under it. */
function nameCanvas(name: string, sub: string | undefined, w: number, h: number, tint: string) {
  const px = 900;
  const c = document.createElement("canvas");
  c.width = px;
  c.height = Math.max(64, Math.round((px * h) / w));
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff6e4";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = tint;
  g.fillRect(0, 0, c.width, c.height * 0.12);
  g.fillRect(0, c.height * 0.88, c.width, c.height * 0.12);
  g.strokeStyle = tint;
  g.lineWidth = c.height * 0.045;
  roundRect(g, g.lineWidth, g.lineWidth, c.width - g.lineWidth * 2, c.height - g.lineWidth * 2, c.height * 0.12);
  g.stroke();

  const bodyTop = c.height * 0.12;
  const bodyH = c.height * 0.76;
  g.fillStyle = "#3a2b1c";
  g.textAlign = "center";
  g.textBaseline = "middle";
  let size = sub ? bodyH * 0.52 : bodyH * 0.66;
  g.font = `bold ${Math.round(size)}px ${FONT}`;
  while (g.measureText(name).width > c.width * 0.88 && size > 14) {
    size -= 2;
    g.font = `bold ${Math.round(size)}px ${FONT}`;
  }
  g.fillText(name, c.width / 2, bodyTop + bodyH * (sub ? 0.36 : 0.5));
  if (sub) {
    g.fillStyle = "#6a5a44";
    g.font = `bold ${Math.round(bodyH * 0.26)}px ${FONT}`;
    g.fillText(sub, c.width / 2, bodyTop + bodyH * 0.76);
  }
  return canvasTexture(c);
}

/** Big painted lettering for the welcome arch and the plaza sign. */
export function bannerTexture(text: string, w: number, h: number, bg: string, ink = "#fff6e4") {
  const px = 1024;
  const c = document.createElement("canvas");
  c.width = px;
  c.height = Math.max(64, Math.round((px * h) / w));
  const g = c.getContext("2d")!;
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  // scalloped highlight along the top, like a fairground board
  g.fillStyle = "rgba(255,255,255,0.16)";
  g.fillRect(0, 0, c.width, c.height * 0.18);
  g.strokeStyle = "#ffd76a";
  g.lineWidth = c.height * 0.06;
  roundRect(g, g.lineWidth, g.lineWidth, c.width - g.lineWidth * 2, c.height - g.lineWidth * 2, c.height * 0.2);
  g.stroke();
  // bulbs round the edge
  g.fillStyle = "#fff3c4";
  const bulbs = 18;
  for (let i = 0; i < bulbs; i++) {
    const x = ((i + 0.5) / bulbs) * c.width;
    for (const y of [c.height * 0.1, c.height * 0.9]) {
      g.beginPath();
      g.arc(x, y, c.height * 0.045, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.fillStyle = ink;
  g.textAlign = "center";
  g.textBaseline = "middle";
  let size = c.height * 0.46;
  g.font = `bold ${Math.round(size)}px ${FONT}`;
  while (g.measureText(text).width > c.width * 0.82 && size > 16) {
    size -= 2;
    g.font = `bold ${Math.round(size)}px ${FONT}`;
  }
  g.strokeStyle = "rgba(0,0,0,0.25)";
  g.lineWidth = size * 0.08;
  g.strokeText(text, c.width / 2, c.height * 0.52);
  g.fillText(text, c.width / 2, c.height * 0.52);
  return canvasTexture(c);
}

/**
 * A board with painted faces: a plain wooden box with a painted plane pinned
 * to the front (+z) and, optionally, the back. A box with six materials would
 * be six draw calls each and there are thirty-odd signs; this way the bodies
 * merge with the rest of the park's woodwork and only the painted faces cost
 * a call apiece.
 */
function boardMesh(w: number, h: number, front: THREE.Texture, back?: THREE.Texture) {
  const g = new THREE.Group();
  const body = mesh(boxGeo, "#8a5a32", w, h, 0.14, 0, 0, 0);
  g.add(body);
  const paint = (tex: THREE.Texture, z: number, turn: boolean) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w - 0.06, h - 0.06),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }),
    );
    m.position.z = z;
    if (turn) m.rotation.y = Math.PI;
    m.receiveShadow = true;
    g.add(m);
  };
  paint(front, 0.081, false);
  if (back) paint(back, -0.081, true);
  return g;
}

/* ------------------------------------------------------- the park's signs */

const POST = "#8a5a32";
const POST_W = 0.22;

/** Posts for every sign, as solid props, so levels.ts can place them. */
export function signProps(directories: Directory[], names: NameSign[]): Prop[] {
  const out: Prop[] = [];
  const post = (x: number, z: number, h: number) =>
    out.push({ kind: "box", pos: [x, h / 2, z], size: [POST_W, h, POST_W], color: POST, collide: true });
  for (const d of directories) {
    const h = (d.h ?? 1.5) + d.exits.length * 0.62 + 0.3;
    // the pair of posts spreads along the boards, which face the first side listed
    const across = d.faces[0] === "N" || d.faces[0] === "S";
    post(d.x + (across ? -0.9 : 0), d.z + (across ? 0 : -0.9), h);
    post(d.x + (across ? 0.9 : 0), d.z + (across ? 0 : 0.9), h);
  }
  for (const n of names) {
    const across = n.face === "N" || n.face === "S";
    const h = 2.5;
    post(n.x + (across ? -1.25 : 0), n.z + (across ? 0 : -1.25), h);
    post(n.x + (across ? 1.25 : 0), n.z + (across ? 0 : 1.25), h);
  }
  return out;
}

/** Every sign in the park as one group of meshes (no colliders). */
export function makeSigns(directories: Directory[], names: NameSign[]) {
  const g = new THREE.Group();

  for (const d of directories) {
    const base = d.h ?? 1.5;
    const boardW = 2.6;
    const rowH = 0.62;
    const h = base + d.exits.length * rowH + 0.3;
    // post caps, over the solid posts levels.ts places
    const across = d.faces[0] === "N" || d.faces[0] === "S";
    for (const s of [-1, 1]) {
      g.add(
        mesh(boxGeo, "#c9825a", 0.34, 0.18, 0.34, d.x + (across ? s * 0.9 : 0), h, d.z + (across ? 0 : s * 0.9), false),
      );
    }
    for (const face of d.faces) {
      const lines = d.exits
        .map((e) => ({ text: e.label, arrow: arrowFor(face, e.dir) }))
        .filter((l): l is { text: string; arrow: Arrow } => l.arrow != null);
      if (!lines.length) continue;
      const boardH = lines.length * rowH;
      const tex = directoryCanvas(lines, boardW, boardH);
      const b = boardMesh(boardW, boardH, tex);
      b.position.set(d.x, base + boardH / 2, d.z);
      b.rotation.y = yawFor(face);
      // both faces of the same board are used when two sides are listed, so
      // nudge a second board clear of the first
      b.position.x += Math.sin(b.rotation.y) * 0.08;
      b.position.z += Math.cos(b.rotation.y) * 0.08;
      g.add(b);
    }
  }

  for (const n of names) {
    const w = 3.1;
    const h = n.sub ? 1.15 : 0.95;
    const y = 1.85;
    const tint = "#e8455f";
    const b = boardMesh(w, h, nameCanvas(n.name, n.sub, w, h, tint), nameCanvas(n.name, n.sub, w, h, tint));
    b.position.set(n.x, y, n.z);
    b.rotation.y = yawFor(n.face);
    g.add(b);
    // a little pitched cap so it reads as a park sign rather than a billboard
    const cap = mesh(boxGeo, "#2f7d5b", w + 0.3, 0.16, 0.5, n.x, y + h / 2 + 0.1, n.z, false);
    cap.rotation.y = b.rotation.y;
    g.add(cap);
    for (const s of [-1, 1]) {
      const across = n.face === "N" || n.face === "S";
      g.add(
        mesh(
          boxGeo,
          "#c9825a",
          0.34,
          0.18,
          0.34,
          n.x + (across ? s * 1.25 : 0),
          2.5,
          n.z + (across ? 0 : s * 1.25),
          false,
        ),
      );
    }
  }

  return g;
}

/* ------------------------------------------- the picnic park's own signage */

/**
 * Junction directories. Positions are beside the walkways (walkways.ts), never
 * on them, and every `faces` entry is a side she actually walks in from.
 */
export const PARK_DIRECTORIES: Directory[] = [
  {
    // the plaza, at the crossroads on its north edge: the main signpost
    x: -4.6,
    z: 6.4,
    faces: ["S", "N"],
    exits: [
      { dir: "N", label: "Pond · Ball Field" },
      { dir: "W", label: "Maze · Splash Pad" },
      { dir: "E", label: "Sandbox · Tennis" },
      { dir: "S", label: "Carnival · Rides" },
    ],
  },
  {
    // the midway junction
    x: 5.2,
    z: 36.4,
    faces: ["N", "S"],
    exits: [
      { dir: "N", label: "Plaza" },
      { dir: "W", label: "Carnival" },
      { dir: "E", label: "Ferris Wheel" },
      { dir: "S", label: "Houses · Pool · Gym" },
    ],
  },
  {
    // beside the pond
    x: 4.6,
    z: -23.6,
    faces: ["S", "N"],
    exits: [
      { dir: "N", label: "Pond Dock" },
      { dir: "W", label: "Ball Field · Farm" },
      { dir: "S", label: "Plaza" },
    ],
  },
  {
    // just inside the north gate
    x: 5.4,
    z: -68.2,
    faces: ["S", "N"],
    exits: [
      { dir: "N", label: "Ball Field" },
      { dir: "W", label: "Farm" },
      { dir: "E", label: "Mini Golf · Cave" },
      { dir: "S", label: "Plaza" },
    ],
  },
  {
    x: -19.6,
    z: -107.4,
    faces: ["S", "N"],
    exits: [
      { dir: "W", label: "Farm" },
      { dir: "E", label: "Zoo" },
      { dir: "S", label: "Ball Field · Plaza" },
    ],
  },
  {
    x: 19.6,
    z: -107.4,
    faces: ["S", "N"],
    exits: [
      { dir: "N", label: "Mini Golf" },
      { dir: "E", label: "Mountain Cave" },
      { dir: "S", label: "Ball Field · Plaza" },
    ],
  },
  {
    // the west avenue crossing
    x: -87.0,
    z: 7.4,
    faces: ["E", "W"],
    exits: [
      { dir: "N", label: "Playground" },
      { dir: "S", label: "Splash Pad" },
      { dir: "W", label: "Woods Trail" },
      { dir: "E", label: "Plaza" },
    ],
  },
  {
    // the east spine
    x: 108.6,
    z: 6.6,
    faces: ["W", "E"],
    exits: [
      { dir: "N", label: "Soccer Field" },
      { dir: "S", label: "Pavilion · Camp" },
      { dir: "W", label: "Plaza · Tennis" },
    ],
  },
  {
    // the south street, in front of the houses
    x: -5.6,
    z: 95.4,
    faces: ["N", "S"],
    exits: [
      { dir: "N", label: "Plaza · Carnival" },
      { dir: "W", label: "Swimming Pool" },
      { dir: "E", label: "Houses" },
      { dir: "S", label: "Ninja Course" },
    ],
  },
];

/** A painted name board at the entrance to every area. */
export const PARK_NAME_SIGNS: NameSign[] = [
  { x: -46.0, z: 0.8, face: "S", name: "Hedge Maze", sub: "in at the blue posts" },
  { x: -87.4, z: 16.6, face: "N", name: "Splash Pad" },
  { x: -87.4, z: -16.4, face: "S", name: "Playground" },
  { x: -101.5, z: -2.2, face: "E", name: "Woods Trail" },
  { x: 28.0, z: 7.4, face: "N", name: "Sandbox" },
  { x: 44.5, z: 6.4, face: "N", name: "Emmett's Truck" },
  { x: 72.4, z: 6.6, face: "N", name: "Tennis" },
  { x: 86.0, z: -19.6, face: "S", name: "Basketball" },
  { x: 109.6, z: -42.6, face: "S", name: "Soccer Field" },
  { x: 121.0, z: 56.4, face: "S", name: "Pavilion" },
  { x: 105.0, z: 68.4, face: "S", name: "Picnic Lawn" },
  { x: 109.6, z: 112.4, face: "N", name: "Campground" },
  { x: -5.4, z: -29.4, face: "S", name: "Big Pond" },
  { x: 0, z: -76.6, face: "S", name: "Ball Field" },
  { x: -64.6, z: -113.2, face: "S", name: "Farm" },
  // (the zoo has its own arch sign over the gate, so no board here)
  { x: 20.2, z: -117.6, face: "S", name: "Mini Golf" },
  { x: 67.0, z: -108.6, face: "S", name: "Mountain Cave" },
  { x: 25.5, z: 62.0, face: "S", name: "Ferris Wheel" },
  { x: -40.6, z: 120.6, face: "N", name: "Swimming Pool" },
  { x: -4.6, z: 124.6, face: "N", name: "Ninja Course" },
  { x: -12.6, z: 102.4, face: "N", name: "Sloan's House" },
];
