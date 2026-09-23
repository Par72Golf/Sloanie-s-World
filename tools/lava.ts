/**
 * The Floor is Lava course, through the real collision code.
 *
 * Nothing here trusts the numbers in lava.ts. It rebuilds the exact colliders
 * the game builds and then proves, in order:
 *
 *   1. the site is on genuinely clear ground, clear of the landmarks, outside
 *      every no-jump zone, and near enough to a walkway that she will find it;
 *   2. **honesty**: at 200 phases of every moving piece, the collider the world
 *      gets is exactly the box the piece's own position function describes, and
 *      the mesh is placed from that same function. This is the regression test
 *      for the bug that made the first version's tilting logs unstandable;
 *   3. **standability**: she is dropped onto every piece, static and moving, at
 *      a spread of phases, and must end up grounded on its top;
 *   4. **the jumps**: for every hop, a sweep of take-off points (and of phases,
 *      for the moving ones) measures the window of positions that land her on
 *      the next piece — in metres and in milliseconds of run. That window, not
 *      the gap on its own, is the honest measure of how hard a jump is;
 *   5. **completability**: she runs the whole course at 60Hz with a predictive
 *      jump policy — aim at where the target will be when she lands — from six
 *      different course phases;
 *   6. **falling**: from a grid of points over the lava at a spread of phases,
 *      the fall rule always puts her back on the start deck, standing;
 *   7. **no traps**: shoved off every piece in every direction, driven at the
 *      kerb, and walked off the podium, she always ends up somewhere real.
 *
 * Run: npx jiti tools/lava.ts        (exits 1 on any failure)
 *      npx jiti tools/lava.ts scan   the clear-ground search that picked the spot
 *      npx jiti tools/lava.ts route   print the course as built
 */
import { LEVELS } from "../src/game/levels";
import { collidersFor } from "../src/game/colliders";
import { moveAndCollide, type AABB, type Capsule } from "../src/game/collision";
import { GRAVITY, JUMP, PLAYER_H, PLAYER_W, WALK, jumpHeight, jumpReach } from "../src/game/tuning";
import { BOOST_MULTIPLIER } from "../src/game/emmett";
import { NODES } from "../src/game/walkways";
import { featuresFor } from "../src/game/features";
import { setLavaStart } from "../src/game/lava";
import { SUGAR, loopRects } from "../src/game/sugar-rush";
import { CHOC_SITE } from "../src/game/choc-course";

const PARAPET_SLACK = 0.7;
const DX: Record<string, number> = { E: 1, W: -1, N: 0, S: 0 };
const DZ: Record<string, number> = { E: 0, W: 0, N: -1, S: 1 };
import {
  DECK,
  FALL_Y,
  LAVA_POOL,
  LAVA_START,
  LAVA_SURFACE,
  MOVING,
  PIECES,
  PODIUM,
  SECTION_NAMES,
  deckSteps,
  parapets,
  podiumSteps,
  lavaColliders,
  lavaFootprint,
  lavaWaitSpot,
  lavaTickets,
  newLavaState,
  overLava,
  pieceAt,
  pieceBox,
  pieceUsable,
  rimSegments,
  standingOn,
  startSpot,
  stepLavaState,
  type LavaState,
  type Piece,
} from "../src/game/lava";

const DT = 1 / 60;
const STEP_UP = 0.62;
// LEVEL picks the park: 0 is Sunny Picnic Park's lava, 1 Sugar Rush's chocolate.
const LEVEL = Number(process.env.LEVEL ?? "0");
const level = LEVELS[LEVEL]!;
// the module keeps one course at a time, the way the game does when a park loads
setLavaStart(featuresFor(level).lava);
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

const REACH = jumpReach(0, WALK);
const HEIGHT = jumpHeight();
/** how long a flat jump keeps her in the air */
const AIRTIME = (2 * JUMP) / GRAVITY;

/**
 * Which way a hop runs. The gap before a piece is opened along that piece's own
 * direction, so after a turn the jump is along the NEW heading, not the one she
 * arrived on. Getting this wrong made every hop at a corner look impossible.
 */
const axisOf = (p: Piece) => (p.dir === "E" || p.dir === "W" ? "x" : "z") as "x" | "z";
const signOf = (p: Piece) => (p.dir === "E" || p.dir === "S" ? 1 : -1);
/** a piece's size along a given axis, and across it */
const lenOn = (p: Piece, ax: "x" | "z") => (ax === "x" ? p.w : p.d);
const acrossOn = (p: Piece, ax: "x" | "z") => (ax === "x" ? p.d : p.w);
const posOn = (a: { x: number; z: number }, ax: "x" | "z") => (ax === "x" ? a.x : a.z);
const posAcross = (a: { x: number; z: number }, ax: "x" | "z") => (ax === "x" ? a.z : a.x);

/* --------------------------------------------------------------- the route */

if (mode === "route") {
  for (const p of PIECES) {
    const a = pieceAt(p, newLavaState());
    console.log(
      `${String(p.index).padStart(2)}  s${p.section} ${p.id.padEnd(8)} ${p.dir}  gap ${f1(p.gap)}  ` +
        `${f1(a.x - p.w / 2)}..${f1(a.x + p.w / 2)} x  ${f1(a.z - p.d / 2)}..${f1(a.z + p.d / 2)} z  ` +
        `top ${f2(p.top)}  ${p.motion.kind}`,
    );
  }
  process.exit(0);
}

/**
 * Sugar Rush's landmarks, and the path network she finds the course from.
 * The loop is a rounded rectangle of walkway rects rather than a graph of
 * named nodes, so its rects stand in for park 1's nodes.
 */
const SUGAR_LANDMARKS: [string, number, number, number][] = [
  ["the plaza", SUGAR.plaza.x, SUGAR.plaza.z, 20],
  ["the candy factory", SUGAR.factory.x, SUGAR.factory.z, 22],
  // the mountain's base is 9.4m across the middle; 16 keeps the course off
  // the ground the climb starts from
  ["Ice Cream Mountain", SUGAR.mountain.x, SUGAR.mountain.z, 16],
  ["the Lollipop Forest", SUGAR.forest.x, SUGAR.forest.z, 24],
  ["Gingerbread Village", SUGAR.village.x, SUGAR.village.z, 26],
  ["the Licorice Maze", SUGAR.maze.x, SUGAR.maze.z, 28],
  ["Gumdrop Meadow", SUGAR.meadow.x, SUGAR.meadow.z, 24],
  ["Marshmallow Fields", SUGAR.marshmallow.x, SUGAR.marshmallow.z, 24],
  ["the fairground", SUGAR.fair.x, SUGAR.fair.z, 28],
  ["the chocolate lake", SUGAR.lake.x, SUGAR.lake.z, 20],
];

const PATH_NODES: Record<string, { x: number; z: number }> =
  LEVEL === 1
    ? Object.fromEntries(
        loopRects().map((r, i) => [`loop${i}`, { x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 }]),
      )
    : (NODES as unknown as Record<string, { x: number; z: number }>);

const PARK1_LANDMARKS: [string, number, number, number][] = [
  ["the carousel", -16, 46, 22],
  ["the mini golf", 20, -132, 24],
  ["the zoo", -15, -136, 24],
  ["the bowls club", 97, 92, 20],
  ["Emmett's yard", 50.5, -9, 16],
  ["the mountain", 73, -128, 30],
  ["her house", -9, 110, 14],
  ["the ninja course", 8, 136, 16],
];

