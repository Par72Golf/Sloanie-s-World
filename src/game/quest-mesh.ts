import * as THREE from "three";
import { lam } from "./meshes";

/**
 * Meshes for the lost pet quest: the farmer, a pet treat pickup, and the
 * trail of paw prints from the farm to the mountain cave.
 */

const flat = (c: string, roughness = 0.55) => lam(c, { flat: true, roughness });
const sphere = new THREE.SphereGeometry(1, 16, 12);
const cyl = new THREE.CylinderGeometry(1, 1, 1, 14);
const cone = new THREE.ConeGeometry(1, 1, 14);

function part(geo: THREE.BufferGeometry, color: string, s: [number, number, number], p: [number, number, number], shadow = true) {
  const m = new THREE.Mesh(geo, flat(color));
  m.scale.set(...s);
  m.position.set(...p);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

export type FarmerRig = { group: THREE.Group; head: THREE.Group; arm: THREE.Group; bubble: THREE.Mesh | null };

/** A friendly farmer in overalls and a straw hat, facing +z, feet at y 0. */
export function makeFarmer(): FarmerRig {
  const g = new THREE.Group();
  const skin = "#d9a07a";
  const denim = "#3f6fa8";
  const shirt = "#e8455f";
  // boots and legs
  for (const s of [-1, 1]) {
    g.add(part(cyl, denim, [0.11, 0.8, 0.11], [s * 0.13, 0.5, 0]));
    g.add(part(sphere, "#5a3a22", [0.13, 0.08, 0.2], [s * 0.13, 0.08, 0.05]));
  }
  // body: shirt under overall bib
  g.add(part(cyl, shirt, [0.3, 0.62, 0.22], [0, 1.2, 0]));
  g.add(part(cyl, denim, [0.31, 0.36, 0.23], [0, 1.02, 0]));
  const bib = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.06), flat(denim));
  bib.position.set(0, 1.3, 0.2);
  g.add(bib);
  for (const s of [-1, 1]) g.add(part(sphere, "#ffc53d", [0.03, 0.03, 0.02], [s * 0.12, 1.42, 0.24], false));
  // arms: one resting, one that waves
  g.add(part(cyl, shirt, [0.08, 0.55, 0.08], [-0.36, 1.2, 0]));
  g.add(part(sphere, skin, [0.08, 0.08, 0.08], [-0.36, 0.9, 0]));
  const arm = new THREE.Group();
  arm.position.set(0.36, 1.45, 0);
  arm.add(part(cyl, shirt, [0.08, 0.55, 0.08], [0, -0.27, 0]));
  arm.add(part(sphere, skin, [0.08, 0.08, 0.08], [0, -0.56, 0]));
  g.add(arm);
  // head, beard, eyes, straw hat
  const head = new THREE.Group();
  head.position.set(0, 1.72, 0);
  head.add(part(sphere, skin, [0.24, 0.26, 0.24], [0, 0.05, 0]));
  head.add(part(sphere, "#f3eadc", [0.2, 0.14, 0.12], [0, -0.1, 0.12]));
  head.add(part(sphere, skin, [0.05, 0.045, 0.05], [0, 0.04, 0.24], false));
  for (const s of [-1, 1]) head.add(part(sphere, "#2a1a10", [0.03, 0.035, 0.02], [s * 0.09, 0.1, 0.21], false));
  head.add(part(cyl, "#e8c46a", [0.46, 0.04, 0.46], [0, 0.22, 0]));
  head.add(part(cyl, "#e8c46a", [0.24, 0.2, 0.24], [0, 0.32, 0]));
  head.add(part(cyl, "#c9442f", [0.245, 0.05, 0.245], [0, 0.26, 0], false));
  g.add(head);
  // "Can you help?" over his head, so she knows he wants something from across
  // the farm rather than having to walk into him to find out
  const bubble = makeBubble(["Can you help?"]);
  bubble.position.set(0, 2.75, 0);
  g.add(bubble);
  return { group: g, head, arm, bubble };
}

/**
 * A speech bubble on a plane, drawn on canvas: a rounded white bubble with a
 * tail, big friendly text, and the game's plum outline. It turns to face her
 * (yaw only, so it never lies on its side) and hides once she has helped him.
 */
