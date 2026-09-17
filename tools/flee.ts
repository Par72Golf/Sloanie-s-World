/**
 * Runaway dumplings: after two wrong answers a dumpling flees to a new spot
 * (runtime.ts relocateDumpling -> flee.ts pickFleePos). Over many random runs
 * per park (random layout, random collected set, chained flees, her beside the
 * dumpling or anywhere), proves the new spot is never on a spot she has
 * cleared (a collected dumpling's home or where she found it), is at least
 * FLEE_FROM_SPAWN from the spawn, and keeps the old distances from her, from
 * where it was, and from the other dumplings. Also runs the pre-fix picker
 * (commit 128787b) over the same runs to show the bug it had.
 *
 *   npx jiti tools/flee.ts [runs per park, default 20000]
 */
import { LEVELS } from "../src/game/levels";
import {
  FLEE_CLEAR,
  FLEE_FROM_CURRENT,
  FLEE_FROM_PLAYER,
  FLEE_FROM_SPAWN,
  pickFleePos,
} from "../src/game/flee";

type V3 = [number, number, number];
const RUNS = Number(process.argv[2]) || 20000;
const COLLECT_R = 2.15;

/** The picker as it was before the fix, for comparison only. */
function oldPick(homes: V3[], occupied: V3[], px: number, pz: number, current: V3, bounds: { minX: number; maxX: number; minZ: number; maxZ: number }): V3 {
  const order = homes.map((_, i) => i).sort(() => Math.random() - 0.5);
  for (const i of order) {
    const h = homes[i]!;
    const x = h[0] + (Math.random() - 0.5) * 5;
    const z = h[2] + (Math.random() - 0.5) * 5;
    if (Math.hypot(x - px, z - pz) < 16) continue;
    if (Math.hypot(x - current[0], z - current[2]) < 12) continue;
    if (occupied.some((o) => Math.hypot(x - o[0], z - o[2]) < 4.5)) continue;
    const cx = Math.min(bounds.maxX - 3, Math.max(bounds.minX + 3, x));
    const cz = Math.min(bounds.maxZ - 3, Math.max(bounds.minZ + 3, z));
    return [cx, h[1], cz];
  }
  let best = current;
  let bestD = -1;
  for (const h of homes) {
    const d = Math.hypot(h[0] - px, h[2] - pz);
    if (d > bestD) { bestD = d; best = h; }
  }
  return [best[0], best[1], best[2]];
}

const d2 = (a: V3, x: number, z: number) => Math.hypot(a[0] - x, a[2] - z);
let failed = false;

