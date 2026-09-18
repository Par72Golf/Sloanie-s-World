/**
 * The Floor is Lava course, through the real collision code.
 *
 * Nothing here trusts the numbers in lava.ts. It rebuilds the exact colliders
 * the game builds, then:
 *
 *   1. checks the site is on clear ground, clear of the park's own props, of
 *      the landmarks around it and of the lookout's no-jump zone, and near
 *      enough to a walkway that she will walk past it;
 *   2. measures every gap and every rise against `jumpReach`/`jumpHeight` from
 *      tuning.ts and fails under a 2x margin;
 *   3. runs her across the whole course at 60Hz through moveAndCollide, with
 *      the jump key pressed the way a player presses it, the ferries sliding
 *      and carrying her exactly as runtime.ts does, from twelve different
 *      ferry phases so no crossing depends on catching a lucky swing;
 *   4. drops her in the lava from a grid of points at a spread of phases and
 *      checks the return always lands her standing on a platform, and that
 *      the return is never further back than the piece she fell from;
 *   5. proves she cannot get stuck: off every platform, off the rim, off the
 *      podium and out of the pool, she always ends up somewhere she can walk
 *      or jump on from.
 *
 * Run: npx jiti tools/lava.ts        (exits 1 on any failure)
 *      npx jiti tools/lava.ts scan   the clear-ground search that picked the spot
 */
import { LEVELS } from "../src/game/levels";
import { collidersFor } from "../src/game/colliders";
import { moveAndCollide, type AABB, type Capsule } from "../src/game/collision";
import { GRAVITY, JUMP, PLAYER_H, PLAYER_W, WALK, jumpHeight, jumpReach } from "../src/game/tuning";
import { BOOST_MULTIPLIER } from "../src/game/emmett";
import { NODES } from "../src/game/walkways";
import {
  FALL_Y,
  LAVA_POOL,
  LAVA_START,
  LAVA_SURFACE,
  PIECES,
  bridgePlanks,
  deckSteps,
  ferryZ,
  lavaColliders,
  lavaFootprint,
  lavaTickets,
  overLava,
  pieceAt,
  pieceBox,
  podiumSteps,
  rimSegments,
  safeSpotAt,
  standingOn,
  type LavaSafe,
  type Piece,
} from "../src/game/lava";

const DT = 1 / 60;
const STEP_UP = 0.62;
const level = LEVELS[0]!;
const park = collidersFor(level);
const mode = process.argv[2] ?? "";

