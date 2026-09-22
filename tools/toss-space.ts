/** Scratch: what stands near the Marshmallow Toss site in the fairground. */
import { sugarRushPark } from "../src/game/sugar-level";

const L = sugarRushPark();
const X0 = -80, X1 = -40, Z0 = 74, Z1 = 140;
const near = (x: number, z: number) => x > X0 && x < X1 && z > Z0 && z < Z1;
for (const p of L.props as any[]) {
  const x = p.pos ? p.pos[0] : p.x; const z = p.pos ? p.pos[2] : p.z;
  if (!near(x, z)) continue;
  const what = p.kind === "model" ? `model ${p.id}` : p.kind === "box" ? `box ${p.size.map((v:number)=>v.toFixed(2)).join("x")} y=${p.pos[1].toFixed(2)} ${p.color} collide=${p.collide}` : p.kind === "cyl" ? `cyl r=${p.r} h=${p.h} y=${p.pos[1].toFixed(2)} ${p.color} collide=${p.collide}` : p.kind;
  console.log(`(${x.toFixed(1)}, ${z.toFixed(1)}) ${what}`);
}
console.log("--- candies ---");
for (const d of L.dumplings) if (near(d.pos[0], d.pos[2])) console.log(d.id, d.pos);
console.log("--- boosts ---");
for (const b of (L.juice ?? [])) if (near(b[0], b[1])) console.log(b);
console.log("--- accessories ---");
for (const a of (L as any).accessories ?? []) if (near(a.pos[0], a.pos[2])) console.log(a.id, a.pos);
