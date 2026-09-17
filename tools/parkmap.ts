/**
 * ASCII map of a park region, north (-z) at the top, east (+x) to the right.
 *
 *   #  solid collider she cannot step onto (top above 0.62m)
 *   +  solid but low enough to step onto
 *   =  walkway slab (the path colour)
 *   -  other flat surface (lawns, courts, aprons)
 *   ~  water
 *   S  spawn
 *   T  tree trunk
 *
 * Run: npx jiti tools/parkmap.ts [minX maxX minZ maxZ step]
 * e.g. npx jiti tools/parkmap.ts -70 70 -70 70 2
 */
import { LEVELS } from "../src/game/levels";
import { collidersFor } from "../src/game/colliders";

const [a, b, c, d, s] = process.argv.slice(2).map(Number);
const minX = a ?? -160;
const maxX = b ?? 160;
const minZ = c ?? -160;
const maxZ = d ?? 160;
const step = s ?? 4;
const level = LEVELS[0]!;
const cols = collidersFor(level);
const PATH = new Set(["#d8c49a", "#e6d3a8", "#cdb98c", "#c9b27f", "#eadbb6", "#b9a37a"]);

const flats: { minX: number; maxX: number; minZ: number; maxZ: number; ch: string }[] = [];
for (const p of level.props) {
  if (p.kind === "box" && p.collide === false && p.size[1] <= 0.6) {
    const rot = (p.ry ?? 0) !== 0;
    const w = rot ? Math.max(p.size[0], p.size[2]) : p.size[0];
    const dd = rot ? Math.max(p.size[0], p.size[2]) : p.size[2];
    flats.push({ minX: p.pos[0] - w / 2, maxX: p.pos[0] + w / 2, minZ: p.pos[2] - dd / 2, maxZ: p.pos[2] + dd / 2, ch: PATH.has(p.color.toLowerCase()) ? "=" : "-" });
  } else if (p.kind === "cyl" && !p.collide) {
    const liquid = /5aa8c8|6cb8d4|9fd4ea|6cb4d4|5aa0bc|7ec4de/i.test(p.color);
    flats.push({ minX: p.pos[0] - p.r, maxX: p.pos[0] + p.r, minZ: p.pos[2] - p.r, maxZ: p.pos[2] + p.r, ch: liquid ? "~" : "-" });
  }
}

const header = (x: number) => (Math.round(x) % 20 === 0 ? "|" : " ");
let top = "      ";
for (let x = minX; x <= maxX; x += step) top += header(x);
console.log(top);
for (let z = minZ; z <= maxZ; z += step) {
  let line = `${String(z).padStart(5)} `;
  for (let x = minX; x <= maxX; x += step) {
    const cx = x;
    const cz = z;
    let ch = ".";
    const tree = level.props.some((t) => t.kind === "tree" && Math.abs(t.x - cx) <= step / 2 && Math.abs(t.z - cz) <= step / 2);
    if (tree) ch = "T";
    else if (Math.abs(cx - level.spawn[0]) < step / 2 + 0.01 && Math.abs(cz - level.spawn[2]) < step / 2 + 0.01) ch = "S";
    else {
      let best = "";
      for (const f of flats) if (cx >= f.minX && cx <= f.maxX && cz >= f.minZ && cz <= f.maxZ) best = f.ch === "~" || best === "" || (f.ch === "=" && best === "-") ? f.ch : best;
      if (best) ch = best;
      for (const k of cols) {
        if (cx >= k.minX && cx <= k.maxX && cz >= k.minZ && cz <= k.maxZ && k.maxY > 0.05) {
          ch = k.maxY > 0.62 ? "#" : "+";
          if (ch === "#") break;
        }
      }
    }
    line += ch;
  }
  console.log(line);
}
