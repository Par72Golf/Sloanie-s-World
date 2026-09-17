import * as THREE from "three";
import { createElement, useEffect, useState, type CSSProperties } from "react";
import { makeAccessory, type AccessoryId } from "./accessories";
import { furnitureDef, makeFurniture, surfaceMaterial } from "./furniture";
import { cn } from "@/lib/utils";

/**
 * Item thumbnails: a picture of the real procedural mesh for the bag, the
 * wardrobe, the prize booth and the house decorating tiles.
 *
 * One small offscreen WebGLRenderer (never the game's) renders every item on a
 * transparent background with studio lights and a 3/4 camera fitted to the
 * item's vertices, then hands back a blob URL cached per item for the session.
 * Wallpapers and floors are not meshes, so they are drawn as a swatch of their
 * canvas texture on a 2D canvas instead.
 *
 * Work is queued and spread over animation frames, one step per frame (build
 * and compile, then draw, then read back and encode), so opening a shop never
 * hitches the game. Pixels come back through a pixel buffer and a fence sync
 * polled once a frame: a plain readPixels or toBlob on a WebGL canvas waits for
 * the GPU to finish everything queued, including the game's own frame.
 *
 * Geometry is cloned before rendering and the clones are disposed after each
 * snapshot: the builders share cached geometry and materials with the
 * game, and disposing those would make the game renderer re-upload them.
 * Cloned materials are kept while a burst of thumbnails is rendering (so their
 * shader programs stay compiled) and freed with the renderer after a quiet
 * spell.
 */

export type ThumbKind = "accessory" | "furniture";

const SIZE = 256;
/** how much of the frame the item fills along its longer side */
const FILL = 0.86;
/** tear the renderer down after this long with nothing to draw (making a GL
 * context is the one costly step, so keep it through a browsing session) */
const IDLE_MS = 60000;

const key = (kind: ThumbKind, id: string) => `${kind}:${id}`;

const done = new Map<string, string | null>();
const waiting = new Map<string, Set<(url: string | null) => void>>();
const queue: { kind: ThumbKind; id: string }[] = [];

/** Timings for checking the cost per frame in the browser. */
export const thumbStats = { rendered: 0, worstStepMs: 0, steps: [] as { id: string; step: string; ms: number }[] };
if (typeof window !== "undefined") (window as unknown as { __thumbStats: typeof thumbStats }).__thumbStats = thumbStats;
function note(id: string, step: string, t0: number) {
  const ms = +(performance.now() - t0).toFixed(2);
  thumbStats.worstStepMs = Math.max(thumbStats.worstStepMs, ms);
  thumbStats.steps.push({ id, step, ms });
  if (thumbStats.steps.length > 80) thumbStats.steps.shift();
}

// ---------------------------------------------------------------------------
// the studio

type Studio = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** clones of shared materials, kept for the renderer's lifetime */
  mats: Map<THREE.Material, THREE.Material>;
};
let studio: Studio | null = null;
let studioFailed = false;
let idleTimer = 0;

function getStudio(): Studio | null {
  if (studio || studioFailed) return studio;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
    renderer.setPixelRatio(1);
    renderer.setSize(SIZE, SIZE, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
    // lights ride on the camera, so every item is lit the same way whichever
    // side it is seen from: a warm key high on the left, a cool fill on the
    // right, a rim from behind, and a soft sky/ground wash
    scene.add(camera);
    scene.add(new THREE.HemisphereLight("#ffffff", "#c9b89c", 1.5));
    const key = new THREE.DirectionalLight("#fff4e2", 2.3);
    key.position.set(-2.5, 3.5, 3);
    camera.add(key, key.target);
    key.target.position.set(0, 0, -5);
    const fill = new THREE.DirectionalLight("#e2ecff", 0.9);
    fill.position.set(3, 0.5, 1.5);
    camera.add(fill, fill.target);
    fill.target.position.set(0, 0, -5);
    const rim = new THREE.DirectionalLight("#ffffff", 1.4);
    rim.position.set(0.5, 3, -6);
    camera.add(rim, rim.target);
    rim.target.position.set(0, 0, -5);

    studio = { renderer, scene, camera, mats: new Map() };
  } catch {
    studioFailed = true;
  }
  return studio;
}

