// how many distinct beveled geometries does the park need, and how big?
import { LEVELS } from "../src/game/levels";
const level = LEVELS[0]!;
const sizes = new Set<string>();
const q = (n: number) => Math.round(Math.abs(n) * 50) / 50;
let boxes = 0;
let tiny = 0;
for (const p of level.props) {
  if (p.kind !== "box") continue;
  boxes++;
  const [w, h, d] = p.size;
  if (Math.min(Math.abs(w), Math.abs(h), Math.abs(d)) / 3 < 0.012) tiny++;
  sizes.add(`${q(w)}|${q(h)}|${q(d)}`);
}
console.log(`box props: ${boxes}`);
console.log(`distinct sizes needing their own geometry: ${sizes.size}`);
console.log(`of those, too thin to bevel (fall back to a plain box): ${tiny} props`);
// RoundedBoxGeometry at 2 segments is about 150 verts
console.log(`rough vertex cost: ${(sizes.size * 150 / 1000).toFixed(0)}k verts of cached geometry`);
