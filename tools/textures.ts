import { LEVELS } from "../src/game/levels";
import { texKindFor } from "../src/game/textures";

const level = LEVELS[0]!;
const counts = new Map<string, { n: number; kind: string | null }>();
for (const p of level.props) {
  const c = (p as { color?: string }).color;
  if (!c) continue;
  const e = counts.get(c) ?? { n: 0, kind: texKindFor(c) };
  e.n++;
  counts.set(c, e);
}
const rows = [...counts].sort((a, b) => b[1].n - a[1].n);
let textured = 0;
let flat = 0;
for (const [, e] of rows) (e.kind ? (textured += e.n) : (flat += e.n));
console.log(`props with a colour: ${textured + flat}  textured: ${textured}  flat: ${flat}`);
console.log("\nbiggest untextured colours:");
for (const [c, e] of rows.filter((r) => !r[1].kind).slice(0, 14)) {
  console.log(`  ${c}  x${e.n}`);
}
console.log(`\ndistinct textures generated: ${new Set(rows.filter(r => r[1].kind).map(r => `${r[1].kind}|${r[0]}`)).size}`);
