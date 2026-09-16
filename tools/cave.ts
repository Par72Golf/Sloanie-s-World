import { LEVELS } from "../src/game/levels";
const level = LEVELS[0]!;
const solid = (x: number, z: number, lowY: number, highY: number) =>
  level.props.some((p) => {
    if (p.kind !== "box") return false;
    const [px, py, pz] = p.pos;
    const [w, h, d] = p.size;
    return (
      x > px - w / 2 && x < px + w / 2 && z > pz - d / 2 && z < pz + d / 2 &&
      py + h / 2 > lowY && py - h / 2 < highY
    );
  });
console.log("cave chamber, plan view (# = wall at body height, . = walkable):");
console.log("        x -26 ................. -2");
for (let z = 56; z <= 70; z += 1) {
  let line = `  z ${String(z).padStart(3)} `;
  for (let x = -26; x <= -2; x += 1) line += solid(x, z, 0.3, 1.6) ? "#" : ".";
  console.log(line);
}
let ceil = 0, n = 0;
for (let z = 59; z <= 67; z++) for (let x = -19; x <= -7; x++) {
  if (!solid(x, z, 0.3, 1.6)) { n++; if (solid(x, z, 4.0, 4.4)) ceil++; }
}
console.log(`\nwalkable chamber cells: ${n}, of which roofed: ${ceil}`);
