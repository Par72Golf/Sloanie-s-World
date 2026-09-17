import type { BoxProp, Prop } from "./types";

/**
 * Placement helpers.
 *
 * Positions used to be hand-typed, which is how the park ended up with berms
 * sitting inside maze walls. Anything added now gets checked against what is
 * already there, and is skipped if there is genuinely no room.
 */

export type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };

/** 2D footprint of every prop that would block movement or look wrong overlapped. */
export function occupancy(props: Prop[], includeFlat = false): Rect[] {
  const out: Rect[] = [];
  for (const p of props) {
    if (p.kind === "box") {
      if (!includeFlat && p.collide === false) continue;
      const rot = (p.ry ?? 0) !== 0;
      const w = rot ? Math.max(p.size[0], p.size[2]) : p.size[0];
      const d = rot ? Math.max(p.size[0], p.size[2]) : p.size[2];
      out.push({
        minX: p.pos[0] - w / 2,
        maxX: p.pos[0] + w / 2,
        minZ: p.pos[2] - d / 2,
        maxZ: p.pos[2] + d / 2,
      });
    } else if (p.kind === "cyl") {
      if (!includeFlat && !p.collide) continue;
      out.push({ minX: p.pos[0] - p.r, maxX: p.pos[0] + p.r, minZ: p.pos[2] - p.r, maxZ: p.pos[2] + p.r });
    } else if (p.kind === "tree") {
      const s = (p.scale ?? 1) * 2.2;
      out.push({ minX: p.x - s, maxX: p.x + s, minZ: p.z - s, maxZ: p.z + s });
    } else if (p.kind === "house") {
      const w = (p.w ?? 6) / 2 + 1;
      const d = (p.d ?? 5) / 2 + 1;
      out.push({ minX: p.x - w, maxX: p.x + w, minZ: p.z - d, maxZ: p.z + d });
    } else if (p.kind === "lollipop") {
      out.push({ minX: p.x - 1, maxX: p.x + 1, minZ: p.z - 1, maxZ: p.z + 1 });
    } else if (p.kind === "tractor") {
      out.push({ minX: p.x - 2.5, maxX: p.x + 2.5, minZ: p.z - 2.5, maxZ: p.z + 2.5 });
    }
  }
  return out;
}

/**
 * Walkways only. Wide flat props (lawns, court aprons) are fine to build on,
 * but a berm dumped across a path looks like a mistake, because it is one.
 */
export function pathOccupancy(props: Prop[], maxSpan = 12): Rect[] {
  const out: Rect[] = [];
  for (const p of props) {
    if (p.kind !== "box") continue;
    if (p.collide !== false) continue;
    if (p.size[1] > 0.6) continue;
    const rot = (p.ry ?? 0) !== 0;
    const w = rot ? Math.max(p.size[0], p.size[2]) : p.size[0];
    const d = rot ? Math.max(p.size[0], p.size[2]) : p.size[2];
    if (Math.min(w, d) > maxSpan) continue;
    out.push({
      minX: p.pos[0] - w / 2,
      maxX: p.pos[0] + w / 2,
      minZ: p.pos[2] - d / 2,
      maxZ: p.pos[2] + d / 2,
    });
  }
  return out;
}

export function rectAt(x: number, z: number, w: number, d: number, pad = 0): Rect {
  return {
    minX: x - w / 2 - pad,
    maxX: x + w / 2 + pad,
    minZ: z - d / 2 - pad,
    maxZ: z + d / 2 + pad,
  };
}

export function hits(rects: Rect[], r: Rect): boolean {
  for (const o of rects) {
    if (r.minX < o.maxX && r.maxX > o.minX && r.minZ < o.maxZ && r.maxZ > o.minZ) return true;
  }
  return false;
}

/**
 * Look for a clear spot for a w x d footprint, starting at the preferred point
 * and spiralling outward. Returns null when nothing fits, which is a real
 * answer: better a missing berm than one buried in the maze.
 */