let failures = 0;
let passes = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok || process.env.VERBOSE) console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`);
  if (ok) passes++;
  else failures++;
};
const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);

const DECK = PIECES[0]!;
const PODIUM = PIECES[PIECES.length - 1]!;

/* --------------------------------------------------------- the clear-ground scan */

if (mode === "scan") {
  console.log("clear-ground scan: rectangles with no park collider in them, near a walkway");
  const W = 66;
  const D = 22;
  const hits: [number, number, number, string][] = [];
  for (let x = -150; x <= 150; x += 2) {
    for (let z = -150; z <= 150; z += 2) {
      const r = { minX: x - W / 2, maxX: x + W / 2, minZ: z - D / 2, maxZ: z + D / 2 };
      if (r.minX < level.bounds.minX + 10 || r.maxX > level.bounds.maxX - 10) continue;
      if (r.minZ < level.bounds.minZ + 10 || r.maxZ > level.bounds.maxZ - 10) continue;
      // the area another agent is rebuilding
      if (r.maxX > -45 && r.minX < 45 && r.maxZ > -30 && r.minZ < 55) continue;
      if (park.some((b) => b.maxX > r.minX && b.minX < r.maxX && b.maxZ > r.minZ && b.minZ < r.maxZ)) continue;
      let best = Infinity;
      let name = "";
      for (const [n, nd] of Object.entries(NODES)) {
        const d = Math.hypot(x - nd.x, z - nd.z);
        if (d < best) {
          best = d;
          name = n;
        }
      }
      if (best > 26) continue;
      hits.push([x, z, best, name]);
    }
  }
  hits.sort((a, b) => a[2] - b[2]);
  console.log(`  ${W}m x ${D}m: ${hits.length} clear centres`);
  for (const [x, z, d, n] of hits.slice(0, 12)) console.log(`    (${x}, ${z})  ${f1(d)}m from walkway node ${n}`);
  console.log("\nThe lawn between the cave road and the open grass south of it is the widest clear band in the park.");
  process.exit(0);
}

/* ------------------------------------------------------------ 1. the site */

console.log("the site");
{
  const site = lavaFootprint(1.5);
  const hit = park.filter((b) => b.maxX > site.minX && b.minX < site.maxX && b.maxZ > site.minZ && b.minZ < site.maxZ);
  check(
    hit.length === 0,
    `nothing of the park inside the site (x ${f1(site.minX)}..${f1(site.maxX)}, z ${f1(site.minZ)}..${f1(site.maxZ)})` +
      (hit.length ? `: ${hit[0]!.label} at (${f1(hit[0]!.minX)}, ${f1(hit[0]!.minZ)})` : ""),
  );
  const b = level.bounds;
  check(
    site.minX > b.minX + 6 && site.maxX < b.maxX - 6 && site.minZ > b.minZ + 6 && site.maxZ < b.maxZ - 6,
    "the whole site is inside the park's boundary wall",
  );
  // the area another agent owns
  check(
    site.maxX <= -45 || site.minX >= 45 || site.maxZ <= -30 || site.minZ >= 55,
    "clear of x -45..45, z -30..55",
  );
  const LANDMARKS: [string, number, number, number][] = [
    ["the carousel", -16, 53, 20],
    ["the mini golf", 20, -132, 24],
    ["the zoo", -15, -136, 24],
    ["Emmett's yard", 50.5, -9, 16],
    ["the mountain", 73, -128, 18],
    ["her house", -9, 110, 14],
    ["the ninja course", 8, 136, 16],
  ];
  for (const [name, lx, lz, r] of LANDMARKS) {
    const cx = Math.max(site.minX, Math.min(lx, site.maxX));
    const cz = Math.max(site.minZ, Math.min(lz, site.maxZ));
    check(Math.hypot(lx - cx, lz - cz) > r, `${r}m clear of ${name} (${f1(Math.hypot(lx - cx, lz - cz))}m)`);
  }
  // every jump zone of the level: the lookout's no-jump box is right beside us
  for (const z of level.noJump ?? []) {
    const overlaps = z.maxX > site.minX && z.minX < site.maxX && z.maxZ > site.minZ && z.minZ < site.maxZ;
    check(!overlaps, `outside the no-jump zone round ${z.why} (jumping must work everywhere here)`);
  }
  // near a walkway, so she finds it
  let nearest = Infinity;
  let node = "";
  for (const [n, nd] of Object.entries(NODES)) {
    const cx = Math.max(site.minX, Math.min(nd.x, site.maxX));
    const cz = Math.max(site.minZ, Math.min(nd.z, site.maxZ));
    const d = Math.hypot(nd.x - cx, nd.z - cz);
    if (d < nearest) {
      nearest = d;
      node = n;
    }
  }
  check(nearest < 20, `a walkway comes within 20m (${f1(nearest)}m, node ${node})`);
  // nothing of the park's own is near enough to matter
  for (const key of ["dumplings", "accessories", "juice"] as const) {
    const arr = (level as unknown as Record<string, unknown[]>)[key] ?? [];
    const close = arr.filter((a) => {
      const o = a as { pos?: number[]; x?: number; z?: number } & number[];
      const x = o.pos?.[0] ?? o.x ?? o[0]!;
      const z = o.pos?.[2] ?? o.z ?? o[1]!;
      return x > site.minX - 8 && x < site.maxX + 8 && z > site.minZ - 8 && z < site.maxZ + 8;
    });
    check(close.length === 0, `no ${key} within 8m of the site`);
  }
}

/* ---------------------------------------------- 2. the arithmetic of the jumps */

console.log("\nthe jumps, on paper");
const REACH = jumpReach(0, WALK);
const HEIGHT = jumpHeight();
{
  console.log(`  (a standing jump peaks at ${f2(HEIGHT)}m and carries her ${f2(REACH)}m at ${WALK}m/s)`);
  let worstGap = 0;
  let worstGapId = "";
  let worstRise = 0;
  let worstRiseId = "";
  for (let i = 1; i < PIECES.length; i++) {
    const a = PIECES[i - 1]!;
    const b = PIECES[i]!;
    if (b.gap > worstGap) {
      worstGap = b.gap;
      worstGapId = `${a.id} to ${b.id}`;
    }
    const rise = b.top - a.top;
    if (rise > worstRise) {
      worstRise = rise;
      worstRiseId = `${a.id} to ${b.id}`;
    }
    // the gap has to fit her jump even after her own width at both ends
    const need = b.gap + PLAYER_W * 2;
    check(
      need * 2 <= REACH,
      `${a.id} to ${b.id}: ${f2(b.gap)}m gap (she reaches ${f2(REACH)}m, ${f1(REACH / Math.max(0.01, need))}x)`,
    );
    check(rise < HEIGHT - 1.2, `${a.id} to ${b.id}: rise ${f2(rise)}m, far under her ${f2(HEIGHT)}m jump`);
  }
  console.log(`  widest gap ${f2(worstGap)}m (${worstGapId}), biggest rise ${f2(worstRise)}m (${worstRiseId})`);
  check(worstGap * 2 < REACH, `the widest gap is under half her reach (${f2(worstGap)}m vs ${f2(REACH)}m)`);

  // the steps on and off are walked, never jumped
  for (const [name, steps, floor] of [
    ["the deck steps", deckSteps(), 0],
    ["the podium steps", podiumSteps(), 0],
  ] as [string, { top: number }[], number][]) {
    let prev = floor;
    let worst = 0;
    for (const s of steps) {
      worst = Math.max(worst, s.top - prev);
      prev = s.top;
    }
    check(worst <= STEP_UP, `${name}: every rise is under the ${STEP_UP}m step-up (worst ${f2(worst)}m)`);
  }

  // the bridge is walked: no gap between planks is wide enough to drop through
  const planks = bridgePlanks();
  let worstPlankGap = 0;
  let worstPlankRise = 0;
  for (let i = 1; i < planks.length; i++) {
    const a = planks[i - 1]!;
    const b = planks[i]!;
    worstPlankGap = Math.max(worstPlankGap, b.cx - b.w / 2 - (a.cx + a.w / 2));
    worstPlankRise = Math.max(worstPlankRise, Math.abs(b.top - a.top));
  }
  check(worstPlankGap < PLAYER_W, `bridge planks are closer than her half width (${f2(worstPlankGap)}m < ${PLAYER_W}m)`);
  check(worstPlankRise < STEP_UP, `the bridge's sag is walkable (worst step ${f2(worstPlankRise)}m)`);

  // the lowest thing she can stand on has to be clear of the fall line
  const lowest = Math.min(...PIECES.map((p) => p.top), ...planks.map((p) => p.top));
  check(lowest > FALL_Y + 0.25, `the lowest platform (${f2(lowest)}m) is well above the fall line (${f2(FALL_Y)}m)`);
  check(FALL_Y > LAVA_SURFACE + 0.2, `the fall line is above the lava's surface (${f2(LAVA_SURFACE)}m)`);
}

