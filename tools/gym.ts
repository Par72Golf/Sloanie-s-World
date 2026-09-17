/**
 * Ninja course playability, through the real collision code.
 *
 * Proves the things a 7-year-old will try: walking up the climbing wall onto
 * the tower deck, walking onto a trampoline and being launched (and that a
 * tap before landing gives the big bounce), and hopping along the stepping
 * posts to the top of the tall one. The bounce rule here mirrors the one in
 * runtime.ts physics(): grounded at TRAMPOLINE_TOP inside a mat footprint.
 *
 * Run: npx jiti tools/gym.ts   (exits 1 on any failure)
 */
import { LEVELS } from "../src/game/levels";
import { collidersFor } from "../src/game/colliders";
import { moveAndCollide, type Capsule } from "../src/game/collision";
import { BOUNCE, GRAVITY, JUMP, PLAYER_H, PLAYER_W, SUPER_BOUNCE, TRAMPOLINE_TOP, WALK } from "../src/game/tuning";

const level = LEVELS[0]!;
const boxes = collidersFor(level);
const DT = 1 / 60;
const GYM = { x: 8, z: 136 };
const mats = level.props.filter((p) => p.kind === "trampoline") as { x: number; z: number; w: number; d: number }[];

let failures = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failures++;
};

type Opts = { jumpAt?: (c: Capsule, grounded: boolean) => boolean; bounceTap?: boolean };
function run(x: number, z: number, dirX: number, dirZ: number, seconds: number, opts: Opts = {}) {
  const c: Capsule = { x, y: 0, z, hw: PLAYER_W, h: PLAYER_H, hd: PLAYER_W };
  for (let i = 0; i < 5; i++) moveAndCollide(c, 0, -1, 0, boxes, DT, level.groundY);
  let vy = 0;
  let grounded = true;
  let peak = 0;
  let bounces = 0;
  let maxStep = 0;
  let stoodAt = 0;
  for (let i = 0; i < seconds * 60; i++) {
    if (grounded && opts.jumpAt?.(c, grounded)) vy = JUMP;
    vy -= GRAVITY * DT;
    const px = c.x;
    const pz = c.z;
    const r = moveAndCollide(c, dirX * WALK, vy, dirZ * WALK, boxes, DT, level.groundY);
    vy = r.vy;
    grounded = r.grounded;
    maxStep = Math.max(maxStep, Math.hypot(c.x - px, c.z - pz));
    if (grounded && Math.abs(c.y - TRAMPOLINE_TOP) < 0.08) {
      const on = mats.some((m) => Math.abs(c.x - m.x) <= m.w / 2 && Math.abs(c.z - m.z) <= m.d / 2);
      if (on) {
        vy = opts.bounceTap ? SUPER_BOUNCE : BOUNCE;
        grounded = false;
        bounces++;
      }
    }
    peak = Math.max(peak, c.y);
    if (grounded) stoodAt = Math.max(stoodAt, c.y);
  }
  return { c, peak, bounces, maxStep, stoodAt };
}

console.log("climbing tower");
{
  const r = run(GYM.x + 3.5, GYM.z - 1, 1, 0, 3);
  check(r.stoodAt >= 2.39, `walking east up the climbing wall stands on the deck (${r.stoodAt.toFixed(2)}m, deck 2.40m)`);
  check(r.maxStep < 0.5, `no teleport on the way up (largest move ${r.maxStep.toFixed(2)}m in a frame)`);
}

console.log("trampolines");
for (const m of mats) {
  const walk = run(m.x - m.w / 2 - 2, m.z, 1, 0, 1.2, {});
  check(walk.bounces > 0, `walking onto the mat at (${m.x}, ${m.z}) bounces her (${walk.bounces} bounces)`);
  // stand in the middle and let it bounce
  const still = run(m.x, m.z, 0, 0, 4, {});
  const expect = (BOUNCE * BOUNCE) / (2 * GRAVITY) + TRAMPOLINE_TOP;
  check(Math.abs(still.peak - expect) < 0.3, `a normal bounce peaks near ${expect.toFixed(1)}m (got ${still.peak.toFixed(2)}m)`);
  const big = run(m.x, m.z, 0, 0, 4, { bounceTap: true });
  check(big.peak > still.peak + 1.5, `a tapped bounce goes higher (${big.peak.toFixed(2)}m)`);
  check(still.bounces >= 3, `keeps bouncing while she stands on it (${still.bounces} in 4s)`);
}

console.log("stepping posts");
{
  const posts = level.props.filter(
    (p) => p.kind === "cyl" && Math.abs(p.pos[2] - (GYM.z + 0.2)) < 0.01 && p.collide !== false,
  ) as { pos: [number, number, number]; h: number }[];
  const tallest = Math.max(...posts.map((p) => p.h));
  // hop whenever the next post is taller than a step-up
  // stop just past the tallest post, before the climbing tower beyond it
  const tallX = posts.find((p) => p.h === tallest)!.pos[0];
  const secs = (tallX + 0.3 - (GYM.x - 5.4)) / WALK;
  const walked = run(GYM.x - 5.4, GYM.z + 0.2, 1, 0, secs);
  check(walked.stoodAt >= tallest - 0.01, `just walking east climbs onto the tallest post (stood at ${walked.stoodAt.toFixed(2)}m of ${tallest}m)`);
  const hopped = run(GYM.x - 5.4, GYM.z + 0.2, 1, 0, secs, { jumpAt: () => true });
  check(hopped.stoodAt >= tallest - 0.01, `jumping the whole way still lands on it (stood at ${hopped.stoodAt.toFixed(2)}m)`);
}

console.log(failures ? `\n${failures} failure(s)` : "\nall ninja course checks passed");
process.exit(failures ? 1 : 0);
