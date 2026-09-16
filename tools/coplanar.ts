// look for near-coplanar faces in the cave region, the usual cause of flicker
import { LEVELS } from "../src/game/levels";
const level = LEVELS[0]!;
type F = { axis: string; at: number; label: string };
const faces: F[] = [];
for (const p of level.props) {
  if (p.kind !== "box") continue;
  const [x, y, z] = p.pos;
  const [w, h, d] = p.size;
  if (x < -30 || x > 2 || z < 54 || z > 74) continue;
  const label = `${p.color} (${x},${z})`;
  faces.push({ axis: "x", at: x - w / 2, label }, { axis: "x", at: x + w / 2, label });
  faces.push({ axis: "y", at: y - h / 2, label }, { axis: "y", at: y + h / 2, label });
  faces.push({ axis: "z", at: z - d / 2, label }, { axis: "z", at: z + d / 2, label });
}
const hits: string[] = [];
for (let i = 0; i < faces.length; i++) {
  for (let j = i + 1; j < faces.length; j++) {
    if (faces[i]!.axis !== faces[j]!.axis) continue;
    if (faces[i]!.label === faces[j]!.label) continue;
    const gap = Math.abs(faces[i]!.at - faces[j]!.at);
    if (gap < 0.02) hits.push(`  ${faces[i]!.axis}=${faces[i]!.at.toFixed(2)}  ${faces[i]!.label}  vs  ${faces[j]!.label}`);
  }
}
console.log(`near-coplanar faces in the hill region: ${hits.length}`);
for (const h of [...new Set(hits)].slice(0, 12)) console.log(h);
