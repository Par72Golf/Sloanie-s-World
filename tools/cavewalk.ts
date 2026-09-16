import { LEVELS } from "../src/game/levels";
import { isSolidProp } from "../src/game/world-build";
const level = LEVELS[0]!;
const surfaceAt = (x: number, z: number) => {
  let top = 0;
  for (const p of level.props) {
    if (p.kind !== "box") continue;
    const solid = isSolidProp(p.color) && !(p.collide === false && Math.min(p.size[0], p.size[2]) <= 0.35);
    if (!solid) continue;
    const [px, py, pz] = p.pos;
    const [w, h, d] = p.size;
    if (x < px - w / 2 || x > px + w / 2) continue;
    if (z < pz - d / 2 || z > pz + d / 2) continue;
    const t = py + h / 2;
    if (t <= 2.2) top = Math.max(top, t);   // only surfaces she could stand on
  }
  return top;
};
console.log("route: in the mouth, round the west of the baffle, up the steps, onto the ledge");
const route: [number, number][] = [
  [-13, 59.5], [-15, 60.5], [-18, 61.5], [-19, 62.4],
  [-19, 62.8], [-19, 63.7], [-19, 64.6], [-19, 65.4],
  [-18, 66.2], [-17, 66.5], [-12, 66.8], [-8, 66.5],
];
let prev = 0;
for (const [x, z] of route) {
  const t = surfaceAt(x, z);
  const step = t - prev;
  console.log(`  (${x}, ${z})  surface ${t.toFixed(2)}  step ${step >= 0 ? "+" : ""}${step.toFixed(2)}${step > 0.62 ? "  TOO BIG" : ""}`);
  prev = t;
}
