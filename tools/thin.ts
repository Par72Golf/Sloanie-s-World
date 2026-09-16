import { LEVELS } from "../src/game/levels";
import { isSolidProp } from "../src/game/world-build";
const level = LEVELS[0]!;
const groups = new Map<string, { n: number; sample: string }>();
for (const p of level.props) {
  if (p.kind !== "box") continue;
  // mirror the engine rule exactly
  const solid =
    isSolidProp(p.color) && !(p.collide === false && Math.min(p.size[0], p.size[2]) <= 0.35);
  if (!solid) continue;
  const [w, h, d] = p.size;
  const thin = Math.min(w, d);
  if (thin > 0.3) continue;      // not thin enough to be invisible
  if (h < 0.5) continue;          // low enough to step over
  const key = `${p.color} ${w}x${h}x${d} authored-collide=${p.collide !== false}`;
  const e = groups.get(key) ?? { n: 0, sample: `(${p.pos[0].toFixed(1)}, ${p.pos[2].toFixed(1)})` };
  e.n++;
  groups.set(key, e);
}
console.log("thin solid props (min horizontal <= 0.3m, taller than 0.5m):");
let total = 0;
for (const [k, e] of [...groups].sort((a, b) => b[1].n - a[1].n)) {
  total += e.n;
  console.log(`  x${String(e.n).padStart(4)}  ${k}  e.g. ${e.sample}`);
}
console.log(`total: ${total}`);
