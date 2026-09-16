import { LEVELS } from "../src/game/levels";
import { isSolidProp } from "../src/game/world-build";
const level = LEVELS[0]!;
console.log("rotated solid props (collider is axis-aligned, so it will not match the visual):");
let n = 0;
for (const p of level.props) {
  if (p.kind !== "box") continue;
  if (!(p.ry ?? 0)) continue;
  if (!isSolidProp(p.color)) continue;
  const top = p.pos[1] + p.size[1] / 2;
  if (top < 0.4) continue;
  n++;
  if (n < 12)
    console.log(
      `  ${p.color} at (${p.pos[0].toFixed(1)}, ${p.pos[2].toFixed(1)}) size ${p.size.join("x")} ry ${(p.ry ?? 0).toFixed(2)} top ${top.toFixed(2)}`,
    );
}
console.log(`total: ${n}`);

console.log("\nhouses (collider ignores rotation unless ry is near 90 degrees):");
for (const p of level.props) {
  if (p.kind !== "house") continue;
  console.log(`  at (${p.x}, ${p.z}) w ${p.w} d ${p.d} ry ${(p.ry ?? 0).toFixed(2)}`);
  break;
}