const LANDMARKS = LEVEL === 1 ? SUGAR_LANDMARKS : PARK1_LANDMARKS;

/* --------------------------------------------------- the clear-ground scan */

if (mode === "scan") {
  console.log("the biggest genuinely clear rectangles in the park, by area");
  const B = level.bounds;
  const S = 2;
  const W = Math.ceil((B.maxX - B.minX) / S);
  const H = Math.ceil((B.maxZ - B.minZ) / S);
  const blocked = new Uint8Array(W * H);
  const mark = (minX: number, maxX: number, minZ: number, maxZ: number) => {
    const x0 = Math.max(0, Math.floor((minX - B.minX) / S));
    const x1 = Math.min(W - 1, Math.ceil((maxX - B.minX) / S));
    const z0 = Math.max(0, Math.floor((minZ - B.minZ) / S));
    const z1 = Math.min(H - 1, Math.ceil((maxZ - B.minZ) / S));
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) blocked[j * W + i] = 1;
  };
  for (const b of park) mark(b.minX - 3, b.maxX + 3, b.minZ - 3, b.maxZ + 3);
  for (const w of level.water ?? []) mark(w.x - w.r - 5, w.x + w.r + 5, w.z - w.r - 5, w.z + w.r + 5);
  mark(-45, 45, -30, 55);
  for (const [, x, z, r] of LANDMARKS) mark(x - r, x + r, z - r, z + r);
  mark(B.minX, B.minX + 10, B.minZ, B.maxZ);
  mark(B.maxX - 10, B.maxX, B.minZ, B.maxZ);
  mark(B.minX, B.maxX, B.minZ, B.minZ + 10);
  mark(B.minX, B.maxX, B.maxZ - 10, B.maxZ);

  const h = new Int32Array(W);
  type R = { area: number; minX: number; maxX: number; minZ: number; maxZ: number };
  const all: R[] = [];
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) h[i] = blocked[j * W + i] ? 0 : h[i]! + 1;
    const st: number[] = [];
    for (let i = 0; i <= W; i++) {
      const cur = i < W ? h[i]! : 0;
      while (st.length && h[st[st.length - 1]!]! >= cur) {
        const top = st.pop()!;
        const left = st.length ? st[st.length - 1]! + 1 : 0;
        const height = h[top]!;
        const width = i - left;
        if (height >= 6 && width >= 6)
          all.push({
            area: height * width * S * S,
            minX: B.minX + left * S,
            maxX: B.minX + i * S,
            minZ: B.minZ + (j - height + 1) * S,
            maxZ: B.minZ + (j + 1) * S,
          });
      }
      st.push(i);
    }
  }
  all.sort((a, b) => b.area - a.area);
  const kept: R[] = [];
  for (const r of all) {
    const over = (k: R) =>
      Math.max(0, Math.min(k.maxX, r.maxX) - Math.max(k.minX, r.minX)) *
      Math.max(0, Math.min(k.maxZ, r.maxZ) - Math.max(k.minZ, r.minZ));
    if (kept.some((k) => over(k) > 0.4 * r.area)) continue;
    kept.push(r);
    if (kept.length >= 8) break;
  }
  for (const r of kept) {
    let bn = Infinity;
    let node = "";
    for (const [n, nd] of Object.entries(PATH_NODES)) {
      const cx = Math.max(r.minX, Math.min(nd.x, r.maxX));
      const cz = Math.max(r.minZ, Math.min(nd.z, r.maxZ));
      const d = Math.hypot(nd.x - cx, nd.z - cz);
      if (d < bn) {
        bn = d;
        node = n;
      }
    }
    console.log(
      `  ${(r.maxX - r.minX).toFixed(0)}m x ${(r.maxZ - r.minZ).toFixed(0)}m = ${r.area.toFixed(0)}m2  ` +
        `x ${r.minX}..${r.maxX}  z ${r.minZ}..${r.maxZ}   walkway ${f1(bn)}m (${node})`,
    );
  }
  console.log("\nThe lawn south of the campground is both the biggest and the closest to a path.");
  process.exit(0);
}

/* ------------------------------------------------------------ 1. the site */

console.log("the site");
{
  const site = lavaFootprint(1.2);
  // flat ground she walks over is not an obstacle; anything that stands up is
  const solid = park.filter((b) => b.maxY > 0.25);
  const hit = solid.filter((b) => b.maxX > site.minX && b.minX < site.maxX && b.maxZ > site.minZ && b.minZ < site.maxZ);
  check(
    hit.length === 0,
    `nothing of the park stands inside the site (x ${f1(site.minX)}..${f1(site.maxX)}, z ${f1(site.minZ)}..${f1(site.maxZ)})` +
      (hit.length ? `: ${hit[0]!.label} at (${f1(hit[0]!.minX)}, ${f1(hit[0]!.minZ)})` : ""),
  );
  const b = level.bounds;
  check(
    site.minX > b.minX + 6 && site.maxX < b.maxX - 6 && site.minZ > b.minZ + 6 && site.maxZ < b.maxZ - 6,
    "the whole site is inside the park's boundary wall",
  );
  // park 1 keeps the middle of the park free for the games; Sugar Rush's
  // middle is the plaza, which the landmark check already covers
  if (LEVEL === 0) {
    check(site.maxX <= -45 || site.minX >= 45 || site.maxZ <= -30 || site.minZ >= 55, "clear of the inner square x -45..45, z -30..55");
  }
  for (const [name, lx, lz, r] of LANDMARKS) {
    const cx = Math.max(site.minX, Math.min(lx, site.maxX));
    const cz = Math.max(site.minZ, Math.min(lz, site.maxZ));
    check(Math.hypot(lx - cx, lz - cz) > r, `${r}m clear of ${name} (${f1(Math.hypot(lx - cx, lz - cz))}m)`);
  }
  for (const z of level.noJump ?? []) {
    const overlaps = z.maxX > site.minX && z.minX < site.maxX && z.maxZ > site.minZ && z.minZ < site.maxZ;
    check(!overlaps, `outside the no-jump zone round ${z.why} (jumping has to work everywhere here)`);
  }
  let nearest = Infinity;
  let node = "";
  for (const [n, nd] of Object.entries(PATH_NODES)) {
    const cx = Math.max(site.minX, Math.min(nd.x, site.maxX));
    const cz = Math.max(site.minZ, Math.min(nd.z, site.maxZ));
    const d = Math.hypot(nd.x - cx, nd.z - cz);
    if (d < nearest) {
      nearest = d;
      node = n;
    }
  }
  check(nearest < 20, `a walkway comes within 20m of the site (${f1(nearest)}m, node ${node})`);
  if (LEVEL === 1) {
    // the park keeps its own copy of this rectangle, because the course is
    // built at runtime and nothing the park lays out can ask where it is
    check(
      CHOC_SITE.minX <= site.minX && CHOC_SITE.maxX >= site.maxX && CHOC_SITE.minZ <= site.minZ && CHOC_SITE.maxZ >= site.maxZ,
      `CHOC_SITE still covers the course as built (x ${f1(site.minX)}..${f1(site.maxX)}, z ${f1(site.minZ)}..${f1(site.maxZ)})`,
    );
  }
  for (const key of ["dumplings", "accessories", "juice"] as const) {
    const arr = (level as unknown as Record<string, unknown[]>)[key] ?? [];
    const close = arr.filter((a) => {
      const o = a as { pos?: number[]; x?: number; z?: number } & number[];
      const x = o.pos?.[0] ?? o.x ?? o[0]!;
      const z = o.pos?.[2] ?? o.z ?? o[1]!;
      // 4m: the kerb and the winner's stair reach out towards the bank, and
      // the park's own hidden things sit on the grass beyond them
      return x > site.minX - 4 && x < site.maxX + 4 && z > site.minZ - 4 && z < site.maxZ + 4;
    });
    check(close.length === 0, `no ${key} within 4m of the site`);
  }
}