export function findClear(
  rects: Rect[],
  prefX: number,
  prefZ: number,
  w: number,
  d: number,
  opts?: { pad?: number; maxRadius?: number; step?: number; bounds?: Rect },
): [number, number] | null {
  const pad = opts?.pad ?? 1.5;
  const maxR = opts?.maxRadius ?? 26;
  const step = opts?.step ?? 2;
  const bounds = opts?.bounds;

  const ok = (x: number, z: number) => {
    const r = rectAt(x, z, w, d, pad);
    if (bounds && (r.minX < bounds.minX || r.maxX > bounds.maxX || r.minZ < bounds.minZ || r.maxZ > bounds.maxZ)) {
      return false;
    }
    return !hits(rects, r);
  };

  if (ok(prefX, prefZ)) return [prefX, prefZ];

  for (let radius = step; radius <= maxR; radius += step) {
    const samples = Math.max(8, Math.round((radius / step) * 8));
    for (let i = 0; i < samples; i++) {
      const a = (i / samples) * Math.PI * 2;
      const x = prefX + Math.cos(a) * radius;
      const z = prefZ + Math.sin(a) * radius;
      if (ok(x, z)) return [x, z];
    }
  }
  return null;
}

/** Perimeter wall with openings in the middle of each side, plus gate posts. */
export function gatedRing(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  color: string,
  gate = 13,
  postColor = "#a89878",
): BoxProp[] {
  const h = 1.5;
  const t = 0.5;
  const y = h / 2;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const out: BoxProp[] = [];

  const seg = (
    x: number,
    z: number,
    sx: number,
    sz: number,
  ): BoxProp => ({ kind: "box", pos: [x, y, z], size: [sx, h, sz], color, collide: true });

  const halfRunX = (maxX - minX - gate) / 4;
  const halfRunZ = (maxZ - minZ - gate) / 4;

  for (const z of [minZ, maxZ]) {
    out.push(seg(cx - gate / 2 - halfRunX * 2 + halfRunX, z, halfRunX * 2, t));
    out.push(seg(cx + gate / 2 + halfRunX, z, halfRunX * 2, t));
    // gate posts
    out.push({ kind: "box", pos: [cx - gate / 2, 1.1, z], size: [0.9, 2.2, 0.9], color: postColor, collide: true });
    out.push({ kind: "box", pos: [cx + gate / 2, 1.1, z], size: [0.9, 2.2, 0.9], color: postColor, collide: true });
    out.push({ kind: "box", pos: [cx - gate / 2, 2.35, z], size: [1.2, 0.3, 1.2], color: postColor, collide: false });
    out.push({ kind: "box", pos: [cx + gate / 2, 2.35, z], size: [1.2, 0.3, 1.2], color: postColor, collide: false });
  }

  for (const x of [minX, maxX]) {
    out.push(seg(x, cz - gate / 2 - halfRunZ, t, halfRunZ * 2));
    out.push(seg(x, cz + gate / 2 + halfRunZ, t, halfRunZ * 2));
    out.push({ kind: "box", pos: [x, 1.1, cz - gate / 2], size: [0.9, 2.2, 0.9], color: postColor, collide: true });
    out.push({ kind: "box", pos: [x, 1.1, cz + gate / 2], size: [0.9, 2.2, 0.9], color: postColor, collide: true });
    out.push({ kind: "box", pos: [x, 2.35, cz - gate / 2], size: [1.2, 0.3, 1.2], color: postColor, collide: false });
    out.push({ kind: "box", pos: [x, 2.35, cz + gate / 2], size: [1.2, 0.3, 1.2], color: postColor, collide: false });
  }

  return out;
}

/** Scatter clouds across a footprint without stacking them on each other. */
export function cloudField(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  count: number,
  seed = 1,
): Prop[] {
  const out: Prop[] = [];
  const placed: [number, number][] = [];
  let s = seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };

  let guard = 0;
  while (out.length < count && guard < count * 40) {
    guard++;
    const x = minX + rnd() * (maxX - minX);
    const z = minZ + rnd() * (maxZ - minZ);
    let clear = true;
    for (const [px, pz] of placed) {
      if (Math.hypot(px - x, pz - z) < 22) {
        clear = false;
        break;
      }
    }
    if (!clear) continue;
    placed.push([x, z]);
    out.push({
      kind: "cloud",
      pos: [x, 20 + rnd() * 14, z],
      scale: 0.9 + rnd() * 1.5,
    });
  }
  return out;
}