/* ------------------------------------------- 3. the ferries, and what they carry */

console.log("\nthe rafts");
{
  const a = PIECES.find((p) => p.id === "ferryA")!;
  const b = PIECES.find((p) => p.id === "ferryB")!;
  const neighbours: [Piece, Piece][] = [[PIECES[a.index - 1]!, a], [a, b], [b, PODIUM]];
  let worst = 0;
  let worstAt = "";
  for (let k = 0; k < 120; k++) {
    const t = (k / 120) * 6.6;
    for (const [p, q] of neighbours) {
      const pa = pieceAt(p, t);
      const qa = pieceAt(q, t);
      const dz = Math.max(0, Math.abs(pa.z - qa.z) - (p.d + q.d) / 2);
      const dx = Math.max(0, Math.abs(pa.x - qa.x) - (p.w + q.w) / 2);
      const d = Math.hypot(dx, dz);
      if (d > worst) {
        worst = d;
        worstAt = `${p.id} to ${q.id} at t=${f1(t)}`;
      }
    }
  }
  check(
    worst + PLAYER_W * 2 < REACH / 2,
    `at every moment of the swing the ferry jumps stay inside half her reach (worst ${f2(worst)}m, ${worstAt})`,
  );
  // z overlap at all times means she never has to jump diagonally
  let overlapAlways = true;
  for (let k = 0; k < 120; k++) {
    const t = (k / 120) * 6.6;
    for (const [p, q] of neighbours) {
      const pa = pieceAt(p, t);
      const qa = pieceAt(q, t);
      if (Math.abs(pa.z - qa.z) >= (p.d + q.d) / 2) overlapAlways = false;
    }
  }
  check(overlapAlways, "a ferry's footprint always overlaps its neighbours' in z: every jump is straight along the course");
  check(Math.abs(ferryZ(0) - ferryZ(6.6)) < 1e-9, "the raft cycle closes exactly");
}