function scheduleTeardown() {
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => {
    if (!studio || running) return;
    for (const m of studio.mats.values()) m.dispose();
    studio.renderer.dispose();
    studio.renderer.forceContextLoss();
    studio = null;
  }, IDLE_MS);
}

// ---------------------------------------------------------------------------
// framing

type View = { yaw: number; pitch: number };
const deg = THREE.MathUtils.degToRad;

/** Items worn on her back are built facing her back, so show their outside. */
const VIEW: Partial<Record<string, View>> = {
  backpack: { yaw: deg(180 + 35), pitch: deg(18) },
  wings: { yaw: deg(180 + 25), pitch: deg(12) },
  cape: { yaw: deg(180 + 30), pitch: deg(14) },
  balloon: { yaw: deg(25), pitch: deg(8) },
};

function viewFor(kind: ThumbKind, id: string, size: THREE.Vector3): View {
  const set = VIEW[id];
  if (set) return set;
  const across = Math.max(size.x, size.z);
  // rugs and mats: look down on them. Only furniture: a headband or a crown is
  // flat too, and looking down on one shows a ring instead of a tiara.
  if (kind === "furniture" && size.y < across * 0.25) return { yaw: deg(18), pitch: deg(56) };
  // pictures and curtains: flat against the wall, seen nearly face on
  if (size.z < Math.max(size.x, size.y) * 0.2) return { yaw: deg(16), pitch: deg(8) };
  // headbands and crowns: nearly level, so the shape reads across the front
  if (size.y < across * 0.45) return { yaw: deg(26), pitch: deg(14) };
  return { yaw: deg(32), pitch: deg(22) };
}

const _v = new THREE.Vector3();

/**
 * Point the camera at the item from the view's direction and fit an
 * off-centre frustum tightly round the projected vertices.
 */
function frameCamera(camera: THREE.PerspectiveCamera, root: THREE.Object3D, view: View) {
  const back = new THREE.Vector3(Math.sin(view.yaw) * Math.cos(view.pitch), Math.sin(view.pitch), Math.cos(view.yaw) * Math.cos(view.pitch));
  const right = new THREE.Vector3(0, 1, 0).cross(back).normalize();
  const up = back.clone().cross(right).normalize();

  // every vertex in the camera's basis
  const pts: number[] = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.visible) return;
    const pos = m.geometry.getAttribute("position");
    if (!pos) return;
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      const x = _v.dot(right);
      const y = _v.dot(up);
      const z = _v.dot(back);
      pts.push(x, y, z);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  });
  if (!pts.length) return false;

  // distance: far enough that a 30 degree view holds everything, and never so
  // close that the perspective turns the nearest part into a fisheye
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const t = Math.tan(deg(15));
  const radius = Math.max(maxX - minX, maxY - minY, maxZ - minZ) / 2;
  let d = maxZ + radius * 1.2;
  for (let i = 0; i < pts.length; i += 3) {
    const need = pts[i + 2]! + Math.max(Math.abs(pts[i]! - cx), Math.abs(pts[i + 1]! - cy)) / t;
    if (need > d) d = need;
  }

  // the projected bounds at that distance, then a square window round them
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (let i = 0; i < pts.length; i += 3) {
    const depth = d - pts[i + 2]!;
    const u = (pts[i]! - cx) / depth;
    const v = (pts[i + 1]! - cy) / depth;
    if (u < u0) u0 = u;
    if (u > u1) u1 = u;
    if (v < v0) v0 = v;
    if (v > v1) v1 = v;
  }
  const half = Math.max(u1 - u0, v1 - v0) / 2 / FILL;
  const um = (u0 + u1) / 2;
  const vm = (v0 + v1) / 2;

  const near = Math.max(0.005, (d - maxZ) * 0.5);
  const far = d - minZ + radius + 1;
  camera.position.copy(right).multiplyScalar(cx).addScaledVector(up, cy).addScaledVector(back, d);
  camera.up.copy(up);
  camera.lookAt(_v.copy(right).multiplyScalar(cx).addScaledVector(up, cy));
  camera.updateMatrixWorld(true);
  camera.projectionMatrix.makePerspective((um - half) * near, (um + half) * near, (vm + half) * near, (vm - half) * near, near, far);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  return true;
}

// ---------------------------------------------------------------------------
// building