/* ------------------------------------- 2. honesty: the box is what you see */

/** A state advanced to time t with the give-way plank left alone. */
function at(t: number): LavaState {
  return { t, held: 0, away: -1 };
}

/** The course's colliders come out movers first, then statics: name one. */
const ORDER = [...MOVING, ...PIECES.filter((p) => p.motion.kind === "static")];
const nameOfCollider = (n: number) => ORDER[n]?.id ?? `#${n}`;

console.log("\nhonesty: every collider is exactly the piece it draws");
{
  const PHASES = 200;
  let worstBox = 0;
  let worstId = "";
  let missing = "";
  for (let k = 0; k < PHASES; k++) {
    const s = at((k / PHASES) * 42);
    const own = lavaColliders(s);
    for (const p of PIECES) {
      const want = pieceBox(p, s);
      const got = own.find(
        (b) =>
          Math.abs(b.minX - want.minX) < 1e-9 &&
          Math.abs(b.maxX - want.maxX) < 1e-9 &&
          Math.abs(b.minZ - want.minZ) < 1e-9 &&
          Math.abs(b.maxZ - want.maxZ) < 1e-9 &&
          Math.abs(b.maxY - want.maxY) < 1e-9,
      );
      if (!got) {
        if (!missing) missing = `${p.id} at t=${f1(s.t)}`;
        continue;
      }
      // the box's own top is where the mesh is drawn: pieceAt drives both
      const a = pieceAt(p, s);
      const err = Math.max(Math.abs(got.maxY - a.top), Math.abs((got.minX + got.maxX) / 2 - a.x), Math.abs((got.minZ + got.maxZ) / 2 - a.z));
      if (err > worstBox) {
        worstBox = err;
        worstId = p.id;
      }
    }
  }
  check(!missing, `every piece has its own collider at all ${PHASES} phases${missing ? `: ${missing} is missing` : ""}`);
  check(worstBox < 1e-9, `the collider is exactly where the mesh is drawn (worst ${worstBox.toExponential(1)}m on ${worstId})`);

  // No piece travels by turning: every motion is a translation, so a mesh
  // cannot drift away from its box the way the old rolling logs did.
  check(
    PIECES.every((p) => ["static", "slide", "lift", "orbit", "sink", "give", "squash", "shuttle"].includes(p.motion.kind)),
    "every motion is a translation; nothing solid on this course travels by turning",
  );
  /*
   * A piece may still spin on the spot, but only if spinning cannot move its
   * mesh outside its box: that means a round top on a square footprint, which
   * looks identical at every angle. A square slab spun about its centre pokes
   * its corners out past the collider, which is the invisible-ledge bug.
   */
  const ROUND_SKINS = new Set(["peppermint", "gumdrop"]);
  const spinners = PIECES.filter((p) => p.spin !== 0);
  const badSpin = spinners.find((p) => !ROUND_SKINS.has(p.skin) || Math.abs(p.w - p.d) > 1e-9);
  check(
    !badSpin,
    `anything that spins is round on a square footprint, so its mesh never leaves its box` +
      (badSpin ? `: ${badSpin.id} is ${badSpin.skin} ${f1(badSpin.w)}x${f1(badSpin.d)}` : ` (${spinners.length} spinning)`),
  );

  // nothing solid stands in the lava below the line she is caught at
  let lowSolid = "";
  for (let k = 0; k < 40 && !lowSolid; k++) {
    const s = at((k / 40) * 42);
    // the moving pieces are skipped: a sinking stone is supposed to drop out
    // of reach, which is the whole point of it
    const ways = [...deckSteps(), ...podiumSteps()];
    for (const b of lavaColliders(s).slice(MOVING.length)) {
      if (b.maxY >= FALL_Y) continue;
      // the stairs on and off descend through the lake's edge on purpose
      const cx = (b.minX + b.maxX) / 2;
      const cz = (b.minZ + b.maxZ) / 2;
      if (ways.some((st) => Math.abs(cx - st.cx) < st.w / 2 + PARAPET_SLACK && Math.abs(cz - st.cz) < st.d / 2 + PARAPET_SLACK)) continue;
      if (b.maxX <= LAVA_POOL.minX || b.minX >= LAVA_POOL.maxX) continue;
      if (b.maxZ <= LAVA_POOL.minZ || b.minZ >= LAVA_POOL.maxZ) continue;
      lowSolid = `a box topping out at ${f2(b.maxY)}m at (${f1(b.minX)}, ${f1(b.minZ)})`;
      break;
    }
  }
  check(!lowSolid, `nothing solid stands inside the lake below the fall line${lowSolid ? `: ${lowSolid}` : ""}`);

  // and no two of the course's own colliders overlap
  let overlap = "";
  const rails = parapets();
  const isRail = (b: AABB) =>
    rails.some((r) => Math.abs((b.minX + b.maxX) / 2 - r.cx) < 1e-6 && Math.abs((b.minZ + b.maxZ) / 2 - r.cz) < 1e-6);
  for (let k = 0; k < 12 && !overlap; k++) {
    const own = lavaColliders(at((k / 12) * 42)).filter((b) => !isRail(b));
    for (let i = 0; i < own.length && !overlap; i++) {
      for (let j = i + 1; j < own.length; j++) {
        const a = own[i]!;
        const b = own[j]!;
        const ix = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
        const iy = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
        const iz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
        if (ix > 0.02 && iy > 0.02 && iz > 0.02) {
          const name = (n: number) => (n < own.length - rimSegments().length - deckSteps().length ? nameOfCollider(n) : n < own.length - rimSegments().length ? "a deck step" : "a kerb segment");
          overlap = `${name(i)} and ${name(j)} by ${f2(ix)} x ${f2(iy)} x ${f2(iz)}m near (${f1(a.minX)}, ${f1(a.minZ)})`;
          break;
        }
      }
    }
  }
  check(!overlap, `no two of the course's colliders overlap${overlap ? `: ${overlap}` : ""}`);
}

/* ------------------------------------------------ the simulation harness */

/** Her, through the real collision code, with the course's own rules on top. */
class Sim {
  cap: Capsule = { x: 0, y: 0, z: 0, hw: PLAYER_W, h: PLAYER_H, hd: PLAYER_W };
  vy = 0;
  grounded = false;
  coyote = 0;
  state: LavaState;
  boxes: AABB[];
  private moveBoxes: AABB[];
  falls = 0;
  lastFall = -10;
  maxStep = 0;
  visited = new Set<number>();
  lowestOverLava = Infinity;

