/**
 * The walkway network, the arrival plaza and the signs.
 *
 * Nothing in this environment can see, so this is what stands in for looking
 * at the paths:
 *
 *  - every walkway prop is checked against every other solid in the park, so
 *    a path can never be laid through a bench, a hedge or a wall;
 *  - she is walked through the real collision code (collision.ts) from the
 *    spawn along the graph to every node, which proves the network is
 *    connected and that no kerb, sign post or junction pad stops her;
 *  - the flat layers are checked for the z-fighting the layout checker looks
 *    for, and for the 0.12m kerb Emmett's trike has to be able to ride over;
 *  - every sign is checked: post clear of the paths, board facing a side she
 *    can actually stand on, and the arrows it will paint.
 *
 * Run: npx jiti tools/paths.ts   (exits 1 on any failure)
 */
import { LEVELS } from "../src/game/levels";
import { collidersFor } from "../src/game/colliders";
import { moveAndCollide, type AABB, type Capsule } from "../src/game/collision";
import { PLAYER_H, PLAYER_W, WALK } from "../src/game/tuning";
import { EDGES, NODES, PAD_TOP, PATH_TOP, EDGE_TOP, edgeRect, padRect, padSize } from "../src/game/walkways";
import { PARK_DIRECTORIES, PARK_NAME_SIGNS, NAME_BOARD, NAME_POST_DX, arrowFor, DIR_VEC } from "../src/game/signs";
import { PLAZA } from "../src/game/plaza";

const level = LEVELS[0]!;
const boxes = collidersFor(level);
const DT = 1 / 60;
let failures = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failures++;
};
const f1 = (n: number) => n.toFixed(1);

/* ------------------------------------------------- 1. nothing in the way */

console.log("walkways against everything else");
{
  const rects = [
    ...Object.keys(NODES)
      .map((id) => ({ id, r: padRect(id) }))
      .filter((p): p is { id: string; r: NonNullable<ReturnType<typeof padRect>> } => p.r != null)
      .map((p) => ({ label: `pad ${p.id}`, r: p.r })),
    ...EDGES.map((e) => ({ label: `path ${e.a}-${e.b}`, r: edgeRect(e) })),
  ];
  const bad: string[] = [];
  for (const { label, r } of rects) {
    for (const b of boxes) {
      // only things she would have to walk round: anything above the kerb
      if (b.maxY <= 0.35) continue;
      // and not a roof or a gantry she walks under
      if (b.minY > 1.9) continue;
      const ox = Math.min(r.maxX, b.maxX) - Math.max(r.minX, b.minX);
      const oz = Math.min(r.maxZ, b.maxZ) - Math.max(r.minZ, b.minZ);
      if (ox <= 0.02 || oz <= 0.02) continue;
      bad.push(`${label} runs into ${b.label} at (${f1((b.minX + b.maxX) / 2)}, ${f1((b.minZ + b.maxZ) / 2)}) by ${ox.toFixed(2)}x${oz.toFixed(2)}m`);
    }
  }
  check(bad.length === 0, `no walkway crosses anything solid (${rects.length} slabs and pads)`);
  for (const line of bad.slice(0, 20)) console.log(`       ${line}`);
}

/* --------------------------------------------------------- 2. the layers */

console.log("\nflat layers");
{
  check(PAD_TOP < PATH_TOP - 0.012, `junction pads (${PAD_TOP}) clear of the slabs (${PATH_TOP}) by more than 1.2cm`);
  check(PATH_TOP < 0.1, `slabs are under the 0.1m "is anything solid here" cutoff (${PATH_TOP})`);
  check(PATH_TOP <= 0.12 && PAD_TOP <= 0.12, "a trike (0.12m kerbs) can ride onto any walkway");
  check(EDGE_TOP > PATH_TOP + 0.012, `edging (${EDGE_TOP}) stands proud of the slabs`);
  // the kerb she steps up from grass, and from a pad onto a slab
  check(PATH_TOP <= 0.62 && PATH_TOP - PAD_TOP <= 0.62, "every step up is inside the 0.62m step-up");
}

/* ------------------------------------------------ 3. walking the network */

console.log("\nwalking the network from the spawn");

function settle(c: Capsule) {
  for (let i = 0; i < 12; i++) moveAndCollide(c, 0, -1, 0, boxes, DT, level.groundY);
}

