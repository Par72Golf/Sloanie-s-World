import { LEVELS } from "../src/game/levels";
const level = LEVELS[0]!;
// tower platform at (cx+5, cz-2) with cx=-95, cz=-30
const tx = -95 + 5;
const cz = -30;
console.log("tower platform top: 1.775, front edge z =", cz - 2 + 2.2);
for (const p of level.props) {
  if (p.kind !== "box") continue;
  if (Math.abs(p.pos[0] - (tx - 0.2)) > 0.1) continue;
  if (p.pos[2] < cz - 1 || p.pos[2] > cz + 4) continue;
  const top = p.pos[1] + p.size[1] / 2;
  console.log(`  step top ${top.toFixed(3)} at z ${p.pos[2].toFixed(2)} depth ${p.size[2]}`);
}
