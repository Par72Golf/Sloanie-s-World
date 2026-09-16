// can the dumpling be seen from the cave mouth?
import { LEVELS } from "../src/game/levels";
const base = LEVELS[0]!;
const blockers = base.props.filter((p) => p.kind === "box") as any[];
const hit = (x: number, y: number, z: number) =>
  blockers.some((p) => {
    const [px, py, pz] = p.pos;
    const [w, h, d] = p.size;
    return x > px - w / 2 && x < px + w / 2 && y > py - h / 2 && y < py + h / 2 && z > pz - d / 2 && z < pz + d / 2;
  });

for (let layout = 0; layout < 3; layout++) {
  const d = base.dumplings.find((x) => x.id === "moon")!;
  const alt = layout > 0 ? d.alts?.[layout - 1] : undefined;
  const t = alt ? alt.pos : d.pos;
  let seen = 0;
  let tries = 0;
  // stand across the width of the mouth, at eye height
  for (let x = -16.5; x <= -9.5; x += 0.5) {
    tries++;
    let blocked = false;
    for (let s = 0.02; s < 1; s += 0.01) {
      const px = x + (t[0] - x) * s;
      const py = 1.5 + (t[1] - 1.5) * s;
      const pz = 59 + (t[2] - 59) * s;
      if (hit(px, py, pz)) { blocked = true; break; }
    }
    if (!blocked) seen++;
  }
  console.log(`layout ${layout}: visible from ${seen} of ${tries} spots across the mouth`);
}