/** Walk a list of waypoints; returns how far short she ended up. */
function walkRoute(from: [number, number], points: [number, number][]) {
  const c: Capsule = { x: from[0], y: 0, z: from[1], hw: PLAYER_W, h: PLAYER_H, hd: PLAYER_W };
  settle(c);
  let vy = 0;
  let stuck = 0;
  for (const [tx, tz] of points) {
    for (let i = 0; i < 60 * 30; i++) {
      const dx = tx - c.x;
      const dz = tz - c.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.3) break;
      const px = c.x;
      const pz = c.z;
      const sp = Math.min(WALK, d / DT);
      vy -= 23 * DT;
      vy = moveAndCollide(c, (dx / d) * sp, vy, (dz / d) * sp, boxes, DT, level.groundY).vy;
      if (Math.hypot(c.x - px, c.z - pz) < WALK * DT * 0.25) stuck++;
      else stuck = 0;
      if (stuck > 30) return { short: d, at: [c.x, c.z] as [number, number] };
    }
  }
  const [lx, lz] = points[points.length - 1]!;
  return { short: Math.hypot(lx - c.x, lz - c.z), at: [c.x, c.z] as [number, number] };
}

/**
 * The plaza is open paving rather than an edge of the graph, so the two ends
 * of it are joined here by hand, round the east side of the middle planter:
 * that is the way she actually walks from where she lands to the crossroads.
 */
const PLAZA_LINK = { a: "J0", b: "PLZ", via: [[4.8, 8.5], [4.8, 19.0]] as [number, number][] };

/** Shortest route through the graph from J0 to every node (breadth first). */
function routes() {
  const adj = new Map<string, string[]>();
  for (const e of [...EDGES, { a: PLAZA_LINK.a, b: PLAZA_LINK.b }]) {
    adj.set(e.a, [...(adj.get(e.a) ?? []), e.b]);
    adj.set(e.b, [...(adj.get(e.b) ?? []), e.a]);
  }
  // start where she lands, at the south edge of the plaza
  const from = new Map<string, string[]>([["PLZ", ["PLZ"]]]);
  const q = ["PLZ"];
  while (q.length) {
    const cur = q.shift()!;
    for (const next of adj.get(cur) ?? []) {
      if (from.has(next)) continue;
      from.set(next, [...from.get(cur)!, next]);
      q.push(next);
    }
  }
  return from;
}

const paths = routes();
check(paths.size === Object.keys(NODES).length, `every node is connected to the plaza (${paths.size}/${Object.keys(NODES).length})`);
{
  const spawn: [number, number] = [level.spawn[0], level.spawn[2]];
  let worst = 0;
  let worstId = "";
  const fails: string[] = [];
  for (const [id, route] of paths) {
    const points: [number, number][] = [];
    route.forEach((n, i) => {
      const prev = route[i - 1];
      if (prev && ((prev === PLAZA_LINK.a && n === PLAZA_LINK.b) || (prev === PLAZA_LINK.b && n === PLAZA_LINK.a))) {
        const via = prev === PLAZA_LINK.a ? PLAZA_LINK.via : [...PLAZA_LINK.via].reverse();
        points.push(...via);
      }
      points.push([NODES[n]!.x, NODES[n]!.z]);
    });
    const r = walkRoute(spawn, points);
    if (r.short > 0.6) {
      fails.push(`${id}: stopped ${f1(r.short)}m short at (${f1(r.at[0])}, ${f1(r.at[1])})`);
    }
    if (r.short > worst) {
      worst = r.short;
      worstId = id;
    }
  }
  check(fails.length === 0, `she walks from the spawn to all ${paths.size} junctions and entrances (worst ${f1(worst)}m at ${worstId || "-"})`);
  for (const line of fails.slice(0, 20)) console.log(`       ${line}`);
}

/* ------------------------------------------------------------ 4. the signs */

