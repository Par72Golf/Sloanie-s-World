import { LEVELS } from "../src/game/levels";
import { isSolidProp } from "../src/game/world-build";
const level = LEVELS[0]!;
const solidAt = (x: number, z: number, lo: number, hi: number) =>
  level.props.filter((p) => {
    if (p.kind !== "box") return false;
    const solid = isSolidProp(p.color) && !(p.collide === false && Math.min(p.size[0], p.size[2]) <= 0.35);
    if (!solid) return false;
    const [px, py, pz] = p.pos;
    const [w, h, d] = p.size;
    return x > px - w / 2 && x < px + w / 2 && z > pz - d / 2 && z < pz + d / 2 && py + h / 2 > lo && py - h / 2 < hi;
  });
console.log("walking east along the walkway onto the summit (blockers at knee-to-head height):");
for (let x = -26; x <= -11; x += 1) {
  const hits = solidAt(x, 67.3, 8.8, 10.0);
  console.log(`  x ${String(x).padStart(4)}  ${hits.length ? "BLOCKED by " + hits.map((h) => (h as any).color).join(",") : "clear"}`);
}
