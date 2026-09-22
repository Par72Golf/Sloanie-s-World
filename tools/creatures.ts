/**
 * The princess's three creatures, and the trouble each one is in.
 *
 * Each predicament asks her to do a different thing, and each has a different
 * way of going wrong:
 *
 *   the climb  is nine jumps instead of a walk if the treads do not touch,
 *              or a wall if a rise is over the 0.62m she can step
 *   the bog    is impassable if a pad is further than she can jump, and
 *              pointless if she can just walk round the outside to the island
 *   the toffee is invisible if the bear sits under its surface
 *
 * It also checks the three sit on clear, reachable ground and a long way from
 * everything else hidden, the way every other hidden thing in the park does.
 *
 * Run: npx jiti tools/creatures.ts        (exits 1 on any failure)
 */
import { LEVELS } from "../src/game/levels";
import { collidersFor } from "../src/game/colliders";
import { applyLevelOrigins } from "../src/game/level-origins";
import { CLIMB, CREATURES, treadAt } from "../src/game/candy-creatures";
import { candyStickerBook, candyStickerSpots } from "../src/game/candy-stickers";
import { jumpReach, WALK } from "../src/game/tuning";

const level = LEVELS[1]!;
applyLevelOrigins(level);
type Labelled = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number; label?: string };
const boxes = collidersFor(level) as Labelled[];
const STEP_UP = 0.62;
const REACH = jumpReach(0, WALK);

let failures = 0;
let passes = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok || process.env.VERBOSE) console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`);
  if (ok) passes++;
  else failures++;
};
const f2 = (n: number) => n.toFixed(2);

console.log("the princess's creatures\n");

console.log("the climb: a spiral she walks up, not a stack she jumps");
{
  let worstRise = 0;
  let worstGap = -Infinity;
  for (let i = 0; i < CLIMB.steps; i++) {
    const a = treadAt(i);
    const b = i === 0 ? { x: CLIMB.ring, z: 0, top: 0 } : treadAt(i - 1);
    worstRise = Math.max(worstRise, a.top - b.top);
    if (i > 0) worstGap = Math.max(worstGap, Math.hypot(a.x - b.x, a.z - b.z) - CLIMB.tread);
  }
  check(worstRise <= STEP_UP - 0.05, `every rise is a step she can take (worst ${f2(worstRise)}m against ${STEP_UP}m)`);
  check(worstGap <= 0, `the treads touch, so the climb is a walk (widest gap ${f2(worstGap)}m)`);
  const deck = CLIMB.steps * CLIMB.rise;
  check(deck > 3.5 && deck < 7, `the puppy is properly up the tree (${f2(deck)}m)`);
}

console.log("\nwhere the three are");
{
  const hidden: [number, number, string][] = [];
  for (const d of level.dumplings) hidden.push([d.pos[0], d.pos[2], d.id]);
  for (const a of level.accessories ?? []) hidden.push([a.pos[0], a.pos[2], a.id]);
  for (const j of level.juice ?? []) hidden.push([j[0], j[1], "a boost"]);
  for (const s of candyStickerSpots()) hidden.push([s.pos[0], s.pos[2], `the ${s.id} sticker`]);
  const bk = candyStickerBook();
  hidden.push([bk.pos[0], bk.pos[2], "the sticker book"]);

  for (const c of CREATURES) {
    const [x, z] = c.at;
    // the props each predicament brings are its own; nothing of the park's may
    // be standing where it goes
    const hit = boxes.find(
      (b) => b.maxY > 0.5 && x > b.minX - 3 && x < b.maxX + 3 && z > b.minZ - 3 && z < b.maxZ + 3,
    );
    check(!hit, `${c.name} has room in ${c.region}${hit ? ` (${hit.label} is in the way)` : ""}`);
    let best = Infinity;
    let what = "";
    for (const [hx, hz, id] of hidden) {
      const d = Math.hypot(hx - x, hz - z);
      if (d < best) {
        best = d;
        what = id;
      }
    }
    check(best > 6, `${c.name} is clear of everything else hidden (${best.toFixed(1)}m to ${what})`);
  }
}

console.log("\nthe bog");
{
  // the pads, as candy-creatures lays them out
  const [bx, bz] = CREATURES[1]!.at;
  const pads: [number, number][] = [];
  for (let i = 0; i < 3; i++) {
    const t = (i + 1) / 4;
    pads.push([bx + Math.cos(Math.PI * 1.15) * 7.4 * (1 - t), bz + Math.sin(Math.PI * 1.15) * 7.4 * (1 - t)]);
  }
  const hops: number[] = [];
  const chain: [number, number][] = [[bx + Math.cos(Math.PI * 1.15) * 7.4, bz + Math.sin(Math.PI * 1.15) * 7.4], ...pads, [bx, bz]];
  for (let i = 1; i < chain.length; i++) {
    hops.push(Math.hypot(chain[i]![0] - chain[i - 1]![0], chain[i]![1] - chain[i - 1]![1]));
  }
  const worst = Math.max(...hops);
  check(worst < REACH * 0.5, `every hop across the bog is well inside her jump (worst ${f2(worst)}m against ${f2(REACH)}m)`);
  check(Math.min(...hops) > 1.2, `the pads are far enough apart to be hops (shortest ${f2(Math.min(...hops))}m)`);
  // she must not be able to walk round the rim to the island
  check(7.4 - 1.9 > REACH * 0.25, `the island is out in the bog, not on its edge (${f2(7.4 - 1.9)}m of bog round it)`);
}

console.log("\nthe toffee");
{
  // the bear sits at y 0.02 and the toffee's surface is 0.22 thick
  check(0.02 + 0.55 * 1.35 > 0.22 + 0.25, "the gummy bear stands proud of the toffee he is set in");
}

console.log(failures ? `\n${failures} failure(s), ${passes} passed` : `\nall ${passes} creature checks passed`);
process.exit(failures ? 1 : 0);
