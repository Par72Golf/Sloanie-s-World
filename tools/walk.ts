/**
 * Invisible-wall detector.
 *
 * Walks her through the real collision code (collision.ts, pure) along
 * straight lines across the park and reports every place she stalls where
 * nothing tall enough to justify it is in the way: the blocking box's top is
 * within the 0.62m step-up of her feet. Those are walls she cannot see.
 *
 * Both reports from 16 Sept 2026 ("near the four walking paths by spawn",
 * "near first base") were 2cm ledges the collision code refused to step onto.
 *
 * Run: npx jiti tools/walk.ts            (whole park, coarse grid)
 *      npx jiti tools/walk.ts 0 22 12    (12m around a point, fine grid)
 */
import { LEVELS } from "../src/game/levels";
import { collidersFor } from "../src/game/colliders";
import { moveAndCollide, type AABB, type Capsule } from "../src/game/collision";
import { PLAYER_H, PLAYER_W, WALK } from "../src/game/tuning";

const level = LEVELS[0]!;
const boxes = collidersFor(level);
const [xs, zs, rs] = process.argv.slice(2);
const focus = xs != null ? { x: Number(xs), z: Number(zs ?? 0), r: Number(rs ?? 10) } : null;

const DT = 1 / 60;
const STEP_UP = 0.62;

type Stall = { x: number; z: number; dir: string; top: number; label: string };
const stalls: Stall[] = [];
const seen = new Set<string>();

/**
 * The box that actually stopped her: overlaps where she was trying to go,
 * sits above floor tolerance and below her head. Tallest wins, because that
 * is the one the step-up would have had to clear.
 */
function blocker(c: Capsule, dx: number, dz: number): AABB | null {
  const nx = c.x + dx * 0.2;
  const nz = c.z + dz * 0.2;
  let best: AABB | null = null;
  for (const b of boxes) {
    if (nx - c.hw >= b.maxX || nx + c.hw <= b.minX || nz - c.hd >= b.maxZ || nz + c.hd <= b.minZ) continue;
    if (b.maxY - c.y <= 0.03) continue;
    if (b.minY >= c.y + c.h) continue;
    if (!best || b.maxY > best.maxY) best = b;
  }
  return best;
}

/** Drop her onto whatever is under the start point. */
function settle(c: Capsule) {
  c.y = 0;
  for (let i = 0; i < 4; i++) moveAndCollide(c, 0, -1, 0, boxes, DT, level.groundY);
}

function walk(x0: number, z0: number, dx: number, dz: number, metres: number) {
  const c: Capsule = { x: x0, y: 0, z: z0, hw: PLAYER_W, h: PLAYER_H, hd: PLAYER_W };
  settle(c);
  const vx = dx * WALK;
  const vz = dz * WALK;
  const steps = Math.ceil(metres / (WALK * DT));
  let vy = 0;
  for (let i = 0; i < steps; i++) {
    const px = c.x;
    const pz = c.z;
    const r = moveAndCollide(c, vx, vy, vz, boxes, DT, level.groundY);
    vy = r.vy - 23 * DT;
    const moved = Math.hypot(c.x - px, c.z - pz);
    const expected = WALK * DT;
    // Airborne contact is not a wall: stepping off one block into the side of
    // the next stalls her for a frame or two until she lands and steps up.
    if (moved < expected * 0.3 && r.grounded) {
      const b = blocker(c, dx, dz);
      const top = b ? b.maxY : level.groundY;
      // no room to stand up on it (a bench under a dugout roof): the step-up
      // rightly refuses, and she can see why, so it isn't an invisible wall
      const overhead =
        b &&
        boxes.some(
          (o) =>
            o !== b &&
            o.minY < b.maxY + c.h &&
            o.maxY > b.maxY + 0.03 &&
            c.x + dx * 0.4 + c.hw > o.minX &&
            c.x + dx * 0.4 - c.hw < o.maxX &&
            c.z + dz * 0.4 + c.hd > o.minZ &&
            c.z + dz * 0.4 - c.hd < o.maxZ,
        );
      if (top - c.y <= STEP_UP && !overhead) {
        const key = `${Math.round(c.x)},${Math.round(c.z)}`;
        if (!seen.has(key)) {
          seen.add(key);
          stalls.push({
            x: c.x,
            z: c.z,
            dir: `${dx > 0 ? "+x" : dx < 0 ? "-x" : ""}${dz > 0 ? "+z" : dz < 0 ? "-z" : ""}`,
            top,
            label: b ? `${(b as { label?: string }).label ?? "box"} top ${b.maxY.toFixed(2)}` : "ground",
          });
        }
      }
      return; // blocked, legitimately or not; stop this line
    }
  }
}

const b = level.bounds;
const dirs = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

if (focus) {
  for (let x = focus.x - focus.r; x <= focus.x + focus.r; x += 0.5) {
    for (let z = focus.z - focus.r; z <= focus.z + focus.r; z += 0.5) {
      for (const [dx, dz] of dirs) walk(x, z, dx, dz, 1.5);
    }
  }
} else {
  for (let x = b.minX + 2; x <= b.maxX - 2; x += 2) {
    for (let z = b.minZ + 2; z <= b.maxZ - 2; z += 2) {
      for (const [dx, dz] of dirs) walk(x, z, dx, dz, 2.5);
    }
  }
}

stalls.sort((a, c) => a.x - c.x || a.z - c.z);
console.log(`${level.name}: ${stalls.length} invisible-wall stall${stalls.length === 1 ? "" : "s"}${focus ? ` within ${focus.r}m of (${focus.x}, ${focus.z})` : ""}`);
for (const s of stalls.slice(0, 40)) {
  console.log(`  (${s.x.toFixed(1)}, ${s.z.toFixed(1)}) walking ${s.dir}: stopped by ${s.label}`);
}
if (stalls.length > 40) console.log(`  ... and ${stalls.length - 40} more`);
process.exit(stalls.length ? 1 : 0);