export function makeBubble(lines: string[]): THREE.Mesh {
  const W = 512;
  const H = 256;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const body = { x: 12, y: 10, w: W - 24, h: H - 70, r: 42 };
  // pink, not white: a big white panel blooms on a sunny day and glares
  const fill = g.createLinearGradient(0, 0, 0, H);
  fill.addColorStop(0, "#ff8dc0");
  fill.addColorStop(1, "#f2457f");
  g.fillStyle = fill;
  g.strokeStyle = "#2e1856";
  g.lineWidth = 10;
  g.beginPath();
  g.moveTo(body.x + body.r, body.y);
  g.arcTo(body.x + body.w, body.y, body.x + body.w, body.y + body.h, body.r);
  g.arcTo(body.x + body.w, body.y + body.h, body.x, body.y + body.h, body.r);
  g.arcTo(body.x, body.y + body.h, body.x, body.y, body.r);
  g.arcTo(body.x, body.y, body.x + body.w, body.y, body.r);
  g.closePath();
  // the tail, drawn as part of the same outline so there is no seam
  g.moveTo(W / 2 - 42, body.y + body.h - 4);
  g.lineTo(W / 2 - 6, H - 12);
  g.lineTo(W / 2 + 46, body.y + body.h - 4);
  g.closePath();
  g.fill();
  g.stroke();
  // bubble letters: gold with a thick plum outline, so they read from a
  // distance against the pink without glowing
  g.textAlign = "center";
  g.textBaseline = "middle";
  const size = lines.length > 1 ? 56 : 68;
  g.font = `800 ${size}px system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif`;
  g.lineJoin = "round";
  g.miterLimit = 2;
  const top = body.y + body.h / 2 - ((lines.length - 1) * size * 0.62) / 2;
  lines.forEach((line, i) => {
    const y = top + i * size * 1.24;
    g.strokeStyle = "#2e1856";
    g.lineWidth = 14;
    g.strokeText(line, W / 2, y);
    g.fillStyle = "#ffc83a";
    g.fillText(line, W / 2, y);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 0.95),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  m.renderOrder = 2;
  return m;
}

/** Farmer idle: breathing, looking toward her, waving when she is close. */
export function animateFarmer(rig: FarmerRig, t: number, lookYaw: number, wave: boolean) {
  if (rig.bubble) {
    // bobs gently, turns to her, and only shows while he still needs help
    rig.bubble.position.y = 2.75 + Math.sin(t * 1.6) * 0.04;
    rig.bubble.rotation.y = lookYaw;
  }
  rig.head.rotation.y = THREE.MathUtils.clamp(lookYaw, -0.9, 0.9);
  rig.head.position.y = 1.72 + Math.sin(t * 2) * 0.01;
  rig.arm.rotation.z = wave ? 2.4 + Math.sin(t * 9) * 0.35 : 0.1;
}

/** A pet treat: a chunky bone biscuit on a soft glow ring, ready to bob and spin. */
export function makeTreat(): THREE.Group {
  const g = new THREE.Group();
  const item = new THREE.Group();
  const biscuit = flat("#d9a05a", 0.7);
  const bar = new THREE.Mesh(cyl, biscuit);
  bar.scale.set(0.09, 0.42, 0.09);
  bar.rotation.z = Math.PI / 2;
  item.add(bar);
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const knob = new THREE.Mesh(sphere, biscuit);
      knob.scale.setScalar(0.11);
      knob.position.set(sx * 0.22, sy * 0.07, 0);
      item.add(knob);
    }
  }
  item.position.y = 0.9;
  g.add(item);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, 0.05, 8, 24),
    new THREE.MeshStandardMaterial({ color: "#ffe0b0", emissive: new THREE.Color("#ffb070"), emissiveIntensity: 1.2 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.08;
  g.add(ring);
  g.userData.item = item;
  g.userData.ring = ring;
  return g;
}

/**
 * Paw prints along a trail of waypoints, as one instanced mesh: pairs of
 * little prints every ~1.2m, alternating left and right, pointing along the
 * way to go. Each print is a pad and three toes merged into one geometry.
 */
export function makePawTrail(points: [number, number][]): THREE.InstancedMesh {
  const pad = new THREE.CylinderGeometry(0.1, 0.11, 0.02, 12);
  const parts: THREE.BufferGeometry[] = [pad];
  for (const [x, z] of [
    [-0.09, 0.12],
    [0, 0.16],
    [0.09, 0.12],
  ]) {
    const toe = new THREE.CylinderGeometry(0.04, 0.045, 0.02, 10);
    toe.translate(x, 0, z);
    parts.push(toe);
  }
  // merge by hand: all share position/normal/uv/index layout from CylinderGeometry
  const merged = mergeSimple(parts);
  const mat = new THREE.MeshStandardMaterial({ color: "#6a4a32", roughness: 0.95 });
  const prints: { x: number; z: number; yaw: number }[] = [];
  let side = 1;
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i]!;
    const [bx, bz] = points[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / len;
    const dz = (bz - az) / len;
    const yaw = Math.atan2(dx, dz);
    for (let d = 0; d < len; d += 1.2) {
      prints.push({ x: ax + dx * d + -dz * 0.18 * side, z: az + dz * d + dx * 0.18 * side, yaw });
      side = -side;
    }
  }
  const mesh = new THREE.InstancedMesh(merged, mat, prints.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  prints.forEach((p, i) => {
    q.setFromAxisAngle(up, p.yaw);
    m.compose(new THREE.Vector3(p.x, 0.13, p.z), q, new THREE.Vector3(1, 1, 1));
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.receiveShadow = true;
  return mesh;
}

function mergeSimple(geos: THREE.BufferGeometry[]) {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  let offset = 0;
  for (const g of geos) {
    const p = g.attributes.position as THREE.BufferAttribute;
    const n = g.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
    }
    const index = g.index!;
    for (let i = 0; i < index.count; i++) idx.push(index.getX(i) + offset);
    offset += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}