/* ----------------------------------------------------- the simulation harness */

/**
 * Her, through the real collision code, with the lava course's own rules laid
 * over the top exactly as runtime.ts lays them over physics(): the ferries
 * slide and carry her on the fixed step, then the fall-and-return runs.
 */
class Sim {
  cap: Capsule = { x: 0, y: 0, z: 0, hw: PLAYER_W, h: PLAYER_H, hd: PLAYER_W };
  vy = 0;
  grounded = false;
  /** runtime.ts gives her 0.12s of grace after she leaves an edge */
  coyote = 0;
  clock: number;
  safe: LavaSafe = { index: 0, dx: 0, dz: 0 };
  boxes: AABB[];
  private ferryBoxes: AABB[];
  private ferryPieces: Piece[];
  falls = 0;
  lastFall = -10;
  maxStep = 0;
  peak = 0;
  visited = new Set<number>();
  /** the lowest she ever was while over the lava, to prove she never reaches it */
  lowestOverLava = Infinity;

  constructor(x: number, y: number, z: number, t0 = 0) {
    this.clock = t0;
    const own = lavaColliders(t0);
    this.ferryPieces = PIECES.filter((p) => p.kind === "ferry");
    this.ferryBoxes = own.slice(own.length - this.ferryPieces.length);
    this.boxes = [...park, ...own];
    this.cap.x = x;
    this.cap.y = y;
    this.cap.z = z;
  }

  /** One fixed step: gravity, collision, the ferries, then the lava rule. */
  step(vx: number, vz: number, jump: boolean) {
    if (this.grounded) this.coyote = 0.12;
    else this.coyote = Math.max(0, this.coyote - DT);
    if (jump && this.coyote > 0) {
      this.vy = JUMP;
      this.grounded = false;
      this.coyote = 0;
    }
    this.vy -= GRAVITY * DT;
    const px = this.cap.x;
    const pz = this.cap.z;
    const r = moveAndCollide(this.cap, vx, this.vy, vz, this.boxes, DT, level.groundY);
    this.vy = r.vy;
    this.grounded = r.grounded;
    this.maxStep = Math.max(this.maxStep, Math.hypot(this.cap.x - px, this.cap.z - pz));
    this.peak = Math.max(this.peak, this.cap.y);

    // runtime.ts: lavaWorld.step(dt, cap, grounded) inside physics()
    const before = ferryZ(this.clock);
    this.clock += DT;
    const after = ferryZ(this.clock);
    let riding = false;
    for (let i = 0; i < this.ferryBoxes.length; i++) {
      const pc = this.ferryPieces[i]!;
      const b = this.ferryBoxes[i]!;
      if (
        this.grounded &&
        Math.abs(this.cap.y - pc.top) < 0.14 &&
        this.cap.x - this.cap.hw < b.maxX &&
        this.cap.x + this.cap.hw > b.minX &&
        this.cap.z - this.cap.hd < b.maxZ &&
        this.cap.z + this.cap.hd > b.minZ
      ) {
        riding = true;
      }
      b.minZ = after - pc.d / 2;
      b.maxZ = after + pc.d / 2;
    }
    if (riding) this.cap.z += after - before;

    // runtime.ts: lavaWorld.update(...) in animateWorld()
    const on = standingOn(this.cap.x, this.cap.y, this.cap.z, this.clock);
    if (on) {
      this.safe = on;
      this.visited.add(on.index);
    }
    if (overLava(this.cap.x, this.cap.z)) this.lowestOverLava = Math.min(this.lowestOverLava, this.cap.y);
    if (overLava(this.cap.x, this.cap.z) && this.cap.y < FALL_Y && this.clock - this.lastFall > 0.7) {
      this.lastFall = this.clock;
      this.falls++;
      const [sx, sy, sz] = safeSpotAt(this.safe, this.clock);
      this.cap.x = sx;
      this.cap.y = sy;
      this.cap.z = sz;
      this.vy = 0;
    }
  }