function buildItem(kind: ThumbKind, id: string): THREE.Object3D {
  if (kind === "accessory") return makeAccessory(id as AccessoryId).mesh;
  return makeFurniture(id);
}

/** Swap shared geometry and materials for private copies; returns the geometry clones. */
function isolate(root: THREE.Object3D, mats: Map<THREE.Material, THREE.Material>) {
  const geos = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  const own = (m: THREE.Material) => {
    let c = mats.get(m);
    if (!c) {
      c = m.clone();
      mats.set(m, c);
    }
    return c;
  };
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    let g = geos.get(m.geometry);
    if (!g) {
      g = m.geometry.clone();
      geos.set(m.geometry, g);
    }
    m.geometry = g;
    m.material = Array.isArray(m.material) ? m.material.map(own) : own(m.material);
    m.castShadow = false;
    m.receiveShadow = false;
  });
  return [...geos.values()];
}

/** A CPU-backed 2D canvas: putImageData and toBlob never wait on the GPU. */
let outCanvas: HTMLCanvasElement | null = null;
function out2d() {
  outCanvas ??= document.createElement("canvas");
  outCanvas.width = SIZE;
  outCanvas.height = SIZE;
  const g = outCanvas.getContext("2d", { willReadFrequently: true });
  return g ? { c: outCanvas, g } : null;
}

/**
 * Read the drawing buffer without stalling: copy it into a pixel buffer on the
 * GPU, then check a fence once a frame and map it when the copy is done.
 * Must be called in the same task as the render (the buffer is not preserved).
 */
async function readPixelsAsync(gl: WebGL2RenderingContext, w: number, h: number): Promise<Uint8Array | null> {
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buf);
  gl.bufferData(gl.PIXEL_PACK_BUFFER, w * h * 4, gl.STREAM_READ);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, 0);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  try {
    if (!sync) return null;
    for (let i = 0; ; i++) {
      await nextFrame();
      if (gl.isContextLost() || i > 600) return null;
      if (gl.getSyncParameter(sync, gl.SYNC_STATUS) === gl.SIGNALED) break;
    }
    const px = new Uint8Array(w * h * 4);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buf);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, px);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    return px;
  } finally {
    if (sync) gl.deleteSync(sync);
    gl.deleteBuffer(buf);
  }
}

/** GL pixels (bottom row first, premultiplied) to a PNG blob URL. */
function pixelsToUrl(px: Uint8Array): Promise<string | null> {
  const o = out2d();
  if (!o) return Promise.resolve(null);
  const img = o.g.createImageData(SIZE, SIZE);
  const d = img.data;
  for (let y = 0; y < SIZE; y++) {
    let s = (SIZE - 1 - y) * SIZE * 4;
    let t = y * SIZE * 4;
    for (let x = 0; x < SIZE; x++, s += 4, t += 4) {
      const a = px[s + 3]!;
      if (a === 0) continue;
      if (a === 255) {
        d[t] = px[s]!;
        d[t + 1] = px[s + 1]!;
        d[t + 2] = px[s + 2]!;
      } else {
        const k = 255 / a;
        d[t] = Math.min(255, px[s]! * k);
        d[t + 1] = Math.min(255, px[s + 1]! * k);
        d[t + 2] = Math.min(255, px[s + 2]! * k);
      }
      d[t + 3] = a;
    }
  }
  o.g.putImageData(img, 0, 0);
  return encode(o.c);
}

function encode(canvas: HTMLCanvasElement): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      // toBlob copies the bitmap synchronously, so the canvas can be reused
      canvas.toBlob((b) => resolve(b ? URL.createObjectURL(b) : null), "image/png");
    } catch {
      resolve(null);
    }
  });
}

/**
 * The next animation frame, or a short timeout, whichever comes first: a
 * hidden tab stops firing frames and the queue would stall for ever.
 */
function nextFrame() {
  return new Promise<void>((resolve) => {
    let timer = 0;
    const done = () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      resolve();
    };
    const raf = window.requestAnimationFrame(done);
    timer = window.setTimeout(done, 120);
  });
}