  constructor(x: number, y: number, z: number, t0 = 0) {
    this.state = at(t0);
    const own = lavaColliders(this.state);
    this.moveBoxes = own.slice(0, MOVING.length);
    this.boxes = [...park, ...own];
    this.cap.x = x;
    this.cap.y = y;
    this.cap.z = z;
  }

  get on() {
    return standingOn(this.cap.x, this.cap.y, this.cap.z, this.state);
  }

  /** One fixed step, mirroring runtime.ts: physics, then the course's rules. */
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

    // runtime.ts: lavaWorld.step(dt, cap, grounded) inside physics()
    const before = MOVING.map((p) => pieceAt(p, this.state));
    const riding = this.grounded ? this.ridingIndex(before) : -1;
    stepLavaState(this.state, DT, this.on);
    for (let i = 0; i < MOVING.length; i++) {
      const p = MOVING[i]!;
      const a = before[i]!;
      const b = pieceAt(p, this.state);
      const box = this.moveBoxes[i]!;
      const thick = p.top - p.base;
      box.minX = b.x - p.w / 2;
      box.maxX = b.x + p.w / 2;
      box.minZ = b.z - p.d / 2;
      box.maxZ = b.z + p.d / 2;
      box.minY = p.base === 0 ? 0 : b.top - thick;
      box.maxY = b.top;
      if (i === riding) {
        this.cap.x += b.x - a.x;
        this.cap.z += b.z - a.z;
        this.cap.y += b.top - a.top;
      }
    }

    // runtime.ts: lavaWorld.update(...) in animateWorld()
    const on = this.on;
    if (on != null) this.visited.add(on);
    if (overLava(this.cap.x, this.cap.z)) this.lowestOverLava = Math.min(this.lowestOverLava, this.cap.y);
    if (overLava(this.cap.x, this.cap.z) && this.cap.y < FALL_Y && this.state.t - this.lastFall > 0.8) {
      this.lastFall = this.state.t;
      this.falls++;
      const s = startSpot();
      this.cap.x = s.x;
      this.cap.y = s.y;
      this.cap.z = s.z;
      this.vy = 0;
      this.state.held = 0;
      this.state.away = -1;
    }
  }

  private ridingIndex(before: { x: number; z: number; top: number }[]) {
    for (let i = 0; i < MOVING.length; i++) {
      const p = MOVING[i]!;
      const a = before[i]!;
      if (Math.abs(this.cap.y - a.top) > 0.16) continue;
      if (Math.abs(this.cap.x - a.x) > p.w / 2 + this.cap.hw) continue;
      if (Math.abs(this.cap.z - a.z) > p.d / 2 + this.cap.hd) continue;
      return i;
    }
    return -1;
  }

  /** Walk toward a live target, jumping when `jumpAt` says so. */
  goTo(target: () => [number, number], seconds: number, jumpAt?: (s: Sim) => boolean, speed = WALK) {
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      const [tx, tz] = target();
      const dx = tx - this.cap.x;
      const dz = tz - this.cap.z;
      const d = Math.hypot(dx, dz);
      if (d < 1e-4 || (d < 0.3 && this.grounded)) return true;
      const sp = Math.min(speed, d / DT);
      this.step((dx / d) * sp, (dz / d) * sp, jumpAt ? jumpAt(this) : false);
    }
    return false;
  }

  /** Stand still until her feet are down again. */
  settle(seconds = 2) {
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      this.step(0, 0, false);
      if (i > 8 && this.grounded) return;
    }
  }
}

/* --------------------------------------- 3. every piece is standable */

console.log("\nstandability: she can stand on every piece, at every phase it is up");
{
  for (const p of PIECES) {
    const phases = p.motion.kind === "static" ? [0] : Array.from({ length: 14 }, (_, i) => (i / 14) * 42);
    let bad = "";
    let tried = 0;
    for (const t0 of phases) {
      const s0 = at(t0);
      if (!pieceUsable(p, s0)) continue;
      // a sinking stone is only standable while it is up: give it half a
      // second of grace so the test is about landing, not about the rhythm
      if (!pieceUsable(p, at(t0 + 0.5))) continue;
      const a = pieceAt(p, s0);
      tried++;
      const sim = new Sim(a.x, a.top + 0.25, a.z, t0);
      for (let i = 0; i < 24; i++) sim.step(0, 0, false);
      // she must be standing on this piece, at the height it is at now
      const now = pieceAt(p, sim.state);
      if (sim.on !== p.index || Math.abs(sim.cap.y - now.top) > 0.12) {
        if (!bad)
          bad = `at t=${f1(t0)} she ended at y ${f2(sim.cap.y)} with the top at ${f2(now.top)} (on ${sim.on == null ? "nothing" : PIECES[sim.on]!.id})`;
      }
    }
    check(!bad && tried > 0, `${p.id} (${p.motion.kind}) is standable${bad ? `: ${bad}` : ` at all ${tried} phases tried`}`);
  }

  // and walking the length of every narrow piece never drops her
  for (const p of PIECES.filter((q) => q.kind === "beam" || q.kind === "bridge")) {
    const ax = axisOf(p);
    const sg = signOf(p);
    const half = lenOn(p, ax) / 2 - 0.4;
    const from: [number, number] = ax === "x" ? [p.cx - sg * half, p.cz] : [p.cx, p.cz - sg * half];
    const to: [number, number] = ax === "x" ? [p.cx + sg * half, p.cz] : [p.cx, p.cz + sg * half];
    const sim = new Sim(from[0], p.top + 0.1, from[1], 3.3);
    sim.settle(0.5);
    let lowest = sim.cap.y;
    sim.goTo(() => to, 6, undefined, WALK);
    lowest = Math.min(lowest, sim.cap.y);
    check(
      sim.on === p.index && lowest > p.top - 0.2,
      `she walks the whole length of ${p.id} without dropping through (lowest ${f2(lowest)}m, top ${f2(p.top)}m)`,
    );
  }
}

/* ------------------------------------------------------ 4. the jumps */

/**
 * The take-off window for one hop: the set of positions along the route from
 * which a full-speed jump lands on the target. `phase` is where the course
 * clock is at take-off. Returns the window in metres, and where its middle is
 * relative to the launch piece's leading edge.
 */
/** Is this piece up for the whole of the next `span` seconds? */
function stillThere(p: Piece, from: number, span: number) {
  for (let t = 0; t <= span; t += 0.08) if (!pieceUsable(p, at(from + t))) return false;
  return true;
}

/**
 * Where she comes down if she takes off from (px, pz) at `fromTop`, running
 * flat out at where the target is at that instant. This is exactly what the
 * player does — point her at the next piece and press jump — so the same
 * function measures the windows below and flies her across the course later.
 */
