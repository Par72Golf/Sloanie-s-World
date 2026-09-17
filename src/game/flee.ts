/**
 * Where a dumpling runs to after two wrong answers. Pure, so
 * tools/flee.ts can drive it headless over thousands of random runs.
 */

type V3 = [number, number, number];

/** The new spot is at least this far from her... */
export const FLEE_FROM_PLAYER = 16;
/** ...this far from where it was hiding... */
export const FLEE_FROM_CURRENT = 12;
/** ...this far from any other dumpling, and from any spot she has cleared... */
export const FLEE_CLEAR = 4.5;
/** ...and this far from the spawn, so it never re-hides beside the start. */
export const FLEE_FROM_SPAWN = 25;

/**
 * @param spots    authored hiding spots to run to: every dumpling's home and
 *                 alternate spots, minus the homes of dumplings she has collected
 * @param cleared  homes and found spots of dumplings she HAS collected
 * @param occupied where the other uncollected dumplings are now
 */
export function pickFleePos(
  spots: V3[],
  cleared: V3[],
  occupied: V3[],
  playerX: number,
  playerZ: number,
  current: V3,
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  spawn: V3,
): V3 {
  const farFromSpawn = (x: number, z: number) => Math.hypot(x - spawn[0], z - spawn[2]) >= FLEE_FROM_SPAWN;
  // Never run to a spot high in the air (the top of the ferris wheel is only
  // reachable at one moment of a ride), and only nudge ground-level spots:
  // shifting a raised spot sideways leaves the dumpling floating off its ledge.
  spots = spots.filter((h) => h[1] < 10);
  const order = spots.map((_, i) => i).sort(() => Math.random() - 0.5);
  for (const i of order) {
    const h = spots[i]!;
    const nudge = h[1] < 1.2 ? 5 : 0;
    const x = h[0] + (Math.random() - 0.5) * nudge;
    const z = h[2] + (Math.random() - 0.5) * nudge;
    const cx = Math.min(bounds.maxX - 3, Math.max(bounds.minX + 3, x));
    const cz = Math.min(bounds.maxZ - 3, Math.max(bounds.minZ + 3, z));
    if (Math.hypot(cx - playerX, cz - playerZ) < FLEE_FROM_PLAYER) continue;
    if (Math.hypot(cx - current[0], cz - current[2]) < FLEE_FROM_CURRENT) continue;
    if (!farFromSpawn(cx, cz)) continue;
    if (occupied.some((o) => Math.hypot(cx - o[0], cz - o[2]) < FLEE_CLEAR)) continue;
    if (cleared.some((o) => Math.hypot(cx - o[0], cz - o[2]) < FLEE_CLEAR)) continue;
    return [cx, h[1], cz];
  }
  // Nothing qualified (she is standing among the last few, or a small park
  // with no alternate spots). Take the spot farthest from her, relaxing one
  // rule at a time: first the distance from her, then a cleared spot, then
  // the spawn; a free spot is kept over stacking two dumplings together for
  // as long as one exists.
  const free = (h: V3) => !occupied.some((o) => Math.hypot(h[0] - o[0], h[2] - o[2]) < FLEE_CLEAR);
  const uncleared = (h: V3) => !cleared.some((o) => Math.hypot(h[0] - o[0], h[2] - o[2]) < FLEE_CLEAR);
  const far = (h: V3) => farFromSpawn(h[0], h[2]);
  const moved = (h: V3) => Math.hypot(h[0] - current[0], h[2] - current[2]) >= FLEE_FROM_CURRENT;
  const pools = [
    spots.filter((h) => far(h) && free(h) && uncleared(h) && moved(h)),
    [...spots, ...cleared].filter((h) => far(h) && free(h) && moved(h)),
    [...spots, ...cleared].filter(far),
    spots,
  ];
  for (const pool of pools) {
    let best: V3 | null = null;
    let bestD = -1;
    for (const h of pool) {
      const dist = Math.hypot(h[0] - playerX, h[2] - playerZ);
      if (dist > bestD) {
        bestD = dist;
        best = h;
      }
    }
    if (best) return [best[0], best[1], best[2]];
  }
  return [current[0], current[1], current[2]];
}