async function snapshotMesh(kind: ThumbKind, id: string): Promise<string | null> {
  let t0 = performance.now();
  const fresh = !studio;
  const s = getStudio();
  if (!s) return null;
  if (fresh) note(id, "studio", t0);
  t0 = performance.now();
  const root = buildItem(kind, id);
  root.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  const geos = isolate(root, s.mats);
  const cleanup = () => {
    s.scene.remove(root);
    for (const g of geos) g.dispose();
  };
  if (!frameCamera(s.camera, root, viewFor(kind, id, size))) {
    cleanup();
    return null;
  }
  s.scene.add(root);
  // compile (and upload) in this frame, without waiting on shader links
  await s.renderer.compileAsync(s.scene, s.camera);
  note(id, "build+compile", t0);
  await nextFrame();
  t0 = performance.now();
  s.renderer.render(s.scene, s.camera);
  const read = readPixelsAsync(s.renderer.getContext() as WebGL2RenderingContext, SIZE, SIZE);
  cleanup();
  note(id, "render", t0);
  const px = await read;
  if (!px) return null;
  t0 = performance.now();
  const url = pixelsToUrl(px);
  note(id, "encode", t0);
  return url;
}

/** Wallpaper and floor: a card of the surface texture (floors as a tile seen from above). */
function snapshotSurface(id: string): Promise<string | null> {
  const t0 = performance.now();
  const floor = furnitureDef(id)?.spot === "floor";
  const mat = surfaceMaterial(id) as THREE.MeshStandardMaterial;
  const map = mat.map;
  const img = map?.image as CanvasImageSource | undefined;
  const o = out2d();
  if (!o) return Promise.resolve(null);
  const { c, g } = o;

  // metres of surface across the card, and texture pixels per metre
  const metres = floor ? 2.4 : 1.8;
  const fillFace = (w: number) => {
    if (img && map) {
      const pat = g.createPattern(img, "repeat");
      const iw = (img as HTMLCanvasElement).width || 256;
      const tile = 1 / (map.repeat.x || 1);
      if (pat) {
        pat.setTransform(new DOMMatrix().scale((w / metres) * tile / iw));
        g.fillStyle = pat;
      } else g.fillStyle = `#${mat.color.getHexString()}`;
    } else g.fillStyle = `#${mat.color.getHexString()}`;
  };

  if (floor) {
    // an isometric slab: the top in the texture, two darker sides below it
    const W = 172; // face size before the transform
    const cx = SIZE / 2;
    const top = 44;
    const a = Math.SQRT1_2;
    const b = Math.SQRT1_2 * 0.58;
    const depth = 20;
    const corner = (u: number, v: number, dy = 0): [number, number] => [cx + (u - v) * a, top + (u + v) * b + dy];
    const side = (p: [number, number][], shade: string) => {
      g.beginPath();
      p.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.fillStyle = shade;
      g.fill();
    };
    g.save();
    g.shadowColor = "rgba(29,36,82,0.25)";
    g.shadowBlur = 10;
    g.shadowOffsetY = 6;
    side([corner(0, W), corner(W, W), corner(W, W, depth), corner(0, W, depth)], "#000");
    side([corner(W, 0), corner(W, W), corner(W, W, depth), corner(W, 0, depth)], "#000");
    g.restore();
    // sides show the surface too, shaded
    for (const [p, shade] of [
      [[corner(0, W), corner(W, W), corner(W, W, depth), corner(0, W, depth)], "rgba(29,36,82,0.34)"],
      [[corner(W, 0), corner(W, W), corner(W, W, depth), corner(W, 0, depth)], "rgba(29,36,82,0.5)"],
    ] as [[number, number][], string][]) {
      g.beginPath();
      p.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      fillFace(W);
      g.fill();
      g.fillStyle = shade;
      g.fill();
    }
    g.save();
    g.setTransform(a, b, -a, b, cx, top);
    g.beginPath();
    g.rect(0, 0, W, W);
    fillFace(W);
    g.fill();
    // soft light across the top
    const grad = g.createLinearGradient(0, 0, W, W);
    grad.addColorStop(0, "rgba(255,255,255,0.22)");
    grad.addColorStop(0.6, "rgba(255,255,255,0)");
    grad.addColorStop(1, "rgba(29,36,82,0.12)");
    g.fillStyle = grad;
    g.fill();
    g.restore();
  } else {
    // a wallpaper sample card with rounded corners, a white border and a sheen
    const pad = 20;
    const w = SIZE - pad * 2;
    g.save();
    g.shadowColor = "rgba(29,36,82,0.28)";
    g.shadowBlur = 12;
    g.shadowOffsetY = 6;
    g.beginPath();
    g.roundRect(pad, pad, w, w, 30);
    g.fillStyle = "#ffffff";
    g.fill();
    g.restore();
    g.save();
    g.beginPath();
    g.roundRect(pad + 9, pad + 9, w - 18, w - 18, 22);
    g.clip();
    g.translate(pad + 9, pad + 9);
    fillFace(w - 18);
    g.fillRect(0, 0, w - 18, w - 18);
    const grad = g.createLinearGradient(0, 0, 0, w - 18);
    grad.addColorStop(0, "rgba(255,255,255,0.2)");
    grad.addColorStop(0.45, "rgba(255,255,255,0)");
    grad.addColorStop(1, "rgba(29,36,82,0.14)");
    g.fillStyle = grad;
    g.fillRect(0, 0, w - 18, w - 18);
    g.restore();
  }
  const out = encode(c);
  note(id, "swatch", t0);
  return out;
}