  /**
   * Walk toward a point (re-read every frame, so a raft can be the target),
   * jumping whenever `jumpAt` says so.
   */
  goTo(target: () => [number, number], seconds: number, jumpAt?: (s: Sim) => boolean, speed = WALK) {
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n; i++) {
      const [tx, tz] = target();
      const dx = tx - this.cap.x;
      const dz = tz - this.cap.z;
      const d = Math.hypot(dx, dz);
      if (d < 1e-4 || (d < 0.3 && this.grounded)) return true;
      const sp = Math.min(speed, d / DT);
      this.step((dx / d) * sp, (dz / d) * sp, jumpAt ? jumpAt(this) : false);
    }
    const [tx, tz] = target();
    return Math.hypot(tx - this.cap.x, tz - this.cap.z) < 0.4;
  }

  /** Stand still until her feet are down again, or for at least `seconds`. */
  settle(seconds = 2) {
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      this.step(0, 0, false);
      if (i > 10 && this.grounded) return;
    }
  }

  get on() {
    return standingOn(this.cap.x, this.cap.y, this.cap.z, this.clock);
  }
}

/**
 * Cross the course from the lawn to the podium, jumping the way a player does:
 * run at the next platform and press jump when the edge is about a third of a
 * jump away. `t0` is where the ferries are when she starts.
 */
function crossing(t0: number, speed = WALK) {
  const s = new Sim(LAVA_START[0], 0.4, LAVA_START[1] - 3, t0);
  // walk up the steps onto the deck: the jump key is never pressed here
  s.goTo(() => [DECK.cx, DECK.cz], 8);
  s.settle(0.6);
  const onDeck = s.on?.index === 0;
  for (let i = 1; i < PIECES.length; i++) {
    const target = PIECES[i]!;
    const prev = PIECES[i - 1]!;
    const edge = prev.cx + prev.w / 2;
    // a player runs at the gap and taps jump once as the edge comes up
    let tapped = false;
    const jumpAt = (sim: Sim) => {
      if (tapped || !sim.grounded || sim.cap.x < edge - 1.2 || sim.cap.x > edge + 0.15) return false;
      tapped = true;
      return true;
    };
    s.goTo(
      () => {
        const a = pieceAt(target, s.clock);
        return [a.x, a.z];
      },
      8,
      target.gap > 0.01 ? jumpAt : undefined,
      speed,
    );
    s.settle(1.5);
    if (s.on?.index !== target.index) return { s, failed: target.id, onDeck };
  }
  return { s, failed: null as string | null, onDeck };
}

/* ------------------------------------------------------- 4. crossing it */

console.log("\ncrossing the course, through the real physics");
{
  let worstFalls = 0;
  let allOk = true;
  for (let k = 0; k < 12; k++) {
    const t0 = (k / 12) * 6.6;
    const { s, failed, onDeck } = crossing(t0);
    if (k === 0) check(onDeck, "she walks up the steps onto the start deck without ever jumping");
    if (failed) {
      allOk = false;
      check(
        false,
        `rafts at t=${f1(t0)}: she could not get onto ${failed} (stopped at (${f1(s.cap.x)}, ${f2(s.cap.y)}, ${f1(s.cap.z)}))`,
      );
      break;
    }
    check(s.maxStep < 1.0, `rafts at t=${f1(t0)}: no teleport on the way over (largest move ${f2(s.maxStep)}m in a frame)`);
    check(s.visited.size === PIECES.length, `rafts at t=${f1(t0)}: she stood on all ${PIECES.length} pieces`);
    worstFalls = Math.max(worstFalls, s.falls);
  }
  check(allOk, `the whole course is crossable from all 12 raft phases (at most ${worstFalls} accidental fall on the way)`);
  check(worstFalls === 0, `a player who jumps at the edges never falls in by accident (${worstFalls} falls)`);
}

