import { LEVELS } from "../src/game/levels";
import { isSolidProp } from "../src/game/world-build";
const level = LEVELS[0]!;

const walkThrough = new Map<string, number>();
const faint: { c: string; h: number; o: number; x: number; z: number }[] = [];
for (const p of level.props) {
  if (p.kind !== "box") continue;
  if (p.size[1] >= 0.8 && !isSolidProp(p.color)) {
    walkThrough.set(p.color, (walkThrough.get(p.color) ?? 0) + 1);
  }
  if (p.size[1] >= 1.2 && isSolidProp(p.color) && (p.opacity ?? 1) < 0.6) {
    faint.push({ c: p.color, h: p.size[1], o: p.opacity ?? 1, x: p.pos[0], z: p.pos[2] });
  }
}
console.log("walk-through walls (tall but not solid):");
if (!walkThrough.size) console.log("  none");
for (const [c, n] of walkThrough) console.log(`  ${c} x${n}`);

console.log("\ninvisible walls (solid, tall, under 60% opacity):");
if (!faint.length) console.log("  none");
const byColor = new Map<string, number>();
for (const f of faint) byColor.set(`${f.c} @ opacity ${f.o}`, (byColor.get(`${f.c} @ opacity ${f.o}`) ?? 0) + 1);
for (const [k, n] of byColor) console.log(`  ${k}  x${n}`);
for (const f of faint.slice(0, 4)) console.log(`    e.g. (${f.x.toFixed(1)}, ${f.z.toFixed(1)}) height ${f.h}`);