console.log("\nsigns");
{
  const walkRects = [
    ...EDGES.map((e) => edgeRect(e)),
    ...Object.keys(NODES)
      .map((id) => padRect(id))
      .filter((r): r is NonNullable<typeof r> => r != null),
  ];
  const onPath = (x: number, z: number) =>
    walkRects.some((r) => x > r.minX - 0.2 && x < r.maxX + 0.2 && z > r.minZ - 0.2 && z < r.maxZ + 0.2);

  let bad = 0;
  for (const d of PARK_DIRECTORIES) {
    const across = d.faces[0] === "N" || d.faces[0] === "S";
    for (const s of [-1, 1]) {
      const px = d.x + (across ? s * 0.9 : 0);
      const pz = d.z + (across ? 0 : s * 0.9);
      if (onPath(px, pz)) {
        bad++;
        console.log(`       directory at (${d.x}, ${d.z}): post (${f1(px)}, ${f1(pz)}) stands on a path`);
      }
    }
    for (const face of d.faces) {
      const lines = d.exits.map((e) => ({ e, a: arrowFor(face, e.dir) })).filter((l) => l.a);
      if (!lines.length) {
        bad++;
        console.log(`       directory at (${d.x}, ${d.z}) face ${face}: nothing to show`);
      }
    }
  }
  for (const n of PARK_NAME_SIGNS) {
    const across = n.face === "N" || n.face === "S";
    for (const s of [-1, 1]) {
      const px = n.x + (across ? s * 1.25 : 0);
      const pz = n.z + (across ? 0 : s * 1.25);
      if (onPath(px, pz)) {
        bad++;
        console.log(`       "${n.name}": post (${f1(px)}, ${f1(pz)}) stands on a path`);
      }
    }
    // she has to be able to stand where the sign is facing and see it
    const [dx, dz] = DIR_VEC[n.face];
    const spot: [number, number] = [n.x + dx * 4, n.z + dz * 4];
    const blocked = boxes.some(
      (b) =>
        spot[0] > b.minX - 0.4 && spot[0] < b.maxX + 0.4 && spot[1] > b.minZ - 0.4 && spot[1] < b.maxZ + 0.4 && b.maxY > 0.62,
    );
    if (blocked) {
      bad++;
      console.log(`       "${n.name}": nowhere to stand 4m to the ${n.face} of it`);
    }
  }
  check(bad === 0, `${PARK_DIRECTORIES.length} directories and ${PARK_NAME_SIGNS.length} name boards stand clear and face somewhere she can stand`);

  // what the plaza signpost will actually paint, for a human to sanity-check
  const main = PARK_DIRECTORIES[0]!;
  for (const face of main.faces) {
    const lines = main.exits
      .map((e) => ({ label: e.label, arrow: arrowFor(face, e.dir) }))
      .filter((l) => l.arrow);
    console.log(`       plaza signpost, read from the ${face}: ${lines.map((l) => `${l.arrow} ${l.label}`).join(" | ")}`);
  }
}

/* ------------------------------------------- 4b. nothing crosses the lettering */

/**
 * A board with something in front of it is unreadable, and "lots of overlap /
 * intersect blocking letters" is exactly what the first playtest of the
 * signage came back with. Every painted board in signs.ts gets its box here
 * and is checked against every solid in the park and against every other
 * board. The sign's own two posts are excepted — the board is mounted on
 * them — but nothing else is, so a lamp post, a hedge, a tree or a second
 * sign creeping in front of the letters fails this.
 *
 * What it does not catch, and what a human still has to look at: anything
 * drawn without a collider behind it (bunting, a hedge's trim, a tree's
 * canopy), and anything standing beside a board rather than inside it that
 * still lands between her and the lettering from where she reads it.
 */