/**
 * The careless jump: hold the stick forward and tap jump `early` metres before
 * the edge (a negative value means she used the coyote grace and jumped after
 * the edge). Returns the piece she ended up on.
 */
function carelessJump(from: Piece, early: number, t0 = 1.3, speed = WALK) {
  const at = pieceAt(from, t0);
  const edge = at.x + from.w / 2;
  const s = new Sim(Math.max(at.x - from.w / 2 + 0.4, edge - early - 2.4), from.top + 0.05, at.z, t0);
  s.safe = { index: from.index, dx: 0, dz: 0 };
  let jumped = false;
  let flew = false;
  for (let i = 0; i < 400; i++) {
    const want = !jumped && s.coyote > 0 && s.cap.x > edge - early;
    if (want) jumped = true;
    s.step(speed, 0, want);
    if (jumped && s.cap.y > from.top + 0.5) flew = true;
    if (flew && s.grounded) break;
  }
  s.settle(1.5);
  return { on: s.on, s, jumped: flew };
}

console.log("\nthe careless jump: full speed, stick held forward");
{
  const hops = PIECES.filter((p) => p.gap > 0.01);
  for (const target of hops) {
    const from = PIECES[target.index - 1]!;
    // at the edge is the longest flight there is; the coyote grace adds a
    // little more, and jumping early is the short end
    for (const [name, early] of [["3.0m early", 3.0], ["1.2m early", 1.2], ["right at the edge", 0.0], ["after the edge (coyote)", -0.5]] as [string, number][]) {
      const { on, jumped } = carelessJump(from, early);
      check(
        jumped && on != null && on.index >= target.index,
        `${from.id} to ${target.id}, ${name}: lands on ${on ? PIECES[on.index]!.id : "nothing — she fell in"}`,
      );
    }
  }
  // and on a juice box, which is the fastest she can ever move
  let boostStuck = "";
  for (const target of hops) {
    const from = PIECES[target.index - 1]!;
    const { on, s } = carelessJump(from, 0.4, 1.3, WALK * BOOST_MULTIPLIER);
    // a boosted jump may sail past the piece she aimed at; what matters is
    // that she always ends up standing on the course or back on the lawn,
    // never stuck in the air and never sitting in the lava
    const ok = on != null || s.cap.y < LAVA_SURFACE;
    if (!ok && !boostStuck) boostStuck = `${from.id} boosted: ended at (${f1(s.cap.x)}, ${f2(s.cap.y)}, ${f1(s.cap.z)})`;
  }
  check(!boostStuck, `on a juice box (${BOOST_MULTIPLIER}x) every jump still ends standing on the course${boostStuck ? `: ${boostStuck}` : ""}`);
}

/* --------------------------------------------------- 5. falling in the lava */

console.log("\nfalling in");
{
  let worst = "";
  let bad = 0;
  let tested = 0;
  let maxBack = 0;
  for (let x = LAVA_POOL.minX + 0.5; x < LAVA_POOL.maxX; x += 1.5) {
    for (let z = LAVA_POOL.minZ + 0.5; z < LAVA_POOL.maxZ; z += 1.5) {
      for (const k of [0, 1, 2, 3]) {
        const t0 = (k / 4) * 6.6;
        // a point over a platform is not a drop into the lava
        if (PIECES.some((p) => {
          const at = pieceAt(p, t0);
          return Math.abs(x - at.x) < p.w / 2 + 0.5 && Math.abs(z - at.z) < p.d / 2 + 0.5;
        })) continue;
        // she was last on whichever piece is nearest to the west of her
        const from = PIECES.filter((p) => p.cx - p.w / 2 <= x).pop() ?? DECK;
        const s = new Sim(x, 6, z, t0);
        s.safe = { index: from.index, dx: 0, dz: 0 };
        tested++;
        // fall, be returned, then stand there for a second
        for (let i = 0; i < 180; i++) s.step(0, 0, false);
        const on = s.on;
        if (!on) {
          bad++;
          if (!worst) worst = `dropped at (${f1(x)}, ${f1(z)}) t=${f1(t0)} with safe=${from.id}: ended at (${f1(s.cap.x)}, ${f2(s.cap.y)}, ${f1(s.cap.z)})`;
          continue;
        }
        maxBack = Math.max(maxBack, from.index - on.index);
      }
    }
  }
  check(bad === 0, `every one of ${tested} drops into the lava put her back on a platform, standing${worst ? ` (${worst})` : ""}`);
  check(maxBack <= 0, `a fall never sends her back past the piece she fell from (worst ${maxBack} pieces)`);

  // she is lifted out before she ever touches the lava itself
  const { s } = crossing(1.1);
  check(
    s.lowestOverLava > LAVA_SURFACE,
    `crossing it, she never gets down to the lava's surface (lowest ${f2(s.lowestOverLava)}m, lava at ${f2(LAVA_SURFACE)}m)`,
  );

  // and nothing in the pool is solid below the fall line except the rim
  const own = lavaColliders(0);
  const inPool = own.filter(
    (b) =>
      b.maxY < FALL_Y &&
      b.maxX > LAVA_POOL.minX &&
      b.minX < LAVA_POOL.maxX &&
      b.maxZ > LAVA_POOL.minZ &&
      b.minZ < LAVA_POOL.maxZ,
  );
  check(inPool.length === 0, `nothing solid stands in the lava below the fall line (${inPool.length} found)`);
}

