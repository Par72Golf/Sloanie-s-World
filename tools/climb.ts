import { LEVELS } from "../src/game/levels";
const level = LEVELS[0]!;
// walk the route up and report the step height between consecutive surfaces
const route: [number, number][] = [];
for (let z = 52; z <= 59.6; z += 1.0) route.push([-27, z]);
route.push([-27, 60.4]);
for (let z = 60.6; z <= 66.4; z += 0.8) route.push([-26, z]);
for (let x = -26; x <= -14; x += 1.5) route.push([x, 67.3]);
route.push([-15, 66.6]);
route.push([-13, 64]);

let prev = 0;
let worst = 0;
for (const [x, z] of route) {
  let top = 0;
  for (const p of level.props) {
    if (p.kind !== "box") continue;
    const [px, py, pz] = p.pos;
    const [w, h, d] = p.size;
    if (x < px - w / 2 || x > px + w / 2) continue;
    if (z < pz - d / 2 || z > pz + d / 2) continue;
    top = Math.max(top, py + h / 2);
  }
  const step = top - prev;
  if (step > worst) worst = step;
  console.log(`  (${x.toFixed(1)}, ${z.toFixed(1)})  surface ${top.toFixed(2)}  step ${step >= 0 ? "+" : ""}${step.toFixed(2)}${step > 0.62 ? "   TOO BIG" : ""}`);
  prev = top;
}
console.log(`\nlargest single step up: ${worst.toFixed(2)}m (step-up limit 0.62m, jump reaches 2.7m)`);
