/**
 * Jump stress test. Runs hundreds of random run-and-jump attempts at the
 * park's stepped structures (berms, stairs, the maze, the playground) through
 * the real collision code and fails if she ever moves more than 2m sideways
 * in a single frame. That is the "reset" a player feels when an axis sweep
 * pushes her out through the far face of a long box.
 *
 * Found 16 Sept 2026: 85 teleport frames in 600 jumps at the berm by the ball
 * diamond, worst 21m. Fixed by only resolving a sweep against faces she
 * actually crossed that step.
 *
 * Run: npx jiti tools/jump.ts
 */
import { LEVELS } from "../src/game/levels";
import { collidersFor } from "../src/game/colliders";
import { moveAndCollide, type Capsule } from "../src/game/collision";
import { PLAYER_H, PLAYER_W, JUMP, GRAVITY, WALK } from "../src/game/tuning";

const level = LEVELS[0]!;
const boxes = collidersFor(level);
const DT = 1 / 60;
let seed = 5;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

// tall or stepped things worth throwing her at
const targets: [string, number, number][] = [
  ["berm south-west", -44, -78],
  ["berm south-east", 40, -78],
  ["berm north-west", -40, 78],
  ["berm east", 78, 40],
  ["treehouse stairs", 54.2, -45],
  ["lookout stairs", -27, 56],
  ["maze", -42, -18],
  ["climbing tower", -90, -32],
  ["ferris platform", 30, 63],
  ["campground", 128, 128],
  ["ninja course", 8, 136],
  ["farm tractor", -54, -121],
  ["carnival", -16, 55],
];

let teleports = 0;
let worst = 0;
let worstCase = "";
let trials = 0;
for (const [name, tx, tz] of targets) {
  for (let trial = 0; trial < 120; trial++) {
    trials++;
    const angle = rand() * Math.PI * 2;
    const dist = 6 + rand() * 12;
    const c: Capsule = { x: tx + Math.cos(angle) * dist, y: 0, z: tz + Math.sin(angle) * dist, hw: PLAYER_W, h: PLAYER_H, hd: PLAYER_W };
    for (let i = 0; i < 5; i++) moveAndCollide(c, 0, -1, 0, boxes, DT, level.groundY);
    const toward = Math.atan2(tz - c.z, tx - c.x) + (rand() - 0.5) * 1.4;
    const vx = Math.cos(toward) * WALK;
    const vz = Math.sin(toward) * WALK;
    let vy = 0;
    let grounded = true;
    let prevX = c.x;
    let prevZ = c.z;
    for (let i = 0; i < 120; i++) {
      if (grounded && rand() < 0.08) vy = JUMP;
      vy -= GRAVITY * DT;
      const r = moveAndCollide(c, vx, vy, vz, boxes, DT, level.groundY);
      vy = r.vy;
      grounded = r.grounded;
      const step = Math.hypot(c.x - prevX, c.z - prevZ);
      if (step > 2) teleports++;
      if (step > worst) {
        worst = step;
        worstCase = `${name}, trial ${trial}, frame ${i}: (${prevX.toFixed(1)}, ${prevZ.toFixed(1)}) -> (${c.x.toFixed(1)}, ${c.z.toFixed(1)}) at y ${c.y.toFixed(2)}`;
      }
      prevX = c.x;
      prevZ = c.z;
    }
  }
}
console.log(`${trials} jump runs, ${teleports} teleport frame(s); worst single-frame move ${worst.toFixed(2)}m`);
if (worst > 0.5) console.log(`  ${worstCase}`);
process.exit(teleports ? 1 : 0);