function landing(to: Piece, px: number, pz: number, fromTop: number, t0: number, speed: number) {
  let flight = AIRTIME;
  for (let k = 0; k < 3; k++) {
    const l = pieceAt(to, at(t0 + flight));
    const disc = JUMP * JUMP - 2 * GRAVITY * (l.top - fromTop);
    if (disc < 0) return null;
    flight = (JUMP + Math.sqrt(disc)) / GRAVITY;
  }
  const aim = pieceAt(to, at(t0));
  const dx = aim.x - px;
  const dz = aim.z - pz;
  const d = Math.hypot(dx, dz) || 1;
  const late = at(t0 + flight);
  const land = pieceAt(to, late);
  return {
    x: px + (dx / d) * speed * flight,
    z: pz + (dz / d) * speed * flight,
    flight,
    late,
    land,
    // it has to still be there a moment after she lands, or she is landing on
    // a stone that is already on its way down
    // and still there for the whole of the next couple of seconds, so she can
    // run and jump off it again. Checking one instant 3 seconds out is not the
    // same thing: a sinking stone that has gone down and come back up again by
    // then passes that test and drops her in the meantime.
    ok: pieceUsable(to, late) && stillThere(to, t0 + flight, 2.4),
  };
}

/** Did that jump put her feet on the target? */
function lands(to: Piece, r: ReturnType<typeof landing>) {
  if (!r || !r.ok) return false;
  // never at the lip: a rail stands just outside every platform she lands on
  return Math.abs(r.x - r.land.x) < to.w / 2 - 0.5 && Math.abs(r.z - r.land.z) < to.d / 2 - 0.5;
}

/**
 * The take-off window for one hop: sweep every spot on the launch piece she
 * could be standing, fly the jump above, and measure how far along the route
 * the successful take-off spots stretch. That distance, divided by her running
 * speed, is how many milliseconds of run the jump gives her.
 */
function window(from: Piece, to: Piece, t0: number, speed = WALK) {
  const ax = axisOf(to);
  const sg = signOf(to);
  const s0 = at(t0);
  if (!pieceUsable(from, s0)) return null;
  const f = pieceAt(from, s0);
  const edge = posOn(f, ax) + (sg * lenOn(from, ax)) / 2;
  let lo = Infinity;
  let hi = -Infinity;
  const N = 40;
  const M = 9;
  for (let i = 0; i <= N; i++) {
    const d = (i / N) * (lenOn(from, ax) - 0.3);
    for (let j = 0; j <= M; j++) {
      const lim = acrossOn(from, ax) / 2 - 0.35;
      const a = -lim + (j / M) * 2 * lim;
      const along = edge - sg * d;
      const across = posAcross(f, ax) + a;
      const px = ax === "x" ? along : across;
      const pz = ax === "x" ? across : along;
      if (!lands(to, landing(to, px, pz, f.top, t0, speed))) continue;
      lo = Math.min(lo, d);
      hi = Math.max(hi, d);
    }
  }
  return lo === Infinity ? null : { lo, hi, width: hi - lo };
}

console.log("\nthe jumps: the gap, and the window of take-off points that clears it");
const hops: { from: Piece; to: Piece; best: number; worst: number }[] = [];
{
  console.log(`  (she peaks at ${f2(HEIGHT)}m and a full-speed jump carries her ${f2(REACH)}m)`);
  let lastSection = -1;
  for (let i = 1; i < PIECES.length; i++) {
    const from = PIECES[i - 1]!;
    const to = PIECES[i]!;
    if (to.gap < 0.05) continue;
    const moving = from.motion.kind !== "static" || to.motion.kind !== "static";
    const phases = moving ? Array.from({ length: 48 }, (_, k) => (k / 48) * 42) : [0];
    let best = 0;
    let worst = Infinity;
    for (const t0 of phases) {
      const w = window(from, to, t0);
      const width = w ? w.width : 0;
      best = Math.max(best, width);
      worst = Math.min(worst, width);
    }
    hops.push({ from, to, best, worst });
    if (to.section !== lastSection) {
      lastSection = to.section;
      const gaps = PIECES.filter((p) => p.section === to.section && p.gap > 0.05).map((p) => p.gap);
      if (gaps.length) {
        console.log(
          `  section ${to.section} ${SECTION_NAMES[to.section]}: gaps ${f1(Math.min(...gaps))}-${f1(Math.max(...gaps))}m, ` +
            `margin ${f1(REACH / Math.max(...gaps))}x her reach`,
        );
      }
    }
    // The real gap is the shortest way from one footprint to the other, which
    // for a zig-zag is a diagonal and longer than the gap in the plan. For a
    // moving piece it is how far apart they are at their closest, because that
    // is the moment she is waiting for.
    let real = Infinity;
    for (const t of moving ? phases : [0]) {
      const a0 = pieceAt(from, at(t));
      const b0 = pieceAt(to, at(t));
      const dx = Math.max(0, Math.abs(a0.x - b0.x) - (from.w + to.w) / 2);
      const dz = Math.max(0, Math.abs(a0.z - b0.z) - (from.d + to.d) / 2);
      real = Math.min(real, Math.hypot(dx, dz));
    }
    check(
      real * 1.55 <= REACH,
      `${from.id} to ${to.id}: ${f2(real)}m to cross${moving ? " at its closest" : real - to.gap > 0.15 ? " (a diagonal)" : ""}, ` +
        `${f1(REACH / Math.max(0.01, real))}x her ${f2(REACH)}m reach`,
    );
    const rise = to.top - from.top;
    check(
      rise < HEIGHT - 1.2,
      `${from.id} to ${to.id}: rise ${f2(rise)}m, far under her ${f2(HEIGHT)}m jump`,
    );
    /*
     * Going down is free — she cannot fail to fall — so a drop is allowed to
     * be bigger than a climb. What it must not be is a drop she cannot judge
     * from the top: past about three and a half metres the landing is out of
     * frame as she jumps, and it has to be long enough to catch her running.
     */
    check(
      rise > -3.5 && (rise > -1.6 || lenOn(to, axisOf(to)) >= 6.0),
      `${from.id} to ${to.id}: drop ${f2(-rise)}m onto ${f1(lenOn(to, axisOf(to)))}m of landing`,
    );
    check(
      best > 0.35,
      `${from.id} to ${to.id}: a ${(best * 1000 / WALK).toFixed(0)}ms take-off window (${f2(best)}m of run)` +
        (moving ? `, and it is open at ${phases.filter((t) => (window(from, to, t)?.width ?? 0) > 0.2).length} of ${phases.length} phases` : ""),
    );
  }
  const tightest = hops.reduce((a, b) => (b.best < a.best ? b : a));
  console.log(`  tightest jump on the course: ${tightest.from.id} to ${tightest.to.id}, ${f2(tightest.best)}m (${(tightest.best * 1000 / WALK).toFixed(0)}ms)`);
  // the curve has to actually rise: the last section must be tighter than the first
  const s1 = hops.filter((h) => h.to.section === 1).reduce((a, b) => Math.min(a, b.best), Infinity);
  const s5 = hops.filter((h) => h.to.section === 5).reduce((a, b) => Math.min(a, b.best), Infinity);
  check(s5 < s1 * 0.8, `the difficulty rises: section 1's tightest window is ${f2(s1)}m, section 5's is ${f2(s5)}m`);
}

/* --------------------------------------------- 5. crossing the whole course */

/**
 * Aim the jump: while she runs at the next piece, work out where she would
 * land if she took off now, and jump when that lands her on it. If she runs
 * out of piece without a good moment she stops, backs up and runs again —
 * which is exactly what waiting for a raft looks like.
 */
