/**
 * Can she walk into it?
 *
 * Every other layout check looks at colliders. None looks at what is drawn,
 * so a thing that is drawn big and made solid small is invisible to all of
 * them — and that is exactly what a child notices first, because she runs
 * straight at it. Sugar Rush's first real play found lollipop heads, a
 * chocolate fountain, rock candy and the boundary piers all doing this.
 *
 * For every model the park places, this builds the real mesh (with a stand-in
 * canvas, so textures fall back to flat colour and the geometry is exact),
 * turns and scales it the way the park does, and slices it at her body height:
 * from just above the step-up, where she walks into things rather than onto
 * them, to her shoulders. Every point of that slice has to lie inside a
 * collider, give or take a small allowance for the drawn skin. Whatever lies
 * further out is how far she can walk into it before anything stops her.
 *
 * Box and cylinder props are checked the simple way: tall and not solid is a
 * walk-through.
 *
 * Run: LEVEL=1 npx jiti tools/solid.ts        (exits 1 on any walk-through)
 */
{
  // A 2D context that accepts every call and every setting and draws nothing.
  const ctx: any = new Proxy(
    {},
    {
      get: (_t, k) =>
        k === "getImageData" || k === "createImageData"
          ? (w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(1, (w as number) * (h as number) * 4)), width: w, height: h })
          : k === "measureText"
            ? () => ({ width: 10 })
            : k === "createLinearGradient" || k === "createRadialGradient" || k === "createPattern"
              ? () => ({ addColorStop() {} })
              : () => {},
      set: () => true,
    },
  );
  (globalThis as any).document ??= { createElement: () => ({ getContext: () => ctx, width: 256, height: 256, style: {} }) };
}
import * as THREE from "three";
import { LEVELS } from "../src/game/levels";
import { applyLevelOrigins } from "../src/game/level-origins";
import { makeModel, modelColliders } from "../src/game/models";
import type { ModelProp } from "../src/game/types";

const LEVEL = Number(process.env.LEVEL ?? 0);
const level = LEVELS[LEVEL]!;
applyLevelOrigins(level);

/** Her body, above the step-up (she steps onto anything lower) and up to her shoulders. */
const BAND = { y0: 0.65, y1: 1.45 };
/** How far drawn skin may stand proud of its collider: a lumpy edge, a rim. */
const SKIN = 0.2;
/** Beyond this she has visibly walked into the thing. */
const FAIL_AT = 0.35;

/**
 * Things she is meant to pass through, and why. Everything here is either
 * above her, on the ground under her, or a ribbon, cloud or rainbow.
 */
const MEANT: Record<string, string> = {
  "choc-river": "liquid",
  "forest-trail": "a path",
  "forest-spur": "a path",
  "swirl-mint": "flat paving",
  "candy-cloud": "in the sky",
  "candy-rainbow": "in the sky",
  "sugar-bunting": "strung overhead",
};

type Slice = { x: number; z: number; y: number; mesh: string }[];
const sliceCache = new Map<string, Slice>();

/** Every point of the mesh's surface inside the band, in the model's own frame. */
function slice(id: string, variant: number, scale: number): Slice {
  const key = `${id}|${variant}|${scale.toFixed(3)}`;
  const hit = sliceCache.get(key);
  if (hit) return hit;
  // exactly what world-build's placeModel does: the factory is handed the
  // scale, and the group is scaled as well, because some factories ignore it
  const g = makeModel(id, variant, scale);
  g.scale.setScalar(scale);
  g.updateMatrixWorld(true);
  const out: Slice = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  let name = "";
  const keep = (p: THREE.Vector3) => out.push({ x: p.x, z: p.z, y: p.y, mesh: name });
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.visible) return;
    // a door that swings open as she arrives is shut in the model and open by
    // the time she gets there; the runtime owns it, not the collider list
    for (let a: THREE.Object3D | null = m; a; a = a.parent) if (typeof a.userData.opens === "number") return;
    name = m.name || m.parent?.name || m.geometry.type;
    const pos = m.geometry.getAttribute("position");
    if (!pos) return;
    const idx = m.geometry.getIndex();
    const n = idx ? idx.count : pos.count;
    const at = (i: number, v: THREE.Vector3) => v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m.matrixWorld);
    for (let t = 0; t + 2 < n; t += 3) {
      for (let e = 0; e < 3; e++) {
        at(t + e, a);
        at(t + ((e + 1) % 3), b);
        if (a.y >= BAND.y0 && a.y <= BAND.y1) keep(a.clone());
        // where the edge crosses either face of the band
        for (const y of [BAND.y0, BAND.y1]) {
          if ((a.y - y) * (b.y - y) < 0) keep(a.clone().lerp(b, (y - a.y) / (b.y - a.y)));
        }
      }
    }
  });
  sliceCache.set(key, out);
  return out;
}

