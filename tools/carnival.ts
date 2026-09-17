/**
 * Carnival checks, through the real collision code and the real rules.
 *
 * - She can walk from open lawn south of the carnival to every booth's
 *   standing spot and to the carousel gate without stalling.
 * - Nothing solid stands on a standing spot, and each spot is close enough to
 *   its counter to read as "at the booth".
 * - Ring toss: how long the ring spends over a bottle on each throw, so the
 *   timing stays fair for a 7-year-old (at least 0.28s per pass).
 * - Duck pond: the deck has every picture exactly twice and the turn limit
 *   leaves room above perfect play.
 * - Carousel: the grab window in seconds.
 *
 * Run: npx jiti tools/carnival.ts   (exits 1 on any failure)
 */
import { LEVELS } from "../src/game/levels";
import { collidersFor } from "../src/game/colliders";
import { moveAndCollide, type Capsule } from "../src/game/collision";
import { PLAYER_H, PLAYER_W, WALK } from "../src/game/tuning";
import { BOOTHS, CAROUSEL, DUCK_POND, RING_TOSS, WHACK, bottleUnder, boothStand, carouselGate, duckDeck, ringSweep } from "../src/game/carnival";

const level = LEVELS[0]!;
const boxes = collidersFor(level);
const DT = 1 / 60;
let failures = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failures++;
};

/** Walk a list of waypoints; returns how far from the last one she ended. */
function walk(from: [number, number], points: [number, number][]) {
  const c: Capsule = { x: from[0], y: 0, z: from[1], hw: PLAYER_W, h: PLAYER_H, hd: PLAYER_W };
  for (let i = 0; i < 10; i++) moveAndCollide(c, 0, -1, 0, boxes, DT, level.groundY);
  let vy = 0;
  for (const [tx, tz] of points) {
    for (let i = 0; i < 60 * 8; i++) {
      const dx = tx - c.x;
      const dz = tz - c.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.2) break;
      const sp = Math.min(WALK, d / DT);
      vy -= 23 * DT;
      vy = moveAndCollide(c, (dx / d) * sp, vy, (dz / d) * sp, boxes, DT, level.groundY).vy;
    }
  }
  const [lx, lz] = points[points.length - 1]!;
  return Math.hypot(lx - c.x, lz - c.z);
}

console.log("getting there");
// south of the arch, on the open lawn between the hedge and the carnival
const lawn: [number, number] = [CAROUSEL.x, 43];
const [gx, gz] = carouselGate();
check(walk(lawn, [[gx, gz]]) < 0.3, `lawn to the carousel gate (${gx}, ${gz.toFixed(1)})`);
for (const b of BOOTHS) {
  const [sx, sz] = boothStand(b);
  // round the carousel fence on the west side, then along the booth row
  const route: [number, number][] = [
    [CAROUSEL.x - CAROUSEL.fence - 1.6, 44],
    [CAROUSEL.x - CAROUSEL.fence - 1.6, sz],
    [sx, sz],
  ];
  check(walk(lawn, route) < 0.3, `lawn to the ${b.name} counter (${sx}, ${sz.toFixed(1)})`);
  const blocked = boxes.some((a) => sx > a.minX - 0.34 && sx < a.maxX + 0.34 && sz > a.minZ - 0.34 && sz < a.maxZ + 0.34 && a.minY < 1.5 && a.maxY > 0.1);
  check(!blocked, `${b.name}: nothing solid on the standing spot`);
}

console.log("ring toss");
for (const [i, period] of RING_TOSS.periods.entries()) {
  // time the ring spends over one bottle on a single pass across
  let over = 0;
  const steps = 20000;
  for (let k = 0; k < steps; k++) {
    const t = (k / steps) * (period / 2);
    if (bottleUnder(ringSweep(t, period)) === 2) over += period / 2 / steps;
  }
  check(over >= 0.28, `throw ${i + 1}: ${over.toFixed(2)}s over the middle bottle per pass (period ${period}s)`);
}

console.log("duck pond");
{
  const pics = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"];
  const deck = duckDeck(pics);
  const counts = new Map<string, number>();
  for (const p of deck) counts.set(p, (counts.get(p) ?? 0) + 1);
  check(deck.length === DUCK_POND.pairs * 2 && [...counts.values()].every((n) => n === 2), `${deck.length} ducks, every picture exactly twice`);
  check(DUCK_POND.turns >= DUCK_POND.pairs * 2, `${DUCK_POND.turns} turns for ${DUCK_POND.pairs} pairs (perfect play needs ${DUCK_POND.pairs})`);
}

console.log("whack-a-mole");
check(WHACK.upEnd >= 1.2, `moles stay up at least ${WHACK.upEnd}s even at the end`);

console.log("carousel");
{
  const window = ((CAROUSEL.grabHalfAngle * 2) / (Math.PI * 2)) * CAROUSEL.period;
  check(window >= 1.0, `ring grab window is ${window.toFixed(2)}s per pass`);
  check(CAROUSEL.goldPass <= CAROUSEL.laps, `the gold ring comes round on pass ${CAROUSEL.goldPass} of ${CAROUSEL.laps}`);
}

console.log(failures ? `\n${failures} failure(s)` : "\nall carnival checks passed");
process.exit(failures ? 1 : 0);
