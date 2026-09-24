/**
 * Places she can drop into and not get out of, anywhere in a park.
 *
 * The slot beside the ice cream mountain's second flight was one: open to the
 * sky, walled on every side higher than she can jump, and only reachable by
 * falling off something above it. She fell in on her first real climb and was
 * stuck there. This looks for every patch of ground like it.
 *
 * The ground is gridded at a quarter metre. A square is walkable when nothing
 * she would bump into stands on it (widened by her half-width); anything under
 * her 0.62m step-up she walks over. Flooding out from where she arrives finds
 * the park she can walk round. Every patch that flood never reaches is a
 * pocket. A pocket with a way out lower than she can jump (2.6m) is only
 * awkward, not a trap; one walled higher than that on every side, big enough
 * for her to land in, is reported with what walls it in.
 *
 * Run: LEVEL=1 npx jiti tools/traps.ts        (exits 1 on any trap)
 */
{
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
import { LEVELS } from "../src/game/levels";
import { applyLevelOrigins } from "../src/game/level-origins";
import { collidersFor } from "../src/game/colliders";
import { PLAYER_H, PLAYER_W } from "../src/game/tuning";

const LEVEL = Number(process.env.LEVEL ?? 0);
const level = LEVELS[LEVEL]!;
applyLevelOrigins(level);
const boxes = collidersFor(level) as (ReturnType<typeof collidersFor>[number] & { label?: string })[];
// her candy house is built by the runtime, not the park's props: add it at its
// biggest, the palace, which has the most walls to be caught between
if (level.id === "sugar") {
  const { makeCandyHouse } = await import("../src/game/candy-house");
  const { candyHouseSpots } = await import("../src/game/sugar-home");
  const [dx, dz] = candyHouseSpots().door;
  const hx = dx;
  const hz = dz - (await import("../src/game/candy-house")).CANDY_HOUSE.d / 2 - 1.4;
  for (const bx of makeCandyHouse(5).userData.boxes as typeof boxes)
    boxes.push({ ...bx, minX: bx.minX + hx, maxX: bx.maxX + hx, minZ: bx.minZ + hz, maxZ: bx.maxZ + hz, label: "her candy house" } as (typeof boxes)[number]);
}

const CELL = 0.25;
const STEP = 0.62;
/** from a standing start she clears about 2.7m; a wall lower than this she gets over */
const JUMP_OUT = 2.6;
/** a pocket she cannot fit in, or only just, is not somewhere she can land */
const MIN_CELLS = 16;

const b = level.bounds;
const W = Math.ceil((b.maxX - b.minX) / CELL);
const H = Math.ceil((b.maxZ - b.minZ) / CELL);
const blocked = new Uint8Array(W * H);
/** the tallest thing blocking each square, and which box it is */
const topAt = new Float32Array(W * H);
const who = new Int32Array(W * H).fill(-1);

boxes.forEach((bx, k) => {
  // only what she would bump into standing on the ground
  if (bx.maxY <= STEP || bx.minY >= PLAYER_H) return;
  const x0 = Math.max(0, Math.floor((bx.minX - PLAYER_W - b.minX) / CELL));
  const x1 = Math.min(W - 1, Math.floor((bx.maxX + PLAYER_W - b.minX) / CELL));
  const z0 = Math.max(0, Math.floor((bx.minZ - PLAYER_W - b.minZ) / CELL));
  const z1 = Math.min(H - 1, Math.floor((bx.maxZ + PLAYER_W - b.minZ) / CELL));
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      const i = z * W + x;
      blocked[i] = 1;
      if (bx.maxY > topAt[i]!) {
        topAt[i] = bx.maxY;
        who[i] = k;
      }
    }
  }
});

// water she cannot stand in counts as blocked too
for (const w of level.water ?? []) {
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      const cx = b.minX + (x + 0.5) * CELL;
      const cz = b.minZ + (z + 0.5) * CELL;
      if (Math.hypot(cx - w.x, cz - w.z) < w.r) blocked[z * W + x] = 2;
    }
  }
}

const comp = new Int32Array(W * H).fill(-1);
const flood = (start: number, id: number) => {
  const q = [start];
  comp[start] = id;
  let n = 0;
  while (q.length) {
    const i = q.pop()!;
    n++;
    const x = i % W;
    const z = (i / W) | 0;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const j = nz * W + nx;
      if (blocked[j] || comp[j] >= 0) continue;
      comp[j] = id;
      q.push(j);
    }
  }
  return n;
};

const [sx, , sz] = level.spawn;
const si = Math.floor((sz - b.minZ) / CELL) * W + Math.floor((sx - b.minX) / CELL);
const main = flood(si, 0);
console.log(`${level.name}: ${main} walkable squares reached from where she arrives`);

let traps = 0;
let pockets = 0;
let id = 1;
for (let i = 0; i < W * H; i++) {
  if (blocked[i] || comp[i] >= 0) continue;
  const size = flood(i, id);
  const me = id++;
  if (size < MIN_CELLS) continue;
  // the walls round it: the lowest is the way out
  let lowest = Infinity;
  const walls = new Set<string>();
  let cx = 0;
  let cz = 0;
  let edge = false;
  for (let j = 0; j < W * H; j++) {
    if (comp[j] !== me) continue;
    const x = j % W;
    const z = (j / W) | 0;
    cx += x;
    cz += z;
    if (x === 0 || z === 0 || x === W - 1 || z === H - 1) edge = true;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const k = nz * W + nx;
      if (!blocked[k]) continue;
      if (blocked[k] === 2) {
        // wading out of water is always possible
        lowest = 0;
        continue;
      }
      lowest = Math.min(lowest, topAt[k]!);
      if (who[k]! >= 0) walls.add(boxes[who[k]!]!.label ?? "?");
    }
  }
  // the strip outside the park's own wall: the edge of the world, not a pocket
  if (edge) continue;
  const px = b.minX + (cx / size + 0.5) * CELL;
  const pz = b.minZ + (cz / size + 0.5) * CELL;
  pockets++;
  const area = size * CELL * CELL;
  const trapped = lowest > JUMP_OUT;
  if (trapped) traps++;
  if (trapped || process.env.VERBOSE) {
    console.log(
      `  ${trapped ? "TRAP" : "ok  "} ${area.toFixed(1)}m² at (${px.toFixed(1)}, ${pz.toFixed(1)}), lowest way out ${lowest.toFixed(2)}m, walled by ${[...walls].slice(0, 5).join(", ")}`,
    );
  }
}
console.log(traps ? `\n${traps} trap(s) in ${pockets} pocket(s)` : `\nno traps (${pockets} pocket(s), all with a way out)`);
process.exit(traps ? 1 : 0);