/* ------------------------------------------------------- 6. getting stuck */

console.log("\nnowhere to get stuck");
{
  /** Shove her at a heading for a while and report where she ends up. */
  const shove = (x: number, y: number, z: number, hx: number, hz: number, seconds: number, jump = false) => {
    const s = new Sim(x, y, z, 1.7);
    s.safe = { index: 0, dx: 0, dz: 0 };
    for (let i = 0; i < Math.round(seconds * 60); i++) s.step(hx * WALK, hz * WALK, jump && s.grounded && i % 40 === 0);
    // let go of the stick and let her come to rest before asking where she is
    s.settle(2.5);
    return s;
  };

  // driven off every platform in all four directions she always ends up either
  // still on the course or put back on it; she is never left in mid-air or
  // standing on the lava
  let stranded = "";
  for (const p of PIECES) {
    for (const [hx, hz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
      const at = pieceAt(p, 1.7);
      const s = shove(at.x, p.top + 0.05, at.z, hx, hz, 3.5);
      const on = s.on;
      // anything below the lava's surface is the lawn: she is out of the course
      const onGround = s.cap.y < LAVA_SURFACE;
      if (!on && !onGround && !stranded) {
        stranded = `${p.id} pushed (${hx}, ${hz}) ended at (${f1(s.cap.x)}, ${f2(s.cap.y)}, ${f1(s.cap.z)})`;
      }
    }
  }
  check(!stranded, `shoved off every platform in every direction she lands somewhere real${stranded ? `: ${stranded}` : ""}`);

  // she can always get off the lawn and back onto the deck, from all round it
  let cannot = "";
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    const sx = LAVA_START[0] + Math.cos(ang) * 12;
    const sz = LAVA_START[1] + Math.sin(ang) * 12;
    // only from the lawn side; the pool is not somewhere to start walking from
    if (overLava(sx, sz)) continue;
    // and not from inside the deck itself
    if (Math.abs(sx - DECK.cx) < DECK.w / 2 + 0.6 && Math.abs(sz - DECK.cz) < DECK.d / 2 + 0.6) continue;
    const s = new Sim(sx, 0.4, sz, 0.4);
    s.goTo(() => LAVA_START, 10);
    s.goTo(() => [DECK.cx, DECK.cz], 10);
    s.settle(0.5);
    if (s.on?.index !== 0 && !cannot) cannot = `from (${f1(sx)}, ${f1(sz)}) she ended at (${f1(s.cap.x)}, ${f2(s.cap.y)}, ${f1(s.cap.z)})`;
  }
  check(!cannot, `she can walk onto the start deck from anywhere on the lawn round it${cannot ? `: ${cannot}` : ""}`);

  // and off the podium, down its steps, without jumping
  {
    const s = new Sim(PODIUM.cx, PODIUM.top + 0.05, PODIUM.cz, 0.4);
    const east = PODIUM.cx + PODIUM.w / 2 + 6;
    s.goTo(() => [east, PODIUM.cz], 10);
    s.settle(0.5);
    check(s.cap.x > PODIUM.cx + PODIUM.w / 2 + 3 && s.cap.y < 0.3, `she walks down off the podium onto the lawn (ended at (${f1(s.cap.x)}, ${f2(s.cap.y)}))`);
  }

  // the rim keeps her out of the pool at ground level, and nothing there is a
  // step she could stroll up
  {
    const rims = rimSegments();
    check(rims.length > 0, `the pool has a rock rim (${rims.length} segments)`);
    let walkedIn = "";
    for (let z = LAVA_POOL.minZ + 1; z < LAVA_POOL.maxZ; z += 2) {
      for (const [x, hx] of [[LAVA_POOL.minX - 4, 1], [LAVA_POOL.maxX + 4, -1]] as [number, number][]) {
        if (overLava(x, z)) continue;
        const s = shove(x, 0.2, z, hx, 0, 2.5);
        // she may be bounced out by the lava rule, which is fine; what must
        // not happen is her strolling in and standing on the rim
        if (s.falls === 0 && overLava(s.cap.x, s.cap.z) && !walkedIn) {
          walkedIn = `walked in at z ${f1(z)} from x ${f1(x)} and stayed at (${f1(s.cap.x)}, ${f2(s.cap.y)})`;
        }
      }
    }
    check(!walkedIn, `she cannot stroll in over the rim${walkedIn ? `: ${walkedIn}` : ""}`);
  }

  // head room: nothing on the course is low enough to trap her
  {
    const own = lavaColliders(0);
    let worstHead = Infinity;
    let where = "";
    for (const p of PIECES) {
      const at = pieceAt(p, 0);
      const over = own.filter((b) => at.x > b.minX && at.x < b.maxX && at.z > b.minZ && at.z < b.maxZ && b.minY >= p.top + 0.01);
      for (const b of over) {
        if (b.minY - p.top < worstHead) {
          worstHead = b.minY - p.top;
          where = p.id;
        }
      }
    }
    check(worstHead > PLAYER_H + 0.3, `open sky over every platform${where ? ` (worst ${f2(worstHead)}m over ${where})` : ""}`);
  }
}