// ---------------------------------------------------------------------------
// the queue

let running = false;

async function pump() {
  if (running) return;
  running = true;
  window.clearTimeout(idleTimer);
  try {
    while (queue.length) {
      // one item per frame at most
      await nextFrame();
      const job = queue.shift()!;
      const k = key(job.kind, job.id);
      let url: string | null = null;
      try {
        const surface = job.kind === "furniture" && (furnitureDef(job.id)?.spot === "wallpaper" || furnitureDef(job.id)?.spot === "floor");
        url = surface ? await snapshotSurface(job.id) : await snapshotMesh(job.kind, job.id);
      } catch (err) {
        console.warn("[thumbs]", k, err);
      }
      thumbStats.rendered++;
      done.set(k, url);
      const cbs = waiting.get(k);
      waiting.delete(k);
      cbs?.forEach((cb) => cb(url));
    }
  } finally {
    running = false;
    if (studio) scheduleTeardown();
  }
}

/**
 * Ask for an item's thumbnail. Calls back with a blob URL (or null if it could
 * not be drawn) once ready, straight away if cached. Returns an unsubscribe.
 */
export function requestThumb(kind: ThumbKind, id: string, cb: (url: string | null) => void): () => void {
  const k = key(kind, id);
  if (done.has(k)) {
    cb(done.get(k)!);
    return () => {};
  }
  let set = waiting.get(k);
  if (!set) {
    set = new Set();
    waiting.set(k, set);
    queue.push({ kind, id });
    void pump();
  }
  set.add(cb);
  const mine = set;
  return () => {
    mine.delete(cb);
  };
}

/** The cached URL for an item, if it has been drawn. */
export function cachedThumb(kind: ThumbKind, id: string): string | null {
  return done.get(key(kind, id)) ?? null;
}

/** A thumbnail's URL once it is ready; null until then. */
export function useItemThumb(kind: ThumbKind, id: string): string | null {
  const [url, setUrl] = useState(() => cachedThumb(kind, id));
  useEffect(() => {
    setUrl(cachedThumb(kind, id));
    return requestThumb(kind, id, setUrl);
  }, [kind, id]);
  return url;
}

/**
 * An item's picture, filling its box. A soft blob pulses until it is drawn.
 * `locked` shows a dark silhouette, for things not found or not earned yet.
 * Purely decorative: the tile around it carries the label.
 */
export function ItemThumb({
  kind,
  id,
  locked = false,
  className,
  imgClassName,
  style,
}: {
  kind: ThumbKind;
  id: string;
  locked?: boolean;
  className?: string;
  imgClassName?: string;
  style?: CSSProperties;
}) {
  const url = useItemThumb(kind, id);
  return createElement(
    "span",
    { "aria-hidden": true, className: cn("pointer-events-none relative grid shrink-0 place-items-center", className), style },
    url
      ? createElement("img", {
          key: "img",
          src: url,
          alt: "",
          draggable: false,
          className: cn("animate-ui-fade size-full select-none object-contain", imgClassName),
          style: locked
            ? { filter: "brightness(0)", opacity: 0.3 }
            : { filter: "drop-shadow(0 4px 3px rgb(29 36 82 / 0.28))" },
        })
      : createElement("span", {
          key: "wait",
          className: "size-3/5 animate-pulse rounded-full bg-ink/10",
        }),
  );
}
