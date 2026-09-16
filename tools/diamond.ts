import { LEVELS } from "../src/game/levels";
import { isSolidProp } from "../src/game/world-build";
const level = LEVELS[0]!;

type B = { minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number; label: string };
const boxes: B[] = [];
level.props.forEach((p, i) => {
  let x = 0, y = 0, z = 0, w = 0, h = 0, d = 0, color = "";
  if (p.kind === "box") { [x, y, z] = p.pos; [w, h, d] = p.size; color = p.color;
    if ((p.ry ?? 0) !== 0) { w = Math.max(w, d); d = w; } }
  else if (p.kind === "cyl") { [x, y, z] = p.pos; w = p.r * 1.6; d = w; h = p.h; color = p.color; }
  else if (p.kind === "tree") { x = p.x; z = p.z; const s = p.scale ?? 1; w = 0.9 * s; d = w; y = 1.1 * s; h = 2.2 * s; color = "tree"; }
  else return;
  if (color !== "tree" && !isSolidProp(color)) return;
  boxes.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY: y - h / 2, maxY: y + h / 2, label: `[${i}] ${color}` });
});

const found = new Map<string, number>();
let out = "";
for (let z = -112; z <= -66; z += 2) {
  let line = `${String(Math.round(z)).padStart(5)} `;
  for (let x = -30; x <= 30; x += 2) {
    const hit = boxes.find(
      (b) => b.maxY >= 0.75 && b.minY <= 1.7 && x > b.minX - 0.4 && x < b.maxX + 0.4 && z > b.minZ - 0.4 && z < b.maxZ + 0.4,
    );
    line += hit ? "#" : ".";
    if (hit) found.set(hit.label, (found.get(hit.label) ?? 0) + 1);
  }
  out += line + "\n";
}
console.log("      " + "x -30 .......... 0 .......... +30");
console.log(out);
console.log("props forming those walls:");
for (const [k, n] of [...found].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${k}  (${n} cells)`);