function hopTo(s: Sim, from: Piece, to: Piece, speed = WALK): boolean {
  const ax = axisOf(to);
  const sg = signOf(to);
  /** the leading edge of the piece she is on, read live: it may be moving */
  const edgeNow = () => posOn(pieceAt(from, s.state), ax) + (sg * lenOn(from, ax)) / 2;
  const aimGood = () => {
    if (!s.grounded) return false;
    return lands(to, landing(to, s.cap.x, s.cap.z, s.cap.y, s.state.t, speed));
  };
  // a whole orbit of the slowest thing on the course is 10.5s: give every hop
  // long enough to wait one out, and keep running at it until it opens
  const deadline = s.state.t + 34;
  for (let attempt = 0; attempt < 60 && s.state.t < deadline; attempt++) {
    // line up across the route, and (after a failed charge) back up for a run
    const lineUp = (): [number, number] => {
      const a = pieceAt(to, s.state);
      const f = pieceAt(from, s.state);
      const backOn = edgeNow() - sg * Math.min(lenOn(from, ax) - 0.7, 3.4);
      const along = attempt === 0 ? posOn({ x: s.cap.x, z: s.cap.z }, ax) : backOn;
      // stay on `from` across the route, as near the target's line as it allows
      const lim = acrossOn(from, ax) / 2 - 0.45;
      const want = posAcross(a, ax);
      const have = posAcross(f, ax);
      const across = have + Math.max(-lim, Math.min(lim, want - have));
      return ax === "x" ? [along, across] : [across, along];
    };
    // on a stone that is about to sink there is no time to shuffle about
    s.goTo(lineUp, from.motion.kind === "sink" ? 0.8 : 2.6);
    let jumped = false;
    let flew = false;
    let takeoff = s.cap.y;
    for (let i = 0; i < 300; i++) {
      const a = pieceAt(to, s.state);
      const dx = a.x - s.cap.x;
      const dz = a.z - s.cap.z;
      const d = Math.hypot(dx, dz) || 1;
      // stop before the lip: running off the end is a fall, and a player who
      // has not found the moment turns round and lines up again instead
      if (!jumped) {
        const here = { x: s.cap.x, z: s.cap.z };
        const nextPast = (posOn(here, ax) + sg * speed * DT - edgeNow()) * sg;
        if (nextPast > -0.05) break;
      }
      const want = !jumped && aimGood();
      if (want) {
        jumped = true;
        takeoff = s.cap.y;
      }
      s.step((dx / d) * speed, (dz / d) * speed, want);
      // grounded is still true on the frame the jump starts, so wait until she
      // is genuinely in the air before judging where she came down
      if (jumped && s.cap.y > takeoff + 0.5) flew = true;
      if (flew && s.grounded) {
        // step in off the lip (or off the podium's kerb) before judging
        for (let k = 0; k < 24; k++) {
          const b = pieceAt(to, s.state);
          const dx2 = b.x - s.cap.x;
          const dz2 = b.z - s.cap.z;
          const d3 = Math.hypot(dx2, dz2) || 1;
          s.step((dx2 / d3) * Math.min(WALK, d3 * 3), (dz2 / d3) * Math.min(WALK, d3 * 3), false);
        }
        s.settle(0.35);
        if (s.on === to.index) {
          if (process.env.TRACE && to.motion.kind === "sink") {
            let left = 0;
            while (pieceUsable(to, at(s.state.t + left)) && left < 6) left += 0.05;
            console.log(`    [trace] landed on ${to.id} at t=${f1(s.state.t)} with ${left.toFixed(2)}s of it left`);
          }
          return true;
        }
        break;
      }
      if (s.falls > 0) {
        if (process.env.TRACE) console.log(`    [trace] ${from.id}->${to.id}: fell mid-charge on attempt ${attempt}, jumped=${jumped}, t=${f1(s.state.t)}`);
        return false;
      }
    }
    if (s.falls > 0) {
      if (process.env.TRACE) console.log(`    [trace] ${from.id}->${to.id}: fell on attempt ${attempt} at (${f1(s.cap.x)}, ${f2(s.cap.y)}, ${f1(s.cap.z)})`);
      return false;
    }
    if (s.on === to.index) return true;
    if (s.on !== from.index) {
      if (process.env.TRACE) console.log(`    [trace] ${from.id}->${to.id}: left ${from.id} onto ${s.on == null ? "nothing" : PIECES[s.on]!.id} at (${f1(s.cap.x)}, ${f2(s.cap.y)}, ${f1(s.cap.z)})`);
      return false;
    }
  }
  if (process.env.TRACE) console.log(`    [trace] ${from.id}->${to.id}: ran out of attempts at (${f1(s.cap.x)}, ${f2(s.cap.y)}, ${f1(s.cap.z)})`);
  return false;
}

function crossing(t0: number, speed = WALK) {
  const s = new Sim(LAVA_START[0] + 2, 0.4, LAVA_START[1], t0);
  s.goTo(() => [DECK.cx, DECK.cz], 10);
  s.settle(0.6);
  if (s.on !== DECK.index) return { s, failed: "the deck" };
  for (let i = 1; i < PIECES.length; i++) {
    if (!hopTo(s, PIECES[i - 1]!, PIECES[i]!, speed)) return { s, failed: PIECES[i]!.id };
  }
  return { s, failed: null as string | null };
}

console.log("\ncrossing the whole course, through the real physics");
{
  let ok = true;
  for (let k = 0; k < 6; k++) {
    const t0 = (k / 6) * 42 + 0.7;
    const { s, failed } = crossing(t0);
    if (failed) {
      ok = false;
      check(false, `from course phase ${f1(t0)}s she could not reach ${failed} (stopped at (${f1(s.cap.x)}, ${f2(s.cap.y)}, ${f1(s.cap.z)}), ${s.falls} falls)`);
      break;
    }
    check(s.maxStep < 1.0, `phase ${f1(t0)}s: crossed with no teleport (largest move ${f2(s.maxStep)}m in a frame)`);
    check(s.visited.size >= PIECES.length, `phase ${f1(t0)}s: she stood on all ${PIECES.length} pieces`);
    check(s.falls === 0, `phase ${f1(t0)}s: an aimed run crosses without falling in (${s.falls} falls)`);
    check(s.lowestOverLava > LAVA_SURFACE + 0.3, `phase ${f1(t0)}s: she never gets near the lava itself (lowest ${f2(s.lowestOverLava)}m)`);
  }
  check(ok, "the whole course is completable from every course phase tried");

  // on a juice box she is much faster; she must still not get stuck anywhere
  // on a juice box she is nearly twice as fast and will overshoot; what has to
  // hold is that she is never left stuck, only ever bounced back to the start
  const fast = crossing(4.4, WALK * BOOST_MULTIPLIER);
  fast.s.settle(2);
  check(
    fast.s.on != null || fast.s.cap.y < LAVA_SURFACE,
    `on a juice box (${BOOST_MULTIPLIER}x) she always ends up somewhere real (on ${fast.s.on == null ? "the lawn" : PIECES[fast.s.on]!.id}, ${fast.s.falls} falls)`,
  );
}

/* ------------------------------------------------ 6. falling in the lava */

