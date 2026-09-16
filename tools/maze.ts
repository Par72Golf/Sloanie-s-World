/**
 * Prints the picnic-park hedge maze as the game actually builds it, and
 * measures how hard it is: solution length from the south opening, number of
 * decision points, number and total length of dead ends, and whether a jump
 * over a hedge can shortcut it.
 *
 * Run: npx jiti tools/maze.ts
 */
import { LEVELS } from "../src/game/levels";
import { BOOST_MULTIPLIER } from "../src/game/emmett";
import { WALK, jumpHeight, jumpReach } from "../src/game/tuning";

const level = LEVELS[0]!;
const ORIGIN = [-42, -18] as const;
const CELL = 2.4;
const N = 11;

const grid: string[][] = Array.from({ length: N }, () => Array.from({ length: N }, () => " "));
let hedgeTop = 0;
for (const p of level.props) {
  if (p.kind !== "box" || p.color !== "#5aaa62") continue;
  const col = Math.round((p.pos[0] - ORIGIN[0]) / CELL) + 5;
  const row = Math.round((p.pos[2] - ORIGIN[1]) / CELL) + 5;
  if (col < 0 || col >= N || row < 0 || row >= N) continue;
  grid[row]![col] = "#";
  hedgeTop = Math.max(hedgeTop, p.pos[1] + p.size[1] / 2);
}
const lemon = level.dumplings.find((d) => d.id === "lemon")!;
const goal = [
  Math.round((lemon.pos[0] - ORIGIN[0]) / CELL) + 5,
  Math.round((lemon.pos[2] - ORIGIN[1]) / CELL) + 5,
] as const;
grid[goal[1]]![goal[0]] = "D";

// openings on the outer ring
const openings: [number, number][] = [];
for (let i = 0; i < N; i++) {
  for (const [c, r] of [
    [i, 0],
    [i, N - 1],
    [0, i],
    [N - 1, i],
  ] as [number, number][]) {
    if (grid[r]![c] === " ") openings.push([c, r]);
  }
}
const uniq = new Map(openings.map(([c, r]) => [`${c},${r}`, [c, r] as [number, number]]));

console.log(grid.map((r) => r.join("")).join("\n"));
console.log(`\nhedge top ${hedgeTop.toFixed(2)}m, cell ${CELL}m`);
console.log(`openings: ${[...uniq.values()].map(([c, r]) => `(${c},${r})`).join(" ") || "none"}`);

const open = (c: number, r: number) => c >= 0 && c < N && r >= 0 && r < N && grid[r]![c] !== "#";
const nbrs = (c: number, r: number) =>
  (
    [
      [c + 1, r],
      [c - 1, r],
      [c, r + 1],
      [c, r - 1],
    ] as [number, number][]
  ).filter(([x, y]) => open(x, y));

function bfs(from: [number, number]) {
  const dist = new Map<string, number>([[`${from[0]},${from[1]}`, 0]]);
  const q: [number, number][] = [from];
  while (q.length) {
    const [c, r] = q.shift()!;
    const d = dist.get(`${c},${r}`)!;
    for (const [x, y] of nbrs(c, r)) {
      const k = `${x},${y}`;
      if (dist.has(k)) continue;
      dist.set(k, d + 1);
      q.push([x, y]);
    }
  }
  return dist;
}

let fails = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) fails++;
};

const ops = [...uniq.values()];
check(ops.length === 2, `two openings, an entrance and an exit (found ${ops.length})`);
const south = ops.find(([, r]) => r === N - 1);
const north = ops.find(([, r]) => r === 0);
check(!!south && !!north, "one opening on the south side and one on the north");

for (const entry of ops) {
  const dist = bfs(entry);
  const d = dist.get(`${goal[0]},${goal[1]}`);
  console.log(`from opening (${entry[0]},${entry[1]}): ${d == null ? "NO ROUTE" : `${d} cells = ${(d * CELL).toFixed(0)}m to the dumpling`}`);
}