for (const level of LEVELS) {
  const b = level.bounds;
  const spawn = level.spawn as V3;
  let fails = 0;
  let fallbacks = 0;
  let fallbackBesideStart = 0;
  let fallbackOnCleared = 0;
  let fallbackStacked = 0;
  let flees = 0;
  let oldStacked = 0;
  let oldBesideStart = 0;
  let oldOnCleared = 0;
  let elevated = 0;
  const examples: string[] = [];
  const high = new Map<string, number>();

  for (let run = 0; run < RUNS; run++) {
    const layout = Math.floor(Math.random() * 3);
    // live positions as world-build.ts makes them for this layout
    const live = level.dumplings.map((def) => {
      const alt = layout > 0 ? def.alts?.[layout - 1] : undefined;
      const p = (alt ? alt.pos : def.pos) as V3;
      return { id: def.id, home: def.pos as V3, pos: [p[0], p[1], p[2]] as V3 };
    });
    // a random collected set, always leaving at least one to flee; bias toward
    // having the start's own dumpling collected, which is how the bug showed
    const pCollect = Math.random();
    const collected = new Set(live.filter((d, i) => (i === 0 ? Math.random() < 0.8 : Math.random() < pCollect)).map((d) => d.id));
    const left = live.filter((d) => !collected.has(d.id));
    if (left.length === 0) collected.delete(live[live.length - 1]!.id);

    // a few flees in a row, as a stubborn dumpling can run more than once
    const chain = 1 + Math.floor(Math.random() * 3);
    for (let c = 0; c < chain; c++) {
      const unfound = live.filter((d) => !collected.has(d.id));
      const d = unfound[Math.floor(Math.random() * unfound.length)]!;
      // usually she is right beside it (she just answered its quiz); sometimes anywhere
      let px: number;
      let pz: number;
      if (Math.random() < 0.8) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * COLLECT_R;
        px = d.pos[0] + Math.cos(a) * r;
        pz = d.pos[2] + Math.sin(a) * r;
      } else {
        px = b.minX + Math.random() * (b.maxX - b.minX);
        pz = b.minZ + Math.random() * (b.maxZ - b.minZ);
      }
      const occupied = live.filter((x) => x.id !== d.id && !collected.has(x.id)).map((x) => x.pos);
      // as runtime.ts relocateDumpling builds them
      const spots: V3[] = level.dumplings.flatMap((x) => [
        ...(collected.has(x.id) ? [] : [x.pos as V3]),
        ...(x.alts ?? []).map((a) => a.pos as V3),
      ]);
      const cleared: V3[] = [
        ...level.dumplings.filter((x) => collected.has(x.id)).map((x) => x.pos as V3),
        ...live.filter((x) => collected.has(x.id)).map((x) => x.pos),
      ];

      const old = oldPick(level.dumplings.map((x) => x.pos as V3), occupied, px, pz, d.pos, b);
      if (d2(old, spawn[0], spawn[2]) < FLEE_FROM_SPAWN) oldBesideStart++;
      if (cleared.some((o) => d2(o, old[0], old[2]) < FLEE_CLEAR)) oldOnCleared++;
      if (occupied.some((o) => d2(o, old[0], old[2]) < FLEE_CLEAR)) oldStacked++;
      flees++;

      const next = pickFleePos(spots, cleared, occupied, px, pz, d.pos, b, spawn);
      const nearSpawn = d2(next, spawn[0], spawn[2]) < FLEE_FROM_SPAWN;
      const onCleared = cleared.some((o) => d2(o, next[0], next[2]) < FLEE_CLEAR);
      const stacked = occupied.some((o) => d2(o, next[0], next[2]) < FLEE_CLEAR);
      const full =
        !nearSpawn &&
        !onCleared &&
        !stacked &&
        d2(next, px, pz) >= FLEE_FROM_PLAYER &&
        d2(next, d.pos[0], d.pos[2]) >= FLEE_FROM_CURRENT;
      if (next[1] > 3) {
        elevated++;
        const k = `y ${next[1]}`;
        high.set(k, (high.get(k) ?? 0) + 1);
      }
      if (!full) {
        fallbacks++;
        // A fallback must be an authored spot, and may only break a rule when
        // no authored spot anywhere keeps it: beside the start only if every
        // spot is; on a cleared spot only if no far, free, uncleared spot is
        // left; stacked on another dumpling only if no far, free spot is left
        // other than the one it is fleeing from.
        const all = [...spots, ...cleared];
        const same = (h: V3) => h[0] === next[0] && h[2] === next[2];
        const far = (h: V3) => d2(h, spawn[0], spawn[2]) >= FLEE_FROM_SPAWN;
        const free = (h: V3) => !occupied.some((o) => d2(o, h[0], h[2]) < FLEE_CLEAR);
        const uncleared = (h: V3) => !cleared.some((o) => d2(o, h[0], h[2]) < FLEE_CLEAR);
        if (nearSpawn) fallbackBesideStart++;
        if (onCleared) fallbackOnCleared++;
        if (stacked) fallbackStacked++;
        const why = !all.some(same)
          ? "not an authored spot"
          : nearSpawn && all.some(far)
            ? "beside the start"
            : onCleared && spots.some((h) => far(h) && free(h) && uncleared(h) && d2(h, d.pos[0], d.pos[2]) >= FLEE_FROM_CURRENT)
              ? "on a cleared spot"
              : stacked && all.some((h) => far(h) && free(h) && d2(h, d.pos[0], d.pos[2]) >= FLEE_FROM_CURRENT)
                ? "stacked on another dumpling"
                : "";
        if (why) {
          fails++;
          if (examples.length < 5) examples.push(`${why}: ${d.id} -> [${next.map((v) => v.toFixed(1))}] her [${px.toFixed(1)}, ${pz.toFixed(1)}]`);
        }
      }
      d.pos = next;
    }
  }

  console.log(`${level.id.padEnd(7)} ${RUNS} runs, ${flees} flees`);
  console.log(`  new picker: ${fails} rule breaks; ${fallbacks} fallbacks (${fallbackBesideStart} beside the start, ${fallbackOnCleared} on a cleared spot, ${fallbackStacked} stacked); ${elevated} picks above 3m`);
  console.log(`  old picker: ${oldBesideStart} beside the start, ${oldOnCleared} on a cleared spot, ${oldStacked} stacked`);
  // jitter is up to 2.5m each way, so a raised spot (a deck, the wheel top)
  // can put it in the air; listed so a change here is noticed
  if (high.size) console.log(`  raised picks by height: ${[...high].map(([k, n]) => `${k}: ${n}`).join(", ")}`);
  for (const e of examples) console.log(`    ${e}`);
  if (fails > 0) failed = true;
}

console.log(failed ? "FAIL" : "PASS");
if (failed) process.exit(1);