/** A point over the lake that no piece can ever reach. */
function openLavaSpot(): [number, number] {
  for (let x = LAVA_POOL.minX + 1; x < LAVA_POOL.maxX; x += 1)
    for (let z = LAVA_POOL.minZ + 1; z < LAVA_POOL.maxZ; z += 1) {
      const clear = PIECES.every((p) => {
        const reach = p.motion.kind === "slide" ? p.motion.travel : p.motion.kind === "orbit" ? p.motion.r * 2 : 0;
        return Math.abs(x - p.cx) > p.w / 2 + reach + 2 || Math.abs(z - p.cz) > p.d / 2 + reach + 2;
      });
      if (clear) return [x, z];
    }
  return [LAVA_POOL.minX + 1, LAVA_POOL.minZ + 1];
}

console.log("\nfalling in: always back to the start deck");
{
  const home = startSpot();
  let bad = "";
  let tested = 0;
  for (let x = LAVA_POOL.minX + 1; x < LAVA_POOL.maxX; x += 3) {
    for (let z = LAVA_POOL.minZ + 1; z < LAVA_POOL.maxZ; z += 3) {
      for (const k of [0, 1, 2]) {
        const t0 = (k / 3) * 42;
        const s0 = at(t0);
        // skip anywhere a piece can be while she is falling, including every
        // position a raft or an arm sweeps through
        if (PIECES.some((p) => {
          const reach =
            p.motion.kind === "slide" || p.motion.kind === "shuttle"
              ? p.motion.travel
              : p.motion.kind === "orbit"
                ? p.motion.r * 2
                : 0;
          return Math.abs(x - p.cx) < p.w / 2 + reach + 1.4 && Math.abs(z - p.cz) < p.d / 2 + reach + 1.4;
        }))
          continue;
        // the stairs and their rails are solid ground over the lake too
        if ([...deckSteps(), ...podiumSteps()].some((st) => Math.abs(x - st.cx) < st.w / 2 + 1.2 && Math.abs(z - st.cz) < st.d / 2 + 1.2))
          continue;
        tested++;
        const s = new Sim(x, 7, z, t0);
        for (let i = 0; i < 200; i++) s.step(0, 0, false);
        if (s.on !== DECK.index) {
          if (!bad) bad = `dropped at (${f1(x)}, ${f1(z)}) t=${f1(t0)}: ended at (${f1(s.cap.x)}, ${f2(s.cap.y)}, ${f1(s.cap.z)}) on ${s.on == null ? "nothing" : PIECES[s.on]!.id}`;
        }
      }
    }
  }
  check(bad === "", `all ${tested} drops into the lava put her back on the start deck, standing${bad ? ` (${bad})` : ""}`);
  check(
    Math.abs(home.y - DECK.top - 0.08) < 1e-9 && Math.abs(home.z - DECK.cz) < 1e-9,
    `the restart spot is on the deck at (${f1(home.x)}, ${f2(home.y)}, ${f1(home.z)}), facing the first stone`,
  );
  // she is put down pointing at the course, not at the lawn
  const first = PIECES[1]!;
  const wantYaw = Math.atan2(-(first.cx - DECK.cx), -(first.cz - DECK.cz));
  check(Math.abs(home.yaw - wantYaw) < 1e-9, "and facing the way the course goes");

  // the give-way plank is back up for the next attempt
  const open = openLavaSpot();
  const s = new Sim(open[0], 7, open[1], 9);
  for (let i = 0; i < 200; i++) s.step(0, 0, false);
  check(s.state.away < 0 && s.falls === 1, "a fall resets the give-way plank for the next attempt");
}

/* ------------------------------------------------------- 7. no traps */