type Row = { n: number; worst: number; at: string; what: string };
const rows = new Map<string, Row>();
for (const p of level.props as ModelProp[]) {
  if (p.kind !== "model" || MEANT[p.id]) continue;
  const s = p.scale ?? 1;
  const ry = p.ry ?? 0;
  const c = Math.cos(ry);
  const sn = Math.sin(ry);
  const y0 = (p as { y?: number }).y ?? 0;
  const boxes = modelColliders(p).filter((b) => b.maxY > BAND.y0 + y0 && b.minY < BAND.y1 + y0);
  let worst = 0;
  let what = "";
  for (const q of slice(p.id, p.variant ?? 0, s)) {
    // the same turn three.js applies for rotation.y
    const x = p.x + q.x * c + q.z * sn;
    const z = p.z - q.x * sn + q.z * c;
    let d = Infinity;
    for (const bx of boxes) {
      const dx = Math.max(bx.minX - x, 0, x - bx.maxX);
      const dz = Math.max(bx.minZ - z, 0, z - bx.maxZ);
      d = Math.min(d, Math.hypot(dx, dz));
      if (d === 0) break;
    }
    if (d === Infinity) d = Math.hypot(q.x, q.z); // nothing solid at all
    if (d - SKIN > worst) {
      worst = d - SKIN;
      what = `${q.mesh} local (${q.x.toFixed(2)}, ${q.y.toFixed(2)}, ${q.z.toFixed(2)})`;
    }
  }
  const r = rows.get(p.id) ?? { n: 0, worst: 0, at: "", what: "" };
  r.n++;
  if (worst > r.worst) {
    r.worst = worst;
    r.at = `(${p.x.toFixed(0)}, ${p.z.toFixed(0)})`;
    r.what = what;
  }
  rows.set(p.id, r);
}

let fails = 0;
console.log(`${level.name}: how far she can walk into each model before it stops her`);
for (const [id, r] of [...rows.entries()].sort((a, b) => b[1].worst - a[1].worst)) {
  const bad = r.worst > FAIL_AT;
  if (bad) fails++;
  if (bad || process.env.VERBOSE) {
    console.log(`  ${bad ? "FAIL" : "ok  "} ${id.padEnd(22)} x${String(r.n).padStart(3)}  ${r.worst.toFixed(2)}m in, worst at ${r.at}`);
    if (bad && process.env.WHERE) console.log(`         the part: ${r.what}`);
  }
}

// Box and cylinder props that are not solid: measured the same way, against
// everything solid near them. A cap on a solid post, or trim on a solid bench,
// is fine; a rail with nothing behind it between two far-apart posts is not.
import { collidersFor } from "../src/game/colliders";
const all = collidersFor(level);
const loose = new Map<string, { n: number; worst: number; at: string }>();
for (const p of level.props as any[]) {
  if ((p.kind !== "box" && p.kind !== "cyl") || p.collide !== false) continue;
  const h = p.kind === "box" ? p.size[1] : p.h;
  const bottom = p.pos[1] - h / 2;
  const top = p.pos[1] + h / 2;
  if (top <= BAND.y0 || bottom >= BAND.y1) continue;
  const pts: [number, number][] = [];
  if (p.kind === "box") {
    const ry = p.ry ?? 0;
    const c = Math.cos(ry);
    const sn = Math.sin(ry);
    for (const fx of [-0.5, -0.25, 0, 0.25, 0.5])
      for (const fz of [-0.5, 0, 0.5]) {
        const lx = fx * p.size[0];
        const lz = fz * p.size[2];
        pts.push([p.pos[0] + lx * c + lz * sn, p.pos[2] - lx * sn + lz * c]);
      }
  } else {
    for (let i = 0; i < 8; i++) pts.push([p.pos[0] + Math.cos((i / 8) * Math.PI * 2) * p.r, p.pos[2] + Math.sin((i / 8) * Math.PI * 2) * p.r]);
  }
  // a thin piece lying on top of something solid — a stripe painted on a stair
  // tread — is paint, so the thing it rests on counts as what stops her
  const rest = h <= 0.15 ? 0.12 : 0;
  const near = all.filter((b) => b.maxY > Math.max(bottom, BAND.y0) - rest && b.minY < Math.min(top, BAND.y1));
  let worst = 0;
  for (const [x, z] of pts) {
    let d = Infinity;
    for (const bx of near) {
      const dx = Math.max(bx.minX - x, 0, x - bx.maxX);
      const dz = Math.max(bx.minZ - z, 0, z - bx.maxZ);
      d = Math.min(d, Math.hypot(dx, dz));
      if (d === 0) break;
    }
    worst = Math.max(worst, d - SKIN);
  }
  if (worst <= FAIL_AT) continue;
  const key = `${p.kind} ${p.color} ${h.toFixed(1)}m at ${p.pos[1].toFixed(2)}`;
  const r = loose.get(key) ?? { n: 0, worst: 0, at: "" };
  r.n++;
  if (worst > r.worst) {
    r.worst = worst;
    r.at = `(${p.pos[0].toFixed(1)}, ${p.pos[2].toFixed(1)})`;
  }
  loose.set(key, r);
}
for (const [k, r] of loose) {
  fails++;
  console.log(`  FAIL ${k.padEnd(34)} x${String(r.n).padStart(3)}  ${r.worst.toFixed(2)}m in, worst at ${r.at}`);
}

console.log(fails ? `\n${fails} thing(s) she can walk into` : "\nnothing she can walk into");
if (fails) process.exitCode = 1;
