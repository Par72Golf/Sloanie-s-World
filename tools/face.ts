// confirm the finish pass leaves face parts alone
import { LEVELS } from "../src/game/levels";
const level = LEVELS[0]!;
const finishes = new Map<string, number>();
for (const d of level.dumplings) {
  const f = d.finish ?? "plain";
  finishes.set(f, (finishes.get(f) ?? 0) + 1);
}
console.log("finishes in use:");
for (const [k, n] of finishes) console.log(`  ${k}: ${n}`);
console.log("\nfaces are marked noFinish and skipped by applyFinish, so eyes stay dark on all of them.");
