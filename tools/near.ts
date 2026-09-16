/**
 * Lists every solid collider near a point, the way the engine builds it, so an
 * "invisible wall at <place>" report can be answered with what is actually
 * there. Flags the usual suspects: rotated boxes (their collider ignores the
 * rotation), colliders much wider than their visual (trees), low-opacity
 * props, and flat slabs whose edges exceed the 0.62m step-up.
 *
 * Run: npx jiti tools/near.ts <x> <z> [radius=8] [levelIndex=0]
 */
import { LEVELS } from "../src/game/levels";
import { isSolidProp } from "../src/game/world-build";

const [xs, zs, rs, ls] = process.argv.slice(2);
const px = Number(xs ?? 0);
const pz = Number(zs ?? 0);
const radius = Number(rs ?? 8);
const level = LEVELS[Number(ls ?? 0)]!;

type Row = { d: number; label: string; flags: string[] };
const rows: Row[] = [];

const near = (minX: number, maxX: number, minZ: number, maxZ: number) => {
  const dx = Math.max(minX - px, 0, px - maxX);
  const dz = Math.max(minZ - pz, 0, pz - maxZ);
  return Math.hypot(dx, dz);
};

for (const p of level.props) {
  if (p.kind === "box") {
    if (p.size[0] < 0.15 && p.size[1] < 0.15) continue;
    const solid = isSolidProp(p.color) && !(p.collide === false && Math.min(p.size[0], p.size[2]) <= 0.35);
    if (!solid) continue;
    const [w, h, dd] = p.size;
    const d = near(p.pos[0] - w / 2, p.pos[0] + w / 2, p.pos[2] - dd / 2, p.pos[2] + dd / 2);
    if (d > radius) continue;
    const flags: string[] = [];
    if (p.ry && Math.abs(p.ry % Math.PI) > 0.05) flags.push(`ROTATED ${(p.ry * 57.3).toFixed(0)}deg, collider is unrotated`);
    if ((p.opacity ?? 1) < 0.6) flags.push(`opacity ${p.opacity}`);
    if (p.collide === false) flags.push("author said no-collide but wide, so solid");
    const top = p.pos[1] + h / 2;
    if (top > 0.62 && h < 1.2) flags.push(`ledge: top ${top.toFixed(2)}m is above the 0.62m step-up`);
    rows.push({
      d,
      label: `box ${p.color} ${w}x${h}x${dd} @ (${p.pos[0]}, ${p.pos[1]}, ${p.pos[2]}) top ${top.toFixed(2)}`,
      flags,
    });
  } else if (p.kind === "cyl") {
    if (!isSolidProp(p.color)) continue;
    const r = p.r * 0.8;
    const d = near(p.pos[0] - r, p.pos[0] + r, p.pos[2] - r, p.pos[2] + r);
    if (d > radius) continue;
    rows.push({ d, label: `cyl ${p.color} r${p.r} h${p.h} @ (${p.pos[0]}, ${p.pos[1]}, ${p.pos[2]})`, flags: [] });
  } else if (p.kind === "tree") {
    const s = p.scale ?? 1;
    const d = near(p.x - 0.225 * s, p.x + 0.225 * s, p.z - 0.225 * s, p.z + 0.225 * s);
    if (d > radius) continue;
    rows.push({ d, label: `tree @ (${p.x}, ${p.z}) scale ${s}`, flags: [] });
  } else if (p.kind === "house") {
    const w = p.w ?? 6;
    const dd = p.d ?? 5;
    const d = near(p.x - w / 2, p.x + w / 2, p.z - dd / 2, p.z + dd / 2);
    if (d > radius) continue;
    rows.push({ d, label: `house @ (${p.x}, ${p.z}) ${w}x${dd}`, flags: [] });
  } else if (p.kind === "lollipop") {
    const d = near(p.x - 0.15, p.x + 0.15, p.z - 0.15, p.z + 0.15);
    if (d > radius) continue;
    rows.push({ d, label: `lollipop @ (${p.x}, ${p.z})`, flags: [] });
  }
}

// composite colliders world-build adds by hand for the picnic park
if (level.id === "picnic") {
  const extra: [string, number, number, number, number][] = [
    ["slide", 22, 8, 2.2, 2.2],
    ["fountain", 0, -42, 6.6, 6.6],
    ["treehouse trunk", 54.2, -53, 1.4, 1.4],
    ["treehouse deck (top 3.63)", 54.2, -53, 5.2, 5.2],
  ];
  for (const [name, x, z, w, dd] of extra) {
    const d = near(x - w / 2, x + w / 2, z - dd / 2, z + dd / 2);
    if (d <= radius) rows.push({ d, label: `${name} @ (${x}, ${z}) ${w}x${dd}`, flags: [] });
  }
}

rows.sort((a, b) => a.d - b.d);
console.log(`solid colliders within ${radius}m of (${px}, ${pz}) in ${level.name}: ${rows.length}`);
for (const r of rows) {
  console.log(`  ${r.d.toFixed(1).padStart(5)}m  ${r.label}${r.flags.length ? "   <-- " + r.flags.join("; ") : ""}`);
}
