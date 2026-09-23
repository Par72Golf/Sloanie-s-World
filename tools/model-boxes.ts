/**
 * Do the colliders registered for each model still match what its factory
 * builds?
 *
 * Some models register boxes written down ahead of time (sugar-model-boxes.ts)
 * because their factories were thought to need a real canvas. They drift the
 * moment the drawing changes and nobody reads them out again: the drawn thing
 * moves and the solid thing stays where it was. This builds every registered
 * model with a do-nothing canvas and compares its own `userData.boxes` with
 * the registered ones, box for box.
 *
 * Run: npx jiti tools/model-boxes.ts            (exits 1 on any drift)
 *      DUMP=id npx jiti tools/model-boxes.ts    (print that model's rows)
 */
{
  const ctx: any = new Proxy(
    {},
    {
      get: (_t, k) =>
        k === "getImageData" || k === "createImageData"
          ? (w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(1, (w as number) * (h as number) * 4)), width: w, height: h })
          : k === "measureText"
            ? () => ({ width: 10 })
            : k === "createLinearGradient" || k === "createRadialGradient" || k === "createPattern"
              ? () => ({ addColorStop() {} })
              : () => {},
      set: () => true,
    },
  );
  (globalThis as any).document ??= { createElement: () => ({ getContext: () => ctx, width: 256, height: 256, style: {} }) };
}
import "../src/game/levels";
import { modelBoxes, modelFactory, modelIds, type ModelBox } from "../src/game/models";

const EPS = 0.02;
const key = (b: ModelBox) => [b.minX, b.maxX, b.minY, b.maxY, b.minZ, b.maxZ];
const same = (a: ModelBox, b: ModelBox) => key(a).every((v, i) => Math.abs(v - key(b)[i]!) < EPS);
const r2 = (n: number) => Math.round(n * 100) / 100;

const dump = process.env.DUMP;
let drift = 0;
for (const id of modelIds()) {
  const built: ModelBox[] | undefined = modelFactory(id)!(0, 1).userData.boxes;
  if (!built) continue; // a model with no boxes of its own draws nothing solid
  if (dump === id) {
    for (const b of built) console.log(`  [${key(b).map(r2).join(", ")}],`);
    continue;
  }
  if (dump) continue;
  const reg = modelBoxes(id);
  const missing = built.filter((b) => !reg.some((r) => same(r, b)));
  const extra = reg.filter((r) => !built.some((b) => same(r, b)));
  // Registering more than the factory declares is allowed: sugar-models adds
  // boxes for parts some factories draw without one (a lamppost, a tree's
  // head). Registering less is the drift this is here to catch.
  if (extra.length && !dump) console.log(`  ${id}: ${extra.length} box(es) added at registration`);
  if (!missing.length) continue;
  drift++;
  console.log(`DRIFT ${id}: ${missing.length} box(es) the factory declares are not registered`);
  for (const b of missing.slice(0, 4)) console.log(`    [${key(b).map(r2).join(", ")}]`);
}
if (!dump) {
  console.log(drift ? `\n${drift} model(s) drifted` : "every model's colliders match its drawing");
  process.exit(drift ? 1 : 0);
}
