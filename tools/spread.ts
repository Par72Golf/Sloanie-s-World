import { LEVELS } from "../src/game/levels";
const level = LEVELS[0]!;
const d = level.dumplings;
console.log("nearest neighbour for each dumpling:");
const rows = d.map((a) => {
  let best = Infinity;
  let who = "";
  for (const b of d) {
    if (a.id === b.id) continue;
    const dist = Math.hypot(a.pos[0] - b.pos[0], a.pos[2] - b.pos[2]);
    if (dist < best) { best = dist; who = b.id; }
  }
  return { id: a.id, region: a.region, best, who };
});
for (const r of rows.sort((x, y) => x.best - y.best)) {
  console.log(`  ${r.id.padEnd(7)} ${r.best.toFixed(1)}m from ${r.who.padEnd(7)}  (${r.region})`);
}