// Two separate ways in. Every route shares the corridor stub just inside the
// entrance and the cell next to the dumpling, so "separate" means: between the
// first junction and the last junction on the shortest route, block that
// route's cells and see whether the dumpling is still reachable.
if (south) {
  const dist = bfs(south);
  const dGoal = dist.get(`${goal[0]},${goal[1]}`);
  check(dGoal != null, "entrance reaches the dumpling");
  if (dGoal != null) {
    // walk back along decreasing distance to recover one shortest path, entrance -> goal
    let cur: [number, number] = [goal[0], goal[1]];
    const pathCells: [number, number][] = [];
    while (dist.get(`${cur[0]},${cur[1]}`)! > 0) {
      const d = dist.get(`${cur[0]},${cur[1]}`)!;
      const back = nbrs(cur[0], cur[1]).find(([x, y]) => dist.get(`${x},${y}`) === d - 1)!;
      cur = back;
      if (dist.get(`${cur[0]},${cur[1]}`)! > 0) pathCells.unshift(cur);
    }
    const deg = (c: number, r: number) => nbrs(c, r).length;
    const first = pathCells.findIndex(([c, r]) => deg(c, r) >= 3);
    let last = -1;
    for (let i = pathCells.length - 1; i >= 0; i--) if (deg(pathCells[i]![0], pathCells[i]![1]) >= 3) { last = i; break; }
    if (first < 0 || last <= first) {
      check(false, "a second, separate route to the dumpling exists (no two junctions on the way in)");
    } else {
      const between = pathCells.slice(first + 1, last);
      const saved = between.map(([c, r]) => grid[r]![c]);
      for (const [c, r] of between) grid[r]![c] = "#";
      const dist2 = bfs(south);
      const still = dist2.get(`${goal[0]},${goal[1]}`);
      between.forEach(([c, r], i) => (grid[r]![c] = saved[i]!));
      check(still != null, `a second, separate route to the dumpling exists${still != null ? ` (${still} cells = ${(still * CELL).toFixed(0)}m)` : ""}`);
    }
  }
  // no sealed pockets: every open interior cell is reachable from the entrance
  let unreachable = 0;
  for (let r = 1; r < N - 1; r++) for (let c = 1; c < N - 1; c++) if (open(c, r) && !dist.has(`${c},${r}`)) unreachable++;
  check(unreachable === 0, `no sealed-off cells (${unreachable})`);
}
if (north) {
  const dist = bfs([goal[0], goal[1]]);
  const d = dist.get(`${north[0]},${north[1]}`);
  check(d != null, `dumpling reaches the exit${d != null ? ` (${d} cells = ${(d * CELL).toFixed(0)}m)` : ""}`);
}

// decision points and dead ends over the whole open interior (excluding the ring openings)
let junctions = 0;
let deadEnds = 0;
let deadEndCells = 0;
const interior: [number, number][] = [];
for (let r = 1; r < N - 1; r++) for (let c = 1; c < N - 1; c++) if (open(c, r)) interior.push([c, r]);
const degree = new Map(interior.map(([c, r]) => [`${c},${r}`, nbrs(c, r).length]));
for (const [c, r] of interior) {
  const deg = degree.get(`${c},${r}`)!;
  if (deg >= 3) junctions++;
  if (deg === 1) deadEnds++;
}
// dead-end corridor length: walk back from each degree-1 cell until a junction
for (const [c, r] of interior) {
  if (degree.get(`${c},${r}`) !== 1) continue;
  let cur: [number, number] = [c, r];
  let prev: [number, number] | null = null;
  let len = 0;
  for (;;) {
    len++;
    const next = nbrs(cur[0], cur[1]).filter(([x, y]) => !prev || x !== prev[0] || y !== prev[1]);
    if (next.length !== 1) break;
    if ((degree.get(`${next[0]![0]},${next[0]![1]}`) ?? 0) >= 3) break;
    prev = cur;
    cur = next[0]!;
    if (len > 200) break;
  }
  deadEndCells += len;
}
console.log(`\nopen cells ${interior.length}, junctions ${junctions}, dead ends ${deadEnds} (${deadEndCells} cells, ${(deadEndCells * CELL).toFixed(0)}m of wrong turns)`);

// Jumping: can she get onto the hedges, and does the no-jump zone stop it?
const jh = jumpHeight();
const reach = jumpReach(hedgeTop, WALK * BOOST_MULTIPLIER);
console.log(`\njump height ${jh.toFixed(2)}m vs hedge ${hedgeTop.toFixed(2)}m: ${jh > hedgeTop ? "she CAN land on the hedges" : "hedges are too tall to land on"}`);
console.log(`boosted running jump can reach a ${hedgeTop.toFixed(1)}m top from ${reach.toFixed(1)}m away`);
const half = (N / 2) * CELL + 0.04; // outer face of the ring hedge
const need = {
  minX: ORIGIN[0] - half - reach,
  maxX: ORIGIN[0] + half + reach,
  minZ: ORIGIN[1] - half - reach,
  maxZ: ORIGIN[1] + half + reach,
};
const zone = (level.noJump ?? []).find(
  (z) => z.minX <= need.minX && z.maxX >= need.maxX && z.minZ <= need.minZ && z.maxZ >= need.maxZ,
);
if (jh > hedgeTop) {
  check(
    !!zone,
    zone
      ? `no-jump zone "${zone.why}" covers the maze plus jump reach`
      : `no no-jump zone covers x ${need.minX.toFixed(1)}..${need.maxX.toFixed(1)}, z ${need.minZ.toFixed(1)}..${need.maxZ.toFixed(1)}; she can jump onto the hedges`,
  );
}

// Gate markers: posts either side of each opening, on the outside.
for (const [label, op, dir] of [
  ["entrance", south, 1],
  ["exit", north, -1],
] as const) {
  if (!op) continue;
  const [wx, wz] = [ORIGIN[0] + (op[0] - 5) * CELL, ORIGIN[1] + (op[1] - 5) * CELL];
  const zOut = wz + dir * 1.9;
  const posts = level.props.filter(
    (p) => p.kind === "box" && Math.abs(p.pos[2] - zOut) < 0.3 && Math.abs(Math.abs(p.pos[0] - wx) - 1.5) < 0.3 && p.size[1] >= 2.5,
  );
  check(posts.length === 2, `${label} has two posts outside the opening (${posts.length})`);
}

if (fails) {
  console.log(`\n${fails} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