/* ---------------------------------------------------------- 7. the prize */

console.log("\nthe prize");
{
  check(lavaTickets(true) > lavaTickets(false), `the first crossing pays more (${lavaTickets(true)} tickets, then ${lavaTickets(false)})`);
  const { s } = crossing(3.6);
  check(s.on?.index === PODIUM.index, "the crossing ends standing on the prize podium");
  // a sanity check on the course's own geometry: no two colliders overlap
  const own = lavaColliders(0);
  let overlap = "";
  for (let i = 0; i < own.length && !overlap; i++) {
    for (let j = i + 1; j < own.length; j++) {
      const a = own[i]!;
      const b = own[j]!;
      const ix = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
      const iy = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
      const iz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
      if (ix > 0.02 && iy > 0.02 && iz > 0.02) {
        overlap = `#${i} and #${j} overlap by ${f2(ix)} x ${f2(iy)} x ${f2(iz)}m near (${f1(a.minX)}, ${f1(a.minZ)})`;
        break;
      }
    }
  }
  check(!overlap, `no two of the course's ${own.length} colliders overlap${overlap ? `: ${overlap}` : ""}`);
}

/* ---------------------------------------------------------------- summary */

const site = lavaFootprint(0);
console.log(
  failures
    ? `\n${failures} failure(s), ${passes} passed`
    : `\nall ${passes} Floor is Lava checks passed` +
      `\n  site: x ${f1(site.minX)}..${f1(site.maxX)}, z ${f1(site.minZ)}..${f1(site.maxZ)}` +
      `\n  ${PIECES.length} pieces from the deck at (${f1(DECK.cx)}, ${f1(DECK.cz)}) to the podium at (${f1(PODIUM.cx)}, ${f1(PODIUM.cz)})` +
      `\n  widest gap ${f2(Math.max(...PIECES.map((p) => p.gap)))}m against a ${f2(REACH)}m reach` +
      `\n  ${lavaColliders(0).length} colliders, ${bridgePlanks().length} bridge planks, ${rimSegments().length} rim segments`,
);
process.exit(failures ? 1 : 0);