console.log("\nnowhere to get stuck");
{
  const shove = (x: number, y: number, z: number, hx: number, hz: number, seconds: number, t0 = 2.6) => {
    const s = new Sim(x, y, z, t0);
    for (let i = 0; i < Math.round(seconds * 60); i++) s.step(hx * WALK, hz * WALK, false);
    s.settle(3);
    return s;
  };
  let stranded = "";
  for (const p of PIECES) {
    const a = pieceAt(p, at(2.6));
    if (!pieceUsable(p, at(2.6))) continue;
    for (const [hx, hz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
      const s = shove(a.x, a.top + 0.05, a.z, hx, hz, 3.5);
      const onLawn = s.cap.y < LAVA_SURFACE;
      if (s.on == null && !onLawn && !stranded) {
        stranded = `${p.id} pushed (${hx}, ${hz}) ended at (${f1(s.cap.x)}, ${f2(s.cap.y)}, ${f1(s.cap.z)})`;
      }
    }
  }
  check(!stranded, `shoved off every piece in every direction she lands somewhere real${stranded ? `: ${stranded}` : ""}`);

  // onto the deck from all round the lawn it stands on
  let cannot = "";
  for (let a = 0; a < 10; a++) {
    const ang = (a / 10) * Math.PI * 2;
    const sx = LAVA_START[0] + Math.cos(ang) * 10;
    const sz = LAVA_START[1] + Math.sin(ang) * 10;
    if (overLava(sx, sz)) continue;
    if (Math.abs(sx - DECK.cx) < DECK.w / 2 + 0.6 && Math.abs(sz - DECK.cz) < DECK.d / 2 + 0.6) continue;
    const s = new Sim(sx, 0.4, sz, 0.4);
    // round to the foot of the steps first, the way anyone walks up a flight
    // out east clear of the deck and its stair rails, then round to the foot
    // of the flight, the way anyone walks up a stair
    s.goTo(() => [LAVA_START[0] + 7, sz], 12);
    s.goTo(() => [LAVA_START[0] + 7, DECK.cz], 12);
    s.goTo(() => LAVA_START, 12);
    s.goTo(() => [DECK.cx, DECK.cz], 12);
    s.settle(0.6);
    if (s.on !== DECK.index && !cannot) cannot = `from (${f1(sx)}, ${f1(sz)}) she ended at (${f1(s.cap.x)}, ${f2(s.cap.y)}, ${f1(s.cap.z)})`;
  }
  check(!cannot, `she can walk onto the start deck from anywhere on the lawn round it${cannot ? `: ${cannot}` : ""}`);

  /**
   * Walk out from the middle of a platform in 16 directions, at full speed, and
   * see what happens. Winning the course and then being told "Whoops! Hot
   * floor! Start again" for stepping down would take the win straight back off
   * her, so the podium has to have a way off on foot, and every other way off
   * has to be a wall rather than a surprise.
   */
  const walkOut = (p: Piece, allowFall: (hx: number, hz: number) => boolean, name: string) => {
    let bad = "";
    let stairs = 0;
    let walls = 0;
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      const hx = Math.cos(ang);
      const hz = Math.sin(ang);
      const s = shove(p.cx, p.top + 0.05, p.cz, hx, hz, 3.2);
      const fell = s.falls > 0;
      const safe = !fell && s.cap.y > -0.01;
      if (fell && allowFall(hx, hz)) continue;
      if (fell) {
        if (!bad) bad = `heading ${(ang * 57.3).toFixed(0)} degrees she fell in and was sent back to the start`;
        continue;
      }
      if (!safe && !bad) bad = `heading ${(ang * 57.3).toFixed(0)} degrees she ended at (${f1(s.cap.x)}, ${f2(s.cap.y)}, ${f1(s.cap.z)})`;
      // still up on the platform means a parapet stopped her; down on the
      // ground means she walked out on a stair
      if (s.cap.y < LAVA_SURFACE) stairs++;
      else walls++;
    }
    check(!bad, `${name}: all 16 ways out are a stair or a wall, never a fall${bad ? ` — ${bad}` : ""} (${stairs} walked down, ${walls} blocked)`);
  };

  // The podium: the only way off that is a drop is straight back out the way
  // she flew in, over a kerb between two rock posts, down the course she just
  // crossed. Every other heading is the winner's stair or a rail.
  {
    const bx = -DX[PODIUM.dir];
    const bz = -DZ[PODIUM.dir];
    walkOut(PODIUM, (hx, hz) => hx * bx + hz * bz > 0.84, "off the podium after winning");
    const rails = parapets();
    check(rails.some((r) => r.kerb), "the podium's arrival face carries a kerb, so the edge reads as an edge");
    check(rails.filter((r) => r.post).length === 2, "and a rock post at each corner of it");
    check(
      rails.every((r) => r.kerb || r.post || r.top - r.over > STEP_UP),
      "every rail (as opposed to kerb) is taller than the step-up, so she cannot stroll over one",
    );
  }

  // the deck: only the way the course goes may be a drop, and it is a drop
  // she can see, over a kerb, with the first stone in front of her
  {
    const fx = DX[PODIUM.dir === PODIUM.dir ? DECK.dir : DECK.dir];
    const fz = DZ[DECK.dir];
    // the deck's front face IS the course; anything with a component that way
    // may end in the lake, and it is a drop she can see with a stone in front
    // of her. Everything else has to be a stair or a wall.
    walkOut(DECK, (hx, hz) => hx * fx + hz * fz > 0.2, "backing off the start deck");
  }

  // and the winner's stair really does reach dry land
  {
    const last = podiumSteps()[0]!;
    check(!overLava(last.cx - 1.2, last.cz), `the winner's stair comes out past the kerb onto the bank at x ${f1(last.cx)}`);
    let worst = 0;
    let prev = 0;
    for (const st of podiumSteps()) {
      worst = Math.max(worst, st.top - prev);
      prev = st.top;
    }
    check(worst <= STEP_UP, `the winner's stair is walked, not jumped (worst rise ${f2(worst)}m)`);
  }

  // the parapets are walls, not ledges to stand about on or roofs to bonk
  {
    let low = "";
    for (const w of parapets()) {
      if (!w.kerb && !w.post && w.top - w.over <= STEP_UP && !low) low = `one is only ${f2(w.top - w.over)}m above what it guards`;
    }
    check(!low, `every parapet is taller than the ${STEP_UP}m step-up, so she cannot stroll over one${low ? `: ${low}` : ""}`);
  }

  // the steps on are walked, never jumped
  for (const [name, steps] of [["the deck steps", deckSteps()]] as [string, { top: number }[]][]) {
    let prev = 0;
    let worst = 0;
    for (const st of steps) {
      worst = Math.max(worst, st.top - prev);
      prev = st.top;
    }
    check(worst <= STEP_UP, `${name}: every rise is under the ${STEP_UP}m step-up (worst ${f2(worst)}m)`);
  }

  // the kerb keeps her out of the lake at ground level
  {
    const rims = rimSegments();
    check(rims.length > 0, `the lake has a rock kerb (${rims.length} segments)`);
    let walkedIn = "";
    for (let z = LAVA_POOL.minZ + 2; z < LAVA_POOL.maxZ; z += 4) {
      for (const [x, hx] of [[LAVA_POOL.minX - 4, 1], [LAVA_POOL.maxX + 4, -1]] as [number, number][]) {
        if (overLava(x, z)) continue;
        const s = shove(x, 0.2, z, hx, 0, 2.5);
        if (s.falls === 0 && overLava(s.cap.x, s.cap.z) && s.cap.y < FALL_Y && !walkedIn) {
          walkedIn = `at z ${f1(z)} from x ${f1(x)} she ended at (${f1(s.cap.x)}, ${f2(s.cap.y)})`;
        }
      }
    }
    check(!walkedIn, `she cannot stroll in over the kerb${walkedIn ? `: ${walkedIn}` : ""}`);
  }

  // head room over every piece
  {
    const own = lavaColliders(at(0));
    let worstHead = Infinity;
    let where = "";
    for (const p of PIECES) {
      const a = pieceAt(p, at(0));
      for (const b of own) {
        if (a.x <= b.minX || a.x >= b.maxX || a.z <= b.minZ || a.z >= b.maxZ) continue;
        if (b.minY < a.top + 0.01) continue;
        if (b.minY - a.top < worstHead) {
          worstHead = b.minY - a.top;
          where = p.id;
        }
      }
    }
    check(worstHead > PLAYER_H + 0.3, `open sky over every piece${where ? ` (worst ${f2(worstHead)}m over ${where})` : ""}`);
  }
}

/* ---------------------------------------------------------- the prize */

console.log("\nthe prize");
{
  check(lavaTickets(true) > lavaTickets(false), `the first crossing pays more (${lavaTickets(true)} tickets, then ${lavaTickets(false)})`);
  const { s, failed } = crossing(11.3);
  check(failed == null && s.on === PODIUM.index, "a crossing ends standing on the prize podium");
}

/* ------------------------------------------------- where followers wait */

// Her pets (park 1) and the freed candy creatures (Sugar Rush) wait beside
// the steps while she is on the course; the spot has to be open ground she
// is not on her way through, not in the lava and not inside anything.
const onLavaStairs = (x: number, z: number) => deckSteps().some((st) => Math.abs(x - st.cx) < st.w / 2 + 0.4 && Math.abs(z - st.cz) < st.d / 2 + 0.4);
for (let i = 0; i < 4; i++) {
  const [x, z] = lavaWaitSpot(i);
  const inside = [...park, ...lavaColliders(newLavaState())].some(
    (b) => x > b.minX - 0.3 && x < b.maxX + 0.3 && z > b.minZ - 0.3 && z < b.maxZ + 0.3 && b.maxY > 0.3 && b.minY < 1,
  );
  const [sx, sz] = LAVA_START;
  check(!inside && !overLava(x, z) && Math.hypot(x - sx, z - sz) > 1.8 && !onLavaStairs(x, z), `follower ${i + 1} waits on open ground beside the way in (${f1(x)}, ${f1(z)})`);
}

/* ---------------------------------------------------------------- summary */

const site = lavaFootprint(0);
const gaps = PIECES.filter((p) => p.gap > 0.05).map((p) => p.gap);
console.log(
  failures
    ? `\n${failures} failure(s), ${passes} passed`
    : `\nall ${passes} Floor is Lava checks passed` +
      `\n  site: x ${f1(site.minX)}..${f1(site.maxX)}, z ${f1(site.minZ)}..${f1(site.maxZ)}` +
      `\n  ${PIECES.length} pieces, ${MOVING.length} of them moving, in ${SECTION_NAMES.length - 1} sections` +
      `\n  gaps ${f1(Math.min(...gaps))}..${f1(Math.max(...gaps))}m against a ${f2(REACH)}m reach` +
      `\n  tightest take-off window ${f2(hops.reduce((a, b) => Math.min(a, b.best), Infinity))}m` +
      `\n  ${lavaColliders(newLavaState()).length} colliders, ${rimSegments().length} kerb segments`,
);
process.exit(failures ? 1 : 0);