console.log("\nnothing in front of the lettering");
{
  type Box = { label: string; sign: string; minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
  const at = (label: string, sign: string, x: number, y: number, z: number, sx: number, sy: number, sz: number): Box => ({
    label,
    sign,
    minX: x - sx / 2,
    maxX: x + sx / 2,
    minY: y - sy / 2,
    maxY: y + sy / 2,
    minZ: z - sz / 2,
    maxZ: z + sz / 2,
  });

  const boards: Box[] = [];
  /** The two posts signs.ts puts under each sign, which its board may sit on. */
  const ownPosts = new Set<string>();
  const postKey = (x: number, z: number) => `${x.toFixed(2)},${z.toFixed(2)}`;

  const DIR_BOARD_D = 0.14;
  for (const d of PARK_DIRECTORIES) {
    const base = d.h ?? 1.5;
    const rowH = 0.62;
    const boardW = 2.6;
    const acrossPosts = d.faces[0] === "N" || d.faces[0] === "S";
    for (const s of [-1, 1]) {
      ownPosts.add(postKey(d.x + (acrossPosts ? s * 0.9 : 0), d.z + (acrossPosts ? 0 : s * 0.9)));
    }
    const name = `directory (${d.x}, ${d.z})`;
    for (const face of d.faces) {
      const rows = d.exits.filter((e) => arrowFor(face, e.dir) != null).length;
      if (!rows) continue;
      const h = rows * rowH;
      const [dx, dz] = DIR_VEC[face];
      const across = face === "N" || face === "S";
      boards.push(
        at(
          `${name} face ${face}`,
          name,
          d.x + dx * 0.08,
          base + h / 2,
          d.z + dz * 0.08,
          across ? boardW : DIR_BOARD_D,
          h,
          across ? DIR_BOARD_D : boardW,
        ),
      );
    }
  }
  for (const n of PARK_NAME_SIGNS) {
    const across = n.face === "N" || n.face === "S";
    const { w, y, depth } = NAME_BOARD;
    const h = n.sub ? 1.15 : 0.95;
    for (const s of [-1, 1]) {
      ownPosts.add(postKey(n.x + (across ? s * NAME_POST_DX : 0), n.z + (across ? 0 : s * NAME_POST_DX)));
    }
    boards.push(at(`"${n.name}" board`, n.name, n.x, y, n.z, across ? w : depth, h, across ? depth : w));
    // the pitched cap over it, which is wider and deeper than the board
    boards.push(at(`"${n.name}" cap`, n.name, n.x, y + h / 2 + 0.1, n.z, across ? w + 0.3 : 0.5, 0.16, across ? 0.5 : w + 0.3));
  }

  const hits = (a: Box, b: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }) =>
    Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) > 0.02 &&
    Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY) > 0.02 &&
    Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ) > 0.02;

  const bad: string[] = [];
  for (const board of boards) {
    for (const b of boxes) {
      const px = ((b.minX + b.maxX) / 2).toFixed(2);
      const pz = ((b.minZ + b.maxZ) / 2).toFixed(2);
      // the sign's own posts hold it up; everything else is in the way
      if (b.maxX - b.minX < 0.3 && b.maxZ - b.minZ < 0.3 && ownPosts.has(`${px},${pz}`)) continue;
      if (!hits(board, b)) continue;
      bad.push(`${board.label} is inside ${b.label} at (${f1(+px)}, ${f1(+pz)})`);
    }
  }
  for (let i = 0; i < boards.length; i++) {
    for (let j = i + 1; j < boards.length; j++) {
      const a = boards[i]!;
      const b = boards[j]!;
      if (a.sign === b.sign) continue;
      if (hits(a, b)) bad.push(`${a.label} overlaps ${b.label}`);
    }
  }
  check(bad.length === 0, `all ${boards.length} painted boards and caps are clear of every other solid`);
  for (const line of bad.slice(0, 30)) console.log(`       ${line}`);
}

/* ------------------------------------------------------------- 5. the plaza */

console.log("\nthe arrival plaza");
{
  const spawn: [number, number] = [level.spawn[0], level.spawn[2]];
  const d = Math.hypot(spawn[0] - PLAZA.x, spawn[1] - PLAZA.z);
  check(d < PLAZA.r - 1, `she lands on the paving, ${f1(d)}m from the middle of a ${PLAZA.r}m plaza`);

  // she must not land inside anything, and must be able to walk off it every way
  const c: Capsule = { x: spawn[0], y: 0, z: spawn[1], hw: PLAYER_W, h: PLAYER_H, hd: PLAYER_W };
  settle(c);
  check(Math.abs(c.x - spawn[0]) < 0.1 && Math.abs(c.z - spawn[1]) < 0.1, "the spawn itself is clear");
  const ways: [string, [number, number][]][] = [
    ["north to the crossroads, round the east of the pole", [[4.8, 19], [4.8, 8.5], [NODES.J0!.x, NODES.J0!.z]]],
    ["north to the crossroads, round the west of the pole", [[-4.8, 19], [-4.8, 8.5], [NODES.J0!.x, NODES.J0!.z]]],
    ["south, down the midway", [[0, 36]]],
    ["east off the plaza", [[13, 22]]],
    ["west off the plaza", [[-13, 22]]],
  ];
  for (const [name, route] of ways) {
    const r = walkRoute(spawn, route);
    check(r.short < 1.2, `she can walk ${name} (stopped ${f1(r.short)}m short)`);
  }

  // the paving props must cover the spawn, or she stands 2cm inside the disc
  const under = boxes.filter(
    (b) => spawn[0] > b.minX && spawn[0] < b.maxX && spawn[1] > b.minZ && spawn[1] < b.maxZ && b.maxY < 0.2,
  );
  check(under.length > 0, `the spawn stands on the paving, not on grass under it (${under.map((b) => b.label).join(", ") || "nothing"})`);
}

console.log(`\n${failures ? `${failures} FAILED` : "all path, sign and plaza checks passed"}`);
process.exit(failures ? 1 : 0);
