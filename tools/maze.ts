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

for (const entry of uniq.values()) {
  const dist = bfs(entry);
  const d = dist.get(`${goal[0]},${goal[1]}`);
  console.log(`\nfrom opening (${entry[0]},${entry[1]}): ${d == null ? "NO ROUTE" : `${d} cells = ${(d * CELL).toFixed(0)}m to the dumpling`}`);
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
  if (zone) {
    console.log(`ok   no-jump zone "${zone.why}" covers the maze plus jump reach`);
  } else {
    console.log(
      `FAIL no no-jump zone covers x ${need.minX.toFixed(1)}..${need.maxX.toFixed(1)}, z ${need.minZ.toFixed(1)}..${need.maxZ.toFixed(1)}; she can jump onto the hedges`,
    );
    process.exit(1);
  }
}
